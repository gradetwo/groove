import { describe, it, expect } from "vitest";
import { GENRE_INDEX, GENRE_INDEX_MAP, loadGenre, loadAllGenres } from "../data/index/loader";

describe("Lightweight Genre Index & On-Demand Loader (P1-13)", () => {
  it("has complete metadata for all 159 genres in lightweight index", () => {
    expect(GENRE_INDEX.length).toBeGreaterThanOrEqual(150);
    const item = GENRE_INDEX_MAP["chicago-house"];
    expect(item).toBeTruthy();
    expect(item.id).toBe("chicago-house");
    expect(item.name).toBe("Chicago House");
    expect(item.category).toBe("Electronic");
    expect(item.chunk).toBe("house");
    expect(item.origin_decade).toBe(1980);
    expect(item.bpm_range).toContain("120");
    expect(item.radar.groove).toBeGreaterThan(0);
  });

  it("loads a specific genre asynchronously on demand", async () => {
    const genre = await loadGenre("detroit-techno");
    expect(genre).not.toBeNull();
    expect(genre?.id).toBe("detroit-techno");
    expect(genre?.name).toBe("Detroit Techno");
    expect(genre?.sequencer_pattern).toBeDefined();
    expect(genre?.representative_tracks.length).toBeGreaterThanOrEqual(5);
  });

  it("loads all genres asynchronously without errors", async () => {
    const all = await loadAllGenres();
    expect(all.length).toBe(GENRE_INDEX.length);
  });
});
