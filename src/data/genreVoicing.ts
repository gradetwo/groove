/**
 * Genre-appropriate chord voicing — which *kind* of chord each genre plays (E-01 follow-up).
 *
 * ## Why this table exists rather than reading the genre data
 *
 * The obvious source would be the genre records' own `common_chords`. It is unusable:
 * **all 159 genres carry one of only two identical strings** (`i–VI–III–VII` and
 * `i–v–VI–VII`), across every category including Jazz/Blues. So the data cannot tell
 * bebop from death metal, and a generic diatonic 1-3-5 was the inevitable result of
 * trusting it. (This is the same class of defect the instrumentation field had before
 * N-12 replaced "159 copies of one placeholder" with 159 real lists; `common_chords`
 * is still in the old state and is registered as a follow-up.)
 *
 * The genre-appropriate choice therefore lives here, keyed by `genre_id`, resolved
 * exactly like `src/data/genreMix.ts` does for volume/pan/sends:
 *
 *   1. `CATEGORY_VOICING` — one musically authored default per category.
 *   2. `GENRE_VOICING`    — hand-authored deviations, each carrying its reason inline.
 *   3. `resolveVoicingStyle(genreId, instrument)` — the function callers use. For
 *      user-created genres (no entry) it falls back to the chords track's instrument, so
 *      a custom genre built on `guitar_lead` still gets power chords.
 *
 * ## The musical reasoning, in one line each
 *
 * - **power** (root + 5th, no 3rd): the third is what makes a chord major or minor; rock
 *   and metal remove it deliberately. Under distortion the third's intermodulation
 *   products are what turn a chord to mush, so thirdless is not a simplification — it is
 *   the sound.
 * - **shell / extended** (3rd + 7th, often no 5th, plus 9th): jazz comping keeps the
 *   guide tones and leaves the midrange to the soloist.
 * - **quartal** (stacked fourths): modal and free jazz, and the modern cinematic pad.
 * - **seventh**: blues, soul, disco, funk, boom-bap — the dominant 7th is the idiom.
 * - **sus / open**: ambient, dub and shoegaze want an unresolved, thirdless wash.
 * - **add9**: pop, city pop and trance lift without a 7th's functional pull.
 * - **triad**: the functional default for dance and pop writing.
 */
import { GenreCategory } from "../types/genre";
import type { VoicingStyle } from "../audio/chordVoicing";

/** Category defaults. Anchored on what each category's repertoire actually comps with. */
export const CATEGORY_VOICING: Record<GenreCategory, VoicingStyle> = {
  Electronic: "triad",
  "Hip Hop": "seventh",
  "Jazz/Blues": "extended",
  "Latin/World": "triad",
  "Pop/R&B": "add9",
  "Rock/Metal": "power",
};

export interface GenreVoicingOverride {
  style: VoicingStyle;
  /** Why this genre steps away from its category default. Required, not optional. */
  reason: string;
}

/**
 * Per-genre deviations. Every entry carries its reason, so a future reader can tell a
 * deliberate musical decision from a typo.
 */
