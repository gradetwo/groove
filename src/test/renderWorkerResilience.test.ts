/**
 * The render worker's two failure modes, from a real nine-movement session.
 *
 * Muse rendered a piece through the MCP server and reported the shape of both: **a zombie `LISTEN` socket on the fixed port** made every render after the first fail, and **four movements hung with no CPU progress and no message**, so a stuck page could not be told from a slow piece. Neither is about audio; both are about a worker that cannot say what is wrong with it.
 *
 * These are the halves that can be held without a browser: the port it chooses, and the sentence it produces when a render outlives its budget.
 */
import { describe, expect, it } from "vitest";
import net from "node:net";
import { aFreePort, renderTimeoutMessage, withRenderTimeout } from "../../mcp/render/worker";

describe("the render worker's port", () => {
  it("asks the system for a port rather than fixing one", async () => {
    // ⭐ The zombie socket that broke every later render: with a fixed port and `--strictPort`, Vite refuses to start and the failure reads as "the render hangs".
    const port = await aFreePort();
    expect(port).toBeGreaterThan(1024);
    expect(port).toBeLessThan(65536);
  });

  it("avoids a port that is already taken", async () => {
    // The property, not the mechanism: hold a port and check the answer is not it.
    const held = net.createServer();
    await new Promise<void>((resolve) => held.listen(0, "127.0.0.1", () => resolve()));
    const taken = (held.address() as net.AddressInfo).port;
    try {
      const chosen = await aFreePort();
      expect(chosen).not.toBe(taken);
    } finally {
      await new Promise<void>((resolve) => held.close(() => resolve()));
    }
  });

  it("still honours a port the caller insists on, because a person debugging wants the URL", async () => {
    const previous = process.env.GROOVE_MCP_PORT;
    process.env.GROOVE_MCP_PORT = "5399";
    try {
      expect(await aFreePort()).toBe(5399);
    } finally {
      if (previous === undefined) delete process.env.GROOVE_MCP_PORT;
      else process.env.GROOVE_MCP_PORT = previous;
    }
  });
});

describe("the render timeout message", () => {
  it("says what was being rendered, how long it had, and that the renderer was reset", () => {
    // ⭐ "The render timed out" left the agent unable to tell work from a hang; this sentence answers both questions it had.
    const message = renderTimeoutMessage("64 bar(s) of chicago-house", 900);
    expect(message).toContain("64 bar(s) of chicago-house");
    expect(message).toContain("900s");
    expect(message).toContain("reset");
  });
});

/**
 * The budget itself, which the sentence above belongs to.
 *
 * `renderTimeoutMessage` could be spelled perfectly while nothing ever produced it: the sentence was pinned and the
 * **race** was not. A page inside `OfflineAudioContext.startRendering()` is one uninterruptible call with no callback
 * (`docs/RENDER_PROFILE.md`), so a stuck render is indistinguishable from a slow one except by giving up on it — and
 * giving up has to be a **rejection**, not a promise that stays pending. That is the whole difference between the
 * field report's "worker hang" and a loud failure, and it is what these three cases fix:
 *
 *   · slow work that finishes **inside** the budget still resolves — the budget must not kill a live render;
 *   · a render that never settles **rejects**, naming what was being rendered and how long it had;
 *   · a render that fails on its own keeps its **own** reason — a missing sample must not be relabelled a timeout.
 */
describe("the render budget", () => {
  it("lets slow work that finishes inside the budget resolve", async () => {
    // Green direction: 25 ms of work against a 1 s budget is the shape of a healthy slow render.
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve("rendered"), 25));
    await expect(withRenderTimeout(slow, "8 bar(s) of custom", 1000)).resolves.toBe("rendered");
  });

  it("rejects a render that stops answering, instead of leaving the caller pending", async () => {
    /**
     * ⭐ The silent-stall case. `never` is a page that will not answer again; without the timer in
     * `withRenderTimeout` this test does not fail an assertion — it **times out**, which is exactly the failure the
     * field report describes. The deletion test is to replace the race with `return await work;`.
     */
    const never = new Promise<never>(() => {});
    await expect(withRenderTimeout(never, "64 bar(s) of custom", 1000)).rejects.toThrow(
      /the render of 64 bar\(s\) of custom did not answer within 1s/
    );
  });

  it("keeps a render's own failure rather than turning it into a timeout", async () => {
    const failed = Promise.reject(new Error('no sample "probe-impulse" for lane "audio"'));
    await expect(withRenderTimeout(failed, "8 bar(s) of custom", 1000)).rejects.toThrow('no sample "probe-impulse"');
  });
});
