import { describe, expect, it } from "vitest";
import { setSectionLaneSlot, setSectionLaneSlots, trackRows } from "../features/arrangement/songEdit";
import type { Song } from "../types/song";

/**
 * The batch operation, held to the two properties the fourth report asked for — one call for the whole matrix, and no half-applied state.
 *
 * A 9-movement × 8-lane piece is 72 cells; the point of this function is that it is **one** call, and that a caller who gets one of them wrong gets nothing
 * applied rather than a matrix that is half old and half new.
 */
const clip = (tracks: string[]) => ({
  genre_id: "custom",
  bpm: 120,
  scale: "C major",
  totalSteps: 16,
  tracks: tracks.map((id) => ({
    track_id: id,
    name: id,
    instrument: "synth",
    steps: Array.from({ length: 16 }, (_, index) => (index === 0 ? 1 : 0)),
  })),
});

const LANES = ["kick", "snare", "hihat", "percussion", "bass", "chords", "lead", "fx"];

const song = (sections = 9): Song =>
  ({
    id: "s",
    genreId: "custom",
    bpm: 120,
    clips: { A: clip(LANES), B: clip(LANES), C: clip(LANES), D: clip(LANES) },
    sections: Array.from({ length: sections }, (_, index) => ({ id: `s${index + 1}`, slot: "A", bars: 2 })),
  }) as unknown as Song;

describe("setSectionLaneSlots", () => {
  it("is deep-equal to the same edits applied one at a time", () => {
    const edits = [
      { sectionId: "s1", trackId: "lead", slot: "B" as const },
      { sectionId: "s2", trackId: "chords", slot: "C" as const },
      { sectionId: "s3", trackId: "fx", slot: null },
      { sectionId: "s4", trackId: "bass", slot: "A" as const },
    ];
    const batched = setSectionLaneSlots(song(), edits);
    let oneByOne = song();
    for (const edit of edits) oneByOne = setSectionLaneSlot(oneByOne, edit.sectionId, edit.trackId, edit.slot);
    expect(batched.problems).toEqual([]);
    expect(JSON.stringify(batched.song)).toBe(JSON.stringify(oneByOne));
  });

  it("applies a whole 9 × 8 matrix in one call, which is the report's scenario", () => {
    const edits = Array.from({ length: 9 }, (_, row) =>
      LANES.map((trackId) => ({ sectionId: `s${row + 1}`, trackId, slot: (["B", "C", "D"] as const)[row % 3]! }))
    ).flat();
    expect(edits).toHaveLength(72);
    const result = setSectionLaneSlots(song(), edits);
    expect(result.problems).toEqual([]);
    expect(result.applied).toHaveLength(72);
    // Every lane of every section now plays the slot that was asked for, and the rows say so.
    const rows = trackRows(result.song);
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      row.cells.forEach((cell, index) => {
        const asked = (["B", "C", "D"] as const)[index % 3]!;
        expect(cell.slot, `${row.trackId} in ${cell.sectionId}`).toBe(asked);
      });
    }
  });

  it("is all-or-nothing: one bad entry leaves the song untouched and says why", () => {
    const base = song();
    const result = setSectionLaneSlots(base, [
      { sectionId: "s1", trackId: "lead", slot: "B" },
      { sectionId: "s99", trackId: "lead", slot: "C" },
      { sectionId: "s2", trackId: "nope", slot: "C" },
      { sectionId: "s3", trackId: "lead", slot: "Z" as never },
    ]);
    expect(result.song).toBe(base); // the same object, not an equal one
    expect(result.applied).toEqual([]);
    expect(result.problems.join(" | ")).toContain('no section "s99"');
    expect(result.problems.join(" | ")).toContain('no lane "nope"');
    expect(result.problems.join(" | ")).toContain("no clip Z");
  });

  it("treats an empty batch as no edit at all, rather than a rewrite", () => {
    const base = song();
    const result = setSectionLaneSlots(base, []);
    expect(result.song).toBe(base);
    expect(result.problems).toEqual([]);
  });

  it("keeps the single-call rule that setting a lane to its section's own slot is a clear", () => {
    const result = setSectionLaneSlots(song(), [{ sectionId: "s1", trackId: "lead", slot: "A" }]);
    expect(result.problems).toEqual([]);
    expect(result.song.sections[0]).not.toHaveProperty("slots");
  });
});
