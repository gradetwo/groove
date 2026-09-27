import { describe, expect, it } from "vitest";
import { trackRows } from "../features/arrangement/songEdit";
import type { Song } from "../types/song";

/**
 * The per-lane rows a track view will draw — asserted on the thing no view has ever shown.
 *
 * `SongSection.slots` lets a lane play its own clip for a section; that landed in the model with tests of its own and has been **invisible in the
 * UI** since. These tests hold the row model the view needs, and the last one holds the property that matters most: it describes the timeline the
 * **renderer** will produce, because it is built from `sectionRegions`.
 */
const clip = (genre: string, tracks: Array<{ id: string; name: string }>) => ({
  genre_id: genre,
  bpm: 120,
  scale: "C major",
  totalSteps: 16,
  tracks: tracks.map(({ id, name }) => ({
    track_id: id,
    name,
    instrument: "synth",
    steps: Array.from({ length: 16 }, (_, index) => (index === 0 ? 1 : 0)),
    velocity: new Array(16).fill(100),
  })),
});

const song = (): Song =>
  ({
    id: "s",
    name: "rows",
    genreId: "custom",
    bpm: 120,
    clips: {
      A: clip("custom", [
        { id: "kick", name: "Kick" },
        { id: "lead", name: "Lead" },
      ]),
      B: clip("custom", [
        { id: "kick", name: "Kick" },
        { id: "lead", name: "Lead" },
      ]),
    },
    sections: [
      { id: "s1", slot: "A", bars: 2, label: "verse" },
      { id: "s2", slot: "A", bars: 2, label: "chorus", slots: { lead: "B" }, mute: ["kick"] },
    ],
  }) as unknown as Song;

describe("trackRows", () => {
  it("gives one row per lane the clips actually have, in first-seen order", () => {
    const rows = trackRows(song());
    expect(rows.map((row) => row.trackId)).toEqual(["kick", "lead"]);
    expect(rows.map((row) => row.name)).toEqual(["Kick", "Lead"]);
  });

  it("marks the lane that plays its own clip, which is the capability nothing has shown", () => {
    const lead = trackRows(song()).find((row) => row.trackId === "lead")!;
    expect(lead.cells.map((cell) => cell.slot)).toEqual(["A", "B"]);
    expect(lead.cells.map((cell) => cell.override)).toEqual([false, true]);
    // …and the lane that does not name one falls back to the section's slot, exactly as the flattener does.
    const kick = trackRows(song()).find((row) => row.trackId === "kick")!;
    expect(kick.cells.map((cell) => cell.slot)).toEqual(["A", "A"]);
    expect(kick.cells.every((cell) => cell.override === false)).toBe(true);
  });

  it("carries the mute and the stage geometry, so the view needs no arithmetic of its own", () => {
    const kick = trackRows(song()).find((row) => row.trackId === "kick")!;
    expect(kick.cells.map((cell) => cell.muted)).toEqual([false, true]);
    expect(kick.cells.map((cell) => [cell.startBar, cell.bars])).toEqual([
      [0, 2],
      [2, 2],
    ]);
  });

  it("describes the timeline the renderer produces, not the raw section list", () => {
    const broken = song();
    // A section pointing at a clip the song does not have is skipped by `resolveTimeline`, and the rows must skip it too: a view laid out from the
    // raw list would draw a stage that never plays and shift everything after it.
    (broken.sections as unknown as Array<{ slot: string }>)[1]!.slot = "Z";
    const rows = trackRows(broken);
    expect(rows[0]!.cells).toHaveLength(1);
  });
});
