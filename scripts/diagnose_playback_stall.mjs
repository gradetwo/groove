/**
 * What is actually running during the playback stalls?
 *
 *   node scripts/diagnose_playback_stall.mjs [--target desktop] [--seconds 6]
 *
 * `measure_playback_smoothness.mjs` proves stalls exist (140–370 ms frames on a desktop
 * Chromium) but not what causes them. This records a DevTools trace and prints the events that
 * occupy the longest runnable slices, so the cause is read off the trace rather than inferred
 * from the layout.
 *
 * Note on this machine: `uptime` shows the load average climbing under repeated browser runs
 * while `ps` shows no leftover Chromium, and the kworkers are `iou_exit` / `btrfs-endio` — the
 * box is I/O bound, so a share of the stalls can be the machine rather than the code. This
 * script is how to tell those apart: an audio/React cause appears as a named, repeating slice
 * inside the trace, a machine stall appears as an unexplained gap.
 */
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwright = require("playwright");
const ROOT = process.cwd();

const argv = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const SECONDS = Number(argValue("--seconds", "6"));
const TARGET = argValue("--target", "desktop");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

const server = http.createServer((req, res) => {
  const rel = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
  const file = path.join(ROOT, "dist", rel);
  if (!file.startsWith(path.join(ROOT, "dist")) || !fs.existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const TARGETS = {
  desktop: [1440, 900, null],
  portrait: [390, 664, playwright.devices["iPhone 14"]],
  landscape: [844, 390, playwright.devices["iPhone 14"]],
};
const [width, height, device] = TARGETS[TARGET];

const browser = await playwright.chromium.launch({
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({ ...(device ?? {}) });
await context.addInitScript(() => {
  try {
    localStorage.setItem("groove_onboarding_completed", "true");
localStorage.setItem("groove_audio_started", "1");
  } catch {
    /* disabled */
  }
});
const page = await context.newPage();

/**
 * Count and time every storage write, and attribute it to a call site.
 *
 * `innerSerialize` / `serialize` / `setItem` were the heaviest non-idle entries in the CPU
 * profile, so the question is which code writes during playback and how often. Wrapping is
 * done before any app script runs, so nothing is missed.
 */
await page.addInitScript(() => {
  window.__storageWrites = [];
  const proto = Object.getPrototypeOf(window.localStorage);
  const original = proto.setItem;
  proto.setItem = function patchedSetItem(key, value) {
    const start = performance.now();
    const result = original.call(this, key, value);
    const stack = (new Error().stack || "").split("\n").slice(1, 4).join(" | ");
    window.__storageWrites.push({
      key: String(key),
      bytes: String(value).length,
      ms: Math.round((performance.now() - start) * 100) / 100,
      stack: stack.slice(0, 200),
    });
    return result;
  };
});

await page.setViewportSize({ width, height });
await page.goto(`http://127.0.0.1:${port}/?tab=studio`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-testid='track-header-0']", { timeout: 30000 });

// Everything written while the studio loads is setup, not playback. Clear the log so the
// sample below is attributable to the transport alone.
await page.evaluate(() => {
  window.__storageWrites = [];
});

for (const sel of [
  "[data-testid='mobile-transport-play']",
  "[data-testid='transport-play']",
  "[data-testid='play-button']",
]) {
  const el = await page.$(sel);
  if (!el) continue;
  try {
    await el.click({ timeout: 3000 });
    break;
  } catch {
    /* next */
  }
}

/**
 * CPU profile + DevTools trace.
 *
 * The trace names the slice (`FunctionCall H`, 175.8 ms) but a minified name identifies
 * nothing. The V8 profiler gives the same slice a function name *and a source URL*, and
 * `long-animation-frame` reports the frames that were actually slow with their script
 * attribution — together those say which loop to look at.
 */
const cdp = await context.newCDPSession(page);
const traceChunks = [];
cdp.on("Tracing.dataCollected", ({ value }) => {
  if (Array.isArray(value)) traceChunks.push(...value);
});
const traceDone = new Promise((resolve) => cdp.on("Tracing.tracingComplete", resolve));

await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
await cdp.send("Profiler.start");
await cdp.send("Tracing.start", {
  categories: [
    "devtools.timeline",
    "disabled-by-default-devtools.timeline",
    "disabled-by-default-v8.cpu_profiler",
    "blink.user_timing",
  ].join(","),
  transferMode: "ReportEvents",
});

// Long animation frames: the browser's own answer to "which script made this frame slow".
const longFrames = await page.evaluate(async (seconds) => {
  const found = [];
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        found.push({
          duration: Math.round(entry.duration * 10) / 10,
          blockingDuration: Math.round(entry.blockingDuration * 10) / 10,
          scripts: (entry.scripts ?? []).slice(0, 4).map((s) => ({
            source: String(s.sourceURL || "").split("/").pop() || "inline",
            fn: s.sourceFunctionName || "",
            duration: Math.round(s.duration * 10) / 10,
          })),
        });
      }
    });
    obs.observe({ type: "long-animation-frame", buffered: true });
  } catch {
    /* unsupported in this engine */
  }
  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      if (performance.now() - t0 < seconds * 1000) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  return found;
}, SECONDS);

await cdp.send("Tracing.end");
await traceDone;
const { profile } = await cdp.send("Profiler.stop");

const storageWrites = await page.evaluate(() => {
  const writes = window.__storageWrites ?? [];
  const byKey = new Map();
  for (const w of writes) {
    const cur = byKey.get(w.key) ?? { count: 0, bytes: 0, ms: 0, stack: w.stack };
    cur.count += 1;
    cur.bytes += w.bytes;
    cur.ms += w.ms;
    byKey.set(w.key, cur);
  }
  return {
    total: writes.length,
    items: [...byKey.entries()].map(([key, v]) => ({ key, ...v })),
  };
});

await context.close();
await browser.close();
server.close();

console.log(`\n### storage writes during the ${SECONDS}s playback window: ${storageWrites.total}`);
for (const w of storageWrites.items.sort((a, b) => b.count - a.count)) {
  console.log(
    `  ${String(w.count).padStart(4)}x  ${(w.bytes / 1024).toFixed(1).padStart(7)} KB  ${w.ms.toFixed(1).padStart(7)}ms  ${w.key}`
  );
  console.log(`         ${w.stack.replace(/\s+/g, " ").slice(0, 150)}`);
}

// ------------------------------------------------------------------ read the profile back
/** Self time per (function, url) node, in milliseconds. */
const byNode = new Map();
const nodesById = new Map(profile.nodes.map((n) => [n.id, n]));
const hitCount = new Map();
for (const id of profile.samples ?? []) hitCount.set(id, (hitCount.get(id) ?? 0) + 1);
const intervalMs =
  (profile.endTime - profile.startTime) / 1000 / Math.max(1, profile.samples?.length ?? 1);
for (const [id, hits] of hitCount) {
  const node = nodesById.get(id);
  if (!node) continue;
  const url = String(node.callFrame.url || "").split("/").pop() || "(anonymous)";
  const key = `${node.callFrame.functionName || "(anonymous)"} @ ${url}:${node.callFrame.lineNumber + 1}`;
  byNode.set(key, (byNode.get(key) ?? 0) + hits * intervalMs);
}

console.log(`\n### CPU profile: ${TARGET}, ${SECONDS}s of playback`);
console.log(
  `  samples=${profile.samples?.length ?? 0}  window=${Math.round((profile.endTime - profile.startTime) / 1000)}ms  ~${intervalMs.toFixed(2)}ms/sample`
);
console.log("\n-- heaviest functions by self time --");
for (const [key, ms] of [...byNode.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)) {
  console.log(`  ${ms.toFixed(1).padStart(8)}ms  ${key.slice(0, 110)}`);
}

console.log(`\n-- long animation frames (>50ms), ${longFrames.length} found --`);
for (const f of [...longFrames].sort((a, b) => b.duration - a.duration).slice(0, 8)) {
  console.log(`  ${f.duration}ms (blocking ${f.blockingDuration}ms)`);
  for (const s of f.scripts) {
    console.log(`      ${String(s.duration).padStart(7)}ms  ${s.fn || "(anonymous)"} @ ${s.source}`);
  }
}

// ------------------------------------------------------------------ read the trace back
const events = traceChunks;

/** Longest events on the main renderer thread, which is where jank lives. */
const RUNNABLE = new Set([
  "RunTask",
  "FunctionCall",
  "EvaluateScript",
  "TimerFire",
  "FireAnimationFrame",
  "EventDispatch",
  "UpdateLayoutTree",
  "Layout",
  "Paint",
  "ParseHTML",
  "v8.run",
  "v8.compile",
  "MajorGC",
  "MinorGC",
  "Commit",
  "RasterTask",
]);

const pid = events.find((e) => e.name === "RunTask" && e.ph === "X")?.pid;
const slices = events
  .filter((e) => e.ph === "X" && e.dur && e.pid === pid && RUNNABLE.has(e.name))
  .sort((a, b) => b.dur - a.dur)
  .slice(0, 25);

/** Aggregate by name so a repeated cause is visible as a total, not a single sample. */
const totals = new Map();
for (const e of events) {
  if (e.ph !== "X" || !e.dur || e.pid !== pid || !RUNNABLE.has(e.name)) continue;
  const cur = totals.get(e.name) ?? { count: 0, totalMs: 0, worstMs: 0 };
  cur.count += 1;
  cur.totalMs += e.dur / 1000;
  cur.worstMs = Math.max(cur.worstMs, e.dur / 1000);
  totals.set(e.name, cur);
}

console.log(`\n### trace: ${TARGET}, ${SECONDS}s of playback, renderer pid ${pid}`);
console.log("\n-- aggregate by event name (sorted by total time) --");
for (const [name, v] of [...totals.entries()].sort((a, b) => b[1].totalMs - a[1].totalMs)) {
  console.log(
    `  ${name.padEnd(20)} count=${String(v.count).padStart(5)}  total=${v.totalMs.toFixed(1).padStart(8)}ms  worst=${v.worstMs.toFixed(1).padStart(7)}ms`
  );
}

console.log("\n-- 25 longest runnable slices --");
for (const e of slices) {
  const args = e.args ?? {};
  const detail =
    args.data?.functionName ??
    args.data?.url ??
    args.beginData?.frame ??
    Object.keys(args).slice(0, 2).map((k) => `${k}=${String(args[k]).slice(0, 40)}`).join(" ");
  console.log(`  ${(e.dur / 1000).toFixed(1).padStart(7)}ms  ${e.name.padEnd(20)} ${String(detail).slice(0, 90)}`);
}
console.log(`\ntrace events collected: ${events.length}`);
