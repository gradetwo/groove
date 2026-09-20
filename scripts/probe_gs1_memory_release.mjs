#!/usr/bin/env node
/**
 * Probe: how many GS-1 hosts can one page build, and what actually frees the WASM memory?
 *
 * The long-page render drift turned out to be a WebAssembly OOM: past ~50-75 offline renders the
 * GS-1 worklet cannot instantiate its core any more —
 *
 *   [Gs1Host] worklet error: WASM 实例化失败: RangeError: WebAssembly.instantiate():
 *   Out of memory: Cannot allocate Wasm memory for new instance
 *
 * — so `renderPatternOffline` silently voices the chords/lead tracks with the native synth instead
 * and the export is a different file (measured: chords +13.05 dB, lead -16.56 dB on `ambient`).
 * Disposing the host (`host.dispose()`, which only disconnects the node) did not help.
 *
 * This builds hosts in a loop — no rendering, so ~100 ms per host instead of ~8 s per render — under
 * four teardown policies, and reports the first failure of each. Whichever policy survives is the
 * fix; if none does, the answer is that a render cannot free its WASM memory and the renderer has to
 * stop creating a new instance per render.
 *
 *   node scripts/probe_gs1_memory_release.mjs --iterations=300 --port=3198
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const argv = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : fallback;
};
const iterations = Math.max(10, Number(argValue("--iterations", "300")));
const port = Number(argValue("--port", "3198"));

const { chromium } = require("playwright");
const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
const server = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", () => {});
server.stderr.on("data", (chunk) => process.stderr.write(`  [vite] ${chunk}`));

const baseUrl = `http://127.0.0.1:${port}`;
const waitForServer = async () => {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(baseUrl, { signal: AbortSignal.timeout(1000) });
      if (res.ok || res.status === 404) return;
    } catch {
      /* not up */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("vite did not start");
};

/**
 * Runs in the page. `mode` is one teardown policy:
 *   keep          — drop the references and hope the collector runs
 *   dispose       — `host.dispose()` (what the renderer does today)
 *   dispose+close — also `ctx.close()` when the platform has it
 *   dispose+close+gc — the same, with an explicit `gc()` between hosts
 */
const IN_PAGE_BUILD_HOSTS = async ({ mode, iterations: count }) => {
  const { createGs1Host } = await import("/src/audio/gs1/Gs1Host.ts");
  const failures = [];
  const hasClose = typeof new OfflineAudioContext(2, 44100, 44100).close === "function";
  const startedAt = performance.now();

  for (let i = 0; i < count; i += 1) {
    const context = new OfflineAudioContext(2, 44100, 44100);
    let host = null;
    try {
      host = await createGs1Host({ context });
      await host.ready;
    } catch (error) {
      failures.push({ iteration: i, message: String((error && error.message) || error).slice(0, 160) });
      host = null;
    }
    if (host && mode !== "keep") {
      try {
        host.dispose();
      } catch {
        /* already detached */
      }
    }
    if (mode === "dispose+close" || mode === "dispose+close+gc") {
      try {
        await context.close?.();
      } catch {
        /* not supported */
      }
    }
    host = null;
    if (/\+gc$/.test(mode) && typeof globalThis.gc === "function") globalThis.gc();
  }

  return {
    mode,
    hasClose,
    hasGc: typeof globalThis.gc === "function",
    built: count - failures.length,
    failures: failures.slice(0, 3),
    failureCount: failures.length,
    ms: Math.round(performance.now() - startedAt),
  };
};

await waitForServer();
console.log(`GS-1 memory release probe: ${iterations} hosts per policy, fresh browser per policy`);

/**
 * A **fresh browser process per policy**.
 *
 * The WASM memory budget is exhausted per renderer process, so reusing one page across policies only
 * measures the first one: every later arm starts already out of memory and reports "0 built", which
 * says nothing about its teardown policy. That mistake made the first version of this probe useless.
 */
for (const mode of ["keep", "keep+gc", "dispose", "dispose+gc", "dispose+close"]) {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--js-flags=--expose-gc"] });
  try {
    const page = await browser.newPage();
    await page.route("**/__gs1_probe__.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><head><meta charset=\"utf-8\"><title>gs1 memory probe</title></head><body></body></html>",
      })
    );
    await page.goto(`${baseUrl}/__gs1_probe__.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const result = await page.evaluate(IN_PAGE_BUILD_HOSTS, { mode, iterations });
    const first = result.failures[0];
    console.log(
      `  ${result.mode.padEnd(18)} built ${String(result.built).padStart(3)}/${iterations} in ${String(result.ms).padStart(6)} ms  ` +
        `(close: ${result.hasClose}, gc: ${result.hasGc})` +
        (first ? `\n      first failure at #${first.iteration}: ${first.message}` : "  no failures")
    );
  } finally {
    await browser.close().catch(() => {});
  }
}
server.kill("SIGTERM");
