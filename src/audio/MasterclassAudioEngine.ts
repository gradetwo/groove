/**
 * Web Audio Synthesis & High-Precision Scheduling Engine for Rhythm Masterclasses (P6-01)
 * Provides organic acoustic percussion modeling, dual-ring polyrhythmic scheduling,
 * and tap-along precision calculation.
 */

import { createEngineAudioContext, rampBusMute } from "./voiceRegistry";
import { createMasterLimiter, type MasterLimiterHandle } from "./MasterLimiter";

export type PercussionSound =
  | "woodblock"
  | "bell"
  | "collision"
  | "clave"
  | "davul"
  | "kick"
  | "snare"
  | "hihat"
  | "shaker";

export interface TapAccuracyResult {
  offsetMs: number; // Signed deviation in ms (- = early, + = late)
  absOffsetMs: number;
  rating: "perfect" | "great" | "good" | "miss";
  scorePercent: number;
}

export class MasterclassAudioEngine {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private bpm = 100;
  private timerId: number | null = null;
  private nextNoteTime = 0;

  // Master Gain & Output with Brickwall Limiter
  private masterGain: GainNode | null = null;
  private masterLimiter: MasterLimiterHandle | null = null;

  // Pattern scheduling callback
  private scheduleCallback: ((currentTime: number, nextTime: number) => void) | null = null;

  // Scheduled pulse timestamps for tap accuracy check
  private scheduledPulseTimes: number[] = [];
  /** Master bus level; also the value restored when unmuting after stop(). */
  private masterVolume = 0.85;

  constructor() {
    // Lazy AudioContext initialization on first user interaction
  }

  private initContext() {
    if (!this.ctx) {
      this.ctx = createEngineAudioContext();
      if (!this.ctx) return;
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
      this.masterLimiter = createMasterLimiter(this.ctx);
      this.masterGain.connect(this.masterLimiter.input);
      this.masterLimiter.output.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  public setBpm(newBpm: number) {
    this.bpm = Math.max(30, Math.min(240, newBpm));
  }

  public getBpm(): number {
    return this.bpm;
  }

  public setScheduleCallback(cb: ((currentTime: number, nextTime: number) => void) | null) {
    this.scheduleCallback = cb;
  }

  /**
   * Pure Web Audio Synthesis of world acoustic and electro-acoustic percussion
   */
  public triggerSound(sound: PercussionSound, time?: number, velocity = 0.85) {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    const t = time !== undefined ? Math.max(time, this.ctx.currentTime) : this.ctx.currentTime;
    const vel = Math.max(0.05, Math.min(1.0, velocity));

    switch (sound) {
      case "woodblock":
        this.synthWoodblock(t, vel);
        break;
      case "bell":
        this.synthBell(t, vel);
        break;
      case "collision":
        this.synthCollision(t, vel);
        break;
      case "clave":
        this.synthClave(t, vel);
        break;
      case "davul":
        this.synthDavul(t, vel);
        break;
      case "kick":
        this.synthKick(t, vel);
        break;
      case "snare":
        this.synthSnare(t, vel);
        break;
      case "hihat":
        this.synthHiHat(t, vel);
        break;
      case "shaker":
        this.synthShaker(t, vel);
        break;
    }
  }

  private synthWoodblock(time: number, vel: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(950, time);
    osc.frequency.exponentialRampToValueAtTime(420, time + 0.04);

    gain.gain.setValueAtTime(0.9 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.05);
  }

  private synthBell(time: number, vel: number) {
    if (!this.ctx || !this.masterGain) return;
    // Metallic harmonic partials (Agogo / Cowbell pair)
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(587.33, time); // D5
    osc2.frequency.setValueAtTime(845.0, time); // Inharmonic metallic overtone

    gain.gain.setValueAtTime(0.7 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.26);
    osc2.stop(time + 0.26);
  }

  private synthCollision(time: number, vel: number) {
    if (!this.ctx || !this.masterGain) return;
    // Massive convergence impact: woodblock + metallic bell + resonant sub punch
    this.synthWoodblock(time, vel);
    this.synthBell(time, vel);

    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(140, time);
    subOsc.frequency.exponentialRampToValueAtTime(55, time + 0.12);

    subGain.gain.setValueAtTime(0.85 * vel, time);
    subGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);

    subOsc.start(time);
    subOsc.stop(time + 0.16);
  }

  private synthClave(time: number, vel: number) {
    if (!this.ctx || !this.masterGain) return;
    // Authentic Cuban Rosewood Clave: two resonant bandpass filters stimulated by brief pulse
    const osc = this.ctx.createOscillator();
    const filter1 = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(2450, time);
    osc.frequency.exponentialRampToValueAtTime(2100, time + 0.035);

    filter1.type = "bandpass";
    filter1.frequency.setValueAtTime(2350, time);
    filter1.Q.setValueAtTime(12, time);

    gain.gain.setValueAtTime(1.0 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.038);

    osc.connect(filter1);
    filter1.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.04);
  }

