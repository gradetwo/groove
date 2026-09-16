/**
 * Acoustic Test Signal Generator for Panoramic Analyzer (P6-05)
 *
 * Generates pure Web Audio reference signals:
 * 1. 20Hz - 20kHz Frequency Sweep (Sine chirp)
 * 2. 808 Sub-Bass Resonance (45Hz + 2nd & 3rd harmonics)
 * 3. Stereo Chorus Modulation (Wide stereophonic pad)
 * 4. 180° Anti-Phase Inverted Waveform (Mono cancellation demonstrator)
 * 5. Pink Noise (1/f acoustic reference)
 * 6. White Noise (Flat stochastic energy)
 *
 * V-01 scope: this is a UI reference-signal generator, not a pattern render path.
 * `Math.random()` is correct here — a noise reference must be aperiodic — and none of
 * these signals reach `WavExporter`, so render determinism is unaffected. Pattern
 * noise (drums, risers) comes from the seeded generator in `noise.ts` instead.
 */

export type TestSignalType =
  | "sweep"
  | "sub_808"
  | "stereo_chorus"
  | "anti_phase"
  | "pink_noise"
  | "white_noise";

export class AnalyzerSignalGenerator {
  private ctx: AudioContext | null = null;
  private outputNode: GainNode | null = null;
  private activeNodes: Array<{ stop?: () => void; disconnect: () => void }> = [];
  private currentType: TestSignalType | null = null;
  private isPlaying: boolean = false;

  constructor(sharedContext?: AudioContext | null) {
    if (sharedContext) {
      this.ctx = sharedContext;
    }
  }

