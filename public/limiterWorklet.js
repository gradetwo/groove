/**
 * True-peak brickwall master limiter — AudioWorklet processor (E-12).
 *
 * This file is served verbatim from `public/` and loaded by
 * `src/audio/MasterLimiter.ts` via `audioWorklet.addModule("/limiterWorklet.js")`.
 * A worklet module cannot import from `src/**` (TypeScript is not served to the audio
 * thread, and `public/` assets are not bundled), so the DSP below is a deliberate,
 * line-for-line mirror of the `TruePeakLimiterKernel` class in
 * `src/audio/MasterLimiter.ts`. `src/test/limiterTruePeak.test.ts` evaluates this exact
 * file and asserts the two implementations are sample-identical, so the duplication
 * cannot silently drift.
 *
 * Keep the two in sync: same tap design (4 phases × 12 taps, Kaiser β = 8, per-branch
 * DC normalisation), same sliding-window-minimum lookahead, same program-dependent
 * one-pole release, same operation order (bit-identical arithmetic).
 */

const TRUE_PEAK_OVERSAMPLE = 4;
const TRUE_PEAK_TAPS_PER_PHASE = 12;
const TRUE_PEAK_KAISER_BETA = 8.0;
const RELEASE_KNEE_DB = 6;

function besselI0(x) {
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

let cachedTaps = null;

/** Polyphase branches of the 4× true-peak interpolator (48-tap prototype). */
function limiterTruePeakTaps() {
  if (cachedTaps) return cachedTaps;
  const L = TRUE_PEAK_OVERSAMPLE;
  const P = TRUE_PEAK_TAPS_PER_PHASE;
  const N = L * P;
  const centre = N / 2;
  const windowCentre = (N - 1) / 2;
  const i0 = besselI0(TRUE_PEAK_KAISER_BETA);
  const prototype = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    const t = (n - centre) / L;
    const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
    const r = (n - windowCentre) / windowCentre;
    const w = besselI0(TRUE_PEAK_KAISER_BETA * Math.sqrt(Math.max(0, 1 - r * r))) / i0;
    prototype[n] = sinc * w;
  }
  const branches = [];
  for (let p = 0; p < L; p++) {
    const taps = new Float32Array(P);
    let sum = 0;
    for (let k = 0; k < P; k++) {
      taps[k] = prototype[k * L + p];
      sum += taps[k];
    }
    if (sum !== 0) {
      for (let j = 0; j < P; j++) taps[j] /= sum;
    }
    branches.push(taps);
  }
  cachedTaps = branches;
  return cachedTaps;
}

function defaultSampleRate() {
  // `sampleRate` is a global in AudioWorkletGlobalScope.
  return typeof sampleRate === "number" && sampleRate > 0 ? sampleRate : 44100;
}

/**
 * Sample-accurate limiter core. Mirrors `TruePeakLimiterKernel` in
 * `src/audio/MasterLimiter.ts`.
 */
class TruePeakLimiterKernel {
  constructor(sampleRateValue, options) {
    options = options || {};
    this.sampleRate = Number.isFinite(sampleRateValue) && sampleRateValue > 0 ? sampleRateValue : 44100;
    this.ceilingDb = Number.isFinite(options.ceilingDb) ? options.ceilingDb : -1.0;
    this.ceilingLinear = Math.pow(10, this.ceilingDb / 20);
    this.lookaheadMs = Number.isFinite(options.lookaheadMs) ? Math.max(0, options.lookaheadMs) : 3.0;
    this.lookaheadSamples = Math.max(1, Math.round((this.lookaheadMs / 1000) * this.sampleRate));
    this.releaseFastMs = Number.isFinite(options.releaseFastMs) ? Math.max(0.1, options.releaseFastMs) : 80;
    this.releaseSlowMs = Number.isFinite(options.releaseSlowMs)
      ? Math.max(this.releaseFastMs, options.releaseSlowMs)
      : Math.max(this.releaseFastMs, 400);

    this.taps = limiterTruePeakTaps();
    this.historyLength = TRUE_PEAK_TAPS_PER_PHASE - 1;
    this.delayLines = [];
    this.histories = [];
    // M14: monotonic deque over the lookahead window (one spare slot, so head === tail means empty).
    this.dequeCapacity = this.lookaheadSamples + 2;
    this.dequeIndex = new Int32Array(this.dequeCapacity);
    this.dequeValue = new Float32Array(this.dequeCapacity);
    this.dequeHead = 0;
    this.dequeTail = 0;
    this.samplesProcessed = 0;
    this.delayIndex = 0;
    this.gain = 1;
    this.scratch = new Float32Array(this.historyLength + 128);
    this.framePeak = new Float32Array(128);
    this.fastCoefficient = 1 - Math.exp(-1 / ((this.releaseFastMs / 1000) * this.sampleRate));
    this.slowCoefficient = 1 - Math.exp(-1 / ((this.releaseSlowMs / 1000) * this.sampleRate));
  }

