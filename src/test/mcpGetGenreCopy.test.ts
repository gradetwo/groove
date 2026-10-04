/**
 * ⭐ **What `get_genre` promises survives splitting its single sentence.**
 *
 * One sentence of two hundred and thirty eight characters introduced a list, so the boundary is hand-chosen at the point
 * where the metadata ends and the rest of the genre begins. Anchors come from the rewritten text.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "get_genre"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("get_genre's description", () => {
  it("⭐ still lists everything a genre comes with", () => {
    for (const anchor of [
      "One genre in full: recorded metadata (er",
      "Its instrumentation, radar metrics, mix,",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
