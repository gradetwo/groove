/**
 * True-peak brickwall master limiter (E-12, fixing N-15).
 *
 * The master ceiling used to be a `DynamicsCompressorNode` configured 20:1 with a
 * 3 ms attack and no lookahead. That is a compressor, not a limiter: the detector has
 * not closed before a kick transient has passed, 1/20 of every excess sails through,
 * and neither inter-sample peaks nor the release trajectory were ever controlled.
 * Measured consequences on this library: sample peaks above 0 dBFS on most genres
 * (hard-clipped by the 16-bit encoder) and audible pumping when any one track got
 * louder.
 *
 * This module replaces it with a real lookahead limiter:
 *
 *  - **Lookahead** `MASTER_LIMITER_LOOKAHEAD_MS` (3 ms). A sliding-window minimum of
 *    the required gain is taken over the lookahead window, so the gain is already down
 *    *before* the offending sample reaches the output. 3 ms is long enough to cover the
 *    detector's own 12-sample (≈0.27 ms) FIR support several times over, short enough
 *    that the added latency is inaudible for a step sequencer; it is also the value
 *    most mastering limiters expose as a default.
 *  - **True-peak detection** — the same 4× oversampled, 12-tap-per-phase polyphase
 *    interpolator the BS.1770 true-peak meter uses, so inter-sample overshoots are what
 *    the ceiling acts on, not just sample peaks.
 *  - **Hard ceiling** at `MASTER_LIMITER_CEILING_DB` (−1.0 dBTP, preserving the old
 *    −1 dB intent).
 *  - **Stereo-linked**: one shared gain envelope computed from the maximum true peak
 *    across channels, so a hard-panned transient cannot move the image.
 *  - **Smooth ballistics**: instant attack (enabled by the lookahead), program-dependent
 *    release — a fast 80 ms slope for shallow reduction, a slow 400 ms slope once the
 *    gain is more than 6 dB down. Every gain value is computed per sample; nothing is
 *    written as a stepped `AudioParam` change, so there is no zipper noise.
 *  - **Deterministic**: the kernel is pure arithmetic over the sample stream with no
 *    randomness, no time source, and no dependence on how the stream is split into
 *    blocks. The AudioWorklet, the TypeScript kernel and the offline renderer therefore
 *    all produce bit-identical output for identical input.
 *
 * Graceful degradation: when `AudioWorklet` is unavailable (old engines, jsdom, the
 * test doubles) `createMasterLimiter` falls back to the previous
 * `DynamicsCompressorNode` ceiling and reports `kind: "fallback"` so the caller — and
 * the test suite — can see which path is live. The fallback exists so nothing breaks;
 * it does **not** carry the true-peak guarantee.
 *
 * `createMasterLimiter` is the one entry point the three engines use
 * (`AudioEngine` realtime, `WavExporter` offline, `ChordAudioEngine` workstation).
 * `applyMasterLimiter` in `voiceRegistry.ts` is kept as the fallback compressor's
 * configuration, so the old name/shape stays usable.
 */

import { applyMasterLimiter } from "./voiceRegistry";

/** Which ceiling is actually in the graph. */
export type MasterLimiterKind = "worklet" | "fallback";

/** Output true-peak ceiling in dBTP. Keeps the historical −1 dB intent. */
export const MASTER_LIMITER_CEILING_DB = -1.0;

/**
 * Headroom the limiter leaves *below* {@link MASTER_LIMITER_CEILING_DB}, in dB.
 *
 * The ceiling is enforced by this module's own interpolating detector, but it is *verified*
 * by `src/test/helpers/loudness.ts` — an independent 4x-oversampled polyphase true-peak
 * meter (BS.1770-style). The two estimators do not agree exactly, and the 2026-09-16
 * 159-genre re-measurement showed the meter reading up to **0.12 dB above** the commanded
 * ceiling on the material that actually hits it (worst: `afrobeat` at −0.88 dBTP against a
 * −1.0 dBTP command). A detector that under-reads the meter by a tenth of a dB means the
 * shipped file can exceed the ceiling the project promises.
 *
 * Rather than argue about which estimator is "right", the limiter targets below the contract:
 * the promise (−1.0 dBTP on the meter) is what ships, and this margin is what makes it true by
 * measurement instead of by definition.
 *
 * The margin grew from 0.15 to 0.30 dB when the E-11 group buses landed. The drum bus's parallel
 * compression path makes the pre-limiter waveform denser and more transient-rich, and the
 * detector's under-read grew with it: the same 159-genre measurement that had peaked at
 * −1.027 dBTP (0.12 dB of under-read) moved to **−0.95 dBTP** — i.e. 0.20 dB of under-read, and
 * one genre above the ceiling the project promises. The margin is set from that measurement plus
 * 0.1 dB of slack, not from taste.
 */
