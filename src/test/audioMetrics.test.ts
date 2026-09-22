/**
 * The export audit's metrics, pinned against signals whose answers are known by construction.
 *
 * These numbers are the difference between "a listener says it clicks" and "the largest discontinuity is
 * −6.2 dBFS at 1.31 s" — so each one is tested here with a signal built to contain exactly that feature, and
 * with a control that does not.
 */
import { describe, it, expect } from "vitest";
import {
  channelCorrelation,
  clippedSampleCount,
  clickAnalysis,
  decayShapeRatio,
  finalPeakDb,
  onsetTimesMs,
  maxStepDb,
  medianStepDb,
  samplePeakDb,
  sideToMidDb,
  stepOutlierCount,
  tailRmsDb,
} from "./helpers/audioMetrics";

const RATE = 48000;

function sine(seconds: number, hz = 440, amplitude = 0.5): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i += 1) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / RATE);
  return out;
}

describe("audio export metrics", () => {
  it("measures a step as the discontinuity it is", () => {
    const smooth = sine(0.1);
    // A 0.25 jump between two adjacent samples is -12 dBFS by definition.
    const clicked = Float32Array.from(smooth);
    clicked[2400] = clicked[2399] + 0.25;
    // A 440 Hz sine at 48 kHz slews ~0.029 per sample (≈ -31 dBFS), so the control is "no big step at all".
    expect(maxStepDb([smooth])).toBeLessThan(-25);
    expect(maxStepDb([clicked])).toBeCloseTo(20 * Math.log10(0.25), 1);
    // The median step does not move: the click is a single sample, not a change of texture.
    expect(medianStepDb([clicked])).toBeCloseTo(medianStepDb([smooth]), 3);
    expect(stepOutlierCount([smooth])).toBe(0);
    expect(stepOutlierCount([clicked])).toBeGreaterThan(0);
  });

  it("counts only genuinely pinned samples as clipping", () => {
    const hot = new Float32Array(480);
    hot.fill(0.4);
    for (let i = 0; i < 60; i += 1) hot[i] = 1;
    expect(clippedSampleCount([hot])).toBe(60);
    expect(clippedSampleCount([sine(0.1, 440, 0.9)])).toBe(0);
  });

  it("separates mono from a wide image", () => {
    const left = sine(0.2, 300);
    const mono = [left, Float32Array.from(left)];
    expect(channelCorrelation(mono[0], mono[1])).toBeCloseTo(1, 6);
    expect(sideToMidDb(mono)).toBe(-Infinity);

    const right = new Float32Array(left.length);
    for (let i = 0; i < left.length; i += 1) right[i] = -left[i];
    expect(channelCorrelation(left, right)).toBeCloseTo(-1, 6);
    expect(sideToMidDb([left, right])).toBeGreaterThan(0);
  });

  it("sees a cut tail and a decayed one differently", () => {
    const cut = sine(0.2, 200, 0.8);
    expect(tailRmsDb([cut], RATE, 50)).toBeGreaterThan(-10);
    expect(finalPeakDb([cut], RATE, 5)).toBeGreaterThan(-10);

    const decayed = new Float32Array(RATE / 5);
    for (let i = 0; i < decayed.length; i += 1) {
      decayed[i] = 0.8 * Math.sin((2 * Math.PI * 200 * i) / RATE) * Math.exp(-i / (RATE * 0.02));
    }
    expect(tailRmsDb([decayed], RATE, 50)).toBeLessThan(-60);
    expect(finalPeakDb([decayed], RATE, 5)).toBeLessThan(-60);
  });

  it("reads an exponential decay as exponential", () => {
    const exponential = new Float32Array(RATE / 2);
    // An impulse convolved with a 40 ms exponential decay: every 20 dB costs the same time, so the ratio is 0.5.
    for (let i = 0; i < exponential.length; i += 1) exponential[i] = Math.exp(-i / (RATE * 0.01));
    const ratio = decayShapeRatio([exponential], RATE);
    expect(ratio).not.toBeNull();
    expect(ratio as number).toBeGreaterThan(0.35);
    expect(ratio as number).toBeLessThan(0.65);
  });

  it("finds a real click and ignores dense treble", () => {
    // A 200 Hz note at 0.3 slews ~0.008 per sample, so a 0.5 spike is far above its own floor: the tick.
    const quiet = sine(0.05, 200, 0.3);
    expect(clickAnalysis([quiet], RATE).count).toBe(0);
    const clicked = Float32Array.from(quiet);
    clicked[1200] += 0.5;
    clicked[2400] -= 0.5;
    const found = clickAnalysis([clicked], RATE);
    // One cluster per isolated spike; the count is asserted to scale in the next case, because the exact
    // cluster boundaries depend on how many samples around a spike fall outside the local floor.
    expect(found.count).toBeGreaterThanOrEqual(1);
    expect(found.worstDb as number).toBeGreaterThan(30);

    // A train of isolated spikes must count as many events: this is what "clicks on every note" looks like.
    // 125 ms apart — a 1/16 at 120 BPM, the note rate, not an edge rate — and the buffer has to be long
    // enough to hold them all (the first version of this test wrote past the end and counted one).
    const train = sine(1.1, 200, 0.3);
    for (let k = 0; k < 8; k += 1) train[600 + k * 6000] += 0.5;
    expect(clickAnalysis([train], RATE).count).toBe(8);

    // A 5 kHz sine slews ~0.4 per sample, so the same absolute spike is masked by the material around it.
    const bright = sine(0.05, 5000, 0.6);
    expect(clickAnalysis([bright], RATE).count).toBe(0);
  });

  it("does not mistake a pulse waveform for clicks", () => {
    /**
     * The false positive that made the first version of this audit report thousands of "clicks" on a clean
     * bit-crushed lead: a square wave is flat between edges and steep at them, which is exactly a click's
     * signature sample by sample. It is rejected because its edges are *regular*.
     */
    const period = Math.round(RATE / 220);
    const square = new Float32Array(RATE / 10);
    for (let i = 0; i < square.length; i += 1) square[i] = i % period < period / 2 ? 0.6 : -0.6;
    expect(clickAnalysis([square], RATE).count).toBe(0);
  });

  it("ignores stems that are too quiet to be heard", () => {
    // The other false positive: a chord stem 35 dB down is noise floor, and relative deviations in it are
    // meaningless. Below the audibility gate nothing is measured.
    const tiny = sine(0.05, 300, 0.008);
    const result = clickAnalysis([tiny], RATE);
    expect(result.skippedQuiet).toBe(true);
    expect(result.count).toBe(0);
    // The same signal at an audible level is analysed.
    expect(clickAnalysis([sine(0.05, 300, 0.5)], RATE).skippedQuiet).toBe(false);
  });

  it("measures onsets on the envelope so swing can be checked against the audio", () => {
    const rate = 8000;
    const total = Math.round(1 * rate);
    const buffer = new Float32Array(total);
    // Four 20 ms bursts at 0, 250, 500 and 750 ms.
    for (const offsetMs of [0, 250, 500, 750]) {
      const start = Math.round((offsetMs / 1000) * rate);
      for (let i = 0; i < rate * 0.02 && start + i < total; i += 1) {
        buffer[start + i] = 0.8 * Math.sin((2 * Math.PI * 200 * i) / rate) * Math.exp(-i / (rate * 0.004));
      }
    }
    const onsets = onsetTimesMs([buffer], rate);
    expect(onsets.length).toBe(4);
    expect(onsets[0]).toBeLessThan(5);
    expect(onsets[1]).toBeGreaterThan(245);
    expect(onsets[1]).toBeLessThan(265);
  });

  it("reports peaks in dBFS relative to full scale", () => {
    expect(samplePeakDb([sine(0.05, 440, 1)])).toBeCloseTo(0, 1);
    expect(samplePeakDb([sine(0.05, 440, 0.5)])).toBeCloseTo(-6.02, 1);
    expect(samplePeakDb([new Float32Array(64)])).toBe(-Infinity);
    expect(maxStepDb([new Float32Array(64)])).toBe(-Infinity);
  });
});
