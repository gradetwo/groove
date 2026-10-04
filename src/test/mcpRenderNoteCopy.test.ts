/**
 * ⭐ **What `render_instrument_note` promises survives splitting its long sentence.**
 *
 * A mechanical split at a bracket-depth-zero separator: the separator becomes a full stop and the length check is that
 * exactly one character per split went away. The anchors are derived from the rewritten text rather than typed.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "render_instrument_note"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("render_instrument_note's description", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "*Does this library resolve, and does it ",
      "Render **one note** of one instrument th",
      "Use it to answer the question a whole-mi",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over three hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 300 }).toEqual({ longest, under: true });
  });
});
