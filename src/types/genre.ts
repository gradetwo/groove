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

export interface SequencerTrack {
  track_id: 'kick' | 'snare' | 'hihat' | 'percussion' | 'bass' | 'chords' | 'lead' | 'fx';
  name: string;
  instrument: string;
  steps: number[]; // 1 or 0 (16 or 32 steps)
  velocity?: number[]; // 0 - 127
  pitch?: (number | null)[]; // MIDI note (e.g. 36 for C2, 60 for C4)
  gate?: number[]; // note duration (1 = 1 step)
  mute?: boolean;
  solo?: boolean;
  volume?: number; // 0 - 1
  pan?: number; // -1 to 1
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
}
