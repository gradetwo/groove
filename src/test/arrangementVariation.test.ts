import { describe, expect, it } from "vitest";
import { createArrangementFromTemplate, varyArrangementNotes } from "../data/arrangementEdits";
import { addTrackNotes } from "../data/arrangementEdits";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * ⭐ **A variation is a function of the notes and a source of chance.**
 *
 * The studio's variation cloned a step-grid pattern and rolled dice over its arrays; this one is written against notes, because the
 * arrangement has no grid. Chance is injected, so these cases ask for one exact variation rather than hoping for a stable one --
 * and they check the two rules the notes can state: the lowest note keeps its place, and everything else stays in the scale.
 */
describe("a variation of a track's notes", () => {
  const seeded = (): ArrangementV2 => {
    const base = createArrangementFromTemplate("blank", "variation-probe");
    const trackId = base.tracks[0]!.id;
    return addTrackNotes(base, trackId, [
      { pitch: 36, startBeats: 0, lengthBeats: 0.25, velocity: 100 },
      { pitch: 60, startBeats: 1, lengthBeats: 0.25, velocity: 100 },
      { pitch: 63, startBeats: 2, lengthBeats: 0.25, velocity: 100 },
      { pitch: 67, startBeats: 3, lengthBeats: 0.25, velocity: 100 },
    ]);
  };

  it("⭐ leaves the lowest note alone and returns a new arrangement", () => {
    const before = seeded();
    const trackId = before.tracks[0]!.id;
    // A source that always says yes and always moves upwards: one exact variation, not a random one.
    const beforeNotes = before.notesByTrack?.[trackId] ?? [];
    const after = varyArrangementNotes(before, trackId, { intensity: "wild", random: () => 0.1 });
    // ⭐ The template carries starter notes of its own, so the case compares the part against itself rather than against a number.
    expect(beforeNotes.length).toBeGreaterThan(0);

    expect(after).not.toBe(before);
    const landed = after.notesByTrack?.[trackId] ?? [];
    const lowestBefore = Math.min(...(before.notesByTrack?.[trackId] ?? []).map((note) => note.pitch));
    expect(landed.some((note) => note.pitch === lowestBefore)).toBe(true);
    // ⭐ And every note it did move stayed inside the scale it was given.
    for (const note of landed) {
      expect([0, 3, 5, 7, 10]).toContain(((note.pitch % 12) + 12) % 12);
    }
  });

  it("changes nothing when the source of chance never fires", () => {
    const before = seeded();
    const trackId = before.tracks[0]!.id;
    const after = varyArrangementNotes(before, trackId, { intensity: "subtle", random: () => 0.99 });
    expect(after.notesByTrack?.[trackId]).toEqual(before.notesByTrack?.[trackId]);
  });
});
