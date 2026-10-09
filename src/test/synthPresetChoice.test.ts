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

/**
 * ⭐ **And the model half, which turned out to be one field.** A synth track already carries `instrument`, and the resolver's
 * first step is an exact match against the preset keys — so naming `warmPad` there is already heard. What was missing was a
 * writer, which is what the evaluation's *"沒有樂器切換入口"* actually describes.
 */
describe("pointing a synth track at a preset", () => {
  const track = (kind: string, id = "t1", instrument = "Bass") => ({ id, name: "Bass", kind, instrument }) as never;
  const arrangement = (tracks: unknown[]) => ({ tracks }) as never;

  it("⭐ writes the instrument onto a synth track", async () => {
    const { setTrackInstrument } = await import("../data/arrangementEdits");
    const after = setTrackInstrument(arrangement([track("synth")]), "t1", "warmPad") as { tracks: Array<{ instrument?: string }> };
    expect(after.tracks[0]?.instrument).toBe("warmPad");
    // ⭐ And the resolver then hears it, because its first step is the exact key match.
    expect(resolveInstrumentPresetKey(after.tracks[0]?.instrument, "bass")).toBe("warmPad");
  });

  it("⭐ refuses to write it onto a drumkit or a sampler, whose sound is not a preset", async () => {
    const { setTrackInstrument } = await import("../data/arrangementEdits");
    for (const kind of ["drumkit", "sampler", "fx", "folder"]) {
      const after = setTrackInstrument(arrangement([track(kind)]), "t1", "warmPad") as { tracks: Array<{ instrument?: string }> };
      expect(after.tracks[0]?.instrument, `${kind} keeps its instrument`).toBe("Bass");
    }
  });

  it("ignores an empty name rather than blanking the track's sound", async () => {
    const { setTrackInstrument } = await import("../data/arrangementEdits");
    const after = setTrackInstrument(arrangement([track("synth")]), "t1", "   ") as { tracks: Array<{ instrument?: string }> };
    expect(after.tracks[0]?.instrument).toBe("Bass");
  });
});

