/**
 * 📐 **The duplicated-logic budget only moves down.**
 *
 * Measured 2026-10-05 00:45 over `mcp/**` and `src/**` (excluding the data tables, whose repetition is
 * structural): **47** maximal blocks of twelve or more identical consecutive lines that are not pure
 * imports, **23** of them inside one file — which is where a missing function hides — **24** across
 * files, longest **25** lines, and **3** at twenty-four lines or more.
 *
 * ⚠️ Two numbers circulate for this metric. An earlier probe counted **291** because it recorded a
 * block for every pair of matching start positions and so counted nested and overlapping duplicates
 * several times; this one marks the positions it has already accounted for, so it counts distinct
 * blocks. The drop from 291 to 47 is a change of definition, **not** a repair, and the ranking of the
 * worst offenders is identical under both.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

type Measure = {
  blocks: number; sameFile: number; crossFile: number; longest: number; atLeast24: number; top: string[];
};

const CAP: Measure = { blocks: 47, sameFile: 23, crossFile: 24, longest: 25, atLeast24: 3, top: [] };

function measure(): Measure {
  const out = execFileSync("node", ["scripts/check_duplication.mjs"], { encoding: "utf8" });
  return JSON.parse(out.slice(0, out.lastIndexOf("}") + 1)) as Measure;
}

describe("duplicated logic blocks", () => {
  it("⭐ stays at or under the measured budget, in every bucket", () => {
    const m = measure();
    expect({
      blocks: m.blocks <= CAP.blocks,
      sameFile: m.sameFile <= CAP.sameFile,
      crossFile: m.crossFile <= CAP.crossFile,
      longest: m.longest <= CAP.longest,
      atLeast24: m.atLeast24 <= CAP.atLeast24,
    }).toEqual({ blocks: true, sameFile: true, crossFile: true, longest: true, atLeast24: true });
  }, 60000);

  it("⭐ still finds the blocks at all, so a silent measurement failure cannot pass", () => {
    const m = measure();
    expect({ found: m.blocks > 0, top: m.top.length > 0 }).toEqual({ found: true, top: true });
  }, 60000);
});
