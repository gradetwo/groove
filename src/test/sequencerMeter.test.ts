import { describe, it, expect } from "vitest";
import {
  calculateGroupSize,
  calculateStepsPerBar,
  getTimeSignatureDenominator,
  getTimeSignatureNumerator,
  stepsPerWholeNote,
} from "../utils/meter";

/**
 * E-02: this file used to re-implement `calculateStepsPerBar` / `isSnareBackbeat`
 * / `isKickHit` locally and then assert on those copies. Grep proved that none of
 * the three existed anywhere in `src/`, so the suite asserted nothing about
 * shipped code.
 *
 * The helpers that actually ship now live in `src/utils/meter.ts` and are
 * imported here. `isSnareBackbeat` / `isKickHit` have no shipped counterpart at
 * all: the meter-aware Smart Fill lived inline in `StudioView.tsx` until v1.11.0,
 * when it was replaced by the fixed 4/8-step `SMART_FILL_TRACK` reducer in
 * `src/features/sequencer/useSequencerStore.ts` (already covered by
 * `sequencerStore.test.ts`). Those self-fulfilling cases are deleted rather than
 * kept against local copies.
 *
 * F-11: the extraction also surfaced a live regression — `calculateStepsPerBar`
 * ignored the time-signature numerator and returned steps per BEAT (4/4 at 1/16
 * => 4, so a 16-step pattern rendered as four bars). That is fixed in
 * `src/utils/meter.ts`; the expectations below pin the correct per-bar values.
 */
describe("Sequencer meter math (P0-10 / E-02 / F-11)", () => {
  describe("getTimeSignatureNumerator / getTimeSignatureDenominator", () => {
    it("reads both halves of a time signature string", () => {
      expect(getTimeSignatureNumerator("4/4")).toBe(4);
      expect(getTimeSignatureNumerator("3/4")).toBe(3);
      expect(getTimeSignatureNumerator("6/8")).toBe(6);
      expect(getTimeSignatureNumerator("7/8")).toBe(7);
      expect(getTimeSignatureDenominator("4/4")).toBe(4);
      expect(getTimeSignatureDenominator("3/4")).toBe(4);
      expect(getTimeSignatureDenominator("6/8")).toBe(8);
      expect(getTimeSignatureDenominator("7/8")).toBe(8);
    });

    it("falls back to 4 for a malformed signature", () => {
      expect(getTimeSignatureDenominator("")).toBe(4);
      expect(getTimeSignatureDenominator("4")).toBe(4);
      expect(getTimeSignatureDenominator("4/x")).toBe(4);
      expect(getTimeSignatureNumerator("")).toBe(4);
      expect(getTimeSignatureNumerator("/4")).toBe(4);
      expect(getTimeSignatureNumerator("x/4")).toBe(4);
    });
  });

  describe("stepsPerWholeNote / calculateGroupSize", () => {
    it("maps resolution to steps per whole note", () => {
      expect(stepsPerWholeNote("1/8")).toBe(8);
      expect(stepsPerWholeNote("1/16")).toBe(16);
      expect(stepsPerWholeNote("1/32")).toBe(32);
    });

    it("preserves StudioView's visual group size", () => {
      expect(calculateGroupSize("1/8")).toBe(4);
      expect(calculateGroupSize("1/16")).toBe(4);
      expect(calculateGroupSize("1/32")).toBe(8);
    });
  });

  describe("calculateStepsPerBar (F-11 regression fix)", () => {
    it("counts every beat of the bar, not just the denominator", () => {
      expect(calculateStepsPerBar("4/4", "1/16")).toBe(16);
      expect(calculateStepsPerBar("3/4", "1/16")).toBe(12);
      expect(calculateStepsPerBar("5/4", "1/16")).toBe(20);
      expect(calculateStepsPerBar("2/4", "1/16")).toBe(8);
    });

    it("handles compound and odd meters", () => {
      expect(calculateStepsPerBar("3/8", "1/16")).toBe(6);
      expect(calculateStepsPerBar("6/8", "1/16")).toBe(12);
      expect(calculateStepsPerBar("7/8", "1/16")).toBe(14);
      expect(calculateStepsPerBar("9/8", "1/16")).toBe(18);
    });

    it("honours the 1/8 and 1/32 resolutions", () => {
      expect(calculateStepsPerBar("4/4", "1/8")).toBe(8);
      expect(calculateStepsPerBar("3/4", "1/8")).toBe(6);
      expect(calculateStepsPerBar("7/8", "1/8")).toBe(7);
      expect(calculateStepsPerBar("4/4", "1/32")).toBe(32);
      expect(calculateStepsPerBar("7/8", "1/32")).toBe(28);
    });

    it("never returns zero (clamped to a minimum of 1)", () => {
      // 1/128 at 1/32 is 0.25 steps per bar -> clamped to 1.
      expect(calculateStepsPerBar("1/128", "1/32")).toBe(1);
      // A zero/missing numerator falls back to 4, and 1/64 still clamps to 1.
      expect(calculateStepsPerBar("0/4", "1/16")).toBe(16);
      expect(calculateStepsPerBar("1/64", "1/16")).toBe(1);
    });

    it("keeps 4/4 at exactly one bar for the default 16-step pattern", () => {
      const stepsPerBar = calculateStepsPerBar("4/4", "1/16");
      expect(Math.ceil(16 / stepsPerBar)).toBe(1);
    });
  });
});
