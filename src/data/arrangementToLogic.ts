/**
 * Writing a `.logicx`'s files.
 *
 * ⚠️ **P1: the minimal package our own reader reads back.** Every offset below was measured from
 * `logicToArrangement.ts` rather than guessed — the root magic and declared length, the 36-byte record header,
 * the note line's status nibble and continuation flag, and the length that lives at the head line's `+0x1c`.
 *
 * ⚠️ **What this does NOT claim** (see `docs/OPEN_WORK.md` §237): that real Logic opens the result, or that it is
 * version compatible. Neither can be shown on this machine, so both are `needs` rather than assertions.
 *
 * ⚠️ **A deliberate simplification, said out loud rather than hidden**: every note is written with **exactly one
 * continuation line**. The corpus varies that count (16…96 bytes per note), and the reader only ever reads the
 * length from the **first** continuation, so one continuation carries the length and nothing is lost on the way
 * back — but a file that differs from Logic's own shape is exactly the kind of thing a reader may tolerate while
 * Logic does not.
 *
 * Prior art and its licences are recorded in `logicToArrangement.ts`: the Apache-2.0 and MIT references were read for
 * offsets, the GPL-3.0-or-later one for a single quoted line. Nothing was copied from the GPL analyser.
 */
import { LOGIC_TICKS_PER_QUARTER } from "./logicToArrangement";
import type { ImportedPart } from "./musicxmlImport";
import type { NoteEvent } from "../types/arrangementV2";

const ROOT_MAGIC = [0x23, 0x47, 0xc0, 0xab] as const;
const ROOT_HEADER = 0x18;
const RECORD_HEADER = 0x24;
const EVENT_LINE_SIZE = 16;
const CONTINUATION_BYTE = 7;
const CONTINUATION_FLAG = 0x80;
const NOTE_STATUS = 0x90;
const DECLARED_LENGTH_OFFSET = 0x10;
const RECORD_SIZE_OFFSET = 0x1c;
const CLUSTER_OFFSET = 8;
/** The reader subtracts this from a note's ticks, so the writer has to add it (see `readNotes`). */
const NOTE_ORIGIN_TICKS = 38400;
const METER_MARKER = 0x30;
const TEMPO_MARKER = 0x60;
const TEMPO_SLOT_AUTHORITATIVE = 0x3a6;
const TEMPO_SLOT_FALLBACK = 0x92;

export interface LogicWrittenFiles {
  /** `Alternatives/NNN/ProjectData`. */
  projectData: Uint8Array;
  /** `Alternatives/NNN/MetaData.plist`. */
  metaData: Uint8Array;
}

function setU32(bytes: Uint8Array, at: number, value: number): void {
  bytes[at] = value & 0xff;
  bytes[at + 1] = (value >>> 8) & 0xff;
  bytes[at + 2] = (value >>> 16) & 0xff;
  bytes[at + 3] = (value >>> 24) & 0xff;
}

/** One part's notes as the reader's own 16-byte lines: a head line and one continuation carrying the length. */
export function logicNoteLines(notes: readonly NoteEvent[]): Uint8Array {
  const body = new Uint8Array(notes.length * EVENT_LINE_SIZE * 2);
  notes.forEach((note, index) => {
    const head = index * EVENT_LINE_SIZE * 2;
    const continuation = head + EVENT_LINE_SIZE;
    body[head] = NOTE_STATUS;
    body[head + CONTINUATION_BYTE] = 0;
    setU32(body, head + 4, Math.round(note.startBeats * LOGIC_TICKS_PER_QUARTER) + NOTE_ORIGIN_TICKS);
    body[head + 0x0b] = Math.max(1, Math.min(127, Math.round(note.velocity)));
    body[head + 0x0c] = note.pitch;
    body[continuation + CONTINUATION_BYTE] = CONTINUATION_FLAG;
    // The length the reader takes: the first continuation's `+0x0c`, read as the head line's `+0x1c`.
    setU32(body, continuation + 0x0c, Math.max(1, Math.round(note.lengthBeats * LOGIC_TICKS_PER_QUARTER)));
  });
  return body;
}

