/**
 * ⭐ **`set_arrangement_track_kind`'s kind list becomes sentences.**
 *
 * The list used plain commas, which the splitter deliberately leaves alone; the boundaries are hand-chosen and the width
 * is unchanged, so the content is untouched by construction. Anchors come from the rewrite.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "set_arrangement_track_kind";
const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after the list was split", () => {
  it("⭐ still defines every kind", () => {
    for (const anchor of [
      "Becoming a sampler gives it the default ",
      "**The kinds, by what makes the sound:** ",
      "`sampler` plays a real recorded instrume",
      "The kind was spelled `instrument` before",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
