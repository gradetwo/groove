/**
 * ⭐ The MCP replies promise certain things and refuse to promise others. Those refusals are the
 * boundary: what the server proved, what it did not, and where a song actually lives.
 *
 * They were written well and then left unguarded, so a refactor could quietly soften them into a
 * claim the server cannot support — Logic opens this, instead of whether Logic itself opens it —
 * or drop the sentence about the map not being persisted. This pins them.
 *
 * ⚠️ Three subtleties cost five attempts, so they live here rather than in someone's memory:
 *   1. the phrases are **extracted from the sources by script**, never typed from a terminal read:
 *      the eye deletes the leading asterisks of a wrapped comment and the emphasis markers inside
 *      the sentence, and then the phrase is not a substring of anything;
 *   2. `flat()` strips those markers exactly as the extraction did;
 *   3. one sentence can satisfy two anchors, so the list is de-duplicated and checked for it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const flat = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\n\s*\*\s?/g, " ")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ");

const BOUNDARIES: Array<{ file: string; phrase: string; why: string }> = [
  { file: "mcp/arrangement.ts",
    phrase: "Whether Logic itself opens the result is not proven here and stays in `needs`; what is proven is that this server's reader reads back the same music.",
    why: "Logic \u5bfc\u51fa\u5fc5\u987b\u7ee7\u7eed\u8bf4\u660e Logic \u80fd\u5426\u6253\u5f00\u672a\u8bc1\uff0c\u5e76\u6307\u5411 needs\uff1b\u540c\u4e00\u53e5\u8fd8\u8981\u8bf4\u6e05\u8bc1\u660e\u4e86\u4ec0\u4e48" },
  { file: "mcp/arrangement.ts",
    phrase: "The map is deliberately not persisted: the application owns projects, and this is a scratchpad for one session.",
    why: "\u7f16\u66f2\u5fc5\u987b\u7ee7\u7eed\u8bf4\u5b83\u53ea\u6d3b\u5728\u4f1a\u8bdd\u6620\u5c04\u91cc\uff0c\u4e0d\u843d\u76d8" },
  { file: "mcp/arrangement.ts",
    phrase: "Audio tracks, AU plugin chains and automation have no counterpart in `TrackKindV2`, and the reader does not drop them quietly: each reaches `problems` by name.",
    why: "Logic \u5bfc\u5165\u5fc5\u987b\u7ee7\u7eed\u70b9\u540d\u5b83\u5e26\u4e0d\u8d70\u4ec0\u4e48\uff0c\u5e76\u627f\u8bfa\u4e0d\u4f1a\u6084\u6084\u4e22\u6389" },
];

describe("MCP boundary sentences", () => {
  it("keeps every boundary sentence in the file that owns it", () => {
    const missing = BOUNDARIES.filter(({ file, phrase }) => !flat(file).includes(phrase)).map(
      ({ file, phrase, why }) => `${file}: ${why}\n    missing phrase: ${phrase}`
    );
    expect(missing, `boundary sentences were weakened or removed:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("lists each boundary once, and is not vacuous", () => {
    const phrases = BOUNDARIES.map((b) => b.phrase);
    expect(new Set(phrases).size, "a boundary is listed twice").toBe(phrases.length);
    /**
     * ⭐ **Three, because three is how many boundary sentences this layer actually states.** The floor is drawn from the code
     * rather than set as a target: the song map's sentence left with the song map, and this number may only rise when another
     * real one appears — filling the table with a sentence that states no boundary is what this case exists to prevent.
     */
    expect(phrases.length).toBeGreaterThanOrEqual(3);
    for (const { file } of BOUNDARIES) expect(flat(file).length).toBeGreaterThan(1000);
  });
});
