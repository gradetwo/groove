/**
 * Instrument categories (item ②).
 *
 * The picker's usefulness depends entirely on the table being complete: one uncategorized alias
 * means a timbre nobody can find. So the test is a completeness proof over the real alias list
 * rather than a few spot checks, plus the rule/override behaviour that makes the table
 * maintainable.
 */
import { describe, expect, it } from "vitest";
import {
  INSTRUMENT_CATEGORY_IDS,
  categoryForInstrument,
  findCategorizationProblems,
  groupInstrumentsByCategory,
} from "../data/instrumentCategories";
import { INSTRUMENT_PRESET_ALIASES } from "../audio/instrumentPresets";
import { DICTIONARY } from "../i18n/locales";

const ALIASES = Object.keys(INSTRUMENT_PRESET_ALIASES);

describe("instrument categories", () => {
  it("categorizes every alias exactly once, with nothing lost or duplicated", () => {
    expect(findCategorizationProblems()).toEqual([]);
    const grouped = groupInstrumentsByCategory();
    const flat = grouped.flatMap((g) => g.instruments);
    expect(flat).toHaveLength(ALIASES.length);
    expect(new Set(flat).size).toBe(ALIASES.length);
    // Every alias from the real preset table is present, not just a sample.
    for (const name of ALIASES) expect(flat).toContain(name);
  });

  it("only uses declared categories, and every category that is used has members", () => {
    for (const group of groupInstrumentsByCategory()) {
      expect(INSTRUMENT_CATEGORY_IDS).toContain(group.id);
      expect(group.instruments.length).toBeGreaterThan(0);
    }
  });

  it("has a localized label for every category, in both languages", () => {
    for (const id of INSTRUMENT_CATEGORY_IDS) {
      const entry = (DICTIONARY as Record<string, { en: string; zh: string }>)[`instrument_category_${id}`];
      expect(entry, `missing label for ${id}`).toBeDefined();
      expect(entry.en.length).toBeGreaterThan(0);
      expect(entry.zh.length).toBeGreaterThan(0);
    }
  });

  it("follows the naming rule where the name is honest", () => {
    expect(categoryForInstrument("reese_bass")).toBe("bass");
    expect(categoryForInstrument("sub_bass")).toBe("bass");
    expect(categoryForInstrument("saw_lead")).toBe("synthLead");
    expect(categoryForInstrument("warm_pad")).toBe("padTexture");
    expect(categoryForInstrument("nylon_guitar")).toBe("guitarPluck");
  });

  it("overrides the rule where the name would lie", () => {
    // By name these read as leads; by nature they are not.
    expect(categoryForInstrument("piano_lead")).toBe("keys");
    expect(categoryForInstrument("organ_lead")).toBe("keys");
    expect(categoryForInstrument("cowbell_lead")).toBe("malletPerc");
    expect(categoryForInstrument("marimba_lead")).toBe("malletPerc");
    expect(categoryForInstrument("distorted_kick")).toBe("drums");
    // Risers and stops are transitions, not instruments.
    expect(categoryForInstrument("noise_sweep")).toBe("fx");
    expect(categoryForInstrument("tape_stop")).toBe("fx");
    expect(categoryForInstrument("reverse_cymbal")).toBe("fx");
  });

  it("never leaves a category empty of the families a user would look for", () => {
    const byId = new Map(groupInstrumentsByCategory().map((g) => [g.id, g.instruments]));
    // These are the families the genre catalog actually leans on; an empty one would mean the
    // rule broke silently.
    for (const id of ["keys", "synthLead", "bass", "guitarPluck", "padTexture"] as const) {
      expect(byId.get(id)?.length ?? 0, id).toBeGreaterThan(0);
    }
  });
});
