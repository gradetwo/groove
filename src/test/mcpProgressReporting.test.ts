import { describe, expect, it, vi } from "vitest";
import { clearMcpArrangements, createMcpArrangement } from "../../mcp/arrangement";
import { TOOLS } from "../../mcp/registry";

/**
 * ⭐ **A long tool narrates only when it was asked to, and the renderer is a stub.**
 *
 * The server shell turns `_meta.progressToken` into a reporter and hands it to the handler as `ctx.progress`; it hands nothing
 * when there was no token, so "asked" and "not asked" are two different code paths rather than one that checks. These cases pin
 * the tool's own half: it reports through the reporter it was given, and it works exactly as before without one.
 *
 * ⚠️ **The renderer is mocked, and it was measured, not assumed.** A real render costs about ninety seconds whatever the music —
 * measured 0.17x realtime with a whole genre and the same with a single note — so a case that rendered for real was the most
 * expensive in the suite and timed out under parallel load. `vi.mock` is hoisted above the registry import, which is why the
 * registry resolves the stub; the stub reports through the reporter it is handed, exactly as `renderAudio` does.
 */
const renderStub = vi.hoisted(() => ({ seen: 0 }));

vi.mock(new URL("../../mcp/render/worker.ts", import.meta.url).pathname, () => ({
  analyseWavFile: () => ({ pinCount: 0, discontinuities: 0 }),
  renderAudio: (
    _pattern: unknown,
    options: { progress?: { report: (progress: number, message: string) => void } }
  ) => {
    renderStub.seen += 1;
    options.progress?.report(0, "the stub renderer");
    return { integratedLufs: -14, truePeakDb: -1, path: "/tmp/groove-progress-stub.wav" };
  },
}));

const normalize = () => TOOLS.find((candidate) => candidate.name === "normalize_loudness")!;
const analyse = () => TOOLS.find((candidate) => candidate.name === "analyze_audio")!;

describe("narrating a loudness pass", () => {
  it("⭐ reports when it was given a reporter, and stays silent when it was not", async () => {
    clearMcpArrangements();
    const { arrangementId } = createMcpArrangement({ blankKind: "synth", songId: "progress-probe" });
    const args = { arrangementId, targetLufs: -14, passes: 2, sampleRate: 8000, channels: 1, headless: false };

    const report = vi.fn();
    const reportOf = vi.fn();
    const withReporter = (await normalize().handler(args, { progress: { report, reportOf } } as never)) as Record<string, unknown>;
    expect(report.mock.calls.length, "the tool did not narrate a single phase").toBeGreaterThan(0);
    expect(Object.keys(withReporter).length, "progress must not replace the answer").toBeGreaterThan(0);

    report.mockClear();
    reportOf.mockClear();
    const withoutReporter = (await normalize().handler(args, {} as never)) as Record<string, unknown>;
    expect(report.mock.calls.length, "a token-less call must not narrate").toBe(0);
    expect(reportOf.mock.calls.length).toBe(0);
    expect(Object.keys(withoutReporter).length).toBeGreaterThan(0);
  });
});

describe("narrating an analysis", () => {
  it("⭐ announces its phase when a reporter was given, and answers the same without one", async () => {
    const args = { path: "/tmp/groove-progress-stub.wav" };
    const report = vi.fn();
    const reportOf = vi.fn();
    const withReporter = (await analyse().handler(args, { progress: { report, reportOf } } as never)) as Record<string, unknown>;
    expect(report.mock.calls.length, "the analysis did not announce its phase").toBeGreaterThan(0);
    expect(Object.keys(withReporter).length).toBeGreaterThan(0);

    report.mockClear();
    const withoutReporter = (await analyse().handler(args, {} as never)) as Record<string, unknown>;
    expect(report.mock.calls.length, "a token-less call must not narrate").toBe(0);
    expect(Object.keys(withoutReporter).length).toBeGreaterThan(0);
  });
});
