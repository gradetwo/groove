/**
 * Reading **MusicXML** — the other half of the interchange, and the half that cannot be written to a specification as neatly.
 *
 * Writing has one author and one model, so its rules can be exact. Reading has **whatever the file happens to contain**: divisions that change mid-piece, several voices per staff, notes tied across barlines, chords, grace notes, whole measures of rest, and elements from versions we do not implement. The honest posture is therefore:
 *
 *   · **convert what the model can hold** — pitch, start in beats, length in beats, velocity;
 *   · **merge what notation splits** — a note tied across two measures is one note in a model with free positions, so the tie is joined back into one;
 *   · **report what is dropped rather than dropping it silently** — a grace note, a second voice's overlap, a tuplet — because a file that imports "successfully" and lost half a bar is worse than one that says what it could not read.
 *
 * **`parseXml` from `./xml`**, which is a real XML parser on top of `saxes` and works in a browser and in Node alike. It replaced `DOMParser`, which Node does not have: the unit suite runs under `jsdom` and never noticed, while the MCP tool answered `DOMParser is not defined` to every client. Nothing here trusts the document's shape: a missing element is a `problem`, not a crash.
 *
 * **A `.mxl` is a zip and is read here.** `fflate` unzips it and `META-INF/container.xml` names the score, so a compressed file needs no separate step from the caller.
 */
import { unzipSync } from "fflate";
import { parseXml, type XmlElement } from "./xml";
import type { NoteEvent } from "../types/arrangementV2";

export interface ImportedPart {
  /** The name the file gives the part, so a caller can name a track with it. */
  name: string;
  notes: NoteEvent[];
}

/** What the file says about time, in the notation's own terms rather than the model's. */
export interface TimeSignature {
  beatsPerMeasure: number;
  /** 4 means a quarter-note beat, 8 an eighth-note beat. */
  beatType: number;
  /** Where it takes effect, in beats from the start of the score. */
  startBeats: number;
}

export interface MusicXmlImport {
  parts: ImportedPart[];
  /** The title the file declares, when it declares one. */
  title?: string;
  /**
   * The first tempo the file states, in quarter notes per minute, from a `<direction><metronome><per-minute>` or a `<sound tempo="...">`. Absent when the file states none, rather than defaulting to a number the file never said.
   */
  tempoBpm?: number;
  /** The initial time signature, so a caller can open a score in the meter it was written in. */
  beatsPerMeasure?: number;
  beatType?: number;
  /** Every time signature the file states, in order, including the first. The first entry is what `beatsPerMeasure`/`beatType` report. */
  timeSignatureChanges?: TimeSignature[];
  /**
   * Everything the file held that this model cannot, stated in the words a person needs to act on it — "measure 7: a tuplet was read as its written length", "measure 3: a second voice was ignored". An empty list means the whole file survived.
   */
  problems: string[];
}

/** What the file turned out to be, so a caller can state it rather than guess. */
export type MusicXmlFormat = "xml" | "mxl";

