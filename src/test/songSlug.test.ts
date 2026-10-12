import { describe, expect, it } from "vitest";
import { songSlug } from "../utils/songSlug";

/**
 * The file-name token for a rendered song, held to the three properties that matter.
 *
 * The bug this replaces: a title with no ASCII in it slugged to the empty string, fell back to `master`, and therefore landed on **the same path** as
 * every other non-ASCII title — two different songs, one file, silently overwritten. The old whitelist is mirrored in `src/test/mcpSong.test.ts`; the
 * code that writes the file is `mcp/render/worker.ts`, which now calls this.
 */
describe("songSlug", () => {
  it("leaves an ASCII name exactly as the old whitelist did, so existing files keep their names", () => {
    // The values the previous implementation produced, written out rather than derived from the new one.
    expect(songSlug("Neon Rain")).toBe("neon-rain");
    expect(songSlug("  Metro   Nights  ")).toBe("metro-nights");
    expect(songSlug("Spark_Galaxy Symphony")).toBe("spark-galaxy-symphony");
    expect(songSlug("A".repeat(80))).toBe("a".repeat(40));
  });

  it("keeps the historical default for a song with no name at all", () => {
    for (const empty of ["", "   ", undefined, null]) expect(songSlug(empty)).toBe("master");
  });

  it("gives two differently-named non-ASCII songs two different tokens, which is the bug", () => {
    const one = songSlug("星火燎原：宇宙交响史诗");
    const two = songSlug("假如时光能够倒流");
    expect(one).not.toBe(two);
    expect(one).not.toBe("master");
    expect(two).not.toBe("master");
  });

  it("is stable for the same title, so a re-render lands on the same file", () => {
    expect(songSlug("星火燎原：宇宙交响史诗")).toBe(songSlug("星火燎原：宇宙交响史诗"));
    // …and whitespace around a title is not part of its identity.
    expect(songSlug(" 星火燎原：宇宙交响史诗 ")).toBe(songSlug("星火燎原：宇宙交响史诗"));
  });

  it("emits only characters a path can hold, so safety does not rest on the caller's replace", () => {
    for (const title of ["星火燎原", "Übermensch", "夜/晚*?:", "emoji 🌌 title"]) {
      expect(songSlug(title)).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
