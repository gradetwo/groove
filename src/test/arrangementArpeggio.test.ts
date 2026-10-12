import { describe, expect, it } from "vitest";
import type { ArrangementV2, NoteEvent } from "../types/arrangementV2";
import { arpeggiateNotesInRect } from "../data/arrangementEdits";

/**
 * ⭐ **An arpeggio, in three directions.** The criterion reads where the notes land and in what order, which is the shape the
 * older grid's rule produces, rather than restating the formula it uses.
 */
const note = (pitch: number, startBeats: number): NoteEvent => ({ pitch, startBeats, lengthBeats: 0.5, velocity: 100 });

const arrangementOf = (notes: NoteEvent[]): ArrangementV2 => ({
  songId: "arp",
  tracks: [{ id: "lead", kind: "synth", name: "Lead" }],
  notesByTrack: { lead: notes },
  bars: 4,
  sourceSlots: [],
});

const chord = () => arrangementOf([note(60, 2), note(64, 2), note(67, 2)]);
const all = { fromBeats: 0, toBeats: 32, pitchFrom: 0, pitchTo: 127 };
const placed = (value: ArrangementV2) => [...value.notesByTrack!.lead!].sort((a, b) => a.startBeats - b.startBeats);

describe("an arpeggio", () => {
  it("⭐ lays the chord out upwards, and the chord itself is gone", () => {
    const after = arpeggiateNotesInRect(chord(), "lead", all, { direction: "up", stepBeats: 0.5 });
    const notes = placed(after);
    expect(notes.map((n) => n.startBeats)).toEqual([2, 2.5, 3]);
    expect(notes.map((n) => n.pitch)).toEqual([60, 64, 67]);
    expect(notes.filter((n) => n.startBeats === 2).length).toBe(1);
  });

  it("⭐ lays it out downwards when asked", () => {
    const after = arpeggiateNotesInRect(chord(), "lead", all, { direction: "down", stepBeats: 0.5 });
    expect(placed(after).map((n) => n.pitch)).toEqual([67, 64, 60]);
  });

  it("⭐ goes up and back down when asked for both, so the middle note sounds twice", () => {
    const after = arpeggiateNotesInRect(chord(), "lead", all, { direction: "updown", stepBeats: 0.5 });
    const notes = placed(after);
    expect(notes.map((n) => n.pitch)).toEqual([60, 64, 67, 64]);
    expect(notes.map((n) => n.startBeats)).toEqual([2, 2.5, 3, 3.5]);
  });

  it("⭐ leaves a note outside the rectangle exactly as it was", () => {
    const arrangement = arrangementOf([note(60, 2), note(64, 2), note(72, 0)]);
    const after = arpeggiateNotesInRect(arrangement, "lead", all, { direction: "up", stepBeats: 0.5 });
    const untouched = after.notesByTrack!.lead!.find((n) => n.pitch === 72);
    expect(untouched?.startBeats).toBe(0);
  });
});
