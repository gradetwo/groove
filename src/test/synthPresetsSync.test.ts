/**
 * ⭐ **The generated table has to be well formed, and every code has to be one this repository can load.**
 *
 * The synth's whole factory library lives in `synthPresets.generated.ts`, produced by
 * `scripts/sync_synth_presets.mjs` from the synth's own `gs1.presets.list` and `gs1.patch.get`. The regeneration check
 * (`node scripts/sync_synth_presets.mjs --check`) needs a **synth checkout**, which CI does not have — so this file
 * holds the properties CI *can* check, and the two are deliberately different jobs:
 *
 *   - `--check` answers "is this the synth's current answer?", and needs the synth;
 *   - this file answers "is this answer internally sound?", and needs nothing but the repository.
 *
 * The failure that matters most is the one a hand edit causes: 120 opaque base64url strings are not readable, so a
 * corrupted or truncated one looks exactly like a valid one. Decoding each through the same `decodeGs1PatchCode` that
 * `Gs1VoicePool` uses when it loads a lane's patch turns that into a red test rather than a silent wrong voice.
 */
import { describe, it, expect } from "vitest";
import {
  SYNTH_PRESETS,
  SYNTH_PRESET_CATEGORIES,
  synthPresetById,
  synthPresetsInCategory,
} from "../data/synthPresets.generated";
import { GS1_PATCH_PREFIX, decodeGs1PatchCode } from "../audio/gs1/gs1PatchCode";

describe("the generated synth preset table", () => {
  it("⭐ decodes every share code with this repository's own reader, so a corrupted row cannot pass", () => {
    expect(SYNTH_PRESETS.length, "the synth's whole factory library").toBe(120);
    for (const preset of SYNTH_PRESETS) {
      expect(preset.shareCode.startsWith(GS1_PATCH_PREFIX), `${preset.id} carries the plain prefix`).toBe(true);
      const decoded = decodeGs1PatchCode(preset.shareCode);
      expect(decoded.ok, `${preset.id} decodes: ${decoded.ok ? "" : decoded.problem}`).toBe(true);
    }
  });

  it("⭐ has no duplicate id or code, because two rows for one voice is a silent mistake", () => {
    const ids = new Set(SYNTH_PRESETS.map((preset) => preset.id));
    const codes = new Set(SYNTH_PRESETS.map((preset) => preset.shareCode));
    expect(ids.size, "ids are unique").toBe(SYNTH_PRESETS.length);
    // A duplicate code would mean two different presets load the same sound — invisible in the data, wrong on the ear.
    expect(codes.size, "codes are unique").toBe(SYNTH_PRESETS.length);
  });

  it("⭐ uses the synth's own categories, and every preset names one of them", () => {
    /**
     * ⭐ The categories are the synth's (`PRESET_CATEGORIES` in its `preset-model.ts`), read from its own catalogue rather
     * than invented here: a second taxonomy would make groove's selector and the synth's drawer disagree about what a
     * preset is, which is the drift this table exists to prevent.
     */
    expect([...SYNTH_PRESET_CATEGORIES]).toEqual(["BASIC", "BASS", "FX", "KEYS", "LEAD", "PAD", "PLUCK"]);
    for (const preset of SYNTH_PRESETS) {
      expect(SYNTH_PRESET_CATEGORIES).toContain(preset.cat);
    }
    // Every category holds something, and the categories account for every preset exactly once.
    const summed = SYNTH_PRESET_CATEGORIES.reduce((total, cat) => total + synthPresetsInCategory(cat).length, 0);
    expect(summed, "no preset is outside a category").toBe(SYNTH_PRESETS.length);
    for (const cat of SYNTH_PRESET_CATEGORIES) {
      expect(synthPresetsInCategory(cat).length, `${cat} is not empty`).toBeGreaterThan(0);
    }
  });

  it("⭐ names the presets the owner asked for by id, and refuses an id the synth does not have", () => {
    // The three the proposal named as the reason this work exists, plus the vocal ones already in use.
    for (const id of ["catlead", "bladerunner", "dxepiano", "vocalah", "vocalhum"]) {
      expect(synthPresetById(id), `${id} is a preset a caller may ask for`).toBeDefined();
    }
    expect(synthPresetById("no-such-preset")).toBeUndefined();
    // Every row carries a name a selector can show, which is what makes browsing possible at all.
    for (const preset of SYNTH_PRESETS) {
      expect(preset.name.length, `${preset.id} has a display name`).toBeGreaterThan(0);
    }
  });

  it("⭐ carries the nine vocal patches' ids, so the vocal lane's five and the library cannot disagree", () => {
    // These are the formant vowels `data/vocalPatches.ts` was built from; the table has to contain them rather than
    // shadow them, or a caller could pick a "vocal" preset the vocal tool does not know.
    for (const id of ["vocalah", "vocaloh", "vocalee", "vocaloo", "vocalhum"]) {
      expect(synthPresetById(id)!.shareCode.length).toBeGreaterThan(100);
    }
  });
});
