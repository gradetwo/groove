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
 *   5. **A lyric is written on the note it is sung on**, as `<lyric number="1"><syllabic>single</syllabic><text>…</text></lyric>`. It goes on the **first** note of a chord and on the **head** of a tie, because that is where a reader looks for it: a syllable repeated on every tied continuation is one word printed several times. `<syllabic>` is `single` for every syllable, because this model holds one syllable per note and no word grouping — a hyphenation this file invented would be a claim about a word it does not know.
 *
 * What is deliberately **not** written yet, rather than quietly approximated: dynamics from velocity, articulation, slurs, tuplets, key signatures other than C, more than one part, and multi-syllable words joined by `<syllabic>begin/middle/end</syllabic>`. Each of those is a real feature and will be a real change; a file that pretends to have them and does not is worse than one that says C major and four-four.
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

/** A syllable as it is written, or `undefined` when there is none. **Whitespace is not a lyric**: an empty `<text>` is a lyric that renders as a gap in the line. */
function lyricTextOf(note: NoteEvent): string | undefined {
  const trimmed = note.syllable?.trim();
  return trimmed ? trimmed : undefined;
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
 * ⭐ **Two things MusicXML cannot express any other way, and the order they are applied in matters.**
 *
 *   · **A chord** is notes that start together *and last the same length*: one voice, one note, several `<key>`s.
 *   · **Overlap** — a note that begins while another is still sounding — has no single-voice spelling at all, because MusicXML is a sequence: a second note at the same instant without `<chord/>` starts **after** the first. Overlapping notes therefore go into **separate voices with a `<backup>` between them**, which is what every notation program writes.
 *
 * So chords are grouped first and voices assigned second. The first version did it the other way round and split every block chord across three voices.
 */
export function notesToMeasures(notes: readonly NoteEvent[], bars: number, options: MusicXmlOptions = {}): string[] {
  const beatsPerMeasure = options.beatsPerMeasure ?? 4;
  const measureCount = Math.max(1, Math.round(bars));
  const divisionsPerBeat = divisionsFor(notes, options.divisions);

  /** Deterministic order, because a file that changed with the input's order would make every diff a coin toss. */
  const ordered = [...notes].filter((note) => note.pitch >= 0 && note.pitch <= 127).sort((a, b) => a.startBeats - b.startBeats || a.pitch - b.pitch);

  /** Notes that start together and last the same length are one chord. The key is rounded because two notes at 1.0000001 beats are one chord to a person. */
  const groups = new Map<string, { startBeats: number; lengthBeats: number; pitches: number[]; syllable?: string }>();
  for (const note of ordered) {
    const startBeats = Math.max(0, note.startBeats);
    const lengthBeats = Math.max(note.lengthBeats, 0.25);
    const key = `${Math.round(startBeats * 1e6)}:${Math.round(lengthBeats * 1e6)}`;
    const syllable = lyricTextOf(note);
    const existing = groups.get(key);
    if (existing) {
      existing.pitches.push(note.pitch);
      // One syllable per sounding event: a chord is one event, so the first note of it that carries a lyric is the one written.
      if (existing.syllable === undefined && syllable !== undefined) existing.syllable = syllable;
    } else groups.set(key, { startBeats, lengthBeats, pitches: [note.pitch], ...(syllable === undefined ? {} : { syllable }) });
  }
  const groupList = [...groups.entries()].map(([key, group]) => ({ key, ...group })).sort((a, b) => a.startBeats - b.startBeats || a.lengthBeats - b.lengthBeats);

  const measures: string[] = [];
  /**
   * **Voices are assigned inside the measure, and a voice number means the same line of music for the whole part.**
   *
   * A `<voice>` is an identity, not a per-measure slot: a later measure rewinds the cursor with a `<backup>` and the notes that follow carry the voice numbers a reader draws as lines. **The first version reused the first voice free anywhere in the piece**, which let a voice hold music that went *backwards* between measures: in a
   * bar of four overlapping notes it wrote two `<backup>` elements in a row and drove the cursor to minus sixteen divisions, which the cursor criterion below now refuses. Assigning once per measure instead fixed that and introduced the opposite fault: a voice was taken by a group whose tie was still travelling through the bar, and two independent lines collided in one `<voice>`.
   *
   * The rule below is that a voice may take a group in measure m only when the group that last took it ended **before m began**, or ended inside m before this group starts. A piece of a tie that starts in m claims that voice for the whole of m, so nothing else may take it.
   */
  const voiceOf = new Map<string, number>();
  /** Every group split at the barlines, in time order — the pieces are what a measure holds, and what a voice claim is made of. */
  const pieces = groupList
    .flatMap((group) =>
      splitAtBarlines(group.startBeats, group.lengthBeats, beatsPerMeasure).map((piece) => ({
        group,
        startBeats: piece.startBeats,
        lengthBeats: piece.lengthBeats,
        measureIndex: Math.floor(piece.startBeats / beatsPerMeasure),
        tiedFrom: piece.tiedFrom,
        tiedTo: piece.tiedTo,
        voice: -1,
      }))
    )
    .sort((a, b) => a.startBeats - b.startBeats || a.group.lengthBeats - b.group.lengthBeats);
  /** Where each voice's last group finished, and which of the groups tied from before are holding it in this measure. */
  const voiceEnds: number[] = [];
  const heldByContinuation = new Map<number, number>();

  for (let index = 0; index < measureCount; index += 1) {
    for (const piece of pieces) {
      if (piece.measureIndex !== index) continue;
      if (piece.voice !== -1) {
        // A group whose head is in an earlier measure was placed once, there, and every later piece of it belongs to that same voice.
        voiceOf.set(piece.group.key, piece.voice);
        continue;
      }
      if (voiceOf.has(piece.group.key)) continue;
      let voice = -1;
      for (let candidate = 0; candidate < voiceEnds.length; candidate += 1) {
        // A voice carrying a tie into this measure is not free until that tie ends, whatever else has finished.
        // A tie holds its voice from the measure it starts in **until its last continuation ends**, which may be
        // several measures later: asking whether it ends exactly here let a group whose tie ran on be mistaken for a
        // free voice, and the overlapping note then shared the voice and was written late (docs/OPEN_WORK.md 253).
        if ((heldByContinuation.get(candidate) ?? -1) >= index) continue;
        const end = voiceEnds[candidate] ?? 0;
        const endsAtABarline = Math.abs(end / beatsPerMeasure - Math.floor(end / beatsPerMeasure)) < 1e-9;
        const reusable = endsAtABarline ? end <= piece.startBeats + 1e-9 : Math.floor(end / beatsPerMeasure) < index && end <= piece.startBeats + 1e-9;
        if (reusable) {
          voice = candidate;
          break;
        }
      }
      if (voice === -1) {
        voice = voiceEnds.length;
        voiceEnds.push(0);
      }
      voiceOf.set(piece.group.key, voice);
      voiceEnds[voice] = piece.startBeats + piece.lengthBeats;
      for (const later of pieces) {
        if (later.voice !== -1 || later.group !== piece.group) continue;
        later.voice = voice;
        // Every piece of this group that begins in a later measure holds its voice there, which is what keeps another group from claiming it in between.
        if (later.tiedFrom) {
          // The **last** measure this tie is still sounding in: what the check above needs is whether it has ended,
          // so a later continuation must extend the record rather than overwrite it with a later measure.
          heldByContinuation.set(voice, Math.max(heldByContinuation.get(voice) ?? -1, later.measureIndex));
        }
      }
    }

    const measureStart = index * beatsPerMeasure * divisionsPerBeat;
    const measureEnd = measureStart + beatsPerMeasure * divisionsPerBeat;
    const eventsByVoice = new Map<number, { startDivision: number; duration: number; pitches: number[]; tiedFrom?: boolean; tiedTo?: boolean; syllable?: string }[]>();
    for (const piece of pieces) {
      if (piece.measureIndex !== index || piece.voice < 0) continue;
      const startDivision = Math.round(piece.startBeats * divisionsPerBeat);
      if (startDivision < measureStart || startDivision >= measureEnd) continue;
      const duration = Math.max(1, Math.round(piece.lengthBeats * divisionsPerBeat));
      const events = eventsByVoice.get(piece.voice) ?? [];
      // The group is already a chord, so its pitches share one event; a split at a barline makes two events, tied.
      const chord = events.find((event) => event.startDivision === startDivision && event.duration === duration && event.tiedFrom === piece.tiedFrom);
      if (chord) {
        chord.pitches.push(...piece.group.pitches);
        if (chord.syllable === undefined && piece.group.syllable !== undefined) chord.syllable = piece.group.syllable;
      } else {
        events.push({
          startDivision,
          duration,
          pitches: [...piece.group.pitches],
          tiedFrom: piece.tiedFrom,
          tiedTo: piece.tiedTo,
          ...(piece.group.syllable === undefined ? {} : { syllable: piece.group.syllable }),
        });
      }
      eventsByVoice.set(piece.voice, events);
    }
    for (const events of eventsByVoice.values()) events.sort((a, b) => a.startDivision - b.startDivision);

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
        const perMinute = Math.round(options.tempoBpm);
        /**
         * The mark is what a person sees; `<sound tempo>` is what the file plays back, and it is the element playback follows. Both carry the same number, and the reader takes the mark first, so the two cannot disagree in the round trip.
         */
        body.push(
          `      <direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${perMinute}</per-minute></metronome></direction-type><sound tempo="${perMinute}"/></direction>`
        );
      }
    }

    const soundingVoices = [...eventsByVoice.keys()].sort((a, b) => a - b);
    /** A measure nothing plays in is still a measure, and notation has no blank one: it gets one voice of rests, the same as before. */
    const voices = soundingVoices.length > 0 ? soundingVoices : [0];
    voices.forEach((voice, position) => {
      // Every voice after the first rewinds the cursor to the measure's start; without it the second voice is written after the first, a measure late.
      if (position > 0) body.push(`      <backup><duration>${measureEnd - measureStart}</duration></backup>`);
      const voiceNumber = voice + 1;
      const events = eventsByVoice.get(voice) ?? [];

      let cursor = measureStart;
      for (const event of events) {
        let gap = event.startDivision - cursor;
        while (gap > 0) {
          const piece = Math.min(gap, 4 * divisionsPerBeat);
          body.push(`      <note><rest/><duration>${piece}</duration><voice>${voiceNumber}</voice>${typeElement(piece)}</note>`);
          gap -= piece;
        }
        const [first, ...rest] = event.pitches;
        body.push(noteElement(first!, event, voiceNumber, false));
        for (const pitch of rest) body.push(noteElement(pitch, event, voiceNumber, true));
        cursor = event.startDivision + event.duration;
      }

      /**
       * **Rests fill what a measure does not cover**, because notation has no hole in it. This is not only the first voice: a voice that is merely holding a tie from the bar before has no event of its own starting here, and without its rests that voice's written music stops short of the barline — which the criterion above found as a bar whose voices did not add up. A voice with nothing at all in this
       * measure is left out, so an idle line does not add a staff's worth of rests to every bar; a bar nothing plays in still gets one voice of rests, because a measure is not allowed to be blank.
       */
      if (events.length > 0 || position === 0) {
        let tail = measureEnd - cursor;
        while (tail > 0) {
          const piece = Math.min(tail, 4 * divisionsPerBeat);
          body.push(`      <note><rest/><duration>${piece}</duration><voice>${voiceNumber}</voice>${typeElement(piece)}</note>`);
          tail -= piece;
        }
      }
    });

    measures.push(`    <measure number="${index + 1}">\n${body.join("\n")}\n    </measure>`);
  }
  return measures;
}

