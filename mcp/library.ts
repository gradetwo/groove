/**
 * Library access for the MCP server — the read-only half of the tool surface.
 *
 * Everything here is a pure function over the app's own data modules (`src/data/**`), which is what lets the MCP
 * server run in plain Node: the genre library, the mix tables, the relations and the chord progressions are data,
 * not DOM. No function in this file mutates anything the app can see — `list_genres` and `get_genre` build new
 * objects, and `get_pattern` returns a deep copy, so an agent cannot edit the library by accident.
 */
import { ALL_GENRES, GENRES_MAP } from "../src/data/genres/index";
import { GENRE_RELATIONS } from "../src/data/relations";
import { MASTERCLASSES } from "../src/data/masterclasses";
import { POPULAR_PROGRESSIONS, POPULAR_PROGRESSION_CATEGORIES } from "../src/data/popularProgressions";
import { getLineageList } from "../src/data/lineage";
import { resolveGenreMix, getGenreLoudnessTrimDb } from "../src/data/genreMix";
import type { Genre, I18nString, I18nStringArray, SequencerPattern } from "../src/types/genre";

/** Both languages of an `I18nString`, flattened for a model that mostly wants the English. */
export interface Bilingual {
  en: string;
  zh: string;
}

export function bilingual(value: I18nString | undefined | null): Bilingual {
  return { en: value?.en ?? "", zh: value?.zh ?? "" };
}

/**
 * `I18nStringArray` is a pair of parallel arrays (`{ en: string[], zh: string[] }`), not a list of `I18nString`,
 * so it is zipped here rather than mapped.
 */
export function bilingualArray(values: I18nStringArray | undefined | null): Bilingual[] {
  const en = values?.en ?? [];
  const zh = values?.zh ?? [];
  const length = Math.max(en.length, zh.length);
  return Array.from({ length }, (_, index) => ({ en: en[index] ?? "", zh: zh[index] ?? "" }));
}

/** Deep copy via structured JSON — the patterns are plain data, which is what makes this safe. */
export function clonePattern(pattern: SequencerPattern): SequencerPattern {
  return JSON.parse(JSON.stringify(pattern)) as SequencerPattern;
}

export function findGenre(id: string): Genre | undefined {
  return GENRES_MAP[id];
}

/** The compact row the index tools return: enough to choose, small enough to list 159 of them. */
export interface GenreSummary {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  bpm: number;
  bpmRange: string;
  key: string;
  timeSignature: string;
  era: string;
  decade: number;
  place: string;
  tracks: number;
  steps: number;
  swing: number;
  drumKit: string | null;
}

export function summarise(genre: Genre): GenreSummary {
  const pattern = genre.sequencer_pattern;
  return {
    id: genre.id,
    name: genre.name,
    aliases: genre.aliases ?? [],
    category: genre.category,
    bpm: pattern?.bpm ?? genre.default_bpm,
    bpmRange: genre.bpm_range,
    key: genre.key_characteristics?.en ? genre.common_chords?.[0] ?? "" : "",
    timeSignature: genre.time_signature,
    era: genre.origin_year,
    decade: genre.origin_decade,
    place: genre.origin_place?.en ?? "",
    tracks: pattern?.tracks?.length ?? 0,
    steps: pattern?.totalSteps ?? pattern?.tracks?.[0]?.steps?.length ?? 0,
    swing: pattern?.swing ?? 0,
    drumKit: genre.default_drum_kit ?? null,
  };
}

export function listGenres(args: { category?: string; limit?: number; offset?: number } = {}): {
  total: number;
  returned: number;
  offset: number;
  genres: GenreSummary[];
} {
  const category = args.category?.toLowerCase();
  const filtered = category
    ? ALL_GENRES.filter((genre) => genre.category.toLowerCase() === category)
    : ALL_GENRES;
  const offset = Math.max(0, args.offset ?? 0);
  const limit = Math.min(200, Math.max(1, args.limit ?? 50));
  return {
    total: filtered.length,
    returned: Math.min(limit, Math.max(0, filtered.length - offset)),
    offset,
    genres: filtered.slice(offset, offset + limit).map(summarise),
  };
}

