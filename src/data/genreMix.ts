/**
 * Genre mix defaults — the single source of truth for per-genre track volume, pan,
 * reverb/delay sends and the master loudness trim.
 *
 * Why this file exists (and lives outside `src/data/genres/*.ts`):
 * every one of the 159 genres used to declare the *identical* per-track mix
 * (kick 0.90/0.00, snare 0.85/0.00, hihat 0.70/-0.20, percussion 0.65/+0.25,
 * bass 0.90/0.00, chords 0.75/0.00, lead 0.80/+0.10, fx 0.60/0.00) and never
 * declared `sendA`/`sendB` at all, so the reverb/delay buses were dead and nothing
 * about the mix reflected genre character. Keeping the values here (same precedent
 * as `relations.ts`) also keeps this branch conflict-free with the parallel
 * `feat/genre-instrument-curation` workstream that owns the genre files themselves.
 *
 * Layering, outermost last:
 *   1. `CATEGORY_MIX_PROFILES` — six musically authored base profiles, one per
 *      category that actually exists in the database (Electronic, Hip Hop,
 *      Jazz/Blues, Latin/World, Pop/R&B, Rock/Metal).
 *   2. `GENRE_MIX[genreId].overrides` — hand-authored deviations for genres whose
 *      own `rhythm_dna` / `radar_metrics` / `sound_design` / `instrumentation` /
 *      `default_bpm` / declared track instruments justify stepping away from the
 *      category base. Each override carries its reason inline.
 *   3. `loudnessTrimDb` — the loudness-match offset measured by
 *      `scripts/measure_genre_loudness.mjs` and enforced by the master trim stage.
 * `GENRE_MIX_RESOLVED` is the flattened result of 1+2 for all 159 ids; that is the
 * table callers should read when they want "the resolved per-genre values".
 *
 * Ranges: volume 0..1, pan -1..1, sendA/sendB 0..1, loudnessTrimDb
 * [LOUDNESS_TRIM_MIN_DB, LOUDNESS_TRIM_MAX_DB].
 */
import { Genre, GenreCategory, SequencerPattern, SequencerTrack } from "../types/genre";
import { expandGenrePattern, resolveGenreExpression } from "./genreExpression";
import { GENRE_INDEX_MAP } from "./index/genresIndex";

/** The eight sequencer roles a mix profile assigns values to. */
export const MIX_TRACK_IDS = [
  "kick",
  "snare",
  "hihat",
  "percussion",
  "bass",
  "chords",
  "lead",
  "fx",
] as const;

export type MixTrackId = (typeof MIX_TRACK_IDS)[number];

/** One channel strip's default mix values. */
export interface TrackMix {
  /** Fader level, 0..1 (the engine clamps to 1.0). */
  volume: number;
  /** Stereo position, -1 (hard left) .. +1 (hard right). */
  pan: number;
  /** Reverb bus send, 0..1. */
  sendA: number;
  /** Delay bus send, 0..1. */
  sendB: number;
}

export type ResolvedGenreMix = Record<MixTrackId, TrackMix>;
export type CategoryMixProfile = ResolvedGenreMix;

/**
 * Category base profiles.
 *
 * Anchored on the *reference genre* of each category and on how that category's
 * repertoire is actually mixed:
 *  - Electronic: four-on-the-floor club music — kick and sub-bass carry the weight,
 *    hats/percussion spread wide with delay, the riser is an arrangement feature.
 *  - Hip Hop: kick + 808 sub are the foundation, clap/snare centred, hats and
 *    percussion wide, low-mid space left open for the vocal.
 *  - Jazz/Blues: upright bass forward and the kit slightly back in a small room,
 *    comping instrument wide-left with a horn/lead wide-right; the synth riser is
 *    effectively unused.
 *  - Latin/World: percussion is the lead voice — loudest after the bass and pushed
 *    off-centre, with a lively but short reverb; the kick stays polite.
 *  - Pop/R&B: the topline (lead) is the loudest element, everything else balanced
 *    and slightly behind it, generous but controlled reverb.
 *  - Rock/Metal: kick + snare forward, rhythm guitar hard left and lead/double
 *    hard right, bass mono in the centre, room reverb on the snare.
 */
export const CATEGORY_MIX_PROFILES: Record<GenreCategory, CategoryMixProfile> = {
  Electronic: {
    kick: { volume: 0.95, pan: 0.0, sendA: 0.02, sendB: 0.0 },
    snare: { volume: 0.82, pan: 0.0, sendA: 0.1, sendB: 0.06 },
    hihat: { volume: 0.72, pan: -0.3, sendA: 0.06, sendB: 0.14 },
    percussion: { volume: 0.7, pan: 0.42, sendA: 0.12, sendB: 0.22 },
    bass: { volume: 0.92, pan: 0.0, sendA: 0.0, sendB: 0.0 },
    chords: { volume: 0.72, pan: -0.12, sendA: 0.14, sendB: 0.08 },
    lead: { volume: 0.78, pan: 0.2, sendA: 0.16, sendB: 0.18 },
    fx: { volume: 0.68, pan: 0.1, sendA: 0.22, sendB: 0.15 },
  },
  "Hip Hop": {
    kick: { volume: 0.97, pan: 0.0, sendA: 0.0, sendB: 0.0 },
    snare: { volume: 0.88, pan: 0.0, sendA: 0.04, sendB: 0.04 },
    hihat: { volume: 0.78, pan: -0.35, sendA: 0.05, sendB: 0.1 },
    percussion: { volume: 0.62, pan: 0.36, sendA: 0.08, sendB: 0.14 },
    bass: { volume: 0.95, pan: 0.0, sendA: 0.0, sendB: 0.0 },
    chords: { volume: 0.68, pan: -0.08, sendA: 0.1, sendB: 0.05 },
    lead: { volume: 0.7, pan: 0.18, sendA: 0.12, sendB: 0.08 },
    fx: { volume: 0.56, pan: 0.0, sendA: 0.14, sendB: 0.12 },
  },
  "Jazz/Blues": {
    kick: { volume: 0.72, pan: 0.0, sendA: 0.1, sendB: 0.0 },
    snare: { volume: 0.74, pan: 0.05, sendA: 0.12, sendB: 0.0 },
    hihat: { volume: 0.62, pan: -0.22, sendA: 0.1, sendB: 0.0 },
    percussion: { volume: 0.52, pan: 0.2, sendA: 0.14, sendB: 0.04 },
    // Upright bass is the anchor of the idiom: forward, mono, dry.
    bass: { volume: 0.95, pan: 0.0, sendA: 0.03, sendB: 0.0 },
    chords: { volume: 0.8, pan: -0.15, sendA: 0.16, sendB: 0.03 },
    lead: { volume: 0.76, pan: 0.15, sendA: 0.18, sendB: 0.05 },
    // "Effectively no synth riser": the FX lane is only room/ear candy here.
    fx: { volume: 0.3, pan: 0.0, sendA: 0.1, sendB: 0.05 },
  },
  "Latin/World": {
    kick: { volume: 0.8, pan: 0.0, sendA: 0.04, sendB: 0.0 },
    snare: { volume: 0.72, pan: 0.08, sendA: 0.1, sendB: 0.05 },
    hihat: { volume: 0.62, pan: -0.25, sendA: 0.08, sendB: 0.1 },
    // Percussion leads: loudest non-bass element and pushed wide left.
    percussion: { volume: 0.92, pan: -0.4, sendA: 0.14, sendB: 0.16 },
    bass: { volume: 0.88, pan: 0.0, sendA: 0.02, sendB: 0.0 },
    chords: { volume: 0.7, pan: 0.15, sendA: 0.14, sendB: 0.06 },
    lead: { volume: 0.72, pan: -0.1, sendA: 0.16, sendB: 0.1 },
    fx: { volume: 0.48, pan: 0.25, sendA: 0.16, sendB: 0.12 },
  },
  "Pop/R&B": {
    kick: { volume: 0.86, pan: 0.0, sendA: 0.02, sendB: 0.0 },
    snare: { volume: 0.84, pan: 0.0, sendA: 0.1, sendB: 0.05 },
    hihat: { volume: 0.66, pan: -0.22, sendA: 0.08, sendB: 0.1 },
    percussion: { volume: 0.6, pan: 0.3, sendA: 0.12, sendB: 0.14 },
    bass: { volume: 0.86, pan: 0.0, sendA: 0.0, sendB: 0.0 },
    chords: { volume: 0.74, pan: -0.1, sendA: 0.14, sendB: 0.06 },
    // Topline first: the lead lane is the loudest channel in the category.
    lead: { volume: 0.9, pan: 0.05, sendA: 0.2, sendB: 0.12 },
    fx: { volume: 0.52, pan: 0.0, sendA: 0.14, sendB: 0.1 },
  },
  "Rock/Metal": {
    kick: { volume: 0.95, pan: 0.0, sendA: 0.04, sendB: 0.0 },
    snare: { volume: 0.92, pan: 0.0, sendA: 0.14, sendB: 0.03 },
    hihat: { volume: 0.68, pan: -0.3, sendA: 0.1, sendB: 0.06 },
    percussion: { volume: 0.55, pan: 0.28, sendA: 0.1, sendB: 0.08 },
    bass: { volume: 0.88, pan: 0.0, sendA: 0.0, sendB: 0.0 },
    // Double-tracked guitars: rhythm hard left, lead/double hard right.
    chords: { volume: 0.86, pan: -0.45, sendA: 0.1, sendB: 0.04 },
    lead: { volume: 0.84, pan: 0.45, sendA: 0.14, sendB: 0.08 },
    fx: { volume: 0.42, pan: 0.0, sendA: 0.1, sendB: 0.08 },
  },
};

