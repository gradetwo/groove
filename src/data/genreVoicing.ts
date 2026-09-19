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
import {
  CHORD_ARTICULATIONS,
  DEFAULT_CHORD_ARTICULATION,
  type ChordArticulation,
  type ChordTreatment,
  type VoicingStyle,
} from "../audio/chordVoicing";

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

/* -------------------------------------------------------------------------- */
/* Articulation — how the chord is played, not which notes it contains         */
/* -------------------------------------------------------------------------- */

/**
 * Category defaults for articulation.
 *
 * Read alongside `CATEGORY_VOICING`: together they are the "how this category plays
 * chords" answer. Rock/Metal defaults to `stab` because the category's chord sound is a
 * short, palm-muted power chord; Jazz to `comp` because comping is short and spaced;
 * Latin/World to `stab` because the montuno/skank vocabulary is off-beat and clipped.
 */
export const CATEGORY_ARTICULATION: Record<GenreCategory, ChordArticulation> = {
  Electronic: "block",
  "Hip Hop": "block",
  "Jazz/Blues": "comp",
  "Latin/World": "stab",
  "Pop/R&B": "block",
  "Rock/Metal": "stab",
};

export interface GenreArticulationOverride {
  articulation: ChordArticulation;
  /** Why this genre steps away from its category default. Required. */
  reason: string;
}

/**
 * Per-genre articulation overrides.
 *
 * The general rule the table follows, stated once so the entries do not each have to
 * repeat it: **does the chord carry the rhythm or the harmony?** If it carries the
 * rhythm (funk, reggae, house/techno stabs, metal riffs, montuno) it is short and tight;
 * if it carries the harmony (pads, strings, ambient) it rings past the step; if it is a
 * guitar idiom it strums; if it is a jazz idiom it comps.
 */
