/**
 * ⭐ **The disc's progress bar has to keep moving for the whole record, not fill and stop.**
 *
 * Two clocks feed `loopProgress`. The engine's `readClock` returns a step **inside** the pattern (it reads
 * `getCurrentStep()`), so the original `(step + fraction) / totalSteps` was in range. The phone's clip clock is
 * different: a clip plays for its own length instead of looping a pattern, so `readClipClock` returns the step since
 * **the clip began** — and once that passes `totalSteps` the ratio clamps at 1 and the bar is pinned there.
 *
 * Measured on the reported case (chicago-house: a 16.6 s clip, 124 BPM, so one 16-step loop is 1.935 s): the bar
 * reached 100 % at **1.94 s** and stayed. The rail is labelled ∞ (loop), so it is meant to keep cycling.
 *
 * The disc's hit highlight never had this problem because it already reduced the step (`fireStep` takes
 * `clock.step % totalSteps`); the rail was the only reader that did not.
 */
import { describe, it, expect } from "vitest";
import { loopProgress } from "../mobile/vinyl/vinylMath";

/** chicago-house's own numbers, from the genre index and the clip manifest. */
const BPM = 124;
const TOTAL_STEPS = 16;
const STEP_SECONDS = 15 / BPM;

/** What the clip clock hands the rail at `seconds` into the clip. */
function clockAt(seconds: number): { step: number; fraction: number } {
  const elapsed = seconds / STEP_SECONDS;
  const step = Math.floor(elapsed);
  return { step, fraction: Math.min(1, Math.max(0, elapsed - step)) };
}

describe("the disc's progress bar", () => {
  it("⭐ keeps cycling instead of pinning at the end once the clip outruns one loop", () => {
    // Sample across the clip, well past the first 1.935 s loop.
    const samples = [0.5, 1, 1.9, 2.5, 4, 5, 8, 12, 16.6];
    const widths = samples.map((t) => {
      const { step, fraction } = clockAt(t);
      return loopProgress(step, fraction, TOTAL_STEPS);
    });

    for (const width of widths) {
      expect(width, "a progress value is a ratio").toBeGreaterThanOrEqual(0);
      expect(width).toBeLessThanOrEqual(1);
    }
    // The red reading: without the modulo every sample past the first loop sat at exactly 1.
    expect(widths.slice(3), "past the first loop the bar must not be pinned at 100 %").not.toEqual(
      widths.slice(3).map(() => 1)
    );
    expect(new Set(widths.map((w) => w.toFixed(2))).size, "and it should take several distinct positions").toBeGreaterThan(3);
  });

  it("⭐ reduces the step modulo the loop, so a later loop reads the same as the first", () => {
    // Steps 3 and 3 + 16 are the same position in a 16-step loop.
    expect(loopProgress(3, 0, TOTAL_STEPS)).toBeCloseTo(loopProgress(3 + TOTAL_STEPS, 0, TOTAL_STEPS), 10);
    expect(loopProgress(0, 0.5, TOTAL_STEPS), "half of the first step").toBeCloseTo(0.5 / TOTAL_STEPS, 10);
    expect(loopProgress(TOTAL_STEPS, 0, TOTAL_STEPS), "the top of the loop is the bottom of the next").toBeCloseTo(0, 10);
  });

  it("leaves the engine's clock exactly as it was, because its step is already in range", () => {
    for (const step of [0, 1, 7, 15]) {
      expect(loopProgress(step, 0.25, TOTAL_STEPS)).toBeCloseTo((step + 0.25) / TOTAL_STEPS, 10);
    }
  });

  it("still guards the degenerate inputs", () => {
    expect(loopProgress(5, 0.5, 0)).toBe(0);
    expect(loopProgress(5, 5, TOTAL_STEPS), "a fraction outside 0..1 is clamped").toBeLessThanOrEqual(1);
    expect(loopProgress(5, -5, TOTAL_STEPS)).toBeGreaterThanOrEqual(0);
  });
});
