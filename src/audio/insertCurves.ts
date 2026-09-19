import type { TrackInsertParams, TrackEqBand } from "../data/trackInsert";
import { INSERT_COMP_KNEE_DB, INSERT_DRIVE_CURVE_SAMPLES, INSERT_HPF_Q } from "./ChannelStripDsp";
import { makeSaturationCurve } from "./EffectsRack";

/**
 * Display curves for the insert chain — computed from the *actual* parameters.
 *
 * A response curve that does not describe the audio is worse than no curve: it teaches the user
 * something false. So everything here mirrors `ChannelStripDsp` instead of approximating it:
 *
 *   - the filter curves use the same RBJ/Web-Audio biquad coefficient formulas the browser's
 *     `BiquadFilterNode` implements, at the same Q values (`INSERT_HPF_Q` for the high-pass, the
 *     band's own Q for the peaking band);
 *   - the compressor curve uses the Web Audio soft-knee transfer function at the strip's **fixed**
 *     6 dB knee (`INSERT_COMP_KNEE_DB`), which is why the knee is not a user parameter;
 *   - the drive curve is the strip's own transfer table (`makeSaturationCurve`, the very function
 *     that fills the `WaveShaperNode`), so the drawing cannot drift from the sound;
 *   - and a **disabled stage contributes nothing**, because the DSP rewires it out of the graph
 *     rather than parking it at a neutral setting.
 *
 * The one thing these curves are not is a measurement of the running browser filter: they are the
 * transfer functions the parameters *ask for*. That distinction is stated in the UI.
 */

/** The four filter shapes the insert chain uses. */
export type BiquadKind = "highpass" | "lowshelf" | "peaking" | "highshelf";

export interface BiquadSpec {
  kind: BiquadKind;
  freqHz: number;
  /** Only the peaking band uses it; shelves ignore Q (Web Audio fixes their slope), as does the HPF. */
  q?: number;
  gainDb?: number;
}

