/**
 * **The two ceilings, held to the code rather than to prose.**
 *
 * A long render hits a ceiling on this server (the render budget) and a ceiling the caller owns (its own client
 * timeout). Both are stated in the rendering tools' descriptions, and the failure this file exists to prevent is the
 * one this repository treats as its worst: a description that states a number the code does not use. So the
 * descriptions are checked against `RENDER_BUDGET_MS` — the same value the worker passes to `withRenderTimeout` —
 * rather than against a string somebody typed twice.
 *
 * The progress half is the same idea from the other side: a caller that asked to be kept informed gets notifications,
 * and a caller that did not gets **none**. The second assertion is the one that matters — an emit site without the
 * token gate would look helpful in every demo and would be inventing a conversation.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { TOOLS } from "../../mcp/registry";
import {
  RENDER_BUDGET_MS,
  NAVIGATION_BUDGET_MS,
  RENDER_BUDGET_TEMPLATE,
  CLIENT_TIMEOUT_CLAUSE,
  renderBudgetSentence,
  renderCostSentence,
} from "../../mcp/render/budget";
import { createRenderProgress, runWithProgress } from "../../mcp/render/progress";

/**
 * A render is a browser, and this file has none.
 *
 * The spy has to be installed through `vi.mock` rather than `vi.spyOn` on a live import: the registry holds a
 * **binding**, and with ESM that binding is not writable from outside the module that declared it. `vi.hoisted` is what
 * lets the factory write into a variable the test body can read — the pattern Vitest provides precisely for this.
 */
const renderCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);
/**
 * The mock's own specifier has to be an absolute URL: the registry reaches the worker as `./render/worker` and this file
 * as `../../mcp/render/worker`, and with ESM those are two module identities. `import.meta.url` needs no import, so it
 * survives hoisting (a top-level `path.resolve(__dirname, …)` did not: the hoisted factory runs before `path` exists).
 */
vi.mock(new URL("../../mcp/render/worker.ts", import.meta.url).pathname, () => ({
  renderAudio: async (_pattern: unknown, options: Record<string, unknown>) => {
    renderCalls.push(options);
    throw new Error("stub: this test does not start a browser");
  },
  renderStems: async () => {
    throw new Error("stub: this test does not start a browser");
  },
  auditionInstrumentNote: async () => {
    throw new Error("stub: this test does not start a browser");
  },
  analyseWavFile: () => {
    throw new Error("stub: this test does not read WAVs");
  },
}));

/** The tools that render audio — the five a caller must raise its timeout for. */
const RENDER_TOOLS = ["render_audio", "render_song", "render_arrangement", "render_arrangement_stems", "render_preview_clip"];

// The registry is imported at the top like every other test: `vi.mock` is hoisted above it, so it resolves the stub.
const toolNamed = (name: string) => {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  expect(tool, `${name} is not declared`).toBeTruthy();
  return tool!;
};

/** Every progress notification one call produced, in order. */
function recordNotifications() {
  const sent: Array<{ token: string | number; progress: number; total: number | undefined; message: string }> = [];
  return {
    sent,
    notify: (token: string | number, progress: number, total: number | undefined, message: string) =>
      sent.push({ token, progress, total, message }),
  };
}

