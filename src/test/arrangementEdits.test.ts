import { beforeEach, describe, expect, it } from "vitest";
import { addTrack, createArrangement, removeTrack, resetTrackIdsForTests, setTrackParent } from "../data/arrangementEdits";

/**
 * The edits an interface is built from, and the two ways they go quietly wrong.
 *
 * **Identity**: an index-as-id means deleting one track renames the others, and any reference follows the wrong track. **Orphans**: deleting a folder while leaving its children makes them unreachable in the
 * interface and still audible — tracks nothing on screen accounts for.
 */
beforeEach(() => resetTrackIdsForTests());

describe("editing an arrangement", () => {
  it("gives each track an id of its own, and never reuses one after a deletion", () => {
    let arr = createArrangement("s");
    arr = addTrack(arr, "sampler", "Drums");
    arr = addTrack(arr, "instrument", "Lead");
    const [first, second] = arr.tracks;
    expect(first!.id).not.toBe(second!.id);

    // Deleting the first must not let the next track inherit its identity: a reused id would resurrect automation or a selection that belonged to the deleted track.
    arr = removeTrack(arr, first!.id);
    arr = addTrack(arr, "fx", "Reverb");
    expect(arr.tracks.map((track) => track.id)).not.toContain(first!.id);
    expect(arr.tracks).toHaveLength(2);
  });

  it("takes a folder's children with it, so nothing stays audible but unreachable", () => {
    let arr = createArrangement("s");
    arr = addTrack(arr, "folder", "Drums");
    const folder = arr.tracks[0]!;
    arr = addTrack(arr, "sampler", "Kick", { parentId: folder.id });
    arr = addTrack(arr, "sampler", "Snare", { parentId: folder.id });
    arr = addTrack(arr, "instrument", "Bass");

    const after = removeTrack(arr, folder.id);
    // Only the ungrouped track remains; orphaned children would still compile into lanes with nothing on screen to explain them.
    expect(after.tracks.map((track) => track.name)).toEqual(["Bass"]);
  });

  it("removes a nested folder's children too, because a folder may contain a folder", () => {
    let arr = createArrangement("s");
    arr = addTrack(arr, "folder", "Outer");
    const outer = arr.tracks[0]!;
    arr = addTrack(arr, "folder", "Inner", { parentId: outer.id });
    const inner = arr.tracks[1]!;
    arr = addTrack(arr, "sampler", "Deep", { parentId: inner.id });
    // One pass would miss `Deep`; the criterion exists because a tree is not a flat list.
    expect(removeTrack(arr, outer.id).tracks).toHaveLength(0);
  });

  it("refuses to make a folder its own parent, which would make the tree unrenderable", () => {
    let arr = createArrangement("s");
    arr = addTrack(arr, "folder", "Drums");
    const folder = arr.tracks[0]!;
    expect(setTrackParent(arr, folder.id, folder.id).tracks[0]!.parentId).toBeUndefined();
  });
});
