#!/usr/bin/env node
/**
 * Interaction latency probe.
 *
 * Written for a real report: "toggling the GS-1 switch, or switching a track's timbre while the
 * transport is running, often does nothing for a moment, the display lags, and it feels stuck."
 * Guessing at the cause from the source is exactly the wrong move here, because the candidates are
 * in different layers — a synchronous WASM/worklet teardown, a host rebuild per instrument change,
 * React re-rendering the whole studio on every pattern commit, or the scheduler competing with the
 * main thread. This measures them separately.
 *
 * For each interaction it reports:
 *   - **action latency**: click → the DOM actually reflecting the change (what the user waits for)
 *   - **long tasks** on the main thread during the action (count, total, worst) — >50 ms is what
 *     "stuck" feels like, and it is what starves the audio scheduler's lookahead
 *   - **long tasks during playback only**, as a baseline to compare against
 *
 * Usage:
 *   node scripts/measure_interaction_latency.mjs [--url <url>] [--json]
 *
 * Without `--url` it serves `dist/` on an ephemeral port, like the E2E matrix does.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const argValue = (flag, fallback = null) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const asJson = argv.includes("--json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function startStaticServer() {
  const dist = path.join(ROOT, "dist");
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    console.error("❌ dist/index.html not found — run `npm run build` first.");
    process.exit(1);
  }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let file = path.join(dist, decodeURIComponent(url.pathname));
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // The app is a single-page application: unknown paths fall back to the shell.
      file = path.join(dist, "index.html");
    }
    const body = fs.readFileSync(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function importPlaywright() {
  const mod = await import("playwright");
  return mod;
}

const fmt = (n, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : "n/a");

async function measure(page, label, action, settle) {
  await page.evaluate(() => {
    window.__probe = { tasks: [] };
  });
  const t0 = await page.evaluate(() => performance.now());
  await action();
  // `settle` waits for the *observable* result of the action (a state flip, a rendered change).
  // Fixed sleeps would be measured as latency, which is how the first version of this probe
  // reported 8 s for a toggle that in reality settles in a few milliseconds.
  await settle();
  const t1 = await page.evaluate(() => performance.now());
  const tasks = await page.evaluate(() => window.__probe?.tasks ?? []);
  const durations = tasks.map((t) => t.duration);
  const row = {
    label,
    /** click → the DOM reflecting the change (what the user waits for). */
    latencyMs: +(t1 - t0).toFixed(1),
    longTasks: durations.length,
    totalBlockedMs: +durations.reduce((s, d) => s + d, 0).toFixed(1),
    worstTaskMs: durations.length ? +Math.max(...durations).toFixed(1) : 0,
  };
  // Stream the row as soon as it exists, *before* any later step can throw: the sibling project's
  // WebKit notes record a probe that printed after its assertions and therefore left nothing at all
  // behind on the one run that mattered (§6.10). A measurement script that dies half-way must still
  // have produced the measurements it did take.
  if (!asJson) {
    console.log(
      `${row.label.padEnd(28)} ${String(row.latencyMs).padStart(10)}  ${String(row.longTasks).padStart(9)}  ${String(
        row.totalBlockedMs
      ).padStart(11)}  ${String(row.worstTaskMs).padStart(9)}`
    );
  }
  return row;
}

async function main() {
  const { chromium } = await importPlaywright();
  const explicitUrl = argValue("--url");
  let server = null;
  let baseUrl = explicitUrl;
  if (!explicitUrl) {
    const started = await startStaticServer();
    server = started.server;
    baseUrl = `http://127.0.0.1:${started.port}`;
  }

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Long-task observer, installed before the app boots.
  await page.addInitScript(() => {
    window.__probe = { tasks: [] };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__probe.tasks.push({ start: entry.startTime, duration: entry.duration });
        }
      }).observe({ entryTypes: ["longtask"] });
    } catch {
      /* engines without longtask: the latency column still works */
    }
  });

  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto(`${baseUrl}/?tab=studio`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid='toolbar-advanced-toggle']", { timeout: 30000 });
  await page.waitForTimeout(1500); // let the lazy chunks and the audio graph settle

  const results = [];
  if (!asJson) {
    console.log(`\ninteraction latency probe — ${baseUrl}\n`);
    console.log("action                       settle(ms)  longTasks  blocked(ms)  worst(ms)");
  }

  // 0. Baseline: transport running, hands off.
  await page.click("button:has-text('播放'), button:has-text('Play')", { force: true }).catch(() => {});
  await page.waitForTimeout(800);
  // Not an interaction: this is the main-thread cost of the running transport itself, measured
  // over the same 1.5 s window, so the other rows can be read against a baseline.
  results.push(await measure(page, "baseline (playing, no input)", async () => {}, () => page.waitForTimeout(1500)));

  // 1. GS-1 switch, off then on, through the settings panel (the surface the user used).
  await page.click("[data-testid='header-settings-open']", { force: true });
  await page.waitForSelector("[data-testid='audio-settings-gs1-toggle']", { timeout: 15000 });
  const gs1 = "[data-testid='audio-settings-gs1-toggle']";
  for (const label of ["GS-1 off", "GS-1 on"]) {
    const expected = await page.getAttribute(gs1, "aria-pressed");
    const target = expected === "true" ? "false" : "true";
    results.push(
      await measure(
        page,
        label,
        async () => {
          await page.click(gs1, { force: true });
        },
        () =>
          page.waitForFunction(
            ({ sel, want }) => document.querySelector(sel)?.getAttribute("aria-pressed") === want,
            { sel: gs1, want: target },
            { timeout: 10000 }
          )
      )
    );
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 2. Timbre switching while playing, through the inspector's picker.
  await page.click("[data-testid='track-inspector-open-0']", { force: true });
  await page.waitForSelector("[data-testid='track-inspector-instrument-search']", { timeout: 15000 });
  const search = "[data-testid='track-inspector-instrument-search']";
  const instruments = ["warm_pad", "saw_lead", "rhodes_ep", "reese_bass"];
  for (const instrument of instruments) {
    const option = `[data-testid='track-inspector-instrument-option-${instrument}']`;
    results.push(
      await measure(
        page,
        `timbre → ${instrument}`,
        async () => {
          await page.fill(search, instrument);
          await page.click(option, { force: true });
        },
        () =>
          page.waitForFunction(
            (sel) => document.querySelector(sel)?.getAttribute("aria-selected") === "true",
            option,
            { timeout: 10000 }
          )
      )
    );
  }

  // 3. Step toggle while playing (the other hot path that commits a whole pattern).
  {
    const cellSel = "[data-track-idx='1'][data-step-idx='4']";
    const before = await page.getAttribute(cellSel, "aria-selected");
    results.push(
      await measure(
        page,
        "toggle one step",
        async () => {
          await page.click(cellSel, { force: true });
        },
        () =>
          page.waitForFunction(
            ({ sel, want }) => document.querySelector(sel)?.getAttribute("aria-selected") !== want,
            { sel: cellSel, want: before },
            { timeout: 10000 }
          )
      )
    );
  }

  await browser.close();
  if (server) server.close();

  const payload = { url: baseUrl, pageErrors, results };
  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    if (pageErrors.length) console.log(`\npage errors: ${pageErrors.slice(0, 3).join(" | ")}`);
    console.log("\n(rows are printed as they are measured, so a failure still leaves the data above)");
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`❌ probe failed: ${err?.stack ?? err}`);
    process.exit(1);
  });
