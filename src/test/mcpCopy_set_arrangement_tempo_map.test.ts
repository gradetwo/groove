/**
 * ⭐ **set_arrangement_tempo_map's refusal sentence is split at a plain comma.**
 *
 * The comma joined a passive clause, so the second sentence needs a subject and the wording adds two words; no fact is
 * lost. The boundary is hand-chosen because the splitter leaves plain commas alone, and the ceiling is one hundred and
 * ninety. Assertions ran before the write.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOOL = "set_arrangement_tempo_map";
const source = registrySource();
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, after the split", () => {
  it("⭐ still says what happens to points and in what order", () => {
    for (const anchor of [
      "The whole map, not one number: points at",
      "The model field, its projection into the",
      "Muse's list carried this as a gap three ",
      "They are sorted by bar (a map whose mean",
      "An empty list **clears** the map, return",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over one hundred and ninety characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 190 }).toEqual({ longest, under: true });
  });
});