export const GENRE_ARTICULATION: Record<string, GenreArticulationOverride> = {
  // ---- Electronic: stabs vs pads ------------------------------------------------
  "detroit-techno": { articulation: "stab", reason: "Detroit stabs are clipped off-beat chords, not pads." },
  "minimal-techno": { articulation: "stab", reason: "Sparse clipped stabs are the genre's whole chord vocabulary." },
  "acid-techno": { articulation: "stab", reason: "Short stabs against the 303 line." },
  "dub-techno": { articulation: "stab", reason: "Dub-techno stabs are short; the delay tail supplies the length." },
  "industrial-techno": { articulation: "stab", reason: "Percussive clipped hits." },
  "peak-time-techno": { articulation: "stab", reason: "Peak-time stabs drive the drop." },
  "hard-techno": { articulation: "stab", reason: "Hard techno chords are percussive hits." },
  "raw-techno": { articulation: "stab", reason: "Clipped and dry by design." },
  schranz: { articulation: "stab", reason: "Loop-driven clipped hits." },
  "tech-house": { articulation: "stab", reason: "Tech-house chords are short and rhythmic." },
  "chicago-house": { articulation: "stab", reason: "Classic Chicago house piano/organ stabs are clipped off-beats." },
  "lofi-house": { articulation: "block", reason: "Lofi house lets the Rhodes chords ring." },
  "deep-house": { articulation: "block", reason: "Deep house sustains the Rhodes bed rather than stabbing it." },
  "afro-house": { articulation: "block", reason: "Warm sustained chord bed under the percussion." },
  "nu-disco-house": { articulation: "comp", reason: "Disco guitar/keys comp in short syncopated hits." },
  "french-house": { articulation: "comp", reason: "Filtered disco comping shapes the groove." },
  "progressive-house": { articulation: "sustain", reason: "Progressive house is pad-led; the chord is texture." },
  "melodic-house": { articulation: "sustain", reason: "Melodic house sustains its pads." },
  "tropical-house": { articulation: "stab", reason: "Bright clipped marimba/guitar hits." },
  "bass-house": { articulation: "stab", reason: "Short stabs over the bassline." },
  "ghetto-house": { articulation: "stab", reason: "Raw clipped hits." },
  microhouse: { articulation: "stab", reason: "Microhouse clicks and stabs." },
  "electro-house": { articulation: "stab", reason: "Electro-house stabs are percussive." },
  "future-house": { articulation: "stab", reason: "Future-house chords hit hard and short." },
  "uplifting-trance": { articulation: "sustain", reason: "Trance pads must outlast the bar; the chord is a wall." },
  "progressive-trance": { articulation: "sustain", reason: "As uplifting trance." },
  "vocal-trance": { articulation: "sustain", reason: "As uplifting trance." },
  "euro-trance": { articulation: "sustain", reason: "As uplifting trance." },
  "dream-trance": { articulation: "sustain", reason: "As uplifting trance." },
  psytrance: { articulation: "stab", reason: "Psytrance stabs are short, driving the 16th-note pulse." },
  "goa-trance": { articulation: "sustain", reason: "Goa layers long melodic pads." },
  "tech-trance": { articulation: "stab", reason: "Techno-leaning: rhythmic stabs." },
  "hard-trance": { articulation: "stab", reason: "Hard trance stabs are short and aggressive." },
  ambient: { articulation: "sustain", reason: "Ambient chords must ring far past the step, or there is no ambience." },
  "ambient-dub": { articulation: "sustain", reason: "The pad rings continuously; the dub delay is the movement, not the chord." },
  "ambient-techno": { articulation: "sustain", reason: "Sustained pads sit under the pulse without asserting a rhythm." },
  downtempo: { articulation: "sustain", reason: "Downtempo lets chords ring under the beat." },
  "trip-hop": { articulation: "sustain", reason: "Trip-hop's Rhodes/sample beds sustain." },
  "chillwave": { articulation: "sustain", reason: "Hazy sustained pads are the genre." },
  synthwave: { articulation: "sustain", reason: "Sustained analogue pads." },
  vaporwave: { articulation: "sustain", reason: "Slowed, smeared sustained chords." },
  wave: { articulation: "sustain", reason: "The dark pad wall rings continuously." },
  dub: { articulation: "stab", reason: "The dub skank is a short off-beat clip; the delay provides the sustain." },
  jungle: { articulation: "stab", reason: "Jungle stabs are clipped off-beats." },
  "ragga-jungle": { articulation: "stab", reason: "Ragga stabs are short and rhythmic." },
  neurofunk: { articulation: "stab", reason: "Neurofunk chords are percussive hits." },
  "liquid-dnb": { articulation: "block", reason: "Liquid rolls sustained musical chords." },
  "jump-up": { articulation: "stab", reason: "Short aggressive stabs." },
  techstep: { articulation: "stab", reason: "Dark clipped hits." },
  halftime: { articulation: "sustain", reason: "Halftime lets the chord ring across the slow half-time bar." },
  sambass: { articulation: "block", reason: "Brazilian d'n'b keeps a warm sustained chord bed." },
  breakcore: { articulation: "stab", reason: "Chords are percussive interruptions." },
  dubstep: { articulation: "stab", reason: "Dubstep mid-bass stabs are short and thirdless." },
  brostep: { articulation: "stab", reason: "Mid-bass stabs are short, clipped and thirdless." },
  riddim: { articulation: "stab", reason: "Minimal clipped stabs; the rhythm is in the bass, not the chord." },
  "melodic-dubstep": { articulation: "sustain", reason: "Melodic dubstep sustains emotional pad chords." },
  chillstep: { articulation: "sustain", reason: "As melodic dubstep." },
  "tearout-dubstep": { articulation: "stab", reason: "Aggressive short stabs that punctuate the drop." },
  deathstep: { articulation: "stab", reason: "Percussive clipped hits under the distorted bass." },
  "post-dubstep": { articulation: "sustain", reason: "Post-dubstep is pad- and vocal-led." },
  "future-garage": { articulation: "comp", reason: "The garage shuffle needs short, syncopated chord hits." },
  "uk-garage": { articulation: "comp", reason: "As future garage." },
  "2-step-garage": { articulation: "comp", reason: "As future garage." },
  "speed-garage": { articulation: "comp", reason: "As future garage." },
  "uk-funky": { articulation: "comp", reason: "Funky house comping." },
  grime: { articulation: "stab", reason: "Grime chords are cold clipped hits." },
  bassline: { articulation: "stab", reason: "Short stabs over the bassline." },
  speedbass: { articulation: "stab", reason: "Short stabs over a fast bassline." },
  hardstyle: { articulation: "sustain", reason: "Hardstyle screech chords are sustained through the drop." },
  "hardcore-gabber": { articulation: "stab", reason: "Gabber chords are percussive hits." },
  frenchcore: { articulation: "stab", reason: "Distorted percussive chord hits." },
  "happy-hardcore": { articulation: "stab", reason: "Rave piano stabs are short and rhythmic." },
  chiptune: { articulation: "stab", reason: "Chip hardware implies short clipped chords." },
  idm: { articulation: "comp", reason: "IDM chords are short, displaced and pointillist." },
  "glitch-hop": { articulation: "comp", reason: "As IDM, with funk comping." },
  phonk: { articulation: "sustain", reason: "Phonk's dark chords ring under the cowbell." },
  "drift-phonk": { articulation: "sustain", reason: "Dark chords ring under the cowbell, as in phonk." },
  "edm-trap": { articulation: "sustain", reason: "EDM-trap sustains its brass/synth chords." },
  "hard-trap": { articulation: "sustain", reason: "Sustained brass/synth chords under the 808." },
  "hybrid-trap": { articulation: "sustain", reason: "Sustained chords bridging trap and EDM." },
  "chicago-drill": { articulation: "sustain", reason: "Drill keys are sustained, minor and atmospheric." },
  "uk-drill": { articulation: "sustain", reason: "As Chicago drill." },
  "brooklyn-drill": { articulation: "sustain", reason: "As Chicago drill." },
  "jersey-drill": { articulation: "sustain", reason: "As Chicago drill." },
  "jersey-club": { articulation: "stab", reason: "Jersey club chops chords into short hits." },
  moombahton: { articulation: "stab", reason: "Short stabs over the dembow." },
  footwork: { articulation: "stab", reason: "Chords arrive as clipped samples." },
  "future-bass": { articulation: "sustain", reason: "Future bass's signature is a sustained supersaw chord." },
  "kawaii-future-bass": { articulation: "sustain", reason: "Bright sustained supersaw chords are the signature." },
  "big-beat": { articulation: "block", reason: "Big-beat chords are held over the breakbeat." },
  electro: { articulation: "stab", reason: "Electro stabs are clipped and robotic." },
  breakbeat: { articulation: "block", reason: "Held chords over the break." },

  // ---- Rock / Metal: riffs are short, walls are long ----------------------------
  "rock-and-roll": { articulation: "strum", reason: "Guitar strums, not block chords." },
  "blues-rock": { articulation: "strum", reason: "Strummed dominant-7th comping." },
  "hard-rock": { articulation: "block", reason: "Power chords are held for their full value, unlike metal's mutes." },
  "punk-rock": { articulation: "stab", reason: "Downstroked power chords are short and percussive." },
  "post-punk": { articulation: "strum", reason: "Chorus/jangle guitar strums." },
  "new-wave": { articulation: "block", reason: "Held synth/guitar chords." },
  "heavy-metal": { articulation: "stab", reason: "Palm-muted power chords are clipped rhythm, not sustained harmony." },
  "thrash-metal": { articulation: "stab", reason: "Palm-muted riffing is as short as it gets." },
  "death-metal": { articulation: "stab", reason: "As thrash; the riff is the rhythm." },
  "black-metal": { articulation: "sustain", reason: "Tremolo picking is continuous, so the chord must not decay between steps." },
  "doom-metal": { articulation: "sustain", reason: "Slow, heavy chords ring for whole bars." },
  metalcore: { articulation: "stab", reason: "Breakdown chugs are clipped and rhythmically decisive." },
  grunge: { articulation: "block", reason: "Distorted chords are held through the bar." },
  "alternative-rock": { articulation: "strum", reason: "Song-driven strummed guitar." },
  "progressive-rock": { articulation: "block", reason: "Sustained organ/guitar pads under long-form sections." },
  "math-rock": { articulation: "roll", reason: "Clean tapped arpeggios ripple across the chord." },
  "shoe-gaze": { articulation: "sustain", reason: "The wall of sound is one continuous chord." },

  // ---- Jazz / Blues: comp, don't hold -------------------------------------------
  "delta-blues": { articulation: "strum", reason: "Acoustic blues is strummed and fingerpicked." },
  "chicago-blues": { articulation: "comp", reason: "Electric blues comps short behind the soloist." },
  "texas-blues": { articulation: "strum", reason: "Strummed shuffle." },
  "electric-blues": { articulation: "comp", reason: "Short comping hits." },
  "traditional-jazz": { articulation: "comp", reason: "Banjo/piano rhythm comping." },
  bebop: { articulation: "comp", reason: "Bebop comping is short and displaced so the soloist has room." },
  "hard-bop": { articulation: "comp", reason: "Short displaced comping so the horn solo has room." },
  "cool-jazz": { articulation: "block", reason: "Cool jazz extended voicings held a full bar." },
  "modal-jazz": { articulation: "sustain", reason: "Modal jazz quartal voicings sustain over pedal points." },
  "free-jazz": { articulation: "comp", reason: "Pointillist, non-sustained interjections." },
  "jazz-fusion": { articulation: "comp", reason: "Electric fusion comps short over the groove." },
  "smooth-jazz": { articulation: "block", reason: "Smooth jazz sustains its Rhodes pads." },
  "acid-jazz": { articulation: "comp", reason: "Funk comping is short and syncopated." },
  "gypsy-jazz": { articulation: "comp", reason: "La pompe is a short percussive strummed comp." },

  // ---- Hip Hop: loops vs trap keys ----------------------------------------------
  "old-school-hip-hop": { articulation: "block", reason: "Sampled soul/funk chords are held as a loop bed." },
  "boom-bap": { articulation: "block", reason: "Jazzy Rhodes loops ring under the drums." },
  "east-coast-hip-hop": { articulation: "block", reason: "Jazzy Rhodes loops ring under the drums." },
  "west-coast-hip-hop": { articulation: "block", reason: "Held sample-based chords under the groove." },
  "conscious-hip-hop": { articulation: "block", reason: "Soul/jazz chord beds held as a loop." },
  "lofi-hip-hop": { articulation: "block", reason: "Dusty Rhodes chords sustain; the wobble supplies the movement." },
  "g-funk": { articulation: "sustain", reason: "G-funk's whiny lead sits over sustained chord pads." },
  "trap-rap": { articulation: "sustain", reason: "Trap keys are sparse sustained pads under the 808." },
  "southern-hip-hop": { articulation: "sustain", reason: "Sparse sustained keys under the 808." },
  "cloud-rap": { articulation: "sustain", reason: "Reverb-drenched sustained chords." },
  "emo-rap": { articulation: "sustain", reason: "Guitar/synth loops sustain." },

  // ---- Pop / R&B: stabs vs beds -------------------------------------------------
  "traditional-pop": { articulation: "block", reason: "Functional held chords." },
  "synth-pop": { articulation: "sustain", reason: "Sustained analogue pads." },
  disco: { articulation: "comp", reason: "Disco's chicken-scratch guitar and string stabs are short and syncopated." },
  eurodance: { articulation: "stab", reason: "Rave piano stabs are clipped." },
  funk: { articulation: "stab", reason: "Funk chords are the rhythm section — short, muted, on the off-beat." },
  soul: { articulation: "comp", reason: "Soul comping is short but warm." },
  motown: { articulation: "comp", reason: "The Funk Brothers comp short behind the vocal." },
  "neo-soul": { articulation: "comp", reason: "Neo-soul comping is displaced and spacious." },
  "contemporary-rnb": { articulation: "sustain", reason: "Modern R&B sustains its pads and keys." },
  "alternative-rnb": { articulation: "sustain", reason: "As contemporary R&B." },
  "city-pop": { articulation: "block", reason: "City-pop's maj7/add9 EP chords are held." },
  "k-pop": { articulation: "block", reason: "Held bright chords under the topline." },
  "j-pop": { articulation: "block", reason: "Held maj7/add9 keyboard chords under the topline." },

  // ---- Latin / World: rhythm first ----------------------------------------------
  salsa: { articulation: "stab", reason: "The piano montuno is a short off-beat rhythm pattern, not a chord bed." },
  bachata: { articulation: "strum", reason: "Bachata guitar strums its characteristic rhythm." },
  reggae: { articulation: "stab", reason: "The skank is a clipped off-beat chop; a held chord is not reggae." },
  dancehall: { articulation: "stab", reason: "Clipped off-beat skank chops, as in reggae." },
  reggaeton: { articulation: "stab", reason: "Short dembow stabs." },
  afrobeat: { articulation: "comp", reason: "Afrobeat's keys/guitar comp in short interlocking phrases." },
  amapiano: { articulation: "comp", reason: "Log-drum piano chords are short and syncopated." },
  "bossa-nova": { articulation: "comp", reason: "Bossa guitar is a syncopated fingerstyle comp, not a strum." },
  samba: { articulation: "strum", reason: "Cavaquinho strums the samba rhythm." },
  cumbia: { articulation: "stab", reason: "The cumbia organ/guitar chop is short and off-beat." },
  kuduro: { articulation: "stab", reason: "Fast clipped stabs." },
};

