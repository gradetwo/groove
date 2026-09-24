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
import { humaniseVelocity, patternSeed } from "../audio/noteEvents";
import { applyGrooveTexture } from "./genreGroove";
import { applyMidRangeFill } from "./genreMid";

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

/**
 * P0.2 — how much a lane's velocities move, as a fraction of `HUMANISE_MAX_VELOCITY`.
 *
 * This is the *performance* half of the mix: the profiles above decide how loud each
 * lane is, these decide how much it breathes. A category default carries all 159 genres;
 * the handful of entries below that declare `humanise` step away from it, each with its
 * reason inline (same layering rule as `overrides`).
 *
 * Calibrated so a 16-step lane lands at ±1..5 MIDI steps: enough that "all 100s" stops
 * being true, small enough that the loop does not sound like it is drifting.
 */
export const HUMANISE_BY_CATEGORY: Record<GenreCategory, number> = {
  // Drum machines are tight by design; the movement in club music comes from arrangement.
  Electronic: 0.18,
  // Swung, hand-played hats and claps over a kick that stays close to the grid.
  "Hip Hop": 0.24,
  // The idiom *is* dynamic variation — brushes, horns and comping live between values.
  "Jazz/Blues": 0.34,
  // Live percussion is the lead voice, so its dynamics carry the groove.
  "Latin/World": 0.3,
  // Programmed but not sterile; the topline is mixed even and stays that way.
  "Pop/R&B": 0.2,
  // A real drummer hits the backbeat harder; the double-kick stays tight via the scale.
  "Rock/Metal": 0.26,
};

/**
 * Per-lane scale on top of the genre amount.
 *
 * The kick and the bass are deliberately the quietest lanes: their level is the mix's
 * low-end anchor (and the kick drives the sidechain), so a wandering one changes the
 * balance of the whole track rather than adding feel. Hats and percussion are the
 * opposite — they are where a human hand is most audible.
 */
export const HUMANISE_TRACK_SCALE: Record<MixTrackId, number> = {
  kick: 0.35,
  snare: 0.95,
  hihat: 1.1,
  percussion: 1.15,
  bass: 0.5,
  chords: 0.85,
  lead: 1.0,
  fx: 0.7,
};

/** One genre's kick/bass sidechain: how deep, and how long it takes to come back. */
export interface DuckSetting {
  /** Peak depth of the duck, in dB below unity. */
  duckDb: number;
  /** Time from the onset back to unity gain, in ms. */
  releaseMs: number;
}

/** Bounds the table cannot escape; the resolver clamps into them, the tests pin them. */
export const DUCK_DB_MIN = 0;
export const DUCK_DB_MAX = 12;
export const DUCK_RELEASE_MIN_MS = 20;
export const DUCK_RELEASE_MAX_MS = 600;

/**
 * P0.3 — sidechain depth and release per category.
 *
 * Measured through the app's own offline path, the old formula dipped the bass by at most 0.25 dB
 * (deepest single onset −1.8 dB), which is why the listening report heard "no sidechain at all".
 * The depth here is the *product promise* (a kick that clears the bass — the gate asserts 3 dB or
 * more in the 5–25 ms after the onset, and every entry is chosen to measure 4–6 dB), and the release
 * is the genre character: a club kick that breathes, an ambient pulse that swells.
 */
export const DUCK_BY_CATEGORY: Record<GenreCategory, DuckSetting> = {
  // Four-on-the-floor: the classic breath between kicks, one duck per kick.
  Electronic: { duckDb: 6, releaseMs: 130 },
  // 808s are the bass and the kick at once, so the duck is what keeps them from fighting.
  "Hip Hop": { duckDb: 6.5, releaseMs: 140 },
  // An upright bass in a small room: a gentle duck, because the players already stay out of each other's way —
  // but still one the gate can measure in its 5 ms window (the window reads ~1 dB shallower than the depth).
  "Jazz/Blues": { duckDb: 5, releaseMs: 105 },
  // Live percussion over a polite kick; the bass is the anchor, so it comes back quickly.
  "Latin/World": { duckDb: 5, releaseMs: 120 },
  // Programmed but not pumping: medium depth, medium release.
  "Pop/R&B": { duckDb: 5.5, releaseMs: 125 },
  // A real kick and a picked bass in the same register — the deepest duck outside the club genres.
  "Rock/Metal": { duckDb: 6, releaseMs: 130 },
};

/**
 * Fallback for custom/unknown genres.
 *
 * The sidechain is the kick/bass relationship rather than a genre taste, so unlike the mix and the
 * humanisation this is *not* left untouched for a custom genre — it gets the neutral setting.
 */
