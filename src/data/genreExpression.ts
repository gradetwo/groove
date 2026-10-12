import type { GenreCategory, SequencerPattern, SequencerTrack } from "../types/genre";
import { MAX_NOTE_GATE_STEPS } from "../types/genre";
import { chordVoicingForStep, type VoicingStyle } from "../audio/chordVoicing";
import { POPULAR_PROGRESSIONS } from "./popularProgressions";
import { parseScaleString } from "../utils/scaleTheory";
import { NOTE_NAMES } from "../utils/scaleTheory";

/**
 * Per-genre **expression**: how a genre's chords are played, how long its phrases are, and how long
 * its pattern is.
 *
 * ## Why this exists
 *
 * The patterns in `src/data/genres/*` are authored as a 16-step grid with **one root note per step**
 * on the chords track. That is a *progression skeleton*, not music: the chord quality, the voicing
 * register, how long each chord lasts, whether it is struck, strummed, arpeggiated or broken, and
 * how long the phrase is before it repeats were all implicit. The roll showed a single note because
 * that is all the data held, and every genre's chords sounded like the same block triad.
 *
 * So the authored data keeps its role — *which root, where* — and this module says how that becomes
 * notes: `expandGenrePattern` writes real note stacks (`pitches`), real lengths (`gate`) and
 * arpeggios as real notes, per genre, from these rules.
 *
 * ## Shape of the table
 *
 * Exactly the shape the rest of the project uses for per-genre character (`genreFx`, `genreMix`,
 * `genreVoicing`): **category profile + per-genre override + a required reason**, resolved by id,
 * with a completeness test so a new genre cannot silently land on nothing.
 *
 * ## Rules that are deliberate, not incidental
 *
 *   - **Length is the progression's length.** A genre whose chords move every bar needs four bars
 *     to state its progression (64 steps at 1/16); a genre that loops a two-bar riff does not. The
 *     pattern length therefore comes from `bars`, and every looping track keeps its own
 *     `trackLength`, so a 16-step drum pattern repeats under a 64-step progression instead of being
 *     re-authored. That is what `trackLength` exists for.
 *   - **A track with nothing in it stays empty.** `fx` is not part of every genre and inventing
 *     content to fill the grid would be worse than a hole: nothing here ever adds notes to a track
 *     that the author left silent.
 *   - **Notes may last up to a bar** (`MAX_NOTE_GATE_STEPS`): a pad or a whole-bar chord is one note
 *     with a long gate, not sixteen tied duplicates.
 */

/** How the chords are played. `block` and `strum` keep one stack per chord; the rest write notes. */
export type ChordStyle = "block" | "strum" | "arpeggio" | "broken" | "stab" | "sustain" | "ballad";

/** Which harmony to stack on the authored root. Maps onto `chordVoicing`'s styles. */
export type ChordQuality = "triad" | "seventh" | "power" | "sus" | "quartal" | "extended";

const VOICING_FOR_QUALITY: Record<ChordQuality, VoicingStyle> = {
  triad: "triad",
  seventh: "seventh",
  power: "power",
  sus: "sus",
  quartal: "quartal",
  extended: "extended",
};

export interface ChordRule {
  /** A `POPULAR_PROGRESSIONS` id; the progression is transposed into the pattern's own scale. */
  progressionId?: string;
  /**
   * Explicit scale degrees (0-based, `0` = the pattern's tonic) when no database entry fits.
   * Ignored when `progressionId` resolves.
   */
  degrees?: number[];
  quality: ChordQuality;
  style: ChordStyle;
  /** How long each chord lasts, in **beats** — converted with the pattern's resolution. */
  chordBeats: number;
  /** How many bars of the progression before the pattern repeats. Sets the pattern length. */
  bars: number;
  /**
   * Register of the chord root, as a MIDI octave offset from the authored root. `0` keeps the
   * authored register; `+1` lifts the whole progression an octave (bright), `-1` drops it (dark).
   */
  octaveOffset: number;
  /** Arpeggio/broken rate, in beats per note (0.25 = 1/16). Required for those styles. */
  arpStepBeats?: number;
}

export type RolePhraseStyle = "authored" | "legato" | "staccato" | "sustain" | "ghost" | "ratchet";

export interface RolePhraseRule {
  style: RolePhraseStyle;
  /** Multiplier on the authored gate (`legato`/`sustain` lengthen, `staccato` shortens). */
  gateScale?: number;
  /** Ratchet subdivision when `style` is `ratchet`. */
  ratchet?: number;
  /** Only touch every Nth sounding step (used for ghosting a backbeat). */
  everySteps?: number;
}

export type ExpressionRole = "kick" | "snare" | "hihat" | "percussion" | "bass" | "chords" | "lead" | "fx";

export interface GenreExpression {
  chord: ChordRule;
  /**
   * Per-role phrase rules. A role **absent** from this map is left exactly as authored — the same
   * "do not invent content" rule as an empty track.
   */
  roles: Partial<Record<ExpressionRole, RolePhraseRule>>;
}

export interface GenreExpressionOverride {
  expression: {
    chord?: Partial<ChordRule>;
    roles?: Partial<Record<ExpressionRole, RolePhraseRule>>;
  };
  /** Why this genre steps away from its category. Required, like every other per-genre table. */
  reason: string;
}

/** Categories that move harmony at a common rate, so their profiles differ where it matters. */
export const CATEGORY_EXPRESSION_PROFILES: Record<GenreCategory, GenreExpression> = {
  Electronic: {
    // Four-on-the-floor: harmony moves once a bar, held (pads) or stabbed (organ), and the bass
    // locks to the root. A four-bar statement of the progression is the norm.
    chord: { quality: "seventh", style: "sustain", chordBeats: 4, bars: 4, octaveOffset: 0, degrees: [0, 8, 3, 10] },
    roles: {
      bass: { style: "legato", gateScale: 1.4 },
      lead: { style: "authored" },
      hihat: { style: "staccato", gateScale: 0.5 },
    },
  },
  "Hip Hop": {
    // Loop-based: two bars, dark minor 7ths, short and behind the beat; the 808 owns the low end, so
    // the chords stay out of the bass's way (a small register lift, not a wide voicing).
    chord: { quality: "seventh", style: "block", chordBeats: 4, bars: 2, octaveOffset: 1, degrees: [0, 5] },
    roles: {
      bass: { style: "sustain", gateScale: 1.8 },
      percussion: { style: "ghost", everySteps: 2 },
    },
  },
  "Jazz/Blues": {
    // Comping: 7th chords, syncopated (two chords a bar), voiced around middle C, no arpeggios —
    // the comp is the accompaniment and the walking bass supplies the motion.
    chord: { quality: "seventh", style: "block", chordBeats: 2, bars: 4, octaveOffset: 0, progressionId: "major-two-five-one" },
    roles: {
      bass: { style: "legato", gateScale: 1.6 },
      lead: { style: "authored" },
    },
  },
  "Latin/World": {
    // Montuno-style: broken chords in eighths, four bars, with the percussion carrying the pattern.
    chord: { quality: "triad", style: "broken", chordBeats: 4, bars: 4, octaveOffset: 0, arpStepBeats: 0.5, degrees: [0, 10, 8, 7] },
    roles: {
      percussion: { style: "authored" },
      bass: { style: "legato", gateScale: 1.3 },
    },
  },
  "Pop/R&B": {
    // The broadest space: triads and 7ths, arpeggiated or strummed, one chord a bar, four bars.
    chord: { quality: "triad", style: "arpeggio", chordBeats: 4, bars: 4, octaveOffset: 0, arpStepBeats: 0.25, progressionId: "axis-of-awesome" },
    roles: {
      lead: { style: "legato", gateScale: 1.5 },
      bass: { style: "authored" },
    },
  },
  "Rock/Metal": {
    // Power chords, struck short and hard, one or two a bar, with the riff repeating every two bars
    // (a rock pattern that states a four-bar progression is unusual — the riff *is* the hook).
    chord: { quality: "power", style: "stab", chordBeats: 4, bars: 2, octaveOffset: -1, progressionId: "punk-power-chords" },
    roles: {
      bass: { style: "authored" },
      hihat: { style: "authored" },
    },
  },
};

/**
 * Per-genre deviations written by hand.
 *
 * Each one carries its reason inline, because the interesting question about a per-genre table is
 * never "what is the value" but "why is it not the category's". The library-wide content lives in
 * `GENRE_EXPRESSION_GENERATED` below (authored per category and validated by
 * `scripts/merge_expression_parts.mjs`); this table is the hand-written core that stays readable.
 */
export const GENRE_EXPRESSION_AUTHORED: Record<string, GenreExpressionOverride> = {
  dub: {
    expression: { chord: { quality: "triad", style: "stab", chordBeats: 2, octaveOffset: -1 } },
    reason: "Dub's chords are sparse off-beat stabs left to the delay, not a pad.",
  },
  ambient: {
    expression: { chord: { quality: "seventh", style: "sustain", chordBeats: 8, bars: 4, octaveOffset: 1 } },
    reason: "Ambient harmony changes every two bars and rings — the whole point of the genre.",
  },
  "death-metal": {
    expression: { chord: { quality: "power", style: "stab", chordBeats: 2, octaveOffset: -1 } },
    reason: "Tremolo/palm-muted power chords change twice a bar at this tempo.",
  },
  "black-metal": {
    expression: { chord: { quality: "power", style: "stab", chordBeats: 2, octaveOffset: 0 } },
    reason: "The tremolo wall keeps moving; low-register power chords would muddy the blast beats.",
  },
  bebop: {
    expression: { chord: { quality: "extended", style: "block", chordBeats: 1 } },
    reason: "Bebop comping changes chord every beat and uses extensions, not plain 7ths.",
  },
  "modal-jazz": {
    expression: { chord: { quality: "quartal", style: "sustain", chordBeats: 4 } },
    reason: "Modal jazz sits on one chord for bars at a time with quartal voicings.",
  },
  "progressive-house": {
    expression: { chord: { quality: "seventh", style: "arpeggio", arpStepBeats: 0.25, chordBeats: 4 } },
    reason: "The genre's signature is a plucked 1/16 arpeggio over slow harmony.",
  },
  "trap-rap": {
    expression: { chord: { quality: "seventh", style: "block", chordBeats: 8, bars: 4 } },
    reason: "Dark minor 7ths with a slow harmonic rhythm leave room for the 808 and the hi-hat rolls.",
  },
  "boom-bap": {
    expression: { chord: { quality: "seventh", style: "block", chordBeats: 2, bars: 2, octaveOffset: 1 } },
    reason: "Sampled two-chord vamps change twice a bar; the loop is the two-bar phrase.",
  },
  "bossa-nova": {
    expression: { chord: { quality: "seventh", style: "broken", chordBeats: 2, arpStepBeats: 0.5 } },
    reason: "The bossa guitar's syncopated broken chords are the genre's defining texture.",
  },
  "reggaeton": {
    expression: { chord: { quality: "triad", style: "stab", chordBeats: 2, bars: 4 } },
    reason: "The dembow riddim carries the pattern; chords are short off-beat stabs.",
  },
  "synthwave": {
    expression: { chord: { quality: "seventh", style: "sustain", chordBeats: 4, octaveOffset: 1 } },
    reason: "Wide, bright sustained pads are the sound; the pattern states four bars of harmony.",
  },
  "neo-soul": {
    expression: { chord: { quality: "extended", style: "block", chordBeats: 2, octaveOffset: 0 } },
    reason: "Extended voicings with dense, syncopated comping are the genre's signature.",
  },
  "soul": {
    expression: { chord: { quality: "extended", style: "broken", chordBeats: 2, arpStepBeats: 0.5 } },
    reason: "Soul/gospel keys run broken extended voicings; the movement is in the inner voices.",
  },
};

