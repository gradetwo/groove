/**
 * Playback smoothness measurement (item 7: "播放时候有没有导致卡顿的点或者声音与画面不同步").
 *
 *   node scripts/measure_playback_smoothness.mjs [--seconds 6] [--target portrait]
 *
 * Claims about "stutter" and "out of sync" need numbers, and this environment has no
 * profiler, so this collects the browser's own signals while the transport actually runs:
 *
 *   - frame interval distribution (p50 / p95 / worst) and long tasks (> 50 ms)
 *   - how many animation frames had to do playhead work
 *   - the real step rate against the rate the tempo implies (audio/visual drift)
 *   - `AudioContext` latency, i.e. how far the picture can run ahead of the sound
 *
 * Before/after comparison is the point: run it, change one thing, run it again.
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
const ONLY = argValue("--target", null);

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

const TARGETS = [
  ["desktop", 1440, 900, null],
  ["portrait", 390, 664, playwright.devices["iPhone 14"]],
  ["landscape", 844, 390, playwright.devices["iPhone 14"]],
];

const browser = await playwright.chromium.launch({
  // Audio must actually run, or the scheduler is a no-op and the numbers are meaningless.
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});

for (const [label, width, height, device] of ONLY ? TARGETS.filter((t) => t[0] === ONLY) : TARGETS) {
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
  await page.setViewportSize({ width, height });
  await page.goto(`http://127.0.0.1:${port}/?tab=studio`, { waitUntil: "domcontentloaded" });

  /**
   * ⭐ **The landing surface is the chooser, not the studio** (v2.35.0): `?tab=studio` draws
   * `new-project-panel-v2` and the arrangement mounts when a project is created. This probe waited for the v1
   * `track-header-0`, which no surface renders any more, so it answered "studio did not render" for all three
   * targets — the realtime axis had **no working instrument at all** (found 2026-10-07, while measuring the
   * Zimmer study). The steps below are the ones `test_matrix.js`, `measure_interaction_latency.mjs` and
   * `audit_screens.mjs` all take: gate, prompt, chooser, then the arrangement.
   */
  const FIRST_SCREEN =
    "[data-testid='audio-start-gate'], [data-testid='first-run-prompt'], [data-testid='new-project-panel-v2'], [data-testid='arrangement-view-v2']";
  await page.waitForSelector(FIRST_SCREEN, { state: "attached", timeout: 45000 }).catch(() => null);
  if (await page.$("[data-testid='audio-start-gate']")) {
    await page.click("[data-testid='audio-start-button']", { force: true }).catch(() => {});
    await page.waitForSelector("[data-testid='audio-start-gate']", { state: "detached", timeout: 20000 }).catch(() => null);
  }
  if (await page.$("[data-testid='first-run-prompt']")) {
    await page.click("[data-testid='first-run-prompt-dismiss']", { force: true }).catch(() => {});
    await page.waitForSelector("[data-testid='first-run-prompt']", { state: "detached", timeout: 20000 }).catch(() => null);
  }
  await page
    .waitForSelector("[data-testid='new-project-panel-v2'], [data-testid='arrangement-view-v2']", { state: "attached", timeout: 45000 })
    .catch(() => null);
  if (await page.$("[data-testid='new-project-panel-v2']")) {
    // ⭐ A DOM click, and Create only once the card says it is chosen: coordinate clicks land on the modal, and
    // both clicks in one tick create the previous render's template (both measured in `test_matrix.js`).
    await page.evaluate(() => document.querySelector("[data-testid='template-drums-bass']")?.click());
    await page
      .waitForFunction(() => document.querySelector("[data-testid='template-drums-bass']")?.getAttribute("aria-pressed") === "true", { timeout: 5000 })
      .catch(() => null);
    await page.waitForTimeout(150);
    await page.evaluate(() => document.querySelector("[data-testid='new-project-create']")?.click());
  }
  try {
    await page.waitForSelector("[data-testid='arrangement-view-v2']", { timeout: 30000 });
  } catch {
    console.log(`\n### ${label}: the arrangement did not render`);
    await context.close();
    continue;
  }

  // Start playback from whatever transport control this layout has.
  const playSelectors = [
    "[data-testid='arrangement-play']",
    "[data-testid='transport-play']",
    "[data-testid='play-button']",
    "[aria-label*='Play']",
    "[title*='Play']",
  ];
  let started = false;
  for (const sel of playSelectors) {
    const el = await page.$(sel);
    if (!el) continue;
    try {
      await el.click({ timeout: 3000 });
      started = true;
      break;
    } catch {
      /* try the next one */
    }
  }
  if (!started) {
    console.log(`\n### ${label}: no transport play control found`);
    await context.close();
    continue;
  }

  const sample = await page.evaluate(async (seconds) => {
    const frames = [];
    const longTasks = [];
    const steps = [];

    /**
     * Scroll activity in the step matrix.
     *
     * Auto-follow used to call `scrollTo({ behavior: "smooth" })` on every step, and a new smooth
     * request cancels the one in flight — so the scroller animated continuously. Counting scroll
     * events per second distinguishes that (~8 short animations) from discrete jumps (~8 events,
     * one per step). It is the most direct measurement of that particular fix.
     */
    let scrollEvents = 0;
    let scrollPx = 0;
    const scroller = document.querySelector(".custom-sequencer-scroll");
    let lastLeft = scroller ? scroller.scrollLeft : 0;
    if (scroller) {
      scroller.addEventListener(
        "scroll",
        () => {
          scrollEvents += 1;
          scrollPx += Math.abs(scroller.scrollLeft - lastLeft);
          lastLeft = scroller.scrollLeft;
        },
        { passive: true }
      );
    }

    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(Math.round(entry.duration));
      });
      obs.observe({ entryTypes: ["longtask"] });
    } catch {
      /* unsupported */
    }

    /**
     * ⭐ **The v2 playhead is a position, not a labelled cell.** It carries no `data-ruler-step-idx` (the v1
     * studio's cell did, and this read returned null ever after), so the step is read from the playhead's own
     * `left` against the zoom: `pixelsPerBar` is on screen beside the zoom buttons, and a bar is sixteen steps.
     * That is precisely "where the picture is", which is what the drift question is about.
     */
    const readStep = () => {
      const head = document.querySelector("[data-testid='arrangement-playhead']");
      const zoom = document.querySelector("[data-testid='arrangement-zoom-value']");
      if (!head || !zoom) return null;
      const perBar = Number(zoom.textContent);
      if (!Number.isFinite(perBar) || perBar <= 0) return null;
      const px = Number.parseFloat(head.style.left || "0");
      if (!Number.isFinite(px)) return null;
      return Math.round((px / perBar) * 16);
    };

    const t0 = performance.now();
    let last = t0;
    const frameAt = [];
    await new Promise((resolve) => {
      const tick = () => {
        const now = performance.now();
        const dt = now - last;
        frames.push(dt);
        frameAt.push({ t: Math.round(now - t0), dt: Math.round(dt * 10) / 10 });
        last = now;
        const s = readStep();
        if (s !== null) steps.push({ t: now - t0, step: s });
        if (now - t0 < seconds * 1000) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    const worstFrames = [...frameAt].sort((a, b) => b.dt - a.dt).slice(0, 5);

    // Audio context latency. The engine's own instance is not reachable from here, so this
    // creates a throwaway context: the platform's own latency is what the playhead correction
    // consumes, and any context on the same page reports the same value.
    let latency = null;
    try {
      const probe = new AudioContext();
      // A context starts suspended and reports its latency only once it is actually running.
      if (probe.state !== "running") await probe.resume().catch(() => {});
      latency = {
        baseLatencyMs: Math.round((probe.baseLatency ?? 0) * 1000 * 100) / 100,
        outputLatencyMs: Math.round((probe.outputLatency ?? 0) * 1000 * 100) / 100,
        sampleRate: probe.sampleRate,
        state: probe.state,
      };
      await probe.close();
    } catch {
      /* no Web Audio in this context */
    }

    frames.sort((a, b) => a - b);
    const at = (p) => frames.length ? Math.round(frames[Math.min(frames.length - 1, Math.floor(frames.length * p))] * 10) / 10 : null;

    // Step rate over the *whole* sampling window, not the span between the first and last step
    // seen: the old denominator started at the first playhead event, which is late by however
    // long the transport took to start and biased every reported rate upwards.
    let advances = 0;
    let missed = 0;
    for (let i = 1; i < steps.length; i += 1) {
      const d = steps[i].step - steps[i - 1].step;
      // A wrap goes backwards by a lot; a forward jump of more than one means the sampler
      // missed a step, which is itself worth reporting.
      if (d === 1 || d < -1) advances += 1;
      else if (d > 1) {
        advances += 1;
        missed += d - 1;
      }
    }

    return {
      frames: frames.length,
      frameP50: at(0.5),
      frameP95: at(0.95),
      frameWorst: frames.length ? Math.round(frames[frames.length - 1] * 10) / 10 : null,
      over32: frames.filter((f) => f > 32).length,
      over50: frames.filter((f) => f > 50).length,
      longTaskCount: longTasks.length,
      longTaskWorst: longTasks.length ? Math.max(...longTasks) : 0,
      longTaskTotal: longTasks.reduce((a, b) => a + b, 0),
      stepAdvances: advances,
      stepRateHz: Math.round((advances / seconds) * 100) / 100,
      missedSteps: missed,
      distinctSteps: new Set(steps.map((s) => s.step)).size,
      scrollEvents,
      scrollPx: Math.round(scrollPx),
      latency,
      worstFrames,
    };
  }, SECONDS);

  // The tempo the studio is running at, so the expected step rate can be computed.
  const bpm = await page.evaluate(() => {
    /**
     * ⭐ **The tempo by name, not "the first number input".** A selector list is resolved in document order, and
     * the v2 toolbar carries several number inputs before the tempo — the Euclidean pulse count among them — so
     * this read "bpm=3" and then computed the expected rate from it, reporting DRIFT on a playhead that was in
     * phase (7.83 steps/s against the 8 that 120 BPM implies).
     */
    const tempo = document.querySelector("[data-testid='arrangement-tempo']");
    const el = tempo ?? document.querySelector("[data-testid='tempo-readout'], [data-testid='tempo-value']");
    const m = el ? (el.textContent || el.value || "").match(/\d+(\.\d+)?/) : null;
    return m ? Number(m[0]) : null;
  });

  console.log(`\n### ${label} (${SECONDS}s of playback) bpm=${bpm ?? "?"}`);
  console.log(`  frames=${sample.frames}  p50=${sample.frameP50}ms  p95=${sample.frameP95}ms  worst=${sample.frameWorst}ms`);
  console.log(`  frames >32ms=${sample.over32}  >50ms=${sample.over50}  longtasks=${sample.longTaskCount} (worst ${sample.longTaskWorst}ms, total ${sample.longTaskTotal}ms)`);
  console.log(`  playhead: ${sample.stepAdvances} step advances over the window -> ${sample.stepRateHz} steps/s (${sample.distinctSteps} distinct steps seen, ${sample.missedSteps} missed by the sampler)`);
  console.log(`  scroll: ${sample.scrollEvents} events / ${sample.scrollPx}px over ${SECONDS}s (auto-follow)`);
  console.log(
    `  worst frames: ${sample.worstFrames.map((f) => `${f.dt}ms @ t=${f.t}ms`).join(", ")}`
  );
  if (sample.latency) {
    console.log(
      `  audio latency: base=${sample.latency.baseLatencyMs}ms output=${sample.latency.outputLatencyMs}ms @ ${sample.latency.sampleRate}Hz ` +
        `-> playhead lead = ${Math.round((sample.latency.baseLatencyMs + sample.latency.outputLatencyMs) * 100) / 100}ms (+ limiter lookahead)`
    );
  }
  if (bpm) {
    const expected = (bpm / 60) * 4;
    console.log(`  expected ~${Math.round(expected * 100) / 100} steps/s at ${bpm} BPM 4/4 -> ${
      sample.stepRateHz ? (Math.abs(sample.stepRateHz - expected) / expected < 0.15 ? "IN PHASE" : "DRIFT") : "no data"
    }`);
  }
  await context.close();
}

await browser.close();
server.close();