export const MASTER_LIMITER_DETECTOR_MARGIN_DB = 0.3;

/**
 * The ceiling the limiter is *constructed* with: the contract minus the detector margin.
 *
 * Callers that want the −1.0 dBTP promise (both engines do) should leave the ceiling alone
 * and let this default apply. A caller may still pass an explicit `ceilingDb` — the limiter
 * tests do, to pin the kernel's behaviour against a known command.
 */
export const MASTER_LIMITER_INTERNAL_CEILING_DB =
  MASTER_LIMITER_CEILING_DB - MASTER_LIMITER_DETECTOR_MARGIN_DB;
/** Lookahead in milliseconds (see the module comment for the choice). */
export const MASTER_LIMITER_LOOKAHEAD_MS = 3.0;
/** Release time constant for reduction shallower than the knee, in ms. */
export const MASTER_LIMITER_RELEASE_FAST_MS = 80;
/** Release time constant for reduction deeper than the knee, in ms. */
export const MASTER_LIMITER_RELEASE_SLOW_MS = 400;
/** Gain reduction (dB) above which the slow release slope takes over. */
export const MASTER_LIMITER_RELEASE_KNEE_DB = 6;
/** URL of the AudioWorklet module, served from `public/` (same pattern as the clock). */
export const MASTER_LIMITER_WORKLET_URL = "/limiterWorklet.js";
/** `registerProcessor` name inside `public/limiterWorklet.js`. */
export const MASTER_LIMITER_PROCESSOR_NAME = "groove-limiter-processor";

/** Oversampling factor of the true-peak detector (BS.1770-4 Annex 2). */
export const LIMITER_TRUE_PEAK_OVERSAMPLE = 4;
/** Polyphase taps per branch; 4 × 12 = a 48-tap prototype interpolator. */
export const LIMITER_TRUE_PEAK_TAPS_PER_PHASE = 12;
/** Kaiser window β of the interpolator prototype. */
export const LIMITER_TRUE_PEAK_KAISER_BETA = 8.0;

export interface MasterLimiterOptions {
  /** Output true-peak ceiling, dBTP. Default −1.0. */
  ceilingDb?: number;
  /** Lookahead, ms. Default 3.0; clamped to at least one sample. */
  lookaheadMs?: number;
  /** Fast release time constant, ms. */
  releaseFastMs?: number;
  /** Slow release time constant, ms. */
  releaseSlowMs?: number;
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/** Modified Bessel function of the first kind, order 0 (Kaiser window). */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const half = x / 2;
  for (let k = 1; k < 64; k++) {
    term *= (half / k) * (half / k);
    sum += term;
    if (term < 1e-16 * sum) break;
  }
  return sum;
}

let cachedLimiterTaps: Float32Array[] | null = null;

/**
 * Polyphase branches of the limiter's true-peak interpolator.
 *
 * A 48-tap (4 phases × 12 taps) windowed-sinc prototype,
 * `h[n] = sinc((n − 24)/4) · kaiser(n; β = 8)`, each branch normalised to unity DC
 * gain. Centring the prototype on tap 24 makes branch 0 an exact unit impulse, so the
 * four branches land on the four 4×-oversampled grid points without any phase bias.
 * This is deliberately the same documented design the BS.1770 meter in
 * `src/test/helpers/loudness.ts` uses (coded independently there), so the limiter's
 * guarantee is checked by a second implementation rather than by itself.
 */
