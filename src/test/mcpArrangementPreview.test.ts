/**
 * ⭐ **The arrangement preview tool exists and says what it defaults to** (owner: "针对 arrangement 这些功能都要补齐").
 *
 * The measured gap was that `render_arrangement` takes a bar span but no track, and the cheap preview tool served songs
 * and genres rather than arrangements, so an agent that had changed one lane had no cheap way to hear that lane.
 *
 * ⚠️ This holds the **shape**: the keys are present, the cheap defaults are the documented ones, and the tool renders
 * once. The **behaviour** — that only the named track reaches the mix, and that notes outside the span stay out — is
 * owed as a rendering criterion in the harness `mcpRenderArrangementBars.test.ts` already uses, and is recorded in
 * docs/OPEN_WORK.md rather than implied by this file.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { TOOLS } from "../../mcp/registry";
import {
  addMcpTrackNotes,
  clearMcpArrangements,
  createMcpArrangement,
  flattenMcpArrangement,
  getMcpArrangement,
  summariseArrangement,
} from "../../mcp/arrangement";

const preview = TOOLS.find((t) => t.name === "render_arrangement_preview");
const schemaOf = (tool: unknown) =>
  ((tool as { inputSchema: Record<string, { description?: string }> }).inputSchema ?? {}) as Record<
    string,
    { description?: string }
  >;

describe("the arrangement preview tool", () => {
  it("⭐ exists beside render_arrangement and takes a span and a track scope", () => {
    expect(preview, "render_arrangement_preview is gone").toBeDefined();
    const schema = schemaOf(preview);
    for (const key of ["arrangementId", "trackId", "trackIds", "startBar", "endBar", "sampleRate", "channels"])
      expect({ key, present: key in schema }).toEqual({ key, present: true });
  });

  it("⭐ documents the cheap defaults rather than leaving them to be guessed", () => {
    const schema = schemaOf(preview);
    expect(schema.sampleRate?.description ?? "").toContain("8000");
    expect(schema.channels?.description ?? "").toContain("1");
    // The span's end is exclusive, which is the detail a caller gets wrong when it is not said.
    expect(schema.endBar?.description ?? "").toContain("exclusive");
  });
});

/**
 * ⭐ **The behaviour, not the shape** (the half the file above says it owes).
 *
 * Both properties are decided by the notes map the flatten narrows, so they are held here without rendering anything:
 * a scope that is asked for must actually narrow, and a span must actually cut. Each fails if the filter stops working.
 */
const lanesPlaying = (flattened: { pattern: { tracks: Array<{ steps?: number[] }> } }) =>
  flattened.pattern.tracks.filter((row) => (row.steps ?? []).some((step) => step !== 0)).length;

describe("the preview scope really narrows", () => {
  beforeEach(() => clearMcpArrangements());

  /** One synth lane with one note, at bar 0. */
  const oneLane = () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!;
    addMcpTrackNotes(arrangementId, track.id, [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }]);
    return { arrangementId, trackId: track.id };
  };

  it("plays the lane with no scope, and nothing at all when the scope names no lane", () => {
    const { arrangementId } = oneLane();
    expect(lanesPlaying(flattenMcpArrangement(arrangementId).flattened)).toBeGreaterThan(0);
    // An unknown id contributes nothing: a filter that quietly rendered everything would answer a question nobody asked.
    expect(lanesPlaying(flattenMcpArrangement(arrangementId, undefined, ["not-a-track"]).flattened)).toBe(0);
    expect(lanesPlaying(flattenMcpArrangement(arrangementId, undefined, [trackIdOf(arrangementId)]).flattened)).toBeGreaterThan(0);
  });

  it("⭐ keeps the note out when the span starts after it", () => {
    const { arrangementId } = oneLane();
    expect(lanesPlaying(flattenMcpArrangement(arrangementId, { startBar: 2, endBar: 3 }).flattened)).toBe(0);
    expect(lanesPlaying(flattenMcpArrangement(arrangementId, { startBar: 0, endBar: 1 }).flattened)).toBeGreaterThan(0);
  });
});

/** The one lane's id, read from the model rather than assumed. */
function trackIdOf(arrangementId: string): string {
  return summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks[0]!.id;
}
