import { describe, expect, it } from "vitest";
import { transposeNotesInRange } from "../data/arrangementEdits";
import { arrangementSeededFromGenre } from "../data/arrangementProjection";
import { GENRES_MAP } from "../data/genres";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * ⭐ **A transposition moves the span it is given and nothing else.**
 *
 * The cases pin the three claims the move makes: the notes inside rise by the interval, the notes outside are returned as they
 * were, and zero semitones is the identity — so moving a part up and then down leaves the music where it started.
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
          { pitch: 62, startBeats: 4, lengthBeats: 1, velocity: 100 },
          { pitch: 64, startBeats: 8, lengthBeats: 1, velocity: 100 },
        ],
      },
    },
  };
};

describe("a transposition over a range", () => {
  it("⭐ lifts the notes inside and returns the ones outside untouched", () => {
    const { arrangement, trackId } = fixture();
    const notes = transposeNotesInRange(arrangement, trackId, 0, 8, 12).notesByTrack![trackId]!;
    expect(notes.map((note) => note.pitch)).toEqual([72, 74, 64]);
  });

  it("⭐ moving a span up and back leaves the music exactly as it was", () => {
    const { arrangement, trackId } = fixture();
    const up = transposeNotesInRange(arrangement, trackId, 0, 8, 7);
    const back = transposeNotesInRange(up, trackId, 0, 8, -7);
    expect(JSON.stringify(back.notesByTrack)).toBe(JSON.stringify(arrangement.notesByTrack));
  });

  it("⭐ zero semitones changes nothing at all", () => {
    const { arrangement, trackId } = fixture();
    const same = transposeNotesInRange(arrangement, trackId, 0, 16, 0);
    expect(JSON.stringify(same.notesByTrack)).toBe(JSON.stringify(arrangement.notesByTrack));
  });
});
