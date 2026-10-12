/**
 * Real MIDI files, on the machine that has them.
 *
 * The owner supplied nine files — format 0 and format 1, one to eight tracks, 96 to 960 ticks per quarter, names in **UTF-8 and GBK** — and they are **not in this repository** (they are other people's arrangements). So this file reads them from a directory outside the checkout and **skips loudly when it is not there**, exactly as `realLibrary.test.ts` does for a library it does not vendor.
 *
 *   GROOVE_MIDI_CORPUS   the directory to read, defaulting to `~/music/midi-corpus/midi`
 *
 * Every expectation below was produced by running the files, not estimated — including the two that name the encoding bug this corpus found.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { importMidiToPattern, parseMidiFile } from "../audio/MidiImporter";

const DIR = process.env.GROOVE_MIDI_CORPUS ?? join(homedir(), "music", "midi-corpus", "midi");
const present = existsSync(DIR);

const files = () => (present ? readdirSync(DIR).filter((name) => name.toLowerCase().endsWith(".mid")) : []);
const read = (name: string) => {
  const bytes = readFileSync(join(DIR, name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

describe.skipIf(!present)("a directory of real MIDI files", () => {
  it("says where it looked, so a skip is not mistaken for a pass", () => {
    // The same rule the real-library criterion follows: a checkout without the corpus is a checkout without it, not a green result.
    console.log(`   MIDI corpus : ${files().length} file(s) read from ${DIR}`);
    expect(files().length).toBeGreaterThan(0);
  });

  it("parses every one of them, and every one of them has notes", () => {
    /**
     * The blunt criterion, and the one that would have caught a crash: a real corpus is where a parser meets running status, format 0, eight tracks and a division of 96. Before this, nothing in the suite had ever read a file it did not build itself.
     */
    for (const name of files()) {
      const parsed = parseMidiFile(read(name));
      expect(parsed.notes.length, `${name} produced no notes`).toBeGreaterThan(0);
      expect(parsed.tracksCount, `${name} claims no tracks`).toBeGreaterThan(0);
      expect(parsed.division, `${name} has no division`).toBeGreaterThan(0);
      expect(parsed.bpm, `${name} has no tempo`).toBeGreaterThan(0);
    }
  });

  it("builds a playable pattern from each, with the notes on it", () => {
    /**
     * The result is `{ pattern, bpm, notesFound, trackNames }`: the pattern is a `DrumPattern`, which is what the studio's own importer hands the engine.
     */
    for (const name of files()) {
      const result = importMidiToPattern(read(name), { totalSteps: 64 });
      expect(result.notesFound, `${name} read no notes`).toBeGreaterThan(0);
      expect(result.pattern.tracks.length, `${name} produced no tracks`).toBeGreaterThan(0);
      const stepsOn = result.pattern.tracks.reduce((sum, track) => sum + track.steps.filter((value) => value !== 0).length, 0);
      expect(stepsOn, `${name} produced no steps`).toBeGreaterThan(0);
      // The tempo and the names come from the same read, so a pattern that plays at the wrong speed is caught here rather than by ear.
      expect(result.bpm, `${name} has no tempo`).toBeGreaterThan(0);
      expect(Array.isArray(result.trackNames), `${name} reported no names`).toBe(true);
    }
  });

  it("decodes a GBK name, measured on a real file", () => {
    /**
     * ⭐ `result.mid` is a GBK file: read byte for byte its first track name was `Ã÷Ìì»á¸üºÃ`, which is 明天会更好, and its `±´Ë¾`, `¹Ä`, `¸ÖÇÙ` are 贝司, 鼓, 钢琴. This is the criterion the encoding fix was written for.
     */
    const names = parseMidiFile(read("result.mid")).trackNames;
    expect(names[0]).toBe("明天会更好");
    expect(names.join(" ")).toContain("贝司");
    expect(names.join(" ")).toContain("鼓");
  });

  it("decodes a UTF-8 name, measured on a real file", () => {
    // The other encoding, from the other half of the corpus: the same name read byte for byte was `é¢ç´`.
    const names = parseMidiFile(read("call-of-silence-animenz-arr-attack-on-titan-hiroyuki-sawano-钢琴.mid")).trackNames;
    expect(names).toContain("钢琴");
  });

  it("reads a format 0 file, which is the one shape that has no track list to fall back on", () => {
    // `THE BEATLES.Blackbird K.mid` is format 0 with one track and 96 ticks per quarter — the smallest division in the corpus.
    const parsed = parseMidiFile(read("THE BEATLES.Blackbird K.mid"));
    expect(parsed.format).toBe(0);
    expect(parsed.tracksCount).toBe(1);
    expect(parsed.division).toBe(96);
    expect(parsed.notes.length).toBeGreaterThan(0);
  });

  it("reads an eight-track file, the widest in the corpus", () => {
    // Multi-instrument files are the case the owner named, and eight tracks is where an off-by-one in the chunk walk shows up.
    const parsed = parseMidiFile(read("result.mid"));
    expect(parsed.tracksCount).toBe(8);
    expect(parsed.trackNames.length).toBeGreaterThan(3);
  });

  it("keeps a name that a real file pads with NULs readable", () => {
    // `result.mid` pads these; the NULs are the file's, not part of anybody's track name.
    const names = parseMidiFile(read("result.mid")).trackNames;
    expect(names.some((name) => name.includes("\u0000"))).toBe(false);
  });
});
