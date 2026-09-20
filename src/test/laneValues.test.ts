/**
 * U10: one scale per lane dimension, and the keyboard on top of it.
 *
 * Two things are worth pinning here. First the *pointer* numbers: the four `ratioToValue` formulas
 * were moved out of `VelocityLane` and are asserted against the values a drag used to produce, so a
 * "cleanup" that silently changes what painting does fails. Second the *keyboard*: every dimension
 * has to be steppable and clamped, and ratchet has to stay inside its own vocabulary (1, 2, 3, 4, 8)
 * rather than becoming a 1..8 range just because the arrow key is a number.
 */
import { describe, it, expect } from "vitest";
import {
  LANE_SPECS,
  RATCHET_VALUES,
  laneKeyboardIntent,
  stepLaneValue,
} from "../features/sequencer/laneValues";
import type { ParameterDimension } from "../features/sequencer/stepParameters";

const NONE = { shift: false, meta: false, ctrl: false };
const DIMENSIONS: ParameterDimension[] = ["velocity", "gate", "probability", "ratchet"];

describe("lane values · the pointer's numbers, unchanged", () => {
  it("velocity is round(ratio * 127) clamped to 1..127", () => {
    const v = LANE_SPECS.velocity;
    expect(v.ratioToValue(0)).toBe(1);
    expect(v.ratioToValue(0.5)).toBe(64);
    expect(v.ratioToValue(0.375)).toBe(48);
    expect(v.ratioToValue(1)).toBe(127);
    expect(v.ratioToValue(-3)).toBe(1);
    expect(v.ratioToValue(9)).toBe(127);
  });

  it("gate is round((0.1 + ratio * 1.9) * 10) / 10", () => {
    const g = LANE_SPECS.gate;
    expect(g.ratioToValue(0)).toBe(0.1);
    expect(g.ratioToValue(0.5)).toBe(1.1);
    expect(g.ratioToValue(1)).toBe(2);
  });

  it("probability is round(ratio * 100), ratchet is the lane's existing thresholds", () => {
    const p = LANE_SPECS.probability;
    expect([0, 0.375, 0.5, 1].map((r) => p.ratioToValue(r))).toEqual([0, 38, 50, 100]);

    const r = LANE_SPECS.ratchet;
    expect([0, 0.19, 0.2, 0.39, 0.4, 0.64, 0.65, 0.84, 0.85, 1].map((x) => r.ratioToValue(x))).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 8, 8,
    ]);
  });

  it("draws the same bar heights the component drew", () => {
    expect(LANE_SPECS.velocity.heightPercent(127)).toBe(100);
    expect(LANE_SPECS.velocity.heightPercent(0)).toBe(5);
    expect(LANE_SPECS.gate.heightPercent(2)).toBe(100);
    expect(LANE_SPECS.gate.heightPercent(0)).toBe(5);
    expect(LANE_SPECS.probability.heightPercent(100)).toBe(100);
    expect(LANE_SPECS.probability.heightPercent(0)).toBe(5);
    expect(LANE_SPECS.ratchet.heightPercent(8)).toBe(100);
    expect(LANE_SPECS.ratchet.heightPercent(1)).toBe(12.5);
  });

  it("formats each dimension the way the readout did", () => {
    expect(LANE_SPECS.velocity.format(100)).toBe("100");
    expect(LANE_SPECS.gate.format(0.8)).toBe("80%");
    expect(LANE_SPECS.probability.format(100)).toBe("100%");
    expect(LANE_SPECS.ratchet.format(8)).toBe("8x");
  });
});

describe("lane values · the spec is a real scale", () => {
  it("keeps its preset inside its own range and its step positive", () => {
    for (const dim of DIMENSIONS) {
      const spec = LANE_SPECS[dim];
      expect(spec.min, dim).toBeLessThanOrEqual(spec.preset);
      expect(spec.max, dim).toBeGreaterThanOrEqual(spec.preset);
      expect(spec.step, dim).toBeGreaterThan(0);
      expect(spec.largeStep, dim).toBeGreaterThanOrEqual(spec.step);
    }
  });

  it("reaches both ends of every dimension from the two ratio extremes", () => {
    // A dimension whose 0 and 1 ratios did not land on min/max would leave a corner of the fader
    // that the pointer can never paint — which is exactly how gate's 0.1 floor went unnoticed.
    for (const dim of DIMENSIONS) {
      const spec = LANE_SPECS[dim];
      expect(spec.ratioToValue(0), dim).toBe(spec.min);
      expect(spec.ratioToValue(1), dim).toBe(spec.max);
    }
  });
});

