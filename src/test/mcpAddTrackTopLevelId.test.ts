/**
 * 🧭 **`add_arrangement_track` says which track it just added.**
 *
 * The deep-test report of 2026-10-05 recorded the nesting as a papercut: the reply was `{summary, problems}` and the
 * new track's id lived only at `summary.tracks[summary.tracks.length - 1].id`, so the natural next call —
 * `add_arrangement_notes` on the track you just made — needed the caller to reach into the summary. The id is now
 * also at the top level; the nested shape stays, because callers exist that read it.
 *
 * The criterion calls the handler the way a client does, then uses the returned id for a second call, which is the
 * workflow the field exists to make short.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { TOOLS } from "../../mcp/registry";
import { addMcpTrackNotes, clearMcpArrangements, createMcpArrangement, getMcpArrangement, summariseArrangement } from "../../mcp/arrangement";

type Handler = (args: Record<string, unknown>, ctx?: unknown) => unknown;
const handlerOf = (name: string): Handler => {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  return (tool as unknown as { handler: Handler }).handler;
};

describe("add_arrangement_track names the new track at the top level", () => {
  beforeEach(() => clearMcpArrangements());

  it("⭐ returns the id, and the nested summary still works", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const reply = handlerOf("add_arrangement_track")({ arrangementId, kind: "synth" }) as {
      trackId?: string;
      summary?: { tracks: Array<{ id: string }> };
    };
    const nested = reply.summary?.tracks?.[(reply.summary?.tracks?.length ?? 0) - 1]?.id;
    expect({ topLevel: typeof reply.trackId === "string", matchesNested: reply.trackId === nested })
      .toEqual({ topLevel: true, matchesNested: true });
  });

  it("⭐ the returned id is the one the next call needs", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const reply = handlerOf("add_arrangement_track")({ arrangementId, kind: "synth" }) as { trackId: string };
    addMcpTrackNotes(arrangementId, reply.trackId, [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }]);
    const track = summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).tracks.find((t) => t.id === reply.trackId);
    expect(track, "the id from the reply is not a track in the arrangement").toBeDefined();
  });

  it("⭐ still measures, so a renamed tool cannot pass quietly", () => {
    const names = TOOLS.map((tool) => tool.name);
    expect({ has: names.includes("add_arrangement_track"), tools: names.length > 90 }).toEqual({ has: true, tools: true });
  });
});
