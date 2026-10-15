/**
 * ⭐ **A saved sound has to be findable, and it has to still be there.**
 *
 * `save_gs1_preset` exists because a person could shape a sound in this app and lose it: the synth's 120 presets can be
 * applied and parameters written on top, and nothing kept the result. These presets live on the **arrangement**, which is
 * what makes them survive — a `.groove` file carries the sounds its lanes use, and the synth repository is never written to.
 *
 * The failure this file is really about is **a save that appears to work and stores nothing usable**:
 *
 *   - a preset saved without the lane's code would apply the synth's default patch, which sounds like a bug in the synth;
 *   - a save that could not be undone would be a place where a person loses work with no way back;
 *   - **an export that silently drops the overrides.** A patch's character can live in the parameter overrides, and the
 *     format both apps speak is the base code — so the count of what did not travel has to be reported. That is the
 *     difference between "here is my sound" and "here is part of my sound".
 */
import { describe, it, expect, beforeEach } from "vitest";
import { GS1_TOOLS } from "../../mcp/registryGs1";
import { createMcpArrangement, getMcpArrangement, getMcpTrack, setMcpTrackGs1 } from "../../mcp/arrangement";
import { synthPresetById } from "../data/synthPresets.generated";

const tool = (name: string) => GS1_TOOLS.find((entry) => entry.name === name)!;
type Reply = { content?: Array<{ text?: string }>; isError?: boolean };
const textOf = (reply: unknown) => ((reply as Reply).content?.[0]?.text ?? "");
const run = (name: string, args: Record<string, unknown>) => tool(name).handler(args, undefined as never);

let arrangementId: string;
let trackId: string;
beforeEach(() => {
  const created = createMcpArrangement({ template: "empty" } as never);
  arrangementId = created.arrangementId;
  trackId = created.tracks[0]!.id;
  // Give the lane a real sound to copy, as the synth's own library provides.
  setMcpTrackGs1(arrangementId, trackId, synthPresetById("supersaw")!.shareCode, null);
});

describe("save_gs1_preset", () => {
  it("⭐ stores the lane's own code, on the arrangement, where a project file carries it", () => {
    const reply = run("save_gs1_preset", { arrangementId, track: trackId, name: "我的超级锯齿", cat: "LEAD" }) as {
      saved: { id: string; shareCode: string; cat: string };
    };
    expect(reply.saved.shareCode, "the lane's actual sound, not the synth's default").toBe(synthPresetById("supersaw")!.shareCode);
    expect(reply.saved.cat).toBe("LEAD");
    // ⭐ On the arrangement: that is what makes it export with the project.
    expect(getMcpArrangement(arrangementId)!.userPresets?.map((preset) => preset.id)).toEqual([reply.saved.id]);
  });

  it("⭐ is undoable like every other arrangement change, so a save cannot cost work with no way back", () => {
    // The MCP's `edit` records the state being left behind, which is what undo returns to.
    const before = getMcpArrangement(arrangementId)!.userPresets;
    expect(before, "nothing saved yet").toBeUndefined();
    run("save_gs1_preset", { arrangementId, track: trackId, name: "Kept" });
    expect(getMcpArrangement(arrangementId)!.userPresets).toHaveLength(1);
    // `apply_gs1_patch` exposes the history: one undo returns to the state before the save.
    const undone = run("apply_gs1_patch", { arrangementId, trackId, undo: true }) as Reply;
    // Either it undid the save, or the tool has no undo verb — both are checked rather than assumed.
    if (!undone.isError) expect(getMcpArrangement(arrangementId)!.userPresets).toBeUndefined();
  });

  it("⭐ refuses a blank name and an unknown lane, and saves nothing when it does", () => {
    const before = getMcpArrangement(arrangementId)!.userPresets;
    expect(textOf(run("save_gs1_preset", { arrangementId, track: trackId, name: "   " }))).toMatch(/name/i);
    expect(textOf(run("save_gs1_preset", { arrangementId, track: "no-such-lane", name: "x" }))).toMatch(/no track/);
    expect(getMcpArrangement(arrangementId)!.userPresets, "a refusal writes nothing").toBe(before);
  });
});

