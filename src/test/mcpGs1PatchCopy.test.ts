/**
 * ⭐ **What `apply_gs1_patch` promises survives splitting its first sentence.**
 *
 * The opening sentence was three hundred and nineteen characters, running a parenthetical about the share code into the
 * parameters it cannot write. Four bracket-depth-zero separators became full stops, and the length check is the exact
 * net loss rather than the number of splits, because the separators differ in width. Anchors come from the rewrite.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "apply_gs1_patch"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("apply_gs1_patch's description", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "Overrides the instrument table for that ",
      "Values are the engine's own, whose range",
      "Set or clear one lane's own GS-1 sound, ",
      "And write **individual parameters and mo",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over three hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 300 }).toEqual({ longest, under: true });
  });
});
