/**
 * ⭐ **What `list_arrangement_instruments` promises survives splitting its two long sentences.**
 *
 * Two sentences of three hundred and sixty two and three hundred and fifty five characters said what a string program
 * carries and what the mapped names are for. Both are split at their own dash, and every phrase below was checked
 * against the rewritten text before it was written, because three attempts at neighbouring files were rolled back for
 * asserting the pre-edit wording.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "list_arrangement_instruments"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("list_arrangement_instruments' description", () => {
  it("⭐ keeps what a string program carries and what the mapped names are for", () => {
    for (const phrase of [
      "the situations that technique serves",
      "how many recorded dynamic layers velocity selects between",
      "pinned strings do not loop",
      "the written genre instrument names",
      "a name that is *not* there keeps its built-in preset",
    ])
      expect({ phrase, present: description.includes(phrase) }).toEqual({ phrase, present: true });
  });

  it("⭐ and no longer hides either in one sentence", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 300 }).toEqual({ longest, under: true });
  });
});
