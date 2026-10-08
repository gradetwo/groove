/**
 * ⭐ **What `analyze_audio` promises survives its two splits.**
 *
 * The description's longest sentence said, in three hundred and seventy two characters, why the reported position matters,
 * how to compare it, and what the division of labour is. Splitting it changed connecting words, so the facts a caller
 * acts on are asserted here: a whole-file count is dominated by the music's own transients, the comparison is against the
 * arrangement's own boundaries, and this tool counts while the arrangement says where the joins are.
 *
 * ⚠️ **This file and `mcpCopy_analyze_audio.test.ts` are two records of one description**, and the third evaluation's L02
 * is why the middle phrase changed: it named `get_song`, a tool that is not on the surface any more, so an agent following
 * it would build a call that cannot succeed. The anchor moved to what the arrangement itself reports — and the lesson is
 * that a description change has **two** copy tests to keep in step, not one.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = registrySource();
const start = source.indexOf('name: "analyze_audio"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("analyze_audio's description", () => {
  it("⭐ keeps why the position matters, how to compare it, and the division of labour", () => {
    for (const phrase of [
      "The position is what makes the count useful",
      "a whole-file count is dominated by the music's own transients",
      "Compare that position against the arrangement's own boundaries",
      "This tool counts; the arrangement says where the joins are",
    ])
      expect({ phrase, present: description.includes(phrase) }).toEqual({ phrase, present: true });
  });

  it("⭐ and no longer hides them in one sentence", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 300 }).toEqual({ longest, under: true });
  });
});
