/**
 * ⭐ **set_arrangement_bars's long sentence, split with brackets and quotes protected.**
 *
 * ⚠️ Second, narrower pass: the ceiling is one hundred and ninety.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "set_arrangement_bars";
const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after the split", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "The length is respected even when it is ",
      "How long the arrangement is, in bars, cl",
      "The arrangement spans whichever reaches ",
      "The notes are never cut when it is short",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over one hundred and ninety characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 190 }).toEqual({ longest, under: true });
  });
});
