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

describe("mute, solo, rename and fold", () => {
  it("sets mute and solo independently, per track", async () => {
    const { setTrackFlag } = await import("../data/arrangementEdits");
    let arr = createArrangement("s");
    arr = addTrack(arr, "sampler", "Kick");
    arr = addTrack(arr, "sampler", "Snare");
    const [kick, snare] = arr.tracks;
    arr = setTrackFlag(arr, kick!.id, "muted", true);
    arr = setTrackFlag(arr, snare!.id, "soloed", true);
    // One track's flag must not follow another's: a shared boolean here would mute or solo the whole arrangement.
    expect(arr.tracks.find((t) => t.id === kick!.id)!.muted).toBe(true);
    expect(arr.tracks.find((t) => t.id === kick!.id)!.soloed).toBeUndefined();
    expect(arr.tracks.find((t) => t.id === snare!.id)!.soloed).toBe(true);
  });

  it("refuses a blank rename rather than leaving a nameless row", async () => {
    const { renameTrack } = await import("../data/arrangementEdits");
    let arr = createArrangement("s");
    arr = addTrack(arr, "instrument", "Lead");
    const id = arr.tracks[0]!.id;
    expect(renameTrack(arr, id, "   ").tracks[0]!.name).toBe("Lead");
    expect(renameTrack(arr, id, "  Pad  ").tracks[0]!.name).toBe("Pad");
  });

  it("folds without silencing — a display state must not reach the audio", async () => {
    const { setCollapsed, compileArrangementToLanes } = await import("../data/arrangementEdits").then(async (edits) => ({
      setCollapsed: edits.setCollapsed,
      compileArrangementToLanes: (await import("../data/arrangementCompile")).compileArrangementToLanes,
    }));
    let arr = createArrangement("s");
    arr = addTrack(arr, "folder", "Drums");
    const folder = arr.tracks[0]!;
    arr = addTrack(arr, "sampler", "Kick", { parentId: folder.id });
    const before = compileArrangementToLanes(arr).length;
    arr = setCollapsed(arr, folder.id, true);
    // The whole point: folding hides rows, it does not remove lanes. If it did, a collapsed folder would go silent and the bug would be reported against the audio engine.
    expect(compileArrangementToLanes(arr).length).toBe(before);
    expect(arr.tracks.find((t) => t.id === folder.id)!.collapsed).toBe(true);
  });
});

describe("choosing takes", () => {
  const withTakes = () => {
    let arr = createArrangement("s");
    arr = addTrack(arr, "sampler", "Drums");
    const id = arr.tracks[0]!.id;
    arr = {
      ...arr,
      tracks: arr.tracks.map((track) => ({ ...track, takes: [{ id: "t1", recordedAt: 1, source: "audio" as const }, { id: "t2", recordedAt: 2, source: "audio" as const }] })),
    };
    return { arr, id };
  };

  it("refuses to select a take that does not exist, rather than storing a selection that resolves to nothing", async () => {
    const { selectTrackTake } = await import("../data/arrangementEdits");
    const { arr, id } = withTakes();
    // Storing it would silence the track while looking configured — the failure mode that reads as an engine bug.
    expect(selectTrackTake(arr, id, "gone").tracks[0]!.selectedTakeId).toBeUndefined();
    expect(selectTrackTake(arr, id, "t2").tracks[0]!.selectedTakeId).toBe("t2");
  });

  it("splits a region it crosses, so the heard take never depends on array order", async () => {
    const { assignTakeToRange, selectTrackTake } = await import("../data/arrangementEdits");
    const { arr, id } = withTakes();
    const seeded = selectTrackTake(arr, id, "t1");
    const withRegion = assignTakeToRange(seeded, id, 0, 16, "t1");
    const split = assignTakeToRange(withRegion, id, 4, 8, "t2");
    // The original 0–16 becomes 0–4 and 8–16, with 4–8 taken by t2: disjoint, ordered, and no bar served by two regions.
    expect(split.tracks[0]!.takeRegions).toEqual([
      { startBar: 0, endBar: 4, takeId: "t1" },
      { startBar: 4, endBar: 8, takeId: "t2" },
      { startBar: 8, endBar: 16, takeId: "t1" },
    ]);
  });

  it("refuses a backwards range and an unknown take", async () => {
    const { assignTakeToRange } = await import("../data/arrangementEdits");
    const { arr, id } = withTakes();
    expect(assignTakeToRange(arr, id, 8, 8, "t1").tracks[0]!.takeRegions).toBeUndefined();
    expect(assignTakeToRange(arr, id, 0, 8, "gone").tracks[0]!.takeRegions).toBeUndefined();
  });
});
