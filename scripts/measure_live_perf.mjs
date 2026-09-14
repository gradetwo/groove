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
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
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

const { chromium } = loadPlaywright();

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

function startStaticServer() {
  return new Promise((resolve) => {
    const distDir = path.join(process.cwd(), "dist");
    const server = http.createServer((req, res) => {
      let rel = (req.url || "/").split("?")[0];
      if (rel === "/") rel = "/index.html";
      let file = path.join(distDir, rel);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(distDir, "index.html");
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

const PROFILES = [
  { name: "Desktop 1440x900", viewport: { width: 1440, height: 900 }, mobile: false, cpu: 1, network: null },
  { name: "Mobile 390x844 (4G + 4x CPU)", viewport: { width: 390, height: 844 }, mobile: true, cpu: 4, network: { download: 1.6 * 1024 * 1024 / 8, upload: 750 * 1024 / 8, latency: 150 } },
];

async function measure(browser, profile) {
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

  const started = Date.now();
  await page.goto(targetUrl, { waitUntil: "load", timeout: 60000 });

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
  const genreChunks = resources.filter((r) => /genre-/.test(r.url)).map((r) => r.url.split("/").pop());

  await context.close();

  return {
    profile: profile.name,
    fcp: metrics.fcp,
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

function fmt(ms) {
  return ms === null || ms === undefined ? "n/a" : `${Math.round(ms)} ms`;
}
function kb(bytes) {
  return `${bytes.toFixed(1)} KB`;
}

(async () => {
  if (argv.includes("--local")) {
    const { server, port } = await startStaticServer();
    localServer = server;
    targetUrl = `http://127.0.0.1:${port}`;
  }

  console.log("===============================================================");
  console.log("  \ud83d\udcc8 GROOVE LAB live performance measurement");
  console.log(`  target: ${targetUrl}`);
  console.log("===============================================================\n");

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const results = [];
  for (const profile of PROFILES) {
    process.stdout.write(`\u23f3 ${profile.name} ... `);
    try {
      const result = await measure(browser, profile);
      results.push(result);
      console.log(`FCP ${fmt(result.fcp)} | LCP ${fmt(result.lcp)} | CLS ${result.cls.toFixed(3)}`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }
  await browser.close();
  if (localServer) localServer.close();

  console.log("\n---------------------------------------------------------------");
  for (const r of results) {
    console.log(`\n${r.profile}`);
    console.log(
      `  FCP ${fmt(r.fcp)}${r.fcpFallback ? " (first-paint fallback)" : ""}   LCP ${fmt(r.lcp)}   CLS ${r.cls.toFixed(3)}`
    );
    console.log(`  DOMContentLoaded ${fmt(r.dcl)}   load ${fmt(r.load)}   wall ${fmt(r.wallMs)}`);
    console.log(
      `  transferred ${kb(r.totalTransferredKb)}  (JS ${kb(r.jsKb)}, CSS ${kb(r.cssKb)}, images ${kb(r.imageKb)}) over ${r.resources} requests`
    );
    console.log(
      `  genre chunks fetched on first load: ${r.genreChunksOnLoad} (max ${maxGenreChunks})` +
        (r.genreChunkNames.length ? ` → ${r.genreChunkNames.join(", ")}` : "")
    );
  }
  console.log("\n===============================================================");

  // Exactly one genre chunk is legitimate: the default studio genre itself
  // (chicago-house). More than that means something is prefetching a view the user
  // has not opened — that was the A-01 regression (the compare pool used to load on
  // every app mount).
  const failures = results.filter((r) => r.genreChunksOnLoad > maxGenreChunks);
  if (failures.length > 0) {
    console.error(
      `\u274c A-01 regression: ${failures.map((f) => f.profile).join(", ")} fetched more than ${maxGenreChunks} genre chunk(s) on first paint.`
    );
    process.exit(1);
  }
  if (results.length === 0) {
    console.error("\u274c no profile could be measured");
    process.exit(1);
  }
  console.log(`\u2705 measurement complete (\u2264${maxGenreChunks} genre chunk(s) on first paint)`);
  if (argv.includes("--local")) {
    console.log("   note: the local static server does not compress, so byte figures are raw, not transfer size.");
  }
})();