/** Every genre the tables know about, for the completeness test. */
/* --- generated overrides: start --- */
/**
 * Generated per-genre overrides (authored per category, validated by
 * `scripts/merge_expression_parts.mjs`). Do not hand-edit: the merge rewrites this block.
 */
export const GENRE_EXPRESSION_GENERATED: Record<string, GenreExpressionOverride> = {
  "chicago-house": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "broken",
        "chordBeats": 1,
        "bars": 8,
        "octaveOffset": 0,
        "arpStepBeats": 0.5
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 1.2
        }
      }
    },
    "reason": "Chicago house lives on off-beat piano/organ 7th stabs and short broken figures over a walking 8-bar groove, not a 4-beat sustained pad; the bass is short and punchy rather than legato."
  },
  "deep-house": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "broken",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0,
        "arpStepBeats": 0.5
      },
      "roles": {}
    },
    "reason": "Deep house uses warm, sparse 7th/9th voicings that move twice a bar in broken off-beat stabs; extended keeps the jazzy 9ths/11ths and chordBeats 2 captures the two-chords-per-bar motion."
  },
  "future-house": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 1
      },
      "roles": {}
    },
    "reason": "Future house is built on bright pitched-up metallic chord stabs on the off-beats; a long sustained pad would smear the bounce. Raised an octave to match the pitched-up character."
  },
  "progressive-house": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": 0
      },
      "roles": {}
    },
    "reason": "Kept the sustained wide 7th progressions that define progressive house, but pinned bars=4 so the lush 4-bar pad cycle is explicit instead of drifting with the author progression."
  },
  "ghetto-house": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": -1
      },
      "roles": {}
    },
    "reason": "Ghetto house is raw 808/DJ-tool music where harmony is one rude short chord stab; power chords kept low give the lo-fi shouting character instead of a lush 7th pad."
  },
  "tropical-house": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "arpeggio",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 1,
        "arpStepBeats": 0.25
      },
      "roles": {
        "hihat": {
          "style": "staccato",
          "gateScale": 0.35
        }
      }
    },
    "reason": "Tropical house is defined by bright plucked flute/marimba arpeggios at 1/16 with very crisp hats, not sustained pads; register up for the sunny, whistle-like top end."
  },
  "acid-house": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 1,
        "bars": 2,
        "octaveOffset": 0
      },
      "roles": {
        "bass": {
          "style": "authored"
        }
      }
    },
    "reason": "In acid house the 303 line carries the music, so the chord track is only a short, hollow power stab; bass set to authored so the squelchy 303 pattern and slides are not overwritten by a legato rule."
  },
  "french-house": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 1,
        "bars": 4,
        "octaveOffset": 0
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.6
        }
      }
    },
    "reason": "French touch is filtered disco: short funky 7th chord stabs chopped against a pumping filtered bass, so chords are 1-beat stabs and the bass is sustained rather than legato-played."
  },
  "melodic-house": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 8,
        "octaveOffset": 0
      },
      "roles": {}
    },
    "reason": "Melodic house leans on lush extended voicings spread over long 8-bar emotional progressions that let the lead melody sit on top, so the cycle is twice the category length."
  },
  "afro-house": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "broken",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0,
        "arpStepBeats": 0.5
      },
      "roles": {}
    },
    "reason": "Afro house chords are percussive marimba/organ fragments interlocking with the polyrhythmic drums, moving twice a bar in broken figures rather than holding a pad."
  },
  "nu-disco-house": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "broken",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 1,
        "arpStepBeats": 0.5
      },
      "roles": {}
    },
    "reason": "Nu-disco uses bright filtered guitar/string 7th chord chops on the off-beats; broken 1/8 figures in a higher register give the disco loop feel, not a sustained pad."
  },
  "microhouse": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "broken",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": -1,
        "arpStepBeats": 0.25
      },
      "roles": {}
    },
    "reason": "Microhouse reduces harmony to tiny, glitchy low-register chord fragments and clicks; very short 1/16 broken figures keep the texture minimal instead of filling the bar with a pad."
  },
  "detroit-techno": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": 0
      },
      "roles": {}
    },
    "reason": "Detroit techno's soulful 9th/11th string and pad chords ring across whole bars, so the sustained pad is correct but the quality must be extended rather than a plain 7th."
  },
  "minimal-techno": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 4,
        "bars": 8,
        "octaveOffset": 0
      },
      "roles": {}
    },
    "reason": "Minimal techno strips harmony to one tiny dub stab or chord per bar evolving over a long 8-bar span; a 4-beat stab per bar replaces the category's constant pad."
  },
  "acid-techno": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0
      },
      "roles": {
        "bass": {
          "style": "ratchet",
          "ratchet": 2,
          "gateScale": 1
        }
      }
    },
    "reason": "Acid techno is a 303-driven form: harmony is a single short hollow stab and the bass repeats in fast rattling 1/16 accents, so long 7th pads would be wrong."
  },
  "dub-techno": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 8,
        "octaveOffset": -1
      },
      "roles": {}
    },
    "reason": "Dub techno chords are late, deep and heavily delayed, ringing for a bar or more in a low register; register down and an 8-bar cycle match the cavernous dub space."
  },
  "industrial-techno": {
    "expression": {
      "chord": {
        "quality": "quartal",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": -1
      },
      "roles": {}
    },
    "reason": "Industrial techno uses harsh, dissonant machine-like hits; quartal voicings as short low stabs give the metallic, non-functional harmony without any pad."
  },
  "peak-time-techno": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": 0
      },
      "roles": {}
    },
    "reason": "Peak-time techno is a functional DJ tool: one huge short chord stab per bar that punches through the mix, never a sustained 7th pad carrying the harmony."
  },
  "hard-techno": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": -1
      },
      "roles": {}
    },
    "reason": "Hard techno harmony is a distorted power stab used as a percussion hit; low register, 2-bar loop and no pad keep the driving, aggressive character."
  },
  "ambient-techno": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 8,
        "octaveOffset": 0
      },
      "roles": {}
    },
    "reason": "Ambient techno floats slow extended pads over the beat, with progressions changing every 8 bars rather than every 4, so the pad sustains far longer than the category default."
  },
  "raw-techno": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": 0
      },
      "roles": {}
    },
    "reason": "Raw techno keeps harmony to a gritty short power stab and a tight 2-bar loop, the opposite of a lush sustained 7th pad."
  },
  "schranz": {
    "expression": {
      "chord": {
        "quality": "quartal",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": -1
      },
      "roles": {}
    },
    "reason": "Schranz is hard, loop-based and percussion-first: one dissonant quartal stab in a 2-bar loop, low and short, with no room for sustained chords."
  },
  "uplifting-trance": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "arpeggio",
        "chordBeats": 4,
        "bars": 8,
        "octaveOffset": 1,
        "arpStepBeats": 0.25
      },
      "roles": {}
    },
    "reason": "The rolling 1/16 arpeggio over wide bright 9th/11th chords across an 8-bar progression is the defining uplifting trance texture, and a plain sustained 7th pad misses it."
  },
  "progressive-trance": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "arpeggio",
        "chordBeats": 4,
        "bars": 8,
        "octaveOffset": 1,
        "arpStepBeats": 0.5
      },
      "roles": {}
    },
    "reason": "Progressive trance builds long 8-bar 7th progressions through rolling 1/8 plucked arpeggios that gradually open up, brighter than the category's mid-register pad."
  },
  "psytrance": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "arpeggio",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0,
        "arpStepBeats": 0.25,
        "progressionId": "epic-minor-hero"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 1.2
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.4
        }
      }
    },
    "reason": "Psytrance carries the harmony as a rolling 1/16 arpeggio over a two-chord-per-bar, i-VI-III-VII minor loop, not as a four-beat sustained pad; the bass is the genre's signature tight 1/16 chug, not a legato pad root."
  },
  "goa-trance": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "arpeggio",
        "chordBeats": 2,
        "bars": 8,
        "octaveOffset": 0,
        "arpStepBeats": 0.25,
        "progressionId": "andalusian-cadence"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 1.2
        },
        "lead": {
          "style": "legato"
        }
      }
    },
    "reason": "Goa is melodic and long-form: fast 1/16 triplet-feel arpeggios trace a descending Andalusian minor cadence over an eight-bar statement with a soaring sustained lead, far longer and busier than the category's four-bar pad."
  },
  "tech-trance": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0,
        "progressionId": "andalusian-cadence"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 1.1
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.35
        }
      }
    },
    "reason": "Tech trance replaces the pad with short clipped off-beat stabs (two per bar) on a dark minor descent, so the harmony punches between the kick and the rolling bass instead of sustaining across the bar."
  },
  "hard-trance": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": -1,
        "progressionId": "andalusian-cadence"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 1.1
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.3
        }
      }
    },
    "reason": "Hard trance is a distorted, low-register genre: hollow fifth-and-octave power stabs an octave down on a two-chord-per-bar minor riff, with no seventh colour and no sustained pad anywhere."
  },
  "vocal-trance": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "arpeggio",
        "chordBeats": 4,
        "bars": 8,
        "octaveOffset": 1,
        "arpStepBeats": 0.5,
        "progressionId": "sensitive-female"
      },
      "roles": {
        "lead": {
          "style": "legato"
        },
        "bass": {
          "style": "staccato",
          "gateScale": 1.2
        }
      }
    },
    "reason": "Vocal trance is the euphoric song form: an eight-bar vi-IV-I-V in a bright upper octave, arpeggiated in eighth notes under the topline, rather than four bars of mid-register sustained seventh."
  },
  "euro-trance": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "arpeggio",
        "chordBeats": 4,
        "bars": 8,
        "octaveOffset": 1,
        "arpStepBeats": 0.25,
        "progressionId": "axis-of-awesome"
      },
      "roles": {
        "lead": {
          "style": "legato"
        },
        "bass": {
          "style": "staccato",
          "gateScale": 1.2
        }
      }
    },
    "reason": "Euro-trance is unashamed major-key supersaw pop: plain triads on a I-V-vi-IV over eight bars, played as a fast 1/16 arpeggio an octave up; seventh chords muddy the anthemic simplicity and a sustained pad kills the lift."
  },
  "dream-trance": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 8,
        "octaveOffset": 1,
        "progressionId": "epic-minor-hero"
      },
      "roles": {
        "lead": {
          "style": "legato"
        },
        "bass": {
          "style": "sustain",
          "gateScale": 1.6
        }
      }
    },
    "reason": "Dream trance floats wide, bright major-seventh pads in a high register over an eight-bar loop for a full phrase before repeating; four bars in the written register is too short and too dark for its lush, slow harmonic rhythm."
  },
  "dubstep": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 4,
        "bars": 2,
        "octaveOffset": -1,
        "progressionId": "epic-minor-hero"
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.8
        }
      }
    },
    "reason": "Classic dubstep is half-step and sparse: one dark minor-7th stab per bar (or per two bars) an octave down, with a long sub-bass holding the root. A four-bar seventh pad is far too busy and too high."
  },
  "brostep": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.8
        }
      }
    },
    "reason": "Brostep is mid-range aggression: short, low, metallic root-fifth power stabs twice a bar, with the harmony deliberately hollow so the growl and the sub own the spectrum."
  },
  "riddim": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 4,
        "bars": 2,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.8
        }
      }
    },
    "reason": "Riddim is the most reduced dubstep form: the same one-bar power stab repeats hypnotically for the whole track, which is why it gets a two-bar pattern and no seventh extension at all."
  },
  "tearout-dubstep": {
    "expression": {
      "chord": {
        "quality": "quartal",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.8
        }
      }
    },
    "reason": "Tearout is dissonant and percussive: voiceless quartal stacks (fourths instead of thirds) hammered as short low stabs twice a bar, so the harmony reads as noise-adjacent impact rather than a chord."
  },
  "deathstep": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 2,
        "bars": 1,
        "octaveOffset": -2
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.8
        },
        "kick": {
          "style": "authored"
        }
      }
    },
    "reason": "Deathstep is the extreme low end of the family: a one-bar loop of sub-octave power stabs in the darkest register, so the pattern is as short as the riff and the low end never resolves upward."
  },
  "melodic-dubstep": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": 1,
        "progressionId": "sensitive-female"
      },
      "roles": {
        "lead": {
          "style": "legato"
        },
        "bass": {
          "style": "sustain",
          "gateScale": 1.6
        }
      }
    },
    "reason": "Melodic dubstep is the bright counterpart: wide, sustained major/Nordic sevenths across a full four-bar vi-IV-I-V an octave up, with a soaring legato lead instead of dark half-step stabs."
  },
  "future-garage": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": 0,
        "progressionId": "sensitive-female"
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.6
        }
      }
    },
    "reason": "Future garage keeps the UKG chopped, pitch-shifted vocal-chord stab: two chords per bar in a two-bar loop, with a deep sustained sub rather than a four-bar pad."
  },
  "post-dubstep": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 2,
        "octaveOffset": 0,
        "progressionId": "sensitive-female"
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.8
        }
      }
    },
    "reason": "Post-dubstep is introspective and two-bar: a mellow seventh pad held for a bar at a time with a heavy sub, and it resolves after two bars rather than stating a four-bar progression."
  },
  "chillstep": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "arpeggio",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": 1,
        "arpStepBeats": 0.5,
        "progressionId": "sensitive-female"
      },
      "roles": {
        "lead": {
          "style": "legato"
        },
        "bass": {
          "style": "sustain",
          "gateScale": 1.6
        }
      }
    },
    "reason": "Chillstep is the ambient, melodic side of dubstep: bright sustained sevenths moving once a bar, with the chord tones traced as slow eighth-note arpeggios so the pad shimmers instead of blocking."
  },
  "jungle": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": 0
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.5
        }
      }
    },
    "reason": "Jungle harmony is reggae-derived: short organ-ish off-beat stabs (the skank) landing on the 'and' of each beat in a two-bar loop, never a sustained bar-long pad."
  },
  "liquid-dnb": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": 0,
        "progressionId": "sensitive-female"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.5
        },
        "lead": {
          "style": "legato"
        }
      }
    },
    "reason": "Liquid DnB is the warm, soulful end of the family: full-bar sustained major-7th/9th pads over a four-bar vi-IV-I-V, with a rolling legato sub-bass rather than short stabs."
  },
  "neurofunk": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 4,
        "bars": 2,
        "octaveOffset": -1,
        "progressionId": "andalusian-cadence"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.4
        }
      }
    },
    "reason": "Neurofunk is dark and minimal: one clipped low power stab per bar over a two-bar minor descent, leaving all the movement to the modulated bass and drums instead of sustained harmony."
  },
  "jump-up": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.4
        }
      }
    },
    "reason": "Jump Up is dancefloor-simple: a two-bar loop of blunt root-fifth stabs twice a bar, all attack and no extension, built to be overshadowed by the wobbling bass hook."
  },
  "techstep": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 4,
        "bars": 2,
        "octaveOffset": -1,
        "progressionId": "andalusian-cadence"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.4
        }
      }
    },
    "reason": "Techstep is bleak and minimal: a single dark minor-7th stab per bar in a two-bar loop, one octave down, with long empty space where a pad would sit."
  },
  "halftime": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "sustain",
        "chordBeats": 8,
        "bars": 4,
        "octaveOffset": -1,
        "progressionId": "epic-minor-hero"
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.8
        }
      }
    },
    "reason": "Halftime DnB moves at half speed: one dark minor-7th chord every two bars under a sparse kick-snare, so chordBeats must be 8 rather than the default 4."
  },
  "breakcore": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 1,
        "bars": 1,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "ratchet",
          "ratchet": 4,
          "gateScale": 0.6
        },
        "kick": {
          "style": "authored"
        }
      }
    },
    "reason": "Breakcore harmony is a percussive afterthought: a one-beat, one-bar power stab that is mangled by the chopped breaks, with a machine-gun ratcheted bass rather than anything sustained."
  },
  "ragga-jungle": {
    "expression": {
      "chord": {
        "quality": "quartal",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": 0,
        "progressionId": "twelve-bar-blues"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.5
        }
      }
    },
    "reason": "Ragga-jungle is dancehall-derived: hollow quartal off-beat skanks in a short two-bar reggae loop, punched between the vocal and the sub-bass, and never extended into jazz sevenths."
  },
  "sambass": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "broken",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 1,
        "arpStepBeats": 0.25,
        "progressionId": "major-two-five-one"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.4
        },
        "percussion": {
          "style": "authored"
        }
      }
    },
    "reason": "Sambass is bossa-nova guitar voicings over a drum-and-bass tempo: bright broken seventh chords with a syncopated 1/16 bossa comp an octave up, over a jazz-flavoured turnaround, not a held pad."
  },
  "uk-garage": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": 0,
        "progressionId": "sensitive-female"
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.5
        }
      }
    },
    "reason": "UK garage is built on short, syncopated organ stabs placed off the grid across a two-bar loop, with a sustained sub-bass underneath; a bar-long pad erases the shuffle."
  },
  "2-step-garage": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": 0,
        "progressionId": "sensitive-female"
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.6
        }
      }
    },
    "reason": "2-step is the swung, skip-beat form: chords are clipped vocal/organ stabs, two per bar, answering the kick-less second beat, so the harmony has to be short and syncopated rather than sustained."
  },
  "speed-garage": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": 1,
        "progressionId": "sensitive-female"
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.8
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.4
        }
      }
    },
    "reason": "Speed garage keeps one chord per bar as a big sustained, filtered organ/reese chord — its signature is the long held stab with the bassline rolling under it, so unlike 2-step the pad does sustain."
  },
  "grime": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.8
        }
      }
    },
    "reason": "Grime is deliberately stark: one or two cold, low minor-7th stabs per bar in a two-bar loop with long silences for the MC, an octave down and far sparser than a four-bar seventh pad."
  },
  "bassline": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": 0
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.7
        }
      }
    },
    "reason": "Bassline (Niche) is a bass-led 4x4/2-step hybrid: short two-per-bar organ stabs supporting a constant warping sub, not a bar-long pad that would fight the bassline for space."
  },
  "uk-funky": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "broken",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0,
        "arpStepBeats": 0.5,
        "progressionId": "sensitive-female"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 1.3
        },
        "percussion": {
          "style": "authored"
        }
      }
    },
    "reason": "UK funky is percussion-first house/soca: chords are syncopated broken stabs two per bar, punched around the congas, so the harmony must be short and rhythmic rather than sustained."
  },
  "dub": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": 0
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.9
        },
        "fx": {
          "style": "authored"
        }
      }
    },
    "reason": "Dub drops the chord on the off-beat and lets the delay answer it: short sparse skanks two per bar in a two-bar loop, with a deep sustained bass, which is the opposite of a sustained four-beat pad."
  },
  "speedbass": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 4,
        "bars": 2,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "ratchet",
          "ratchet": 4,
          "gateScale": 0.6
        }
      }
    },
    "reason": "Speedbass is a hard, fast bass-driven style: one dark low stab per bar in a two-bar loop while a ratcheted bass rolls at 1/16, so the chord part stays minimal and out of the sub's way."
  },
  "edm-trap": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "sustain",
        "chordBeats": 8,
        "bars": 4,
        "octaveOffset": -1,
        "progressionId": "just-the-two-of-us"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 1
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.35
        }
      }
    },
    "reason": "Trap lives on a dark minor-seventh loop held for two bars at a time (chordBeats 8 over a 4-bar pattern) with no arpeggiation and 808 bass kept short and tuned; the category's one-chord-per-bar sustained default moves too fast and too open."
  },
  "hard-trap": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 1,
        "bars": 4,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.8
        },
        "hihat": {
          "style": "ratchet",
          "ratchet": 3,
          "gateScale": 0.3
        },
        "lead": {
          "style": "staccato"
        }
      }
    },
    "reason": "Hard trap is festival-facing: distorted horn/saw hits are short percussive power stabs, not pads, and the hats are triplet-ratcheted. A sustained seventh pad would smear the drop's aggressive stab rhythm."
  },
  "hybrid-trap": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.6
        },
        "lead": {
          "style": "legato"
        }
      }
    },
    "reason": "Hybrid trap mixes orchestral/emotional seventh harmony inside a trap drop, so chords are dark but chopped on offbeats rather than ringing a full bar; the bass is the 808 and must hold, unlike the category default's legato 1.4."
  },
  "wave": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "sustain",
        "chordBeats": 8,
        "bars": 8,
        "octaveOffset": -1,
        "progressionId": "just-the-two-of-us"
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.8
        },
        "lead": {
          "style": "legato"
        }
      }
    },
    "reason": "Wave is the slowed, reverb-drowned offshoot of trap: two huge extended (9th/11th) sonorities smeared across four bars each, with sub bass swelling underneath. The Electronic default's 4-beat chord rhythm and 4-bar form are far too busy."
  },
  "chicago-drill": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "sustain",
        "chordBeats": 8,
        "bars": 8,
        "octaveOffset": -2,
        "progressionId": "just-the-two-of-us"
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.7
        }
      }
    },
    "reason": "Chicago drill uses the sparsest harmony in the family: one or two bare minor triads, low and menacing, ringing while the sliding 808 does the melodic work. Seventh extensions would sound too jazzy and too busy."
  },
  "uk-drill": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "sustain",
        "chordBeats": 8,
        "bars": 4,
        "octaveOffset": -2,
        "progressionId": "just-the-two-of-us"
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.9
        }
      }
    },
    "reason": "UK drill's signature is a cold two-chord minor loop with sliding 808 glides carrying the melody; the harmony is a low sustained bed, never a per-bar chord change, and never arpeggiated."
  },
  "brooklyn-drill": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "stab",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.7
        }
      }
    },
    "reason": "Brooklyn drill is punchier and more aggressive than the London template, built on short minor-triad stabs (often a pitched-up sample chop) plus a knocking 808; a sustained pad default would kill the attack."
  },
  "jersey-drill": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "stab",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.9
        },
        "kick": {
          "style": "authored"
        }
      }
    },
    "reason": "Jersey drill fuses drill's dark minor harmony with Jersey club's rapid kick-bun/chopped-vocal syncopation, so chords are brief repeated stabs locked to the kick pattern instead of one long pad per bar."
  },
  "future-bass": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": 1,
        "progressionId": "axis-of-awesome"
      },
      "roles": {
        "lead": {
          "style": "staccato"
        }
      }
    },
    "reason": "Future bass is defined by huge detuned supersaw 9th/11th stacks an octave up, voiced wide and bright over a 4-bar pop progression; the default's plain 7th in the written register misses the bright stacked-supersaw sonority."
  },
  "kawaii-future-bass": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "arpeggio",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 2,
        "arpStepBeats": 0.25,
        "progressionId": "royal-road-jpop"
      },
      "roles": {
        "lead": {
          "style": "staccato"
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.4
        }
      }
    },
    "reason": "Kawaii future bass pushes the same supersaw stacks to bell-like glockenspiel/vocal-chop registers with busy 16th-note arpeggiated sparkle and J-pop chord movement; the register must sit two octaves up and the chords are broken, not held."
  },
  "synthwave": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": 1,
        "progressionId": "epic-minor-hero"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.6
        },
        "lead": {
          "style": "legato"
        }
      }
    },
    "reason": "Synthwave/outrun is wide detuned analog pads playing bright minor-key seventh chords over a driving 8th-note octave bass, so the pad register goes up an octave while the bass gate gets short and pulsing."
  },
  "vaporwave": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "sustain",
        "chordBeats": 8,
        "bars": 8,
        "octaveOffset": -2,
        "progressionId": "lofi-chill-glide"
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.8
        }
      }
    },
    "reason": "Vaporwave is 80s smooth-jazz/synth-funk harmony played back slowed and pitch-bent down, so chords are smeared lo-fi sevenths lasting half a pattern in a low register, the opposite of the category's brisk 4-beat pad."
  },
  "chillwave": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "sustain",
        "chordBeats": 8,
        "bars": 4,
        "octaveOffset": -1,
        "progressionId": "lofi-chill-glide"
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.8
        },
        "lead": {
          "style": "legato"
        }
      }
    },
    "reason": "Chillwave is hazy, wow-and-flutter-drenched bedroom synth music: a couple of washed seventh chords ring for two bars each under lazy reverb-soaked vocals, so the harmony must drag far slower than the Electronic default."
  },
  "downtempo": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 4,
        "bars": 2,
        "octaveOffset": 0,
        "progressionId": "lofi-chill-glide"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.6
        },
        "percussion": {
          "style": "ghost",
          "everySteps": 4
        }
      }
    },
    "reason": "Downtempo is a smoky two-bar minor-seventh loop with sparse head-nod percussion and a soft Rhodes/electric-piano chord that is played as a laid-back stab, not a full-bar sustain; the category's 4-bar form is too long for its two-chord vamps."
  },
  "trip-hop": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "broken",
        "chordBeats": 4,
        "bars": 2,
        "octaveOffset": -1,
        "arpStepBeats": 0.5,
        "progressionId": "lofi-chill-glide"
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.8
        },
        "percussion": {
          "style": "ghost",
          "everySteps": 4
        }
      }
    },
    "reason": "Trip-hop harmony is a dark dusty minor-seventh Rhodes figure picked out as a broken/syncopated riff over a slow 2-bar boom-bap loop with sub-heavy bass; a plain 4-bar sustained pad is far too even and too long."
  },
  "glitch-hop": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 1,
        "bars": 2,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "ratchet",
          "ratchet": 2,
          "gateScale": 0.8
        },
        "percussion": {
          "style": "ghost",
          "everySteps": 2
        }
      }
    },
    "reason": "Glitch hop is midtempo funk chopped into stuttering, off-grid fragments, so chords are one-beat stabs and the bass itself is ratcheted; sustained harmony would fight the glitch edits."
  },
  "idm": {
    "expression": {
      "chord": {
        "quality": "quartal",
        "style": "stab",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.9
        },
        "percussion": {
          "style": "ghost",
          "everySteps": 2
        },
        "fx": {
          "style": "authored"
        }
      }
    },
    "reason": "IDM harmony is deliberately ambiguous — quartal/fourth-stacked and dissonant voicings played as clipped stabs inside intricate broken drum programming, not the functional seventh-chord pad the Electronic default assumes."
  },
  "ambient": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "sustain",
        "chordBeats": 16,
        "bars": 8,
        "octaveOffset": 1
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 2
        },
        "lead": {
          "style": "legato"
        }
      }
    },
    "reason": "Ambient chords change every two to four bars and ring indefinitely in a high, open, voicing-rich register; a chord every beat (chordBeats 4) would be structurally wrong for the genre."
  },
  "ambient-dub": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "sustain",
        "chordBeats": 8,
        "bars": 8,
        "octaveOffset": 0
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 2
        },
        "percussion": {
          "style": "ghost",
          "everySteps": 4
        }
      }
    },
    "reason": "Ambient dub stretches one huge ninth/eleventh chord across two bars and lets delay feedback do the rest of the work; the category default's one-chord-per-bar timing breaks the weightless, half-speed feel."
  },
  "lofi-house": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "block",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.7
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.3
        }
      }
    },
    "reason": "Lo-fi house is four-to-the-floor built on dusty, sampled, low-passed seventh block chords in a low register with short filtered bass; the category's sustained pad and legato bass are too smooth and too present."
  },
  "chiptune": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "arpeggio",
        "chordBeats": 1,
        "bars": 4,
        "octaveOffset": 1,
        "arpStepBeats": 0.25
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.5
        },
        "lead": {
          "style": "staccato"
        }
      }
    },
    "reason": "Chiptune is limited to three square/pulse channels, so harmony is fast 16th-note arpeggiated bright triads (the classic NES technique) with a short pulse bass — sustained seventh pads are physically impossible on the hardware."
  },
  "hardstyle": {
    "expression": {
      "chord": {
        "quality": "quartal",
        "style": "stab",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 1
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.6
        },
        "lead": {
          "style": "staccato"
        }
      }
    },
    "reason": "Hardstyle uses a reversed-bass kick plus screeching detuned lead stabs that are quartal/fourth-based and pushed up an octave for bite; lush sustained seventh chords are antithetical to the distorted 150 BPM drive."
  },
  "hardcore-gabber": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 1,
        "bars": 4,
        "octaveOffset": 0
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.5
        },
        "kick": {
          "style": "authored"
        }
      }
    },
    "reason": "Gabber harmony is minimal to the point of being optional: bare distorted power-chord jabs between machine-gun kicks, with no extensions and no sustain anywhere."
  },
  "frenchcore": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 1,
        "bars": 4,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.5
        },
        "kick": {
          "style": "authored"
        }
      }
    },
    "reason": "Frenchcore runs the kick at 200+ BPM with distorted hoover/power-chord hits as rhythmic punctuation lower and harder than gabber; seventh harmony or pads have no place in the mix."
  },
  "happy-hardcore": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "stab",
        "chordBeats": 1,
        "bars": 4,
        "octaveOffset": 2,
        "progressionId": "axis-of-awesome"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.5
        },
        "lead": {
          "style": "legato"
        }
      }
    },
    "reason": "Happy hardcore pairs a 170 BPM kick with major-key piano/supersaw stabs in a very high register and a saccharine I-V-vi-IV topline; the Electronic default's mid-register minor-ish sustained seventh is the wrong mood and register."
  },
  "moombahton": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": 0,
        "progressionId": "just-the-two-of-us"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.9
        },
        "percussion": {
          "style": "ghost",
          "everySteps": 2
        }
      }
    },
    "reason": "Moombahton is dembow/tribal percussion at 108 BPM with short, dry, repetitive minor stabs that punctuate the riddim rather than carry harmony; a sustained one-chord-per-bar pad would mask the three-kick dembow pattern."
  },
  "jersey-club": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 1,
        "bars": 2,
        "octaveOffset": 1
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.6
        },
        "kick": {
          "style": "authored"
        }
      }
    },
    "reason": "Jersey club is 130-140 BPM bed-squeak/kick-bun music where chopped vocal and synth chords fire as rapid bright one-beat stabs over the kick pattern; there are no pads and no slow harmony."
  },
  "footwork": {
    "expression": {
      "chord": {
        "quality": "quartal",
        "style": "stab",
        "chordBeats": 1,
        "bars": 2,
        "octaveOffset": 0
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.5
        }
      }
    },
    "reason": "Footwork's 160 BPM triplet-heavy patterns chop vocal samples and synth hits into very short, often dissonant repeated stabs; the harmony is rhythmic material, never a sustained chord bed."
  },
  "phonk": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "stab",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.6
        },
        "percussion": {
          "style": "ghost",
          "everySteps": 2
        }
      }
    },
    "reason": "Phonk loops dusty 90s Memphis cassette samples: dark sparse minor triads as short lo-fi stabs with a cowbell and a long 808, deliberately low-register and dirty. Extensions and sustained pads would hide the tape grit."
  },
  "drift-phonk": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "stab",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": -2
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.7
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.3
        }
      }
    },
    "reason": "Drift phonk is a two-chord, heavily distorted cowbell-and-808 loop at ~130 BPM with a very low, blown-out triad stab; the harmony is almost static and must stay minimal and dark."
  },
  "electro": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.6
        },
        "percussion": {
          "style": "authored"
        }
      }
    },
    "reason": "Classic electro (Planet Rock lineage) is stark and minimal — one or two bare power/sus stabs against a booming 808 and vocoder, with no chord extensions or pad sustain at all."
  },
  "breakbeat": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 1,
        "bars": 2,
        "octaveOffset": 0,
        "progressionId": "just-the-two-of-us"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.2
        },
        "percussion": {
          "style": "ghost",
          "everySteps": 2
        }
      }
    },
    "reason": "Breakbeat chop-ups punctuate the syncopated amen with short, treated funk seventh stabs on offbeats; a four-beat sustained pad would flatten the groove's syncopation."
  },
  "big-beat": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": 0
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.8
        },
        "percussion": {
          "style": "ghost",
          "everySteps": 2
        }
      }
    },
    "reason": "Big beat is brash and simple: loud block power/fourth stabs and breakbeat drums, closer to rock riffing than to chord-pad writing, so a sustained seventh-chord default is far too polite."
  },
  "old-school-hip-hop": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "block",
        "chordBeats": 4,
        "bars": 2,
        "octaveOffset": 1,
        "progressionId": "doo-wop-fifties"
      },
      "roles": {}
    },
    "reason": "Old school rap recycles 2-bar disco/soul vamps, most of them the 1950s doo-wop I-vi-IV-V turnaround; keeping 7th block chords one per bar with the register up matches the party-record loop."
  },
  "boom-bap": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 2,
        "octaveOffset": 1
      },
      "roles": {}
    },
    "reason": "Boom bap harmony is a dusty two-chord soul-jazz minor 7th sample that rings for a full bar each; the loop is the phrase, so the chords sustain instead of being re-struck as short blocks."
  },
  "east-coast-hip-hop": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "block",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 1
      },
      "roles": {}
    },
    "reason": "East Coast (DJ Premier / Pete Rock) piano and filtered sample loops move in two-beat chops across a 4-bar jazzy minor 7th cycle, twice the category's 2-bar length and twice the chord rate."
  },
  "g-funk": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": 1
      },
      "roles": {}
    },
    "reason": "G-Funk's signature is a high whiny portamento synth holding lush major 7th/9th voicings across a 4-bar loop, so extended 9th/11th colour and long sustains replace plain 2-bar 7th blocks."
  },
  "west-coast-hip-hop": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "block",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 1
      },
      "roles": {}
    },
    "reason": "West Coast G-funk-era rhodes/piano plays bright major 7th/9th block chords moving twice a bar in a laid-back 4-bar loop, brighter and denser than the category's 2-bar 7th block."
  },
  "trap-rap": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "arpeggio",
        "chordBeats": 4,
        "bars": 2,
        "octaveOffset": 1,
        "arpStepBeats": 0.5
      },
      "roles": {
        "hihat": {
          "style": "ratchet",
          "ratchet": 3,
          "gateScale": 0.3
        }
      }
    },
    "reason": "Trap strips harmony to dark minor triads voiced as sparse bell/pluck arpeggios, one chord per bar, with rolling 1/32 triplet hi-hat ratchets; a 2-beat block 7th pad would be far too busy."
  },
  "conscious-hip-hop": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "block",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 1
      },
      "roles": {}
    },
    "reason": "Conscious rap uses warm soul/jazz sample vocabulary: 9th and 11th block chords that actually move, changing twice a bar over a full 4-bar progression instead of a static 2-bar 7th loop."
  },
  "emo-rap": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "arpeggio",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": 1,
        "arpStepBeats": 0.5
      },
      "roles": {}
    },
    "reason": "Emo rap is melancholy minor 7th guitar/pluck arpeggios ringing over a 4-bar loop, not 2-beat block chords; the broken 1/8 figure is the genre's defining texture."
  },
  "cloud-rap": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 8,
        "octaveOffset": 1
      },
      "roles": {}
    },
    "reason": "Cloud rap is hazy, reverb-drenched 9th pads drifting over long 8-bar cycles with one chord per bar, deliberately blurrier and slower than the category's 2-bar block default."
  },
  "southern-hip-hop": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "block",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": 1
      },
      "roles": {}
    },
    "reason": "Dirty South keeps harmony stark: bare minor triad stabs over a slow half-time 808 groove in a 4-bar loop, without the 7th extensions or 2-bar turnaround the category assumes."
  },
  "lofi-hip-hop": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "broken",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": 1,
        "arpStepBeats": 0.5,
        "progressionId": "lofi-chill-glide"
      },
      "roles": {}
    },
    "reason": "Lo-fi hip hop is warm, slightly detuned 9th/11th keys broken into lazy 1/8 fragments over the lofi-chill-glide 2-bar turnaround, rather than uniform 4-beat block chords."
  },
  "delta-blues": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "block",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": 0,
        "progressionId": "twelve-bar-blues"
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 2
        }
      }
    },
    "reason": "Delta blues is sparse acoustic country blues: one dominant-7th chord per bar (chordBeats 4) over the 12-bar form, not the category's busy 2-beat comping, and the bass holds a drone-like root instead of a walking line."
  },
  "chicago-blues": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0,
        "progressionId": "twelve-bar-blues"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.2
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.5
        }
      }
    },
    "reason": "Chicago blues comps punchy short dominant-7th stabs (style stab) against a shuffling band, so the chords must be clipped rather than the category default block, and the bass is a tight walking/shuffle line, not the long 1.6-gate legato."
  },
  "texas-blues": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "strum",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0,
        "progressionId": "twelve-bar-blues"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.4
        }
      }
    },
    "reason": "Texas blues is a shuffle: rolled/strummed dominant-7th chords on a triplet shuffle feel over the 12-bar form, so a strum rather than a flat block is needed for the T-Bone Walker / SRV comping style."
  },
  "electric-blues": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0,
        "progressionId": "twelve-bar-blues"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.2
        }
      }
    },
    "reason": "Electric blues (B.B./Albert King, Freddie King) backs the lead with very short clipped dominant-7th punctuations on the 12-bar form, so stab with 2-beat chords replaces the default block; the bass pushes a tight two-beat/shuffle line."
  },
  "traditional-jazz": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "block",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0,
        "progressionId": "doo-wop-fifties"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.4
        }
      }
    },
    "reason": "Dixieland/swing-era comping sits on I-vi-IV-V turnarounds (doo-wop-fifties) with 2-beat block voicings over a two-feel walking bass, rather than the category's scale-degree chord cycle."
  },
  "bebop": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "block",
        "chordBeats": 1,
        "bars": 4,
        "octaveOffset": 0,
        "progressionId": "major-two-five-one"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.5
        }
      }
    },
    "reason": "Bebop harmony moves every beat (chordBeats 1) through dense ii-V-I chains with 9th/13th/alterations, so quality extended and the major-two-five-one progression replace the default 2-beat seventh block; the bass walks quarter notes with a short 1.0 gate."
  },
  "hard-bop": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "block",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0,
        "progressionId": "major-two-five-one"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.2
        }
      }
    },
    "reason": "Hard bop keeps bebop's ii-V-I extended harmony but states it every 2 beats (half the bebop rate), giving the gutbucket, less frantic comping of the Jazz Messengers era."
  },
  "cool-jazz": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "block",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": 0,
        "progressionId": "major-two-five-one"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.4
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.4
        }
      }
    },
    "reason": "Cool jazz is relaxed and sparse: wide extended voicings held a full bar (chordBeats 4) with brushed rather than driving time, so it must not inherit the 2-beat category comping."
  },
  "modal-jazz": {
    "expression": {
      "chord": {
        "quality": "quartal",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": 0
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 2
        }
      }
    },
    "reason": "Modal jazz (Kind of Blue) deliberately abandons functional changes: quartal voicings sustained for a full bar (chordBeats 4 over a 4-bar form) above a pedal bass, with no progressionId at all."
  },
  "free-jazz": {
    "expression": {
      "chord": {
        "quality": "quartal",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": 0
      },
      "roles": {
        "bass": {
          "style": "authored"
        }
      }
    },
    "reason": "Free jazz is intentionally non-functional: quartal/cluster sonorities sustained across bars (chordBeats 4 against a 4-bar span, no progressionId) instead of a repeating tonal cycle, with no written walking bass."
  },
  "jazz-fusion": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "block",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 1,
        "progressionId": "just-the-two-of-us"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 1
        }
      }
    },
    "reason": "Jazz fusion lays bright electric-piano extended voicings (register +1) in syncopated 2-beat block hits over modal/ii-V vamp harmony (just-the-two-of-us), with a short funky electric bass rather than a walking acoustic one."
  },
  "smooth-jazz": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "block",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": 1,
        "progressionId": "major-two-five-one"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.6
        }
      }
    },
    "reason": "Smooth jazz pads lush high-register extended block chords (register +1) for a full bar each (chordBeats 4) under its ii-V-I-based grooves, twice as slow as the category's 2-beat comp."
  },
  "acid-jazz": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0,
        "progressionId": "just-the-two-of-us"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.9
        }
      }
    },
    "reason": "Acid jazz is a funk groove first: short clipped 7th/9th organ and Rhodes stabs on the just-the-two-of-us vamp, with a very short staccato funk bass instead of the default sustain/legato backing."
  },
  "gypsy-jazz": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 1,
        "progressionId": "major-two-five-one"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1
        }
      }
    },
    "reason": "Gypsy jazz 'la pompe' is a fast muted chunk on 6th/7th chords — short stab chords with a bright high register (+1) over Django-style ii-V-I changes — so the chord must be clipped, not a sustained block."
  },
  "salsa": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "broken",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": 1,
        "arpStepBeats": 0.5
      },
      "roles": {}
    },
    "reason": "Salsa piano/tres plays a syncopated montuno: off-beat broken figures at eighth-note (0.5-beat) rate across a 2-bar vamp, not a plain 4-bar triad cycle. The harmony moves every two beats with 7th colour and a bright +1 register, which is the montuno's whole character."
  },
  "bachata": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "broken",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": 1,
        "arpStepBeats": 0.5,
        "progressionId": "sensitive-female"
      },
      "roles": {}
    },
    "reason": "Bachata's requinto/guitar arpeggiates syncopated 7th-chord figures that loop every 2 bars, with the genre's signature vi-IV-I-V minor-flavoured cycle. A 4-bar plain-triad broken default is both too plain in colour and too static for the bachata's two-bar groove."
  },
  "reggae": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": 0
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 0.8
        }
      }
    },
    "reason": "Reggae's identity is the off-beat skank: short muted guitar/organ stabs on the 'and' of 2 and 4 over a 2-bar one-drop loop, so chords are stabs rather than a continuous broken arpeggio. The bass is also short-gated and deep to leave the skank and drums their space."
  },
  "dancehall": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": 0,
        "progressionId": "epic-minor-hero"
      },
      "roles": {}
    },
    "reason": "Dancehall riddims are sparse minor vamps (the i-VI-III-VII cycle) carried by clipped synth/organ stabs, not a flowing broken figure. A 2-bar loop with two-beat stabs mirrors the riddim's two-bar identity."
  },
  "reggaeton": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "stab",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0,
        "progressionId": "sensitive-female"
      },
      "roles": {}
    },
    "reason": "Reggaeton harmony is subordinate to the dembow: the chord track only punches short off-beat stabs every two beats over a 4-bar vi-IV-I-V loop. Plain triads with no arpeggio motion are correct; a broken 4-beat figure would fight the beat."
  },
  "afrobeat": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "broken",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 1,
        "arpStepBeats": 0.25
      },
      "roles": {}
    },
    "reason": "Afrobeat guitar and Rhodes interlock in repeating 16th-note call-and-response cells, so the figure must be broken at 0.25-beat resolution with 7th colour over a 4-bar groove cycle. Eighth-note broken triads in the middle register lose the interlocking high-life texture."
  },
  "amapiano": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "sustain",
        "chordBeats": 8,
        "bars": 4,
        "octaveOffset": -1
      },
      "roles": {}
    },
    "reason": "Amapiano's log drum owns the rhythm, so the piano/synth chords are deep jazzy 7th/9th pads that ring for two bars (8 beats) in a low register. The category's busy broken arpeggio is exactly the wrong texture for the genre's spacious chords."
  },
  "bossa-nova": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "broken",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0,
        "arpStepBeats": 0.5,
        "progressionId": "major-two-five-one"
      },
      "roles": {}
    },
    "reason": "Bossa nova's defining nylon-string comp is a syncopated two-beat broken pattern of rootless 7th/9th voicings over jazz ii-V-I harmony. The default's plain triads drop the 7th/9th colour that makes bossa sound like bossa."
  },
  "samba": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "broken",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": 1,
        "arpStepBeats": 0.25
      },
      "roles": {}
    },
    "reason": "The cavaquinho drives samba with fast 16th-note broken figures, so the arpeggio step halves to 0.25 beats. A 2-bar loop of 7th chords in a bright +1 register matches the busy, percussion-heavy batucada."
  },
  "cumbia": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": 1
      },
      "roles": {}
    },
    "reason": "Cumbia's accordion/organ/guitar answers the guacharaca with short off-beat stabs in a bright register over a 2-bar vamp. Cumbia has no broken arpeggio figure: the chords punch and release, so stab replaces broken."
  },
  "kuduro": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "stab",
        "chordBeats": 1,
        "bars": 2,
        "octaveOffset": 0
      },
      "roles": {}
    },
    "reason": "Kuduro is fast, aggressive Angolan dance music whose chord track is one-beat stabs on a 2-bar loop. Chords change on every beat rather than flowing as a 4-bar broken arpeggio in the category default."
  },
  "traditional-pop": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "strum",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0,
        "progressionId": "doo-wop-fifties"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.4
        },
        "lead": {
          "style": "legato",
          "gateScale": 1.2
        },
        "hihat": {
          "style": "authored"
        }
      }
    },
    "reason": "Great American Songbook / 50s pop is small-band block-and-strum 7th chords with two chords per bar and a I-vi-IV-V turnaround, not a per-bar synth arpeggio."
  },
  "synth-pop": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "sustain",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 1,
        "progressionId": "axis-of-awesome"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.8
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.4
        }
      }
    },
    "reason": "Synth-pop pads hold bright sustained 7th voicings an octave up over a driving sequencer; fast arpeggios belong to the synth line, not the chord comp."
  },
  "disco": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 1,
        "bars": 4,
        "octaveOffset": 1
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.6
        },
        "hihat": {
          "style": "authored"
        },
        "percussion": {
          "style": "authored"
        },
        "snare": {
          "style": "authored"
        }
      }
    },
    "reason": "Disco guitar/string \"chank\" is one-beat off-beat stabs on 7th chords an octave up against a four-on-the-floor and octave bass; sustained or arpeggiated chords smear the groove."
  },
  "eurodance": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "sustain",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 1,
        "progressionId": "axis-of-awesome"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.7
        },
        "lead": {
          "style": "staccato"
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.4
        }
      }
    },
    "reason": "Eurodance is a bright supersaw/brass hook over a four-chord anthem at two chords per bar, with a short pumping off-beat bass rather than a laid-back pop arpeggio."
  },
  "funk": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 1,
        "bars": 4,
        "octaveOffset": 1,
        "progressionId": "just-the-two-of-us"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.5
        },
        "hihat": {
          "style": "authored"
        },
        "percussion": {
          "style": "authored"
        },
        "snare": {
          "style": "authored"
        }
      }
    },
    "reason": "Funk comping is the single-chord 16th-note \"chank\" — short muted stabs on a static I7 vamp; anything longer than a beat kills the syncopation."
  },
  "soul": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "block",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0,
        "progressionId": "just-the-two-of-us"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.4
        },
        "lead": {
          "style": "legato",
          "gateScale": 1.3
        }
      }
    },
    "reason": "60s/70s soul uses warm block 7th-and-9th voicings held about two beats under a melodic bass, not a fast per-16th arpeggio."
  },
  "neo-soul": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "broken",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": -1,
        "arpStepBeats": 0.5,
        "progressionId": "just-the-two-of-us"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.5
        },
        "hihat": {
          "style": "ghost",
          "everySteps": 2
        },
        "percussion": {
          "style": "ghost",
          "everySteps": 2
        }
      }
    },
    "reason": "Neo-soul is dense, behind-the-beat broken comping of rootless 9th/11th/13th voicings voiced low in the left hand with ghost-note drums; a plain triad arpeggio has neither the extensions nor the pocket."
  },
  "contemporary-rnb": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "broken",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 1,
        "arpStepBeats": 0.5,
        "progressionId": "just-the-two-of-us"
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.6
        },
        "percussion": {
          "style": "ghost",
          "everySteps": 2
        }
      }
    },
    "reason": "Modern R&B is sparse, airy 9th/11th chords spread broken high in the register with lots of space between hits, over sub-heavy sustained bass."
  },
  "alternative-rnb": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.8
        },
        "lead": {
          "style": "legato",
          "gateScale": 1.6
        },
        "percussion": {
          "style": "ghost",
          "everySteps": 2
        }
      }
    },
    "reason": "Alternative R&B (PBR&B) is hazy, dark and reverb-drenched: one low extended chord per bar that rings out, instead of busy bright arpeggios."
  },
  "motown": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 0,
        "progressionId": "doo-wop-fifties"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.2
        },
        "hihat": {
          "style": "authored"
        },
        "percussion": {
          "style": "authored"
        },
        "snare": {
          "style": "authored"
        }
      }
    },
    "reason": "The Motown sound is short punched 7th-chord backbeats from guitar and strings on a I-vi-IV-V doo-wop form, on top of a melodic James Jamerson bass — never a smooth pad or arpeggio."
  },
  "city-pop": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "arpeggio",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 1,
        "arpStepBeats": 0.25,
        "progressionId": "just-the-two-of-us"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.3
        },
        "lead": {
          "style": "legato",
          "gateScale": 1.4
        }
      }
    },
    "reason": "City pop (Tatsuro Yamashita / Mariya Takeuchi) is bright major-7th and 9th chords arpeggiated high over a lyrical bass and lush 80s production, with two chords per bar."
  },
  "k-pop": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "stab",
        "chordBeats": 1,
        "bars": 2,
        "octaveOffset": 1,
        "progressionId": "axis-of-awesome"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.6
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.4
        },
        "percussion": {
          "style": "authored"
        }
      }
    },
    "reason": "K-pop production is punchy and section-based: short bright stabs that cut through on a two-bar four-chord loop, not four bars of smooth arpeggio."
  },
  "j-pop": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "arpeggio",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": 1,
        "arpStepBeats": 0.25,
        "progressionId": "royal-road-jpop"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.4
        },
        "lead": {
          "style": "legato",
          "gateScale": 1.5
        }
      }
    },
    "reason": "J-pop/anison harmony is the bright royal-road IV-V-iii-vi progression with shimmering high 7th arpeggios and a busy melodic bass, two chords per bar."
  },
  "rock-and-roll": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "block",
        "chordBeats": 4,
        "bars": 4,
        "octaveOffset": -1,
        "progressionId": "doo-wop-fifties"
      },
      "roles": {
        "bass": {
          "style": "authored"
        },
        "hihat": {
          "style": "authored"
        }
      }
    },
    "reason": "Fifties rock and roll is I-vi-IV-V (and I-IV-V) major triads/sixths held a full bar with a backbeat, not the category's power-chord stabs; the doo-wop turnaround is the actual convention here."
  },
  "blues-rock": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "block",
        "chordBeats": 2,
        "bars": 4,
        "octaveOffset": -1,
        "progressionId": "twelve-bar-blues"
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.5
        },
        "hihat": {
          "style": "authored"
        }
      }
    },
    "reason": "Blues rock is a dominant-seventh 12-bar form: I7-IV7-V7 with a shuffle, changing every two beats inside a four-bar phrase, so stabbing root-fifth power chords erase the whole harmony."
  },
  "hard-rock": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 4,
        "bars": 2,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.3
        },
        "hihat": {
          "style": "authored"
        }
      }
    },
    "reason": "Hard rock keeps the power chord but moves harmony once a bar in riff-locked whole-bar chunks rather than twice a bar; the category's 4-beat default is right, the 2-chords-per-bar rhythm is not."
  },
  "punk-rock": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": -1,
        "progressionId": "punk-power-chords"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.8
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.4
        }
      }
    },
    "reason": "Punk is downstroked root-fifth chords slammed two per bar at high tempo; the I5-bVII5-bVI5 descent of punk-power-chords is the canonical Ramones/Green Day move and needs a short stab, never a ringing 4-beat hold."
  },
  "post-punk": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "arpeggio",
        "chordBeats": 4,
        "bars": 2,
        "octaveOffset": 1,
        "arpStepBeats": 0.5
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.6
        },
        "hihat": {
          "style": "authored"
        }
      }
    },
    "reason": "Post-punk guitar is chorused clean full triads picked as single-note arpeggios in a high, cutting register (Joy Division, Gang of Four), the opposite of muted low power chords."
  },
  "new-wave": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "sustain",
        "chordBeats": 4,
        "bars": 2,
        "octaveOffset": 0
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.5
        }
      }
    },
    "reason": "New wave washes are chorused major/minor triads ringing for a whole bar with heavy reverb and no distortion; a short low power-chord stab removes the genre's signature shimmer."
  },
  "heavy-metal": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 4,
        "bars": 2,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.9
        },
        "hihat": {
          "style": "authored"
        }
      }
    },
    "reason": "Classic heavy metal rides one power chord per bar under a mid-tempo palm-muted riff instead of changing twice a bar; the harmony must breathe so the riff and vocal carry the movement."
  },
  "thrash-metal": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": -1,
        "progressionId": "punk-power-chords"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.7
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.3
        }
      }
    },
    "reason": "Thrash is skank-beat downpicking at 180+ BPM: clipped root-fifth chords two per bar with chromatic I5-bVII5-bVI5 shifts and machine-gun kick patterning."
  },
  "death-metal": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.6
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.3
        }
      }
    },
    "reason": "Death metal tremolo-picked palm mutes are the shortest events in the library: low-register power chords two per bar with no sustain, so the blast beat supplies all the perceived motion."
  },
  "black-metal": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 4,
        "bars": 2,
        "octaveOffset": 0,
        "progressionId": "epic-minor-hero"
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.7
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.3
        }
      }
    },
    "reason": "Black metal is a tremolo-picked wall of mid-register power chords over blast beats held a bar at a time with a two-bar minor loop; dropping an octave would muddy the blast and the tremolo needs the middle register."
  },
  "doom-metal": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "sustain",
        "chordBeats": 8,
        "bars": 2,
        "octaveOffset": -2
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.9
        },
        "hihat": {
          "style": "authored"
        }
      }
    },
    "reason": "Doom is the inversion of the category default: 50-70 BPM power chords sustained for two full bars in the deepest register (Sabbath, Candlemass), a funeral trudge rather than a stab."
  },
  "metalcore": {
    "expression": {
      "chord": {
        "quality": "power",
        "style": "stab",
        "chordBeats": 2,
        "bars": 2,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.7
        },
        "hihat": {
          "style": "staccato",
          "gateScale": 0.35
        }
      }
    },
    "reason": "Metalcore is built on drop-tuned chug breaks: the same clipped power chords two per bar, but with abrupt half-time gaps, so the staccato stab must stay tight against the breakdown."
  },
  "grunge": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "strum",
        "chordBeats": 8,
        "bars": 2,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "authored"
        },
        "hihat": {
          "style": "authored"
        }
      }
    },
    "reason": "Grunge uses full triads (Nirvana's open-string major/minor shapes) strummed sloppily two chords per two-bar loop, not the precise muted root-fifth stab of metal."
  },
  "alternative-rock": {
    "expression": {
      "chord": {
        "quality": "triad",
        "style": "strum",
        "chordBeats": 4,
        "bars": 2,
        "octaveOffset": -1
      },
      "roles": {
        "bass": {
          "style": "authored"
        },
        "hihat": {
          "style": "authored"
        }
      }
    },
    "reason": "Alternative rock is strummed clean-to-crunchy triads over four bars-ish phrasing rather than short low power chords; the third is part of the hook and the strum is part of the feel."
  },
  "progressive-rock": {
    "expression": {
      "chord": {
        "quality": "extended",
        "style": "broken",
        "chordBeats": 6,
        "bars": 4,
        "octaveOffset": 0,
        "arpStepBeats": 1
      },
      "roles": {
        "bass": {
          "style": "legato",
          "gateScale": 1.7
        },
        "hihat": {
          "style": "authored"
        }
      }
    },
    "reason": "Prog rock lives on extended and altered voicings with asymmetric harmonic rhythm: chords in the authored register for six beats each in odd groupings, and a broken arpeggio so the inner voices are real notes."
  },
  "math-rock": {
    "expression": {
      "chord": {
        "quality": "sus",
        "style": "stab",
        "chordBeats": 3,
        "bars": 4,
        "octaveOffset": 0
      },
      "roles": {
        "bass": {
          "style": "staccato",
          "gateScale": 0.8
        },
        "hihat": {
          "style": "authored"
        }
      }
    },
    "reason": "Math rock is angular and metric-shifting: sus/add9 clean-tone clusters that change every three beats inside four-bar odd groupings, deliberately clipped so the tapping lines stay legible."
  },
  "shoe-gaze": {
    "expression": {
      "chord": {
        "quality": "seventh",
        "style": "strum",
        "chordBeats": 8,
        "bars": 4,
        "octaveOffset": 1
      },
      "roles": {
        "bass": {
          "style": "sustain",
          "gateScale": 1.8
        },
        "hihat": {
          "style": "authored"
        }
      }
    },
    "reason": "Shoegaze is a blurred wall of wide, drenched seventh chords ringing for two bars each in a bright register (My Bloody Valentine, Ride), with the glide guitar smearing the chord changes."
  }
};
/* --- generated overrides: end --- */

