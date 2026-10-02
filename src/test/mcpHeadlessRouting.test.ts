/**
 * **`render_arrangement` has two engines, and neither direction is allowed to be silent.**
 *
 * The headless path (`mcp/render/headless.ts`) exists so a caller can render under `node-web-audio-api` with no browser.
 * The failure mode this file is built against is the one this line of work keeps meeting: a render that *says* headless
 * and quietly used Chromium — or a caller who asked for the default and got the Node host. Both are invisible in a
 * reply, so both are held here as routing, with `GROOVE_MCP_NO_BROWSER=1` in the environment:
 *
 * * with the flag, the browser path is **forbidden** by the environment, so a reply that reaches the browser is a
 *   fallback, not a preference — and it is the failure this test fails on;
 * * without the flag, reaching the Node host would be the same defect in the other direction.
 *
 * The Node host is mocked because what is being judged is **which module the worker reached**, not audio: a real render
 * has its own criterion (`src/test/mcpHeadlessRender.test.ts`) and costs seconds, and a routing assertion that cost a
 * render would still not make the routing any truer. The reverse test is to delete the `options.headless === true`
 * branch from `mcp/render/worker.ts`: the first case then falls into the browser refusal and turns red here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** What the worker handed the headless renderer, captured through the mock. */
const headlessCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock(new URL("../../mcp/render/headless.ts", import.meta.url).pathname, () => ({
  renderPatternHeadless: async (_pattern: unknown, options: Record<string, unknown>) => {
    headlessCalls.push(options);
    // Distinguished from every error the browser path can produce, so "which engine answered" is one substring.
    throw new Error("HEADLESS-REACHED");
  },
  headlessUnavailableMessage: (reason: unknown) => `stub unavailable: ${String(reason)}`,
  HEADLESS_PACKAGE: "node-web-audio-api",
}));

import { TOOLS } from "../../mcp/registry";
import { clearMcpArrangements, createMcpArrangement } from "../../mcp/arrangement";

const tool = TOOLS.find((candidate) => candidate.name === "render_arrangement")!;

/** The text of a failure reply; the arrangement handler turns a thrown render error into one. */
function replyText(reply: unknown): string {
  const content = (reply as { content?: Array<{ text?: string }> }).content ?? [];
  return content.map((entry) => entry.text ?? "").join("\n");
}

beforeEach(() => {
  clearMcpArrangements();
  headlessCalls.length = 0;
  process.env.GROOVE_MCP_NO_BROWSER = "1";
});

afterEach(() => {
  delete process.env.GROOVE_MCP_NO_BROWSER;
});

describe("render_arrangement's two engines", () => {
  it("declares the choice as a schema parameter, so a client can actually send it", () => {
    expect(tool.inputSchema.headless, "the parameter has to exist for the flag to be reachable").toBeDefined();
    // The divergence is stated where the model reads it, and it points at the document rather than repeating it blindly.
    const described = tool.inputSchema.headless!.description ?? "";
    expect(described).toContain("1.28 dB in band 6");
    expect(described).toContain("1.11 dB in band 3");
    expect(described).toContain("1.774 LU");
    expect(described).toContain("docs/HEADLESS_CORE_PLAN.md");
    expect(described).toContain("never falls back");
  });

  it("sends headless: true to the Node host — the browser is forbidden here, so nothing else can answer", async () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "drumkit", songId: "route-probe" });
    const reply = await tool.handler({ arrangementId, headless: true, sampleRate: 8000, channels: 1 });

    expect(headlessCalls, "the Node host must have been reached").toHaveLength(1);
    // The flag survived schema → handler → worker → headless module.
    expect(headlessCalls[0]?.headless).toBe(true);
    expect(headlessCalls[0]?.sampleRate).toBe(8000);
    const text = replyText(reply);
    expect(text, "the answer came from the headless renderer").toContain("HEADLESS-REACHED");
    // ⭐ The one assertion that names the defect: a silent fallback would have produced exactly this sentence.
    expect(text, "the browser path must not have been taken").not.toContain("GROOVE_MCP_NO_BROWSER");
  });

  it("leaves a call with no flag on the browser path, which is the engine it has always had", async () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "drumkit", songId: "route-probe" });
    const reply = await tool.handler({ arrangementId, sampleRate: 8000, channels: 1 });

    expect(headlessCalls, "the default must not touch the Node host").toHaveLength(0);
    expect(replyText(reply), "the default reached the browser path").toContain("GROOVE_MCP_NO_BROWSER");
  });
});
