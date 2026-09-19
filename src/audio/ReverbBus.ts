/**
 * Parameterised reverb send bus.
 *
 * Why this file exists
 * --------------------
 * The shipped reverb was a `ConvolverNode` fed an impulse built from flat white
 * noise, a single exponential envelope, `Math.random()` seeds and a hard-coded
 * 1.5 s length plus a 0.35 return gain (`AudioEngine.createReverbImpulse`,
 * `AudioEngine.setupSendBuses`). That produced four audible defects:
 *
 *   1. **No frequency-dependent decay.** The tail stayed bright/hissy and never
 *      darkened, because a real room absorbs high frequencies first. This is the
 *      single biggest reason the old reverb read as "added noise" rather than space.
 *   2. **No pre-delay and no early reflections.** Energy started at sample 0, so the
 *      reverb smeared the transient instead of placing it in a room.
 *   3. **The tail length and return level were unreachable.** A genre that wants an
 *      8-10 s ambient wash could not have one, and the send had no setter, which
 *      blocked the planned per-genre effect defaults.
 *   4. **The impulse was not reproducible**, which broke the project's exporter
 *      parity invariant (a WAV could not be guaranteed to match the audition).
 *
 * This module generates a deterministic, parameterised impulse response and hides
 * the (re)generation behind two stable endpoints — `input` and `output` — so the
 * caller wires the graph once and afterwards only calls `setParams`. `input`,
 * `output` and the internal `ConvolverNode` are the same objects for the lifetime
 * of the instance; only the convolver's `buffer` is swapped.
 *
 * Impulse synthesis
 * -----------------
 * 1. **Pre-delay** — silence for `preDelayMs`.
 * 2. **Early reflections** — five discrete taps (`EARLY_TAP_MS` / `EARLY_TAP_GAIN`)
 *    in the first 30 ms after the pre-delay. Each tap gets a three-sample decaying
 *    skirt: a bare single-sample tap is a full-bandwidth click, while real
 *    surfaces absorb some of a reflection's high end. The taps are identical in
 *    both channels, so `width` only ever affects the diffuse tail.
 * 3. **Diffuse tail** — seeded white noise per channel (from `noise.ts`) split by a
 *    Butterworth LP2/HP2 crossover at `DAMPING_SPLIT_HZ` into a low and a high band,
 *    each with its own exponential RT60: the low band decays at `decaySec`, the high
 *    band at `decaySec * (1 - (1 - DAMPING_HIGH_MIN_RATIO) * damping)`. That is what
 *    makes `RT60(4 kHz)` genuinely shorter than `RT60(630 Hz)`. At `damping = 0` the
 *    filter is skipped entirely, exactly reproducing the old flat/bright behaviour.
 *
 *    Note: an exponentially *falling low-pass cutoff* was tried first and rejected.
 *    It only steepens the local slope while the cutoff is still moving; once the
 *    cutoff saturates the high band resumes the base envelope rate, so the measured
 *    RT60 shortened by only ~28%. A per-band decay time changes the asymptotic rate
 *    and is the property a room actually exhibits.
 * 4. **Stereo width** — a mid/side mix of the two seeded noise streams. `width = 0`
 *    collapses the tail to one mono signal in both channels (bit-identical);
 *    `width = 1` keeps the two independent streams (fully decorrelated).
 * 5. **Normalisation** — the Web Audio spec's `ConvolverNode` equal-power scale
 *    (`calculateNormalizationScale` in the spec) is applied explicitly and the
 *    convolver's own `normalize` is switched off. That keeps the previous
 *    (`normalize: true`) loudness while making the wet level browser-independent:
 *    after normalisation it is decided solely by `returnLevel`.
 *
 * Everything here is allocation-free during playback: the impulse is only rebuilt
 * when a synthesis parameter actually changes, and the generator is entirely
 * `BaseAudioContext`-based, so it behaves identically in an `OfflineAudioContext`.
 */

