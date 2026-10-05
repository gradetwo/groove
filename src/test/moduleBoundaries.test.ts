/**
 * 🧱 **The module boundaries have a number, and it may only go down.**
 *
 * The owner's maintainability list named module boundaries alongside file sizes, duplication, dead exports and
 * documentation drift. The other four had readings in `docs/OPEN_WORK.md`; this one had none, so "the boundaries are
 * fine" was an assertion with nothing behind it. `scripts/check_module_boundaries.mjs` measures two things and this
 * holds them:
 *
 *   * **value-import cycles**: a cycle counts only when every edge imports a **value**. The first count said fourteen
 *     and eleven of those ran through `import type`, which the bundler erases — `trackInsert.ts` imports `MixTrackId`
 *     as a type, and a criterion built on fourteen would have been demanding work that changes nothing.
 *   * **direction**: `mcp/**` may import `src/**` (it reuses the app's compilers on purpose) and must never be the
 *     other way round. That number is zero and is not a ceiling to raise.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/** The gate's own reading, as JSON, from the same script CI would run. */
function reading(): { files: number; cycles: number; reverseValueDependencies: number; cycleMembers: string[] } {
  const out = execFileSync("node", ["scripts/check_module_boundaries.mjs", "--json"], { encoding: "utf8" });
  return JSON.parse(out);
}

describe("module boundaries", () => {
  it("⭐ holds: the gate itself exits zero", () => {
    const out = execFileSync("node", ["scripts/check_module_boundaries.mjs"], { encoding: "utf8" });
    expect(out).toContain("✅ module boundaries hold");
  });

  it("⭐ names every cycle, so the ceiling cannot hide a new one in a total", () => {
    const current = reading();
    // Three today, and each is named: two are `resolveMixTrackId` versus the lane compilers, one runs through the
    // project store. A fourth would be a new dependency and must be argued for rather than absorbed.
    expect({ cycles: current.cycles, named: current.cycleMembers.length }).toEqual({ cycles: 3, named: 3 });
    expect(current.reverseValueDependencies).toBe(0);
  });

  it("⭐ still measures, so an empty scan cannot pass quietly", () => {
    const current = reading();
    expect({ manyFiles: current.files > 300, hasMembers: current.cycleMembers.every((m) => m.includes("/src/")) })
      .toEqual({ manyFiles: true, hasMembers: true });
  });
});
