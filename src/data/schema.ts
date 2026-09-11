import { Genre } from "../types/genre";
import { isBpmInRange, parseBpmRange } from "../utils/bpm";

export interface GenreValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface DatabaseValidationResult {
  isValid: boolean;
  totalGenres: number;
  duplicateIds: string[];
  genreErrors: Record<string, string[]>;
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

/**
 * Validates a single Genre against PRD and runtime specs
 */
export function validateGenre(genre: Genre): GenreValidationResult {
  const errors: string[] = [];

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

  // 2. Representative tracks (PRD §10.2: >= 5 required)
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

  // 3. Sequencer Pattern & Steps
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

  // 4. Acoustic Radar Metrics (1 to 10 integer range)
  if (!genre.radar_metrics) {
    errors.push("Missing 'radar_metrics' object");
  } else {
    for (const key of REQUIRED_RADAR_KEYS) {
      const val = genre.radar_metrics[key];
      if (typeof val !== "number" || val < 1 || val > 10) {
        errors.push(`Radar metric '${key}' value ${val} must be a number between 1 and 10`);
      }
    }
  }

  // 5. Default BPM vs BPM Range
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
  };
}

/**
 * Validates an entire collection of genres, ensuring unique IDs and valid schemas
 */
export function validateGenresDatabase(genres: Genre[]): DatabaseValidationResult {
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];
  const genreErrors: Record<string, string[]> = {};

  genres.forEach((genre) => {
    if (seenIds.has(genre.id)) {
      duplicateIds.push(genre.id);
    }
    seenIds.add(genre.id);

    const result = validateGenre(genre);
    if (!result.isValid) {
      genreErrors[genre.id] = result.errors;
    }
  });

  return {
    isValid: duplicateIds.length === 0 && Object.keys(genreErrors).length === 0,
    totalGenres: genres.length,
    duplicateIds,
    genreErrors,
  };
}
