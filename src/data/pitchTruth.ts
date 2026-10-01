/**
 * ⭐ **One pitch truth, written down once.**
 *
 * The owner's instruction this module exists to serve, verbatim:
 *
 *   "不要试图『保证用户永不搞错』，而是让系统内部**只有一个音高真相**，**所有可能移调的地方都显式、可见、可撤销**。"
 *
 * A MIDI file stores a note number, 0–127, and no name at all — so a name is always a *display* choice and
 * never a fact about the music. Three conventions are in the wild for which name goes with which number:
 *
 *   - `C4` — scientific pitch notation, the most common, and **this project's default**: note 60 is C4.
 *   - `C3` — used by Yamaha and by a good deal of older software, and **by Ableton** for note 60.
 *   - `C5` — some older software.
 *
 * Every one of them is the *same* note number: switching the convention changes a label and must never change
 * a frequency, a render or an export. That is the whole point of keeping the number as the truth and the name
 * as a rendering of it, and it is what `src/test/pitchTruth.test.ts` pins in both directions.
 *
 * The audit that preceded this (`docs/PITCH_TRUTH.md`) found the project holding **both** conventions at once:
 * `musicxml`, `musicxmlImport`, `MidiInputManager` and `PolySynth` all say note 60 is C4, while
 * `AbletonExporter` labels 60 as C3 and 72 as C4. The exporter may be right to follow Ableton's own labels, but
 * a project with two unlabelled conventions cannot tell a reader which one it is looking at. This module is the
 * single place a convention is applied, so a caller can always be told which one produced the name it sees.
 */

/** Which name is given to which number. The number never changes; only the label does. */
export type NoteConvention = "C4" | "C3" | "C5";

/**
 * **The default, stated rather than assumed**: note 60 is C4 (scientific pitch notation).
 *
 * Changing this is a display decision. Nothing in this module's callers may let it reach a frequency, a
 * render, an export or a stored note number — pinned by the criterion that switching conventions leaves the
 * frequency and the sounding description byte-identical.
 */
export const DEFAULT_NOTE_CONVENTION: NoteConvention = "C4";

/** The labels, sharp-spelled. A flat is the same number; callers that want flats spell them themselves. */
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/**
 * The octave each convention gives to note 60, expressed as the offset added to `floor(note / 12)`.
 *
 * `C4` means 60 is C4 → `floor(60/12) - 1 = 4` ✓; `C3` means 60 is C3 → `- 2` ✓; `C5` means 60 is C5 → `- 0` ✓.
 * One offset, three conventions: adding a fourth later is one entry here and no arithmetic anywhere else.
 */
const OCTAVE_OFFSET: Record<NoteConvention, number> = { C4: -1, C3: -2, C5: 0 };

/** Whether a number could be a MIDI note at all. A caller passing 200 has a bug, not an octave problem. */
export function isMidiNote(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 127;
}

/**
 * Concert pitch for a note number, with an optional micro-tuning in cents.
 *
 * `f = 440 · 2^((n − 69) / 12)`, so **note 69 is exactly 440 Hz** and **note 60 is 261.6255653005986 Hz**. The
 * cents term is additive in the exponent — `440 · 2^((n − 69) / 12 + cents / 1200)` — which is the definition
 * the spec asks for rather than a re-tuning of it.
 */
export function noteFrequency(midi: number, cents = 0): number {
  return 440 * Math.pow(2, (midi - 69) / 12 + cents / 1200);
}

/**
 * The name a convention gives a note number, always paired with the number in the caller's hands.
 *
 * This deliberately returns **only the name**. Everything a caller renders should show the number too, because
 * the number is the truth: `describePitch` below is the shape to render, and it carries both.
 */
export function noteName(midi: number, convention: NoteConvention = DEFAULT_NOTE_CONVENTION): string {
  const name = SHARP_NAMES[((midi % 12) + 12) % 12]!;
  const octave = Math.floor(midi / 12) + OCTAVE_OFFSET[convention];
  return `${name}${octave}`;
}

