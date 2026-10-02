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
  RENDER_PROGRESS_HEARTBEAT_MS,
  RENDER_BUDGET_TEMPLATE,
  CLIENT_TIMEOUT_CLAUSE,
  renderBudgetSentence,
  renderCostSentence,
} from "../../mcp/render/budget";
import { createFrameProgress, createRenderProgress, runWithProgress } from "../../mcp/render/progress";

/**
 * A render is a browser, and this file has none.
 *
 * The spy has to be installed through `vi.mock` rather than `vi.spyOn` on a live import: the registry holds a
 * **binding**, and with ESM that binding is not writable from outside the module that declared it. `vi.hoisted` is what
 * lets the factory write into a variable the test body can read — the pattern Vitest provides precisely for this.
 */
const renderCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>);
/**
 * **The stub narrates itself exactly as the real renderer does, because the emission lives in the worker.**
 *
 * The progress call sites are inside `renderAudio` (`runWithProgress` around the page render), not in the server shell —
 * so a stub that only throws would prove the token arrived and nothing else. This one reports through the reporter it
 * was handed, which is what makes the transport test below a test of the real chain: server reads `_meta` → builds a
 * reporter → hands it to the renderer → the renderer reports → the client receives `notifications/progress`.
 */
const renderStub = vi.hoisted(() => ({
  /** Set by the test that wants the next stub call to speak. */
  emit: undefined as undefined | ((reporter: unknown) => void),
}));
/**
 * The mock's own specifier has to be an absolute URL: the registry reaches the worker as `./render/worker` and this file
 * as `../../mcp/render/worker`, and with ESM those are two module identities. `import.meta.url` needs no import, so it
 * survives hoisting (a top-level `path.resolve(__dirname, …)` did not: the hoisted factory runs before `path` exists).
 */
