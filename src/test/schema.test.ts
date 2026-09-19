import { describe, it, expect } from "vitest";
import { ALL_GENRES, GENRES_MAP } from "../data/genres";
import { validateGenre, validateGenresDatabase } from "../data/schema";

describe("Genre Schema Validation (P1-14)", () => {
  it("validates a standard genre schema successfully", () => {
    const sample = ALL_GENRES[0]; // Chicago House
    const res = validateGenre(sample);
    expect(res.errors).toEqual([]);
    expect(res.isValid).toBe(true);
  });

  it("detects invalid track steps, lengths and radar bounds", () => {
    const brokenGenre = JSON.parse(JSON.stringify(ALL_GENRES[0]));
    brokenGenre.sequencer_pattern.tracks[0].steps[0] = 99; // Invalid step > 3
    brokenGenre.radar_metrics.groove = 15; // Invalid radar > 10
    brokenGenre.representative_tracks = brokenGenre.representative_tracks.slice(0, 2); // < 5 tracks

    const res = validateGenre(brokenGenre);
    expect(res.isValid).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(3);
    expect(res.errors.some((e) => e.includes("step[0]"))).toBe(true);
    expect(res.errors.some((e) => e.includes("groove"))).toBe(true);
    expect(res.errors.some((e) => e.includes("at least 5 tracks"))).toBe(true);
  });

  it("ensures zero duplicate genre IDs across the entire database", () => {
    const result = validateGenresDatabase(ALL_GENRES);
    expect(result.duplicateIds).toEqual([]);
    expect(result.totalGenres).toBeGreaterThanOrEqual(150);
  });

  it("validates that all 159 genres have valid schemas and radar metrics", () => {
    const result = validateGenresDatabase(ALL_GENRES);
    if (Object.keys(result.genreErrors).length > 0) {
      console.error("Genre validation errors:", result.genreErrors);
    }
    expect(result.duplicateIds).toEqual([]);
    expect(Object.keys(result.genreErrors)).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it("ensures GENRES_MAP maps every genre correctly", () => {
    expect(Object.keys(GENRES_MAP).length).toBe(ALL_GENRES.length);
    ALL_GENRES.forEach((g) => {
      expect(GENRES_MAP[g.id]).toBe(g);
    });
  });
});
