/**
 * ⭐ **Saving a sound has to survive the two things that lose it: a rename, and being sent to somebody else.**
 *
 * The synth ships 120 factory presets and this repository can now apply any of them and write parameters on top. What it
 * could not do is **keep** the result, so a person shaped a sound and lost it when they closed the project. These presets
 * live on the arrangement, so a `.groove` file carries the sounds its lanes use.
 *
 * The failures worth catching, each of which reads as success:
 *
 *   - **an id derived from a counter or a random source.** A counter collides when two projects merge (both hold
 *     `user-1`); randomness makes an export differ from the import of it. The id is derived from the name plus the save
 *     time instead, and two saves in the same millisecond under one name are suffixed rather than overwriting each other;
 *   - **a code that could never be a share code being stored.** It would reach a lane and fail there, far from the call
 *     that caused it, so it is refused at the door;
 *   - **an export that quietly drops what the sound actually is.** A preset's character can live in its overrides, and the
 *     format both apps speak is the **base code** — so export reports how much it left behind rather than pretending the
 *     string is the whole patch.
 */
import { describe, it, expect } from "vitest";
import {
  USER_PRESET_CATEGORY,
  deleteUserPreset,
  exportUserPreset,
  findUserPreset,
  importUserPreset,
  renameUserPreset,
  saveUserPreset,
  type UserPreset,
} from "../data/userPresets";
import { synthPresetById } from "../data/synthPresets.generated";

const CODE = synthPresetById("supersaw")!.shareCode;
const ok = (result: ReturnType<typeof saveUserPreset>): { presets: UserPreset[]; saved: UserPreset } => {
  if ("problem" in result) throw new Error(`expected a save, got: ${result.problem}`);
  return result;
};

describe("saveUserPreset", () => {
  it("⭐ keeps the name, the code and the category a person filed it under", () => {
    const { presets, saved } = ok(saveUserPreset([], { name: "我的超级锯齿", cat: "LEAD", shareCode: CODE, savedAt: "2026-10-15T10:00:00.000Z" }));
    expect(presets).toHaveLength(1);
    expect(saved.name).toBe("我的超级锯齿");
    expect(saved.cat).toBe("LEAD");
    expect(saved.shareCode).toBe(CODE);
    expect(saved.savedAt).toBe("2026-10-15T10:00:00.000Z");
    // A category is optional; one that fits none of the synth's is filed under the project's own bucket.
    expect(ok(saveUserPreset([], { name: "x", shareCode: CODE })).saved.cat).toBe(USER_PRESET_CATEGORY);
  });

  it("⭐ refuses a code that could never be a share code, naming the format", () => {
    const result = saveUserPreset([], { name: "broken", shareCode: "gs1.2.not-a-patch" });
    expect("problem" in result && result.problem).toMatch(/gs1\.1\./);
    // And an unnamed preset is refused: the name is how a person finds it again.
    const unnamed = saveUserPreset([], { name: "   ", shareCode: CODE });
    expect("problem" in unnamed && unnamed.problem).toMatch(/name/);
  });

  it("⭐ derives the id from the name and the time, and suffixes rather than overwriting", () => {
    const at = "2026-10-15T10:00:00.000Z";
    const first = ok(saveUserPreset([], { name: "Super Saw", shareCode: CODE, savedAt: at }));
    // Same name, same millisecond: the second must not replace the first.
    const second = ok(saveUserPreset(first.presets, { name: "Super Saw", shareCode: CODE, savedAt: at }));
    expect(second.presets).toHaveLength(2);
    expect(second.saved.id).not.toBe(first.saved.id);
    // The id is readable and stable, not a random string that would differ between two exports of the same project.
    expect(first.saved.id).toMatch(/^user-super-saw-20261015100000$/);
    expect(ok(saveUserPreset([], { name: "Super Saw", shareCode: CODE, savedAt: at })).saved.id).toBe(first.saved.id);
  });
});

describe("rename, delete and find", () => {
  const base = ok(saveUserPreset([], { name: "First", shareCode: CODE, savedAt: "2026-10-15T10:00:00.000Z" }));

  it("⭐ renames by id, so two presets sharing a name are still addressable", () => {
    const twin = ok(saveUserPreset(base.presets, { name: "First", shareCode: CODE, savedAt: "2026-10-15T10:00:01.000Z" }));
    const renamed = renameUserPreset(twin.presets, twin.saved.id, "Second");
    expect(renamed.map((preset) => preset.name)).toEqual(["First", "Second"]);
    // An empty name is refused rather than blanking the entry.
    expect(renameUserPreset(renamed, twin.saved.id, "  ").map((p) => p.name)).toEqual(["First", "Second"]);
  });

  it("⭐ deletes by id and ignores an unknown one, so a double delete is not an error", () => {
    expect(deleteUserPreset(base.presets, base.saved.id)).toHaveLength(0);
    expect(deleteUserPreset(base.presets, "user-nope-1")).toHaveLength(1);
  });

  it("⭐ finds by id or by the name a person reads off the screen", () => {
    expect(findUserPreset(base.presets, base.saved.id)?.name).toBe("First");
    expect(findUserPreset(base.presets, "First")?.name).toBe("First");
    expect(findUserPreset(base.presets, "Third")).toBeUndefined();
  });
});

describe("export and import", () => {
  it("⭐ exports the base code, and says how much the overrides carried", () => {
    const plain = ok(saveUserPreset([], { name: "Plain", shareCode: CODE })).saved;
    expect(exportUserPreset(plain)).toEqual({ shareCode: CODE, overridesOmitted: 0 });

    /**
     * ⚠️ A patch whose character lives in its overrides: the export is still the base code, because that is the format the
     * synth's own reader accepts. The count is what stops that from being a silent loss.
     */
    const shaped: UserPreset = {
      ...plain,
      overrides: { parameters: [{ id: 14, value: 0.5 }], routes: [{ source: 1, target: 2, amount: 0.3 }] } as never,
    };
    const out = exportUserPreset(shaped);
    expect(out.shareCode).toBe(CODE);
    expect(out.overridesOmitted, "the caller can tell the recipient what did not travel").toBe(2);
  });

  it("⭐ imports a share code as a new preset, and refuses a malformed one", () => {
    const imported = importUserPreset([], { shareCode: ` ${CODE} `, name: "From a friend" });
    expect("problem" in imported).toBe(false);
    if ("problem" in imported) return;
    // Whitespace is trimmed, because a pasted code often carries some.
    expect(imported.saved.shareCode).toBe(CODE);
    const bad = importUserPreset([], { shareCode: "hello", name: "From nowhere" });
    expect("problem" in bad && bad.problem).toMatch(/gs1\.1\./);
  });
});
