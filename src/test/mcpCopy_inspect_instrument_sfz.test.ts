/**
 * ⭐ **inspect_instrument_sfz's two long sentences are split at their colons and elsewhere.**
 *
 * Both boundaries that carried a sentence past two hundred were colons, which the splitter leaves to a human because a
 * colon often introduces a list inside one sentence; the rest is a separator it knows. Assertions ran before the write.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "inspect_instrument_sfz";
const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after the splits", () => {
  it("⭐ still carries the sentences the splits kept", () => {
    for (const anchor of [
      "`assetId` is an instrument from `list_ar",
      "`list_sample_libraries` reports each lib",
      "Which regions set `note_polyphony`, `amp",
      "**Every switches opcode** (`sw_last`, `s",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
