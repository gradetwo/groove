/**
 * A Logic Pro `ProjectData` written byte by byte in the **16-byte line model**, at every continuation length a real
 * project uses.
 *
 * Why this file exists separately from `logic_project.mjs`: that one writes the specification's fixed 32-byte note
 * (`90 00 00 00` plus one `0x89` line), and everything measured against it is pinned to that reading. This one can
 * write a note with **0, 1, 2, 3, 4 or 5 continuation lines** — 16, 32, 48, 64, 80 or 96 bytes — so a criterion can
 * say what each length should read without touching a single number the 32-byte fixture produced.
 *
 * **No real project is committed, vendored or snapshotted here.** The bytes below are written from the one rule the
 * format actually uses, taken from the byte model three independent projects document (see the note on `lineRun` in
 * `src/data/logicToArrangement.ts`): a line whose byte 7 has its top bit clear opens an event, and a line whose byte 7
 * has it set continues the event before it. The corpus this was checked against lives outside the checkout and is
 * only ever *measured*. What this fixture can prove is that the reader reads every length; what it cannot prove is
 * that Logic would open the result.
 *
 * The shapes are the ones the corpus holds:
 *
 *   - the head line carries the status in byte 0 (`0x90`..`0x9F` is a note) and its **flag bytes beside it are not a
 *     size** — `90 40 00 00` and `90 00 51 9d` are both notes;
 *   - the first continuation line's byte 7 is `0x89` and the **length in ticks is at its `+12`**;
 *   - each further continuation is a score-symbol atom whose byte 7 is `0xa3`/`0xa4`/`0xa7`/`0xa8` — present in real
 *     notes, named by the sources, and **not interpreted** by the reader;
 *   - the payload is `[events][16-byte f1 terminator]`.
 */

const ROOT_MAGIC = [0x23, 0x47, 0xc0, 0xab];
const HEADER = 0x24;
const TICKS_PER_QUARTER = 960;
const NOTE_ORIGIN_TICKS = 38400;
/** The line: the granularity of every `qSvE` event, and the unit the continuation flag lives in. */
const LINE = 16;
const TERMINATOR = [0xf1, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x3f];
/** Byte 7 of the first continuation line: the top bit set (`0x80`) plus the data-line kind `0x09`. */
const DATA_LINE = 0x89;
/** Byte 7 of the score-symbol atoms, as measured in the corpus. Their meaning is not decoded anywhere. */
const SCORE_SYMBOLS = [0xa3, 0xa4, 0xa7, 0xa8];

function u32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function u16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function zeroes(count) {
  return new Array(Math.max(0, count)).fill(0);
}

function record(tag, { cluster = 0, payloadSize = 0, writes = [] } = {}) {
  const total = HEADER + payloadSize;
  const bytes = new Array(total).fill(0);
  for (let index = 0; index < 4; index += 1) bytes[index] = tag.charCodeAt(index);
  for (let index = 0; index < 4; index += 1) bytes[8 + index] = u32(cluster)[index];
  for (let index = 0; index < 4; index += 1) bytes[0x1c + index] = u32(payloadSize)[index];
  for (const [offset, values] of writes) {
    for (let index = 0; index < values.length; index += 1) {
      if (offset + index < total) bytes[offset + index] = values[index] & 0xff;
    }
  }
  return bytes;
}

/** One 16-byte line whose byte 7 carries `kind`, which is the whole of the continuation flag. */
function line(kind) {
  const bytes = zeroes(LINE);
  bytes[7] = kind & 0xff;
  return bytes;
}

/**
 * One note event: a head line, then `continuations` continuation lines.
 *
 * `continuations: 0` writes a bare 16-byte head line. That is a shape the corpus only ever uses for a controller or a
 * pitch bend, so a note written that way has **no length field at all** — the reader's job is to say so rather than to
 * read the next event's first bytes as a length.
 */
export function buildNoteEvent({
  startTicks = 0,
  pitch,
  velocity = 100,
  lengthTicks = 480,
  continuations = 1,
  status = 0x90,
  headFlags = [0x40, 0x00, 0x00],
} = {}) {
  const put = (target, offset, values) => {
    for (let index = 0; index < values.length; index += 1) target[offset + index] = values[index] & 0xff;
  };
  const event = zeroes(LINE);
  event[0] = status & 0xff;
  event[1] = headFlags[0] & 0xff;
  event[2] = headFlags[1] & 0xff;
  event[3] = headFlags[2] & 0xff;
  put(event, 0x04, u32(NOTE_ORIGIN_TICKS + startTicks));
  put(event, 0x0b, [Math.max(0, Math.min(127, Math.round(velocity)))]);
  put(event, 0x0c, [pitch & 0x7f]);
  put(event, 0x0f, [0x01]);
  const out = [...event];
  if (continuations >= 1) {
    const data = line(DATA_LINE);
    data[0] = 0x40;
    put(data, 0x0c, u32(lengthTicks));
    out.push(...data);
  }
  for (let index = 1; index < continuations; index += 1) {
    out.push(...line(SCORE_SYMBOLS[(index - 1) % SCORE_SYMBOLS.length]));
  }
  return out;
}

