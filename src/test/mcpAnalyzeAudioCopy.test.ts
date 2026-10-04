/**
 * ⭐ **What `analyze_audio` promises survives its two splits.**
 *
 * The description's longest sentence said, in three hundred and seventy two characters, why the reported position matters,
 * how to compare it, and what the division of labour is. Splitting it changed connecting words, so the facts a caller
 * acts on are asserted here: a whole-file count is dominated by the music's own transients, the comparison is against
 * boundaries derived from `get_song`'s sections, and this tool counts while the arrangement says where the joins are.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("mcp/registry.ts", "utf8");
const start = source.indexOf('name: "analyze_audio"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe("analyze_audio's description", () => {
  it("⭐ keeps why the position matters, how to compare it, and the division of labour", () => {
    for (const phrase of [
      "The position is what makes the count useful",
      "a whole-file count is dominated by the music's own transients",
      "the boundaries you can derive from `get_song`'s sections",
      "this tool counts; the arrangement says where the joins are",
    ])
      expect({ phrase, present: description.includes(phrase) }).toEqual({ phrase, present: true });
  });

  it("⭐ and no longer hides them in one sentence", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ longest, under: longest < 300 }).toEqual({ longest, under: true });
  });
});
