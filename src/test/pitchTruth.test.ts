import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTE_CONVENTION,
  centsBetween,
  describePitch,
  isMidiNote,
  noteFrequency,
  noteName,
  type NoteConvention,
} from "../data/pitchTruth";

/**
 * The criterion for the one-pitch-truth module.
 *
 * It is written to be asked in **both** directions, per this project's rule. The positive half is the spec's
 * own test list — note 60 is C4 at 261.6256 Hz, note 69 is A4 at 440 Hz. The half that matters more is the
 * negative one: **a display convention must not be able to reach a frequency**, so the frequency assertions
 * are made across all three conventions and fail if anyone ever wires the label into the arithmetic.
 */
describe("one pitch truth", () => {
  it("gives note 60 as C4 at 261.6256 Hz, and note 69 as A4 at 440 Hz, by default", () => {
    expect(DEFAULT_NOTE_CONVENTION).toBe("C4");
    expect(noteName(60)).toBe("C4");
    expect(noteName(69)).toBe("A4");
    expect(noteFrequency(60)).toBeCloseTo(261.6255653, 6);
    expect(noteFrequency(69)).toBe(440);
    // The spec's own calibration pair, so a reader can see the octave at a glance: C4 ≈ 261.6, C5 ≈ 523.3.
    expect(noteFrequency(72)).toBeCloseTo(523.2511306, 6);
  });

  it("spells every pitch class, and counts octaves the way scientific notation does", () => {
    expect(noteName(61)).toBe("C#4");
    expect(noteName(59)).toBe("B3");
    // MIDI 0 is C-1 in scientific pitch notation, so the range's ends are named rather than clipped.
    expect(noteName(0)).toBe("C-1");
    expect(noteName(127)).toBe("G9");
    expect(isMidiNote(0)).toBe(true);
    expect(isMidiNote(127)).toBe(true);
    expect(isMidiNote(128)).toBe(false);
    expect(isMidiNote(60.5)).toBe(false);
    expect(isMidiNote("60")).toBe(false);
  });

  it("changes the name across conventions and never the frequency — which is the whole point", () => {
    const conventions: NoteConvention[] = ["C4", "C3", "C5"];
    const names = conventions.map((convention) => noteName(60, convention));
    // Three conventions, three labels, one note.
    expect(names).toEqual(["C4", "C3", "C5"]);

    /**
     * ⭐ **The assertion that keeps display out of the arithmetic.** If a convention is ever fed into
     * `noteFrequency`, or an octave offset is ever applied to a sounding note, this fails for the two
     * conventions that are not the default — and it is the reason the module exists.
     */
    for (const convention of conventions) {
      expect(noteFrequency(60)).toBeCloseTo(261.6255653, 6);
      const report = describePitch({ midi: 60, convention });
      expect(report.name).toBe(noteName(60, convention));
      expect(report.frequencyHz).toBeCloseTo(261.6255653, 6);
      expect(report.soundingFrequencyHz).toBeCloseTo(261.6255653, 6);
      // And the convention travels *with* the name, so a reader is never shown a bare label.
      expect(report.convention).toBe(convention);
    }
  });

  it("lists transpositions instead of summing them into a number nobody can trace", () => {
    const report = describePitch({
      midi: 60,
      transpositions: [
        { source: "track transpose", semitones: -12, reversible: true, detail: "song.ts:90" },
        { source: "SFZ tune", semitones: 0.02, reversible: false, detail: "tune=+20 cents" },
      ],
    });
    expect(report.transposed).toBe(true);
    expect(report.totalSemitones).toBeCloseTo(-11.98, 6);
    expect(report.soundingMidi).toBeCloseTo(48.02, 6);
    expect(report.soundingFrequencyHz).toBeCloseTo(noteFrequency(48.02), 6);
    // The untransposed number and its frequency are still reported: the truth does not move.
    expect(report.midi).toBe(60);
    expect(report.frequencyHz).toBeCloseTo(261.6255653, 6);
    // Every source is present and named, and reversibility is stated rather than assumed.
    expect(report.transpositions.map((item) => item.source)).toEqual(["track transpose", "SFZ tune"]);
    expect(report.transpositions.every((item) => typeof item.reversible === "boolean")).toBe(true);

    const plain = describePitch({ midi: 60 });
    expect(plain.transposed).toBe(false);
    expect(plain.totalSemitones).toBe(0);
    expect(plain.transpositions).toEqual([]);
  });

  it("reports the sound source's own account, in the shape render_instrument_note already returns", () => {
    /**
     * These are the numbers this session measured on the violin, not invented ones: `render_instrument_note`
     * for midi 60 returned `samplePath` `VlnEns_susVib_B2_v2.wav`, `rootKey` 59 and `ratio`
     * `1.0594630943592953`, which is exactly `2^(1/12)` — one semitone between the sample's root and the note,
     * and the audible fundamental measured at 196.0 Hz for that file.
     */
    const report = describePitch({
      midi: 60,
      source: { samplePath: "Strings/Violin Section/susVib/VlnEns_susVib_B2_v2.wav", rootKey: 59, ratio: 2 ** (1 / 12) },
    });
    expect(report.source?.rootKey).toBe(59);
    expect(report.source?.ratioCents).toBeCloseTo(100, 6);
    // The sample's own root sounds at B3, and the ratio is what carries it to the note.
    expect(report.source?.rootFrequencyHz).toBeCloseTo(246.9416506, 6);
    expect(centsBetween(report.source!.rootFrequencyHz, report.frequencyHz)).toBeCloseTo(100, 6);

    // Without a source the field is absent rather than filled with a guess.
    expect(describePitch({ midi: 60 }).source).toBeUndefined();
  });

  it("treats micro-tuning as cents in the exponent, not as a re-tuning of the formula", () => {
    /**
     * Pinned on both a semitone and an octave, because writing this assertion is where I got it wrong once:
     * +100 cents is **one semitone** above A4 (466.1638 Hz, A#4) and +1200 cents is the octave (880 Hz).
     * The first version of this line expected 880 for +100 and the criterion failed, correctly.
     */
    expect(noteFrequency(69, 100)).toBeCloseTo(466.1637615, 6);
    expect(noteFrequency(69, -100)).toBeCloseTo(415.3046976, 6);
    expect(noteFrequency(69, 1200)).toBeCloseTo(880, 6);
    expect(noteFrequency(69, -1200)).toBeCloseTo(220, 6);
    expect(noteFrequency(60, 0)).toBeCloseTo(noteFrequency(60), 12);
    expect(centsBetween(noteFrequency(60), noteFrequency(60, 1))).toBeCloseTo(1, 6);
  });
});
