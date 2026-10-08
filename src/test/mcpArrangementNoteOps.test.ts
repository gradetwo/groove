import { beforeEach, describe, expect, it } from "vitest";
import { addMcpTrackNotes, clearMcpArrangements, createMcpArrangement, getMcpArrangement, setMcpTrackNotes } from "../../mcp/arrangement";
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
    })) as { status?: string; summary?: unknown; tracks?: Array<{ notes?: number }> };
    /**
     * ⭐ **The default reply is a delta now, not the arrangement** (finding D1). The edit's *effect* is still asserted
     * from the model below, which is where it belongs; what this checks is that the reply says what changed and carries
     * no full note dump — deleting the delta (or making it default to the old snapshot) turns it red.
     */
    expect(result.status).toBe("ok");
    expect(result.summary).toBeUndefined();
    expect(result.tracks?.[0]?.notes).toBe(4);

    const after = notesOf(arrangementId, trackId);
    // ⭐ Starts are what makes a phrase: the operation moves lengths only, so the rhythm survives.
    expect(after.map((note) => note.startBeats)).toEqual(before);
    expect(after.map((note) => note.lengthBeats)).toEqual([0.25, 1, 0.5, 0.5]);
  });

  it("vary_arrangement_notes changes the track through the tool and keeps the lowest note", async () => {
    const { arrangementId, trackId } = seeded();
    const before = notesOf(arrangementId, trackId);

    const result = (await tool("vary_arrangement_notes").handler({ arrangementId, trackId })) as {
      summary?: unknown;
      tracks?: Array<{ notes?: number }>;
    };
    /**
     * ⭐ The delta reply: one entry per track with a **count**, and the advisory about a synth's built-in preset is
     * expected here and is not a failure of the operation.
     */
    expect(result.summary).toBeUndefined();
    expect(result.tracks?.length).toBe(1);

    const after = notesOf(arrangementId, trackId);
    // ⭐ The humanize rule the v1 op carried: the bass keeps its place, and the part stays the same size.
    expect(after.length).toBe(before.length);
    expect(Math.min(...after.map((note) => note.pitch))).toBe(36);
  });

  it("⭐ keeps the full arrangement behind `verbose`, and bounds the delta (finding D1)", () => {
    const { arrangementId, trackId } = seeded();
    // The measured defect: 32-note batches on a growing arrangement returned 7.2 KB and climbed ~5 KB per batch, so a
    // single edit on a 900-note piece cost ~182 KB (~45.5k tokens). The delta is a function of the *tracks*, not the notes.
    const delta = tool("add_arrangement_note").handler({
      arrangementId,
      trackId,
      pitch: 60,
      startBeats: 8,
      lengthBeats: 1,
      velocity: 100,
    }) as { status?: string; summary?: unknown; tracks?: Array<{ notes?: number }> };
    expect(delta.status).toBe("ok");
    expect(delta.summary, "the default reply carries no note arrays").toBeUndefined();
    expect(JSON.stringify(delta).length).toBeLessThan(2_000);

    // ⭐ And the old reply is one flag away, so nothing that needed it lost it.
    const verbose = tool("add_arrangement_note").handler({
      arrangementId,
      trackId,
      pitch: 62,
      startBeats: 9,
      lengthBeats: 1,
      velocity: 100,
      verbose: true,
    }) as { summary?: { tracks?: Array<{ notes?: unknown[] }> } };
    expect(verbose.summary?.tracks?.[0]?.notes?.length).toBeGreaterThan(0);
  });


  it("⭐ refuses notes written to a track that does not exist (finding F04)", () => {
    /**
     * The evaluation wrote notes to an id that was not in the arrangement and got a **success** back whose problems were
     * about the synth's preset — the notes went nowhere and the reply did not say so. Every single-note writer already
     * refused an unknown track; the bulk writer, which is how a part actually arrives, did not. Removing the guard turns
     * this red.
     */
    const { arrangementId } = seeded();
    expect(() =>
      addMcpTrackNotes(arrangementId, "no-such-track", [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }] as never)
    ).toThrow(/no-such-track/);
    // ⭐ The replacement writer is the same road: it used to return the arrangement unchanged.
    expect(() => setMcpTrackNotes(arrangementId, "no-such-track", [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }] as never)).toThrow(/no-such-track/);
  });

});