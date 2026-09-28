/**
 * Write a minimal Standard MIDI File — the one part of the sfizz oracle that had to be built rather than found.
 *
 * `sfizz_render` renders **from a MIDI file**; it has no way to be told a note on the command line. So an SFZ comparison needs a `.mid`, and writing one by hand
 * inside a probe (which is how the first fixture was made) is exactly the kind of untested apparatus that turns a comparison into a measurement of the harness. This
 * writes format 0, one track, tempo plus note events — enough for a deterministic one-note-per-region comparison, and small enough to be read back by a test.
 */
import { writeFileSync } from "node:fs";

const TICKS_PER_QUARTER = 480;

/** Variable-length quantity, which is how MIDI encodes a delta time. */
function variableLength(value) {
  if (value < 0) throw new Error(`a delta time cannot be negative (got ${value})`);
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes;
}

/**
 * @param {string} path
 * @param {{ bpm?: number, notes: Array<{ note: number, velocity?: number, startSeconds: number, durationSeconds: number, channel?: number }> }} score
 */
export function writeMidi(path, score) {
  const bpm = score.bpm ?? 120;
  const ticksPerSecond = (bpm / 60) * TICKS_PER_QUARTER;
  const events = [];

  // One tempo meta event at tick 0, so a reader knows what a tick is worth without assuming 120 bpm.
  const microsecondsPerQuarter = Math.round(60_000_000 / bpm);
  events.push({
    tick: 0,
    bytes: [0xff, 0x51, 0x03, (microsecondsPerQuarter >> 16) & 0xff, (microsecondsPerQuarter >> 8) & 0xff, microsecondsPerQuarter & 0xff],
    order: 0,
  });

  for (const note of score.notes) {
    const channel = note.channel ?? 0;
    const startTick = Math.round(note.startSeconds * ticksPerSecond);
    const endTick = startTick + Math.max(1, Math.round(note.durationSeconds * ticksPerSecond));
    const pitch = Math.max(0, Math.min(127, Math.round(note.note)));
    const velocity = Math.max(1, Math.min(127, Math.round(note.velocity ?? 100)));
    // A note-off sorts before a note-on at the same tick, so a repeated pitch does not get cut short by its own predecessor.
    events.push({ tick: startTick, bytes: [0x90 | channel, pitch, velocity], order: 1 });
    events.push({ tick: endTick, bytes: [0x80 | channel, pitch, 64], order: 0 });
  }

  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const track = [];
  let previousTick = 0;
  for (const event of events) {
    track.push(...variableLength(event.tick - previousTick), ...event.bytes);
    previousTick = event.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00); // end of track

  const header = Buffer.alloc(14);
  header.write("MThd", 0, "ascii");
  header.writeUInt32BE(6, 4);
  header.writeUInt16BE(0, 8); // format 0
  header.writeUInt16BE(1, 10); // one track
  header.writeUInt16BE(TICKS_PER_QUARTER, 12);

  const trackHeader = Buffer.alloc(8);
  trackHeader.write("MTrk", 0, "ascii");
  trackHeader.writeUInt32BE(track.length, 4);

  writeFileSync(path, Buffer.concat([header, trackHeader, Buffer.from(track)]));
  return { bytes: 14 + 8 + track.length, ticksPerSecond };
}
