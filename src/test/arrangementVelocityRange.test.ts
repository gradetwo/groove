import { describe, expect, it } from "vitest";
import { rampVelocityInRange } from "../data/arrangementEdits";
import { arrangementSeededFromGenre } from "../data/arrangementProjection";
import { GENRES_MAP } from "../data/genres";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * ⭐ **A form's ramp scales the notes it covers and touches nothing else.**
 *
 * The distinction these cases pin is the one that reusing the track-wide ramp would lose: that one writes absolute velocities and
 * would flatten a composer's dynamics, so the ratio is what is checked, not a resulting value.
 */
const fixture = (): { arrangement: ArrangementV2; trackId: string } => {
  const seeded = arrangementSeededFromGenre("new", Object.values(GENRES_MAP)[0]!);
  const trackId = seeded.tracks[0]!.id;
  return {
    trackId,
    arrangement: {
      ...seeded,
      notesByTrack: {
        ...seeded.notesByTrack,
        [trackId]: [
          { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 },
          { pitch: 62, startBeats: 4, lengthBeats: 1, velocity: 50 },
          { pitch: 64, startBeats: 8, lengthBeats: 1, velocity: 100 },
        ],
      },
    },
  };
};

describe("a velocity ramp over a range", () => {
  it("⭐ scales the notes inside the range and returns the ones outside untouched", () => {
    const { arrangement, trackId } = fixture();
    const notes = rampVelocityInRange(arrangement, trackId, 0, 8, 0.5, 0.5).notesByTrack![trackId]!;
    expect(notes.map((note) => note.velocity)).toEqual([50, 25, 100]);
  });

  it("⭐ grows across the range rather than stepping to one value", () => {
    const { arrangement, trackId } = fixture();
    const notes = rampVelocityInRange(arrangement, trackId, 0, 8, 0.5, 1).notesByTrack![trackId]!;
    // ⭐ The two inside keep their 2:1 relationship, which an absolute ramp would have destroyed.
    expect(notes[0]!.velocity).toBe(50);
    expect(notes[1]!.velocity).toBe(38);
    expect(notes[2]!.velocity).toBe(100);
  });

  it("⭐ a factor of one is the identity, so the operation is reversible", () => {
    const { arrangement, trackId } = fixture();
    const after = rampVelocityInRange(arrangement, trackId, 0, 16, 1, 1);
    expect(JSON.stringify(after.notesByTrack)).toBe(JSON.stringify(arrangement.notesByTrack));
  });
});
