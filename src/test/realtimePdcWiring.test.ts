import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The realtime half of PDC, pinned as a **source contract**.
 *
 * Realtime cannot be measured the way the offline renderer can — there is no rendered buffer to inspect, and the CI probes all render
 * offline, so they would not see this change at all. What can be pinned is the wiring, and this file does that in the same idiom the
 * offline-ceiling test uses: read the transport's start block and assert the shape that makes the compensation correct.
 *
 * It is a weaker check than a measurement, and that is stated rather than hidden: what it holds is that the transport schedules earlier by
 * the limiter's latency unless the user has chosen a value, which is the connection the realtime path was missing.
 */
const source = readFileSync("src/audio/AudioEngine.ts", "utf8");

describe("realtime PDC wiring", () => {
  it("prefers a user's compensation and otherwise uses the master limiter's own latency", () => {
    expect(source).toMatch(/this\.latencyCompensationMs\s*>\s*0\s*\?\s*this\.latencyCompensationMs\s*\/\s*1000\s*:\s*this\.getMasterLimiterLatencySeconds\(\)/);
    expect(source).toMatch(/Math\.max\(0,\s*Math\.min\(requestedCompensationSec,\s*0\.035\)\)/);
  });

  it("schedules earlier by it, on both the count-in and the ordinary path", () => {
    // The count-in's metronome and its first step, and the ordinary first step: all three advance by the compensation.
    expect(source).toMatch(/playMetronome\(now\s*\+\s*0\.035\s*-\s*compensationSec\s*\+\s*b\s*\*\s*beatSec/);
    expect(source).toMatch(/this\.nextStepTime\s*=\s*now\s*\+\s*0\.035\s*-\s*compensationSec\s*\+\s*4\s*\*\s*beatSec/);
    expect(source).toMatch(/this\.nextStepTime\s*=\s*now\s*\+\s*0\.035\s*-\s*compensationSec;/);
  });

  it("keeps the 35 ms margin and the ±100 ms clamp that bound what the compensation can be", () => {
    // The margin is an order of magnitude larger than the default lookahead (3 ms, asserted in the limiter's own test rather than read
    // from here), so the default case stays comfortably in the future. A user's value is clamped to 100 ms, which **exceeds** the margin —
    // so the subtraction is bounded by the margin too, and that bound is what this case holds. Writing this test is how the edge was found:
    // the first version of the wiring would have scheduled the first step in the past for a large manual value.
    expect(source).toMatch(/now \+ 0\.035 - compensationSec/);
    expect(source).toMatch(/Math\.max\(-100,\s*Math\.min\(100,\s*ms\)\)/);
  });
});
