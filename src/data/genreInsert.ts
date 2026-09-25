/**
 * Per-genre channel-strip overrides (requirement 9, phase D) — the layer that turns the
 * per-role insert defaults into per-genre creative decisions.
 *
 * ## Why this file exists
 *
 * `trackInsert.ts` answers "what does a *bass* channel sound like?". That is the right
 * default, but it cannot answer "what does a *dub* bass sound like?" — and the difference
 * between those two questions is most of what makes a genre sound like itself. The role
 * module deliberately deferred this layer with the note that adding 159 entries "before the
 * role defaults have been heard would be guesswork on top of guesswork". The measurement
 * harness now exists (`scripts/measure_genre_timbre.mjs`, V-10), and the plan's §3.4 table
 * states the intended character per family, so the deferral condition is met.
 *
 * ## Layering
 *
 *   1. `ROLE_INSERT_DEFAULTS[role]`   — the starting chain (unchanged, still the default for
 *      any genre this file does not name, and still what the inspector shows for a custom
 *      genre with no id).
 *   2. `GENRE_INSERT[genreId][role]`  — the patch applied on top. **Additive and partial:**
 *      a genre only states what it changes, so the role's reasoning keeps working underneath.
 *
 * `resolveTrackInsertForGenre(role, genreId)` is the function callers should use. The
 * role-only `resolveTrackInsert(role)` still exists and is still correct for callers with no
 * genre in hand (and for tests that assert the role layer in isolation).
 *
 * ## What a patch is allowed to do
 *
 * Only the numbers the DSP already consumes. Two disciplines are deliberate:
 *
 *   - **Drive is the main lever.** Every role default ships `driveEnabled: false` with a
 *     prepared amount, because drive is the single stage whose right value is genre-specific
 *     rather than role-specific: a metal rhythm guitar wants `4.5`, a jazz comp wants none,
 *     a dub bass wants `2.2` as a *colour* rather than as distortion. `driveMix` stays
 *     between 0.3 and 0.6 so the change is character, not a level jump.
 *   - **Level changes are kept modest on purpose.** The library has a measured loudness
 *     baseline over 159 genres, and `loudnessTrimDb` is refit from a render of the resolved
 *     chain. A patch that boosts a band by 6 dB would move the whole library's level in a way
 *     that has to be paid back by the trim. The gains here are the ones a mix engineer would
 *     actually reach for (±1.5 to ±3.5 dB), and the loudness refit after this change is
 *     recorded in `AUDIO_QUALITY_AND_SYNTH_PLAN.md` §4.14.
 *
 * ## Why an explicit table instead of family groups
 *
 * Genre families overlap (is `dub-techno` dub or techno? both), and a group-based builder has
 * to resolve collisions in code, which hides the decision. Every one of the 159 ids is
 * therefore written out by hand with a one-line reason. `genreInsert.test.ts` asserts the id
 * set equals `ALL_GENRES` exactly — no missing genre, no orphan id — so this cannot drift.
 */
import {
  ROLE_INSERT_DEFAULTS,
  type TrackEqBand,
  type TrackInsertParams,
  type TrackInsertPatch,
} from "./trackInsert";
import type { MixTrackId } from "./genreMix";

export type { TrackInsertPatch };

/** One genre's per-role patches. Both levels are partial. */
export type GenreInsertPatch = Partial<Record<MixTrackId, TrackInsertPatch>>;

/* ------------------------------------------------------------------------- *
 * Named patches
 *
 * Each one is a decision with a reason, written once so 159 entries stay readable.
 * ------------------------------------------------------------------------- */

/** High-gain rhythm guitar: hard clip, tight grip so palm mutes stay even. */
const SATURATED_GUITAR: TrackInsertPatch = {
  driveEnabled: true,
  driveAmount: 4.5,
  driveMix: 0.6,
  compThresholdDb: -18,
  compRatio: 4,
  compAttackSec: 0.006,
  compReleaseSec: 0.14,
  compMakeupDb: 2,
};

/** Mid-gain crunch: punk/grunge/alt guitar. Audible break-up, still note-readable. */
const CRUNCH_GUITAR: TrackInsertPatch = {
  driveEnabled: true,
  driveAmount: 2.5,
  driveMix: 0.45,
  compThresholdDb: -18,
  compRatio: 3,
};

/** A single-line lead through the same amp: slightly less drive than the rhythm wall. */
const DRIVEN_LEAD: TrackInsertPatch = {
  driveEnabled: true,
  driveAmount: 3.5,
  driveMix: 0.45,
  compRatio: 4,
  compThresholdDb: -16,
};

/** Driven bass: the rock/metal counterpart of the clean role default. */
const DRIVEN_BASS: TrackInsertPatch = {
  driveEnabled: true,
  driveAmount: 2.4,
  driveMix: 0.45,
  low: { hz: 70, gainDb: 2.5 },
  mid: { hz: 550, gainDb: -3 },
  compRatio: 4,
  compReleaseSec: 0.18,
};