export const GENRE_VOICING: Record<string, GenreVoicingOverride> = {
  // ---- Rock / Metal: the power-chord family -------------------------------------
  "rock-and-roll": { style: "triad", reason: "50s rock'n'roll is major triads and I-IV-V, not power chords." },
  "blues-rock": { style: "seventh", reason: "Dominant 7th is the blues idiom the genre is named for." },
  "hard-rock": { style: "power", reason: "Category default; thirdless root-fifth is the riffing sound." },
  "punk-rock": { style: "power", reason: "Category default; downstroked power chords." },
  "post-punk": { style: "triad", reason: "Chorus-and-jangle guitars voice full triads rather than power chords." },
  "new-wave": { style: "add9", reason: "New wave's bright synth/guitar pads lean on added 9ths." },
  "heavy-metal": { style: "power", reason: "Category default." },
  "thrash-metal": { style: "power", reason: "Category default; fast palm-muted root-fifth." },
  "death-metal": { style: "power", reason: "Category default; heavily distorted thirdless voicings." },
  "black-metal": { style: "power", reason: "Tremolo riffing is typically bare root-fifth." },
  "doom-metal": { style: "power", reason: "Category default, slowed down; the third would muddy the low end." },
  metalcore: { style: "power", reason: "Category default; breakdown chugs are thirdless." },
  grunge: { style: "power", reason: "Category default; distorted root-fifth is the genre's core texture." },
  "alternative-rock": { style: "triad", reason: "Cleaner, song-driven guitar writing voices full triads." },
  "progressive-rock": { style: "extended", reason: "Prog comps with 7ths/9ths and extended harmony." },
  "math-rock": { style: "extended", reason: "Clean tapped guitar lines are built on extended, often quartal shapes." },
  "shoe-gaze": { style: "open", reason: "The wall-of-sound tremolo wall is wide and deliberately thirdless." },

  // ---- Jazz / Blues -------------------------------------------------------------
  "delta-blues": { style: "seventh", reason: "The dominant 7th is the blues idiom this genre is built on." },
  "chicago-blues": { style: "seventh", reason: "Dominant 7th; the electric blues band comps on it." },
  "texas-blues": { style: "seventh", reason: "Dominant 7th shuffle." },
  "electric-blues": { style: "seventh", reason: "Dominant 7th, played on an overdriven electric guitar." },
  "traditional-jazz": { style: "seventh", reason: "Dixieland/swing comps with 7th chords before bebop extensions." },
  bebop: { style: "extended", reason: "Category default; bebop harmony is 7ths plus 9ths and alterations." },
  "hard-bop": { style: "extended", reason: "Category default." },
  "cool-jazz": { style: "extended", reason: "Category default; restrained but still extended." },
  "modal-jazz": { style: "quartal", reason: "Modal jazz is defined by quartal voicings (the 'So What' chords) rather than stacked thirds." },
  "free-jazz": { style: "quartal", reason: "Quartal and cluster shapes avoid functional tertian harmony." },
  "jazz-fusion": { style: "extended", reason: "Category default; electric fusion comps on extended chords." },
  "smooth-jazz": { style: "seventh", reason: "Smooth jazz stays on 7ths rather than bebop extensions." },
  "acid-jazz": { style: "seventh", reason: "Acid jazz is funk-first: dominant 7ths and 9ths, not bebop alterations." },
  "gypsy-jazz": { style: "seventh", reason: "Manouche comping is 6/9 and dominant 7th shapes." },

  // ---- Hip Hop ------------------------------------------------------------------
  "old-school-hip-hop": { style: "seventh", reason: "Category default; soul/funk sample vocabulary." },
  "boom-bap": { style: "seventh", reason: "Category default; jazzy 7th-chord loops." },
  "g-funk": { style: "seventh", reason: "Category default; whiny lead over 7th chords." },
  "trap-rap": { style: "triad", reason: "Trap keys are sparse minor triads; a 7th muddies the 808." },
  "cloud-rap": { style: "triad", reason: "Sparse, reverb-drenched triads." },
  "emo-rap": { style: "triad", reason: "Guitar/synth loops are plain minor triads." },
  "southern-hip-hop": { style: "triad", reason: "Simple minor triads under the 808." },
  "east-coast-hip-hop": { style: "seventh", reason: "Category default; soul-jazz sample vocabulary." },
  "west-coast-hip-hop": { style: "seventh", reason: "Category default." },
  "conscious-hip-hop": { style: "seventh", reason: "Category default; soul/jazz sample vocabulary." },
  "lofi-hip-hop": { style: "seventh", reason: "Category default; Rhodes 7th chords are the genre's signature." },

  // ---- Electronic ---------------------------------------------------------------
  ambient: { style: "sus", reason: "Ambient avoids a defined third: suspended, unresolved, non-functional." },
  "ambient-dub": { style: "sus", reason: "Same as ambient, with the dub delay carrying the movement." },
  "ambient-techno": { style: "sus", reason: "Suspended pads sit under the pulse without asserting a mode." },
  "dub-techno": { style: "triad", reason: "Dub-techno stabs are minor triads drenched in delay." },
  dub: { style: "triad", reason: "Dub organ/skank chords are minor triads; the delay is the effect, not the harmony." },
  "deep-house": { style: "seventh", reason: "Deep house's Rhodes/organ pads are 7th chords." },
  "chicago-house": { style: "seventh", reason: "Classic Chicago house piano/organ stabs are 7th chords." },
  "lofi-house": { style: "seventh", reason: "7th-chord Rhodes loops." },
  "nu-disco-house": { style: "seventh", reason: "Disco vocabulary: 7ths and 6/9s." },
  "french-house": { style: "seventh", reason: "Filtered disco/funk 7th stabs." },
  "uk-garage": { style: "seventh", reason: "Garage's shuffled organ/piano chords are 7ths." },
  "2-step-garage": { style: "seventh", reason: "Garage's shuffled organ and piano chords are voiced as 7ths." },
  "speed-garage": { style: "seventh", reason: "Same shuffled 7th-chord organ vocabulary as UK garage, faster." },
  "future-garage": { style: "seventh", reason: "As UK garage, plus extended pads." },
  synthwave: { style: "add9", reason: "Synthwave pads are wide add9/sus shapes, not functional 7ths." },
  chillwave: { style: "add9", reason: "Hazy, wide add9 pads." },
  vaporwave: { style: "add9", reason: "Slowed 80s pop vocabulary: add9 and maj7 washes." },
  wave: { style: "open", reason: "Wave's signature is a wide, dark, thirdless pad wall." },
  "uplifting-trance": { style: "add9", reason: "Trance pads lift on added 9ths without a 7th's pull." },
  "progressive-trance": { style: "add9", reason: "As uplifting trance." },
  "vocal-trance": { style: "add9", reason: "As uplifting trance." },
  "euro-trance": { style: "add9", reason: "As uplifting trance." },
  "dream-trance": { style: "add9", reason: "As uplifting trance." },
  psytrance: { style: "triad", reason: "Psytrance stabs are plain minor triads against a rolling bass." },
  "goa-trance": { style: "triad", reason: "Plain minor triads stabbing against a rolling bassline." },
  "tech-trance": { style: "triad", reason: "Techno-leaning: functional minor triads." },
  "hard-trance": { style: "triad", reason: "Techno-leaning hard trance keeps functional minor triads." },
  "progressive-house": { style: "add9", reason: "Progressive house pads favour add9 colour." },
  "melodic-house": { style: "add9", reason: "Melodic house/techno leads sit on add9 pads." },
  "tropical-house": { style: "triad", reason: "Simple, bright triads over the drop." },
  riddim: { style: "power", reason: "Riddim's mid-bass stabs are thirdless power shapes." },
  brostep: { style: "power", reason: "Mid-bass stabs are thirdless power shapes, as in riddim." },
  "tearout-dubstep": { style: "power", reason: "Aggressive thirdless mid-bass stabs; the third would muddy the distortion." },
  deathstep: { style: "power", reason: "As riddim, heavier." },
  "melodic-dubstep": { style: "add9", reason: "Melodic dubstep's emotional chords are add9/sus pads." },
  chillstep: { style: "add9", reason: "As melodic dubstep." },
  idm: { style: "extended", reason: "IDM's harmonic vocabulary is extended and often quartal." },
  "glitch-hop": { style: "seventh", reason: "Soul/funk 7th-chord base, glitched." },
  "trip-hop": { style: "seventh", reason: "Trip-hop's Rhodes/sample base is 7th chords." },
  downtempo: { style: "seventh", reason: "Rhodes-and-sample chord beds voiced as 7ths, like trip-hop." },
  chiptune: { style: "triad", reason: "Limited-voice chip hardware implies plain triads." },
  hardstyle: { style: "power", reason: "Hardstyle screech/lead stabs are thirdless." },
  "hardcore-gabber": { style: "power", reason: "Distorted lead stabs are thirdless, as in hardstyle." },
  frenchcore: { style: "power", reason: "Thirdless distorted stabs; a third would clash with the kick." },
  "happy-hardcore": { style: "power", reason: "Despite the major-key leads, the stabs themselves are thirdless." },
  phonk: { style: "triad", reason: "Dark minor triads over the cowbell." },
  "drift-phonk": { style: "triad", reason: "Dark minor triads over the cowbell, as in phonk." },

  // ---- Pop / R&B ----------------------------------------------------------------
  "traditional-pop": { style: "triad", reason: "Standard functional pop writing." },
  "synth-pop": { style: "add9", reason: "Bright 80s synth pads lean on add9." },
  disco: { style: "seventh", reason: "Disco strings/keys comp on 7ths and 6/9s." },
  eurodance: { style: "triad", reason: "Eurodance stabs are plain triads." },
  funk: { style: "seventh", reason: "Funk is built on dominant 7th and 9th chords." },
  soul: { style: "seventh", reason: "Soul comps on 7ths and 9ths." },
  motown: { style: "seventh", reason: "Motown's house-band vocabulary is 7ths and 6ths." },
  "neo-soul": { style: "extended", reason: "Neo-soul is defined by extended and altered harmony." },
  "contemporary-rnb": { style: "extended", reason: "Modern R&B uses extended, often stacked, voicings." },
  "alternative-rnb": { style: "seventh", reason: "Alt-R&B sits on 7ths and 9ths." },
  "city-pop": { style: "add9", reason: "City pop's signature is maj7/add9 electric piano." },
  "k-pop": { style: "add9", reason: "Bright, chorus-friendly add9 voicings." },
  "j-pop": { style: "add9", reason: "As city pop; J-pop inherited the maj7/add9 vocabulary." },

  // ---- Latin / World ------------------------------------------------------------
  salsa: { style: "triad", reason: "Montuno patterns are triad-based." },
  bachata: { style: "triad", reason: "Requinto/bongo-led; rhythm guitar plays plain triads." },
  reggae: { style: "triad", reason: "Reggae skank chords are minor triads." },
  dancehall: { style: "triad", reason: "Simple minor triads." },
  reggaeton: { style: "triad", reason: "Dembow keys are plain minor triads." },
  afrobeat: { style: "seventh", reason: "Afrobeat's horn/keys writing uses 7ths and 9ths." },
  amapiano: { style: "seventh", reason: "Amapiano's log-drum/piano chords are 7ths and 9ths." },
  "bossa-nova": { style: "extended", reason: "Bossa is defined by maj7/9/11 harmony." },
  samba: { style: "seventh", reason: "Samba harmony uses 7ths and 6/9s." },
  cumbia: { style: "triad", reason: "Cumbia organ/guitar comps on plain triads." },
  kuduro: { style: "triad", reason: "Simple triads over a fast percussion bed." },
};

