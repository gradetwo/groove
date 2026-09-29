import type { ArrangementV2 } from "../types/arrangementV2";
import { beforeEach, describe, expect, it } from "vitest";
import { addTake, addTrack, createArrangement, removeTrack, resetTrackIdsForTests, setTrackParent, setTrackSample, toggleStep } from "../data/arrangementEdits";

/**
 * The edits an interface is built from, and the two ways they go quietly wrong.
 *
 * **Identity**: an index-as-id means deleting one track renames the others, and any reference follows the wrong track. **Orphans**: deleting a folder while leaving its children makes them unreachable in the
 * interface and still audible — tracks nothing on screen accounts for.
 */
beforeEach(() => resetTrackIdsForTests());

/** An explicitly empty start: `createArrangement` now gives one default track, which is the owner's requirement — so a criterion about *editing* should say where it starts. */
const emptyArrangement = (songId = "s"): ArrangementV2 => ({ ...createArrangement(songId), tracks: [] });

describe("editing an arrangement", () => {
  it("gives each track an id of its own, and never reuses one after a deletion", () => {
    let arr = emptyArrangement();
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
    let arr = emptyArrangement();
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
    let arr = emptyArrangement();
    arr = addTrack(arr, "folder", "Outer");
    const outer = arr.tracks[0]!;
    arr = addTrack(arr, "folder", "Inner", { parentId: outer.id });
    const inner = arr.tracks[1]!;
    arr = addTrack(arr, "sampler", "Deep", { parentId: inner.id });
    // One pass would miss `Deep`; the criterion exists because a tree is not a flat list.
    expect(removeTrack(arr, outer.id).tracks).toHaveLength(0);
  });

  it("refuses to make a folder its own parent, which would make the tree unrenderable", () => {
    let arr = emptyArrangement();
    arr = addTrack(arr, "folder", "Drums");
    const folder = arr.tracks[0]!;
    expect(setTrackParent(arr, folder.id, folder.id).tracks[0]!.parentId).toBeUndefined();
  });
});

