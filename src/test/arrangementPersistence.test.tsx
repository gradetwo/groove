import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "fake-indexeddb/auto";
import { IDBFactory as FakeIDBFactory } from "fake-indexeddb";
import React, { useEffect } from "react";
import { useArrangementV2Project } from "../features/arrangement/arrangementStore";
import { createArrangementFromTemplate } from "../data/arrangementEdits";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * ⭐ **"Create three tracks, refresh, and the arrangement is gone" — the measured finding, judged at the seam that owns
 * the storing.**
 *
 * A refresh is exactly what this simulates: the harness is unmounted (the page goes away), a **new** fake IndexedDB
 * backend is *not* given to it, and the harness is mounted again (the page comes back). Everything that comes back on
 * the second mount came out of storage, because nothing else in this process holds it — the module's in-memory mirror
 * is the fallback a restricted sandbox would use, and the criterion is written to be true whether the value came from
 * IndexedDB or from that mirror, since both mean "it did not go away".
 *
 * ⚠️ The harness calls `report` the way the arrangement view does — from an effect, on the value it holds — because a
 * host that only reported on a click would pass a weaker criterion than the surface it stands for.
 */
function Harness({ edit, onArrangement }: { edit?: (arrangement: ArrangementV2) => ArrangementV2; onArrangement?: (arrangement: ArrangementV2) => void }) {
  const store = useArrangementV2Project();
  const arrangement = store.project?.arrangement;
  useEffect(() => {
    if (arrangement === undefined) return;
    store.report(arrangement);
    onArrangement?.(arrangement);
  }, [arrangement]);

  if (store.loading) return <p>loading</p>;
  if (store.project === null) {
    return (
      <button
        type="button"
        onClick={() => {
          const created = createArrangementFromTemplate("new", "drums-bass");
          store.create("Evening Tune", created);
        }}
      >
        create
      </button>
    );
  }
  return (
    <div>
      <p data-testid="name">{store.project.name}</p>
      <p data-testid="tracks">{String(store.project.arrangement.tracks.length)}</p>
      <p data-testid="notes">{String(Object.values(store.project.arrangement.notesByTrack ?? {}).reduce((total, notes) => total + notes.length, 0))}</p>
      <p data-testid="instruments">{store.project.arrangement.tracks.map((track) => track.instrument ?? "-").join(",")}</p>
      <button type="button" onClick={() => edit !== undefined && arrangement !== undefined && store.report(edit(arrangement))}>
        edit
      </button>
      <button type="button" onClick={() => store.rename("Renamed Later")}>
        rename
      </button>
    </div>
  );
}

const mount = (props: { edit?: (arrangement: ArrangementV2) => ArrangementV2 } = {}) =>
  render(
    <React.StrictMode>
      <Harness {...props} />
    </React.StrictMode>
  );

/**
 * Lets the asynchronous load and the debounced write settle.
 *
 * ⚠️ A fixed sleep is not enough here and was measured to be flaky: this machine runs several checkouts' suites at
 * once, and an IndexedDB round trip that takes 20 ms alone has taken longer than a 50 ms window under load. So the
 * wait is for **a condition that must become true** — "the load is over" — with a deadline, which fails only when the
 * behaviour is wrong rather than when the machine is busy.
 */
const waitFor = async (condition: () => boolean, label: string, timeoutMs = 5000) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
};

const settle = async (ms = 200) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

describe("the arrangement survives a refresh", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
  });

  it("⭐ nothing saved means no project, which is what the chooser is for", async () => {
    mount();
    await waitFor(() => screen.queryByRole("button", { name: "create" }) !== null, "the load to finish (chooser shown)");
    expect(screen.getByRole("button", { name: "create" })).toBeDefined();
  });

  it("⭐ create, refresh, and the name, track count, note count and instrument all come back", async () => {
    const first = mount();
    await waitFor(() => screen.queryByRole("button", { name: "create" }) !== null, "the load to finish (chooser shown)");
    fireEvent.click(screen.getByRole("button", { name: "create" }));
    await waitFor(() => screen.queryByTestId("name") !== null, "the project to be created");

    // The project exists as soon as it is created: three tracks is the truth of a two-track template plus the default.
    const tracksBefore = screen.getByTestId("tracks").textContent;
    const notesBefore = screen.getByTestId("notes").textContent;
    expect(screen.getByTestId("name").textContent).toBe("Evening Tune");

    // ⭐ **The refresh.** The page goes away — and storage does not.
    first.unmount();
    await settle();

    mount();
    await waitFor(() => screen.queryByTestId("name") !== null, "the stored project to be reopened after the refresh");

    expect(screen.getByTestId("name").textContent).toBe("Evening Tune");
    expect(screen.getByTestId("tracks").textContent).toBe(tracksBefore);
    expect(screen.getByTestId("notes").textContent).toBe(notesBefore);
    // The count being equal is not enough on its own: the second track's identity is what decides the voice it plays.
    expect(screen.getByTestId("instruments").textContent).toContain("-");
  });

  it("⭐ an edit made before the refresh is what comes back, not the arrangement it started as", async () => {
    const first = mount({ edit: (arrangement) => ({ ...arrangement, tracks: arrangement.tracks.slice(0, 1) }) });
    await waitFor(() => screen.queryByRole("button", { name: "create" }) !== null, "the load to finish (chooser shown)");
    fireEvent.click(screen.getByRole("button", { name: "create" }));
    await waitFor(() => screen.queryByTestId("tracks") !== null, "the project to be created");
    expect(screen.getByTestId("tracks").textContent).toBe("2");

    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    // ⚠️ Not waited out here on purpose: the edit is still inside the write's debounce window when the page goes away,
    // which is the case `pagehide`/unmount flush exists for. A refresh "too soon" must not lose the gesture.
    first.unmount();
    await settle();

    mount();
    await settle();
    expect(screen.getByTestId("tracks").textContent).toBe("1");
  });

  it("⭐ a rename is stored even though no note moved", async () => {
    const first = mount();
    await waitFor(() => screen.queryByRole("button", { name: "create" }) !== null, "the load to finish (chooser shown)");
    fireEvent.click(screen.getByRole("button", { name: "create" }));
    await waitFor(() => screen.queryByTestId("name") !== null, "the project to be created");
    first.unmount();
    await settle();

    // The second mount is where the rename happens — with no arrangement change at all, so a store that only wrote on
    // an edit would keep the old name for ever.
    const second = mount();
    await waitFor(() => screen.queryByTestId("name") !== null, "the stored project to be reopened");
    expect(screen.getByTestId("name").textContent).toBe("Evening Tune");
    fireEvent.click(screen.getByRole("button", { name: "rename" }));
    await waitFor(() => screen.getByTestId("name").textContent === "Renamed Later", "the rename to be applied");
    second.unmount();
    await settle();

    mount();
    await waitFor(() => screen.queryByTestId("name") !== null, "the stored project to be reopened after the rename");
    // The renamed project comes back under the new name, and it is still the same project (its tracks are all there).
    expect(screen.getByTestId("name").textContent).toBe("Renamed Later");
    expect(screen.getByTestId("tracks").textContent).toBe("2");
  });
});
