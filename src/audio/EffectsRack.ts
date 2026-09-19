/**
 * Professional DSP Effects Rack (P5-04)
 *
 * Implements analog-style studio processing:
 * 1. Resonant Biquad Filter (Lowpass / Highpass with Cutoff & Q)
 * 2. Tape Saturation (Tanh soft-clipping analog warmth)
 * 3. Stereo Chorus (Modulated dual-delay quadrature spatializer)
 * 4. Lo-Fi Bitcrusher (Mathematical quantization steps)
 */

export interface EffectsRackState {
  filterEnabled: boolean;
  filterType: BiquadFilterType;
  filterCutoff: number; // 20 - 20000 Hz
  filterQ: number;      // 0.5 - 15

  saturationEnabled: boolean;
  saturationDrive: number; // 1.0 (transparent) to 6.0 (driven)

  chorusEnabled: boolean;
  chorusMix: number;   // 0.0 - 1.0
  chorusRate: number;  // 0.2 - 5.0 Hz

  bitcrusherEnabled: boolean;
  bitDepth: number;    // 4 - 16 bits
}

/** Chorus modulation depth in seconds. Positive for the left tap, negated for the right. */
const CHORUS_DEPTH_SEC = 0.003;

export const DEFAULT_FX_STATE: EffectsRackState = {
  filterEnabled: false,
  filterType: "lowpass",
  filterCutoff: 16000,
  filterQ: 1.0,

  saturationEnabled: false,
  saturationDrive: 1.5,

  chorusEnabled: false,
  chorusMix: 0.35,
  chorusRate: 0.8,

  bitcrusherEnabled: false,
  bitDepth: 12,
};

/**
 * Q13: the largest input magnitude the saturation curve is defined for.
 *
 * A `WaveShaperNode` maps any input outside the curve's domain to the curve's **endpoint**, so
 * the old ±1 domain silently turned every sample above unity into a flat-topped hard clip — and
 * this rack sits *after* the 8-track sum and the master fader, which is precisely where peaks
 * above unity live. Sixteen shipped genres run DRIVE at 2.5–6.0, so those genres were being
 * hard-clipped on every kick transient, before the true-peak limiter ever saw them.
 *
 * Defining the table over ±2 fixes that while keeping the old behaviour exactly where it was
 * defined: the slope at the origin is still 1 and, because the curve is still evaluated at
 * `x / 1`, the value at x = ±1 is still `±tanh(k)/k` — the level every measured trim was fitted
 * against. Only the region that *used* to clip is different, and there it now saturates.
 */
export const SATURATION_INPUT_CEILING = 2;

/**
 * Generates a soft-clipping Tanh saturation curve for WaveShaperNode.
 *
 * The curve is normalised for **unity small-signal gain**: it is divided by
 * `k`, not by `tanh(k)`. Dividing by `tanh(k)` normalises the *endpoint* to
 * ±1 but leaves a slope-at-zero (small-signal gain) of `k / tanh(k)` — that is
 * +3.9 dB at the default drive of 1.5 and +15.6 dB at the maximum drive of 6,
 * which turned "analog warmth" into a large unrequested level jump. With
 * `tanh(k * x) / k` the slope at x = 0 is exactly 1, so engaging DRIVE adds
 * harmonic content and reduces peaks rather than adding loudness. The peak
 * magnitude is `tanh(k) / k <= 1` for every supported drive (k >= 1). This
 * deliberately changes the DRIVE sound/level; bypass (curve === null) is
 * unaffected.
 *
 * The table spans ±`SATURATION_INPUT_CEILING` rather than ±1 (see that constant for why);
 * `saturationCurveInputForIndex` is the inverse mapping, so tests can probe the curve at a
 * known input level instead of guessing an index.
 */
export function makeSaturationCurve(drive: number, samples = 2048): Float32Array {
  const curve = new Float32Array(samples);
  const k = Math.max(1, drive);
  for (let i = 0; i < samples; i++) {
    const x = ((i * 2) / samples - 1) * SATURATION_INPUT_CEILING;
    // Tanh soft saturation: unity slope at the centre, smoothly saturating at extremes
    curve[i] = Math.tanh(k * x) / k;
  }
  return curve;
}

