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
  private analyser: AnalyserNode | null = null;
  private isPlaying: boolean = false;

  // Scheduler state
  private bpm: number = 120;
  private swing: number = 0; // 0 to 0.75
  private currentStep: number = 0;
  private nextStepTime: number = 0;
  private scheduleTimerId: any = null;
  private stepQueue: Array<{ step: number; time: number }> = [];
  private lastReportedStep: number = -1;
  private rafId: number | null = null;

  // Meter and quantization
  private totalSteps: number = 16;
  private resolution: "1/8" | "1/16" | "1/32" = "1/16";
  private timeSignature: string = "4/4";

  private lookaheadMs: number = 25; // How frequently to call scheduler (ms)
  private scheduleAheadSec: number = 0.12; // How far ahead to schedule audio (sec)

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
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 128;
        this.analyser.smoothingTimeConstant = 0.75;
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
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

  public setPattern(pattern: SequencerPattern, resetStates = false): void {
    this.pattern = pattern;
    if (pattern.totalSteps) {
      this.totalSteps = pattern.totalSteps;
    } else if (pattern.tracks && pattern.tracks.length > 0 && pattern.tracks[0].steps) {
      this.totalSteps = pattern.tracks[0].steps.length;
    } else {
      this.totalSteps = 16;
    }
    if (pattern.resolution) {
      this.resolution = pattern.resolution;
    }
    if (pattern.timeSignature) {
      this.timeSignature = pattern.timeSignature;
    }
    if (resetStates || this.trackStates.length !== pattern.tracks.length) {
      this.trackStates = pattern.tracks.map((t) => ({
        mute: t.mute || false,
        solo: t.solo || false,
        volume: t.volume !== undefined ? t.volume : 0.8,
        pan: t.pan !== undefined ? t.pan : 0,
      }));
    }
  }

  public setTotalSteps(steps: number): void {
    this.totalSteps = Math.max(4, steps);
  }

  public getTotalSteps(): number {
    return this.totalSteps;
  }

  public setResolution(resolution: "1/8" | "1/16" | "1/32"): void {
    this.resolution = resolution;
  }

  public getResolution(): "1/8" | "1/16" | "1/32" {
    return this.resolution;
  }

  public setTimeSignature(sig: string): void {
    this.timeSignature = sig;
  }

  public getTimeSignature(): string {
    return this.timeSignature;
  }

  public getStepDuration(): number {
    const beatSec = 60.0 / this.bpm;
    const parts = (this.timeSignature || "4/4").split("/");
    const denom = parseInt(parts[1], 10) || 4;
    const baseSec = denom === 8 ? beatSec / 2 : denom === 2 ? beatSec * 2 : beatSec;

    if (this.resolution === "1/8") {
      return baseSec / 2;
    } else if (this.resolution === "1/32") {
      return baseSec / 8;
    }
    return baseSec / 4;
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

  public async play(): Promise<void> {
    if (!this.ctx) {
      this.initAudioContext();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.currentStep = 0;
    this.nextStepTime = (this.ctx ? this.ctx.currentTime : 0) + 0.035;
    this.stepQueue = [];
    this.lastReportedStep = -1;

    this.schedulerLoop();
    this.startScheduler();
    this.startPlayheadSync();
  }

  public pause(): void {
    this.isPlaying = false;
    this.stopScheduler();
    this.stopPlayheadSync();
  }

  public stop(): void {
    this.isPlaying = false;
    this.stopScheduler();
    this.stopPlayheadSync();
    this.currentStep = 0;
    this.lastReportedStep = -1;
    this.stepQueue = [];
    if (this.onStopCallback) {
      this.onStopCallback();
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
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
  }

  private startPlayheadSync(): void {
    const sync = () => {
      if (!this.isPlaying || !this.ctx) return;

      const now = this.ctx.currentTime;
      // Anticipation offset of 25ms aligns visual playhead with monitor refresh
      const visualLeadSec = 0.025;

      let latestStep = -1;
      let latestTime = 0;

      while (this.stepQueue.length > 0 && this.stepQueue[0].time <= now + visualLeadSec) {
        const item = this.stepQueue.shift()!;
        latestStep = item.step;
        latestTime = item.time;
      }

      if (latestStep !== -1 && latestStep !== this.lastReportedStep) {
        this.lastReportedStep = latestStep;
        if (this.onStepCallback) {
          this.onStepCallback({ step: latestStep, time: latestTime });
        }
      }

      if (typeof requestAnimationFrame !== "undefined") {
        this.rafId = requestAnimationFrame(sync);
      }
    };

    if (typeof requestAnimationFrame !== "undefined") {
      this.rafId = requestAnimationFrame(sync);
    }
  }

  private stopPlayheadSync(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private schedulerLoop(): void {
    if (!this.ctx || !this.isPlaying || !this.pattern) return;

    const stepDur = this.getStepDuration();
    const stepsCount = this.totalSteps > 0 ? this.totalSteps : 16;

    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAheadSec) {
      const step = this.currentStep;
      // Swing pushes odd steps (1, 3, 5...) slightly forward
      const swingOffset = (step % 2 === 1 && this.swing > 0) ? (this.swing * 0.5) * stepDur : 0;
      const actualStepTime = this.nextStepTime + swingOffset;

      this.scheduleStep(step, actualStepTime, stepDur);
      this.stepQueue.push({ step, time: actualStepTime });

      // Keep monotonic un-swung grid advancement
      this.nextStepTime += stepDur;
      this.currentStep = (this.currentStep + 1) % stepsCount;
    }
  }

  private scheduleStep(step: number, time: number, stepDur: number): void {
    if (!this.pattern || !this.ctx) return;

    const anySolo = this.trackStates.some((t) => t.solo);

    this.pattern.tracks.forEach((track, trackIdx) => {
      const state = this.trackStates[trackIdx] || { mute: false, solo: false, volume: 0.8, pan: 0 };
      if (state.mute) return;
      if (anySolo && !state.solo) return;

      const trackStepsLen = track.steps ? track.steps.length : 16;
      const stepIdx = trackStepsLen > 0 ? step % trackStepsLen : step;
      const stepVal = track.steps ? track.steps[stepIdx] : 0;
      const isStepActive = stepVal > 0;
      if (isStepActive) {
        const velVal = track.velocity && track.velocity[stepIdx] !== undefined ? track.velocity[stepIdx] : 100;
        const normalizedVel = (velVal / 127) * state.volume;
        const pitchVal = track.pitch && track.pitch[stepIdx] !== undefined && track.pitch[stepIdx] !== null ? track.pitch[stepIdx]! : 0;
        this.triggerInstrument(trackIdx, track.name, time, normalizedVel, pitchVal, stepVal, stepDur);
      }
    });
  }

  /**
   * Converts MIDI note number to frequency in Hertz
   */
  public static midiToFreq(midiNote: number | null | undefined, fallbackNote = 60): number {
    const note = (midiNote !== undefined && midiNote !== null && midiNote > 0) ? midiNote : fallbackNote;
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  /**
   * Preview a single track note immediately
   */
  public triggerNote(trackIdx: number, trackName: string, velocity = 0.8, pitch: number | null = 0, stepVal = 1): void {
    if (!this.ctx) this.initAudioContext();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    const stepDur = this.getStepDuration();
    const pitchVal = pitch !== null && pitch !== undefined && pitch > 0 ? pitch : 0;
    this.triggerInstrument(trackIdx, trackName, this.ctx.currentTime, velocity, pitchVal, stepVal, stepDur);
  }

  private triggerInstrument(trackIdx: number, trackName: string, time: number, vel: number, pitch: number, stepVal = 1, stepDur = 0.125): void {
    if (!this.ctx || !this.masterGain) return;

    const trackId = (this.pattern?.tracks[trackIdx]?.track_id || "").toLowerCase();
    const lowerName = trackName.toLowerCase();

    if (trackId === "kick" || lowerName.includes("kick")) {
      this.playKick(time, vel, pitch);
    } else if (trackId === "snare" || lowerName.includes("snare")) {
      this.playSnare(time, vel, pitch);
    } else if (trackId === "hihat" || trackId === "hat" || lowerName.includes("hihat") || lowerName.includes("hat")) {
      this.playHiHat(time, vel, pitch, stepVal, stepDur);
    } else if (trackId === "percussion" || trackId === "perc" || lowerName.includes("perc") || lowerName.includes("clap")) {
      this.playPercussion(time, vel, pitch);
    } else if (trackId === "bass" || lowerName.includes("bass")) {
      this.playBass(time, vel, pitch);
    } else if (trackId === "chords" || trackId === "chord" || lowerName.includes("chord") || lowerName.includes("pad")) {
      this.playChord(time, vel, pitch);
    } else if (trackId === "lead" || lowerName.includes("lead")) {
      this.playLead(time, vel, pitch);
    } else if (trackId === "fx" || lowerName.includes("fx")) {
      this.playFX(time, vel, pitch);
    } else {
      this.playPercussion(time, vel, pitch);
    }
  }

  // --- SYNTHESIZER VOICES ---

  private playKick(time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const basePitch = (pitchOffset > 24) ? (pitchOffset - 36) : pitchOffset;
    const startFreq = 150 * Math.pow(2, basePitch / 12);
    const endFreq = 42;

    osc.type = "sine";
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.08);

    const kickVol = vel * 1.2;
    gain.gain.setValueAtTime(kickVol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.32);

    osc.connect(gain);
    gain.connect(this.masterGain);

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

  private playSnare(time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const toneGain = this.ctx.createGain();
    const basePitch = (pitchOffset > 24) ? (pitchOffset - 60) : pitchOffset;
    const startFreq = 180 * Math.pow(2, basePitch / 12);

    osc.type = "triangle";
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.09);

    toneGain.gain.setValueAtTime(vel * 0.7, time);
    toneGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    osc.connect(toneGain);
    toneGain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.15);

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

  private playHiHat(time: number, vel: number, pitchOffset: number, hatType = 1, stepDur = 0.125): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;

    if (hatType === 3) {
      // Triplet roll: 3 hits
      const offsets = [0, stepDur / 3, (stepDur * 2) / 3];
      offsets.forEach((off, i) => {
        this.triggerSingleHat(time + off, vel * (i === 0 ? 1 : i === 1 ? 0.8 : 0.65), pitchOffset, 0.035);
      });
    } else if (hatType === 2) {
      // Open hat: long decay
      this.triggerSingleHat(time, vel * 0.9, pitchOffset, 0.35);
    } else {
      // Closed hat: snappy decay
      this.triggerSingleHat(time, vel * 0.65, pitchOffset, 0.05);
    }
  }

  private triggerSingleHat(time: number, vel: number, pitchOffset: number, decay: number): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const highpass = this.ctx.createBiquadFilter();
    highpass.type = "highpass";
    const hpFreq = Math.min(16000, 7500 * Math.pow(2, pitchOffset / 24));
    highpass.frequency.value = hpFreq;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vel * 0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);

    noise.connect(highpass);
    highpass.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + decay + 0.02);
  }

  private playPercussion(time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;

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

  private playBass(time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx || !this.masterGain) return;

    const freq = AudioEngine.midiToFreq(pitchOffset, 36);

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(freq, time);

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(freq, time);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(1200, freq * 3.5), time);
    filter.frequency.exponentialRampToValueAtTime(Math.min(400, freq * 1.5), time + 0.25);

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

  private playChord(time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx || !this.masterGain) return;

    const baseFreq = AudioEngine.midiToFreq(pitchOffset, 60);
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

  private playLead(time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx || !this.masterGain) return;

    const baseFreq = AudioEngine.midiToFreq(pitchOffset, 72);

    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(baseFreq, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(5000, baseFreq * 3), time);
    filter.frequency.exponentialRampToValueAtTime(Math.min(2000, baseFreq * 1.5), time + 0.2);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vel * 0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.32);
  }

  private playFX(time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    const startF = pitchOffset > 24 
      ? AudioEngine.midiToFreq(pitchOffset, 69) 
      : 880 * Math.pow(2, pitchOffset / 12);
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

  public destroy(): void {
    this.stop();
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close();
    }
  }
}
