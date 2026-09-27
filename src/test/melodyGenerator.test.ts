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