/** Dub bass: driven *and* sculpted — sub lifted, 450 Hz carved so the snare has room. */
const DUB_BASS: TrackInsertPatch = {
  hpfHz: 28,
  low: { hz: 65, gainDb: 3 },
  mid: { hz: 450, gainDb: -3.5 },
  driveEnabled: true,
  driveAmount: 2.2,
  driveMix: 0.45,
  compThresholdDb: -12,
  compRatio: 4,
  compReleaseSec: 0.2,
};

/** Dub snare: dark and coloured. The repeats on the delay bus get darker still. */
const DUB_SNARE: TrackInsertPatch = {
  high: { hz: 7000, gainDb: -3 },
  driveEnabled: true,
  driveAmount: 1.8,
  driveMix: 0.4,
  compRatio: 3,
};

/** 808 / sub bass: longer release and a lifted fundamental so the note sustains. */
const TRAP_808: TrackInsertPatch = {
  hpfEnabled: true,
  hpfHz: 25,
  low: { hz: 55, gainDb: 2.5, q: 0.9 },
  mid: { hz: 500, gainDb: -2.5 },
  compThresholdDb: -12,
  compRatio: 4,
  compAttackSec: 0.02,
  compReleaseSec: 0.25,
  compMakeupDb: 2.5,
};

/** Four-on-the-floor kick: firmer than the role default, because every beat must read equal. */
const CLUB_KICK: TrackInsertPatch = {
  low: { hz: 58, gainDb: 2.5 },
  compThresholdDb: -10,
  compRatio: 5,
  compMakeupDb: 3.5,
};

/** Light console drive: the "warm" club sound. Character, not distortion. */
const WARM_DRIVE: TrackInsertPatch = {
  driveEnabled: true,
  driveAmount: 1.4,
  driveMix: 0.35,
};

/** Jazz comping / upright bass: no drive, gentle grip, keep the midrange body. */
const JAZZ_CLEAN: TrackInsertPatch = {
  driveEnabled: false,
  compThresholdDb: -12,
  compRatio: 2,
  compMakeupDb: 1,
  mid: { gainDb: -0.5 },
};

/** Upright bass: less sub, more 90 Hz body, slow release so notes breathe. */
const JAZZ_BASS: TrackInsertPatch = {
  hpfEnabled: true,
  hpfHz: 40,
  low: { hz: 90, gainDb: 1.5 },
  mid: { hz: 700, gainDb: -1.5 },
  compEnabled: true,
  compThresholdDb: -12,
  compRatio: 2.5,
  compAttackSec: 0.03,
  compReleaseSec: 0.25,
  compMakeupDb: 1.5,
  driveEnabled: false,
};

/** Ambient pad: no drive, slow gentle compression, keep the low body of the pad. */
const AMBIENT_PAD: TrackInsertPatch = {
  hpfHz: 110,
  mid: { gainDb: -1 },
  compEnabled: true,
  compThresholdDb: -10,
  compRatio: 1.5,
  compReleaseSec: 0.35,
  compMakeupDb: 1,
  driveEnabled: false,
};

/** Lo-fi: dull the top and add a little grit — the tape/SP-303 character. */
const LOFI_TAPE: TrackInsertPatch = {
  high: { hz: 6500, gainDb: -3.5 },
  driveEnabled: true,
  driveAmount: 1.6,
  driveMix: 0.35,
  compRatio: 2.5,
};

/** Latin/afro percussion: forward and bright — it is the lead voice in these genres. */
const LATIN_PERC: TrackInsertPatch = {
  mid: { hz: 1400, gainDb: 2.5 },
  high: { hz: 9000, gainDb: 2.5 },
  compThresholdDb: -16,
  compRatio: 3,
};

/** Pop topline: a real presence lift so the vocal-range lead cuts without being turned up. */
const POP_LEAD: TrackInsertPatch = {
  mid: { hz: 3000, gainDb: 3 },
  compThresholdDb: -16,
  compRatio: 3.5,
};

/** A dark high shelf, used by the dub and lo-fi families. */
const DARK_TOP: TrackInsertPatch = { high: { hz: 7500, gainDb: -3 } };

/** The 303/rave lead: driven in the midrange where the instrument actually lives. */
const ACID_LEAD: TrackInsertPatch = {
  mid: { hz: 1200, gainDb: 2 },
  driveEnabled: true,
  driveAmount: 3.5,
  driveMix: 0.55,
};

/** Hardstyle/uptempo kick: the distortion *is* the genre. */
const DRIVEN_KICK: TrackInsertPatch = {
  driveEnabled: true,
  driveAmount: 3,
  driveMix: 0.5,
  compThresholdDb: -9,
  compRatio: 5,
};

/* ------------------------------------------------------------------------- *
 * Per-genre table — one entry per shipped genre id, grouped by category.
 * ------------------------------------------------------------------------- */