/**
 * The table the resolver uses: **generated content wins on conflict**, so a reviewed per-genre
 * override always beats an older hand-written one, and removing a generated entry cannot silently
 * change behaviour back.
 */
export const GENRE_EXPRESSION: Record<string, GenreExpressionOverride> = {
  ...GENRE_EXPRESSION_AUTHORED,
  ...GENRE_EXPRESSION_GENERATED,
};

export function expressionOverrideIds(): string[] {
  return Object.keys(GENRE_EXPRESSION);
}

const mergeChord = (base: ChordRule, patch?: Partial<ChordRule>): ChordRule => ({ ...base, ...(patch ?? {}) });

const mergeRoles = (
  base: GenreExpression["roles"],
  patch?: GenreExpression["roles"]
): GenreExpression["roles"] => ({ ...base, ...(patch ?? {}) });

/**
 * The expression for a genre.
 *
 * An unknown or custom genre gets its category's profile — never another genre's overrides — so a
 * user-created genre behaves like the family it was built on rather than inheriting a stranger's
 * character.
 */
export function resolveGenreExpression(genreId: string | undefined, category: GenreCategory | undefined): GenreExpression {
  const profile = CATEGORY_EXPRESSION_PROFILES[category ?? "Electronic"] ?? CATEGORY_EXPRESSION_PROFILES.Electronic;
  const override = genreId ? GENRE_EXPRESSION[genreId] : undefined;
  if (!override) return { chord: mergeChord(profile.chord), roles: mergeRoles(profile.roles) };
  return {
    chord: mergeChord(profile.chord, override.expression.chord),
    roles: mergeRoles(profile.roles, override.expression.roles),
  };
}

