/**
 * Per-track channel strip DSP (E-10).
 *
 * ## Why this file exists
 *
 * `trackInsert.ts` describes *what* a track's insert chain should be (high-pass, three
 * EQ bands, compressor, drive) and gives every role an authored default. This module is
 * the other half: the Web Audio graph that actually realizes those numbers, once per
 * track, in both the realtime engine and the offline WAV renderer.
 *
 * ## Signal order (the contract — do not reorder)
 *
 * ```
 * input → high-pass → low shelf → peaking → high shelf
 *       → compressor → makeup gain → drive (dry/wet) → output
 * ```
 *
 * The order is the feature. The high-pass runs first so the compressor is not asked to
 * react to rumble the track does not use, the EQ carves before the dynamics stage, and
 * the drive sits last so it shapes the already-balanced signal rather than the raw voice.
 * The makeup gain is its own node (not the compressor) so `compMakeupDb` is auditable
 * independently of the browser's compressor curve — `DynamicsCompressorNode` has no
 * makeup control at all, so "makeup" could otherwise only be an implicit fudge.
 *
 * ## True bypass, per stage
 *
 * A `BiquadFilterNode` has no transparent type, and a disabled peaking/shelf filter
 * parked at an extreme frequency is *not* transparent (it still has a slope and a Q). So
 * bypass here is a **re-route**, exactly like `EffectsRack`'s filter bypass: `rewire()`
 * tears down every edge the strip owns and rebuilds only the enabled stages, leaving the
 * disabled ones genuinely out of the signal path. With every stage disabled the graph is
 * a straight wire `input → output` through two unity gains, so the strip is *exactly*
 * transparent rather than approximately so, and costs no per-block CPU. The compressor
 * and the makeup gain are one stage (enabling compression enables its makeup; disabling
 * compression removes both) so a bypassed compressor can never leave a stray gain behind.
 *
 * Disabling drive routes around the dry/wet split entirely; a disabled drive shaper also
 * has `curve = null` (linear), so it cannot colour the signal by either mechanism.
 *
 * ## Determinism and offline use
 *
 * Nothing here uses a clock or `Math.random`. Parameters are written with
 * `setValueAtTime(value, ctx.currentTime)`, the curve table is a pure function of the
 * drive amount, and node identity is fixed for the lifetime of the strip. The strip only
 * touches `BaseAudioContext` factory methods, so an `OfflineAudioContext` builds the
 * identical graph — the property the 159-genre loudness baseline and the WAV exporter's
 * parity rule depend on.
 */
import {
  INSERT_COMP_MAX_ATTACK_SEC,
  INSERT_COMP_MAX_MAKEUP_DB,
  INSERT_COMP_MAX_RATIO,
  INSERT_COMP_MAX_RELEASE_SEC,
  INSERT_COMP_MAX_THRESHOLD_DB,
  INSERT_COMP_MIN_ATTACK_SEC,
  INSERT_COMP_MIN_MAKEUP_DB,
  INSERT_COMP_MIN_RATIO,
  INSERT_COMP_MIN_RELEASE_SEC,
  INSERT_COMP_MIN_THRESHOLD_DB,
  INSERT_DRIVE_MAX,
  INSERT_DRIVE_MIN,
  INSERT_DRIVE_MIX_MAX,
  INSERT_EQ_MAX_GAIN_DB,
  INSERT_EQ_MAX_HZ,
  INSERT_EQ_MAX_Q,
  INSERT_EQ_MIN_GAIN_DB,
  INSERT_EQ_MIN_HZ,
  INSERT_EQ_MIN_Q,
  INSERT_HPF_MAX_HZ,
  INSERT_HPF_MIN_HZ,
  bypassTrackInsert,
  isTrackInsertBypassed,
  type TrackEqBand,
  STEREO_WIDTH_MAX_DELAY_SEC,
  type TrackInsertParams,
} from "../data/trackInsert";
import { makeSaturationCurve } from "./EffectsRack";

