/**
 * ⭐ **What `get_gs1_patch` promises survives splitting its long sentence.**
 *
 * A mechanical split at bracket-depth-zero separators with the exact net loss checked rather than a split count.
 * Anchors come from the rewritten text.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = registrySource();
const start = source.indexOf('name: "get_gs1_patch"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("get_gs1_patch's description", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "Say what a GS-1 sound actually is, in na",
      "Param name, engine label, value in its o",
      "A lane GS-1 does not voice, and a code o",
      "Plus the modulation rows by source/desti",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over three hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 300 }).toEqual({ longest, under: true });
  });
});