export const DEFAULT_DUCK: DuckSetting = { duckDb: 5, releaseMs: 120 };

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
  /**
   * P0.2 velocity-humanisation amount for this genre; defaults to
   * `HUMANISE_BY_CATEGORY[category]`. Present only for genres whose production style
   * really is machine-locked or fully hand-played.
   */
  humanise?: number;
  /**
   * P0.3 kick/bass sidechain override; unset fields inherit
   * `DUCK_BY_CATEGORY[category]`. Present only where the genre's own tempo or idiom
   * makes the category's release wrong (a 170 BPM kick cannot breathe for 130 ms).
   */
  duck?: Partial<DuckSetting>;
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
  "acid-house": { category: "Electronic", loudnessTrimDb: -2.38 },
  "acid-techno": { category: "Electronic", loudnessTrimDb: -1.14 },
  "afro-house": { category: "Electronic", loudnessTrimDb: 0, overrides: { percussion: { volume: 0.8, pan: -0.45, sendB: 0.26 } } },
  "ambient": { humanise: 0.45, category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.5, sendA: 0.2 }, snare: { volume: 0.42, sendA: 0.22 }, hihat: { volume: 0.38, pan: -0.34 }, percussion: { volume: 0.34 }, bass: { volume: 0.78 }, chords: { volume: 0.92, sendA: 0.38 }, lead: { volume: 0.68, sendA: 0.34 }, fx: { volume: 0.24, sendA: 0.3 } }, duck: { duckDb: 4, releaseMs: 280 } }, // almost nothing here is on the grid; the pads are played and breathe · there is no pumping here — a slow swell under a rare kick
  "ambient-dub": { humanise: 0.42, category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.62 }, snare: { volume: 0.5, sendA: 0.2 }, hihat: { volume: 0.44, sendB: 0.24 }, bass: { volume: 0.9, sendA: 0.04 }, chords: { volume: 0.86, sendA: 0.36 }, lead: { volume: 0.6, sendA: 0.34 }, fx: { volume: 0.3, sendA: 0.26 } }  }, // dub mixing and hand-played keys over a slow pulse
  "ambient-techno": { humanise: 0.3, category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.58 }, snare: { volume: 0.5 }, hihat: { volume: 0.46 }, percussion: { volume: 0.44 }, chords: { volume: 0.88, sendA: 0.32 }, lead: { volume: 0.66, sendA: 0.3 }, fx: { volume: 0.32, sendA: 0.24 } }, duck: { duckDb: 5, releaseMs: 240 } }, // the ambient side dominates: sparse, patient playing · sparse kicks, so the duck can breathe for longer
  "bass-house": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.97 }, bass: { volume: 0.97 } } },
  "bassline": { category: "Electronic", loudnessTrimDb: 0, overrides: { bass: { volume: 0.96 } } },
  "big-beat": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.97 }, snare: { volume: 0.9, sendA: 0.16 }, chords: { volume: 0.8, pan: -0.4 } } },
  "breakbeat": { category: "Electronic", loudnessTrimDb: 0, overrides: { snare: { volume: 0.9, sendA: 0.14 }, percussion: { volume: 0.78, pan: 0.45 } } },
  "breakcore": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, snare: { volume: 0.95 }, hihat: { volume: 0.82 }, percussion: { volume: 0.8 } } },
  "brooklyn-drill": { humanise: 0.12, category: "Electronic", loudnessTrimDb: 0, overrides: { hihat: { volume: 0.8, pan: -0.4, sendB: 0.18 }, bass: { volume: 0.97 }, lead: { volume: 0.62 } }  }, // drill hats are hyper-programmed; variation reads as sloppiness
  "brostep": { humanise: 0.12, category: "Electronic", loudnessTrimDb: -0.38, overrides: { kick: { volume: 0.98 }, bass: { volume: 0.98, sendA: 0.0 } }  }, // see dubstep
  "chicago-drill": { category: "Electronic", loudnessTrimDb: 0, overrides: { hihat: { volume: 0.8, pan: -0.38 }, bass: { volume: 0.97 }, chords: { volume: 0.6 } } },
  "chicago-house": { category: "Electronic", loudnessTrimDb: 0, overrides: { snare: { volume: 0.86, sendA: 0.14 }, chords: { volume: 0.78, sendA: 0.18 } } },
  "chillstep": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.78 }, snare: { volume: 0.6, sendA: 0.22 }, hihat: { volume: 0.6 }, bass: { volume: 0.92 }, chords: { volume: 0.84, sendA: 0.3 }, lead: { volume: 0.72, sendA: 0.28 } } },
  "chillwave": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.62 }, snare: { volume: 0.5 }, hihat: { volume: 0.5, pan: -0.28 }, bass: { volume: 0.84 }, chords: { volume: 0.9, sendA: 0.34 }, lead: { volume: 0.74, sendA: 0.3 }, fx: { volume: 0.3 } } },
  "chiptune": { humanise: 0.07, category: "Electronic", loudnessTrimDb: 0, overrides: { hihat: { volume: 0.8 }, lead: { volume: 0.88, pan: 0.1 }, chords: { volume: 0.78 }, fx: { volume: 0.5 } }  }, // trackers are grid-locked and the chips have no velocity to speak of
  "deathstep": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, bass: { volume: 0.98 }, snare: { volume: 0.7 } } },
  "deep-house": { category: "Electronic", loudnessTrimDb: 0, overrides: { hihat: { volume: 0.62, sendB: 0.2 }, bass: { volume: 0.94 }, chords: { volume: 0.82, sendA: 0.2 }, lead: { volume: 0.68 } } },
  "detroit-techno": { category: "Electronic", loudnessTrimDb: 0, overrides: { chords: { volume: 0.8, pan: -0.18, sendA: 0.2 }, lead: { volume: 0.74 } } },
  "downtempo": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.78 }, snare: { volume: 0.66, sendA: 0.18 }, hihat: { volume: 0.6 }, bass: { volume: 0.9 }, chords: { volume: 0.84, sendA: 0.26 }, lead: { volume: 0.72, sendA: 0.24 }, fx: { volume: 0.36 } } },
  "dream-trance": { category: "Electronic", loudnessTrimDb: 0, overrides: { lead: { volume: 0.88, sendA: 0.3 }, chords: { volume: 0.84, sendA: 0.3 } } },
  "drift-phonk": { humanise: 0.08, category: "Electronic", loudnessTrimDb: -0.03, overrides: { kick: { volume: 1.0 }, bass: { volume: 0.98 } }  }, // phonk is deliberately flat and loud — that is the aesthetic
  "dub": { humanise: 0.4, category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.8 }, snare: { volume: 0.56, sendA: 0.24 }, hihat: { volume: 0.46, sendB: 0.26 }, bass: { volume: 0.98 }, chords: { volume: 0.82, sendA: 0.34 }, lead: { volume: 0.6, sendA: 0.34 }, fx: { volume: 0.34, sendA: 0.3 } }, duck: { duckDb: 7, releaseMs: 200 } }, // a real drummer, and the mix is the instrument · dub is built on a deep, slow sidechain; the swell is the genre
  "dubstep": { humanise: 0.12, category: "Electronic", loudnessTrimDb: 0.49, overrides: { kick: { volume: 0.98 }, snare: { volume: 0.72 }, bass: { volume: 0.99 }, chords: { volume: 0.6 }, lead: { volume: 0.64 }, fx: { volume: 0.6 } }  }, // the dynamics live in the sound design, not in the lane levels
  "dub-techno": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.72 }, snare: { volume: 0.6, sendA: 0.24 }, hihat: { volume: 0.5, sendB: 0.24 }, bass: { volume: 0.96 }, chords: { volume: 0.86, sendA: 0.34 }, fx: { volume: 0.36, sendA: 0.28 } } },
  "edm-trap": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, bass: { volume: 0.98 }, hihat: { volume: 0.82, pan: -0.38 }, lead: { volume: 0.8, sendA: 0.22 } } },
  "electro": { category: "Electronic", loudnessTrimDb: 0, overrides: { snare: { volume: 0.9 }, bass: { volume: 0.94 }, chords: { volume: 0.64 } } },
  "electro-house": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, lead: { volume: 0.86, pan: 0.18 } } },
  "euro-trance": { category: "Electronic", loudnessTrimDb: -3.35, overrides: { lead: { volume: 0.9, sendA: 0.26 }, chords: { volume: 0.8, sendA: 0.28 }, fx: { volume: 0.72 } } },
  "footwork": { humanise: 0.12, category: "Electronic", loudnessTrimDb: -2.71, overrides: { kick: { volume: 0.98 }, snare: { volume: 0.8 }, hihat: { volume: 0.84, pan: -0.38 }, percussion: { volume: 0.8 } }, duck: { duckDb: 6.5, releaseMs: 80 } }, // at 160 BPM any humanisation reads as a mistake, not as feel · 160 BPM footwork: punch, not a swell
  "frenchcore": { humanise: 0.07, category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 1.0 }, lead: { volume: 0.72 }, fx: { volume: 0.5 } }, duck: { duckDb: 7, releaseMs: 70 } }, // same as gabber: the kick is the genre, and it does not move · see hardcore-gabber — the tempo sets the release
  "french-house": { category: "Electronic", loudnessTrimDb: -0.05, overrides: { bass: { volume: 0.94 }, chords: { volume: 0.8, sendA: 0.18 }, lead: { volume: 0.76, sendB: 0.22 } } },
  "future-bass": { category: "Electronic", loudnessTrimDb: 0, overrides: { bass: { volume: 0.96 }, lead: { volume: 0.86, sendA: 0.24 }, chords: { volume: 0.78, sendA: 0.24 } } },
  "future-garage": { category: "Electronic", loudnessTrimDb: 0, overrides: { hihat: { volume: 0.7, pan: -0.34, sendB: 0.22 }, bass: { volume: 0.94 }, chords: { volume: 0.8, sendA: 0.22 } } },
  "future-house": { category: "Electronic", loudnessTrimDb: 0, overrides: { bass: { volume: 0.94 }, lead: { volume: 0.82, sendA: 0.2 } } },
  "ghetto-house": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, percussion: { volume: 0.8, pan: 0.45 }, bass: { volume: 0.96 } } },
  "glitch-hop": { category: "Electronic", loudnessTrimDb: 0, overrides: { percussion: { volume: 0.82, pan: 0.38 }, chords: { volume: 0.62 }, bass: { volume: 0.92 } } },
  "goa-trance": { category: "Electronic", loudnessTrimDb: 0, overrides: { bass: { volume: 0.86 }, lead: { volume: 0.88, pan: 0.16, sendA: 0.24 }, chords: { volume: 0.82, sendA: 0.24 }, fx: { volume: 0.76 } } },
  "grime": { category: "Electronic", loudnessTrimDb: 0, overrides: { bass: { volume: 0.96 }, lead: { volume: 0.82 }, chords: { volume: 0.6 } } },
  "halftime": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, snare: { volume: 0.94 }, bass: { volume: 0.97 }, hihat: { volume: 0.62 } } },
  "happy-hardcore": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, lead: { volume: 0.86 }, chords: { volume: 0.78, sendA: 0.2 } } },
  "hardcore-gabber": { humanise: 0.07, category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 1.0 }, snare: { volume: 0.7 }, bass: { volume: 0.94 } }, duck: { duckDb: 7, releaseMs: 70 } }, // the genre is defined by its machine-straight kick · a 170+ BPM kick arrives every ~170 ms, so the duck must clear before the next one
  "hardstyle": { humanise: 0.09, category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 1.0 }, bass: { volume: 0.98 }, lead: { volume: 0.82 }, fx: { volume: 0.6 } }, duck: { duckDb: 7, releaseMs: 80 } }, // the reverse bass and kick are programmed, not played · the reverse bass is re-triggered on every kick, so the duck clears fast
  "hard-techno": { humanise: 0.1, category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 1.0 }, bass: { volume: 0.95 }, snare: { volume: 0.86 } }, duck: { duckDb: 6.5, releaseMs: 110 } }, // industrial-weight techno: a flat kick is the point · harder and faster than the category base
  "hard-trance": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, lead: { volume: 0.88, sendA: 0.22 } } },
  "hard-trap": { category: "Electronic", loudnessTrimDb: -0.03, overrides: { kick: { volume: 0.98 }, bass: { volume: 0.99 }, hihat: { volume: 0.8, pan: -0.4 } } },
  "hybrid-trap": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.97 }, bass: { volume: 0.96 }, hihat: { volume: 0.8, pan: -0.36 }, lead: { volume: 0.78 } } },
  "idm": { category: "Electronic", loudnessTrimDb: 0, overrides: { percussion: { volume: 0.8, pan: 0.36 }, chords: { volume: 0.8, sendA: 0.24 }, bass: { volume: 0.88 } } },
  "industrial-techno": { humanise: 0.1, category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 1.0 }, bass: { volume: 0.95 }, snare: { volume: 0.88 } }, duck: { duckDb: 6.5, releaseMs: 110 } }, // see hard-techno — the machine aesthetic is the genre · see hard-techno
  "jersey-club": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.99 }, percussion: { volume: 0.88, pan: 0.42 }, bass: { volume: 0.96 } } },
  "jersey-drill": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, bass: { volume: 0.98 }, hihat: { volume: 0.82, pan: -0.4 }, percussion: { volume: 0.78 } } },
  "jump-up": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, snare: { volume: 0.92 }, bass: { volume: 0.98 } } },
  "jungle": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.9 }, snare: { volume: 0.95 }, percussion: { volume: 0.82, pan: 0.44 }, bass: { volume: 0.96 } } },
  "kawaii-future-bass": { category: "Electronic", loudnessTrimDb: 0, overrides: { lead: { volume: 0.9, sendA: 0.22 }, chords: { volume: 0.8, sendA: 0.22 }, bass: { volume: 0.94 } } },
  "liquid-dnb": { category: "Electronic", loudnessTrimDb: 0, overrides: { snare: { volume: 0.9, sendA: 0.16 }, bass: { volume: 0.94 }, chords: { volume: 0.8, sendA: 0.24 }, lead: { volume: 0.76, sendA: 0.22 } } },
  "lofi-house": { category: "Electronic", loudnessTrimDb: -4.49, overrides: { hihat: { volume: 0.58 }, chords: { volume: 0.84, sendA: 0.24 }, lead: { volume: 0.66, sendA: 0.22 }, fx: { volume: 0.34 } } },
  "melodic-dubstep": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.9 }, bass: { volume: 0.97 }, chords: { volume: 0.86, sendA: 0.28 }, lead: { volume: 0.82, sendA: 0.26 } } },
  "melodic-house": { category: "Electronic", loudnessTrimDb: 0, overrides: { hihat: { volume: 0.62, sendB: 0.2 }, chords: { volume: 0.86, sendA: 0.22 }, lead: { volume: 0.76, sendA: 0.22 } } },
  "microhouse": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.88 }, snare: { volume: 0.66, sendA: 0.16 }, hihat: { volume: 0.54, sendB: 0.22 }, percussion: { volume: 0.68, sendB: 0.26 }, chords: { volume: 0.76, sendA: 0.22 }, fx: { volume: 0.46 } } },
  "minimal-techno": { category: "Electronic", loudnessTrimDb: 0, overrides: { hihat: { volume: 0.6, sendB: 0.2 }, chords: { volume: 0.8, sendA: 0.22 }, lead: { volume: 0.56 }, fx: { volume: 0.44 } } },
  "moombahton": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.96 }, bass: { volume: 0.94 }, percussion: { volume: 0.82, pan: 0.42 } } },
  "neurofunk": { category: "Electronic", loudnessTrimDb: -0.11, overrides: { kick: { volume: 0.96 }, snare: { volume: 0.92 }, bass: { volume: 1.0 } } },
  "nu-disco-house": { category: "Electronic", loudnessTrimDb: 0, overrides: { bass: { volume: 0.92 }, chords: { volume: 0.8, pan: -0.2, sendA: 0.18 }, lead: { volume: 0.78 } } },
  "peak-time-techno": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.99 }, bass: { volume: 0.96 }, fx: { volume: 0.78 } } },
  "phonk": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.97 }, bass: { volume: 0.98 }, lead: { volume: 0.72 }, chords: { volume: 0.6 } } },
  "post-dubstep": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.66 }, snare: { volume: 0.58, sendA: 0.22 }, hihat: { volume: 0.5 }, bass: { volume: 0.96 }, chords: { volume: 0.88, sendA: 0.32 }, lead: { volume: 0.7, sendA: 0.3 } } },
  "progressive-house": { category: "Electronic", loudnessTrimDb: 0, overrides: { lead: { volume: 0.8, sendA: 0.22 }, chords: { volume: 0.8, sendA: 0.22 } } },
  "progressive-trance": { category: "Electronic", loudnessTrimDb: 0, overrides: { lead: { volume: 0.84, sendA: 0.26 }, chords: { volume: 0.82, sendA: 0.26 } } },
  "psytrance": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, bass: { volume: 0.97 }, lead: { volume: 0.86, pan: 0.22 }, fx: { volume: 0.8 } } },
  "ragga-jungle": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.88 }, snare: { volume: 0.92, sendA: 0.16 }, bass: { volume: 0.98 }, chords: { volume: 0.72 } } },
  "raw-techno": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 1.0 }, snare: { volume: 0.9 }, percussion: { volume: 0.8 } } },
  "riddim": { category: "Electronic", loudnessTrimDb: 0.91, overrides: { kick: { volume: 0.97 }, bass: { volume: 0.99 }, lead: { volume: 0.6 } } },
  "sambass": { category: "Electronic", loudnessTrimDb: 0, overrides: { snare: { volume: 0.9 }, percussion: { volume: 0.92, pan: -0.42 }, bass: { volume: 0.92 } } },
  "schranz": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 1.0 }, bass: { volume: 0.96 }, percussion: { volume: 0.82 } } },
  "speedbass": { category: "Electronic", loudnessTrimDb: 0, overrides: { bass: { volume: 0.98 }, kick: { volume: 0.97 } } },
  "speed-garage": { category: "Electronic", loudnessTrimDb: 0, overrides: { hihat: { volume: 0.74, pan: -0.34, sendB: 0.2 }, bass: { volume: 0.94 } } },
  "synthwave": { category: "Electronic", loudnessTrimDb: 0.24, overrides: { snare: { volume: 0.88, sendA: 0.22 }, chords: { volume: 0.86, pan: -0.3, sendA: 0.2 }, lead: { volume: 0.84, pan: 0.3, sendA: 0.22 }, bass: { volume: 0.92 } }, duck: { duckDb: 5, releaseMs: 150 } }, // slow tempo and a sustained bass: a longer release keeps it from chopping
  "tearout-dubstep": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, bass: { volume: 1.0 }, snare: { volume: 0.72 } } },
  "tech-house": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.97 }, bass: { volume: 0.94 }, percussion: { volume: 0.76, sendB: 0.26 } } },
  "techstep": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.94 }, snare: { volume: 0.92 }, bass: { volume: 0.98 } } },
  "tech-trance": { category: "Electronic", loudnessTrimDb: -4.43, overrides: { kick: { volume: 0.99 }, bass: { volume: 0.96 }, lead: { volume: 0.84, sendA: 0.24 } } },
  "trip-hop": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.8 }, snare: { volume: 0.68, sendA: 0.2 }, hihat: { volume: 0.52, pan: -0.28 }, bass: { volume: 0.95 }, chords: { volume: 0.84, sendA: 0.28 }, lead: { volume: 0.6, sendA: 0.26 }, fx: { volume: 0.36 } } },
  "tropical-house": { category: "Electronic", loudnessTrimDb: 0, overrides: { percussion: { volume: 0.82, pan: 0.42 }, chords: { volume: 0.78, sendA: 0.2 }, lead: { volume: 0.74, sendA: 0.2 } } },
  "uk-drill": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, bass: { volume: 0.99 }, hihat: { volume: 0.84, pan: -0.4, sendB: 0.2 } } },
  "uk-funky": { category: "Electronic", loudnessTrimDb: 0, overrides: { bass: { volume: 0.94 }, percussion: { volume: 0.82, pan: 0.4 } } },
  "uk-garage": { category: "Electronic", loudnessTrimDb: 0, overrides: { hihat: { volume: 0.72, pan: -0.36, sendB: 0.22 }, bass: { volume: 0.95 }, chords: { volume: 0.78, sendA: 0.22 } } },
  "uplifting-trance": { category: "Electronic", loudnessTrimDb: -4.59, overrides: { lead: { volume: 0.9, pan: 0.16, sendA: 0.28 }, chords: { volume: 0.84, pan: -0.16, sendA: 0.28 }, bass: { volume: 0.9 } } },
  "vaporwave": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.6 }, snare: { volume: 0.5, sendA: 0.24 }, hihat: { volume: 0.46 }, bass: { volume: 0.86 }, chords: { volume: 0.92, sendA: 0.36 }, lead: { volume: 0.66, sendA: 0.32 }, fx: { volume: 0.34 } } },
  "vocal-trance": { category: "Electronic", loudnessTrimDb: -2.75, overrides: { lead: { volume: 0.92, sendA: 0.28 }, chords: { volume: 0.82, sendA: 0.26 } } },
  "wave": { category: "Electronic", loudnessTrimDb: 0, overrides: { kick: { volume: 0.76 }, hihat: { volume: 0.56 }, bass: { volume: 0.96 }, chords: { volume: 0.88, sendA: 0.32 }, lead: { volume: 0.78, sendA: 0.3 } } },

  // ------------------------------------------------------------------- Hip Hop
  "boom-bap": { humanise: 0.34, category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.94, sendA: 0.04 }, snare: { volume: 0.92, sendA: 0.12 }, hihat: { volume: 0.66 }, percussion: { volume: 0.58 }, bass: { volume: 0.94 }, chords: { volume: 0.74, sendA: 0.16 }, lead: { volume: 0.62 } }, duck: { duckDb: 6.5, releaseMs: 120 } }, // sampled and MPC-swung: velocities are part of the sample chop · sampled kick and upright-ish bass share a band
  "cloud-rap": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.92 }, snare: { volume: 0.66, sendA: 0.24 }, hihat: { volume: 0.6, sendB: 0.2 }, bass: { volume: 0.97 }, chords: { volume: 0.86, sendA: 0.34 }, lead: { volume: 0.76, sendA: 0.3 } } },
  "conscious-hip-hop": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.86 }, snare: { volume: 0.84 }, hihat: { volume: 0.6 }, bass: { volume: 0.95 }, chords: { volume: 0.78, sendA: 0.18 }, lead: { volume: 0.72, sendA: 0.18 } } },
  "east-coast-hip-hop": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.95 }, snare: { volume: 0.9 }, hihat: { volume: 0.64 }, bass: { volume: 0.95 }, chords: { volume: 0.74, sendA: 0.14 } } },
  "emo-rap": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.92 }, snare: { volume: 0.7, sendA: 0.2 }, hihat: { volume: 0.7, pan: -0.34 }, bass: { volume: 0.96 }, chords: { volume: 0.82, sendA: 0.3 }, lead: { volume: 0.84, sendA: 0.28 } } },
  "g-funk": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.94 }, snare: { volume: 0.82 }, bass: { volume: 0.98 }, chords: { volume: 0.7, sendA: 0.14 }, lead: { volume: 0.88, pan: 0.24, sendA: 0.22 } } },
  "lofi-hip-hop": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.84 }, snare: { volume: 0.68, sendA: 0.16 }, hihat: { volume: 0.54, pan: -0.3 }, bass: { volume: 0.95 }, chords: { volume: 0.86, sendA: 0.28 }, lead: { volume: 0.68, sendA: 0.26 }, fx: { volume: 0.36 } } },
  "old-school-hip-hop": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.95 }, snare: { volume: 0.92, sendA: 0.1 }, hihat: { volume: 0.68 }, percussion: { volume: 0.7, pan: 0.4 }, bass: { volume: 0.94 } } },
  "southern-hip-hop": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, snare: { volume: 0.8 }, hihat: { volume: 0.74 }, bass: { volume: 0.99 }, chords: { volume: 0.72, sendA: 0.2 }, lead: { volume: 0.7, sendA: 0.2 } } },
  "trap-rap": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.98 }, snare: { volume: 0.8 }, hihat: { volume: 0.84, pan: -0.42, sendB: 0.18 }, bass: { volume: 0.99 } }, duck: { duckDb: 7, releaseMs: 90 } }, // the 808 *is* the bass and the kick at once — producers duck it hard and quickly
  "west-coast-hip-hop": { category: "Hip Hop", loudnessTrimDb: 0, overrides: { kick: { volume: 0.94 }, snare: { volume: 0.86 }, hihat: { volume: 0.68 }, bass: { volume: 0.95 }, lead: { volume: 0.78, pan: 0.22 } } },

  // --------------------------------------------------------------- Jazz/Blues
  "acid-jazz": { category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.86 }, snare: { volume: 0.84, sendA: 0.12 }, bass: { volume: 0.96 }, chords: { volume: 0.82, pan: -0.2 }, lead: { volume: 0.8, pan: 0.2 }, fx: { volume: 0.36, sendA: 0.12 } } },
  "bebop": { humanise: 0.4, category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.62, sendA: 0.08 }, snare: { volume: 0.66, sendA: 0.1 }, hihat: { volume: 0.56 }, percussion: { volume: 0.46 }, bass: { volume: 0.98 }, chords: { volume: 0.76, sendA: 0.14 }, lead: { volume: 0.84, sendA: 0.16 } }  }, // bebop comping is defined by accent, not by grid position
  "chicago-blues": { humanise: 0.42, category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.78 }, snare: { volume: 0.8, sendA: 0.14 }, bass: { volume: 0.92 }, chords: { volume: 0.84, pan: -0.22 }, lead: { volume: 0.86, pan: 0.22, sendA: 0.2 } }, duck: { duckDb: 5.5, releaseMs: 110 } }, // a live band — the whole idiom is dynamics · an acoustic bass and a played kick: gentle and quick
  "cool-jazz": { category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.56 }, snare: { volume: 0.6, sendA: 0.14 }, hihat: { volume: 0.52 }, percussion: { volume: 0.44 }, bass: { volume: 0.92 }, chords: { volume: 0.82, sendA: 0.18 }, lead: { volume: 0.7, sendA: 0.18 } } },
  "delta-blues": { humanise: 0.44, category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.6 }, snare: { volume: 0.62, sendA: 0.16 }, hihat: { volume: 0.44 }, percussion: { volume: 0.4 }, bass: { volume: 0.86 }, chords: { volume: 0.88, pan: -0.2, sendA: 0.2 }, lead: { volume: 0.84, pan: 0.2, sendA: 0.2 } }, duck: { duckDb: 5.5, releaseMs: 110 } }, // solo guitar and voice; the quietest licks carry the feel · see chicago-blues
  "electric-blues": { category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.8 }, snare: { volume: 0.82, sendA: 0.14 }, bass: { volume: 0.92 }, chords: { volume: 0.84, pan: -0.24 }, lead: { volume: 0.88, pan: 0.24, sendA: 0.2 } } },
  "free-jazz": { category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.68, sendA: 0.14 }, snare: { volume: 0.74, sendA: 0.16 }, hihat: { volume: 0.6, sendA: 0.14 }, percussion: { volume: 0.68, pan: 0.26 }, bass: { volume: 0.96 }, chords: { volume: 0.74, sendA: 0.2 }, lead: { volume: 0.84, sendA: 0.2 } } },
  "gypsy-jazz": { category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.58 }, snare: { volume: 0.6, sendA: 0.12 }, hihat: { volume: 0.5 }, percussion: { volume: 0.44 }, bass: { volume: 0.94 }, chords: { volume: 0.9, pan: -0.24, sendA: 0.18 }, lead: { volume: 0.88, pan: 0.24, sendA: 0.18 } } },
  "hard-bop": { category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.7, sendA: 0.1 }, snare: { volume: 0.78, sendA: 0.12 }, hihat: { volume: 0.6 }, bass: { volume: 0.96 }, chords: { volume: 0.8, sendA: 0.16 }, lead: { volume: 0.85, sendA: 0.18 } } },
  "jazz-fusion": { category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.86 }, snare: { volume: 0.84, sendA: 0.12 }, bass: { volume: 0.97 }, chords: { volume: 0.84, pan: -0.22, sendA: 0.14 }, lead: { volume: 0.82, pan: 0.22, sendA: 0.16 } } },
  "modal-jazz": { category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.6 }, snare: { volume: 0.64, sendA: 0.12 }, hihat: { volume: 0.58 }, bass: { volume: 0.96 }, chords: { volume: 0.84, sendA: 0.18 }, lead: { volume: 0.78, sendA: 0.18 } } },
  "smooth-jazz": { category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.6 }, snare: { volume: 0.56, sendA: 0.16 }, hihat: { volume: 0.5 }, percussion: { volume: 0.5, pan: 0.3 }, bass: { volume: 0.9 }, chords: { volume: 0.84, sendA: 0.24 }, lead: { volume: 0.8, sendA: 0.24 } } },
  "texas-blues": { category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.8 }, snare: { volume: 0.8, sendA: 0.14 }, bass: { volume: 0.92 }, chords: { volume: 0.8, pan: -0.22 }, lead: { volume: 0.9, pan: 0.22, sendA: 0.2 } } },
  "traditional-jazz": { category: "Jazz/Blues", loudnessTrimDb: 0, overrides: { kick: { volume: 0.66 }, snare: { volume: 0.72, sendA: 0.14 }, hihat: { volume: 0.52 }, percussion: { volume: 0.58, pan: 0.28 }, bass: { volume: 0.94 }, chords: { volume: 0.84, sendA: 0.18 }, lead: { volume: 0.8, sendA: 0.18 } } },

  // -------------------------------------------------------------- Latin/World
  "afrobeat": { humanise: 0.36, category: "Latin/World", loudnessTrimDb: 0, overrides: { snare: { volume: 0.7 }, percussion: { volume: 0.96, pan: -0.44, sendB: 0.2 }, bass: { volume: 0.9 }, chords: { volume: 0.76, pan: 0.18 }, lead: { volume: 0.74 } }  }, // a live percussion ensemble is the lead voice
  "amapiano": { category: "Latin/World", loudnessTrimDb: 0, overrides: { kick: { volume: 0.86 }, percussion: { volume: 0.88, pan: -0.36 }, bass: { volume: 0.94 }, chords: { volume: 0.82, sendA: 0.2 }, lead: { volume: 0.74, sendA: 0.2 } } },
  "bachata": { category: "Latin/World", loudnessTrimDb: 0, overrides: { kick: { volume: 0.78 }, snare: { volume: 0.68 }, percussion: { volume: 0.9, pan: -0.4 }, bass: { volume: 0.86 }, chords: { volume: 0.68 }, lead: { volume: 0.82, pan: 0.18, sendA: 0.2 } } },
  "bossa-nova": { category: "Latin/World", loudnessTrimDb: 0, overrides: { kick: { volume: 0.5 }, snare: { volume: 0.46, sendA: 0.12 }, hihat: { volume: 0.48 }, percussion: { volume: 0.72, pan: -0.3 }, bass: { volume: 0.9 }, chords: { volume: 0.9, pan: 0.18, sendA: 0.22 }, lead: { volume: 0.8, sendA: 0.22 }, fx: { volume: 0.2 } } },
  "cumbia": { category: "Latin/World", loudnessTrimDb: 0, overrides: { percussion: { volume: 0.94, pan: -0.42 }, bass: { volume: 0.88 }, chords: { volume: 0.76, pan: 0.18 }, lead: { volume: 0.74 } } },
  "dancehall": { category: "Latin/World", loudnessTrimDb: 0, overrides: { kick: { volume: 0.9 }, bass: { volume: 0.97 }, percussion: { volume: 0.84, pan: -0.38, sendB: 0.2 }, chords: { volume: 0.68, sendA: 0.16 } } },
  "kuduro": { category: "Latin/World", loudnessTrimDb: 0, overrides: { kick: { volume: 0.92 }, percussion: { volume: 0.98, pan: -0.44, sendB: 0.22 }, bass: { volume: 0.94 } } },
  "reggae": { category: "Latin/World", loudnessTrimDb: 0, overrides: { kick: { volume: 0.76 }, snare: { volume: 0.52, sendA: 0.2 }, hihat: { volume: 0.44 }, percussion: { volume: 0.6 }, bass: { volume: 1.0 }, chords: { volume: 0.84, sendA: 0.3 }, lead: { volume: 0.6, sendA: 0.26 }, fx: { volume: 0.3, sendA: 0.24 } } },
  "reggaeton": { category: "Latin/World", loudnessTrimDb: 0, overrides: { kick: { volume: 0.94 }, snare: { volume: 0.68 }, percussion: { volume: 0.9, pan: -0.42 }, bass: { volume: 0.96 }, lead: { volume: 0.74 } } },
  "salsa": { category: "Latin/World", loudnessTrimDb: 0, overrides: { kick: { volume: 0.7 }, snare: { volume: 0.66 }, percussion: { volume: 1.0, pan: -0.42, sendA: 0.16, sendB: 0.18 }, bass: { volume: 0.94 }, chords: { volume: 0.76, pan: 0.2 }, lead: { volume: 0.8, sendA: 0.18 } } },
  "samba": { category: "Latin/World", loudnessTrimDb: 0, overrides: { percussion: { volume: 1.0, pan: -0.44, sendB: 0.2 }, bass: { volume: 0.9 }, chords: { volume: 0.74, pan: 0.2 }, lead: { volume: 0.78 } } },

  // ------------------------------------------------------------------ Pop/R&B
  "alternative-rnb": { category: "Pop/R&B", loudnessTrimDb: 0, overrides: { kick: { volume: 0.8 }, hihat: { volume: 0.52, pan: -0.3 }, bass: { volume: 0.95 }, chords: { volume: 0.86, sendA: 0.3 }, lead: { volume: 0.88, sendA: 0.3 } } },
  "city-pop": { category: "Pop/R&B", loudnessTrimDb: -0.07, overrides: { snare: { volume: 0.86, sendA: 0.16 }, bass: { volume: 0.9 }, chords: { volume: 0.8, pan: -0.26, sendA: 0.2 }, lead: { volume: 0.84, pan: 0.26, sendA: 0.2 } } },
  "contemporary-rnb": { category: "Pop/R&B", loudnessTrimDb: 0, overrides: { kick: { volume: 0.92 }, snare: { volume: 0.7 }, hihat: { volume: 0.7, pan: -0.34 }, bass: { volume: 0.97 }, lead: { volume: 0.92, sendA: 0.22 } } },
  "disco": { category: "Pop/R&B", loudnessTrimDb: 0, overrides: { snare: { volume: 0.86, sendA: 0.16 }, hihat: { volume: 0.7, pan: -0.28, sendB: 0.16 }, percussion: { volume: 0.8, pan: 0.4, sendB: 0.22 }, bass: { volume: 0.94 }, chords: { volume: 0.8, pan: -0.24, sendA: 0.2 }, lead: { volume: 0.82, pan: 0.24, sendA: 0.2 } }, duck: { duckDb: 5.5, releaseMs: 140 } }, // four-on-the-floor with a melodic bass line that has to come back between kicks
  "eurodance": { category: "Pop/R&B", loudnessTrimDb: 0, overrides: { kick: { volume: 0.96 }, bass: { volume: 0.94 }, chords: { volume: 0.82, sendA: 0.22 }, lead: { volume: 0.92, sendA: 0.24 }, fx: { volume: 0.72 } } },
  "funk": { humanise: 0.38, category: "Pop/R&B", loudnessTrimDb: -0.01, overrides: { kick: { volume: 0.94 }, snare: { volume: 0.9 }, hihat: { volume: 0.74 }, percussion: { volume: 0.76, pan: 0.38 }, bass: { volume: 0.98 }, chords: { volume: 0.74, pan: -0.22 }, lead: { volume: 0.78, pan: 0.22 } }  }, // the one is hard, the ghosts are barely there; that gap is the genre
  "j-pop": { category: "Pop/R&B", loudnessTrimDb: 0, overrides: { kick: { volume: 0.92 }, snare: { volume: 0.86 }, hihat: { volume: 0.72 }, bass: { volume: 0.92 }, chords: { volume: 0.8, sendA: 0.18 }, lead: { volume: 0.94, sendA: 0.2 }, fx: { volume: 0.7 } } },
  "k-pop": { category: "Pop/R&B", loudnessTrimDb: -3.9, overrides: { kick: { volume: 0.94 }, snare: { volume: 0.88 }, bass: { volume: 0.94 }, lead: { volume: 0.94, sendA: 0.2 }, fx: { volume: 0.74 } } },
  "motown": { humanise: 0.36, category: "Pop/R&B", loudnessTrimDb: 0, overrides: { kick: { volume: 0.76 }, snare: { volume: 0.78, sendA: 0.16 }, hihat: { volume: 0.56 }, percussion: { volume: 0.72, pan: 0.36 }, bass: { volume: 0.94 }, chords: { volume: 0.76, sendA: 0.16 }, lead: { volume: 0.92, pan: 0.1, sendA: 0.22 } }  }, // see soul — same rooms, same players
  "neo-soul": { category: "Pop/R&B", loudnessTrimDb: 0, overrides: { kick: { volume: 0.78 }, snare: { volume: 0.72, sendA: 0.14 }, hihat: { volume: 0.54, pan: -0.26 }, bass: { volume: 0.95 }, chords: { volume: 0.88, pan: -0.18, sendA: 0.24 }, lead: { volume: 0.9, sendA: 0.26 } } },
  "soul": { humanise: 0.36, category: "Pop/R&B", loudnessTrimDb: 0, overrides: { kick: { volume: 0.78 }, snare: { volume: 0.78, sendA: 0.16 }, hihat: { volume: 0.58 }, percussion: { volume: 0.7, pan: 0.36 }, bass: { volume: 0.94 }, chords: { volume: 0.78, sendA: 0.16 }, lead: { volume: 0.94, sendA: 0.24 } }  }, // session players: Motown's own kit is famously dynamic
  "synth-pop": { category: "Pop/R&B", loudnessTrimDb: 2.26, overrides: { kick: { volume: 0.9 }, bass: { volume: 0.9 }, chords: { volume: 0.82, pan: -0.24, sendA: 0.18 }, lead: { volume: 0.9, pan: 0.2, sendA: 0.2 } } },
  "traditional-pop": { category: "Pop/R&B", loudnessTrimDb: 0, overrides: { kick: { volume: 0.66 }, snare: { volume: 0.62, sendA: 0.16 }, hihat: { volume: 0.48 }, percussion: { volume: 0.5 }, bass: { volume: 0.86 }, chords: { volume: 0.78, sendA: 0.2 }, lead: { volume: 0.94, sendA: 0.26 }, fx: { volume: 0.24 } } },

  // --------------------------------------------------------------- Rock/Metal
  "alternative-rock": { category: "Rock/Metal", loudnessTrimDb: 0, overrides: { snare: { volume: 0.88, sendA: 0.18 }, chords: { volume: 0.88 }, lead: { volume: 0.8 } } },
  "black-metal": { category: "Rock/Metal", loudnessTrimDb: 2.79, overrides: { kick: { volume: 0.96 }, snare: { volume: 0.94 }, hihat: { volume: 0.72 }, chords: { volume: 0.84, sendA: 0.14 }, lead: { volume: 0.78 } } },
  "blues-rock": { category: "Rock/Metal", loudnessTrimDb: 0, overrides: { kick: { volume: 0.88 }, snare: { volume: 0.88, sendA: 0.16 }, bass: { volume: 0.9 }, chords: { volume: 0.84 }, lead: { volume: 0.9, sendA: 0.18 } } },
  "death-metal": { category: "Rock/Metal", loudnessTrimDb: 2.52, overrides: { kick: { volume: 1.0 }, snare: { volume: 0.95 }, chords: { volume: 0.88, pan: -0.5 }, lead: { volume: 0.8, pan: 0.5 } } },
  "doom-metal": { category: "Rock/Metal", loudnessTrimDb: 0, overrides: { kick: { volume: 0.92 }, snare: { volume: 0.84, sendA: 0.26 }, bass: { volume: 0.98 }, chords: { volume: 0.9, sendA: 0.2 }, lead: { volume: 0.76, sendA: 0.22 } } },
  "grunge": { category: "Rock/Metal", loudnessTrimDb: 0, overrides: { kick: { volume: 0.88 }, snare: { volume: 0.9, sendA: 0.18 }, chords: { volume: 0.88 }, lead: { volume: 0.78 } } },
  "hard-rock": { category: "Rock/Metal", loudnessTrimDb: 0, overrides: { kick: { volume: 0.94 }, snare: { volume: 0.94, sendA: 0.16 }, chords: { volume: 0.9 }, lead: { volume: 0.88, sendA: 0.18 } } },
  "heavy-metal": { category: "Rock/Metal", loudnessTrimDb: 1.29, overrides: { kick: { volume: 0.96 }, snare: { volume: 0.93 }, chords: { volume: 0.9, pan: -0.5 }, lead: { volume: 0.84, pan: 0.5 } } },
  "math-rock": { category: "Rock/Metal", loudnessTrimDb: 0.11, overrides: { snare: { volume: 0.86, sendA: 0.12 }, chords: { volume: 0.88, pan: -0.4 }, lead: { volume: 0.86, pan: 0.4 }, fx: { volume: 0.36 } } },
  "metalcore": { category: "Rock/Metal", loudnessTrimDb: 2.07, overrides: { kick: { volume: 1.0 }, snare: { volume: 0.94 }, bass: { volume: 0.94 }, chords: { volume: 0.9, pan: -0.5 }, lead: { volume: 0.82, pan: 0.5 } } },
  "new-wave": { category: "Rock/Metal", loudnessTrimDb: 0.64, overrides: { kick: { volume: 0.86 }, snare: { volume: 0.84, sendA: 0.2 }, bass: { volume: 0.92 }, chords: { volume: 0.82, sendA: 0.16 }, lead: { volume: 0.84, sendA: 0.18 } } },
  "post-punk": { category: "Rock/Metal", loudnessTrimDb: 0, overrides: { kick: { volume: 0.88 }, snare: { volume: 0.86, sendA: 0.2 }, bass: { volume: 0.96 }, chords: { volume: 0.82, sendA: 0.18 }, lead: { volume: 0.76, sendA: 0.2 } } },
  "progressive-rock": { category: "Rock/Metal", loudnessTrimDb: 0, overrides: { snare: { volume: 0.84, sendA: 0.16 }, bass: { volume: 0.9 }, chords: { volume: 0.84, pan: -0.38 }, lead: { volume: 0.82, pan: 0.38 }, fx: { volume: 0.44 } } },
  "punk-rock": { category: "Rock/Metal", loudnessTrimDb: 0.04, overrides: { kick: { volume: 0.94 }, snare: { volume: 0.96 }, bass: { volume: 0.9 }, chords: { volume: 0.9, pan: -0.42 }, lead: { volume: 0.8, pan: 0.42 } } },
  "rock-and-roll": { category: "Rock/Metal", loudnessTrimDb: 0, overrides: { kick: { volume: 0.8 }, snare: { volume: 0.86, sendA: 0.18 }, hihat: { volume: 0.56 }, bass: { volume: 0.9 }, chords: { volume: 0.84, pan: -0.35 }, lead: { volume: 0.86, pan: 0.35, sendA: 0.18 } } },
  "shoe-gaze": { category: "Rock/Metal", loudnessTrimDb: 0, overrides: { kick: { volume: 0.78 }, snare: { volume: 0.74, sendA: 0.28 }, bass: { volume: 0.94 }, chords: { volume: 0.94, sendA: 0.3 }, lead: { volume: 0.82, sendA: 0.32 }, fx: { volume: 0.46, sendA: 0.28 } } },
  "thrash-metal": { category: "Rock/Metal", loudnessTrimDb: 1.56, overrides: { kick: { volume: 0.98 }, snare: { volume: 0.96 }, hihat: { volume: 0.76 }, chords: { volume: 0.88, pan: -0.48 }, lead: { volume: 0.82, pan: 0.48 } } },
};

