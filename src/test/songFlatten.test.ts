import { describe, expect, it } from "vitest";
import { flattenSong } from "../data/songFlatten";


describe("the flatten reports where its sections begin (stage 3's data half)", () => {
  /**
   * The section boundaries are what the flatten **discards** — and what an audio fade at a hard mute or velocity jump needs, in
   * the layer where the samples are. So the flatten returns them: data stays data, and the render path fades
   * (`docs/DAW_MCP_REFACTOR.md`).
   */
  const song = (sections: Array<{ slot: string; bars: number }>) =>
    ({
      id: "s",
      name: "s",
      genreId: "chicago-house",
      bpm: 120,
      swing: 0,
      resolution: "1/16",
      clips: { A: { bpm: 120, totalSteps: 16, tracks: [] }, B: { bpm: 120, totalSteps: 16, tracks: [] } },
      sections: sections.map((section, index) => ({ id: `s${index}`, ...section })),
      loopRange: null,
    }) as never;

  it("puts a boundary at the first step of every section", () => {
    const flattened = flattenSong(song([{ slot: "A", bars: 2 }, { slot: "B", bars: 2 }]));
    expect(flattened.boundaries).toEqual([0, 32]);
    // The boundary is inside the flattened pattern, not past its end.
    expect(flattened.boundaries.every((step) => step < flattened.totalSteps)).toBe(true);
  });

  it("starts with zero, and has one entry per section", () => {
    const flattened = flattenSong(song([{ slot: "A", bars: 1 }, { slot: "A", bars: 3 }, { slot: "B", bars: 1 }]));
    expect(flattened.boundaries[0]).toBe(0);
    expect(flattened.boundaries).toHaveLength(3);
    expect(flattened.boundaries[1]).toBe(16);
    expect(flattened.boundaries[2]).toBe(64);
  });

  it("reports none for a song with no sections", () => {
    expect(flattenSong(song([])).boundaries).toEqual([]);
  });
});
