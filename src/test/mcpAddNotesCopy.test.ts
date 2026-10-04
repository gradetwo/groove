/**
 * ⭐ **What `add_arrangement_notes` promises survives splitting its legato sentence.**
 *
 * The sentence was three hundred and fifty two characters and split at its own dash into what legato means and why a
 * detached note is rarely wanted. The anchors are derived from the rewritten text rather than typed.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "add_arrangement_notes"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("add_arrangement_notes' description", () => {
  it("⭐ still says what legato means here and why it matters", () => {
    for (const anchor of [
      "Muse measured the alternative: 4176 note",
      "The reply carries `requested` beside the",
      "**For sustained strings and pads, write ",
      "A note that ends exactly where the next ",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over three hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 300 }).toEqual({ longest, under: true });
  });
});
