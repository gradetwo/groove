/**
 * High-Fidelity Web Audio Synthesizer for Chords, Piano, and Guitar
 * Pure native Web Audio API with zero external soundfont dependencies.
 * Provides physical modeling for Acoustic Piano, Acoustic/Nylon Guitar,
 * and Overdriven Power Guitar with strumming, arpeggios, and balladic rhythms.
 */

import { getChordMidiNotes, ChordDefinition, Inversion } from "../utils/chordTheory";

export type InstrumentTimbre = "piano" | "guitar" | "power-guitar";
export type PlayingStyle = "block" | "strum" | "arpeggio" | "ballad";

export interface ChordPlaybackInfo {
  chordIndex: number;
  totalChords: number;
  activeNotes: number[]; // MIDI notes currently vibrating
  beatInBar: number;
  time: number;
}

export class ChordAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private isPlaying = false;

  // Active voice registry for panic() and scheduled voice cancellations
  private activeVoices: Array<{ source: AudioScheduledSourceNode; gain: GainNode; stopTime: number }> = [];
  private unlockHandler: (() => void) | null = null;

  // Timbre & Style
  private timbre: InstrumentTimbre = "piano";
  private style: PlayingStyle = "block";
  private bpm = 110;
  private isLooping = true;

  // Distortion curve cache for power guitar
  private distortionCurve: Float32Array | null = null;

  // Sequencer loop state
  private timerId: any = null;
  private nextEventTime = 0;
  private currentChordIdx = 0;
  private currentBeat = 0;
  private activeChords: ChordDefinition[] = [];
  private onPlaybackStep?: (info: ChordPlaybackInfo) => void;

  constructor() {
    this.initAudioContext();
  }

  public initAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;

    try {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
          this.masterGain = this.ctx.createGain();
          this.masterGain.gain.setValueAtTime(0.75, this.ctx.currentTime);

          // Limiter DynamicsCompressor to avoid clipping during dense voicings
          this.limiter = this.ctx.createDynamicsCompressor();
          this.limiter.threshold.setValueAtTime(-1.0, this.ctx.currentTime);
          this.limiter.knee.setValueAtTime(0.0, this.ctx.currentTime);
          this.limiter.ratio.setValueAtTime(20.0, this.ctx.currentTime);
          this.limiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
          this.limiter.release.setValueAtTime(0.05, this.ctx.currentTime);

          this.masterGain.connect(this.limiter);
          this.limiter.connect(this.ctx.destination);
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
      console.warn("[ChordAudioEngine] Error initializing AudioContext:", e);
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
        console.warn("[ChordAudioEngine] Error resuming AudioContext:", e);
      }
    }
  }

  /**
   * Registers scheduled voice nodes for cancellation
   */
  private registerVoice(source: AudioScheduledSourceNode, gain: GainNode, stopTime: number): void {
    if (this.ctx) {
      const now = this.ctx.currentTime;
      this.activeVoices = this.activeVoices.filter((v) => v.stopTime > now);
    }
    this.activeVoices.push({ source, gain, stopTime });
  }

  /**
   * Panic: cancels all actively scheduled voices smoothly
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
        // Voice might already be stopped
      }
    }
    this.activeVoices = [];
  }

  public setTimbre(timbre: InstrumentTimbre): void {
    this.timbre = timbre;
  }

  public setStyle(style: PlayingStyle): void {
    this.style = style;
  }

  public setBpm(bpm: number): void {
    this.bpm = Math.max(40, Math.min(240, bpm));
  }

  public setLoop(loop: boolean): void {
    this.isLooping = loop;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * Generates a smooth warm overdrive saturation curve for power guitar
   */
  private getDistortionCurve(): Float32Array {
    if (this.distortionCurve) return this.distortionCurve;
    const nSamples = 44100;
    const curve = new Float32Array(nSamples);
    const k = 38; // Saturation amount
    for (let i = 0; i < nSamples; i++) {
      const x = (i * 2) / nSamples - 1;
      // Hyperbolic tangent soft saturation with harmonic warmth
      curve[i] = Math.tanh(k * x) * 0.7 + Math.sin(x * Math.PI) * 0.15;
    }
    this.distortionCurve = curve;
    return curve;
  }

  /**
   * Plays a single MIDI note using Acoustic Grand Piano physical modeling
   */
  private playPianoNote(midi: number, time: number, duration: number, velocity = 0.8): void {
    if (!this.ctx || !this.masterGain) return;

    const freq = this.midiToFreq(midi);
    const now = Math.max(time, this.ctx.currentTime);

    // Dynamic duration based on pitch: bass sustains longer, treble decays faster
    const naturalDecay = Math.max(0.6, 3.6 - (midi - 36) * 0.045);
    const noteDuration = Math.min(duration, naturalDecay);

    // Fundamental + 2nd harmonic detuned pair (Piano 2-string unison simulation)
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const osc3 = this.ctx.createOscillator();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(freq, now);

    // Slight micro-detune (0.5 - 1.2 cents) creates that rich acoustic chorus
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(freq * 1.0008, now);

    // 2nd harmonic resonance
    osc3.type = "sine";
    osc3.frequency.setValueAtTime(freq * 2.0002, now);

    // Soundboard dynamic filter (frequency tracking: brighter when hit harder)
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    const cutoff = Math.min(12000, freq * (3.5 + velocity * 2.5));
    filter.frequency.setValueAtTime(cutoff, now);
    filter.frequency.exponentialRampToValueAtTime(Math.min(6000, freq * 1.8), now + noteDuration);

    // Note gain envelope: instantaneous attack (felt strike), quick decay, natural ringout
    const noteGain = this.ctx.createGain();
    const peakGain = Math.min(1.0, velocity * (0.28 / Math.sqrt(midi / 50)));
    noteGain.gain.setValueAtTime(0.0001, now);
    noteGain.gain.linearRampToValueAtTime(peakGain, now + 0.006); // 6ms attack
    noteGain.gain.exponentialRampToValueAtTime(peakGain * 0.58, now + 0.22); // Initial drop
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + noteDuration);

    // Hammer strike click transient (percussive wooden/felt click)
    const hammerGain = this.ctx.createGain();
    const hammerOsc = this.ctx.createOscillator();
    hammerOsc.type = "triangle";
    hammerOsc.frequency.setValueAtTime(Math.min(1400, freq * 4.2), now);
    hammerGain.gain.setValueAtTime(velocity * 0.12, now);
    hammerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018); // 18ms transient
    hammerOsc.connect(hammerGain);
    hammerGain.connect(filter);
    hammerOsc.start(now);
    hammerOsc.stop(now + 0.02);
    this.registerVoice(hammerOsc, hammerGain, now + 0.02);

    osc1.connect(noteGain);
    osc2.connect(noteGain);
    osc3.connect(noteGain);
    noteGain.connect(filter);
    filter.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);

    const stopTime = now + noteDuration + 0.05;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    osc3.stop(stopTime);
    this.registerVoice(osc1, noteGain, stopTime);
    this.registerVoice(osc2, noteGain, stopTime);
    this.registerVoice(osc3, noteGain, stopTime);
  }

  /**
   * Plays a single MIDI note using Acoustic / Nylon Guitar string pluck modeling
   */
  private playGuitarNote(midi: number, time: number, duration: number, velocity = 0.8): void {
    if (!this.ctx || !this.masterGain) return;

    const freq = this.midiToFreq(midi);
    const now = Math.max(time, this.ctx.currentTime);
    const noteDuration = Math.min(duration, 2.4);

    // Guitar string pluck oscillator: bright saw/triangle blend with fast harmonic decay
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, now);

    // Sub-harmonic warm body fundamental
    const subOsc = this.ctx.createOscillator();
    subOsc.type = "triangle";
    subOsc.frequency.setValueAtTime(freq, now);

    // Acoustic wooden body resonance (comb filter / bandpass peaking around 220Hz and 2800Hz)
    const bodyFilter = this.ctx.createBiquadFilter();
    bodyFilter.type = "bandpass";
    bodyFilter.frequency.setValueAtTime(Math.max(120, Math.min(4200, freq * 1.5)), now);
    bodyFilter.Q.setValueAtTime(1.8, now);

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(Math.min(9000, freq * 4.5), now);
    lowpass.frequency.exponentialRampToValueAtTime(Math.min(2200, freq * 1.3), now + 0.35);

    const gain = this.ctx.createGain();
    const peakGain = Math.min(0.9, velocity * 0.24);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.004); // Fast 4ms pluck
    gain.gain.exponentialRampToValueAtTime(peakGain * 0.45, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + noteDuration);

    osc.connect(lowpass);
    subOsc.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    subOsc.start(now);

    const stopTime = now + noteDuration + 0.05;
    osc.stop(stopTime);
    subOsc.stop(stopTime);
    this.registerVoice(osc, gain, stopTime);
    this.registerVoice(subOsc, gain, stopTime);
  }

  /**
   * Plays a single MIDI note using Overdriven Power Guitar (Amp + Cabinet simulation)
   */
  private playPowerGuitarNote(midi: number, time: number, duration: number, velocity = 0.9): void {
    if (!this.ctx || !this.masterGain) return;

    const freq = this.midiToFreq(midi);
    const now = Math.max(time, this.ctx.currentTime);
    const noteDuration = Math.min(duration, 2.2);

    // Dual pulse/saw oscillators for aggressive growl
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();

    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(freq, now);

    osc2.type = "square";
    osc2.frequency.setValueAtTime(freq * 1.002, now); // Micro detune for heavy thick wall

    // Pre-distortion gain boost
    const preGain = this.ctx.createGain();
    preGain.gain.setValueAtTime(1.8, now);

    // Waveshaper distortion
    const distortion = this.ctx.createWaveShaper();
    distortion.curve = this.getDistortionCurve() as any;
    distortion.oversample = "2x";

    // 4x12 Marshall Cabinet speaker filter emulation
    // Guitar speakers cut harshly above 5kHz and below 80Hz
    const cabFilter = this.ctx.createBiquadFilter();
    cabFilter.type = "lowpass";
    cabFilter.frequency.setValueAtTime(3600, now);
    cabFilter.Q.setValueAtTime(1.2, now);

    const cabHighpass = this.ctx.createBiquadFilter();
    cabHighpass.type = "highpass";
    cabHighpass.frequency.setValueAtTime(95, now);

    const gain = this.ctx.createGain();
    const peakGain = Math.min(0.85, velocity * 0.22);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(peakGain * 0.72, now + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + noteDuration);

    osc1.connect(preGain);
    osc2.connect(preGain);
    preGain.connect(distortion);
    distortion.connect(cabHighpass);
    cabHighpass.connect(cabFilter);
    cabFilter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);

    const stopTime = now + noteDuration + 0.05;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    this.registerVoice(osc1, gain, stopTime);
    this.registerVoice(osc2, gain, stopTime);
  }

  /**
   * Plays an entire chord with specified timbre and style
   */
  public triggerChord(
    chord: ChordDefinition, 
    timbre?: InstrumentTimbre, 
    style?: PlayingStyle, 
    durationSec?: number,
    velocity = 0.85
  ): number[] {
    if (!this.ctx) this.initAudioContext();
    if (!this.ctx) return [];
    if (this.ctx.state === "suspended") this.ctx.resume();

    const t = timbre || this.timbre;
    const s = style || this.style;
    const notes = getChordMidiNotes(chord.root, chord.quality, 4, chord.inversion || 0, t);
    const dur = durationSec || (60 / this.bpm) * (chord.duration ?? 4);
    const now = this.ctx.currentTime;

    this.playVoicing(notes, now, dur, t, s, velocity);
    return notes;
  }

  /**
   * Plays a single note by MIDI number (P3-19)
   */
  public triggerNote(
    midi: number, 
    timbre?: InstrumentTimbre, 
    durationSec = 1.2, 
    velocity = 0.85
  ): void {
    if (!this.ctx) this.initAudioContext();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();

    const t = timbre || this.timbre;
    const now = this.ctx.currentTime;
    if (t === "piano") {
      this.playPianoNote(midi, now, durationSec, velocity);
    } else if (t === "power-guitar") {
      this.playPowerGuitarNote(midi, now, durationSec, velocity);
    } else {
      this.playGuitarNote(midi, now, durationSec, velocity);
    }
  }

  /**
   * Dispatches notes across time according to playing style (Strumming, Arpeggio, Ballad, Block)
   */
  private playVoicing(
    notes: number[], 
    time: number, 
    duration: number, 
    timbre: InstrumentTimbre, 
    style: PlayingStyle, 
    velocity = 0.8
  ): void {
    if (notes.length === 0) return;

    const playNote = (midi: number, t: number, d: number, v: number) => {
      if (timbre === "piano") {
        this.playPianoNote(midi, t, d, v);
      } else if (timbre === "power-guitar") {
        this.playPowerGuitarNote(midi, t, d, v);
      } else {
        this.playGuitarNote(midi, t, d, v);
      }
    };

    if (style === "block") {
      // All notes struck simultaneously with microscopic organic spread (2-4ms)
      notes.forEach((midi, i) => {
        const microJitter = (i * 0.003) * (Math.random() * 0.5 + 0.75);
        playNote(midi, time + microJitter, duration, velocity);
      });
    } else if (style === "strum") {
      // Natural guitar downstroke strumming delay (18 - 25ms between consecutive strings)
      const strumDelay = timbre === "guitar" ? 0.024 : 0.016;
      notes.forEach((midi, i) => {
        const noteTime = time + i * strumDelay;
        const noteVel = velocity * (0.9 + (i / notes.length) * 0.2);
        playNote(midi, noteTime, duration - (i * strumDelay), noteVel);
      });
    } else if (style === "arpeggio") {
      // Flowing 8th-note or 16th-note arpeggio steps
      const stepDur = (60 / this.bpm) * 0.5; // Eighth note
      const totalSteps = Math.max(4, Math.floor(duration / stepDur));
      for (let s = 0; s < totalSteps; s++) {
        const noteIdx = s % notes.length;
        const noteTime = time + s * stepDur;
        playNote(notes[noteIdx], noteTime, stepDur * 1.8, velocity * (s % 2 === 0 ? 0.95 : 0.75));
      }
    } else if (style === "ballad") {
      // Pop ballad: Deep bass root on beat 1, upper chord keys on beats 1, 2, 3, 4
      const beatDur = 60 / this.bpm;
      const bassNote = notes[0];
      const upperNotes = notes.slice(1);

      // Bass note hits on beat 1 and beat 3
      playNote(bassNote, time, duration * 0.5, velocity * 1.1);
      playNote(bassNote, time + beatDur * 2, duration * 0.5, velocity * 0.85);

      // Upper chord pulses
      [0, 1, 2, 3].forEach((b) => {
        const bTime = time + b * beatDur;
        upperNotes.forEach((midi, i) => {
          const jitter = i * 0.004;
          const v = velocity * (b === 0 ? 0.9 : b === 2 ? 0.85 : 0.65);
          playNote(midi, bTime + jitter, beatDur * 1.4, v);
        });
      });
    }
  }

  /**
   * Start sequential playback of a progression loop
   */
  public startProgression(
    chords: ChordDefinition[], 
    onStep?: (info: ChordPlaybackInfo) => void
  ): void {
    if (chords.length === 0) return;
    if (!this.ctx) this.initAudioContext();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();

    this.stop();
    this.activeChords = chords;
    this.onPlaybackStep = onStep;
    this.isPlaying = true;
    this.currentChordIdx = 0;
    this.currentBeat = 0;
    this.nextEventTime = this.ctx.currentTime + 0.05;

    this.scheduleNext();
  }

  private scheduleNext = () => {
    if (!this.isPlaying || !this.ctx || this.activeChords.length === 0) return;

    const chord = this.activeChords[this.currentChordIdx];
    const chordBeats = chord.duration ?? 4;
    const beatDur = 60 / this.bpm;
    const chordDurationSec = chordBeats * beatDur;

    const notes = getChordMidiNotes(chord.root, chord.quality, 4, chord.inversion || 0, this.timbre);
    this.playVoicing(notes, this.nextEventTime, chordDurationSec, this.timbre, this.style, 0.85);

    if (this.onPlaybackStep) {
      this.onPlaybackStep({
        chordIndex: this.currentChordIdx,
        totalChords: this.activeChords.length,
        activeNotes: notes,
        beatInBar: 1,
        time: this.nextEventTime,
      });
    }

    this.nextEventTime += chordDurationSec;
    this.currentChordIdx++;

    if (this.currentChordIdx >= this.activeChords.length) {
      if (this.isLooping) {
        this.currentChordIdx = 0;
      } else {
        this.stop();
        return;
      }
    }

    const waitMs = Math.max(20, (this.nextEventTime - this.ctx.currentTime - 0.08) * 1000);
    this.timerId = setTimeout(this.scheduleNext, waitMs);
  };

  public stop(): void {
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.panic();
  }

  public destroy(): void {
    this.stop();
    this.cleanupUnlockListeners();
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.masterGain = null;
    this.limiter = null;
  }
}
