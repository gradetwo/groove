import { describe, it, expect } from "vitest";
import { usesClipAudition } from "../utils/clipAudition";

/**
 * ⭐ **The owner's rule as a truth table** (2026-10-11): a `full` audition plays the pre-generated clip; a `drums`
 * audition keeps the live engine, because the measured manifest carries only the full mix and a drums clip cannot exist.
 * The table is checked rather than the prose, so no surface can quietly answer it differently.
 */
describe("which audition mode can play a pre-cut clip", () => {
  it("⭐ plays the clip for the full mix", () => {
    expect(usesClipAudition("full")).toBe(true);
  });

  it("⭐ and keeps the live engine for drums", () => {
    expect(usesClipAudition("drums")).toBe(false);
  });
});
