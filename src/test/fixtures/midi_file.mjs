/**
 * A Standard MIDI File written **byte by byte**, so the criteria and the MCP gate read the same file.
 *
 * The repository has real MIDI files for local work and they are deliberately not committed (they are other people's music). CI needs a file it may keep, so this builds one: the bytes are the specification, and a fixture that is constructed rather than checked in is a fixture whose every byte someone chose on purpose.
 *
 * It writes **exactly what the caller asks for**, including things a friendly writer would fix up: a track with no name, a note that is never released, a note-on with velocity zero used as a note-off, and a track name in bytes that are not UTF-8. Those are the cases the importer has to get right, and a fixture builder that "helpfully" normalised them could not test them.
 */

/** A variable-length quantity, which is how MIDI writes every delta time. */
function vlq(value) {
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes;
}

function trackChunk(events, endTick) {
  const sorted = [...events].sort((a, b) => a.tick - b.tick);
  const body = [];
  let previous = 0;
  for (const event of sorted) {
    body.push(...vlq(event.tick - previous), ...event.bytes);
    previous = event.tick;
  }
  // End of track, always, and always last: a reader that stops at the chunk length still expects it.
  body.push(...vlq(Math.max(0, endTick - previous)), 0xff, 0x2f, 0x00);
  const length = body.length;
  return [
    0x4d, 0x54, 0x72, 0x6b, // "MTrk"
    (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff,
    ...body,
  ];
}

function withLength(bytes, text) {
  return [0xff, bytes, ...vlq(text.length), ...text];
}

/**
 * @param {object} options
 * @param {number} [options.format] 0 for one track holding every channel, 1 for one track per part.
 * @param {number} [options.division] Ticks per quarter note.
 * @param {number} [options.microsecondsPerQuarter] Tempo, as the file writes it.
 * @param {Array<{ name?: string, nameBytes?: number[], timeSignature?: { numerator: number, denominator: number }, notes?: Array<{ note: number, velocity?: number, startTicks: number, durationTicks?: number, channel?: number, releaseWithVelocityZero?: boolean }> }>} options.tracks
 * @returns {Uint8Array}
 */
export function buildMidiFile({ format = 1, division = 480, microsecondsPerQuarter, tracks = [] } = {}) {
  const chunks = [];
  let longest = 0;
  for (const track of tracks) {
    const events = [];
    if (track.nameBytes) events.push({ tick: 0, bytes: withLength(0x03, track.nameBytes) });
    else if (track.name !== undefined) events.push({ tick: 0, bytes: withLength(0x03, [...Buffer.from(track.name, "utf8")]) });
    if (track.timeSignature) {
      // `FF 58 04 <numerator> <log2 denominator> <clocks per click> <32nds per quarter>` — what a DAW writes in the conductor track.
      const power = Math.round(Math.log2(track.timeSignature.denominator));
      events.push({ tick: 0, bytes: [0xff, 0x58, 0x04, track.timeSignature.numerator, power, 24, 8] });
    }
    if (microsecondsPerQuarter !== undefined) {
      const us = microsecondsPerQuarter;
      events.push({ tick: 0, bytes: [0xff, 0x51, 0x03, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff] });
    }
    for (const note of track.notes ?? []) {
      const channel = note.channel ?? 0;
      const velocity = note.velocity ?? 100;
      events.push({ tick: note.startTicks, bytes: [0x90 | channel, note.note, velocity] });
      if (note.durationTicks !== undefined) {
        const offTick = note.startTicks + note.durationTicks;
        longest = Math.max(longest, offTick);
        // Both spellings of a note-off appear in real files, and the importer has to pair either one.
        events.push(
          note.releaseWithVelocityZero
            ? { tick: offTick, bytes: [0x90 | channel, note.note, 0] }
            : { tick: offTick, bytes: [0x80 | channel, note.note, 0] }
        );
      } else {
        longest = Math.max(longest, note.startTicks);
      }
    }
    chunks.push(...trackChunk(events, longest));
  }
  const header = [
    0x4d, 0x54, 0x68, 0x64, // "MThd"
    0x00, 0x00, 0x00, 0x06,
    (format >> 8) & 0xff, format & 0xff,
    (tracks.length >> 8) & 0xff, tracks.length & 0xff,
    (division >> 8) & 0xff, division & 0xff,
  ];
  return new Uint8Array([...header, ...chunks]);
}

/**
 * The four characters a Chinese track name written by a GBK-era program looks like when its bytes are read as Latin-1. Taken from a real file rather than invented: `明天会更好` is stored as these bytes, and a reader that assumes UTF-8 shows them as mojibake.
 */
export const GBK_TRACK_NAME_BYTES = [0xc3, 0xf7, 0xcc, 0xec, 0xbb, 0xe1, 0xb8, 0xfc, 0xba, 0xc3];
export const GBK_TRACK_NAME = "明天会更好";