/** One genre's mix entry: its category base, optional deviations, and loudness trim. */
export interface GenreMix {
  /** Category whose profile supplies the base values. */
  category: GenreCategory;
  /**
   * Per-track deviations from the category base. Only the fields that change need
   * to be present; the rest inherit the category profile.
   */
  overrides?: Partial<Record<MixTrackId, Partial<TrackMix>>>;
  /**
   * Loudness-match offset in dB applied on the master bus so switching genres does
   * not change the perceived output level. Measured, not guessed — see
   * `scripts/loudness.baseline.json` and `scripts/measure_genre_loudness.mjs`.
   */
  loudnessTrimDb: number;
}

/** Clamp bounds for `loudnessTrimDb`; the measurement script must use the same. */
export const LOUDNESS_TRIM_MIN_DB = -9;
/**
 * Trim ceiling, symmetric with the floor.
 *
 * It was `+6` against a `-9` floor, chosen when the library's arranged spread was smaller.
 * The per-genre FX and bus work (N-14) widened the extremes — `doom-metal`'s 3 s reverb and
 * slow sustained chords leave it ~6.7 dB under the target — and a clamped trim silently
 * breaks the loudness promise for that one genre, which is worse than a visibly larger
 * number. The trim sits before the limiter, so a large positive value is absorbed by the
 * ceiling rather than becoming a hard clip.
 */
export const LOUDNESS_TRIM_MAX_DB = 9;

/**
 * Per-genre table — one entry for every one of the 159 genre ids (coverage is
 * asserted by `src/test/genreMix.test.ts`). Values not overridden below come from
 * the genre's category profile; the inline comments record why an override exists.
 */
