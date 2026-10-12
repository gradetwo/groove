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
/** Where a region's placement is counted from: nine bars of 4/4, the same origin the reader names. */
const REGION_ORIGIN_TICKS = 34560;
const METER_MARKER = 0x30;
const TEMPO_MARKER = 0x60;
const TEMPO_SLOT_AUTHORITATIVE = 0x3a6;
const TEMPO_SLOT_FALLBACK = 0x92;

/**
 * How many notes the **whole** arrangement holds, across every track.
 *
 * ⭐ This is what a Logic export's guard has to ask, and not the notes of the track the score view happens to show:
 * `logicProjectBundle` writes every track, so refusing on an empty selected track would hide an export that has
 * content elsewhere (docs/OPEN_WORK.md 294). Pure and exported so a criterion can hold it to that.
 */
export function arrangementNoteCount(arrangement: { notesByTrack?: Record<string, readonly unknown[]> }): number {
  return Object.values(arrangement.notesByTrack ?? {}).reduce((total, lane) => total + lane.length, 0);
}

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
export function logicMetaDataPlist(bpm: number, beatsPerMeasure = 4, beatType = 4, trackCount = 0): Uint8Array {
  /**
   * The keys the projects this writer imitates actually carry — measured, not guessed (docs/OPEN_WORK.md 298).
   *
   * Three of the owner's real projects (`Colors`, `ocean eyes`, `MONTERO`) were read with `plistlib`: their key sets
   * **differ by Logic version** (nineteen keys in one, twenty-four in the union), so "nineteen" was never the target.
   * What is here is the union, with each key in one of three honest classes:
   *
   *   * **from the arrangement** — `BeatsPerMinute`, the two signature keys, `NumberOfTracks`;
   *   * **constant in all three** — `SampleRate 44100`, `FrameRateIndex 1`, `SurroundFormatIndex 5`, `Version 3`,
   *     `isTimeCodeBased false`, and the empty `PlaybackFiles`/`UnusedAudioFiles`;
   *   * **empty because we have none** — the asset lists (`AudioFiles`, `AlchemyFiles`, `QuicksamplerFiles`,
   *     `UltrabeatFiles`, `SamplerInstrumentsFiles`, `ImpulsResponsesFiles`, `VideoFiles`): an arrangement of notes
   *     carries no audio, no sampler instruments and no video, so an empty list is the truth rather than a gap.
   *
   * Deliberately **absent**: `SongKey`, `SongGenderKey`, `SignatureKey`. The real projects state a key ("C"/"major"/7),
   * and an arrangement here has no field that says one, so writing "C major" would put a claim in the user's mouth that
   * the user never made. Recorded in `needs` instead (docs/OPEN_WORK.md 298).
   */
  const empty = (key: string) => `\t<key>${key}</key><array/>\n`;
  const integer = (key: string, value: number) => `\t<key>${key}</key><integer>${value}</integer>\n`;
  const bool = (key: string, value: boolean) => `\t<key>${key}</key><${value ? "true" : "false"}/>\n`;
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n` +
    `<plist version="1.0"><dict>\n` +
    `\t<key>BeatsPerMinute</key><real>${bpm}</real>\n` +
    `\t<key>SongSignatureNumerator</key><integer>${beatsPerMeasure}</integer>\n` +
    `\t<key>SongSignatureDenominator</key><integer>${beatType}</integer>\n` +
    integer("NumberOfTracks", trackCount) +
    integer("SampleRate", 44100) +
    integer("FrameRateIndex", 1) +
    integer("SurroundFormatIndex", 5) +
    integer("Version", 3) +
    bool("isTimeCodeBased", false) +
    bool("HasARAPlugins", false) +
    bool("HasGrid", false) +
    empty("PlaybackFiles") +
    empty("UnusedAudioFiles") +
    empty("AudioFiles") +
    empty("AlchemyFiles") +
    empty("QuicksamplerFiles") +
    empty("UltrabeatFiles") +
    empty("SamplerInstrumentsFiles") +
    empty("ImpulsResponsesFiles") +
    empty("VideoFiles") +
    `</dict></plist>\n`;
  return new TextEncoder().encode(xml);
}

/**
 * `Resources/ProjectInformation.plist`, to the shape the real projects use (docs/OPEN_WORK.md 298).
 *
 * **`ActiveVariant` is an integer here, not a string**, because that is what all three measured projects carry (their
 * folder is `000` and the plist says `0`); `activeVariant` pads a run of digits back to the folder's three digits, so
 * both spellings name the same alternative. `VariantNames`/`VariantNamesV2` are tables keyed by the variant index as a
 * string (`{"0": "Demo Song"}` measured), which is the list of variants rather than a statement of which is open.
 *
 * Deliberately **absent**: `LastSavedFrom` (it names the application that saved the file — writing "Logic Pro X …"
 * would claim to be something this is not), `projectAssetFlags` (an integer whose meaning is unknown), and
 * `ExternalRecordPath` (a binary bookmark into the original owner's disk). All three are recorded in `needs`.
 */
export function logicProjectInformationPlist(alternativeIndex: number, variantName: string): Uint8Array {
  const names = `\t<key>VariantNames</key><dict><key>${alternativeIndex}</key><string>${escapeXml(variantName)}</string></dict>\n`;
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n` +
    `<plist version="1.0"><dict>\n` +
    `\t<key>ActiveVariant</key><integer>${alternativeIndex}</integer>\n` +
    `\t<key>BundleVersion</key><real>2.0</real>\n` +
    `\t<key>HasProjectFolder</key><false/>\n` +
    names +
    names.replace("VariantNames", "VariantNamesV2") +
    `</dict></plist>\n`;
  return new TextEncoder().encode(xml);
}

