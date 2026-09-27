import { 
  Genre, 
  GenreCategory, 
  GenreRadarMetrics, 
  SequencerPattern, 
  SequencerTrack, 
  RepresentativeTrack,
  I18nString,
  I18nStringArray,
  DrumPatternFeatures
} from "./genre";

export interface CustomGenre extends Genre {
  isCustom: true;
  forkedFromId?: string;
  forkedFromName?: string;
  authorName?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Compact payload representation for cross-device URL sharing (P7-03)
 */
export interface ShareableCustomGenrePayload {
  v: 1; // schema version
  id: string;
  n: string; // name
  cat: GenreCategory;
  bpm: number;
  ts: string; // time_signature
  scale: string;
  r: [number, number, number, number, number, number]; // 6 radar metrics in order: groove, brightness, harmonicComplexity, rhythmDensity, bassEnergy, melodicFocus
  ctx: { en: string; zh: string }; // cultural_context
  plc?: { en: string; zh: string }; // origin_place
  yr?: string; // origin_year
  art?: string[]; // representative_artists
  author?: string;
  fork?: string; // forkedFromId
  forkName?: string;
  // Compact tracks: [track_id, steps, pitch, gate]
  tracks: Array<{
    t: 'kick' | 'snare' | 'hihat' | 'percussion' | 'bass' | 'chords' | 'lead' | 'fx' | 'audio';
    s: number[];
    p?: (number | null)[];
    g?: number[];
    v?: number;
    m?: boolean;
    sw?: number;
    /** The lane's own name (decision 1A). Absent for every lane that has none, which is every lane written before it existed. */
    l?: string;
    /** An audio lane's sample, by id into the catalogue that ships with the app (decision 4). Absent for every other kind. */
    sa?: string;
  }>;
}

export const RADAR_KEYS_ORDER: (keyof GenreRadarMetrics)[] = [
  "groove",
  "brightness",
  "harmonicComplexity",
  "rhythmDensity",
  "bassEnergy",
  "melodicFocus",
];
