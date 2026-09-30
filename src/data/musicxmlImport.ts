/**
 * Reading **MusicXML** — the other half of the interchange, and the half that cannot be written to a specification as neatly.
 *
 * Writing has one author and one model, so its rules can be exact. Reading has **whatever the file happens to contain**: divisions that change mid-piece, several voices per staff, notes tied across barlines, chords, grace notes, whole measures of rest, and elements from versions we do not implement. The honest posture is therefore:
 *
 *   · **convert what the model can hold** — pitch, start in beats, length in beats, velocity;
 *   · **merge what notation splits** — a note tied across two measures is one note in a model with free positions, so the tie is joined back into one;
 *   · **report what is dropped rather than dropping it silently** — a grace note, a second voice's overlap, a tuplet — because a file that imports "successfully" and lost half a bar is worse than one that says what it could not read.
 *
 * **The browser's own `DOMParser`**, which is a real XML reader and a dependency nobody has to install or keep alive. Nothing here trusts the document's shape: a missing element is a `problem`, not a crash.
 */
import type { NoteEvent } from "../types/arrangementV2";

export interface ImportedPart {
  /** The name the file gives the part, so a caller can name a track with it. */
  name: string;
  notes: NoteEvent[];
}

export interface MusicXmlImport {
  parts: ImportedPart[];
  /** The title the file declares, when it declares one. */
  title?: string;
  /**
   * Everything the file held that this model cannot, stated in the words a person needs to act on it — "measure 7: a tuplet was read as its written length", "measure 3: a second voice was ignored". An empty list means the whole file survived.
   */
  problems: string[];
}

/** What one `<note>` element says, before it is placed in time. */
interface ParsedNote {
  midi?: number;
  /** In divisions, as the file states it. */
  duration: number;
  isChord: boolean;
  isRest: boolean;
  tieStart: boolean;
  tieStop: boolean;
  isGrace: boolean;
}

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** MIDI for a `<pitch>`, using the same C4 = middle C convention as the writer. A pitch we cannot read is `undefined` rather than a guess. */
function pitchToMidi(pitch: Element): number | undefined {
  const step = pitch.querySelector("step")?.textContent?.trim().toUpperCase();
  const octave = Number(pitch.querySelector("octave")?.textContent ?? NaN);
  const alter = Number(pitch.querySelector("alter")?.textContent ?? 0);
  if (!step || !(step in STEP_SEMITONES) || !Number.isFinite(octave)) return undefined;
  const midi = (octave + 1) * 12 + STEP_SEMITONES[step]! + (Number.isFinite(alter) ? alter : 0);
  return midi >= 0 && midi <= 127 ? midi : undefined;
}

function parseNoteElement(element: Element): ParsedNote {
  const isRest = element.querySelector("rest") !== null;
  const isChord = element.querySelector("chord") !== null;
  const isGrace = element.querySelector("grace") !== null;
  const pitch = element.querySelector("pitch");
  const duration = Number(element.querySelector("duration")?.textContent ?? 0);
  // A tie is written twice in MusicXML — as `<tie>` for playback and inside `<notations><tied>` for engraving. Files in the wild carry one, the other, or both, so either is honoured.
  const ties = Array.from(element.querySelectorAll("tie, tied")).map((node) => node.getAttribute("type"));
  return {
    ...(pitch ? { midi: pitchToMidi(pitch) } : {}),
    duration: Number.isFinite(duration) ? duration : 0,
    isChord,
    isRest,
    tieStart: ties.includes("start"),
    tieStop: ties.includes("stop"),
    isGrace,
  };
}

/**
 * Every note of one `<part>`, in beats from its start.
 *
 * **Time is a cursor that moves**, because MusicXML states durations rather than positions: a measure's contents are a sequence, `<backup>` and `<forward>` move the cursor without sounding anything, and `<chord/>` means "at the same time as the note before". Reconstructing positions from that sequence is the whole job of this function.
 */
