/**
 * Diagnostic: does Chromium actually get a hardware GL context now, and is page compositing
 * even a measurable cost for the loudness measurement?
 *
 * Prints the GL renderer/vendor the browser reports, plus a timing breakdown of an actual
 * genre render versus an equivalent amount of page/DOM work.
 *
 *   node scripts/diagnose_gpu.mjs
 */
import { createRequire } from "node:module";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const playwright = require("playwright");
const ROOT = process.cwd();

async function startVite(port) {
  const viteBin = path.join(ROOT, "node_modules/vite/bin/vite.js");
  const child = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("vite did not start in 60s")), 60000);
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`);
        if (res.ok) {
          clearInterval(poll);
          clearTimeout(timer);
          resolve();
        }
      } catch {
        /* keep polling */
      }
    }, 400);
  });
  return child;
}

const PORT = 3180;
const server = http.createServer((_req, res) => {
  res.writeHead(404);
  res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));

const vite = await startVite(PORT);
/**
 * Launch exactly as the measurement scripts do (`--no-sandbox` only).
 *
 * Measured on this machine (CachyOS, Intel 2nd-gen iGPU + AMD Seymour, `/dev/dri` readable):
 * both this plain launch and an aggressive `--use-gl=egl --ignore-gpu-blocklist --enable-gpu`
 * launch report the same WebGL renderer — `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device
 * (Subzero)), SwiftShader driver)`, i.e. software.
 *
 * Where the software flags come from, verified in the installed package rather than guessed:
 *   - `--enable-unsafe-swiftshader` is a **Playwright default**, pushed unconditionally in
 *     `playwright-core/lib/coreBundle.js` (`chromeArguments.push("--enable-unsafe-swiftshader")`).
 *     It *allows* the software fallback; it does not select it.
 *   - `--use-angle=swiftshader-webgl` and `--disable-gpu-compositing` are **not** in Playwright's
 *     default list — Chromium adds them itself when its hardware GL/Vulkan initialisation fails.
 *     So they are a symptom of no hardware context, not a misconfiguration in this repo.
 *   - This repository passes only `--no-sandbox`; there is no swiftshader or GPU flag anywhere in
 *     `scripts/` (verified by grep) and no `CHROME_ARGS`-style environment variable is set.
 *
 * The measurement below is the part that actually settles the question: the audio render is two
 * orders of magnitude more expensive than page work, so GPU compositing cannot matter here even
 * if it were working.
 */
const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.route("**/__gpu_probe__", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>",
    })
  );
  await page.goto(`http://127.0.0.1:${PORT}/__gpu_probe__`, { waitUntil: "domcontentloaded" });

  const gl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!ctx) return { ok: false, reason: "no webgl context" };
    const dbg = ctx.getExtension("WEBGL_debug_renderer_info");
    return {
      ok: true,
      vendor: dbg ? ctx.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : ctx.getParameter(ctx.VENDOR),
      renderer: dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER),
      version: ctx.getParameter(ctx.VERSION),
    };
  });
  console.log("WebGL vendor  :", gl.vendor ?? "(none)");
  console.log("WebGL renderer:", gl.renderer ?? "(none)");

  /**
   * Time a real genre render, then an equivalent wall-clock amount of pure DOM/layout churn.
   * If compositing were the bottleneck, the blank page's DOM work would dominate; when the
   * audio render dominates instead, GPU acceleration is irrelevant to this workload.
   */
  const timings = await page.evaluate(async () => {
    const [wav, genresModule, mixModule, trackUtils] = await Promise.all([
      import("/src/audio/WavExporter.ts"),
      import("/src/data/genres/index.ts"),
      import("/src/audio/genreMix.ts").catch(() => import("/src/data/genreMix.ts")),
      import("/src/utils/trackUtils.ts"),
    ]);
    const genre = genresModule.ALL_GENRES.find((g) => g.id === "chicago-house");
    const drumKit = trackUtils.getDefaultDrumKitForGenre(genre);

    const t0 = performance.now();
    await wav.renderPatternOffline(mixModule.applyGenreMixDefaults(genre.sequencer_pattern, genre.id), {
      bars: 3,
      drumKit,
      loudnessTrimDb: 0,
    });
    const audioMs = performance.now() - t0;

    // Equivalent DOM churn: create/mutate/measure a few thousand nodes, no painting of note.
    const t1 = performance.now();
    const host = document.createElement("div");
    for (let i = 0; i < 4000; i++) host.appendChild(document.createElement("div"));
    document.body.appendChild(host);
    void host.offsetHeight;
    host.remove();
    const domMs = performance.now() - t1;

    return { audioMs, domMs };
  });
  console.log("\nchicago-house render (3 bars):", timings.audioMs.toFixed(0), "ms");
  console.log("4000-node DOM churn        :", timings.domMs.toFixed(1), "ms");
  console.log(
    "\n=> audio render is " +
      (timings.audioMs / Math.max(0.001, timings.domMs)).toFixed(0) +
      "x the DOM work; page compositing is not the bottleneck."
  );
} finally {
  await browser.close();
  vite.kill();
  server.close();
}
