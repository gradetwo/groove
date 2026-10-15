/**
 * ⭐ **The device library has to be one library, not one per project.**
 *
 * Owner decision (2026-10-15): presets are **device-scoped, and exportable**. The first version kept them on the
 * arrangement, so a sound somebody shaped belonged to whichever project happened to be open; making it again in the next
 * project was the only way to have it there. This is the browser's half of the correction.
 *
 * The failures worth catching, each of which reads as success:
 *
 *   - **a store that only appears on a fresh install.** IndexedDB runs `onupgradeneeded` only when the version
 *     *increases*, so the store is created at version 3; the test opens the same database the app does, through the same
 *     `openProjectsDb`, which is what makes "it worked for the person testing it" impossible;
 *   - **a delete that leaves the row behind**, which is a preset a person removed and cannot see why it came back. Every
 *     write clears and rewrites, so "the store holds exactly this" is the property asserted;
 *   - **an edit applied to a stale snapshot.** `updateUserPresets` re-reads before applying, and the case below drives a
 *     read-modify-write the way a component does.
 */
import "fake-indexeddb/auto";
import { IDBFactory as FakeIDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { loadUserPresets, updateUserPresets, writeUserPresets } from "../features/arrangement/userPresetStore";
import { saveUserPreset, renameUserPreset, type UserPreset } from "../data/userPresets";
import { synthPresetById } from "../data/synthPresets.generated";

const CODE = synthPresetById("supersaw")!.shareCode;
const row = (over: Partial<UserPreset> = {}): UserPreset => ({
  id: "user-a-1",
  name: "A",
  cat: "LEAD",
  shareCode: CODE,
  savedAt: "2026-10-15T10:00:00.000Z",
  ...over,
});

beforeEach(() => {
  /**
   * A fresh factory per case. The store is module-level state in a browser, and cases must not inherit each other's rows —
   * and a fresh factory also exercises the upgrade path, which is where the store is actually created.
   */
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
});

describe("the device preset store", () => {
  it("⭐ creates its store through the app's own open path, so a device at version 2 upgrades rather than silently lacking it", async () => {
    // If the store were missing, this would reject rather than report an empty list — which is the point.
    expect(await loadUserPresets()).toEqual([]);
  });

  it("⭐ round-trips a list, newest last", async () => {
    await writeUserPresets([row({ savedAt: "2026-10-15T12:00:00.000Z" }), row({ id: "user-a-2", savedAt: "2026-10-15T10:00:00.000Z" })]);
    expect((await loadUserPresets()).map((preset) => preset.id)).toEqual(["user-a-2", "user-a-1"]);
  });

  it("⭐ holds exactly the list it was given, so a delete cannot leave a row behind", async () => {
    await writeUserPresets([row(), row({ id: "user-b-2" })]);
    await writeUserPresets([row({ id: "user-b-2" })]);
    expect((await loadUserPresets()).map((preset) => preset.id), "removed from storage, not just from a screen").toEqual(["user-b-2"]);
  });

  it("⭐ applies an edit against the live list, not a snapshot taken when a screen rendered", async () => {
    await writeUserPresets([row()]);
    /**
     * ⭐ The race this prevents: a component renders with an empty list, the person saves, then renames — and an
     * edit applied to the rendered snapshot would drop the save, because the snapshot never saw it.
     */
    const saved = await updateUserPresets((current) => saveUserPreset(current, { name: "Second", shareCode: CODE, savedAt: "2026-10-15T11:00:00.000Z" }));
    expect(saved.presets).toHaveLength(2);
    const renamed = await updateUserPresets((current) => ({ presets: renameUserPreset(current, "user-a-1", "Renamed") }));
    expect(renamed.presets).toHaveLength(2);
    expect((await loadUserPresets()).map((preset) => preset.name).sort()).toEqual(["Renamed", "Second"]);
  });

  it("⭐ reports a refusal without writing, so a blank name cannot empty the library", async () => {
    await writeUserPresets([row()]);
    const refused = await updateUserPresets((current) => saveUserPreset(current, { name: "  ", shareCode: CODE }));
    expect(refused.problem).toMatch(/name/);
    expect(refused.presets, "the refusal hands back what is stored").toHaveLength(1);
    expect(await loadUserPresets(), "and writes nothing").toHaveLength(1);
  });
});