function record(tag: string, body: Uint8Array, cluster = 0): Uint8Array {
  const out = new Uint8Array(RECORD_HEADER + body.length);
  for (let i = 0; i < 4; i += 1) out[i] = tag.charCodeAt(i) & 0xff;
  setU32(out, CLUSTER_OFFSET, cluster);
  setU32(out, RECORD_SIZE_OFFSET, body.length);
  out.set(body, RECORD_HEADER);
  return out;
}

/**
 * A `gnoS` song record whose tempo slots hold `round(bpm × 10000)`.
 *
 * ⚠️ The offsets are **payload** relative — `readTempo` reads `song.payload` at `0x3a6`/`0x92`/`0xea`, and a record's
 * payload includes its 36-byte header — so the body offsets are those minus `RECORD_HEADER`. Writing them
 * body-relative is what made the reader report that the project states no tempo.
 */
function songRecord(bpm: number): Uint8Array {
  const ticks = Math.round(bpm * 10000);
  const body = new Uint8Array(TEMPO_SLOT_AUTHORITATIVE - RECORD_HEADER + 4);
  setU32(body, TEMPO_SLOT_AUTHORITATIVE - RECORD_HEADER, ticks);
  setU32(body, TEMPO_SLOT_FALLBACK - RECORD_HEADER, ticks);
  return record("gnoS", body);
}

/** An XML plist, which the reader parses as readily as a binary one. */
export function logicMetaDataPlist(bpm: number, beatsPerMeasure = 4, beatType = 4): Uint8Array {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n` +
    `<plist version="1.0"><dict>\n` +
    `\t<key>BeatsPerMinute</key><real>${bpm}</real>\n` +
    `\t<key>SongSignatureNumerator</key><integer>${beatsPerMeasure}</integer>\n` +
    `\t<key>SongSignatureDenominator</key><integer>${beatType}</integer>\n` +
    `</dict></plist>\n`;
  return new TextEncoder().encode(xml);
}

/**
 * A region record. **The reader builds one part per `qeSM` record**, taking the note sequences whose `cluster` equals
 * this record's — so a sequence without a region record is invisible — and it reads the region's name from a named
 * record at payload `+0x34` (a `uint16` length then UTF-8).
 */
function regionRecord(cluster: number, name: string): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const nameOffsetInBody = 0x34 - RECORD_HEADER;
  const body = new Uint8Array(nameOffsetInBody + 2 + nameBytes.length);
  body[nameOffsetInBody] = nameBytes.length & 0xff;
  body[nameOffsetInBody + 1] = (nameBytes.length >>> 8) & 0xff;
  body.set(nameBytes, nameOffsetInBody + 2);
  return record("qeSM", body, cluster);
}

/** The signature record: first word `0x30`, then the denominator's power of two at `+0x0b` and the numerator at `+0x0c`. */
function meterRecord(beatsPerMeasure: number, beatType: number): Uint8Array {
  const body = new Uint8Array(80);
  setU32(body, 0, METER_MARKER);
  body[0x0b] = Math.round(Math.log2(beatType));
  body[0x0c] = beatsPerMeasure;
  return record("qSvE", body);
}

/** The tempo sequence: first word `0x60`. */
function tempoRecord(): Uint8Array {
  const body = new Uint8Array(EVENT_LINE_SIZE);
  setU32(body, 0, TEMPO_MARKER);
  return record("qSvE", body);
}

/** The two files of a minimal project. Note sequences are written as one `qSvE` record per part. */
export function arrangementToLogicFiles(parts: readonly ImportedPart[], bpm = 120): LogicWrittenFiles {
  const records: Uint8Array[] = [meterRecord(4, 4), tempoRecord(), songRecord(bpm)];
  parts.forEach((part, index) => {
    const cluster = index + 1;
    records.push(regionRecord(cluster, part.name));
    records.push(record("qSvE", logicNoteLines(part.notes), cluster));
  });
  const payloadLength = records.reduce((total, r) => total + r.length, 0);
  const projectData = new Uint8Array(ROOT_HEADER + payloadLength);
  ROOT_MAGIC.forEach((byte, index) => {
    projectData[index] = byte;
  });
  setU32(projectData, DECLARED_LENGTH_OFFSET, payloadLength);
  let at = ROOT_HEADER;
  for (const r of records) {
    projectData.set(r, at);
    at += r.length;
  }
  return { projectData, metaData: logicMetaDataPlist(bpm) };
}