import { DEFAULT_NOISE_SEED, fillWhiteNoise, hashSeed } from "./noise";

export interface ReverbParams {
  /** Whether the return is audible at all. When false the wet path is silenced. */
  enabled: boolean;
  /** RT60 in seconds — how long the tail takes to decay by 60 dB. */
  decaySec: number;
  /** 0..1 high-frequency damping. 0 = the old flat/bright behaviour, 1 = heavily damped. */
  damping: number;
  /** Pre-delay in milliseconds before the first reflection. */
  preDelayMs: number;
  /** 0..1 stereo width of the tail. 0 = mono tail, 1 = fully decorrelated. */
  width: number;
  /** Return level 0..1 (the old code hard-coded 0.35 and had no setter). */
  returnLevel: number;
}

/**
 * Smallest tail the bus will build. Requests below this are clamped rather than
 * producing a degenerate (near-zero-length) impulse.
 */
export const REVERB_DECAY_MIN_SEC = 0.2;

/**
 * Largest tail the bus will build. The genre plan needs roughly 0.6 s (small room)
 * to ~10 s (ambient); anything longer is clamped so a bad preset cannot allocate an
 * unbounded impulse.
 */
export const REVERB_DECAY_MAX_SEC = 10;

/** Upper bound for `preDelayMs`; a longer delay is a musical effect, not a room. */
export const REVERB_PREDELAY_MAX_MS = 250;

export const DEFAULT_REVERB_PARAMS: ReverbParams = {
  enabled: true,
  decaySec: 1.8,
  damping: 0.4,
  preDelayMs: 20,
  width: 1,
  returnLevel: 0.35,
};

/** Time constant of the click-free return-level ramp (seconds). */
const RETURN_RAMP_SEC = 0.02;

/** Extra impulse length kept after the RT60 point so the tail is not cut at -60 dB. */
const TAIL_PAD_SEC = 0.05;

/** Short fade-in of the diffuse tail so its onset is not a step (seconds). */
const TAIL_ATTACK_SEC = 0.02;

/** Span after the pre-delay occupied by the discrete early reflections (ms). */
const EARLY_REFLECTION_SPAN_MS = 30;

/** Early-reflection arrival times, relative to the pre-delay (ms). */
const EARLY_TAP_MS = [4.2, 9.8, 15.6, 22.1, 28.7];

/** Early-reflection amplitudes; alternating polarity adds diffusion. */
const EARLY_TAP_GAIN = [0.62, 0.47, -0.34, 0.26, -0.19];

/** Crossover between the slow (low) and fast (high) reverb bands (Hz). */
const DAMPING_SPLIT_HZ = 800;
/**
 * RT60 of the high band at `damping = 1`, as a fraction of `decaySec`. `0.25` means
 * fully damped highs die four times faster than the lows. `damping = 0` keeps the
 * ratio at 1 (band split collapses, old flat behaviour).
 */
const DAMPING_HIGH_MIN_RATIO = 0.25;

/** -60 dB expressed as a natural-log decay constant (`ln(1000)`). */
const R60_LN = Math.log(1000);

/** Left/right noise seeds. Fixed constants are what make the impulse reproducible. */
const IMPULSE_SEED_LEFT = DEFAULT_NOISE_SEED;
const IMPULSE_SEED_RIGHT = hashSeed(DEFAULT_NOISE_SEED);

/**
 * Web Audio spec `ConvolverNode` normalisation constants. Kept here so we can apply
 * the browser's `normalize: true` scale ourselves and then run with `normalize: false`.
 */
const NORMALIZE_GAIN_CALIBRATION = 0.00125;
const NORMALIZE_CALIBRATION_SAMPLE_RATE = 44100;
const NORMALIZE_MIN_POWER = 0.000125;

