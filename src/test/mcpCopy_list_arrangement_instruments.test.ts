/**
 * ⭐ **list_arrangement_instruments's long sentence, split with brackets and quotes protected.**
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "list_arrangement_instruments";
const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after the split", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "The written genre instrument names (`pia",
      "The catalogue assets a sampler track can",
      "How many seconds a note may be held befo",
      "How many recorded dynamic layers velocit",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
