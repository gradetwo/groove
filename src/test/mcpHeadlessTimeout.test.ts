/**
 * ⭐ **`render_song {headless: true}` must answer inside a stated ceiling — it may not sit there saying nothing.**
 *
 * The owner's measurement is the case this file exists for: a two-bar `chicago-house` song at 44.1 kHz stereo rendered on the Node
 * host **outlived a 60 s and a 300 s client timeout with no result and no WAV**. It does finish — measured on this checkout at
 * **135.9 s for 49.75 s of audio**, 2.7× realtime — and that is the whole difficulty: a caller cannot tell a slow render from a hang,
 * so the server has to be the one that says which it was.
 *
 * The Node host had **no ceiling**: `withRenderTimeout` exists to reset a stuck *page*, and an in-process render has no page, so the
 * budget was read as not applying (its own doc comment says so). `withHeadlessRenderTimeout` gives that path the same
 * `RENDER_BUDGET_MS` and a message that names the levers, without pretending it can reset a renderer that does not exist.
 *
 * ## Why the Node module is mocked
 *
 * The fact under test is **"does the call answer, and with what"**, not how long a real render takes — and a criterion that slept
 * 900 s to prove a 900 s ceiling would be a criterion nobody runs. So `renderPatternHeadless` is replaced by one that returns after
 * a long, *resolvable* delay; the tool is given a short `renderTimeoutMs`; and the assertion is that the **call** rejects in that
 * window with the sentence, while the mock's own work is still outstanding.
 *
 * The reverse test — the one that has to go red — is to call `renderPatternHeadless` directly instead of through
 * `withHeadlessRenderTimeout`: the same case then hangs until the mock resolves and fails on the elapsed time, which is exactly the
 * silent stall the owner reported.
 *
 * ⚠️ **What this does not claim.** Nothing can stop a `startRendering()` already under way; a call that timed out leaves that work
 * to finish on its own. This criterion is about the **answer**, not about cancellation, and the message says so by offering levers
 * rather than implying the render was killed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** How long the mocked Node host takes — far longer than the ceiling the tool is given below. */
const SLOW_RENDER_MS = 4_000;
/**
 * The ceiling handed to the worker, through `GROOVE_MCP_RENDER_TIMEOUT_MS` — short on purpose: the assertion is that the ceiling
 * is *honoured*, not what its default is. (The tool schema deliberately does not expose a caller-set timeout; the environment is
 * the operator's and the criterion's lever, and `mcp/render/budget.ts` says why.)
 */
const CEILING_MS = 150;

/** What the mock was handed, so the flag's survival to the Node module is assertable. */
const headlessCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock(new URL("../../mcp/render/headless.ts", import.meta.url).pathname, () => ({
  renderPatternHeadless: async (_pattern: unknown, options: Record<string, unknown>) => {
    headlessCalls.push(options);
    // A promise that really is outstanding when the ceiling fires: nothing here resolves early.
    await new Promise((resolve) => setTimeout(resolve, SLOW_RENDER_MS));
    return { base64: "", durationSec: 0, sampleRate: 8000, channels: 1, truePeakDb: -120, integratedLufs: -120 };
  },
  renderInstrumentNoteHeadless: async () => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_RENDER_MS));
    return { error: "unreachable in this file" };
  },
  headlessUnavailableMessage: (reason: unknown) => `stub unavailable: ${String(reason)}`,
  HEADLESS_PACKAGE: "node-web-audio-api",
}));

import { TOOLS } from "../../mcp/registry";
import { clearMcpSongs, createMcpSong } from "../../mcp/song";
import { findGenre } from "../../mcp/library";
import { NODE_HOST_BUDGET_CLAUSE } from "../../mcp/render/worker";

const toolNamed = (name: string) => {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  expect(tool, `${name} is not declared`).toBeTruthy();
  return tool!;
};

/** The tool's failure reply as text; every render tool wraps a thrown render error in `failure()`. */
function replyText(reply: unknown): string {
  const content = (reply as { content?: Array<{ text?: string }> }).content ?? [];
  return content.map((entry) => entry.text ?? "").join("\n");
}

let out = "";

beforeEach(() => {
  clearMcpSongs();
  headlessCalls.length = 0;
  // No browser is available here, and that is the point: the Node host is the only path left.
  process.env.GROOVE_MCP_NO_BROWSER = "1";
  process.env.GROOVE_MCP_RENDER_TIMEOUT_MS = String(CEILING_MS);
  out = mkdtempSync(path.join(os.tmpdir(), "groove-headless-answer-"));
  process.env.GROOVE_MCP_OUT = out;
});

afterEach(() => {
  delete process.env.GROOVE_MCP_NO_BROWSER;
  delete process.env.GROOVE_MCP_OUT;
  delete process.env.GROOVE_MCP_RENDER_TIMEOUT_MS;
  rmSync(out, { recursive: true, force: true });
});

describe("a Node-host render answers inside its ceiling", () => {
  it("rejects with a reason and the levers, rather than staying silent", async () => {
    const { songId } = createMcpSong({ genreId: "chicago-house", genre: findGenre("chicago-house") ?? null });
    const started = performance.now();

    const reply = await toolNamed("render_song").handler({ songId, headless: true });
    const elapsed = performance.now() - started;

    // ⭐ The whole criterion: an answer, inside the ceiling, rather than "no output".
    expect(elapsed, "the call must answer within its own ceiling, not when the render happens to finish").toBeLessThan(SLOW_RENDER_MS / 2);
    const text = replyText(reply);
    expect(text, "a timeout is a failure with a sentence, not an empty reply").toContain("did not answer within");
    expect(text).toContain(NODE_HOST_BUDGET_CLAUSE);
    // Named, so a caller can tell which render it was.
    expect(text).toContain("chicago-house");
    // And it must not claim a renderer was reset: there is no page on this path.
    expect(text, "the page sentence would be untrue here").not.toContain("the renderer has been reset");
    // The flag did reach the Node module — this is a ceiling around the Node host, not a refusal to use it.
    expect(headlessCalls).toHaveLength(1);
    expect(headlessCalls[0]?.headless).toBe(true);
  }, 30_000);

  it("gives each stem of a stems call the same ceiling, so one stuck track cannot hang the whole call", async () => {
    const { arrangementId } = (await import("../../mcp/arrangement")).createMcpArrangement({ blankKind: "drumkit", songId: "ceiling" });
    const started = performance.now();

    const reply = await toolNamed("render_arrangement_stems").handler({ arrangementId, headless: true });
    const elapsed = performance.now() - started;

    expect(elapsed, "the first stem's ceiling must bound the call").toBeLessThan(SLOW_RENDER_MS / 2);
    const text = replyText(reply);
    expect(text).toContain("did not answer within");
    // The stem is named, so "which track" is not something the caller has to guess.
    expect(text).toMatch(/stem 1 of \d+/);
  }, 30_000);
});
