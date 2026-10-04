/**
 * ⭐ **`apply_gs1_patch`'s remaining long sentence is split, with quotes protected.**
 *
 * The splitter now tracks quotation parity as well as brackets, so a dash inside a quoted phrase is never a boundary;
 * the assertions run before the write and the exact net loss is checked rather than a split count.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "apply_gs1_patch"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("apply_gs1_patch's description, after a second pass", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "Values are the engine's own, whose range",
      "Set or clear one lane's own GS-1 sound, ",
      "Reaches the rendered audio and live play",
      "A code that cannot be decoded, an unknow",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
