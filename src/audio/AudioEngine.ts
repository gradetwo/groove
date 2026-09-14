/**
 * Web Audio Synthetic Engine for Groove Studio
 * Pure native Web Audio API synthesizer. Zero sample downloads, zero external latency.
 * Implements sample-accurate lookahead scheduling with swing and track solo/mute/pan.
 */

import { SequencerPattern, SequencerTrack } from "../types/genre";
import { AudioWorkerBridge } from "./AudioWorkerBridge";
import { AudioWorkletClock } from "./AudioWorkletClock";
import { DrumKitType, synthesizeKick, synthesizeSnare, synthesizeHiHat, synthesizePercussion } from "./DrumKitModels";
import { playPolySynthNote, DEFAULT_SYNTH_PRESETS, SynthPreset } from "./PolySynth";
import { EffectsRack, EffectsRackState, DEFAULT_FX_STATE } from "./EffectsRack";
import { LiveRecorder, QuantizedStepResult } from "./LiveRecorder";
import { initIosAudioUnlock } from "./iosAudioUnlock";
import { ecosystemBus } from "./ecosystemBus";
import { safeVelocity, safeTime } from "./dspGuards";
import { computeCatchUp } from "./schedulerMath";
import { TrackState, deriveTrackStates } from "./trackStates";
export type { TrackState } from "./trackStates";
import { isDrumTrack } from "../utils/trackUtils";

export type { DrumKitType, EffectsRackState, SynthPreset, QuantizedStepResult };

export interface StepCallbackInfo {
  step: number;
  time: number;
}

export interface AudioEngineOptions {
  onStep?: (info: StepCallbackInfo) => void;
  onTrackTrigger?: (trackIndices: number[]) => void;
  onStop?: () => void;
  /** Fires when the scheduler had to skip steps after a stall (F-02 diagnostics). */
  onDroppedSteps?: (droppedSteps: number) => void;
}

export interface TrackChannelStrip {
  gain: GainNode;
  panner: StereoPannerNode | null;
  sendA: GainNode;
  sendB: GainNode;
}