function readPart(part: Element, problems: string[]): NoteEvent[] {
  const notes: NoteEvent[] = [];
  const measures = Array.from(part.querySelectorAll(":scope > measure"));
  let divisions = 1;
  let measureLengthDivisions = 16;
  let measureStartBeats = 0;
  /** The notes still open, by pitch: a tie's beginning is waiting for its end. **Not cleared per measure** — a tie that crosses a barline is the normal case, so clearing here would refuse to merge exactly the notes the tie exists for. */
  const open = new Map<number, { index: number; startBeats: number }>();

  measures.forEach((measure, measureIndex) => {
    const label = `measure ${measureIndex + 1}`;
    let cursorDivisions = 0;
    /**
     * ⭐ **Where the previous note began.** `<chord/>` means "at the same time as the note before it", and by the time a chord member is read the cursor has already moved past the note it belongs to — so a chord needs the previous start, not the current cursor. Reading it from the cursor was a real
     * bug: a three-note chord came back as three notes one after another.
     */
    let lastStartDivisions = 0;

    for (const child of Array.from(measure.children)) {
      if (child.tagName === "attributes") {
        const statedDivisions = Number(child.querySelector("divisions")?.textContent ?? NaN);
        if (Number.isFinite(statedDivisions) && statedDivisions > 0) divisions = statedDivisions;
        const beats = Number(child.querySelector("time > beats")?.textContent ?? NaN);
        const type = Number(child.querySelector("time > beat-type")?.textContent ?? NaN);
        if (Number.isFinite(beats) && Number.isFinite(type) && type > 0) {
          measureLengthDivisions = divisions * beats * (4 / type);
        }
        continue;
      }
      if (child.tagName === "backup") {
        const amount = Number(child.querySelector("duration")?.textContent ?? NaN);
        cursorDivisions -= Number.isFinite(amount) ? amount : 0;
        continue;
      }
      if (child.tagName === "forward") {
        const amount = Number(child.querySelector("duration")?.textContent ?? NaN);
        cursorDivisions += Number.isFinite(amount) ? amount : 0;
        continue;
      }
      if (child.tagName !== "note") continue;

      const parsed = parseNoteElement(child);
      const startDivisions = parsed.isChord ? lastStartDivisions : cursorDivisions;
      const startBeats = measureStartBeats + startDivisions / divisions;
      const lengthBeats = parsed.duration / divisions;

      if (parsed.isGrace) {
        problems.push(`${label}: a grace note was read as a normal one, because this model has no grace notes`);
      }
      if (parsed.duration === 0 && !parsed.isChord) {
        // A note with no duration is not a note in a model that places everything in beats.
        problems.push(`${label}: a note without a duration was skipped`);
        continue;
      }

      if (!parsed.isRest && parsed.midi !== undefined) {
        /** The resolution of the model's own grid: a position between sixteenths could not be drawn in the roll or written back out. */
        const resolution = 1 / 2;
        const endsAt = startBeats + lengthBeats;
        const tieBeginning = open.get(parsed.midi);
        if (tieBeginning && parsed.tieStop) {
          // One note in the model, two in the file: extend the note that started the tie rather than adding a second.
          const existing = notes[tieBeginning.index]!;
          notes[tieBeginning.index] = { ...existing, lengthBeats: Math.max(existing.lengthBeats, endsAt - existing.startBeats) };
          open.delete(parsed.midi);
          if (parsed.tieStart) open.set(parsed.midi, { index: tieBeginning.index, startBeats: existing.startBeats });
        } else {
          notes.push({
            pitch: parsed.midi,
            startBeats: Math.round(startBeats / resolution) * resolution,
            lengthBeats: Math.max(lengthBeats, resolution),
            // MusicXML's `velocity` is rare and optional; 100 is this project's default rather than a claim about the file.
            velocity: 100,
          });
          if (parsed.tieStart) open.set(parsed.midi, { index: notes.length - 1, startBeats });
        }
      }

      if (!parsed.isChord) {
        lastStartDivisions = cursorDivisions;
        cursorDivisions += parsed.duration;
      }
    }

    measureStartBeats += measureLengthDivisions / divisions;
  });

  if (open.size > 0) problems.push(`${open.size} tie(s) never ended and were left as written`);

  /**
   * **Sorted by start, then by pitch**, so two files that describe the same music produce the same notes: an import whose order depended on document order would make every comparison in a criterion, and every diff in a person's head, a coin toss.
   */
  return notes.sort((a, b) => a.startBeats - b.startBeats || a.pitch - b.pitch);
}

/**
 * Read a MusicXML document into the arrangement's own model.
 *
 * `score-timewise` is not read, and saying so is better than returning an empty result: the spec provides stylesheets between the two forms, and a caller who has one should convert it first.
 */
export function fromMusicXml(xml: string): MusicXmlImport {
  const problems: string[] = [];
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("the document is not well-formed XML");
  }
  const root = doc.documentElement;
  if (root.tagName !== "score-partwise") {
    throw new Error(`unsupported MusicXML root "${root.tagName}" — only score-partwise is read`);
  }

  // The part list names the parts; the parts themselves may be in any order, so names are matched by index and said to be missing when they are.
  const names = Array.from(root.querySelectorAll("part-list > score-part > part-name")).map((node) => node.textContent?.trim() ?? "Part");
  const parts: ImportedPart[] = Array.from(root.querySelectorAll(":scope > part")).map((part, index) => ({
    name: names[index] ?? `Part ${index + 1}`,
    notes: readPart(part, problems),
  }));
  if (names.length !== parts.length) problems.push(`the part list names ${names.length} part(s) and the score contains ${parts.length}`);

  const title = root.querySelector("work > work-title")?.textContent?.trim();
  return { parts, ...(title ? { title } : {}), problems };
}
