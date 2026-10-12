/**
 * ⭐ **estimate_key's purpose sentence is split at its colon.**
 *
 * The colon introduced why the composition is read instead of the audio; the boundary is hand-chosen and the assertions ran
 * before the write. This pass's ceiling is one hundred and ninety.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "estimate_key";
const source = registrySource();
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after the split", () => {
  it("⭐ still says it reads the composition and why that beats an FFT", () => {
    for (const anchor of [
      "Estimate the key of an arrangement from",
      "The notes are what the composer chose, w",
      "Per-render loudness needs no tool: rende",
      "It reads the composition rather than the",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over one hundred and ninety characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 190 }).toEqual({ longest, under: true });
  });
});
