/**
 * 4-Voice Polyphonic Synthesizer with Dual Oscillators & ADSR Envelope Generator (P5-03)
 *
 * Capabilities:
 * - 4-Voice dynamic polyphony with oldest-voice stealing
 * - Dual Oscillators with waveform blending and cent-level detuning
 * - Standard 4-stage ADSR (Attack, Decay, Sustain, Release) envelope
 * - De-clicked exponential audio curve transitions
 * - Dynamic resonant lowpass filter per voice
 */

export interface Adsrenvelope {
  attack: number;  // seconds, >= 0.001
  decay: number;   // seconds, >= 0.01
  sustain: number; // level 0.0 - 1.0
  release: number; // seconds, >= 0.01
}

export interface SynthPreset {
  name: string;
  osc1Type: OscillatorType;
  osc2Type: OscillatorType;
  osc2DetuneCents: number;
  osc2Mix: number;
  filterCutoff: number;
  filterQ: number;
  adsr: Adsrenvelope;
}

export const DEFAULT_SYNTH_PRESETS: Record<string, SynthPreset> = {
  analogLead: {
    name: "Analog Lead",
    osc1Type: "sawtooth",
    osc2Type: "square",
    osc2DetuneCents: 7,
    osc2Mix: 0.4,
    filterCutoff: 3800,
    filterQ: 2.5,
    adsr: { attack: 0.015, decay: 0.12, sustain: 0.7, release: 0.2 },
  },
  warmPad: {
    name: "Warm Poly Pad",
    osc1Type: "triangle",
    osc2Type: "sawtooth",
    osc2DetuneCents: -9,
    osc2Mix: 0.35,
    filterCutoff: 2200,
    filterQ: 1.2,
    adsr: { attack: 0.15, decay: 0.3, sustain: 0.8, release: 0.6 },
  },
  deepPluck: {
    name: "Deep Pluck",
    osc1Type: "square",
    osc2Type: "sawtooth",
    osc2DetuneCents: 5,
    osc2Mix: 0.25,
    filterCutoff: 1800,
    filterQ: 3.0,
    adsr: { attack: 0.005, decay: 0.18, sustain: 0.15, release: 0.15 },
  },
  acidBass: {
    name: "Acid 303 Bass",
    osc1Type: "sawtooth",
    osc2Type: "square",
    osc2DetuneCents: 0,
    osc2Mix: 0.0,
    filterCutoff: 1200,
    filterQ: 6.0,
    adsr: { attack: 0.005, decay: 0.15, sustain: 0.2, release: 0.1 },
  },
};

export interface PolyVoiceCleanup {
  sources: AudioScheduledSourceNode[];
  gains: GainNode[];
  stopTime: number;
}

/**
 * Converts a MIDI note number (0 - 127) to frequency in Hertz (A4 = 69 = 440Hz)
 */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Synthesizes a note on the 4-Voice Polyphonic Synth
 */
export function playPolySynthNote(
  ctx: BaseAudioContext,
  dest: AudioNode,
  midiNote: number,
  time: number,
  durationSec: number,
  velocity: number,
  preset: SynthPreset = DEFAULT_SYNTH_PRESETS.analogLead
): PolyVoiceCleanup {
  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];

  const freq = midiToFreq(midiNote);
  const { osc1Type, osc2Type, osc2DetuneCents, osc2Mix, filterCutoff, filterQ, adsr } = preset;

  // Dual Oscillators
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();

  osc1.type = osc1Type;
  osc1.frequency.setValueAtTime(freq, time);

  osc2.type = osc2Type;
  osc2.frequency.setValueAtTime(freq, time);
  osc2.detune.setValueAtTime(osc2DetuneCents, time);

  // Mixer
  const osc1Gain = ctx.createGain();
  const osc2Gain = ctx.createGain();
  osc1Gain.gain.setValueAtTime(1 - osc2Mix * 0.5, time);
  osc2Gain.gain.setValueAtTime(osc2Mix, time);

  osc1.connect(osc1Gain);
  osc2.connect(osc2Gain);

  // Per-voice Resonant Biquad Filter
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(filterCutoff, time);
  filter.Q.setValueAtTime(filterQ, time);

  // Dynamic filter sweep matching attack/decay
  const peakFilter = Math.min(filterCutoff * 2.5, 18000);
  filter.frequency.exponentialRampToValueAtTime(peakFilter, time + adsr.attack);
  filter.frequency.exponentialRampToValueAtTime(filterCutoff, time + adsr.attack + adsr.decay);

  osc1Gain.connect(filter);
  osc2Gain.connect(filter);

  // ADSR Amp Envelope
  const ampGain = ctx.createGain();
  const maxVolume = velocity * 0.8;
  const attackEnd = time + Math.max(0.002, adsr.attack);
  const decayEnd = attackEnd + Math.max(0.01, adsr.decay);
  const sustainLevel = Math.max(0.0001, maxVolume * adsr.sustain);
  const noteReleaseStart = time + Math.max(0.05, durationSec);
  const noteEndTime = noteReleaseStart + Math.max(0.01, adsr.release);

  // Initial silence (prevent pop)
  ampGain.gain.setValueAtTime(0.0001, time);
  // Attack: linear or exponential ramp to maxVolume
  ampGain.gain.exponentialRampToValueAtTime(Math.max(0.001, maxVolume), attackEnd);
  // Decay: exponential ramp to sustainLevel
  ampGain.gain.exponentialRampToValueAtTime(sustainLevel, decayEnd);
  // Hold sustain until note release start
  ampGain.gain.setValueAtTime(sustainLevel, noteReleaseStart);
  // Release: exponential decay to zero
  ampGain.gain.exponentialRampToValueAtTime(0.0001, noteEndTime);

  filter.connect(ampGain);
  ampGain.connect(dest);

  osc1.start(time);
  osc2.start(time);
  osc1.stop(noteEndTime + 0.01);
  osc2.stop(noteEndTime + 0.01);

  sources.push(osc1, osc2);
  gains.push(ampGain);

  return { sources, gains, stopTime: noteEndTime + 0.01 };
}
