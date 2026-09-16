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
    chord: { quality: "seventh", style: "sustain", chordBeats: 4, bars: 4, octaveOffset: 0 },
    roles: {
      bass: { style: "legato", gateScale: 1.4 },
      lead: { style: "authored" },
      hihat: { style: "staccato", gateScale: 0.5 },
    },
  },
  "Hip Hop": {
    // Loop-based: two bars, dark minor 7ths, short and behind the beat; the 808 owns the low end, so
    // the chords stay out of the bass's way (a small register lift, not a wide voicing).
    chord: { quality: "seventh", style: "block", chordBeats: 4, bars: 2, octaveOffset: 1 },
    roles: {
      bass: { style: "sustain", gateScale: 1.8 },
      percussion: { style: "ghost", everySteps: 2 },
    },
  },
  "Jazz/Blues": {
    // Comping: 7th chords, syncopated (two chords a bar), voiced around middle C, no arpeggios —
    // the comp is the accompaniment and the walking bass supplies the motion.
    chord: { quality: "seventh", style: "block", chordBeats: 2, bars: 4, octaveOffset: 0 },
    roles: {
      bass: { style: "legato", gateScale: 1.6 },
      lead: { style: "authored" },
    },
  },
  "Latin/World": {
    // Montuno-style: broken chords in eighths, four bars, with the percussion carrying the pattern.
    chord: { quality: "triad", style: "broken", chordBeats: 4, bars: 4, octaveOffset: 0, arpStepBeats: 0.5 },
    roles: {
      percussion: { style: "authored" },
      bass: { style: "legato", gateScale: 1.3 },
    },
  },
  "Pop/R&B": {
    // The broadest space: triads and 7ths, arpeggiated or strummed, one chord a bar, four bars.
    chord: { quality: "triad", style: "arpeggio", chordBeats: 4, bars: 4, octaveOffset: 0, arpStepBeats: 0.25 },
    roles: {
      lead: { style: "legato", gateScale: 1.5 },
      bass: { style: "authored" },
    },
  },
  "Rock/Metal": {
    // Power chords, struck short and hard, one or two a bar, with the riff repeating every two bars
    // (a rock pattern that states a four-bar progression is unusual — the riff *is* the hook).
    chord: { quality: "power", style: "stab", chordBeats: 4, bars: 2, octaveOffset: -1 },
    roles: {
      bass: { style: "authored" },
      hihat: { style: "authored" },
    },
  },
};

/**
 * Per-genre deviations.
 *
 * Each one carries its reason inline, because the interesting question about a per-genre table is
 * never "what is the value" but "why is it not the category's".
 */
