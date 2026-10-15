/**
 * ⭐ **Humanisation has to be reproducible, or it is not an edit — it is a roll of the dice.**
 *
 * `rollModel.ts` has carried `humanizeNotesVelocity` for the old step-grid editor, and the arrangement had no equivalent:
 * its velocity *ramp* interpolates a line, which is a crescendo rather than a humanisation. This is the arrangement-side
 * function, and the property that matters most is the one that makes it testable at all.
 *
 * The failures worth catching:
 *
 *   - **randomness.** A `Math.random` humanisation can only be asserted statistically, cannot be reproduced in a bug report,
 *     and makes the same project sound different on two renders. This one derives its offset from the note's **position and
 *     pitch**, so the same bars humanise the same way — and the criterion asserts exactly that by running it twice;
 *   - **silencing a note.** A humanisation that pushed velocity to 0 would mute a note, which is not what "make this less
 *     mechanical" means, so the result is clamped to 1…127;
 *   - **touching notes nobody marked.** Marks are a set, not a rectangle — the rule `stampChordInRect` and
 *     `arpeggiateNotesInRect` already state — so a pass with `only` must leave every other note exactly as it was.
 */
import { describe, it, expect } from "vitest";
import { createArrangement, humanizeArrangementNoteVelocity } from "../data/arrangementEdits";
import type { ArrangementV2, NoteEvent } from "../types/arrangementV2";

/** A lane with `count` notes on a 1/4-beat grid, all at velocity 100 unless stated. */
const withNotes = (notes: Partial<NoteEvent>[]): { arrangement: ArrangementV2; trackId: string } => {
  const base = createArrangement("s1");
  const trackId = base.tracks[0]!.id;
  const landed: NoteEvent[] = notes.map((over, index) => ({
    pitch: over.pitch ?? 60 + index,
    startBeats: over.startBeats ?? index * 0.25,
    lengthBeats: over.lengthBeats ?? 0.25,
    velocity: over.velocity ?? 100,
  }));
  return { arrangement: { ...base, notesByTrack: { [trackId]: landed } }, trackId };
};

const velocitiesOf = (arrangement: ArrangementV2, trackId: string) =>
  (arrangement.notesByTrack?.[trackId] ?? []).map((note) => note.velocity);

describe("humanizeArrangementNoteVelocity", () => {
  it("⭐ moves velocities and leaves them playable", () => {
    const { arrangement, trackId } = withNotes([{ pitch: 60 }, { pitch: 62 }, { pitch: 64 }, { pitch: 65 }]);
    const after = humanizeArrangementNoteVelocity(arrangement, trackId);
    const velocities = velocitiesOf(after, trackId);
    expect(velocities, "something changed, or the control does nothing").not.toEqual([100, 100, 100, 100]);
    for (const velocity of velocities) {
      expect(velocity).toBeGreaterThanOrEqual(1);
      expect(velocity).toBeLessThanOrEqual(127);
    }
  });

  it("⭐ is reproducible: the same bars humanise the same way every time", () => {
    /**
     * ⭐ The property that makes this an edit rather than a randomiser. Two runs over identical input must agree, and a
     * second pass must compound predictably rather than drift — which is what a person re-opening a project expects.
     */
    const { arrangement, trackId } = withNotes([{ pitch: 60 }, { pitch: 63 }, { pitch: 67 }]);
    const once = velocitiesOf(humanizeArrangementNoteVelocity(arrangement, trackId), trackId);
    const twice = velocitiesOf(humanizeArrangementNoteVelocity(arrangement, trackId), trackId);
    expect(once).toEqual(twice);
    // And a second application compounds the same offsets, so it is a function of the notes and not of a hidden counter.
    const compounded = velocitiesOf(humanizeArrangementNoteVelocity(humanizeArrangementNoteVelocity(arrangement, trackId), trackId), trackId);
    expect(compounded).toEqual(once.map((velocity, index) => velocity + (once[index]! - 100)));
  });

  it("⚠️ clamps to playable, so a humanisation cannot silence a note", () => {
    // Notes already at the floor and ceiling: the offset must not take either out of range.
    const { arrangement, trackId } = withNotes([
      { pitch: 60, velocity: 1 },
      { pitch: 61, velocity: 127 },
      { pitch: 62, velocity: 126 },
    ]);
    const velocities = velocitiesOf(humanizeArrangementNoteVelocity(arrangement, trackId, { amount: 40 }), trackId);
    for (const velocity of velocities) {
      expect(velocity, "a velocity of 0 would mute the note").toBeGreaterThanOrEqual(1);
      expect(velocity).toBeLessThanOrEqual(127);
    }
  });

  it("⭐ touches exactly the marked notes, and the whole lane when nothing is marked", () => {
    const { arrangement, trackId } = withNotes([{ pitch: 60 }, { pitch: 62 }, { pitch: 64 }]);
    const only = (arrangement.notesByTrack![trackId] ?? []).slice(0, 1).map((note) => ({ pitch: note.pitch, startBeats: note.startBeats }));
    const marked = humanizeArrangementNoteVelocity(arrangement, trackId, { only });
    const untouched = velocitiesOf(arrangement, trackId);
    const after = velocitiesOf(marked, trackId);
    // The rule `stampChordInRect` states: marks are a set, so a note nobody marked is left alone.
    expect(after.slice(1), "the unmarked notes are exactly as they were").toEqual(untouched.slice(1));

    // No marks ⇒ the whole lane, which is what "humanise this track" means.
    const whole = humanizeArrangementNoteVelocity(arrangement, trackId, {});
    expect(velocitiesOf(whole, trackId).filter((velocity) => velocity !== 100).length, "more than one note moved").toBeGreaterThan(1);
  });

  it("⭐ amount 0 is a no-op, and an unknown lane or an empty lane changes nothing", () => {
    const { arrangement, trackId } = withNotes([{ pitch: 60 }, { pitch: 62 }]);
    expect(humanizeArrangementNoteVelocity(arrangement, trackId, { amount: 0 })).toEqual(arrangement);
    // A lane with no notes: the same object back rather than an empty entry invented.
    expect(humanizeArrangementNoteVelocity(arrangement, "no-such-track")).toEqual(arrangement);
    /**
     * ⚠️ **A genuinely empty lane, which `createArrangement` does not give you.** It seeds a default four-note track, so my
     * first version of this case asserted against a lane that had notes in it and would have passed for no reason. The lane
     * is emptied explicitly here, which is the only honest way to test the branch.
     */
    const baseline = createArrangement("s1");
    const baselineId = baseline.tracks[0]!.id;
    const emptyLane: ArrangementV2 = { ...baseline, notesByTrack: { [baselineId]: [] } };
    const after = humanizeArrangementNoteVelocity(emptyLane, baselineId);
    expect(after, "returned unchanged, not given an empty entry").toEqual(emptyLane);
    expect(after.notesByTrack?.[baselineId], "and the lane is still the empty array it was").toEqual([]);

    // A bigger amount produces a wider spread than a small one — the parameter does something.
    const spread = (amount: number) => {
      const values = velocitiesOf(humanizeArrangementNoteVelocity(arrangement, trackId, { amount }), trackId);
      return Math.max(...values) - Math.min(...values);
    };
    expect(spread(20)).toBeGreaterThan(spread(2));
  });
});
