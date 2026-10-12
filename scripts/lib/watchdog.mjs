/**
 * ⭐ **A process-level watchdog, because the failure it exists for is the one that disables every in-process timer.**
 *
 * The clip pipeline lost hours to a render that never answered: the client's own 180 s timeout never fired and the
 * server's own `the render of … did not answer within 900s` never fired either. Both of those are timers, and a timer
 * cannot save you from an event loop that is no longer turning — which is exactly the shape that was observed
 * (`vocal-trance` sat silent for over twenty minutes and had to be killed by hand from outside).
 *
 * So the watchdog lives **outside** the process it guards: it spawns the child in its own process group and, when the
 * limit passes, kills the whole group with SIGKILL. Killing the group matters — a wrapper that dies while its `node`
 * grandchild keeps rendering leaves the same wedge behind, which is the mistake this repository has already recorded
 * more than once.
 */
import { spawn } from "node:child_process";

export function runWithWatchdog(command, args = [], { limitMs = 900_000, cwd = process.cwd(), env = process.env, onOutput } = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const note = (chunk, sink) => {
      const text = chunk.toString();
      if (sink === "out") stdout += text; else stderr += text;
      if (onOutput) onOutput(text);
    };
    child.stdout.on("data", (c) => note(c, "out"));
    child.stderr.on("data", (c) => note(c, "err"));

    let killedByWatchdog = false;
    const timer = setTimeout(() => {
      killedByWatchdog = true;
      try {
        // ⭐ The negative pid is the process *group*: kill the wrapper and everything it started.
        process.kill(-child.pid, "SIGKILL");
      } catch {
        try { child.kill("SIGKILL"); } catch { /* already gone */ }
      }
    }, limitMs);

    const finish = (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, killedByWatchdog, elapsedMs: Date.now() - startedAt, stdout, stderr });
    };
    child.on("error", (error) => { stderr += String(error); finish(null, null); });
    child.on("close", (code, signal) => finish(code, signal));
  });
}
