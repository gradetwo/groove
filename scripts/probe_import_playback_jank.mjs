/**
 * **Does playback stutter after a MIDI import? — the probe, not a gate.**
 *
 *   node scripts/probe_import_playback_jank.mjs [--file=<path.mid>] [--sec=15] [--json]
 *
 * ## Why a probe and not a criterion
 *
 * The reading is a **browser frame rate on this machine**: it moves with how busy the box is (measured here:
 * the same blank page is 30.25 fps idle under other work and 50.93 fps when the box is quiet, with the main thread
 * 92 % idle in both), so it can never be a CI gate — a criterion that fails on a loaded runner is a criterion
 * everybody learns to ignore. What *is* a gate is the count of parses behind the worst of these numbers; that is
 * `src/test/sfzProgramParsedOnce.test.ts`, which is cheap and deterministic. This file is how the number that
 * motivated it is read again, on whatever corpus is at hand.
 *
 * ## What it does
 *
 * `/new` → `template-blank` → Create → import the MIDI → answer the mapping dialog → press play, and then measure the
 * playback window from inside the page: rAF intervals (p50/p95/max), long tasks, the transport's own
 * `droppedSteps` delta and the CPU profile. Two arms, because the owner's recipe is a comparison:
 *
 *   · **synth** — the dialog's *Skip* ("place with no names"), so the imported parts keep their built-in synthesiser;
 *   · **sampler** — every part named to the first recorded instrument the dialog offers, so the lanes are sounded
 *     from their own bytes.
 *
 * ⚠️ The probe **refuses to report a dropped-step count it could not read**. `/new` installs the `?probe=1` seam
 * (`src/platform/probeHooks.ts`); without it `getSchedulerHealth()` is unreachable, and the difference between
 * "the scheduler dropped nothing" and "nothing was readable" is the whole value of the number — an earlier reading of
 * this route reported `droppedSteps: 0` from two `undefined`s.
 *
 * ⚠️ The corpus is read **in place**: `setInputFiles` is handed the path and the browser reads it. Nothing is copied
 * into the repository, and the owner's files are never modified.
 *
 * ## Reading the output
 *
 * ```
 *   arm      kinds                    fps   p50   p95    max  LT n/ms/max   dropped  load
 *   synth    synth,synth,synth       31.8  16.7  83.3    400   6/694/149        0   11.8
 *   sampler  synth,sampler,sampler   12.5  16.7  66.7   7683  12/15112/7676    41   12.0
 * ```
 *
 * The blank template is the control when the difference is in doubt (`--file=none`).
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const argv = process.argv.slice(2);
const arg = (flag, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${flag}=`));
  if (hit) return hit.slice(flag.length + 3);
  return argv.includes(`--${flag}`) ? true : fallback;
};

const FILE = String(arg("file", "/home/crow/music/midi-corpus/midi/敢当.mid"));
const SEC = Number(arg("sec", 15));
const TEMPLATE = String(arg("template", "template-blank"));
const AS_JSON = Boolean(arg("json", false));
const ARMS = String(arg("arms", "synth,sampler")).split(",").filter(Boolean);

if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
  console.error("❌ dist/index.html is missing — build first (`npm run build`)");
  process.exit(1);
}
if (FILE !== "none" && !fs.existsSync(FILE)) {
  console.error(`❌ no MIDI at ${FILE} — pass --file=<path.mid>, or --file=none for the blank-template control`);
  process.exit(1);
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const rel = req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0].replace(/^\//, "");
  const file = path.join(ROOT, "dist", rel);
  /**
   * `dist/` is a static copy of a **single-page** app: `/new` is a route the client reads, not a file. A 404 for it
   * loaded no application at all, and the symptom was a 90-second wait for a template card — so anything that is not a
   * file under `dist/` is answered with `index.html` and left to the router.
   */
  if (!file.startsWith(path.join(ROOT, "dist")) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(file) !== "" && fs.existsSync(file + ".html") === false) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    fs.createReadStream(path.join(ROOT, "dist", "index.html")).pipe(res);
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;

const stats = (values) => {
  if (values.length === 0) return { n: 0 };
  const sorted = values.slice().sort((a, b) => a - b);
  const at = (q) => +sorted[Math.min(sorted.length - 1, Math.ceil((q / 100) * sorted.length) - 1)].toFixed(1);
  return { n: sorted.length, p50: at(50), p95: at(95), max: +Math.max(...sorted).toFixed(1) };
};

