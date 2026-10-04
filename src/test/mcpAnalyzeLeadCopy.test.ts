/**
 * ⭐ **`analyze_audio`'s opening survives being split at its colon.**
 *
 * The colon introduced the measurements after thirty four characters; it is a full stop now, the same width, so the
 * content is untouched by construction. Anchors come from the rewritten text.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = registrySource();
const start = source.indexOf('name: "analyze_audio"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("analyze_audio's description, after a second pass", () => {
  it("⭐ still lists every measurement", () => {
    for (const anchor of [
      "To ask whether these are splice clicks a",
      "**A render already returns its own gated",
      "Gated loudness, true peak, pinned sample",
      "**The position is what makes the count u",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
