/**
 * ⭐ **render_preview_clip's long sentence, split with brackets and quotes protected.**
 *
 * ⚠️ Second, narrower pass: the ceiling is one hundred and ninety.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "render_preview_clip";
const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after the split", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "A composing loop that needs to hear a tw",
      "Render a section (or one pattern) at a l",
      "measures about 1.8 s against 6-24 s for ",
      "Report how long it took.",
      "Defaults are 8 kHz mono.",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over one hundred and ninety characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 190 }).toEqual({ longest, under: true });
  });
});