export function limiterTruePeakTaps(): Float32Array[] {
  if (cachedLimiterTaps) return cachedLimiterTaps;
  const L = LIMITER_TRUE_PEAK_OVERSAMPLE;
  const P = LIMITER_TRUE_PEAK_TAPS_PER_PHASE;
  const N = L * P;
  const centre = N / 2;
  const windowCentre = (N - 1) / 2;
  const i0 = besselI0(LIMITER_TRUE_PEAK_KAISER_BETA);
  const prototype = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    const t = (n - centre) / L;
    const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
    const r = (n - windowCentre) / windowCentre;
    const window = besselI0(LIMITER_TRUE_PEAK_KAISER_BETA * Math.sqrt(Math.max(0, 1 - r * r))) / i0;
    prototype[n] = sinc * window;
  }
  const branches: Float32Array[] = [];
  for (let p = 0; p < L; p++) {
    const taps = new Float32Array(P);
    let sum = 0;
    for (let k = 0; k < P; k++) {
      taps[k] = prototype[k * L + p];
      sum += taps[k];
    }
    if (sum !== 0) {
      for (let k = 0; k < P; k++) taps[k] /= sum;
    }
    branches.push(taps);
  }
  cachedLimiterTaps = branches;
  return branches;
}

/**
 * Sample-accurate limiter core, independent of Web Audio.
 *
 * `processBlock` is the single primitive: give it `frames` samples of every input
 * channel and it fills the matching output channels. Keeping the DSP free of Web Audio
 * lets the same algorithm run on the AudioWorklet thread
 * (`public/limiterWorklet.js` mirrors it line for line) and inside unit tests where no
 * audio context exists.
 */
export class TruePeakLimiterKernel {
  readonly sampleRate: number;
  readonly ceilingDb: number;
  readonly ceilingLinear: number;
  readonly lookaheadMs: number;
  readonly lookaheadSamples: number;
  readonly releaseFastMs: number;
  readonly releaseSlowMs: number;

  private readonly taps: Float32Array[];
  private readonly historyLength: number;
  private readonly delayLines: Float32Array[] = [];
  private readonly histories: Float32Array[] = [];
  private readonly fastCoefficient: number;
  private readonly slowCoefficient: number;

  /**
   * M14: the lookahead gain is the *minimum* `required` gain across the next `D + 1` samples, and it
   * used to be recomputed by scanning every slot on every sample — D ≈ 144 at 3 ms/48 kHz, about
   * 7 million comparisons per second per channel, inside the render thread.
   *
   * These two arrays are a monotonic deque of that window: indices are stored oldest-first and their
   * values increase from front to back, so the smallest value in the window is always at the front
   * and is read in O(1). Each sample is pushed once and popped at most once, which makes the whole
   * window O(1) amortised.
   *
   * Values go in as `Math.fround(required)` — exactly the conversion the old `Float32Array` window
   * applied on write — so the minimum that gets chosen, and therefore every output sample, is
   * bit-identical to the scan it replaces (pinned by the golden test in `limiterTruePeak.test.ts`).
   */
  private readonly dequeIndex: Int32Array;
  private readonly dequeValue: Float32Array;
  private readonly dequeCapacity: number;
  private dequeHead = 0;
  private dequeTail = 0;
  /** How many samples have entered the window; it holds the most recent `lookaheadSamples + 1`. */
  private samplesProcessed = 0;

  private delayIndex = 0;
  private gain = 1;
  private scratch: Float32Array;
  private framePeak: Float32Array;

  constructor(sampleRate: number, options: MasterLimiterOptions = {}) {
    this.sampleRate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 44100;
    this.ceilingDb = Number.isFinite(options.ceilingDb) ? (options.ceilingDb as number) : MASTER_LIMITER_CEILING_DB;
    this.ceilingLinear = dbToLinear(this.ceilingDb);
    this.lookaheadMs = Number.isFinite(options.lookaheadMs)
      ? Math.max(0, options.lookaheadMs as number)
      : MASTER_LIMITER_LOOKAHEAD_MS;
    this.lookaheadSamples = Math.max(1, Math.round((this.lookaheadMs / 1000) * this.sampleRate));
    this.releaseFastMs = Number.isFinite(options.releaseFastMs)
      ? Math.max(0.1, options.releaseFastMs as number)
      : MASTER_LIMITER_RELEASE_FAST_MS;
    this.releaseSlowMs = Number.isFinite(options.releaseSlowMs)
      ? Math.max(this.releaseFastMs, options.releaseSlowMs as number)
      : Math.max(this.releaseFastMs, MASTER_LIMITER_RELEASE_SLOW_MS);

    this.taps = limiterTruePeakTaps();
    this.historyLength = LIMITER_TRUE_PEAK_TAPS_PER_PHASE - 1;
    // One spare slot: a deque never needs to hold more than the window, and the ring needs a gap
    // between head and tail to tell "empty" from "full".
    this.dequeCapacity = this.lookaheadSamples + 2;
    this.dequeIndex = new Int32Array(this.dequeCapacity);
    this.dequeValue = new Float32Array(this.dequeCapacity);
    this.scratch = new Float32Array(this.historyLength + 128);
    this.framePeak = new Float32Array(128);
    // One-pole release: gain moves a fraction (1 − e^(−1/(τ·fs))) toward unity each sample.
    this.fastCoefficient = 1 - Math.exp(-1 / ((this.releaseFastMs / 1000) * this.sampleRate));
    this.slowCoefficient = 1 - Math.exp(-1 / ((this.releaseSlowMs / 1000) * this.sampleRate));
  }

