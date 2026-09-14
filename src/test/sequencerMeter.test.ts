import { describe, it, expect } from "vitest";
import {
  calculateGroupSize,
  calculateStepsPerBar,
  getTimeSignatureDenominator,
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
 * KNOWN DEFECT (documented here, deliberately NOT fixed by this test-hardening
 * change): `calculateStepsPerBar` ignores the time-signature numerator, so it
 * returns steps per BEAT. v1.3.5 shipped
 * `timeNum * (stepsPerWholeNote / timeDenom)`; the v1.11.0 refactor dropped
 * `timeNum`. The expectations below pin the current shipped behaviour so that a
 * future fix surfaces as a deliberate diff instead of silent drift.
 */
describe("Sequencer meter math (P0-10 / E-02)", () => {
  describe("getTimeSignatureDenominator", () => {
    it("reads the denominator from a time signature string", () => {
      expect(getTimeSignatureDenominator("4/4")).toBe(4);
      expect(getTimeSignatureDenominator("3/4")).toBe(4);
      expect(getTimeSignatureDenominator("6/8")).toBe(8);
      expect(getTimeSignatureDenominator("7/8")).toBe(8);
    });

    it("falls back to 4 for a malformed signature", () => {
      expect(getTimeSignatureDenominator("")).toBe(4);
      expect(getTimeSignatureDenominator("4")).toBe(4);
      expect(getTimeSignatureDenominator("4/x")).toBe(4);
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

  describe("calculateStepsPerBar (current shipped behaviour)", () => {
    it("returns steps per beat at 1/16: only the denominator matters", () => {
      // The numerator is ignored, so 4/4, 3/4 and 5/4 all resolve to 4.
      expect(calculateStepsPerBar("4/4", "1/16")).toBe(4);
      expect(calculateStepsPerBar("3/4", "1/16")).toBe(4); // mathematically 12 if the numerator counted
      expect(calculateStepsPerBar("5/4", "1/16")).toBe(4);
    });

    it("scales inversely with the denominator", () => {
      expect(calculateStepsPerBar("3/8", "1/16")).toBe(2);
      expect(calculateStepsPerBar("6/8", "1/16")).toBe(2);
      expect(calculateStepsPerBar("7/8", "1/16")).toBe(2);
    });

    it("honours the 1/8 and 1/32 resolutions", () => {
      expect(calculateStepsPerBar("4/4", "1/8")).toBe(2);
      expect(calculateStepsPerBar("3/4", "1/8")).toBe(2);
      expect(calculateStepsPerBar("7/8", "1/8")).toBe(1);
      expect(calculateStepsPerBar("4/4", "1/32")).toBe(8);
      expect(calculateStepsPerBar("7/8", "1/32")).toBe(4);
    });

    it("never returns zero (clamped to a minimum of 1)", () => {
      expect(calculateStepsPerBar("1/128", "1/32")).toBe(1);
    });

    it("documents the 3/4 regression instead of hiding it behind a local copy", () => {
      // v1.3.5 shipped `timeNum * (stepsPerWholeNote / timeDenom)` => 12 for 3/4.
      // Current StudioView drops `timeNum`, so the shipped value is 4.
      expect(calculateStepsPerBar("3/4", "1/16")).not.toBe(12);
      expect(calculateStepsPerBar("3/4", "1/16")).toBe(4);
    });
  });
});
