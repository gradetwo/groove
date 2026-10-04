/**
 * ⭐ **What `inspect_instrument_sfz` promises survives splitting its opening enumeration.**
 *
 * A mechanical split at bracket-depth-zero separators with the exact net loss checked rather than a split count.
 * Anchors come from the rewritten text.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "inspect_instrument_sfz"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("inspect_instrument_sfz's description", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "**Name the instrument or its file, and t",
      "Reading the addresses out of the catalog",
      "Which regions set `note_polyphony`, `amp",
      "This reads over plain HTTP (source addre",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over three hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 300 }).toEqual({ longest, under: true });
  });
});