/** Clamps a possibly-undefined/NaN parameter into range without ever throwing. */
function clampParam(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (value === undefined || Number.isNaN(value)) return fallback;
  if (value === Infinity) return max;
  if (value === -Infinity) return min;
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Resolves a patch against a base parameter set, clamping every numeric field. */
function resolveParams(base: ReverbParams, patch: Partial<ReverbParams>): ReverbParams {
  return {
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : base.enabled,
    decaySec: clampParam(
      patch.decaySec,
      REVERB_DECAY_MIN_SEC,
      REVERB_DECAY_MAX_SEC,
      base.decaySec
    ),
    damping: clampParam(patch.damping, 0, 1, base.damping),
    preDelayMs: clampParam(patch.preDelayMs, 0, REVERB_PREDELAY_MAX_MS, base.preDelayMs),
    width: clampParam(patch.width, 0, 1, base.width),
    returnLevel: clampParam(patch.returnLevel, 0, 1, base.returnLevel),
  };
}

/**
 * Applies the Web Audio spec's `normalize: true` equal-power scale to `buffer`
 * in place. This is the exact algorithm from the spec, so a `ConvolverNode` with
 * `normalize = false` fed this buffer produces the same output the browser would
 * have produced with `normalize = true`, but it is now our deterministic code
 * rather than a browser-internal step.
 */
function applySpecNormalization(buffer: AudioBuffer): void {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  let power = 0;
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    let channelPower = 0;
    for (let i = 0; i < length; i++) {
      const sample = data[i];
      channelPower += sample * sample;
    }
    power += channelPower;
  }
  power = Math.sqrt(power / (channels * length));
  if (!Number.isFinite(power) || power < NORMALIZE_MIN_POWER) {
    power = NORMALIZE_MIN_POWER;
  }
  let scale = (1 / power) * NORMALIZE_GAIN_CALIBRATION;
  if (buffer.sampleRate) {
    scale *= NORMALIZE_CALIBRATION_SAMPLE_RATE / buffer.sampleRate;
  }
  if (channels === 4) scale *= 0.5;
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] *= scale;
  }
}

/**
 * One Direct-Form-I biquad step. `state` is `[x1, x2, y1, y2]` and `coeffs` is
 * `[b0, b1, b2, a1, a2]` with the coefficients already normalised by `a0`.
 */
function biquadStep(state: Float64Array, coeffs: Float64Array, x: number): number {
  const y =
    coeffs[0] * x +
    coeffs[1] * state[0] +
    coeffs[2] * state[1] -
    coeffs[3] * state[2] -
    coeffs[4] * state[3];
  state[1] = state[0];
  state[0] = x;
  state[3] = state[2];
  state[2] = y;
  return y;
}

export class ReverbBus {
  /** Send destination: every track's `sendA` connects here. */
  readonly input: GainNode;
  /** Return: connect this into the master sum. */
  readonly output: GainNode;

  private readonly ctx: BaseAudioContext;
  private readonly convolver: ConvolverNode;
  private params: ReverbParams;
  private impulse: AudioBuffer | null = null;
  private buildCount = 0;
  private currentReturnTarget: number;
  private disposed = false;

  constructor(ctx: BaseAudioContext, params: Partial<ReverbParams> = {}) {
    this.ctx = ctx;
    this.params = resolveParams(DEFAULT_REVERB_PARAMS, params);

    this.input = ctx.createGain();
    this.input.gain.value = 1;
    this.convolver = ctx.createConvolver();
    // Must be set before the first buffer assignment to take effect (spec).
    this.convolver.normalize = false;
    this.output = ctx.createGain();

    const initialReturn = this.params.enabled ? this.params.returnLevel : 0;
    this.currentReturnTarget = initialReturn;
    this.output.gain.setValueAtTime(initialReturn, ctx.currentTime);

    this.input.connect(this.convolver);
    this.convolver.connect(this.output);

    this.rebuildImpulse();
  }

