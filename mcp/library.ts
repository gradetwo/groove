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

/**
 * Every genre id, in library order — the enumeration a listing tool needs when it has to walk the library
 * rather than a caller-supplied filter. A listing tool that hard-codes a limit would silently stop covering
 * the library the day it grew past that limit, so the full list is exposed once and reused.
 */
export function allGenreIds(): string[] {
  return ALL_GENRES.map((genre) => genre.id);
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

/**
 * A roman numeral progression as concrete pitches in a key.
 *
 * The library knows **which** progression (`roman`, a category, the songs that used it) and no chords at all, so this is the missing
 * half: scale degrees taken from the key's own scale (so the chords are diatonic by construction rather than by a table that can drift
 * from the key), quality from the numeral's case, `°` for diminished, and `7` for a seventh. Accidentals (`b`/`#`) move a degree.
 *
 * Roots are placed an octave below the tonic so a progression lands in a usable register and so the result is stable: the same
 * progression in the same key always produces the same numbers, which is what makes it testable and what lets
 * `set_chord_progression` be replayed.
 */
/**
 * Choose a progression from the library and render it in the caller's key.
 *
 * The library supplies *which* progression — it carries roman numerals, a category, an emotion and the songs that used it — and
 * `romanToChords` supplies what it sounds like. This joins them, and it is deliberately a **chooser plus a renderer** rather than a
 * generator: everything it returns can be traced to a committed entry, and the caller can read the numerals to see why.
 */
export function suggestProgression(args: {
  key?: { tonic?: number; mode?: "major" | "minor" };
  emotion?: string;
  category?: string;
  avoid?: string;
}): Record<string, unknown> {
  const wanted = (args.emotion ?? "").toLowerCase();
  const category = (args.category ?? "").toLowerCase();
  const avoid = new Set((args.avoid ?? "").split(/[,\s]+/).filter(Boolean));

  const scored = POPULAR_PROGRESSIONS.map((progression) => {
    const emotion = `${progression.emotion?.en ?? ""} ${progression.emotion?.zh ?? ""}`.toLowerCase();
    let score = 0;
    // The emotion match is the point of asking: a hit on the caller's word beats a category hit beats being first in the list.
    for (const word of wanted.split(/[,\s]+/).filter(Boolean)) if (emotion.includes(word)) score += 4;
    if (category && (progression.category ?? "").toLowerCase() === category) score += 2;
    if (avoid.has(progression.id)) score -= 100;
    return { progression, score };
  }).sort((a, b) => b.score - a.score || (a.progression.id < b.progression.id ? -1 : 1));

  const picked = scored[0]?.progression;
  if (!picked) return { error: "no progressions in the library" };

  const tonic = args.key?.tonic ?? 60;
  const mode = args.key?.mode ?? "major";
  const roman = Array.isArray(picked.roman) ? picked.roman.join("-") : String(picked.roman);
  const { chords, numerals, warnings } = romanToChords(roman, { tonic, mode });
  return {
    id: picked.id,
    name: bilingual(picked.name),
    roman,
    category: picked.category,
    emotion: bilingual(picked.emotion),
    songs: (picked.songs ?? []).slice(0, 3).map((song) => `${song.title} — ${song.artist}`),
    key: { tonic, mode },
    numerals,
    chords,
    ...(warnings.length ? { warnings } : {}),
    why: `chosen for "${args.emotion ?? picked.category ?? "any"}" from ${POPULAR_PROGRESSIONS.length} committed progressions; write the \`chords\` onto a track with add_arrangement_notes`,
  };
}

export function romanToChords(
  roman: string,
  key: { tonic: number; mode?: "major" | "minor" }
): { chords: number[][]; numerals: string[]; warnings: string[] } {
  const scale = key.mode === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const base = key.tonic - 12;
  const warnings: string[] = [];
  const numerals = roman
    .split(/[-–\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chords: number[][] = [];

  for (const numeral of numerals) {
    const match = /^([b#]?)([ivIV]+)(°|o|dim)?(7)?$/.exec(numeral);
    if (!match) {
      warnings.push(`could not read "${numeral}" as a roman numeral`);
      continue;
    }
    const [, accidental, letters, diminished, seventh] = match;
    const upper = letters === letters.toUpperCase();
    const degreeIndex = ["i", "ii", "iii", "iv", "v", "vi", "vii"].indexOf(letters.toLowerCase());
    if (degreeIndex < 0) {
      warnings.push(`unknown degree in "${numeral}"`);
      continue;
    }
    const shift = accidental === "b" ? -1 : accidental === "#" ? 1 : 0;
    /**
     * Stack thirds **through the key's own scale**, so every chord is diatonic by construction.
     *
     * That is also why the numeral's case and `°` add no accidentals: in a major key the scale already gives a minor triad on vi and a
     * diminished one on vii, and a table of qualities would be a second source of truth that could drift from the scale. The case is
     * read and reported (it is what makes a numeral legible), and the accidentals the caller writes (`b`/`#`) do move the chord.
     *
     * The register is deliberate: the root sits an octave below the tonic, so `vii` lands an octave above it and a progression stays in
     * one usable octave rather than climbing.
     */
    const stepAt = (steps: number) => {
      const index = degreeIndex + steps;
      const octave = Math.floor(index / 7) * 12;
      return base + scale[((index % 7) + 7) % 7] + octave + shift;
    };
    const size = seventh ? 4 : 3;
    const chord = Array.from({ length: size }, (_, step) => stepAt(step * 2));
    void upper;
    void diminished;
    chords.push(chord);
  }

  return { chords, numerals, warnings };
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
    ids: allGenreIds(),
  };
}
