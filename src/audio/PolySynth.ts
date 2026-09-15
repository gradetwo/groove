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

import { safeGain, safeFreq, safeVelocity } from "./dspGuards";

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

/**
 * Factory synth presets.
 *
 * The four original keys (`analogLead`, `warmPad`, `deepPluck`, `acidBass`) are
 * load-bearing: they are referenced by identity from the engine's legacy track-role
 * fallbacks and pinned by `src/test/polySynth.test.ts`, so their values must not drift.
 *
 * Every key added below backs one `track.instrument` name declared by the genre data.
 * `src/audio/instrumentPresets.ts` owns the instrument-name → preset-key mapping and is
 * the only place callers should translate a genre instrument into a timbre.
 */
export const DEFAULT_SYNTH_PRESETS: Record<string, SynthPreset> = {
  // --- Legacy track-role presets (kept bit-for-bit) -------------------------
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

  // --- Leads ---------------------------------------------------------------
  // `saw_lead`: the classic detuned dual-saw stack. osc2 sits a wide 12 cents
  // sharp so the pair beats audibly without turning into a chorus effect.
  sawLead: {
    name: "Saw Lead",
    osc1Type: "sawtooth",
    osc2Type: "sawtooth",
    osc2DetuneCents: 12,
    osc2Mix: 0.5,
    filterCutoff: 4200,
    filterQ: 2.2,
    adsr: { attack: 0.012, decay: 0.15, sustain: 0.75, release: 0.22 },
  },
  // `square_lead`: hollow PWM-ish square, narrower detune and a gentler filter
  // so the odd harmonics dominate instead of the saw fizz.
  squareLead: {
    name: "Square Lead",
    osc1Type: "square",
    osc2Type: "square",
    osc2DetuneCents: 8,
    osc2Mix: 0.3,
    filterCutoff: 3000,
    filterQ: 1.4,
    adsr: { attack: 0.008, decay: 0.12, sustain: 0.7, release: 0.18 },
  },
  // `guitar_lead`: saw + triangle with a fast pluck and a resonant midrange,
  // i.e. a single-coil-ish electric lead rather than a synth brass.
  guitarLead: {
    name: "Guitar Lead",
    osc1Type: "sawtooth",
    osc2Type: "triangle",
    osc2DetuneCents: 5,
    osc2Mix: 0.28,
    filterCutoff: 2700,
    filterQ: 3.5,
    adsr: { attack: 0.005, decay: 0.35, sustain: 0.28, release: 0.28 },
  },
  // `flute_lead`: near-pure sine body with a triangle edge, slow soft attack,
  // low resonance and a 6-cent detune — enough movement for a breathy vibrato
  // without the saw buzz that made the old analog lead wrong for flute genres.
  fluteLead: {
    name: "Flute Lead",
    osc1Type: "sine",
    osc2Type: "triangle",
    osc2DetuneCents: 6,
    osc2Mix: 0.28,
    filterCutoff: 2600,
    filterQ: 0.9,
    adsr: { attack: 0.12, decay: 0.18, sustain: 0.85, release: 0.32 },
  },
  // `pluck_synth`: very short triangle/square bite, no sustain worth holding.
  pluckSynth: {
    name: "Pluck Synth",
    osc1Type: "triangle",
    osc2Type: "square",
    osc2DetuneCents: 4,
    osc2Mix: 0.3,
    filterCutoff: 2000,
    filterQ: 4.5,
    adsr: { attack: 0.003, decay: 0.14, sustain: 0.06, release: 0.12 },
  },

  // --- Chords / pads -------------------------------------------------------
  // `supersaw`: two saws an intentionally wide 26 cents apart (more than twice
  // sawLead) through a bright, low-Q filter — the trance/EDM wall of sound.
  supersaw: {
    name: "Supersaw",
    osc1Type: "sawtooth",
    osc2Type: "sawtooth",
    osc2DetuneCents: 26,
    osc2Mix: 0.55,
    filterCutoff: 6500,
    filterQ: 1.0,
    adsr: { attack: 0.02, decay: 0.35, sustain: 0.85, release: 0.45 },
  },
  // `rhodes_ep`: sine body + triangle tine, instantaneous attack and a long
  // decay into a low sustain — the electric-piano "bell then body" contour.
  rhodesEp: {
    name: "Rhodes EP",
    osc1Type: "sine",
    osc2Type: "triangle",
    osc2DetuneCents: 4,
    osc2Mix: 0.32,
    filterCutoff: 3200,
    filterQ: 1.1,
    adsr: { attack: 0.004, decay: 0.9, sustain: 0.3, release: 0.5 },
  },
  // `m1_organ`: square + sine locked at 0 cents with a near-instant swell and
  // full sustain — drawbar organ, no decay.
  m1Organ: {
    name: "M1 Organ",
    osc1Type: "square",
    osc2Type: "sine",
    osc2DetuneCents: 0,
    osc2Mix: 0.5,
    filterCutoff: 5200,
    filterQ: 0.7,
    adsr: { attack: 0.006, decay: 0.06, sustain: 0.95, release: 0.16 },
  },
  // `brass_synth`: saw + square with a 70 ms bloom and a resonant 2.5 kHz
  // filter — the synth-brass swell rather than a static pad.
  brassSynth: {
    name: "Brass Synth",
    osc1Type: "sawtooth",
    osc2Type: "square",
    osc2DetuneCents: 9,
    osc2Mix: 0.35,
    filterCutoff: 2500,
    filterQ: 2.4,
    adsr: { attack: 0.07, decay: 0.25, sustain: 0.8, release: 0.3 },
  },

  // --- Basses --------------------------------------------------------------
  // `sub_bass`: a single sine, no second harmonic, filter wide open relative to
  // nothing (320 Hz) and a 4 ms attack — pure weight, no note definition.
  subBass: {
    name: "Sub Bass",
    osc1Type: "sine",
    osc2Type: "sine",
    osc2DetuneCents: 0,
    osc2Mix: 0.0,
    filterCutoff: 320,
    filterQ: 0.8,
    adsr: { attack: 0.004, decay: 0.14, sustain: 0.9, release: 0.14 },
  },
  // `808_bass`: sine fundamental with a tiny triangle edge and a long 0.9 s
  // decay — the sustained 808 tail, distinct from the dry sub_bass.
  bass808: {
    name: "808 Bass",
    osc1Type: "sine",
    osc2Type: "triangle",
    osc2DetuneCents: 3,
    osc2Mix: 0.12,
    filterCutoff: 480,
    filterQ: 0.9,
    adsr: { attack: 0.004, decay: 0.9, sustain: 0.55, release: 0.5 },
  },
  // `reese_bass`: two saws 28 cents apart through a dark 620 Hz filter — the
  // slow beating that defines the Reese, no sub-sine reinforcement.
  reeseBass: {
    name: "Reese Bass",
    osc1Type: "sawtooth",
    osc2Type: "sawtooth",
    osc2DetuneCents: 28,
    osc2Mix: 0.55,
    filterCutoff: 620,
    filterQ: 3.0,
    adsr: { attack: 0.012, decay: 0.35, sustain: 0.85, release: 0.3 },
  },
  // `walking_upright`: triangle + sine, woody low-pass at 700 Hz, short sustain
  // and a fast decay — a plucked double bass, not a sine sub.
  walkingUpright: {
    name: "Walking Upright",
    osc1Type: "triangle",
    osc2Type: "sine",
    osc2DetuneCents: 2,
    osc2Mix: 0.3,
    filterCutoff: 700,
    filterQ: 2.0,
    adsr: { attack: 0.02, decay: 0.5, sustain: 0.15, release: 0.3 },
  },
  // `slap_bass`: square + saw with a 2 ms attack, 6 kHz-ish resonance and a
  // short gate — the pop of a thumb slap.
  slapBass: {
    name: "Slap Bass",
    osc1Type: "square",
    osc2Type: "sawtooth",
    osc2DetuneCents: 6,
    osc2Mix: 0.3,
    filterCutoff: 2000,
    filterQ: 6.0,
    adsr: { attack: 0.002, decay: 0.2, sustain: 0.1, release: 0.12 },
  },
  // `distorted_kick`: a few genres declare this on the *bass* track, so it needs
  // a synth voice of its own: saw + square saturating through a 900 Hz band.
  distortedKickBass: {
    name: "Distorted Kick Bass",
    osc1Type: "sawtooth",
    osc2Type: "square",
    osc2DetuneCents: 0,
    osc2Mix: 0.25,
    filterCutoff: 900,
    filterQ: 5.0,
    adsr: { attack: 0.002, decay: 0.25, sustain: 0.4, release: 0.15 },
  },

  // --- FX ------------------------------------------------------------------
  // `noise_sweep`: every fx track declares this name. The live engine and the
  // offline renderer keep their dedicated swept-oscillator riser (see playFX /
  // synthFX) so the two stay sample-identical; this preset is the resolver's
  // anchor for the name and is what a future non-sweep fx voice would start from.
  noiseSweep: {
    name: "Noise Sweep",
    osc1Type: "sawtooth",
    osc2Type: "sawtooth",
    osc2DetuneCents: 0,
    osc2Mix: 0.0,
    filterCutoff: 1200,
    filterQ: 5.0,
    adsr: { attack: 0.01, decay: 0.4, sustain: 0.4, release: 0.25 },
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

  const freq = safeFreq(midiToFreq(midiNote), 440);
  // F-01: velocity drives exponential ramps; a zero (or a preset with cutoff 0)
  // would throw a RangeError and take the whole scheduler down with it.
  const safeVel = safeVelocity(velocity);
  const { osc1Type, osc2Type, osc2DetuneCents, osc2Mix, filterQ, adsr } = preset;
  const filterCutoff = safeFreq(preset.filterCutoff, 12000);

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
  const peakFilter = safeFreq(Math.min(filterCutoff * 2.5, 18000));
  filter.frequency.exponentialRampToValueAtTime(peakFilter, time + adsr.attack);
  filter.frequency.exponentialRampToValueAtTime(filterCutoff, time + adsr.attack + adsr.decay);

  osc1Gain.connect(filter);
  osc2Gain.connect(filter);

  // ADSR Amp Envelope
  const ampGain = ctx.createGain();
  const maxVolume = safeGain(safeVel * 0.8, 0.001);
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
