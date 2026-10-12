import { describe, expect, it } from "vitest";
import { decodeSharedSequencer, encodeSharedSequencer } from "../audio/SequencerUrlShare";


describe("the share link and the clip slots beyond A and B", () => {
  /**
   * `ClipSlot` has been `"A" | "B" | "C" | "D"` since the song layer was written, and the codec validates a section's slot with
   * `CLIP_SLOTS.includes` — so a link that names C or D is already carried, and a link written today (which names only A and B)
   * decodes exactly as it always did. This pins both halves, because "the codec already accepted it" is the kind of claim that is
   * worth one test rather than one memory.
   */
  const state = (chain: Array<"A" | "B" | "C" | "D">) =>
    ({
      genreId: "chicago-house",
      bpm: 124,
      swing: 0,
      resolution: "1/16",
      totalSteps: 16,
      // The lane has to agree with `totalSteps`, or the encoder refuses the payload and the link is empty.
      tracks: [
        {
          track_id: "kick",
          name: "Kick",
          steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
          velocity: new Array(16).fill(100),
        },
      ],
      sections: chain.map((slot, index) => ({ id: `s${index}`, slot, bars: 1 })),
    }) as never;

  it("carries a section on slot C", () => {
    const decoded = decodeSharedSequencer(encodeSharedSequencer(state(["A", "C"])));
    expect(decoded?.sections?.map((section) => section.slot)).toEqual(["A", "C"]);
  });

  it("still decodes a link that names only A and B", () => {
    const decoded = decodeSharedSequencer(encodeSharedSequencer(state(["A", "B", "A"])));
    expect(decoded?.sections?.map((section) => section.slot)).toEqual(["A", "B", "A"]);
  });
});
