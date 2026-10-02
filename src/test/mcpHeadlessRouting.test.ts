/**
 * **Every render tool that reaches `renderAudio` has two engines, and neither direction is allowed to be silent.**
 *
 * `render_arrangement` was the first tool to expose `headless` (`84638d0`); `render_song`, `render_audio` and
 * `render_preview_clip` reach the same `renderAudio` and now carry the same parameter. The failure mode this file is
 * built against is the one this line of work keeps meeting: a render that *says* headless and quietly used Chromium —
 * or a caller who asked for the default and got the Node host. Both are invisible in a reply, so both are held here as
 * routing, with `GROOVE_MCP_NO_BROWSER=1` in the environment:
 *
 * * with the flag, the browser path is **forbidden** by the environment, so a reply that reaches the browser is a
 *   fallback, not a preference — and it is the failure this test fails on;
 * * without the flag, reaching the Node host would be the same defect in the other direction.
 *
 * The Node host is mocked because what is being judged is **which module the worker reached**, not audio: a real render
 * has its own criterion (`src/test/mcpHeadlessRender.test.ts`) and costs seconds, and a routing assertion that cost a
 * render would still not make the routing any truer. The reverse test is to delete the `options.headless === true`
 * branch from `mcp/render/worker.ts`: every case below then falls into the browser refusal and turns red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** What the worker handed the headless renderer, captured through the mock. */
const headlessCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);

/**
 * The mock's two modes. `"throw"` is the routing signal — a message no browser path can produce — and `"payload"`
 * lets the same call come back as a finished render, which is what makes the reply's `engine` field judgeable
 * without a real render (and without the optional package).
 */
const mockBehavior = vi.hoisted(() => ({ mode: "throw" as "throw" | "payload" }));

/** The smallest payload `finishRenderAudio` can turn into a `RenderResult`; only the fields it reads are here. */
const MOCK_PAYLOAD = {
  base64: "UklGRg==",
  durationSec: 0.5,
  sampleRate: 8000,
  channels: 1,
  limiterKind: "worklet",
  truePeakDb: -1.5,
  integratedLufs: -14,
  gs1PatchProblems: [],
  trackPeaksDb: {},
  audioLanes: { lanes: [], events: 0, problems: [] },
  problems: [],
};

vi.mock(new URL("../../mcp/render/headless.ts", import.meta.url).pathname, () => ({
  renderPatternHeadless: async (_pattern: unknown, options: Record<string, unknown>) => {
    headlessCalls.push(options);
    if (mockBehavior.mode === "payload") return { ...MOCK_PAYLOAD };
    throw new Error("HEADLESS-REACHED");
  },
  headlessUnavailableMessage: (reason: unknown) => `stub unavailable: ${String(reason)}`,
  HEADLESS_PACKAGE: "node-web-audio-api",
}));

import { TOOLS } from "../../mcp/registry";
import { clearMcpArrangements, createMcpArrangement } from "../../mcp/arrangement";
import { clearMcpSongs, createMcpSong } from "../../mcp/song";
import { findGenre } from "../../mcp/library";

/** The four tools that call `renderAudio`, and therefore the four with two engines. */
const HEADLESS_TOOLS = ["render_arrangement", "render_audio", "render_song", "render_preview_clip"] as const;

const toolNamed = (name: string) => {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  expect(tool, `${name} is not declared`).toBeTruthy();
  return tool!;
};

/** The text of a failure reply; the handlers turn a thrown render error into one. */
function replyText(reply: unknown): string {
  const content = (reply as { content?: Array<{ text?: string }> }).content ?? [];
  return content.map((entry) => entry.text ?? "").join("\n");
}

/**
 * Call a tool and reduce **both** reply shapes to text: a `failure()` reply, and a rejection — `render_audio` returns
 * `renderAudio` directly and does not catch, so a render error arrives as a thrown error rather than a reply.
 */
async function callText(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    return replyText(await toolNamed(name).handler(args));
  } catch (error) {
    return (error as Error).message;
  }
}

