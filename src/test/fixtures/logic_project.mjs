/**
 * A Logic Pro `ProjectData` written **byte by byte**, so the criteria and the MCP gate read the same bytes.
 *
 * The repository does **not** commit `.logicx` fixtures. The only collection of real ones found is a textbook's
 * companion assets with no stated licence (`github.com/wikibook/logicprox-106`), and using somebody's project
 * locally to check a parser is a different act from redistributing it — so those stay outside the checkout and the
 * real-file criteria skip without them. What CI gets instead is this: the record framing, the note encoding, the
 * tempo slots and the meter header written down exactly as the specification states them, so a reader that drifts
 * from the format turns a criterion red without anyone's music being involved.
 *
 * It writes **exactly what the caller asks for**, including shapes a friendly writer would tidy up: a region with no
 * notes, a note of zero length, a name in bytes that are not UTF-8. Those are the cases a reader has to answer for.
 *
 * The quantities are the real ones: 960 ticks per quarter, the region origin at 34560, the note origin at 38400, and
 * the tempo as `round(bpm × 10000)`.
 */

const ROOT_MAGIC = [0x23, 0x47, 0xc0, 0xab];
const HEADER = 0x24;
const TICKS_PER_QUARTER = 960;
/** The same origin the reader subtracts, so a fixture note at "bar 2" is written the way Logic writes it. */
export const NOTE_ORIGIN_TICKS = 38400;

function u32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function u16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function zeroes(count) {
  return new Array(Math.max(0, count)).fill(0);
}

/**
 * One record: a four-byte tag, the cluster index at `+8`, the payload size at `+0x1c`, then the payload.
 *
 * The payload is assembled at its **record-relative** offsets — that is why the caller passes absolute offsets such
 * as `+0x34` for the name and `+0x3a6` for the tempo slot. Getting this wrong is invisible in a hand-written
 * fixture, so the fixture is written the way the specification counts.
 */
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

/** A `qeSM` region: a name at `+0x34`, and the payload sized so the name fits. */
function regionRecord(cluster, name) {
  const nameBytes = [...Buffer.from(name, "utf8")];
  const writes = [[0x34, u16(nameBytes.length)], [0x36, nameBytes]];
  const payloadSize = 0x36 + nameBytes.length + 8 - HEADER;
  return { writes, payloadSize, bytes: nameBytes.length };
}

/**
 * The `gnoS` (song) record: the tempo is replicated at `+0x92`, `+0xea` and `+0x3a6`, as plain `uint32` values of
 * `round(bpm × 10000)`. All three are written, because a reader that picks the wrong one must be able to disagree.
 */
function songRecord(bpm) {
  const scaled = Math.round(bpm * 10000);
  const writes = [
    [0x92, u32(scaled)],
    [0xea, u32(scaled)],
    [0x3a6, u32(scaled)],
  ];
  return record("gnoS", { payloadSize: 0x400, writes });
}

/** The meter `qSvE`: an 80-byte header with the denominator's power at `+0x0b` and the numerator at `+0x0c`. */
function meterRecord(numerator, denominator) {
  const exponent = Math.round(Math.log2(denominator));
  const writes = [
    [HEADER + 0x0b, [exponent]],
    [HEADER + 0x0c, [numerator]],
    [HEADER + 0x0f, [0x80]],
    [HEADER, u32(0x30)],
  ];
  return record("qSvE", { payloadSize: 80, writes });
}

/** A tempo-track `qSvE`, whose first payload dword marks it as a tempo map. */
function tempoMapRecord(points = 1) {
  const payloadSize = 32 * points;
  return record("qSvE", { payloadSize, writes: [[HEADER, u32(0x60)]] });
}

/** One 32-byte note event: the `90` marker, the position, the fine/coarse velocity, the pitch and the length. */
function noteEvent({ startTicks = 0, pitch, velocity = 100, lengthTicks = 240 }) {
  const event = new Array(32).fill(0);
  const put = (offset, values) => {
    for (let index = 0; index < values.length; index += 1) event[offset + index] = values[index] & 0xff;
  };
  put(0x00, u32(0x90));
  put(0x04, u32(NOTE_ORIGIN_TICKS + startTicks));
  put(0x0a, [0, 0]); // fine velocity 0, coarse velocity next
  put(0x0b, [Math.max(0, Math.min(127, Math.round(velocity))) ]);
  put(0x0c, [pitch & 0x7f]);
  put(0x0f, [0x01]);
  put(0x10, [0x40]);
  put(0x17, [0x89]);
  put(0x1c, u32(lengthTicks));
  return event;
}

/** A note `qSvE`: the events, then the 16-byte `f1` tail the specification ends every event sequence with. */
function noteRecord(cluster, notes) {
  const body = [];
  for (const note of notes) body.push(...noteEvent(note));
  const tail = [0xf1, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x3f, ...zeroes(8)];
  const payload = [...body, ...tail];
  return record("qSvE", { cluster, payloadSize: payload.length, writes: [[HEADER, payload]] });
}

/**
 * A note `qSvE` with **no events at all**, which is what an empty region looks like: Logic still writes the record,
 * so a reader that only noticed regions with notes would not see the empty one at all.
 */
export function emptyNoteRecord(cluster) {
  const payload = [0xf1, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x3f, ...zeroes(8)];
  return record("qSvE", { cluster, payloadSize: payload.length, writes: [[HEADER, payload]] });
}

/** A `gRuA`/`lFuA` pair, which is what an audio region is: the two records the reader counts to name the boundary. */
function audioRegionRecords(cluster, name) {
  const nameBytes = [...Buffer.from(name, "latin1")];
  const lfua = record("lFuA", { cluster, payloadSize: 0x60, writes: [[HEADER + 8, u16(nameBytes.length)], [HEADER + 10, nameBytes]] });
  const grua = record("gRuA", { cluster, payloadSize: 0x40 });
  return [lfua, grua];
}

