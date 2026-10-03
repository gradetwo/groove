/**
 * A Logic Pro `ProjectData` written byte by byte in the **48-byte note form**, which the byte-level specification
 * does not describe and real projects nevertheless contain.
 *
 * Why this file exists separately from `logic_project.mjs`: that one writes the form the specification defines
 * (`90 00 00 00`, 32-byte events), and everything measured against it is pinned to that reading. This one writes the
 * other form, so the criterion for it can turn red without touching a single number the 32-byte reading produced.
 *
 * **No real project is committed, vendored or snapshotted here.** The bytes below are written from the field
 * offsets the two forms share, and the corpus the change was found on lives outside the checkout and is only ever
 * *measured* — see `docs/OPEN_WORK.md`. What this fixture can prove is that the reader reads this form at all; what
 * it cannot prove is that Logic would open the result, exactly as the module header says.
 *
 * The form, as measured on the owner's official projects:
 *
 *   - the marker dword is `90 40 00 00` — the status byte `0x90` with a flag byte beside it, **not** `90 00 00 00`;
 *   - one event is **48** bytes, not 32;
 *   - the five fields are at the same offsets as the 32-byte form: position `+0x04`, coarse velocity `+0x0b`,
 *     pitch `+0x0c`, length in ticks `+0x1c`;
 *   - the payload is `[events][16-byte terminator]`, so its size is `48 × notes + 16`.
 */

const ROOT_MAGIC = [0x23, 0x47, 0xc0, 0xab];
const HEADER = 0x24;
const TICKS_PER_QUARTER = 960;
const NOTE_ORIGIN_TICKS = 38400;
const NOTE_EVENT_SIZE = 48;
const TERMINATOR = [0xf1, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x3f];

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

/**
 * One 48-byte note event. Note the marker: `90 40 00 00`, where `0x40` is the flag the reader must not test.
 */
function noteEvent48({ startTicks = 0, pitch, velocity = 100, lengthTicks = 480 }) {
  const event = new Array(NOTE_EVENT_SIZE).fill(0);
  const put = (offset, values) => {
    for (let index = 0; index < values.length; index += 1) event[offset + index] = values[index] & 0xff;
  };
  put(0x00, [0x90, 0x40, 0x00, 0x00]);
  put(0x04, u32(NOTE_ORIGIN_TICKS + startTicks));
  put(0x0b, [Math.max(0, Math.min(127, Math.round(velocity)))]);
  put(0x0c, [pitch & 0x7f]);
  put(0x0f, [0x01]);
  put(0x1c, u32(lengthTicks));
  return event;
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

/** The note `qSvE`: the 48-byte events, then the 16-byte terminator. */
function noteRecord48(cluster, notes) {
  const body = [];
  for (const note of notes) body.push(...noteEvent48(note));
  const payload = [...body, ...TERMINATOR, ...zeroes(8)];
  return record("qSvE", { cluster, payloadSize: payload.length, writes: [[HEADER, payload]] });
}

/** The `gnoS` (song) record: the initial tempo as `round(bpm × 10000)` at the slot the specification names. */
function songRecord(bpm) {
  const scaled = Math.round(bpm * 10000);
  return record("gnoS", { payloadSize: 0x400, writes: [[0x3a6, u32(scaled)]] });
}

/** The meter `qSvE`: an 80-byte header with the denominator's power at `+0x0b` and the numerator at `+0x0c`. */
function meterRecord(numerator, denominator) {
  const exponent = Math.round(Math.log2(denominator));
  return record("qSvE", {
    payloadSize: 80,
    writes: [
      [HEADER, u32(0x30)],
      [HEADER + 0x0b, [exponent]],
      [HEADER + 0x0c, [numerator]],
      [HEADER + 0x0f, [0x80]],
    ],
  });
}

/**
 * `Alternatives/NNN/ProjectData` whose MIDI regions hold **48-byte** note events.
 *
 * @param {object} [options]
 * @param {number} [options.bpm] The tempo in the `gnoS` slot; omitted leaves the bytes of a project with no tempo.
 * @param {{ numerator: number, denominator: number }} [options.timeSignature]
 * @param {Array<{ name?: string, cluster?: number, notes: Array<{ startTicks: number, pitch: number, velocity?: number, lengthTicks?: number }> }>} [options.regions]
 * @returns {Uint8Array}
 */
export function buildLogicProjectData48({ bpm, timeSignature, regions = [] } = {}) {
  const body = [];
  if (bpm !== undefined) body.push(songRecord(bpm));
  if (timeSignature !== undefined) body.push(meterRecord(timeSignature.numerator, timeSignature.denominator));
  let nextCluster = 0x40000;
  for (const region of regions) {
    const cluster = region.cluster ?? nextCluster;
    nextCluster = cluster + 0x40000;
    body.push(regionRecord(cluster, region.name ?? `Region ${cluster.toString(16)}`));
    body.push(noteRecord48(cluster, region.notes));
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

/** The event size and marker this file writes, so a criterion can name what it is asserting about. */
export const NOTE_FORM_48 = { eventSize: NOTE_EVENT_SIZE, marker: [0x90, 0x40, 0x00, 0x00] };

export { TICKS_PER_QUARTER, NOTE_ORIGIN_TICKS };
