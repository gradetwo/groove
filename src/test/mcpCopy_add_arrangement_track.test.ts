/**
 * ⭐ **add_arrangement_track's two long sentences stop running, one at a colon and one at a bracket.**
 *
 * Both boundaries are hand-chosen because the splitter sees no separator it trusts there; assertions ran before the write
 * and this pass's ceiling is one hundred and ninety.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "add_arrangement_track";
const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after two hand splits", () => {
  it("⭐ still says how to name a recorded instrument", () => {
    for (const anchor of [
      "For any other kind.** The kind is called",
      "**Choose the kind by what makes the soun",
      "Pass `instrument:\\\"piano_lead\\\"` (or ano",
      "**`assetId` is accepted on `kind:\\\"sampl",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over one hundred and ninety characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 190 }).toEqual({ longest, under: true });
  });
});
