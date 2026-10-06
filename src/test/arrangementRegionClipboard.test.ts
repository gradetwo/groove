import { describe, expect, it } from "vitest";
import type { ArrangementV2, NoteEvent } from "../types/arrangementV2";
import { duplicateNotesByDelta, notesWithinRect, removeNotesWithinRect } from "../data/arrangementEdits";

/**
 * ⭐ **The second group: a rectangle, and a copy placed by a delta.** The counts asserted are the music's own — how many
 * notes the rectangle really holds — rather than numbers handed back by the function under test.
 */
const note = (pitch: number, startBeats: number, lengthBeats = 0.5): NoteEvent => ({ pitch, startBeats, lengthBeats, velocity: 100 });

const arrangementOf = (notes: NoteEvent[]): ArrangementV2 => ({
  songId: "clip",
  tracks: [{ id: "lead", kind: "synth", name: "Lead" }],
  notesByTrack: { lead: notes },
  bars: 4,
  sourceSlots: [],
});

describe("a rectangle over the notes", () => {
  it("⭐ holds exactly the notes inside it, whichever way the drag went", () => {
    const notes = arrangementOf([note(60, 0), note(62, 1), note(64, 2), note(67, 3)]).notesByTrack!.lead!;
    const forward = notesWithinRect(notes, { fromBeats: 0.5, toBeats: 2.5, pitchFrom: 60, pitchTo: 64 });
    const backward = notesWithinRect(notes, { fromBeats: 2.5, toBeats: 0.5, pitchFrom: 64, pitchTo: 60 });
    expect(forward.map((n) => n.pitch)).toEqual([62, 64]);
    expect(backward.map((n) => n.pitch)).toEqual([62, 64]);
  });

  it("⭐ copies a region where it is put, and the copy count is the region's own", () => {
    const arrangement = arrangementOf([note(60, 0), note(62, 1), note(64, 2), note(67, 3)]);
    const rect = { fromBeats: 0, toBeats: 1, pitchFrom: 60, pitchTo: 62 };
    const before = arrangement.notesByTrack!.lead!.length;
    const inside = notesWithinRect(arrangement.notesByTrack!.lead!, rect).length;
    const { arrangement: after, copied } = duplicateNotesByDelta(arrangement, "lead", rect, 2);
    expect(inside).toBe(2);
    expect(copied.length).toBe(inside);
    expect(after.notesByTrack!.lead!.length).toBe(before + inside);
    expect(copied.map((n) => n.startBeats).sort()).toEqual([2, 3]);
  });

  it("⭐ removes the region's notes and leaves every note outside it alone", () => {
    const arrangement = arrangementOf([note(60, 0), note(62, 1), note(64, 2), note(67, 3)]);
    const rect = { fromBeats: 0.5, toBeats: 2.5, pitchFrom: 60, pitchTo: 64 };
    const outside = arrangement.notesByTrack!.lead!.filter((n) => ![62, 64].includes(n.pitch));
    const after = removeNotesWithinRect(arrangement, "lead", rect);
    expect(notesWithinRect(after.notesByTrack!.lead!, rect).length).toBe(0);
    expect(after.notesByTrack!.lead!.map((n) => n.pitch)).toEqual(outside.map((n) => n.pitch));
  });
});
