import { describe, it, expect } from "vitest";
import { PRESET_MATCHUPS } from "../views/CompareView";
import { GENRE_INDEX, GENRE_INDEX_MAP, loadGenre } from "../data/index/loader";

/**
 * Regression guard for a real production bug: two of the five "classic matchup"
 * presets in CompareView referenced genre ids that do not exist
 * (`cyberpunk-midtempo`, `nu-disco`), so clicking them silently did nothing —
 * the handler resolved fewer than two genres and returned without feedback.
 *
 * Anything that hardcodes a genre id must be checked against the genre database,
 * otherwise the failure mode is invisible: no error, no toast, just a dead button.
 */
describe("CompareView classic matchups resolve against the genre database", () => {
  it("declares at least two genres per preset", () => {
    for (const preset of PRESET_MATCHUPS) {
      expect(preset.ids.length, `${preset.labelEn} should compare at least two genres`).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses only ids that exist in the lightweight genre index", () => {
    const missing: string[] = [];
    for (const preset of PRESET_MATCHUPS) {
      for (const id of preset.ids) {
        if (!GENRE_INDEX_MAP[id]) missing.push(`${preset.labelEn} -> ${id}`);
      }
    }
    expect(missing, `unknown genre ids in COMPARE presets: ${missing.join(", ")}`).toEqual([]);
  });

  it("does not repeat an id inside a single preset", () => {
    for (const preset of PRESET_MATCHUPS) {
      expect(new Set(preset.ids).size, `${preset.labelEn} has duplicate ids`).toBe(preset.ids.length);
    }
  });

  it("resolves every preset id to a loadable genre with a playable pattern", async () => {
    for (const preset of PRESET_MATCHUPS) {
      for (const id of preset.ids) {
        const genre = await loadGenre(id);
        expect(genre, `${preset.labelEn}: ${id} failed to load`).not.toBeNull();
        expect(genre?.sequencer_pattern?.tracks?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the preset list non-empty and bilingual", () => {
    expect(PRESET_MATCHUPS.length).toBeGreaterThanOrEqual(3);
    for (const preset of PRESET_MATCHUPS) {
      expect(preset.labelZh.trim().length).toBeGreaterThan(0);
      expect(preset.labelEn.trim().length).toBeGreaterThan(0);
    }
  });

  it("indexes every genre referenced by the index itself", () => {
    // Sanity check on the index pair: anything the rail/loader can look up by map
    // must also be present in the list form.
    const listIds = new Set(GENRE_INDEX.map((g) => g.id));
    const orphanMapEntries = Object.keys(GENRE_INDEX_MAP).filter((id) => !listIds.has(id));
    expect(orphanMapEntries).toEqual([]);
  });
});