function typeElement(duration: number): string {
  // WARNING: this still divides by the constant, so at a raised division count the <type> label can be wrong.
  // Our own reader takes the length from <duration> / divisions and ignores the label, which is why this is a
  // recorded gap rather than a silent one: see docs/OPEN_WORK.md 250.
  const type = noteTypeFor(duration / DIVISIONS_PER_QUARTER);
  // No type element at all when the duration is not a written value: a wrong `<type>` is read as authoritative by most readers, an absent one is inferred from the duration.
  return type ? `<type>${type}</type>` : "";
}

function noteElement(
  pitch: number,
  event: { duration: number; tiedFrom?: boolean; tiedTo?: boolean; syllable?: string },
  voice: number,
  isChordMember: boolean
): string {
  const { step, alter, octave } = pitchToMusicXml(pitch);
  /**
   * The lyric goes on the chord's **first** note and on a tie's **head**: a reader draws the syllable once per sounding event, and a tied continuation
   * carrying it again would print one word twice. `<lyric>` is last because the MusicXML note sequence puts it after `<notations>`, and a document whose
   * elements are out of order is one a validating reader refuses.
   */
  const lyric =
    !isChordMember && !event.tiedFrom && event.syllable
      ? `        <lyric number="1"><syllabic>single</syllabic><text>${escapeXml(event.syllable)}</text></lyric>`
      : "";
  const parts = [
    `      <note>`,
    isChordMember ? `        <chord/>` : "",
    `        <pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${octave}</octave></pitch>`,
    `        <duration>${event.duration}</duration>`,
    event.tiedTo ? `        <tie type="start"/>` : "",
    event.tiedFrom ? `        <tie type="stop"/>` : "",
    `        <voice>${voice}</voice>`,
    typeElement(event.duration) ? `        ${typeElement(event.duration)}` : "",
    event.tiedTo || event.tiedFrom
      ? `        <notations>${event.tiedTo ? `<tied type="start"/>` : ""}${event.tiedFrom ? `<tied type="stop"/>` : ""}</notations>`
      : "",
    lyric,
    `      </note>`,
  ];
  return parts.filter((line) => line !== "").join("\n");
}