describe("the render budget a caller reads is the budget the code enforces", () => {
  it("derives every stated number from RENDER_BUDGET_MS rather than typing it again", () => {
    const sentence = renderBudgetSentence();
    expect(sentence).toContain(String(Math.round(RENDER_BUDGET_MS / 1000)));
    // The template is not decoration: if the substitution stops happening, the description would state a duration
    // nothing in this repository enforces.
    expect(sentence).not.toContain("{seconds}");
    expect(sentence).not.toContain("{minutes}");
    expect(sentence).not.toContain("{navSeconds}");
    expect(RENDER_BUDGET_TEMPLATE).toContain("{seconds}");
    // The promise has to be **at least** what the code allows. Loading the page is one navigation of up to
    // NAVIGATION_BUDGET_MS with one retry, spent before the render budget starts, so a sentence that folded page
    // startup into "900 s" would be shorter than the code's own worst case.
    expect(sentence).toContain(String(Math.round(NAVIGATION_BUDGET_MS / 1000)));
    // The budget the worker actually passes to `withRenderTimeout` (`mcp/render/worker.ts`, `options.renderTimeoutMs ??
    // RENDER_BUDGET_MS`), stated so that changing it is a decision rather than an accident.
    expect(RENDER_BUDGET_MS).toBe(900_000);
  });

  it("states the client's timeout as the other ceiling, in every rendering tool", () => {
    for (const name of RENDER_TOOLS) {
      const description = toolNamed(name).description;
      expect(description, `${name} must state the budget`).toContain(renderBudgetSentence());
      expect(description, `${name} must state the wrong-timeout failure`).toContain(CLIENT_TIMEOUT_CLAUSE);
      expect(description, `${name} must say a progressToken is how progress is asked for`).toContain("progressToken");
    }
  });

  it("says what drives the duration, from the measurements", () => {
    const cost = renderCostSentence();
    // The four measured facts a caller can plan with: one bar, eight bars, the full-rate ratio, the low-rate path.
    expect(cost).toContain("17.18");
    expect(cost).toContain("125.56");
    expect(cost).toContain("0.7");
    expect(cost).toContain("1.45");
    for (const name of RENDER_TOOLS) {
      expect(toolNamed(name).description, `${name} must quote the measured cost`).toContain(cost);
    }
    // `render_song` is the one render that cannot quote a per-bar cost for the whole song, and it says so rather than
    // letting the preview's figure stand in for a measurement nobody took.
    expect(toolNamed("render_song").description).toContain("has **not** measured a whole-song full-rate bounce");
  });

  it("names the two things that drive duration, so the number is inferable rather than guessed", () => {
    for (const name of ["render_audio", "render_arrangement"]) {
      const bars = toolNamed(name).inputSchema.bars?.description ?? "";
      expect(bars, `${name}.bars must say it moves the duration`).toContain("drives the duration");
    }
    expect(toolNamed("render_arrangement").inputSchema.sampleRate?.description ?? "").toContain("drives the duration");
  });

  it("wraps both render paths in the budget, not only the single-render one", () => {
    // The description promises the budget to every rendering tool, so the code has to enforce it on every path that
    // renders. This reads the worker because there is no browser in a unit test; the alternative — trusting that the
    // stems path stayed wrapped — is exactly the drift this file is against.
    const worker = readFileSync("mcp/render/worker.ts", "utf8");
    // Call sites only: the declaration is `withRenderTimeout<T>(`, which this does not match.
    const budgeted = worker.match(/withRenderTimeout\(/g) ?? [];
    expect(budgeted.length, "renderAudio and renderStems are the two paths that wait on a page").toBe(2);
    expect(worker).toContain("options.renderTimeoutMs ?? RENDER_BUDGET_MS");
    // Both defaults read the constant rather than a literal: `900_000` appears nowhere in the worker any more.
    expect(worker).not.toContain("900_000");
  });
});

describe("progress is emitted when it is asked for, and never when it is not", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a request with a progress token produces at least one notification", () => {
    const { sent, notify } = recordNotifications();
    const reporter = createRenderProgress("tok-1", notify);
    expect(reporter).toBeDefined();

    // Stands in for a render: the first phase is reported synchronously, before any waiting.
    void runWithProgress(reporter, "rendering 8 bar(s) of chicago-house", () => new Promise<void>(() => {}));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.token).toBe("tok-1");
    expect(sent[0]?.total).toBe(RENDER_BUDGET_MS);
    expect(sent[0]?.message).toContain("rendering 8 bar(s) of chicago-house");
  });

  it("keeps saying it is working while the render is inside one uninterruptible call", async () => {
    vi.useFakeTimers();
    const { sent, notify } = recordNotifications();
    void runWithProgress(createRenderProgress(7, notify), "rendering 8 bar(s) of chicago-house", () => new Promise<void>(() => {}));
    await vi.advanceTimersByTimeAsync(16_000);
    // ⭐ This is the assertion that fails if the emission is deleted: one phase notification is not a heartbeat, and a
    // 445-511 s render needs the second one.
    expect(sent.length, "a render longer than the heartbeat must not be silent").toBeGreaterThanOrEqual(2);
    expect(sent.some((entry) => entry.message.includes("still working"))).toBe(true);
    // Monotonic: a client that saw progress go backwards would be right to discard the stream.
    expect(sent.map((entry) => entry.progress)).toEqual([...sent.map((entry) => entry.progress)].sort((a, b) => a - b));
    expect(sent[1]?.token).toBe(7);
  });

  it("a request with no progress token produces none", () => {
    const { sent, notify } = recordNotifications();
    const reporter = createRenderProgress(undefined, notify);
    expect(reporter, "no token means no reporter to hand a render").toBeUndefined();
    // Every call site is a `reporter?.report(...)`, so this is what a token-less render does.
    reporter?.report(0, "rendering");
    expect(sent).toEqual([]);
  });

  it("stops the heartbeat when the work it belongs to ends", async () => {
    vi.useFakeTimers();
    const { sent, notify } = recordNotifications();
    let finish: () => void = () => {};
    const work = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const running = runWithProgress(createRenderProgress("tok-2", notify), "rendering", () => work);
    await vi.advanceTimersByTimeAsync(31_000);
    const duringWork = sent.length;
    expect(duringWork).toBeGreaterThanOrEqual(3);
    finish();
    await running;
    await vi.advanceTimersByTimeAsync(120_000);
    // Nothing after the work returned. This is the assertion that fails if `clearInterval` is deleted from the `finally`.
    expect(sent.length).toBe(duringWork);
  });

  it("still finishes the work, and stops the heartbeat, when the notification path throws", async () => {
    vi.useFakeTimers();
    const reporter = createRenderProgress("tok-3", () => {
      throw new Error("the client hung up");
    });
    const running = runWithProgress(reporter, "rendering", async () => {
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      return "audio";
    });
    await vi.advanceTimersByTimeAsync(31_000);
    await expect(running).resolves.toBe("audio");
  });
});

