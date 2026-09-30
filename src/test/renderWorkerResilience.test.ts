/**
 * The render worker's two failure modes, from a real nine-movement session.
 *
 * Muse rendered a piece through the MCP server and reported the shape of both: **a zombie `LISTEN` socket on the fixed port** made every render after the first fail, and **four movements hung with no CPU progress and no message**, so a stuck page could not be told from a slow piece. Neither is about audio; both are about a worker that cannot say what is wrong with it.
 *
 * These are the halves that can be held without a browser: the port it chooses, and the sentence it produces when a render outlives its budget.
 */
import { describe, expect, it } from "vitest";
import net from "node:net";
import { aFreePort, renderTimeoutMessage } from "../../mcp/render/worker";

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