/** Installed before any document script: the frame loop and the transport's own health readout, both in the page. */
function INIT() {
  const P = (window.__P = { longtasks: [] });
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) P.longtasks.push({ start: +entry.startTime.toFixed(1), dur: +entry.duration.toFixed(1) });
    }).observe({ type: "longtask", buffered: true });
  } catch {
    /* no long-task observer (old engine): the other readings still stand */
  }
  window.__health = () => {
    const engine = window.__grooveProbe?.engine;
    const scheduler = engine?.getSchedulerHealth?.() ?? null;
    return {
      ...(scheduler ?? {}),
      isPlaying: engine?.getIsPlaying?.() ?? null,
      state: engine?.audioContext?.state ?? null,
      seam: Boolean(window.__grooveProbe),
    };
  };
  /**
   * One rAF loop for the whole window: frame intervals, and a health sample four times a second. The transport is
   * started from outside ~300 ms in, so the first frames are the page before the press.
   */
  window.__window = (seconds) =>
    new Promise((resolve) => {
      const intervals = [];
      const health = [];
      let firstSoundMs = null;
      let last = performance.now();
      const t0 = last;
      let lastSample = -1e9;
      const frame = (t) => {
        intervals.push(+(t - last).toFixed(2));
        last = t;
        if (t - lastSample > 400) {
          lastSample = t;
          const h = window.__health();
          health.push({ t: +(t - t0).toFixed(1), ...h });
          if (firstSoundMs === null && ((h.queuedSteps ?? 0) > 0 || h.isPlaying === true)) firstSoundMs = +(t - t0).toFixed(1);
        }
        if ((t - t0) / 1000 < seconds) requestAnimationFrame(frame);
        else resolve({ intervals: intervals.slice(1), health, firstSoundMs });
      };
      requestAnimationFrame(frame);
    });
}

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-extensions", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling"],
});

const results = [];

