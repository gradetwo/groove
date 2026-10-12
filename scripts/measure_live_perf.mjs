#!/usr/bin/env node
/**
 * Real-browser performance measurement for a deployed (or locally built) build.
 *
 * Lighthouse is not available offline in this environment, so this script collects the
 * same signals that matter for the A-01/A-08 work directly from the browser's own APIs:
 * transferred bytes per resource, FCP/LCP, DOMContentLoaded/load and CLS — on desktop
 * and mobile profiles.
 *
 *   node scripts/measure_live_perf.mjs                       # measures the deployed URL
 *   node scripts/measure_live_perf.mjs --url http://127.0.0.1:PORT
 *
 * Playwright resolution mirrors scripts/test_matrix.js (normal require, then
 * PLAYWRIGHT_MODULE_PATH). No fixed ports are used; a local target is served on an
 * ephemeral port.
 *
 * ⭐ **Each profile measures the surface a real visitor on that device gets, and it navigates
 * to that surface directly.** The mobile profile is defined as the **phone shell** (`/m`), and
 * the harness opens `/m` itself rather than racing the app's own redirect: a phone that opens
 * the desktop root is sent to `/m` by `src/app/phoneEntry.ts` (`App.tsx` calls
 * `window.location.replace`), and a navigation that lands *while* `page.evaluate` is collecting
 * destroys the execution context. That is not a slow measurement, it is a measurement that
 * never happens — on 2026-10-12 it produced
 * `FAILED: page.evaluate: Execution context was destroyed, most likely because of a
 * navigation`, and the run still exited 0. So two rules hold here, and
 * `src/test/perfHarness.test.ts` holds them:
 *
 *   1. A profile declares the path it measures, and it is measured on that path.
 *   2. A profile that cannot be measured fails the run (non-zero exit); it is never printed
 *      as `FAILED` and skipped.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (primaryError) {
    const extraPath = process.env.PLAYWRIGHT_MODULE_PATH;
    if (extraPath) {
      try {
        return createRequire(path.join(extraPath, "noop.js"))("playwright");
      } catch {
        /* fall through */
      }
    }
    console.error(`\u274c Could not load Playwright: ${primaryError.message}`);
    process.exit(1);
  }
}

const argv = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const DEFAULT_URL = "https://silent-river-9229.gradetwo.workers.dev";
let targetUrl = argValue("--url", process.env.PERF_TARGET_URL || DEFAULT_URL);
const maxGenreChunks = Number(argValue("--max-genre-chunks", "1"));
let localServer = null;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

/**
 * ⭐ **A path that is not a file is still an app route.**
 *
 * `/m` is the phone shell and it has no `dist/m/index.html` — the shell is a client-side route of
 * the single-page build, exactly as the app itself treats it (`src/app/router.tsx`, `parseUrlToRoute`).
 * The first version of this server answered every route with the root document anyway, which happened
 * to make `/m` work by accident; making that explicit is what lets the mobile profile navigate to the
 * shell directly instead of being redirected into it.
 */
function fileForRequest(url) {
  const distDir = path.join(process.cwd(), "dist");
  let rel = (url || "/").split("?")[0];
  try {
    rel = decodeURIComponent(rel);
  } catch {
    /* a malformed escape is not a route; fall through to the 404 below */
  }
  const candidate = path.join(distDir, rel);
  if (candidate.startsWith(distDir) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }
  // An extension that is not on disk is a missing asset and must not be answered with HTML:
  // a `<script src>` that gets the document back fails with a syntax error that hides the 404.
  if (path.extname(rel)) return null;
  const index = path.join(distDir, "index.html");
  return fs.existsSync(index) ? index : null;
}

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = fileForRequest(req.url);
      if (!file) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

/**
 * ⭐ **The surface each profile measures, named on the profile itself.**
 *
 * Not "the root, and whatever the app does next": the mobile profile is the phone shell, so the
 * entry that defines the profile also declares where that shell lives. A new profile cannot be
 * added without saying which page it measures, and `profileTargetUrl` cannot send it anywhere else.
 */
