/**
 * ⭐ **A saved sound has to be findable, and it has to survive being sent to somebody else.**
 *
 * Owner decision (2026-10-15): presets are **device-scoped, and exportable**. That is a correction of the first version,
 * which kept them on the arrangement — so a sound somebody shaped belonged to whichever project happened to be open, and
 * making it again in the next project was the only way to have it there. The library is now the device's, which is also
 * what these tools need: `save_gs1_preset` has no project to write to.
 *
 * The failures this file is about are the ones that read as success:
 *
 *   - **a save that stores nothing** — the first version computed the new list and dropped it, reporting success while
 *     writing nothing. The write is now explicit and its failure reported;
 *   - **a read that cannot tell "you have none" from "your file is broken"** — a missing file is a first run and an empty
 *     list; a malformed one is *reported*, because otherwise a corrupted library looks exactly like an empty one;
 *   - **an export that silently drops the overrides.** A patch's character can live in its parameter overrides and a share
 *     code cannot carry them, so the count of what did not travel is returned.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * ⚠️ **The data directory is redirected before the registry is imported**, because the tools resolve the file path from
 * `GROOVE_USER_DATA_DIR` at call time — a test that wrote to the real `~/.groove/` would replace somebody's library.
 */
const DATA_DIR = mkdtempSync(path.join(tmpdir(), "groove-presets-"));
process.env.GROOVE_USER_DATA_DIR = DATA_DIR;

const { GS1_TOOLS } = await import("../../mcp/registryGs1");
const { createMcpArrangement, setMcpTrackGs1 } = await import("../../mcp/arrangement");
const { synthPresetById } = await import("../data/synthPresets.generated");
const { userPresetFilePath } = await import("../../mcp/lib/userPresetFile");

const tool = (name: string) => GS1_TOOLS.find((entry) => entry.name === name)!;
type Reply = { content?: Array<{ text?: string }>; isError?: boolean };
const textOf = (reply: unknown) => ((reply as Reply).content?.[0]?.text ?? "");
const run = (name: string, args: Record<string, unknown>) => tool(name).handler(args, undefined as never);
const saved = () => JSON.parse(readFileSync(userPresetFilePath(), "utf8")) as Array<{ id: string; name: string; shareCode: string }>;

let arrangementId: string;
let trackId: string;
beforeEach(() => {
  // A fresh library per case, so one case's save cannot be another's starting point.
  rmSync(userPresetFilePath(), { force: true });
  const created = createMcpArrangement({ template: "empty" } as never);
  arrangementId = created.arrangementId;
  trackId = created.tracks[0]!.id;
  setMcpTrackGs1(arrangementId, trackId, synthPresetById("supersaw")!.shareCode, null);
});

describe("save_gs1_preset", () => {
  it("⭐ writes the lane's own code to the device library, not to the project", () => {
    const reply = run("save_gs1_preset", { arrangementId, track: trackId, name: "我的超级锯齿", cat: "LEAD" }) as {
      saved: { id: string; shareCode: string; cat: string };
      count: number;
    };
    expect(reply.saved.shareCode, "the lane's actual sound, not the synth's default").toBe(synthPresetById("supersaw")!.shareCode);
    expect(reply.saved.cat).toBe("LEAD");
    // ⭐ The file is the proof, and it is where the browser cannot see it — stated in the module's own header.
    expect(saved().map((preset) => preset.id)).toEqual([reply.saved.id]);
  });

  it("⭐ is visible from another project, which is the whole point of device scope", () => {
    run("save_gs1_preset", { arrangementId, track: trackId, name: "Shared across projects" });
    const other = createMcpArrangement({ template: "empty" } as never);
    const listed = run("list_user_presets", { arrangementId: other.arrangementId }) as { count: number };
    expect(listed.count, "a second project sees the same library").toBe(1);
    // And the first project does too, so nothing depends on which arrangement is open.
    expect((run("list_user_presets", { arrangementId }) as { count: number }).count).toBe(1);
  });

  it("⭐ refuses a blank name and an unknown lane, and saves nothing when it does", () => {
    expect(textOf(run("save_gs1_preset", { arrangementId, track: trackId, name: "   " }))).toMatch(/name/i);
    expect(textOf(run("save_gs1_preset", { arrangementId, track: "no-such-lane", name: "x" }))).toMatch(/no track/);
    expect(() => saved()).toThrow();
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
    expect(saved()[0]!.name).toBe("New");
    const id = saved()[0]!.id;
    expect(textOf(run("delete_user_preset", { arrangementId, preset: id }))).toBe("");
    expect(saved()).toEqual([]);
    expect(textOf(run("delete_user_preset", { arrangementId, preset: "ghost" }))).toMatch(/no user preset/);
  });

  it("⚠️ reports a malformed library instead of calling it empty", () => {
    writeFileSync(userPresetFilePath(), "{ this is not json", "utf8");
    // Without this the message would be a normal "you have no presets", and a corrupted file would be invisible.
    expect(textOf(run("list_user_presets", { arrangementId }))).toMatch(/not valid JSON/);
  });
});

describe("export and import", () => {
  it("⭐ exports the code the synth accepts, and reports what a code cannot carry", () => {
    run("save_gs1_preset", { arrangementId, track: trackId, name: "Shareable" });
    const out = run("export_gs1_preset", { arrangementId, preset: "Shareable" }) as { shareCode: string; overridesOmitted: number };
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
    expect(saved()).toHaveLength(1);
    expect(textOf(run("import_gs1_preset", { arrangementId, shareCode: "hello", name: "Broken" }))).toMatch(/gs1\.1\./);
    // ⭐ Import and export are the same format, which is what makes "share a preset" one string in either app — and the
    // only way a preset crosses between the browser's store and this one.
    const exported = run("export_gs1_preset", { arrangementId, preset: "From a friend" }) as { shareCode: string };
    expect(exported.shareCode).toBe(code);
  });
});
