/**
 * ⭐ **What `render_arrangement` promises about audio lanes survives splitting its list.**
 *
 * Three hundred and twelve characters listed three cases with plain commas, which is why the mechanical splitter found
 * no separator of its own: the list boundaries are hand-chosen and each case is now its own sentence. Anchors come from
 * the rewritten text.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = registrySource();
const start = source.indexOf('name: "render_arrangement"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("render_arrangement's description", () => {
  it("⭐ still carries the three audio lane cases", () => {
    for (const anchor of [
      "**An arrangement has its own length**.",
      "**Audio lanes are mixed**: a `sampler` t",
      "A lane whose bytes cannot be resolved is",
      "Render an arrangement to audio through t",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over three hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 300 }).toEqual({ longest, under: true });
  });
});