export const PROFILES = [
  { name: "Desktop 1440x900", path: "/", viewport: { width: 1440, height: 900 }, mobile: false, cpu: 1, network: null },
  {
    name: "Mobile 390x844 (4G + 4x CPU)",
    path: "/m",
    viewport: { width: 390, height: 844 },
    mobile: true,
    cpu: 4,
    network: { download: 1.6 * 1024 * 1024 / 8, upload: 750 * 1024 / 8, latency: 150 },
  },
];

/**
 * ⭐ **Genre *code* chunks, not every URL with "genre" in it.**
 *
 * A-01 was about the *lazy genre modules* being prefetched (`assets/genre-*.js`): a second one means
 * the compare pool or another view pulled its genre data onto first paint. The mobile shell also
 * legitimately fetches `/genre-clips.json` — its clip player reads that manifest on mount — and
 * matching it here counted a data fetch as a prefetched module, which turned the phone shell's own
 * feature into an "A-01 regression" (measured 2026-10-12, and enough to make the harness refuse the
 * reading it had just taken). Only script chunks count, and `src/test/perfHarness.test.ts` names
 * `genre-clips.json` as the one file this ignores so the exclusion cannot quietly become "any file we
 * do not feel like counting".
 */
export function countGenreChunks(urls) {
  return urls.filter((url) => /\bgenre-[^/]*\.js$/.test(url)).map((url) => url.split("/").pop());
}

/** Where a profile's measurement starts. Pure, so the criterion can assert it without a browser. */
export function profileTargetUrl(base, profile) {
  return base.replace(/\/+$/, "") + (profile.path || "/");
}

