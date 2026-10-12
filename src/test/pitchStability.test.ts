/**
 * The pitch estimator's own stability, which is a criterion because its instability once looked like a mapping bug.
 *
 * What happened, measured: the A4 controller-tuning criterion compares sfizz's rendering against this project's arithmetic, and it failed with **890.52 Hz where the same code, run alone, reported 880.01 Hz**. The audio was not the same either — two renders into two directories differ in their bytes, while two renders into the *same* directory are byte-identical — but the real defect was here: the estimator picked the earliest autocorrelation peak above **0.85 × the global maximum**, and a pure tone's peak is flat-topped, so a hair of difference in the audio moved
 * the chosen lag by **one sample**. At ~50 samples per period that is **2%**, twice the 1% tolerance its callers compare against. The threshold is now 0.99, which picks the top of the peak rather than its shoulder.
 *
 * So this file pins the property that was missing: **the same tone, measured twice from different files, must give the same answer.**
 */
import { describe, expect, it } from "vitest";
import { measurePitch, measureToneHz } from "../../scripts/lib/pitch.mjs";

const RATE = 44100;
/** A 440 Hz tone as the oracle writes it: one second, the same phase every time. */
function tone(hz: number, seconds = 1, phase = 0) {
  const frames = Math.round(RATE * seconds);
  const data = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) data[i] = Math.sin(2 * Math.PI * hz * (i / RATE) + phase);
  /**
   * **The whole shape `readWav` returns**, not just the fields this file reads: `measurePitch` takes a `ReadWav`, and a fake that is missing `peak`/`rms`/`channels` is a fake that would not compile where the real thing is passed. A cast here would have hidden that the fakes are incomplete.
   */
  let peak = 0;
  let sumSquares = 0;
  for (let i = 0; i < frames; i += 1) {
    const magnitude = Math.abs(data[i]!);
    if (magnitude > peak) peak = magnitude;
    sumSquares += data[i]! * data[i]!;
  }
  return { sampleRate: RATE, channels: 1, frames, data: [data], peak, rms: Math.sqrt(sumSquares / frames), durationSeconds: seconds } as unknown as Parameters<typeof measurePitch>[0];
}

/** The parameter type comes from the module under test rather than being restated, so a change there cannot leave this file describing an older shape. */
const measured = (wav: Parameters<typeof measurePitch>[0], fromSeconds = 0.08, length = 0.22) =>
  measurePitch(wav, { fromSeconds, toSeconds: fromSeconds + length })?.hz ?? NaN;

describe("the pitch estimator", () => {
  it("measures a pure tone to well inside a tenth of a percent", () => {
    // The accuracy the sfizz criteria depend on, and the reason a 1% tolerance is not the thing being tested there.
    for (const hz of [110, 220, 440, 880, 1760]) {
      const error = Math.abs(measured(tone(hz)) - hz) / hz;
      expect(error, `${hz} Hz measured ${measured(tone(hz)).toFixed(3)}`).toBeLessThan(0.001);
    }
  });

  it("gives the same answer for the same tone written twice, which is what failed", () => {
    /**
     * ⭐ **The regression criterion.** Two separately built arrays stand in for two renders: if a tiny difference in the samples moves the chosen lag, this fails loudly here instead of looking like an SFZ mapping error three files away.
     */
    for (const hz of [220, 440, 880]) {
      const first = measured(tone(hz));
      const second = measured(tone(hz, 1, 1e-6)); // a phase a millionth of a radian off
      expect(Math.abs(first - second) / first, `${hz} Hz: ${first.toFixed(3)} vs ${second.toFixed(3)}`).toBeLessThan(0.001);
    }
  });

  it("keeps working when the segment starts at a different phase", () => {
    // A render whose note starts a fraction of a sample later must not read as a different pitch.
    for (const phase of [0, 0.5, 1.5]) {
      expect(Math.abs(measured(tone(440, 1, phase)) - 440) / 440).toBeLessThan(0.001);
    }
  });

  it("does not claim a confident pitch for a signal that has none", () => {
    /**
     * The estimator is also used on material with no pitch, and a confident wrong answer is worse than none.
     *
     * The signal is a **chirp** rather than a pseudo-random sequence, and that is a correction: the first version of this criterion used `(i % 7 === 0 ? 1 : -1) * (i % 13) / 13`, which is periodic with a period of 91 samples — so the estimator's confident 485 Hz answer was **right**, and the criterion was wrong. A sweep from 200 Hz to 2 kHz has no single period at all.
     */
    const seconds = 0.4;
    const frames = Math.round(RATE * seconds);
    const sweep = new Float32Array(frames);
    for (let i = 0; i < frames; i += 1) {
      const t = i / RATE;
      // Linear sweep in frequency: phase is the integral of the frequency.
      const hz = 200 + ((2000 - 200) * t) / seconds;
      sweep[i] = Math.sin(2 * Math.PI * (200 * t + ((2000 - 200) * t * t) / (2 * seconds)));
      void hz;
    }
    const result = measurePitch({ sampleRate: RATE, channels: 1, frames, data: [sweep], peak: 1, rms: 0.7, durationSeconds: seconds } as unknown as Parameters<typeof measurePitch>[0], { fromSeconds: 0.05, toSeconds: 0.35 });
    expect(result === null || result.confidence < 0.9).toBe(true);
  });

  it("refuses a segment too short to measure rather than guessing", () => {
    expect(measurePitch(tone(440), { fromSeconds: 0, toSeconds: 0.001 })).toBeNull();
  });
});