/** Input level a given index of the saturation table is evaluated at. */
export function saturationCurveInputForIndex(index: number, samples = 2048): number {
  return ((index * 2) / samples - 1) * SATURATION_INPUT_CEILING;
}

/** Sizes the crusher table so the requested quantization is actually resolvable. */
function bitcrushTableSize(stepCount: number, requested: number): number {
  // x spans [-1, 1] and the quantizer has `stepCount` output steps, i.e.
  // 2 * stepCount quantization intervals each 1 / stepCount wide. A table of
  // 4 * stepCount entries puts two entries in every interval, so no requested
  // level is skipped, and the final entry rounds up to +full scale. The
  // historical fixed 2048-point table could not resolve more than ~10 bits,
  // which made the shipped 12-bit default — and every higher bit depth —
  // silently meaningless.
  return Math.max(requested, Math.ceil(stepCount * 4));
}

/**
 * Generates a Bitcrusher stepped quantization transfer curve.
 *
 * **Scope / known limitation:** this implements *amplitude quantization* only —
 * rounding the signal onto `2^bits` evenly spaced levels. A true bitcrusher
 * also performs *sample-rate decimation* (sample-and-hold downsampling), and a
 * `WaveShaperNode` fundamentally cannot do that: it is a memoryless transfer
 * function applied per input sample, with no way to hold a previous sample or
 * alter the effective sample rate. Decimation would require an AudioWorklet,
 * which this rack deliberately does not use. Only the amplitude half of the
 * effect exists here.
 *
 * `samples` is honoured as a **minimum** table size, not an exact one: the
 * table is enlarged when needed so the requested bit depth is actually
 * resolvable (see `bitcrushTableSize`).
 */
export function makeBitcrushCurve(bits: number, samples = 2048): Float32Array {
  const stepCount = Math.pow(2, Math.min(16, Math.max(3, bits)));
  const tableSize = bitcrushTableSize(stepCount, samples);
  const curve = new Float32Array(tableSize);
  for (let i = 0; i < tableSize; i++) {
    const x = (i * 2) / tableSize - 1;
    curve[i] = Math.round(x * stepCount) / stepCount;
  }
  return curve;
}

export class EffectsRack {
  private ctx: BaseAudioContext;
  public inputNode: GainNode;
  public outputNode: GainNode;

  // Filter
  private filterNode: BiquadFilterNode;

  // Tape Saturation
  private shaperNode: WaveShaperNode;

  // Bitcrusher
  private crusherNode: WaveShaperNode;

  // Stereo Chorus
  private chorusDry: GainNode;
  private chorusWet: GainNode;
  /**
   * Forces the wet branch to two channels before it is split.
   *
   * A `ChannelSplitterNode` hands a mono input to output 0 and *silence* to output 1, so an
   * all-centred mix would lose the right tap entirely without this up-mix.
   */
  private chorusStereo: GainNode;
  private chorusSplitter: ChannelSplitterNode | null = null;
  private chorusDelayL: DelayNode;
  private chorusDelayR: DelayNode;
  private chorusLfo: OscillatorNode | null = null;
  /** Anti-phase depth: `+depth` to the left tap, `-depth` to the right. */
  private chorusLfoGainL: GainNode | null = null;
  private chorusLfoGainR: GainNode | null = null;

  private state: EffectsRackState;

