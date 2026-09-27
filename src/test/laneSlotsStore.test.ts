import { afterEach, describe, expect, it } from "vitest";
import { addMcpSection, clearMcpSongs, createMcpSong, getMcpSong, setMcpClip, setMcpLaneSlots } from "../../mcp/song";

/**
 * The store half of decision 3b, asserted where no fixture is shared.
 *
 * The gate's chain has five checks depending on its section counts, so the **sharing report** belongs here: a clip slot is song-global, and a caller binding
 * three movements to one slot should be told all three now play it.
 */
const clip = (steps = 16) => ({
  genre_id: "custom",
  bpm: 120,
  totalSteps: steps,
  tracks: [{ track_id: "lead", name: "Lead", instrument: "synth", steps: new Array(steps).fill(0) }],
});

const song = () => createMcpSong({ genreId: "custom", pattern: clip() } as never).songId;

afterEach(() => clearMcpSongs());

describe("setMcpLaneSlots", () => {
  it("applies a batch, remembers it for undo, and reports a slot the edited sections share", () => {
    const songId = song();
    const first = (getMcpSong(songId) as never as { sections: Array<{ id: string }> }).sections[0]!.id;
    setMcpClip(songId, "B", clip() as never);
    addMcpSection({ songId, slot: "B", bars: 1 } as never);
    addMcpSection({ songId, slot: "B", bars: 1 } as never);
    const second = (getMcpSong(songId) as never as { sections: Array<{ id: string }> }).sections[1]!.id;

    const result = setMcpLaneSlots(songId, [{ sectionId: second, trackId: "lead", slot: "B" }]);
    expect(result.problems).toEqual([]);
    expect(result.applied).toBe(1);
    // Two sections now play B, so the reply says so rather than leaving the caller to discover it.
    expect(result.sharedSlots).toEqual([{ slot: "B", sections: 2 }]);
  });

  it("writes nothing and reports every bad entry when one of them is invalid", () => {
    const songId = song();
    const first = (getMcpSong(songId) as never as { sections: Array<{ id: string }> }).sections[0]!.id;
    const before = JSON.stringify(getMcpSong(songId));

    const result = setMcpLaneSlots(songId, [
      { sectionId: first, trackId: "lead", slot: "B" },
      { sectionId: "no-such-section", trackId: "lead", slot: "A" },
      { sectionId: first, trackId: "no-such-lane", slot: "A" },
      { sectionId: first, trackId: "lead", slot: "Z" as never },
    ]);
    expect(result.applied).toBe(0);
    expect(result.problems.join(" | ")).toContain("no section");
    expect(result.problems.join(" | ")).toContain("no lane");
    expect(result.problems.join(" | ")).toContain("no clip");
    // The store is untouched, which is the transaction the report asked for.
    expect(JSON.stringify(getMcpSong(songId))).toBe(before);
  });
});