/** An `rpyH` record, which is what an automation lane is written as. */
function automationRecord(cluster) {
  return record("rpyH", { cluster, payloadSize: 0x40 });
}

/**
 * `Alternatives/NNN/ProjectData`.
 *
 * @param {object} [options]
 * @param {number} [options.bpm] The tempo in the `gnoS` slots; omitted leaves the byte a project with no tempo.
 * @param {{ numerator: number, denominator: number }} [options.timeSignature]
 * @param {Array<{ name?: string, nameBytes?: number[], cluster?: number, tempoPoints?: number, notes?: Array<{ startTicks: number, pitch: number, velocity?: number, lengthTicks?: number }>, audioName?: string, automation?: boolean }>} [options.regions]
 * @returns {Uint8Array}
 */
export function buildLogicProjectData({ bpm, timeSignature, regions = [], tempoPoints = 1 } = {}) {
  const body = [];
  if (bpm !== undefined) body.push(songRecord(bpm));
  if (timeSignature !== undefined) body.push(meterRecord(timeSignature.numerator, timeSignature.denominator));
  body.push(tempoMapRecord(tempoPoints));
  let nextCluster = 0x40000;
  for (const region of regions) {
    const cluster = region.cluster ?? nextCluster;
    nextCluster = cluster + 0x40000;
    const name = region.name ?? `Region ${cluster.toString(16)}`;
    const named = region.nameBytes !== undefined
      ? { writes: [[0x34, u16(region.nameBytes.length)], [0x36, region.nameBytes]], payloadSize: 0x36 + region.nameBytes.length + 8 - HEADER, bytes: region.nameBytes.length }
      : regionRecord(cluster, name);
    body.push(record("qeSM", { cluster, payloadSize: named.payloadSize, writes: named.writes }));
    /**
     * An **audio** region is a `lFuA`/`gRuA` pair and has no note sequence at all — that is what makes it audio. A
     * region with `notes: []` and no `audioName` is the different case: an empty *MIDI* region, which Logic still
     * writes a note sequence for.
     */
    if (region.audioName !== undefined) for (const bytes of audioRegionRecords(cluster, region.audioName)) body.push(bytes);
    else if (region.notes !== undefined) body.push(region.notes.length === 0 ? emptyNoteRecord(cluster) : noteRecord(cluster, region.notes));
    if (region.automation === true) body.push(automationRecord(cluster));
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

/** A region with a name in bytes that are not valid UTF-8. */
export function invalidUtf8RegionName() {
  return [0xc3, 0x28, 0xa0, 0xa1];
}

/** `MetaData.plist` as Logic writes it — an XML plist, which is half of what the reader has to accept. */
export function buildMetaDataPlist({ bpm, numerator, denominator } = {}) {
  const entries = [];
  if (bpm !== undefined) entries.push(`\t<key>BeatsPerMinute</key>\n\t<real>${bpm}</real>`);
  if (numerator !== undefined) entries.push(`\t<key>SongSignatureNumerator</key>\n\t<integer>${numerator}</integer>`);
  if (denominator !== undefined) entries.push(`\t<key>SongSignatureDenominator</key>\n\t<integer>${denominator}</integer>`);
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n${entries.join("\n")}\n</dict>\n</plist>\n`,
    "utf8"
  );
}

/**
 * A **binary** plist holding one string key, which is the shape `Resources/ProjectInformation.plist` has and the
 * shape that says which alternative is active. Hand-built for the same reason as the rest of this file: the case
 * "the active alternative is not 000" has to be testable without a project that happens to be on `004`.
 */
export function buildBinaryPlist(kv) {
  const keys = Object.keys(kv);
  const objects = [];
  // 0: the top dictionary. Then, per entry, the key string, then the value string. The dictionary takes index 0 and
  //   the first entry's objects take 1 and 2, so the reference is `objects.length + 1` **before** anything is pushed.
  const dict = { kind: "dict", entries: [] };
  for (const key of keys) {
    dict.entries.push({ key: objects.length + 1, value: objects.length + 2 });
    objects.push({ kind: "string", value: key });
    objects.push({ kind: "string", value: String(kv[key]) });
  }
  objects.unshift(dict);

  const encoded = objects.map((object) => {
    if (object.kind === "dict") {
      const body = [];
      for (const entry of object.entries) body.push(entry.key, entry.value);
      return [0xd0 | object.entries.length, ...body];
    }
    const bytes = [...Buffer.from(object.value, "ascii")];
    return [0x50 | bytes.length, ...bytes];
  });

  const offsets = [];
  let cursor = 8;
  for (const bytes of encoded) {
    offsets.push(cursor);
    cursor += bytes.length;
  }
  const tableStart = cursor;
  const out = [0x62, 0x70, 0x6c, 0x69, 0x73, 0x74, 0x30, 0x30];
  for (const bytes of encoded) out.push(...bytes);
  for (const offset of offsets) out.push(offset);
  /**
   * The trailer is 32 bytes: six unused, then the **one-byte** offset width and object-reference width, then three
   * `uint64`s — the object count, the top object's index, and where the offset table starts. The two widths are one
   * byte because this builder never writes more objects or a bigger file than that can address.
   */
  const count = objects.length;
  const uint64 = (value) => {
    const bytes = [];
    for (let shift = 56; shift >= 0; shift -= 8) bytes.push(Math.floor(value / 2 ** shift) % 256);
    return bytes;
  };
  out.push(...zeroes(6), 1, 1);
  out.push(...uint64(count), ...uint64(0), ...uint64(tableStart));
  return Uint8Array.from(out);
}

export { TICKS_PER_QUARTER };
