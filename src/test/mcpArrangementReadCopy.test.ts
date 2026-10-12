/**
 * ⭐ **What `get_arrangement` promises survives splitting its field list into sentences.**
 *
 * The list was one sentence of three hundred and seventy four characters. It is now three, and the splits moved commas to
 * full stops and dropped two joining words, so every fact is asserted: the fields it reports, what `sound` holds for each
 * kind, what `problems` means, and what a `synth` track adds.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = registrySource();
const start = source.indexOf('name: "get_arrangement"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("get_arrangement's description", () => {
  it("⭐ keeps the fields, what sound holds, what problems means and what a synth adds", () => {
    for (const phrase of [
      "each one's kind",
      "a catalogue asset id for a sampler, or the built-in synth preset by name and key",
      "Its level, pan and flags, its steps and takes",
      "anything that would stop it being heard",
      "the entry that names the preset it sounds through",
      "the sampler call that would sound a recorded instrument instead",
    ])
      expect({ phrase, present: description.includes(phrase) }).toEqual({ phrase, present: true });
  });

  it("⭐ and no longer hides the list in one sentence", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 300 }).toEqual({ longest, under: true });
  });
});
