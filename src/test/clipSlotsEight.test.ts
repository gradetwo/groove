import { afterEach, describe, expect, it } from "vitest";
import { CLIP_SLOTS } from "../types/song";
import type { ClipSlot } from "../types/song";
import { addMcpSection, clearMcpSongs, createMcpSong, getMcpSong, makeUniqueMcpSection, setMcpClip } from "../../mcp/song";

/**
 * Eight clip slots (owner decision 2026-09-28).
 *
 * The widening itself was invisible to the compiler and to the whole existing suite — 3202 tests passed with the array changed — because every consumer reads
 * `CLIP_SLOTS` and no test was sensitive to how many slots there are. That is exactly the "correct by generalisation" state that needs pinning, and the two places
 * that had the number **four** written into them are the ones worth asserting: the tool boundary (which would have refused `E`-`H`) and `make_unique`'s
 * free-slot picker (which could never have chosen them).
 */
const clip = (steps = 16) => ({
  genre_id: "custom",
  bpm: 120,
  totalSteps: steps,
  tracks: [{ track_id: "lead", name: "Lead", instrument: "synth", steps: new Array(steps).fill(0) }],
});

const song = () => createMcpSong({ genreId: "custom", pattern: clip() } as never).songId;

afterEach(() => clearMcpSongs());

describe("eight clip slots", () => {
  it("is the array's own list, in order, with the four original slots first", () => {
    expect([...CLIP_SLOTS]).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    // The additive promise in one line: everything that existed before is still where it was.
    expect(CLIP_SLOTS.slice(0, 4)).toEqual(["A", "B", "C", "D"]);
  });

  it("accepts a new slot at the tool boundary, which used to refuse anything past D", () => {
    const songId = song();
    // A clip beyond D is stored...
    setMcpClip(songId, "H", clip() as never);
    expect((getMcpSong(songId) as never as { clips: Record<string, unknown> }).clips.H).toBeTruthy();
    // ...and a section can play it, which is where a model and a tool used to disagree.
    const added = addMcpSection({ songId, slot: "H", bars: 2 } as never);
    expect(added.problems ?? []).toEqual([]);
    expect((added.sections ?? []).some((section: { slot?: string }) => section.slot === "H")).toBe(true);
  });

  it("lets make_unique use the slots past the fourth instead of declaring the song full", () => {
    const songId = song();
    const seed = (getMcpSong(songId) as never as { clips: Record<string, ClipSlot> }).clips.A;
    for (const slot of ["B", "C", "D"] as ClipSlot[]) setMcpClip(songId, slot, seed as never);

    // With A-D taken, the old picker ran out; the new one reaches E.
    const unique = makeUniqueMcpSection({ songId, index: 0 } as never);
    const clips = (getMcpSong(songId) as never as { clips: Record<string, unknown> }).clips;
    expect(clips.E, "make_unique did not reach the fifth slot").toBeTruthy();
    expect(JSON.stringify(unique).length).toBeGreaterThan(0);
  });
});