export async function measure(browser, profile, base) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
    deviceScaleFactor: profile.mobile ? 3 : 1,
  });
  const page = await context.newPage();

  if (profile.cpu > 1) {
    const client = await context.newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
  }

  const resources = [];
  page.on("response", async (response) => {
    try {
      const request = response.request();
      const headers = response.headers();
      const size = Number(headers["content-length"] || 0);
      resources.push({
        url: response.url(),
        type: request.resourceType(),
        status: response.status(),
        bytes: Number.isFinite(size) ? size : 0,
        cacheControl: headers["cache-control"] || "",
      });
    } catch {
      /* response already gone */
    }
  });

  if (profile.network) {
    const client = await context.newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: profile.network.latency,
      downloadThroughput: profile.network.download,
      uploadThroughput: profile.network.upload,
    });
  }

  const url = profileTargetUrl(base, profile);
  const started = Date.now();
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  /**
   * ⭐ **Wait for the navigation to settle before measuring, and prove which document we are on.**
   *
   * `goto` resolves on the *first* document's load event. A client-side redirect that starts after it
   * (`App.tsx`'s `window.location.replace("/m")`, read from `/`) used to land inside the metrics
   * collection below and take the execution context with it. The profile now navigates to its own
   * shell, so no redirect is expected; these two waits make a late one a **reported failure** rather
   * than a silent context crash, and the path check is what keeps "the mobile profile" honest.
   */
  await page.waitForLoadState("load", { timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
    /* a build with a long tail of requests is still measurable; the path check below decides */
  });
  const landedPath = new URL(page.url()).pathname.replace(/\/+$/, "") || "/";
  const expectedPath = (profile.path || "/").replace(/\/+$/, "") || "/";
  if (landedPath !== expectedPath) {
    await context.close();
    throw new Error(
      `${profile.name} navigated to ${landedPath}, but this profile measures ${expectedPath}; ` +
        `the measurement would not be of the surface it names`
    );
  }

  const metrics = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const nav = performance.getEntriesByType("navigation")[0];
        const paints = performance.getEntriesByType("paint");
        // Chrome sometimes records only `first-paint` for canvas/spinner-first apps
        // even though LCP is later reported; fall back to it and say which was used.
        const fcpEntry =
          paints.find((p) => p.name === "first-contentful-paint") ||
          performance.getEntriesByName("first-contentful-paint")[0] ||
          null;
        const firstPaintEntry = paints.find((p) => p.name === "first-paint") || null;
        const fcp = fcpEntry ? fcpEntry.startTime : firstPaintEntry ? firstPaintEntry.startTime : null;
        const fcpIsFirstPaintFallback = !fcpEntry && !!firstPaintEntry;
        let lcp = null;
        let cls = 0;
        try {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            lcp = entries[entries.length - 1].startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) cls += entry.value;
            }
          }).observe({ type: "layout-shift", buffered: true });
        } catch {
          /* older engines */
        }
        setTimeout(() => {
          const entries = performance.getEntriesByType("resource");
          const transferred = entries.reduce((sum, r) => sum + (r.transferSize || 0), 0);
          const byType = {};
          for (const entry of entries) {
            const kind = entry.initiatorType || "other";
            byType[kind] = (byType[kind] || 0) + (entry.transferSize || 0);
          }
          const sizeByUrl = {};
          for (const entry of entries) sizeByUrl[entry.name] = entry.transferSize || 0;
          resolve({
            fcp,
            lcp,
            cls,
            fcpFallback: fcpIsFirstPaintFallback,
            sizeByUrl,
            domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
            loadEvent: nav ? nav.loadEventEnd : null,
            resourceCount: entries.length,
            transferredBytes: transferred,
            byType,
          });
        }, 2500);
      })
  );

  const wallMs = Date.now() - started;
  // transferSize from the Resource Timing API is authoritative (HTTP/2 responses
  // often omit content-length), while Playwright classifies each request by type.
  // Joining the two gives accurate per-type transferred bytes.
  const sizeByUrl = metrics.sizeByUrl || {};
  const bytesOfType = (type) =>
    resources.filter((r) => r.type === type).reduce((sum, r) => sum + (sizeByUrl[r.url] || 0), 0);
  const jsBytes = bytesOfType("script");
  const cssBytes = bytesOfType("stylesheet");
  const imageBytes = bytesOfType("image");
  // The A-01 judgement's own definition, extracted so `src/test/perfHarness.test.ts` can assert it.
  const genreChunks = countGenreChunks(resources.map((r) => r.url));

  await context.close();

  return {
    profile: profile.name,
    path: profile.path,
    landedPath,
    fcp: metrics.fcp,
    fcpFallback: metrics.fcpFallback,
    lcp: metrics.lcp,
    cls: metrics.cls,
    dcl: metrics.domContentLoaded,
    load: metrics.loadEvent,
    wallMs,
    jsKb: jsBytes / 1024,
    cssKb: cssBytes / 1024,
    imageKb: imageBytes / 1024,
    totalTransferredKb: metrics.transferredBytes / 1024,
    resources: resources.length,
    genreChunksOnLoad: genreChunks.length,
    genreChunkNames: genreChunks,
  };
}

export function fmt(ms) {
  return ms === null || ms === undefined ? "n/a" : `${Math.round(ms)} ms`;
}
export function kb(bytes) {
  return `${bytes.toFixed(1)} KB`;
}

/**
 * Every profile with the path it measured, how that profile ended, and the genre-chunk judgement.
 * Kept separate from `main` on purpose: this is the whole "did the run measure what it claims to"
 * decision, and `src/test/perfHarness.test.ts` reads it directly.
 */