  constructor(ctx: BaseAudioContext, initialState: Partial<EffectsRackState> = {}) {
    this.ctx = ctx;
    this.state = { ...DEFAULT_FX_STATE, ...initialState };

    this.inputNode = ctx.createGain();
    this.outputNode = ctx.createGain();

    // 1. Filter
    this.filterNode = ctx.createBiquadFilter();
    this.filterNode.type = this.state.filterType;
    this.filterNode.frequency.value = this.state.filterCutoff;
    this.filterNode.Q.value = this.state.filterQ;

    // 2. Saturation
    this.shaperNode = ctx.createWaveShaper();
    this.shaperNode.oversample = "2x"; // Anti-aliasing
    this.updateSaturationCurve();

    // 3. Bitcrusher
    this.crusherNode = ctx.createWaveShaper();
    // The staircase transfer curve generates strong harmonics; oversample so
    // they are filtered down instead of folding back into the audible band.
    this.crusherNode.oversample = "4x";
    this.updateBitcrushCurve();

    // 4. Stereo Chorus
    this.chorusDry = ctx.createGain();
    this.chorusWet = ctx.createGain();
    this.chorusDelayL = ctx.createDelay();
    this.chorusDelayR = ctx.createDelay();
    this.chorusDelayL.delayTime.value = 0.015; // 15ms base
    this.chorusDelayR.delayTime.value = 0.022; // 22ms base

    // Assemble DSP Chain:
    // input -> (filter when enabled) -> saturation -> bitcrusher -> (dry/chorus) -> output
    // A BiquadFilterNode has no transparent type, so filter bypass is a true
    // re-route: when disabled the input feeds the saturation stage directly.
    this.updateFilterRouting();
    this.shaperNode.connect(this.crusherNode);

    /**
     * The wet taps carry their **own** channel.
     *
     * They used to be fed straight from `crusherNode` and merged back through a
     * `ChannelMergerNode`, whose inputs are one channel wide — so the merger down-mixed the stereo
     * bus and both taps carried the same mono sum. The wet signal lost the image it was supposed to
     * widen, and the only difference between the sides was the fixed 15/22 ms delay. Split first,
     * delay each side, then merge: left tap = channel 0, right tap = channel 1.
     */
    this.chorusStereo = ctx.createGain();
    this.chorusStereo.channelCount = 2;
    this.chorusStereo.channelCountMode = "explicit";
    this.chorusStereo.channelInterpretation = "speakers"; // mono in -> both sides, not one

    this.crusherNode.connect(this.chorusDry);
    this.chorusDry.connect(this.outputNode);

    if (typeof ctx.createChannelSplitter === "function") {
      try {
        this.chorusSplitter = ctx.createChannelSplitter(2);
        this.crusherNode.connect(this.chorusStereo);
        this.chorusStereo.connect(this.chorusSplitter);
        this.chorusSplitter.connect(this.chorusDelayL, 0, 0);
        this.chorusSplitter.connect(this.chorusDelayR, 1, 0);
      } catch {
        this.chorusSplitter = null;
        this.crusherNode.connect(this.chorusDelayL);
        this.crusherNode.connect(this.chorusDelayR);
      }
    } else {
      this.crusherNode.connect(this.chorusDelayL);
      this.crusherNode.connect(this.chorusDelayR);
    }
    if (typeof ctx.createChannelMerger === "function") {
      try {
        const merger = ctx.createChannelMerger(2);
        this.chorusDelayL.connect(merger, 0, 0); // Left
        this.chorusDelayR.connect(merger, 0, 1); // Right
        merger.connect(this.chorusWet);
      } catch {
        this.chorusDelayL.connect(this.chorusWet);
        this.chorusDelayR.connect(this.chorusWet);
      }
    } else {
      this.chorusDelayL.connect(this.chorusWet);
      this.chorusDelayR.connect(this.chorusWet);
    }
    this.chorusWet.connect(this.outputNode);

    this.updateChorusRouting();
    // The chorus LFO is created lazily (see `ensureChorusLfo`). Chorus defaults to off,
    // and an oscillator that runs forever to modulate a bypassed effect is pure waste —
    // it also put a stray oscillator into every offline render once the exporter started
    // using this rack (E-17), which is how the waste was noticed.
    if (this.state.chorusEnabled) this.ensureChorusLfo();
  }

  /**
   * Creates the chorus modulation LFO on first use.
   *
   * Idempotent: calling it when the LFO already exists is a no-op, so `setChorus(true)`
   * can call it unconditionally.
   */
  private ensureChorusLfo(): void {
    if (this.chorusLfo) return;
    if (typeof (this.ctx as any).createOscillator !== "function") return;
    try {
      const lfo = this.ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = this.state.chorusRate;

      // Anti-phase taps: the two sides move against each other instead of together, which is what
      // widens the image rather than only combing it (the Juno-style arrangement). Both bases are
      // far enough from zero that 3 ms of swing cannot drive a delay time negative.
      const depthL = this.ctx.createGain();
      const depthR = this.ctx.createGain();
      depthL.gain.value = CHORUS_DEPTH_SEC;
      depthR.gain.value = -CHORUS_DEPTH_SEC;

      lfo.connect(depthL);
      lfo.connect(depthR);
      depthL.connect(this.chorusDelayL.delayTime);
      depthR.connect(this.chorusDelayR.delayTime);
      lfo.start();
      this.chorusLfo = lfo;
      this.chorusLfoGainL = depthL;
      this.chorusLfoGainR = depthR;
    } catch {
      // OfflineAudioContext or test mock fallback: chorus simply stays unmodulated.
    }
  }