vi.mock(new URL("../../mcp/render/worker.ts", import.meta.url).pathname, () => ({
  renderAudio: async (_pattern: unknown, options: Record<string, unknown>) => {
    renderCalls.push(options);
    const reporter = options.progress as { report: (progress: number, message: string) => void } | undefined;
    if (renderStub.emit) {
      renderStub.emit(reporter);
      return {};
    }
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

/**
 * **The token has to arrive, and the notification has to leave.**
 *
 * Everything above tests the pieces; this is the seam they are wired across, and it is the kind that fails silently: a
 * server that read the token from the wrong field, or registered the tool without the second parameter, would pass every
 * unit test above and never notify anybody. So the real `createServer` is driven by a real MCP `Client` over an
 * in-memory transport, and what is asserted is what a client receives.
 *
 * `_meta` belongs to the **request params**, not to the transport options: SDK >= 1.30 has no `onprogress` and no options
 * field for it (`Protocol.request({ method, params }, …)`), so a token sent any other way never arrives at all. The token
 * here is a number because this SDK's client looks its progress handler up by `Number(token)` (`shared/protocol.js`,
 * `_onprogress`), so an opaque string token is reported as an unknown token and dropped — the spec allows either type and
 * the server echoes what it was sent, so the description does not promise a type.
 *
 * The renderer is the stub from `vi.mock`, which reports through the reporter it was handed exactly as `renderAudio` does
 * (`runWithProgress` around the page render); the emission sites are in the worker, so a stub that only threw would prove
 * the token arrived and nothing more.
 */
async function withProgressClient<T>(
  run: (call: (meta?: Record<string, unknown>) => Promise<{ isError?: boolean }>, received: unknown[]) => Promise<T>
): Promise<T> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  const { ProgressNotificationSchema } = await import("@modelcontextprotocol/sdk/types.js");
  const { createServer } = await import("../../mcp/server");

  const server = createServer();
  const client = new Client({ name: "progress-probe", version: "1.0.0" });
  const received: unknown[] = [];
  client.setNotificationHandler(ProgressNotificationSchema, (notification) => {
    received.push(notification.params);
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const call = (meta?: Record<string, unknown>) =>
      client.callTool({
        name: "render_audio",
        arguments: { genreId: "chicago-house" },
        ...(meta ? { _meta: meta } : {}),
      }) as Promise<{ isError?: boolean }>;
    return await run(call, received);
  } finally {
    await client.close();
    await server.close();
  }
}

describe("the server turns a request's progressToken into notifications", () => {
  it("sends notifications/progress when the request carries a token", async () => {
    // The first phase of a real render: a cold start announced before it is waited on.
    renderStub.emit = (reporter) => (reporter as { report: (n: number, m: string) => void }).report(0, "starting the renderer (Vite + Chromium)");
    try {
      await withProgressClient(async (call, received) => {
        const result = await call({ progressToken: 4242 });
        expect(result.isError, "the stub returns a rendered file, so the call succeeds").toBeFalsy();
        const notifications = received as Array<{ progressToken?: string | number; progress?: number; message?: string }>;
        expect(notifications.length, "a token-carrying render must not be silent").toBeGreaterThanOrEqual(1);
        expect(notifications[0]?.progressToken).toBe(4242);
        expect(notifications[0]?.message).toContain("starting the renderer");
      });
    } finally {
      renderStub.emit = undefined;
    }
  });

  it("sends none when the request carries no token", async () => {
    // The stub still tries to report; the server handed it no reporter, so nothing can leave.
    renderStub.emit = (reporter) => (reporter as { report?: unknown } | undefined)?.report;
    try {
      await withProgressClient(async (call, received) => {
        const result = await call();
        expect(result.isError).toBeFalsy();
        expect(received, "a token-less render must be silent").toEqual([]);
      });
    } finally {
      renderStub.emit = undefined;
    }
  });
});

/**
 * **The headless host's progress is frames, and it keeps the page's cadence.**
 *
 * The Node host can suspend inside the one `startRendering()` call, so unlike the page it has a real unit: frames
 * rendered out of the render's own frame count. Two things have to hold and both are held here rather than in prose:
 * the channel cannot run without a token, and it may not be denser than the 15 s heartbeat the browser path already
 * uses. The clock is injected, so the cadence is judged rather than timed.
 */
describe("the frame-counted progress channel the headless host uses", () => {
  it("emits the first frame, then never faster than the heartbeat, and nothing without a token", () => {
    const { sent, notify } = recordNotifications();
    const reporter = createRenderProgress("tok-frames", notify);
    expect(reporter).toBeDefined();
    let clock = 1_000;
    const report = createFrameProgress(reporter, (frames, total) => `rendering ${frames} of ${total} frames`, () => clock);

    report(1_000, 10_000);
    // One millisecond short of the interval: a second notification here would be the density the page path refuses.
    clock += RENDER_PROGRESS_HEARTBEAT_MS - 1;
    report(2_000, 10_000);
    clock += 1;
    report(3_000, 10_000);

    expect(sent.map((entry) => entry.progress)).toEqual([1_000, 3_000]);
    expect(sent.every((entry) => entry.total === 10_000)).toBe(true);

    // The same channel with no token: `createRenderProgress` returned nothing, so there is no reporter to reach.
    const silent = createFrameProgress(undefined, () => "never sent", () => clock);
    silent(10_000, 10_000);
    expect(sent).toHaveLength(2);
  });

  it("counts frames rather than budget milliseconds, and never sends a total below its progress", () => {
    const { sent, notify } = recordNotifications();
    const reporter = createRenderProgress("tok-unit", notify)!;

    // A cold start: the render's length is not known yet, so `total` is omitted rather than faked.
    reporter.reportOf(0, undefined, "starting the Node Web Audio host");
    reporter.reportOf(8_000, 8_000, "render finished; writing the file");
    expect(sent[0]).toEqual({ token: "tok-unit", progress: 0, total: undefined, message: "starting the Node Web Audio host" });
    expect(sent[1]).toEqual({ token: "tok-unit", progress: 8_000, total: 8_000, message: "render finished; writing the file" });

    // The budget counter is a separate number: the browser path's `report` still measures against RENDER_BUDGET_MS.
    reporter.report(250, "phase");
    expect(sent[2]?.total).toBe(RENDER_BUDGET_MS);

    // A total below the progress already reported is an arithmetic error, not a notification MCP would accept.
    reporter.reportOf(9_000, 8_000, "impossible");
    expect(sent).toHaveLength(3);
  });
});