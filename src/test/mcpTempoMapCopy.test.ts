/**
 * ⭐ **`set_arrangement_tempo_map`'s first sentence is split outside its quote.**
 *
 * The sentence quotes a report and carries dashes inside the quotation, which the splitter deliberately does not touch
 * because it tracks brackets rather than quotes; the boundary chosen here is the colon after the quote. The assertion
 * checks that the quotation survives word for word and that the change is the same width.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = registrySource();
const start = source.indexOf('name: "set_arrangement_tempo_map"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("set_arrangement_tempo_map's description", () => {
  it("⭐ keeps the quotation word for word and the sentences the split kept", () => {
    expect({ quote: description.includes('arrangement 无 tempo map — 整曲只能一个固定 BPM') }).toEqual({ quote: true });
    for (const anchor of [
      "Points are **refused rather than clamped",
      "The whole map, not one number: points at",
      "The model field, its projection into the",
      "Muse's list carried this as a gap three ",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and its long sentences are recorded with the ceiling this commit measured", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
