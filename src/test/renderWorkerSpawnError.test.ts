/**
 * **A dev server that cannot be started must fail the render, not the process.**
 *
 * `spawn` reports a failure to *start* as an `error` event on the child, and an `error` on an emitter with no listener
 * is an uncaught exception. Measured on the stdio side first (`src/test/mcpStdioDisconnect.test.ts`): the same missing
 * listener turned a closed client pipe into a dead server. Here the shape was worse, because it happened before any
 * promise could reject — a caller asking for audio got no failure, no file and no process.
 *
 * The criterion drives `awaitRendererStart` with a binary that does not exist, which is the only way to produce a real
 * spawn `error` without breaking a checkout. Without the listener this file does not fail an assertion: it takes the
 * whole test process down with an unhandled `'error'` event, which is exactly the production behaviour.
 */
import { describe, expect, it } from "vitest";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { awaitRendererStart } from "../../mcp/render/worker";

/** The pipes `ensurePage` gives the child, so the function is driven exactly as the renderer drives it. */
const pipes: SpawnOptions = { stdio: ["ignore", "pipe", "pipe"] };

const start = (command: string, args: string[] = []): ChildProcess => spawn(command, args, pipes);

describe("a dev server that cannot start", () => {
  it("rejects the render instead of letting an unhandled `error` kill the process", async () => {
    await expect(awaitRendererStart(start("/nonexistent/groove-dev-server"), 5_000)).rejects.toThrow(/could not start the dev server/);
  });

  it("still names a child that started and then exited early", async () => {
    await expect(awaitRendererStart(start(process.execPath, ["-e", "process.exit(3)"]), 5_000)).rejects.toThrow(/vite exited early \(3\)/);
  });

  it("resolves when the dev server says it is ready, and hands back no timer to fire later", async () => {
    const child = start(process.execPath, [
      "-e",
      "process.stdout.write('  ➜  Local:   http://127.0.0.1:5199/'); setTimeout(() => {}, 150)",
    ]);
    await expect(awaitRendererStart(child, 5_000)).resolves.toBeUndefined();
    // The child's own exit must not settle the promise a second time, either.
    child.kill("SIGKILL");
  });
});
