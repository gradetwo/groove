/**
 * ⭐ **What `get_transposition_report` promises survives the split of its longest sentence.**
 *
 * The description said in three hundred and eighty one characters what two things it deliberately does not read. The
 * sentence is now two, and the two facts a caller acts on must still be there: that the SFZ's own tuning needs a
 * resolved note and is `get_pitch_report`'s with an `assetId`, and that the chord register in `genreExpression` is
 * written at composition time and so is not a playback transposition. Deleting either clause fails the case, which is
 * the whole reason a rewrite that removes words needs one.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = registrySource();
const start = source.indexOf('name: "get_transposition_report"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("get_transposition_report's description", () => {
  it("⭐ keeps both things it says it does not read, each with its reason", () => {
    for (const phrase of [
      "`tune` and `pitch_keycenter`",
      "need a resolved note",
      "reported by `get_pitch_report` with an `assetId`",
      "chord register in `genreExpression`",
      "written into the pitches at composition time",
      "not a playback transposition",
    ])
      expect({ phrase, present: description.includes(phrase) }).toEqual({ phrase, present: true });
  });

  it("⭐ no longer hides them in one sentence", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 300 }).toEqual({ longest, under: true });
  });
});