  private synthDavul(time: number, vel: number) {
    if (!this.ctx || !this.masterGain) return;
    // Balkan Davul bass punch
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.15);

    gain.gain.setValueAtTime(0.95 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.23);
  }

  private synthKick(time: number, vel: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(48, time + 0.08);

    gain.gain.setValueAtTime(1.0 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.18);
  }

  private synthSnare(time: number, vel: number) {
    if (!this.ctx || !this.masterGain) return;
    // Tone
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(185, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.07);
    oscGain.gain.setValueAtTime(0.7 * vel, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.09);

    // Noise snap
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.12);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(1200, time);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.85 * vel, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + 0.13);
  }

  private synthHiHat(time: number, vel: number) {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.05);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(8500, time);
    filter.Q.setValueAtTime(5, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.75 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + 0.05);
  }

  private synthShaker(time: number, vel: number) {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.06);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(4500, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.055);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + 0.06);
  }

  /**
   * Transport Loop Controls
   */
  public start() {
    this.initContext();
    if (this.isPlaying || !this.ctx) return;
    // A-05: undo any bus mute left behind by a previous stop().
    if (this.masterGain) rampBusMute(this.masterGain, this.ctx, false, this.masterVolume);
    this.isPlaying = true;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.scheduledPulseTimes = [];

    const lookahead = 25; // ms
    const scheduleAheadTime = 0.12; // s

    const scheduler = () => {
      if (!this.isPlaying || !this.ctx) return;
      while (this.nextNoteTime < this.ctx.currentTime + scheduleAheadTime) {
        if (this.scheduleCallback) {
          this.scheduleCallback(this.ctx.currentTime, this.nextNoteTime);
        }
        // Advance clock step (16th note base)
        const secondsPerBeat = 60.0 / this.bpm;
        this.nextNoteTime += 0.25 * secondsPerBeat;
      }
      this.timerId = window.setTimeout(scheduler, lookahead);
    };

    scheduler();
  }

  public stop() {
    this.isPlaying = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.scheduledPulseTimes = [];
    // A-05 / H-06: every voice here is a short one-shot scheduled ahead of time, so
    // clearing the timer alone left a look-ahead window of sound playing after
    // "stop". Silencing the bus stops it immediately and without a click.
    if (this.masterGain && this.ctx) {
      rampBusMute(this.masterGain, this.ctx, true, this.masterVolume);
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getCurrentTime(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /**
   * Registers a scheduled pulse for tap accuracy checking
   */
  public registerPulseTimestamp(time: number) {
    this.scheduledPulseTimes.push(time);
    // Keep window of last 20 pulses
    if (this.scheduledPulseTimes.length > 20) {
      this.scheduledPulseTimes.shift();
    }
  }

  /**
   * Evaluates user tap accuracy against scheduled pulses
   */
  public evaluateTap(): TapAccuracyResult {
    this.initContext();
    const tapTime = this.ctx ? this.ctx.currentTime : performance.now() / 1000;

    if (this.scheduledPulseTimes.length === 0) {
      return {
        offsetMs: 0,
        absOffsetMs: 0,
        rating: "perfect",
        scorePercent: 100,
      };
    }

    // Find closest pulse
    let minDiff = Infinity;
    let closestPulse = this.scheduledPulseTimes[0];

    for (const p of this.scheduledPulseTimes) {
      const diff = Math.abs(p - tapTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestPulse = p;
      }
    }

    const offsetMs = Math.round((tapTime - closestPulse) * 1000);
    const absOffsetMs = Math.abs(offsetMs);

    let rating: TapAccuracyResult["rating"] = "miss";
    let scorePercent = 0;

    if (absOffsetMs <= 30) {
      rating = "perfect";
      scorePercent = 100;
    } else if (absOffsetMs <= 65) {
      rating = "great";
      scorePercent = Math.round(100 - (absOffsetMs - 30) * 1.2);
    } else if (absOffsetMs <= 120) {
      rating = "good";
      scorePercent = Math.round(60 - (absOffsetMs - 65) * 0.5);
    } else {
      rating = "miss";
      scorePercent = Math.max(10, 40 - (absOffsetMs - 120) * 0.2);
    }

    return {
      offsetMs,
      absOffsetMs,
      rating,
      scorePercent,
    };
  }

  public destroy() {
    this.stop();
    if (this.masterLimiter) {
      this.masterLimiter.dispose();
      this.masterLimiter = null;
    }
    if (this.ctx) {
      // Closing an already-closed context rejects; swallow it rather than producing an
      // unhandled rejection on every unmount (A-05).
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.masterGain = null;
    }
  }
}
