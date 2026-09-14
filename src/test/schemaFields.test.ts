import { describe, it, expect } from "vitest";
import { ALL_GENRES } from "../data/genres";
import { validateGenre, validateGenresDatabase } from "../data/schema";
import type { Genre } from "../types/genre";

/** Deep-clone a real genre so each test mutates an isolated copy. */
function cloneGenre(index = 0): any {
  return JSON.parse(JSON.stringify(ALL_GENRES[index]));
}

describe("Genre schema full-field validation (E-11a)", () => {
  it("accepts the shipped database baseline without new failures", () => {
    const result = validateGenresDatabase(ALL_GENRES);
    expect(result.isValid).toBe(true);
    expect(result.genreErrors).toEqual({});
  });

  it("reports empty taxonomy arrays as warnings, never as errors", () => {
    const genre = cloneGenre();
    const res = validateGenre(genre);
    expect(res.isValid).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.warnings.some((w) => w.includes("taxonomy not yet populated"))).toBe(true);

    // The same signal is surfaced at database level, mirroring genreErrors.
    const db = validateGenresDatabase([genre]);
    expect(db.genreWarnings[genre.id]).toEqual(res.warnings);
    expect(db.isValid).toBe(true);
  });

  it("catches an empty-string bilingual pair", () => {
    const originBroken = cloneGenre();
    originBroken.origin_place = { en: "", zh: "美国芝加哥" };
    const originRes = validateGenre(originBroken);
    expect(originRes.isValid).toBe(false);
    expect(originRes.errors.some((e) => e.includes("'origin_place.en'"))).toBe(true);

    const contextBroken = cloneGenre();
    contextBroken.cultural_context = { en: "Pioneered at The Warehouse club.", zh: "   " };
    const contextRes = validateGenre(contextBroken);
    expect(contextRes.isValid).toBe(false);
    expect(contextRes.errors.some((e) => e.includes("'cultural_context.zh'"))).toBe(true);
  });

  it("catches a roman/chords length mismatch in common_chords", () => {
    const broken = cloneGenre();
    broken.common_chords = [
      {
        roman: ["i", "VI", "III"],
        chords: [{ root: "C" }, { root: "G" }],
      },
    ];
    const res = validateGenre(broken as Genre);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.includes("roman/chords length mismatch (3 vs 2)"))).toBe(true);
  });

  it("accepts structured common_chords when roman and chords line up", () => {
    const ok = cloneGenre();
    ok.common_chords = [
      {
        roman: ["i", "VI"],
        chords: [{ root: "C" }, { root: "G" }],
      },
    ];
    const res = validateGenre(ok as Genre);
    expect(res.errors.some((e) => e.includes("common_chords"))).toBe(false);
  });

  it("catches a non-numeric radar value", () => {
    const broken = cloneGenre();
    broken.radar_metrics.groove = "8";
    const res = validateGenre(broken);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.includes("'groove'") && e.includes("finite integer"))).toBe(true);

    const nanBroken = cloneGenre();
    nanBroken.radar_metrics.brightness = Number.NaN;
    const nanRes = validateGenre(nanBroken);
    expect(nanRes.isValid).toBe(false);
    expect(nanRes.errors.some((e) => e.includes("'brightness'"))).toBe(true);
  });

  it("catches an out-of-range radar value and a non-integer radar value", () => {
    const high = cloneGenre();
    high.radar_metrics.bassEnergy = 11;
    const highRes = validateGenre(high);
    expect(highRes.isValid).toBe(false);
    expect(highRes.errors.some((e) => e.includes("'bassEnergy'"))).toBe(true);

    const fractional = cloneGenre();
    fractional.radar_metrics.melodicFocus = 7.5;
    const fractionalRes = validateGenre(fractional);
    expect(fractionalRes.isValid).toBe(false);
    expect(fractionalRes.errors.some((e) => e.includes("'melodicFocus'"))).toBe(true);
  });

  it("catches a non-array subgenres field", () => {
    const broken = cloneGenre();
    broken.subgenres = "house";
    const res = validateGenre(broken);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.includes("'subgenres' must be an array of strings"))).toBe(true);
  });

  it("catches an invalid time_signature shape and an empty drum_pattern kick", () => {
    const badMeter = cloneGenre();
    badMeter.time_signature = "4/3";
    const meterRes = validateGenre(badMeter);
    expect(meterRes.isValid).toBe(false);
    expect(meterRes.errors.some((e) => e.includes("'time_signature'"))).toBe(true);

    const badDrum = cloneGenre();
    badDrum.drum_pattern.kick = { en: "", zh: "" };
    const drumRes = validateGenre(badDrum);
    expect(drumRes.isValid).toBe(false);
    expect(drumRes.errors.some((e) => e.includes("'drum_pattern.kick.en'"))).toBe(true);
  });

  it("catches missing/empty reference arrays", () => {
    const broken = cloneGenre();
    broken.representative_artists = [];
    broken.sources = ["Sound on Sound"];
    broken.aliases = undefined;
    const res = validateGenre(broken);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.includes("'aliases' must be an array of strings"))).toBe(true);
    // Empty arrays are structurally valid string[] — only per-entry type is enforced here.
    expect(res.errors.some((e) => e.includes("'representative_artists'"))).toBe(false);
  });
});
