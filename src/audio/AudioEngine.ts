/**
 * Web Audio Synthetic Engine for Groove Studio
 * Pure native Web Audio API synthesizer. Zero sample downloads, zero external latency.
 * Implements sample-accurate lookahead scheduling with swing and track solo/mute/pan.
 */

import { SequencerPattern, SequencerTrack } from "../types/genre";

export interface StepCallbackInfo {
  step: number;
  time: number;
}

export interface AudioEngineOptions {
  onStep?: (info: StepCallbackInfo) => void;
  onStop?: () => void;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isRunning: boolean = false;
  private isPlaying: boolean = false;

  // Scheduler state
  private bpm: number = 120;
  private swing: number = 0; // 0 to 0.75
  private currentStep: number = 0;
  private nextStepTime: number = 0;
  private scheduleTimerId: any = null;
  private stepTimers: Set<any> = new Set();

  private lookaheadMs: number = 25; // How frequently to call scheduler (ms)
  private scheduleAheadSec: number = 0.1; // How far ahead to schedule audio (sec)

  // Pattern data
  private pattern: SequencerPattern | null = null;
  private trackStates: Array<{
    mute: boolean;
    solo: boolean;
    volume: number;
    pan: number;
  }> = [];

  // Callbacks
  private onStepCallback?: (info: StepCallbackInfo) => void;
  private onStopCallback?: () => void;

  // Noise buffers cache
  private noiseBuffer: AudioBuffer | null = null;

  constructor(options?: AudioEngineOptions) {
    if (options?.onStep) this.onStepCallback = options.onStep;
    if (options?.onStop) this.onStopCallback = options.onStop;
    this.initAudioContext();
  }

