/**
 * Web Audio Synthetic Engine for Groove Studio
 * Pure native Web Audio API synthesizer. Zero sample downloads, zero external latency.
 * Implements sample-accurate lookahead scheduling with swing and track solo/mute/pan.
 */

import { SequencerPattern, SequencerTrack } from "../types/genre";
import { AudioWorkerBridge } from "./AudioWorkerBridge";

export interface StepCallbackInfo {
  step: number;
  time: number;
}

export interface AudioEngineOptions {
  onStep?: (info: StepCallbackInfo) => void;
  onTrackTrigger?: (trackIndices: number[]) => void;
  onStop?: () => void;
}

export interface TrackChannelStrip {
  gain: GainNode;
  panner: StereoPannerNode | null;
  sendA: GainNode;
  sendB: GainNode;
}

export interface TrackState {
  mute: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  sendA?: number;
  sendB?: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private isPlaying: boolean = false;

  // Per-track channel strips (P3-09)
  private trackStrips: TrackChannelStrip[] = [];

  // Send effect buses (P3-10)
  private reverbBus: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private delayBus: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayGain: GainNode | null = null;

  // Metronome, Count-In, and Loop Region (P3-07)
  private isMetronome: boolean = false;
  private isCountIn: boolean = false;
  private countInRemaining: number = 0;
  private loopRange: [number, number] | null = null;

  // Active voice registry for panic() and scheduled voice cancellations
  private activeVoices: Array<{ source: AudioScheduledSourceNode; gain: GainNode; stopTime: number }> = [];

  // Unlock event handler reference for clean removal
  private unlockHandler: (() => void) | null = null;

  // Web Worker for unthrottled clock and audio transport scheduling
  private workerBridge: AudioWorkerBridge;

  // Scheduler state
  private bpm: number = 120;
  private swing: number = 0; // 0 to 0.75
  private currentStep: number = 0;
  private nextStepTime: number = 0;
  private scheduleTimerId: any = null;
  private stepQueue: Array<{ step: number; time: number; activeTracks: number[] }> = [];
  private lastReportedStep: number = -1;
  private rafId: number | null = null;

  // Meter and quantization
  private totalSteps: number = 16;
  private resolution: "1/8" | "1/16" | "1/32" = "1/16";
  private timeSignature: string = "4/4";

  private lookaheadMs: number = 20; // How frequently to call scheduler (ms) via Web Worker
  private scheduleAheadSec: number = 0.20; // 200ms lookahead prevents dropouts during UI dragging & drawer animations

  // Pattern data
  private pattern: SequencerPattern | null = null;
  private trackStates: Array<{
    mute: boolean;
    solo: boolean;
    volume: number;
    pan: number;
    sendA?: number;
    sendB?: number;
  }> = [];

  // Callbacks
  private onStepCallback?: (info: StepCallbackInfo) => void;
  private onTrackTriggerCallback?: (trackIndices: number[]) => void;
  private onStopCallback?: () => void;

  // Noise buffers cache
  private noiseBuffer: AudioBuffer | null = null;

  // Latency & Hearing Protection (P4-05)
  private latencyCompensationMs: number = 0;
  private hearingProtection: boolean = true;
  private maxVolumeLimit: number = 0.85;
  private currentMasterVolume: number = 0.8;

  constructor(options?: AudioEngineOptions) {
    if (options?.onStep) this.onStepCallback = options.onStep;
    if (options?.onTrackTrigger) this.onTrackTriggerCallback = options.onTrackTrigger;
    if (options?.onStop) this.onStopCallback = options.onStop;

    this.workerBridge = new AudioWorkerBridge();
    this.workerBridge.setOnTick((_now) => {
      this.schedulerLoop();
    });

    this.loadAudioSettings();
    this.initAudioContext();
  }

  /**
   * Initializes AudioContext safely (supports lazy activation on iOS / Safari)
   */
  public initAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;

    try {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
          this.masterGain = this.ctx.createGain();
          this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);

          // P0-02: Master Limiter (DynamicsCompressor) prevents harsh digital clipping
          this.limiter = this.ctx.createDynamicsCompressor();
          this.limiter.threshold.setValueAtTime(-1.0, this.ctx.currentTime);
          this.limiter.knee.setValueAtTime(0.0, this.ctx.currentTime);
          this.limiter.ratio.setValueAtTime(20.0, this.ctx.currentTime);
          this.limiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
          this.limiter.release.setValueAtTime(0.05, this.ctx.currentTime);

