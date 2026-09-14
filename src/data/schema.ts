import { Genre } from "../types/genre";
import { isBpmInRange, parseBpmRange } from "../utils/bpm";

export interface GenreValidationResult {
  isValid: boolean;
  errors: string[];
  /**
   * Non-fatal findings. These never flip `isValid`; they surface data-quality
   * problems that exist in the current database baseline and must stay
   * report-only so the fast data gate is not permanently red.
   */
  warnings: string[];
}

export interface DatabaseValidationResult {
  isValid: boolean;
  totalGenres: number;
  duplicateIds: string[];
  genreErrors: Record<string, string[]>;
  /** Per-genre non-fatal findings, mirroring `genreErrors`. */
  genreWarnings: Record<string, string[]>;
}

const REQUIRED_TRACK_IDS = [
  "kick",
  "snare",
  "hihat",
  "percussion",
  "bass",
  "chords",
  "lead",
  "fx",
];

const REQUIRED_RADAR_KEYS = [
  "groove",
  "brightness",
  "harmonicComplexity",
  "rhythmDensity",
  "bassEnergy",
  "melodicFocus",
] as const;

/** Bilingual rhythm slots that make up `drum_pattern`. */
const REQUIRED_DRUM_PATTERN_FIELDS = [
  "kick",
  "snare_clap",
  "hihats",
  "percussion",
  "swing",
] as const;

/** `"4/4"`, `"3/4"`, `"6/8"`, `"7/8"` … — numerator over 4 or 8. */
const TIME_SIGNATURE_PATTERN = /^\d+\/[48]$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates an `{ en, zh }` bilingual pair, requiring both halves to be
 * non-empty strings. Returns true only when the whole pair is usable.
 */
function validateI18nField(value: unknown, field: string, errors: string[]): boolean {
  if (!value || typeof value !== "object") {
    errors.push(`'${field}' must be an { en, zh } bilingual object`);
    return false;
  }
  const pair = value as { en?: unknown; zh?: unknown };
  let ok = true;
  if (!isNonEmptyString(pair.en)) {
    errors.push(`'${field}.en' must be a non-empty string`);
    ok = false;
  }
  if (!isNonEmptyString(pair.zh)) {
    errors.push(`'${field}.zh' must be a non-empty string`);
    ok = false;
  }
  return ok;
}

/** Validates a `string[]` field, requiring every entry to be a non-empty string. */
function validateStringArrayField(value: unknown, field: string, errors: string[]): value is string[] {
  if (!Array.isArray(value)) {
    errors.push(`'${field}' must be an array of strings`);
    return false;
  }
  let ok = true;
  value.forEach((entry, i) => {
    if (!isNonEmptyString(entry)) {
      errors.push(`'${field}[${i}]' must be a non-empty string`);
      ok = false;
    }
  });
  return ok;
}

/** Validates `I18nStringArray` (`{ en: string[], zh: string[] }`). */
function validateI18nStringArrayField(value: unknown, field: string, errors: string[]): boolean {
  if (!value || typeof value !== "object") {
    errors.push(`'${field}' must be an { en, zh } bilingual string-array object`);
    return false;
  }
  const pair = value as { en?: unknown; zh?: unknown };
  const enOk = validateStringArrayField(pair.en, `${field}.en`, errors);
  const zhOk = validateStringArrayField(pair.zh, `${field}.zh`, errors);
  return enOk && zhOk;
}

/**
 * Validates `common_chords`.
 *
 * The `Genre` type models this as `string[]` (e.g. `"i–VI–III–VII"`), which is
 * what the shipped database uses. Structured `{ roman, chords }` entries — the
 * shape used by `popularProgressions.ts` — are also accepted so tooling that
 * feeds richer progression data through a `Genre`-shaped object is checked;
 * when present, `roman` and `chords` must be arrays of equal length.
 */
function validateCommonChords(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push("'common_chords' must be an array");
    return;
  }
  value.forEach((entry, i) => {
    if (typeof entry === "string") {
      if (!isNonEmptyString(entry)) {
        errors.push(`'common_chords[${i}]' must be a non-empty string`);
      }
      return;
    }
    if (entry && typeof entry === "object") {
      const structured = entry as { roman?: unknown; chords?: unknown };
      const roman = structured.roman;
      const chords = structured.chords;
      if (!Array.isArray(roman)) errors.push(`'common_chords[${i}].roman' must be an array`);
      if (!Array.isArray(chords)) errors.push(`'common_chords[${i}].chords' must be an array`);
      if (Array.isArray(roman) && Array.isArray(chords) && roman.length !== chords.length) {
        errors.push(
          `'common_chords[${i}]' roman/chords length mismatch (${roman.length} vs ${chords.length})`
        );
      }
      return;
    }
    errors.push(`'common_chords[${i}]' must be a string or a { roman, chords } object`);
  });
}