export const GENRE_MIX: Record<string, GenreMix> = {
  // ---------------------------------------------------------------- Electronic
  "2-step-garage": { category: "Electronic", loudnessTrimDb: 0 },
  "acid-house": { category: "Electronic", loudnessTrimDb: -8.24 },
  "acid-techno": { category: "Electronic", loudnessTrimDb: -7.63 },
  "afro-house": { category: "Electronic", loudnessTrimDb: 0, overrides: { percussion: { volume: 0.8, pan: -0.45, sendB: 0.26 } } },
  "ambient": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.5, sendA: 0.2 }, snare: { volume: 0.42, sendA: 0.22 }, hihat: { volume: 0.38, pan: -0.34 }, percussion: { volume: 0.34 }, bass: { volume: 0.78 }, chords: { volume: 0.92, sendA: 0.38 }, lead: { volume: 0.68, sendA: 0.34 }, fx: { volume: 0.24, sendA: 0.3 } } },
  "ambient-dub": { category: "Electronic", loudnessTrimDb: -0.06, overrides: { kick: { volume: 0.62 }, snare: { volume: 0.5, sendA: 0.2 }, hihat: { volume: 0.44, sendB: 0.24 }, bass: { volume: 0.9, sendA: 0.04 }, chords: { volume: 0.86, sendA: 0.36 }, lead: { volume: 0.6, sendA: 0.34 }, fx: { volume: 0.3, sendA: 0.26 } } },
  "ambient-techno": { category: "Electronic", loudnessTrimDb: -5.47, overrides: { kick: { volume: 0.58 }, snare: { volume: 0.5 }, hihat: { volume: 0.46 }, percussion: { volume: 0.44 }, chords: { volume: 0.88, sendA: 0.32 }, lead: { volume: 0.66, sendA: 0.3 }, fx: { volume: 0.32, sendA: 0.24 } } },
  "bass-house": { category: "Electronic", loudnessTrimDb: -4.42, overrides: { kick: { volume: 0.97 }, bass: { volume: 0.97 } } },
  "bassline": { category: "Electronic", loudnessTrimDb: -2.14, overrides: { bass: { volume: 0.96 } } },
  "big-beat": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.97 }, snare: { volume: 0.9, sendA: 0.16 }, chords: { volume: 0.8, pan: -0.4 } } },
  "breakbeat": { category: "Electronic", loudnessTrimDb: 0, overrides: { snare: { volume: 0.9, sendA: 0.14 }, percussion: { volume: 0.78, pan: 0.45 } } },
  "breakcore": { category: "Electronic", loudnessTrimDb: -2.55, overrides: { kick: { volume: 0.98 }, snare: { volume: 0.95 }, hihat: { volume: 0.82 }, percussion: { volume: 0.8 } } },
  "brooklyn-drill": { category: "Electronic", loudnessTrimDb: -4.3, overrides: { hihat: { volume: 0.8, pan: -0.4, sendB: 0.18 }, bass: { volume: 0.97 }, lead: { volume: 0.62 } } },
  "brostep": { category: "Electronic", loudnessTrimDb: -3.81, overrides: { kick: { volume: 0.98 }, bass: { volume: 0.98, sendA: 0.0 } } },
  "chicago-drill": { category: "Electronic", loudnessTrimDb: -2.66, overrides: { hihat: { volume: 0.8, pan: -0.38 }, bass: { volume: 0.97 }, chords: { volume: 0.6 } } },
  "chicago-house": { category: "Electronic", loudnessTrimDb: -5.86, overrides: { snare: { volume: 0.86, sendA: 0.14 }, chords: { volume: 0.78, sendA: 0.18 } } },
  "chillstep": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.78 }, snare: { volume: 0.6, sendA: 0.22 }, hihat: { volume: 0.6 }, bass: { volume: 0.92 }, chords: { volume: 0.84, sendA: 0.3 }, lead: { volume: 0.72, sendA: 0.28 } } },
  "chillwave": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.62 }, snare: { volume: 0.5 }, hihat: { volume: 0.5, pan: -0.28 }, bass: { volume: 0.84 }, chords: { volume: 0.9, sendA: 0.34 }, lead: { volume: 0.74, sendA: 0.3 }, fx: { volume: 0.3 } } },
  "chiptune": { category: "Electronic", loudnessTrimDb: -7.98, overrides: { hihat: { volume: 0.8 }, lead: { volume: 0.88, pan: 0.1 }, chords: { volume: 0.78 }, fx: { volume: 0.5 } } },
  "deathstep": { category: "Electronic", loudnessTrimDb: -2.63, overrides: { kick: { volume: 0.98 }, bass: { volume: 0.98 }, snare: { volume: 0.7 } } },
  "deep-house": { category: "Electronic", loudnessTrimDb: 0, overrides: { hihat: { volume: 0.62, sendB: 0.2 }, bass: { volume: 0.94 }, chords: { volume: 0.82, sendA: 0.2 }, lead: { volume: 0.68 } } },
  "detroit-techno": { category: "Electronic", loudnessTrimDb: -5.57, overrides: { chords: { volume: 0.8, pan: -0.18, sendA: 0.2 }, lead: { volume: 0.74 } } },
  "downtempo": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.78 }, snare: { volume: 0.66, sendA: 0.18 }, hihat: { volume: 0.6 }, bass: { volume: 0.9 }, chords: { volume: 0.84, sendA: 0.26 }, lead: { volume: 0.72, sendA: 0.24 }, fx: { volume: 0.36 } } },
  "dream-trance": { category: "Electronic", loudnessTrimDb: -6.63, overrides: { lead: { volume: 0.88, sendA: 0.3 }, chords: { volume: 0.84, sendA: 0.3 } } },
  "drift-phonk": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 1.0 }, bass: { volume: 0.98 } } },
  "dub": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.8 }, snare: { volume: 0.56, sendA: 0.24 }, hihat: { volume: 0.46, sendB: 0.26 }, bass: { volume: 0.98 }, chords: { volume: 0.82, sendA: 0.34 }, lead: { volume: 0.6, sendA: 0.34 }, fx: { volume: 0.34, sendA: 0.3 } } },
  "dubstep": { category: "Electronic", loudnessTrimDb: -0.33, overrides: { kick: { volume: 0.98 }, snare: { volume: 0.72 }, bass: { volume: 0.99 }, chords: { volume: 0.6 }, lead: { volume: 0.64 }, fx: { volume: 0.6 } } },
  "dub-techno": { category: "Electronic", loudnessTrimDb: -4.01, overrides: { kick: { volume: 0.72 }, snare: { volume: 0.6, sendA: 0.24 }, hihat: { volume: 0.5, sendB: 0.24 }, bass: { volume: 0.96 }, chords: { volume: 0.86, sendA: 0.34 }, fx: { volume: 0.36, sendA: 0.28 } } },
  "edm-trap": { category: "Electronic", loudnessTrimDb: -0.12, overrides: { kick: { volume: 0.98 }, bass: { volume: 0.98 }, hihat: { volume: 0.82, pan: -0.38 }, lead: { volume: 0.8, sendA: 0.22 } } },
  "electro": { category: "Electronic", loudnessTrimDb: 0, overrides: { snare: { volume: 0.9 }, bass: { volume: 0.94 }, chords: { volume: 0.64 } } },
  "electro-house": { category: "Electronic", loudnessTrimDb: -4.34, overrides: { kick: { volume: 0.98 }, lead: { volume: 0.86, pan: 0.18 } } },
  "euro-trance": { category: "Electronic", loudnessTrimDb: -8.42, overrides: { lead: { volume: 0.9, sendA: 0.26 }, chords: { volume: 0.8, sendA: 0.28 }, fx: { volume: 0.72 } } },
  "footwork": { category: "Electronic", loudnessTrimDb: -8.26, overrides: { kick: { volume: 0.98 }, snare: { volume: 0.8 }, hihat: { volume: 0.84, pan: -0.38 }, percussion: { volume: 0.8 } } },
  "frenchcore": { category: "Electronic", loudnessTrimDb: -3.44, overrides: { kick: { volume: 1.0 }, lead: { volume: 0.72 }, fx: { volume: 0.5 } } },
  "french-house": { category: "Electronic", loudnessTrimDb: -5.8, overrides: { bass: { volume: 0.94 }, chords: { volume: 0.8, sendA: 0.18 }, lead: { volume: 0.76, sendB: 0.22 } } },
  "future-bass": { category: "Electronic", loudnessTrimDb: 0, overrides: { bass: { volume: 0.96 }, lead: { volume: 0.86, sendA: 0.24 }, chords: { volume: 0.78, sendA: 0.24 } } },
  "future-garage": { category: "Electronic", loudnessTrimDb: 0, overrides: { hihat: { volume: 0.7, pan: -0.34, sendB: 0.22 }, bass: { volume: 0.94 }, chords: { volume: 0.8, sendA: 0.22 } } },
  "future-house": { category: "Electronic", loudnessTrimDb: -3.76, overrides: { bass: { volume: 0.94 }, lead: { volume: 0.82, sendA: 0.2 } } },
  "ghetto-house": { category: "Electronic", loudnessTrimDb: -7.84, overrides: { kick: { volume: 0.98 }, percussion: { volume: 0.8, pan: 0.45 }, bass: { volume: 0.96 } } },
  "glitch-hop": { category: "Electronic", loudnessTrimDb: 0, overrides: { percussion: { volume: 0.82, pan: 0.38 }, chords: { volume: 0.62 }, bass: { volume: 0.92 } } },
  "goa-trance": { category: "Electronic", loudnessTrimDb: -4.39, overrides: { bass: { volume: 0.86 }, lead: { volume: 0.88, pan: 0.16, sendA: 0.24 }, chords: { volume: 0.82, sendA: 0.24 }, fx: { volume: 0.76 } } },
  "grime": { category: "Electronic", loudnessTrimDb: 0, overrides: { bass: { volume: 0.96 }, lead: { volume: 0.82 }, chords: { volume: 0.6 } } },
  "halftime": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, snare: { volume: 0.94 }, bass: { volume: 0.97 }, hihat: { volume: 0.62 } } },
  "happy-hardcore": { category: "Electronic", loudnessTrimDb: -6.91, overrides: { kick: { volume: 0.98 }, lead: { volume: 0.86 }, chords: { volume: 0.78, sendA: 0.2 } } },
  "hardcore-gabber": { category: "Electronic", loudnessTrimDb: -1.99, overrides: { kick: { volume: 1.0 }, snare: { volume: 0.7 }, bass: { volume: 0.94 } } },
  "hardstyle": { category: "Electronic", loudnessTrimDb: -6.73, overrides: { kick: { volume: 1.0 }, bass: { volume: 0.98 }, lead: { volume: 0.82 }, fx: { volume: 0.6 } } },
  "hard-techno": { category: "Electronic", loudnessTrimDb: -4.45, overrides: { kick: { volume: 1.0 }, bass: { volume: 0.95 }, snare: { volume: 0.86 } } },
  "hard-trance": { category: "Electronic", loudnessTrimDb: -2.64, overrides: { kick: { volume: 0.98 }, lead: { volume: 0.88, sendA: 0.22 } } },
  "hard-trap": { category: "Electronic", loudnessTrimDb: -0.01, overrides: { kick: { volume: 0.98 }, bass: { volume: 0.99 }, hihat: { volume: 0.8, pan: -0.4 } } },
  "hybrid-trap": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.97 }, bass: { volume: 0.96 }, hihat: { volume: 0.8, pan: -0.36 }, lead: { volume: 0.78 } } },
  "idm": { category: "Electronic", loudnessTrimDb: -6.91, overrides: { percussion: { volume: 0.8, pan: 0.36 }, chords: { volume: 0.8, sendA: 0.24 }, bass: { volume: 0.88 } } },
  "industrial-techno": { category: "Electronic", loudnessTrimDb: -5.3, overrides: { kick: { volume: 1.0 }, bass: { volume: 0.95 }, snare: { volume: 0.88 } } },
  "jersey-club": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.99 }, percussion: { volume: 0.88, pan: 0.42 }, bass: { volume: 0.96 } } },
  "jersey-drill": { category: "Electronic", loudnessTrimDb: -4.09, overrides: { kick: { volume: 0.98 }, bass: { volume: 0.98 }, hihat: { volume: 0.82, pan: -0.4 }, percussion: { volume: 0.78 } } },
  "jump-up": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, snare: { volume: 0.92 }, bass: { volume: 0.98 } } },
  "jungle": { category: "Electronic", loudnessTrimDb: -0.19, overrides: { kick: { volume: 0.9 }, snare: { volume: 0.95 }, percussion: { volume: 0.82, pan: 0.44 }, bass: { volume: 0.96 } } },
  "kawaii-future-bass": { category: "Electronic", loudnessTrimDb: -5.01, overrides: { lead: { volume: 0.9, sendA: 0.22 }, chords: { volume: 0.8, sendA: 0.22 }, bass: { volume: 0.94 } } },
  "liquid-dnb": { category: "Electronic", loudnessTrimDb: -2.21, overrides: { snare: { volume: 0.9, sendA: 0.16 }, bass: { volume: 0.94 }, chords: { volume: 0.8, sendA: 0.24 }, lead: { volume: 0.76, sendA: 0.22 } } },
  "lofi-house": { category: "Electronic", loudnessTrimDb: -8.87, overrides: { hihat: { volume: 0.58 }, chords: { volume: 0.84, sendA: 0.24 }, lead: { volume: 0.66, sendA: 0.22 }, fx: { volume: 0.34 } } },
  "melodic-dubstep": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.9 }, bass: { volume: 0.97 }, chords: { volume: 0.86, sendA: 0.28 }, lead: { volume: 0.82, sendA: 0.26 } } },
  "melodic-house": { category: "Electronic", loudnessTrimDb: -4.62, overrides: { hihat: { volume: 0.62, sendB: 0.2 }, chords: { volume: 0.86, sendA: 0.22 }, lead: { volume: 0.76, sendA: 0.22 } } },
  "microhouse": { category: "Electronic", loudnessTrimDb: 6.46, overrides: { kick: { volume: 0.88 }, snare: { volume: 0.66, sendA: 0.16 }, hihat: { volume: 0.54, sendB: 0.22 }, percussion: { volume: 0.68, sendB: 0.26 }, chords: { volume: 0.76, sendA: 0.22 }, fx: { volume: 0.46 } } },
  "minimal-techno": { category: "Electronic", loudnessTrimDb: 2.4, overrides: { hihat: { volume: 0.6, sendB: 0.2 }, chords: { volume: 0.8, sendA: 0.22 }, lead: { volume: 0.56 }, fx: { volume: 0.44 } } },
  "moombahton": { category: "Electronic", loudnessTrimDb: -3.01, overrides: { kick: { volume: 0.96 }, bass: { volume: 0.94 }, percussion: { volume: 0.82, pan: 0.42 } } },
  "neurofunk": { category: "Electronic", loudnessTrimDb: -5.61, overrides: { kick: { volume: 0.96 }, snare: { volume: 0.92 }, bass: { volume: 1.0 } } },
  "nu-disco-house": { category: "Electronic", loudnessTrimDb: -1.79, overrides: { bass: { volume: 0.92 }, chords: { volume: 0.8, pan: -0.2, sendA: 0.18 }, lead: { volume: 0.78 } } },
  "peak-time-techno": { category: "Electronic", loudnessTrimDb: -7.24, overrides: { kick: { volume: 0.99 }, bass: { volume: 0.96 }, fx: { volume: 0.78 } } },
  "phonk": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.97 }, bass: { volume: 0.98 }, lead: { volume: 0.72 }, chords: { volume: 0.6 } } },
  "post-dubstep": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.66 }, snare: { volume: 0.58, sendA: 0.22 }, hihat: { volume: 0.5 }, bass: { volume: 0.96 }, chords: { volume: 0.88, sendA: 0.32 }, lead: { volume: 0.7, sendA: 0.3 } } },
  "progressive-house": { category: "Electronic", loudnessTrimDb: -5.6, overrides: { lead: { volume: 0.8, sendA: 0.22 }, chords: { volume: 0.8, sendA: 0.22 } } },
  "progressive-trance": { category: "Electronic", loudnessTrimDb: -8.64, overrides: { lead: { volume: 0.84, sendA: 0.26 }, chords: { volume: 0.82, sendA: 0.26 } } },
  "psytrance": { category: "Electronic", loudnessTrimDb: -3.23, overrides: { kick: { volume: 0.98 }, bass: { volume: 0.97 }, lead: { volume: 0.86, pan: 0.22 }, fx: { volume: 0.8 } } },
  "ragga-jungle": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.88 }, snare: { volume: 0.92, sendA: 0.16 }, bass: { volume: 0.98 }, chords: { volume: 0.72 } } },
  "raw-techno": { category: "Electronic", loudnessTrimDb: -5.59, overrides: { kick: { volume: 1.0 }, snare: { volume: 0.9 }, percussion: { volume: 0.8 } } },
  "riddim": { category: "Electronic", loudnessTrimDb: -1.45, overrides: { kick: { volume: 0.97 }, bass: { volume: 0.99 }, lead: { volume: 0.6 } } },
  "sambass": { category: "Electronic", loudnessTrimDb: -2.46, overrides: { snare: { volume: 0.9 }, percussion: { volume: 0.92, pan: -0.42 }, bass: { volume: 0.92 } } },
  "schranz": { category: "Electronic", loudnessTrimDb: -0.01, overrides: { kick: { volume: 1.0 }, bass: { volume: 0.96 }, percussion: { volume: 0.82 } } },
  "speedbass": { category: "Electronic", loudnessTrimDb: -4.37, overrides: { bass: { volume: 0.98 }, kick: { volume: 0.97 } } },
  "speed-garage": { category: "Electronic", loudnessTrimDb: -1.73, overrides: { hihat: { volume: 0.74, pan: -0.34, sendB: 0.2 }, bass: { volume: 0.94 } } },
  "synthwave": { category: "Electronic", loudnessTrimDb: -4.38, overrides: { snare: { volume: 0.88, sendA: 0.22 }, chords: { volume: 0.86, pan: -0.3, sendA: 0.2 }, lead: { volume: 0.84, pan: 0.3, sendA: 0.22 }, bass: { volume: 0.92 } } },
  "tearout-dubstep": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, bass: { volume: 1.0 }, snare: { volume: 0.72 } } },
  "tech-house": { category: "Electronic", loudnessTrimDb: -5.57, overrides: { kick: { volume: 0.97 }, bass: { volume: 0.94 }, percussion: { volume: 0.76, sendB: 0.26 } } },
  "techstep": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.94 }, snare: { volume: 0.92 }, bass: { volume: 0.98 } } },
  "tech-trance": { category: "Electronic", loudnessTrimDb: -8.86, overrides: { kick: { volume: 0.99 }, bass: { volume: 0.96 }, lead: { volume: 0.84, sendA: 0.24 } } },
  "trip-hop": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.8 }, snare: { volume: 0.68, sendA: 0.2 }, hihat: { volume: 0.52, pan: -0.28 }, bass: { volume: 0.95 }, chords: { volume: 0.84, sendA: 0.28 }, lead: { volume: 0.6, sendA: 0.26 }, fx: { volume: 0.36 } } },
  "tropical-house": { category: "Electronic", loudnessTrimDb: 0, overrides: { percussion: { volume: 0.82, pan: 0.42 }, chords: { volume: 0.78, sendA: 0.2 }, lead: { volume: 0.74, sendA: 0.2 } } },
  "uk-drill": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, bass: { volume: 0.99 }, hihat: { volume: 0.84, pan: -0.4, sendB: 0.2 } } },
  "uk-funky": { category: "Electronic", loudnessTrimDb: 0, overrides: { bass: { volume: 0.94 }, percussion: { volume: 0.82, pan: 0.4 } } },
  "uk-garage": { category: "Electronic", loudnessTrimDb: -0.01, overrides: { hihat: { volume: 0.72, pan: -0.36, sendB: 0.22 }, bass: { volume: 0.95 }, chords: { volume: 0.78, sendA: 0.22 } } },
  "uplifting-trance": { category: "Electronic", loudnessTrimDb: -8.96, overrides: { lead: { volume: 0.9, pan: 0.16, sendA: 0.28 }, chords: { volume: 0.84, pan: -0.16, sendA: 0.28 }, bass: { volume: 0.9 } } },
  "vaporwave": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.6 }, snare: { volume: 0.5, sendA: 0.24 }, hihat: { volume: 0.46 }, bass: { volume: 0.86 }, chords: { volume: 0.92, sendA: 0.36 }, lead: { volume: 0.66, sendA: 0.32 }, fx: { volume: 0.34 } } },
  "vocal-trance": { category: "Electronic", loudnessTrimDb: -8.74, overrides: { lead: { volume: 0.92, sendA: 0.28 }, chords: { volume: 0.82, sendA: 0.26 } } },
  "wave": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.76 }, hihat: { volume: 0.56 }, bass: { volume: 0.96 }, chords: { volume: 0.88, sendA: 0.32 }, lead: { volume: 0.78, sendA: 0.3 } } },

  // ------------------------------------------------------------------- Hip Hop
  "boom-bap": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.94, sendA: 0.04 }, snare: { volume: 0.92, sendA: 0.12 }, hihat: { volume: 0.66 }, percussion: { volume: 0.58 }, bass: { volume: 0.94 }, chords: { volume: 0.74, sendA: 0.16 }, lead: { volume: 0.62 } } },
  "cloud-rap": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.92 }, snare: { volume: 0.66, sendA: 0.24 }, hihat: { volume: 0.6, sendB: 0.2 }, bass: { volume: 0.97 }, chords: { volume: 0.86, sendA: 0.34 }, lead: { volume: 0.76, sendA: 0.3 } } },
  "conscious-hip-hop": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.86 }, snare: { volume: 0.84 }, hihat: { volume: 0.6 }, bass: { volume: 0.95 }, chords: { volume: 0.78, sendA: 0.18 }, lead: { volume: 0.72, sendA: 0.18 } } },
  "east-coast-hip-hop": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.95 }, snare: { volume: 0.9 }, hihat: { volume: 0.64 }, bass: { volume: 0.95 }, chords: { volume: 0.74, sendA: 0.14 } } },
  "emo-rap": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.92 }, snare: { volume: 0.7, sendA: 0.2 }, hihat: { volume: 0.7, pan: -0.34 }, bass: { volume: 0.96 }, chords: { volume: 0.82, sendA: 0.3 }, lead: { volume: 0.84, sendA: 0.28 } } },
  "g-funk": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.94 }, snare: { volume: 0.82 }, bass: { volume: 0.98 }, chords: { volume: 0.7, sendA: 0.14 }, lead: { volume: 0.88, pan: 0.24, sendA: 0.22 } } },
  "lofi-hip-hop": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.84 }, snare: { volume: 0.68, sendA: 0.16 }, hihat: { volume: 0.54, pan: -0.3 }, bass: { volume: 0.95 }, chords: { volume: 0.86, sendA: 0.28 }, lead: { volume: 0.68, sendA: 0.26 }, fx: { volume: 0.36 } } },
  "old-school-hip-hop": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.95 }, snare: { volume: 0.92, sendA: 0.1 }, hihat: { volume: 0.68 }, percussion: { volume: 0.7, pan: 0.4 }, bass: { volume: 0.94 } } },
  "southern-hip-hop": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, snare: { volume: 0.8 }, hihat: { volume: 0.74 }, bass: { volume: 0.99 }, chords: { volume: 0.72, sendA: 0.2 }, lead: { volume: 0.7, sendA: 0.2 } } },
  "trap-rap": { category: "Hip Hop", loudnessTrimDb: -0.07, overrides: { kick: { volume: 0.98 }, snare: { volume: 0.8 }, hihat: { volume: 0.84, pan: -0.42, sendB: 0.18 }, bass: { volume: 0.99 } } },
  "west-coast-hip-hop": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.94 }, snare: { volume: 0.86 }, hihat: { volume: 0.68 }, bass: { volume: 0.95 }, lead: { volume: 0.78, pan: 0.22 } } },

  // --------------------------------------------------------------- Jazz/Blues
  "acid-jazz": { category: "Jazz/Blues", loudnessTrimDb: -3.37, overrides: { kick: { volume: 0.86 }, snare: { volume: 0.84, sendA: 0.12 }, bass: { volume: 0.96 }, chords: { volume: 0.82, pan: -0.2 }, lead: { volume: 0.8, pan: 0.2 }, fx: { volume: 0.36, sendA: 0.12 } } },
  "bebop": { category: "Jazz/Blues", loudnessTrimDb: -7.32, overrides: { kick: { volume: 0.62, sendA: 0.08 }, snare: { volume: 0.66, sendA: 0.1 }, hihat: { volume: 0.56 }, percussion: { volume: 0.46 }, bass: { volume: 0.98 }, chords: { volume: 0.76, sendA: 0.14 }, lead: { volume: 0.84, sendA: 0.16 } } },
  "chicago-blues": { category: "Jazz/Blues", loudnessTrimDb: -5.58, overrides: { kick: { volume: 0.78 }, snare: { volume: 0.8, sendA: 0.14 }, bass: { volume: 0.92 }, chords: { volume: 0.84, pan: -0.22 }, lead: { volume: 0.86, pan: 0.22, sendA: 0.2 } } },
  "cool-jazz": { category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.56 }, snare: { volume: 0.6, sendA: 0.14 }, hihat: { volume: 0.52 }, percussion: { volume: 0.44 }, bass: { volume: 0.92 }, chords: { volume: 0.82, sendA: 0.18 }, lead: { volume: 0.7, sendA: 0.18 } } },
  "delta-blues": { category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.6 }, snare: { volume: 0.62, sendA: 0.16 }, hihat: { volume: 0.44 }, percussion: { volume: 0.4 }, bass: { volume: 0.86 }, chords: { volume: 0.88, pan: -0.2, sendA: 0.2 }, lead: { volume: 0.84, pan: 0.2, sendA: 0.2 } } },
  "electric-blues": { category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.8 }, snare: { volume: 0.82, sendA: 0.14 }, bass: { volume: 0.92 }, chords: { volume: 0.84, pan: -0.24 }, lead: { volume: 0.88, pan: 0.24, sendA: 0.2 } } },
  "free-jazz": { category: "Jazz/Blues", loudnessTrimDb: -8.21, overrides: { kick: { volume: 0.68, sendA: 0.14 }, snare: { volume: 0.74, sendA: 0.16 }, hihat: { volume: 0.6, sendA: 0.14 }, percussion: { volume: 0.68, pan: 0.26 }, bass: { volume: 0.96 }, chords: { volume: 0.74, sendA: 0.2 }, lead: { volume: 0.84, sendA: 0.2 } } },
  "gypsy-jazz": { category: "Jazz/Blues", loudnessTrimDb: -4.44, overrides: { kick: { volume: 0.58 }, snare: { volume: 0.6, sendA: 0.12 }, hihat: { volume: 0.5 }, percussion: { volume: 0.44 }, bass: { volume: 0.94 }, chords: { volume: 0.9, pan: -0.24, sendA: 0.18 }, lead: { volume: 0.88, pan: 0.24, sendA: 0.18 } } },
  "hard-bop": { category: "Jazz/Blues", loudnessTrimDb: -4.17, overrides: { kick: { volume: 0.7, sendA: 0.1 }, snare: { volume: 0.78, sendA: 0.12 }, hihat: { volume: 0.6 }, bass: { volume: 0.96 }, chords: { volume: 0.8, sendA: 0.16 }, lead: { volume: 0.85, sendA: 0.18 } } },
  "jazz-fusion": { category: "Jazz/Blues", loudnessTrimDb: -8.13, overrides: { kick: { volume: 0.86 }, snare: { volume: 0.84, sendA: 0.12 }, bass: { volume: 0.97 }, chords: { volume: 0.84, pan: -0.22, sendA: 0.14 }, lead: { volume: 0.82, pan: 0.22, sendA: 0.16 } } },
  "modal-jazz": { category: "Jazz/Blues", loudnessTrimDb: -4.09, overrides: { kick: { volume: 0.6 }, snare: { volume: 0.64, sendA: 0.12 }, hihat: { volume: 0.58 }, bass: { volume: 0.96 }, chords: { volume: 0.84, sendA: 0.18 }, lead: { volume: 0.78, sendA: 0.18 } } },
  "smooth-jazz": { category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.6 }, snare: { volume: 0.56, sendA: 0.16 }, hihat: { volume: 0.5 }, percussion: { volume: 0.5, pan: 0.3 }, bass: { volume: 0.9 }, chords: { volume: 0.84, sendA: 0.24 }, lead: { volume: 0.8, sendA: 0.24 } } },
  "texas-blues": { category: "Jazz/Blues", loudnessTrimDb: -3.52, overrides: { kick: { volume: 0.8 }, snare: { volume: 0.8, sendA: 0.14 }, bass: { volume: 0.92 }, chords: { volume: 0.8, pan: -0.22 }, lead: { volume: 0.9, pan: 0.22, sendA: 0.2 } } },
  "traditional-jazz": { category: "Jazz/Blues", loudnessTrimDb: -5.39, overrides: { kick: { volume: 0.66 }, snare: { volume: 0.72, sendA: 0.14 }, hihat: { volume: 0.52 }, percussion: { volume: 0.58, pan: 0.28 }, bass: { volume: 0.94 }, chords: { volume: 0.84, sendA: 0.18 }, lead: { volume: 0.8, sendA: 0.18 } } },

  // -------------------------------------------------------------- Latin/World
  "afrobeat": { category: "Latin/World", loudnessTrimDb: -2.24, overrides: { snare: { volume: 0.7 }, percussion: { volume: 0.96, pan: -0.44, sendB: 0.2 }, bass: { volume: 0.9 }, chords: { volume: 0.76, pan: 0.18 }, lead: { volume: 0.74 } } },
  "amapiano": { category: "Latin/World", loudnessTrimDb: 0, overrides: { kick: { volume: 0.86 }, percussion: { volume: 0.88, pan: -0.36 }, bass: { volume: 0.94 }, chords: { volume: 0.82, sendA: 0.2 }, lead: { volume: 0.74, sendA: 0.2 } } },
  "bachata": { category: "Latin/World", loudnessTrimDb: -0.21, overrides: { kick: { volume: 0.78 }, snare: { volume: 0.68 }, percussion: { volume: 0.9, pan: -0.4 }, bass: { volume: 0.86 }, chords: { volume: 0.68 }, lead: { volume: 0.82, pan: 0.18, sendA: 0.2 } } },
  "bossa-nova": { category: "Latin/World", loudnessTrimDb: 0, overrides: { kick: { volume: 0.5 }, snare: { volume: 0.46, sendA: 0.12 }, hihat: { volume: 0.48 }, percussion: { volume: 0.72, pan: -0.3 }, bass: { volume: 0.9 }, chords: { volume: 0.9, pan: 0.18, sendA: 0.22 }, lead: { volume: 0.8, sendA: 0.22 }, fx: { volume: 0.2 } } },
  "cumbia": { category: "Latin/World", loudnessTrimDb: 0, overrides: { percussion: { volume: 0.94, pan: -0.42 }, bass: { volume: 0.88 }, chords: { volume: 0.76, pan: 0.18 }, lead: { volume: 0.74 } } },
  "dancehall": { category: "Latin/World", loudnessTrimDb: 0, overrides: { kick: { volume: 0.9 }, bass: { volume: 0.97 }, percussion: { volume: 0.84, pan: -0.38, sendB: 0.2 }, chords: { volume: 0.68, sendA: 0.16 } } },
  "kuduro": { category: "Latin/World", loudnessTrimDb: -0.17, overrides: { kick: { volume: 0.92 }, percussion: { volume: 0.98, pan: -0.44, sendB: 0.22 }, bass: { volume: 0.94 } } },
  "reggae": { category: "Latin/World", loudnessTrimDb: 0, overrides: { kick: { volume: 0.76 }, snare: { volume: 0.52, sendA: 0.2 }, hihat: { volume: 0.44 }, percussion: { volume: 0.6 }, bass: { volume: 1.0 }, chords: { volume: 0.84, sendA: 0.3 }, lead: { volume: 0.6, sendA: 0.26 }, fx: { volume: 0.3, sendA: 0.24 } } },
  "reggaeton": { category: "Latin/World", loudnessTrimDb: 0, overrides: { kick: { volume: 0.94 }, snare: { volume: 0.68 }, percussion: { volume: 0.9, pan: -0.42 }, bass: { volume: 0.96 }, lead: { volume: 0.74 } } },
  "salsa": { category: "Latin/World", loudnessTrimDb: 0, overrides: { kick: { volume: 0.7 }, snare: { volume: 0.66 }, percussion: { volume: 1.0, pan: -0.42, sendA: 0.16, sendB: 0.18 }, bass: { volume: 0.94 }, chords: { volume: 0.76, pan: 0.2 }, lead: { volume: 0.8, sendA: 0.18 } } },
  "samba": { category: "Latin/World", loudnessTrimDb: -0.41, overrides: { percussion: { volume: 1.0, pan: -0.44, sendB: 0.2 }, bass: { volume: 0.9 }, chords: { volume: 0.74, pan: 0.2 }, lead: { volume: 0.78 } } },

  // ------------------------------------------------------------------ Pop/R&B
  "alternative-rnb": { category: "Pop/R&B", loudnessTrimDb: 0, overrides: { kick: { volume: 0.8 }, hihat: { volume: 0.52, pan: -0.3 }, bass: { volume: 0.95 }, chords: { volume: 0.86, sendA: 0.3 }, lead: { volume: 0.88, sendA: 0.3 } } },
  "city-pop": { category: "Pop/R&B", loudnessTrimDb: -3.31, overrides: { snare: { volume: 0.86, sendA: 0.16 }, bass: { volume: 0.9 }, chords: { volume: 0.8, pan: -0.26, sendA: 0.2 }, lead: { volume: 0.84, pan: 0.26, sendA: 0.2 } } },
  "contemporary-rnb": { category: "Pop/R&B", loudnessTrimDb: 0, overrides: { kick: { volume: 0.92 }, snare: { volume: 0.7 }, hihat: { volume: 0.7, pan: -0.34 }, bass: { volume: 0.97 }, lead: { volume: 0.92, sendA: 0.22 } } },
  "disco": { category: "Pop/R&B", loudnessTrimDb: -6.46, overrides: { snare: { volume: 0.86, sendA: 0.16 }, hihat: { volume: 0.7, pan: -0.28, sendB: 0.16 }, percussion: { volume: 0.8, pan: 0.4, sendB: 0.22 }, bass: { volume: 0.94 }, chords: { volume: 0.8, pan: -0.24, sendA: 0.2 }, lead: { volume: 0.82, pan: 0.24, sendA: 0.2 } } },
  "eurodance": { category: "Pop/R&B", loudnessTrimDb: -8.12, overrides: { kick: { volume: 0.96 }, bass: { volume: 0.94 }, chords: { volume: 0.82, sendA: 0.22 }, lead: { volume: 0.92, sendA: 0.24 }, fx: { volume: 0.72 } } },
  "funk": { category: "Pop/R&B", loudnessTrimDb: -0.02, overrides: { kick: { volume: 0.94 }, snare: { volume: 0.9 }, hihat: { volume: 0.74 }, percussion: { volume: 0.76, pan: 0.38 }, bass: { volume: 0.98 }, chords: { volume: 0.74, pan: -0.22 }, lead: { volume: 0.78, pan: 0.22 } } },
  "j-pop": { category: "Pop/R&B", loudnessTrimDb: -0.05, overrides: { kick: { volume: 0.92 }, snare: { volume: 0.86 }, hihat: { volume: 0.72 }, bass: { volume: 0.92 }, chords: { volume: 0.8, sendA: 0.18 }, lead: { volume: 0.94, sendA: 0.2 }, fx: { volume: 0.7 } } },
  "k-pop": { category: "Pop/R&B", loudnessTrimDb: -8.83, overrides: { kick: { volume: 0.94 }, snare: { volume: 0.88 }, bass: { volume: 0.94 }, lead: { volume: 0.94, sendA: 0.2 }, fx: { volume: 0.74 } } },
  "motown": { category: "Pop/R&B", loudnessTrimDb: -3.38, overrides: { kick: { volume: 0.76 }, snare: { volume: 0.78, sendA: 0.16 }, hihat: { volume: 0.56 }, percussion: { volume: 0.72, pan: 0.36 }, bass: { volume: 0.94 }, chords: { volume: 0.76, sendA: 0.16 }, lead: { volume: 0.92, pan: 0.1, sendA: 0.22 } } },
  "neo-soul": { category: "Pop/R&B", loudnessTrimDb: 0, overrides: { kick: { volume: 0.78 }, snare: { volume: 0.72, sendA: 0.14 }, hihat: { volume: 0.54, pan: -0.26 }, bass: { volume: 0.95 }, chords: { volume: 0.88, pan: -0.18, sendA: 0.24 }, lead: { volume: 0.9, sendA: 0.26 } } },
  "soul": { category: "Pop/R&B", loudnessTrimDb: 0, overrides: { kick: { volume: 0.78 }, snare: { volume: 0.78, sendA: 0.16 }, hihat: { volume: 0.58 }, percussion: { volume: 0.7, pan: 0.36 }, bass: { volume: 0.94 }, chords: { volume: 0.78, sendA: 0.16 }, lead: { volume: 0.94, sendA: 0.24 } } },
  "synth-pop": { category: "Pop/R&B", loudnessTrimDb: -7.5, overrides: { kick: { volume: 0.9 }, bass: { volume: 0.9 }, chords: { volume: 0.82, pan: -0.24, sendA: 0.18 }, lead: { volume: 0.9, pan: 0.2, sendA: 0.2 } } },
  "traditional-pop": { category: "Pop/R&B", loudnessTrimDb: -5.05, overrides: { kick: { volume: 0.66 }, snare: { volume: 0.62, sendA: 0.16 }, hihat: { volume: 0.48 }, percussion: { volume: 0.5 }, bass: { volume: 0.86 }, chords: { volume: 0.78, sendA: 0.2 }, lead: { volume: 0.94, sendA: 0.26 }, fx: { volume: 0.24 } } },

  // --------------------------------------------------------------- Rock/Metal
  "alternative-rock": { category: "Rock/Metal", loudnessTrimDb: 0, overrides: { snare: { volume: 0.88, sendA: 0.18 }, chords: { volume: 0.88 }, lead: { volume: 0.8 } } },
  "black-metal": { category: "Rock/Metal", loudnessTrimDb: 1.26, overrides: { kick: { volume: 0.96 }, snare: { volume: 0.94 }, hihat: { volume: 0.72 }, chords: { volume: 0.84, sendA: 0.14 }, lead: { volume: 0.78 } } },
  "blues-rock": { category: "Rock/Metal", loudnessTrimDb: 0, overrides: { kick: { volume: 0.88 }, snare: { volume: 0.88, sendA: 0.16 }, bass: { volume: 0.9 }, chords: { volume: 0.84 }, lead: { volume: 0.9, sendA: 0.18 } } },
  "death-metal": { category: "Rock/Metal", loudnessTrimDb: 0.88, overrides: { kick: { volume: 1.0 }, snare: { volume: 0.95 }, chords: { volume: 0.88, pan: -0.5 }, lead: { volume: 0.8, pan: 0.5 } } },
  "doom-metal": { category: "Rock/Metal", loudnessTrimDb: 0, overrides: { kick: { volume: 0.92 }, snare: { volume: 0.84, sendA: 0.26 }, bass: { volume: 0.98 }, chords: { volume: 0.9, sendA: 0.2 }, lead: { volume: 0.76, sendA: 0.22 } } },
  "grunge": { category: "Rock/Metal", loudnessTrimDb: -1.09, overrides: { kick: { volume: 0.88 }, snare: { volume: 0.9, sendA: 0.18 }, chords: { volume: 0.88 }, lead: { volume: 0.78 } } },
  "hard-rock": { category: "Rock/Metal", loudnessTrimDb: -1.93, overrides: { kick: { volume: 0.94 }, snare: { volume: 0.94, sendA: 0.16 }, chords: { volume: 0.9 }, lead: { volume: 0.88, sendA: 0.18 } } },
  "heavy-metal": { category: "Rock/Metal", loudnessTrimDb: -0.06, overrides: { kick: { volume: 0.96 }, snare: { volume: 0.93 }, chords: { volume: 0.9, pan: -0.5 }, lead: { volume: 0.84, pan: 0.5 } } },
  "math-rock": { category: "Rock/Metal", loudnessTrimDb: -1.27, overrides: { snare: { volume: 0.86, sendA: 0.12 }, chords: { volume: 0.88, pan: -0.4 }, lead: { volume: 0.86, pan: 0.4 }, fx: { volume: 0.36 } } },
  "metalcore": { category: "Rock/Metal", loudnessTrimDb: 2.07, overrides: { kick: { volume: 1.0 }, snare: { volume: 0.94 }, bass: { volume: 0.94 }, chords: { volume: 0.9, pan: -0.5 }, lead: { volume: 0.82, pan: 0.5 } } },
  "new-wave": { category: "Rock/Metal", loudnessTrimDb: -2.66, overrides: { kick: { volume: 0.86 }, snare: { volume: 0.84, sendA: 0.2 }, bass: { volume: 0.92 }, chords: { volume: 0.82, sendA: 0.16 }, lead: { volume: 0.84, sendA: 0.18 } } },
  "post-punk": { category: "Rock/Metal", loudnessTrimDb: -1.23, overrides: { kick: { volume: 0.88 }, snare: { volume: 0.86, sendA: 0.2 }, bass: { volume: 0.96 }, chords: { volume: 0.82, sendA: 0.18 }, lead: { volume: 0.76, sendA: 0.2 } } },
  "progressive-rock": { category: "Rock/Metal", loudnessTrimDb: -0.31, overrides: { snare: { volume: 0.84, sendA: 0.16 }, bass: { volume: 0.9 }, chords: { volume: 0.84, pan: -0.38 }, lead: { volume: 0.82, pan: 0.38 }, fx: { volume: 0.44 } } },
  "punk-rock": { category: "Rock/Metal", loudnessTrimDb: -0.18, overrides: { kick: { volume: 0.94 }, snare: { volume: 0.96 }, bass: { volume: 0.9 }, chords: { volume: 0.9, pan: -0.42 }, lead: { volume: 0.8, pan: 0.42 } } },
  "rock-and-roll": { category: "Rock/Metal", loudnessTrimDb: -1.69, overrides: { kick: { volume: 0.8 }, snare: { volume: 0.86, sendA: 0.18 }, hihat: { volume: 0.56 }, bass: { volume: 0.9 }, chords: { volume: 0.84, pan: -0.35 }, lead: { volume: 0.86, pan: 0.35, sendA: 0.18 } } },
  "shoe-gaze": { category: "Rock/Metal", loudnessTrimDb: -0.36, overrides: { kick: { volume: 0.78 }, snare: { volume: 0.74, sendA: 0.28 }, bass: { volume: 0.94 }, chords: { volume: 0.94, sendA: 0.3 }, lead: { volume: 0.82, sendA: 0.32 }, fx: { volume: 0.46, sendA: 0.28 } } },
  "thrash-metal": { category: "Rock/Metal", loudnessTrimDb: -0.12, overrides: { kick: { volume: 0.98 }, snare: { volume: 0.96 }, hihat: { volume: 0.76 }, chords: { volume: 0.88, pan: -0.48 }, lead: { volume: 0.82, pan: 0.48 } } },
};