/**
 * `Alternatives/<alt>/DisplayState.plist`, the third of the five files a real project keeps per alternative.
 *
 * Its five keys were read from `Colors.logicx`: `displayDataVersion`, `docPreferences`, `screenVisibleFrames`,
 * `screensetCurrSlot`, `screensetDictArray` — window and screenset state. The values here are the empty shape: this
 * writer has no screen to describe, and inventing window frames would be a lie about a UI that never existed. The
 * remaining two files (`WindowImage.jpg`, a 1.6 MB thumbnail, and `DisplayStateArchive`, a 35 KB opaque archive) are
 * **not** written, and that is recorded in `needs` rather than faked.
 */
export function logicDisplayStatePlist(): Uint8Array {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n` +
    `<plist version="1.0"><dict>\n` +
    `\t<key>displayDataVersion</key><integer>1</integer>\n` +
    `\t<key>docPreferences</key><dict/>\n` +
    `\t<key>screenVisibleFrames</key><array/>\n` +
    `\t<key>screensetCurrSlot</key><integer>0</integer>\n` +
    `\t<key>screensetDictArray</key><array/>\n` +
    `</dict></plist>\n`;
  return new TextEncoder().encode(xml);
}

/** XML text for a plist string; the writer's names can contain `&` and `<`. */
function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/**
 * A region record. **The reader builds one part per `qeSM` record**, taking the note sequences whose `cluster` equals
 * this record's — so a sequence without a region record is invisible — and it reads the region's name from a named
 * record at payload `+0x34` (a `uint16` length then UTF-8).
 */
function regionRecord(cluster: number, name: string): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const nameOffsetInBody = 0x34 - RECORD_HEADER;
  const body = new Uint8Array(nameOffsetInBody + 2 + nameBytes.length + 4);
  body[nameOffsetInBody] = nameBytes.length & 0xff;
  body[nameOffsetInBody + 1] = (nameBytes.length >>> 8) & 0xff;
  body.set(nameBytes, nameOffsetInBody + 2);
  /**
       * The `uint32` immediately after the name, which the real projects carry as zero.
   * after the variable-length name.
   *
   * WARNING: **our own reader does not apply this field** -- it documents that the layout moved between versions and
   * that in its 10.x fixtures the same bytes contradict the notes they should bound, so it imports every part from
   * beat 0 (docs/OPEN_WORK.md 242). It is written anyway, because a file that omits a documented field is a worse
   * neighbour than one that carries it, and a reader which does apply it can then place the region. This writer does
   * **not** claim the timeline position is placed: that stays a need.
   *
       * Measured, not assumed: the four bytes after the name are **zero** in `Colors`, in
       * `MONTERO - Spatial Audio` and in two fixtures, so this field is not the region's timeline start.
       * The region's placement is not established by this writer and is recorded in `needs` (docs/OPEN_WORK.md 300).
   * the notes already carry their absolute positions from `NOTE_ORIGIN_TICKS` inside the sequence.
   */
      // Measured: every real project sampled carries zero here, so this is not the region's start.
      setU32(body, nameOffsetInBody + 2 + nameBytes.length, 0);
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
  return { projectData, metaData: logicMetaDataPlist(bpm, 4, 4, parts.length) };
}

/** The three files a `.logicx` must carry for this reader to open it, as a directory map. */
export interface LogicProjectBundle {
  /** Path inside the package → its bytes. The names are the ones `logicFixtures.test.ts` reads. */
  files: Record<string, Uint8Array>;
}

/**
 * The package a `.logicx` is: a directory holding `Alternatives/<alt>/ProjectData`, the `MetaData.plist` beside it,
 * and `Resources/ProjectInformation.plist` naming that alternative as active.
 *
 * **The alternative name is written into the plist exactly as the directory is named.** A real project in the
 * owner's corpus states `0` while its directory is `000` (docs/OPEN_WORK.md 258), so a reader that joins the two has
 * to match by value — this writer does not add a second inconsistency to that.
 *
 * What this does **not** claim: that real Logic opens it, or which versions accept it. Those stay needs (237).
 */
export function logicProjectBundle(
  parts: readonly ImportedPart[],
  bpm = 120,
  alternative = "000",
  variantName = "Arrangement"
): LogicProjectBundle {
  const { projectData } = arrangementToLogicFiles(parts, bpm);
  const parsed = Number.parseInt(alternative, 10);
  const alternativeIndex = Number.isFinite(parsed) ? parsed : 0;
  /**
   * Four files, where a real project keeps five per alternative (docs/OPEN_WORK.md 298): the fifth and sixth are the
   * thumbnail and the opaque display archive, which this writer does not fake.
   */
  return {
    files: {
      [`Alternatives/${alternative}/ProjectData`]: projectData,
      [`Alternatives/${alternative}/MetaData.plist`]: logicMetaDataPlist(bpm, 4, 4, parts.length),
      [`Alternatives/${alternative}/DisplayState.plist`]: logicDisplayStatePlist(),
      "Resources/ProjectInformation.plist": logicProjectInformationPlist(alternativeIndex, variantName),
    },
  };
}