/**
 * The tone measurement the sfizz criteria use, and **the two ways it is not allowed to fail again**.
 *
 * Its two predecessors each failed in a way worth naming. Autocorrelation picked the shoulder of a flat-topped peak and moved by a sample, which at ~50 samples per period is 2% — the same 880 Hz tone measuring 880.01 Hz in one render and 890.52 Hz in another. Zero crossings then read an 880 Hz tone as **867.82 Hz**, because the render carries the library's own amplitude envelope and a global mean subtraction over a decaying signal leaves a moving mean behind.
 *
 * So the properties held here are the ones that broke: the same tone twice must measure the same, and a **decaying** tone must measure what a steady one does.
 */
describe("the tone measurement", () => {
  const RATE = 44100;
  /** A tone with an optional decay, in decibels across the segment — the shape a real sampler's render has. */
  function tone(hz: number, { seconds = 0.4, decayDb = 0, phase = 0 }: { seconds?: number; decayDb?: number; phase?: number } = {}) {
    const frames = Math.round(RATE * seconds);
    const data = new Float32Array(frames);
    for (let i = 0; i < frames; i += 1) {
      const progress = i / frames;
      const amplitude = Math.pow(10, (-decayDb * progress) / 20);
      data[i] = amplitude * Math.sin(2 * Math.PI * hz * (i / RATE) + phase);
    }
    return { sampleRate: RATE, channels: 1, frames, data: [data] };
  }

  const measured = (wav: ReturnType<typeof tone>) => measureToneHz(wav, { fromSeconds: 0.05, toSeconds: 0.35 });

  it("measures a plain tone to within a fiftieth of a percent", () => {
    for (const hz of [110, 220, 440, 880, 1760]) {
      const found = measured(tone(hz));
      expect(found, `${hz} Hz measured nothing`).not.toBeNull();
      expect(Math.abs(found!.hz - hz) / hz, `${hz} Hz measured ${found!.hz.toFixed(3)}`).toBeLessThan(0.0002);
    }
  });

  it("gives the same answer twice, which is what autocorrelation could not do", () => {
    // ⭐ The regression: a phase a millionth of a radian off was enough to move the old estimate by two percent.
    for (const hz of [220, 440, 880]) {
      const first = measured(tone(hz))!.hz;
      const second = measured(tone(hz, { phase: 1e-6 }))!.hz;
      expect(Math.abs(first - second) / first, `${hz} Hz: ${first.toFixed(3)} vs ${second.toFixed(3)}`).toBeLessThan(0.0002);
    }
  });

  it("measures a decaying tone as the same pitch, which is what zero crossings could not do", () => {
    // ⭐ The second failure: a sampler's render has an envelope, and the answer must not depend on it.
    for (const hz of [220, 440, 880]) {
      const steady = measured(tone(hz))!.hz;
      const decaying = measured(tone(hz, { decayDb: 40 }))!.hz;
      expect(Math.abs(steady - decaying) / steady, `${hz} Hz: ${steady.toFixed(3)} steady vs ${decaying.toFixed(3)} decaying`).toBeLessThan(0.001);
    }
  });

  it("does not claim a confident pitch for a signal that has none", () => {
    // A sweep has no single period, so its energy is spread and the peak does not stand above the band.
    const seconds = 0.4;
    const frames = Math.round(RATE * seconds);
    const sweep = new Float32Array(frames);
    for (let i = 0; i < frames; i += 1) {
      const t = i / RATE;
      sweep[i] = Math.sin(2 * Math.PI * (200 * t + ((2000 - 200) * t * t) / (2 * seconds)));
    }
    const found = measureToneHz({ sampleRate: RATE, channels: 1, frames, data: [sweep] }, { fromSeconds: 0.05, toSeconds: 0.35 });
    expect(found === null || found.confidence < 0.9).toBe(true);
  });

  it("refuses a segment too short to say anything", () => {
    expect(measureToneHz(tone(440, { seconds: 0.002 }), {})).toBeNull();
  });
});
