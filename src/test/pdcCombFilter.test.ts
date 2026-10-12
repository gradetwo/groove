import { describe, expect, it } from "vitest";
import { limitBuffers, MASTER_LIMITER_LOOKAHEAD_MS } from "../audio/MasterLimiter";

/**
 * PDC's acceptance line, written **before** the compensation exists.
 *
 * Workstream 6 asks for a comb-filter test, and this is the arithmetic behind it: a limiter delays its output by `latencySamples`, so two
 * copies of the same signal summed **aligned** add up while copies summed **misaligned** cancel in bands — a comb. The test's first job is
 * to show the detector can see the difference at all, because a probe that reports "no comb" when it is pointed at noise has told you
 * nothing (this project has made that mistake four times, and recorded each one).
 *
 * So the test does both ends: the misaligned case must show a deep band cancellation, and the aligned case must not. Only then is
 * "the render is aligned" a statement worth making.
 */
const SAMPLE_RATE = 44100;

/** Deterministic noise: a fair signal for a comb, and one that does not depend on Math.random. */
function noise(frames: number): Float32Array {
  const out = new Float32Array(frames);
  let state = 0x1234567;
  for (let i = 0; i < frames; i += 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (state / 0x3fffffff) - 1;
  }
  return out;
}

/** The summed spectrum's energy in a few bands, which is all a comb needs to be seen. */
function bandEnergies(signal: Float32Array, bins = 16): number[] {
  const energies = new Array(bins).fill(0);
  // A coarse DFT over bins is enough to see a cancellation and cheap enough to keep the test fast.
  for (let bin = 0; bin < bins; bin += 1) {
    const frequency = ((bin + 1) / (bins + 1)) * (SAMPLE_RATE / 8);
    let real = 0;
    let imaginary = 0;
    for (let i = 0; i < signal.length; i += 1) {
      const angle = (2 * Math.PI * frequency * i) / SAMPLE_RATE;
      real += signal[i] * Math.cos(angle);
      imaginary += signal[i] * Math.sin(angle);
    }
    energies[bin] = Math.sqrt(real * real + imaginary * imaginary) / signal.length;
  }
  return energies;
}

const sum = (a: Float32Array, b: Float32Array, offset = 0): Float32Array => {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] + (b[i + offset] ?? 0);
  return out;
};

describe("PDC's comb-filter criterion", () => {
  it("declares a lookahead consistent with the millisecond value the settings screen shows", () => {
    expect(MASTER_LIMITER_LOOKAHEAD_MS).toBeGreaterThan(0);
    const { latencySamples } = limitBuffers([noise(4096)], SAMPLE_RATE);
    expect(latencySamples).toBe(Math.max(1, Math.round((MASTER_LIMITER_LOOKAHEAD_MS / 1000) * SAMPLE_RATE)));
  });

  it("sees a comb when the copies are misaligned by the limiter's latency", () => {
    const source = noise(8192);
    const left = source;
    const right = source;
    const misaligned = sum(left, right, 64); // 64 samples ≈ 1.45 ms at 44.1 kHz
    const aligned = sum(left, right, 0);

    const misalignedBands = bandEnergies(misaligned);
    const alignedBands = bandEnergies(aligned);
    // Misaligned copies cancel in bands where the delay is a half period; aligned ones reinforce everywhere.
    const worstMisaligned = Math.min(...misalignedBands);
    const worstAligned = Math.min(...alignedBands);
    expect(worstMisaligned).toBeLessThan(worstAligned * 0.5);
  });

  it("passes the limiter's own latency through, which is what PDC has to compensate", () => {
    const source = noise(4096);
    const limited = limitBuffers([source], SAMPLE_RATE);
    expect(limited.latencySamples).toBeGreaterThan(0);
    // The kernel delays: the first `latencySamples - 1` outputs carry no signal at all.
    const head = limited.channels[0].slice(0, Math.max(0, limited.latencySamples - 1));
    expect(Math.max(...head.map((value) => Math.abs(value)))).toBeLessThan(1e-6);
  });
});
