/**
 * ⭐ **render_arrangement_stems's long sentence, split with brackets and quotes protected.**
 *
 * ⚠️ This is the second, narrower pass: the ceiling is one hundred and ninety rather than two hundred.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "render_arrangement_stems";
const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after the split", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "Use it when the question is about a part",
      "Bounce every track of an arrangement to ",
      "Each reply entry carries the measured du",
      "A stem that rendered to silence says so ",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over one hundred and ninety characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 190 }).toEqual({ longest, under: true });
  });
});
