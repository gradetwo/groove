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

import type { PolyVoiceVariation } from "./noteVariation";
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
  // --- Filter envelope, resonance compensation, slope (E-14) ---------------
  /**
   * Filter-envelope depth in octaves above the note's base cutoff. Absent means the
   * historical fixed `log2(2.5)` sweep, so every un-annotated preset renders
   * bit-for-bit as before; `0` disables the sweep entirely (a pad that should not
   * bloom), and a larger value opens a squelch (an acid line, a brass bloom).
   */
  filterEnvOctaves?: number;
  /** Multiplier on the amp attack for the filter sweep only. Absent = 1 (the historical tie). */
  filterEnvAttackScale?: number;
  /** Multiplier on the amp decay for the filter return only. Absent = 1. */
  filterEnvDecayScale?: number;
  /**
   * Resonance compensation, in dB of pre-filter gain reduction per unit of Q above 1.
   * Absent means the module default (`RESONANCE_COMP_DB_PER_Q`), which exists because a
   * biquad's response at resonance rises with Q: without compensation, turning resonance
   * up is heard mostly as "louder", which is the wrong control. `0` disables it for a
   * preset whose resonance is meant to be heard as level.
   */
  resonanceCompDbPerQ?: number;
  /**
   * Use a 24 dB/oct filter (two cascaded 12 dB stages) instead of the default 12 dB.
   * Costs one extra biquad per voice, so it is opt-in per preset.
   */
  filterSlope24?: boolean;
  /**
   * Key tracking depth for the low-pass cutoff, in octaves per octave (0–1 = 0–100 %).
   *
   * Absent means **full tracking at a musically useful depth**, which is the opposite default
   * from the velocity fields above, and deliberately so: this is a *fix*, not an option.
   *
   * The cutoff used to be an absolute constant, so a C2 bass note and a C6 lead note opened to
   * the same 2.6 kHz. Relative to the note's fundamental, the low note is wide open (bright, thin,
   * no body) and the high note is nearly closed (dull, muffled) — the opposite of how a real
   * instrument behaves, where a fixed resonant body produces proportionally fewer harmonics as
   * pitch rises and the ear reads that as a consistent timbre. That mismatch is one of the
   * reasons the library did not sound like the records its genres come from, and it affected
   * every preset at once.
   *
   * `0` disables it for a preset whose character depends on a fixed corner (drum-like blips,
   * deliberately muffled lo-fi stabs). The amount is the *fraction* of the pitch distance applied
   * to the cutoff, measured relative to `KEY_TRACK_REFERENCE_MIDI`, so a note one octave above the
   * reference multiplies the cutoff by `2^depth`.
   */
  keyTrackFilter?: number;
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

  // --- Velocity → timbre response (E-13) -----------------------------------
  // All four are depth controls measured against the `velocityCurve` output: 0 at the
  // curve's floor and 1 at full velocity. Every one of them is a *no-op at full
  // velocity* by construction, so annotating a preset never changes its level or its
  // voicing on an ff note (the library's measured loudness baseline is untouched), and
  // omitting them leaves the preset bit-for-bit unchanged at every velocity.

  /**
   * Velocity → low-pass cutoff depth, in octaves. The preset's `filterCutoff` is what a
   * full-velocity note opens to; a note at the curve's floor closes by up to this many
   * octaves (harder = brighter). `0` (default) disables the mapping.
   */
  velocityToCutoff?: number;
  /**
   * Extra velocity → filter-envelope depth, in octaves, on top of the fixed `cutoff ·
   * 2.5` attack sweep. A full-velocity note keeps the full sweep; as velocity falls the
   * sweep peak closes by up to this many octaves, floored at the (velocity-scaled) base
   * cutoff so the sweep never becomes a downward ramp. `0` (default) disables it.
   */
  velocityToFilterEnv?: number;
  /**
   * Velocity → amp-attack response. The attack at the curve's floor is
   * `adsr.attack · (1 + velocityToAttack)` and shortens linearly to `adsr.attack` at
   * full velocity (harder = slightly faster). `0` (default) disables it.
   */
  velocityToAttack?: number;
  /**
   * Velocity → amp-decay response. The decay at the curve's floor is
   * `adsr.decay · (1 + velocityToDecay)` and shortens to `adsr.decay` at full velocity
   * (harder = slightly more percussive). `0` (default) disables it.
   */
  velocityToDecay?: number;
  /**
   * Stereo width for a detuned stack, 0…1 (0 = mono, the default).
   *
   * Absent is **exactly** the old voice: the second oscillator goes straight into the mixer with
   * no splitter and no panners, so every preset that does not opt in renders bit-for-bit as it
   * did, and the library's measured timbre/loudness baselines stay meaningful for it.
   *
   * When set, the voice gains a second detuned pair panned left and right. This is what a real
   * supersaw *is* — the width is not decoration on top of the sound, it is the sound — and it is
   * also why a mono two-saw stack read as "a lead with a slight chorus" rather than a trance
   * wall. Values above `MAX_STEREO_SPREAD` are clamped at the call site.
   */
  stereoSpread?: number;
  /**
   * Explicit harmonic amplitudes for the first oscillator, index 0 being the fundamental.
   *
   * Present means `osc1` is built with `createPeriodicWave` from these partials instead of using
   * `osc1Type`. That is the mechanism a drawbar organ actually needs: a Hammond's tone is a sum of
   * *pure* partials at the drawbar footages (16′ / 8′ / 5⅓′ / 4′ / 2⅔′ / 2′ / 1⅗′ / 1⅓′ / 1′), and no
   * combination of the built-in waveforms approximates it — which is why both organ presets were a
   * square plus a sine and read as "a synth organ" rather than a drawbar instrument.
   *
   * Absent is **exactly** the old voice: no periodic wave is built and `osc1Type` is used as before,
   * so presets that do not opt in render bit-for-bit identically and their committed baselines stay
   * meaningful.
   *
   * Values are relative; they are peak-normalised (see `periodicWaveCoefficients`) so that adding a
   * partial cannot make a preset louder.
   */
  harmonics?: readonly number[];

  /**
   * Inharmonic partials, as multiples of the played frequency (G.8's 不谐分音 item).
   *
   * `harmonics` above goes through `createPeriodicWave`, which can only build *harmonic* spectra:
   * every partial sits at an integer multiple of the fundamental. A struck metal body is not
   * harmonic. A tubular bell's audible partials are the hum tone, the prime, the tierce, the quint
   * and the nominal — the *non-integer* ratios are what an ear hears as metal, and their absence is
   * why the bell used to be "two sines a minor tenth apart": 1900 cents is 2.997:1, i.e. a perfectly
   * ordinary third harmonic with the second missing. It read as an organ, not a bell.
   *
   * Present means the voice is built from this bank **instead of** `osc1`/`osc2`: one sine per
   * partial, each with its own gain and its own decay, because metal partials die from the top down
   * (the hum tone outlasts the nominal). `osc1Type`/`osc2Type`/`osc2Mix` are then unused and are
   * kept only because the type requires them.
   *
   * The bank is summed **two partials per node** (a binary tree). That is not tidiness: a node that
   * sums three or more oscillators tuned to different frequencies does not render bit-identically
   * twice in Chrome, which is measured in `scripts/diagnose_repeat_determinism.mjs --primitives` and
   * guarded by `src/test/oscillatorFanIn.test.ts`. A binary tree is the reproducible shape.
   */
  partials?: readonly InharmonicPartial[];
  /**
   * Level of the partial bank as a whole, applied after normalisation (default 1).
   *
   * It exists so a preset that *replaces* a two-oscillator mix can keep that mix's level: the bell's
   * old mixer summed to `(1 - 0.4 * 0.5) + 0.4 = 1.2`, and the bank carries the same number rather
   * than quietly arriving 1.6 dB quieter and moving three genres' measured loudness.
   */
  partialsLevel?: number;
}