/**
 * Validates a single Genre against PRD and runtime specs.
 *
 * Errors are fatal and drive `isValid`; warnings are report-only signals about
 * content quality that is currently known to be incomplete across the whole
 * database (see `auditGenreContent` for the aggregate report).
 */
export function validateGenre(genre: Genre): GenreValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Basic identifiers
  if (!genre.id || typeof genre.id !== "string" || !genre.id.trim()) {
    errors.push("Missing or invalid 'id'");
  }
  if (!genre.name || typeof genre.name !== "string" || !genre.name.trim()) {
    errors.push("Missing or invalid 'name'");
  }
  if (!genre.category || typeof genre.category !== "string") {
    errors.push("Missing or invalid 'category'");
  }

  // 2. Taxonomy arrays + aliases (string[])
  validateStringArrayField(genre.aliases, "aliases", errors);
  validateStringArrayField(genre.parent_genres, "parent_genres", errors);
  validateStringArrayField(genre.subgenres, "subgenres", errors);
  validateStringArrayField(genre.related_genres, "related_genres", errors);

  // Taxonomy coverage is a known empty baseline (159/159 at time of writing):
  // report it, but never let it fail the gate.
  if (
    Array.isArray(genre.parent_genres) &&
    Array.isArray(genre.subgenres) &&
    Array.isArray(genre.related_genres) &&
    genre.parent_genres.length === 0 &&
    genre.subgenres.length === 0 &&
    genre.related_genres.length === 0
  ) {
    warnings.push(
      "'parent_genres', 'subgenres' and 'related_genres' are all empty (taxonomy not yet populated)"
    );
  }

  // 3. Origin / cultural narrative (bilingual)
  if (!isNonEmptyString(genre.origin_year)) {
    errors.push("'origin_year' must be a non-empty string (e.g. \"1984\" or \"1990s\")");
  }
  if (typeof genre.origin_decade !== "number" || !Number.isInteger(genre.origin_decade)) {
    errors.push(`'origin_decade' value ${genre.origin_decade} must be an integer year`);
  } else if (genre.origin_decade < 1900 || genre.origin_decade > 2100) {
    errors.push(`'origin_decade' value ${genre.origin_decade} is outside the plausible range 1900–2100`);
  }
  validateI18nField(genre.origin_place, "origin_place", errors);
  validateI18nField(genre.cultural_context, "cultural_context", errors);

  // 4. Production details
  if (!isNonEmptyString(genre.bpm_range)) {
    errors.push("'bpm_range' must be a non-empty string");
  }
  if (typeof genre.default_bpm !== "number" || !Number.isFinite(genre.default_bpm)) {
    errors.push(`'default_bpm' value ${genre.default_bpm} must be a finite number`);
  }
  if (!isNonEmptyString(genre.time_signature) || !TIME_SIGNATURE_PATTERN.test(genre.time_signature)) {
    errors.push(
      `'time_signature' value ${JSON.stringify(genre.time_signature)} must match "n/4" or "n/8"`
    );
  }
  if (genre.default_drum_kit !== undefined && !isNonEmptyString(genre.default_drum_kit)) {
    errors.push("'default_drum_kit' must be a non-empty string when present");
  }
  validateI18nField(genre.key_characteristics, "key_characteristics", errors);
  validateCommonChords(genre.common_chords, errors);
  validateI18nField(genre.chord_inversions, "chord_inversions", errors);
  validateStringArrayField(genre.instrumentation, "instrumentation", errors);
  validateI18nField(genre.sound_design, "sound_design", errors);
  validateI18nField(genre.rhythm_features, "rhythm_features", errors);

  // 5. Drum pattern shape
  if (!genre.drum_pattern || typeof genre.drum_pattern !== "object") {
    errors.push("Missing or invalid 'drum_pattern' object");
  } else {
    for (const field of REQUIRED_DRUM_PATTERN_FIELDS) {
      validateI18nField(genre.drum_pattern[field], `drum_pattern.${field}`, errors);
    }
    if (!isNonEmptyString(genre.drum_pattern.tempo)) {
      errors.push("'drum_pattern.tempo' must be a non-empty string");
    }
  }

  validateI18nField(genre.bass_pattern, "bass_pattern", errors);
  validateStringArrayField(genre.structure, "structure", errors);
  validateI18nStringArrayField(genre.production_tips, "production_tips", errors);

  // 6. References
  if (!Array.isArray(genre.representative_tracks) || genre.representative_tracks.length < 5) {
    errors.push(
      `'representative_tracks' must have at least 5 tracks (received ${genre.representative_tracks?.length ?? 0})`
    );
  } else {
    const currentYear = new Date().getFullYear();
    genre.representative_tracks.forEach((track, i) => {
      if (!track.title) errors.push(`Track[${i}] is missing 'title'`);
      if (!track.artist) errors.push(`Track[${i}] is missing 'artist'`);
      if (typeof track.year === "number") {
        if (track.year < 1850 || track.year > currentYear + 1) {
          errors.push(`Track[${i}] year ${track.year} is out of realistic range (1850–${currentYear + 1})`);
        }
      }
    });
  }
  validateStringArrayField(genre.representative_artists, "representative_artists", errors);
  validateStringArrayField(genre.sources, "sources", errors);

  // 7. Acoustic Radar Metrics (1 to 10 finite integer range)
  if (!genre.radar_metrics) {
    errors.push("Missing 'radar_metrics' object");
  } else {
    for (const key of REQUIRED_RADAR_KEYS) {
      const val = genre.radar_metrics[key];
      if (
        typeof val !== "number" ||
        !Number.isFinite(val) ||
        !Number.isInteger(val) ||
        val < 1 ||
        val > 10
      ) {
        errors.push(`Radar metric '${key}' value ${val} must be a finite integer between 1 and 10`);
      }
    }
  }

  // 8. Sequencer Pattern & Steps
  if (!genre.sequencer_pattern) {
    errors.push("Missing 'sequencer_pattern'");
  } else {
    const pattern = genre.sequencer_pattern;
    if (!Array.isArray(pattern.tracks) || pattern.tracks.length !== 8) {
      errors.push(`'sequencer_pattern.tracks' must contain exactly 8 tracks (received ${pattern.tracks?.length ?? 0})`);
    } else {
      const trackIds = pattern.tracks.map((t) => t.track_id);
      for (const reqId of REQUIRED_TRACK_IDS) {
        if (!trackIds.includes(reqId as any)) {
          errors.push(`Sequencer missing required track_id: '${reqId}'`);
        }
      }

      pattern.tracks.forEach((track) => {
        if (!Array.isArray(track.steps)) {
          errors.push(`Track '${track.name}' missing 'steps' array`);
        } else {
          track.steps.forEach((step, stepIdx) => {
            if (typeof step !== "number" || step < 0 || step > 3) {
              errors.push(
                `Track '${track.name}' step[${stepIdx}] value ${step} is not in allowed range {0, 1, 2, 3}`
              );
            }
          });

          if (track.velocity && Array.isArray(track.velocity)) {
            if (track.velocity.length !== track.steps.length) {
              errors.push(
                `Track '${track.name}' velocity length (${track.velocity.length}) does not match steps length (${track.steps.length})`
              );
            }
          }
        }
      });
    }
  }

  // 9. Default BPM vs BPM Range
  if (genre.default_bpm && genre.bpm_range) {
    const parsed = parseBpmRange(genre.bpm_range);
    if (parsed.isValid) {
      // Tolerance of 35 BPM accommodates stylistic double-time / half-time references
      if (!isBpmInRange(genre.default_bpm, genre.bpm_range, 35)) {
        errors.push(
          `default_bpm (${genre.default_bpm}) is out of range for '${genre.bpm_range}'`
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates an entire collection of genres, ensuring unique IDs and valid schemas
 */
export function validateGenresDatabase(genres: Genre[]): DatabaseValidationResult {
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];
  const genreErrors: Record<string, string[]> = {};
  const genreWarnings: Record<string, string[]> = {};

  genres.forEach((genre) => {
    if (seenIds.has(genre.id)) {
      duplicateIds.push(genre.id);
    }
    seenIds.add(genre.id);

    const result = validateGenre(genre);
    if (!result.isValid) {
      genreErrors[genre.id] = result.errors;
    }
    if (result.warnings.length > 0) {
      genreWarnings[genre.id] = result.warnings;
    }
  });

  return {
    isValid: duplicateIds.length === 0 && Object.keys(genreErrors).length === 0,
    totalGenres: genres.length,
    duplicateIds,
    genreErrors,
    genreWarnings,
  };
}

// ---------------------------------------------------------------------------
// Content audit (E-11b)
//
// `validateGenre` only checks shape. This audit reports content-quality facts
// that are invisible to a shape validator: empty taxonomy arrays, templated
// placeholder copy, and thin citation lists. Hard vs report-only is explicit:
// a genre with fewer than `MIN_GENRE_SOURCES` sources is a HARD failure, while
// the empty-taxonomy and templated-copy counts are the current known baseline
// and are therefore report-only warnings.
// ---------------------------------------------------------------------------

/** Literal fragments that betray copy-pasted / templated placeholder copy. */
export const TEMPLATE_TEXT_MARKERS = ["signature kick character"] as const;

/** Minimum citations expected per genre before the content gate turns red. */
export const MIN_GENRE_SOURCES = 2;

export interface GenreAuditBucket {
  count: number;
  genreIds: string[];
}

export interface GenreContentAuditResult {
  totalGenres: number;
  /** Known empty baseline (159/159 at time of writing): report-only. */
  emptyTaxonomy: GenreAuditBucket;
  /** Templated placeholder copy (159/159 at time of writing): report-only. */
  templatedText: GenreAuditBucket;
  /** HARD rule: a genre should cite at least `MIN_GENRE_SOURCES` sources. */
  insufficientSources: GenreAuditBucket;
  warnings: string[];
  hardViolations: string[];
  passed: boolean;
}

/** Collects the free-text (narrative) fields scanned for template markers. */
function collectNarrativeText(genre: Genre): string[] {
  const parts: string[] = [];
  const pushPair = (pair?: { en?: unknown; zh?: unknown } | null) => {
    if (!pair) return;
    if (typeof pair.en === "string") parts.push(pair.en);
    if (typeof pair.zh === "string") parts.push(pair.zh);
  };

  pushPair(genre.origin_place);
  pushPair(genre.cultural_context);
  pushPair(genre.key_characteristics);
  pushPair(genre.chord_inversions);
  pushPair(genre.sound_design);
  pushPair(genre.rhythm_features);
  pushPair(genre.bass_pattern);

  const tips = genre.production_tips;
  if (Array.isArray(tips?.en)) {
    parts.push(...tips.en.filter((s): s is string => typeof s === "string"));
  }
  if (Array.isArray(tips?.zh)) {
    parts.push(...tips.zh.filter((s): s is string => typeof s === "string"));
  }

  const drum = genre.drum_pattern;
  if (drum) {
    for (const field of REQUIRED_DRUM_PATTERN_FIELDS) {
      pushPair(drum[field]);
    }
    if (typeof drum.tempo === "string") parts.push(drum.tempo);
  }

  return parts;
}

/**
 * Content-level audit of the genre database. Never throws, never mutates.
 * `passed` only reflects hard violations so callers can gate on it directly.
 */
export function auditGenreContent(genres: Genre[]): GenreContentAuditResult {
  const emptyTaxonomyIds: string[] = [];
  const templatedIds: string[] = [];
  const insufficientSourceIds: string[] = [];

  for (const genre of genres) {
    const id = genre.id;

    // 1. Taxonomy arrays all empty.
    if (
      Array.isArray(genre.parent_genres) &&
      Array.isArray(genre.subgenres) &&
      Array.isArray(genre.related_genres) &&
      genre.parent_genres.length === 0 &&
      genre.subgenres.length === 0 &&
      genre.related_genres.length === 0
    ) {
      emptyTaxonomyIds.push(id);
    }

    // 2. Repeated-template placeholder copy.
    const narrative = collectNarrativeText(genre).join("\n").toLowerCase();
    if (TEMPLATE_TEXT_MARKERS.some((marker) => narrative.includes(marker.toLowerCase()))) {
      templatedIds.push(id);
    }

    // 3. Citation depth (hard rule).
    const sourceCount = Array.isArray(genre.sources)
      ? genre.sources.filter((s) => typeof s === "string" && s.trim().length > 0).length
      : 0;
    if (sourceCount < MIN_GENRE_SOURCES) {
      insufficientSourceIds.push(id);
    }
  }

  const warnings: string[] = [];
  if (emptyTaxonomyIds.length > 0) {
    warnings.push(
      `[warn] ${emptyTaxonomyIds.length}/${genres.length} genres have empty parent_genres/subgenres/related_genres ` +
        `(known baseline; report-only, not a failure)`
    );
  }
  if (templatedIds.length > 0) {
    warnings.push(
      `[warn] ${templatedIds.length}/${genres.length} genres contain templated copy matching ` +
        `${TEMPLATE_TEXT_MARKERS.map((m) => `"${m}"`).join(", ")} (report-only, not a failure)`
    );
  }

  const hardViolations: string[] = [];
  if (insufficientSourceIds.length > 0) {
    hardViolations.push(
      `[hard] ${insufficientSourceIds.length}/${genres.length} genres cite fewer than ${MIN_GENRE_SOURCES} sources`
    );
  }

  return {
    totalGenres: genres.length,
    emptyTaxonomy: { count: emptyTaxonomyIds.length, genreIds: emptyTaxonomyIds },
    templatedText: { count: templatedIds.length, genreIds: templatedIds },
    insufficientSources: { count: insufficientSourceIds.length, genreIds: insufficientSourceIds },
    warnings,
    hardViolations,
    passed: hardViolations.length === 0,
  };
}
