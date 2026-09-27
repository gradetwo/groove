import { describe, expect, it } from "vitest";
import { setSectionLaneSlot, trackRows } from "../features/arrangement/songEdit";
import type { Song } from "../types/song";

/**
 * Setting a lane's own clip — the operation the command layer never had, and the one `TrackRows` made worth having.
 *
 * The properties that matter are the ones the rest of `songEdit` keeps: an edit that changes nothing returns the **same object** (so a caller's
 * `next !== song` check skips the gesture), and clearing an override **removes** the field rather than storing a null, so a section that never
 * overrode a lane and one that stopped behave identically.
 */
const clip = () => ({
  genre_id: "custom",
  bpm: 120,
  scale: "C major",
  totalSteps: 16,
  tracks: [
    { track_id: "kick", name: "Kick", instrument: "drum", steps: new Array(16).fill(0) },
    { track_id: "lead", name: "Lead", instrument: "synth", steps: new Array(16).fill(0) },
  ],
});

const song = (): Song =>
  ({
    id: "s",
    genreId: "custom",
    bpm: 120,
    clips: { A: clip(), B: clip(), C: clip() },
    sections: [
      { id: "s1", slot: "A", bars: 2 },
      { id: "s2", slot: "A", bars: 2 },
    ],
  }) as unknown as Song;

describe("setSectionLaneSlot", () => {
  it("gives one lane its own clip for one section, and leaves the others on the section's slot", () => {
    const next = setSectionLaneSlot(song(), "s2", "lead", "B");
    expect(next).not.toBe(song());
    const rows = trackRows(next);
    expect(rows.find((row) => row.trackId === "lead")!.cells.map((cell) => cell.slot)).toEqual(["A", "B"]);
    expect(rows.find((row) => row.trackId === "kick")!.cells.map((cell) => cell.slot)).toEqual(["A", "A"]);
    // The first section is untouched: this is an edit to one section, which is what it says on the tin.
    expect(rows.find((row) => row.trackId === "lead")!.cells.map((cell) => cell.override)).toEqual([false, true]);
  });

  it("clears back to the section's slot by removing the key, so nothing distinguishes the two states", () => {
    const withOverride = setSectionLaneSlot(song(), "s2", "lead", "B");
    const cleared = setSectionLaneSlot(withOverride, "s2", "lead", null);
    expect(cleared.sections[1]).not.toHaveProperty("slots");
    expect(trackRows(cleared).find((row) => row.trackId === "lead")!.cells[1]!.slot).toBe("A");
  });

  it("returns the same song when the edit would change nothing", () => {
    const base = song();
    expect(setSectionLaneSlot(base, "nope", "lead", "B")).toBe(base);
    expect(setSectionLaneSlot(base, "s1", "lead", "A")).toBe(base);
    expect(setSectionLaneSlot(base, "s1", "lead", null)).toBe(base);
  });

  it("refuses a slot the song does not have, rather than storing a section that renders as nothing", () => {
    const base = song();
    expect(setSectionLaneSlot(base, "s1", "lead", "D" as never)).toBe(base);
  });
});
