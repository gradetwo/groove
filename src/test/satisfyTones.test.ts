import { describe, expect, it } from "vitest";
import { satisfyTones, validateProsody } from "../../mcp/prosody";

/**
 * The generation half of the 倒字 constraint (sixth report, item VII).
 *
 * The criterion is deliberately **self-checking**: the repaired melody must satisfy the *same* validator a caller would use, so "generation respects the tones"
 * and "the checker agrees" cannot drift apart. The strongest form of that is a property over many adversarial inputs rather than a handful of fixtures.
 */
const TONES = [1, 2, 3, 4, 0, 5];

describe("satisfyTones", () => {
  it("leaves a melody that is already correct untouched", () => {
    // A level tone on a level movement, a rising tone on a rise, a falling tone on a fall: nothing to repair. (The first attempt put a level tone on a
    // four-semitone rise, which the checker correctly refused — a level tone tolerates only movement below twice the threshold.)
    const pitches = [60, 60, 64, 56];
    const tones = [1, 2, 2, 4];
    const result = satisfyTones(pitches, tones);
    expect(result.adjusted).toBe(0);
    expect(result.pitches).toEqual(pitches);
    expect(result.remaining).toBe(0);
  });

  it("repairs the melodies that reversal-prone inputs produce, for two hundred seeded shapes", () => {
    // A deterministic pseudo-random walk, because a property is worth more than a fixture here: any surviving reversal fails the test.
    let seed = 12345;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    let repairedSome = 0;
    for (let trial = 0; trial < 200; trial += 1) {
      const length = 2 + rand(14);
      const tones = Array.from({ length }, () => TONES[rand(TONES.length)]!);
      const pitches = Array.from({ length }, () => 48 + rand(24));
      const before = validateProsody({ tones, pitches, threshold: 2 }).warnings.length;
      const result = satisfyTones(pitches, tones, { range: [36, 84] });
      const after = validateProsody({ tones, pitches: result.pitches, threshold: 2 }).warnings.length;
      expect(after, `trial ${trial}: ${JSON.stringify({ tones, pitches, out: result.pitches })}`).toBe(0);
      expect(result.remaining).toBe(0);
      if (before > 0) repairedSome += 1;
    }
    // And the corpus really did contain reversals, or the property above would be vacuous.
    expect(repairedSome).toBeGreaterThan(20);
  });

  it("holds the note when the range will not allow the direction asked for", () => {
    // A falling tone on a **rising** interval, with no room below: the honest repair is to repeat the note, because no movement is never a reversal.
    // (The first attempt used a one-semitone rise, which the checker reads as "level" — and a falling tone on a level movement is not a reversal at all.)
    const result = satisfyTones([36, 40], [1, 4], { range: [36, 36] });
    expect(result.pitches).toEqual([36, 36]);
    expect(result.remaining).toBe(0);
  });

  it("is a no-op for an empty or single-note melody, which has no interval to reverse", () => {
    expect(satisfyTones([], []).pitches).toEqual([]);
    expect(satisfyTones([60], [4]).pitches).toEqual([60]);
    expect(satisfyTones([60], [4]).remaining).toBe(0);
  });

  it("respects the same threshold the validator uses, rather than inventing one", () => {
    // With a threshold of 5, a four-semitone fall is "level" and cannot reverse a falling tone.
    const pitches = [60, 56];
    const tones = [1, 4];
    expect(validateProsody({ tones, pitches, threshold: 5 }).warnings).toEqual([]);
    expect(satisfyTones(pitches, tones, { threshold: 5 }).adjusted).toBe(0);
  });
});