export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private channelSplitter: ChannelSplitterNode | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
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

  // AudioWorklet Clock & Web Worker Fallback (P5-01)
  private workletClock: AudioWorkletClock;
  private workerBridge: AudioWorkerBridge;

  // Drum Kit Models (P5-02)
  private drumKit: DrumKitType = "808";
  private isDrumsOnly: boolean = false;

  // Master DSP Effects Rack (P5-04)
  private masterFxRack: EffectsRack | null = null;

  // Live Sequencer Recording (P5-05)
  private liveRecorder: LiveRecorder = new LiveRecorder();

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

  // Scheduler health (F-01/F-02): observable counters so stalls and bad steps are
  // diagnosable instead of silently degrading playback.
  private droppedStepCount: number = 0;
  private schedulingErrorCount: number = 0;

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
  private onDroppedStepsCallback?: (droppedSteps: number) => void;

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
    if (options?.onDroppedSteps) this.onDroppedStepsCallback = options.onDroppedSteps;

    this.workerBridge = new AudioWorkerBridge();
    this.workletClock = new AudioWorkletClock();
    this.workletClock.setOnTick((_now) => {
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

          // P6-05: Master High-Resolution FFT Analyser (2048 bins, 20Hz - 20kHz)
          this.masterAnalyser = this.ctx.createAnalyser();
          this.masterAnalyser.fftSize = 2048;
          this.masterAnalyser.smoothingTimeConstant = 0.8;

          // P6-05: Stereo Channel Splitter & Lissajous X-Y Phase Analysers
          if (typeof this.ctx.createChannelSplitter === "function") {
            try {
              this.channelSplitter = this.ctx.createChannelSplitter(2);
              this.analyserL = this.ctx.createAnalyser();
              this.analyserL.fftSize = 1024;
              this.analyserR = this.ctx.createAnalyser();
              this.analyserR.fftSize = 1024;
            } catch (e) {
              console.warn("[AudioEngine] Stereo analysers init warning:", e);
            }
          }

          // Master DSP Effects Rack (P5-04)
          this.masterFxRack = new EffectsRack(this.ctx);

          // Audio chain: masterGain -> masterFxRack -> limiter -> analysers -> destination
          this.masterGain.connect(this.masterFxRack.inputNode);
          this.masterFxRack.outputNode.connect(this.limiter);
          this.limiter.connect(this.analyser);
          this.limiter.connect(this.masterAnalyser);
          if (this.channelSplitter && this.analyserL && this.analyserR) {
            this.limiter.connect(this.channelSplitter);
            this.channelSplitter.connect(this.analyserL, 0);
            this.channelSplitter.connect(this.analyserR, 1);
          }
          this.analyser.connect(this.ctx.destination);
          this.createNoiseBuffer();
          this.setupSendBuses();
          this.setupTrackStrips(16);

          // Async init AudioWorklet clock (P5-01)
          this.workletClock.init(this.ctx).catch(() => {});
        }
      }

      if (this.ctx) {
        initIosAudioUnlock(this.ctx);
      }

      if (this.ctx && this.ctx.state === "suspended") {
        this.cleanupUnlockListeners();
        this.unlockHandler = () => {
          if (this.ctx && this.ctx.state === "suspended") {
            this.ctx.resume().catch(() => {});
          }
          initIosAudioUnlock(this.ctx).unlock();
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
    initIosAudioUnlock(this.ctx).unlock();
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
    this.syncTrackGains();
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
      this.trackStates = deriveTrackStates(pattern);
    } else {
      // Synchronize trackStates (mute, solo, volume, pan, sends) with pattern tracks
      pattern.tracks.forEach((t, idx) => {
        if (this.trackStates[idx]) {
          if (t.mute !== undefined) this.trackStates[idx].mute = Boolean(t.mute);
          if (t.solo !== undefined) this.trackStates[idx].solo = Boolean(t.solo);
          if (t.volume !== undefined) this.trackStates[idx].volume = t.volume;
          if (t.pan !== undefined) this.trackStates[idx].pan = t.pan;
          if (t.sendA !== undefined) this.trackStates[idx].sendA = t.sendA;
          if (t.sendB !== undefined) this.trackStates[idx].sendB = t.sendB;
        }
      });
    }
    this.syncTrackGains();
  }

  public syncTrackGains(): void {
    if (!this.ctx || this.trackStrips.length === 0) return;
    const anySolo = this.trackStates.some((t) => t.solo);
    const now = this.ctx.currentTime;

    this.trackStates.forEach((state, idx) => {
      const strip = this.trackStrips[idx];
      if (!strip) return;
      const track = this.pattern?.tracks[idx];
      const isDrum = track ? isDrumTrack(track, idx) : idx < 4;
      const isSilenced = Boolean(state.mute) || (anySolo && !state.solo) || (this.isDrumsOnly && !isDrum);
      const targetGain = isSilenced ? 0 : (state.volume !== undefined ? Math.max(0, Math.min(1.0, state.volume)) : 0.8);

      try {
        if (typeof strip.gain.gain.cancelScheduledValues === "function") {
          strip.gain.gain.cancelScheduledValues(now);
        }
        if (typeof strip.gain.gain.setTargetAtTime === "function") {
          strip.gain.gain.setTargetAtTime(targetGain, now, 0.005);
        } else if (typeof strip.gain.gain.setValueAtTime === "function") {
          strip.gain.gain.setValueAtTime(targetGain, now);
        }
      } catch (_) {
        try {
          if (typeof strip.gain.gain.setValueAtTime === "function") {
            strip.gain.gain.setValueAtTime(targetGain, now);
          }
        } catch (_) {}
      }

      if (state.pan !== undefined && strip.panner) {
        try {
          if (typeof strip.panner.pan.setValueAtTime === "function") {
            strip.panner.pan.setValueAtTime(Math.max(-1.0, Math.min(1.0, state.pan)), now);
          }
        } catch (_) {}
      }
      if (state.sendA !== undefined && strip.sendA) {
        try {
          const sendVal = isSilenced ? 0 : Math.max(0, Math.min(1.0, state.sendA));
          if (typeof strip.sendA.gain.setValueAtTime === "function") {
            strip.sendA.gain.setValueAtTime(sendVal, now);
          }
        } catch (_) {}
      }
      if (state.sendB !== undefined && strip.sendB) {
        try {
          const sendVal = isSilenced ? 0 : Math.max(0, Math.min(1.0, state.sendB));
          if (typeof strip.sendB.gain.setValueAtTime === "function") {
            strip.sendB.gain.setValueAtTime(sendVal, now);
          }
        } catch (_) {}
      }
    });
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
    ecosystemBus.publishClockSync(this.bpm, this.isPlaying, this.currentStep);
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
    if (!this.trackStates[trackIdx]) {
      this.trackStates[trackIdx] = {
        mute: false,
        solo: false,
        volume: 0.8,
        pan: 0,
        sendA: 0,
        sendB: 0,
      };
    }
    this.trackStates[trackIdx] = { ...this.trackStates[trackIdx], ...state };
    this.syncTrackGains();
  }

  public getTrackState(
    trackIdx: number
  ): { mute: boolean; solo: boolean; volume: number; pan: number; sendA?: number; sendB?: number } | undefined {
    return this.trackStates[trackIdx];
  }

  public getTrackStates(): Array<{
    mute: boolean;
    solo: boolean;
    volume: number;
    pan: number;
    sendA?: number;
    sendB?: number;
  }> {
    return [...this.trackStates];
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

  public setDrumsOnly(enabled: boolean): void {
    this.isDrumsOnly = enabled;
    this.syncTrackGains();
  }

  public getDrumsOnly(): boolean {
    return this.isDrumsOnly;
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
    initIosAudioUnlock(this.ctx).unlock();
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    if (this.isPlaying) return;

    this.isPlaying = true;
    ecosystemBus.publishClockStart(this.bpm);
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
    ecosystemBus.publishClockStop();
    this.stopScheduler();
    this.stopPlayheadSync();
    this.panic();
  }

  public stop(): void {
    this.isPlaying = false;
    ecosystemBus.publishClockStop();
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

  public getMasterAnalyser(): AnalyserNode | null {
    return this.masterAnalyser || this.analyser;
  }

  public getStereoAnalysers(): { left: AnalyserNode | null; right: AnalyserNode | null } {
    return {
      left: this.analyserL || this.analyser,
      right: this.analyserR || this.analyser,
    };
  }

  public getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  public getCurrentStep(): number {
    return this.currentStep;
  }

  /** Scheduler health snapshot (F-01/F-02) — used by tests and diagnostics. */
  public getSchedulerHealth(): { droppedSteps: number; schedulingErrors: number; queuedSteps: number } {
    return {
      droppedSteps: this.droppedStepCount,
      schedulingErrors: this.schedulingErrorCount,
      queuedSteps: this.stepQueue.length,
    };
  }

  private startScheduler(): void {
    if (this.scheduleTimerId) {
      clearInterval(this.scheduleTimerId);
      this.scheduleTimerId = null;
    }

    // Primary clock source: AudioWorkletClock (sample-accurate AudioWorklet with Worker fallback, P5-01)
    const rate = this.ctx ? this.ctx.sampleRate : 44100;
    this.workletClock.start(this.lookaheadMs, rate);

    // Watchdog backup interval ensures scheduling loop keeps running without any stalls
    this.scheduleTimerId = setInterval(() => {
      if (this.isPlaying) {
        this.schedulerLoop();
      }
    }, 25);
  }

  private stopScheduler(): void {
    this.workletClock.stop();
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

    // F-02: recover from a stall (backgrounded tab, GC pause, iOS suspend → resume,
    // a heavy render pass) instead of firing every missed step at "now".
    // Without this, `Math.max(currentTime, …)` below clamps a whole backlog onto the
    // same instant and the result is a burst of coincident voices, not music.
    const now = this.ctx.currentTime;
    const catchUp = computeCatchUp({
      currentStep: this.currentStep,
      nextStepTime: this.nextStepTime,
      now,
      stepDur,
      stepsCount,
      loopRange: this.loopRange,
    });
    if (catchUp.droppedSteps > 0) {
      this.currentStep = catchUp.currentStep;
      this.nextStepTime = catchUp.nextStepTime;
      this.droppedStepCount += catchUp.droppedSteps;
      if (this.onDroppedStepsCallback) {
        this.onDroppedStepsCallback(catchUp.droppedSteps);
      }
    }

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

      // F-01: a throw from any single voice must never wedge the transport.
      // The grid advances unconditionally below, so a bad step is skipped, not replayed forever.
      try {
        if (this.isMetronome) {
          const isDownbeat = (step % 4 === 0);
          this.playMetronome(actualStepTime, isDownbeat);
        }

        const activeTracks = this.scheduleStep(step, actualStepTime, stepDur);
        this.stepQueue.push({ step, time: actualStepTime, activeTracks });
      } catch (err) {
        this.schedulingErrorCount += 1;
        if (this.schedulingErrorCount <= 5) {
          console.warn(`[AudioEngine] step ${step} failed to schedule; continuing transport`, err);
        }
      }

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
      if (this.isDrumsOnly && !isDrumTrack(track, trackIdx)) return;

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
      // H-01/F-03: track volume is applied exactly once, by the track strip gain node.
      // It used to be multiplied into the velocity as well (amplitude ∝ volume²),
      // which made live playback disagree with the offline WAV renderer.
      const normalizedVel = velVal / 127;
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
    initIosAudioUnlock(this.ctx).unlock();
    if (this.ctx.state === "suspended") this.ctx.resume();
    const stepDur = this.getStepDuration();
    const pitchVal = pitch !== null && pitch !== undefined && pitch > 0 ? pitch : 0;

    // P5-05: Real-time Live Sequencer Recording
    if (this.isPlaying && this.liveRecorder.getIsArmed()) {
      this.liveRecorder.recordTrigger(trackIdx, pitchVal, velocity, this.currentStep, this.totalSteps);
    }

    this.triggerInstrument(trackIdx, trackName, this.ctx.currentTime, velocity, pitchVal, stepVal, stepDur, gateVal, true);
  }

  private triggerInstrument(
    trackIdx: number,
    trackName: string,
    time: number,
    vel: number,
    pitch: number,
    stepVal = 1,
    stepDur = 0.125,
    gateVal = 0.8,
    isAudition = false
  ): void {
    if (!this.ctx) return;
    const dest = isAudition ? (this.masterGain || this.getTrackDestination(trackIdx)) : this.getTrackDestination(trackIdx);

    // F-01: every voice funnels through here, so this is the single choke point that
    // keeps user-controlled zeros (muted fader, velocity 0, NaN from a bad import)
    // out of `exponentialRampToValueAtTime`, which would otherwise throw and wedge
    // the scheduler loop for the rest of the session.
    const safeVel = safeVelocity(vel);
    const safeStartTime = Math.max(this.ctx.currentTime, safeTime(time, this.ctx.currentTime));

    const trackId = (this.pattern?.tracks[trackIdx]?.track_id || "").toLowerCase();
    const lowerName = trackName.toLowerCase();

    if (trackId === "kick" || lowerName.includes("kick")) {
      this.playKick(dest, safeStartTime, safeVel, pitch);
      ecosystemBus.publishTransientHit("master", safeVel, pitch);
    } else if (trackId === "snare" || lowerName.includes("snare")) {
      this.playSnare(dest, safeStartTime, safeVel, pitch);
    } else if (trackId === "hihat" || trackId === "hat" || lowerName.includes("hihat") || lowerName.includes("hat")) {
      this.playHiHat(dest, safeStartTime, safeVel, pitch, stepVal, stepDur, gateVal);
    } else if (trackId === "percussion" || trackId === "perc" || lowerName.includes("perc") || lowerName.includes("clap")) {
      this.playPercussion(dest, safeStartTime, safeVel, pitch);
    } else if (trackId === "bass" || lowerName.includes("bass")) {
      this.playBass(dest, safeStartTime, safeVel, pitch, stepDur, gateVal);
    } else if (trackId === "chords" || trackId === "chord" || lowerName.includes("chord") || lowerName.includes("pad")) {
      this.playChord(dest, safeStartTime, safeVel, pitch, stepDur, gateVal);
    } else if (trackId === "lead" || lowerName.includes("lead")) {
      this.playLead(dest, safeStartTime, safeVel, pitch, stepDur, gateVal);
    } else if (trackId === "fx" || lowerName.includes("fx")) {
      this.playFX(dest, safeStartTime, safeVel, pitch, stepDur, gateVal);
    } else {
      this.playPercussion(dest, safeStartTime, safeVel, pitch);
    }
  }

  // --- HARDWARE DRUM MACHINE MODELS (P5-02) & POLYPHONIC SYNTH (P5-03) ---

  public setDrumKit(kit: DrumKitType): void {
    this.drumKit = kit;
  }

  public getDrumKit(): DrumKitType {
    return this.drumKit;
  }

  public getMasterFxRack(): EffectsRack | null {
    return this.masterFxRack;
  }

  public setMasterFilter(enabled: boolean, cutoff: number, q: number, type?: BiquadFilterType): void {
    if (this.masterFxRack) this.masterFxRack.setFilter(enabled, cutoff, q, type);
  }

  public setMasterSaturation(enabled: boolean, drive: number): void {
    if (this.masterFxRack) this.masterFxRack.setSaturation(enabled, drive);
  }

  public setMasterChorus(enabled: boolean, mix: number, rate?: number): void {
    if (this.masterFxRack) this.masterFxRack.setChorus(enabled, mix, rate);
  }

  public setMasterBitcrusher(enabled: boolean, bitDepth: number): void {
    if (this.masterFxRack) this.masterFxRack.setBitcrusher(enabled, bitDepth);
  }

  public getLiveRecorder(): LiveRecorder {
    return this.liveRecorder;
  }

  public setRecordArmed(armed: boolean): void {
    this.liveRecorder.setArmed(armed);
  }

  public getIsRecordArmed(): boolean {
    return this.liveRecorder.getIsArmed();
  }

  private playKick(dest: AudioNode, time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx) return;
    const voice = synthesizeKick(this.ctx, dest, time, vel, pitchOffset, this.drumKit, this.noiseBuffer);
    voice.sources.forEach((src, idx) => {
      this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
    });
  }

  private playSnare(dest: AudioNode, time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx) return;
    const voice = synthesizeSnare(this.ctx, dest, time, vel, pitchOffset, this.drumKit, this.noiseBuffer);
    voice.sources.forEach((src, idx) => {
      this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
    });
  }

  private playHiHat(dest: AudioNode, time: number, vel: number, pitchOffset: number, stepVal = 1, stepDur = 0.125, gateVal = 0.8): void {
    if (!this.ctx) return;
    const voice = synthesizeHiHat(this.ctx, dest, time, vel, pitchOffset, this.drumKit, stepVal, stepDur, gateVal, this.noiseBuffer);
    voice.sources.forEach((src, idx) => {
      this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
    });
  }

  private playPercussion(dest: AudioNode, time: number, vel: number, pitchOffset: number): void {
    if (!this.ctx) return;
    const voice = synthesizePercussion(this.ctx, dest, time, vel, pitchOffset, this.drumKit, this.noiseBuffer);
    voice.sources.forEach((src, idx) => {
      this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
    });
  }

  private playBass(dest: AudioNode, time: number, vel: number, pitchOffset: number, stepDur = 0.125, gateVal = 0.8): void {
    if (!this.ctx) return;
    const midi = pitchOffset > 0 ? pitchOffset : 36;
    const dur = stepDur * gateVal;
    const voice = playPolySynthNote(this.ctx, dest, midi, time, dur, vel, DEFAULT_SYNTH_PRESETS.acidBass);
    voice.sources.forEach((src, idx) => {
      this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
    });
  }

  private playChord(dest: AudioNode, time: number, vel: number, pitchOffset: number, stepDur = 0.125, gateVal = 0.8): void {
    if (!this.ctx) return;
    const midi = pitchOffset > 0 ? pitchOffset : 60;
    const dur = stepDur * gateVal * 1.5;
    const voice = playPolySynthNote(this.ctx, dest, midi, time, dur, vel, DEFAULT_SYNTH_PRESETS.warmPad);
    voice.sources.forEach((src, idx) => {
      this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
    });
  }

  private playLead(dest: AudioNode, time: number, vel: number, pitchOffset: number, stepDur = 0.125, gateVal = 0.8): void {
    if (!this.ctx) return;
    const midi = pitchOffset > 0 ? pitchOffset : 72;
    const dur = stepDur * gateVal * 1.5;
    const voice = playPolySynthNote(this.ctx, dest, midi, time, dur, vel, DEFAULT_SYNTH_PRESETS.analogLead);
    voice.sources.forEach((src, idx) => {
      this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
    });
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
    this.workletClock.destroy();
    this.workerBridge.destroy();
    if (this.masterFxRack) {
      this.masterFxRack.destroy();
      this.masterFxRack = null;
    }
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.masterGain = null;
    this.limiter = null;
    this.analyser = null;
    this.masterAnalyser = null;
    this.channelSplitter = null;
    this.analyserL = null;
    this.analyserR = null;
  }
}
