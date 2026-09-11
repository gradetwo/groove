import { describe, it, expect } from "vitest";

// Helper replicating the meter and backbeat math from StudioView (P0-10)
export function calculateStepsPerBar(timeNum: number, timeDenom: number, resolution: "1/8" | "1/16" | "1/32" = "1/16"): number {
  const stepsPerWholeNote = resolution === "1/8" ? 8 : resolution === "1/32" ? 32 : 16;
  return Math.max(1, Math.round(timeNum * (stepsPerWholeNote / timeDenom)));
}

export function isSnareBackbeat(beatNum: number, timeNum: number, timeDenom: number): boolean {
  if (timeNum === 4 && timeDenom === 4) return beatNum === 1 || beatNum === 3;
  if (timeNum === 3 && timeDenom === 4) return beatNum === 1 || beatNum === 2;
  if (timeNum === 6 && timeDenom === 8) return beatNum === 3;
  if (timeNum === 5) return beatNum === 2 || beatNum === 4;
  if (timeNum === 7 && timeDenom === 8) return beatNum === 2 || beatNum === 5;
  if (timeNum === 2) return beatNum === 1;
  return beatNum % 2 === 1;
}

export function isKickHit(beatNum: number, timeNum: number, timeDenom: number): boolean {
  if (timeNum === 4 && timeDenom === 4) return true;
  if (timeNum === 3 && timeDenom === 4) return beatNum === 0;
  if (timeNum === 6 && timeDenom === 8) return beatNum === 0;
  if (timeNum === 5) return beatNum === 0 || beatNum === 3;
  if (timeNum === 7 && timeDenom === 8) return beatNum === 0 || beatNum === 4;
  if (timeNum === 2) return beatNum === 0;
  return beatNum === 0;
}

describe("Sequencer Meter & Odd-Meter Backbeat Calculations (P0-10)", () => {
  describe("calculateStepsPerBar", () => {
    it("computes 16 steps per bar for 4/4 at 1/16", () => {
      expect(calculateStepsPerBar(4, 4, "1/16")).toBe(16);
    });

    it("computes 12 steps per bar for 3/4 at 1/16", () => {
      expect(calculateStepsPerBar(3, 4, "1/16")).toBe(12);
    });

    it("computes 6 steps per bar for 3/8 at 1/16", () => {
      expect(calculateStepsPerBar(3, 8, "1/16")).toBe(6);
    });

    it("computes 12 steps per bar for 6/8 at 1/16", () => {
      expect(calculateStepsPerBar(6, 8, "1/16")).toBe(12);
    });

    it("computes 20 steps per bar for 5/4 at 1/16", () => {
      expect(calculateStepsPerBar(5, 4, "1/16")).toBe(20);
    });

    it("computes 14 steps per bar for 7/8 at 1/16", () => {
      expect(calculateStepsPerBar(7, 8, "1/16")).toBe(14);
    });

    it("correctly handles 1/8 resolution", () => {
      expect(calculateStepsPerBar(4, 4, "1/8")).toBe(8);
      expect(calculateStepsPerBar(3, 4, "1/8")).toBe(6);
      expect(calculateStepsPerBar(7, 8, "1/8")).toBe(7);
    });
  });

  describe("Backbeat Snare Placement in Standard & Odd Meters", () => {
    it("places backbeats on 2 and 4 in 4/4 (0-indexed beats 1 and 3)", () => {
      expect(isSnareBackbeat(0, 4, 4)).toBe(false);
      expect(isSnareBackbeat(1, 4, 4)).toBe(true);
      expect(isSnareBackbeat(2, 4, 4)).toBe(false);
      expect(isSnareBackbeat(3, 4, 4)).toBe(true);
    });

    it("places backbeats on beats 2 & 3 in 3/4 waltz", () => {
      expect(isSnareBackbeat(0, 3, 4)).toBe(false);
      expect(isSnareBackbeat(1, 3, 4)).toBe(true);
      expect(isSnareBackbeat(2, 3, 4)).toBe(true);
    });

    it("places backbeat on 2nd dotted-quarter beat in 6/8 (eighth index 3)", () => {
      expect(isSnareBackbeat(0, 6, 8)).toBe(false);
      expect(isSnareBackbeat(1, 6, 8)).toBe(false);
      expect(isSnareBackbeat(2, 6, 8)).toBe(false);
      expect(isSnareBackbeat(3, 6, 8)).toBe(true);
      expect(isSnareBackbeat(4, 6, 8)).toBe(false);
      expect(isSnareBackbeat(5, 6, 8)).toBe(false);
    });

    it("places backbeats on beats 3 and 5 in 5/4 (3+2 meter, beatNum 2 and 4)", () => {
      expect(isSnareBackbeat(0, 5, 4)).toBe(false);
      expect(isSnareBackbeat(1, 5, 4)).toBe(false);
      expect(isSnareBackbeat(2, 5, 4)).toBe(true);
      expect(isSnareBackbeat(3, 5, 4)).toBe(false);
      expect(isSnareBackbeat(4, 5, 4)).toBe(true);
    });

    it("places backbeats on beats 2 and 5 in 7/8 (2+2+3 meter, beatNum 2 and 5)", () => {
      expect(isSnareBackbeat(0, 7, 8)).toBe(false);
      expect(isSnareBackbeat(1, 7, 8)).toBe(false);
      expect(isSnareBackbeat(2, 7, 8)).toBe(true);
      expect(isSnareBackbeat(3, 7, 8)).toBe(false);
      expect(isSnareBackbeat(4, 7, 8)).toBe(false);
      expect(isSnareBackbeat(5, 7, 8)).toBe(true);
      expect(isSnareBackbeat(6, 7, 8)).toBe(false);
    });
  });

  describe("Kick Placement in Standard & Odd Meters", () => {
    it("places kick on every beat in 4/4 (four-on-the-floor)", () => {
      expect(isKickHit(0, 4, 4)).toBe(true);
      expect(isKickHit(1, 4, 4)).toBe(true);
      expect(isKickHit(2, 4, 4)).toBe(true);
      expect(isKickHit(3, 4, 4)).toBe(true);
    });

    it("places kick on 3+2 group downbeats in 5/4 (beats 1 & 4, beatNum 0 and 3)", () => {
      expect(isKickHit(0, 5, 4)).toBe(true);
      expect(isKickHit(1, 5, 4)).toBe(false);
      expect(isKickHit(2, 5, 4)).toBe(false);
      expect(isKickHit(3, 5, 4)).toBe(true);
      expect(isKickHit(4, 5, 4)).toBe(false);
    });

    it("places kick on 2+2+3 group downbeats in 7/8 (beats 1 & 5, beatNum 0 and 4)", () => {
      expect(isKickHit(0, 7, 8)).toBe(true);
      expect(isKickHit(1, 7, 8)).toBe(false);
      expect(isKickHit(2, 7, 8)).toBe(false);
      expect(isKickHit(3, 7, 8)).toBe(false);
      expect(isKickHit(4, 7, 8)).toBe(true);
      expect(isKickHit(5, 7, 8)).toBe(false);
      expect(isKickHit(6, 7, 8)).toBe(false);
    });
  });
});
