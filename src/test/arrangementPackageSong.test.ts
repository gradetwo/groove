import { describe, expect, it } from "vitest";
import {
  buildArrangementPackage,
  songFromPackage,
  validateArrangementPackage,
} from "../features/sequencer/arrangementPackage";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * ⭐ **The package can carry a song, and says so honestly** (third evaluation F09 and §6; the owner's decision of
 * 2026-10-09, "B").
 *
 * The evaluation asked for a unified project schema that preserves `section` across Web and MCP, and §6 asked for
 * structured planning with sections. The v2 package previously carried none at all — a decision that could not express a
 * song the arrangement view plays. These criteria hold the three properties that keep the revision from becoming the v1
 * shape again: the key is `song` (never the refused `sections`), it is **absent** unless there is a real song, and a song
 * is only written when it is **complete**, because sections without a chain are not a song (measured: the engine plays the
 * loop in that case).
 */
const arrangement = (): ArrangementV2 =>
  ({
    id: "a1",
    name: "Probe",
    bpm: 120,
    bars: 8,
    tracks: [],
    notesByTrack: {},
  }) as unknown as ArrangementV2;

const song = () => ({
  chain: ["A", "B", "A"] as never[],
  sections: [
    { id: "s1", slot: "A", bars: 2 },
    { id: "s2", slot: "B", bars: 2, mute: ["track-1"] },
  ] as never[],
});

describe("the .groove package's song structure", () => {
  it("⭐ omits the field entirely when there is no song, so old files need no migration", () => {
    const pkg = buildArrangementPackage(arrangement());
    expect("song" in pkg).toBe(false);
    expect(JSON.stringify(pkg)).not.toContain('"song"');
    expect(songFromPackage(pkg)).toBeNull();
  });

  it("⭐ carries sections and the chain, and reads them back unchanged", () => {
    const built = buildArrangementPackage(arrangement(), "2.35.6", "2026-10-09T00:00:00.000Z", song() as never);
    expect(built.song?.sections).toHaveLength(2);
    expect(built.song?.chain).toEqual(["A", "B", "A"]);
    const read = songFromPackage(JSON.parse(JSON.stringify(built)));
    expect(read?.sections.map((section) => section.id)).toEqual(["s1", "s2"]);
    expect(read?.sections[1]?.mute).toEqual(["track-1"]);
    expect(read?.chain).toEqual(["A", "B", "A"]);
  });

  it("⭐ writes no song when either half is missing, because half a song is not a song", () => {
    expect("song" in buildArrangementPackage(arrangement(), undefined, undefined, { chain: [], sections: song().sections } as never)).toBe(false);
    expect("song" in buildArrangementPackage(arrangement(), undefined, undefined, { chain: ["A"], sections: [] } as never)).toBe(false);
  });

  it("⭐ refuses a song whose values cannot be played, and names the field", () => {
    const withSong = (songValue: unknown) => () => validateArrangementPackage({ ...buildArrangementPackage(arrangement()), song: songValue });
    expect(withSong({ chain: ["A"], sections: [{ id: "s1", slot: "Z", bars: 2 }] })).toThrow(/slot/);
    expect(withSong({ chain: ["A"], sections: [{ id: "s1", slot: "A", bars: 0 }] })).toThrow(/bars/);
    expect(withSong({ chain: [], sections: [{ id: "s1", slot: "A", bars: 2 }] })).toThrow(/chain/);
    expect(withSong({ chain: ["A"], sections: [] })).toThrow(/sections/);
    expect(withSong({ chain: ["A"], sections: [{ slot: "A", bars: 2 }] })).toThrow(/id/);
  });

  it("⭐ still refuses the v1 shape: the song lives under `song`, never under the refused keys", () => {
    const pkg = buildArrangementPackage(arrangement()) as unknown as Record<string, unknown>;
    expect(() => validateArrangementPackage({ ...pkg, sections: [] })).toThrow(/v1 shape/);
    expect(() => validateArrangementPackage({ ...pkg, arrangement: { ...arrangement(), sections: [] } })).toThrow(/v1 shape/);
  });
});