export function listCategories(): Array<{ category: string; genres: number }> {
  const counts = new Map<string, number>();
  for (const genre of ALL_GENRES) counts.set(genre.category, (counts.get(genre.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([category, genres]) => ({ category, genres }))
    .sort((a, b) => b.genres - a.genres);
}

/**
 * Search over the fields an agent would actually use to find a genre.
 *
 * Scoring is deliberately plain and explainable — id and name matches beat alias matches, which beat a mention
 * in the description — because a model reading the results needs to know *why* something matched.
 */
export function searchGenres(args: { query: string; limit?: number }): {
  query: string;
  matches: Array<GenreSummary & { score: number; matchedOn: string[] }>;
} {
  const query = args.query.trim().toLowerCase();
  const limit = Math.min(50, Math.max(1, args.limit ?? 10));
  if (!query) return { query: args.query, matches: [] };
  const terms = query.split(/\s+/).filter(Boolean);
  const scored = ALL_GENRES.map((genre) => {
    const fields: Array<[string, string, number]> = [
      ["id", genre.id, 6],
      ["name", genre.name, 6],
      ["aliases", (genre.aliases ?? []).join(" "), 4],
      ["subgenres", (genre.subgenres ?? []).join(" "), 3],
      ["category", genre.category, 2],
      ["origin", `${genre.origin_year} ${genre.origin_place?.en ?? ""}`, 2],
      ["description", `${genre.cultural_context?.en ?? ""} ${genre.rhythm_features?.en ?? ""}`, 1],
    ];
    let score = 0;
    const matchedOn: string[] = [];
    for (const term of terms) {
      for (const [label, value, weight] of fields) {
        const haystack = value.toLowerCase();
        if (!haystack) continue;
        if (haystack === term) score += weight * 3;
        else if (haystack.startsWith(term)) score += weight * 2;
        else if (haystack.includes(term)) score += weight;
        else continue;
        if (!matchedOn.includes(label)) matchedOn.push(label);
      }
    }
    return { ...summarise(genre), score, matchedOn };
  })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { query: args.query, matches: scored.slice(0, limit) };
}

export function getGenre(id: string): Record<string, unknown> | null {
  const genre = findGenre(id);
  if (!genre) return null;
  return {
    ...summarise(genre),
    parentGenres: genre.parent_genres ?? [],
    subgenres: genre.subgenres ?? [],
    relatedGenres: genre.related_genres ?? [],
    commonChords: genre.common_chords ?? [],
    instrumentation: genre.instrumentation ?? [],
    structure: genre.structure ?? [],
    representativeArtists: genre.representative_artists ?? [],
    representativeTracks: (genre.representative_tracks ?? []).map((track) => ({
      title: track.title,
      artist: track.artist,
      year: track.year,
    })),
    radarMetrics: genre.radar_metrics,
    culturalContext: bilingual(genre.cultural_context),
    keyCharacteristics: bilingual(genre.key_characteristics),
    soundDesign: bilingual(genre.sound_design),
    rhythmFeatures: bilingual(genre.rhythm_features),
    bassPattern: bilingual(genre.bass_pattern),
    chordInversions: bilingual(genre.chord_inversions),
    productionTips: bilingualArray(genre.production_tips),
    drumPattern: {
      kick: genre.drum_pattern?.kick?.en ?? "",
      snareClap: genre.drum_pattern?.snare_clap?.en ?? "",
      hihats: genre.drum_pattern?.hihats?.en ?? "",
      percussion: genre.drum_pattern?.percussion?.en ?? "",
      swing: genre.drum_pattern?.swing?.en ?? "",
      tempo: genre.drum_pattern?.tempo ?? "",
    },
    mix: resolveGenreMix(id),
    loudnessTrimDb: getGenreLoudnessTrimDb(id),
    lineage: getLineageList(id, 8, GENRE_RELATIONS).map((sibling) => ({
      id: sibling.id,
      relation: sibling.type,
      weight: sibling.weight,
      description: bilingual(sibling.description),
    })),
  };
}

export function getGenreRelations(id: string): Record<string, unknown> | null {
  const genre = findGenre(id);
  if (!genre) return null;
  const rows = GENRE_RELATIONS.filter((relation) => relation.source === id || relation.target === id);
  return {
    id,
    name: genre.name,
    relations: rows.map((relation) => ({
      type: relation.type,
      from: relation.source,
      to: relation.target,
      weight: relation.weight,
      direction: relation.source === id ? "outgoing" : "incoming",
      other: relation.source === id ? relation.target : relation.source,
      description: bilingual(relation.description),
    })),
    declared: {
      parentGenres: genre.parent_genres ?? [],
      subgenres: genre.subgenres ?? [],
      relatedGenres: genre.related_genres ?? [],
    },
  };
}

export function listChordProgressions(args: { category?: string } = {}): Record<string, unknown> {
  const category = args.category?.toLowerCase();
  const rows = category
    ? POPULAR_PROGRESSIONS.filter((progression) => (progression.category ?? "").toLowerCase() === category)
    : POPULAR_PROGRESSIONS;
  return {
    categories: POPULAR_PROGRESSION_CATEGORIES,
    total: rows.length,
    progressions: rows.map((progression) => ({
      id: progression.id,
      name: bilingual(progression.name),
      roman: progression.roman,
      category: progression.category,
      emotion: bilingual(progression.emotion),
      songs: (progression.songs ?? []).slice(0, 5).map((song) => `${song.title} — ${song.artist}`),
    })),
  };
}

export function getChordProgression(id: string): Record<string, unknown> | null {
  const progression = POPULAR_PROGRESSIONS.find((row) => row.id === id);
  if (!progression) return null;
  return {
    id: progression.id,
    name: bilingual(progression.name),
    roman: progression.roman,
    category: progression.category,
    emotion: bilingual(progression.emotion),
    description: bilingual(progression.description),
    songs: (progression.songs ?? []).map((song) => ({ title: song.title, artist: song.artist, year: song.year })),
  };
}

export function listMasterclasses(): Record<string, unknown> {
  return {
    total: MASTERCLASSES.length,
    lessons: MASTERCLASSES.map((lesson) => ({
      id: lesson.id,
      index: lesson.index,
      title: bilingual(lesson.title),
      subtitle: bilingual(lesson.subtitle),
      tag: bilingual(lesson.tag),
      originPlace: bilingual(lesson.originPlace),
      originEra: lesson.originEra,
      defaultBpm: lesson.defaultBpm,
      presets: (lesson.presets ?? []).map((preset) => ({ id: preset.id, nameEn: preset.nameEn, nameZh: preset.nameZh })),
    })),
  };
}

/** The library-level index the `groove://genres` resource serves. */
export function libraryIndex(): Record<string, unknown> {
  return {
    genres: ALL_GENRES.length,
    categories: listCategories(),
    ids: ALL_GENRES.map((genre) => genre.id),
  };
}
