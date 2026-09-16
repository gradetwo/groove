/**
 * Insert-chain display curves (item ① of the redesign).
 *
 * The curves are the whole point of the redesign, and a curve that does not describe the audio is
 * worse than no curve — it teaches the user something false. So these tests assert the *transfer
 * functions' known properties* rather than snapshotting numbers: a Butterworth high-pass is
 * −3.01 dB at its corner, a shelf reaches its gain at the end of the spectrum, a peaking band
 * reaches its gain at its centre frequency, the compressor is unity below the knee and 1/ratio
 * above it, and a disabled stage contributes exactly nothing (the DSP unwires it).
 */
import { describe, expect, it } from "vitest";
import {
  biquadMagnitudeDb,
  compressorCurve,
  compressorGainReductionDb,
  compressorTransferDb,
  driveCurve,
  eqResponseCurve,
  eqResponseDb,
  hzToRatio,
  ratioToHz,
} from "../audio/insertCurves";
import { INSERT_COMP_KNEE_DB, INSERT_HPF_Q } from "../audio/ChannelStripDsp";
import { resolveTrackInsert, type TrackInsertParams } from "../data/trackInsert";

const SR = 48000;

/** Real per-role defaults, not a hand-written stub, so the curves are exercised on shipped values. */
const withInsert = (patch: Partial<TrackInsertParams>): TrackInsertParams => ({
  ...resolveTrackInsert("chords"),
  ...patch,
});

describe("biquad curves · known properties of the shapes the strip uses", () => {
  it("high-pass is −3.01 dB at its corner at the strip's Butterworth Q", () => {
    const db = biquadMagnitudeDb({ kind: "highpass", freqHz: 200, q: INSERT_HPF_Q }, 200, SR);
    expect(db).toBeCloseTo(-3.01, 1);
  });

  it("high-pass rejects well below the corner and passes well above it", () => {
    const low = biquadMagnitudeDb({ kind: "highpass", freqHz: 500, q: INSERT_HPF_Q }, 20, SR);
    const high = biquadMagnitudeDb({ kind: "highpass", freqHz: 500, q: INSERT_HPF_Q }, 8000, SR);
    expect(low).toBeLessThan(-35);
    expect(Math.abs(high)).toBeLessThan(0.5);
  });

  it("low shelf reaches its gain at DC and is flat at the top", () => {
    const spec = { kind: "lowshelf" as const, freqHz: 200, gainDb: 6 };
    expect(biquadMagnitudeDb(spec, 20, SR)).toBeCloseTo(6, 1);
    expect(biquadMagnitudeDb(spec, 12000, SR)).toBeCloseTo(0, 1);
  });

  it("high shelf is flat at the bottom and reaches its gain at the top", () => {
    const spec = { kind: "highshelf" as const, freqHz: 6000, gainDb: -5 };
    expect(biquadMagnitudeDb(spec, 60, SR)).toBeCloseTo(0, 1);
    expect(biquadMagnitudeDb(spec, 18000, SR)).toBeCloseTo(-5, 1);
  });

  it("peaking reaches its gain at its centre and leaves the extremes alone", () => {
    const spec = { kind: "peaking" as const, freqHz: 1000, gainDb: 8, q: 1.2 };
    expect(biquadMagnitudeDb(spec, 1000, SR)).toBeCloseTo(8, 1);
    expect(biquadMagnitudeDb(spec, 30, SR)).toBeCloseTo(0, 1);
    expect(biquadMagnitudeDb(spec, 16000, SR)).toBeCloseTo(0, 1);
  });

  it("a higher peaking Q makes the band narrower", () => {
    const wide = biquadMagnitudeDb({ kind: "peaking", freqHz: 1000, gainDb: 8, q: 0.7 }, 2000, SR);
    const narrow = biquadMagnitudeDb({ kind: "peaking", freqHz: 1000, gainDb: 8, q: 6 }, 2000, SR);
    expect(narrow).toBeLessThan(wide);
  });
});

