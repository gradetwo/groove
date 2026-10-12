import type { TrackInsertParams } from "../data/trackInsert";
export type GenreCategory = 
  | 'Electronic'
  | 'Rock/Metal'
  | 'Hip Hop'
  | 'Jazz/Blues'
  | 'Pop/R&B'
  | 'Latin/World';

export interface I18nString {
  en: string;
  zh: string;
}

export interface I18nStringArray {
  en: string[];
  zh: string[];
}

export interface RepresentativeTrack {
  title: string;
  artist: string;
  year: number;
  link?: string;
  previewUrl?: string;
}

export interface DrumPatternFeatures {
  kick: I18nString;
  snare_clap: I18nString;
  hihats: I18nString;
  percussion: I18nString;
  swing: I18nString;
  tempo: string;
}

/**
 * Longest note length a step may carry, in steps.
 *
 * `gate[i]` is a multiple of one step and the engine simply multiplies it by the step duration
 * (`stepDur * gate`), so nothing in the audio path ever needed a small cap — but the roll, the
 * exporters and the share-link writer each clamped it to 2 steps, which made a chord or a pad
 * **unable to last a bar**: "多拍的" notes were not expressible at all. 16 steps is one bar at
 * 1/16, which is the longest musical unit a step pattern needs to hold, and it is short enough
 * that a stale or hostile value cannot ring for minutes.
 */
export const MAX_NOTE_GATE_STEPS = 16;