/** Instrument-derived articulation fallback, used for custom genres. */
const ARTICULATION_FAMILIES: ReadonlyArray<{ match: RegExp; articulation: ChordArticulation }> = [
  { match: /guitar|axe/i, articulation: "strum" },
  { match: /pad|strings|choir/i, articulation: "sustain" },
  { match: /organ|brass|marimba|accordion/i, articulation: "stab" },
  { match: /rhodes|piano|vibraphone|wurli|ep\b/i, articulation: "block" },
];

/**
 * Resolves how a genre plays its chords.
 *
 * Same precedence as `resolveVoicingStyle`: a curated genre wins, the instrument is only
 * consulted when the genre id is unknown, so a heuristic can never override curation.
 */
export function resolveChordArticulation(
  genreId: string | null | undefined,
  chordInstrument?: string | null
): ChordArticulation {
  if (genreId) {
    const override = GENRE_ARTICULATION[genreId];
    if (override) return override.articulation;
  }
  if (chordInstrument) {
    for (const family of ARTICULATION_FAMILIES) {
      if (family.match.test(chordInstrument)) return family.articulation;
    }
  }
  return DEFAULT_CHORD_ARTICULATION;
}

/**
 * The single call the two engines make: which notes, and how to play them.
 *
 * Both `AudioEngine.playChord` and `WavExporter` resolve through this one function —
 * exporter parity is a hard rule, and two independent resolutions is exactly how the
 * audition and the bounce drift apart.
 */
export function resolveChordTreatment(
  genreId: string | null | undefined,
  chordInstrument?: string | null
): ChordTreatment {
  const articulation = resolveChordArticulation(genreId, chordInstrument);
  const definition = CHORD_ARTICULATIONS[articulation];
  return {
    style: resolveVoicingStyle(genreId, chordInstrument),
    articulation,
    gateScale: definition.gateScale,
    strumSeconds: definition.strumSeconds,
  };
}