  private initContext(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      const AudioCtx =
        (typeof window !== "undefined" && (window.AudioContext || (window as any).webkitAudioContext)) ||
        class MockAudioCtx {
          state = "running";
          currentTime = 0;
          sampleRate = 44100;
          createGain() {
            return {
              gain: { setValueAtTime: () => {} },
              connect: () => {},
              disconnect: () => {},
            };
          }
          createAnalyser() {
            return {
              fftSize: 2048,
              frequencyBinCount: 1024,
              smoothingTimeConstant: 0.8,
              connect: () => {},
              disconnect: () => {},
              getByteFrequencyData: () => {},
              getFloatTimeDomainData: () => {},
            };
          }
          createOscillator() {
            return {
              type: "sine",
              frequency: {
                setValueAtTime: () => {},
                exponentialRampToValueAtTime: () => {},
                cancelScheduledValues: () => {},
              },
              connect: () => {},
              start: () => {},
              stop: () => {},
              disconnect: () => {},
            };
          }
          createBiquadFilter() {
            return {
              type: "lowpass",
              frequency: { setValueAtTime: () => {} },
              connect: () => {},
              disconnect: () => {},
            };
          }
          createChannelMerger() {
            return { connect: () => {}, disconnect: () => {} };
          }
          createBuffer() {
            return { getChannelData: () => new Float32Array(1024) };
          }
          createBufferSource() {
            return {
              buffer: null,
              loop: false,
              connect: () => {},
              start: () => {},
              stop: () => {},
              disconnect: () => {},
            };
          }
          resume() {
            return Promise.resolve();
          }
          destination = {};
        };
      this.ctx = new (AudioCtx as any)();
    }
    if (this.ctx && this.ctx.state === "suspended" && typeof this.ctx.resume === "function") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx!;
  }

  public connect(dest: AudioNode): void {
    const ctx = this.initContext();
    if (!this.outputNode) {
      this.outputNode = ctx.createGain();
      this.outputNode.gain.setValueAtTime(0.5, ctx.currentTime);
    }
    this.outputNode.connect(dest);
  }

  public getOutputNode(): GainNode {
    const ctx = this.initContext();
    if (!this.outputNode) {
      this.outputNode = ctx.createGain();
      this.outputNode.gain.setValueAtTime(0.5, ctx.currentTime);
    }
    return this.outputNode;
  }

  public getAudioContext(): AudioContext {
    return this.initContext();
  }

  public getCurrentType(): TestSignalType | null {
    return this.isPlaying ? this.currentType : null;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public stop(): void {
    this.activeNodes.forEach((n) => {
      try {
        if (n.stop) n.stop();
        n.disconnect();
      } catch {}
    });
    this.activeNodes = [];
    this.isPlaying = false;
    this.currentType = null;
  }

  public playSignal(type: TestSignalType): void {
    this.stop();
    const ctx = this.initContext();
    const out = this.getOutputNode();
    const now = ctx.currentTime;

    this.currentType = type;
    this.isPlaying = true;

    switch (type) {
      case "sweep": {
        // Continuous logarithmic frequency sweep: 20Hz -> 20,000Hz over 6 seconds
        const osc = ctx.createOscillator();
        const sweepGain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(20, now);
        // Exponential ramp across 6 seconds
        osc.frequency.exponentialRampToValueAtTime(20000, now + 6);

        sweepGain.gain.setValueAtTime(0.4, now);
        osc.connect(sweepGain);
        sweepGain.connect(out);

        osc.start(now);
        this.activeNodes.push(osc, sweepGain);

        // Loop automatically
        const loopTimer = setInterval(() => {
          if (!this.isPlaying || this.currentType !== "sweep") {
            clearInterval(loopTimer);
            return;
          }
          const t = ctx.currentTime;
          osc.frequency.cancelScheduledValues(t);
          osc.frequency.setValueAtTime(20, t);
          osc.frequency.exponentialRampToValueAtTime(20000, t + 6);
        }, 6100);
        break;
      }

      case "sub_808": {
        // Deep 808 Sub Kick Fundamental (45 Hz) + 2nd harmonic (90 Hz) + 3rd harmonic (135 Hz)
        const f0 = ctx.createOscillator();
        const f1 = ctx.createOscillator();
        const f0Gain = ctx.createGain();
        const f1Gain = ctx.createGain();

        f0.type = "sine";
        f0.frequency.setValueAtTime(45, now);
        f0Gain.gain.setValueAtTime(0.65, now);

        f1.type = "triangle";
        f1.frequency.setValueAtTime(90, now);
        f1Gain.gain.setValueAtTime(0.2, now);

        f0.connect(f0Gain);
        f1.connect(f1Gain);
        f0Gain.connect(out);
        f1Gain.connect(out);

        f0.start(now);
        f1.start(now);
        this.activeNodes.push(f0, f1, f0Gain, f1Gain);
        break;
      }

      case "stereo_chorus": {
        // Wide Stereophonic Pad with 90° Phase-Shifted Dual Oscillators
        const oscL = ctx.createOscillator();
        const oscR = ctx.createOscillator();
        const merger = ctx.createChannelMerger(2);
        const padGain = ctx.createGain();

        oscL.type = "sawtooth";
        oscL.frequency.setValueAtTime(220, now); // A3

        oscR.type = "sawtooth";
        oscR.frequency.setValueAtTime(221.5, now); // Slightly detuned for chorusing stereo spread

        // Filter to make lush
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1400, now);

        oscL.connect(merger, 0, 0); // Left channel
        oscR.connect(merger, 0, 1); // Right channel

        merger.connect(filter);
        filter.connect(padGain);
        padGain.gain.setValueAtTime(0.35, now);
        padGain.connect(out);

        oscL.start(now);
        oscR.start(now);
        this.activeNodes.push(oscL, oscR, merger, filter, padGain);
        break;
      }

      case "anti_phase": {
        // 180-Degree Anti-Phase Signal (Left = +Sine, Right = -Sine)
        // This is pure cancellation when folded to mono (r = -1.0)!
        const osc = ctx.createOscillator();
        const gainL = ctx.createGain();
        const gainR = ctx.createGain();
        const merger = ctx.createChannelMerger(2);

        osc.type = "sine";
        osc.frequency.setValueAtTime(300, now); // 300 Hz test tone

        gainL.gain.setValueAtTime(0.4, now); // +1.0
        gainR.gain.setValueAtTime(-0.4, now); // -1.0 (Inverted phase)

        osc.connect(gainL);
        osc.connect(gainR);
        gainL.connect(merger, 0, 0);
        gainR.connect(merger, 0, 1);
        merger.connect(out);

        osc.start(now);
        this.activeNodes.push(osc, gainL, gainR, merger);
        break;
      }

      case "pink_noise": {
        // Pink noise buffer with 1/f spectral density (-3dB / octave)
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);

        // Paul Kellet's filter method for pink noise
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
          b6 = white * 0.115926;
        }

        const whiteNode = ctx.createBufferSource();
        whiteNode.buffer = noiseBuffer;
        whiteNode.loop = true;

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.35, now);

        whiteNode.connect(noiseGain);
        noiseGain.connect(out);
        whiteNode.start(now);
        this.activeNodes.push(whiteNode, noiseGain);
        break;
      }

      case "white_noise": {
        // Flat white noise
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = (Math.random() * 2 - 1) * 0.2;
        }

        const whiteNode = ctx.createBufferSource();
        whiteNode.buffer = noiseBuffer;
        whiteNode.loop = true;

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.3, now);

        whiteNode.connect(noiseGain);
        noiseGain.connect(out);
        whiteNode.start(now);
        this.activeNodes.push(whiteNode, noiseGain);
        break;
      }
    }
  }

  public destroy(): void {
    this.stop();
    if (this.outputNode) {
      this.outputNode.disconnect();
      this.outputNode = null;
    }
    this.ctx = null;
  }
}
