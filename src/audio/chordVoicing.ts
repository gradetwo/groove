/**
 * Diatonic chord voicing (E-01 in AUDIO_QUALITY_AND_SYNTH_PLAN.md).
 *
 * The defect this fixes: the `chords` track was **monophonic**. `AudioEngine.playChord`
 * triggered exactly one note from the step's `pitch`, so although every genre declares
 * a progression in `genre.common_chords` (e.g. `"i–VI–III–VII"`) that information only
 * ever reached the UI. All 159 genres therefore had no harmony at all — the "pad" was a
 * single-note melody wearing a pad preset, which is the largest single reason a genre
 * did not sound arranged.
 *
 * The approach: harmonise the step's own root pitch **diatonically in the pattern's
 * scale**, rather than trying to parse the roman-numeral progression. The sequencer's
 * `pitch` array already encodes the real roots (`house.ts` chords are `60, …, 63, …,
 * 65`), so stacking scale tones above each root produces the idiomatically correct
 * chord for that degree — and it needs **zero genre-file edits**.
 *
 * This module is deliberately pure and deterministic, and it is imported by BOTH the
 * live engine and the offline renderer. "Exporter parity" is a hard rule in this
 * project; duplicating voicing logic in two places is exactly how the two drift apart.
 */
import { parseScaleString, SCALES, NOTE_NAMES } from "../utils/scaleTheory";

/**
 * How a chord is voiced.
 *
 * A single diatonic 1-3-5 is wrong for most of this library. Rock and metal are built on
 * **power chords** (root + fifth, deliberately no third — the third is what makes a chord
 * major or minor, and that ambiguity plus the distortion intermodulation is the sound).
 * Jazz comping wants **shell** and **extended** voicings (3rds and 7ths, often no 5th, plus
 * 9ths). Modal jazz is **quartal**. Blues is dominant **sevenths**. Ambient and shoegaze
 * want wide, thirdless **open** stacks. Pop and city pop want **add9**.
 *
 * Note where this knowledge has to live: the genre records' `common_chords` field is
 * **degenerate** — every one of the 159 genres carries one of only two identical strings
 * (`i–VI–III–VII` / `i–v–VI–VII`), so it cannot distinguish bebop from death metal. The
 * genre-appropriate choice therefore comes from `src/data/genreVoicing.ts` (category
 * profile + per-genre override), exactly like the mix table does for volume/pan.
 */
export type VoicingStyle =
  | "power"
  | "triad"
  | "add9"
  | "sus"
  | "shell"
  | "seventh"
  | "extended"
  | "quartal"
  | "open";

/**
 * Legacy two-value density, still accepted so existing callers keep working.
 * `triad` → `"triad"`, `seventh` → `"seventh"`.
 */
export type VoicingDensity = "triad" | "seventh";

interface StyleDefinition {
  /** `degree` stacks scale degrees (diatonic); `interval` uses fixed semitones. */
  mode: "degree" | "interval";
  /** For `degree`: scale-degree index offsets. For `interval`: semitone offsets. */
  steps: readonly number[];
  /** Largest root-to-top interval before folding a voice down an octave. */
  span: number;
  /** Why this voicing sounds the way it does — kept next to the data on purpose. */
  note: string;
}

/**
 * The style table. Degree-based styles follow the key, so the same style yields a major,
 * minor or diminished chord depending on the root's scale degree; interval-based styles
 * (`power`, `open`) do not, because a power chord is *always* a perfect fifth.
 */
export const VOICING_STYLES: Record<VoicingStyle, StyleDefinition> = {
  power: {
    mode: "interval",
    steps: [0, 7, 12],
    span: 12,
    note: "Root + perfect fifth + octave, no third: the rock/metal power chord. Fixed intervals, not diatonic — a fifth above the 2nd degree of a minor scale is still a perfect fifth.",
  },
  open: {
    mode: "interval",
    steps: [0, 7, 12, 19],
    span: 24,
    note: "Wide and thirdless (root, 5th, octave, 12th) for ambient/shoegaze walls. Needs the larger span or the fold would collapse it back to a triad.",
  },
  triad: {
    mode: "degree",
    steps: [0, 2, 4],
    span: 16,
    note: "Plain 1-3-5. The default for functional dance/pop writing.",
  },
  add9: {
    mode: "degree",
    steps: [0, 2, 4, 8],
    span: 16,
    note: "1-3-5-9: pop, city pop and trance lift without the functional pull of a 7th.",
  },
  sus: {
    mode: "degree",
    steps: [0, 3, 4],
    span: 16,
    note: "1-4-5, no third: suspended, unresolved, the ambient/dub default.",
  },
  shell: {
    mode: "degree",
    steps: [0, 2, 6],
    span: 12,
    note: "1-3-7, no fifth: jazz shell voicing. Keeps the guide tones and leaves the midrange clear for the soloist.",
  },
  seventh: {
    mode: "degree",
    steps: [0, 2, 4, 6],
    span: 16,
    note: "1-3-5-7: blues, soul, disco, funk, boom-bap.",
  },
  extended: {
    mode: "degree",
    steps: [0, 2, 6, 8],
    span: 16,
    note: "1-3-7-9: bebop/hard-bop/neo-soul. The 5th is dropped so the 9th fits without crowding.",
  },
  quartal: {
    mode: "degree",
    steps: [0, 3, 6],
    span: 16,
    note: "Stacked fourths (1-4-b7): modal and free jazz, and the modern ambient/cinematic pad.",
  },
};