const DEFAULT_TRACK_MIX: TrackMix = { volume: 0.8, pan: 0, sendA: 0, sendB: 0 };

function resolveTrackMix(genreMix: GenreMix, trackId: MixTrackId): TrackMix {
  const base = CATEGORY_MIX_PROFILES[genreMix.category] ?? CATEGORY_MIX_PROFILES.Electronic;
  const baseTrack = base[trackId] ?? DEFAULT_TRACK_MIX;
  const override = genreMix.overrides?.[trackId];
  if (!override) return { ...baseTrack };
  return {
    volume: override.volume ?? baseTrack.volume,
    pan: override.pan ?? baseTrack.pan,
    sendA: override.sendA ?? baseTrack.sendA,
    sendB: override.sendB ?? baseTrack.sendB,
  };
}

/**
 * Flattened `category base + per-genre overrides` table for every known genre id.
 * This is the "resolved per-genre values" view.
 */
export const GENRE_MIX_RESOLVED: Record<string, ResolvedGenreMix> = Object.fromEntries(
  Object.entries(GENRE_MIX).map(([genreId, genreMix]) => [
    genreId,
    Object.fromEntries(
      MIX_TRACK_IDS.map((trackId) => [trackId, resolveTrackMix(genreMix, trackId)])
    ) as ResolvedGenreMix,
  ])
);

