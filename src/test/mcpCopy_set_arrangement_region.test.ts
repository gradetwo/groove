/**
 * ⭐ **set_arrangement_region's long sentence, split with the separator table under a length self check.**
 *
 * ⚠️ Second, narrower pass: the ceiling is one hundred and ninety.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "set_arrangement_region";
const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after the split", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "The same range the interface's drag writ",
      "Where a track's region sits on the timel",
      "Pass null for both bounds to put it back",
      "Absent, a region covers the whole arrang",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over one hundred and ninety characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 190 }).toEqual({ longest, under: true });
  });
});
