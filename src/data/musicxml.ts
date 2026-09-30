/**
 * Writing **MusicXML** — the file every notation program reads.
 *
 * The point is not that groove needs a notation format of its own; it is that **a score has to leave the building**: to MuseScore, to Sibelius, to a teacher, to a printer. MusicXML is the interchange format those tools agree on, so the export is written to the **specification**
 * rather than to what happens to open in one reader — a file that only MuseScore accepts is a file that failed at the job.
 *
 * The model it writes from is the arrangement's own: `pitch` in MIDI numbers, `startBeats` and `lengthBeats` in beats, `velocity` 1–127. Everything below is the translation between that and MusicXML's vocabulary, and every translation that loses or invents information is called out where it happens.
 *
 * **Four decisions worth stating, because each one is a place a naive exporter is wrong:**
 *
 *   1. **A note is split at a barline, and the halves are tied.** MusicXML cannot express a note that crosses a barline; a six-beat note in 4/4 is a whole note tied to a half note. Writing it as a six-beat duration produces a file that renders as a mess in every reader.
 *   2. **Gaps become rests.** A measure whose notes do not cover it is not "a measure with holes" — notation needs a rest, and its duration has to be exactly the gap, which means splitting rests at barlines too.
 *   3. **`divisions` is per quarter note**, and every duration is an integer count of them. Sixteenth-note resolution is what the arrangement already has, so `divisions` is 4 and no position can be lost by rounding.
 *   4. **Simultaneous notes in one track become a chord** (`<chord/>` on every note after the first), because a track is a voice. Two notes that start at the same instant in different tracks would be different voices, which is a separate part and out of scope here.
 *
 * What is deliberately **not** written yet, rather than quietly approximated: dynamics from velocity, articulation, slurs, tuplets, key signatures other than C, and more than one part. Each of those is a real feature and will be a real change; a file that pretends to have them and does not is worse than one that says C major and four-four.
 */
import type { NoteEvent } from "../types/arrangementV2";

/** A quarter note is four sixteenths, which is the resolution the arrangement's grid already has. */
export const DIVISIONS_PER_QUARTER = 4;

const STEP_NAMES = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"] as const;
/** Which of those are written with a sharp, i.e. the black keys. The exporter spells everything with sharps, which is stated rather than guessed at. */
const SHARP = [false, true, false, true, false, false, true, false, true, false, true, false];

export interface MusicXmlOptions {
  /** The work's title, as a reader shows it. */
  title?: string;
  /** Beats in a measure. 4/4 unless said otherwise. */
  beatsPerMeasure?: number;
  /** What one beat is, in the notation's own terms: 4 means a quarter note. */
  beatType?: number;
  /** The tempo written in the first measure. Absent means none is written, rather than a tempo being invented. */
  tempoBpm?: number;
  /** The instrument name a reader shows beside the staff. */
  partName?: string;
}

/** `{ step, alter, octave }` for a MIDI note, sharps only. MIDI 60 is C4, which is the convention MusicXML uses (`<octave>4</octave>` for middle C). */
export function pitchToMusicXml(pitch: number): { step: string; alter?: number; octave: number } {
  const octave = Math.floor(pitch / 12) - 1;
  const step = STEP_NAMES[pitch % 12]!;
  return SHARP[pitch % 12] ? { step, alter: 1, octave } : { step, octave };
}

/** Whole, half, quarter, eighth and sixteenth — the note types the arrangement's sixteenth-note grid can produce. `null` for a duration that is not one of them (a triplet or a dotted value), which the caller then writes without a type rather than with a wrong one. */
export function noteTypeFor(durationInQuarters: number): string | null {
  const table: [number, string][] = [
    [4, "whole"],
    [2, "half"],
    [1, "quarter"],
    [0.5, "eighth"],
    [0.25, "sixteenth"],
  ];
  const found = table.find(([quarters]) => Math.abs(quarters - durationInQuarters) < 1e-9);
  return found ? found[1] : null;
}