/**
 * Instrument-derived fallback, for custom genres (which have no `genre_id` entry) and
 * for any genre id that is not in the table.
 *
 * Deliberately coarse: it only distinguishes the families that clearly imply a voicing —
 * a guitar implies thirdless power shapes when the material is rock, a Rhodes/piano/vibes
 * implies 7ths, a pad implies a plain or suspended triad.
 */
const INSTRUMENT_FAMILIES: ReadonlyArray<{ match: RegExp; style: VoicingStyle }> = [
  { match: /rhodes|piano|vibraphone|wurli|ep\b/i, style: "seventh" },
  { match: /guitar|axe/i, style: "power" },
  { match: /pad|supersaw|strings|choir/i, style: "triad" },
  { match: /organ|brass|accordion|marimba/i, style: "triad" },
];

/** Fallback style when neither the genre table nor the instrument says anything. */
export const DEFAULT_VOICING_STYLE: VoicingStyle = "triad";

/**
 * Resolves the voicing style for a genre.
 *
 * `chordInstrument` is the `chords` track's instrument name (e.g. `"warm_pad"`,
 * `"guitar_lead"`); it is only consulted when the genre id is unknown, so a curated
 * genre is never overridden by a heuristic.
 */
export function resolveVoicingStyle(
  genreId: string | null | undefined,
  chordInstrument?: string | null
): VoicingStyle {
  if (genreId) {
    const override = GENRE_VOICING[genreId];
    if (override) return override.style;
  }

  if (chordInstrument) {
    for (const family of INSTRUMENT_FAMILIES) {
      if (family.match.test(chordInstrument)) return family.style;
    }
  }

  return DEFAULT_VOICING_STYLE;
}

/** Every genre id the table covers, for the red-line/consistency gates. */
export function voicedGenreIds(): string[] {
  return Object.keys(GENRE_VOICING);
}
