/**
 * ⭐ **What `set_arrangement_track_asset` promises survives separating its id list.**
 *
 * Its first sentence was the longest at three hundred and fifty five characters because a short conclusion carried a
 * parenthetical list of catalogue ids, and the third was split at its dash. The anchors below were **derived from the
 * rewritten text** rather than typed, because four earlier attempts in this family were rolled back for asserting the
 * pre-edit wording of a sentence the split had capitalised.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = registrySource();
const start = source.indexOf('name: "set_arrangement_track_asset"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("set_arrangement_track_asset's description", () => {
  it("⭐ still carries the sentences the rewrite kept", () => {
    for (const anchor of [
      "A synth track is not pointed at an asset",
      "A piano is `assetId: \\\"salamander-grand\\",
      "The tool is named for the **asset**, not",
      "Point a **sampler** track at a catalogue",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and its opening is no longer its longest part", () => {
    const parts = description.split(/(?<=[.!?])\s+/);
    const longest = Math.max(...parts.map((part) => part.length));
    expect({ longest, under: longest < 300, first: parts[0].length < 250 }).toEqual({
      longest,
      under: true,
      first: true,
    });
  });
});
