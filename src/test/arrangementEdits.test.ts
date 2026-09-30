import { DEFAULT_SAMPLER_ASSET } from "../data/defaultContent";
import type { ArrangementV2 } from "../types/arrangementV2";
import { beforeEach, describe, expect, it } from "vitest";
import { addTake, addTrack, addTrackNote, addTrackNotes, changeTrackKind, createArrangement, moveTrackNote, removeTrack, removeTrackNote, resetTrackIdsForTests, setArrangementTempoMap, setTrackFlag, setTrackGain, setTrackNoteLength, setTrackPan, setTrackParent, setTrackSample, setTrackSteps, toggleStep } from "../data/arrangementEdits";

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
    /**
     * **The original choice is not resurrected, and the track is playable anyway.** It was dropped on the way out, so a round trip cannot bring back "kit" — that is still honest. What changed is that becoming a sampler now supplies the default
     * instrument, the same one `defaultContentFor` gives a new sampler track, because a sampler that cannot sound is the mistake this model names.
     */
    expect(back.tracks[0]!.sample).toEqual({ assetId: DEFAULT_SAMPLER_ASSET });
    expect(back.tracks[0]!.kind).toBe("sampler");
  });
});

describe("a v2 arrangement's own notes", () => {
  it("gives a new track content, and a sampler track the asset that makes it audible", async () => {
    const { createArrangement } = await import("../data/arrangementEdits");
    const arr = createArrangement("s", "sampler");
    const id = arr.tracks[0]!.id;
    // ⭐ Content arrives with the track: an empty track is silent, and a silent track looks like a broken engine.
    // Notes rather than steps: the model holds what a note is, and the grid is derived from it.
    expect(arr.notesByTrack?.[id]?.length).toBeGreaterThan(0);
    expect(arr.notesByTrack?.[id]!.every((note) => note.velocity > 0 && note.lengthBeats > 0)).toBe(true);
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
      // A track sounds when it has notes; the template's whole point is that every track it creates is audible.
      const sounded = arr.tracks.filter((track) => (arr.notesByTrack?.[track.id]?.length ?? 0) > 0);
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
  /**
   * **The grid is a view, so these criteria are about the notes it writes.** A step array cannot say when a note begins inside a step, how long it is held or what pitch it carries — which is why the model stopped being one, and why the assertions here are on
   * notes and on the view agreeing with them rather than on array indices.
   */
  it("turns a step on and off again, and the notes follow", () => {
    const withTrack = addTrack(emptyArrangement(), "drumkit", "Drums");
    const id = withTrack.tracks[0]!.id;
    const before = withTrack.notesByTrack![id]!.length;
    const off = toggleStep(withTrack, id, 0);
    // Step 0 starts on for the default drum pattern, so the first toggle removes a note; the second puts it back.
    expect(off.notesByTrack![id]!.length).toBe(before - 1);
    const on = toggleStep(off, id, 0);
    expect(on.notesByTrack![id]!.length).toBe(before);
    expect(on.notesByTrack![id]!.some((note) => note.startBeats === 0)).toBe(true);
  });

  it("leaves the other steps of that track alone", () => {
    const withTrack = addTrack(emptyArrangement(), "drumkit", "Drums");
    const id = withTrack.tracks[0]!.id;
    const edited = toggleStep(withTrack, id, 1);
    // Step 1 is empty in the default pattern, so this adds one note and moves nothing else.
    expect(edited.notesByTrack![id]!.length).toBe(withTrack.notesByTrack![id]!.length + 1);
    expect(edited.notesByTrack![id]!.filter((note) => note.startBeats % 1 === 0).length).toBe(4);
  });

  it("refuses a step beyond the arrangement rather than growing it", () => {
    /**
     * **The bound is the arrangement's length.** It was a fixed sixteen, which was the v1 pattern's length; an arrangement is eight bars by default, so step 99 is now a legitimate square and step 999 is not. A toggle past the end is refused rather than
     * extending the arrangement, because the length is a decision a person makes and not a side effect of a stray click.
     */
    const withTrack = addTrack(emptyArrangement(), "drumkit", "Drums");
    const id = withTrack.tracks[0]!.id;
    expect(toggleStep(withTrack, id, 99).notesByTrack![id]!.length).toBeGreaterThan(0);
    expect(toggleStep(withTrack, id, 9999)).toBe(withTrack);
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

describe("setting a whole step pattern", () => {
  it("writes the steps it was given as notes at those positions", () => {
    const withTrack = addTrack(emptyArrangement(), "drumkit", "Drums");
    const id = withTrack.tracks[0]!.id;
    const edited = setTrackSteps(withTrack, id, [1, 0, 0, 1, 0, 0, 1, 0]);
    // A step is a sixteenth, so the three that are on are 0.75 beats apart.
    expect(edited.notesByTrack![id]!.map((note) => note.startBeats)).toEqual([0, 0.75, 1.5]);
    expect(edited.notesByTrack![id]!.every((note) => note.lengthBeats === 0.25)).toBe(true);
  });

  it("turns a step on when its value is non-zero, because a step is a step rather than a velocity", () => {
    const withTrack = addTrack(emptyArrangement(), "drumkit", "Drums");
    const id = withTrack.tracks[0]!.id;
    // 0.4 is on, 3 is on, 0 is off, -1 is on: the rule is "non-zero", not "equals one".
    expect(setTrackSteps(withTrack, id, [0.4, 3, 0, -1]).notesByTrack![id]!.length).toBe(3);
  });

  it("keeps the pitch the track already used, so a drum row does not move to middle C", () => {
    const added = addTrack(emptyArrangement(), "drumkit", "Drums");
    const id = added.tracks[0]!.id;
    const gated = { ...added, notesByTrack: { [id]: [{ pitch: 36, startBeats: 0, lengthBeats: 0.25, velocity: 100 }] } };
    expect(setTrackSteps(gated, id, [0, 1, 0, 0]).notesByTrack![id]!.every((note) => note.pitch === 36)).toBe(true);
  });

  it("refuses a kind that makes no sound, and a track that is not there", () => {
    const withFolder = addTrack(emptyArrangement(), "folder", "Group");
    const id = withFolder.tracks[0]!.id;
    expect(setTrackSteps(withFolder, id, [1, 1])).toBe(withFolder);
    expect(setTrackSteps(withFolder, "missing", [1, 1])).toBe(withFolder);
  });
});

describe("writing notes directly, which is what a piano roll does", () => {
  const note = (pitch: number, startBeats: number, lengthBeats = 1) => ({ pitch, startBeats, lengthBeats, velocity: 100 });

  it("adds a note with its own position, length and pitch", () => {
    const withTrack = addTrack(emptyArrangement(), "instrument", "Keys");
    const id = withTrack.tracks[0]!.id;
    const edited = addTrackNote({ ...withTrack, notesByTrack: { [id]: [] } }, id, note(64, 1.5, 2));
    expect(edited.notesByTrack![id]).toEqual([{ pitch: 64, startBeats: 1.5, lengthBeats: 2, velocity: 100 }]);
  });

  it("replaces a note at the same cell rather than stacking a second voice on it", () => {
    // Two notes at one pitch and position are one note with a doubled voice: unremovable with a second click, and heard as a mistake.
    const withTrack = addTrack(emptyArrangement(), "instrument", "Keys");
    const id = withTrack.tracks[0]!.id;
    const once = addTrackNote({ ...withTrack, notesByTrack: { [id]: [] } }, id, note(64, 1, 1));
    const twice = addTrackNote(once, id, { ...note(64, 1, 2), velocity: 80 });
    expect(twice.notesByTrack![id]).toHaveLength(1);
    expect(twice.notesByTrack![id]![0]!.velocity).toBe(80);
  });

  it("moves a note in time and pitch, and refuses a destination that is occupied", () => {
    const withTrack = addTrack(emptyArrangement(), "instrument", "Keys");
    const id = withTrack.tracks[0]!.id;
    const two = addTrackNote(addTrackNote({ ...withTrack, notesByTrack: { [id]: [] } }, id, note(64, 0)), id, note(67, 1));
    const moved = moveTrackNote(two, id, { pitch: 64, startBeats: 0 }, { pitch: 65, startBeats: 2 });
    expect(moved.notesByTrack![id]!.find((entry) => entry.pitch === 65)!.startBeats).toBe(2);
    // Onto the note already at (67, 1): refused, so both notes survive untouched.
    const blocked = moveTrackNote(moved, id, { pitch: 65, startBeats: 2 }, { pitch: 67, startBeats: 1 });
    expect(blocked.notesByTrack![id]!.map((entry) => entry.pitch).sort()).toEqual([65, 67]);
  });

  it("changes a note's length, with a floor of one step", () => {
    const withTrack = addTrack(emptyArrangement(), "instrument", "Keys");
    const id = withTrack.tracks[0]!.id;
    const one = addTrackNote({ ...withTrack, notesByTrack: { [id]: [] } }, id, note(60, 0, 1));
    expect(setTrackNoteLength(one, id, { pitch: 60, startBeats: 0 }, 4).notesByTrack![id]![0]!.lengthBeats).toBe(4);
    // A note shorter than a step is invisible in the grid, so the floor is a step rather than zero.
    expect(setTrackNoteLength(one, id, { pitch: 60, startBeats: 0 }, 0).notesByTrack![id]![0]!.lengthBeats).toBe(0.25);
  });

  it("removes a note by position, and refuses the silent kinds", () => {
    const withTrack = addTrack(emptyArrangement(), "instrument", "Keys");
    const id = withTrack.tracks[0]!.id;
    const one = addTrackNote({ ...withTrack, notesByTrack: { [id]: [] } }, id, note(60, 0));
    expect(removeTrackNote(one, id, { pitch: 60, startBeats: 0 }).notesByTrack![id]).toHaveLength(0);
    const withFx = addTrack(emptyArrangement(), "fx", "Verb");
    const fxId = withFx.tracks[0]!.id;
    // An effect makes no sound, so a note on it would be content nothing accounts for.
    expect(addTrackNote(withFx, fxId, note(60, 0))).toBe(withFx);
  });
});

describe("changing a track's kind", () => {
  it("gives a track that becomes a sampler the default instrument, as a new one gets", () => {
    /**
     * The inconsistency this closes: `defaultContentFor` gives every new sampler track an asset, and a kind change did not — so the same kind of track sounded or not depending on how it had been created. A sampler track that cannot sound is
     * the one thing this model calls out as a mistake.
     */
    const withTrack = addTrack(emptyArrangement(), "instrument", "Lead");
    const id = withTrack.tracks[0]!.id;
    const asSampler = changeTrackKind(withTrack, id, "sampler");
    expect(asSampler.tracks[0]!.sample).toEqual({ assetId: DEFAULT_SAMPLER_ASSET });
  });

  it("keeps an instrument that was already chosen rather than replacing it with the default", () => {
    /**
     * The round trip through another kind is a different case and loses the choice, which the older criterion beside this one still states. What is asserted here is that setting the same kind again is not an occasion to overwrite a decision:
     * the default is a fallback for a track that has nothing, not a reset.
     */
    const added = addTrack(emptyArrangement(), "sampler", "Keys");
    const id = added.tracks[0]!.id;
    const withTrack = setTrackSample(added, id, "salamander-grand");
    expect(changeTrackKind(withTrack, id, "sampler").tracks[0]!.sample).toEqual({ assetId: "salamander-grand" });
  });

  it("drops the instrument when the track stops being a sampler", () => {
    // A drum track holding a catalogue asset would claim something sounds from a kind that does not play one.
    const added = addTrack(emptyArrangement(), "sampler", "Keys");
    const id = added.tracks[0]!.id;
    const withTrack = setTrackSample(added, id, "salamander-grand");
    expect(changeTrackKind(withTrack, id, "drumkit").tracks[0]!.sample).toBeUndefined();
  });
});

describe("a track's level and its place in the stereo field", () => {
  it("sets a level in dB and a pan between the channels", () => {
    const withTrack = addTrack(emptyArrangement(), "instrument", "Keys");
    const id = withTrack.tracks[0]!.id;
    expect(setTrackGain(withTrack, id, -6).tracks[0]!.gainDb).toBe(-6);
    expect(setTrackPan(withTrack, id, -0.5).tracks[0]!.pan).toBe(-0.5);
  });

  it("clamps rather than storing a value nothing can honour", () => {
    // ±60 dB is inaudible at both ends, and a pan past hard left is not a pan; a slider cannot send these, but an imported file or an agent can.
    const withTrack = addTrack(emptyArrangement(), "instrument", "Keys");
    const id = withTrack.tracks[0]!.id;
    expect(setTrackGain(withTrack, id, 999).tracks[0]!.gainDb).toBe(12);
    expect(setTrackGain(withTrack, id, -999).tracks[0]!.gainDb).toBe(-60);
    expect(setTrackPan(withTrack, id, 5).tracks[0]!.pan).toBe(1);
    expect(setTrackPan(withTrack, id, -5).tracks[0]!.pan).toBe(-1);
  });

  it("keeps a level when the track is muted, so unmuting does not undo it", () => {
    /**
     * Mute and level are separate decisions, which is why they are separate edits: Logic's track header has both, and a mute that reset the fader would be a mixer that forgets.
     */
    const withTrack = addTrack(emptyArrangement(), "instrument", "Keys");
    const id = withTrack.tracks[0]!.id;
    const quiet = setTrackGain(withTrack, id, -12);
    const muted = setTrackFlag(quiet, id, "muted", true);
    const unmuted = setTrackFlag(muted, id, "muted", false);
    expect(unmuted.tracks[0]!.gainDb).toBe(-12);
    expect(unmuted.tracks[0]!.muted).toBe(false);
  });

  it("leaves every other track alone", () => {
    const two = addTrack(addTrack(emptyArrangement(), "instrument", "Keys"), "instrument", "Bass");
    const edited = setTrackGain(two, two.tracks[0]!.id, -3);
    expect(edited.tracks[1]).toBe(two.tracks[1]);
  });
});

/**
 * ⭐ **A whole part in one call is only safe if it is the same edit as the loop it replaces.**
 *
 * Muse measured 4176 notes through `add_arrangement_note` as 4176 round trips, a `MaxListenersExceededWarning` and
 * hours of wall clock for one movement. The batch exists to remove the round trips, so its contract has to be
 * **equality with the loop**, not "close enough": a caller must not be able to tell which call wrote a part.
 */
describe("adding a batch of notes", () => {
  const oneHundred = Array.from({ length: 100 }, (_, index) => ({
    pitch: 40 + (index % 40),
    startBeats: index * 0.25,
    lengthBeats: 0.25,
    velocity: 100,
  }));

  it("produces exactly the arrangement that adding the same notes one at a time produces", () => {
    const withTrack = addTrack(emptyArrangement(), "instrument", "Keys");
    const id = withTrack.tracks[0]!.id;
    const start = { ...withTrack, notesByTrack: { [id]: [] } };

    const batched = addTrackNotes(start, id, oneHundred);
    // The loop the batch replaces, written out so the comparison is with behaviour rather than with a second batch.
    let looped: ArrangementV2 = start;
    for (const note of oneHundred) looped = addTrackNote(looped, id, note);

    // Length first, so two empty arrays cannot pass the equality below by both being empty.
    expect(batched.notesByTrack![id]).toHaveLength(100);
    // Field for field: `toEqual` rather than a count, because a batch that dropped a length or a velocity would still count 100.
    expect(batched.notesByTrack![id]).toEqual(looped.notesByTrack![id]);
  });

  it("adds nothing to a kind that makes no sound, and the unchanged count is how that is observed", () => {
    /**
     * `fx` and `folder` decline notes silently — their all-zero content is their definition. The batch keeps that rule
     * rather than reporting success, so the caller's only signal is the note count before and after; this pins that
     * the signal is real, because a batch that returned "ok" while adding nothing would be the worse shape.
     */
    for (const kind of ["fx", "folder"] as const) {
      const withTrack = addTrack(emptyArrangement(), kind, kind);
      const id = withTrack.tracks[0]!.id;
      const before = withTrack.notesByTrack?.[id]?.length ?? 0;
      const after = addTrackNotes(withTrack, id, oneHundred);
      expect(after.notesByTrack?.[id]?.length ?? 0, `${kind} must swallow the whole batch`).toBe(before);
    }
  });
});

/**
 * ⭐ **The tempo map is validated rather than clamped, and the first version was neither.**
 *
 * Its neighbours `setArrangementTempo` and `setArrangementBars` clamp, and the comment on this one says why it does
 * not: a point silently moved is a tempo the caller believes is in the file and is not, so every duration computed
 * from it is wrong in a way that looks like the caller's own arithmetic. The criteria below are the four ways that
 * promise can be broken — order, an unreadable bar, an out-of-range bpm, two points on one bar — plus the clear.
 */
describe("writing the tempo map", () => {
  it("stores the points in bar order however they were written", () => {
    // A map whose meaning depends on the order the caller happened to write it in changes meaning when someone reorders it.
    const shuffled = [
      { atBar: 8, bpm: 100 },
      { atBar: 0, bpm: 120 },
      { atBar: 4, bpm: 140, curve: "linear" as const },
    ];
    const mapped = setArrangementTempoMap(emptyArrangement(), shuffled);
    expect(mapped.tempoTrack!.map((point) => point.atBar)).toEqual([0, 4, 8]);
    // The points themselves survive intact, curve included — sorting must not be a rewrite.
    expect(mapped.tempoTrack).toEqual([
      { atBar: 0, bpm: 120 },
      { atBar: 4, bpm: 140, curve: "linear" },
      { atBar: 8, bpm: 100 },
    ]);
  });

  it("throws on a bar that is negative or not a whole number, rather than rounding it into place", () => {
    /**
     * **The rounding was the hole.** `Math.round` ran before the check, so `1.5` became `2` and was accepted: a point
     * the caller wrote was silently moved to a bar they did not choose, which is the exact failure the function's own
     * comment says it exists to prevent. Measured: `{atBar: 1.5}` and `{atBar: 0.4}` were both accepted before this
     * criterion existed.
     */
    const arrangement = emptyArrangement();
    expect(() => setArrangementTempoMap(arrangement, [{ atBar: -1, bpm: 120 }])).toThrow(/bars are whole numbers/);
    expect(() => setArrangementTempoMap(arrangement, [{ atBar: 1.5, bpm: 120 }])).toThrow(/bars are whole numbers/);
    expect(() => setArrangementTempoMap(arrangement, [{ atBar: 0.4, bpm: 120 }])).toThrow(/bars are whole numbers/);
    // A whole bar written as a float is still a whole bar, and is not refused.
    expect(setArrangementTempoMap(arrangement, [{ atBar: 2.0, bpm: 120 }]).tempoTrack![0]!.atBar).toBe(2);
  });

  it("throws on a bpm outside 20…300, including a fractional one just past the edge", () => {
    /**
     * The same rounding hole at the boundary: `300.4` rounded to `300` and was accepted, though the caller wrote a
     * value the range excludes. The check reads the written value, so the edge is the edge.
     */
    const arrangement = emptyArrangement();
    expect(() => setArrangementTempoMap(arrangement, [{ atBar: 0, bpm: 19 }])).toThrow(/20…300/);
    expect(() => setArrangementTempoMap(arrangement, [{ atBar: 0, bpm: 301 }])).toThrow(/20…300/);
    expect(() => setArrangementTempoMap(arrangement, [{ atBar: 0, bpm: 19.6 }])).toThrow(/20…300/);
    expect(() => setArrangementTempoMap(arrangement, [{ atBar: 0, bpm: 300.4 }])).toThrow(/20…300/);
    // And the edges themselves are inside the range, so the boundary is inclusive rather than merely nearby.
    expect(setArrangementTempoMap(arrangement, [{ atBar: 0, bpm: 20 }]).tempoTrack![0]!.bpm).toBe(20);
    expect(setArrangementTempoMap(arrangement, [{ atBar: 0, bpm: 300 }]).tempoTrack![0]!.bpm).toBe(300);
  });

  it("keeps the last point written for a bar, so two points cannot fight over one", () => {
    const mapped = setArrangementTempoMap(emptyArrangement(), [
      { atBar: 2, bpm: 100 },
      { atBar: 0, bpm: 120 },
      { atBar: 2, bpm: 200 },
    ]);
    // "Last written" is about call order, not bar order: the bar-2 point of 200 came after the bar-2 point of 100, so it is the one kept.
    expect(mapped.tempoTrack).toEqual([
      { atBar: 0, bpm: 120 },
      { atBar: 2, bpm: 200 },
    ]);
  });

  it("clears the map entirely when given no points, leaving no key rather than an empty one", () => {
    /**
     * An empty array is a real operation — back to the arrangement's single tempo. **Absent, not `[]`**: readers treat
     * a missing map as "one tempo" and an empty one as "a map with nothing in it", and the two must not be the same
     * state (the same distinction `flattenSong` and `tempoAwareTiming` already rely on).
     */
    const withMap = setArrangementTempoMap(emptyArrangement(), [{ atBar: 0, bpm: 90 }]);
    const cleared = setArrangementTempoMap(withMap, []);
    expect(cleared).not.toHaveProperty("tempoTrack");
    expect("tempoTrack" in cleared).toBe(false);
  });
});
