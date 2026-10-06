import { describe, expect, it, vi } from "vitest";
import { clearMcpArrangements, createMcpArrangement } from "../../mcp/arrangement";
import { TOOLS } from "../../mcp/registry";

/**
 * ⭐ **A long tool narrates only when it was asked to.**
 *
 * The server shell turns `_meta.progressToken` into a reporter and hands it to the handler as `ctx.progress`; it hands nothing
 * when there was no token, so "asked" and "not asked" are two different code paths rather than one that checks. These cases pin
 * the tool's own half: it reports through the reporter it was given, and it works exactly as before without one.
 */
const normalize = () => TOOLS.find((candidate) => candidate.name === "normalize_loudness")!;
const analyse = () => TOOLS.find((candidate) => candidate.name === "analyze_audio")!;

describe("narrating a loudness pass", () => {
  it("⭐ reports when it was given a reporter, and stays silent when it was not", async () => {
    clearMcpArrangements();
    const { arrangementId } = createMcpArrangement({ genreId: "chicago-house", songId: "progress-probe" });
    // ⚠️ One pass, and the shortest render the tool will make: this case calls the handler twice (with and without a reporter)
    // and each call renders for real, so a two-pass call doubled the work and timed out under a full parallel suite.
    const args = { arrangementId, targetLufs: -14, passes: 1, sampleRate: 8000, channels: 1, headless: false };

    const report = vi.fn();
    const reportOf = vi.fn();
    const withReporter = (await normalize().handler(args, { progress: { report, reportOf } } as never)) as Record<string, unknown>;
    expect(report.mock.calls.length, "the tool did not narrate a single phase").toBeGreaterThan(0);
    // ⭐ And the reply is still a reply: progress narrates the work, it does not replace the answer.
    expect(Object.keys(withReporter).length).toBeGreaterThan(0);

    report.mockClear();
    reportOf.mockClear();
    const withoutReporter = (await normalize().handler(args, {} as never)) as Record<string, unknown>;
    expect(report.mock.calls.length, "a token-less call must not narrate").toBe(0);
    expect(reportOf.mock.calls.length).toBe(0);
    expect(Object.keys(withoutReporter).length).toBeGreaterThan(0);
  }, 300_000);
});

describe("narrating an analysis", () => {
  it("⭐ announces its phase when a reporter was given, and answers the same without one", async () => {
    // ⭐ A path this server did not produce is refused, and the refusal is the answer — progress does not change that.
    const args = { path: "/nonexistent/groove-progress-probe.wav" };
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

