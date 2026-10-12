/**
 * Item 7: "声音与画面不同步" — the visual playhead and the audible step.
 *
 * A voice scheduled at `t` is *rendered* at `t` but reaches the speakers at
 * `t + outputLatency`, so a playhead that advances the moment `currentTime` passes the
 * scheduled time is systematically **early**. These tests pin the arithmetic that corrects
 * it, including the two cases that made the naive version wrong: a browser that reports no
 * latency (must stay exactly 0, or the offline bounce and every existing test shifts), and a
 * pathological latency (must not delay the playhead past the previous step).
 */
import { describe, expect, it } from "vitest";
import { MAX_VISUAL_LEAD_STEP_FRACTION, visualLeadSeconds } from "../audio/schedulerMath";

/** 124 BPM, 4/4, one step = a 16th. */
const STEP = 60 / 124 / 4;

const base = {
  outputLatencySec: 0,
  limiterLatencySec: 0,
  compensationMs: 0,
  stepDur: STEP,
};

describe("visualLeadSeconds", () => {
  it("is exactly zero when the browser reports no latency", () => {
    expect(visualLeadSeconds(base)).toBe(0);
    // Negative zero would compare equal but leak "-0" into a style string.
    expect(Object.is(visualLeadSeconds(base), 0)).toBe(true);
  });

  it("delays the playhead by the output latency", () => {
    const lead = visualLeadSeconds({ ...base, outputLatencySec: 0.05 });
    expect(lead).toBeCloseTo(-0.05, 6);
  });

  it("adds the master limiter's own lookahead on top of the output latency", () => {
    const lead = visualLeadSeconds({
      ...base,
      outputLatencySec: 0.02,
      limiterLatencySec: 0.005,
    });
    expect(lead).toBeCloseTo(-0.025, 6);
  });

  it("treats a positive manual trim as a further delay and a negative one as a correction", () => {
    expect(visualLeadSeconds({ ...base, compensationMs: 40 })).toBeCloseTo(-0.04, 6);
    // A user who is late can pull the picture back towards zero, but never past it.
    expect(visualLeadSeconds({ ...base, outputLatencySec: 0.02, compensationMs: -40 })).toBe(0);
  });

  it("never delays the playhead by more than half a step", () => {
    const huge = visualLeadSeconds({ ...base, outputLatencySec: 5, limiterLatencySec: 5 });
    expect(huge).toBeCloseTo(-STEP * MAX_VISUAL_LEAD_STEP_FRACTION, 6);
    // Half a step is the guarantee that the playhead still shows the step being heard.
    expect(Math.abs(huge)).toBeLessThan(STEP);
  });

  it("falls back to the uncapped sum when the step duration is unusable", () => {
    // No tempo, no cap: still a finite answer rather than NaN in a transform string.
    expect(visualLeadSeconds({ ...base, stepDur: 0, outputLatencySec: 0.03 })).toBeCloseTo(-0.03, 6);
    expect(visualLeadSeconds({ ...base, stepDur: Number.NaN, outputLatencySec: 0.03 })).toBeCloseTo(-0.03, 6);
  });

  it("ignores non-finite latencies instead of propagating NaN", () => {
    expect(visualLeadSeconds({ ...base, outputLatencySec: Number.NaN })).toBe(0);
    expect(visualLeadSeconds({ ...base, limiterLatencySec: Number.POSITIVE_INFINITY })).toBe(
      -STEP * MAX_VISUAL_LEAD_STEP_FRACTION
    );
  });

  it("scales its cap with the tempo, so a slow tempo is not held to a fast tempo's window", () => {
    const slow = visualLeadSeconds({ ...base, stepDur: 0.5, outputLatencySec: 0.2 });
    const fast = visualLeadSeconds({ ...base, stepDur: 0.05, outputLatencySec: 0.2 });
    expect(slow).toBeCloseTo(-0.2, 6); // 0.2 < 0.5/2, so uncapped
    expect(fast).toBeCloseTo(-0.025, 6); // capped at half of a 50 ms step
  });
});
