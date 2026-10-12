/**
 * ⭐ **render_instrument_note's description: the note reading and the one-shot reading, as sentences.**
 *
 * One boundary is the colon that introduced what the library answered, hand-chosen because the splitter leaves colons
 * alone; the other is a separator it knows. All assertions ran before the write and this file is regenerated from the
 * rewritten text.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "render_instrument_note";
const source = registrySource();
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description", () => {
  it("⭐ still carries the sentences the splits kept", () => {
    for (const anchor of [
      "Which sample file answered, at what play",
      "Does it do what its file says?* A note t",
      "Silence has two readings, because a sile",
      "Render **one note** of one instrument th",
      "A silent note without one is a library t",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
