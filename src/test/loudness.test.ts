import { describe, it, expect } from "vitest";
import {
  kWeightingCoefficients,
  kWeightChannel,
  measureLoudness,
  sampleRmsDb,
  type BiquadCoefficients,
} from "./helpers/loudness";

/**
 * Published BS.1770-4 pre-filter (Table 1) coefficients — an *independent* anchor for
 * the analytic design in `helpers/loudness.ts`. The 48 kHz set is the table printed in
 * the Recommendation; the 44.1 kHz set is the one every reference implementation
 * (libebur128, pyloudnorm) carries, and it is what the offline renderer actually runs
 * at.
 */
const PUBLISHED_48K = {
  shelf: { b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285, a1: -1.69065929318241, a2: 0.73248077421585 },
  highpass: { b0: 1.0, b1: -2.0, b2: 1.0, a1: -1.99004745483398, a2: 0.99007225036621 },
};

const PUBLISHED_44K1_SHELF = {
  b0: 1.5308412300503478,
  b1: -2.650979995154729,
  b2: 1.169079079921587,
  a1: -1.6636551132560204,
  a2: 0.7125954280732254,
};

/** |H(e^{jw})| from a coefficient set — the textbook biquad magnitude response. */
function magnitudeAt(c: BiquadCoefficients, freq: number, sampleRate: number): number {
  const w = (2 * Math.PI * freq) / sampleRate;
  const numRe = c.b0 + c.b1 * Math.cos(w) + c.b2 * Math.cos(2 * w);
  const numIm = -(c.b1 * Math.sin(w) + c.b2 * Math.sin(2 * w));
  const denRe = 1 + c.a1 * Math.cos(w) + c.a2 * Math.cos(2 * w);
  const denIm = -(c.a1 * Math.sin(w) + c.a2 * Math.sin(2 * w));
  return Math.hypot(numRe, numIm) / Math.hypot(denRe, denIm);
}

function sine(freq: number, peak: number, seconds: number, sampleRate: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < out.length; i++) out[i] = peak * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

describe("BS.1770 K-weighting coefficients", () => {
  it("reproduces the published 48 kHz pre-filter table", () => {
    const { shelf, highpass } = kWeightingCoefficients(48000);
    for (const key of ["b0", "b1", "b2", "a1", "a2"] as const) {
      expect(shelf[key], `shelf.${key}`).toBeCloseTo(PUBLISHED_48K.shelf[key], 12);
      expect(highpass[key], `highpass.${key}`).toBeCloseTo(PUBLISHED_48K.highpass[key], 12);
    }
  });

  it("reproduces the published 44.1 kHz high-shelf table (what the exporter runs at)", () => {
    const { shelf } = kWeightingCoefficients(44100);
    for (const key of ["b0", "b1", "b2", "a1", "a2"] as const) {
      expect(shelf[key], `shelf.${key}`).toBeCloseTo(PUBLISHED_44K1_SHELF[key], 10);
    }
  });

  it("keeps the RLB high-pass corner at 38.1 Hz and the high-shelf plateau at +4 dB on any rate", () => {
    for (const sampleRate of [44100, 48000]) {
      const { shelf, highpass } = kWeightingCoefficients(sampleRate);
      // The Recommendation leaves the RLB numerator un-normalised (b = [1, −2, 1]),
      // so the passband sits at a0 (>1) rather than exactly 1 — a +0.04 dB quirk of
      // the spec that every reference implementation reproduces.
      expect([highpass.b0, highpass.b1, highpass.b2]).toEqual([1, -2, 1]);
      expect(magnitudeAt(highpass, 1000, sampleRate)).toBeCloseTo(1, 2);
      // A second-order high-pass with Q has |H(fc)| = Q; this pins the corner.
      expect(magnitudeAt(highpass, 38.13547087602444, sampleRate)).toBeCloseTo(0.5003270373238773, 2);
      expect(magnitudeAt(highpass, 20, sampleRate)).toBeLessThan(0.25);
      // High-shelf plateau: +4 dB well above the corner, ~0 dB at 1 kHz.
      expect(20 * Math.log10(magnitudeAt(shelf, 10000, sampleRate))).toBeCloseTo(4, 0);
      expect(Math.abs(20 * Math.log10(magnitudeAt(shelf, 1000, sampleRate)))).toBeLessThan(1.5);
    }
  });
});

