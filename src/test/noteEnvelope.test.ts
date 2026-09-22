/**
 * The envelope's ordering guarantee, and the regression that made it necessary.
 *
 * The old schedule was three chained ramps with a fixed 0.22 s initial drop and a variable gate, so any note
 * shorter than 0.22 s asked the release ramp to end before the drop ramp did. Web Audio cuts the earlier ramp
 * at its start time and jumps the value — a step discontinuity, which is a click. These tests pin both the
 * guarantee and the arithmetic of "how wrong was it", so the class of bug cannot come back through a different
 * voice or a different constant.
 */
import { describe, it, expect } from "vitest";
import { MIN_DECLICK_SEC, noteEnvelopeTimes, scheduleNoteEnvelope } from "../audio/noteEnvelope";

/** Gates a genre library actually produces: a 1/32 stab at 170 BPM up to a held pad. */
const GATES = [0.01, 0.02, 0.044, 0.125, 0.25, 0.5, 1.2, 2.4];

describe("note envelope scheduling", () => {
  it("keeps every stage in order for every gate length", () => {
    for (const gate of GATES) {
      const times = noteEnvelopeTimes(10, gate);
      expect(times.attackAt, `gate ${gate}`).toBeGreaterThan(10);
      expect(times.dropAt, `gate ${gate}`).toBeGreaterThan(times.attackAt);
      expect(times.releaseAt, `gate ${gate}`).toBeGreaterThan(times.dropAt);
      expect(times.stopAt, `gate ${gate}`).toBeGreaterThan(times.releaseAt);
    }
  });

  it("always leaves a real de-click release", () => {
    for (const gate of GATES) {
      const times = noteEnvelopeTimes(0, gate);
      expect(times.releaseAt - times.dropAt, `gate ${gate}`).toBeGreaterThanOrEqual(MIN_DECLICK_SEC - 1e-9);
    }
  });

  it("keeps the articulation: the note is silent by its own gate (when the gate allows room)", () => {
    for (const gate of [0.05, 0.125, 0.25, 0.5, 1.2, 2.4]) {
      const times = noteEnvelopeTimes(0, gate);
      // Silence lands at the gate, not later: a staccato note must stay staccato.
        // The note reaches silence at its own gate (within a millisecond), so articulation is preserved.
      expect(Math.abs(times.releaseAt - gate), `gate ${gate}`).toBeLessThan(0.002);
      // …and the oscillator keeps running past it, never stopping at the discontinuity itself.
      expect(times.stopAt).toBeGreaterThan(times.releaseAt);
    }
  });

  it("shrinks the drop rather than overlapping the release when the gate is short", () => {
    const short = noteEnvelopeTimes(0, 0.05);
    const long = noteEnvelopeTimes(0, 1.0);
    expect(short.dropAt - short.attackAt).toBeLessThan(long.dropAt - long.attackAt);
    // The old formula: drop ended at a fixed 0.22 s while the release was pinned to a 0.05 s gate.
    const oldDropAt = 0.006 + 0.22;
    expect(short.releaseAt).toBeLessThan(oldDropAt);
    expect(short.dropAt).toBeLessThan(short.releaseAt);
  });

  it("applies a monotonic ramp with no step in it", () => {
    const events: Array<{ type: string; value: number; time: number }> = [];
    const param = {
      setValueAtTime: (value: number, time: number) => events.push({ type: "set", value, time }),
      linearRampToValueAtTime: (value: number, time: number) => events.push({ type: "linear", value, time }),
      exponentialRampToValueAtTime: (value: number, time: number) => events.push({ type: "exp", value, time }),
    };
    const times = scheduleNoteEnvelope(param, { now: 5, peak: 0.8, gateSec: 0.125 });

    expect(events.map((event) => event.type)).toEqual(["set", "linear", "exp", "exp"]);
    // Times strictly increase, so no ramp is truncated by the next one — the actual defect.
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i].time, `event ${i}`).toBeGreaterThan(events[i - 1].time);
    }
    // Values rise to the peak and then fall, never jump back up.
    expect(events[0].value).toBeCloseTo(0.0001, 6);
    expect(events[1].value).toBeCloseTo(0.8, 6);
    expect(events[2].value).toBeLessThan(events[1].value);
    expect(events[3].value).toBeLessThan(events[2].value);
    expect(events[3].time).toBeCloseTo(times.releaseAt, 9);
  });

  it("never asks an exponential ramp for zero", () => {
    // Browsers throw on a target of 0 (and on a negative peak from a broken caller), so the floor is clamped.
    const values: number[] = [];
    const param = {
      setValueAtTime: (value: number) => values.push(value),
      linearRampToValueAtTime: (value: number) => values.push(value),
      exponentialRampToValueAtTime: (value: number) => values.push(value),
    };
    scheduleNoteEnvelope(param, { now: 0, peak: 0, gateSec: 0.1 });
    for (const value of values) expect(value).toBeGreaterThan(0);
  });
});
