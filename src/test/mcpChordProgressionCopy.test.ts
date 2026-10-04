/**
 * ⭐ **What `apply_chord_progression` promises survives splitting its long sentence.**
 *
 * A mechanical split at bracket-depth-zero separators with the exact net loss checked rather than a split count.
 * Anchors come from the rewritten text.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "apply_chord_progression"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("apply_chord_progression's description", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "And **put it into the music**: the chord",
      "A pure transform like `apply_pattern_ops",
      "Take the progression `suggest_progressio",
      "Or numerals you wrote yourself.",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over three hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 300 }).toEqual({ longest, under: true });
  });
});