describe("BS.1770 gated integrated loudness", () => {
  it("matches the analytic value for a 997 Hz sine at the calibration level", () => {
    const sampleRate = 48000;
    const peak = 0.1;
    const channels = [sine(997, peak, 5, sampleRate), sine(997, peak, 5, sampleRate)];

    // Expected loudness computed from the PUBLISHED coefficients (independent path):
    //   L = −0.691 + 10·log10( mean square of the K-weighted signal )
    const shelfGain = magnitudeAt(PUBLISHED_48K.shelf, 997, sampleRate);
    const hpGain = magnitudeAt(PUBLISHED_48K.highpass, 997, sampleRate);
    const meanSquare = (peak * peak) / 2;
    const expected = -0.691 + 10 * Math.log10(meanSquare * (shelfGain * hpGain) ** 2);

    const { integratedLufs } = measureLoudness(channels, sampleRate);
    expect(integratedLufs).toBeCloseTo(expected, 1);
    // The K-weighted 997 Hz curve sits a little above 0 dB, so a −20 dBFS-peak sine
    // reads in the low −23 LUFS region — the familiar EBU alignment number.
    expect(integratedLufs).toBeGreaterThan(-24.2);
    expect(integratedLufs).toBeLessThan(-22.8);
  });

  it("reports raw sample peak in dBFS", () => {
    const sampleRate = 48000;
    const half = new Float32Array(48000);
    half.fill(0.5);
    expect(measureLoudness([half, half], sampleRate).samplePeakDb).toBeCloseTo(-6.0206, 3);
    expect(measureLoudness([new Float32Array(4800)], sampleRate).samplePeakDb).toBe(-Infinity);
  });

  it("gates digital silence out entirely", () => {
    const silence = new Float32Array(48000);
    const { integratedLufs, gatedBlockCount } = measureLoudness([silence, silence], 48000);
    expect(integratedLufs).toBe(-Infinity);
    expect(gatedBlockCount).toBe(0);
  });

  it("gates by the absolute gate only: silence around a loud passage does not drag the result down", () => {
    const sampleRate = 48000;
    const loud = sine(997, 0.5, 4, sampleRate);
    const silence = new Float32Array(4 * sampleRate);
    const joined = new Float32Array(loud.length + silence.length);
    joined.set(loud, 0);
    joined.set(silence, loud.length);

    const loudOnly = measureLoudness([loud, loud], sampleRate).integratedLufs;
    const padded = measureLoudness([joined, joined], sampleRate).integratedLufs;
    // The only difference is the handful of 400 ms windows straddling the loud/silent
    // boundary, which are genuinely quieter.
    expect(Math.abs(padded - loudOnly)).toBeLessThan(0.3);
  });

  it("applies the −10 LU relative gate to a very quiet passage", () => {
    const sampleRate = 48000;
    const loud = sine(997, 0.5, 4, sampleRate);
    const quiet = new Float32Array(4 * sampleRate);
    const quietSine = sine(997, 0.01, 4, sampleRate); // 34 dB below the loud part
    quiet.set(quietSine, 0);
    const joined = new Float32Array(loud.length + quiet.length);
    joined.set(loud, 0);
    joined.set(quiet, loud.length);

    const loudOnly = measureLoudness([loud, loud], sampleRate).integratedLufs;
    const mixed = measureLoudness([joined, joined], sampleRate);
    // The quiet half is below the relative gate, so it must not move the result much.
    expect(Math.abs(mixed.integratedLufs - loudOnly)).toBeLessThan(0.3);
    // Without the relative gate the quiet half would drag the ungated value down.
    expect(mixed.ungatedLufs).toBeLessThan(mixed.integratedLufs - 1);
    // 3 s of the 8 s render cannot pass the relative gate (77 blocks in total).
    expect(mixed.gatedBlockCount).toBeGreaterThan(0);
    expect(mixed.gatedBlockCount).toBeLessThan(60);
  });

  it("K-weights low frequencies down, which is the whole point of the curve", () => {
    const sampleRate = 48000;
    const low = kWeightChannel(sine(30, 1, 0.5, sampleRate), sampleRate);
    const high = kWeightChannel(sine(3000, 1, 0.5, sampleRate), sampleRate);
    const rms = (buf: Float32Array) => {
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      return Math.sqrt(sum / buf.length);
    };
    expect(rms(low)).toBeLessThan(rms(high) * 0.5);
  });

  it("reports unweighted RMS in dBFS for cross-checking the live path", () => {
    const dc = new Float32Array(1000).fill(0.5);
    expect(sampleRmsDb([dc, dc])).toBeCloseTo(-6.0206, 3);
    expect(sampleRmsDb([new Float32Array(100)])).toBe(-Infinity);
  });
});