/** RBJ cookbook coefficients, normalised so `a0 === 1`. */
export function biquadCoefficients(spec: BiquadSpec, sampleRate: number): { b0: number; b1: number; b2: number; a1: number; a2: number } {
  const nyquist = sampleRate / 2;
  const freq = Math.min(Math.max(spec.freqHz, 1), nyquist * 0.999);
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const A = Math.pow(10, (spec.gainDb ?? 0) / 40);

  if (spec.kind === "highpass") {
    const q = spec.q && spec.q > 0 ? spec.q : INSERT_HPF_Q;
    const alpha = sin / (2 * q);
    const b0 = (1 + cos) / 2;
    const b1 = -(1 + cos);
    const b2 = (1 + cos) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cos;
    const a2 = 1 - alpha;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  }

  if (spec.kind === "peaking") {
    const q = spec.q && spec.q > 0 ? spec.q : 1;
    const alpha = sin / (2 * q);
    const b0 = 1 + alpha * A;
    const b1 = -2 * cos;
    const b2 = 1 - alpha * A;
    const a0 = 1 + alpha / A;
    const a1 = -2 * cos;
    const a2 = 1 - alpha / A;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  }

  // Shelves: Web Audio fixes the slope (S = 1), so alpha depends only on w0.
  const alpha = (sin / 2) * Math.SQRT2;
  const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
  if (spec.kind === "lowshelf") {
    const b0 = A * (A + 1 - (A - 1) * cos + twoSqrtAAlpha);
    const b1 = 2 * A * (A - 1 - (A + 1) * cos);
    const b2 = A * (A + 1 - (A - 1) * cos - twoSqrtAAlpha);
    const a0 = A + 1 + (A - 1) * cos + twoSqrtAAlpha;
    const a1 = -2 * (A - 1 + (A + 1) * cos);
    const a2 = A + 1 + (A - 1) * cos - twoSqrtAAlpha;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  }
  const b0 = A * (A + 1 + (A - 1) * cos + twoSqrtAAlpha);
  const b1 = -2 * A * (A - 1 + (A + 1) * cos);
  const b2 = A * (A + 1 + (A - 1) * cos - twoSqrtAAlpha);
  const a0 = A + 1 - (A - 1) * cos + twoSqrtAAlpha;
  const a1 = 2 * (A - 1 - (A + 1) * cos);
  const a2 = A + 1 - (A - 1) * cos - twoSqrtAAlpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Magnitude of one biquad at one frequency, in dB. */
export function biquadMagnitudeDb(spec: BiquadSpec, atHz: number, sampleRate: number): number {
  const { b0, b1, b2, a1, a2 } = biquadCoefficients(spec, sampleRate);
  const w = (2 * Math.PI * Math.min(Math.max(atHz, 0), sampleRate / 2)) / sampleRate;
  const cos1 = Math.cos(w);
  const sin1 = Math.sin(w);
  const cos2 = Math.cos(2 * w);
  const sin2 = Math.sin(2 * w);
  const numRe = b0 + b1 * cos1 + b2 * cos2;
  const numIm = -(b1 * sin1 + b2 * sin2);
  const denRe = 1 + a1 * cos1 + a2 * cos2;
  const denIm = -(a1 * sin1 + a2 * sin2);
  const num = Math.hypot(numRe, numIm);
  const den = Math.hypot(denRe, denIm) || 1e-12;
  return 20 * Math.log10(Math.max(num / den, 1e-12));
}

const bandSpec = (kind: BiquadKind, band: TrackEqBand): BiquadSpec => ({
  kind,
  freqHz: band.hz,
  gainDb: band.gainDb,
  ...(kind === "peaking" ? { q: band.q } : {}),
});

/**
 * The combined magnitude response of the EQ stages that are actually enabled.
 *
 * Disabled stages are omitted (the DSP unroutes them), and the compressor is *not* part of this
 * curve — it is level dependent, which is what its own transfer curve is for.
 */
export function eqResponseDb(params: TrackInsertParams, atHz: number, sampleRate: number): number {
  let db = 0;
  if (params.hpfEnabled) db += biquadMagnitudeDb({ kind: "highpass", freqHz: params.hpfHz, q: INSERT_HPF_Q }, atHz, sampleRate);
  if (params.low.enabled) db += biquadMagnitudeDb(bandSpec("lowshelf", params.low), atHz, sampleRate);
  if (params.mid.enabled) db += biquadMagnitudeDb(bandSpec("peaking", params.mid), atHz, sampleRate);
  if (params.high.enabled) db += biquadMagnitudeDb(bandSpec("highshelf", params.high), atHz, sampleRate);
  return db;
}

export interface CurvePoint {
  hz: number;
  db: number;
}

/** Log-spaced EQ response samples for drawing. */
export function eqResponseCurve(
  params: TrackInsertParams,
  sampleRate: number,
  points = 200,
  fMin = 20,
  fMax = 20000
): CurvePoint[] {
  const out: CurvePoint[] = [];
  const ratio = fMax / fMin;
  for (let i = 0; i < points; i++) {
    const hz = fMin * Math.pow(ratio, i / (points - 1));
    out.push({ hz, db: eqResponseDb(params, hz, sampleRate) });
  }
  return out;
}

/** The bands to draw handles for, so the curve can be edited at its own nodes. */
export function eqBandMarker(params: TrackInsertParams): Array<{ id: string; kind: BiquadKind; hz: number; gainDb: number; enabled: boolean }> {
  return [
    { id: "hpf", kind: "highpass", hz: params.hpfHz, gainDb: 0, enabled: params.hpfEnabled },
    { id: "low", kind: "lowshelf", hz: params.low.hz, gainDb: params.low.gainDb, enabled: params.low.enabled },
    { id: "mid", kind: "peaking", hz: params.mid.hz, gainDb: params.mid.gainDb, enabled: params.mid.enabled },
    { id: "high", kind: "highshelf", hz: params.high.hz, gainDb: params.high.gainDb, enabled: params.high.enabled },
  ];
}

/**
 * Web Audio's soft-knee compressor transfer function.
 *
 * The knee is fixed at 6 dB by the strip (see `INSERT_COMP_KNEE_DB`), and this mirrors the spec
 * formula: unity below the knee, `threshold + (x − threshold)/ratio` above it, and a quadratic
 * blend in between.
 */
export function compressorTransferDb(inputDb: number, thresholdDb: number, ratio: number, kneeDb = INSERT_COMP_KNEE_DB): number {
  const r = Math.max(1, ratio);
  const over = inputDb - thresholdDb;
  const half = Math.max(0, kneeDb) / 2;
  if (over <= -half) return inputDb;
  if (over >= half) return thresholdDb + over / r;
  const x = over + half;
  return inputDb + (1 / r - 1) * (x * x) / (2 * Math.max(kneeDb, 1e-6));
}

/** Gain reduction (≤ 0 dB) the compressor applies at a given input level. */
export function compressorGainReductionDb(inputDb: number, thresholdDb: number, ratio: number, kneeDb = INSERT_COMP_KNEE_DB): number {
  return compressorTransferDb(inputDb, thresholdDb, ratio, kneeDb) - inputDb;
}

export interface CompressorCurve {
  /** `[inputDb, outputDb]` pairs, ready to map into the panel. */
  transfer: Array<[number, number]>;
  /** Where the threshold sits, so the drawing can mark it. */
  thresholdDb: number;
  inputMinDb: number;
  inputMaxDb: number;
}

export function compressorCurve(params: TrackInsertParams, points = 96, inputMinDb = -60, inputMaxDb = 6): CompressorCurve {
  const transfer: Array<[number, number]> = [];
  for (let i = 0; i < points; i++) {
    const x = inputMinDb + ((inputMaxDb - inputMinDb) * i) / (points - 1);
    transfer.push([x, compressorTransferDb(x, params.compThresholdDb, params.compRatio)]);
  }
  return { transfer, thresholdDb: params.compThresholdDb, inputMinDb, inputMaxDb };
}

/**
 * Note on the drive stage's level behaviour, because the curve makes it visible: the shaper is
 * `tanh(k·x)/k` with `k = max(1, drive)`, so the **mildest** setting (1) is already a full tanh
 * curve, and raising the drive compresses the mid-levels *and* lowers the output (the `1/k`
 * normalisation) — the curve is what shows that honestly, rather than a label claiming "1 = clean".
 */
export interface DriveCurve {
  /** `[input, output]` in −1…1, sampled from the strip's own shaping table. */
  pairs: Array<[number, number]>;
  amount: number;
  mix: number;
}

/**
 * The drive stage's transfer curve, read from the same table the `WaveShaperNode` uses.
 *
 * `mix` is applied as the dry/wet blend the strip performs, so a partially wet drive draws the
 * blend the user actually hears rather than the raw shaper.
 */
export function driveCurve(params: TrackInsertParams, points = 96): DriveCurve {
  const table = makeSaturationCurve(params.driveAmount, INSERT_DRIVE_CURVE_SAMPLES);
  const n = table.length;
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < points; i++) {
    const x = -1 + (2 * i) / (points - 1);
    const idx = Math.min(n - 1, Math.max(0, Math.round(((x + 1) / 2) * (n - 1))));
    const wet = table[idx];
    pairs.push([x, params.driveMix * wet + (1 - params.driveMix) * x]);
  }
  return { pairs, amount: params.driveAmount, mix: params.driveMix };
}

/** Frequency <-> x position helpers shared by the curve views (log scale). */
export function hzToRatio(hz: number, fMin = 20, fMax = 20000): number {
  const clamped = Math.min(Math.max(hz, fMin), fMax);
  return Math.log(clamped / fMin) / Math.log(fMax / fMin);
}

export function ratioToHz(ratio: number, fMin = 20, fMax = 20000): number {
  return fMin * Math.pow(fMax / fMin, Math.min(Math.max(ratio, 0), 1));
}