const DEFAULT_TRACK_MIX: TrackMix = { volume: 0.8, pan: 0, sendA: 0, sendB: 0 };

/**
 * How far the authored pans are spread once resolved — `1` is "as written".
 *
 * Every category profile pans its hats, percussion, chords and lead by ±0.12…0.5, and the result still measured as
 * effectively **mono**: 12 of 12 sampled genres correlate above 0.98 (chicago-house 0.9973, minimal-techno 0.9989),
 * because the lanes that ask for a side are quiet next to a centred kick and bass. Scaling the *resolved* pan — not
 * the authored table, and not 159 entries by hand — spreads the intent the mix already states.
 *
 * **Measured 2026-09-24 at 2.0 → 3.0, on the gate's own offenders:**
 *
 *   chicago-house   0.9865 → **0.9716**   side/mid −21.7 → −18.4 dB
 *   detroit-techno  0.9939 → **0.9736**   side/mid −25.1 → −18.7 dB
 *
 * Both cross the 0.98 line, the ceiling still holds −1.30 dBTP, and the side stays 10 dB inside the mono-safe guard
 * (`sideTooHot` fails above −8 dB). At 2.0 the sample read **8 of 12** narrow; the objective's own target was 3.
 *
 * The cost is why this waited for a re-record: a hard-panned lane puts up to +3 dB into one channel, so the true-peak
 * ceiling clamps harder and the widest genres lose loudness (chicago-house −13.86 LUFS at 3.0 against a slightly
 * higher level at 2.0). The trims absorb that, and they are re-recorded once per batch rather than per change.
 */