/** The minimum arguments that get each tool as far as the renderer, with the flag when asked for. */
function renderArgs(name: string, headless: boolean): Record<string, unknown> {
  const flag = headless ? { headless: true } : {};
  switch (name) {
    case "render_arrangement": {
      const { arrangementId } = createMcpArrangement({ blankKind: "drumkit", songId: "route-probe" });
      return { arrangementId, sampleRate: 8000, channels: 1, ...flag };
    }
    case "render_audio":
      return { genreId: "chicago-house", ...flag };
    case "render_song": {
      const { songId } = createMcpSong({ genreId: "chicago-house", genre: findGenre("chicago-house") ?? null });
      return { songId, sampleRate: 8000, channels: 1, ...flag };
    }
    case "render_preview_clip":
      return { genreId: "chicago-house", ...flag };
    default:
      throw new Error(`no render arguments are defined for ${name}`);
  }
}

let out = "";

beforeEach(() => {
  clearMcpArrangements();
  clearMcpSongs();
  headlessCalls.length = 0;
  mockBehavior.mode = "throw";
  process.env.GROOVE_MCP_NO_BROWSER = "1";
});

afterEach(() => {
  delete process.env.GROOVE_MCP_NO_BROWSER;
  delete process.env.GROOVE_MCP_OUT;
  if (out) rmSync(out, { recursive: true, force: true });
  out = "";
});

describe.each(HEADLESS_TOOLS)("%s's two engines", (name) => {
  it("declares the choice as a schema parameter, with the measured divergence in it", () => {
    expect(toolNamed(name).inputSchema.headless, "the parameter has to exist for the flag to be reachable").toBeDefined();
    const described = toolNamed(name).inputSchema.headless?.description ?? "";
    // The divergence is stated where the model reads it, and it points at the document rather than repeating it blindly.
    expect(described).toContain("1.28 dB in band 6");
    expect(described).toContain("1.11 dB in band 3");
    expect(described).toContain("1.774 LU");
    expect(described).toContain("docs/HEADLESS_CORE_PLAN.md");
    expect(described).toContain("never falls back");
    // The tool's own description has to mention the engine choice too, or `tools/list` shows a browser-only tool.
    expect(toolNamed(name).description).toContain("headless");
  });

  it("sends headless: true to the Node host — the browser is forbidden here, so nothing else can answer", async () => {
    const text = await callText(name, renderArgs(name, true));

    expect(headlessCalls, "the Node host must have been reached").toHaveLength(1);
    // The flag survived schema → handler → worker → headless module.
    expect(headlessCalls[0]?.headless).toBe(true);
    expect(text, "the answer came from the headless renderer").toContain("HEADLESS-REACHED");
    // ⭐ The one assertion that names the defect: a silent fallback would have produced exactly this sentence.
    expect(text, "the browser path must not have been taken").not.toContain("GROOVE_MCP_NO_BROWSER");
  });

  it("leaves a call with no flag on the browser path, which is the engine it has always had", async () => {
    const text = await callText(name, renderArgs(name, false));

    expect(headlessCalls, "the default must not touch the Node host").toHaveLength(0);
    expect(text, "the default reached the browser path").toContain("GROOVE_MCP_NO_BROWSER");
  });

  it("names the engine in the reply, so headless is read rather than inferred", async () => {
    mockBehavior.mode = "payload";
    out = mkdtempSync(path.join(os.tmpdir(), "groove-headless-route-"));
    process.env.GROOVE_MCP_OUT = out;

    const reply = (await toolNamed(name).handler(renderArgs(name, true))) as Record<string, unknown>;

    // The whole point of the field: a fallback would have to lie here too. `render_preview_clip`'s reply is a curated
    // shape rather than a spread, so this is the assertion that catches the field being dropped on the way out.
    expect(headlessCalls, "the Node host must have been reached").toHaveLength(1);
    expect(reply.engine, `${name} must name the host that rendered`).toBe("node-web-audio-api");
  });
});
