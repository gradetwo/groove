import { describe, expect, it } from "vitest";
import { generateMelody } from "../../mcp/melody";

/**
 * The melody generator, checked on the four properties the evaluation asked for rather than on its notes.
 *
 * Contour-first, phrase-aligned, range-bounded and seeded: each of those is a claim a test can hold, and none of them is "it sounds good",
 * which is a listening question and belongs to a person.
 */
describe("generateMelody", () => {
  const base = { tonic: 60, mode: "major" as const, bars: 8, seed: 7 };

  it("is deterministic for a seed and different for another", () => {
    const a = generateMelody(base);
    const b = generateMelody(base);
    expect(a.pitch).toEqual(b.pitch);
    expect(a.steps).toEqual(b.steps);
    const other = generateMelody({ ...base, seed: 8 });
    expect(other.pitch).not.toEqual(a.pitch);
  });

  it("returns exactly bars × 16 steps, including at four bars where the form does not fit", () => {
    /**
     * The regression: `perPhrase` has a floor of two bars, so a four-bar request cannot hold an AABA of four phrases — and the first version
     * clamped `toStep` without checking `fromStep`, giving a **negative** copy length. `slice(0, -32)` returns the first 32 elements rather than
     * nothing, and `splice(96, 0, ...)` appended them: 96 steps for `bars: 4`, with 32 ghost copies of phrase A at the end. Eight bars and two
     * bars were both fine, which is why the existing tests missed it.
     */
    for (const bars of [2, 4, 8, 12]) {
      const melody = generateMelody({ ...base, bars });
      expect(melody.steps.length, `bars: ${bars}`).toBe(bars * 16);
      expect(melody.pitch.length).toBe(bars * 16);
      expect(melody.velocity.length).toBe(bars * 16);
      expect(melody.gate.length).toBe(bars * 16);
      // And the reported phrases must stay inside the pattern rather than past its end.
      for (const phrase of melody.phrases) {
        expect(phrase.fromStep).toBeLessThan(bars * 16);
        expect(phrase.toStep).toBeLessThanOrEqual(bars * 16);
        expect(phrase.toStep).toBeGreaterThan(phrase.fromStep);
      }
    }
  });

  it("keeps every note inside the range it reports, which is at most two octaves", () => {
    const melody = generateMelody({ ...base, range: [60, 84] });
    const sounding = melody.pitch.filter((_, index) => melody.steps[index] > 0);
    expect(sounding.length).toBeGreaterThan(0);
    for (const note of sounding) {
      expect(note).toBeGreaterThanOrEqual(melody.range[0]);
      expect(note).toBeLessThanOrEqual(melody.range[1]);
    }
    expect(melody.range[1] - melody.range[0]).toBeLessThanOrEqual(24);
  });

  it("stays in key: every note is a scale degree of the key it was given", () => {
    const major = [0, 2, 4, 5, 7, 9, 11];
    const melody = generateMelody(base);
    for (let index = 0; index < melody.pitch.length; index += 1) {
      if (melody.steps[index] <= 0) continue;
      expect(major).toContain(((melody.pitch[index] - 60) % 12 + 12) % 12);
    }
  });

  it("uses the form it says it used: AABA repeats the first phrase literally", () => {
    const melody = generateMelody({ ...base, form: "AABA" });
    expect(melody.phrases.map((phrase) => phrase.label).join("")).toBe("AABA");
    const [first, second] = melody.phrases;
    expect(melody.contour[0]).toBe(melody.contour[1]); // the same A
    // The second phrase's steps are the first's, shifted: a literal repeat, not a variation.
    const length = first.toStep - first.fromStep;
    expect(melody.pitch.slice(second.fromStep, second.fromStep + length)).toEqual(melody.pitch.slice(first.fromStep, first.fromStep + length));
  });
});
