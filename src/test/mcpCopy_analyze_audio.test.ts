/**
 * ⭐ **analyze_audio's splice-click sentence is split so the question comes first.**
 *
 * The sentence asked whether the clips are splice clicks and then said how to check; the boundary is hand-chosen because
 * the splitter sees none there, and this pass's ceiling is one hundred and ninety. Assertions ran before the write.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "analyze_audio";
const source = registrySource();
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after the split", () => {
  it("⭐ still carries the sentences the split kept", () => {
    for (const anchor of [
      "**A render already returns its own gated",
      "Gated loudness, true peak, pinned sample",
      "Compare that position against the bounda",
      "**The position is what makes the count u",
      "To ask whether these are splice clicks a",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over one hundred and ninety characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 190 }).toEqual({ longest, under: true });
  });
});