describe("EQ response · only the stages that are on contribute", () => {
  it("is flat when every stage is disabled", () => {
    const flat = withInsert({
      hpfEnabled: false,
      low: { ...resolveTrackInsert("chords").low, enabled: false },
      mid: { ...resolveTrackInsert("chords").mid, enabled: false },
      high: { ...resolveTrackInsert("chords").high, enabled: false },
    });
    for (const hz of [20, 200, 2000, 20000]) expect(eqResponseDb(flat, hz, SR)).toBeCloseTo(0, 6);
  });

  it("adds the enabled bands together", () => {
    const base = withInsert({
      hpfEnabled: false,
      low: { ...resolveTrackInsert("chords").low, enabled: false },
      mid: { ...resolveTrackInsert("chords").mid, enabled: false },
      high: { ...resolveTrackInsert("chords").high, enabled: false },
    });
    const midOn = { ...base, mid: { ...base.mid, enabled: true, hz: 1000, gainDb: 6, q: 1 } };
    expect(eqResponseDb(midOn, 1000, SR)).toBeCloseTo(6, 1);

    const lowOnly = { ...base, low: { ...base.low, enabled: true, hz: 120, gainDb: 4 } };
    const bothOn = { ...lowOnly, mid: midOn.mid };
    // The stages are in series, so the combined response is the sum of the individual ones — at
    // 2 kHz both bands are doing something, which makes "adds together" a measurable statement
    // rather than a guess about where each shelf has reached its full gain.
    const at2k = 2000;
    expect(eqResponseDb(bothOn, at2k, SR)).toBeCloseTo(
      eqResponseDb(lowOnly, at2k, SR) + eqResponseDb({ ...base, mid: midOn.mid }, at2k, SR),
      6
    );
    expect(eqResponseDb(bothOn, at2k, SR)).toBeGreaterThan(eqResponseDb(lowOnly, at2k, SR));
  });

  it("samples the curve log-spaced from 20 Hz to 20 kHz, monotonically", () => {
    const curve = eqResponseCurve(withInsert({}), SR, 64);
    expect(curve).toHaveLength(64);
    expect(curve[0].hz).toBeCloseTo(20, 6);
    expect(curve[curve.length - 1].hz).toBeCloseTo(20000, 3);
    for (let i = 1; i < curve.length; i++) expect(curve[i].hz).toBeGreaterThan(curve[i - 1].hz);
  });

  it("maps frequency to the drawing axis and back", () => {
    expect(hzToRatio(20)).toBeCloseTo(0, 6);
    expect(hzToRatio(20000)).toBeCloseTo(1, 6);
    expect(hzToRatio(200)).toBeCloseTo(1 / 3, 3); // 20 → 200 → 2k → 20k is three equal decades
    for (const hz of [20, 137, 1000, 9500, 20000]) expect(ratioToHz(hzToRatio(hz))).toBeCloseTo(hz, 4);
  });
});

describe("compressor curve · the strip's soft knee, and the promise it makes", () => {
  it("is unity below the knee", () => {
    expect(compressorTransferDb(-30, -18, 4)).toBeCloseTo(-30, 6);
    expect(compressorGainReductionDb(-30, -18, 4)).toBeCloseTo(0, 6);
  });

  it("compresses by exactly 1/ratio above the knee", () => {
    const threshold = -20;
    const ratio = 4;
    const input = 0; // 20 dB over
    expect(compressorTransferDb(input, threshold, ratio)).toBeCloseTo(threshold + 20 / ratio, 6);
    expect(compressorGainReductionDb(input, threshold, ratio)).toBeCloseTo(-(20 - 20 / ratio), 6);
  });

  it("is continuous across the knee edges", () => {
    const threshold = -20;
    const half = INSERT_COMP_KNEE_DB / 2;
    const belowEdge = compressorTransferDb(threshold - half - 1e-6, threshold, 4);
    const aboveEdge = compressorTransferDb(threshold + half + 1e-6, threshold, 4);
    expect(belowEdge).toBeCloseTo(threshold - half, 4);
    expect(aboveEdge).toBeCloseTo(threshold + half / 4, 4);
    // And just inside the knee it must not jump.
    expect(compressorTransferDb(threshold - half + 0.01, threshold, 4)).toBeCloseTo(threshold - half, 1);
    expect(compressorTransferDb(threshold + half - 0.01, threshold, 4)).toBeCloseTo(threshold + half / 4, 1);
  });

  it("never boosts and never crosses unity gain", () => {
    for (const ratio of [1, 2, 8, 20]) {
      for (let x = -60; x <= 6; x += 2) {
        const y = compressorTransferDb(x, -12, ratio);
        expect(y).toBeLessThanOrEqual(x + 1e-9);
      }
    }
  });

  it("builds a curve spanning the requested range with the threshold marked", () => {
    const curve = compressorCurve(withInsert({ compThresholdDb: -14, compRatio: 3 }), 32);
    expect(curve.transfer).toHaveLength(32);
    expect(curve.transfer[0][0]).toBeCloseTo(-60, 6);
    expect(curve.transfer[31][0]).toBeCloseTo(6, 6);
    expect(curve.thresholdDb).toBe(-14);
    // Above the threshold the curve must bend: output grows slower than input.
    const steep = curve.transfer[31][1] - curve.transfer[30][1];
    const flat = curve.transfer[1][1] - curve.transfer[0][1];
    expect(steep).toBeLessThan(flat);
  });
});

