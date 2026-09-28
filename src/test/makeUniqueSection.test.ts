import { CLIP_SLOTS } from "../types/song";
import { afterEach, describe, expect, it } from "vitest";
import {
  addMcpSection,
  clearMcpSongs,
  createMcpSong,
  getMcpSong,
  makeUniqueMcpSection,
  setMcpClip,
  undoMcpSong,
} from "../../mcp/song";

/**
 * Make-unique, held to the property a composer needs: **editing one section's clip must not change another's.**
 *
 * The gap this closes was reported from composing rather than found by reading: a clip slot is song-global, so three verses with different lyrics
 * had to share one melody, and the workaround was transposition. The test therefore asserts the thing that was impossible, not the mechanism.
 */
/** A one-bar clip with a note on every fourth step, so a change to it is visible in what a section flattens to. */
const clip = (steps: number) => ({
  genre_id: "custom",
  bpm: 120,
  totalSteps: steps,
  tracks: [
    {
      track_id: "kick",
      name: "Kick",
      steps: Array.from({ length: steps }, (_, index) => (index % 4 === 0 ? 1 : 0)),
      velocity: Array.from({ length: steps }, (_, index) => (index % 4 === 0 ? 100 : 0)),
      pitch: new Array(steps).fill(36),
      gate: new Array(steps).fill(1),
    },
  ],
});

const songWithTwoVerses = () => createMcpSong({ genreId: "custom", pattern: clip(16) } as never).songId;

afterEach(() => clearMcpSongs());

describe("make_unique", () => {
  it("copies the section's clip into a free slot and repoints only that section", () => {
    const songId = songWithTwoVerses();
    // `create_song` seeds one section, so one more makes the two-verse pair this is about.
    addMcpSection({ songId, slot: "A", bars: 1, label: "verse 2" } as never);
    const before = getMcpSong(songId) as never as { sections: Array<{ id: string; slot: string }> };
    expect(before.sections).toHaveLength(2);

    const result = makeUniqueMcpSection({ songId, index: 1 });
    expect(result.allocatedSlot).not.toBe("A");
    expect(result.sectionId).toBe(before.sections[1]!.id);

    const after = getMcpSong(songId) as never as { sections: Array<{ id: string; slot: string }>; clips: Record<string, unknown> };
    // The second section moved; the first did not. That asymmetry is the whole feature.
    expect(after.sections[0]!.slot).toBe("A");
    expect(after.sections[1]!.slot).toBe(result.allocatedSlot);
    expect(Object.keys(after.clips)).toContain(result.allocatedSlot);
  });

  it("lets the two sections then differ, which is what the composer could not do", () => {
    const songId = songWithTwoVerses();
    addMcpSection({ songId, slot: "A", bars: 1 } as never);
    const made = makeUniqueMcpSection({ songId, index: 1 });

    // Give the new slot a pattern the original does not have. That the flatten then resolves **per section's slot** is the property
    // `src/test/sectionLaneSlots.test.ts` already holds; what this test has to show is that the two sections can now point at different
    // clips at all, which is the thing that was impossible before.
    const silent = clip(16);
    const withoutNotes = { ...silent, tracks: silent.tracks.map((track) => ({ ...track, steps: track.steps.map(() => 0) })) };
    setMcpClip(songId, made.allocatedSlot, withoutNotes as never);

    const song = getMcpSong(songId) as never as { sections: Array<{ slot: string }>; clips: Record<string, unknown> };
    expect(song.sections[0]!.slot).toBe("A");
    expect(song.sections[1]!.slot).toBe(made.allocatedSlot);
    expect(song.clips.A).not.toBe(song.clips[made.allocatedSlot]);
    expect(JSON.stringify(song.clips.A)).not.toBe(JSON.stringify(song.clips[made.allocatedSlot]));
  });

  it("refuses when every slot is taken, instead of overwriting one", () => {
    const songId = songWithTwoVerses();
    for (const slot of CLIP_SLOTS) {
      if ((getMcpSong(songId) as never as { clips: Record<string, unknown> }).clips[slot]) continue;
      const seed = (getMcpSong(songId) as never as { clips: Record<string, unknown> }).clips.A;
      setMcpClip(songId, slot, seed as never);
    }
    expect(() => makeUniqueMcpSection({ songId, index: 0 })).toThrow(/clip slots are in use/);
  });

  it("is undoable like every other song change", () => {
    const songId = songWithTwoVerses();
    addMcpSection({ songId, slot: "A", bars: 1 } as never);
    const made = makeUniqueMcpSection({ songId, index: 1 });
    undoMcpSong(songId, 1);
    const after = getMcpSong(songId) as never as { sections: Array<{ slot: string }> };
    expect(after.sections[1]!.slot).toBe("A");
    expect(made.allocatedSlot).not.toBe("A");
  });
});
