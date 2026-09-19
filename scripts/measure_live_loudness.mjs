#!/usr/bin/env node
/**
 * Live-path loudness probe (goal item 6 acceptance check).
 *
 * The per-genre mix workstream measures each genre's default pattern through the app's
 * *offline* renderer. This script measures the *live* engine instead: it mirrors whatever
 * the app connects to `AudioContext.destination` into its own AnalyserNode and samples it
 * from a rAF loop, so the reading is post-limiter and includes the real voice scheduling,
 * panning and effects. Two independent measurement paths are much harder to fool than one.
 *
 * METRIC — read this before quoting a number from this script. It reports windowed
 * broadband **RMS**, which averages in the silence between hits. The per-genre loudness
 * workstream reports gated **ITU-R BS.1770-4 integrated loudness (LUFS)** instead
 * (`scripts/loudness.baseline.json`). The two metrics disagree systematically on sparse
 * material: ambient measures about -24.7 dBFS RMS but only about -21.7 LUFS, because the
 * BS.1770 gate discards the silence that dominates its RMS. LUFS is the standard proxy
 * for "these genres should sound equally loud", so it is the primary acceptance metric;
 * this probe is the independent cross-check on a different metric and a different signal
 * path (live engine vs offline render). A large RMS spread with a small LUFS spread is
 * expected and is not a failure.
 *
 * Measured baselines, all 159 genres, studio transport, master RMS in dBFS:
 *   v1.16.17 (before the curated timbres):  min -25.2  p10 -16.8  median -14.6  p90 -11.3  max -8.25
 *                                           spread 17.0 dB, p90-p10 5.5 dB
 *   after the curated timbres, still no mix/loudness work:
 *                                           min -24.7 (ambient)  p10 -16.8  median -14.2
 *                                           p90 -11.5  max -9.7 (breakcore)
 *                                           spread 15.0 dB, p90-p10 5.3 dB
 * The earlier 12-genre sample showed only 5.2 dB because it contained no extreme genre --
 * which is why the default sample is useful for a quick check but `--all` is the real run.
 *
 *
 * Usage:
 *   node scripts/measure_live_loudness.mjs                      # built-in 12-genre sample
 *   node scripts/measure_live_loudness.mjs --all                 # every genre (~7-15 min)
 *   # add --baseline=scripts/loudness_live_baseline.json to see per-genre deltas
 *   node scripts/measure_live_loudness.mjs --genres=a,b,c
 *   node scripts/measure_live_loudness.mjs --compare=a,b        # also A/B the compare view
 *   LIVE_BASE=https://... node scripts/measure_live_loudness.mjs  # against the deployed site
 *   --json=out.json        # write the raw measurements
 *   --baseline=file.json   # print per-genre deltas against a stored run
 *
 * Run-to-run variance: the aggregate spread (max-min) repeats to ~0.1 dB, but INDIVIDUAL
 * genre readings vary by up to ~0.9 dB, because the fixed 1.8s sampling window lands on
 * different bars of the loop and pattern density varies within a genre. Judge acceptance
 * on the spread, or sample the same genre over several windows -- not on single deltas.
 */
import http from "http";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const argVal = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const DEFAULT_SAMPLE = [
  // two per category, chosen to span density and instrumentation
  "chicago-house", "detroit-techno",           // Electronic
  "boom-bap", "trap-rap",                      // Hip Hop
  "delta-blues", "bebop",                      // Jazz/Blues
  "salsa", "afrobeat",                         // Latin/World
  "funk", "soul",                              // Pop/R&B
  "hard-rock", "punk-rock",                    // Rock/Metal
];

/**
 * Every genre id in the library, read from the canonical light index. `--all` uses this
 * instead of the 12-genre sample so acceptance is judged on the whole library rather
 * than a hand-picked subset (a subset can hide an outlier genre entirely).
 */
function allGenreIds() {
  const indexPath = path.join(process.cwd(), "src/data/index/genresIndex.ts");
  const src = fs.readFileSync(indexPath, "utf8");
  return [...src.matchAll(/"id":\s*"([^"]+)"/g)].map((m) => m[1]);
}

const useAll = args.includes("--all");
const genres = (
  argVal("genres") || (useAll ? allGenreIds().join(",") : DEFAULT_SAMPLE.join(","))
)
  .split(",")
  .filter(Boolean);
const compareIds = argVal("compare") ? argVal("compare").split(",") : null;

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