/** The byte size of a note event with `continuations` continuation lines. */
export function eventSize(continuations) {
  return LINE * (continuations + 1);
}

/** A region `qeSM` with its name at `+0x34`, sized so the name fits. */
function regionRecord(cluster, name) {
  const nameBytes = [...Buffer.from(name, "utf8")];
  const writes = [
    [0x34, u16(nameBytes.length)],
    [0x36, nameBytes],
  ];
  const payloadSize = 0x36 + nameBytes.length + 8 - HEADER;
  return record("qeSM", { cluster, payloadSize, writes });
}

/** The note `qSvE`: the events at their own lengths, then the 16-byte `f1` terminator. */
function noteRecord(cluster, notes) {
  const body = [];
  for (const note of notes) body.push(...buildNoteEvent(note));
  const payload = [...body, ...TERMINATOR, ...zeroes(8)];
  return record("qSvE", { cluster, payloadSize: payload.length, writes: [[HEADER, payload]] });
}

/** The `gnoS` (song) record: the initial tempo as `round(bpm × 10000)` at the slot the specification names. */
function songRecord(bpm) {
  return record("gnoS", { payloadSize: 0x400, writes: [[0x3a6, u32(Math.round(bpm * 10000))]] });
}

/** The meter `qSvE`: an 80-byte header with the denominator's power at `+0x0b` and the numerator at `+0x0c`. */
function meterRecord(numerator, denominator) {
  return record("qSvE", {
    payloadSize: 80,
    writes: [
      [HEADER, u32(0x30)],
      [HEADER + 0x0b, [Math.round(Math.log2(denominator))]],
      [HEADER + 0x0c, [numerator]],
      [HEADER + 0x0f, [0x80]],
    ],
  });
}

/**
 * `Alternatives/NNN/ProjectData` whose MIDI regions hold notes of every continuation length.
 *
 * @param {object} [options]
 * @param {number} [options.bpm] The tempo in the `gnoS` slot; omitted leaves the bytes of a project with no tempo.
 * @param {{ numerator: number, denominator: number }} [options.timeSignature]
 * @param {Array<{ name?: string, cluster?: number, notes: Array<object> }>} [options.regions] `notes` entries are
 *   `buildNoteEvent` options: `startTicks`, `pitch`, `velocity`, `lengthTicks`, `continuations`, `status`, `headFlags`.
 * @returns {Uint8Array}
 */
export function buildLogicProjectDataLines({ bpm, timeSignature, regions = [] } = {}) {
  const body = [];
  if (bpm !== undefined) body.push(songRecord(bpm));
  if (timeSignature !== undefined) body.push(meterRecord(timeSignature.numerator, timeSignature.denominator));
  let nextCluster = 0x40000;
  for (const region of regions) {
    const cluster = region.cluster ?? nextCluster;
    nextCluster = cluster + 0x40000;
    body.push(regionRecord(cluster, region.name ?? `Region ${cluster.toString(16)}`));
    body.push(noteRecord(cluster, region.notes));
  }
  const flat = [];
  for (const bytes of body) for (const byte of bytes) flat.push(byte);
  const header = [
    ...ROOT_MAGIC,
    0xd0, 0x09,
    0x03, 0x00, 0x04, 0x00, 0x00, 0x00, 0x01, 0x00, 0x08, 0x00,
    ...u32(flat.length),
    ...zeroes(4),
  ];
  return Uint8Array.from([...header, ...flat]);
}

/** The line model this file writes, so a criterion can assert about the bytes rather than about the reader. */
export const NOTE_FORM = {
  lineSize: LINE,
  headMarker: [0x90, 0x40, 0x00, 0x00],
  dataLine: DATA_LINE,
  scoreSymbols: SCORE_SYMBOLS,
  tailMarker: 0xf1,
};

export { TICKS_PER_QUARTER, NOTE_ORIGIN_TICKS };
