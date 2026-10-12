import { describe, expect, it } from "vitest";
import { setNoteVelocity } from "../data/noteEvents";
import { setTrackNoteVelocity } from "../data/arrangementEdits";
import { setTrackNoteVelocityCommand } from "../data/arrangementHistory";
/** The arrangement's type is taken from the edit itself: these cases build the minimal shape the edits read. */
type ArrangementV2 = Parameters<typeof setTrackNoteVelocity>[0];

/**
 * ⭐ **One note's velocity, which the roll could neither show nor change.**
 *
 * The measurement behind the feature: the note element carried `data-length` and no velocity, and the only velocity
 * controls were the *new-note* slider and a whole-track ramp — so "the strings are too loud on beat 3" had no answer.
 * These cases pin the three things that can go wrong in that answer: the clamp, the identity of the note (pitch **and**
 * grid position, so a neighbouring note is untouched), and undo.
 */
const arrangement = (): ArrangementV2 =>
  ({
    id: "a",
    name: "a",
    bpm: 120,
    timeSignature: "4/4",
    bars: 2,
    tracks: [{ id: "strings", kind: "synth", name: "Strings" }],
    notesByTrack: {
      strings: [
        { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 },
        { pitch: 60, startBeats: 1, lengthBeats: 1, velocity: 100 },
        { pitch: 62, startBeats: 0, lengthBeats: 1, velocity: 100 },
      ],
    },
  }) as unknown as ArrangementV2;

describe("one note's velocity", () => {
  it("⭐ changes exactly the note at that grid position, and clamps to the MIDI range", () => {
    const notes = setNoteVelocity(arrangement().notesByTrack!.strings!, { pitch: 60, startBeats: 1 }, 40);
    expect(notes.map((n) => n.velocity)).toEqual([100, 40, 100]);
    // The clamp is not decoration: a slider at 0 or a doubled value would otherwise reach a synth as 0 or 254.
    expect(setNoteVelocity(notes, { pitch: 60, startBeats: 1 }, 0).map((n) => n.velocity)).toEqual([100, 1, 100]);
    expect(setNoteVelocity(notes, { pitch: 60, startBeats: 1 }, 999).map((n) => n.velocity)).toEqual([100, 127, 100]);
  });

  it("goes through the arrangement, and undo restores what was there", () => {
    const before = arrangement();
    const after = setTrackNoteVelocity(before, "strings", { pitch: 60, startBeats: 1 }, 55);
    expect(after.notesByTrack!.strings![1]!.velocity).toBe(55);
    expect(before.notesByTrack!.strings![1]!.velocity).toBe(100);

    const command = setTrackNoteVelocityCommand("strings", { pitch: 60, startBeats: 1 }, 100, 55);
    expect(command.redo(before).notesByTrack!.strings![1]!.velocity).toBe(55);
    expect(command.undo(command.redo(before)).notesByTrack!.strings![1]!.velocity).toBe(100);
    // A note that did not exist before undo is a no-op rather than a reset: `undefined` means "there was no value".
    expect(setTrackNoteVelocityCommand("strings", { pitch: 99, startBeats: 0 }, undefined, 40).undo(before)).toBe(before);
  });
});
