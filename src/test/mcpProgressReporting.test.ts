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

describe("narrating a loudness pass", () => {
  it("⭐ reports when it was given a reporter, and stays silent when it was not", async () => {
    clearMcpArrangements();
    const { arrangementId } = createMcpArrangement({ genreId: "chicago-house", songId: "progress-probe" });
    const args = { arrangementId, targetLufs: -14, passes: 2, sampleRate: 8000, channels: 1, headless: false };

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
  }, 120_000);
});
