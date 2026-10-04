/**
 * ⭐ **The opening of `get_gs1_patch`'s description survives being split at its colon.**
 *
 * The colon introduced the two ways to read a patch and the sentence ran ninety characters before it; it is a full stop
 * now, with the same width and only a capital moving, so the content is untouched by construction. Anchors come from the
 * rewritten text.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = registrySource();
const start = source.indexOf('name: "get_gs1_patch"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("get_gs1_patch's description, after its opening was split", () => {
  it("⭐ still says what a GS-1 sound is and how to read one", () => {
    for (const anchor of [
      "Read the lane's own share code and per-p",
      "Param name, engine label, value in its o",
      "A lane GS-1 does not voice, and a code o",
      "Plus the modulation rows by source/desti",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