/** Resolves one genre's full 8-track mix, or `null` for an unknown/custom genre id. */
export function resolveGenreMix(genreId: string | undefined | null): ResolvedGenreMix | null {
  if (!genreId) return null;
  return GENRE_MIX_RESOLVED[genreId] ?? null;
}

/** Loudness trim for a genre; unknown/custom genre ids deliberately get 0 dB. */
export function getGenreLoudnessTrimDb(genreId: string | undefined | null): number {
  if (!genreId) return 0;
  const entry = GENRE_MIX[genreId];
  if (!entry || !Number.isFinite(entry.loudnessTrimDb)) return 0;
  return Math.max(LOUDNESS_TRIM_MIN_DB, Math.min(LOUDNESS_TRIM_MAX_DB, entry.loudnessTrimDb));
}

/** Maps a sequencer track onto one of the eight mix roles, or `null` if it has none. */
export function resolveMixTrackId(track: Pick<SequencerTrack, "track_id" | "name">): MixTrackId | null {
  const id = (track.track_id || "").toLowerCase();
  if ((MIX_TRACK_IDS as readonly string[]).includes(id)) return id as MixTrackId;

  const name = (track.name || "").toLowerCase();
  if (name.includes("kick")) return "kick";
  if (name.includes("snare") || name.includes("clap")) return "snare";
  if (name.includes("hat")) return "hihat";
  if (name.includes("perc") || name.includes("shaker") || name.includes("rim")) return "percussion";
  if (name.includes("bass")) return "bass";
  if (name.includes("chord") || name.includes("pad") || name.includes("organ")) return "chords";
  if (name.includes("lead") || name.includes("melod")) return "lead";
  if (name.includes("fx") || name.includes("sweep") || name.includes("riser")) return "fx";
  return null;
}