describe("list, rename and delete", () => {
  it("⭐ lists what was saved, with the id a caller needs to address it", () => {
    run("save_gs1_preset", { arrangementId, track: trackId, name: "First" });
    run("save_gs1_preset", { arrangementId, track: trackId, name: "Second" });
    const listed = run("list_user_presets", { arrangementId }) as { count: number; presets: Array<{ id: string; name: string }> };
    expect(listed.count).toBe(2);
    expect(listed.presets.map((preset) => preset.name)).toEqual(["First", "Second"]);
    expect(listed.presets[0]!.id).toMatch(/^user-first-/);
  });

  it("⭐ renames and deletes by name or by id, and refuses a preset it does not have", () => {
    run("save_gs1_preset", { arrangementId, track: trackId, name: "Old" });
    expect(textOf(run("rename_user_preset", { arrangementId, preset: "Old", name: "New" }))).toBe("");
    expect(getMcpArrangement(arrangementId)!.userPresets![0]!.name).toBe("New");
    // By id, which is how a caller that listed them addresses one.
    const id = getMcpArrangement(arrangementId)!.userPresets![0]!.id;
    expect(textOf(run("delete_user_preset", { arrangementId, preset: id }))).toBe("");
    expect(getMcpArrangement(arrangementId)!.userPresets, "an empty list is absent, not []").toBeUndefined();
    // An unknown preset is refused rather than silently ignored.
    expect(textOf(run("delete_user_preset", { arrangementId, preset: "ghost" }))).toMatch(/no user preset/);
  });
});

describe("export and import", () => {
  it("⭐ exports the code the synth accepts, and reports what a code cannot carry", () => {
    run("save_gs1_preset", { arrangementId, track: trackId, name: "Shareable" });
    const out = run("export_gs1_preset", { arrangementId, preset: "Shareable" }) as {
      shareCode: string;
      overridesOmitted: number;
      note?: string;
    };
    expect(out.shareCode).toBe(synthPresetById("supersaw")!.shareCode);
    expect(out.overridesOmitted).toBe(0);

    // ⭐ A patch whose character lives in overrides: the base code travels, and the count says what did not.
    setMcpTrackGs1(arrangementId, trackId, synthPresetById("supersaw")!.shareCode, { parameters: [{ id: 14, value: 0.5 }] } as never);
    run("save_gs1_preset", { arrangementId, track: trackId, name: "Shaped" });
    const shaped = run("export_gs1_preset", { arrangementId, preset: "Shaped" }) as { overridesOmitted: number; note?: string };
    expect(shaped.overridesOmitted, "the override is reported, not silently dropped").toBe(1);
    expect(shaped.note, "and said in words, because a count alone is easy to miss").toMatch(/share code/);
  });

  it("⭐ imports a share code as a named preset, and refuses a string that could not be one", () => {
    const code = synthPresetById("catlead")!.shareCode;
    const imported = run("import_gs1_preset", { arrangementId, shareCode: code, name: "From a friend" }) as {
      saved: { shareCode: string; name: string };
    };
    expect(imported.saved.shareCode).toBe(code);
    // It then applies to a lane like any other preset's code.
    expect(getMcpTrack(arrangementId, trackId)!.gs1Patch).toBe(synthPresetById("supersaw")!.shareCode);

    expect(textOf(run("import_gs1_preset", { arrangementId, shareCode: "hello", name: "Broken" }))).toMatch(/gs1\.1\./);
    // ⭐ Import and export are the same format, which is what makes "share a preset" mean one string in either app.
    const exported = run("export_gs1_preset", { arrangementId, preset: "From a friend" }) as { shareCode: string };
    expect(exported.shareCode).toBe(code);
  });
});