/**
 * One transposition, with where it came from and how big it is.
 *
 * The audit found six sources and no unified report (`docs/PITCH_TRUTH.md` §1.5): track `transpose` and section
 * `transpose` in `src/types/song.ts`, `tuneCents` and `pitch_keycenter` in the SFZ parser, the GS-1 pitch
 * parameters under `gs1PatchOverrides`, and the chord register in `genreExpression`. They are not unified here
 * either — that is a later step — but **anything that transposes is expected to name itself in this shape**, so
 * a report can list them instead of summing them into a number nobody can trace.
 */
export interface PitchTransposition {
  /** Where it came from, in words a caller can act on: `"track transpose"`, `"SFZ tune"`, `"GS-1 OSC1_PITCH"`… */
  source: string;
  /** In semitones. Fractional values are allowed: an SFZ `tune` is cents and becomes 0.01 semitones each. */
  semitones: number;
  /** Whether the creator can undo it. The owner's bar is "显式、可见、**可撤销**", so this is not optional. */
  reversible: boolean;
  /** Optional detail for the report: which file, field or parameter id it came from. */
  detail?: string;
}

/** What one note is, in every form a caller might need to check it against something else. */
export interface PitchReport {
  /** The truth, unchanged by any convention. */
  midi: number;
  /** The name this convention gives it — always reported **with** the convention that produced it. */
  name: string;
  convention: NoteConvention;
  /** Concert pitch for the number, before any transposition below is applied. */
  frequencyHz: number;
  /** The number after every transposition, and the frequency that follows from it. */
  soundingMidi: number;
  soundingFrequencyHz: number;
  /** Summed semitones across `transpositions`, and whether there were any at all. */
  totalSemitones: number;
  transposed: boolean;
  /** Every source, listed rather than summed, so a reader can trace the total. */
  transpositions: PitchTransposition[];
  /**
   * The sound source's own account of the note, when a caller has one.
   *
   * `render_instrument_note` already returns exactly this shape in its `resolved` field — measured on the
   * violin as `{ samplePath: "Strings/Violin Section/susVib/VlnEns_susVib_B2_v2.wav", rootKey: 59,
   * ratio: 1.0594630943592953 }`, a ratio of exactly `2^(1/12)` — so this is the same truth reported in the
   * same breath as the name, which is what "让 MCP 调用者清楚音高" asks for.
   */
  source?: {
    samplePath: string;
    rootKey: number;
    ratio: number;
    /** What the sample's own root would sound at, before the ratio moves it to the note. */
    rootFrequencyHz: number;
    /** The ratio expressed in cents, so a caller can compare it against the number's own cents. */
    ratioCents: number;
  };
}

/** The input `describePitch` takes: a number and, optionally, everything known about how it will sound. */
export interface DescribePitchInput {
  midi: number;
  convention?: NoteConvention;
  /** Micro-tuning on the note itself, in cents. */
  cents?: number;
  transpositions?: readonly PitchTransposition[];
  source?: { samplePath: string; rootKey: number; ratio: number };
}

/** Cents between two frequencies. The one conversion this module needs, written once. */
export function centsBetween(fromHz: number, toHz: number): number {
  return 1200 * Math.log2(toHz / fromHz);
}

/**
 * Everything a caller needs to see one note clearly: number, name, the convention behind the name, the
 * frequency, the transpositions that move it, and — when the sound source is known — that too.
 *
 * The order of the report is the order the spec's inspector asks for, and the number leads because it is the
 * only field that never changes.
 */
export function describePitch(input: DescribePitchInput): PitchReport {
  const convention = input.convention ?? DEFAULT_NOTE_CONVENTION;
  const cents = input.cents ?? 0;
  const transpositions = [...(input.transpositions ?? [])];
  const totalSemitones = transpositions.reduce((sum, item) => sum + item.semitones, 0);
  const soundingMidi = input.midi + totalSemitones;

  const report: PitchReport = {
    midi: input.midi,
    name: noteName(input.midi, convention),
    convention,
    frequencyHz: noteFrequency(input.midi, cents),
    soundingMidi,
    soundingFrequencyHz: noteFrequency(soundingMidi, cents),
    totalSemitones,
    transposed: totalSemitones !== 0,
    transpositions,
  };

  if (input.source) {
    const { samplePath, rootKey, ratio } = input.source;
    report.source = {
      samplePath,
      rootKey,
      ratio,
      rootFrequencyHz: noteFrequency(rootKey, cents),
      ratioCents: 1200 * Math.log2(ratio),
    };
  }

  return report;
}