/** Beats per step for the resolutions the sequencer supports. */
export function stepBeats(resolution: SequencerPattern["resolution"]): number {
  if (resolution === "1/8") return 0.5;
  if (resolution === "1/32") return 0.125;
  return 0.25;
}

/** Beats in a bar, from the pattern's time signature. */
export function beatsPerBar(timeSignature: string | undefined): number {
  const [num, den] = (timeSignature ?? "4/4").split("/");
  const beats = Number(num);
  const unit = Number(den);
  if (!Number.isFinite(beats) || !Number.isFinite(unit) || unit <= 0) return 4;
  // A "beat" here is the note value the resolution counts in (a quarter at 1/16), so a 6/8 bar
  // holds three quarter-note beats rather than six.
  return (beats * 4) / unit;
}

/** Steps in one bar for a pattern. */
export function stepsPerBarFor(pattern: Pick<SequencerPattern, "resolution" | "timeSignature">): number {
  return Math.max(1, Math.round(beatsPerBar(pattern.timeSignature) / stepBeats(pattern.resolution)));
}

/**
 * The pattern length a genre's expression asks for, in steps.
 *
 * Rounded to a whole number of bars and kept to the sizes the sequencer and the UI support, so a
 * rule cannot produce a 43-step pattern nobody can reason about.
 */