export interface SequencerTrack {
  /**
   * What a lane **is**: seven synthesised voices, a drum group, and — since the owner's decision of 2026-09-28 — **`audio`**, a lane that plays a sample.
   *
   * The union is closed on purpose, and widening it is an event rather than a detail: every exhaustive switch over it becomes a compile error. Reading this one
   * found that the codebase has **almost none** — widening it raises a single type error — so an audio lane that routes as a drum, or falls through to silence,
   * would fail silently. The safety comes from tests (`audioKindShare.test.ts` and the drum-set consistency test), not from the compiler.
   */
  track_id: 'kick' | 'snare' | 'hihat' | 'percussion' | 'bass' | 'chords' | 'lead' | 'fx' | 'audio';
  /**
   * An optional second name for this lane, so a song can have **two lanes of one kind** (owner decision 1A).
   *
   * `track_id` is a role — it says what a lane *is*, and the engine routes drums, GS-1 hosts and exports by it — so a second lead cannot be expressed by
   * widening it. A lane that carries no `laneId` behaves **exactly** as before, every existing lookup still finds the first lane of a kind by `track_id`, and
   * `.groove` v1 files stay readable: the field is additive in the same shape as `arrangement`, `extraClips`, `slots` and `syllables`.
   *
   * Addressing is "**by `laneId` first, then by kind**" (`mcp/pattern.ts`'s `findTrack`), so `{ track_id: "lead", laneId: "lead-2" }` is a distinct lane that
   * everything referring to `"lead"` still ignores.
   */
  laneId?: string;
  /**
   * An **audio** lane's sample, named by id into the catalogue that ships with the app (owner decision 4).
   *
   * That indirection is the decision, not a first step towards one: a file path is not portable, a hash needs a store, and embedding bytes in a share link is
   * neither — while an id into a catalogue the app already carries survives all three. A lane whose `assetId` names nothing must be an **error**, not silence,
   * which is the loud-failure half still to be built.
   */
  sample?: { assetId: string };
  name: string;
  instrument: string;
  /**
   * This lane's own GS-1 sound, as a **share code** in the synth project's own format
   * (`gs1.1.<base64url>`, the string `gs1.patch.get` returns and `gs1.patch.set` accepts).
   *
   * One opaque string, deliberately: the synth already defines, encodes, decodes and validates the
   * patch format, and a second structured model here would be a second thing to keep in step with
   * it. Absent means the instrument table's answer (`resolveGs1Patch`) — every existing track,
   * project and share link is unchanged.
   *
   * The code reaches the audio through `resolveGs1Lane` (`src/audio/gs1/gs1Tracks.ts`), which is
   * the one place host creation, offline note planning and live playback all read it. An
   * unreadable code is a reported problem, never a silent fall back to the native engine — see
   * `validatePattern` and `docs/GS1_PATCH_SURFACE.md`.
   */
  gs1Patch?: string;
  /**
   * **Per-parameter overrides** on top of {@link gs1Patch} (or on top of the instrument table's patch).
   *
   * This is the write side the share code alone could not offer. `apply_gs1_patch` used to accept one
   * opaque string and nothing else — 0 of the engine's 224 parameters, 0 routes — because the tool
   * does not drive a live engine: it writes pattern data and the renderer decodes it later. The two
   * honest shapes were therefore "re-encode the code" (vendor the synth's encoder, a second copy of a
   * format this repository only reads) or "store the change beside the code and apply it where the
   * lane is resolved". This is the second: the code stays untouched, and the overrides reach the
   * engine through its own `setParam`/`setModRoute` at the one resolution seam
   * (`src/audio/gs1/gs1Tracks.ts`), so the room, the file and `validate_pattern` cannot disagree.
   *
   * Keys of `parameters` are `Param` enum names (`"FILTER_CUTOFF"`, case-insensitive) or numeric ids
   * (`"14"`); values are the engine's raw values. Ranges are **not** checked against `PARAM_SPECS` —
   * it covers 84 of 224 parameters and is narrower than the range the engine serves, so it would
   * reject `phonk`'s own `osc2Pitch = 31`. The engine clamps exactly as it does for a value inside a
   * share code, which is the validation `docs/GS1_PATCH_SURFACE.md` §4 measured its way to.
   *
   * Absent means "no overrides", so every existing track, project and share link is unchanged — the
   * same additive rule `pitches`, `syllables` and `gs1Patch` were added under, and a track that
   * carries the field but no `gs1Patch` overrides the **instrument table's** patch instead. Like
   * `gs1Patch`, it is not carried by the share-link whitelist (a recorded gap, not a new one: see
   * `docs/GS1_PATCH_SURFACE.md` §7.1) and it is not carried by `TrackV2` (§7.3), while the full
   * pattern — `.groove` v1 files, the project store, `arrangementCompile` — keeps it.
   */
  gs1PatchOverrides?: {
    parameters?: Record<string, number>;
    routes?: Array<{
      /** Modulation slot 0..7; defaults to this row's position in the array. */
      index?: number;
      /** A `MOD_SOURCES` name (`"velocity"`, `"lfo"`, …) or its index. */
      src: number | string;
      /** A `MOD_DESTS` name (`"cutoff"`, `"pitch"`, …) or its index. */
      dst: number | string;
      amount: number;
      /** Defaults to `true`: writing a row is what turns it on. */
      enabled?: boolean;
    }>;
  };
  steps: number[]; // 1 or 0 (16 or 32 steps)
  velocity?: number[]; // 0 - 127
  pitch?: (number | null)[]; // MIDI note (e.g. 36 for C2, 60 for C4) — the *root* of the step
  /**
   * The syllable sung on each step, or `null` for a step with no word.
   *
   * A lyric used to be an annotation beside the music; this is the field that binds it to the notes, so a syllable and its pitch sit on the same
   * index and a prosody check can read one against the other without a separate mapping. Additive in the same way `pitches` was: a track without
   * `syllables` is an instrumental line, exactly as before, and every export, share link and old project stays valid.
   */
  syllables?: (string | null)[];
  /**
   * Every note sounding on a step, as a stack — the chord.
   *
   * `pitch` remains the root (the lowest note) so that everything which reads "the note of this
   * step" keeps working, and so old projects and share links stay valid: a track without `pitches`
   * is monophonic, exactly as before. When `pitches` is present the renderers play it **verbatim**
   * instead of expanding `pitch` themselves — otherwise a stored chord would be voiced twice, and
   * the piano roll (which renders this array) would disagree with what is heard.
   *
   * Written by `applyGenreExpression` when a genre's pattern is loaded, so the chords and the
   * per-genre lengths/articulations are real, editable data rather than a playback-time effect.
   */
  pitches?: (number[] | null)[];
  gate?: number[]; // note duration (1 = 1 step)
  ratchet?: number[]; // subdivisions per step (1, 2, 3, 4, 8)
  probability?: number[]; // trigger probability 0 - 100 (%)
  trackLength?: number; // independent track loop length for polymeter (defaults to pattern steps)
  mute?: boolean;
  solo?: boolean;
  volume?: number; // 0 - 1
  pan?: number; // -1 to 1
  swing?: number; // per-track swing offset (-50 to 50)
  sendA?: number; // Reverb send level 0 - 1
  sendB?: number; // Delay send level 0 - 1
  /** Polarity inversion (Ø). Flips the channel's sign without changing its level. */
  phaseInvert?: boolean;
  /**
   * E-10: the track's insert chain (high-pass → EQ → compressor → drive).
   *
   * Optional, and stored **on the track** rather than in a side table so it travels with
   * the pattern through undo, the project hub, share links and the exporters for free —
   * the same reason volume/pan/sends live here. Absent means "use the factory chain for
   * this role in this genre" (`resolveTrackInsertForGenre(role, genre_id)` = the role's
   * chain in `trackInsert.ts` plus the genre's patch in `genreInsert.ts`), which keeps all
   * 159 genre files untouched and keeps older projects working.
   */
  insert?: TrackInsertParams;
}