/**
 * High-pass Q. `1/sqrt(2)` is the Butterworth (maximally flat) value: the high-pass is
 * there to remove rumble, not to add a resonant peak at its corner. At this Q the
 * response is exactly −3.01 dB at `hpfHz` for every corner frequency.
 */
export const INSERT_HPF_Q = Math.SQRT1_2;

/** Ceiling on the stereo-spread amount; the stage's own clamp agrees with it. */
export const STEREO_WIDTH_MAX = 1;

/** Bound passed to `createDelay` by the stereo-spread stage. Re-exported so a test can hold the contract. */
export { STEREO_WIDTH_MAX_DELAY_SEC };

/**
 * Compressor knee, dB. `trackInsert.ts` deliberately does not expose a knee — the
 * published contract is threshold/ratio/attack/release — so the DSP fixes one. 6 dB is
 * a gentle, musical knee: below the browser default of 30 (which would start compressing
 * ~15 dB under the threshold and make `compThresholdDb` stop meaning what it says).
 */
export const INSERT_COMP_KNEE_DB = 6;

/**
 * Points in the drive transfer table. 2048 matches the master rack's saturation curve, so
 * a strip's drive and the master rack's DRIVE sound like the same transfer function, and
 * the table resolves `x = 0` exactly (an even sample count puts a sample at the centre).
 */
export const INSERT_DRIVE_CURVE_SAMPLES = 2048;

/**
 * dB → linear amplitude.
 *
 * `masterGraph.ts` exports an identical helper, but importing that module would drag the
 * reverb/delay buses and the limiter into every strip; this is one line of arithmetic and
 * is deliberately duplicated rather than coupled.
 */
