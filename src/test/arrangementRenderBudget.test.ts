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
});