export const MIX_WIDTH_SCALE = 3;

/**
 * The lanes the width stage leaves where the mix put them: kick, bass and snare.
 *
 * The profiles already say these belong in the middle ("that is a mix decision, not laziness"), and a genre that
 * nudges its snare to 0.08 means "almost centred", not "hard left" — doubling it to 0.16 would spend the width on a
 * lane that carries no image and would break the invariant the mix table's own test holds. The side image comes from
 * hats, percussion, chords, lead and fx, which is where the 12/12 → 3/12 measurement came from.
 */
const WIDTH_MONO_TRACKS: ReadonlySet<MixTrackId> = new Set(["kick", "bass", "snare"]);

/** The pan one lane gets once the width stage has run. */
export function widenPan(trackId: MixTrackId, pan: number): number {
  if (!Number.isFinite(pan)) return 0;
  const scaled = WIDTH_MONO_TRACKS.has(trackId) ? pan : pan * MIX_WIDTH_SCALE;
  return Math.max(-1, Math.min(1, scaled));
}

function resolveTrackMix(genreMix: GenreMix, trackId: MixTrackId): TrackMix {
  const base = CATEGORY_MIX_PROFILES[genreMix.category] ?? CATEGORY_MIX_PROFILES.Electronic;
  const baseTrack = base[trackId] ?? DEFAULT_TRACK_MIX;
  const override = genreMix.overrides?.[trackId];
  if (!override) return { ...baseTrack, pan: widenPan(trackId, baseTrack.pan) };
  return {
    volume: override.volume ?? baseTrack.volume,
    pan: widenPan(trackId, override.pan ?? baseTrack.pan),
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

/**
 * P0.2 — the humanisation amount for one lane of one genre.
 *
 * Returns 0 for an unknown/custom genre id or an unrecognised lane, which is what makes
 * humanisation opt-in: a genre the table does not know never has its velocities touched,
 * exactly like `applyGenreMixDefaults` leaves its mix alone.
 */
export function getGenreHumaniseAmount(
  genreId: string | undefined | null,
  track: Pick<SequencerTrack, "track_id" | "name">
): number {
  if (!genreId) return 0;
  const entry = GENRE_MIX[genreId];
  if (!entry) return 0;
  const role = resolveMixTrackId(track);
  if (!role) return 0;
  const base = entry.humanise ?? HUMANISE_BY_CATEGORY[entry.category] ?? 0;
  if (!(base > 0)) return 0;
  return base * HUMANISE_TRACK_SCALE[role];
}

/**
 * P0.3 — the resolved kick/bass sidechain for a genre.
 *
 * Unknown/custom ids get `DEFAULT_DUCK` (see there for why this one is not opt-in), and both fields are
 * clamped, so a table entry cannot schedule a 90 dB duck or a two-second release by accident.
 */
export function getGenreDuck(genreId: string | undefined | null): DuckSetting {
  const entry = genreId ? GENRE_MIX[genreId] : undefined;
  const base = entry ? DUCK_BY_CATEGORY[entry.category] ?? DEFAULT_DUCK : DEFAULT_DUCK;
  const duckDb = entry?.duck?.duckDb ?? base.duckDb;
  const releaseMs = entry?.duck?.releaseMs ?? base.releaseMs;
  return {
    duckDb: Math.max(DUCK_DB_MIN, Math.min(DUCK_DB_MAX, Number.isFinite(duckDb) ? duckDb : DEFAULT_DUCK.duckDb)),
    releaseMs: Math.max(
      DUCK_RELEASE_MIN_MS,
      Math.min(DUCK_RELEASE_MAX_MS, Number.isFinite(releaseMs) ? releaseMs : DEFAULT_DUCK.releaseMs)
    ),
  };
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
 * P0.2 — seeds velocity humanisation into every sounding step of a genre's pattern.
 *
 * Runs *after* the expansion, so a ghost-note rule (`×0.6`) is humanised around its own
 * value rather than around the authored one, and only on steps that sound: a silent step's
 * velocity is left exactly as authored, which keeps the velocity lane readable in the
 * editor. Unknown/custom genre ids get a plain copy back.
 *
 * Baked here rather than at trigger time on purpose. The pattern is a document: the live
 * engine, the WAV bounce, the MIDI/`.als` exports and the editor's velocity lane all read
 * `track.velocity`, so one transform at genre entry gives them all the same performance
 * for free — and `check:groove` measures the pattern, not the render, so this is also the
 * only place the `flatTracks` claim can actually see it.
 */
export function humanisePatternVelocities(pattern: SequencerPattern, genreId?: string): SequencerPattern {
  const id = genreId ?? pattern.genre_id;
  const copy = copyPatternTracks(pattern);
  if (!id || !GENRE_MIX[id]) return copy;

  const seed = patternSeed(copy as unknown as { genre_id?: string; bpm?: number; totalSteps?: number });
  return {
    ...copy,
    tracks: copy.tracks.map((track, trackIdx) => {
      const amount = getGenreHumaniseAmount(id, track);
      if (amount <= 0) return track;
      const base = track.velocity ? [...track.velocity] : [];
      // Iterate the steps, not the array: a track whose velocity lane is shorter than its step
      // lane (an imported or hand-edited pattern) still gets a full-length lane back.
      const velocity = track.steps.map((step, stepIdx) => {
        const value = base[stepIdx] ?? 100;
        return step > 0 ? humaniseVelocity(value, seed, trackIdx, stepIdx, amount) : value;
      });
      return { ...track, velocity };
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
  const expanded = expandGenrePattern(mixed, resolveGenreExpression(genre.id, category), {
    commonChords: genre.common_chords,
  });
  // P0.2: the last step of "this genre's pattern", and deliberately after the expansion —
  // see `humanisePatternVelocities` for why it is baked into the pattern instead of applied
  // at trigger time.
  const humanised = humanisePatternVelocities(expanded, genre.id);
  /**
   * P1.1: the content half of the same problem. Humanisation gives a lane more than one velocity; a ghost note is a
   * *different, quieter hit*, and measured on 2026-09-23 the snare lane still reached the plan's `max − min ≥ 15`
   * bar in only 1 of 11 sampled genres. Running after humanisation means a ghost is a fraction of a value that has
   * already been humanised, and only quieter onsets are ever added — see `genreGroove.ts`.
   */
  const textured = applyGrooveTexture(humanised, genre.id, category);
  /**
   * P1.2: the mid-range. The bass lane gains a walk only when it does not have one, and a low chord stack gains its
   * own top note an octave up — both note rewrites, never onset changes, so every rhythm claim stays where it was.
   */
  return applyMidRangeFill(textured, genre.id, category);
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
