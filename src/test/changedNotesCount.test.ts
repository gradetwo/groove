import { describe, expect, it, beforeEach } from "vitest";
import {
  addMcpTrackNotes,
  clearMcpArrangements,
  createMcpArrangement,
  setMcpNoteLength,
  transposeMcpNotes,
  quantizeMcpNoteLengths,
  getMcpArrangement,
} from "../../mcp/arrangement";

/**
 * ⭐ **"How many notes did that actually change?"** (third evaluation, section 6: transactional batch edits that return
 * the number actually modified.)
 *
 * The batch tools reported what was **asked for** and what the track holds afterwards, so the delta was the caller's
 * arithmetic — and an edit that changed nothing was indistinguishable from one that changed everything. The count is
 * computed in the one place every edit passes through, by comparing notes rather than lengths: quantise and transpose
 * rewrite values without changing how many notes there are, so a length-only check would report zero for exactly the
 * edits this exists for.
 */
describe("an edit says what it changed", () => {
  beforeEach(() => clearMcpArrangements());

  const seeded = () => {
    const created = createMcpArrangement({ blankKind: "synth" });
    const trackId = created.tracks![0]!.id;
    return { arrangementId: created.arrangementId, trackId };
  };

  it("⭐ counts added and removed notes, and reports zero when nothing moved", () => {
    const { arrangementId, trackId } = seeded();
    const added = addMcpTrackNotes(arrangementId, trackId, [
      { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 },
      { pitch: 62, startBeats: 2, lengthBeats: 1, velocity: 100 },
    ] as never);
    expect(added.changedNotes, "two notes arrived").toBe(2);

    /**
     * ⭐ An edit that changes nothing answers **zero**, which is the case a caller cannot infer from the counts: the add
     * above already reported the notes it wrote, but "I asked for a change and none happened" needs its own number.
     */
    const unchanged = transposeMcpNotes(arrangementId, trackId, 0, 8, 0);
    expect(unchanged.changedNotes, "a no-op transposition changed nothing").toBe(0);

    const transposed = transposeMcpNotes(arrangementId, trackId, 0, 8, 2);
    expect(transposed.changedNotes, "a real transposition moved both").toBe(2);
    expect(getMcpArrangement(arrangementId)!.notesByTrack![trackId]!.map((note) => note.pitch)).toEqual([62, 64]);
  });

  it("⭐ counts a value rewrite that leaves the note count alone", () => {
    const { arrangementId, trackId } = seeded();
    addMcpTrackNotes(arrangementId, trackId, [{ pitch: 60, startBeats: 0, lengthBeats: 0.9, velocity: 100 }] as never);
    // The length is off the grid, so quantising moves it — and the count alone would not have noticed.
    const quantized = quantizeMcpNoteLengths(arrangementId, trackId, 0.25);
    expect(quantized.changedNotes, "a length move is a change").toBe(1);
    const again = quantizeMcpNoteLengths(arrangementId, trackId, 0.25);
    expect(again.changedNotes, "and quantising an already-quantised track is a no-op").toBe(0);

    const velocity = setMcpNoteLength(arrangementId, trackId, { pitch: 60, startBeats: 0 }, 1.5);
    expect(velocity.changedNotes, "a longer note is one change").toBe(1);
  });
});