describe("mute, solo, rename and fold", () => {
  it("sets mute and solo independently, per track", async () => {
    const { setTrackFlag } = await import("../data/arrangementEdits");
    let arr = emptyArrangement();
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
    let arr = emptyArrangement();
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
    let arr = emptyArrangement();
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
    let arr = emptyArrangement();
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

describe("new projects, templates, and changing a track's kind", () => {
  it("gives a new arrangement one track of the chosen kind, never an empty list", async () => {
    const { createArrangement } = await import("../data/arrangementEdits");
    // An empty list is a question; one track is somewhere to start, and the record button has something to point at.
    const arr = createArrangement("s", "sampler");
    expect(arr.tracks).toHaveLength(1);
    expect(arr.tracks[0]!.kind).toBe("sampler");
  });

  it("builds each template with its own tracks, and falls back to the blank case for an unknown id", async () => {
    const { createArrangementFromTemplate, TEMPLATES } = await import("../data/arrangementEdits");
    for (const template of TEMPLATES) {
      expect(createArrangementFromTemplate("s", template.id).tracks).toHaveLength(template.kinds.length);
    }
    // Blank is not a special case in the model: it is "no template", and it still has the one track the choice implies.
    const blank = createArrangementFromTemplate("s", undefined, "drumkit");
    expect(blank.tracks).toHaveLength(1);
    expect(blank.tracks[0]!.kind).toBe("drumkit");
  });

  it("drops the sample when a track stops being a sampler, and keeps the takes", async () => {
    const { addTrack, changeTrackKind } = await import("../data/arrangementEdits");
    let arr = createArrangement("s");
    arr = addTrack(arr, "sampler", "Drums", { sample: { assetId: "virtuosity-drums-basic" } });
    const id = arr.tracks[0]!.id;
    arr = { ...arr, tracks: arr.tracks.map((t) => ({ ...t, takes: [{ id: "t1", recordedAt: 1, source: "audio" as const }], selectedTakeId: "t1" })) };

    const changed = changeTrackKind(arr, id, "instrument");
    // `sample` belongs to the sound source, and means nothing to a synth: keeping it is a state the shape allows and the semantics do not have.
    expect(changed.tracks[0]!.sample).toBeUndefined();
    // ⭐ But takes are **content, not identity** — changing what a track is does not un-record what was played onto it.
    expect(changed.tracks[0]!.takes).toHaveLength(1);
    expect(changed.tracks[0]!.selectedTakeId).toBe("t1");
  });

  it("keeps the sample when a track becomes a sampler", async () => {
    const { addTrack, changeTrackKind } = await import("../data/arrangementEdits");
    let arr = addTrack(createArrangement("s"), "sampler", "Drums", { sample: { assetId: "kit" } });
    const id = arr.tracks[0]!.id;
    arr = changeTrackKind(arr, id, "instrument");
    const back = changeTrackKind(arr, id, "sampler");
    // It was dropped on the way out, so a round trip cannot resurrect it — that is honest, and the criterion says so rather than pretending.
    expect(back.tracks[0]!.sample).toBeUndefined();
    expect(back.tracks[0]!.kind).toBe("sampler");
  });
});

describe("a v2 arrangement's own notes", () => {
  it("gives a new track content, and a sampler track the asset that makes it audible", async () => {
    const { createArrangement } = await import("../data/arrangementEdits");
    const arr = createArrangement("s", "sampler");
    const id = arr.tracks[0]!.id;
    // ⭐ Content arrives with the track: an empty track is silent, and a silent track looks like a broken engine.
    expect(arr.notesByTrack?.[id]?.some((step) => step === 1)).toBe(true);
    // ⭐ And the asset, which is the half that is easy to miss: a sampler lane with no asset resolves to nothing.
    expect(arr.tracks[0]!.sample).toEqual({ assetId: "virtuosity-drums-basic" });
  });

  it("takes a deleted track's notes with it, so no orphan can fire under a reused id", async () => {
    const { addTrack, createArrangement, removeTrack } = await import("../data/arrangementEdits");
    let arr = createArrangement("s");
    arr = addTrack(arr, "instrument", "Lead");
    const id = arr.tracks[1]!.id;
    expect(arr.notesByTrack?.[id]).toBeDefined();

    const after = removeTrack(arr, id);
    // ⭐ The same class of problem as a folder's orphaned children, which already has a criterion: what is unreachable must not stay behind making a noise.
    expect(after.notesByTrack?.[id]).toBeUndefined();
  });

  it("gives every template track notes, so a template is audible the moment it is created", async () => {
    const { createArrangementFromTemplate, TEMPLATES } = await import("../data/arrangementEdits");
    for (const template of TEMPLATES) {
      const arr = createArrangementFromTemplate("s", template.id);
      const sounded = arr.tracks.filter((track) => arr.notesByTrack?.[track.id]?.some((step) => step === 1));
      expect(sounded.length).toBe(template.kinds.length);
    }
  });
});

describe("choosing the instrument a sampler track plays", () => {
  it("sets the asset on a sampler track", () => {
    // The owner's requirement: a sampler track's instrument is a property of the track, chosen in the track list.
    const withSampler = addTrack(emptyArrangement(), "sampler", "Sampler 1");
    const sampler = withSampler.tracks[0]!;
    const edited = setTrackSample(withSampler, sampler.id, "salamander-grand");
    expect(edited.tracks[0]!.sample).toEqual({ assetId: "salamander-grand" });
  });

  it("leaves every other track alone", () => {
    const withTwo = addTrack(addTrack(emptyArrangement(), "sampler", "Sampler 1"), "drumkit", "Drums");
    const edited = setTrackSample(withTwo, withTwo.tracks[0]!.id, "karoryfer-meatbass");
    expect(edited.tracks[1]).toBe(withTwo.tracks[1]);
  });

  it("refuses a track whose kind says it does not sound from a catalogue asset", () => {
    /**
     * The kind decides whether a track *may* hold a sample; this chooses which one. Writing the field onto an `instrument` or `fx` track would be a claim that something sounds from a track whose kind says otherwise — and the
     * model keeps exactly one place where playing a catalogue asset is true.
     */
    const withFx = addTrack(emptyArrangement(), "fx", "Reverb");
    const edited = setTrackSample(withFx, withFx.tracks[0]!.id, "salamander-grand");
    expect(edited.tracks[0]!.sample).toBeUndefined();
  });

  it("keeps the rest of the track, so choosing an instrument is not a rename", () => {
    const withSampler = addTrack(emptyArrangement(), "sampler", "Sampler 1");
    const sampler = withSampler.tracks[0]!;
    const named = { ...withSampler, tracks: [{ ...sampler, muted: true, gainDb: -3 }] };
    const edited = setTrackSample(named, sampler.id, "karoryfer-emilyguitar");
    expect(edited.tracks[0]).toMatchObject({ name: "Sampler 1", muted: true, gainDb: -3 });
  });
});

describe("editing a track's own steps", () => {
  it("turns a step on and off again", () => {
    const withTrack = addTrack(emptyArrangement(), "drumkit", "Drums");
    const id = withTrack.tracks[0]!.id;
    const on = toggleStep(withTrack, id, 0);
    expect(on.notesByTrack![id]![0]).toBe(0); // every 4 from 0: step 0 starts on, so the first toggle takes it off
    const off = toggleStep(on, id, 0);
    expect(off.notesByTrack![id]![0]).toBe(1);
  });

  it("leaves the other steps of that track alone", () => {
    const withTrack = addTrack(emptyArrangement(), "drumkit", "Drums");
    const id = withTrack.tracks[0]!.id;
    const before = withTrack.notesByTrack![id]!;
    const edited = toggleStep(withTrack, id, 1);
    expect(edited.notesByTrack![id]!.filter((_, index) => index !== 1)).toEqual(before.filter((_, index) => index !== 1));
  });

  it("refuses a step outside the pattern rather than growing one", () => {
    // A 16-step bar is what the data holds; an index beyond it would invent a length nobody chose.
    const withTrack = addTrack(emptyArrangement(), "drumkit", "Drums");
    const id = withTrack.tracks[0]!.id;
    expect(toggleStep(withTrack, id, 99)).toBe(withTrack);
  });

  it("refuses a kind that makes no sound, because its all-zero steps are its definition", () => {
    const withFolder = addTrack(emptyArrangement(), "folder", "Group");
    const id = withFolder.tracks[0]!.id;
    expect(toggleStep(withFolder, id, 0)).toBe(withFolder);
  });
});
describe("filing a finished capture onto a track", () => {
  it("appends the take and selects it, so it is the one heard rather than one to go looking for", () => {
    const withTrack = addTrack(emptyArrangement(), "sampler", "Sampler 1");
    const id = withTrack.tracks[0]!.id;
    const planned = { take: { id: "take-1", recordedAt: 10, source: "audio" as const } };
    const filed = addTake(withTrack, id, planned);
    expect(filed.tracks[0]!.takes).toEqual([planned.take]);
    expect(filed.tracks[0]!.selectedTakeId).toBe("take-1");
  });

  it("keeps the takes that were already there", () => {
    const withTrack = addTrack(emptyArrangement(), "sampler", "Sampler 1");
    const id = withTrack.tracks[0]!.id;
    const first = addTake(withTrack, id, { take: { id: "take-1", recordedAt: 1, source: "audio" } });
    const second = addTake(first, id, { take: { id: "take-2", recordedAt: 2, source: "audio" } });
    expect(second.tracks[0]!.takes!.map((take) => take.id)).toEqual(["take-1", "take-2"]);
    expect(second.tracks[0]!.selectedTakeId).toBe("take-2");
  });

  it("claims the bar range when the capture covered one, using the same splitting rule as choosing a take", () => {
    const withTrack = addTrack(emptyArrangement(), "sampler", "Sampler 1");
    const id = withTrack.tracks[0]!.id;
    const filed = addTake(withTrack, id, {
      take: { id: "take-1", recordedAt: 1, source: "audio" },
      region: { startBar: 2, endBar: 4, takeId: "take-1" },
    });
    expect(filed.tracks[0]!.takeRegions).toEqual([{ startBar: 2, endBar: 4, takeId: "take-1" }]);
  });

  it("accepts a take on any kind, because recording is an input form rather than a track type", () => {
    // The owner corrected an earlier design that treated audio as its own track type; what differs is `Take.source`, not the kind.
    for (const kind of ["drumkit", "instrument", "sampler"] as const) {
      const withTrack = addTrack(emptyArrangement(), kind, kind);
      const id = withTrack.tracks[0]!.id;
      const filed = addTake(withTrack, id, { take: { id: "take-1", recordedAt: 1, source: "midi" } });
      expect(filed.tracks[0]!.takes).toHaveLength(1);
    }
  });

  it("refuses a track that is not there rather than inventing one", () => {
    const arrangement = emptyArrangement();
    expect(addTake(arrangement, "missing", { take: { id: "take-1", recordedAt: 1, source: "audio" } })).toBe(arrangement);
  });
});
