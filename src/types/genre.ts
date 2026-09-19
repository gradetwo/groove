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
  track_id: 'kick' | 'snare' | 'hihat' | 'percussion' | 'bass' | 'chords' | 'lead' | 'fx';
  name: string;
  instrument: string;
  steps: number[]; // 1 or 0 (16 or 32 steps)
  velocity?: number[]; // 0 - 127
  pitch?: (number | null)[]; // MIDI note (e.g. 36 for C2, 60 for C4) — the *root* of the step
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