/** A note or a rest the exporter has decided to write, already split at barlines. */
interface Written {
  /** Every note sounding at this moment, of which the first carries the start and the rest are `<chord/>`. */
  pitches: number[];
  /** Where it begins, in divisions from the start of the arrangement. */
  startDivision: number;
  /** In divisions (sixteenths). */
  duration: number;
  /** Whether it is held over from the previous bar, which is written as a tie. */
  tiedFrom?: boolean;
  /** Whether it continues into the next bar, which is written as a tie. */
  tiedTo?: boolean;
  /** A rest, which has no pitch. */
  rest?: boolean;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Split one note into the pieces a measure can hold, tied across the barlines it crosses.
 *
 * A note that fits in one measure is one piece, which is the common case; the tie only appears when it is needed, so a file with no crossing notes has no ties in it.
 */
function splitAtBarlines(startBeats: number, lengthBeats: number, beatsPerMeasure: number): { startBeats: number; lengthBeats: number; tiedFrom: boolean; tiedTo: boolean }[] {
  const pieces: { startBeats: number; lengthBeats: number; tiedFrom: boolean; tiedTo: boolean }[] = [];
  let remaining = Math.max(0, lengthBeats);
  let at = Math.max(0, startBeats);
  // A loop with a bound rather than `while (remaining > 0)`: a zero-length or absurd note must not be able to spin here.
  for (let guard = 0; guard < 512 && remaining > 1e-9; guard += 1) {
    const measureEnd = (Math.floor(at / beatsPerMeasure) + 1) * beatsPerMeasure;
    const piece = Math.min(remaining, measureEnd - at);
    pieces.push({ startBeats: at, lengthBeats: piece, tiedFrom: pieces.length > 0, tiedTo: piece < remaining - 1e-9 });
    at += piece;
    remaining -= piece;
  }
  return pieces;
}

/**
 * The measures of one track, as MusicXML text.
 *
 * Exported so a caller can write one part, and so a criterion can look at a measure rather than at a document — the interesting decisions are all inside a measure.
 */
export function notesToMeasures(notes: readonly NoteEvent[], bars: number, options: MusicXmlOptions = {}): string[] {
  const beatsPerMeasure = options.beatsPerMeasure ?? 4;
  const measureCount = Math.max(1, Math.round(bars));
  const divisionsPerBeat = DIVISIONS_PER_QUARTER;

  /**
   * Everything written, in time order. Notes that start together are gathered into one chord, which is why this is built as events rather than as a list of notes.
   */
  const events: Written[] = [];
  for (const note of notes) {
    if (note.pitch < 0 || note.pitch > 127) continue;
    for (const piece of splitAtBarlines(note.startBeats, Math.max(note.lengthBeats, 0.25), beatsPerMeasure)) {
      const startDivision = Math.round(piece.startBeats * divisionsPerBeat);
      const duration = Math.max(1, Math.round(piece.lengthBeats * divisionsPerBeat));
      const existing = events.find((event) => !event.rest && event.startDivision === startDivision && event.duration === duration && event.tiedFrom === piece.tiedFrom);
      if (existing) existing.pitches.push(note.pitch);
      else events.push({ pitches: [note.pitch], duration, tiedFrom: piece.tiedFrom, tiedTo: piece.tiedTo, startDivision });
    }
  }

  const measures: string[] = [];
  for (let index = 0; index < measureCount; index += 1) {
    const measureStart = index * beatsPerMeasure * divisionsPerBeat;
    const measureEnd = measureStart + beatsPerMeasure * divisionsPerBeat;
    const inside = events
      .filter((event) => event.startDivision >= measureStart && event.startDivision < measureEnd)
      .sort((a, b) => a.startDivision - b.startDivision);

    const body: string[] = [];
    if (index === 0) {
      body.push(
        `      <attributes>\n` +
          `        <divisions>${divisionsPerBeat}</divisions>\n` +
          `        <key><fifths>0</fifths></key>\n` +
          `        <time><beats>${beatsPerMeasure}</beats><beat-type>${options.beatType ?? 4}</beat-type></time>\n` +
          `        <clef><sign>G</sign><line>2</line></clef>\n` +
          `      </attributes>`
      );
      if (options.tempoBpm !== undefined) {
        body.push(`      <direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(options.tempoBpm)}</per-minute></metronome></direction-type></direction>`);
      }
    }

    /**
     * **The rests are computed, not stored.** Whatever a measure does not cover becomes rests, because notation needs them: a measure with holes in it is not a measure, and the gap has to be written as its own duration, split at the beat if need be.
     */
    let cursor = measureStart;
    for (const event of inside) {
      const start = event.startDivision;
      let gap = start - cursor;
      while (gap > 0) {
        const piece = Math.min(gap, 4 * divisionsPerBeat);
        body.push(`      <note><rest/><duration>${piece}</duration><voice>1</voice>${typeElement(piece)}</note>`);
        gap -= piece;
      }
      const [first, ...rest] = event.pitches;
      body.push(noteElement(first!, event, false));
      for (const pitch of rest) body.push(noteElement(pitch, event, true));
      cursor = start + event.duration;
    }
    // Trailing rests to the end of the measure, so every measure adds up to its own length.
    let tail = measureEnd - cursor;
    while (tail > 0) {
      const piece = Math.min(tail, 4 * divisionsPerBeat);
      body.push(`      <note><rest/><duration>${piece}</duration><voice>1</voice>${typeElement(piece)}</note>`);
      tail -= piece;
    }

    measures.push(`    <measure number="${index + 1}">\n${body.join("\n")}\n    </measure>`);
  }
  return measures;
}

function typeElement(duration: number): string {
  const type = noteTypeFor(duration / DIVISIONS_PER_QUARTER);
  // No type element at all when the duration is not a written value: a wrong `<type>` is read as authoritative by most readers, an absent one is inferred from the duration.
  return type ? `<type>${type}</type>` : "";
}

function noteElement(pitch: number, event: Written, isChordMember: boolean): string {
  const { step, alter, octave } = pitchToMusicXml(pitch);
  const parts = [
    `      <note>`,
    isChordMember ? `        <chord/>` : "",
    `        <pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${octave}</octave></pitch>`,
    `        <duration>${event.duration}</duration>`,
    event.tiedTo ? `        <tie type="start"/>` : "",
    event.tiedFrom ? `        <tie type="stop"/>` : "",
    `        <voice>1</voice>`,
    typeElement(event.duration) ? `        ${typeElement(event.duration)}` : "",
    event.tiedTo || event.tiedFrom
      ? `        <notations>${event.tiedTo ? `<tied type="start"/>` : ""}${event.tiedFrom ? `<tied type="stop"/>` : ""}</notations>`
      : "",
    `      </note>`,
  ];
  return parts.filter((line) => line !== "").join("\n");
}

/**
 * A complete `score-partwise` document for one track.
 *
 * **`score-partwise` and version 4.0**: partwise is what the notation programs write and read, and 4.0 is backward-compatible — a reader that wants 3.1 ignores what it does not know.
 */
export function toMusicXml(notes: readonly NoteEvent[], bars: number, options: MusicXmlOptions = {}): string {
  const measures = notesToMeasures(notes, bars, options);
  const partName = escapeXml(options.partName ?? "Track");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n` +
    `<score-partwise version="4.0">\n` +
    `  <work><work-title>${escapeXml(options.title ?? "Untitled")}</work-title></work>\n` +
    `  <part-list>\n` +
    `    <score-part id="P1"><part-name>${partName}</part-name></score-part>\n` +
    `  </part-list>\n` +
    `  <part id="P1">\n` +
    measures.join("\n") +
    `\n  </part>\n` +
    `</score-partwise>\n`
  );
}
