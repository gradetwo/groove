/**
 * ⭐ **What `generate_melody` promises survives splitting its list.**
 *
 * Two hundred and thirty three characters ran the contour, the key mapping and the grid into one sentence; the boundary
 * is hand-chosen at the last item and the wording adds only "are ". Anchors come from the rewritten text.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = registrySource();
const start = source.indexOf('name: "generate_melody"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("generate_melody's description", () => {
  it("⭐ still says what it writes and how the notes land", () => {
    for (const anchor of [
      "Write a melody contour-first: a named co",
      "Returns lane-shaped arrays (steps, pitch",
      "Notes are placed on an eighth-note grid ",
      "AABA repeats its first phrase literally.",
    ])
      expect({ anchor, present: description.includes(anchor) }).toEqual({ anchor, present: true });
  });

  it("⭐ and no sentence is over two hundred characters", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 200 }).toEqual({ longest, under: true });
  });
});