export const GENRE_INSERT: Record<string, GenreInsertPatch> = {
  /* ---- Electronic: drum & bass / jungle ---------------------------------- */
  // Sampled-break genres: the bass is a reggae-derived sub, the snare a dark break.
  jungle: { bass: DUB_BASS, snare: DUB_SNARE },
  "liquid-dnb": { bass: { low: { hz: 70, gainDb: 2.5 }, mid: { hz: 400, gainDb: -2.5 } }, chords: JAZZ_CLEAN },
   neurofunk: { bass: DRIVEN_BASS, chords: SATURATED_GUITAR, lead: DRIVEN_LEAD },
  "jump-up": { bass: DRIVEN_BASS, snare: DUB_SNARE },
  techstep: { bass: DRIVEN_BASS, chords: DARK_TOP },
  halftime: { bass: DUB_BASS, chords: AMBIENT_PAD },
  breakcore: { kick: DRIVEN_KICK, snare: { compRatio: 4, compThresholdDb: -14 } },
  "ragga-jungle": { bass: DUB_BASS, snare: DUB_SNARE, chords: DARK_TOP },
  sambass: { percussion: LATIN_PERC, bass: { low: { hz: 75, gainDb: 2 } } },
  /* ---- Electronic: dubstep / bass ---------------------------------------- */
  dubstep: { bass: DUB_BASS, snare: DUB_SNARE, chords: DARK_TOP },
  brostep: { bass: DRIVEN_BASS, chords: SATURATED_GUITAR, lead: DRIVEN_LEAD },
  riddim: { bass: DRIVEN_BASS, chords: SATURATED_GUITAR },
  "melodic-dubstep": { chords: AMBIENT_PAD, bass: DUB_BASS },
  "future-garage": { chords: AMBIENT_PAD, snare: { high: { hz: 7000, gainDb: 2 } } },
  "post-dubstep": { chords: AMBIENT_PAD, bass: DUB_BASS },
  "tearout-dubstep": { bass: DRIVEN_BASS, chords: SATURATED_GUITAR, kick: DRIVEN_KICK },
  chillstep: { chords: AMBIENT_PAD, bass: { low: { hz: 70, gainDb: 2 } } },
  deathstep: { bass: DRIVEN_BASS, chords: SATURATED_GUITAR, kick: DRIVEN_KICK, lead: DRIVEN_LEAD },
  /* ---- Electronic: future bass / retro / chill --------------------------- */
  "future-bass": { chords: { high: { hz: 9000, gainDb: 1.5 }, compRatio: 2 }, lead: POP_LEAD },
  "kawaii-future-bass": { chords: { high: { hz: 10000, gainDb: 2 } }, lead: POP_LEAD },
  // Stereo width opt-in (see the block above `GENRE_INSERT`'s first category): the sustained lanes only.
  synthwave: { chords: { ...WARM_DRIVE, width: 0.3 }, bass: { low: { hz: 75, gainDb: 2 } }, lead: { ...POP_LEAD, width: 0.25 }, fx: { width: 0.3 } },
  vaporwave: { chords: LOFI_TAPE, lead: LOFI_TAPE, snare: DARK_TOP },
  chillwave: { chords: AMBIENT_PAD, lead: { high: { hz: 8000, gainDb: -2 } } },
  downtempo: { chords: AMBIENT_PAD, bass: { low: { hz: 70, gainDb: 2 } } },
  "trip-hop": { chords: LOFI_TAPE, snare: DARK_TOP, bass: { low: { hz: 65, gainDb: 2.5 } } },
  "glitch-hop": { chords: AMBIENT_PAD, snare: { compRatio: 3.5, compThresholdDb: -14 } },
  idm: { chords: AMBIENT_PAD, percussion: { high: { hz: 9000, gainDb: 2 } } },
  ambient: { chords: AMBIENT_PAD, lead: AMBIENT_PAD, percussion: { compRatio: 1.5 } },
  "ambient-dub": { chords: AMBIENT_PAD, bass: DUB_BASS, snare: DUB_SNARE },
  "lofi-house": { chords: LOFI_TAPE, kick: CLUB_KICK, snare: LOFI_TAPE },
  chiptune: { chords: { high: { hz: 10000, gainDb: 2 }, compRatio: 3 }, lead: { compRatio: 3 } },
  /* ---- Electronic: hardcore / club hybrids ------------------------------- */
  hardstyle: { kick: DRIVEN_KICK, chords: SATURATED_GUITAR, lead: DRIVEN_LEAD },
  "hardcore-gabber": { kick: DRIVEN_KICK, snare: { compRatio: 5, compThresholdDb: -12 }, chords: SATURATED_GUITAR },
  frenchcore: { kick: DRIVEN_KICK, chords: SATURATED_GUITAR },
  "happy-hardcore": { kick: CLUB_KICK, chords: WARM_DRIVE, lead: POP_LEAD },
  moombahton: { kick: CLUB_KICK, bass: { low: { hz: 60, gainDb: 2.5 } } },
  "jersey-club": { kick: CLUB_KICK, percussion: LATIN_PERC },
  footwork: { kick: CLUB_KICK, snare: { compRatio: 4, compThresholdDb: -14 } },
  phonk: { bass: TRAP_808, chords: LOFI_TAPE, snare: DARK_TOP },
  "drift-phonk": { bass: TRAP_808, chords: LOFI_TAPE },
  electro: { kick: CLUB_KICK, chords: WARM_DRIVE, snare: { compRatio: 4, compThresholdDb: -14 } },
  breakbeat: { kick: CLUB_KICK, snare: { compRatio: 3.5, compThresholdDb: -14 }, bass: DRIVEN_BASS },
  "big-beat": { kick: CLUB_KICK, chords: CRUNCH_GUITAR, bass: DRIVEN_BASS },
  /* ---- Electronic: house ------------------------------------------------- */
  /**
   * ---- Stereo width opt-ins (2026-09-24) ----------------------------------------
   *
   * The seven genres whose channel correlation measured above 0.98, given the strip's stereo-spread stage on the
   * sustained lanes (chords/lead/fx — never kick, bass or snare, which stay centred). This is the shape the audio
   * review asked for, "stereo detune, chorus, stereo delay", and the one the two cheaper routes could not produce:
   * panning the same lanes tears the image apart by ear (and the pans were already past the range it recommends),
   * and GS-1's unison spread is detune-only with its sub-voices summed to mono. Measured on the review's own band
   * analysis: mid-band side/mid −27.9 → −22.4 dB, mono fold loss 0.0002 dB.
   *
   * Plainly about the metric: this **does not move `narrowStereo`** (chicago-house 0.98100 → 0.98069), because that
   * claim is dominated by the centred low end. A genre that sounds wider and measures the same is the honest
   * outcome, not a trick to make a number move — which is why the budget stays at 7.
   *
   * The other six opt-ins live with their category: `detroit-techno`, `minimal-techno`, `synthwave` (Electronic),
   * `trap-rap` (Hip Hop), `reggaeton` (Latin/World) and `disco` (Pop/R&B).
   */
  "chicago-house": { kick: CLUB_KICK, chords: { ...WARM_DRIVE, width: 0.3 }, snare: WARM_DRIVE, lead: { width: 0.25 }, fx: { width: 0.3 } },
  "deep-house": { kick: CLUB_KICK, chords: { compRatio: 2, high: { hz: 9000, gainDb: 1 } }, bass: { low: { hz: 70, gainDb: 2 } } },
  "tech-house": { kick: CLUB_KICK, chords: WARM_DRIVE, hihat: { compRatio: 3, compThresholdDb: -22 } },
  "future-house": { kick: CLUB_KICK, chords: WARM_DRIVE, lead: POP_LEAD },
  "progressive-house": { kick: CLUB_KICK, chords: AMBIENT_PAD, lead: POP_LEAD },
  "electro-house": { kick: CLUB_KICK, chords: CRUNCH_GUITAR, bass: DRIVEN_BASS, lead: DRIVEN_LEAD },
  "bass-house": { kick: CLUB_KICK, bass: DRIVEN_BASS, chords: DARK_TOP },
  "ghetto-house": { kick: CLUB_KICK, snare: { compRatio: 3.5, compThresholdDb: -14 }, bass: { low: { hz: 65, gainDb: 2.5 } } },
  "tropical-house": { percussion: LATIN_PERC, chords: WARM_DRIVE, lead: POP_LEAD },
  "acid-house": { lead: ACID_LEAD, kick: CLUB_KICK, chords: WARM_DRIVE },
  "french-house": { kick: CLUB_KICK, chords: WARM_DRIVE, lead: { compRatio: 3, compThresholdDb: -16 } },
  "melodic-house": { kick: CLUB_KICK, chords: AMBIENT_PAD, lead: POP_LEAD },
  "afro-house": { percussion: LATIN_PERC, kick: CLUB_KICK, bass: { low: { hz: 70, gainDb: 2.5 } } },
  "nu-disco-house": { kick: CLUB_KICK, chords: WARM_DRIVE, bass: { low: { hz: 80, gainDb: 2 } } },
  microhouse: { kick: CLUB_KICK, chords: AMBIENT_PAD, hihat: { high: { hz: 11000, gainDb: 2 } } },
  /* ---- Electronic: techno ------------------------------------------------ */
  "detroit-techno": { kick: CLUB_KICK, chords: { ...WARM_DRIVE, width: 0.3 }, percussion: { high: { hz: 9000, gainDb: 2 } }, lead: { width: 0.25 }, fx: { width: 0.3 } },
  "minimal-techno": { kick: CLUB_KICK, chords: { ...AMBIENT_PAD, width: 0.3 }, hihat: { compRatio: 2.5 }, lead: { width: 0.25 }, fx: { width: 0.3 } },
  "acid-techno": { lead: ACID_LEAD, kick: CLUB_KICK, bass: { mid: { hz: 500, gainDb: -2.5 } } },
  "dub-techno": { kick: CLUB_KICK, bass: DUB_BASS, chords: DARK_TOP, snare: DUB_SNARE },
  "industrial-techno": { kick: DRIVEN_KICK, chords: SATURATED_GUITAR, snare: { compRatio: 5 } },
  "peak-time-techno": { kick: DRIVEN_KICK, bass: DRIVEN_BASS, chords: DARK_TOP },
  "hard-techno": { kick: DRIVEN_KICK, bass: DRIVEN_BASS, chords: SATURATED_GUITAR },
  "ambient-techno": { kick: CLUB_KICK, chords: AMBIENT_PAD, hihat: { high: { hz: 10000, gainDb: 2 } } },
  "raw-techno": { kick: DRIVEN_KICK, snare: { compRatio: 4, compThresholdDb: -14 }, chords: DARK_TOP },
  schranz: { kick: DRIVEN_KICK, snare: { compRatio: 5, compThresholdDb: -12 }, chords: SATURATED_GUITAR },
  /* ---- Electronic: trance ------------------------------------------------ */
  "uplifting-trance": { kick: CLUB_KICK, chords: AMBIENT_PAD, lead: POP_LEAD },
  "progressive-trance": { kick: CLUB_KICK, chords: AMBIENT_PAD, lead: { compRatio: 3, compThresholdDb: -16 } },
  psytrance: { kick: DRIVEN_KICK, bass: { mid: { hz: 500, gainDb: -2.5 } }, lead: ACID_LEAD },
  "goa-trance": { kick: CLUB_KICK, lead: ACID_LEAD, chords: AMBIENT_PAD },
  "tech-trance": { kick: DRIVEN_KICK, chords: AMBIENT_PAD, lead: POP_LEAD },
  "hard-trance": { kick: DRIVEN_KICK, chords: SATURATED_GUITAR, lead: DRIVEN_LEAD },
  "vocal-trance": { kick: CLUB_KICK, chords: AMBIENT_PAD, lead: POP_LEAD },
  "euro-trance": { kick: CLUB_KICK, chords: WARM_DRIVE, lead: POP_LEAD },
  "dream-trance": { kick: CLUB_KICK, chords: AMBIENT_PAD, lead: { high: { hz: 9000, gainDb: 2 } } },
  /* ---- Electronic: trap / drill / UK ------------------------------------- */
  "edm-trap": { bass: TRAP_808, kick: CLUB_KICK, lead: POP_LEAD },
  "hard-trap": { bass: TRAP_808, chords: SATURATED_GUITAR, kick: DRIVEN_KICK },
  "hybrid-trap": { bass: TRAP_808, chords: AMBIENT_PAD, lead: POP_LEAD },
  wave: { bass: TRAP_808, chords: AMBIENT_PAD, snare: DARK_TOP },
  "chicago-drill": { bass: TRAP_808, chords: DARK_TOP, lead: { high: { hz: 8000, gainDb: -2 } } },
  "uk-drill": { bass: TRAP_808, chords: { high: { hz: 7000, gainDb: -3 } }, lead: { high: { hz: 8000, gainDb: -2 } } },
  "brooklyn-drill": { bass: TRAP_808, chords: DARK_TOP, kick: { compRatio: 4.5 } },
  "jersey-drill": { bass: TRAP_808, chords: { compRatio: 2.5 }, snare: { high: { hz: 7000, gainDb: -2.5 } } },
  "uk-garage": { bass: { low: { hz: 65, gainDb: 2.5 } }, snare: { high: { hz: 8000, gainDb: 1.5 } } },
  "2-step-garage": { bass: DUB_BASS, chords: { compRatio: 2.5 } },
  "speed-garage": { bass: { low: { hz: 70, gainDb: 2.5 } }, lead: POP_LEAD },
  grime: { bass: DUB_BASS, chords: DARK_TOP, snare: { compRatio: 4 } },
  bassline: { bass: DRIVEN_BASS, chords: WARM_DRIVE },
  "uk-funky": { percussion: LATIN_PERC, bass: { low: { hz: 70, gainDb: 2 } } },
  dub: { bass: DUB_BASS, snare: DUB_SNARE, chords: DARK_TOP, percussion: DARK_TOP },
  speedbass: { kick: DRIVEN_KICK, bass: DRIVEN_BASS },

  /* ---- Hip Hop ----------------------------------------------------------- */
  // Sampled, warm, drum-forward; the 808 is the bass instrument in the modern styles.
  "old-school-hip-hop": { snare: { compRatio: 3.5, compThresholdDb: -14 }, bass: { low: { hz: 75, gainDb: 2 } } },
  "boom-bap": { kick: { compRatio: 4.5, compThresholdDb: -12 }, snare: { compRatio: 3.5 }, bass: { low: { hz: 75, gainDb: 2 } } },
  "g-funk": { bass: { low: { hz: 65, gainDb: 2.5 } }, lead: { high: { hz: 9000, gainDb: 1.5 } } },
  "trap-rap": { bass: TRAP_808, hihat: { compRatio: 3, compThresholdDb: -22 }, kick: { compRatio: 4.5 }, chords: { width: 0.3 }, lead: { width: 0.25 }, fx: { width: 0.3 } },
  "conscious-hip-hop": { bass: { low: { hz: 75, gainDb: 2 } }, chords: JAZZ_CLEAN },
  "emo-rap": { bass: TRAP_808, chords: { high: { hz: 8500, gainDb: 1.5 } }, lead: POP_LEAD },
  "lofi-hip-hop": { chords: LOFI_TAPE, snare: LOFI_TAPE, bass: { low: { hz: 70, gainDb: 2 } } },
  "east-coast-hip-hop": { kick: { compRatio: 4.5 }, bass: { low: { hz: 75, gainDb: 2 } }, snare: { compRatio: 3.5 } },
  "west-coast-hip-hop": { bass: { low: { hz: 65, gainDb: 2.5 } }, lead: { high: { hz: 9000, gainDb: 1.5 } } },
  "southern-hip-hop": { bass: TRAP_808, kick: { compRatio: 4.5 } },
  "cloud-rap": { bass: TRAP_808, chords: LOFI_TAPE, lead: { high: { hz: 8000, gainDb: -2 } } },

  /* ---- Jazz / Blues ------------------------------------------------------ */
  // The category where "less processing" is the correct answer: no drive anywhere, and the
  // role defaults' mid cut is eased because the comping instrument *is* the harmony.
  "delta-blues": { chords: { compRatio: 2, mid: { gainDb: -0.5 }, driveEnabled: false }, bass: JAZZ_BASS },
  "chicago-blues": { chords: { driveEnabled: true, driveAmount: 1.8, driveMix: 0.35, mid: { gainDb: -1 } }, bass: JAZZ_BASS },
  "texas-blues": { chords: { driveEnabled: true, driveAmount: 1.8, driveMix: 0.35, mid: { gainDb: -1 } }, bass: JAZZ_BASS },
  "electric-blues": { chords: CRUNCH_GUITAR, lead: { driveEnabled: true, driveAmount: 2.5, driveMix: 0.4 }, bass: JAZZ_BASS },
  "traditional-jazz": { chords: JAZZ_CLEAN, bass: JAZZ_BASS, percussion: { compRatio: 2 } },
  bebop: { chords: JAZZ_CLEAN, bass: JAZZ_BASS, snare: { compRatio: 2.5, compThresholdDb: -14 } },
  "hard-bop": { chords: JAZZ_CLEAN, bass: JAZZ_BASS, snare: { compRatio: 3, compThresholdDb: -14 } },
  "cool-jazz": { chords: JAZZ_CLEAN, bass: JAZZ_BASS, hihat: { high: { hz: 8000, gainDb: -1.5 } } },
  "modal-jazz": { chords: JAZZ_CLEAN, bass: JAZZ_BASS },
  "free-jazz": { chords: { compEnabled: false, driveEnabled: false }, bass: { compEnabled: false, driveEnabled: false } },
  "jazz-fusion": { chords: { driveEnabled: true, driveAmount: 1.6, driveMix: 0.35 }, lead: { driveEnabled: true, driveAmount: 1.8, driveMix: 0.35 }, bass: { low: { hz: 75, gainDb: 2 } } },
  "smooth-jazz": { chords: JAZZ_CLEAN, bass: JAZZ_BASS, lead: { mid: { hz: 2800, gainDb: 2 }, compRatio: 3 } },
  "acid-jazz": { chords: JAZZ_CLEAN, bass: JAZZ_BASS, lead: ACID_LEAD },
  "gypsy-jazz": { chords: { compRatio: 2, mid: { gainDb: -0.5 }, driveEnabled: false }, bass: JAZZ_BASS },

  /* ---- Latin / World ----------------------------------------------------- */
  // Percussion-led: the kit/percussion channel carries the genre, so it gets the presence.
  salsa: { percussion: LATIN_PERC, bass: { low: { hz: 80, gainDb: 2 } }, chords: WARM_DRIVE },
  bachata: { percussion: LATIN_PERC, chords: CRUNCH_GUITAR, bass: { low: { hz: 80, gainDb: 2 } } },
  reggae: { bass: DUB_BASS, snare: DUB_SNARE, chords: DARK_TOP, percussion: DARK_TOP },
  dancehall: { bass: DUB_BASS, percussion: LATIN_PERC, snare: { high: { hz: 8000, gainDb: 1.5 } } },
  reggaeton: { bass: TRAP_808, percussion: LATIN_PERC, kick: { compRatio: 4.5 }, chords: { width: 0.3 }, lead: { width: 0.25 }, fx: { width: 0.3 } },
  afrobeat: { percussion: LATIN_PERC, bass: { low: { hz: 70, gainDb: 2.5 } }, chords: WARM_DRIVE },
  amapiano: { bass: { low: { hz: 50, gainDb: 3 }, compReleaseSec: 0.25 }, percussion: LATIN_PERC, chords: AMBIENT_PAD },
  "bossa-nova": { chords: JAZZ_CLEAN, bass: JAZZ_BASS, percussion: { high: { hz: 9000, gainDb: 1.5 }, compRatio: 2 } },
  samba: { percussion: LATIN_PERC, bass: { low: { hz: 80, gainDb: 2 } } },
  cumbia: { percussion: LATIN_PERC, chords: WARM_DRIVE },
  kuduro: { kick: CLUB_KICK, percussion: LATIN_PERC, bass: { low: { hz: 65, gainDb: 2.5 } } },

  /* ---- Pop / R&B --------------------------------------------------------- */
  // Topline-first: the lead gets the presence lift, everything else stays out of its way.
  "traditional-pop": { lead: POP_LEAD, chords: WARM_DRIVE },
  "synth-pop": { chords: WARM_DRIVE, lead: POP_LEAD, snare: { high: { hz: 8000, gainDb: 2 } } },
  disco: { kick: CLUB_KICK, chords: { ...WARM_DRIVE, width: 0.3 }, bass: { low: { hz: 80, gainDb: 2 }, mid: { hz: 600, gainDb: -2 } }, lead: { width: 0.25 }, fx: { width: 0.3 } },
  eurodance: { kick: CLUB_KICK, chords: WARM_DRIVE, lead: POP_LEAD },
  funk: { chords: { driveEnabled: true, driveAmount: 1.5, driveMix: 0.3 }, bass: { low: { hz: 80, gainDb: 2 }, compRatio: 4, compAttackSec: 0.01 }, snare: { high: { hz: 8000, gainDb: 2 } } },
  soul: { chords: JAZZ_CLEAN, bass: { low: { hz: 80, gainDb: 1.5 } }, lead: POP_LEAD },
  "neo-soul": { chords: JAZZ_CLEAN, bass: { low: { hz: 80, gainDb: 1.5 } }, lead: { mid: { hz: 2800, gainDb: 2 }, compRatio: 3 } },
  "contemporary-rnb": { bass: TRAP_808, chords: AMBIENT_PAD, lead: POP_LEAD },
  "alternative-rnb": { bass: TRAP_808, chords: AMBIENT_PAD, lead: { high: { hz: 8500, gainDb: -1.5 } } },
  motown: { chords: JAZZ_CLEAN, bass: { low: { hz: 80, gainDb: 1.5 } }, snare: { high: { hz: 8000, gainDb: 2 } } },
  "city-pop": { chords: WARM_DRIVE, bass: { low: { hz: 80, gainDb: 2 } }, lead: POP_LEAD },
  "k-pop": { chords: WARM_DRIVE, lead: POP_LEAD, kick: CLUB_KICK },
  "j-pop": { chords: WARM_DRIVE, lead: POP_LEAD, bass: { low: { hz: 80, gainDb: 2 } } },

  /* ---- Rock / Metal ------------------------------------------------------ */
  // The clearest case for this layer: the role default for `chords` is a clean pad, and the
  // instrument on that track is a distorted guitar. Drive is what makes it audible.
  "rock-and-roll": { chords: { driveEnabled: true, driveAmount: 1.6, driveMix: 0.3 }, lead: { driveEnabled: true, driveAmount: 1.8, driveMix: 0.35 }, bass: { low: { hz: 90, gainDb: 2 } } },
  "blues-rock": { chords: CRUNCH_GUITAR, lead: { driveEnabled: true, driveAmount: 2.5, driveMix: 0.4 }, bass: DRIVEN_BASS },
  "hard-rock": { chords: { ...SATURATED_GUITAR, driveAmount: 3.8 }, lead: DRIVEN_LEAD, bass: DRIVEN_BASS },
  "punk-rock": { chords: CRUNCH_GUITAR, bass: DRIVEN_BASS, kick: { compRatio: 4.5, compThresholdDb: -10 }, snare: { compRatio: 4 } },
  "post-punk": { chords: { ...CRUNCH_GUITAR, driveAmount: 2 }, lead: { driveEnabled: true, driveAmount: 2, driveMix: 0.4 }, bass: { low: { hz: 80, gainDb: 2.5 }, mid: { hz: 600, gainDb: -2.5 } } },
  "new-wave": { chords: WARM_DRIVE, lead: { driveEnabled: true, driveAmount: 2, driveMix: 0.4 }, snare: { high: { hz: 8000, gainDb: 2 } } },
  "heavy-metal": { chords: SATURATED_GUITAR, lead: DRIVEN_LEAD, bass: DRIVEN_BASS, kick: { compRatio: 4.5, compThresholdDb: -11 }, snare: { compRatio: 4, compThresholdDb: -13 } },
  "thrash-metal": { chords: { ...SATURATED_GUITAR, driveAmount: 5 }, lead: DRIVEN_LEAD, bass: DRIVEN_BASS, kick: { compRatio: 5, compThresholdDb: -10 } },
  "death-metal": { chords: { ...SATURATED_GUITAR, driveAmount: 5 }, lead: DRIVEN_LEAD, bass: DRIVEN_BASS, kick: CLUB_KICK },
  "black-metal": { chords: { ...SATURATED_GUITAR, driveAmount: 5, high: { hz: 10000, gainDb: 2 } }, lead: { ...DRIVEN_LEAD, high: { hz: 10000, gainDb: 2 } }, bass: DRIVEN_BASS },
  "doom-metal": { chords: { ...SATURATED_GUITAR, driveAmount: 4, compReleaseSec: 0.3, compAttackSec: 0.01 }, lead: { ...DRIVEN_LEAD, compReleaseSec: 0.3 }, bass: DRIVEN_BASS },
  metalcore: { chords: SATURATED_GUITAR, lead: DRIVEN_LEAD, bass: DRIVEN_BASS, kick: CLUB_KICK },
  grunge: { chords: CRUNCH_GUITAR, lead: { driveEnabled: true, driveAmount: 2.5, driveMix: 0.4 }, bass: { low: { hz: 75, gainDb: 2.5 } } },
  "alternative-rock": { chords: CRUNCH_GUITAR, lead: { driveEnabled: true, driveAmount: 2.5, driveMix: 0.4 }, bass: DRIVEN_BASS },
  "progressive-rock": { chords: { driveEnabled: true, driveAmount: 1.8, driveMix: 0.35 }, lead: { driveEnabled: true, driveAmount: 2.5, driveMix: 0.4 }, bass: { low: { hz: 80, gainDb: 2 } } },
  "math-rock": { chords: { ...CRUNCH_GUITAR, driveAmount: 2.8 }, lead: { driveEnabled: true, driveAmount: 2.5, driveMix: 0.4 }, bass: DRIVEN_BASS },
  "shoe-gaze": { chords: { driveEnabled: true, driveAmount: 3, driveMix: 0.5, high: { hz: 9000, gainDb: 1.5 }, compRatio: 2 }, lead: { driveEnabled: true, driveAmount: 3, driveMix: 0.5, high: { hz: 9000, gainDb: 1.5 } } },
};

