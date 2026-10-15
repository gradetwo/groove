import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

/**
 * ⭐ **And the interface reaches it** (fifth Web evaluation, P2). The project's ledger rule is that an operation changing the
 * model must be reachable from Web source *and* from the protocol; both halves now exist, so this pins the web half to the
 * one place it lives rather than to "somewhere".
 */
describe("the preset chooser in the arrangement", () => {
  it("⭐ the track list draws it for synth tracks, and commits the command", () => {
    const list = readFileSync(resolve(__dirname, "../components/arrangement/TrackListV2.tsx"), "utf8");
    expect(list, "only a synth track gets the chooser").toMatch(/track\.kind === "synth" && onChangePreset/);
    expect(list, "with its own id").toContain("track-preset-${track.id}");
    expect(list, "and its options are the engine's preset names").toContain("presets!.map");

    const view = readFileSync(resolve(__dirname, "../components/arrangement/ArrangementViewV2.tsx"), "utf8");
    expect(view, "the view passes the preset names").toContain("presets={SYNTH_PRESET_KEYS}");
    expect(view, "and commits the command, so undo works").toContain("setTrackInstrumentCommand(trackId");
    expect(view, "the names come from the engine's table rather than a second list").toContain("Object.keys(DEFAULT_SYNTH_PRESETS)");
  });
});


/**
 * ⭐ **And the factory library reaches a lane too, on its own field** (this round). The 120 presets could be chosen by an
 * agent and by nothing else; this pins the Web half, and pins *which field* it writes.
 *
 * ⚠️ The distinction is the whole point: the dropdown above sets `track.instrument` (this repository's 19 handwritten,
 * genre-tuned patches), and a factory preset sets `track.gs1Patch` — a different field read by a different resolver. A
 * second control that quietly wrote `instrument` would appear to work and change the wrong thing.
 */
describe("the factory-preset chooser in the arrangement", () => {
  it("⭐ the track list draws it for synth tracks, grouped, with its own id", () => {
    const list = readFileSync(resolve(__dirname, "../components/arrangement/TrackListV2.tsx"), "utf8");
    expect(list, "only a synth track gets it").toMatch(/track\.kind === "synth" && onChangeSynthPreset/);
    expect(list, "with its own id, distinct from the instrument one").toContain("track-synth-preset-${track.id}");
    // Grouped by the synth's own categories rather than one flat list of 120.
    expect(list, "grouped by category").toContain("<optgroup");
    expect(list, "grouped by the preset's own cat").toMatch(/preset\.cat\)/);
  });

  it("⭐ the view commits the patch command with the preset's share code", () => {
    const view = readFileSync(resolve(__dirname, "../components/arrangement/ArrangementViewV2.tsx"), "utf8");
    expect(view, "the library comes from the generated table").toContain("synthPresets={SYNTH_PRESETS}");
    expect(view, "the field written is gs1Patch, not instrument").toContain("setTrackGs1PatchCommand(trackId");
    expect(view, "and it writes the code, which is what the model holds").toContain("preset.shareCode");
  });
});