export interface ChordVoicingOptions {
  /** Voicing style. Takes precedence over `density` when both are given. */
  style?: VoicingStyle;
  /** Legacy alias: `triad` → `triad`, `seventh` → `seventh`. */
  density?: VoicingDensity;
  /**
   * Overrides the style's own span. Largest interval allowed between the root and the
   * top voice, in semitones; wider voices are folded down an octave so a pad does not
   * smear into the lead register.
   */
  span?: number;
}

/** Resolves the effective style from the new option or the legacy one. */
export function resolveVoicingStyle(options: ChordVoicingOptions = {}): VoicingStyle {
  if (options.style) return options.style;
  if (options.density === "seventh") return "seventh";
  return "triad";
}

/**
 * The interval stack for scales that cannot be harmonised by degree-stacking.
 *
 * A chromatic "scale" contains every semitone, so stacking scale degrees above a root
 * would produce a semitone cluster rather than a chord. Such material gets an open
 * root–fifth–octave instead: neutral, and it cannot clash with atonal writing.
 */
const CHROMATIC_STACK = [0, 7, 12];

/**
 * Builds the note list for one chord step.
 *
 * `rootMidi` is the step's own pitch (the caller supplies the `60` default when the
 * data has none). Returns a list whose first element is always `rootMidi`, so the
 * original bass note is preserved exactly as authored. Returns `[rootMidi]` unchanged
 * for a non-positive root, so callers can pass values through without special-casing.
 */
export function chordVoicingForStep(
  rootMidi: number,
  scale: string | undefined,
  options: ChordVoicingOptions = {}
): number[] {
  if (!Number.isFinite(rootMidi) || rootMidi <= 0) return [rootMidi];

  const style = resolveVoicingStyle(options);
  const definition = VOICING_STYLES[style];
  const span = options.span ?? definition.span;
  const { root: keyRoot, scaleId } = parseScaleString(scale);

  // Interval-based styles do not care about the key at all — a power chord is a perfect
  // fifth above whatever root is authored, in any scale.
  if (definition.mode === "interval") {
    return definition.steps.map((semi) => rootMidi + semi);
  }

  // Chromatic material cannot be harmonised by stacking scale degrees — every semitone
  // is "in scale", so a stack would be a cluster. `parseScaleString` does not know the
  // word "Atonal" (it falls back to minor), so the raw string is checked too; one genre
  // in the library uses it.
  if (scaleId === "chromatic" || /atonal|chrom/i.test(scale ?? "")) {
    if (style === "quartal") {
      return [0, 5, 10].map((semi) => rootMidi + semi);
    }
    // Atonal material still honours the style's *width*: a seventh/extended request gets
    // an added octave rather than silently collapsing to a triad.
    const stack = definition.steps.length > 3 ? [0, 7, 12, 19] : CHROMATIC_STACK;
    return stack.map((semi) => rootMidi + semi);
  }

  const degrees = (SCALES[scaleId] ?? SCALES.minor).intervals;
  if (degrees.length === 0) return [rootMidi];

  const keyRootPc = NOTE_NAMES.indexOf(keyRoot as (typeof NOTE_NAMES)[number]);
  const rootPc = ((rootMidi % 12) + 12) % 12;
  const relInterval = (((rootPc - keyRootPc) % 12) + 12) % 12;

  // Which scale degree is this chord root? This is what makes the harmony follow the
  // key: in C minor the b3 degree (Eb) must produce an Eb MAJOR triad, not another
  // minor one. A stack that ignores this always returns the tonic chord.
  let degreeIndex = degrees.indexOf(relInterval);
  if (degreeIndex === -1) {
    // Authored data can sit outside its declared key. Snap to the nearest degree so the
    // chord still belongs to the key rather than silently becoming the tonic.
    degreeIndex = 0;
    let best = Infinity;
    for (let i = 0; i < degrees.length; i++) {
      const distance = Math.abs(degrees[i] - relInterval);
      if (distance < best) {
        best = distance;
        degreeIndex = i;
      }
    }
  }

  return definition.steps.map((step) => {
    const idx = degreeIndex + step;
    const octave = Math.floor(idx / degrees.length);
    const semitone = degrees[idx % degrees.length] + octave * 12;
    // Measure from the degree we resolved (not from `relInterval`): when the authored
    // root sits outside its declared key the two differ, and measuring from
    // `relInterval` produced a negative offset — a note *below* the authored bass note.
    let offset = semitone - degrees[degreeIndex];
    // Fold a too-wide upper voice down an octave, but never below/onto the root.
    while (offset > span && offset - 12 > 0) offset -= 12;
    return rootMidi + offset;
  });
}

