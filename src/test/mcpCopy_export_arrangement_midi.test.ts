/**
 * ⭐ **export_arrangement_midi's long sentence, split with brackets and quotes protected.**
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "export_arrangement_midi";
const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after the split", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "One MIDI track per lane, named after the",
      "This is the mirror of `import_arrangemen",
      "Folders are left out (MIDI has no folder",
      "Write the arrangement as a **Standard MI",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
