import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SYNTH_PRESETS } from "../audio/PolySynth";
import {
  resolveInstrumentPreset,
  normalizeInstrumentName,
  INSTRUMENT_PRESET_ALIASES,
  TRACK_ROLE_DEFAULT_PRESET_KEYS,
  GLOBAL_DEFAULT_PRESET_KEY,
} from "../audio/instrumentPresets";
import { ALL_GENRES } from "../data/genres";

/**
 * Timbre fix acceptance: every genre declares `track.instrument`, so the resolver must
 * translate all of those names into *distinct, non-default* presets. The survey below is
 * read straight out of `src/data/genres/*.ts` (like `genreIdReferences.test.ts` does with
 * `node:fs`) so a newly authored instrument name cannot silently fall back to the analog
 * lead preset the way the engine used to.
 */

const GLOBAL_DEFAULT = DEFAULT_SYNTH_PRESETS[GLOBAL_DEFAULT_PRESET_KEY];

/** Track roles that are voiced by the poly synth and therefore must resolve by name. */
const SYNTH_TRACK_IDS = new Set(["bass", "chords", "chord", "lead", "fx"]);

/**
 * The instrument names each synth role declares today. Pinned so the *coverage* claim in
 * TIMBRE_NOTES.md is executable: if the data grows a new lead instrument, this fails and
 * whoever added it must give it a preset.
 */
const EXPECTED_SYNTH_INSTRUMENTS: Record<string, string[]> = {
  lead: ["accordion_lead","acid_303","bell_lead","brass_section","brass_synth","cowbell_lead","flute_lead","fm_lead","growl_lead","guitar_lead","harmonica_lead","m1_organ","muted_trumpet","organ_lead","pan_flute","piano_lead","pluck_string","pluck_synth","saw_lead","sax_lead","sine_lead","sitar_lead","square_lead","strings_lead","supersaw","trumpet_lead","warm_pad"],
  bass: ["808_bass","acid_303","analog_bass","distorted_kick","finger_bass","fm_lead","growl_lead","pick_bass","reese_bass","saw_lead","slap_bass","square_lead","sub_bass","walking_upright"],
  // `distorted_guitar` was added when the Rock/Metal genres' *chords* tracks moved off
  // the lead-guitar preset: a power chord needs the high-gain rhythm voice, while the
  // lead track legitimately stays `guitar_lead`.
  chords: ["accordion_lead","brass_synth","distorted_guitar","guitar_lead","m1_organ","marimba_lead","piano_lead","rhodes_ep","strings_lead","supersaw","vibraphone","warm_pad"],
  fx: ["horn_stab","laser_zap","noise_rise","noise_sweep","reverse_cymbal","sub_drop","sweep_down","tape_stop","vinyl_crackle"],
};

interface TrackPair {
  trackId: string;
  instrument: string;
  source: string;
}

const GENRE_DIR = path.resolve(__dirname, "../data/genres");

/**
 * Extracts every (`track_id`, `instrument`) pair from the raw genre sources. `instrument`
 * always follows `track_id` inside a track literal, so the nearest preceding `track_id`
 * is the owner of each `instrument`.
 */
function scanGenreFiles(): TrackPair[] {
  const pairs: TrackPair[] = [];
  const files = fs.readdirSync(GENRE_DIR).filter((f) => f.endsWith(".ts"));

  for (const file of files) {
    const text = fs.readFileSync(path.join(GENRE_DIR, file), "utf8");

    const trackIds: Array<{ index: number; id: string }> = [];
    const trackRe = /"track_id"\s*:\s*"([^"]+)"/g;
    for (let m = trackRe.exec(text); m; m = trackRe.exec(text)) {
      trackIds.push({ index: m.index, id: m[1] });
    }

    const instrumentRe = /"instrument"\s*:\s*"([^"]+)"/g;
    for (let m = instrumentRe.exec(text); m; m = instrumentRe.exec(text)) {
      let trackId = "";
      for (let i = trackIds.length - 1; i >= 0; i--) {
        if (trackIds[i].index < m.index) {
          trackId = trackIds[i].id;
          break;
        }
      }
      pairs.push({ trackId, instrument: m[1], source: file });
    }
  }

  return pairs;
}

const FILE_PAIRS = scanGenreFiles();

