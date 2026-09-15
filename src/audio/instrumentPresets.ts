/**
 * Genre instrument → synth preset resolution.
 *
 * Every genre in `src/data/genres/**` declares a `track.instrument` per track, but the
 * engine used to ignore it and always play the same fixed preset for a track *role*
 * (bass → acidBass, chords → warmPad, lead → analogLead). That made a flute-lead genre
 * sound like an analog saw lead. This module is the single translation point between the
 * data's instrument names and the `SynthPreset` objects in `PolySynth.ts`.
 *
 * Resolution is a pure function of (instrument, trackId) with a documented fallback
 * chain — first hit wins:
 *
 *   1. exact match      — the instrument name is itself a `DEFAULT_SYNTH_PRESETS` key
 *                         (case-insensitive), e.g. `"supersaw"`.
 *   2. alias table      — `INSTRUMENT_PRESET_ALIASES[normalized name]`; this carries
 *                         every snake_case name the data actually uses (`flute_lead`,
 *                         `808_bass`, …) plus a few obvious synonyms.
 *   3. track-role default — the legacy per-role preset, so an unknown instrument on a
 *                         bass/chords/lead/fx track still sounds like that role.
 *   4. global default   — `analogLead` when even the track id is unrecognised.
 *
 * The resolver never throws and always returns a preset object, so callers (the live
 * engine and the offline WAV renderer) stay a single line.
 */

import { DEFAULT_SYNTH_PRESETS, SynthPreset } from "./PolySynth";

/** Preset used when nothing else matches (also the historical lead preset). */
export const GLOBAL_DEFAULT_PRESET_KEY = "analogLead";

/**
 * Instrument name → preset key.
 *
 * Keys are canonical (`normalizeInstrumentName` lowercases, trims and collapses
 * whitespace/hyphens to underscores). The first block is exactly the set of synth-role
 * instrument names that appear in the genre data; the rest are defensive synonyms.
 */
export const INSTRUMENT_PRESET_ALIASES: Record<string, string> = {
  // --- Names declared by src/data/genres/** --------------------------------
  saw_lead: "sawLead",
  square_lead: "squareLead",
  guitar_lead: "guitarLead",
  flute_lead: "fluteLead",
  pluck_synth: "pluckSynth",
  warm_pad: "warmPad",
  rhodes_ep: "rhodesEp",
  m1_organ: "m1Organ",
  brass_synth: "brassSynth",
  sub_bass: "subBass",
  "808_bass": "bass808",
  acid_303: "acidBass",
  reese_bass: "reeseBass",
  walking_upright: "walkingUpright",
  slap_bass: "slapBass",
  distorted_kick: "distortedKickBass",
  noise_sweep: "noiseSweep",

  // --- Synonyms / legacy spellings ----------------------------------------
  sawtooth_lead: "sawLead",
  saw: "sawLead",
  pulse_lead: "squareLead",
  square: "squareLead",
  electric_guitar: "guitarLead",
  guitar: "guitarLead",
  flute: "fluteLead",
  pluck: "pluckSynth",
  super_saw: "supersaw",
  pad: "warmPad",
  synth_pad: "warmPad",
  rhodes: "rhodesEp",
  electric_piano: "rhodesEp",
  organ: "m1Organ",
  brass: "brassSynth",
  sub: "subBass",
  "808": "bass808",
  "808_sub": "bass808",
  acid: "acidBass",
  tb_303: "acidBass",
  reese: "reeseBass",
  upright: "walkingUpright",
  double_bass: "walkingUpright",
  acoustic_bass: "walkingUpright",
  slap: "slapBass",
  sweep: "noiseSweep",
  fx_riser: "noiseSweep",
  riser: "noiseSweep",
};

/**
 * Track-role fallbacks (step 3).
 *
 * `bass`/`chords`/`lead`/`fx` reproduce the pre-timbre engine exactly, so an unknown or
 * missing instrument on those roles is a no-op regression-wise. The drum roles are only
 * here so the resolver is **total** over the `track_id` values that exist in the data:
 * the engine's drum dispatch (playKick/playSnare/playHiHat/playPercussion) never consults
 * this module, and drum synthesis is deliberately untouched.
 */
export const TRACK_ROLE_DEFAULT_PRESET_KEYS: Record<string, string> = {
  bass: "acidBass",
  chords: "warmPad",
  chord: "warmPad",
  pad: "warmPad",
  lead: "analogLead",
  fx: "noiseSweep",
  kick: "subBass",
  snare: "pluckSynth",
  hihat: "pluckSynth",
  hat: "pluckSynth",
  percussion: "pluckSynth",
  perc: "pluckSynth",
  clap: "pluckSynth",
};

/** Canonicalises an instrument name for table lookups (pure, exported for tests). */
export function normalizeInstrumentName(instrument: string | undefined): string {
  return (instrument || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Step 1: literal (case-insensitive) preset-key match. */
function exactPresetKey(instrument: string): string | undefined {
  if (DEFAULT_SYNTH_PRESETS[instrument]) return instrument;
  const lower = instrument.toLowerCase();
  return Object.keys(DEFAULT_SYNTH_PRESETS).find((key) => key.toLowerCase() === lower);
}

/** Step 3: track-role default, tolerating compound ids like `"lead-synth"`. */
function trackRolePresetKey(trackId: string | undefined): string | undefined {
  const id = (trackId || "").trim().toLowerCase();
  if (!id) return undefined;
  if (TRACK_ROLE_DEFAULT_PRESET_KEYS[id]) return TRACK_ROLE_DEFAULT_PRESET_KEYS[id];

  // Mirror the engine's substring dispatch for ids we do not enumerate.
  if (id.includes("kick")) return "subBass";
  if (id.includes("snare")) return "pluckSynth";
  if (id.includes("hat")) return "pluckSynth";
  if (id.includes("perc") || id.includes("clap")) return "pluckSynth";
  if (id.includes("bass")) return "acidBass";
  if (id.includes("chord") || id.includes("pad")) return "warmPad";
  if (id.includes("lead")) return "analogLead";
  if (id.includes("fx")) return "noiseSweep";
  return undefined;
}

/**
 * Resolves the preset a track should sound with.
 *
 * @param instrument the track's declared instrument name (`track.instrument`); may be
 *                   undefined or empty — both fall back to the role default.
 * @param trackId    the track's `track_id` (kick/snare/hihat/percussion/bass/chords/lead/fx).
 */
export function resolveInstrumentPreset(
  instrument: string | undefined,
  trackId: string
): SynthPreset {
  const raw = (instrument || "").trim();

  const exact = raw ? exactPresetKey(raw) : undefined;
  if (exact) return DEFAULT_SYNTH_PRESETS[exact];

  const aliasKey = INSTRUMENT_PRESET_ALIASES[normalizeInstrumentName(raw)];
  if (aliasKey && DEFAULT_SYNTH_PRESETS[aliasKey]) {
    return DEFAULT_SYNTH_PRESETS[aliasKey];
  }

  const roleKey = trackRolePresetKey(trackId);
  if (roleKey && DEFAULT_SYNTH_PRESETS[roleKey]) {
    return DEFAULT_SYNTH_PRESETS[roleKey];
  }

  return DEFAULT_SYNTH_PRESETS[GLOBAL_DEFAULT_PRESET_KEY];
}