  /** Stops and releases the chorus LFO once chorus is switched off. */
  private releaseChorusLfo(): void {
    if (!this.chorusLfo) return;
    try {
      this.chorusLfo.stop();
      this.chorusLfo.disconnect();
    } catch {
      // Already stopped, or a mock that does not implement stop().
    }
    for (const gain of [this.chorusLfoGainL, this.chorusLfoGainR]) {
      try {
        gain?.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.chorusLfo = null;
    this.chorusLfoGainL = null;
    this.chorusLfoGainR = null;
  }

  /**
   * True filter bypass, implemented by re-routing rather than by parking the
   * filter at a "transparent" frequency. A BiquadFilterNode has no transparent
   * type, and a disabled bandpass/peaking/highshelf parked at 20 Hz is not
   * transparent, so the only correct bypass is to leave the filter out of the
   * signal path entirely. Both possible edges are torn down before the active
   * path is built, so repeated enable/disable cycles never leave a duplicate
   * (doubled-signal) path behind.
   */
  private updateFilterRouting(): void {
    this.inputNode.disconnect();
    this.filterNode.disconnect();
    if (this.state.filterEnabled) {
      this.inputNode.connect(this.filterNode);
      this.filterNode.connect(this.shaperNode);
    } else {
      this.inputNode.connect(this.shaperNode);
    }
  }

  private updateSaturationCurve(): void {
    if (this.state.saturationEnabled) {
      this.shaperNode.curve = makeSaturationCurve(this.state.saturationDrive) as any;
    } else {
      this.shaperNode.curve = null; // Linear bypass
    }
  }

  private updateBitcrushCurve(): void {
    if (this.state.bitcrusherEnabled) {
      this.crusherNode.curve = makeBitcrushCurve(this.state.bitDepth) as any;
    } else {
      this.crusherNode.curve = null; // Linear bypass
    }
  }

  private updateChorusRouting(): void {
    const wetMix = this.state.chorusEnabled ? this.state.chorusMix : 0;
    this.chorusDry.gain.value = 1.0 - wetMix * 0.4;
    this.chorusWet.gain.value = wetMix * 0.7;
  }

  public setFilter(enabled: boolean, cutoff: number, q: number, type: BiquadFilterType = "lowpass"): void {
    this.state.filterEnabled = enabled;
    this.state.filterCutoff = cutoff;
    this.state.filterQ = q;
    this.state.filterType = type;

    this.filterNode.type = type;
    this.filterNode.frequency.value = cutoff;
    this.filterNode.Q.value = q;
    this.updateFilterRouting();
  }

  public setSaturation(enabled: boolean, drive: number): void {
    this.state.saturationEnabled = enabled;
    this.state.saturationDrive = drive;
    this.updateSaturationCurve();
  }

  public setBitcrusher(enabled: boolean, bitDepth: number): void {
    this.state.bitcrusherEnabled = enabled;
    this.state.bitDepth = bitDepth;
    this.updateBitcrushCurve();
  }

  public setChorus(enabled: boolean, mix: number, rate = 0.8): void {
    this.state.chorusEnabled = enabled;
    this.state.chorusMix = mix;
    this.state.chorusRate = rate;
    if (this.state.chorusEnabled) {
      // Create on first enable, then just retune.
      this.ensureChorusLfo();
      if (this.chorusLfo) this.chorusLfo.frequency.value = rate;
    } else {
      // Nothing is being modulated, so nothing should be running.
      this.releaseChorusLfo();
    }
    this.updateChorusRouting();
  }

  public getState(): EffectsRackState {
    return { ...this.state };
  }

  public destroy(): void {
    this.releaseChorusLfo();
    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.filterNode.disconnect();
    this.shaperNode.disconnect();
    this.crusherNode.disconnect();
  }
}