export function summarizeRun(results, failures, maxChunks) {
  const overBudget = results.filter((r) => r.genreChunksOnLoad > maxChunks);
  const lines = ["\n---------------------------------------------------------------"];
  for (const r of results) {
    lines.push(
      `\n${r.profile}  (${r.landedPath})`,
      `  FCP ${fmt(r.fcp)}${r.fcpFallback ? " (first-paint fallback)" : ""}   LCP ${fmt(r.lcp)}   CLS ${r.cls.toFixed(3)}`,
      `  DOMContentLoaded ${fmt(r.dcl)}   load ${fmt(r.load)}   wall ${fmt(r.wallMs)}`,
      `  transferred ${kb(r.totalTransferredKb)}  (JS ${kb(r.jsKb)}, CSS ${kb(r.cssKb)}, images ${kb(r.imageKb)}) over ${r.resources} requests`,
      `  genre chunks fetched on first load: ${r.genreChunksOnLoad} (max ${maxChunks})` +
        (r.genreChunkNames.length ? ` → ${r.genreChunkNames.join(", ")}` : "")
    );
  }
  for (const f of failures) lines.push(`\n${f.profile}\n  FAILED: ${f.error}`);

  const problems = [];
  for (const f of failures) problems.push(`${f.profile}: ${f.error}`);
  if (overBudget.length > 0) {
    problems.push(
      `A-01 regression: ${overBudget.map((r) => r.profile).join(", ")} fetched more than ${maxChunks} genre chunk(s) on first paint.`
    );
  }
  if (results.length === 0 && failures.length === 0) problems.push("no profile could be measured");

  const measured = results.map((r) => r.profile).join(", ") || "none";
  const ok = problems.length === 0;
  lines.push(
    ok
      ? `\n✅ measurement complete — ${results.length}/${results.length} profiles measured (${measured}; ≤${maxChunks} genre chunk(s) on first paint)`
      : `\n❌ measurement incomplete — ${results.length} profile(s) measured (${measured}), ${failures.length} failed:\n  - ${problems.join("\n  - ")}`
  );
  return { ok, lines, problems };
}

/**
 * The whole run, with the browser injected.
 *
 * `browser` is whatever can `newContext(...)` — Chromium in production, a stub in
 * `src/test/perfHarness.test.ts`. A profile that throws is **recorded**, not swallowed: the caller
 * below turns any entry in `failures` into a non-zero exit.
 */
export async function run({ browser, base, profiles = PROFILES, maxChunks = maxGenreChunks }) {
  const results = [];
  const failures = [];
  for (const profile of profiles) {
    process.stdout.write(`\u23f3 ${profile.name} ... `);
    try {
      const result = await measure(browser, profile, base);
      results.push(result);
      console.log(`FCP ${fmt(result.fcp)} | LCP ${fmt(result.lcp)} | CLS ${result.cls.toFixed(3)}`);
    } catch (err) {
      const error = err && err.message ? err.message : String(err);
      failures.push({ profile: profile.name, error });
      console.log(`FAILED: ${error}`);
    }
  }
  return { results, failures, summary: summarizeRun(results, failures, maxChunks) };
}

export async function main() {
  if (argv.includes("--local")) {
    const { server, port } = await startStaticServer();
    localServer = server;
    targetUrl = `http://127.0.0.1:${port}`;
  }

  console.log("===============================================================");
  console.log("  \ud83d\udcc8 GROOVE LAB live performance measurement");
  console.log(`  target: ${targetUrl}`);
  for (const profile of PROFILES) {
    console.log(`  ${profile.name} → ${profileTargetUrl(targetUrl, profile)}`);
  }
  console.log("===============================================================\n");

  let exitCode = 0;
  const browser = await loadPlaywright().chromium.launch({ args: ["--no-sandbox"] });
  try {
    const { results, failures, summary } = await run({ browser, base: targetUrl });
    for (const line of summary.lines) console.log(line);
    console.log("\n===============================================================");
    if (!summary.ok) exitCode = 1;
    if (argv.includes("--local")) {
      console.log("   note: the local static server does not compress, so byte figures are raw, not transfer size.");
    }
    // A measurement that could not be taken is a failed run, never a footnote: one profile
    // short means the report describes a build nobody measured on that device.
    if (failures.length > 0 && exitCode === 0) exitCode = 1;
    if (results.length === 0 && exitCode === 0) exitCode = 1;
  } finally {
    await browser.close();
    if (localServer) {
      localServer.close();
      localServer = null;
    }
  }
  return exitCode;
}

/**
 * ⭐ **Only a direct run measures.** The guard is exported from the module the criterion imports, so
 * `src/test/perfHarness.test.ts` can drive `run()` with a stub browser instead of starting Chromium.
 */
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main()
    .then((code) => {
      if (code) process.exitCode = code;
    })
    .catch((err) => {
      console.error(`\u274c ${err && err.message ? err.message : err}`);
      process.exitCode = 1;
    });
}
