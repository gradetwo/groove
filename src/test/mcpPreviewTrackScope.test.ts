/**
 * ⭐ **`render_arrangement_preview`'s track scope, measured rather than assumed.**
 *
 * `renderAudio` is mocked for the reason `mcpRenderArrangementBars.test.ts` gives: the property is what the handler asks
 * the renderer for, and a real render would cost a browser without making the scope any truer. The default shape and the
 * cheap defaults are already held by `mcpArrangementPreview.test.ts`, so this file judges only what that one does not:
 * the reply says which tracks it was narrowed to, and a track that does not exist contributes nothing.
 *
 * ⚠️ **A truth the first version of this file got wrong** ✗: with one track carrying the notes, "every lane" and "that
 * lane" ask the renderer for the *same content*, so their render arguments are equal. The pairwise-distinct assertion is
 * therefore between the **unknown** track and the other two, which is the case a dropped scope would collapse.
 *
 * ⚠️ **Boundary, stated rather than implied** ✗: this proves the request carries the scope. It does **not** prove the
 * rendered audio contains only that track — that needs a real render and stays in `needs`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const renderResult = {
  path: "/tmp/probe.wav",
  filename: "probe.wav",
  bytes: 1,
  durationSec: 1,
  sampleRate: 8000,
  channels: 1 as const,
  limiterKind: "worklet",
  truePeakDb: -1.3,
  integratedLufs: -14,
  gs1PatchProblems: [],
  trackPeaksDb: {},
  audioLanes: { lanes: [], events: 0, problems: [] },
  problems: [],
};

vi.mock("../../mcp/render/worker", () => ({
  renderAudio: vi.fn(async () => renderResult),
  renderStems: vi.fn(async () => []),
  analyseWavFile: vi.fn(async () => ({})),
  auditionInstrumentNote: vi.fn(async () => ({})),
}));

import { TOOLS } from "../../mcp/registry";
import { addMcpNote, clearMcpArrangements, createMcpArrangement, getMcpArrangement } from "../../mcp/arrangement";
import { renderAudio } from "../../mcp/render/worker";

const tool = TOOLS.find((candidate) => candidate.name === "render_arrangement_preview")!;
const renderMock = vi.mocked(renderAudio);
const PITCH = 108;
const UNKNOWN = "track-that-does-not-exist";

beforeEach(() => {
  vi.clearAllMocks();
  clearMcpArrangements();
});

describe("render_arrangement_preview's track scope", () => {
  it("⭐ says which tracks it was narrowed to, and gives nothing for a track that does not exist", async () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "sampler", songId: "probe" });
    const trackId = getMcpArrangement(arrangementId)!.tracks[0].id;
    addMcpNote(arrangementId, { trackId, pitch: PITCH, startBeats: 0 });

    const every = (await tool.handler({ arrangementId, endBar: 3 })) as Record<string, unknown>;
    const named = (await tool.handler({ arrangementId, endBar: 3, trackId })) as Record<string, unknown>;
    const unknown = (await tool.handler({ arrangementId, endBar: 3, trackId: UNKNOWN })) as Record<string, unknown>;

    /** The reply is self-describing: a narrowed call says what it was narrowed to, a whole one says nothing. */
    expect({ every: every.tracks ?? null }).toEqual({ every: null });
    expect({ named: named.tracks }).toEqual({ named: [trackId] });
    expect({ unknown: unknown.tracks }).toEqual({ unknown: [UNKNOWN] });

    /** An unknown track is a scope that matches no lane, so the note cannot reach the renderer. */
    const asked = renderMock.mock.calls.map((call) => JSON.stringify(call[0]));
    expect({ calls: asked.length, hasNote: asked.map((a) => a.includes(String(PITCH))) }).toEqual({
      calls: 3,
      hasNote: [true, true, false],
    });
  });
});
