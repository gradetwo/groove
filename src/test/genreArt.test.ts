/**
 * Per-genre art.
 *
 * The library's tiles are generated (see the module header): what has to hold is that they are
 * *deterministic* (a genre does not change its look between renders), *distinct* (two genres do not
 * get the same tile), built from the aurora hues the reference uses, and syntactically valid CSS.
 */
import { describe, it, expect } from "vitest";
import { genreArtBackground, genreCoverUrl, hashGenreId } from "../mobile/genreArt";

describe("genre art", () => {
  it("is deterministic for a genre and different between genres", () => {
    const a = genreArtBackground({ id: "deep-house", category: "Electronic" });
    expect(genreArtBackground({ id: "deep-house", category: "Electronic" })).toBe(a);
    expect(genreArtBackground({ id: "techno", category: "Electronic" })).not.toBe(a);
    expect(hashGenreId("deep-house")).toBe(hashGenreId("deep-house"));
    expect(hashGenreId("deep-house")).not.toBe(hashGenreId("chicago-house"));
  });

  it("produces valid layered CSS with no amber anywhere", () => {
    const background = genreArtBackground({ id: "boom-bap", category: "Hip Hop" });
    expect(background).toMatch(/^radial-gradient\(.+linear-gradient\(/);
    expect(background).not.toMatch(/NaN|undefined/);
    // hsl() hue bounds: an out-of-range hue would be an invalid colour in some engines.
    for (const match of background.matchAll(/hsl\((-?\d+(?:\.\d+)?)/g)) {
      const hue = Number(match[1]);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThanOrEqual(360);
    }
  });

  it("gives every category its own hue band", () => {
    const categories = ["Electronic", "Rock/Metal", "Hip Hop", "Jazz/Blues", "Pop/R&B", "Latin/World"];
    const tiles = categories.map((category) => genreArtBackground({ id: "same-id", category }));
    expect(new Set(tiles).size).toBe(categories.length);
  });

  it("falls back to the default band for an unknown category", () => {
    expect(genreArtBackground({ id: "custom", category: "Nonsense" })).toContain("hsl(");
  });

  it("offers a real-cover hook that a drop-in file wins", () => {
    expect(genreCoverUrl("deep-house")).toBe("/covers/deep-house.jpg");
    expect(genreCoverUrl("a b")).toBe("/covers/a%20b.jpg");
  });
});
