import { describe, expect, it } from "vitest";
import { romanToChords } from "../../mcp/library";

/**
 * The harmony gap, hand-checked against the maths rather than against the function.
 *
 * `vi-IV-I-V` in C major, with roots an octave below the tonic: A minor `[57, 60, 64]`, F major `[53, 57, 60]`, C major `[48, 52, 55]`,
 * G major `[55, 59, 62]`. The numbers are written out in the test because a fixture generated from the implementation proves nothing.
 */
describe("romanToChords", () => {
  it("renders vi-IV-I-V in C major as the diatonic chords", () => {
    const { chords, warnings } = romanToChords("vi-IV-I-V", { tonic: 60, mode: "major" });
    expect(warnings).toEqual([]);
    expect(chords).toEqual([
      [57, 60, 64],
      [53, 57, 60],
      [48, 52, 55],
      [55, 59, 62],
    ]);
  });

  it("uses the minor scale in a minor key, so the same numeral is a different chord", () => {
    const major = romanToChords("i", { tonic: 60, mode: "major" });
    const minor = romanToChords("i", { tonic: 60, mode: "minor" });
    expect(major.chords[0]).toEqual([48, 52, 55]); // C major
    expect(minor.chords[0]).toEqual([48, 51, 55]); // C minor
  });

  it("reads sevenths, diminished chords and accidentals, and warns about nonsense instead of guessing", () => {
    expect(romanToChords("V7", { tonic: 60 }).chords[0]).toHaveLength(4);
    const dim = romanToChords("vii°", { tonic: 60 }).chords[0];
    expect(dim).toEqual([59, 62, 65]); // B4 D5 F5 — diatonic already, so `°` adds no accidental
    const flat = romanToChords("bVII", { tonic: 60 }).chords[0];
    expect(flat[0]).toBe(58); // Bb, an octave above the tonic's register root
    const { chords, warnings } = romanToChords("vi-QQQ-I", { tonic: 60 });
    expect(warnings).toHaveLength(1);
    expect(chords).toHaveLength(2);
  });
});