export interface SequencerPattern {
  /**
   * The song's tempo changes, carried onto the flattened pattern (owner decision 2b) because the renderer is handed a pattern and nothing else.
   *
   * Optional and absent by default: a song with no `tempoTrack` produces a pattern with **no such key**, which is what keeps an existing render byte-identical
   * rather than merely equivalent (`WavExporter` branches on this field instead of using a prefix sum unconditionally).
   */
  tempoTrack?: Array<{ atBar: number; bpm: number; curve?: "jump" | "linear" }>;
  genre_id: string;
  bpm: number;
  scale: string;
  swing?: number; // 0 - 100
  timeSignature?: string; // e.g. "4/4", "3/4", "6/8", "3/8", "5/4", "7/8"
  resolution?: "1/8" | "1/16" | "1/32";
  totalSteps?: number;
  tracks: SequencerTrack[];
}

export type RelationType = 
  | 'origin_from' 
  | 'influenced_by' 
  | 'derived_to' 
  | 'fusion_with' 
  | 'regional_variant';

export interface GenreRelation {
  source: string; // genre id
  target: string; // genre id
  type: RelationType;
  weight: number; // 1 to 5
  description?: I18nString;
}

export interface GenreRadarMetrics {
  groove: number;       // 律动感 (1-10)
  brightness: number;   // 音色明亮度 (1-10)
  harmonicComplexity: number; // 和声复杂度 (1-10)
  rhythmDensity: number;      // 节奏密度 (1-10)
  bassEnergy: number;         // 低频能量 (1-10)
  melodicFocus: number;       // 旋律性 (1-10)
}

export interface Genre {
  id: string;
  name: string; // Always in English
  aliases: string[];
  category: GenreCategory;
  parent_genres: string[];
  subgenres: string[];
  related_genres: string[];
  origin_year: string; // e.g. "1984", "1990s"
  origin_decade: number; // e.g. 1980 for sorting and timeline
  origin_place: I18nString;
  cultural_context: I18nString;
  
  // Production Details
  bpm_range: string;
  default_bpm: number;
  time_signature: string;
  default_drum_kit?: string;
  key_characteristics: I18nString;
  common_chords: string[];
  chord_inversions: I18nString;
  instrumentation: string[];
  sound_design: I18nString;
  rhythm_features: I18nString;
  drum_pattern: DrumPatternFeatures;
  bass_pattern: I18nString;
  structure: string[];
  production_tips: I18nStringArray;
  
  // References & Radar
  representative_tracks: RepresentativeTrack[];
  representative_artists: string[];
  sources: string[];
  radar_metrics: GenreRadarMetrics;
  
  // Sequencer Pattern
  sequencer_pattern: SequencerPattern;

  // Custom Genre Extensions (P7-03)
  isCustom?: boolean;
  forkedFromId?: string;
}

// Ergonomic aliases for sequencer pattern and tracks (P4)
export type DrumPattern = SequencerPattern;
export type Track = SequencerTrack;

