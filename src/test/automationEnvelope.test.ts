/**
 * ⭐ **An envelope has to be flat outside its points and straight between them, or a fade is unusable.**
 *
 * `docs/DAW_GAP_ARRANGEMENT.md` §8 ranks this fourth and gives the reason in one line: without it, "渐强只能靠分段或不做".
 * The model and the reading are the part that everything else stands on — a lane view, an edit command and a renderer
 * all ask the same question ("what is this parameter at beat X"), so the answer is pinned here rather than through any
 * of them.
 *
 * The cases are deliberately the ones that make a fade wrong rather than the ones that make it work:
 *
 *   - **outside the points, the curve holds.** Extrapolating past the last point is how a fade-out keeps going below
 *     zero and becomes a negative gain — silence that then inverts;
 *   - **between the points, the line is straight in the parameter's unit.** Two points must read as the same ramp the
 *     mixer's own fader draws;
 *   - **unsorted input, and two points at one beat, are the caller's sloppiness, not a curve that turns twice.**
 */
import { describe, it, expect } from "vitest";
import {
  AUTOMATION_DEFAULT_VALUE,
  clampGainDb,
  isAutomated,
  samplePerStep,
  valueAt,
  type AutomationPoint,
} from "../data/automation";

/** A fade from unity at beat 0 to −12 dB at beat 8, then back up by beat 16 — the shape a person draws first. */
const FADE: AutomationPoint[] = [
  { atBeats: 0, value: 0 },
  { atBeats: 8, value: -12 },
  { atBeats: 16, value: 0 },
];

describe("an automation envelope", () => {
  it("⭐ holds its value outside the points instead of running away", () => {
    expect(valueAt(FADE, -5), "before the curve begins").toBe(0);
    expect(valueAt(FADE, 0)).toBe(0);
    expect(valueAt(FADE, 16)).toBe(0);
    // The trap: a straight extrapolation would answer −24 dB here, and −60 further out.
    expect(valueAt(FADE, 24), "after the curve ends it stays").toBe(0);
  });

  it("⭐ is a straight line in the parameter's own unit between two points", () => {
    expect(valueAt(FADE, 4), "half of 0 → −12").toBeCloseTo(-6, 10);
    expect(valueAt(FADE, 2)).toBeCloseTo(-3, 10);
    expect(valueAt(FADE, 12), "half of −12 → 0").toBeCloseTo(-6, 10);
    // A single point is a constant, not a curve with a direction.
    expect(valueAt([{ atBeats: 4, value: -3 }], 0)).toBe(-3);
    expect(valueAt([{ atBeats: 4, value: -3 }], 99)).toBe(-3);
  });

  it("⭐ treats an empty lane as 'not automated' rather than as a failure", () => {
    expect(valueAt([], 7)).toBe(AUTOMATION_DEFAULT_VALUE);
    expect(isAutomated(undefined)).toBe(false);
    expect(isAutomated({ parameter: "gainDb", points: [] })).toBe(false);
    expect(isAutomated({ parameter: "gainDb", points: [{ atBeats: 0, value: 0 }] })).toBe(true);
  });

  it("⭐ sorts unsorted input and lets the later point win where two share a beat", () => {
    const messy: AutomationPoint[] = [
      { atBeats: 8, value: -12 },
      { atBeats: 0, value: 0 },
      { atBeats: 4, value: -99 },
      { atBeats: 4, value: -6 },
    ];
    expect(valueAt(messy, 4), "the later of two points at one beat is the one that counts").toBe(-6);
    expect(valueAt(messy, 8)).toBe(-12);
    expect(valueAt(messy, 2), "and the sorted line still reads correctly").toBeCloseTo(-3, 10);
    // A non-finite point is dropped rather than poisoning the whole curve to NaN.
    expect(valueAt([...messy, { atBeats: Number.NaN, value: 5 }], 8)).toBe(-12);
  });

  it("⭐ samples per step on the grid the caller names, not on an assumed one", () => {
    // Four steps of two beats land on beats 0, 2, 4, 6 — the descending half of the fade only.
    expect(samplePerStep(FADE, 4, 2)).toEqual([0, -3, -6, -9]);
    // Nine steps of two beats cover the whole curve, so the return leg is visible too.
    const whole = samplePerStep(FADE, 9, 2);
    expect(whole[4], "beat 8, the bottom of the fade").toBe(-12);
    expect(whole[8], "beat 16, back to unity").toBe(0);
    const eighths = samplePerStep(FADE, 4, 1);
    expect(eighths[1], "one beat in").toBeCloseTo(-1.5, 10);
    expect(samplePerStep([], 3, 1), "an empty lane samples as the default").toEqual([0, 0, 0]);
  });

  it("clamps a gain envelope to the range the mixer itself honours", () => {
    expect(clampGainDb(99)).toBe(6);
    expect(clampGainDb(-99)).toBe(-60);
    expect(clampGainDb(-6)).toBe(-6);
  });
});