export function expressionStepCount(expression: GenreExpression, pattern: Pick<SequencerPattern, "resolution" | "timeSignature">): number {
  const perBar = stepsPerBarFor(pattern);
  const wanted = Math.max(1, Math.round(expression.chord.bars)) * perBar;
  for (const allowed of [16, 32, 64, 128]) {
    if (wanted <= allowed) return allowed;
  }
  return 128;
}

/** Roman/degree list for the expression's progression, resolved to degrees (0 = tonic). */
export function progressionDegrees(
  expression: GenreExpression,
  options?: { scale?: string; commonChords?: string[] }
): number[] {
  const rule = expression.chord;
  if (rule.progressionId) {
    const entry = POPULAR_PROGRESSIONS.find((p) => p.id === rule.progressionId);
    if (entry && entry.roman.length > 0) {
      return entry.roman.map((r) => romanToDegree(r, options?.scale));
    }
  }
  if (rule.degrees && rule.degrees.length > 0) return [...rule.degrees];
  if (options?.commonChords && options.commonChords.length > 0) {
    const firstProg = options.commonChords[0];
    if (typeof firstProg === "string") {
      const tokens = firstProg.split(/[–\-—\s>→,]+/).filter(Boolean);
      if (tokens.length > 0) {
        return tokens.map((r) => romanToDegree(r, options?.scale));
      }
    }
  }
  // No progression declared: hold the tonic, which is at least musically coherent.
  return [0];
}

