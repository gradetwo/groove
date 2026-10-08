import { describe, expect, it } from "vitest";
import { grooveFileFor } from "../features/arrangement/arrangementFiles";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * ⭐ **The Web writer carries the song it is given, and only then** (third evaluation F09/§6; owner's decision "B").
 *
 * This pins the half that exists: `grooveFileFor` takes the project's song and writes it into the package. ⚠️ Nothing on
 * the arrangement route supplies one yet — the sections and the chain live in the sequencer store, which only the console
 * route mounts — so a file exported from there still carries no `song`, and that is the remaining half, not a property of
 * this function.
 */
const arrangement = () =>
  ({ id: "a1", name: "Probe", bpm: 120, bars: 8, tracks: [], notesByTrack: {} }) as unknown as ArrangementV2;

describe("the .groove writer and the song", () => {
  it("⭐ writes the song when it is given one, and names the file after the project either way", async () => {
    const withSong = await grooveFileFor(arrangement(), "Probe", {
      chain: ["A", "B"],
      sections: [{ id: "s1", slot: "A", bars: 2 }],
    });
    /** ⭐ The stem is slugified (`safeFileStem`), which is the writer's own long-standing rule. */
    expect(withSong.filename).toBe("probe.groove");
    const parsedWith = JSON.parse(await withSong.blob.text()) as { song?: { chain?: string[] } };
    expect(parsedWith.song?.chain).toEqual(["A", "B"]);

    const withoutSong = await grooveFileFor(arrangement(), "Probe");
    const parsedWithout = JSON.parse(await withoutSong.blob.text()) as Record<string, unknown>;
    expect("song" in parsedWithout, "a project with no song writes no song field").toBe(false);
  });
});
