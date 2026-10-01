/**
 * A **hard wall-clock budget for a probe**, so a hung page cannot outlive its purpose.
 *
 * A probe that drives a browser can hang in a way no inner `timeout:` covers: `page.evaluate` on a render that never
 * resolves has no timeout of its own, and the measured leak behind this helper is a Chromium tree that outlived the
 * agent which started it by three hours (`docs/WORKLET_AVAILABILITY.md`, appendix). A navigation budget only bounds the
 * navigation; it says nothing about a render, and a probe is not a service — if it has stopped making progress, the
 * honest thing is to close what it started and exit non-zero.
 *
 * `onTimeout` is awaited **with its own short budget** before exiting, because the cleanup is the thing being trusted
 * and a cleanup that hangs is exactly the case this exists for. It is called before the exit code is chosen so a reader
 * sees what was closed.
 *
 * The timer is `unref`'d: a probe that finishes early must exit on its own, not wait out its own watchdog.
 *
 * @param {{ ms: number, label: string, onTimeout?: () => Promise<void> | void, exitCode?: number }} options
 * @returns {() => void} clear the watchdog
 */
export function installWatchdog({ ms, label, onTimeout, exitCode = 3 }) {
  const started = Date.now();
  const timer = setTimeout(() => {
    void (async () => {
      console.error(
        `⏱️  WATCHDOG  ${label} did not finish within ${Math.round(ms / 1000)}s — treating it as hung and closing what it started.`
      );
      try {
        await Promise.race([
          Promise.resolve(onTimeout?.()),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
      } catch (error) {
        console.error(`   cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      console.error(`   elapsed ${Math.round((Date.now() - started) / 1000)}s; exiting ${exitCode}.`);
      process.exit(exitCode);
    })();
  }, ms);
  timer.unref?.();
  return () => clearTimeout(timer);
}