for (const arm of ARMS) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error.message).slice(0, 200)));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("groove_onboarding_completed", "true");
      localStorage.setItem("groove_audio_started", "1");
    } catch {
      /* storage disabled */
    }
  });
  await page.addInitScript(INIT);

  const record = { arm, file: FILE === "none" ? null : path.basename(FILE), load1: +os.loadavg()[0].toFixed(2) };
  try {
    await page.goto(`${BASE}/new?probe=1`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => !document.getElementById("bs"), null, { timeout: 90000 });
    await page.waitForSelector('[data-testid="new-project-panel-v2"]', { timeout: 90000 });
    await page.waitForTimeout(2000);
    await page.click(`[data-testid="${TEMPLATE}"]`, { force: true });
    await page.waitForTimeout(1200);
    await page.click('[data-testid="new-project-create"]', { force: true });
    // `attached`, not `visible`: the file input is deliberately `hidden` and `setInputFiles` reaches it either way.
    await page.waitForSelector('[data-testid="arrangement-import-input"]', { state: "attached", timeout: 90000 });
    await page.waitForTimeout(2000);

    if (FILE !== "none") {
      const picked = Date.now();
      await page.setInputFiles('[data-testid="arrangement-import-input"]', FILE);
      await page.waitForSelector('[data-testid="import-instrument-mapping"]', { timeout: 180000 });
      record.ms_pick_to_dialog = Date.now() - picked;
      const parts = await page.$$('[data-testid^="import-mapping-select-"]');
      if (arm === "sampler") {
        const first = await page.$eval('[data-testid^="import-mapping-select-"]', (select) =>
          [...select.options].map((option) => option.value).find((value) => value !== "") ?? null
        );
        if (first === null) throw new Error("the mapping dialog offered no recorded instrument to choose");
        for (const select of parts) await select.selectOption(first);
        await page.click('[data-testid="import-mapping-confirm"]', { force: true });
      } else {
        // Confirm is `disabled` while nothing is named, so the synth arm is the dialog's own Skip.
        await page.click('[data-testid="import-mapping-skip"]', { force: true });
      }
    }

    await page.waitForFunction(
      () => {
        const grid = document.querySelector('[data-testid="arrangement-grid"]');
        return grid ? grid.querySelectorAll("*").length > 80 : false;
      },
      null,
      { timeout: 60000 }
    );
    record.kinds = await page.$$eval('[data-testid^="track-kind-"]', (nodes) => nodes.map((node) => node.value));

    const idle = await page.evaluate(() => window.__window(3));
    record.idleFps = +((idle.intervals.length - 1) / (idle.intervals.reduce((a, b) => a + b, 0) / 1000)).toFixed(2);

    await page.evaluate(() => {
      window.__P.longtasks.length = 0;
    });
    const windowPromise = page.evaluate((seconds) => window.__window(seconds), SEC);
    await page.waitForTimeout(300);
    await page.click('[data-testid="arrangement-play"]', { force: true });
    const measured = await windowPromise;
    const after = await page.evaluate(() => ({ longtasks: window.__P.longtasks, health: window.__health() }));

    record.ms_play_to_engine = measured.firstSoundMs;
    record.raf = {
      ...stats(measured.intervals),
      over50: measured.intervals.filter((value) => value > 50).length,
      overBudgetPct: +((100 * measured.intervals.filter((value) => value > 16.7).length) / Math.max(1, measured.intervals.length)).toFixed(1),
      fps: +((measured.intervals.length - 1) / (measured.intervals.reduce((a, b) => a + b, 0) / 1000)).toFixed(2),
    };
    record.longtasks = {
      n: after.longtasks.length,
      totalMs: +after.longtasks.reduce((total, entry) => total + entry.dur, 0).toFixed(1),
      worstMs: after.longtasks.length ? +Math.max(...after.longtasks.map((entry) => entry.dur)).toFixed(1) : 0,
      over200: after.longtasks.filter((entry) => entry.dur > 200).length,
    };
    /**
     * Read from the engine's own counter, and **only** when the seam answered. Two `undefined`s produce a
     * convincing-looking `0`, which is exactly the reading that was wrong once already.
     */
    const readable = measured.health.filter((sample) => sample.seam && sample.droppedSteps !== undefined);
    record.droppedSteps =
      readable.length > 1 ? (readable[readable.length - 1].droppedSteps ?? 0) - (readable[0].droppedSteps ?? 0) : null;
    record.droppedStepsNote = record.droppedSteps === null ? "unreadable: the ?probe=1 seam did not install on this route" : null;
    record.seam = Boolean(after.health.seam);
    record.pageErrors = errors;
  } catch (error) {
    record.error = String(error.message).slice(0, 300);
  }
  results.push(record);
  await context.close();
}

await browser.close();
server.close();

for (const record of results) {
  console.log(
    `${String(record.arm).padEnd(8)} ${String(record.error ? "—" : (record.kinds ?? []).join(",")).padEnd(24)} ` +
      `fps=${String(record.raf?.fps ?? "-").padStart(5)} p50=${String(record.raf?.p50 ?? "-").padStart(6)} ` +
      `p95=${String(record.raf?.p95 ?? "-").padStart(6)} max=${String(record.raf?.max ?? "-").padStart(8)} ` +
      `over50=${String(record.raf?.over50 ?? "-").padStart(3)} fpsIdle=${String(record.idleFps ?? "-").padStart(5)} ` +
      `LT=${String(record.longtasks?.n ?? "-")}/${String(record.longtasks?.totalMs ?? "-")}/${String(record.longtasks?.worstMs ?? "-")}ms ` +
      `dropped=${record.droppedSteps === null ? "unreadable" : String(record.droppedSteps).padStart(3)} ` +
      `load=${record.load1}${record.error ? " ERR=" + record.error : ""}`
  );
  if (record.droppedStepsNote) console.log(`         ⚠️ ${record.droppedStepsNote}`);
}

if (AS_JSON) console.log(JSON.stringify(results, null, 1));

const worst = Math.max(...results.map((record) => record.longtasks?.worstMs ?? 0));
console.log(
  `\n${worst > 1000 ? "❌" : "✓"} worst long task ${worst} ms — one browser, one arm at a time; the corpus is read in place and nothing is copied.` +
    `\n   This is a probe, not a gate: the frame rate moves with the machine's load, so it is not in the CI job.` +
    `\n   The deterministic criterion behind it is src/test/sfzProgramParsedOnce.test.ts.`
);