describe("the render tools hand the reporter to the renderer", () => {
  it("passes this request's reporter into renderAudio rather than dropping it", async () => {
    renderCalls.length = 0;
    const { notify } = recordNotifications();
    const progress = createRenderProgress("tok-4", notify);
    expect(progress).toBeDefined();

    // The stub's failure propagates out of the handler — `render_audio` deliberately does not swallow it, so that
    // `mcp/server.ts` can add the tool name. What this test reads is what the handler passed down.
    await expect(toolNamed("render_audio").handler({ genreId: "chicago-house" }, { progress })).rejects.toThrow(
      "stub: this test does not start a browser"
    );
    expect(renderCalls).toHaveLength(1);
    expect(renderCalls[0]?.progress).toBe(progress);
  });

  it("drops the reporter when the context has none", async () => {
    renderCalls.length = 0;
    await expect(toolNamed("render_audio").handler({ genreId: "chicago-house" }, {})).rejects.toThrow("stub");
    expect(renderCalls).toHaveLength(1);
    expect("progress" in (renderCalls[0] ?? {})).toBe(false);
  });

  it("drops the reporter when a caller invokes the handler with no context at all", async () => {
    renderCalls.length = 0;
    // `handlers` are called without a context by the unit tests that predate progress; that path must stay silent
    // rather than throwing on `ctx.progress`.
    await expect(toolNamed("render_audio").handler({ genreId: "chicago-house" })).rejects.toThrow("stub");
    expect(renderCalls).toHaveLength(1);
    expect("progress" in (renderCalls[0] ?? {})).toBe(false);
  });
});