  /**
   * Initializes AudioContext safely (supports lazy activation on iOS / Safari)
   */
  public initAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;

    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
        this.createNoiseBuffer();
      }
    }

    if (this.ctx && this.ctx.state === "suspended") {
      const unlock = () => {
        if (this.ctx && this.ctx.state === "suspended") {
          this.ctx.resume();
        }
        window.removeEventListener("click", unlock);
        window.removeEventListener("touchstart", unlock);
        window.removeEventListener("keydown", unlock);
      };
      window.addEventListener("click", unlock, { once: true });
      window.addEventListener("touchstart", unlock, { once: true });
      window.addEventListener("keydown", unlock, { once: true });
    }

    return this.ctx;
  }

  public async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  private createNoiseBuffer(): void {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, sampleRate * 2, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  public setPattern(pattern: SequencerPattern): void {
    this.pattern = pattern;
    // Update track states if length changes
    if (this.trackStates.length !== pattern.tracks.length) {
      this.trackStates = pattern.tracks.map((t) => ({
        mute: t.mute || false,
        solo: t.solo || false,
        volume: t.volume !== undefined ? t.volume : 0.8,
        pan: t.pan !== undefined ? t.pan : 0,
      }));
    }
  }

  public setBpm(bpm: number): void {
    this.bpm = Math.max(30, Math.min(300, bpm));
  }

  public setSwing(swing: number): void {
    this.swing = Math.max(0, Math.min(0.75, swing));
  }

  public setMasterVolume(vol: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(Math.max(0, Math.min(1.5, vol)), this.ctx.currentTime);
    }
  }

  public setTrackState(trackIdx: number, state: Partial<{ mute: boolean; solo: boolean; volume: number; pan: number }>): void {
    if (this.trackStates[trackIdx]) {
      this.trackStates[trackIdx] = { ...this.trackStates[trackIdx], ...state };
    }
  }

  public play(): void {
    if (!this.ctx) {
      this.initAudioContext();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.currentStep = 0;
    this.nextStepTime = (this.ctx ? this.ctx.currentTime : 0) + 0.05;

    this.startScheduler();
  }

  public pause(): void {
    this.isPlaying = false;
    this.stopScheduler();
  }

  public stop(): void {
    this.isPlaying = false;
    this.stopScheduler();
    this.currentStep = 0;
    if (this.onStopCallback) {
      this.onStopCallback();
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getCurrentStep(): number {
    return this.currentStep;
  }

  private startScheduler(): void {
    if (this.scheduleTimerId) clearInterval(this.scheduleTimerId);
    this.scheduleTimerId = setInterval(() => {
      this.schedulerLoop();
    }, this.lookaheadMs);
  }

  private stopScheduler(): void {
    if (this.scheduleTimerId) {
      clearInterval(this.scheduleTimerId);
      this.scheduleTimerId = null;
    }
    this.stepTimers.forEach((t) => clearTimeout(t));
    this.stepTimers.clear();
  }

  private schedulerLoop(): void {
    if (!this.ctx || !this.isPlaying || !this.pattern) return;

    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAheadSec) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.advanceStep();
    }
  }

  private advanceStep(): void {
    const secondsPerBeat = 60.0 / this.bpm;
    let stepDuration = secondsPerBeat / 4; // 16th note duration

    // Apply swing on odd steps (1, 3, 5, 7, 9, 11, 13, 15)
    // Even steps get slightly longer, odd steps slightly shorter, or odd steps delayed
    if (this.swing > 0) {
      const swingOffset = (this.swing * 0.4) * stepDuration;
      if (this.currentStep % 2 === 0) {
        stepDuration += swingOffset;
      } else {
        stepDuration -= swingOffset;
      }
    }

    this.nextStepTime += Math.max(0.02, stepDuration);
    this.currentStep = (this.currentStep + 1) % 16;
  }

  private scheduleStep(step: number, time: number): void {
    if (!this.pattern || !this.ctx) return;

    // Check solo states
    const anySolo = this.trackStates.some((t) => t.solo);

    this.pattern.tracks.forEach((track, trackIdx) => {
      const state = this.trackStates[trackIdx] || { mute: false, solo: false, volume: 0.8, pan: 0 };
      if (state.mute) return;
      if (anySolo && !state.solo) return;

      const stepData = track.steps[step];
      if (stepData && stepData.active) {
        const vel = (stepData.velocity !== undefined ? stepData.velocity : 0.8) * state.volume;
        const pitch = stepData.pitch || 0;
        this.triggerInstrument(trackIdx, track.name, time, vel, pitch);
      }
    });

    // Fire UI callback synced to playback time
    if (this.onStepCallback) {
      const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
      const timer = setTimeout(() => {
        this.stepTimers.delete(timer);
        if (this.isPlaying && this.onStepCallback) {
          this.onStepCallback({ step, time });
        }
      }, delayMs);
      this.stepTimers.add(timer);
    }
  }

  /**
   * Preview a single track note immediately
   */
  public triggerNote(trackIdx: number, trackName: string, velocity = 0.8, pitch = 0): void {
    if (!this.ctx) this.initAudioContext();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.triggerInstrument(trackIdx, trackName, this.ctx.currentTime, velocity, pitch);
  }

  private triggerInstrument(trackIdx: number, trackName: string, time: number, vel: number, pitch: number): void {
    if (!this.ctx || !this.masterGain) return;

    const lowerName = trackName.toLowerCase();
    if (lowerName.includes("kick")) {
      this.playKick(time, vel, pitch);
    } else if (lowerName.includes("snare")) {
      this.playSnare(time, vel, pitch);
    } else if (lowerName.includes("hihat") || lowerName.includes("hat")) {
      this.playHiHat(time, vel, pitch);
    } else if (lowerName.includes("perc") || lowerName.includes("clap")) {
      this.playPercussion(time, vel, pitch);
    } else if (lowerName.includes("bass")) {
      this.playBass(time, vel, pitch);
    } else if (lowerName.includes("chord") || lowerName.includes("pad")) {
      this.playChord(time, vel, pitch);
    } else if (lowerName.includes("lead")) {
      this.playLead(time, vel, pitch);
    } else if (lowerName.includes("fx")) {
      this.playFX(time, vel, pitch);
    } else {
      // Fallback drum sound
      this.playPercussion(time, vel, pitch);
    }
  }

  // --- SYNTHESIZER VOICES ---

  /**
   * 1. Kick: Punchy acoustic/electronic sub kick
   */
  private playKick(time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const startFreq = 150 * Math.pow(2, pitchOffset / 12);
    const endFreq = 42;

    osc.type = "sine";
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.08);

    const kickVol = vel * 1.2;
    gain.gain.setValueAtTime(kickVol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.32);

    osc.connect(gain);
    gain.connect(this.masterGain);

    // Click transient
    if (this.noiseBuffer) {
      const clickSrc = this.ctx.createBufferSource();
      clickSrc.buffer = this.noiseBuffer;
      const clickFilter = this.ctx.createBiquadFilter();
      clickFilter.type = "bandpass";
      clickFilter.frequency.value = 1200;
      clickFilter.Q.value = 3;
      const clickGain = this.ctx.createGain();
      clickGain.gain.setValueAtTime(vel * 0.4, time);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);
      clickSrc.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(this.masterGain);
      clickSrc.start(time);
      clickSrc.stop(time + 0.03);
    }

    osc.start(time);
    osc.stop(time + 0.35);
  }

  /**
   * 2. Snare: Dual layer (Tonal body + noise burst)
   */
  private playSnare(time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx || !this.masterGain) return;

    // Body tone
    const osc = this.ctx.createOscillator();
    const toneGain = this.ctx.createGain();
    const startFreq = 180 * Math.pow(2, pitchOffset / 12);

    osc.type = "triangle";
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.09);

    toneGain.gain.setValueAtTime(vel * 0.7, time);
    toneGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    osc.connect(toneGain);
    toneGain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.15);

    // Noise snap
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1600;
      filter.Q.value = 1.2;

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(vel * 0.8, time);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noise.start(time);
      noise.stop(time + 0.26);
    }
  }

  /**
   * 3. Hi-Hat: Crisp metallic high-pass noise
   */
  private playHiHat(time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const highpass = this.ctx.createBiquadFilter();
    highpass.type = "highpass";
    const hpFreq = Math.min(16000, 7500 * Math.pow(2, pitchOffset / 24));
    highpass.frequency.value = hpFreq;

    const gain = this.ctx.createGain();
    const decay = vel > 0.85 ? 0.22 : 0.06; // Open or closed hat feeling
    gain.gain.setValueAtTime(vel * 0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);

    noise.connect(highpass);
    highpass.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + decay + 0.02);
  }

  /**
   * 4. Percussion: Handclap multi-burst or Cowbell
   */
  private playPercussion(time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;

    // 808 Handclap triple burst
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1100 * Math.pow(2, pitchOffset / 12);
    filter.Q.value = 2.0;

    const gain = this.ctx.createGain();
    filter.connect(gain);
    gain.connect(this.masterGain);

    const burstTimes = [0, 0.012, 0.024];
    burstTimes.forEach((bt) => {
      const src = this.ctx!.createBufferSource();
      src.buffer = this.noiseBuffer;
      const burstGain = this.ctx!.createGain();
      burstGain.gain.setValueAtTime(vel * 0.5, time + bt);
      burstGain.gain.exponentialRampToValueAtTime(0.001, time + bt + 0.015);
      src.connect(burstGain);
      burstGain.connect(filter);
      src.start(time + bt);
      src.stop(time + bt + 0.02);
    });

    // Sustained clap reverb tail
    const tailSrc = this.ctx.createBufferSource();
    tailSrc.buffer = this.noiseBuffer;
    const tailGain = this.ctx.createGain();
    tailGain.gain.setValueAtTime(vel * 0.7, time + 0.03);
    tailGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    tailSrc.connect(tailGain);
    tailGain.connect(filter);
    tailSrc.start(time + 0.03);
    tailSrc.stop(time + 0.22);
  }

  /**
   * 5. Bass: Rich Sub Synth with warm harmonic saturation
   */
  private playBass(time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx || !this.masterGain) return;

    const rootFreq = 55; // A1 / C2 range
    const freq = rootFreq * Math.pow(2, pitchOffset / 12);

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(freq, time);

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(freq, time);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freq * 3.5, time);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.5, time + 0.25);

    gain.gain.setValueAtTime(vel * 0.85, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.38);
    osc2.stop(time + 0.38);
  }

  /**
   * 6. Chords: Lush polyphonic synth triad
   */
  private playChord(time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx || !this.masterGain) return;

    const baseFreq = 196 * Math.pow(2, pitchOffset / 12); // G3
    // Minor / major triad intervals: [0, 3, 7] semitones
    const chordIntervals = [0, 3, 7];

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1400, time);
    filter.frequency.exponentialRampToValueAtTime(500, time + 0.3);

    const chordGain = this.ctx.createGain();
    chordGain.gain.setValueAtTime(vel * 0.4, time);
    chordGain.gain.exponentialRampToValueAtTime(0.001, time + 0.45);

    filter.connect(chordGain);
    chordGain.connect(this.masterGain);

    chordIntervals.forEach((interval) => {
      const osc = this.ctx!.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(baseFreq * Math.pow(2, interval / 12), time);
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + 0.48);
    });
  }

  /**
   * 7. Lead: Expressive saw/square melody lead with filter env
   */
  private playLead(time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx || !this.masterGain) return;

    const baseFreq = 330 * Math.pow(2, pitchOffset / 12); // E4

    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(baseFreq, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(baseFreq * 4, time);
    filter.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, time + 0.2);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vel * 0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.32);
  }

  /**
   * 8. FX: Sweep / Laser / Impact synth sound
   */
  private playFX(time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    const startF = 880 * Math.pow(2, pitchOffset / 12);
    osc.frequency.setValueAtTime(startF, time);
    osc.frequency.exponentialRampToValueAtTime(90, time + 0.35);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(2000, time);
    filter.frequency.exponentialRampToValueAtTime(200, time + 0.35);
    filter.Q.value = 5.0;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vel * 0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.38);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.4);
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stop();
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close();
    }
  }
}
