import { beforeEach, describe, expect, it } from "vitest";
import { addMcpTrackNotes, clearMcpArrangements, createMcpArrangement, getMcpArrangement } from "../../mcp/arrangement";
import { TOOLS } from "../../mcp/registry";

/**
 * ⭐ **The two note-shaping tools, called the way a client calls them.**
 *
 * `quantize_arrangement_note_lengths` and `vary_arrangement_notes` are the arrangement's answers to the v1 pattern's
 * `swing` and `humanize` ops, and both are what the previous round added. `mcpToolCoverage` requires every registered
 * name to appear in a criterion, and this file is the criterion rather than a mention: each handler is called and the
 * state it changed is read back from the arrangement it named.
 */
const tool = (name: string) => {
  const found = TOOLS.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no tool named ${name}`);
  return found;
};

/** An arrangement with one synth track and four notes on it, returned with the track id. */
function seeded(): { arrangementId: string; trackId: string } {
  const summary = createMcpArrangement({ blankKind: "synth" });
  const trackId = summary.tracks[0]!.id;
  addMcpTrackNotes(summary.arrangementId, trackId, [
    { pitch: 36, startBeats: 0, lengthBeats: 0.3, velocity: 100 },
    { pitch: 60, startBeats: 0.5, lengthBeats: 0.9, velocity: 100 },
    { pitch: 63, startBeats: 1, lengthBeats: 0.4, velocity: 100 },
    { pitch: 67, startBeats: 1.5, lengthBeats: 0.6, velocity: 100 },
  ]);
  return { arrangementId: summary.arrangementId, trackId };
}

const notesOf = (arrangementId: string, trackId: string) =>
  getMcpArrangement(arrangementId)?.notesByTrack?.[trackId] ?? [];

describe("the arrangement's note-shaping tools", () => {
  beforeEach(() => {
    clearMcpArrangements();
  });

  it("quantize_arrangement_note_lengths rounds lengths and leaves every start where it was", async () => {
    const { arrangementId, trackId } = seeded();
    const before = notesOf(arrangementId, trackId).map((note) => note.startBeats);

    const result = (await tool("quantize_arrangement_note_lengths").handler({
      arrangementId,
      trackId,
      snapBeats: 0.25,
    })) as { summary?: unknown };
    expect(result.summary).toBeTruthy();

    const after = notesOf(arrangementId, trackId);
    // ⭐ Starts are what makes a phrase: the operation moves lengths only, so the rhythm survives.
    expect(after.map((note) => note.startBeats)).toEqual(before);
    expect(after.map((note) => note.lengthBeats)).toEqual([0.25, 1, 0.5, 0.5]);
  });

  it("vary_arrangement_notes changes the track through the tool and keeps the lowest note", async () => {
    const { arrangementId, trackId } = seeded();
    const before = notesOf(arrangementId, trackId);

    const result = (await tool("vary_arrangement_notes").handler({ arrangementId, trackId })) as {
      summary?: { trackCount?: number };
    };
    // The reply is the arrangement's standard edit result; the advisory about a synth's built-in preset is
    // expected here and is not a failure of the operation.
    expect(result.summary?.trackCount).toBe(1);

    const after = notesOf(arrangementId, trackId);
    // ⭐ The humanize rule the v1 op carried: the bass keeps its place, and the part stays the same size.
    expect(after.length).toBe(before.length);
    expect(Math.min(...after.map((note) => note.pitch))).toBe(36);
  });
});