  public setParams(patch: Partial<ReverbParams>): void {
    if (this.disposed) return;
    const next = resolveParams(this.params, patch);
    const previous = this.params;
    this.params = next;

    const synthesisChanged =
      next.decaySec !== previous.decaySec ||
      next.damping !== previous.damping ||
      next.preDelayMs !== previous.preDelayMs ||
      next.width !== previous.width;
    if (synthesisChanged) this.rebuildImpulse();

    this.applyReturnLevel();
  }

  public getParams(): ReverbParams {
    return { ...this.params };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.input.disconnect();
    } catch {
      /* already torn down */
    }
    try {
      this.convolver.disconnect();
    } catch {
      /* already torn down */
    }
    try {
      this.output.disconnect();
    } catch {
      /* already torn down */
    }
    try {
      this.output.gain.value = 0;
    } catch {
      /* exotic contexts without a writable param */
    }
    this.convolver.buffer = null;
    this.impulse = null;
  }

  /**
   * Test/inspection hook: the impulse currently assigned to the convolver, or
   * `null` after `dispose`. Not needed by the audio graph itself.
   */
  public getImpulse(): AudioBuffer | null {
    return this.impulse;
  }

  /**
   * Test/inspection hook: how many times the impulse has been generated. Lets a
   * test prove that a no-op `setParams` call does not rebuild a multi-megabyte IR.
   */
  public getImpulseBuildCount(): number {
    return this.buildCount;
  }

  /** Ramps the return gain; never a step, so toggling cannot click. */
  private applyReturnLevel(): void {
    const target = this.params.enabled ? this.params.returnLevel : 0;
    if (target === this.currentReturnTarget) return;
    this.currentReturnTarget = target;
    const gain = this.output.gain;
    const now = this.ctx.currentTime;
    try {
      if (typeof gain.cancelAndHoldAtTime === "function") {
        gain.cancelAndHoldAtTime(now);
      } else if (typeof gain.cancelScheduledValues === "function") {
        gain.cancelScheduledValues(now);
      }
      gain.linearRampToValueAtTime(target, now + RETURN_RAMP_SEC);
    } catch {
      // A context that rejects ramps must still end up at the right level.
      gain.value = target;
    }
  }

  private rebuildImpulse(): void {
    this.impulse = this.buildImpulse();
    this.convolver.buffer = this.impulse;
    this.buildCount++;
  }

  /**
   * Builds one deterministic stereo impulse response. Called only from the
   * constructor and when a synthesis parameter changes — never per frame.
   */
  private buildImpulse(): AudioBuffer {
    const ctx = this.ctx;
    const sampleRate = ctx.sampleRate;
    const { decaySec, damping, preDelayMs, width } = this.params;

    const preSamples = Math.round((preDelayMs / 1000) * sampleRate);
    const earlySpanSamples = Math.round((EARLY_REFLECTION_SPAN_MS / 1000) * sampleRate);
    const tailSamples = Math.max(1, Math.ceil(decaySec * sampleRate));
    const padSamples = Math.ceil(TAIL_PAD_SEC * sampleRate);
    const tailStart = preSamples + earlySpanSamples;
    const length = tailStart + tailSamples + padSamples;

    const impulse = ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    // --- 1. discrete early reflections (identical in both channels) ---------
    for (let t = 0; t < EARLY_TAP_MS.length; t++) {
      const index = preSamples + Math.round((EARLY_TAP_MS[t] / 1000) * sampleRate);
      if (index >= length) break;
      const gain = EARLY_TAP_GAIN[t];
      left[index] += gain;
      right[index] += gain;
      if (index + 1 < length) {
        left[index + 1] += gain * 0.45;
        right[index + 1] += gain * 0.45;
      }
      if (index + 2 < length) {
        left[index + 2] += gain * 0.2;
        right[index + 2] += gain * 0.2;
      }
    }

    // --- 2. diffuse tail: seeded noise, damping, envelope, width ------------
    // Fill the tail region in place (the buffer starts zeroed, so the pre-delay is
    // already silent). `subarray` is a view: no extra allocation.
    fillWhiteNoise(left.subarray(tailStart), IMPULSE_SEED_LEFT);
    fillWhiteNoise(right.subarray(tailStart), IMPULSE_SEED_RIGHT);

    const totalTail = tailSamples + padSamples;
    const attackSamples = Math.max(1, Math.round(TAIL_ATTACK_SEC * sampleRate));
    // `damping = 0` -> ratio 1 (one shared envelope); `damping = 1` -> the floor.
    const highRatio = 1 - (1 - DAMPING_HIGH_MIN_RATIO) * damping;
    const lowEnvelopeDecay = Math.exp(-R60_LN / (decaySec * sampleRate));
    const highEnvelopeDecay = Math.exp(-R60_LN / (decaySec * highRatio * sampleRate));

    let envelope = 0;
    let lowEnvelope = 0;
    let highEnvelope = 0;

    // Damping is implemented as two bands with independent RT60s. The split is a
    // Butterworth LP2/HP2 pair (12 dB/oct), whose sum is an allpass, so the bands
    // are spectrally clean at 630 Hz and 4 kHz — a first-order split leaks so much
    // low-band energy into the 4 kHz band that RT60(4 kHz) never actually shortens.
    const splitFc = Math.min(DAMPING_SPLIT_HZ, 0.45 * sampleRate);
    const w0 = (2 * Math.PI * splitFc) / sampleRate;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * Math.SQRT1_2); // Butterworth Q = 1/sqrt(2)
    const a0 = 1 + alpha;
    const lpCoeffs = new Float64Array([
      ((1 - cosW0) / 2) / a0,
      (1 - cosW0) / a0,
      ((1 - cosW0) / 2) / a0,
      (-2 * cosW0) / a0,
      (1 - alpha) / a0,
    ]);
    const hpCoeffs = new Float64Array([
      ((1 + cosW0) / 2) / a0,
      (-(1 + cosW0)) / a0,
      ((1 + cosW0) / 2) / a0,
      (-2 * cosW0) / a0,
      (1 - alpha) / a0,
    ]);
    const lpStateLeft = new Float64Array(4);
    const hpStateLeft = new Float64Array(4);
    const lpStateRight = new Float64Array(4);
    const hpStateRight = new Float64Array(4);

    for (let i = 0; i < totalTail; i++) {
      const index = tailStart + i;
      const noiseLeft = left[index];
      const noiseRight = right[index];
      // Mid/side: width 0 -> identical channels, width 1 -> independent streams.
      const mid = (noiseLeft + noiseRight) * 0.5;
      const side = (noiseLeft - noiseRight) * 0.5;
      const sampleLeft = mid + width * side;
      const sampleRight = mid - width * side;

      if (damping <= 0) {
        // Old flat/bright behaviour: one envelope, no band split, no colouration.
        if (i < attackSamples) envelope = (i + 1) / attackSamples;
        else envelope *= lowEnvelopeDecay;
        left[index] = sampleLeft * envelope;
        right[index] = sampleRight * envelope;
      } else {
        if (i < attackSamples) {
          lowEnvelope = (i + 1) / attackSamples;
          highEnvelope = lowEnvelope;
        } else {
          lowEnvelope *= lowEnvelopeDecay;
          highEnvelope *= highEnvelopeDecay;
        }
        const lowLeft = biquadStep(lpStateLeft, lpCoeffs, sampleLeft);
        const highLeft = biquadStep(hpStateLeft, hpCoeffs, sampleLeft);
        const lowRight = biquadStep(lpStateRight, lpCoeffs, sampleRight);
        const highRight = biquadStep(hpStateRight, hpCoeffs, sampleRight);
        left[index] = lowLeft * lowEnvelope + highLeft * highEnvelope;
        right[index] = lowRight * lowEnvelope + highRight * highEnvelope;
      }
    }

    applySpecNormalization(impulse);
    return impulse;
  }
}
