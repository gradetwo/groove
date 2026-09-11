import { describe, it, expect } from "vitest";
import { parseBpmRange, isBpmInRange, getBpmOverlap } from "../utils/bpm";

describe("BPM Range Utility", () => {
  it("parses unicode en-dash ranges accurately", () => {
    const res = parseBpmRange("120–128 BPM");
    expect(res.isValid).toBe(true);
    expect(res.min).toBe(120);
    expect(res.max).toBe(128);
    expect(res.average).toBe(124);
  });

  it("parses standard hyphen ranges accurately", () => {
    const res = parseBpmRange("138-142 BPM");
    expect(res.isValid).toBe(true);
    expect(res.min).toBe(138);
    expect(res.max).toBe(142);
    expect(res.average).toBe(140);
  });

  it("parses single BPM values", () => {
    const res = parseBpmRange("140 BPM");
    expect(res.isValid).toBe(true);
    expect(res.min).toBe(140);
    expect(res.max).toBe(140);
    expect(res.average).toBe(140);
  });

  it("parses complex extended range strings", () => {
    const res = parseBpmRange("65–85 BPM (130-170)");
    expect(res.isValid).toBe(true);
    expect(res.min).toBe(65);
    expect(res.max).toBe(85);
  });

  it("handles non-numeric or empty string gracefully", () => {
    const empty = parseBpmRange("");
    expect(empty.isValid).toBe(false);
    expect(empty.min).toBe(120);

    const ambient = parseBpmRange("Free Tempo / Ambient");
    expect(ambient.isValid).toBe(false);
    expect(ambient.min).toBe(120);
  });

  it("checks whether target BPM falls within range with tolerance", () => {
    expect(isBpmInRange(125, "120–128 BPM")).toBe(true);
    expect(isBpmInRange(120, "120–128 BPM")).toBe(true);
    expect(isBpmInRange(118, "120–128 BPM", 2)).toBe(true); // Within tolerance
    expect(isBpmInRange(150, "120–128 BPM")).toBe(false);

    // Single value check
    expect(isBpmInRange(140, "140 BPM")).toBe(true);
    expect(isBpmInRange(142, "140 BPM", 3)).toBe(true);
    expect(isBpmInRange(148, "140 BPM", 3)).toBe(false);
  });

  it("calculates overlap between two BPM ranges correctly", () => {
    // 120-128 and 124-135 overlap between 124 and 128
    const overlap = getBpmOverlap("120–128 BPM", "124–135 BPM");
    expect(overlap.overlaps).toBe(true);
    expect(overlap.min).toBe(124);
    expect(overlap.max).toBe(128);

    // 80-95 and 140-150 do not overlap
    const noOverlap = getBpmOverlap("80–95 BPM", "140–150 BPM");
    expect(noOverlap.overlaps).toBe(false);
  });
});
