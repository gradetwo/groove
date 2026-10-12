/**
 * ⭐ **set_arrangement_vocal_melody's tone sentence is split at its colon.**
 *
 * The colon introduced the warning rule, which is a boundary a human chooses because a colon often holds a list inside
 * one sentence. The assertions ran before the write and this pass's ceiling is one hundred and ninety.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "set_arrangement_vocal_melody";
const source = registrySource();
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after the split", () => {
  it("⭐ still says tones are given and never guessed", () => {
    for (const anchor of [
      "Put syllables on a song's vocal lane, on",
      "A rising tone sung on a falling interval",
      "Give `pitches` to set the melody yoursel",
      "Tones are input (1 阴平, 2 阳平, 3 上声, 4 去声,",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over one hundred and ninety characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 190 }).toEqual({ longest, under: true });
  });
});
