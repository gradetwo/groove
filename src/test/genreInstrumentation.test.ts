import { describe, it, expect } from "vitest";
import { ALL_GENRES } from "../data/genres";
import { DEFAULT_SYNTH_PRESETS } from "../audio/PolySynth";
import {
  GLOBAL_DEFAULT_PRESET_KEY,
  INSTRUMENT_PRESET_ALIASES,
  normalizeInstrumentName,
  resolveInstrumentPreset,
} from "../audio/instrumentPresets";

/**
 * Genre instrumentation integrity (timbre curation).
 *
 * The defect this guards against: all 159 genres shipped the *same* five-entry
 * `instrumentation` list ("Synthesizer", "Drum Machine", "Bass", "Sampler", "FX") and
 * every fx track played the same `noise_sweep`, so `GenreDetailView` / `CompareView` /
 * the timeline tooltip told the user that bebop and delta blues have the same core
 * instruments. The lists are now curated per genre and must stay:
 *
 *   1. genre-specific (not one literal copied 159×),
 *   2. human-readable (2–6 distinct entries, no generic placeholder words),
 *   3. consistent with what the sequencer actually plays — every declared bass / chords /
 *      lead instrument has to be *named* by one of the entries through the allow-list
 *      below (so a saxophone lead may not be listed as "Synth"),
 *   4. resolvable: every melodic `(track_id, instrument)` pair maps through the explicit
 *      exact-key/alias steps and never falls through to the global default,
 *   5. diverse on fx as well — no single fx instrument may cover the whole library.
 *
 * When the data grows a genuinely new instrument, this file fails and whoever adds it
 * must teach the allow-list the words a user would recognise for it.
 */

/** Track roles voiced by the poly synth; drums are a deliberately separate path. */
const MELODIC_TRACK_IDS = ["bass", "chords", "lead"] as const;
const FX_TRACK_ID = "fx";

/**
 * Instrument name → the phrases a human instrumentation entry may use for it. Matching
 * is a case-insensitive substring test, so "Alto Sax" matches `sax_lead` via "sax" while
 * "Synthesizer" does not match it at all.
 */
const INSTRUMENT_TOKENS: Record<string, string[]> = {
  // leads / comping voices
  saw_lead: ["synth lead", "saw lead", "sawtooth synth", "detuned saw", "saw synth", "analog saw", "monosynth", "analog synth"],
  square_lead: ["square", "screech", "chip", "8-bit", "casio", "digital synth"],
  guitar_lead: ["guitar"],
  // A high-gain *rhythm* guitar, distinct from the lead voice. The phrases below are the
  // ones the Rock/Metal curation already uses to describe each genre's amplifier, so the
  // test ties the track instrument to the documented amp character rather than to a
  // generic "guitar".
  distorted_guitar: [
    "distorted guitar",
    "high-gain",
    "overdriven guitar",
    "fuzz",
    "buzzsaw",
    "tremolo-picked",
    "down-tuned",
    "palm-muted",
    "solid-body guitar",
  ],
  pluck_synth: ["pluck"],
  flute_lead: ["flute"],
  sax_lead: ["sax"],
  trumpet_lead: ["trumpet", "cornet"],
  muted_trumpet: ["muted trumpet", "harmon-muted trumpet", "trumpet"],
  brass_section: ["brass", "horn"],
  brass_synth: ["brass", "horn"],
  piano_lead: ["piano"],
  organ_lead: ["organ"],
  m1_organ: ["organ", "m1"],
  vibraphone: ["vibraphone"],
  strings_lead: ["string"],
  pluck_string: ["pluck"],
  pan_flute: ["pan flute"],
  sitar_lead: ["sitar"],
  accordion_lead: ["accordion"],
  harmonica_lead: ["harmonica", "melodica"],
  marimba_lead: ["marimba"],
  bell_lead: ["bell", "music box"],
  sine_lead: ["sine lead", "portamento sine"],
  fm_lead: ["fm"],
  cowbell_lead: ["cowbell"],
  growl_lead: ["growl"],
  warm_pad: ["pad"],
  rhodes_ep: ["rhodes", "electric piano"],
  supersaw: ["supersaw"],
  // basses
  sub_bass: ["sub bass", "sub-bass", "808 sub"],
  "808_bass": ["808"],
  bass808: ["808"],
  acid_303: ["303", "acid"],
  reese_bass: ["reese"],
  walking_upright: ["upright", "double bass", "acoustic bass"],
  slap_bass: ["slap bass"],
  finger_bass: ["fingerstyle bass", "fingerstyle electric bass", "bass guitar", "electric bass", "precision bass"],
  pick_bass: ["picked bass", "bass guitar", "electric bass", "distorted bass guitar", "chorus bass guitar"],
  analog_bass: ["analog bass", "analog synth bass", "synth bass", "moog bass"],
  distorted_kick: ["distorted kick"],
};

/** Words that are too generic to identify an instrument; the old defect used all five. */
const PLACEHOLDER_ENTRIES = new Set(["synthesizer", "sampler", "fx", "bass", "drum machine"]);

/** A melodic instrument is "named" if one entry contains one of its allow-list phrases. */
function instrumentationNames(entries: string[], instrument: string): boolean {
  const tokens = INSTRUMENT_TOKENS[instrument];
  if (!tokens) return false;
  return entries.some((entry) => tokens.some((token) => entry.toLowerCase().includes(token)));
}