/**
 * Per-voice amplitude scale so a 3- or 4-note voicing is not simply louder than the
 * single note it replaces.
 *
 * Voices are uncorrelated, so their power sums: scaling each by `1/sqrt(n)` holds the
 * chord's RMS at roughly the single-note level while staying inside the same headroom.
 * Without this, adding harmony would read as a level jump and push the master limiter
 * harder on every genre at once — the opposite of the intended improvement.
 */
export function chordVoiceGain(voiceCount: number): number {
  if (!Number.isFinite(voiceCount) || voiceCount <= 0) return 1;
  return 1 / Math.sqrt(voiceCount);
}

/**
 * Stagger between the notes of one voicing, in seconds.
 *
 * This is an onset-realism choice, not a level fix. Every oscillator starts at phase 0,
 * so a triad's three notes otherwise begin as one flat "clack"; a few milliseconds of
 * roll is how a keyboardist or guitarist actually plays a chord.
 *
 * **It was tried as a level fix and does not work as one.** The hope was that
 * decorrelating the attacks would stop the triad's peaks summing into the master
 * limiter, but a full 159-genre re-measure showed the library only moved from −16.95 to
 * −17.09 LUFS target — i.e. 0.14 dB *worse*, within run-to-run noise. A constant time
 * offset is a constant phase offset, so sustained tones stay mutually coherent; it
 * shifts the sum rather than decorrelating it. (It does not comb-filter either: the
 * chord tones are at different frequencies, so nothing is a delayed copy of itself.)
 *
 * The real cause of the level shift is that a three-note chord has a higher peak, which
 * engages the master limiter harder and pumps the *whole* mix down — the behaviour
 * behind N-15. It is handled the sanctioned way, by re-measuring and re-fitting the
 * per-genre trims, and it is further evidence for E-12 (a true-peak lookahead limiter).
 */
export const CHORD_STRUM_SEC = 0.003;

/**
 * How a chord is *played*, as opposed to which notes it contains.
 *
 * Voicing alone is only half of "genre-appropriate chords". A techno stab, a jazz
 * comp, a palm-muted metal power chord and an ambient pad can share the same three pitch
 * classes and still be unmistakably different music — what separates them is **how long
 * the chord rings** and **whether the notes start together or roll**.
 *
 * The old engine gave every genre the same answer: all notes `stepDur · gate · 1.5` long
 * with a flat 3 ms onset stagger. So reggae's skank rang like a pad, funk's stabs
 * smeared, and metal's palm-mutes sustained.
 */
export type ChordArticulation = "block" | "strum" | "roll" | "stab" | "sustain" | "comp";

export interface ArticulationDefinition {
  /** Multiplier on the base note length (see `CHORD_BASE_GATE`). */
  gateScale: number;
  /** Onset spread across the voicing, in seconds. 0 = all notes together. */
  strumSeconds: number;
  /** Why this articulation sounds the way it does — kept beside the data. */
  note: string;
}

/**
 * The articulation table.
 *
 * `gateScale` multiplies the historical base length (`CHORD_BASE_GATE`), so 1.0 is the
 * behaviour every genre used to get, and the numbers below read directly as "longer or
 * shorter than before".
 */
