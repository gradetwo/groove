import { Genre } from '../../types/genre';
import { HOUSE_GENRES } from './house';
import { TECHNO_GENRES } from './techno';
import { TRANCE_GENRES } from './trance';
import { DUBSTEP_GENRES } from './dubstep';
import { DNB_GENRES } from './dnb';
import { UK_BASS_GENRES } from './uk_bass';
import { TRAP_DRILL_GENRES } from './trap_drill';
import { FUTURE_DOWNTEMPO_GENRES } from './future_downtempo';
import { HARD_ELECTRO_GENRES } from './hard_electro';
import { ROCK_METAL_GENRES } from './rock_metal';
import { HIPHOP_GENRES } from './hiphop';
import { JAZZ_BLUES_GENRES } from './jazz_blues';
import { POP_RNB_GENRES } from './pop_rnb';
import { LATIN_WORLD_GENRES } from './latin_world';

export {
  HOUSE_GENRES,
  TECHNO_GENRES,
  TRANCE_GENRES,
  DUBSTEP_GENRES,
  DNB_GENRES,
  UK_BASS_GENRES,
  TRAP_DRILL_GENRES,
  FUTURE_DOWNTEMPO_GENRES,
  HARD_ELECTRO_GENRES,
  ROCK_METAL_GENRES,
  HIPHOP_GENRES,
  JAZZ_BLUES_GENRES,
  POP_RNB_GENRES,
  LATIN_WORLD_GENRES
};

export const ALL_GENRES: Genre[] = [
  ...HOUSE_GENRES,
  ...TECHNO_GENRES,
  ...TRANCE_GENRES,
  ...DUBSTEP_GENRES,
  ...DNB_GENRES,
  ...UK_BASS_GENRES,
  ...TRAP_DRILL_GENRES,
  ...FUTURE_DOWNTEMPO_GENRES,
  ...HARD_ELECTRO_GENRES,
  ...ROCK_METAL_GENRES,
  ...HIPHOP_GENRES,
  ...JAZZ_BLUES_GENRES,
  ...POP_RNB_GENRES,
  ...LATIN_WORLD_GENRES
];

export const GENRES_MAP: Record<string, Genre> = ALL_GENRES.reduce((acc, genre) => {
  acc[genre.id] = genre;
  return acc;
}, {} as Record<string, Genre>);

export const ELECTRONIC_GENRES = ALL_GENRES.filter(g => g.category === 'Electronic');
export const NON_ELECTRONIC_GENRES = ALL_GENRES.filter(g => g.category !== 'Electronic');

export const GENRE_CATEGORIES = [
  'Electronic',
  'Rock/Metal',
  'Hip Hop',
  'Jazz/Blues',
  'Pop/R&B',
  'Latin/World'
] as const;