          this.analyser = this.ctx.createAnalyser();
          this.analyser.fftSize = 128;
          this.analyser.smoothingTimeConstant = 0.75;

          // Audio chain: masterGain -> limiter -> analyser -> destination
          this.masterGain.connect(this.limiter);
          this.limiter.connect(this.analyser);
          this.analyser.connect(this.ctx.destination);
          this.createNoiseBuffer();
          this.setupSendBuses();
          this.setupTrackStrips(16);
        }
      }

      if (this.ctx && this.ctx.state === "suspended") {
        this.cleanupUnlockListeners();
        this.unlockHandler = () => {
          if (this.ctx && this.ctx.state === "suspended") {
            this.ctx.resume().catch(() => {});
          }
          this.cleanupUnlockListeners();
        };
        window.addEventListener("click", this.unlockHandler, { once: true });
        window.addEventListener("touchstart", this.unlockHandler, { once: true });
        window.addEventListener("keydown", this.unlockHandler, { once: true });
      }
    } catch (e) {
      console.warn("[AudioEngine] Error initializing AudioContext:", e);
    }

    return this.ctx;
  }

  private cleanupUnlockListeners(): void {
    if (typeof window === "undefined" || !this.unlockHandler) return;
    window.removeEventListener("click", this.unlockHandler);
    window.removeEventListener("touchstart", this.unlockHandler);
    window.removeEventListener("keydown", this.unlockHandler);
    this.unlockHandler = null;
  }

  public async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn("[AudioEngine] Error resuming AudioContext:", e);
      }
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

  private createReverbImpulse(seconds = 1.6, decay = 2.0): AudioBuffer | null {
    if (!this.ctx) return null;
    const rate = this.ctx.sampleRate;
    const length = rate * seconds;
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
      const factor = Math.exp(-decay * (i / length));
      left[i] = (Math.random() * 2 - 1) * factor;
      right[i] = (Math.random() * 2 - 1) * factor;
    }
    return impulse;
  }

  private setupSendBuses(): void {
    if (!this.ctx || !this.masterGain) return;
    try {
      // Reverb Convolver Send Bus (P3-10)
      this.reverbBus = this.ctx.createConvolver();
      const impulse = this.createReverbImpulse(1.5, 2.2);
      if (impulse) this.reverbBus.buffer = impulse;
      this.reverbGain = this.ctx.createGain();
      this.reverbGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.reverbBus.connect(this.reverbGain);
      this.reverbGain.connect(this.masterGain);

      // Stereo Feedback Delay Send Bus (P3-10)
      this.delayBus = this.ctx.createDelay(1.0);
      this.delayBus.delayTime.setValueAtTime(0.25, this.ctx.currentTime);
      this.delayFeedback = this.ctx.createGain();
      this.delayFeedback.gain.setValueAtTime(0.32, this.ctx.currentTime);
      this.delayGain = this.ctx.createGain();
      this.delayGain.gain.setValueAtTime(0.25, this.ctx.currentTime);

      this.delayBus.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayBus);
      this.delayBus.connect(this.delayGain);
      this.delayGain.connect(this.masterGain);
    } catch (e) {
      console.warn("[AudioEngine] Send buses init warning:", e);
    }
  }

  private setupTrackStrips(numTracks = 16): void {
    if (!this.ctx || !this.masterGain) return;
    this.trackStrips = [];
    for (let i = 0; i < numTracks; i++) {
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.8, this.ctx.currentTime);

      let panner: StereoPannerNode | null = null;
      if (typeof this.ctx.createStereoPanner === "function") {
        panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(0, this.ctx.currentTime);
        gain.connect(panner);
        panner.connect(this.masterGain);
      } else {
        gain.connect(this.masterGain);
      }

      const sendA = this.ctx.createGain();
      sendA.gain.setValueAtTime(0, this.ctx.currentTime);
      if (this.reverbBus) {
        gain.connect(sendA);
        sendA.connect(this.reverbBus);
      }

      const sendB = this.ctx.createGain();
      sendB.gain.setValueAtTime(0, this.ctx.currentTime);
      if (this.delayBus) {
        gain.connect(sendB);
        sendB.connect(this.delayBus);
      }

      this.trackStrips.push({ gain, panner, sendA, sendB });
    }
  }

  public getTrackDestination(trackIdx: number): AudioNode {
    return this.trackStrips[trackIdx]?.gain || this.masterGain!;
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
      this.trackStates = pattern.tracks.map((t, idx) => {
        const volume = t.volume !== undefined ? t.volume : 0.8;
        const pan = t.pan !== undefined ? t.pan : 0;
        const sendA = t.sendA !== undefined ? t.sendA : 0;
        const sendB = t.sendB !== undefined ? t.sendB : 0;
        const strip = this.trackStrips[idx];
        if (strip && this.ctx) {
          strip.gain.gain.setValueAtTime(volume, this.ctx.currentTime);
          if (strip.panner) strip.panner.pan.setValueAtTime(pan, this.ctx.currentTime);
          strip.sendA.gain.setValueAtTime(sendA, this.ctx.currentTime);
          strip.sendB.gain.setValueAtTime(sendB, this.ctx.currentTime);
        }
        return {
          mute: t.mute || false,
          solo: t.solo || false,
          volume,
          pan,
          sendA,
          sendB,
        };
      });
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

  private loadAudioSettings(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem("groove_audio_settings_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.latencyCompensationMs === "number") {
          this.latencyCompensationMs = parsed.latencyCompensationMs;
        }
        if (typeof parsed.hearingProtection === "boolean") {
          this.hearingProtection = parsed.hearingProtection;
        }
        if (typeof parsed.maxVolumeLimit === "number") {
          this.maxVolumeLimit = parsed.maxVolumeLimit;
        }
      }
    } catch {
      // Ignore storage parse error
    }
  }

  private saveAudioSettings(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const data = {
        latencyCompensationMs: this.latencyCompensationMs,
        hearingProtection: this.hearingProtection,
        maxVolumeLimit: this.maxVolumeLimit,
      };
      localStorage.setItem("groove_audio_settings_v1", JSON.stringify(data));
    } catch {
      // Ignore storage write error
    }
  }

  public getOutputLatency(): number {
    if (!this.ctx) return 0;
    const lat = (this.ctx as any).outputLatency || (this.ctx as any).baseLatency || 0;
    return Math.round(lat * 1000);
  }

  public getLatencyCompensation(): number {
    return this.latencyCompensationMs;
  }

  public setLatencyCompensation(ms: number): void {
    this.latencyCompensationMs = Math.max(-100, Math.min(100, ms));
    this.saveAudioSettings();
  }

  public isHearingProtectionEnabled(): boolean {
    return this.hearingProtection;
  }

  public setHearingProtection(enabled: boolean): void {
    this.hearingProtection = enabled;
    this.setMasterVolume(this.currentMasterVolume);
    this.saveAudioSettings();
  }

  public getMaxVolumeLimit(): number {
    return this.maxVolumeLimit;
  }

  public setMaxVolumeLimit(limit: number): void {
    this.maxVolumeLimit = Math.max(0.1, Math.min(1.0, limit));
    this.setMasterVolume(this.currentMasterVolume);
    this.saveAudioSettings();
  }

  public setMasterVolume(vol: number): void {
    this.currentMasterVolume = Math.max(0, Math.min(1.0, vol));
    const effective = this.hearingProtection
      ? Math.min(this.maxVolumeLimit, this.currentMasterVolume)
      : this.currentMasterVolume;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(effective, this.ctx.currentTime);
    }
  }

  public setTrackState(
    trackIdx: number,
    state: Partial<{ mute: boolean; solo: boolean; volume: number; pan: number; sendA: number; sendB: number }>
  ): void {
    if (this.trackStates[trackIdx]) {
      this.trackStates[trackIdx] = { ...this.trackStates[trackIdx], ...state };
    }
    const strip = this.trackStrips[trackIdx];
    if (strip && this.ctx) {
      if (state.volume !== undefined) {
        strip.gain.gain.setValueAtTime(Math.max(0, Math.min(1.0, state.volume)), this.ctx.currentTime);
      }
      if (state.pan !== undefined && strip.panner) {
        strip.panner.pan.setValueAtTime(Math.max(-1.0, Math.min(1.0, state.pan)), this.ctx.currentTime);
      }
      if (state.sendA !== undefined) {
        strip.sendA.gain.setValueAtTime(Math.max(0, Math.min(1.0, state.sendA)), this.ctx.currentTime);
      }
      if (state.sendB !== undefined) {
        strip.sendB.gain.setValueAtTime(Math.max(0, Math.min(1.0, state.sendB)), this.ctx.currentTime);
      }
    }
  }

  public setMetronome(enabled: boolean): void {
    this.isMetronome = enabled;
  }

  public getMetronome(): boolean {
    return this.isMetronome;
  }

  public setCountIn(enabled: boolean): void {
    this.isCountIn = enabled;
  }

  public getCountIn(): boolean {
    return this.isCountIn;
  }

  public setLoopRange(range: [number, number] | null): void {
    if (range && range[0] < range[1]) {
      this.loopRange = range;
    } else {
      this.loopRange = null;
    }
  }

  public getLoopRange(): [number, number] | null {
    return this.loopRange;
  }

  public static calculateTapTempo(taps: number[]): number {
    if (taps.length < 2) return 120;
    const intervals: number[] = [];
    for (let i = 1; i < taps.length; i++) {
      intervals.push(taps[i] - taps[i - 1]);
    }
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (avg <= 0) return 120;
    const bpm = Math.round(60000 / avg);
    return Math.max(40, Math.min(240, bpm));
  }

  private playMetronome(time: number, isDownbeat: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(isDownbeat ? 1200 : 800, time);

    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.05);
    this.registerVoice(osc, gain, time + 0.05);
  }

  /**
   * Registers a scheduled voice to allow immediate cancellation on stop/pause (panic)
   */
  private registerVoice(source: AudioScheduledSourceNode, gain: GainNode, stopTime: number): void {
    if (this.ctx) {
      const now = this.ctx.currentTime;
      this.activeVoices = this.activeVoices.filter((v) => v.stopTime > now);
    }
    this.activeVoices.push({ source, gain, stopTime });
  }

  /**
   * Cancels all scheduled voices with a fast 5ms release ramp to prevent hanging notes and clicks
   */
  public panic(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const voice of this.activeVoices) {
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0.0001, now + 0.005);
        voice.source.stop(now + 0.006);
      } catch {
        // Source node might already have ended
      }
    }
    this.activeVoices = [];
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
    this.currentStep = (this.loopRange && this.loopRange[0] >= 0) ? this.loopRange[0] : 0;
    const now = this.ctx ? this.ctx.currentTime : 0;
    if (this.isCountIn) {
      const beatSec = 60.0 / this.bpm;
      for (let b = 0; b < 4; b++) {
        this.playMetronome(now + 0.035 + b * beatSec, b === 0);
      }
      this.nextStepTime = now + 0.035 + 4 * beatSec;
    } else {
      this.nextStepTime = now + 0.035;
    }
    this.stepQueue = [];
    this.lastReportedStep = -1;

    // P4-05: Soft fade-in prevents speaker pops and protects hearing
    if (this.masterGain && this.ctx) {
      const effective = this.hearingProtection
        ? Math.min(this.maxVolumeLimit, this.currentMasterVolume)
        : this.currentMasterVolume;
      const t = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.setValueAtTime(0.001, t);
      this.masterGain.gain.exponentialRampToValueAtTime(Math.max(0.001, effective), t + 0.035);
    }

    this.schedulerLoop();
    this.startScheduler();
    this.startPlayheadSync();
  }

  public pause(): void {
    this.isPlaying = false;
    this.stopScheduler();
    this.stopPlayheadSync();
    this.panic();
  }

  public stop(): void {
    this.isPlaying = false;
    this.stopScheduler();
    this.stopPlayheadSync();
    this.panic();
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
    if (this.scheduleTimerId) {
      clearInterval(this.scheduleTimerId);
      this.scheduleTimerId = null;
    }

    // Primary clock source: AudioWorkerBridge (worker precision timer with internal fallback)
    this.workerBridge.start(this.lookaheadMs);
  }

  private stopScheduler(): void {
    this.workerBridge.stop();
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
        if (item.activeTracks.length > 0 && this.onTrackTriggerCallback) {
          this.onTrackTriggerCallback(item.activeTracks);
        }
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

  public setOnTrackTrigger(callback?: (trackIndices: number[]) => void): void {
    this.onTrackTriggerCallback = callback;
  }

  private schedulerLoop(): void {
    if (!this.ctx || !this.isPlaying || !this.pattern) return;

    const stepDur = this.getStepDuration();
    const stepsCount = this.totalSteps > 0 ? this.totalSteps : 16;

    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAheadSec) {
      let step = this.currentStep;
      if (this.loopRange) {
        const [lStart, lEnd] = this.loopRange;
        if (step < lStart || step >= lEnd) {
          step = lStart;
          this.currentStep = lStart;
        }
      }

      // Swing pushes odd steps (1, 3, 5...) slightly forward
      const swingOffset = (step % 2 === 1 && this.swing > 0) ? (this.swing * 0.5) * stepDur : 0;
      const latencyOffset = this.latencyCompensationMs / 1000;
      const actualStepTime = Math.max(this.ctx.currentTime, this.nextStepTime + swingOffset + latencyOffset);

      if (this.isMetronome) {
        const isDownbeat = (step % 4 === 0);
        this.playMetronome(actualStepTime, isDownbeat);
      }

      const activeTracks = this.scheduleStep(step, actualStepTime, stepDur);
      this.stepQueue.push({ step, time: actualStepTime, activeTracks });

      // Keep monotonic un-swung grid advancement
      this.nextStepTime += stepDur;
      if (this.loopRange) {
        const [lStart, lEnd] = this.loopRange;
        const loopLen = Math.max(1, lEnd - lStart);
        this.currentStep = lStart + ((this.currentStep - lStart + 1) % loopLen);
      } else {
        this.currentStep = (this.currentStep + 1) % stepsCount;
      }
    }
  }

  private scheduleStep(step: number, time: number, stepDur: number): number[] {
    const activeTracks: number[] = [];
    if (!this.pattern || !this.ctx) return activeTracks;

    const anySolo = this.trackStates.some((t) => t.solo);

    this.pattern.tracks.forEach((track, trackIdx) => {
      const state = this.trackStates[trackIdx] || { mute: false, solo: false, volume: 0.8, pan: 0 };
      if (state.mute) return;
      if (anySolo && !state.solo) return;

      // Independent track loop length (Polymeter)
      const trackLen = (track.trackLength && track.trackLength > 0)
        ? track.trackLength
        : (track.steps ? track.steps.length : 16);
      const stepIdx = trackLen > 0 ? step % trackLen : step;

      const stepVal = track.steps ? track.steps[stepIdx] : 0;
      const isStepActive = stepVal > 0;
      if (!isStepActive) return;

      // Probability check (Chance: 0 - 100)
      const prob = (track.probability && track.probability[stepIdx] !== undefined)
        ? track.probability[stepIdx]
        : 100;
      if (prob < 100 && Math.random() * 100 > prob) {
        return;
      }

      const velVal = track.velocity && track.velocity[stepIdx] !== undefined ? track.velocity[stepIdx] : 100;
      const normalizedVel = (velVal / 127) * state.volume;
      const pitchVal = track.pitch && track.pitch[stepIdx] !== undefined && track.pitch[stepIdx] !== null ? track.pitch[stepIdx]! : 0;
      const gateVal = (track.gate && track.gate[stepIdx] !== undefined) ? track.gate[stepIdx] : 0.8;

      // Independent per-track swing offset
      const trackSwingOffset = (track.swing !== undefined ? track.swing / 100 : 0);
      const effSwing = Math.max(0, Math.min(0.75, this.swing + trackSwingOffset));
      const trackStepTime = (step % 2 === 1 && effSwing !== this.swing)
        ? (this.nextStepTime + (effSwing * 0.5) * stepDur)
        : time;

      // Ratchet / Subdivisions
      const isHatTriplet = (track.track_id === "hihat" || track.name.toLowerCase().includes("hat")) && stepVal === 3;
      const ratchet = (track.ratchet && track.ratchet[stepIdx] && track.ratchet[stepIdx] > 1)
        ? track.ratchet[stepIdx]
        : (isHatTriplet ? 3 : 1);

      activeTracks.push(trackIdx);

      if (ratchet > 1) {
        const subDur = stepDur / ratchet;
        for (let r = 0; r < ratchet; r++) {
          const subTime = trackStepTime + r * subDur;
          const subVel = normalizedVel * (0.85 + (r / ratchet) * 0.15);
          this.triggerInstrument(trackIdx, track.name, subTime, subVel, pitchVal, stepVal, subDur, gateVal);
        }
      } else {
        this.triggerInstrument(trackIdx, track.name, trackStepTime, normalizedVel, pitchVal, stepVal, stepDur, gateVal);
      }
    });

    return activeTracks;
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
  public triggerNote(trackIdx: number, trackName: string, velocity = 0.8, pitch: number | null = 0, stepVal = 1, gateVal = 0.8): void {
    if (!this.ctx) this.initAudioContext();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    const stepDur = this.getStepDuration();
    const pitchVal = pitch !== null && pitch !== undefined && pitch > 0 ? pitch : 0;
    this.triggerInstrument(trackIdx, trackName, this.ctx.currentTime, velocity, pitchVal, stepVal, stepDur, gateVal);
  }

  private triggerInstrument(
    trackIdx: number,
    trackName: string,
    time: number,
    vel: number,
    pitch: number,
    stepVal = 1,
    stepDur = 0.125,
    gateVal = 0.8
  ): void {
    if (!this.ctx) return;
    const dest = this.getTrackDestination(trackIdx);

    const trackId = (this.pattern?.tracks[trackIdx]?.track_id || "").toLowerCase();
    const lowerName = trackName.toLowerCase();

    if (trackId === "kick" || lowerName.includes("kick")) {
      this.playKick(dest, time, vel, pitch);
    } else if (trackId === "snare" || lowerName.includes("snare")) {
      this.playSnare(dest, time, vel, pitch);
    } else if (trackId === "hihat" || trackId === "hat" || lowerName.includes("hihat") || lowerName.includes("hat")) {
      this.playHiHat(dest, time, vel, pitch, stepVal, stepDur, gateVal);
    } else if (trackId === "percussion" || trackId === "perc" || lowerName.includes("perc") || lowerName.includes("clap")) {
      this.playPercussion(dest, time, vel, pitch);
    } else if (trackId === "bass" || lowerName.includes("bass")) {
      this.playBass(dest, time, vel, pitch, stepDur, gateVal);
    } else if (trackId === "chords" || trackId === "chord" || lowerName.includes("chord") || lowerName.includes("pad")) {
      this.playChord(dest, time, vel, pitch, stepDur, gateVal);
    } else if (trackId === "lead" || lowerName.includes("lead")) {
      this.playLead(dest, time, vel, pitch, stepDur, gateVal);
    } else if (trackId === "fx" || lowerName.includes("fx")) {
      this.playFX(dest, time, vel, pitch, stepDur, gateVal);
    } else {
      this.playPercussion(dest, time, vel, pitch);
    }
  }

  // --- SYNTHESIZER VOICES ROUTED TO TRACK DESTINATION & SHAPED BY GATE ---

  private playKick(dest: AudioNode, time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx) return;

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
    gain.connect(dest);

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
      clickGain.connect(dest);
      clickSrc.start(time);
      clickSrc.stop(time + 0.03);
      this.registerVoice(clickSrc, clickGain, time + 0.03);
    }

    osc.start(time);
    osc.stop(time + 0.35);
    this.registerVoice(osc, gain, time + 0.35);
  }

  private playSnare(dest: AudioNode, time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx) return;

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
    toneGain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.15);
    this.registerVoice(osc, toneGain, time + 0.15);

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
      noiseGain.connect(dest);

      noise.start(time);
      noise.stop(time + 0.26);
      this.registerVoice(noise, noiseGain, time + 0.26);
    }
  }

  private playHiHat(dest: AudioNode, time: number, vel: number, pitchOffset: number, hatType = 1, stepDur = 0.125, gateVal = 0.8): void {
    if (!this.ctx || !this.noiseBuffer) return;

    const gateScale = Math.max(0.2, Math.min(2.0, gateVal));
    if (hatType === 3) {
      // Triplet roll: 3 hits
      const offsets = [0, stepDur / 3, (stepDur * 2) / 3];
      offsets.forEach((off, i) => {
        this.triggerSingleHat(dest, time + off, vel * (i === 0 ? 1 : i === 1 ? 0.8 : 0.65), pitchOffset, 0.035 * gateScale);
      });
    } else if (hatType === 2) {
      // Open hat: long decay shaped by gate
      this.triggerSingleHat(dest, time, vel * 0.9, pitchOffset, 0.35 * gateScale);
    } else {
      // Closed hat: snappy decay shaped by gate
      this.triggerSingleHat(dest, time, vel * 0.65, pitchOffset, 0.05 * gateScale);
    }
  }

  private triggerSingleHat(dest: AudioNode, time: number, vel: number, pitchOffset: number, decay: number): void {
    if (!this.ctx || !this.noiseBuffer) return;
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
    gain.connect(dest);

    noise.start(time);
    noise.stop(time + decay + 0.02);
    this.registerVoice(noise, gain, time + decay + 0.02);
  }

  private playPercussion(dest: AudioNode, time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx || !this.noiseBuffer) return;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1100 * Math.pow(2, pitchOffset / 12);
    filter.Q.value = 2.0;

    const gain = this.ctx.createGain();
    filter.connect(gain);
    gain.connect(dest);

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
      this.registerVoice(src, burstGain, time + bt + 0.02);
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
    this.registerVoice(tailSrc, tailGain, time + 0.22);
  }

  private playBass(dest: AudioNode, time: number, vel: number, pitchOffset: number, stepDur = 0.125, gateVal = 0.8): void {
    if (!this.ctx) return;

    const freq = AudioEngine.midiToFreq(pitchOffset, 36);
    const noteDuration = Math.max(0.05, Math.min(2.5, stepDur * gateVal));

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
    filter.frequency.exponentialRampToValueAtTime(Math.min(400, freq * 1.5), time + Math.min(0.25, noteDuration));

    gain.gain.setValueAtTime(vel * 0.85, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + noteDuration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + noteDuration + 0.03);
    osc2.stop(time + noteDuration + 0.03);
    this.registerVoice(osc1, gain, time + noteDuration + 0.03);
    this.registerVoice(osc2, gain, time + noteDuration + 0.03);
  }

  private playChord(dest: AudioNode, time: number, vel: number, pitchOffset: number, stepDur = 0.125, gateVal = 0.8): void {
    if (!this.ctx) return;

    const baseFreq = AudioEngine.midiToFreq(pitchOffset, 60);
    const chordIntervals = [0, 3, 7];
    const noteDuration = Math.max(0.08, Math.min(3.0, stepDur * gateVal * 1.4));

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1400, time);
    filter.frequency.exponentialRampToValueAtTime(500, time + Math.min(0.3, noteDuration));

    const chordGain = this.ctx.createGain();
    chordGain.gain.setValueAtTime(vel * 0.4, time);
    chordGain.gain.exponentialRampToValueAtTime(0.001, time + noteDuration);

    filter.connect(chordGain);
    chordGain.connect(dest);

    chordIntervals.forEach((interval) => {
      const osc = this.ctx!.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(baseFreq * Math.pow(2, interval / 12), time);
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + noteDuration + 0.03);
      this.registerVoice(osc, chordGain, time + noteDuration + 0.03);
    });
  }

  private playLead(dest: AudioNode, time: number, vel: number, pitchOffset: number, stepDur = 0.125, gateVal = 0.8): void {
    if (!this.ctx) return;

    const baseFreq = AudioEngine.midiToFreq(pitchOffset, 72);
    const noteDuration = Math.max(0.05, Math.min(2.5, stepDur * gateVal));

    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(baseFreq, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(5000, baseFreq * 3), time);
    filter.frequency.exponentialRampToValueAtTime(Math.min(2000, baseFreq * 1.5), time + Math.min(0.2, noteDuration));

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vel * 0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + noteDuration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(time);
    osc.stop(time + noteDuration + 0.02);
    this.registerVoice(osc, gain, time + noteDuration + 0.02);
  }

  private playFX(dest: AudioNode, time: number, vel: number, pitchOffset: number, stepDur = 0.125, gateVal = 0.8): void {
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    const startF = pitchOffset > 24 
      ? AudioEngine.midiToFreq(pitchOffset, 69) 
      : 880 * Math.pow(2, pitchOffset / 12);
    osc.frequency.setValueAtTime(startF, time);
    const noteDuration = Math.max(0.1, Math.min(3.0, stepDur * gateVal * 1.2));
    osc.frequency.exponentialRampToValueAtTime(90, time + noteDuration * 0.9);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(2000, time);
    filter.frequency.exponentialRampToValueAtTime(200, time + noteDuration * 0.9);
    filter.Q.value = 5.0;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vel * 0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + noteDuration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(time);
    osc.stop(time + noteDuration + 0.02);
    this.registerVoice(osc, gain, time + noteDuration + 0.02);
  }

  public destroy(): void {
    this.stop();
    this.panic();
    this.cleanupUnlockListeners();
    this.workerBridge.destroy();
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.masterGain = null;
    this.limiter = null;
    this.analyser = null;
  }
}
