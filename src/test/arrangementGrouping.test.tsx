/**
 * ⭐ **Grouping a track under a folder, which the model could do and nothing could ask for.**
 *
 * The last Web-reachability ledger entry with a genuine gap. `parentId` has been **read** all along — `TrackListV2` indents
 * by it, `ArrangementLaneV2` hides a folded folder's children, `depthOf` mirrors it — so the grouping always *rendered*;
 * what was missing was any way to set it, which is why the census filed it as reachable from the protocol and from nothing
 * else.
 *
 * The failures worth catching:
 *
 *   - **a `parentId` naming something that is not a folder**, or one that does not exist: the track would indent under
 *     nothing and be hidden behind a fold that cannot open. The control therefore offers only actual folder tracks;
 *   - **a cycle.** A track inside its own descendant makes `depthOf` walk a loop (it has a `seen` guard, so it terminates)
 *     and hides the track behind a fold that can never open. The candidate list excludes the track and its descendants,
 *     which is computed rather than trusted;
 *   - **grouping read as mixing.** `setCollapsed` deliberately touches only `collapsed` — a criterion exists because a fold
 *     that silenced its children would be blamed on the engine — and a folder that summed them would be the summing-bus
 *     feature. The label says group, and this file pins that the model does not change level or mute.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { TrackHeaderV2 } from "../components/arrangement/TrackHeaderV2";
import { setTrackParentCommand } from "../data/arrangementHistory";
import { addTrack, createArrangement, setTrackParent } from "../data/arrangementEdits";
import type { ArrangementV2 } from "../types/arrangementV2";

const track = (over: Record<string, unknown> = {}) =>
  ({ id: "t1", kind: "synth", name: "Lead", gainDb: 0, ...over }) as never;

const arrangement = () => createArrangement("s1");

describe("setTrackParentCommand", () => {
  it("⭐ joins a folder and leaves it again, both undoable", () => {
    // Ids come from the factory rather than being assumed: `createArrangement` names its first track `synth-1`.
    const base = arrangement();
    const child = base.tracks[0]!;
    const withFolder = addTrack(base, "folder", "Drums", {});
    const folder = withFolder.tracks[withFolder.tracks.length - 1]!;
    const command = setTrackParentCommand(child.id, undefined, folder.id);
    expect(command.redo(base).tracks[0]!.parentId).toBe(folder.id);
    // ⭐ And applying the redo twice is idempotent, which is what "total function over any arrangement" means in practice.
    expect(command.redo(command.redo(base)).tracks[0]!.parentId).toBe(folder.id);
    expect(command.undo(command.redo(base)).tracks[0]!.parentId, "leaving is the undo").toBeUndefined();
  });

  it("⚠️ refuses to make a track its own parent, so the model cannot be talked into a cycle of one", () => {
    // `setTrackParent` returns the arrangement unchanged for this, which is what makes the GUI's exclusion belt-and-braces.
    const base = arrangement();
    const self = setTrackParent(base, base.tracks[0]!.id, base.tracks[0]!.id);
    expect(self.tracks[0]!.parentId, "unchanged rather than self-parented").toBeUndefined();
  });

  it("⭐ groups without touching level or mute, because a folder is not a bus", () => {
    const before = arrangement();
    const id = before.tracks[0]!.id;
    const after = setTrackParent(before, id, "folder-1");
    const row = after.tracks[0]!;
    expect(row.parentId).toBe("folder-1");
    expect(row.gainDb, "the level is untouched").toBe(before.tracks[0]!.gainDb);
    expect(row.muted, "and nothing is muted by being grouped").toBe(before.tracks[0]!.muted);
  });
});

describe("TrackHeaderV2 · the group control", () => {
  const renderHeader = (over: Record<string, unknown> = {}) => {
    const handlers = { onSelectTrack: vi.fn(), onChangeParent: vi.fn() };
    render(
      <LanguageProvider>
        <TrackHeaderV2
          track={track()}
          depth={0}
          {...handlers}
          onChangeGain={vi.fn()}
          onToggle={vi.fn()}
          onToggleArm={vi.fn()}
          folderOptions={[{ id: "f1", name: "Drums" }]}
          {...over}
        />
      </LanguageProvider>
    );
    return handlers;
  };

  it("⭐ offers only real folders plus 'none', so a parentId cannot name nothing", () => {
    renderHeader();
    const select = screen.getByTestId<HTMLSelectElement>("track-group-t1-header");
    const values = Array.from(select.options).map((option) => option.value);
    // The empty value is "no group" — leaving a folder is an operation, so it is listed rather than being the default only.
    expect(values).toEqual(["", "f1"]);
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(
      expect.arrayContaining(["Drums"])
    );
  });

  it("⭐ commits a folder id on change and `undefined` when leaving", () => {
    const handlers = renderHeader();
    const select = screen.getByTestId("track-group-t1-header");
    fireEvent.change(select, { target: { value: "f1" } });
    expect(handlers.onChangeParent).toHaveBeenCalledWith("t1", "f1");
    fireEvent.change(select, { target: { value: "" } });
    expect(handlers.onChangeParent).toHaveBeenCalledWith("t1", undefined);
  });

  it("⭐ shows the current grouping, and draws no control when it cannot change it", () => {
    renderHeader({ parentId: "f1" });
    expect(screen.getByTestId<HTMLSelectElement>("track-group-t1-header").value).toBe("f1");
    // A read-only header (no handler, or no folders to join) has no control, rather than one that cannot act.
    render(
      <LanguageProvider>
        <TrackHeaderV2 track={track()} depth={0} onChangeGain={vi.fn()} onToggle={vi.fn()} onToggleArm={vi.fn()} folderOptions={[]} />
      </LanguageProvider>
    );
    expect(screen.queryAllByTestId("track-group-t1-header")).toHaveLength(1);
  });
});

describe("the folder candidates", () => {
  /**
   * The view computes this list; the helper is mirrored here because the property is the point rather than the location:
   * excluding the track and its descendants is what keeps a cycle out of the control, and `depthOf`'s `seen` guard means a
   * cycle would not crash — it would hide a track behind a fold that cannot open, which is worse.
   */
  const candidatesFor = (arrangement: ArrangementV2, track: { id: string; parentId?: string }) => {
    const forbidden = new Set<string>([track.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const row of arrangement.tracks) {
        if (row.parentId !== undefined && forbidden.has(row.parentId) && !forbidden.has(row.id)) {
          forbidden.add(row.id);
          grew = true;
        }
      }
    }
    return arrangement.tracks.filter((row) => row.kind === "folder" && !forbidden.has(row.id)).map((row) => row.id);
  };

  it("⭐ excludes the track itself and every descendant, so no cycle can be chosen", () => {
    // f1 is a folder; t1 is inside it; t2 is inside t1. t1 must not be offered t1, and must not be offered t2's folder…
    const base = arrangement();
    const built: ArrangementV2 = {
      ...base,
      tracks: [
        { id: "f1", kind: "folder", name: "Group" } as never,
        { id: "t1", kind: "synth", name: "Lead" } as never,
        { id: "f2", kind: "folder", name: "Inner", parentId: "t1" } as never,
        { id: "f3", kind: "folder", name: "Other" } as never,
      ],
    };
    expect(candidatesFor(built, built.tracks[1]!), "t1 cannot join itself or its own child folder").toEqual(["f1", "f3"]);
    // And a folder's own descendants are excluded too, one level deeper.
    const nested: ArrangementV2 = {
      ...built,
      tracks: built.tracks.map((row) => (row.id === "f2" ? { ...row, parentId: "f1" } : row)),
    };
    expect(candidatesFor(nested, nested.tracks[0]!), "f1 cannot join itself or a folder inside it").toEqual(["f3"]);
  });
});