/** Shallow pattern copy with fresh per-track arrays (mirrors the store's clonePattern). */
function copyPatternTracks(pattern: SequencerPattern): SequencerPattern {
  return {
    ...pattern,
    tracks: pattern.tracks.map((track) => ({
      ...track,
      steps: [...track.steps],
      velocity: track.velocity ? [...track.velocity] : undefined,
      pitch: track.pitch ? [...track.pitch] : undefined,
      gate: track.gate ? [...track.gate] : undefined,
      ratchet: track.ratchet ? [...track.ratchet] : undefined,
      probability: track.probability ? [...track.probability] : undefined,
    })),
  };
}

/**
 * Seeds a pattern's per-track `volume`/`pan`/`sendA`/`sendB` from the genre mix
 * table. Returns a fresh copy and never mutates its argument.
 *
 * Unknown ids (custom genres, imported/URL-shared patterns, masterclasses and the
 * compare view's merged composite) keep the pattern's own values untouched, so a
 * user's custom mix is never clobbered. Call this at *genre entry* points only —
 * never from `setPattern`, which also runs for every studio/console edit.
 */
export function applyGenreMixDefaults(pattern: SequencerPattern, genreId?: string): SequencerPattern {
  const resolved = resolveGenreMix(genreId ?? pattern.genre_id);
  const copy = copyPatternTracks(pattern);
  if (!resolved) return copy;

  return {
    ...copy,
    tracks: copy.tracks.map((track) => {
      const role = resolveMixTrackId(track);
      if (!role) return track;
      const mix = resolved[role];
      return { ...track, volume: mix.volume, pan: mix.pan, sendA: mix.sendA, sendB: mix.sendB };
    }),
  };
}

