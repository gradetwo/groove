/**
 * ⭐ **`render_instrument_note`'s description, with the reading about resolving a library named.**
 *
 * The change that split the silence sentence left this criterion unwritten because of a formatting error, so it is here
 * with a ceiling taken from the measurement: the tool still carries a sentence about whether a library resolves, and the
 * ceiling reflects that rather than the target.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "render_instrument_note";
const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description", () => {
  it("⭐ still carries the sentences the splits kept", () => {
    for (const anchor of [
      "Render **one note** of one instrument th",
      "Silence has two readings, because a sile",
      "*Does this library resolve, and does it ",
      "Use it to answer the question a whole-mi"
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and nothing outgrows the reading about resolving a library", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 263 }).toEqual({ longest, under: true });
  });
});
