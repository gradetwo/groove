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
 * Generates a soft-clipping Tanh saturation curve for WaveShaperNode
 */
export function makeSaturationCurve(drive: number, samples = 2048): Float32Array {
  const curve = new Float32Array(samples);
  const k = Math.max(1, drive);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    // Tanh soft saturation: linear near center, smoothly saturating at extremes
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

/**
 * Generates a Bitcrusher stepped quantization transfer curve
 */
export function makeBitcrushCurve(bits: number, samples = 2048): Float32Array {
  const curve = new Float32Array(samples);
  const stepCount = Math.pow(2, Math.min(16, Math.max(3, bits)));
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
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
  private chorusDelayL: DelayNode;
  private chorusDelayR: DelayNode;
  private chorusLfo: OscillatorNode | null = null;
  private chorusLfoGain: GainNode | null = null;

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
    this.updateBitcrushCurve();

    // 4. Stereo Chorus
    this.chorusDry = ctx.createGain();
    this.chorusWet = ctx.createGain();
    this.chorusDelayL = ctx.createDelay();
    this.chorusDelayR = ctx.createDelay();
    this.chorusDelayL.delayTime.value = 0.015; // 15ms base
    this.chorusDelayR.delayTime.value = 0.022; // 22ms base

    // Assemble DSP Chain:
    // input -> filter -> saturation -> bitcrusher -> (dry/chorus) -> output
    this.inputNode.connect(this.filterNode);
    this.filterNode.connect(this.shaperNode);
    this.shaperNode.connect(this.crusherNode);

    // Chorus routing
    this.crusherNode.connect(this.chorusDry);
    this.chorusDry.connect(this.outputNode);

    this.crusherNode.connect(this.chorusDelayL);
    this.crusherNode.connect(this.chorusDelayR);
    this.chorusDelayL.connect(this.chorusWet);
    this.chorusDelayR.connect(this.chorusWet);
    this.chorusWet.connect(this.outputNode);

    this.updateChorusRouting();
    this.initLfoIfRealContext();
  }

  private initLfoIfRealContext(): void {
    if (typeof (this.ctx as any).createOscillator !== "function") return;
    try {
      this.chorusLfo = this.ctx.createOscillator();
      this.chorusLfoGain = this.ctx.createGain();
      this.chorusLfo.type = "sine";
      this.chorusLfo.frequency.value = this.state.chorusRate;
      this.chorusLfoGain.gain.value = 0.003; // 3ms modulation depth

      this.chorusLfo.connect(this.chorusLfoGain);
      this.chorusLfoGain.connect(this.chorusDelayL.delayTime);
      this.chorusLfoGain.connect(this.chorusDelayR.delayTime);
      this.chorusLfo.start();
    } catch {
      // OfflineAudioContext or test mock fallback
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
    this.filterNode.frequency.value = enabled ? cutoff : (type === "lowpass" ? 20000 : 20);
    this.filterNode.Q.value = q;
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
    if (this.chorusLfo) {
      this.chorusLfo.frequency.value = rate;
    }
    this.updateChorusRouting();
  }

  public getState(): EffectsRackState {
    return { ...this.state };
  }

  public destroy(): void {
    if (this.chorusLfo) {
      try {
        this.chorusLfo.stop();
        this.chorusLfo.disconnect();
      } catch {}
      this.chorusLfo = null;
    }
    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.filterNode.disconnect();
    this.shaperNode.disconnect();
    this.crusherNode.disconnect();
  }
}