/**
 * One partial of an inharmonic voice.
 *
 * `ratio` is the frequency as a multiple of the played note — deliberately not an integer for a
 * struck body. `decayScale` is relative to the preset's `adsr.decay`: below 1 dies sooner, which is
 * how a bell's upper partials behave.
 */
export interface InharmonicPartial {
  ratio: number;
  gain: number;
  decayScale?: number;
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
/**
 * A tubular bell's partials, relative to the strike note.
 *
 * Sources disagree on the exact cents — a real bell's inharmonicity depends on its profile — so this
 * is a clean, documented set rather than a measurement: the *ratios* matter, and every one of the four
 * non-integer ones (0.56, 1.19, 1.5, 2.74) is deliberately far enough from an integer to be heard as
 * metal. Gains and decays follow the physical pattern: the hum tone is the loudest and lasts longest,
 * the upper partial is the quietest and dies first.
 */
export const BELL_PARTIALS: readonly InharmonicPartial[] = [
  { ratio: 0.56, gain: 0.85, decayScale: 1.0 },
  { ratio: 1.0, gain: 1.0, decayScale: 1.0 },
  { ratio: 1.19, gain: 0.6, decayScale: 0.8 },
  { ratio: 1.5, gain: 0.45, decayScale: 0.65 },
  { ratio: 2.0, gain: 0.5, decayScale: 0.5 },
  { ratio: 2.74, gain: 0.3, decayScale: 0.35 },
];

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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 1.1,
    velocityToFilterEnv: 0.6,
    velocityToAttack: 0.15,
    velocityToDecay: 0.2,
  },
  warmPad: {
    // E-14: pads do not squelch. A shallow sweep + a slow opening keeps it a pad.
    filterEnvOctaves: 0.55,
    filterEnvAttackScale: 2.0,
    name: "Warm Poly Pad",
    osc1Type: "triangle",
    osc2Type: "sawtooth",
    osc2DetuneCents: -9,
    osc2Mix: 0.35,
    filterCutoff: 2200,
    filterQ: 1.2,
    adsr: { attack: 0.15, decay: 0.3, sustain: 0.8, release: 0.6 },
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 1.0,
    velocityToFilterEnv: 0.6,
    velocityToAttack: 0.05,
    velocityToDecay: 0.05,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 1.9,
    velocityToFilterEnv: 1.2,
    velocityToAttack: 0.25,
    velocityToDecay: 0.45,
  },
  acidBass: {
    // E-14: the 303 is a 24 dB ladder, and its character is a *fast, deep* envelope return.
    filterSlope24: true,
    filterEnvOctaves: 2.2,
    filterEnvAttackScale: 0.25,
    filterEnvDecayScale: 0.45,
    name: "Acid 303 Bass",
    osc1Type: "sawtooth",
    osc2Type: "square",
    osc2DetuneCents: 0,
    osc2Mix: 0.0,
    filterCutoff: 1200,
    filterQ: 6.0,
    adsr: { attack: 0.005, decay: 0.15, sustain: 0.2, release: 0.1 },
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 2.2,
    velocityToFilterEnv: 1.4,
    velocityToAttack: 0.15,
    velocityToDecay: 0.3,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 1.2,
    velocityToFilterEnv: 0.7,
    velocityToAttack: 0.15,
    velocityToDecay: 0.2,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 1.0,
    velocityToFilterEnv: 0.6,
    velocityToAttack: 0.15,
    velocityToDecay: 0.2,
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
    velocityToCutoff: 1.6,
    velocityToFilterEnv: 1.0,
    velocityToAttack: 0.3,
    velocityToDecay: 0.3,
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
    velocityToCutoff: 1.7,
    velocityToFilterEnv: 1.1,
    velocityToAttack: 0.25,
    velocityToDecay: 0.3,
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
    velocityToCutoff: 1.8,
    velocityToFilterEnv: 1.0,
    velocityToAttack: 0.6,
    velocityToDecay: 0.25,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 1.5,
    velocityToFilterEnv: 0.9,
    velocityToAttack: 0.2,
    velocityToDecay: 0.35,
  },

  // --- Chords / pads -------------------------------------------------------
  // `supersaw`: two saws an intentionally wide 26 cents apart (more than twice
  // sawLead) through a bright, low-Q filter — the trance/EDM wall of sound. `stereoSpread`
  // adds the outer detuned pair panned apart, which is what makes it a *wall*: a mono pair
  // at this detune reads as one slightly-chorused lead, because the two saws beat against
  // each other in a single channel instead of decorating the stereo field.
  supersaw: {
    // E-14: a supersaw wall is static brightness; the historical 2.5x sweep fights the detune.
    filterEnvOctaves: 0.7,
    name: "Supersaw",
    osc1Type: "sawtooth",
    osc2Type: "sawtooth",
    osc2DetuneCents: 26,
    osc2Mix: 0.55,
    stereoSpread: 0.65,
    filterCutoff: 6500,
    filterQ: 1.0,
    adsr: { attack: 0.02, decay: 0.35, sustain: 0.85, release: 0.45 },
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 0.9,
    velocityToFilterEnv: 0.5,
    velocityToAttack: 0.1,
    velocityToDecay: 0.15,
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
    velocityToCutoff: 1.8,
    velocityToFilterEnv: 1.0,
    velocityToAttack: 0.6,
    velocityToDecay: 0.3,
  },
  // `m1_organ`: the bright "full drawbars" registration. `harmonics` replaces the square that
  // used to stand in for it — a square's partials fall off as 1/n, which is both far too dark and
  // the wrong *series*: a drawbar organ's tone is a set of pure partials at chosen footages, and
  // which ones are present is the instrument.
  m1Organ: {
    name: "M1 Organ",
    /**
     * The array is 0-based, so index i is footage 8′ / 2^i:
     *   0 → 8′ fundamental, 2 → 5⅓′ twelfth, 3 → 2′, 5 → 2⅔′, 7 → 1′, 12 → ½′.
     * A registration of 8′ + 5⅓′ + 2′ + 2⅔′ + 1′ + ½′ — the bright "full drawbars" setting, with
     * the upper partials pulled out so it cuts through a mix.
     *
     * The 16′ sub-octave drawbar (harmonic ½) cannot be expressed here at all: a periodic wave is
     * built from one fundamental, so anything below it would have to be a second oscillator. That is
     * the right outcome anyway — on a real console the 16′ belongs to its own manual, and folding it
     * in would put energy under the note that the bass part owns.
     */
    harmonics: [1, 0, 0.42, 0.36, 0, 0.24, 0, 0.16, 0, 0, 0, 0, 0.1],
    osc1Type: "square",
    osc2Type: "sine",
    osc2DetuneCents: 0,
    // Lowered from 0.5: the periodic wave already carries the upper partials the sine was there to
    // suggest, so the same mix would double-count them and read as bright rather than full.
    osc2Mix: 0.22,
    filterCutoff: 5200,
    filterQ: 0.7,
    adsr: { attack: 0.006, decay: 0.06, sustain: 0.95, release: 0.16 },
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 0.7,
    velocityToFilterEnv: 0.4,
    velocityToAttack: 0.05,
    velocityToDecay: 0.05,
  },
  // `brass_synth`: saw + square with a 70 ms bloom and a resonant 2.5 kHz
  // filter — the synth-brass swell rather than a static pad.
  brassSynth: {
    // E-14: a brass "bloom" IS the filter opening slower than the amp attack.
    filterEnvAttackScale: 2.4,
    filterEnvDecayScale: 1.3,
    name: "Brass Synth",
    osc1Type: "sawtooth",
    osc2Type: "square",
    osc2DetuneCents: 9,
    osc2Mix: 0.35,
    filterCutoff: 2500,
    filterQ: 2.4,
    adsr: { attack: 0.07, decay: 0.25, sustain: 0.8, release: 0.3 },
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 1.8,
    velocityToFilterEnv: 1.1,
    velocityToAttack: 0.25,
    velocityToDecay: 0.2,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 0.9,
    velocityToFilterEnv: 0.5,
    velocityToAttack: 0.1,
    velocityToDecay: 0.25,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 1.1,
    velocityToFilterEnv: 0.6,
    velocityToAttack: 0.1,
    velocityToDecay: 0.3,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 1.3,
    velocityToFilterEnv: 0.8,
    velocityToAttack: 0.1,
    velocityToDecay: 0.2,
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
    velocityToCutoff: 1.5,
    velocityToFilterEnv: 1.0,
    velocityToAttack: 0.4,
    velocityToDecay: 0.3,
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
    velocityToCutoff: 1.8,
    velocityToFilterEnv: 1.2,
    velocityToAttack: 0.3,
    velocityToDecay: 0.25,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 1.2,
    velocityToFilterEnv: 0.7,
    velocityToAttack: 0.1,
    velocityToDecay: 0.25,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 0.8,
    velocityToFilterEnv: 0.5,
    velocityToAttack: 0.1,
    velocityToDecay: 0.1,
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
    velocityToCutoff: 1.4,
    velocityToFilterEnv: 1.0,
    velocityToAttack: 0.4,
    velocityToDecay: 0.3,
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
    velocityToCutoff: 1.5,
    velocityToFilterEnv: 1.1,
    velocityToAttack: 0.3,
    velocityToDecay: 0.3,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 1.4,
    velocityToFilterEnv: 0.9,
    velocityToAttack: 0.1,
    velocityToDecay: 0.25,
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
    velocityToCutoff: 1.6,
    velocityToFilterEnv: 1.0,
    velocityToAttack: 0.5,
    velocityToDecay: 0.25,
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
    velocityToCutoff: 1.8,
    velocityToFilterEnv: 1.1,
    velocityToAttack: 0.5,
    velocityToDecay: 0.25,
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
    velocityToCutoff: 1.4,
    velocityToFilterEnv: 0.9,
    velocityToAttack: 0.45,
    velocityToDecay: 0.25,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 2.0,
    velocityToFilterEnv: 1.2,
    velocityToAttack: 0.3,
    velocityToDecay: 0.2,
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
    velocityToCutoff: 2.0,
    velocityToFilterEnv: 1.0,
    velocityToAttack: 0.5,
    velocityToDecay: 0.35,
  },
  // `organ_lead`: the classic jazz registration (888000000 plus the 4′ for definition) — a
  // Hammond B3 with the Leslie opened up, locked at 0 cents so there is no beating. Distinct from
  // `m1_organ`: fewer upper partials (rounder) and a longer, gentler envelope.
  organLead: {
    name: "Hammond Organ",
    // Same 0-based indexing as `m1_organ`: 0 → 8′, 2 → 5⅓′, 3 → 2′, 5 → 2⅔′. A registration of
    // 8′ + 5⅓′ + 2′ + a touch of 2⅔′ — deliberately darker than `m1_organ`, because a
    // registration is a choice and the two presets should not be one sound with two filters.
    harmonics: [1, 0, 0.3, 0.5, 0, 0.12],
    osc1Type: "square",
    osc2Type: "sine",
    osc2DetuneCents: 0,
    osc2Mix: 0.3,
    filterCutoff: 6200,
    filterQ: 0.6,
    adsr: { attack: 0.004, decay: 0.12, sustain: 0.94, release: 0.12 },
    velocityToCutoff: 1.0,
    velocityToFilterEnv: 0.6,
    velocityToAttack: 0.3,
    velocityToDecay: 0.2,
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
    velocityToCutoff: 1.6,
    velocityToFilterEnv: 1.0,
    velocityToAttack: 0.4,
    velocityToDecay: 0.35,
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
    velocityToCutoff: 1.2,
    velocityToFilterEnv: 0.8,
    /**
     * **0.7 → 0.25**, and the sweep is what found it.
     *
     * `velocityToAttack` lengthens the attack to `attack · (1 + v)` at the velocity floor, so a pattern step at a soft
     * velocity gave this preset an attack of **0.6 s** — and the lanes that play it (`ambient-techno`, `downtempo`,
     * `disco`) cut their lead notes at about a third of a second. The note never arrived: measured, its stem rendered at
     * **−54 to −60 dBFS** while every other lead instrument sat at −31 to −36, and a controlled one-note calibration
     * could not see it because it compared that quiet native voice with the equally quiet GS-1 patch and called them
     * equal.
     *
     * 0.25 keeps the bowed swell — 0.35 s at full velocity, 0.44 s at the floor — inside a note that is actually played.
     */
    velocityToAttack: 0.25,
    velocityToDecay: 0.2,
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
    velocityToCutoff: 1.8,
    velocityToFilterEnv: 1.1,
    velocityToAttack: 0.3,
    velocityToDecay: 0.3,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 2.1,
    velocityToFilterEnv: 1.3,
    velocityToAttack: 0.35,
    velocityToDecay: 0.2,
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
    velocityToCutoff: 1.7,
    velocityToFilterEnv: 1.0,
    velocityToAttack: 0.3,
    velocityToDecay: 0.3,
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
    velocityToCutoff: 1.4,
    velocityToFilterEnv: 0.9,
    velocityToAttack: 0.4,
    velocityToDecay: 0.25,
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
    velocityToCutoff: 1.6,
    velocityToFilterEnv: 1.0,
    velocityToAttack: 0.4,
    velocityToDecay: 0.25,
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
    velocityToCutoff: 1.8,
    velocityToFilterEnv: 1.1,
    velocityToAttack: 0.3,
    velocityToDecay: 0.3,
  },
  // `bell_lead`: a struck metal body, as its actual partials.
  //
  // It used to be two sines a minor tenth apart — 1900 cents is 2.997:1, i.e. a third harmonic with
  // the second missing, which is a harmonic spectrum and therefore an organ, not a bell. The ratios
  // below are a tubular bell's (hum / prime / tierce / quint / nominal / upper); the non-integer ones
  // are the metal. Upper partials decay first, which is what makes a bell *ring* instead of buzz, and
  // the bank is fanned in two per node so the voice still renders bit-identically twice.
  bellLead: {
    name: "Bell Lead",
    osc1Type: "sine",
    osc2Type: "sine",
    osc2DetuneCents: 0,
    osc2Mix: 0,
    partials: BELL_PARTIALS,
    //
    // The bank carries the old pair's *energy*, not its summed amplitude: six partials share the
    // amplitude and the upper ones decay early, so the same peak gain would have arrived several dB
    // quieter and changed the mix balance of the genres that use it. The weighting is the sum of
    // gain squared times decay scale against the old pair's 0.8^2 + 0.4^2, i.e. 1.2 * sqrt(0.80 /
    // 0.242) = 2.18. (The library's *measured* loudness does not render this voice at all — verified
    // by A/B rendering, see PRODUCT_PLAN_v2.1.0.md G.51 — so no loudness baseline moves either way.)
    partialsLevel: 2.18,
    filterCutoff: 6000,
    filterQ: 1.0,
    adsr: { attack: 0.001, decay: 1.8, sustain: 0.0, release: 1.2 },
    velocityToCutoff: 1.6,
    velocityToFilterEnv: 1.0,
    velocityToAttack: 0.3,
    velocityToDecay: 0.3,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 0.8,
    velocityToFilterEnv: 0.4,
    velocityToAttack: 0.1,
    velocityToDecay: 0.15,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 1.3,
    velocityToFilterEnv: 0.8,
    velocityToAttack: 0.15,
    velocityToDecay: 0.3,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 1.2,
    velocityToFilterEnv: 0.8,
    velocityToAttack: 0.15,
    velocityToDecay: 0.3,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 1.6,
    velocityToFilterEnv: 1.0,
    velocityToAttack: 0.2,
    velocityToDecay: 0.3,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 1.9,
    velocityToFilterEnv: 1.2,
    velocityToAttack: 0.3,
    velocityToDecay: 0.25,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 0.5,
    velocityToFilterEnv: 0.3,
    velocityToAttack: 0.0,
    velocityToDecay: 0.0,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 0.6,
    velocityToFilterEnv: 0.4,
    velocityToAttack: 0.0,
    velocityToDecay: 0.0,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 0.7,
    velocityToFilterEnv: 0.4,
    velocityToAttack: 0.0,
    velocityToDecay: 0.0,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 0.8,
    velocityToFilterEnv: 0.5,
    velocityToAttack: 0.0,
    velocityToDecay: 0.0,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 0.8,
    velocityToFilterEnv: 0.5,
    velocityToAttack: 0.0,
    velocityToDecay: 0.0,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 0.9,
    velocityToFilterEnv: 0.5,
    velocityToAttack: 0.0,
    velocityToDecay: 0.0,
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
    // Played dynamics (see the velocity fields' docs): hard = brighter, tighter.
    velocityToCutoff: 0.7,
    velocityToFilterEnv: 0.4,
    velocityToAttack: 0.0,
    velocityToDecay: 0.0,
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
 * Exponent of the velocity → amplitude curve (E-13).
 *
 * A linear (exponent 1) velocity response is the "drum machine" tell: MIDI velocity 64
 * lands only 6 dB down, so ghost notes and accents differ mostly in level. A squared
 * response is the classic constant-power/perceptual mapping — perceived loudness grows
 * about as the square root of amplitude (Stevens), so the amplitude that produces a
 * given loudness step grows roughly as the square; equivalently every velocity step is
 * worth a progressively larger dB move at the quiet end. It is exactly `1` at velocity
 * 1, which keeps the measured full-velocity loudness baseline bit-for-bit intact, and
 * exactly `0` at velocity 0, which the exponential ramps cannot take directly — the
 * caller's `safeGain(..., 0.001)`/`safeVelocity` floor keeps them audible-but-silent.
 */
export const VELOCITY_CURVE_EXPONENT = 2;

/**
 * The cutoff a preset actually opens to for a given note, after key tracking.
 *
 * Exported so callers and tests can ask the question the voice asks instead of re-deriving the
 * formula. The offline parity suite used to assert `filterCutoffs()).toContain(preset.filterCutoff)`,
 * which held only while the cutoff ignored the note being played — i.e. only while the defect
 * existed. A shared function is what lets those assertions describe the contract rather than the
 * workaround.
 *
 * `keyTrackFilter: 0` returns the authored value unchanged; a preset that omits the field gets
 * `DEFAULT_KEY_TRACK_DEPTH`.
 */
/**
 * The cutoff a preset's voice *settles* to at a given velocity, after key tracking.
 *
 * The audible sweep peaks at `cutoff · 2^filterEnvOctaves` above this value and returns here; this
 * is the floor the note holds and therefore the number that says how bright a soft note is compared
 * with a hard one. Exported so the velocity→timbre tests can assert the contract — hard notes are
 * brighter, and the mapping is a no-op at full velocity — without re-deriving the expression and
 * drifting from the voice.
 */
export function velocityScaledCutoff(
  preset: Pick<SynthPreset, "filterCutoff" | "keyTrackFilter" | "velocityToCutoff">,
  midiNote: number,
  velocity: number
): number {
  const base = keyTrackedCutoff(preset, midiNote);
  const depth = preset.velocityToCutoff ?? 0;
  if (!(depth > 0)) return base;
  return safeFreq(base * Math.pow(2, depth * (velocityCurve(velocity) - 1)), base);
}

export function keyTrackedCutoff(
  preset: Pick<SynthPreset, "filterCutoff" | "keyTrackFilter">,
  midiNote: number
): number {
  const depth = preset.keyTrackFilter ?? DEFAULT_KEY_TRACK_DEPTH;
  const authored = safeFreq(preset.filterCutoff, 12000);
  if (!(depth > 0)) return authored;
  const ratio = Math.pow(
    safeFreq(midiToFreq(midiNote), 440) / midiToFreq(KEY_TRACK_REFERENCE_MIDI),
    depth
  );
  return safeFreq(authored * ratio, 12000);
}

/**
 * The MIDI note the presets' `filterCutoff` values were authored against.
 *
 * Middle C: a preset that says "2.6 kHz" means 2.6 kHz at C4, and key tracking scales it around
 * that anchor. Choosing C4 rather than the actual mean pitch of the library keeps the authored
 * numbers meaning what their names suggest.
 */
export const KEY_TRACK_REFERENCE_MIDI = 60;

/**
 * How much of the note distance reaches the cutoff when a preset does not state a depth.
 *
 * 0.5 is the classic analogue-synth setting (one octave of cutoff per octave of pitch, halved) and
 * is the safest general answer: it makes a bass note warmer and a lead note clearer without making
 * either sound like a different instrument. Full tracking (1.0) is available per preset for
 * sampled-instrument emulations, where the recorded body really does track pitch exactly.
 */
export const DEFAULT_KEY_TRACK_DEPTH = 0.5;

/**
 * Maps a normalised velocity (nominally 0..1) through the E-13 amplitude curve.
 *
 * Pure, deterministic, monotonic non-decreasing and bounded to `[0, 1]`. Out-of-range
 * input is clamped and non-finite input (`NaN`, `Infinity`) is coerced to a safe bound,
 * so this can never produce a `NaN` gain or a non-positive `exponentialRampToValueAtTime`
 * target downstream.
 */
export function velocityCurve(velocity: number): number {
  if (Number.isNaN(velocity) || velocity <= 0) return 0;
  if (velocity >= 1) return 1;
  return Math.pow(velocity, VELOCITY_CURVE_EXPONENT);
}

/**
 * The fixed filter-envelope sweep depth, in octaves: `cutoff · 2.5` is the existing
 * attack peak, and `log2(2.5)` is the same amount expressed in octaves so a preset's
 * `velocityToFilterEnv` can subtract from it.
 */
const FILTER_ENV_OCTAVES = Math.log2(2.5);
/**
 * Resonance compensation, in dB of pre-filter gain reduction per unit of Q above 1 (E-14).
 *
 * A second-order lowpass has a resonant peak of roughly `Q` at the corner, so its *peak* gain
 * rises 6 dB per doubling of Q while the passband does not. Left uncompensated, the resonance
 * knob reads as a volume knob and every high-Q preset sits louder than its `filterCutoff`
 * suggests. This is the first-order approximation of the correction — `Q` in dB is not exactly
 * what a biquad does to broadband program material — so it is deliberately partial (0.6 dB per
 * unit of Q, capped) rather than "exact": over-correcting would make resonance feel like it
 * *removed* body. The level it moves is folded into the 159-genre loudness re-measurement, not
 * guessed at.
 */
const RESONANCE_COMP_DB_PER_Q = 0.6;
/** Ceiling on the compensation, so an extreme Q cannot make a preset inaudible. */
const RESONANCE_COMP_MAX_DB = 6;

/**
 * The compensation for one preset, in dB (≤ 0). Exported because the correction is worth testing
 * as arithmetic rather than by hunting for a gain node in a voice's node soup.
 */
export function resonanceCompensationGainDb(
  filterQ: number,
  perQ: number = RESONANCE_COMP_DB_PER_Q
): number {
  if (!(perQ > 0)) return 0;
  const q = Number.isFinite(filterQ) ? filterQ : 1;
  const db = -Math.min(RESONANCE_COMP_MAX_DB, perQ * Math.max(0, q - 1));
  // `-0` is a real value in JS and would read as a correction where there is none.
  return db === 0 ? 0 : db;
}

/**
 * How long a velocity-softened note takes to settle onto its base cutoff before the
 * attack sweep begins. Sub-millisecond so it reads as the note's starting brightness
 * rather than a sweep, and bounded by half the attack time at the call site so it can
 * never collide with the sweep's own ramp.
 */
const VELOCITY_FILTER_SETTLE_SEC = 0.0005;

/**
 * Equal-power channel gains for a detuned pair sitting `spread` of the way out from centre.
 *
 * `spread` is 0…1: 0 is dead centre and 1 is hard left/right. Equal power (`cos`/`sin` around
 * 45°) rather than linear panning because the two sides are **decorrelated** — they are
 * different detuned oscillators, not the same signal — so linear gains would make a centred
 * pair 3 dB louder than a panned one. At centre both channels get `√½ ≈ 0.7071`, which is the
 * constant-power point, and `left² + right² === 1` holds for every value.
 *
 * Pure and total: a non-finite or out-of-range `spread` is clamped rather than propagated, so
 * a bad preset value cannot put `NaN` into a `GainNode.gain`.
 */
export function stereoSpreadGains(spread: number): { left: number; right: number } {
  const amount = Number.isFinite(spread) ? Math.max(0, Math.min(1, spread)) : 0;
  // The angle runs 45° (both channels √½) to 90° (all of it on the right). `amount * 45°` would
  // instead start at {1, 0} — a hard-panned pair at "zero" width, which is both wrong and 3 dB
  // louder than the mono voice it replaces.
  const angle = ((1 + amount) * Math.PI) / 4;
  return { left: Math.cos(angle), right: Math.sin(angle) };
}

/**
 * Detune offsets, in cents, for the outer pair of a unison stack.
 *
 * The preset's own `osc2DetuneCents` places the *first* pair; the outer pair deliberately does
 * not merely repeat it. Beating rate is proportional to the offset in cents, so a stack whose
 * members are all within one narrow band produces one slow beat rather than the shimmer a real
 * supersaw has. The outer offset is therefore a multiple of the preset's, and it is returned
 * separately (rather than added to a running total) so a test can assert the relationship
 * instead of hardcoding two numbers that happen to match.
 */
export function unisonOuterDetuneCents(
  osc2DetuneCents: number,
  multiple = UNISON_OUTER_DETUNE_MULTIPLE
): number {
  const base = Number.isFinite(osc2DetuneCents) ? osc2DetuneCents : 0;
  return base * multiple;
}

/** How much wider the outer unison pair sits than the preset's own `osc2DetuneCents`. */
export const UNISON_OUTER_DETUNE_MULTIPLE = 1.6;

/**
 * Fourier coefficients for a preset's harmonic stack, ready for `createPeriodicWave`.
 *
 * A pure, testable function because this is part of a preset's *definition*: two runs of the same
 * preset must produce byte-identical coefficients, and the live engine and the offline renderer
 * call it through the same code path, so exporter parity is structural rather than compared.
 *
 * The shape is deliberately a **sine** series (`real` all zero). A drawbar tone is described as
 * amplitudes at footages, not as a phase relationship, and a sine series makes the waveform
 * independent of an arbitrary phase choice — two presets that name the same drawbars are the same
 * sound.
 *
 * Normalisation is by the **sum of the amplitudes**, not by the peak of the sampled waveform:
 * the sum is a strict upper bound on the peak, it is exact in one pass, and it guarantees the
 * result never exceeds unity whatever the partials are. Scaling by the true peak would need a
 * sampling pass whose resolution changes with the number of partials — a needless source of
 * frame-to-frame disagreement between the realtime and offline graphs.
 *
 * Returns `null` for an empty or entirely silent stack, so a caller can fall back to `osc1Type`
 * instead of creating an oscillator that makes no sound.
 */
export function periodicWaveCoefficients(
  harmonics: readonly number[] | undefined
): { real: Float32Array; imag: Float32Array } | null {
  if (!harmonics || harmonics.length === 0) return null;
  const amp = harmonics.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = amp.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  // Index 0 is the DC term and must stay zero; the imaginary part carries the sine partials.
  const real = new Float32Array(amp.length + 1);
  const imag = new Float32Array(amp.length + 1);
  for (let i = 0; i < amp.length; i += 1) imag[i + 1] = amp[i] / total;
  return { real, imag };
}

/** Most partials one voice may declare: a bell's six, and a ceiling so a preset cannot fan in twenty. */
export const MAX_INHARMONIC_PARTIALS = 6;

/** One partial of an inharmonic bank, ready to schedule. */
export interface NormalisedPartial {
  ratio: number;
  gain: number;
  decayScale: number;
}

/**
 * A preset's partial bank, normalised — or `null` when the preset declares none.
 *
 * Pure and exported because this is part of a preset's *definition*, like
 * `periodicWaveCoefficients`: two runs must produce the same numbers, and the live engine and the
 * offline renderer call it through the same code path.
 *
 * Gains are normalised by their **sum**, not by a sampled peak, for the same reason the harmonic
 * stack is: the sum is an exact upper bound in one pass and cannot depend on a sampling resolution.
 * Non-finite or non-positive ratios and gains are dropped rather than clamped to something audible,
 * and the bank is capped at `MAX_INHARMONIC_PARTIALS`.
 */
export function normalisedPartials(preset: Pick<SynthPreset, "partials" | "partialsLevel">): NormalisedPartial[] | null {
  const declared = preset.partials;
  if (!declared || declared.length === 0) return null;
  const usable = declared
    .filter((part) => Number.isFinite(part.ratio) && part.ratio > 0 && Number.isFinite(part.gain) && part.gain > 0)
    .slice(0, MAX_INHARMONIC_PARTIALS);
  if (usable.length === 0) return null;
  const total = usable.reduce((sum, part) => sum + part.gain, 0);
  const level = Number.isFinite(preset.partialsLevel ?? 1) ? Math.max(0, preset.partialsLevel ?? 1) : 1;
  if (total <= 0 || level <= 0) return null;
  return usable.map((part) => ({
    ratio: part.ratio,
    gain: (part.gain / total) * level,
    decayScale: (() => {
      const declared = part.decayScale ?? 1;
      return Number.isFinite(declared) && declared > 0 ? declared : 1;
    })(),
  }));
}

/**
 * The oscillator waveforms one voice of this preset allocates, in creation order.
 *
 * Exists so callers that need to reason about a voice's node count — the exporter-parity tests,
 * and anything counting voices for polyphony — ask the preset instead of assuming two. Before the
 * unison stage the answer was always `[osc1Type, osc2Type]`, and that assumption is exactly what
 * the parity suite had baked in.
 */
export function voiceOscillatorTypes(preset: SynthPreset): OscillatorType[] {
  // A partial bank replaces the pair entirely: one sine per partial, nothing else.
  const bank = normalisedPartials(preset);
  if (bank) return bank.map(() => "sine" as OscillatorType);
  const base: OscillatorType[] = [preset.osc1Type, preset.osc2Type];
  const spread = Math.max(0, Math.min(MAX_STEREO_SPREAD, preset.stereoSpread ?? 0));
  // The outer pair is the same waveform as osc1: it is the detuned stack filling out the first
  // oscillator, not a second timbre.
  return spread > 0 ? [...base, preset.osc1Type, preset.osc1Type] : base;
}

/**
 * The most a stereo spread is allowed to contribute.
 *
 * A full hard-panned pair in a *mono* playback path would collapse by 3 dB, and phones play
 * these parts through a single speaker often enough that it matters. 0.7 keeps the sides
 * clearly separated while leaving most of the signal in both channels.
 */
export const MAX_STEREO_SPREAD = 0.7;

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
  preset: SynthPreset = DEFAULT_SYNTH_PRESETS.analogLead,
  /**
   * Per-note timbre variation (P2.2 / A3).
   *
   * Omitted means "no variation", and every scheduled value is then exactly what it was before this parameter
   * existed — which is what lets the existing render tests keep comparing whole buffers.
   */
  variation: PolyVoiceVariation | null = null
): PolyVoiceCleanup {
  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];

  const freq = safeFreq(midiToFreq(midiNote), 440);
  // F-01: velocity drives exponential ramps; a zero (or a preset with cutoff 0)
  // would throw a RangeError and take the whole scheduler down with it.
  const safeVel = safeVelocity(velocity);
  // E-13: the amp level and every velocity→timbre depth below are driven by the curve
  // output, not by the raw velocity. `velocityCurve(1) === 1`, so a full-velocity note
  // is byte-for-byte the note this function produced before the curve existed.
  const velCurve = velocityCurve(safeVel);
  const { osc1Type, osc2Type, osc2DetuneCents, osc2Mix, filterQ, adsr } = preset;
  /**
   * Key tracking — the authored cutoff is a *C4* cutoff, not an absolute one.
   *
   * Applied here, before every consumer of `filterCutoff`, so the filter envelope, the velocity
   * depth and the 24 dB second stage all inherit it and the whole sweep tracks the note. The ratio
   * comes from the oscillator frequency rather than the raw MIDI argument, because the engine
   * passes pitches both as absolute notes and as role-relative offsets (a bass offset of +12 and an
   * absolute 48 must produce the same ratio, and only the frequency knows that).
   */
  /**
   * Key tracking first, then the per-note nudge: the nudge is a *multiplier* on the tracked cutoff, so it behaves
   * the same on a bass note and a lead note instead of being a fixed number of Hz that is inaudible on one and a
   * wobble on the other.
   */
  const filterCutoff = keyTrackedCutoff(preset, midiNote) * (variation ? variation.cutoffScale : 1);
  // Velocity → timbre depth. Each field defaults to 0, which short-circuits to the
  // original expression: an un-annotated preset schedules the exact cutoff, sweep and
  // amp timing it always did at *every* velocity. An annotated preset also keeps its
  // own numbers at full velocity because every factor below contains `(velCurve - 1)`
  // (cutoff / sweep) or `(1 - velCurve)` (timing) and is exactly 1 at `velCurve === 1`.
  const velocityToCutoff = preset.velocityToCutoff ?? 0;
  const velocityCutoff =
    velocityToCutoff === 0
      ? filterCutoff
      : safeFreq(filterCutoff * Math.pow(2, velocityToCutoff * (velCurve - 1)), filterCutoff);

  const attackScale = 1 + (preset.velocityToAttack ?? 0) * (1 - velCurve);
  const decayScale = 1 + (preset.velocityToDecay ?? 0) * (1 - velCurve);

  /**
   * The oscillator bank.
   *
   * A preset with `partials` is a struck metal body, and gets one sine oscillator per partial summed
   * **two per node** — the reproducible shape (see the field's doc and `oscillatorFanIn.test.ts`).
   * Everything else keeps the two-oscillator mix it always had, exactly as before.
   */
  const partialBank = normalisedPartials(preset);
  let osc1: OscillatorNode | null = null;
  let osc2: OscillatorNode | null = null;
  /** The oscillator mix's last node; both branches below assign it. */
  let mixerOut: AudioNode;
  /** End of the gate, needed by both branches: the partial bank schedules its own decays from it. */
  const gateEnd = time + Math.max(0.05, durationSec);
  if (partialBank) {
    /**
     * Each partial carries its own decay, because that is what a bell *is*: a struck body whose upper
     * partials die first, leaving the hum tone ringing. The decay is scheduled in seconds relative to
     * the preset's own `adsr.decay` (and to the velocity scaling above), so a partial can be made
     * shorter without touching the voice's envelope.
     */
    let stage: AudioNode[] = [];
    for (const partial of partialBank) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const partialFreq = safeFreq(freq * partial.ratio, freq);
      osc.frequency.setValueAtTime(partialFreq, time);
      if (preset.pitchSweepCents) {
        const sweepEnd = safeFreq(freq * Math.pow(2, preset.pitchSweepCents / 1200) * partial.ratio, partialFreq);
        osc.frequency.exponentialRampToValueAtTime(sweepEnd, gateEnd);
      }
      const gain = ctx.createGain();
      const peak = Math.max(0.0001, partial.gain);
      /**
       * A struck partial still needs a ramp, and it has to reach silence before its oscillator stops.
       *
       * This used to be `setValueAtTime(peak, time)` — a step from silence to full amplitude in one sample,
       * i.e. a broadband impulse on **every partial of every note** — and the oscillator then stopped while the
       * gain still sat at `peak * 0.0005`, which is the same discontinuity in reverse. The preset declares an
       * attack for exactly this reason; it is applied now, and the release is carved out of the note's own end
       * so a short gate cannot overlap the decay.
       */
      const attackFloor = 0.0001;
      const partialAttackSec = Math.max(0.002, adsr.attack * attackScale);
      const decaySec = Math.max(0.02, adsr.decay * decayScale * partial.decayScale);
      const decayEnd = time + partialAttackSec + decaySec;
      const plannedStop = gateEnd + Math.max(0.01, adsr.release) + 0.01;
      const releaseSec = Math.max(0.004, Math.min(0.05, adsr.release));
      const releaseAt = Math.max(decayEnd, plannedStop - releaseSec);
      gain.gain.setValueAtTime(attackFloor, time);
      gain.gain.linearRampToValueAtTime(peak, time + partialAttackSec);
      gain.gain.exponentialRampToValueAtTime(Math.max(attackFloor, peak * 0.0005), decayEnd);
      gain.gain.exponentialRampToValueAtTime(attackFloor, releaseAt);
      osc.connect(gain);
      osc.start(time);
      osc.stop(releaseAt + 0.01);
      sources.push(osc);
      gains.push(gain);
      stage.push(gain);
    }
    // Fan in two at a time: a node summing three or more differently-tuned oscillators is not
    // bit-reproducible in Chrome's OfflineAudioContext (measured in
    // `scripts/diagnose_repeat_determinism.mjs --primitives`).
    while (stage.length > 1) {
      const next: AudioNode[] = [];
      for (let i = 0; i < stage.length; i += 2) {
        if (i + 1 >= stage.length) {
          next.push(stage[i]);
          continue;
        }
        const sum = ctx.createGain();
        sum.gain.setValueAtTime(1, time);
        stage[i].connect(sum);
        stage[i + 1].connect(sum);
        gains.push(sum);
        next.push(sum);
      }
      stage = next;
    }
    mixerOut = stage[0];
  } else {
  // ---- two-oscillator mix (every preset without `partials`) ----
  // Dual Oscillators
  const osc1Node = ctx.createOscillator();
  const osc2Node = ctx.createOscillator();
  osc1 = osc1Node;
  osc2 = osc2Node;

  /**
   * `osc1` is a wavetable when the preset declares harmonics, and `osc1Type` otherwise.
   *
   * The order matters: `type` is assigned first so that a preset which names both still has a valid
   * waveform if the periodic wave cannot be built, and `setPeriodicWave` overrides it when it can.
   * A `null` from the coefficient helper (an empty or silent stack) falls back to the plain
   * oscillator rather than creating a voice that produces nothing.
   */
  osc1Node.type = osc1Type;
  const wave = periodicWaveCoefficients(preset.harmonics);
  if (wave) osc1Node.setPeriodicWave(ctx.createPeriodicWave(wave.real, wave.imag));
  osc1Node.frequency.setValueAtTime(freq, time);

  osc2Node.type = osc2Type;
  osc2Node.frequency.setValueAtTime(freq, time);
  osc2Node.detune.setValueAtTime(osc2DetuneCents + (variation ? variation.detuneCents : 0), time);

  // Optional pitch envelope: a preset may glide both oscillators to a fixed offset by
  // the end of the note (negative = tape-stop / laser / sub-drop fall, positive = riser).
  // (`gateEnd` is computed above, because the partial bank needs it too.)
  if (preset.pitchSweepCents) {
    const sweepEnd = safeFreq(freq * Math.pow(2, preset.pitchSweepCents / 1200), freq);
    osc1Node.frequency.exponentialRampToValueAtTime(sweepEnd, gateEnd);
    osc2Node.frequency.exponentialRampToValueAtTime(sweepEnd, gateEnd);
  }

  // Mixer
  const osc1Gain = ctx.createGain();
  const osc2Gain = ctx.createGain();
  osc1Gain.gain.setValueAtTime(1 - osc2Mix * 0.5, time);
  osc2Gain.gain.setValueAtTime(osc2Mix, time);

  osc1Node.connect(osc1Gain);
  osc2Node.connect(osc2Gain);

  /**
   * Optional stereo unison stage.
   *
   * A second detuned pair is added and the two pairs are panned apart, which is the mechanism
   * behind a supersaw's width. Placed *before* the filter so the filter, the resonance
   * compensation, the amp envelope and the noise bed all keep the single-channel graph they had:
   * only the oscillator mix is widened, and everything downstream stays as it was.
   *
   * The nodes are created only when a preset asks for it. A preset without `stereoSpread` (the
   * default, and every preset that predates the field) therefore allocates exactly the nodes it
   * always did and sounds identical — the guarantee that keeps the committed baselines honest.
   */
  mixerOut = osc1Gain;
  const spread = Math.max(0, Math.min(MAX_STEREO_SPREAD, preset.stereoSpread ?? 0));
  // A partial bank has no detuned pair to widen; its width, if any, is baked into the ratios.
  if (!partialBank && spread > 0) {
    const osc3 = ctx.createOscillator();
    const osc4 = ctx.createOscillator();
    const outerGain = ctx.createGain();
    // A 1-input, 2-output splitter duplicates the mono outer pair onto both outputs, which is
    // what makes two independent pan gains possible without sending the pair to `destination`
    // (a bare `GainNode.connect(destination)` would, and the note would play twice).
    const splitter = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    const leftBus = ctx.createGain();
    const rightBus = ctx.createGain();

    const outerCents = unisonOuterDetuneCents(osc2DetuneCents);
    for (const [osc, cents] of [
      [osc3, outerCents],
      [osc4, -outerCents],
    ] as const) {
      osc.type = osc1Type;
      osc.frequency.setValueAtTime(freq, time);
      osc.detune.setValueAtTime(cents + (variation ? variation.detuneCents : 0), time);
      if (preset.pitchSweepCents) {
        const sweepEnd = safeFreq(freq * Math.pow(2, preset.pitchSweepCents / 1200), freq);
        osc.frequency.exponentialRampToValueAtTime(sweepEnd, gateEnd);
      }
      osc.start(time);
      // Bounded the same way the noise bed is (gate + release + a margin) rather than by
      // `noteEndTime`, which is not computed until the amp envelope below. One extra release
      // length of a silent tail costs nothing and keeps these two sources' lifetimes identical.
      osc.stop(gateEnd + Math.max(0.01, adsr.release) + 0.01);
      sources.push(osc);
    }
    // The outer pair carries half the mix, so adding it does not raise the summed level: the
    // preset's own balance between osc1 and osc2 is preserved and only the width changes.
    outerGain.gain.setValueAtTime(osc2Mix * 0.5, time);
    osc3.connect(outerGain);
    osc4.connect(outerGain);

    const { left, right } = stereoSpreadGains(spread);
    outerGain.connect(splitter);
    splitter.connect(leftBus, 0);
    splitter.connect(rightBus, 1);
    leftBus.gain.setValueAtTime(left, time);
    rightBus.gain.setValueAtTime(right, time);

    // The original pair stays centred underneath: its mono mix goes to both output channels.
    osc1Gain.connect(merge, 0, 0);
    osc1Gain.connect(merge, 0, 1);
    osc2Gain.connect(merge, 0, 0);
    osc2Gain.connect(merge, 0, 1);
    leftBus.connect(merge, 0, 0);
    rightBus.connect(merge, 0, 1);
    gains.push(outerGain, leftBus, rightBus);
    mixerOut = merge;
  }
  }

  // Per-voice Resonant Biquad Filter
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  // The preset's own cutoff is scheduled first: it is the reference every caller and
  // parity test identifies the voice by, and at full velocity it is the value the note
  // actually holds. Velocity (when the preset opts in) moves the base below it.
  /**
   * Q9: the optional 24 dB slope is two cascaded stages, and **both** must follow the filter
   * envelope. The second stage used to be created later with a single
   * `setValueAtTime(filterCutoff, time)` and never touched again, while only stage 1 swept to
   * `cutoff · 2^envOctaves`. A real 303 is a single ladder moving as one, so the sweep came out
   * roughly half as deep and left a static corner under a resonant peak — which is exactly why
   * the acid line read as muffled and its accents as level rather than brightness.
   *
   * `filter2` is created here, before any frequency is scheduled, so every automation below can
   * go to both stages; the Q split and the graph wiring stay at their original site.
   */
  let filter2: BiquadFilterNode | null = null;
  if (preset.filterSlope24) {
    filter2 = ctx.createBiquadFilter();
    filter2.type = "lowpass";
    // Stage 2 carries the resonance at Q=1 and stage 1 is tamed (see the Q split below); both
    // values are the pre-Q9 ones, preserved so the only thing that changed is the sweep.
    filter2.Q.setValueAtTime(1, time);
  }
  const cutoffStages: AudioParam[] = filter2 ? [filter.frequency, filter2.frequency] : [filter.frequency];

  cutoffStages.forEach((param) => param.setValueAtTime(filterCutoff, time));
  filter.Q.setValueAtTime(filterQ, time);

  // Velocity-scaled settle onto the base cutoff, scheduled *before* the attack sweep.
  // A soft note therefore starts dark instead of sweeping down from the preset cutoff.
  // The ramp is bounded by half the attack (so it always completes first) and 0.5 ms is
  // far shorter than any preset's attack — it is heard as the starting brightness, not
  // as a sweep. Skipped entirely when velocity has not moved the cutoff, which is every
  // un-annotated preset and every full-velocity note.
  if (velocityCutoff !== filterCutoff) {
    const settleSec = Math.min(VELOCITY_FILTER_SETTLE_SEC, adsr.attack * 0.5);
    if (settleSec > 0) {
      cutoffStages.forEach((param) => param.exponentialRampToValueAtTime(velocityCutoff, time + settleSec));
    }
  }

  // Dynamic filter sweep matching attack/decay. The default depth is the original
  // timbre-preserving `cutoff · 2.5`, reached at `time + adsr.attack` / returned at
  // `time + adsr.attack + adsr.decay`. An explicit `velocityToFilterEnv` closes the
  // peak further as velocity falls (floored at the base cutoff so the sweep never turns
  // downward); at full velocity — or when the field is absent — the original expression
  // is used unchanged, so the ff render stays bit-for-bit identical.
  const velocityToFilterEnv = preset.velocityToFilterEnv ?? 0;
  // E-14: the depth is the preset's when it states one, and the historical `·2.5` when it does
  // not — so an un-annotated preset is unchanged, bit for bit, which is what keeps the
  // library's measured baselines meaningful for everything that was not deliberately re-voiced.
  const envOctaves = preset.filterEnvOctaves ?? FILTER_ENV_OCTAVES;
  const peakFilter =
    velocityToFilterEnv === 0 || velCurve >= 1
      ? safeFreq(Math.min(velocityCutoff * Math.pow(2, envOctaves), 18000))
      : safeFreq(
          Math.min(
            velocityCutoff *
              Math.pow(
                2,
                Math.max(0, envOctaves + velocityToFilterEnv * (velCurve - 1))
              ),
            18000
          )
        );
  // A depth of zero is a preset saying "no sweep": ramping to the value it is already at would
  // be harmless, but scheduling nothing is honest about the intent.
  if (envOctaves > 0) {
    const sweepAttackEnd = time + adsr.attack * attackScale * (preset.filterEnvAttackScale ?? 1);
    const sweepDecayEnd = sweepAttackEnd + adsr.decay * decayScale * (preset.filterEnvDecayScale ?? 1);
    // Q9: both 24 dB stages sweep together.
    cutoffStages.forEach((param) => {
      param.exponentialRampToValueAtTime(peakFilter, sweepAttackEnd);
      param.exponentialRampToValueAtTime(velocityCutoff, sweepDecayEnd);
    });
  }

  /**
   * E-14 — resonance compensation and the optional 24 dB slope.
   *
   * Compensation is a *pre-filter* gain: the resonant peak is what rises with Q, so trimming
   * the signal entering the filter is the correction that does not also change the filter's
   * character (a post-filter trim would just be a fader). A preset can opt out with
   * `resonanceCompDbPerQ: 0`.
   *
   * The 24 dB option is two cascaded 12 dB lowpasses rather than a different filter design: it
   * is the same biquad the whole engine already uses, so parity between the live engine and the
   * exporter is structural, and the cost is exactly one extra node per voice.
   */
  const compDb = resonanceCompensationGainDb(filterQ, preset.resonanceCompDbPerQ ?? RESONANCE_COMP_DB_PER_Q);
  if (compDb !== 0) {
    const resonanceComp = ctx.createGain();
    resonanceComp.gain.setValueAtTime(Math.pow(10, compDb / 20), time);
    // `mixerOut` is the oscillator mix's last node — the stereo merge when the preset is
    // widened, `osc1Gain` otherwise — so everything downstream is untouched by the unison stage.
    mixerOut.connect(resonanceComp);
    resonanceComp.connect(filter);
  } else {
    mixerOut.connect(filter);
  }

  /** The last filter stage in the chain, so the noise bed and the amp connect to the right one. */
  let lastFilter: BiquadFilterNode = filter;
  if (filter2) {
    // Q9: cutoff automation already went to both stages above. The Q is moved to the *second*
    // stage only, so a resonant 24 dB voice does not get two resonant peaks stacked.
    filter.Q.setValueAtTime(Math.max(0.7, filterQ * 0.5), time);
    filter.connect(filter2);
    lastFilter = filter2;
  }

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
    // The noise bed shares the voice's filter chain, including the 24 dB second stage.
    noiseGain.connect(lastFilter === filter ? filter : lastFilter);
    noise.start(time);
    noise.stop(time + Math.max(0.05, durationSec) + Math.max(0.01, adsr.release) + 0.01);
    sources.push(noise);
    gains.push(noiseGain);
  }

  // ADSR Amp Envelope
  const ampGain = ctx.createGain();
  // E-13: the curve replaces the old linear `safeVel · 0.8`, and the velocity-scaled
  // attack/decay replace the raw ADSR times. Both are exact identities at full velocity
  // (`velocityCurve(1) === 1`, `attackScale === decayScale === 1`).
  const maxVolume = safeGain(velCurve * 0.8, 0.001);
  const attackStart = 0.0001;
  const attackPeak = Math.max(0.001, maxVolume);
  const attackEnd = time + Math.max(0.002, adsr.attack * attackScale);
  const decayEnd = attackEnd + Math.max(0.01, adsr.decay * decayScale);
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

  lastFilter.connect(ampGain);
  ampGain.connect(dest);

  if (osc1 && osc2) {
    osc1.start(time);
    osc2.start(time);
    osc1.stop(noteEndTime + 0.01);
    osc2.stop(noteEndTime + 0.01);
    sources.push(osc1, osc2);
  }
  gains.push(ampGain);

  return { sources, gains, stopTime: noteEndTime + 0.01 };
}