function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Coerces to a finite number, or returns `fallback` for NaN/Infinity/non-numeric input. */
function finiteOr(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Coerces to a boolean; `undefined`/`null` keep the current value. */
function boolOr(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

/** Clamps a possibly-garbage value into `[min, max]`, falling back when it is not finite. */
function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = finiteOr(value, fallback);
  return Math.min(max, Math.max(min, n));
}

/**
 * The strip's input and output are unity gain, so a straight-wire bypass is exactly
 * transparent and the strip's own level change comes only from the makeup stage.
 */
export class ChannelStrip {
  /** The strip's input; a track's voice output connects here. */
  readonly input: GainNode;
  /** The strip's output; connect into the polarity/pan stage. */
  readonly output: GainNode;

  private readonly ctx: BaseAudioContext;

  // Stage nodes. Created once in the constructor and never replaced, so `input`/`output`
  // (and every internal node) keep their identity across any number of `setParams` calls.
  private readonly hpf: BiquadFilterNode;
  private readonly lowShelf: BiquadFilterNode;
  private readonly peaking: BiquadFilterNode;
  private readonly highShelf: BiquadFilterNode;
  private readonly compressor: DynamicsCompressorNode;
  private readonly makeup: GainNode;
  private readonly driveIn: GainNode;
  private readonly shaper: WaveShaperNode;
  private readonly driveDry: GainNode;
  private readonly driveWet: GainNode;

  /**
   * Every node whose outgoing edges belong to the strip. `output` is deliberately absent:
   * its outgoing edges belong to the caller (the polarity/pan stage), so `rewire` must
   * never disconnect them.
   */
  private readonly internalNodes: readonly AudioNode[];

  private params: TrackInsertParams;
  private routingSignature = "";
  private disposed = false;

  /**
   * `params` is a **patch**, not a complete table: the constructor merges it over the neutral bypass values, so a
   * caller that wants one stage (a widener, say) does not have to write out the other eight.
   */
  constructor(ctx: BaseAudioContext, params?: Partial<TrackInsertParams>) {
    this.ctx = ctx;

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.input.gain.value = 1;
    this.output.gain.value = 1;

    this.hpf = ctx.createBiquadFilter();
    this.lowShelf = ctx.createBiquadFilter();
    this.peaking = ctx.createBiquadFilter();
    this.highShelf = ctx.createBiquadFilter();
    this.compressor = ctx.createDynamicsCompressor();
    this.makeup = ctx.createGain();
    this.driveIn = ctx.createGain();
    this.shaper = ctx.createWaveShaper();
    this.driveDry = ctx.createGain();
    this.driveWet = ctx.createGain();
    this.driveIn.gain.value = 1;

    // Filter types are static; only their parameters move.
    this.hpf.type = "highpass";
    this.lowShelf.type = "lowshelf";
    this.peaking.type = "peaking";
    this.highShelf.type = "highshelf";

    // Anti-aliasing for the tanh harmonics, matching the master rack's saturation node.
    this.shaper.oversample = "2x";

    this.internalNodes = [
      this.hpf,
      this.lowShelf,
      this.peaking,
      this.highShelf,
      this.compressor,
      this.makeup,
      this.driveIn,
      this.shaper,
      this.driveDry,
      this.driveWet,
    ];

    // No params means "no processing": a neutral straight wire is the only safe default
    // for a per-track insert. Callers that want a role's chain pass `resolveTrackInsert`.
    this.params = sanitizeParams(mergeParams(bypassTrackInsert(), params ?? {}), ctx.sampleRate);
    this.applyParams();
  }

  /** Merges `patch` over the current params, clamps every field to the INSERT_* bounds. */
  setParams(patch: Partial<TrackInsertParams>): void {
    if (this.disposed) return;
    this.params = sanitizeParams(mergeParams(this.params, patch), this.ctx.sampleRate);
    this.applyParams();
  }

  /**
   * Live gain reduction of this strip's compressor, in dB (≤ 0).
   *
   * `DynamicsCompressorNode.reduction` is the browser's own measurement, so the meter shows what
   * the compressor is doing rather than a re-derivation of it. A strip whose compressor is bypassed
   * is *unwired*, so this reads 0 there — which is the honest reading.
   */
  getCompressorReductionDb(): number {
    const reduction = (this.compressor as DynamicsCompressorNode & { reduction?: number }).reduction;
    return typeof reduction === "number" && Number.isFinite(reduction) ? reduction : 0;
  }

  /** A defensive deep copy — callers cannot mutate the strip's live parameters. */
  getParams(): TrackInsertParams {
    return {
      ...this.params,
      low: { ...this.params.low },
      mid: { ...this.params.mid },
      high: { ...this.params.high },
    };
  }

  /** True when nothing in the chain alters the signal (agrees with the data module). */
  isBypassed(): boolean {
    return isTrackInsertBypassed(this.params);
  }

  /**
   * Gain reduction the compressor is currently applying, in dB as a positive number
   * (0 when the compressor stage is bypassed, or when the context does not report it).
   * `DynamicsCompressorNode.reduction` is a non-positive dB value; this returns its
   * magnitude so a meter can show "6.0 dB of reduction".
   */
  getGainReductionDb(): number {
    if (!this.params.compEnabled) return 0;
    const reduction = this.compressor.reduction;
    if (typeof reduction !== "number" || !Number.isFinite(reduction)) return 0;
    return Math.max(0, -reduction);
  }

  /** Idempotent teardown. After it, no node owned by this strip has an outgoing edge. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const node of [this.input, ...this.internalNodes, this.output]) {
      try {
        node.disconnect();
      } catch {
        /* already disconnected, or a double that does not implement disconnect */
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Writes every clamped parameter to its node and re-routes only when the set of enabled
   * stages changed. Rewiring on every slider move would click; changing a gain or a
   * frequency never needs an edge change.
   */
  private applyParams(): void {
    const p = this.params;
    const now = this.ctx.currentTime;

    this.writeParam(this.hpf.frequency, p.hpfHz, now);
    this.writeParam(this.hpf.Q, INSERT_HPF_Q, now);

    this.writeParam(this.lowShelf.frequency, p.low.hz, now);
    this.writeParam(this.lowShelf.gain, p.low.gainDb, now);
    this.writeParam(this.lowShelf.Q, p.low.q, now);

    this.writeParam(this.peaking.frequency, p.mid.hz, now);
    this.writeParam(this.peaking.gain, p.mid.gainDb, now);
    this.writeParam(this.peaking.Q, p.mid.q, now);

    this.writeParam(this.highShelf.frequency, p.high.hz, now);
    this.writeParam(this.highShelf.gain, p.high.gainDb, now);
    this.writeParam(this.highShelf.Q, p.high.q, now);

    this.writeParam(this.compressor.threshold, p.compThresholdDb, now);
    this.writeParam(this.compressor.ratio, p.compRatio, now);
    this.writeParam(this.compressor.attack, p.compAttackSec, now);
    this.writeParam(this.compressor.release, p.compReleaseSec, now);
    this.writeParam(this.compressor.knee, INSERT_COMP_KNEE_DB, now);

    // The makeup node receives the requested gain only while the compressor stage is in
    // the path; when it is bypassed the node is held at unity and disconnected, so a
    // stale `compMakeupDb` can never leak gain into a "bypassed" strip.
    this.writeParam(this.makeup.gain, p.compEnabled ? dbToGain(p.compMakeupDb) : 1, now);

    // Linear dry/wet crossfade. `driveMix = 0` gives dry = 1 and wet = 0 exactly, so the
    // stage is bit-transparent dry; `driveMix = 1` gives dry = 0 and wet = 1 exactly.
    this.writeParam(this.driveDry.gain, 1 - p.driveMix, now);
    this.writeParam(this.driveWet.gain, p.driveMix, now);

    // The width stage's amount, when a genre has asked for one. Nothing is built for `width = 0`: the
    // stage does not exist, so there is no gain to keep in step and no delays in the graph.
    // `null` is the WaveShaper's linear (transparent) mode. Rebuilt from the corrected
    // master-rack curve, whose small-signal slope is exactly 1 (tanh(k·x)/k, not /tanh(k)).
    if (p.driveEnabled) {
      const curve = makeSaturationCurve(p.driveAmount, INSERT_DRIVE_CURVE_SAMPLES);
      this.shaper.curve = curve as Float32Array<ArrayBuffer>;
    } else {
      this.shaper.curve = null;
    }

    const signature = routingSignature(p);
    if (signature !== this.routingSignature) {
      this.routingSignature = signature;
      this.rewire();
    }
  }

  /**
   * Rebuilds the signal path from scratch. Every edge the strip owns is torn down first
   * (`input.disconnect()` plus each internal node), so repeated enable/disable cycles can
   * never leave a duplicate, doubled-signal path behind.
   */
  private rewire(): void {
    if (this.disposed) return;

    this.input.disconnect();
    for (const node of this.internalNodes) {
      node.disconnect();
    }

    const p = this.params;
    let prev: AudioNode = this.input;
    const insert = (node: AudioNode): void => {
      prev.connect(node);
      prev = node;
    };

    if (p.hpfEnabled) insert(this.hpf);
    if (p.low.enabled) insert(this.lowShelf);
    if (p.mid.enabled) insert(this.peaking);
    if (p.high.enabled) insert(this.highShelf);
    if (p.compEnabled) {
      // Compressor and its makeup gain travel together as one stage.
      insert(this.compressor);
      insert(this.makeup);
    }

    /**
     * `p.width` is deliberately **not** wired here yet.
     *
     * The stage exists and is tested (`src/audio/StereoWidth.ts`), and no genre sets `width`: enabling it widens the
     * mix and costs the per-note claim, which the plan records as a measured trade. Keeping it out of the strip also
     * keeps its delay/LFO graph out of every page — the bundle budget caught it at 220.6 KB against 220 KB — so
     * wiring it back is a deliberate change (one `tail` here plus the genre it is for), not a coincidence of an
     * unused import.
     */
    const tail: AudioNode = this.output;

    if (p.driveEnabled) {
      // Dry/wet split. `driveIn` is the split point; both legs sum at the tail.
      prev.connect(this.driveIn);
      this.driveIn.connect(this.shaper);
      this.shaper.connect(this.driveWet);
      this.driveWet.connect(tail);
      this.driveIn.connect(this.driveDry);
      this.driveDry.connect(tail);
    } else {
      // No drive: the previous stage (or `input` when everything is off) feeds the tail
      // directly. With every stage off — and no width — this is a straight wire.
      prev.connect(tail);
    }
  }

  /**
   * Writes a parameter at the context's current time. `setValueAtTime` is used (rather
   * than a ramp) so the graph is deterministic and the offline render sees the same value
   * from sample zero; the fallback covers doubles that expose only a plain `value`.
   */
  private writeParam(param: AudioParam, value: number, now: number): void {
    if (!Number.isFinite(value)) return;
    try {
      param.setValueAtTime(value, now);
    } catch {
      param.value = value;
    }
  }
}

/** Identity of the *routing*, i.e. the enabled flags — not the values. */
function routingSignature(p: TrackInsertParams): string {
  return [
    (p.width ?? 0) > 0 ? 1 : 0,
    p.hpfEnabled ? 1 : 0,
    p.low.enabled ? 1 : 0,
    p.mid.enabled ? 1 : 0,
    p.high.enabled ? 1 : 0,
    p.compEnabled ? 1 : 0,
    p.driveEnabled ? 1 : 0,
  ].join("");
}

function mergeBand(current: TrackEqBand, patch: TrackEqBand | undefined): TrackEqBand {
  if (!patch) return { ...current };
  // Read each field defensively: a caller can pass a partial band at runtime even though
  // the published type is a full `TrackEqBand`.
  const p = patch as Partial<TrackEqBand>;
  return {
    enabled: boolOr(p.enabled, current.enabled),
    hz: finiteOr(p.hz, current.hz),
    gainDb: finiteOr(p.gainDb, current.gainDb),
    q: finiteOr(p.q, current.q),
  };
}

function mergeParams(current: TrackInsertParams, patch: Partial<TrackInsertParams>): TrackInsertParams {
  const p = patch as Partial<Record<keyof TrackInsertParams, unknown>>;
  const cur = current as unknown as Record<string, unknown>;
  const pick = (key: string, fallback: unknown): unknown =>
    p[key as keyof TrackInsertParams] === undefined ? fallback : p[key as keyof TrackInsertParams];
  return {
    hpfEnabled: boolOr(pick("hpfEnabled", cur.hpfEnabled), current.hpfEnabled),
    hpfHz: finiteOr(pick("hpfHz", cur.hpfHz), current.hpfHz),
    low: mergeBand(current.low, patch.low),
    mid: mergeBand(current.mid, patch.mid),
    high: mergeBand(current.high, patch.high),
    compEnabled: boolOr(pick("compEnabled", cur.compEnabled), current.compEnabled),
    compThresholdDb: finiteOr(pick("compThresholdDb", cur.compThresholdDb), current.compThresholdDb),
    compRatio: finiteOr(pick("compRatio", cur.compRatio), current.compRatio),
    compAttackSec: finiteOr(pick("compAttackSec", cur.compAttackSec), current.compAttackSec),
    compReleaseSec: finiteOr(pick("compReleaseSec", cur.compReleaseSec), current.compReleaseSec),
    compMakeupDb: finiteOr(pick("compMakeupDb", cur.compMakeupDb), current.compMakeupDb),
    driveEnabled: boolOr(pick("driveEnabled", cur.driveEnabled), current.driveEnabled),
    driveAmount: finiteOr(pick("driveAmount", cur.driveAmount), current.driveAmount),
    driveMix: finiteOr(pick("driveMix", cur.driveMix), current.driveMix),
    // `undefined` in a patch means "leave it as it is"; 0 is a real value here (no stage).
    width: p.width === undefined ? (cur.width as number | undefined) : finiteOr(p.width, 0),
  };
}

/**
 * Clamps every field to the documented `INSERT_*` bounds. Non-finite values fall back to
 * the neutral values of `bypassTrackInsert()` (0 dB EQ, unity ratio/makeup, drive off),
 * so garbage input can neither throw nor leave a filter parked outside the audible band.
 *
 * Band frequencies are additionally held below Nyquist (`0.49 × sampleRate`): the
 * documented 18 kHz ceiling is fine at 44.1/48 kHz, but a low-rate context must not be
 * handed a frequency the biquad cannot represent.
 */
function sanitizeParams(raw: TrackInsertParams, sampleRate: number): TrackInsertParams {
  const neutral = bypassTrackInsert();
  const eqMaxHz = Math.min(INSERT_EQ_MAX_HZ, Math.max(INSERT_EQ_MIN_HZ, sampleRate * 0.49));
  const hpfMaxHz = Math.min(INSERT_HPF_MAX_HZ, Math.max(INSERT_HPF_MIN_HZ, sampleRate * 0.49));
  const clampBand = (band: TrackEqBand | undefined, fallback: TrackEqBand): TrackEqBand => ({
    enabled: boolOr(band?.enabled, fallback.enabled),
    hz: clamp(band?.hz, INSERT_EQ_MIN_HZ, eqMaxHz, fallback.hz),
    gainDb: clamp(band?.gainDb, INSERT_EQ_MIN_GAIN_DB, INSERT_EQ_MAX_GAIN_DB, fallback.gainDb),
    q: clamp(band?.q, INSERT_EQ_MIN_Q, INSERT_EQ_MAX_Q, fallback.q),
  });

  return {
    hpfEnabled: boolOr(raw?.hpfEnabled, neutral.hpfEnabled),
    hpfHz: clamp(raw?.hpfHz, INSERT_HPF_MIN_HZ, hpfMaxHz, neutral.hpfHz),
    low: clampBand(raw?.low, neutral.low),
    mid: clampBand(raw?.mid, neutral.mid),
    high: clampBand(raw?.high, neutral.high),
    compEnabled: boolOr(raw?.compEnabled, neutral.compEnabled),
    compThresholdDb: clamp(
      raw?.compThresholdDb,
      INSERT_COMP_MIN_THRESHOLD_DB,
      INSERT_COMP_MAX_THRESHOLD_DB,
      neutral.compThresholdDb
    ),
    compRatio: clamp(raw?.compRatio, INSERT_COMP_MIN_RATIO, INSERT_COMP_MAX_RATIO, neutral.compRatio),
    compAttackSec: clamp(
      raw?.compAttackSec,
      INSERT_COMP_MIN_ATTACK_SEC,
      INSERT_COMP_MAX_ATTACK_SEC,
      neutral.compAttackSec
    ),
    compReleaseSec: clamp(
      raw?.compReleaseSec,
      INSERT_COMP_MIN_RELEASE_SEC,
      INSERT_COMP_MAX_RELEASE_SEC,
      neutral.compReleaseSec
    ),
    compMakeupDb: clamp(
      raw?.compMakeupDb,
      INSERT_COMP_MIN_MAKEUP_DB,
      INSERT_COMP_MAX_MAKEUP_DB,
      neutral.compMakeupDb
    ),
    driveEnabled: boolOr(raw?.driveEnabled, neutral.driveEnabled),
    driveAmount: clamp(raw?.driveAmount, INSERT_DRIVE_MIN, INSERT_DRIVE_MAX, neutral.driveAmount),
    driveMix: clamp(raw?.driveMix, 0, INSERT_DRIVE_MIX_MAX, neutral.driveMix),
    // Optional by contract: an authored table that says nothing about width gets 0, i.e. no stage at all.
    width: clamp(raw?.width ?? 0, 0, STEREO_WIDTH_MAX, 0),
  };
}