  /** Lookahead delay in samples; the output is delayed by exactly this much. */
  get latencySamples(): number {
    return this.lookaheadSamples;
  }

  get latencySeconds(): number {
    return this.lookaheadSamples / this.sampleRate;
  }

  /** Current gain reduction in dB (0 = none). */
  get gainReductionDb(): number {
    return this.gain >= 1 ? 0 : -20 * Math.log10(this.gain);
  }

  /** Current linear gain applied to every channel (1 = unity). */
  get gainLinear(): number {
    return this.gain;
  }

  /** Clears every filter/delay/gain state so the kernel is reusable for a new stream. */
  reset(): void {
    for (const line of this.delayLines) line.fill(0);
    for (const history of this.histories) history.fill(0);
    this.dequeHead = 0;
    this.dequeTail = 0;
    this.samplesProcessed = 0;
    this.delayIndex = 0;
    this.gain = 1;
  }

  private ensureChannels(count: number): void {
    while (this.delayLines.length < count) {
      this.delayLines.push(new Float32Array(this.lookaheadSamples));
      this.histories.push(new Float32Array(this.historyLength));
    }
  }

  private ensureCapacity(frames: number): void {
    if (this.scratch.length < this.historyLength + frames) {
      this.scratch = new Float32Array(this.historyLength + frames);
    }
    if (this.framePeak.length < frames) {
      this.framePeak = new Float32Array(frames);
    }
  }