export const CHORD_ARTICULATIONS: Record<ChordArticulation, ArticulationDefinition> = {
  block: {
    gateScale: 1.0,
    strumSeconds: 0.003,
    note: "The historical default: all notes together, held for the step gate. Works for keys/pad comping where the chord is a bed rather than a rhythm.",
  },
  strum: {
    gateScale: 0.8,
    strumSeconds: 0.022,
    note: "Guitar strum — ~22 ms between the lowest and highest note, which is roughly how long a real downward strum takes. Clearly rolled, still heard as one chord.",
  },
  roll: {
    gateScale: 1.3,
    strumSeconds: 0.09,
    note: "Rolled/arpeggiated: ~90 ms across the voicing, the piano-roll or harp gesture. Long enough to read as a ripple rather than a chord.",
  },
  stab: {
    gateScale: 0.3,
    strumSeconds: 0.001,
    note: "Short, tight and together: house/techno organ stabs, funk 'chicken scratch', reggae skank, palm-muted power chords, montuno. Rhythm, not harmony — the silence between stabs is the point.",
  },
  sustain: {
    gateScale: 3.0,
    strumSeconds: 0.012,
    note: "Three times the base length: pads, strings, ambient and shoegaze walls, tremolo-picked black metal. The chord is a continuous texture, so the note length must outlast the step grid.",
  },
  comp: {
    gateScale: 0.55,
    strumSeconds: 0.008,
    note: "Jazz comping: short, slightly spread, leaving space between the hits. Held chords would fight the soloist and destroy the swing.",
  },
};

/** Base note length as a multiple of `stepDur * gate`, before `gateScale`. */
export const CHORD_BASE_GATE = 1.5;

/** Articulation for material nothing else describes. */
export const DEFAULT_CHORD_ARTICULATION: ChordArticulation = "block";

/** The resolved treatment a caller actually needs: which notes, and how to play them. */
export interface ChordTreatment {
  style: VoicingStyle;
  articulation: ChordArticulation;
  /** Note length as a multiple of `stepDur * gate`. */
  gateScale: number;
  /** Onset spread across the voicing, in seconds. */
  strumSeconds: number;
}

/** Note length in seconds for one chord step under a given treatment. */
export function chordNoteDuration(
  stepDur: number,
  gateVal: number,
  treatment: Pick<ChordTreatment, "gateScale">
): number {
  return stepDur * gateVal * CHORD_BASE_GATE * treatment.gateScale;
}

/** Onset time for voice `index` of a voicing under a given treatment. */
export function chordVoiceOnset(
  time: number,
  index: number,
  treatment: Pick<ChordTreatment, "strumSeconds">
): number {
  return time + index * treatment.strumSeconds;
}


/**
 * The notes a chord step actually sounds.
 *
 * A step whose track carries a stored stack (`pitches`, written into the pattern by
 * `applyGenreExpression`) sounds **exactly those notes**; a step without one falls back to the
 * automatic voicing of its root. Both the live engine and the offline exporter call this, so the
 * two cannot disagree about the harmony — and once a genre's chords are stored, the piano roll
 * (which renders the same array) shows what is heard instead of a single placeholder note.
 */
export function chordNotesForStep(
  track: { pitch?: (number | null)[]; pitches?: (number[] | null)[] } | undefined,
  stepIdx: number,
  midi: number,
  scale: string | undefined,
  options: ChordVoicingOptions = {}
): number[] {
  const stored = track?.pitches?.[stepIdx];
  if (Array.isArray(stored) && stored.length > 0) {
    // Defensive copy, sorted low→high: callers must not be able to mutate the pattern, and the
    // onset/strum order of a voicing is defined from the bottom up.
    const notes = [...stored].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
    // A stack of nothing but garbage (a corrupt import, a half-written pattern) must not silence
    // the step: falling back to the root's voicing keeps it audible and obviously wrong, which is
    // far easier to notice and fix than a hole in the arrangement.
    if (notes.length > 0) return notes;
  }
  const effectiveMidi = Number.isFinite(midi) && midi > 0 ? midi : 60;
  return chordVoicingForStep(effectiveMidi, scale, options);
}

/**
 * A note must last long enough for its own attack to arrive.
 *
 * Found by building the queue of lanes whose **preset attack** is longer than the note the lane plays: **55 of 318**
 * routed lanes were over half, the worst being `warm_pad` chords in the fast genres — a 0.152 s attack against a
 * 0.028 s note in `breakcore`, i.e. the pad never arrives at all, five times over. Rendering those lanes natively
 * confirmed it: their stems sat 20 dB and more below their siblings (`stringsLead` was the single case that surfaced
 * first, at −60 dBFS).
 *
 * The rule is musical rather than numerical: a synth retriggered faster than its own attack produces a wash of
 * half-formed notes. A note is allowed to sound longer than the step asked for, and never shorter than its attack needs
 * — `ATTACK_ARRIVAL_MULTIPLE` times the attack, which is where a linear-ish envelope is audibly "there".
 */
export const ATTACK_ARRIVAL_MULTIPLE = 2.5;

export function soundingDuration(requested: number, attackSeconds: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return requested;
  if (!Number.isFinite(attackSeconds) || attackSeconds <= 0) return requested;
  return Math.max(requested, attackSeconds * ATTACK_ARRIVAL_MULTIPLE);
}
