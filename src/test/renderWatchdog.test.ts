import { describe, it, expect } from "vitest";
import { runWithWatchdog } from "../../scripts/lib/watchdog.mjs";

/**
 * ⭐ **This criterion exists to be able to go red.** The failure it guards against is not "a slow render" — it is a
 * process whose event loop has stopped turning, where *every* in-process timeout is dead by definition. So the test
 * feeds the watchdog a child that can never finish and asserts two things that cannot both be faked: it is killed
 * from outside within the limit, and the caller gets control back so the next job can start.
 */
describe("the render watchdog", () => {
  it("⭐ kills a child that will never answer, and says that is what happened", async () => {
    const started = Date.now();
    const result = await runWithWatchdog(process.execPath, ["-e", "setInterval(() => {}, 1000);"], { limitMs: 1500 });
    const elapsed = Date.now() - started;
    expect(result.killedByWatchdog, "the watchdog must name the kill as its own").toBe(true);
    expect(elapsed, `it took ${elapsed}ms, which is not "within the limit plus slack"`).toBeLessThan(8000);
  }, 20_000);

  it("⭐ and the next job still runs, which is the whole point of killing it", async () => {
    await runWithWatchdog(process.execPath, ["-e", "setInterval(() => {}, 1000);"], { limitMs: 1000 });
    const after = await runWithWatchdog(process.execPath, ["-e", "process.stdout.write('still here');"], { limitMs: 10_000 });
    expect(after.killedByWatchdog).toBe(false);
    expect(after.code).toBe(0);
    expect(after.stdout).toBe("still here");
  }, 20_000);

  it("⭐ does not kill a child that finishes in time", async () => {
    const quick = await runWithWatchdog(process.execPath, ["-e", "process.exit(0);"], { limitMs: 10_000 });
    expect(quick.killedByWatchdog).toBe(false);
    expect(quick.code).toBe(0);
  }, 20_000);
});
