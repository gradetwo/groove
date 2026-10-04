/**
 * ⭐ **set_tempo's long sentence, split with brackets and quotes protected.**
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "set_tempo";
const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after the split", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "Give a song a tempo map: points at whole",
      "Present, the renderer schedules from the",
      "Absent, every bar costs 4 * 60 / bpm and",
      "Unreadable points reject the whole chang",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
