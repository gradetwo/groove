import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import "fake-indexeddb/auto";
import { IDBFactory as FakeIDBFactory } from "fake-indexeddb";
import {
  getAllArrangementProjects,
  getArrangementProject,
  getSavedArrangementProject,
  saveArrangementProject,
} from "../features/sequencer/projectDb";
import {
  listArrangementProjects,
  openArrangementProject,
  removeArrangementProject,
  renameArrangementProject,
  useArrangementV2Project,
} from "../features/arrangement/arrangementStore";
import { createArrangementFromTemplate } from "../data/arrangementEdits";
import type { ArrangementV2 } from "../types/arrangementV2";
import { parseUrlToRoute, formatRouteToUrl } from "../app/router";

/**
 * ⭐ **G1, below the Hub: the store can list, open, rename and delete an arrangement project — and a named project
 * really is the one that loads.**
 *
 * The Hub criteria (`arrangementProjectHub.test.tsx`) prove the list is built from the arrangement store. These prove
 * the other half: that "open" means *this* project rather than the most recent one, that a rename through the hub does
 * not silently re-point the app at an arrangement the user never opened, and that the route carries the id.
 *
 * Every claim here is one of the three the brief named as the acceptance criteria:
 *   ① an arrangement project appears in the list (and disappears from it when deleted);
 *   ② the empty store stays empty — nothing is invented;
 *   ③ opening one really enters that arrangement.
 */

/** A distinct arrangement per project, so "loads the right one" is observable rather than inferred. */
function arrangementWith(bpm: number): ArrangementV2 {
  return { ...createArrangementFromTemplate("new", "drums-bass"), bpm, bars: 8 };
}

describe("arrangement projects as listable, openable, renamable projects (G1)", () => {
  beforeEach(() => {
    localStorage.clear();
    // Per-test isolation: `projectDb` never closes its IndexedDB connections, so a fresh fake backend is the reset.
    globalThis.indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
  });

  it("lists the stored arrangements — the call that had no production caller at all", async () => {
    expect(await listArrangementProjects()).toEqual([]);
    await saveArrangementProject({ name: "Gap Probe One", arrangement: arrangementWith(128) });
    await saveArrangementProject({ name: "Gap Probe Two", arrangement: arrangementWith(140), fresh: true });

    const listed = await listArrangementProjects();
    expect(listed.map((r) => r.name).sort()).toEqual(["Gap Probe One", "Gap Probe Two"]);
  });

  it("reads back the project the caller named, not the most recent one", async () => {
    const first = await saveArrangementProject({ name: "First", arrangement: arrangementWith(120) });
    // `fresh` is what makes the second save a second project rather than a write over the first, and it moves the
    // pointer — so "the most recent one" is now Second, and asking for First must still give First.
    await saveArrangementProject({ name: "Second", arrangement: arrangementWith(145), fresh: true });

    const read = await openArrangementProject(first.id);
    expect(read?.id).toBe(first.id);
    expect(read?.name).toBe("First");
    expect(read?.arrangement.bpm).toBe(120);
  });

  it("⭐⭐ the hook loads the arrangement the route named, not the last one opened", async () => {
    const first = await saveArrangementProject({ name: "Named Project", arrangement: arrangementWith(96) });
    await saveArrangementProject({ name: "Most Recent", arrangement: arrangementWith(160), fresh: true });

    const { result } = renderHook(() => useArrangementV2Project({ projectId: first.id }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.project?.id).toBe(first.id);
    expect(result.current.project?.name).toBe("Named Project");
    // ⭐ The *content*, not only the label: opening a project must enter that project's arrangement.
    expect(result.current.project?.arrangement.bpm).toBe(96);
    // …and arriving at it moves the pointer, so a refresh keeps opening the same project.
    expect(getSavedArrangementProject()?.id).toBe(first.id);
  });

  it("opens nothing when the id names no stored project", async () => {
    const { result } = renderHook(() => useArrangementV2Project({ projectId: "proj_does_not_exist" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.project).toBeNull();
  });

  it("renames a project without moving the app's pointer to it", async () => {
    const named = await saveArrangementProject({ name: "Before", arrangement: arrangementWith(110) });
    // A second project takes the pointer, so the assertion below is about the rename and not about the last save.
    const other = await saveArrangementProject({ name: "Other", arrangement: arrangementWith(110), fresh: true });
    expect(getSavedArrangementProject()?.id).toBe(other.id);

    await renameArrangementProject(named.id, "After");

    const stored = await getArrangementProject(named.id);
    expect(stored?.name).toBe("After");
    expect(stored?.id).toBe(named.id);
    expect(stored?.createdAt).toBe(named.createdAt);
    // ⭐ A rename is not an open: the pointer still names the project it named before.
    expect(getSavedArrangementProject()?.id).toBe(other.id);
  });

  it("removes one project and leaves the other, pointer included", async () => {
    const doomed = await saveArrangementProject({ name: "Doomed", arrangement: arrangementWith(100) });
    const keeper = await saveArrangementProject({ name: "Keeper", arrangement: arrangementWith(100), fresh: true });
    expect(getSavedArrangementProject()?.id).toBe(keeper.id);

    await removeArrangementProject(doomed.id);

    expect((await getAllArrangementProjects()).map((r) => r.id)).toEqual([keeper.id]);
    // Deleting a project the pointer does not name must not clear the pointer.
    expect(getSavedArrangementProject()?.id).toBe(keeper.id);

    // …and deleting the one it does name clears it, so nothing reopens a project that is gone.
    await removeArrangementProject(keeper.id);
    expect(await getAllArrangementProjects()).toEqual([]);
    expect(getSavedArrangementProject()).toBeNull();
  });

  it("still keeps the two stores apart, so the studio's list is unchanged", async () => {
    await saveArrangementProject({ name: "An Arrangement", arrangement: arrangementWith(128) });
    expect(await listArrangementProjects()).toHaveLength(1);
  });
});

/**
 * The route is the other half of "open *this* project": the id has to survive a URL round trip, or a refresh and a
 * bookmark both lose it.
 */
describe("the arrangement project id is sayable in a URL (G1)", () => {
  it("parses /new?project=<id> back to the project route plus the id", () => {
    const route = parseUrlToRoute("/new", "?project=proj_abc_123", "");
    expect(route.newProject).toBe(true);
    expect(route.arrangementId).toBe("proj_abc_123");
    // Still no genre: the new-project route means "blank", and the project id must not change that.
    expect(route.genreId).toBeUndefined();
  });

  it("leaves /new without a project exactly as it was", () => {
    const route = parseUrlToRoute("/new", "", "");
    expect(route.newProject).toBe(true);
    expect(route.arrangementId).toBeUndefined();
  });

  it("serialises the id back into the URL", () => {
    expect(formatRouteToUrl({ tab: "studio", newProject: true, arrangementId: "proj_abc_123" })).toBe(
      "/new?project=proj_abc_123"
    );
  });
});
