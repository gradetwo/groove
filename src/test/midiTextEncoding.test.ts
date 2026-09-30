/**
 * Text in a Standard MIDI File, which is where Chinese names come from.
 *
 * The format says ASCII. Real files carrying Chinese write **UTF-8** or **GBK** into the same bytes, and reading them one byte at a time produced `Ã÷Ìì»á¸üºÃ` for a GBK "明天会更好" and `é¢ç´` for a UTF-8 "钢琴" — both measured on real files before this existed. So the decoding is chosen from the bytes rather than assumed.
 *
 * **The documents here are built byte by byte in the test**, which is the only way to have a fixture that is certainly ours: a real file would be somebody's arrangement.
 */
import { describe, expect, it } from "vitest";
import { decodeMidiText, parseMidiFile } from "../audio/MidiImporter";

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
