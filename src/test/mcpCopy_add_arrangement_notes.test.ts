/**
 * ⭐ **`add_arrangement_notes`' three long sentences become many short ones.**
 *
 * One boundary is the colon that introduced how a silent decline is seen, chosen by hand because the splitter leaves
 * colons alone; the other two are separators it knows. The assertions ran before the write. Anchors come from the rewrite.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "add_arrangement_notes";
const source = registrySource();
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after three sentences were split", () => {
  it("⭐ still carries the sentences the splits kept", () => {
    for (const anchor of [
      "**For sustained strings and pads, write ",
      "The reply carries `requested` beside the",
      "Muse measured the alternative: 4176 note",
      "Comparing what was asked for with the tr"
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
