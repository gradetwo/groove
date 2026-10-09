import { describe, expect, it } from "vitest";
import { DEFAULT_SYNTH_PRESETS } from "../audio/PolySynth";
import { GLOBAL_DEFAULT_PRESET_KEY, resolveInstrumentPresetKey } from "../audio/instrumentPresets";

/**
 * ⭐ **The first half of ⑧-b**: a synth track must be able to *name* its preset.
 *
 * The fifth Web evaluation reported the gap — *"非 sampler 軌道沒有樂器切換入口"* — and reading the model showed why it is
 * not a one-line UI change: a synth track's sound is a **preset derived from its name and role**, with no field that says
 * which one. This adds the resolution half (an explicit choice wins, and an unknown key is ignored so the track still
 * sounds), leaving the model field and the chip to the next slice.
 */
describe("a synth track's preset, when one is chosen", () => {
  it("⭐ the explicit choice wins over the name and the role", () => {
    const key = Object.keys(DEFAULT_SYNTH_PRESETS)[0]!;
    expect(resolveInstrumentPresetKey("Bass", "bass", key)).toBe(key);
    expect(resolveInstrumentPresetKey(undefined, "lead", key)).toBe(key);
  });

  it("⭐ and an unknown key is ignored, so a project from another build still sounds", () => {
    expect(resolveInstrumentPresetKey(undefined, "bass", "aPresetThisBuildDoesNotHave")).toBe(
      resolveInstrumentPresetKey(undefined, "bass")
    );
    expect(resolveInstrumentPresetKey(undefined, "lead", "")).toBe(resolveInstrumentPresetKey(undefined, "lead"));
  });

  it("changes nothing when no choice is made", () => {
    expect(resolveInstrumentPresetKey(undefined, "lead")).toBe("analogLead");
    expect(resolveInstrumentPresetKey(undefined, "unknown-role")).toBe(GLOBAL_DEFAULT_PRESET_KEY);
  });
});