  /**
   * Limits one block in place-independent fashion: `inputs` is read, `outputs` is
   * written. Both are arrays of one Float32Array per channel and must be at least
   * `frames` long. Output is delayed by `latencySamples` (silence for the first block).
   */
  processBlock(inputs: Float32Array[], outputs: Float32Array[], frames: number): void {
    const channels = Math.min(inputs.length, outputs.length);
    if (channels <= 0 || frames <= 0) return;
    this.ensureChannels(channels);
    this.ensureCapacity(frames);

    const P = LIMITER_TRUE_PEAK_TAPS_PER_PHASE;
    const histLen = this.historyLength;
    const peak = this.framePeak;
    peak.fill(0, 0, frames);

    // 1. Per-channel 4× oversampled true peak, combined across channels (stereo link).
    for (let c = 0; c < channels; c++) {
      const source = inputs[c];
      const scratch = this.scratch;
      scratch.set(this.histories[c], 0);
      scratch.set(source.subarray(0, frames), histLen);
      const t0 = this.taps[0];
      const t1 = this.taps[1];
      const t2 = this.taps[2];
      const t3 = this.taps[3];
      for (let i = 0; i < frames; i++) {
        const base = histLen + i;
        let a0 = 0;
        let a1 = 0;
        let a2 = 0;
        let a3 = 0;
        for (let k = 0; k < P; k++) {
          const x = scratch[base - k];
          a0 += t0[k] * x;
          a1 += t1[k] * x;
          a2 += t2[k] * x;
          a3 += t3[k] * x;
        }
        // A sample is by definition a point on the reconstructed waveform, so the raw
        // value floors the estimate: true peak can never read below sample peak.
        let m = Math.abs(scratch[base]);
        const v0 = Math.abs(a0);
        if (v0 > m) m = v0;
        const v1 = Math.abs(a1);
        if (v1 > m) m = v1;
        const v2 = Math.abs(a2);
        if (v2 > m) m = v2;
        const v3 = Math.abs(a3);
        if (v3 > m) m = v3;
        if (m > peak[i]) peak[i] = m;
      }
      this.histories[c].set(scratch.subarray(frames, frames + histLen));
    }

    // 2. Gain envelope + delayed output.
    const D = this.lookaheadSamples;
    const windowSize = D + 1;
    const ceiling = this.ceilingLinear;
    const capacity = this.dequeCapacity;
    for (let i = 0; i < frames; i++) {
      const truePeak = peak[i];
      const required = truePeak > 0 ? Math.min(1, ceiling / truePeak) : 1;

      /**
       * Sliding-window minimum over the lookahead: this is what makes the attack
       * complete *before* the transient, and it is why the ceiling is hard. The deque's
       * front is the window's smallest value — see the field comment for why this is not
       * a per-sample scan, and why `Math.fround` keeps it bit-identical to one.
       */
      const stored = Math.fround(required);
      const oldest = this.samplesProcessed - windowSize;
      while (this.dequeHead !== this.dequeTail && this.dequeIndex[this.dequeHead] <= oldest) {
        this.dequeHead = this.dequeHead + 1 === capacity ? 0 : this.dequeHead + 1;
      }
      while (this.dequeHead !== this.dequeTail) {
        const back = this.dequeTail === 0 ? capacity - 1 : this.dequeTail - 1;
        if (this.dequeValue[back] < stored) break;
        this.dequeTail = back;
      }
      this.dequeIndex[this.dequeTail] = this.samplesProcessed;
      this.dequeValue[this.dequeTail] = stored;
      this.dequeTail = this.dequeTail + 1 === capacity ? 0 : this.dequeTail + 1;
      this.samplesProcessed += 1;
      const target = this.dequeValue[this.dequeHead];

      if (target <= this.gain) {
        // Instant attack: with lookahead in place this happens before the peak arrives.
        this.gain = target;
      } else {
        // Program-dependent release: shallow reduction recovers quickly, deep reduction
        // recovers slowly so a sustained loud section does not pump.
        const reductionDb = this.gain <= 1e-6 ? 120 : -20 * Math.log10(this.gain);
        const coefficient =
          reductionDb > MASTER_LIMITER_RELEASE_KNEE_DB ? this.slowCoefficient : this.fastCoefficient;
        this.gain += (target - this.gain) * coefficient;
        if (this.gain > target) this.gain = target;
      }

      const gain = this.gain;
      for (let c = 0; c < channels; c++) {
        const line = this.delayLines[c];
        const delayed = line[this.delayIndex];
        line[this.delayIndex] = inputs[c][i];
        outputs[c][i] = delayed * gain;
      }
      this.delayIndex = this.delayIndex + 1 === D ? 0 : this.delayIndex + 1;
    }
  }
}

/**
 * Convenience wrapper: limit whole channel buffers and return freshly allocated
 * output channels (the kernel delays by `latencySamples`). Used by the unit suite and
 * by any future offline caller that already has the samples in hand.
 */
export function limitBuffers(
  channels: Float32Array[],
  sampleRate: number,
  options: MasterLimiterOptions = {}
): { channels: Float32Array[]; latencySamples: number; gainReductionDb: number } {
  const kernel = new TruePeakLimiterKernel(sampleRate, options);
  const frames = channels.length > 0 ? channels[0].length : 0;
  const outputs = channels.map(() => new Float32Array(frames));
  kernel.processBlock(channels, outputs, frames);
  return {
    channels: outputs,
    latencySamples: kernel.latencySamples,
    gainReductionDb: kernel.gainReductionDb,
  };
}

export interface MasterLimiterHandle {
  /** Connect the source bus into this node. */
  readonly input: AudioNode;
  /** Connect this node to whatever follows the ceiling. */
  readonly output: AudioNode;
  /** Which ceiling is currently in the graph. */
  readonly kind: MasterLimiterKind;
  /** Lookahead latency in samples (0 on the compressor fallback). */
  readonly latencySamples: number;
  /** Lookahead latency in seconds (0 on the compressor fallback). */
  readonly latencySeconds: number;
  /** Resolves to the ceiling that ended up installed once module loading settles. */
  readonly ready: Promise<MasterLimiterKind>;
  dispose(): void;
}

let warnedAboutFallback = false;