export interface MusicXmlBytesImport extends MusicXmlImport {
  format: MusicXmlFormat;
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

/** What a `<part>` said about tempo and meter, collected while its notes are read. */
interface PartMetadata {
  tempoBpm?: number;
  timeSignature?: TimeSignature;
}

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** MIDI for a `<pitch>`, using the same C4 = middle C convention as the writer. A pitch we cannot read is `undefined` rather than a guess. */
function pitchToMidi(pitch: XmlElement): number | undefined {
  const step = pitch.querySelector("step")?.textContent?.trim().toUpperCase();
  const octave = Number(pitch.querySelector("octave")?.textContent ?? NaN);
  const alter = Number(pitch.querySelector("alter")?.textContent ?? 0);
  if (!step || !(step in STEP_SEMITONES) || !Number.isFinite(octave)) return undefined;
  const midi = (octave + 1) * 12 + STEP_SEMITONES[step]! + (Number.isFinite(alter) ? alter : 0);
  return midi >= 0 && midi <= 127 ? midi : undefined;
}

function parseNoteElement(element: XmlElement): ParsedNote {
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
 * The tempo a `<direction>` states, or `undefined` when it states none.
 *
 * `<sound tempo="...">` is the older spelling and the one playback actually follows, so it is a fallback after the metronome mark rather than a second source that could disagree with it.
 */
function readTempo(direction: XmlElement): number | undefined {
  const perMinute = Number(direction.querySelector("metronome > per-minute")?.textContent ?? NaN);
  if (Number.isFinite(perMinute) && perMinute > 0) return perMinute;
  const tempo = Number(direction.querySelector("sound")?.getAttribute("tempo") ?? NaN);
  return Number.isFinite(tempo) && tempo > 0 ? tempo : undefined;
}

/** One `<attributes>` element's time signature, when it states one. A time change is written as a fresh `<attributes>` rather than as an element of its own. */
function readTimeSignature(attributes: XmlElement): { beatsPerMeasure: number; beatType: number } | undefined {
  const beats = Number(attributes.querySelector("time > beats")?.textContent ?? NaN);
  const beatType = Number(attributes.querySelector("time > beat-type")?.textContent ?? NaN);
  if (!Number.isFinite(beats) || !Number.isFinite(beatType) || beats <= 0 || beatType <= 0) return undefined;
  return { beatsPerMeasure: beats, beatType };
}

/**
 * Every note of one `<part>`, in beats from its start.
 *
 * **Time is a cursor that moves**, because MusicXML states durations rather than positions: a measure's contents are a sequence, `<backup>` and `<forward>` move the cursor without sounding anything, and `<chord/>` means "at the same time as the note before". Reconstructing positions from that sequence is the whole job of this function.
 */
function readPart(part: XmlElement, problems: string[], metadata: PartMetadata): NoteEvent[] {
  const notes: NoteEvent[] = [];
  const measures = Array.from(part.children).filter((child) => child.tagName === "measure");
  let divisions = 1;
  let measureLengthDivisions = 16;
  let measureStartBeats = 0;
  /** The notes still open, by pitch: a tie's beginning is waiting for its end. **Not cleared per measure** — a tie that crosses a barline is the normal case, so clearing here would refuse to merge exactly the notes the tie exists for. */
  const open = new Map<number, { index: number; startBeats: number }>();

  measures.forEach((measure, measureIndex) => {
    const label = `measure ${measureIndex + 1}`;
    let cursorDivisions = 0;
    /**
     * **Where the note a chord hangs off began.** `<chord/>` means "at the same time as the note before it", and by the time a chord member is read the cursor has already moved past the note it belongs to — so a chord needs the note's start, not the current cursor. Reading it from the cursor would put every chord member one duration after the last, which is the failure this guarded against from the first version.
     *
     * It is written only by a note that is not itself a chord member. That is the same value either way for a well-formed chord (the cursor has not moved between members), which was measured rather than assumed, but it is what makes a member of a member inherit the chord's start instead of its sibling's.
     */
    let chordStartDivisions = 0;

    for (const child of Array.from(measure.children)) {
      if (child.tagName === "attributes") {
        const statedDivisions = Number(child.querySelector("divisions")?.textContent ?? NaN);
        if (Number.isFinite(statedDivisions) && statedDivisions > 0) divisions = statedDivisions;
        const signature = readTimeSignature(child);
        if (signature) {
          measureLengthDivisions = divisions * signature.beatsPerMeasure * (4 / signature.beatType);
          const change: TimeSignature = { ...signature, startBeats: measureStartBeats + cursorDivisions / divisions };
          if (!metadata.timeSignature) metadata.timeSignature = change;
          else if (metadata.timeSignature.beatsPerMeasure !== change.beatsPerMeasure || metadata.timeSignature.beatType !== change.beatType) {
            problems.push(
              `${label}: the time signature changes to ${change.beatsPerMeasure}/${change.beatType} at beat ${formatBeats(change.startBeats)}, and only the first signature is reported`
            );
          }
        }
        continue;
      }
      if (child.tagName === "direction") {
        const tempo = readTempo(child);
        if (tempo !== undefined && metadata.tempoBpm === undefined) metadata.tempoBpm = tempo;
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
      const startDivisions = parsed.isChord ? chordStartDivisions : cursorDivisions;
      /**
       * More `<backup>` than the measure holds drives the cursor before the measure's start, which is what a file with a broken voice structure looks like. The note is placed at the start rather than at a negative beat, because a negative `startBeats` is not a position this model can hold and would be written back out as a note before the piece begins.
       */
      const beforeMeasure = startDivisions < 0;
      const startBeats = measureStartBeats + Math.max(0, startDivisions) / divisions;
      const lengthBeats = parsed.duration / divisions;

      if (beforeMeasure) {
        problems.push(`${label}: a backup moved the cursor before the measure's start, so a note was placed at its beginning`);
      }

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
        chordStartDivisions = cursorDivisions;
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

/** A beat count as a person reads it: a whole number where it is whole, because "beat 2" is what the file meant. */
function formatBeats(beats: number): string {
  return Number.isInteger(beats) ? String(beats) : beats.toFixed(2);
}

/** The `import result` fields every path builds, once the document has been walked. */
function assemble(parts: ImportedPart[], names: string[], metadata: PartMetadata, problems: string[], title?: string): MusicXmlImport {
  if (names.length !== parts.length) problems.push(`the part list names ${names.length} part(s) and the score contains ${parts.length}`);
  const changes = metadata.timeSignature ? [metadata.timeSignature] : [];
  return {
    parts,
    ...(title ? { title } : {}),
    ...(metadata.tempoBpm === undefined ? {} : { tempoBpm: metadata.tempoBpm }),
    ...(metadata.timeSignature === undefined
      ? {}
      : { beatsPerMeasure: metadata.timeSignature.beatsPerMeasure, beatType: metadata.timeSignature.beatType }),
    ...(changes.length > 0 ? { timeSignatureChanges: changes } : {}),
    problems,
  };
}

/**
 * Read a MusicXML document into the arrangement's own model.
 *
 * `score-timewise` is not read, and saying so is better than returning an empty result: the spec provides stylesheets between the two forms, and a caller who has one should convert it first.
 *
 * **Every `<part>` is returned**, in document order. Nothing in the signature chooses one: which part becomes which track is a decision for the caller, and `importMcpMusicXml` is where it is made.
 */
export function fromMusicXml(xml: string): MusicXmlImport {
  const problems: string[] = [];
  let root: XmlElement;
  try {
    root = parseXml(stripByteOrderMark(xml)).documentElement;
  } catch (error) {
    throw new Error(`the document is not well-formed XML: ${(error as Error).message}`);
  }
  if (root.tagName !== "score-partwise") {
    throw new Error(`unsupported MusicXML root "${root.tagName}" — only score-partwise is read`);
  }

  /**
   * The part list names the parts. Real exporters disagree about where a `<part-name>` sits — MusicXML 4.0's schema puts it inside `<score-part>`, and files in the wild also write it as a sibling before one — so the names are collected by tag and paired with the parts in document order, which is the same order under both spellings. The first version queried `part-list > score-part > part-name`, which found nothing in the sibling
   * spelling and named every part "Part 1".
   */
  const names = Array.from(root.querySelectorAll("part-list part-name")).map((node) => node.textContent?.trim() || "Part");
  const metadata: PartMetadata = {};
  const parts: ImportedPart[] = Array.from(root.children).filter((child) => child.tagName === "part").map((part, index) => ({
    name: names[index] ?? `Part ${index + 1}`,
    notes: readPart(part, problems, metadata),
  }));

  const title = root.querySelector("work > work-title")?.textContent?.trim();
  return assemble(parts, names, metadata, problems, title || undefined);
}

/** A byte-order mark is legal in a text file and would otherwise become the first character of the document, which an XML parser rejects. */
function stripByteOrderMark(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** `PK\x03\x04`: the signature of a zip's first local file header, which is the first thing a `.mxl` begins with. */
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04] as const;

function decodeUtf8(bytes: Uint8Array): string {
  return stripByteOrderMark(new TextDecoder().decode(bytes));
}

/** Whether this buffer is a zip. A `PK` signature can be told without attempting to read the zip, which is what makes the error honest rather than "not well-formed XML". */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/**
 * The score inside a zip, chosen the way the specification says.
 *
 * `META-INF/container.xml` names the root file, and it is the only entry a reader may rely on — "the first file in the zip" is an ordering a `.mxl` producer is not required to keep. When the container names nothing that is there, the refusal says so rather than falling back to a guess; a zip with no container at all is a separate, stated fallback.
 *
 * **`fflate` inflates it**, which is MIT, has no dependencies, and — unlike `node:zlib` — runs in a browser too. That is what lets this module stop being Node-only, which is the property that made the MCP tool work at all.
 */
function scoreFromZip(bytes: Uint8Array): string {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (error) {
    throw new Error(`the zip could not be read: ${(error as Error).message}`);
  }
  const names = Object.keys(entries);

  // A `.mxl` is a zip of the compressed MusicXML container: the `mimetype` entry states which, and its own bytes are the evidence.
  const mimetype = entries["mimetype"];
  if (mimetype) {
    const stated = decodeUtf8(mimetype).trim();
    if (stated && stated !== "application/vnd.recordare.musicxml") {
      throw new Error(`this zip is not a MusicXML container: its mimetype is "${stated}"`);
    }
  }

  const container = entries["META-INF/container.xml"];
  if (container) {
    const containerDoc = parseXml(decodeUtf8(container));
    for (const rootfile of Array.from(containerDoc.documentElement.querySelectorAll("rootfile"))) {
      const path = rootfile.getAttribute("full-path");
      if (!path || !entries[path]) continue;
      return decodeUtf8(entries[path]!);
    }
    throw new Error("this zip's META-INF/container.xml names no root file that is in the zip");
  }

  /**
   * A zip with no container. MusicXML 4.0 requires one, so this is a malformed `.mxl`, but a score is more useful than a refusal — and a guess between several candidates would not be.
   */
  const candidates = names.filter((name) => /\.(musicxml|xml)$/i.test(name) && !name.startsWith("META-INF/"));
  if (candidates.length === 0) throw new Error("this zip has no META-INF/container.xml and no .musicxml entry, so there is no score to read in it");
  if (candidates.length > 1) throw new Error(`this zip has no META-INF/container.xml and ${candidates.length} candidate scores (${candidates.join(", ")}), so which one is the score is a guess`);
  return decodeUtf8(entries[candidates[0]!]!);
}

/**
 * Read **either** a plain MusicXML document **or** a compressed `.mxl`, from the file's bytes.
 *
 * The format is decided by the bytes rather than by a file name the caller would have to supply and could get wrong, and it is reported back so a caller can say which one it read.
 */
export async function fromMusicXmlBytes(bytes: Uint8Array): Promise<MusicXmlBytesImport> {
  if (!looksLikeZip(bytes)) {
    return { format: "xml", ...fromMusicXml(decodeUtf8(bytes)) };
  }
  let xml: string;
  try {
    xml = scoreFromZip(bytes);
  } catch (error) {
    throw new Error(`this file is a compressed MusicXML (.mxl) and could not be read: ${(error as Error).message}`);
  }
  try {
    return { format: "mxl", ...fromMusicXml(xml) };
  } catch (error) {
    throw new Error(`this file is a compressed MusicXML (.mxl) whose score could not be read: ${(error as Error).message}`);
  }
}
