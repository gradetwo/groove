import { describe, expect, it } from "vitest";
import type { ArrangementV2, NoteEvent } from "../types/arrangementV2";
import { stampChordInRect } from "../data/arrangementEdits";

/**
 * ⭐ **A chord stamped on a start.** Two of the seven shapes state their intervals outright, so the criterion reads the pitch
 * set those shapes produce rather than trusting a style table, and one case checks that the stamp replaces what it lands on.
 */
const note = (pitch: number, startBeats: number): NoteEvent => ({ pitch, startBeats, lengthBeats: 0.5, velocity: 100 });

const arrangementOf = (notes: NoteEvent[]): ArrangementV2 => ({
  songId: "stamp",
  tracks: [{ id: "chords", kind: "synth", name: "Chords" }],
  notesByTrack: { chords: notes },
  bars: 4,
  sourceSlots: [],
});

const at = (value: ArrangementV2, start: number) =>
  value.notesByTrack!.chords!.filter((n) => n.startBeats === start).map((n) => n.pitch).sort((a, b) => a - b);

describe("a chord stamp", () => {
  it("⭐ places one pitch for a single note shape", () => {
    const after = stampChordInRect(arrangementOf([]), "chords", { fromBeats: 1, toBeats: 1, pitchFrom: 0, pitchTo: 127 }, { type: "note", rootMidi: 60 });
    expect(at(after, 1)).toEqual([60]);
  });

  it("⭐ places the sus two shape's own intervals", () => {
    const after = stampChordInRect(arrangementOf([]), "chords", { fromBeats: 2, toBeats: 2, pitchFrom: 0, pitchTo: 127 }, { type: "sus2", rootMidi: 60 });
    expect(at(after, 2)).toEqual([60, 62, 67]);
  });

  it("⭐ places five pitches for the ninth", () => {
    const after = stampChordInRect(arrangementOf([]), "chords", { fromBeats: 0, toBeats: 0, pitchFrom: 0, pitchTo: 127 }, { type: "ninth", rootMidi: 60 });
    expect(at(after, 0)).toEqual([60, 64, 67, 71, 74]);
  });

  it("⭐ replaces what already sits on the start it lands on", () => {
    const before = arrangementOf([note(48, 0), note(55, 0), note(72, 4)]);
    const after = stampChordInRect(before, "chords", { fromBeats: 0, toBeats: 0, pitchFrom: 0, pitchTo: 127 }, { type: "sus2", rootMidi: 60 });
    expect(at(after, 0)).toEqual([60, 62, 67]);
    // ⭐ And a start it did not land on is untouched.
    expect(at(after, 4)).toEqual([72]);
  });
});