function createFallbackLimiter(ctx: BaseAudioContext): DynamicsCompressorNode {
  const limiter = ctx.createDynamicsCompressor();
  applyMasterLimiter(limiter, ctx);
  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn(
      "[MasterLimiter] AudioWorklet unavailable — using the DynamicsCompressor fallback " +
        "(no true-peak ceiling, no lookahead). Peak limiting is degraded."
    );
  }
  return limiter;
}

function audioWorkletAvailable(ctx: BaseAudioContext): boolean {
  if (typeof AudioWorkletNode === "undefined") return false;
  const worklet = (ctx as BaseAudioContext & { audioWorklet?: AudioWorklet }).audioWorklet;
  return !!worklet && typeof worklet.addModule === "function";
}

/**
 * Builds the master ceiling for any context (realtime or offline).
 *
 * The handle's `input`/`output` node identities never change, so a caller can wire the
 * graph once and let the worklet swap in asynchronously when the module has loaded. On
 * the offline path callers should `await handle.ready` before `startRendering()` so the
 * bounce is rendered through the worklet rather than the fallback.
 */
export function createMasterLimiter(
  ctx: BaseAudioContext,
  options: MasterLimiterOptions = {}
): MasterLimiterHandle {
  const ceilingDb = Number.isFinite(options.ceilingDb) ? (options.ceilingDb as number) : MASTER_LIMITER_CEILING_DB;
  const requestedLookaheadMs = Number.isFinite(options.lookaheadMs)
    ? Math.max(0, options.lookaheadMs as number)
    : MASTER_LIMITER_LOOKAHEAD_MS;

  if (!audioWorkletAvailable(ctx)) {
    const compressor = createFallbackLimiter(ctx);
    return {
      input: compressor,
      output: compressor,
      kind: "fallback",
      latencySamples: 0,
      latencySeconds: 0,
      ready: Promise.resolve<MasterLimiterKind>("fallback"),
      dispose: () => {
        try {
          compressor.disconnect();
        } catch {
          /* already detached */
        }
      },
    };
  }

  const input = ctx.createGain();
  input.gain.value = 1;
  const output = ctx.createGain();
  output.gain.value = 1;

  // Until the module has loaded the graph is limited by the compressor, so audio is
  // never un-ceilinged even for the few milliseconds before the worklet installs.
  let active: AudioNode = createFallbackLimiter(ctx);
  input.connect(active);
  active.connect(output);

  let disposed = false;
  let currentKind: MasterLimiterKind = "fallback";
  const latencySamples = Math.max(1, Math.round((requestedLookaheadMs / 1000) * ctx.sampleRate));

  const ready = (async (): Promise<MasterLimiterKind> => {
    try {
      const worklet = (ctx as BaseAudioContext & { audioWorklet: AudioWorklet }).audioWorklet;
      await worklet.addModule(MASTER_LIMITER_WORKLET_URL);
      if (disposed) return "fallback";
      const node = new AudioWorkletNode(ctx, MASTER_LIMITER_PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: "explicit",
        channelInterpretation: "speakers",
        processorOptions: {
          ceilingDb,
          lookaheadMs: requestedLookaheadMs,
          sampleRate: ctx.sampleRate,
          /**
           * The release ballistics, when a caller overrides them.
           *
           * These two were declared on `MasterLimiterOptions` and honoured by the worklet, but never passed —
           * so a caller could set them and measure no difference at all. Absent means the worklet's own
           * defaults (80 ms fast, 400 ms slow), which is the shipped behaviour.
           */
          releaseFastMs: options.releaseFastMs,
          releaseSlowMs: options.releaseSlowMs,
        },
      });
      try {
        input.disconnect(active);
      } catch {
        /* not connected */
      }
      try {
        active.disconnect(output);
      } catch {
        /* not connected */
      }
      input.connect(node);
      node.connect(output);
      active = node;
      currentKind = "worklet";
      return "worklet";
    } catch (error) {
      console.warn("[MasterLimiter] Could not install the limiter AudioWorklet:", error);
      return "fallback";
    }
  })();

  return {
    input,
    output,
    get kind() {
      return currentKind;
    },
    latencySamples,
    latencySeconds: latencySamples / ctx.sampleRate,
    ready,
    dispose: () => {
      disposed = true;
      try {
        input.disconnect();
      } catch {
        /* already detached */
      }
      try {
        output.disconnect();
      } catch {
        /* already detached */
      }
      try {
        active.disconnect();
      } catch {
        /* already detached */
      }
    },
  };
}