interface GenreSurvey {
  id: string;
  instrumentation: string[];
  tracks: Record<string, string>;
}

const SURVEY: GenreSurvey[] = ALL_GENRES.map((genre) => ({
  id: genre.id,
  instrumentation: genre.instrumentation,
  tracks: Object.fromEntries(genre.sequencer_pattern.tracks.map((t) => [t.track_id, t.instrument])),
}));

describe("genre instrumentation · per-genre curation", () => {
  it("surveys the whole shipped library", () => {
    expect(SURVEY.length).toBeGreaterThanOrEqual(100);
    for (const genre of SURVEY) {
      for (const role of [...MELODIC_TRACK_IDS, FX_TRACK_ID]) {
        expect(genre.tracks[role], `${genre.id} must declare a ${role} track`).toBeTruthy();
      }
    }
  });

  it("gives every genre 2–6 distinct, non-empty instrumentation entries", () => {
    for (const { id, instrumentation } of SURVEY) {
      expect(Array.isArray(instrumentation), id).toBe(true);
      expect(instrumentation.length, `${id} entry count`).toBeGreaterThanOrEqual(2);
      expect(instrumentation.length, `${id} entry count`).toBeLessThanOrEqual(6);
      for (const entry of instrumentation) {
        expect(typeof entry === "string" && entry.trim().length > 0, `${id} entry`).toBe(true);
      }
      expect(new Set(instrumentation).size, `${id} duplicate entries`).toBe(instrumentation.length);
    }
  });

  it("keeps instrumentation genre-specific instead of one shared literal", () => {
    const counts = new Map<string, number>();
    for (const { instrumentation } of SURVEY) {
      const key = JSON.stringify(instrumentation);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const shared = [...counts.values()].sort((a, b) => b - a);

    // The old defect produced exactly one list shared by all 159 genres.
    expect(new Set(SURVEY.map((g) => JSON.stringify(g.instrumentation))).size).toBeGreaterThanOrEqual(120);
    expect(shared[0]).toBeLessThanOrEqual(3);
  });

  it("does not fall back to the generic placeholder vocabulary", () => {
    const offenders: string[] = [];
    for (const { id, instrumentation } of SURVEY) {
      for (const entry of instrumentation) {
        if (PLACEHOLDER_ENTRIES.has(entry.trim().toLowerCase())) offenders.push(`${id}: ${entry}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("names every declared melodic instrument in the genre's instrumentation", () => {
    const offenders: string[] = [];
    const missingToken: string[] = [];

    for (const { id, instrumentation, tracks } of SURVEY) {
      for (const role of MELODIC_TRACK_IDS) {
        const instrument = tracks[role];
        if (!INSTRUMENT_TOKENS[instrument]) {
          missingToken.push(`${id}:${role}:${instrument}`);
          continue;
        }
        if (!instrumentationNames(instrumentation, instrument)) {
          offenders.push(`${id}: ${role}=${instrument} not named by [${instrumentation.join(", ")}]`);
        }
      }
    }

    expect(missingToken, "add an allow-list entry for these new instruments").toEqual([]);
    expect(offenders).toEqual([]);
  });

  it("resolves every melodic pair through an explicit mapping, never the global default", () => {
    const GLOBAL_DEFAULT = DEFAULT_SYNTH_PRESETS[GLOBAL_DEFAULT_PRESET_KEY];
    const offenders: string[] = [];

    for (const { id, tracks } of SURVEY) {
      for (const role of [...MELODIC_TRACK_IDS, FX_TRACK_ID]) {
        const instrument = tracks[role];
        const exact = Object.keys(DEFAULT_SYNTH_PRESETS).some(
          (key) => key.toLowerCase() === instrument.toLowerCase()
        );
        const aliased = Boolean(INSTRUMENT_PRESET_ALIASES[normalizeInstrumentName(instrument)]);
        if (!exact && !aliased) offenders.push(`${id}:${role}:${instrument} has no exact/alias key`);

        const preset = resolveInstrumentPreset(instrument, role);
        if (preset === GLOBAL_DEFAULT) offenders.push(`${id}:${role}:${instrument} fell through to global`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("no longer plays one fx instrument across the whole library", () => {
    const counts = new Map<string, number>();
    for (const { tracks } of SURVEY) {
      counts.set(tracks[FX_TRACK_ID], (counts.get(tracks[FX_TRACK_ID]) ?? 0) + 1);
    }
    const shared = [...counts.values()].sort((a, b) => b - a);

    // Nine curated fx voices today; the old library had exactly one.
    expect(counts.size).toBeGreaterThanOrEqual(5);
    expect(shared[0] / SURVEY.length).toBeLessThanOrEqual(0.6);
  });

  it("keeps the lead/fx voices musically distributed, not collapsed on the legacy defaults", () => {
    const leadCounts = new Map<string, number>();
    for (const { tracks } of SURVEY) leadCounts.set(tracks.lead, (leadCounts.get(tracks.lead) ?? 0) + 1);

    // `saw_lead` used to cover 92/159 leads; after curation no single lead instrument
    // may dominate the library.
    const topLead = Math.max(...leadCounts.values());
    expect(topLead / SURVEY.length).toBeLessThanOrEqual(0.4);
    expect(leadCounts.size).toBeGreaterThanOrEqual(15);
  });
});