  reset() {
    for (let c = 0; c < this.delayLines.length; c++) this.delayLines[c].fill(0);
    for (let h = 0; h < this.histories.length; h++) this.histories[h].fill(0);
    this.dequeHead = 0;
    this.dequeTail = 0;
    this.samplesProcessed = 0;
    this.delayIndex = 0;
    this.gain = 1;
  }

  gainReductionDb() {
    return this.gain >= 1 ? 0 : -20 * Math.log10(this.gain);
  }

  ensureChannels(count) {
    while (this.delayLines.length < count) {
      this.delayLines.push(new Float32Array(this.lookaheadSamples));
      this.histories.push(new Float32Array(this.historyLength));
    }
  }

  ensureCapacity(frames) {
    if (this.scratch.length < this.historyLength + frames) {
      this.scratch = new Float32Array(this.historyLength + frames);
    }
    if (this.framePeak.length < frames) {
      this.framePeak = new Float32Array(frames);
    }
  }

  /**
   * `detector` is an optional second stream whose peak drives the gain — a **pre-duck** copy of the bus, so the
   * ceiling cannot respond to a dip the arrangement asked for. Its peak is ≥ the programme's (a duck attenuates), so
   * limiting on it stays conservative. Mirrors `TruePeakLimiterKernel.processBlock` in `src/audio/MasterLimiter.ts`.
   */
  processBlock(inputs, outputs, frames, detector) {
    const channels = Math.min(inputs.length, outputs.length);
    if (channels <= 0 || frames <= 0) return;
    this.ensureChannels(channels);
    this.ensureCapacity(frames);

    const P = TRUE_PEAK_TAPS_PER_PHASE;
    const histLen = this.historyLength;
    const peak = this.framePeak;
    peak.fill(0, 0, frames);
    const detectorChannels = detector && detector.length ? detector.length : 0;

    // 1. Per-channel 4× oversampled true peak, combined across channels (stereo link).
    for (let c = 0; c < channels; c++) {
      const source = detectorChannels ? detector[c % detectorChannels] : inputs[c];
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
    for (let n = 0; n < frames; n++) {
      const truePeak = peak[n];
      const required = truePeak > 0 ? Math.min(1, ceiling / truePeak) : 1;

      /**
       * Sliding-window minimum over the lookahead (M14): the deque's front is the window's
       * smallest value, so this is O(1) amortised instead of a scan of all D+1 slots per
       * sample. Values enter as `Math.fround`, which is exactly what storing them into the
       * old Float32Array window did, so the output is bit-identical — see the matching
       * comment on the field in `src/audio/MasterLimiter.ts`, and the golden test that
       * pins both implementations to the same samples.
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
        this.gain = target;
      } else {
        const reductionDb = this.gain <= 1e-6 ? 120 : -20 * Math.log10(this.gain);
        const coefficient = reductionDb > RELEASE_KNEE_DB ? this.slowCoefficient : this.fastCoefficient;
        this.gain += (target - this.gain) * coefficient;
        if (this.gain > target) this.gain = target;
      }

      const gain = this.gain;
      for (let ch = 0; ch < channels; ch++) {
        const line = this.delayLines[ch];
        const delayed = line[this.delayIndex];
        line[this.delayIndex] = inputs[ch][n];
        outputs[ch][n] = delayed * gain;
      }
      this.delayIndex = this.delayIndex + 1 === D ? 0 : this.delayIndex + 1;
    }
  }
}

/**
 * AudioWorklet host: one processor instance owns one limiter kernel.
 *
 * `processorOptions` carries the ceiling/lookahead so the node is configured before its
 * first render quantum; a `CONFIG` port message can re-create the kernel later.
 */
class GrooveLimiterProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    const processorOptions = (options && options.processorOptions) || {};
    this.kernelSampleRate = defaultSampleRate();
    this.kernel = new TruePeakLimiterKernel(this.kernelSampleRate, processorOptions);
    this.port.onmessage = (event) => {
      const data = event && event.data;
      if (!data || data.type !== "CONFIG") return;
      this.kernel = new TruePeakLimiterKernel(this.kernelSampleRate, data);
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const frames = output[0].length;
    if (!input || input.length === 0) {
      for (let c = 0; c < output.length; c++) output[c].fill(0);
      return true;
    }
    // Input 1 is the detector when something is connected to it (the pre-duck bus); input 0 is what gets limited.
    const detectorInput = inputs[1];
    const detector = detectorInput && detectorInput.length ? detectorInput : null;
    this.kernel.processBlock(input, output, frames, detector);
    return true;
  }
}

if (typeof registerProcessor === "function") {
  registerProcessor("groove-limiter-processor", GrooveLimiterProcessor);
}