describe("lane keyboard · stepping one value", () => {
  it("steps continuous dimensions by their own step and clamps at the ends", () => {
    const v = LANE_SPECS.velocity;
    expect(stepLaneValue(v, 100, 1)).toBe(101);
    expect(stepLaneValue(v, 100, -1)).toBe(99);
    expect(stepLaneValue(v, 100, 1, true)).toBe(110);
    expect(stepLaneValue(v, 127, 1)).toBe(127);
    expect(stepLaneValue(v, 1, -1)).toBe(1);

    const g = LANE_SPECS.gate;
    // The float trap this exists for: 0.8 + 0.1 is 0.9000000000000001 in binary floating point.
    expect(stepLaneValue(g, 0.8, 1)).toBe(0.9);
    expect(stepLaneValue(g, 2, 1)).toBe(2);
    expect(stepLaneValue(g, 1, -1, true)).toBe(0.5);
  });

  it("walks ratchet's own vocabulary instead of treating 1..8 as a range", () => {
    const r = LANE_SPECS.ratchet;
    expect(stepLaneValue(r, 1, 1)).toBe(2);
    expect(stepLaneValue(r, 4, 1)).toBe(8);
    expect(stepLaneValue(r, 1, 1, true)).toBe(3);
    expect(stepLaneValue(r, 4, 1, true)).toBe(8);
    expect(stepLaneValue(r, 8, 1)).toBe(8);
    expect(stepLaneValue(r, 1, -1)).toBe(1);
    // A value from an imported pattern that is not in the list snaps first, so stepping never
    // invents a ratchet the engine has no definition for.
    expect(stepLaneValue(r, 5, 1)).toBe(8);
    expect(RATCHET_VALUES).toEqual([1, 2, 3, 4, 8]);
  });
});

describe("lane keyboard · key mapping", () => {
  const bounds = { count: 16 };
  const v = LANE_SPECS.velocity;

  it("Up/Down (and PageUp/PageDown, Shift) change the value", () => {
    expect(laneKeyboardIntent("ArrowUp", NONE, 3, 100, v, bounds)).toEqual({
      kind: "value",
      value: 101,
    });
    expect(laneKeyboardIntent("ArrowDown", { ...NONE, shift: true }, 3, 100, v, bounds)).toEqual({
      kind: "value",
      value: 90,
    });
    expect(laneKeyboardIntent("PageUp", NONE, 3, 100, v, bounds)).toEqual({
      kind: "value",
      value: 110,
    });
    expect(laneKeyboardIntent("PageDown", NONE, 3, 100, v, bounds)).toEqual({
      kind: "value",
      value: 90,
    });
  });

  it("Left/Right move between columns and stop at the ends", () => {
    expect(laneKeyboardIntent("ArrowRight", NONE, 3, 100, v, bounds)).toEqual({
      kind: "cursor",
      index: 4,
    });
    expect(laneKeyboardIntent("ArrowLeft", NONE, 3, 100, v, bounds)).toEqual({
      kind: "cursor",
      index: 2,
    });
    expect(laneKeyboardIntent("ArrowLeft", NONE, 0, 100, v, bounds)).toEqual({
      kind: "cursor",
      index: 0,
    });
    expect(laneKeyboardIntent("ArrowRight", NONE, 15, 100, v, bounds)).toEqual({
      kind: "cursor",
      index: 15,
    });
    expect(laneKeyboardIntent("Home", NONE, 9, 100, v, bounds)).toEqual({ kind: "cursor", index: 0 });
    expect(laneKeyboardIntent("End", NONE, 9, 100, v, bounds)).toEqual({
      kind: "cursor",
      index: 15,
    });
  });

  it("leaves keys it does not own completely alone", () => {
    // ⌘/Ctrl combinations belong to the browser; Enter/Delete/letters belong to whatever else is
    // listening. A lane that swallowed them would break the app around it.
    for (const key of ["Enter", " ", "Delete", "Backspace", "a", "Tab", "Escape"]) {
      expect(laneKeyboardIntent(key, NONE, 3, 100, v, bounds), key).toBeNull();
    }
    expect(laneKeyboardIntent("ArrowUp", { ...NONE, meta: true }, 3, 100, v, bounds)).toBeNull();
    expect(laneKeyboardIntent("ArrowUp", { ...NONE, ctrl: true }, 3, 100, v, bounds)).toBeNull();
  });
});
