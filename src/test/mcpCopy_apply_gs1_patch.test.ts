/**
 * ⭐ **apply_gs1_patch's value sentence turns a relative clause into its own sentence.**
 *
 * The clause is inside no bracket but the splitter leaves relative clauses alone; the rewrite adds a subject and keeps
 * every fact. The assertions ran before the write and this pass's ceiling is one hundred and ninety.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "apply_gs1_patch";
const source = registrySource();
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after the split", () => {
  it("⭐ still says whose values they are and what the spec list is for", () => {
    for (const anchor of [
      "Set or clear one lane's own GS-1 sound, ",
      "Reaches the rendered audio and live play",
      "The engine clamps their ranges (PARAM_SP",
      "A code that cannot be decoded, an unknow",
      "And write **individual parameters and mo",
      "Parameter keys are Param names (\\\"FILTER",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over one hundred and ninety characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 190 }).toEqual({ longest, under: true });
  });
});
