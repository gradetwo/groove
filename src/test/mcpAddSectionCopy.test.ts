/**
 * ⭐ **What `add_section` promises survives splitting its field list.**
 *
 * Two hundred and forty characters listed what the call places with plain commas, so the list boundaries are hand-chosen
 * and each group is its own sentence. Anchors come from the rewritten text.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "add_section"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("add_section's description", () => {
  it("⭐ still carries every thing it places", () => {
    for (const anchor of [
      "Optional per-section mutes, velocity sca",
      "Place a clip on the song's timeline: slo",
      "Returns the whole arrangement, so a mode",
      "A transposition of its pitched lanes.",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
