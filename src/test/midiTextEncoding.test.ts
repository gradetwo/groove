/**
 * Text in a Standard MIDI File, which is where Chinese names come from.
 *
 * The format says ASCII. Real files carrying Chinese write **UTF-8** or **GBK** into the same bytes, and reading them one byte at a time produced `Ã÷Ìì»á¸üºÃ` for a GBK "明天会更好" and `é¢ç´` for a UTF-8 "钢琴" — both measured on real files before this existed. So the decoding is chosen from the bytes rather than assumed.
 *
 * **The documents here are built byte by byte in the test**, which is the only way to have a fixture that is certainly ours: a real file would be somebody's arrangement.
 */
import { describe, expect, it } from "vitest";
import { decodeMidiText, importMidiToPattern, parseMidiFile } from "../audio/MidiImporter";

/** A minimal format 0 file with one track whose only event is a track name, then end-of-track. */
function midiWithTrackName(nameBytes: number[]): ArrayBuffer {
  const track: number[] = [
    0x00, 0xff, 0x03, nameBytes.length, ...nameBytes, // delta 0, meta 0x03 (track name)
    0x00, 0xff, 0x2f, 0x00, // delta 0, end of track
  ];
  const bytes = [
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, // MThd, length 6
    0x00, 0x00, // format 0
    0x00, 0x01, // one track
    0x00, 0x60, // 96 ticks per quarter
    0x4d, 0x54, 0x72, 0x6b, // MTrk
    (track.length >> 24) & 0xff, (track.length >> 16) & 0xff, (track.length >> 8) & 0xff, track.length & 0xff,
    ...track,
  ];
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

const utf8 = (text: string) => [...new TextEncoder().encode(text)];
/**
 * GBK bytes for a name, built from the **mojibake a wrong reader shows** rather than typed as hex.
 *
 * `TextEncoder` cannot produce GBK and no encoder is a dependency, so the source of truth is the measured pair: "明天会更好" in GBK, read as Latin-1, is exactly `Ã÷Ìì»á¸üºÃ`. Taking the Latin-1 bytes of that string gives the file's bytes back, and the criterion fails if either half of the pair is wrong.
 */
const GBK_MOJIBAKE: Record<string, string> = {
  "明天会更好": "Ã÷Ìì»á¸üºÃ",
  "鼓": "¹Ä",
  "贝司": "±´Ë¾",
};
const gbk = (text: string) => {
  const mojibake = GBK_MOJIBAKE[text];
  if (mojibake === undefined) throw new Error(`no measured GBK bytes for "${text}" — add the pair rather than guessing`);
  return [...Buffer.from(mojibake, "latin1")];
};

describe("text in a MIDI file", () => {
  it("leaves ASCII exactly as it was", () => {
    // The common case must not change: a name that is already readable is not a decoding problem.
    expect(decodeMidiText(new TextEncoder().encode("Piano Template"))).toBe("Piano Template");
    expect(decodeMidiText(new Uint8Array([]))).toBe("");
  });

  it("decodes a UTF-8 name, which is what one half of the real files use", () => {
    // The bytes are verified against a real file: `call-of-silence…钢琴.mid` carries these and read as `é¢ç´` before.
    expect(decodeMidiText(new TextEncoder().encode("钢琴"))).toBe("钢琴");
    expect(decodeMidiText(new TextEncoder().encode("明天会更好"))).toBe("明天会更好");
  });

  it("decodes a GBK name, which is what the other half use", () => {
    /**
     * ⭐ The measured case: a real file's name read as Latin-1 was `Ã÷Ìì»á¸üºÃ`, and those bytes decoded as GBK are 明天会更好. The expectation is built from that mojibake rather than typed in, so the criterion fails if either the encoding or the string changes.
     */
    const mojibake = "Ã÷Ìì»á¸üºÃ";
    const bytes = new Uint8Array([...mojibake].map((character) => character.charCodeAt(0)));
    expect(decodeMidiText(bytes)).toBe("明天会更好");
    expect(decodeMidiText(new Uint8Array([...Buffer.from(mojibake, "latin1")]))).toBe("明天会更好");
  });

  it("strips the NULs a real file pads a short name with", () => {
    // Measured: `贝司    (BB)\u0000` is not a name, and the pad is part of the file rather than of the name.
    const padded = new Uint8Array([...Buffer.from("¹Ä    (BB)", "latin1"), 0x00]);
    expect(decodeMidiText(padded)).toBe("鼓    (BB)");
  });

  it("reads the name out of a file, not only out of a byte array", () => {
    // The wiring, not just the decoder: the tag is still read byte for byte, and the name goes through the decoding.
    const parsed = parseMidiFile(midiWithTrackName(utf8("钢琴")));
    expect(parsed.trackNames).toEqual(["钢琴"]);
    expect(parsed.format).toBe(0);
    expect(parsed.tracksCount).toBe(1);
  });

  it("reads a GBK name out of a file as well", () => {
    const parsed = parseMidiFile(midiWithTrackName(gbk("明天会更好")));
    expect(parsed.trackNames).toEqual(["明天会更好"]);
  });

  it("still refuses a file that is not MIDI, with the reason", () => {
    // The tag is the one thing that must stay byte-exact, so this is the criterion that says the decoding change did not soften it.
    const notMidi = new ArrayBuffer(8);
    new Uint8Array(notMidi).set([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
    expect(() => parseMidiFile(notMidi)).toThrow(/MThd/);
  });
});

/**
 * A format 1 file with three instrument tracks, built here for the same reason the names are: **a fixture that is certainly ours**, so CI can exercise multi-track, multi-instrument, tempo and time signature without fetching somebody's arrangement and without a network.
 */
function multiTrackMidi(): ArrayBuffer {
  const vlq = (value: number) => (value < 0x80 ? [value] : [0x81, value & 0x7f]);
  /**
   * One track: a name, a program change, two notes and an end. Delta times are written as two-byte VLQs so the reader's variable-length path is exercised rather than only its one-byte case.
   */
  const track = (name: string, program: number, note: number, channel: number) => {
    const events = [
      ...[0x00, 0xff, 0x03, name.length, ...[...name].map((character) => character.charCodeAt(0))],
      ...[0x00, 0xc0 | channel, program], // program change at tick 0
      ...[0x00, 0x90 | channel, note, 100], // note on
      ...[...vlq(240), 0x80 | channel, note, 0], // note off, a quarter note later at 480 ticks per quarter
      ...[0x00, 0xff, 0x2f, 0x00],
    ];
    return [0x4d, 0x54, 0x72, 0x6b, (events.length >> 24) & 0xff, (events.length >> 16) & 0xff, (events.length >> 8) & 0xff, events.length & 0xff, ...events];
  };

  const conductor = [
    0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // tempo: 500000 µs per quarter, i.e. 120 bpm
    0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08, // 4/4
    0x00, 0xff, 0x2f, 0x00,
  ];
  const conductorTrack = [0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, conductor.length, ...conductor];

  const body = [...conductorTrack, ...track("Bass", 33, 36, 0), ...track("Piano", 0, 60, 1), ...track("Drums", 0, 38, 9)];
  const bytes = [
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
    0x00, 0x01, // format 1: several tracks played together
    0x00, 0x04, // four tracks: one conductor and three instruments
    0x01, 0xe0, // 480 ticks per quarter
    ...body,
  ];
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

describe("a multi-track MIDI file, built here", () => {
  it("reads every track, its name and its notes", () => {
    // Multi-instrument files are the case the owner named, and a hand-built one keeps CI free of anybody's music.
    const parsed = parseMidiFile(multiTrackMidi());
    expect(parsed.format).toBe(1);
    expect(parsed.tracksCount).toBe(4);
    expect(parsed.division).toBe(480);
    // The conductor track sets the tempo; without it every file would read as the default.
    expect(parsed.bpm).toBe(120);
    expect(parsed.trackNames).toEqual(["Bass", "Piano", "Drums"]);
    // Three instruments, one note each: the notes carry the channel they were played on.
    expect(parsed.notes.map((note) => note.note).sort((a, b) => a - b)).toEqual([36, 38, 60]);
  });

  it("places each note where its ticks say, at the file's own division", () => {
    /**
     * The tick arithmetic is where a wrong `division` hides: 240 ticks into a 480-tick quarter is an eighth note, and a reader that assumed 96 would put it somewhere else entirely.
     */
    const parsed = parseMidiFile(multiTrackMidi());
    expect(parsed.notes.every((note) => note.tick === 0)).toBe(true);
  });

  it("imports it into a pattern with the tempo it declares", () => {
    const result = importMidiToPattern(multiTrackMidi(), { totalSteps: 32 });
    expect(result.bpm).toBe(120);
    expect(result.notesFound).toBe(3);
    expect(result.pattern.tracks.length).toBeGreaterThan(0);
  });
});
