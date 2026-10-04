/**
 * ⭐ **`import_arrangement_midi`'s long sentence survives being split.**
 *
 * The splitter knows the dash, the semicolon and the leading comma forms; the exact net loss is checked rather than a
 * split count and the assertions run before the write. Anchors come from the rewrite.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "import_arrangement_midi"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("import_arrangement_midi's description", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "Unlike a step-grid import, the file's ow",
      "The file itself usually cannot say (meas",
      "**`instruments` is how a part sounds a r",
      "Read a Standard MIDI File and **add** on",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