/** "bVII" / "♭VII" / "IV" / "vi°" → a scale degree, as a semitone offset from the tonic. */
export function romanToDegree(roman: string, scale?: string): number {
  const text = roman.trim().replace(/[°ø+Δ]/g, "");
  const flat = /^[b♭]/.test(text) ? -1 : 0;
  const sharp = /^[#♯]/.test(text) ? 1 : 0;
  const body = text.replace(/^[b♭#♯]/, "");
  if (body.toUpperCase() === "N") return 1;
  const upper = body.toUpperCase();
  const table: Record<string, number> = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
  let base = table[upper.replace(/[^IVX]/g, "")] ?? 0;
  const isMinorScale = scale ? /minor|dorian|phrygian|aeolian|locrian/i.test(scale) : false;
  if (!flat && !sharp && isMinorScale) {
    if (upper === "III") base = 3;
    else if (upper === "VI") base = 8;
    else if (upper === "VII") base = 10;
  }
  return ((base + flat + sharp) % 12 + 12) % 12;
}

/** The MIDI note a chord root sits on, from the pattern's scale and the rule's register. */
export function chordRootMidi(pattern: SequencerPattern, degreeSemitones: number, octaveOffset: number, authoredRoot: number | null): number {
  const { root } = parseScaleString(pattern.scale);
  const tonicPc = NOTE_NAMES.indexOf(root as (typeof NOTE_NAMES)[number]);
  const tonic = ((tonicPc % 12) + 12) % 12;
  // Anchor on the authored root when there is one (the author's register wins), otherwise on the
  // tonic two octaves below middle C, which is a sensible chord register for this library.
  const anchor = typeof authoredRoot === "number" && authoredRoot > 0 ? authoredRoot : 48 + tonic;
  const anchorPc = ((anchor % 12) + 12) % 12;
  const wantedPc = (tonic + degreeSemitones) % 12;
  let midi = anchor + (((wantedPc - anchorPc) % 12) + 12) % 12;
  midi += octaveOffset * 12;
  return Math.max(0, Math.min(127, midi));
}

/** Steps a chord lasts, from its beat length. */
export function chordSteps(expression: GenreExpression, pattern: SequencerPattern): number {
  return Math.max(1, Math.round(expression.chord.chordBeats / stepBeats(pattern.resolution)));
}

/** Steps between arpeggio notes. */
function arpSteps(expression: GenreExpression, pattern: SequencerPattern): number {
  const beats = expression.chord.arpStepBeats ?? 0.25;
  return Math.max(1, Math.round(beats / stepBeats(pattern.resolution)));
}

/**
 * Writes a genre's chords, phrase lengths and pattern length **into the pattern**.
 *
 * The authored data keeps its role (which root, at which step) and this turns it into notes: real
 * stacks in `pitches`, real lengths in `gate`, arpeggios as real notes on their own steps. Looping
 * tracks keep their authored length as `trackLength`, so a longer progression repeats them instead
 * of requiring them to be re-authored.
 *
 * **A track the author left silent stays silent** — nothing here invents content, which is why an
 * `fx`-less genre keeps no `fx` part.
 *
 * Idempotent by construction: a pattern that already carries `pitches` on its chords track is
 * returned untouched, so re-loading a genre cannot overwrite the user's own chord edits.
 */
export function expandGenrePattern(
  pattern: SequencerPattern,
  expression: GenreExpression,
  options: { authoredStepCount?: number; commonChords?: string[] } = {}
): SequencerPattern {
  const chordsTrack = pattern.tracks.find((t) => t.track_id === "chords");
  if (chordsTrack?.pitches?.some((stack) => Array.isArray(stack) && stack.length > 0)) {
    // Already expanded (or edited by the user). Re-expanding would rewrite their chords from the
    // progression — the first version of this function did exactly that, turning an arpeggio into a
    // stack per note. Persisted edits win; this is the guard that makes loading a genre safe.
    return pattern;
  }

  const total = expressionStepCount(expression, pattern);
  const authored = options.authoredStepCount ?? pattern.tracks[0]?.steps.length ?? total;
  const perBar = stepsPerBarFor(pattern);
  const degrees = progressionDegrees(expression, { scale: pattern.scale, commonChords: options.commonChords });
  const slots = Math.max(1, Math.floor(total / chordSteps(expression, pattern)));
  const style = expression.chord.style;
  const voicingStyle = VOICING_FOR_QUALITY[expression.chord.quality];

  const tracks = pattern.tracks.map((track) => {
    const role = track.track_id as ExpressionRole;

    // Grow every track's arrays to the new length (the store derives the step count from them).
    // The authored loop repeats across all total steps so the track data is complete across all bars.
    const authoredStepCount = track.steps.length || authored;
    const steps = Array.from({ length: total }, (_, i) => (authoredStepCount > 0 ? track.steps[i % authoredStepCount] : 0));
    const pitch = Array.from({ length: total }, (_, i) => (track.pitch && track.pitch.length > 0 ? track.pitch[i % track.pitch.length] : null));
    const pitches = Array.from(
      { length: total },
      (_, i) => (track.pitches && track.pitches.length > 0 ? track.pitches[i % track.pitches.length] : null)
    );
    const gate = Array.from({ length: total }, (_, i) => (track.gate && track.gate.length > 0 ? track.gate[i % track.gate.length] : 0.8));
    const velocity = Array.from({ length: total }, (_, i) => (track.velocity && track.velocity.length > 0 ? track.velocity[i % track.velocity.length] : 100));
    const ratchet = Array.from({ length: total }, (_, i) => (track.ratchet && track.ratchet.length > 0 ? track.ratchet[i % track.ratchet.length] : 1));
    const probability = Array.from({ length: total }, (_, i) => (track.probability && track.probability.length > 0 ? track.probability[i % track.probability.length] : 100));

    // The pattern is longer than the authored loop: keep the authored part as the track's own loop
    // so it repeats underneath the longer progression.
    const trackLength = total > authored && (role === "kick" || role === "snare" || role === "hihat" || role === "percussion" || role === "bass")
      ? authored
      : track.trackLength;

    if (role === "chords") {
      if (isEmptyTrack(track)) {
        // The author left this genre without chords (21 genres in the library do). Writing a
        // progression here would be inventing an arrangement — the same rule that keeps an unused
        // `fx` track silent. The track is returned with its arrays grown to the new length, and
        // nothing else.
        return { ...track, steps, pitch, pitches, gate, velocity, ...(trackLength ? { trackLength } : {}) };
      }
      const authoredRoot = track.pitch?.find((p) => typeof p === "number" && p > 0) ?? null;
      for (let i = 0; i < total; i++) {
        steps[i] = 0;
        pitch[i] = null;
        pitches[i] = null;
        gate[i] = 0.8;
      }
      const chordGate = chordSteps(expression, pattern);
      const arp = arpSteps(expression, pattern);
      // The authored steps say *where the harmony moves*. When only a single placeholder step was
      // authored (or none), expand across the progression's chord slots so the progression's chords
      // all sound. When a rhythm pattern was authored (>= 2 marks), repeat it across all bars of the phrase.
      const authoredSlots = [...new Set(track.steps.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0))];
      let marks: number[];
      if (authoredSlots.length <= 1) {
        marks = Array.from({ length: slots }, (_, i) => i * chordGate);
      } else {
        const repeatCount = Math.max(1, Math.floor(total / authored));
        const repeatedMarks: number[] = [];
        for (let b = 0; b < repeatCount; b++) {
          for (const s of authoredSlots) {
            const at = b * authored + s;
            if (at < total && !repeatedMarks.includes(at)) {
              repeatedMarks.push(at);
            }
          }
        }
        repeatedMarks.sort((a, b) => a - b);
        marks = repeatedMarks.length > 0 ? repeatedMarks : Array.from({ length: slots }, (_, i) => i * chordGate);
      }

      const nextMarkAfter = (index: number): number => {
        // The next change of harmony after `marks[index]`, or the end of the pattern. A chord may
        // not outlast it: a 4-beat chord written where the harmony moves every beat would otherwise
        // ring over its successor and the progression would smear.
        const from = marks[index];
        for (let i = index + 1; i < marks.length; i++) {
          if (marks[i] > from) return marks[i];
        }
        return total;
      };

      marks.forEach((mark, index) => {
        const authoredNote = track.pitch?.[mark % authored];
        const hasAuthoredPitch = typeof authoredNote === "number" && authoredNote > 0;
        const markRoot = hasAuthoredPitch ? authoredNote : authoredRoot;
        const degree = hasAuthoredPitch && authoredSlots.length >= 2
          ? 0
          : degrees[index % degrees.length];
        const rootMidi = chordRootMidi(pattern, degree, expression.chord.octaveOffset, markRoot);
        const voicing = chordVoicingForStep(rootMidi, pattern.scale, { style: voicingStyle });

        const gap = Math.max(0.1, nextMarkAfter(index) - mark);

        if (style === "arpeggio") {
          // Written as real arpeggiated single notes when explicitly requested
          const order = voicing;
          const span = Math.max(1, Math.floor(gap / Math.max(1, order.length)));
          const stepInterval = Math.max(1, Math.min(arp, span));
          order.forEach((note, i) => {
            const at = mark + i * stepInterval;
            if (at < 0 || at >= total || at >= nextMarkAfter(index)) return;
            steps[at] = 1;
            pitches[at] = [note];
            pitch[at] = note;
            gate[at] = Math.max(0.1, Math.min(MAX_NOTE_GATE_STEPS, Math.min(stepInterval, gap)));
          });
          return;
        }

        // Block/stab/sustain/ballad/strum/broken: one stack per chord slot, held no longer than the gap to
        // the next chord.
        const nominal = style === "stab" ? Math.max(0.5, Math.min(2, chordGate / 2)) : chordGate;
        const lengthFor = Math.min(nominal, gap);
        steps[mark] = 1;
        pitches[mark] = voicing;
        pitch[mark] = Math.min(...voicing);
        gate[mark] = Math.max(0.1, Math.min(MAX_NOTE_GATE_STEPS, lengthFor));
      });
      return { ...track, steps, pitch, pitches, gate, velocity, ...(trackLength ? { trackLength } : {}) };
    }

    // Other tracks: apply the genre's phrase rule, if it declares one, to the steps that sound.
    const rule = expression.roles[role];
    if (rule && rule.style !== "authored") {
      let soundingIndex = 0;
      for (let i = 0; i < total; i++) {
        if (!(steps[i] > 0)) continue;
        const isTarget = !rule.everySteps || soundingIndex % rule.everySteps === 0;
        soundingIndex += 1;
        if (!isTarget) continue;
        const base = gate[i] ?? 0.8;
        if (rule.style === "staccato") gate[i] = Math.max(0.1, base * (rule.gateScale ?? 0.5));
        else if (rule.style === "legato" || rule.style === "sustain") {
          gate[i] = Math.max(0.1, Math.min(MAX_NOTE_GATE_STEPS, base * (rule.gateScale ?? 1.5)));
        } else if (rule.style === "ghost") {
          velocity[i] = Math.max(1, Math.round((velocity[i] ?? 100) * 0.6));
        }
      }
    }
    return {
      ...track,
      steps,
      pitch,
      pitches,
      gate,
      velocity,
      ...(track.ratchet ? { ratchet } : {}),
      ...(track.probability ? { probability } : {}),
      ...(trackLength ? { trackLength } : {}),
    };
  });

  return {
    ...pattern,
    totalSteps: total,
    tracks,
  };
}

/** True when a track carries no sounding step — the "this genre has no FX part" case. */
export function isEmptyTrack(track: SequencerTrack | undefined): boolean {
  if (!track?.steps?.length) return true;
  return !track.steps.some((v) => v > 0);
}