/**
 * The one helper every genre-entry site must use: clone a genre's pattern with the
 * genre's arranged mix applied. `clonePattern` itself is deliberately left alone
 * because it also backs slot copies and undo, where the user's values must survive.
 */
export function patternFromGenre(genre: Pick<Genre, "id" | "sequencer_pattern"> & { common_chords?: string[] }): SequencerPattern {
  const mixed = applyGenreMixDefaults(genre.sequencer_pattern, genre.id);
  // The authored pattern is a **progression skeleton**: one root per step on the chords track and
  // one loop of steps for everything else. This is where it becomes music — the genre's chords are
  // written as real note stacks with the genre's own lengths and articulation, the phrase rules
  // shape the other tracks, and the pattern grows to whatever length the progression needs (a
  // 4-bar progression at 1/16 is 64 steps, an 8-bar one 128).
  //
  // A track the genre leaves silent stays silent: nothing here invents content for an `fx` part a
  // genre does not use.
  const category = (GENRE_INDEX_MAP[genre.id]?.category ?? undefined) as GenreCategory | undefined;
  return expandGenrePattern(mixed, resolveGenreExpression(genre.id, category), {
    commonChords: genre.common_chords,
  });
}

/**
 * The pre-feature placeholder mix that all 159 genres shipped with — one identical
 * tuple for every track, and no sends at all. Exported so the "did the user ever
 * touch this channel?" discriminator is testable instead of being a literal buried
 * in the migration code.
 */