function startServer() {
  return new Promise((resolve) => {
    const distDir = path.join(process.cwd(), "dist");
    const server = http.createServer((req, res) => {
      let rel = req.url.split("?")[0];
      if (rel === "/") rel = "/index.html";
      let file = path.join(distDir, rel);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(distDir, "index.html");
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const beforePathLabel = (p) => `${path.basename(p)}`;

const liveBase = process.env.LIVE_BASE || null;
let server = null;
let base = liveBase;
if (!base) {
  const started = await startServer();
  server = started.server;
  base = `http://127.0.0.1:${started.port}`;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

// Tap the master output: mirror every connection into ctx.destination onto our own
// analyser, then sample it from a rAF loop. Created before any app code runs.
await page.addInitScript(() => {
  const state = { sampling: false, sum: 0, n: 0, peak: 0, connections: 0 };
  window.__loud = state;
  const probeByCtx = new WeakMap();
  const probes = [];
  const origConnect = AudioNode.prototype.connect;
  const probeFor = (ctx) => {
    let p = probeByCtx.get(ctx);
    if (!p) {
      p = ctx.createAnalyser();
      p.fftSize = 2048;
      probeByCtx.set(ctx, p);
      probes.push({ p, buf: new Float32Array(p.fftSize) });
    }
    return p;
  };
  AudioNode.prototype.connect = function (dest, ...rest) {
    const out = origConnect.call(this, dest, ...rest);
    try {
      const ctx = this.context;
      if (ctx && dest === ctx.destination) {
        origConnect.call(this, probeFor(ctx));
        state.connections += 1;
      }
    } catch {
      /* probing must never break the app */
    }
    return out;
  };
  const tick = () => {
    if (state.sampling) {
      for (const { p, buf } of probes) {
        p.getFloatTimeDomainData(buf);
        for (let i = 0; i < buf.length; i++) {
          const v = buf[i];
          state.sum += v * v;
          state.n += 1;
          const a = v < 0 ? -v : v;
          if (a > state.peak) state.peak = a;
        }
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const reset = () =>
  page.evaluate(() => {
    window.__loud.sampling = false;
    window.__loud.sum = 0;
    window.__loud.n = 0;
    window.__loud.peak = 0;
  });

const readLevel = () =>
  page.evaluate(() => {
    window.__loud.sampling = false;
    const { sum, n, peak, connections } = window.__loud;
    const rms = n ? Math.sqrt(sum / n) : 0;
    const toDb = (x) => (x > 0 ? 20 * Math.log10(x) : -120);
    return { rmsDb: toDb(rms), peakDb: toDb(peak), samples: n, connections };
  });

/** Load a genre into the studio, play it, sample the master output, stop. */
async function measureStudio(genreId) {
  await page.goto(`${base}/studio?genre=${encodeURIComponent(genreId)}`, { waitUntil: "domcontentloaded" });
  const play = page.locator('button[aria-label="Play / Pause"]');
  await play.waitFor({ state: "visible", timeout: 30000 });
  await reset();
  await play.click();
  await page.waitForTimeout(900); // context resume + scheduler latency + first bars
  await page.evaluate(() => {
    window.__loud.sampling = true;
  });
  await page.waitForTimeout(1800);
  const level = await readLevel();
  await play.click().catch(() => {});
  await page.waitForTimeout(150);
  return level;
}

/** Audition one side of the compare view and measure it. */
async function measureCompareSide(a, b, side) {
  await page.goto(`${base}/compare?ids=${encodeURIComponent(a)},${encodeURIComponent(b)}`, { waitUntil: "domcontentloaded" });
  // The compare view gives every genre two audition buttons (drums-only and full
  // arrangement). Matching on "试听" alone picks up *both modes of genre A*, which
  // silently measured the same genre twice. Match the full-arrangement title, then
  // index by side: A = first genre's button, B = second genre's button.
  const FULL_TITLE = 'button[title*="完整配器"], button[title*="full arrangement"]';
  const buttons = page.locator(FULL_TITLE);
  await buttons.first().waitFor({ state: "visible", timeout: 30000 });
  const count = await buttons.count();
  if (count < 2) throw new Error(`compare view exposed ${count} full-arrangement audition button(s), expected 2`);
  const idx = side === "a" ? 0 : 1;
  await reset();
  await buttons.nth(idx).click();
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    window.__loud.sampling = true;
  });
  await page.waitForTimeout(1800);
  const level = await readLevel();
  return { ...level, controlCount: count };
}

console.log(`base: ${base}`);
console.log(`genres: ${genres.join(", ")}\n`);

const rows = [];
for (const id of genres) {
  const level = await measureStudio(id);
  rows.push({ id, ...level });
  console.log(
    `${id.padEnd(20)} rms=${level.rmsDb.toFixed(1).padStart(7)} dBFS  peak=${level.peakDb.toFixed(1).padStart(7)}  taps=${level.connections}`
  );
}

const finite = rows.filter((r) => Number.isFinite(r.rmsDb) && r.rmsDb > -120);
const values = finite.map((r) => r.rmsDb).sort((x, y) => x - y);
const spread = values.length ? values[values.length - 1] - values[0] : 0;
const pct = (p) => (values.length ? values[Math.min(values.length - 1, Math.floor((values.length - 1) * p))] : 0);

console.log(`\n--- studio, ${finite.length}/${rows.length} genres produced audio ---`);
console.log(`rms min=${pct(0).toFixed(1)}  p10=${pct(0.1).toFixed(1)}  median=${pct(0.5).toFixed(1)}  p90=${pct(0.9).toFixed(1)}  max=${pct(1).toFixed(1)} dBFS`);
console.log(`max−min spread: ${spread.toFixed(1)} dB   p90−p10 spread: ${(pct(0.9) - pct(0.1)).toFixed(1)} dB`);

let compareResult = null;

if (compareIds && compareIds.length >= 2) {
  const a = await measureCompareSide(compareIds[0], compareIds[1], "a");
  const b = await measureCompareSide(compareIds[0], compareIds[1], "b");
  console.log(`\n--- compare view A/B ---`);
  console.log(`A(${compareIds[0]}) rms=${a.rmsDb.toFixed(1)} dBFS  B(${compareIds[1]}) rms=${b.rmsDb.toFixed(1)} dBFS  Δ=${Math.abs(a.rmsDb - b.rmsDb).toFixed(1)} dB  (controls found: ${a.controlCount})`);
  compareResult = {
    ids: [compareIds[0], compareIds[1]],
    a: Number(a.rmsDb.toFixed(2)),
    b: Number(b.rmsDb.toFixed(2)),
    deltaDb: Number(Math.abs(a.rmsDb - b.rmsDb).toFixed(2)),
  };
}

const report = {
  base,
  metric: "master output RMS over 1.8s of playback, dBFS, sampled post-limiter",
  genres: rows.map((r) => ({ id: r.id, rmsDb: Number(r.rmsDb.toFixed(2)), peakDb: Number(r.peakDb.toFixed(2)) })),
  spread: {
    maxMinusMin: Number(spread.toFixed(2)),
    p90MinusP10: Number((pct(0.9) - pct(0.1)).toFixed(2)),
  },
  compare: compareResult,
};

const jsonOut = argVal("json");
if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2) + "\n");
  console.log(`\nwrote ${jsonOut}`);
}

const baselinePath = argVal("baseline");
if (baselinePath && fs.existsSync(baselinePath)) {
  const before = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const beforeById = new Map((before.genres || []).map((g) => [g.id, g.rmsDb]));
  console.log(`\n--- delta vs baseline (${beforePathLabel(baselinePath)}) ---`);
  let worst = 0;
  for (const r of report.genres) {
    const prev = beforeById.get(r.id);
    if (prev === undefined) continue;
    const delta = r.rmsDb - prev;
    if (Math.abs(delta) > Math.abs(worst)) worst = delta;
    console.log(`  ${r.id.padEnd(20)} ${prev.toFixed(1).padStart(7)} -> ${r.rmsDb.toFixed(1).padStart(7)}  Δ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} dB`);
  }
  // Spreads are only comparable when the same genre set was measured: a 2-genre
  // subset has a smaller (and differently distributed) spread by construction.
  const sameSet =
    (before.genres || []).length === report.genres.length &&
    report.genres.every((g) => beforeById.has(g.id));
  const bs = before.spread || {};
  if (sameSet) {
    console.log(
      `  spread max−min ${bs.maxMinusMin?.toFixed?.(1) ?? "?"} -> ${report.spread.maxMinusMin.toFixed(1)} dB` +
        `   p90−p10 ${bs.p90MinusP10?.toFixed?.(1) ?? "?"} -> ${report.spread.p90MinusP10.toFixed(1)} dB`
    );
  } else {
    console.log(
      `  spread NOT compared: this run measured ${report.genres.length} genre(s) vs ` +
        `${(before.genres || []).length} in the baseline — re-run the full sample for a like-for-like spread.`
    );
  }
  if (before.compare && report.compare) {
    console.log(`  compare Δ ${before.compare.deltaDb.toFixed(1)} -> ${report.compare.deltaDb.toFixed(1)} dB`);
  }
  console.log(`  largest single-genre move: ${worst.toFixed(1)} dB`);
}

console.log(`\npage errors: ${pageErrors.length}${pageErrors.length ? " — " + pageErrors.slice(0, 2).join(" | ") : ""}`);

await browser.close();
if (server) server.close();