export const GENRE_EXPRESSION: Record<string, GenreExpressionOverride> = {
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
    expression: { chord: { quality: "quartal", style: "sustain", chordBeats: 8 } },
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
export function progressionDegrees(expression: GenreExpression): number[] {
  const rule = expression.chord;
  if (rule.progressionId) {
    const entry = POPULAR_PROGRESSIONS.find((p) => p.id === rule.progressionId);
    if (entry && entry.roman.length > 0) {
      return entry.roman.map(romanToDegree);
    }
  }
  if (rule.degrees && rule.degrees.length > 0) return [...rule.degrees];
  // No progression declared: hold the tonic, which is at least musically coherent.
  return [0];
}

/** "bVII" / "IV" / "vi°" → a scale degree, as a semitone offset from the tonic. */
export function romanToDegree(roman: string): number {
  const text = roman.trim().replace(/[°ø+Δ]/g, "");
  const flat = /^b/.test(text) ? -1 : 0;
  const sharp = /^#/.test(text) ? 1 : 0;
  const body = text.replace(/^[b#]/, "").toUpperCase();
  const table: Record<string, number> = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
  const base = table[body.replace(/[^IVX]/g, "")] ?? 0;
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
  options: { authoredStepCount?: number } = {}
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
  const degrees = progressionDegrees(expression);
  const slots = Math.max(1, Math.floor(total / chordSteps(expression, pattern)));
  const style = expression.chord.style;
  const voicingStyle = VOICING_FOR_QUALITY[expression.chord.quality];

  const tracks = pattern.tracks.map((track) => {
    const role = track.track_id as ExpressionRole;

    // Grow every track's arrays to the new length (the store derives the step count from them).
    const steps = Array.from({ length: total }, (_, i) => (i < track.steps.length ? track.steps[i] : 0));
    const pitch = Array.from({ length: total }, (_, i) => (i < (track.pitch?.length ?? 0) ? track.pitch?.[i] ?? null : null));
    const pitches = Array.from(
      { length: total },
      (_, i) => (track.pitches && i < track.pitches.length ? track.pitches[i] : null)
    );
    const gate = Array.from({ length: total }, (_, i) => (i < (track.gate?.length ?? 0) ? track.gate?.[i] ?? 0.8 : 0.8));
    const velocity = Array.from({ length: total }, (_, i) => (i < (track.velocity?.length ?? 0) ? track.velocity?.[i] ?? 100 : 100));

    // The pattern is longer than the authored loop: keep the authored part as the track's own loop
    // so it repeats underneath the longer progression.
    const trackLength = total > authored && (role === "kick" || role === "snare" || role === "hihat" || role === "percussion" || role === "bass")
      ? authored
      : track.trackLength;

    if (role === "chords") {
      const authoredRoot = track.pitch?.find((p) => typeof p === "number" && p > 0) ?? null;
      for (let i = 0; i < total; i++) {
        steps[i] = 0;
        pitch[i] = null;
        pitches[i] = null;
        gate[i] = 0.8;
      }
      const chordGate = chordSteps(expression, pattern);
      const arp = arpSteps(expression, pattern);
      // The authored steps say *where the harmony moves*; keep that rhythm and let the progression
      // supply the degrees, so a genre that changes chord twice a bar still does.
      const authoredSlots = [...new Set(track.steps.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0))];
      const marks = authoredSlots.length > 0 ? authoredSlots : Array.from({ length: slots }, (_, i) => i * chordGate);

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
        const degree = degrees[index % degrees.length];
        const rootMidi = chordRootMidi(pattern, degree, expression.chord.octaveOffset, authoredRoot);
        const voicing = chordVoicingForStep(rootMidi, pattern.scale, { style: voicingStyle });

        if (style === "arpeggio" || style === "broken") {
          // Written as **real notes** (the user's decision): visible and editable in the roll, and
          // exported identically because there is nothing left to expand at playback.
          const order =
            style === "arpeggio"
              ? voicing
              : // Broken chords alternate the root with the upper voices: bass–chord–bass–chord.
                voicing.flatMap((note, i) => (i === 0 ? [note, note] : [note]));
          const span = Math.max(1, Math.round(chordGate / Math.max(1, order.length)));
          order.forEach((note, i) => {
            const at = mark + i * (style === "broken" ? arp : Math.min(arp, span));
            if (at < 0 || at >= total) return;
            steps[at] = 1;
            pitches[at] = [note];
            pitch[at] = note;
            // Arpeggio notes are shortened; broken-chord roots ring a little longer than the upper
            // voices, which is what makes the pattern read as an accompaniment rather than a scale.
            const length = style === "arpeggio" ? arp : i % 2 === 0 ? arp * 1.5 : arp;
            gate[at] = Math.max(0.1, Math.min(MAX_NOTE_GATE_STEPS, length));
          });
          return;
        }

        // Block/stab/sustain/ballad/strum: one stack per chord slot, held no longer than the gap to
        // the next chord.
        const gap = Math.max(0.1, nextMarkAfter(index) - mark);
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
    return { ...track, steps, pitch, pitches, gate, velocity, ...(trackLength ? { trackLength } : {}) };
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