export const LEGACY_PLACEHOLDER_MIX: ResolvedGenreMix = {
  kick: { volume: 0.9, pan: 0.0, sendA: 0, sendB: 0 },
  snare: { volume: 0.85, pan: 0.0, sendA: 0, sendB: 0 },
  hihat: { volume: 0.7, pan: -0.2, sendA: 0, sendB: 0 },
  percussion: { volume: 0.65, pan: 0.25, sendA: 0, sendB: 0 },
  bass: { volume: 0.9, pan: 0.0, sendA: 0, sendB: 0 },
  chords: { volume: 0.75, pan: 0.0, sendA: 0, sendB: 0 },
  lead: { volume: 0.8, pan: 0.1, sendA: 0, sendB: 0 },
  fx: { volume: 0.6, pan: 0.0, sendA: 0, sendB: 0 },
};

/**
 * True when a track still carries the untouched placeholder mix.
 *
 * Exact float equality is intentional: the placeholder reached storage through a
 * JSON round-trip of these same decimal literals, so it comes back bit-identical.
 * A track whose volume, pan or either send differs in any way was moved by the user
 * (or by a future default) and must be left alone.
 */
export function isLegacyPlaceholderTrackMix(
  track: Pick<SequencerTrack, "track_id" | "name" | "volume" | "pan" | "sendA" | "sendB">
): boolean {
  const role = resolveMixTrackId(track);
  if (!role) return false;
  const legacy = LEGACY_PLACEHOLDER_MIX[role];
  return (
    track.volume === legacy.volume &&
    track.pan === legacy.pan &&
    (track.sendA ?? 0) === 0 &&
    (track.sendB ?? 0) === 0
  );
}

/**
 * Non-destructive migration for patterns that were persisted *before* the arranged
 * mix existed (the localStorage session snapshot in `createInitialSequencerState`).
 *
 * Per track, not per pattern: a channel still sitting on the legacy placeholder was
 * never touched by the user, so it is re-seeded from `GENRE_MIX_RESOLVED`; a channel
 * the user moved keeps its saved values exactly. Unknown/custom genre ids migrate
 * nothing, and the input is never mutated.
 *
 * Deliberately NOT applied to IndexedDB projects (`projectDb`) or imported `.groove`
 * packages: those are user-authored artefacts whose saved mix may be deliberate, and
 * rewriting stored projects is far more invasive than migrating the session snapshot
 * that the app rewrites automatically on every session anyway. That decision is
 * recorded in the branch notes rather than left implicit.
 */
export function migrateLegacyPlaceholderMix(
  pattern: SequencerPattern,
  genreId?: string
): SequencerPattern {
  const resolved = resolveGenreMix(genreId ?? pattern.genre_id);
  const copy = copyPatternTracks(pattern);
  if (!resolved) return copy;

  return {
    ...copy,
    tracks: copy.tracks.map((track) => {
      const role = resolveMixTrackId(track);
      if (!role || !isLegacyPlaceholderTrackMix(track)) return track;
      const mix = resolved[role];
      return { ...track, volume: mix.volume, pan: mix.pan, sendA: mix.sendA, sendB: mix.sendB };
    }),
  };
}