/* ------------------------------------------------------------------------- *
 * Resolution
 * ------------------------------------------------------------------------- */

/** Copy a patch's band onto a resolved band, leaving untouched fields alone. */
function mergeBand(base: TrackEqBand, patch: Partial<TrackEqBand> | undefined): TrackEqBand {
  return patch ? { ...base, ...patch } : { ...base };
}

/** Apply a partial patch to a full chain, returning a fresh object. */
export function applyInsertPatch(
  base: TrackInsertParams,
  patch: TrackInsertPatch | undefined
): TrackInsertParams {
  const out: TrackInsertParams = {
    ...base,
    low: mergeBand(base.low, patch?.low),
    mid: mergeBand(base.mid, patch?.mid),
    high: mergeBand(base.high, patch?.high),
    // The resolved contract always carries `width` (0 when nobody asked), so a genre-resolved chain and a strip's own
    // params are the same shape — the property the wiring cases compare.
    width: patch?.width ?? base.width ?? 0,
  };
  if (!patch) return out;
  for (const [key, value] of Object.entries(patch) as [keyof TrackInsertPatch, unknown][]) {
    if (value === undefined || key === "low" || key === "mid" || key === "high") continue;
    (out as unknown as Record<string, unknown>)[key] = value;
  }
  return out;
}

/**
 * The resolved chain for one role in one genre: the role default with the genre's patch on
 * top. Total — an unknown genre id, a null id (custom genres) or a role with no patch all
 * fall back to the role default rather than returning nothing.
 */
export function resolveTrackInsertForGenre(
  role: MixTrackId | string | null | undefined,
  genreId?: string | null
): TrackInsertParams {
  const key = (typeof role === "string" ? role : "") as MixTrackId;
  const base =
    ROLE_INSERT_DEFAULTS[key] !== undefined
      ? ROLE_INSERT_DEFAULTS[key]
      : ROLE_INSERT_DEFAULTS.chords;
  const patch = genreId ? GENRE_INSERT[genreId]?.[key] : undefined;
  return applyInsertPatch(base, patch);
}

/** True when this genre declares any patch at all — used by gates and the inspector. */
export function hasGenreInsert(genreId: string | null | undefined): boolean {
  return Boolean(genreId && GENRE_INSERT[genreId]);
}

/** The role names a patch may target, for gates and the inspector's copy. */
export const GENRE_INSERT_ROLES: readonly MixTrackId[] = [
  "kick",
  "snare",
  "hihat",
  "percussion",
  "bass",
  "chords",
  "lead",
  "fx",
] as const;
