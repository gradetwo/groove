/**
 * ⭐ **The Web had no way at all to give a lane one of the synth's 120 presets.**
 *
 * `TrackV2.gs1Patch` has existed for a while and the MCP writes it (`apply_gs1_patch`, and `load_synth_preset` since this
 * round), but nothing in the UI could: the arrangement view's preset dropdown writes `track.instrument` — this repository's
 * 19 handwritten, genre-tuned patches — which is a **different field read by a different resolver**. So the model half
 * (`setTrackGs1Patch`) and its undo step are what make a control possible, and this file holds their contract.
 *
 * The failures worth catching:
 *
 *   - **writing a patch onto a lane that cannot sound through one.** A drumkit's sound is its role and a sampler's is its
 *     `sample`, so a control there would look like it worked and change nothing audible;
 *   - **"clearing" reaching a third state.** `resolveGs1Lane` reads an *absent* `gs1Patch` as "ask the instrument table", so
 *     clearing has to remove the field rather than store `""` — otherwise a cleared lane looks set and sounds default;
 *   - **an undo that does not restore.** The command stores the before/after **share codes**, because the code is what the
 *     model holds; a command that stored preset *ids* would undo to whatever id was named and not to the sound that was
 *     actually there (which may have come from the synth app, pasted in).
 */
import { describe, it, expect } from "vitest";
import { setTrackGs1Patch } from "../data/arrangementEdits";
import { setTrackGs1PatchCommand } from "../data/arrangementHistory";
import type { ArrangementV2 } from "../types/arrangementV2";
import { SYNTH_PRESETS, synthPresetById } from "../data/synthPresets.generated";

const track = (over: Record<string, unknown> = {}) =>
  ({ id: "t1", kind: "synth", name: "Lead", instrument: "supersawStack", ...over }) as never;

const arrangement = (tracks: unknown[]) => ({ id: "a1", tracks } as unknown as ArrangementV2);
const codeOf = (a: ArrangementV2) => (a.tracks[0] as { gs1Patch?: string }).gs1Patch;

describe("setTrackGs1Patch", () => {
  it("⭐ writes the share code onto a synth lane", () => {
    const code = synthPresetById("catlead")!.shareCode;
    const next = setTrackGs1Patch(arrangement([track()]), "t1", code);
    expect(codeOf(next)).toBe(code);
  });

  it("⭐ leaves a lane that cannot sound through a patch alone", () => {
    // A drumkit's sound is its role and a sampler's is its `sample`, so a patch here would be a control nobody can hear.
    for (const kind of ["drumkit", "sampler"]) {
      const next = setTrackGs1Patch(arrangement([track({ kind })]), "t1", synthPresetById("catlead")!.shareCode);
      expect(codeOf(next), `${kind} is not touched`).toBeUndefined();
    }
    // And an unknown track is a no-op rather than a throw.
    const untouched = setTrackGs1Patch(arrangement([track()]), "nope", synthPresetById("catlead")!.shareCode);
    expect(codeOf(untouched)).toBeUndefined();
  });

  it("⭐ clearing removes the field, because absent is what means 'ask the instrument table'", () => {
    const withPatch = setTrackGs1Patch(arrangement([track()]), "t1", synthPresetById("catlead")!.shareCode);
    const cleared = setTrackGs1Patch(withPatch, "t1", "");
    expect(codeOf(cleared), "not stored as an empty string").toBeUndefined();
    expect("gs1Patch" in (cleared.tracks[0] as object), "the key is gone, not blank").toBe(false);
  });
});

describe("setTrackGs1PatchCommand", () => {
  it("⭐ undoes to the code that was actually there, not to a preset id", () => {
    const before = synthPresetById("vocalah")!.shareCode;
    const after = synthPresetById("bladerunner")!.shareCode;
    const start = setTrackGs1Patch(arrangement([track()]), "t1", before);
    const command = setTrackGs1PatchCommand("t1", before, after);

    const redone = command.redo(start);
    expect(codeOf(redone)).toBe(after);
    expect(codeOf(command.undo(redone))).toBe(before);
  });

  it("⭐ undoing a first-ever choice clears the field rather than restoring an empty code", () => {
    const command = setTrackGs1PatchCommand("t1", "", synthPresetById("dxepiano")!.shareCode);
    const chosen = command.redo(arrangement([track()]));
    expect(codeOf(chosen)).toBe(synthPresetById("dxepiano")!.shareCode);
    expect("gs1Patch" in (command.undo(chosen).tracks[0] as object)).toBe(false);
  });
});

describe("the presets a control can offer", () => {
  it("⭐ every offered preset carries an id, a name for the label, and a category to group by", () => {
    expect(SYNTH_PRESETS.length).toBeGreaterThan(0);
    for (const preset of SYNTH_PRESETS) {
      expect(preset.id.length).toBeGreaterThan(0);
      expect(preset.name.length, `${preset.id} has a label`).toBeGreaterThan(0);
      expect(preset.cat.length, `${preset.id} has a category to group under`).toBeGreaterThan(0);
    }
    // The categories a `<optgroup>` would draw are few enough to be useful as headers.
    expect(new Set(SYNTH_PRESETS.map((preset) => preset.cat)).size).toBeLessThanOrEqual(9);
  });
});
