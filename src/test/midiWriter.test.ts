import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeMidi } from "../../scripts/lib/midi.mjs";

/**
 * The MIDI writer the sfizz oracle needs — proved by reading its own output back, event by event.
 *
 * `sfizz_render` renders from a MIDI file and cannot be told a note on the command line, so a `.mid` is part of the apparatus. The first fixture was 42 bytes typed
 * into a probe; a comparison built on untested apparatus measures the apparatus. So this walks the file the same way a reader would and checks the bytes that
 * matter: the division, the tempo, and the note-on/note-off ticks that decide **when** the oracle plays.
 */
const parse = (bytes: Buffer) => {
  const assertMagic = (offset: number, magic: string) => {
    expect(bytes.toString("ascii", offset, offset + 4)).toBe(magic);
  };
  assertMagic(0, "MThd");
  const headerLength = bytes.readUInt32BE(4);
  const format = bytes.readUInt16BE(8);
  const tracks = bytes.readUInt16BE(10);
  const division = bytes.readUInt16BE(12);
  const trackStart = 8 + headerLength;
  assertMagic(trackStart, "MTrk");
  const trackLength = bytes.readUInt32BE(trackStart + 4);

  let at = trackStart + 8;
  const end = at + trackLength;
  const events: Array<{ tick: number; kind: string; bytes: number[] }> = [];
  let tick = 0;
  const readVar = () => {
    let value = 0;
    for (;;) {
      const byte = bytes[at++];
      value = (value << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
  };
  while (at < end) {
    tick += readVar();
    const status = bytes[at];
    if (status === 0xff) {
      const type = bytes[at + 1];
      const length = bytes[at + 2];
      events.push({ tick, kind: type === 0x51 ? "tempo" : type === 0x2f ? "end" : "meta", bytes: [...bytes.subarray(at, at + 3 + length)] });
      at += 3 + length;
    } else {
      const length = status & 0xf0 ? 2 : 1;
      const kind = (status & 0xf0) === 0x90 ? (bytes[at + 2] > 0 ? "note-on" : "note-off") : (status & 0xf0) === 0x80 ? "note-off" : "other";
      events.push({ tick, kind, bytes: [...bytes.subarray(at, at + 1 + length)] });
      at += 1 + length;
    }
  }
  return { format, tracks, division, events };
};

describe("writeMidi", () => {
  it("writes a readable format 0 file with the tempo and the division a reader needs", () => {
    const path = join(mkdtempSync(join(tmpdir(), "midi-")), "one.mid");
    const written = writeMidi(path, { bpm: 120, notes: [{ note: 60, velocity: 100, startSeconds: 0, durationSeconds: 0.25 }] });
    const parsed = parse(readFileSync(path));
    expect(parsed.format).toBe(0);
    expect(parsed.tracks).toBe(1);
    expect(parsed.division).toBe(480);
    const tempo = parsed.events.find((event) => event.kind === "tempo")!;
    expect(tempo.tick).toBe(0);
    // 120 bpm = 500000 µs per quarter, as three bytes.
    expect(tempo.bytes.slice(3)).toEqual([0x07, 0xa1, 0x20]);
    expect(parsed.events[parsed.events.length - 1].kind).toBe("end");
    expect(written.ticksPerSecond).toBe(960);
  });

  it("places the note where the seconds say, and ends it after the duration", () => {
    const path = join(mkdtempSync(join(tmpdir(), "midi-")), "two.mid");
    // At 120 bpm, 960 ticks per second: a note at 0.5 s for 0.25 s is on at 480 and off at 720.
    writeMidi(path, { bpm: 120, notes: [{ note: 64, velocity: 90, startSeconds: 0.5, durationSeconds: 0.25 }] });
    const parsed = parse(readFileSync(path));
    const on = parsed.events.find((event) => event.kind === "note-on")!;
    const off = parsed.events.find((event) => event.kind === "note-off")!;
    expect(on.tick).toBe(480);
    expect(off.tick).toBe(720);
    expect(on.bytes.slice(1)).toEqual([64, 90]);
  });

  it("orders a repeated pitch so the previous note ends before the next begins", () => {
    const path = join(mkdtempSync(join(tmpdir(), "midi-")), "repeat.mid");
    writeMidi(path, {
      bpm: 120,
      notes: [
        { note: 60, startSeconds: 0, durationSeconds: 0.25 },
        { note: 60, startSeconds: 0.25, durationSeconds: 0.25 },
      ],
    });
    const kinds = parse(readFileSync(path)).events.map((event) => `${event.kind}@${event.tick}`);
    // on, off, on, off — never on, on, off, off, which would cut the first note short at the same tick.
    expect(kinds.filter((kind) => kind.startsWith("note"))).toEqual(["note-on@0", "note-off@240", "note-on@240", "note-off@480"]);
  });

  it("clamps a note outside the MIDI range rather than writing an unreadable byte", () => {
    const path = join(mkdtempSync(join(tmpdir(), "midi-")), "clamp.mid");
    writeMidi(path, { notes: [{ note: 200, velocity: 200, startSeconds: 0, durationSeconds: 0.1 }] });
    const on = parse(readFileSync(path)).events.find((event) => event.kind === "note-on")!;
    expect(on.bytes.slice(1)).toEqual([127, 127]);
  });
});

/**
 * Control changes — added because a real library needed them, and **proved here because an untested feature is the thing this workstream keeps criticising.**
 *
 * The experiment they were built for came out negative (the `virtuosity_drums` kit stayed silent with its own `set_cc*` values sent as CC events, and sfizz's log showed
 * `NumVoices: 0` rather than a volume problem), so the feature's justification is not that it fixed that — it is that MIDI export needs CCs anyway and a writer that
 * silently drops them would be a trap.
 */
describe("writeMidi control changes", () => {
  it("writes a CC event where the seconds say, before the notes at the same tick", () => {
    const path = join(mkdtempSync(join(tmpdir(), "midi-")), "cc.mid");
    // At 120 bpm, 960 ticks per second: a CC at 0.25 s lands on tick 240, and it must precede a note that starts there.
    writeMidi(path, {
      bpm: 120,
      controls: [{ cc: 101, value: 127, atSeconds: 0.25 }],
      notes: [{ note: 38, velocity: 100, startSeconds: 0.25, durationSeconds: 0.25 }],
    });
    const parsed = parse(readFileSync(path));
    const kinds = parsed.events.map((event) => `${event.kind}@${event.tick}`);
    // The CC is written as a control event and sorts before the note-on at the same tick.
    expect(kinds).toContain("other@240");
    expect(kinds.indexOf("other@240")).toBeLessThan(kinds.indexOf("note-on@240"));
    const cc = parsed.events.find((event) => event.kind === "other" && event.tick === 240)!;
    // 0xB0 status, then the controller and the value.
    expect(cc.bytes.slice(0, 3)).toEqual([0xb0, 101, 127]);
  });

  it("clamps a controller and its value rather than writing an unreadable byte", () => {
    const path = join(mkdtempSync(join(tmpdir(), "midi-")), "clampcc.mid");
    writeMidi(path, { controls: [{ cc: 999, value: -5, atSeconds: 0 }], notes: [] });
    const cc = parse(readFileSync(path)).events.find((event) => event.kind === "other")!;
    expect(cc.bytes.slice(0, 3)).toEqual([0xb0, 127, 0]);
  });
});
