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
  /**
   * Optional white-noise blend (0–1) mixed into the filter input next to the two
   * oscillators. Only the noise-based FX voices (vinyl crackle, risers, reverse
   * cymbals, sub sweeps) set it; a preset that omits it stays a pure dual-oscillator
   * voice, so the cost and the voice shape of every melodic preset are unchanged.
   */
  noiseMix?: number;
  /**
   * Optional pitch offset, in cents, reached at the *end* of the note. The oscillators
   * glide exponentially from their nominal pitch to `freq · 2^(cents/1200)` over the note
   * gate: negative values voice tape-stop / laser / sub-drop falls, positive values a riser.
   */
  pitchSweepCents?: number;
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
  // `distorted_guitar`: the high-gain *rhythm* voice, deliberately not a louder
  // `guitar_lead`. Power chords and palm mutes live in the low-mids, so the cutoff sits
  // far below the lead's and the resonance is much higher — that midrange honk is what
  // makes a distorted chord cut instead of fizzing. Two saws at a wider mix give the
  // thick double-tracked wall; a fast attack and a short release keep the chugs tight,
  // which is the articulation the metal genres ask for.
  distortedGuitar: {
    name: "Distorted Guitar",
    osc1Type: "sawtooth",
    osc2Type: "sawtooth",
    osc2DetuneCents: 7,
    osc2Mix: 0.85,
    filterCutoff: 1500,
    filterQ: 6.5,
    adsr: { attack: 0.003, decay: 0.18, sustain: 0.18, release: 0.12 },
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

  // --- Basses the curated genre data needs ---------------------------------
  // `finger_bass`: a plucked electric bass guitar. Triangle body + a quiet saw edge,
  // woody 900 Hz low-pass with a short 0.45 s decay — fingerstyle, not a sine sub.
  fingerBass: {
    name: "Fingerstyle Bass",
    osc1Type: "triangle",
    osc2Type: "sawtooth",
    osc2DetuneCents: 4,
    osc2Mix: 0.22,
    filterCutoff: 900,
    filterQ: 1.6,
    adsr: { attack: 0.008, decay: 0.45, sustain: 0.32, release: 0.22 },
  },
  // `pick_bass`: the rock/metal picked electric bass. More square bite than the
  // fingerstyle voice, a 1.4 kHz filter so the pick click survives, short gate.
  pickBass: {
    name: "Picked Bass",
    osc1Type: "sawtooth",
    osc2Type: "square",
    osc2DetuneCents: 3,
    osc2Mix: 0.3,
    filterCutoff: 1400,
    filterQ: 2.6,
    adsr: { attack: 0.003, decay: 0.3, sustain: 0.38, release: 0.16 },
  },
  // `analog_bass`: Minimoog-style synth bass. Detuned saw + square through a dark
  // 700 Hz resonant filter, sustaining instead of decaying like the plucked voices.
  analogBass: {
    name: "Analog Synth Bass",
    osc1Type: "sawtooth",
    osc2Type: "square",
    osc2DetuneCents: 6,
    osc2Mix: 0.35,
    filterCutoff: 700,
    filterQ: 3.2,
    adsr: { attack: 0.006, decay: 0.28, sustain: 0.5, release: 0.18 },
  },

  // --- Acoustic / world leads & comping voices -----------------------------
  // `sax_lead`: reed body from a detuned saw+square pair, a 35 ms tongue attack and a
  // 2.9 kHz formant-ish resonance. Slower and rounder than the synth brass.
  saxLead: {
    name: "Sax Lead",
    osc1Type: "sawtooth",
    osc2Type: "square",
    osc2DetuneCents: 7,
    osc2Mix: 0.32,
    filterCutoff: 2900,
    filterQ: 2.0,
    adsr: { attack: 0.035, decay: 0.22, sustain: 0.82, release: 0.26 },
  },
  // `trumpet_lead`: brighter and more brilliant than the sax — 4 kHz cutoff, wider
  // 10-cent detune and a slightly longer lip-swell attack.
  trumpetLead: {
    name: "Trumpet Lead",
    osc1Type: "sawtooth",
    osc2Type: "square",
    osc2DetuneCents: 10,
    osc2Mix: 0.38,
    filterCutoff: 4000,
    filterQ: 2.2,
    adsr: { attack: 0.045, decay: 0.18, sustain: 0.78, release: 0.22 },
  },
  // `muted_trumpet`: a harmon mute pinches the spectrum, so the square leads, the
  // low-pass sits at 1.9 kHz with a high Q, and the attack stays soft.
  mutedTrumpet: {
    name: "Muted Trumpet",
    osc1Type: "square",
    osc2Type: "sawtooth",
    osc2DetuneCents: 5,
    osc2Mix: 0.28,
    filterCutoff: 1900,
    filterQ: 4.0,
    adsr: { attack: 0.03, decay: 0.2, sustain: 0.75, release: 0.2 },
  },
  // `brass_section`: three-ish horns faked by two saws 16 cents apart with a shared
  // 40 ms bloom — the section stab, wider and less focused than a solo trumpet.
  brassSection: {
    name: "Brass Section",
    osc1Type: "sawtooth",
    osc2Type: "sawtooth",
    osc2DetuneCents: 16,
    osc2Mix: 0.5,
    filterCutoff: 3200,
    filterQ: 1.8,
    adsr: { attack: 0.04, decay: 0.24, sustain: 0.8, release: 0.24 },
  },
  // `piano_lead`: hard hammer transient, a 1.2 s decay into almost no sustain and a
  // 4.4 kHz body — brighter and more percussive than `rhodes_ep`.
  pianoLead: {
    name: "Acoustic Piano",
    osc1Type: "sawtooth",
    osc2Type: "sine",
    osc2DetuneCents: 3,
    osc2Mix: 0.24,
    filterCutoff: 4400,
    filterQ: 1.0,
    adsr: { attack: 0.002, decay: 1.2, sustain: 0.12, release: 0.4 },
  },
  // `organ_lead`: drawbar tone locked at 0 cents (no beating), instant swell, full
  // sustain and a 6.2 kHz filter — a Hammond B3 with the Leslie opened up. Distinct
  // from `m1_organ` (which has a percussive 60 ms decay and a mid 5.2 kHz cutoff).
  organLead: {
    name: "Hammond Organ",
    osc1Type: "square",
    osc2Type: "sine",
    osc2DetuneCents: 0,
    osc2Mix: 0.45,
    filterCutoff: 6200,
    filterQ: 0.6,
    adsr: { attack: 0.004, decay: 0.12, sustain: 0.94, release: 0.12 },
  },
  // `vibraphone`: almost-pure sine bars with a triangle overtone, a very long 1.6 s
  // decay and a low 0.05 sustain — the motor-driven metal bar ring.
  vibraphone: {
    name: "Vibraphone",
    osc1Type: "sine",
    osc2Type: "triangle",
    osc2DetuneCents: 2,
    osc2Mix: 0.3,
    filterCutoff: 5000,
    filterQ: 1.3,
    adsr: { attack: 0.002, decay: 1.6, sustain: 0.05, release: 0.8 },
  },
  // `strings_lead`: a bowed ensemble — two saws 18 cents apart, a very slow 350 ms
  // bow attack and a long 0.9 s release over a soft 3.4 kHz filter.
  stringsLead: {
    name: "String Ensemble",
    osc1Type: "sawtooth",
    osc2Type: "sawtooth",
    osc2DetuneCents: 18,
    osc2Mix: 0.5,
    filterCutoff: 3400,
    filterQ: 0.8,
    adsr: { attack: 0.35, decay: 0.4, sustain: 0.9, release: 0.9 },
  },
  // `pluck_string`: nylon/koto-style plucked string — triangle body with a saw edge,
  // a resonant 2.4 kHz filter and a 0.5 s decay with almost no sustain.
  pluckString: {
    name: "Plucked String",
    osc1Type: "triangle",
    osc2Type: "sawtooth",
    osc2DetuneCents: 6,
    osc2Mix: 0.24,
    filterCutoff: 2400,
    filterQ: 3.0,
    adsr: { attack: 0.002, decay: 0.5, sustain: 0.05, release: 0.28 },
  },
  // `pan_flute`: near-pure sine/triangle like `flute_lead`, but with a 16 % noise bed
  // for the breathy edge and a shorter 60 ms attack.
  panFlute: {
    name: "Pan Flute",
    osc1Type: "sine",
    osc2Type: "triangle",
    osc2DetuneCents: 5,
    osc2Mix: 0.22,
    filterCutoff: 3000,
    filterQ: 0.7,
    adsr: { attack: 0.06, decay: 0.16, sustain: 0.85, release: 0.28 },
    noiseMix: 0.16,
  },
  // `sitar_lead`: the jawari buzz comes from a wide 22-cent saw/square pair through a
  // 5-Q 3.8 kHz resonance, with a 0.9 s drone-ish decay.
  sitarLead: {
    name: "Sitar Lead",
    osc1Type: "sawtooth",
    osc2Type: "square",
    osc2DetuneCents: 22,
    osc2Mix: 0.42,
    filterCutoff: 3800,
    filterQ: 5.0,
    adsr: { attack: 0.002, decay: 0.9, sustain: 0.18, release: 0.5 },
  },
  // `accordion_lead`: musette tuning — square + saw 14 cents apart, reed-quick 30 ms
  // attack, near-full sustain.
  accordionLead: {
    name: "Accordion Lead",
    osc1Type: "square",
    osc2Type: "sawtooth",
    osc2DetuneCents: 14,
    osc2Mix: 0.4,
    filterCutoff: 3400,
    filterQ: 1.6,
    adsr: { attack: 0.03, decay: 0.15, sustain: 0.85, release: 0.18 },
  },
  // `harmonica_lead`: reedy square/triangle bite with a 10 % breath noise under it
  // and a 3.2 kHz band — the bullet-mic Chicago harp.
  harmonicaLead: {
    name: "Harmonica Lead",
    osc1Type: "square",
    osc2Type: "triangle",
    osc2DetuneCents: 4,
    osc2Mix: 0.26,
    filterCutoff: 3200,
    filterQ: 3.4,
    adsr: { attack: 0.02, decay: 0.25, sustain: 0.6, release: 0.2 },
    noiseMix: 0.1,
  },
  // `marimba_lead`: wooden bar — sine fundamental plus a triangle overtone, 1 ms
  // attack, 0.55 s decay and zero sustain so every hit is a mallet stroke.
  marimbaLead: {
    name: "Marimba",
    osc1Type: "sine",
    osc2Type: "triangle",
    osc2DetuneCents: 0,
    osc2Mix: 0.2,
    filterCutoff: 2600,
    filterQ: 1.6,
    adsr: { attack: 0.001, decay: 0.55, sustain: 0.0, release: 0.35 },
  },
  // `bell_lead`: inharmonic bell/music-box clang from two sines a minor-tenth apart
  // (1900 cents), a 1.8 s ring and no sustain.
  bellLead: {
    name: "Bell Lead",
    osc1Type: "sine",
    osc2Type: "sine",
    osc2DetuneCents: 1900,
    osc2Mix: 0.4,
    filterCutoff: 6000,
    filterQ: 1.0,
    adsr: { attack: 0.001, decay: 1.8, sustain: 0.0, release: 1.2 },
  },
  // `sine_lead`: the G-funk whine — a sine fundamental with a quiet saw edge and a
  // gentle -80 cent fall across the note, i.e. a portamento-flavoured glide.
  sineLead: {
    name: "Sine Glide Lead",
    osc1Type: "sine",
    osc2Type: "sawtooth",
    osc2DetuneCents: 0,
    osc2Mix: 0.18,
    filterCutoff: 4200,
    filterQ: 1.1,
    adsr: { attack: 0.012, decay: 0.3, sustain: 0.72, release: 0.3 },
    pitchSweepCents: -80,
  },
  // `fm_lead`: two-operator-ish FM squelch faked by a sine carrier plus a square
  // partial a minor-tenth sharp (1207 cents) through a 3-Q 5.2 kHz filter.
  fmLead: {
    name: "FM Lead",
    osc1Type: "sine",
    osc2Type: "square",
    osc2DetuneCents: 1207,
    osc2Mix: 0.45,
    filterCutoff: 5200,
    filterQ: 3.0,
    adsr: { attack: 0.002, decay: 0.22, sustain: 0.35, release: 0.14 },
  },
  // `cowbell_lead`: the TR-808 cowbell as a melodic hook — two squares 540 cents
  // apart through a 6-Q 5 kHz band, clanging and immediately gone.
  cowbellLead: {
    name: "808 Cowbell Lead",
    osc1Type: "square",
    osc2Type: "square",
    osc2DetuneCents: 540,
    osc2Mix: 0.5,
    filterCutoff: 5000,
    filterQ: 6.0,
    adsr: { attack: 0.001, decay: 0.28, sustain: 0.04, release: 0.12 },
  },
  // `growl_lead`: dubstep/neuro wavetable growl — a saw/square pair 40 cents apart
  // screaming through an 8-Q 1.5 kHz resonance with a sustained body.
  growlLead: {
    name: "Growl Lead",
    osc1Type: "square",
    osc2Type: "sawtooth",
    osc2DetuneCents: 40,
    osc2Mix: 0.55,
    filterCutoff: 1500,
    filterQ: 8.0,
    adsr: { attack: 0.008, decay: 0.4, sustain: 0.6, release: 0.2 },
  },

  // --- One-shot FX -----------------------------------------------------------------
  // `horn_stab`: a bar of horns hitting once — saw pair 20 cents apart, 12 ms bite,
  // 0.26 s decay and almost no sustain.
  hornStab: {
    name: "Horn Stab",
    osc1Type: "sawtooth",
    osc2Type: "sawtooth",
    osc2DetuneCents: 20,
    osc2Mix: 0.48,
    filterCutoff: 3000,
    filterQ: 3.0,
    adsr: { attack: 0.012, decay: 0.26, sustain: 0.1, release: 0.2 },
  },
  // `vinyl_crackle`: filtered noise with a 0.12 s decay — surface noise / needle hiss
  // for the sampled and shellac-recorded genres. The two oscillators are muted.
  vinylCrackle: {
    name: "Vinyl Crackle",
    osc1Type: "sine",
    osc2Type: "sine",
    osc2DetuneCents: 0,
    osc2Mix: 0.0,
    filterCutoff: 7000,
    filterQ: 0.8,
    adsr: { attack: 0.004, decay: 0.12, sustain: 0.35, release: 0.5 },
    noiseMix: 0.9,
  },
  // `tape_stop`: a record/tape spun down — saw + square falling 2400 cents across the
  // note over a 0.5 s decay.
  tapeStop: {
    name: "Tape Stop",
    osc1Type: "sawtooth",
    osc2Type: "square",
    osc2DetuneCents: 8,
    osc2Mix: 0.3,
    filterCutoff: 3000,
    filterQ: 2.0,
    adsr: { attack: 0.002, decay: 0.5, sustain: 0.3, release: 0.2 },
    pitchSweepCents: -2400,
  },
  // `reverse_cymbal`: noise swelling in over half a second and cut off instantly —
  // the classic pre-downbeat reverse cymbal.
  reverseCymbal: {
    name: "Reverse Cymbal",
    osc1Type: "sine",
    osc2Type: "sine",
    osc2DetuneCents: 0,
    osc2Mix: 0.0,
    filterCutoff: 9000,
    filterQ: 0.7,
    adsr: { attack: 0.5, decay: 0.05, sustain: 0.9, release: 0.02 },
    noiseMix: 1.0,
  },
  // `noise_rise`: a 1.1 s white-noise riser climbing 700 cents into the next section.
  noiseRise: {
    name: "Noise Rise",
    osc1Type: "sine",
    osc2Type: "sine",
    osc2DetuneCents: 0,
    osc2Mix: 0.0,
    filterCutoff: 4000,
    filterQ: 1.0,
    adsr: { attack: 1.1, decay: 0.1, sustain: 0.95, release: 0.05 },
    noiseMix: 1.0,
    pitchSweepCents: 700,
  },
  // `sweep_down`: the falling counterpart — half-noise, half-saw dropping 1200 cents.
  sweepDown: {
    name: "Sweep Down",
    osc1Type: "sawtooth",
    osc2Type: "sine",
    osc2DetuneCents: 0,
    osc2Mix: 0.15,
    filterCutoff: 5200,
    filterQ: 1.2,
    adsr: { attack: 0.005, decay: 0.8, sustain: 0.2, release: 0.3 },
    noiseMix: 0.5,
    pitchSweepCents: -1200,
  },
  // `sub_drop`: an 808 sub sliding a full octave down under a 300 Hz filter — the
  // trap/dubstep drop rather than a riser.
  subDrop: {
    name: "Sub Drop",
    osc1Type: "sine",
    osc2Type: "triangle",
    osc2DetuneCents: 0,
    osc2Mix: 0.1,
    filterCutoff: 300,
    filterQ: 1.0,
    adsr: { attack: 0.004, decay: 1.0, sustain: 0.3, release: 0.6 },
    pitchSweepCents: -1200,
  },
  // `laser_zap`: a square/saw blip plummeting 1900 cents in 0.12 s — the electro/rave zap.
  laserZap: {
    name: "Laser Zap",
    osc1Type: "square",
    osc2Type: "sawtooth",
    osc2DetuneCents: 12,
    osc2Mix: 0.3,
    filterCutoff: 6000,
    filterQ: 4.0,
    adsr: { attack: 0.001, decay: 0.12, sustain: 0.0, release: 0.08 },
    pitchSweepCents: -1900,
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
 * One quarter-second of deterministic white noise per audio context, reused by every
 * noise-based voice. A linear congruential generator (not `Math.random`) is used so the
 * realtime engine and the offline WAV renderer produce the same noise bed — the same
 * exporter-parity guarantee the oscillator voices already rely on.
 */
const noiseBufferCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function sharedNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseBufferCache.get(ctx);
  if (cached) return cached;

  const length = Math.max(1, Math.floor(ctx.sampleRate * 0.25));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x2f6e2b1;
  for (let i = 0; i < length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }

  noiseBufferCache.set(ctx, buffer);
  return buffer;
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

  // Optional pitch envelope: a preset may glide both oscillators to a fixed offset by
  // the end of the note (negative = tape-stop / laser / sub-drop fall, positive = riser).
  const gateEnd = time + Math.max(0.05, durationSec);
  if (preset.pitchSweepCents) {
    const sweepEnd = safeFreq(freq * Math.pow(2, preset.pitchSweepCents / 1200), freq);
    osc1.frequency.exponentialRampToValueAtTime(sweepEnd, gateEnd);
    osc2.frequency.exponentialRampToValueAtTime(sweepEnd, gateEnd);
  }

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

  // Optional noise bed (vinyl crackle, risers, reverse cymbal). It shares the voice's
  // resonant filter, so a noise preset is voiced by the same synthesis path as the
  // oscillators — which is also what keeps the live engine and the offline renderer
  // bit-for-bit identical, since both call this function.
  const noiseMix = Math.max(0, Math.min(1, preset.noiseMix ?? 0));
  if (noiseMix > 0) {
    const noise = ctx.createBufferSource();
    noise.buffer = sharedNoiseBuffer(ctx);
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(noiseMix, time);
    noise.connect(noiseGain);
    noiseGain.connect(filter);
    noise.start(time);
    noise.stop(time + Math.max(0.05, durationSec) + Math.max(0.01, adsr.release) + 0.01);
    sources.push(noise);
    gains.push(noiseGain);
  }

  // ADSR Amp Envelope
  const ampGain = ctx.createGain();
  const maxVolume = safeGain(safeVel * 0.8, 0.001);
  const attackStart = 0.0001;
  const attackPeak = Math.max(0.001, maxVolume);
  const attackEnd = time + Math.max(0.002, adsr.attack);
  const decayEnd = attackEnd + Math.max(0.01, adsr.decay);
  const sustainLevel = Math.max(0.0001, maxVolume * adsr.sustain);
  const noteReleaseStart = time + Math.max(0.05, durationSec);
  const noteEndTime = noteReleaseStart + Math.max(0.01, adsr.release);

  // A short gate can land *inside* the attack or the decay ramp. Scheduling the
  // sustain level unconditionally on top of a still-running ramp is a step
  // discontinuity in amplitude — a broadband impulse, i.e. an audible click on
  // every note. Instead, derive the value the envelope actually reaches at the
  // gate end analytically: for an exponential ramp from v0 at t0 to v1 at t1,
  // the value at t is v0 · (v1 / v0)^((t - t0) / (t1 - t0)). The release then
  // starts from exactly that value, and because an exponential is
  // self-similar, ramping to the interpolated point reproduces the original
  // attack/decay curve bit-for-bit up to the gate end.
  const releaseStartValue = safeGain(
    noteReleaseStart <= attackEnd
      ? attackStart *
        Math.pow(attackPeak / attackStart, (noteReleaseStart - time) / (attackEnd - time))
      : noteReleaseStart < decayEnd
        ? attackPeak *
          Math.pow(sustainLevel / attackPeak, (noteReleaseStart - attackEnd) / (decayEnd - attackEnd))
        : sustainLevel
  );

  // Initial silence (prevent pop)
  ampGain.gain.setValueAtTime(attackStart, time);
  if (noteReleaseStart <= attackEnd) {
    // Gate cuts the attack short: ramp to the analytic attack value at the gate
    // end, then release from there.
    ampGain.gain.exponentialRampToValueAtTime(releaseStartValue, noteReleaseStart);
  } else {
    // Attack: exponential ramp to the peak.
    ampGain.gain.exponentialRampToValueAtTime(attackPeak, attackEnd);
    if (noteReleaseStart < decayEnd) {
      // Gate cuts the decay short: ramp to the analytic decay value at the gate
      // end rather than stepping to the sustain level.
      ampGain.gain.exponentialRampToValueAtTime(releaseStartValue, noteReleaseStart);
    } else {
      // Decay: exponential ramp to sustainLevel.
      ampGain.gain.exponentialRampToValueAtTime(sustainLevel, decayEnd);
      // The gate outlasts the decay, so the envelope already sits at sustain
      // and holding it introduces no step.
      if (noteReleaseStart > decayEnd) {
        ampGain.gain.setValueAtTime(sustainLevel, noteReleaseStart);
      }
    }
  }
  // Release: exponential decay to the initial floor
  ampGain.gain.exponentialRampToValueAtTime(attackStart, noteEndTime);

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
