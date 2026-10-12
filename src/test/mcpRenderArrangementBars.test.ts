/**
 * `render_arrangement`'s `bars` means passes through the arrangement, and the reply says so.
 *
 * The field report caught this as "the same parameter name, two meanings": `render_arrangement`'s `bars` is obeyed, and
 * `render_arrangement`'s was **ignored** — the handler passed a hardcoded `bars: 1`, so a caller asking for four passes
 * got one, with the number it asked for nowhere in the reply (`docs/MUSE_REPORT_2026-10-01.md`, the section on the two
 * tools' `bars`). The schema and the description promised otherwise, which is the class of defect this repository treats
 * as its worst: a promise the code does not keep.
 *
 * `renderAudio` is mocked because the property is **what the handler asks the renderer for**, not audio: a real render
 * would cost a browser and would not make the pass-through any more true. The deletion test is to put `bars: 1` back in
 * the handler — the first case then sees `1` where the caller asked for `3`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** A `RenderResult` shape the handler can spread; the audio itself is not what this file judges. */
const renderResult = {
  path: "/tmp/probe.wav",
  filename: "probe.wav",
  bytes: 1,
  durationSec: 1,
  sampleRate: 44100,
  channels: 2 as const,
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
import { clearMcpArrangements, createMcpArrangement } from "../../mcp/arrangement";
import { renderAudio } from "../../mcp/render/worker";

const tool = TOOLS.find((candidate) => candidate.name === "render_arrangement")!;
const renderMock = vi.mocked(renderAudio);

beforeEach(() => {
  vi.clearAllMocks();
  clearMcpArrangements();
});

describe("render_arrangement's bars", () => {
  it("asks the renderer for the number of passes the caller requested", async () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "sampler", songId: "probe" });
    const reply = (await tool.handler({ arrangementId, bars: 3 })) as Record<string, unknown>;
    expect(renderMock.mock.calls).toHaveLength(1);
    expect(renderMock.mock.calls[0]![1].bars).toBe(3);
    // Both numbers are in the reply, so "8 bars" and "3 passes" cannot be read as the same thing.
    expect(reply.passes).toBe(3);
    expect(reply.bars).toBe(8);
  });

  it("renders one pass when the caller does not say", async () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "sampler", songId: "probe" });
    const reply = (await tool.handler({ arrangementId })) as Record<string, unknown>;
    expect(renderMock.mock.calls[0]![1].bars).toBe(1);
    expect(reply.passes).toBe(1);
  });

  it("keeps the flatten's arrangement length as `bars`, whatever the pass count", async () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "sampler", songId: "probe" });
    const reply = (await tool.handler({ arrangementId, bars: 2 })) as Record<string, unknown>;
    // The default arrangement is eight bars; a pass count must not rewrite it.
    expect(reply.bars).toBe(8);
    expect(reply.totalSteps).toBe(128);
  });
});
