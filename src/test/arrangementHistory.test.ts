import { describe, expect, it } from "vitest";
import {
  EMPTY_ARRANGEMENT_HISTORY,
  HISTORY_LIMIT,
  addTrackCommand,
  addTrackNoteCommand,
  canRedo,
  canUndo,
  changeTrackKindCommand,
  moveTrackNoteCommand,
  nextRedoAction,
  nextUndoAction,
  recordCommand,
  redoArrangement,
  removeTrackCommand,
  setArrangementBarsCommand,
  setTrackFlagCommand,
  setTrackGainCommand,
  setTrackNoteLengthCommand,
  toggleStepCommand,
  undoArrangement,
  type ArrangementCommand,
} from "../data/arrangementHistory";
import { addTrack, createArrangement, removeTrack, resetTrackIdsForTests, setTrackGain, setTrackParent } from "../data/arrangementEdits";

/**
 * ⭐ **The action stack, judged without a browser.**
 *
 * What matters here is the property the whole change rests on: **an undo puts back what the edit displaced, and a redo
 * afterwards puts back the same thing — same identities, same positions.** A stack that re-minted a track id on redo
 * would pass a "the track is there again" reading and fail every later action that names it, so the criteria below
 * assert **identity**, not counts, wherever identity is the thing at stake.
 */
const fresh = () => {
  resetTrackIdsForTests();
  return createArrangement("song", "synth");
};

function makeCommand(action: string): ArrangementCommand {
  return { action, redo: (arrangement) => arrangement, undo: (arrangement) => arrangement };
}

describe("the stack itself", () => {
  it("starts with nothing to undo or redo, and says so with a null step rather than a no-op", () => {
    const arrangement = fresh();
    expect(canUndo(EMPTY_ARRANGEMENT_HISTORY)).toBe(false);
    expect(canRedo(EMPTY_ARRANGEMENT_HISTORY)).toBe(false);
    expect(undoArrangement(EMPTY_ARRANGEMENT_HISTORY, arrangement)).toBeNull();
    expect(redoArrangement(EMPTY_ARRANGEMENT_HISTORY, arrangement)).toBeNull();
  });

  it("⭐ a new action discards the redos — Logic's own rule, and the reason there is no branch to choose", () => {
    const first = makeCommand("first");
    const second = makeCommand("second");
    const recorded = recordCommand(recordCommand(EMPTY_ARRANGEMENT_HISTORY, first), second);
    const stepped = undoArrangement(recorded, fresh())!;
    expect(canRedo(stepped.history)).toBe(true);
    // One more edit and the future is gone.
    const afterThird = recordCommand(stepped.history, makeCommand("third"));
    expect(canRedo(afterThird)).toBe(false);
  });

  it("caps the past at Logic's own ceiling rather than growing without bound", () => {
    let history = EMPTY_ARRANGEMENT_HISTORY;
    for (let index = 0; index < HISTORY_LIMIT + 10; index += 1) history = recordCommand(history, makeCommand(`action-${index}`));
    expect(history.past.length).toBe(HISTORY_LIMIT);
    // The newest survive; the oldest are the ones evicted.
    expect(nextUndoAction(history)).toBe(`action-${HISTORY_LIMIT + 9}`);
  });

  it("publishes what the next undo and redo would do, which is what the toolbar reads", () => {
    const history = recordCommand(EMPTY_ARRANGEMENT_HISTORY, makeCommand("add-track"));
    expect(nextUndoAction(history)).toBe("add-track");
    const stepped = undoArrangement(history, fresh())!;
    expect(nextRedoAction(stepped.history)).toBe("add-track");
  });
});

describe("adding and removing tracks", () => {
  it("⭐ redo after undo restores the SAME identity, because later actions on the stack name it", () => {
    const start = fresh();
    const command = addTrackCommand("sampler", "Keys");
    const added = command.redo(start);
    const id = command.addedTrackId!;
    expect(added.tracks.map((track) => track.id)).toContain(id);

    const undone = command.undo(added);
    expect(undone.tracks.map((track) => track.id)).not.toContain(id);

    const redone = command.redo(undone);
    expect(redone.tracks[redone.tracks.length - 1]?.id).toBe(id);
  });

  it("⭐ removing a track is undone with its notes AND its position, not appended at the end", () => {
    let arrangement = createArrangement("song", "synth");
    arrangement = addTrack(arrangement, "drumkit", "Drums");
    arrangement = addTrack(arrangement, "sampler", "Keys");
    const middle = arrangement.tracks[1]!.id;
    const notesBefore = arrangement.notesByTrack?.[middle] ?? [];
    expect(notesBefore.length).toBeGreaterThan(0);

    const command = removeTrackCommand(arrangement, middle);
    const after = command.redo(arrangement);
    expect(after.tracks.map((track) => track.id)).not.toContain(middle);

    const restored = command.undo(after);
    expect(restored.tracks.map((track) => track.id)).toEqual(arrangement.tracks.map((track) => track.id));
    expect(restored.notesByTrack?.[middle]).toEqual(notesBefore);
  });

  it("takes a folder's children with it and puts all of them back", () => {
    let arrangement = createArrangement("song", "synth");
    const folderId = arrangement.tracks[0]!.id;
    arrangement = addTrack(arrangement, "synth", "Child");
    const childId = arrangement.tracks[1]!.id;
    arrangement = setTrackParent(arrangement, childId, folderId);

    const command = removeTrackCommand(arrangement, folderId);
    const after = command.redo(arrangement);
    expect(after.tracks).toHaveLength(0);
    const restored = command.undo(after);
    expect(restored.tracks.map((track) => track.id)).toEqual([folderId, childId]);
    expect(restored.tracks[1]?.parentId).toBe(folderId);
  });
});