function instrumentsByRole(): Record<string, string[]> {
  const byRole: Record<string, Set<string>> = {};
  for (const pair of FILE_PAIRS) {
    (byRole[pair.trackId] ??= new Set()).add(pair.instrument);
  }
  return Object.fromEntries(
    Object.entries(byRole).map(([role, names]) => [role, [...names].sort()])
  );
}

const BY_ROLE = instrumentsByRole();

describe("genre timbres · instrument → preset mapping", () => {
  it("finds every instrument the engine has to voice", () => {
    // Sanity: the scan is not empty or accidentally matching only one file.
    // 159 genres × 8 tracks each at the time of writing.
    expect(FILE_PAIRS.length).toBeGreaterThanOrEqual(159 * 8);
    expect(Object.keys(BY_ROLE).sort()).toEqual([
      "bass",
      "chords",
      "fx",
      "hihat",
      "kick",
      "lead",
      "percussion",
      "snare",
    ]);
  });

  it("matches the pinned survey of synth-track instruments", () => {
    for (const [role, expected] of Object.entries(EXPECTED_SYNTH_INSTRUMENTS)) {
      expect(BY_ROLE[role], `declared instruments on the ${role} track`).toEqual(
        [...expected].sort()
      );
    }
  });

  it("agrees with the typed genre data (no drift between files and exports)", () => {
    const fromData = new Set<string>();
    for (const genre of ALL_GENRES) {
      for (const track of genre.sequencer_pattern.tracks) {
        fromData.add(`${track.track_id}:${track.instrument}`);
      }
    }
    const fromFiles = new Set(FILE_PAIRS.map((p) => `${p.trackId}:${p.instrument}`));
    expect([...fromFiles].sort()).toEqual([...fromData].sort());
  });

  it("resolves every pair in the data without ever reaching the global default", () => {
    const fallthroughs: string[] = [];
    const notFromLibrary: string[] = [];
    const library = Object.values(DEFAULT_SYNTH_PRESETS);

    for (const pair of FILE_PAIRS) {
      const preset = resolveInstrumentPreset(pair.instrument, pair.trackId);
      if (!library.includes(preset)) {
        notFromLibrary.push(`${pair.source}:${pair.trackId}:${pair.instrument}`);
      }
      if (preset === GLOBAL_DEFAULT) {
        fallthroughs.push(`${pair.source}:${pair.trackId}:${pair.instrument}`);
      }
    }

    expect(notFromLibrary).toEqual([]);
    expect(fallthroughs).toEqual([]);
  });

  it("covers every synth instrument with an explicit alias or exact preset key", () => {
    const missing: string[] = [];
    for (const role of Object.keys(EXPECTED_SYNTH_INSTRUMENTS)) {
      for (const name of BY_ROLE[role] ?? []) {
        const hasExact = Boolean(DEFAULT_SYNTH_PRESETS[name]);
        const hasAlias = Boolean(INSTRUMENT_PRESET_ALIASES[normalizeInstrumentName(name)]);
        if (!hasExact && !hasAlias) missing.push(`${role}:${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("has a role default for every track_id present in the data", () => {
    const missing = Object.keys(BY_ROLE).filter((role) => !TRACK_ROLE_DEFAULT_PRESET_KEYS[role]);
    expect(missing).toEqual([]);
  });

  it("resolves every distinct instrument name (drums included) without throwing", () => {
    for (const pair of FILE_PAIRS) {
      const preset = resolveInstrumentPreset(pair.instrument, pair.trackId);
      expect(preset, `${pair.source}:${pair.instrument}`).toBeTruthy();
      expect(preset.name).toBeTruthy();
    }
  });

  it("maps representative instruments to musically distinct timbres", () => {
    const saw = resolveInstrumentPreset("saw_lead", "lead");
    const flute = resolveInstrumentPreset("flute_lead", "lead");

    // The bug being fixed: a flute genre no longer plays the analog saw lead.
    expect(flute).not.toBe(saw);
    expect(flute.osc1Type).toBe("sine");
    expect(flute.adsr.attack).toBeGreaterThan(saw.adsr.attack);
    expect(flute.filterCutoff).toBeGreaterThan(0);

    const sub = resolveInstrumentPreset("sub_bass", "bass");
    expect(sub.filterCutoff).toBeLessThan(saw.filterCutoff);
    expect(sub.osc1Type).toBe("sine");
    expect(sub.osc2Mix).toBe(0);

    const superSaw = resolveInstrumentPreset("supersaw", "chords");
    expect(superSaw.osc2DetuneCents).toBeGreaterThan(saw.osc2DetuneCents);

    const rhodes = resolveInstrumentPreset("rhodes_ep", "chords");
    expect(rhodes.adsr.attack).toBeLessThan(0.05);
    expect(rhodes.adsr.decay).toBeGreaterThan(0.5);
  });

  it("is a pure function of the instrument when the name is known", () => {
    // `guitar_lead` lives on both lead and chords tracks; `saw_lead` on lead and bass.
    expect(resolveInstrumentPreset("guitar_lead", "lead")).toBe(
      resolveInstrumentPreset("guitar_lead", "chords")
    );
    expect(resolveInstrumentPreset("saw_lead", "bass")).toBe(
      resolveInstrumentPreset("saw_lead", "lead")
    );
    // `distorted_kick` is declared on the bass track and gets a bass voice, not a drum.
    expect(resolveInstrumentPreset("distorted_kick", "bass")).not.toBe(
      DEFAULT_SYNTH_PRESETS.deepPluck
    );
  });

  it("falls back role-first, then globally, for unknown or empty input", () => {
    // 1. exact preset key.
    expect(resolveInstrumentPreset("supersaw", "chords")).toBe(DEFAULT_SYNTH_PRESETS.supersaw);
    expect(resolveInstrumentPreset("warmPad", "chords")).toBe(DEFAULT_SYNTH_PRESETS.warmPad);

    // 2. alias table, including loose spelling.
    expect(resolveInstrumentPreset("808_bass", "bass")).toBe(DEFAULT_SYNTH_PRESETS.bass808);
    expect(resolveInstrumentPreset("acid_303", "bass")).toBe(DEFAULT_SYNTH_PRESETS.acidBass);
    expect(resolveInstrumentPreset("Saw Lead", "lead")).toBe(DEFAULT_SYNTH_PRESETS.sawLead);
    expect(resolveInstrumentPreset("  FLUTE-LEAD ", "lead")).toBe(DEFAULT_SYNTH_PRESETS.fluteLead);

    // 3. track-role default.
    expect(resolveInstrumentPreset(undefined, "bass")).toBe(DEFAULT_SYNTH_PRESETS.acidBass);
    expect(resolveInstrumentPreset("", "chords")).toBe(DEFAULT_SYNTH_PRESETS.warmPad);
    expect(resolveInstrumentPreset("   ", "lead")).toBe(DEFAULT_SYNTH_PRESETS.analogLead);
    expect(resolveInstrumentPreset("not_an_instrument", "bass")).toBe(
      DEFAULT_SYNTH_PRESETS.acidBass
    );

    // 4. global default.
    expect(resolveInstrumentPreset("not_an_instrument", "melody")).toBe(GLOBAL_DEFAULT);
    expect(resolveInstrumentPreset(undefined, "")).toBe(GLOBAL_DEFAULT);
    expect(resolveInstrumentPreset(undefined, undefined as unknown as string)).toBe(GLOBAL_DEFAULT);
  });

  it("normalises instrument names before lookup", () => {
    expect(normalizeInstrumentName("  Flute-Lead ")).toBe("flute_lead");
    expect(normalizeInstrumentName(undefined)).toBe("");
  });
});

/**
 * The curated genre data introduces acoustic/world voices and one-shot FX that did not
 * exist when the resolver was first written. These assertions pin (a) that each name maps
 * to a *purpose-built* preset rather than a renamed old one, and (b) that the acoustic
 * voices are actually acoustically distinct (no three-way aliasing onto one timbre).
 */
describe("curated timbres · the genre data's new voices", () => {
  const CASES: Array<[string, string]> = [
    ["finger_bass", "fingerBass"],
    ["pick_bass", "pickBass"],
    ["analog_bass", "analogBass"],
    ["sax_lead", "saxLead"],
    ["trumpet_lead", "trumpetLead"],
    ["muted_trumpet", "mutedTrumpet"],
    ["brass_section", "brassSection"],
    ["piano_lead", "pianoLead"],
    ["organ_lead", "organLead"],
    ["vibraphone", "vibraphone"],
    ["strings_lead", "stringsLead"],
    ["pluck_string", "pluckString"],
    ["pan_flute", "panFlute"],
    ["sitar_lead", "sitarLead"],
    ["accordion_lead", "accordionLead"],
    ["harmonica_lead", "harmonicaLead"],
    ["marimba_lead", "marimbaLead"],
    ["bell_lead", "bellLead"],
    ["sine_lead", "sineLead"],
    ["fm_lead", "fmLead"],
    ["cowbell_lead", "cowbellLead"],
    ["growl_lead", "growlLead"],
    ["horn_stab", "hornStab"],
    ["vinyl_crackle", "vinylCrackle"],
    ["tape_stop", "tapeStop"],
    ["reverse_cymbal", "reverseCymbal"],
    ["noise_rise", "noiseRise"],
    ["sweep_down", "sweepDown"],
    ["sub_drop", "subDrop"],
    ["laser_zap", "laserZap"],
  ];

  it("resolves every curated instrument name to its own preset", () => {
    for (const [instrument, key] of CASES) {
      const preset = resolveInstrumentPreset(instrument, "lead");
      expect(preset, instrument).toBe(DEFAULT_SYNTH_PRESETS[key]);
      expect(preset, instrument).not.toBe(GLOBAL_DEFAULT);
    }
  });

  it("keeps the curated voices distinguishable from the legacy presets", () => {
    // A sax must not be the analog lead, and the three brass variants must differ.
    const sax = resolveInstrumentPreset("sax_lead", "lead");
    const trumpet = resolveInstrumentPreset("trumpet_lead", "lead");
    const muted = resolveInstrumentPreset("muted_trumpet", "lead");
    const section = resolveInstrumentPreset("brass_section", "lead");
    expect(new Set([sax, trumpet, muted, section]).size).toBe(4);
    expect(sax).not.toBe(DEFAULT_SYNTH_PRESETS.analogLead);

    // Piano vs Rhodes vs organ: percussive, EP and sustained must stay distinct.
    const piano = resolveInstrumentPreset("piano_lead", "chords");
    const rhodes = resolveInstrumentPreset("rhodes_ep", "chords");
    const organ = resolveInstrumentPreset("organ_lead", "lead");
    expect(piano).not.toBe(rhodes);
    expect(organ).not.toBe(DEFAULT_SYNTH_PRESETS.m1Organ);
    expect(piano.adsr.decay).toBeGreaterThan(0.5);
    expect(organ.adsr.sustain).toBeGreaterThan(0.9);

    // The FX voices that need noise or a pitch envelope actually declare them.
    expect(resolveInstrumentPreset("vinyl_crackle", "fx").noiseMix).toBeGreaterThan(0.5);
    expect(resolveInstrumentPreset("reverse_cymbal", "fx").noiseMix).toBeGreaterThan(0.5);
    expect(resolveInstrumentPreset("tape_stop", "fx").pitchSweepCents).toBeLessThan(0);
    expect(resolveInstrumentPreset("noise_rise", "fx").pitchSweepCents).toBeGreaterThan(0);
    expect(resolveInstrumentPreset("sub_drop", "fx").filterCutoff).toBeLessThan(
      DEFAULT_SYNTH_PRESETS.subBass.filterCutoff + 1
    );

    // Meanwhile the melodic voices stay on the plain dual-oscillator path: no pitch
    // envelope, and no noise bed except where the instrument is literally a wind/reed.
    for (const name of ["sax_lead", "trumpet_lead", "marimba_lead", "bell_lead", "growl_lead"]) {
      expect(resolveInstrumentPreset(name, "lead").pitchSweepCents ?? 0, name).toBe(0);
      expect(resolveInstrumentPreset(name, "lead").noiseMix ?? 0, name).toBe(0);
    }
    expect(resolveInstrumentPreset("pan_flute", "lead").noiseMix).toBeGreaterThan(0);
    expect(resolveInstrumentPreset("sine_lead", "lead").pitchSweepCents).toBeLessThan(0);
  });

  it("resolves the curated names identically for every synth track role", () => {
    // The resolver is role-agnostic once the name is known: the live engine and the
    // offline renderer therefore pick the same voice for the same declared instrument.
    for (const name of ["brass_section", "bell_lead", "finger_bass", "tape_stop"]) {
      const fromLead = resolveInstrumentPreset(name, "lead");
      const fromBass = resolveInstrumentPreset(name, "bass");
      const fromFx = resolveInstrumentPreset(name, "fx");
      expect(fromLead).toBe(fromBass);
      expect(fromBass).toBe(fromFx);
    }
  });
});
