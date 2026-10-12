import { describe, expect, it } from "vitest";
import type { ArrangementV2, NoteEvent } from "../types/arrangementV2";
import { legatoNotesInRect } from "../data/arrangementEdits";

/**
 * ⭐ **Legato, in both directions.** The older rule lengthens a note to the next sounding start and shortens it when that
 * start is closer, so the criterion measures the distance the music actually has rather than repeating the formula.
 */
const note = (pitch: number, startBeats: number, lengthBeats: number): NoteEvent => ({ pitch, startBeats, lengthBeats, velocity: 100 });

const arrangementOf = (notes: NoteEvent[]): ArrangementV2 => ({
  songId: "legato",
  tracks: [{ id: "lead", kind: "synth", name: "Lead" }],
  notesByTrack: { lead: notes },
  bars: 4,
  sourceSlots: [],
});

const all = { fromBeats: 0, toBeats: 32, pitchFrom: 0, pitchTo: 127 };

describe("legato", () => {
  it("⭐ reaches the next sounding note, and the loop end when nothing follows", () => {
    const arrangement = arrangementOf([note(60, 0, 0.25), note(62, 2, 0.25), note(64, 4, 0.25)]);
    const after = legatoNotesInRect(arrangement, "lead", all, { loopEndBeats: 8 });
    expect(after.notesByTrack!.lead!.map((n) => n.lengthBeats)).toEqual([2, 2, 4]);
  });

  it("⭐ shortens a note when the next one is closer than it is long", () => {
    const arrangement = arrangementOf([note(60, 0, 3), note(62, 0.5, 1)]);
    const after = legatoNotesInRect(arrangement, "lead", all, { loopEndBeats: 8 });
    expect(after.notesByTrack!.lead![0]!.lengthBeats).toBe(0.5);
  });

  it("⭐ leaves a note outside the rectangle exactly as it was", () => {
    const arrangement = arrangementOf([note(60, 0, 0.25), note(62, 2, 1.5)]);
    const only = { fromBeats: 0, toBeats: 1, pitchFrom: 0, pitchTo: 127 };
    const after = legatoNotesInRect(arrangement, "lead", only, { loopEndBeats: 8 });
    expect(after.notesByTrack!.lead![1]!.lengthBeats).toBe(1.5);
  });
});
