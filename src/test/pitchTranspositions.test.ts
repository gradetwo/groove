import { describe, expect, it } from "vitest";
import { GS1_PITCH_PARAMETERS, collectTranspositions, describePitch } from "../data/pitchTruth";

/**
 * The criterion for the transposition report — the half of "one pitch truth" that makes the other halves
 * checkable, since the owner's bar is that every place a pitch can move be explicit, visible and reversible.
 *
 * It is written to fail in the direction that matters. The GS-1 parameters mix units — `OSC1_PITCH` is
 * semitones and `OSC1_DETUNE` is cents — and reading both as semitones is a hundred-fold error that no type
 * would catch. The detune case below is the one that goes red if the units are ever flattened.
 */
describe("the transposition report", () => {
  it("names each source instead of summing them into a number nobody can trace", () => {
    const report = collectTranspositions({ overridesTranspose: -12 });
    expect(report.map((item) => item.source)).toEqual(["section transpose"]);
    expect(report.map((item) => item.semitones)).toEqual([-12]);
    // Reversibility is stated rather than assumed: the model's own field can be set back.
    expect(report.every((item) => item.reversible)).toBe(true);
    expect(report[0]!.detail).toContain("src/types/song.ts:65");
    /**
     * ⭐ **One section transposition, counted once.** `song.ts:185` carries a `transpose` on `SongBar` whose own
     * docstring calls it "the section's transposition in semitones" — the same value flattened per bar. An
     * earlier version of this took it as a second input, which would have counted one transposition twice; there
     * is deliberately no such input now, and this asserts the sum of one is one.
     */
    expect(report).toHaveLength(1);
  });

  it("keeps the GS-1 units apart — semitones are semitones and cents are hundredths", () => {
    const report = collectTranspositions({ gs1Parameters: { OSC1_PITCH: 12, OSC1_DETUNE: 50 } });
    expect(report.map((item) => item.source)).toEqual(["GS-1 OSC1_PITCH", "GS-1 OSC1_DETUNE"]);
    // 12 semitones, then 50 cents = half a semitone. Reading the detune as semitones would give 50 here.
    expect(report[0]!.semitones).toBe(12);
    expect(report[1]!.semitones).toBeCloseTo(0.5, 9);

    // The same parameter reachable by numeric id, which is how the tool accepts it.
    const byId = collectTranspositions({ gs1Parameters: { "4": 25 } });
    expect(byId).toHaveLength(1);
    expect(byId[0]!.semitones).toBeCloseTo(0.25, 9);

    // MASTER_TUNE is the whole instrument and is also cents.
    const master = collectTranspositions({ gs1Parameters: { MASTER_TUNE: -35 } });
    expect(master[0]!.semitones).toBeCloseTo(-0.35, 9);
  });

  it("leaves out what is not a transposition, and says so in the table", () => {
    // PITCH_BEND_RANGE is how far a bend may travel, not a transposition: listing it would inflate a total.
    expect(GS1_PITCH_PARAMETERS.map((item) => item.id)).not.toContain(38);
    expect(collectTranspositions({ gs1Parameters: { PITCH_BEND_RANGE: 12 } })).toEqual([]);
    // A zero is not a transposition either, so a total of zero reports nothing rather than five rows of zero.
    expect(collectTranspositions({ overridesTranspose: 0, gs1Parameters: { OSC1_PITCH: 0 } })).toEqual([]);
    expect(collectTranspositions({})).toEqual([]);
  });

  it("marks the library's own tuning as one we cannot undo from here", () => {
    const report = collectTranspositions({ sfz: { tuneCents: -20, rootKey: 59 } });
    expect(report).toHaveLength(1);
    expect(report[0]!.source).toBe("SFZ tune");
    expect(report[0]!.semitones).toBeCloseTo(-0.2, 9);
    /**
     * The library is not ours to edit, so this one is reported as irreversible — which is the honest answer to
     * "可撤销" and the reason the field exists rather than being assumed true.
     */
    expect(report[0]!.reversible).toBe(false);
    // And the root key is not a transposition: it is where the sample sits, and the ratio is computed from it.
    expect(report.some((item) => item.source === "rootKey")).toBe(false);
  });

  it("reaches the report a caller reads, with the total beside the list", () => {
    const transpositions = collectTranspositions({ overridesTranspose: -12, gs1Parameters: { OSC1_DETUNE: 50 } });
    const report = describePitch({ midi: 60, transpositions });
    expect(report.midi).toBe(60);
    expect(report.frequencyHz).toBeCloseTo(261.6255653, 6);
    expect(report.totalSemitones).toBeCloseTo(-11.5, 9);
    expect(report.soundingMidi).toBeCloseTo(48.5, 9);
    expect(report.transposed).toBe(true);
    // The untransposed truth is still reported: it never moves.
    expect(report.name).toBe("C4");
    expect(report.transpositions).toHaveLength(2);
  });
});
