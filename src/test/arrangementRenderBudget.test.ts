import { beforeEach, describe, expect, it } from "vitest";
import { clearMcpArrangements, createMcpArrangement, setMcpArrangementBars } from "../../mcp/arrangement";
import { TOOLS } from "../../mcp/registry";

/**
 * ⭐ **The guard the older render tool had and this one did not.** A render that outlives a client is refused before it
 * starts, with the argument named, rather than started and abandoned. Only the refusal is exercised here, so the criterion
 * is fast and cannot depend on an audio host.
 */
describe("a render budget on the arrangement renderer", () => {
  beforeEach(() => clearMcpArrangements());

  it("refuses before starting when the estimate is over the limit, and names the argument", async () => {
    const tool = TOOLS.find((candidate) => candidate.name === "render_arrangement");
    expect(tool, "render_arrangement must be on the surface").toBeTruthy();
    const created = createMcpArrangement({ songId: "budget-probe" });
    setMcpArrangementBars(created.arrangementId, 64);
    const reply = (await tool!.handler({ arrangementId: created.arrangementId, maxDurationSec: 1 }, {} as never)) as {
      isError?: boolean;
      content?: Array<{ text?: string }>;
    };
    expect(reply.isError, JSON.stringify(reply).slice(0, 160)).toBe(true);
    expect(reply.content?.[0]?.text ?? "").toContain("maxDurationSec");
  });

  it("declares the argument, so the guard cannot be dropped quietly", () => {
    const tool = TOOLS.find((candidate) => candidate.name === "render_arrangement")!;
    expect(Object.keys(tool.inputSchema)).toContain("maxDurationSec");
  });

  it("⭐ measures the audio that was asked for, not the arrangement's own length (finding F02)", async () => {
    /**
     * The evaluation's F02: the guard read the arrangement, so a request for **several passes** of the music — several
     * times the audio — was checked as if it were one pass, and a short span of a long piece was checked as if it were the
     * whole piece. Neither is what the caller agreed to wait for. Here the arrangement is a single bar (2 s of audio) and
     * the request is four passes of it (8 s) against a 5 s budget: the refusal must name the **request**, which it cannot
     * do without measuring it. Reverting to the arrangement's own length turns this red.
     */
    const tool = TOOLS.find((candidate) => candidate.name === "render_arrangement")!;
    const created = createMcpArrangement({ songId: "budget-passes" });
    setMcpArrangementBars(created.arrangementId, 1);
    const reply = (await tool.handler({ arrangementId: created.arrangementId, bars: 4, maxDurationSec: 5 }, {} as never)) as {
      isError?: boolean;
      content?: Array<{ text?: string }>;
    };
    const text = reply.content?.[0]?.text ?? "";
    expect(reply.isError, JSON.stringify(reply).slice(0, 200)).toBe(true);
    expect(text, "the refusal names the passes it was asked for").toMatch(/4 passes/);
    expect(text, "and the seconds those passes come to, not the arrangement's 2").toMatch(/about 8s/);
  });

});