describe("drive curve · drawn from the shaper's own table", () => {
  it("stays inside the unit square and is odd-symmetric around zero", () => {
    const { pairs } = driveCurve(withInsert({ driveEnabled: true, driveAmount: 3, driveMix: 1 }), 33);
    for (const [x, y] of pairs) {
      expect(Math.abs(x)).toBeLessThanOrEqual(1);
      expect(Number.isFinite(y)).toBe(true);
      expect(Math.abs(y)).toBeLessThan(3);
    }
    const mid = pairs[(pairs.length - 1) / 2];
    expect(mid[0]).toBeCloseTo(0, 6);
    expect(mid[1]).toBeCloseTo(0, 3);
  });

  it("the mildest setting is already a soft saturation, not a bypass", () => {
    // The shaper is tanh(k·x)/k with k = max(1, drive), so even drive = 1 compresses the extremes
    // (that is why the UI must not call it "clean" — the curve is the honest description).
    const { pairs } = driveCurve(withInsert({ driveEnabled: true, driveAmount: 1, driveMix: 1 }), 21);
    const atFull = pairs[pairs.length - 2][1]; // just inside full scale
    expect(Math.abs(atFull)).toBeLessThan(0.99);
    expect(Math.abs(atFull)).toBeGreaterThan(0.5);
    // Unity slope at the centre: a small input passes at (almost) the same level.
    const mid = pairs[(pairs.length - 1) / 2];
    const next = pairs[(pairs.length - 1) / 2 + 1];
    if (mid[0] !== 0) {
      const slope = (next[1] - mid[1]) / (next[0] - mid[0]);
      expect(slope).toBeGreaterThan(0.9);
    }
  });

  it("more drive compresses the mid-levels harder, and dry/wet blends toward the raw input", () => {
    const soft = driveCurve(withInsert({ driveEnabled: true, driveAmount: 2, driveMix: 1 }), 21);
    const hard = driveCurve(withInsert({ driveEnabled: true, driveAmount: 6, driveMix: 1 }), 21);
    // Measure the *shape*, not the peak: the 1/k normalisation means a harder drive is quieter in
    // absolute terms while compressing more, so the honest comparison is output/input at mid-level.
    const compressionAtMid = (curve: typeof soft) => {
      const mid = curve.pairs.find(([x]) => Math.abs(x - 0.5) < 0.06);
      return mid ? Math.abs(mid[1] / mid[0]) : NaN;
    };
    expect(compressionAtMid(hard)).toBeLessThan(compressionAtMid(soft));

    const halfDry = driveCurve(withInsert({ driveEnabled: true, driveAmount: 6, driveMix: 0.5 }), 21);
    for (let i = 0; i < halfDry.pairs.length; i++) {
      const [x, y] = halfDry.pairs[i];
      expect(y).toBeCloseTo(0.5 * hard.pairs[i][1] + 0.5 * x, 3);
    }
  });
});
