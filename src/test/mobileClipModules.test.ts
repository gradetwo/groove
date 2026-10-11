import { describe, it, expect } from "vitest";
import { usesClipPlayback } from "../mobile/mobileModules";

/**
 * ⭐ **The owner's rule, pinned.** Every phone module plays the pre-cut MP3 except 即兴 (jam) and 探索 (explore), where
 * hearing and editing the live engine is the point. A truth table, so a future module cannot quietly default to the engine.
 */
describe("which phone modules play the clip", () => {
  it("⭐ plays the clip everywhere but jam and explore", () => {
    expect(usesClipPlayback("home")).toBe(true);
    expect(usesClipPlayback("challenge")).toBe(true);
    expect(usesClipPlayback("more")).toBe(true);
  });
  it("⭐ and keeps the live engine for jam and explore", () => {
    expect(usesClipPlayback("jam")).toBe(false);
    expect(usesClipPlayback("explore")).toBe(false);
  });
});