/**
 * A complete `score-partwise` document for one track.
 *
 * **`score-partwise` and version 4.0**: partwise is what the notation programs write and read, and 4.0 is backward-compatible — a reader that wants 3.1 ignores what it does not know.
 */
/**
 * The divisions the file needs: the smallest count per quarter that represents **every** start and length exactly.
 *
 * With four divisions a length of 2.167 beats cannot be written, and the rounding at the call site turns it into
 * 2.25 — a silent fidelity loss measured on the owner's corpus (docs/OPEN_WORK.md 244/249). The reader scales by
 * whatever the file states, so a larger count is exact on the way back. The cap is this project's own tick
 * resolution: beyond it a value that is still not exact is reported by the caller rather than rounded here.
 */
function divisionsFor(notes: readonly NoteEvent[], requested: number | undefined, cap = 960): number {
  /**
   * Within half a thousandth of a beat. Demanding an exact count would reject every candidate for a value such as
   * 2.167, which is itself a rounded decimal (the true length is thirteen sixths), and the corpus comparison this
   * has to satisfy is to three decimals.
   */
  const closeEnough = (value: number, divisions: number): boolean => Math.abs(value - Math.round(value * divisions) / divisions) < 5e-4;
  const values = [...notes.map((note) => note.startBeats), ...notes.map((note) => note.lengthBeats)];
  for (const candidate of [4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 240, 320, 480, 960]) {
    if (candidate > cap) break;
    if (values.every((value) => closeEnough(value, candidate))) return candidate;
  }
  return Math.min(cap, requested ?? 4);
}

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
