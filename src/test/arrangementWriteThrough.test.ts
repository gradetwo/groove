import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import "fake-indexeddb/auto";
import { IDBFactory as FakeIDBFactory } from "fake-indexeddb";
import { getArrangementProject, openProjectsDb, saveArrangementProject } from "../features/sequencer/projectDb";
import { useArrangementV2Project } from "../features/arrangement/arrangementStore";
import { createArrangementFromTemplate } from "../data/arrangementEdits";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * R2 — **the cheap half of the criterion: the write is issued in the caller's own task.**
 *
 * The expensive half is `scripts/probe_autosave_flush.mjs`, a real browser that changes the tempo and reloads inside
 * what used to be the debounce window. That probe is the only thing that can see the loss itself, because
 * `fake-indexeddb` never tears an in-flight transaction down with the document — the old unit criterion for exactly
 * this case (`arrangementPersistence.test.tsx`'s "an edit made before the refresh") was **green while the real browser
 * was losing the edit**, which is why a second, cheaper criterion is pinned here rather than trusted to that one.
 *
 * What a fake backend *can* see is the half that decides the browser outcome: **whether the write was scheduled or
 * made.** A `setTimeout(…, 600)` leaves nothing on the store when `report` returns; a write issued in the caller's
 * task does, and the real browser measured that difference as kept-versus-lost. So these assert the mechanism, and the
 * probe asserts the outcome.
 */

function arrangementWith(bpm: number): ArrangementV2 {
  return { ...createArrangementFromTemplate("new", "drums-bass"), bpm, bars: 8 };
}

/** Records every `ObjectStore.put` the code under test issues, in order, and restores the real one afterwards. */
function spyOnPuts() {
  const original = IDBObjectStore.prototype.put;
  const issued: Array<{ store: string; id: string | null }> = [];
  IDBObjectStore.prototype.put = function patched(this: IDBObjectStore, ...args: unknown[]) {
    const value = args[0] as { id?: string } | undefined;
    issued.push({ store: this.name, id: value?.id ?? null });
    return original.apply(this, args as [unknown]);
  };
  return {
    issued,
    restore: () => {
      IDBObjectStore.prototype.put = original;
    },
  };
}

describe("R2 · the arrangement write is issued in the caller's task", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
  });

  it("⭐ the save requests the store.put before its promise settles — no timer, no async open in between", async () => {
    // The connection a rendered route already has: the first write is what opens it, every later one is warm.
    await openProjectsDb();
    const spy = spyOnPuts();
    try {
      const pending = saveArrangementProject({ name: "Write Through", arrangement: arrangementWith(131) });
      // ⭐ Nothing was awaited. If this is empty, the request is somewhere in a timer or a promise chain, and a page
      // that is torn down before it resolves never issues it — the measured defect.
      expect(spy.issued.map((entry) => entry.store)).toEqual(["arrangements_v2"]);
      const saved = await pending;
      expect(spy.issued).toHaveLength(1);
      // Requested is not stored: the record is read back, so "a put was called" cannot pass while the write failed.
      expect((await getArrangementProject(saved.id))?.arrangement.bpm).toBe(131);
    } finally {
      spy.restore();
    }
  });

  it("⭐ a reported edit reaches the store in the report's own task, not after the delay the old hook scheduled", async () => {
    const { result } = renderHook(() => useArrangementV2Project());
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 5000 });

    act(() => {
      result.current.create("Reported Project", arrangementWith(120));
    });
    // The first write must have settled (and released the in-flight slot) before the measurement.
    await waitFor(() => expect(result.current.project?.id ?? "").not.toBe(""), { timeout: 5000 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const spy = spyOnPuts();
    try {
      act(() => {
        result.current.report(arrangementWith(137));
      });
      // ⭐ On the pre-fix hook this was `[]` until 600 ms passed; a refresh in that window lost the edit.
      expect(spy.issued.map((entry) => entry.store)).toEqual(["arrangements_v2"]);
      const projectId = result.current.project?.id ?? "";
      await waitFor(async () => expect((await getArrangementProject(projectId))?.arrangement.bpm).toBe(137), { timeout: 5000 });
    } finally {
      spy.restore();
    }
  });
});
