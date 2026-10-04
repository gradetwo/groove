/**
 * ⭐ **The champion description's long sentence, split with quotes protected.**
 *
 * The splitter tracks bracket depth and quotation parity, the assertions run before the write, and the exact net loss is
 * checked rather than a split count. Anchors come from the rewrite.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "add_arrangement_track";
const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after the split", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "Pass `instrument:\\\"piano_lead\\\"` (or ano",
      "**Choose the kind by what makes the soun",
      "For any other kind.** The kind is called",
      "**`assetId` is accepted on `kind:\\\"sampl",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
