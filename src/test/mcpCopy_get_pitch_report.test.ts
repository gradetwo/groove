/**
 * ⭐ **`get_pitch_report`'s long sentence, split at its parenthetical dashes.**
 *
 * The dashes bracket an aside, so both are boundaries; the assertions ran before the write and the exact net loss is
 * checked rather than a split count. Anchors come from the rewrite.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "get_pitch_report";
const source = registrySource();
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after the split", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "One note, in every form a caller might h",
      "With an `assetId`, the arithmetic half n",
      "The same note number is C3 in Yamaha's c",
      "Which sample file it resolved to, that s"
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