describe("the setters, whose inverse is the value they displaced", () => {
  it("gain goes back to what it was", () => {
    const arrangement = fresh();
    const trackId = arrangement.tracks[0]!.id;
    const command = setTrackGainCommand(trackId, 0, -6);
    const louder = command.redo(setTrackGain(arrangement, trackId, 12));
    expect(louder.tracks[0]?.gainDb).toBe(-6);
    expect(command.undo(louder).tracks[0]?.gainDb).toBe(0);
  });

  it("a boolean flag is its own argument, one step apart", () => {
    const arrangement = fresh();
    const trackId = arrangement.tracks[0]!.id;
    const command = setTrackFlagCommand(trackId, "muted", true);
    expect(command.redo(arrangement).tracks[0]?.muted).toBe(true);
    expect(command.undo(command.redo(arrangement)).tracks[0]?.muted).toBe(false);
  });

  it("a grid step toggles both ways through the same call", () => {
    const arrangement = fresh();
    const trackId = arrangement.tracks[0]!.id;
    const command = toggleStepCommand(trackId, 0);
    const on = command.redo(arrangement);
    expect(on.notesByTrack?.[trackId]?.length ?? 0).not.toBe(arrangement.notesByTrack?.[trackId]?.length ?? 0);
    expect(command.undo(on).notesByTrack?.[trackId]).toEqual(arrangement.notesByTrack?.[trackId]);
  });

  it("bars and note length come back to the numbers that were there", () => {
    const arrangement = fresh();
    const trackId = arrangement.tracks[0]!.id;
    const bars = setArrangementBarsCommand(8, 16);
    expect(bars.redo(arrangement).bars).toBe(16);
    expect(bars.undo(bars.redo(arrangement)).bars).toBe(8);

    const note = arrangement.notesByTrack![trackId]![0]!;
    const at = { pitch: note.pitch, startBeats: note.startBeats };
    const length = setTrackNoteLengthCommand(trackId, at, note.lengthBeats, 4);
    const longer = length.redo(arrangement);
    expect(longer.notesByTrack![trackId]![0]?.lengthBeats).toBe(4);
    expect(length.undo(longer).notesByTrack![trackId]![0]?.lengthBeats).toBe(note.lengthBeats);
  });
});

describe("notes and kind changes", () => {
  it("adding a note is undone by removing it at the same position", () => {
    const arrangement = fresh();
    const trackId = arrangement.tracks[0]!.id;
    const before = arrangement.notesByTrack?.[trackId] ?? [];
    const command = addTrackNoteCommand(trackId, { pitch: 64, startBeats: 5.5, lengthBeats: 1, velocity: 90 });
    const withNote = command.redo(arrangement);
    expect(withNote.notesByTrack?.[trackId]?.some((note) => note.pitch === 64 && note.startBeats === 5.5)).toBe(true);
    expect(command.undo(withNote).notesByTrack?.[trackId]).toEqual(before);
  });

  it("moving a note is undone by the same move with its ends swapped", () => {
    const arrangement = fresh();
    const trackId = arrangement.tracks[0]!.id;
    const note = arrangement.notesByTrack![trackId]![0]!;
    const from = { pitch: note.pitch, startBeats: note.startBeats };
    const to = { pitch: note.pitch + 5, startBeats: note.startBeats + 2 };
    const command = moveTrackNoteCommand(trackId, from, to);
    const moved = command.redo(arrangement);
    expect(moved.notesByTrack![trackId]!.some((candidate) => candidate.pitch === to.pitch && candidate.startBeats === to.startBeats)).toBe(true);
    expect(command.undo(moved).notesByTrack![trackId]).toEqual(arrangement.notesByTrack![trackId]);
  });

  it("⭐ a kind change is undone with the whole previous track, because leaving `sampler` drops the sample", () => {
    const arrangement = addTrack(fresh(), "sampler", "Keys");
    const track = arrangement.tracks[arrangement.tracks.length - 1]!;
    expect(track.sample).toBeDefined();

    const command = changeTrackKindCommand(track, "synth");
    const changed = command.redo(arrangement);
    const after = changed.tracks.find((candidate) => candidate.id === track.id)!;
    expect(after.kind).toBe("synth");
    expect(after.sample).toBeUndefined();

    const restored = command.undo(changed);
    expect(restored.tracks.find((candidate) => candidate.id === track.id)).toEqual(track);
  });
});

describe("stepping", () => {
  it("undo then redo is a round trip through the same edit functions", () => {
    const start = fresh();
    const command = addTrackCommand("drumkit", "Drums");
    const history = recordCommand(EMPTY_ARRANGEMENT_HISTORY, command);
    const applied = command.redo(start);
    const back = undoArrangement(history, applied)!;
    expect(back.action).toBe("add-track");
    expect(back.arrangement.tracks).toHaveLength(start.tracks.length);
    const forward = redoArrangement(back.history, back.arrangement)!;
    expect(forward.arrangement.tracks).toHaveLength(applied.tracks.length);
    expect(canUndo(forward.history)).toBe(true);
    expect(canRedo(forward.history)).toBe(false);
  });

  it("removing the last track leaves an empty arrangement that an undo fills again", () => {
    const arrangement = fresh();
    const trackId = arrangement.tracks[0]!.id;
    const command = removeTrackCommand(arrangement, trackId);
    const after = removeTrack(arrangement, trackId);
    expect(after.tracks).toHaveLength(0);
    expect(command.undo(after).tracks).toHaveLength(1);
  });
});
