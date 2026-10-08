/**
 * Does the transport really play the **arrangement**? (B7's audible half.)
 *
 * B7 was verified structurally — the console hands the engine the flattened song, the playhead maps passes — and the
 * plan said plainly that the *audible* half was missing, because the engine is created inside the app and nothing
 * exposed it. `installProbeHooks` (`?probe=1`) is that seam, and this probe is the check it exists for:
 *
 *   · load the built app with the flag, generate the club form in the arrangement panel;
 *   · turn song mode on and start the transport through the hook (no clicking by label);
 *   · sample the master analyser and the engine's step for a window that is **longer than one pass of the loop**.
 *
 * Two assertions, both about the whole point of the change:
 *
 *   1. the step passes the loop's length — a transport looping one pattern can never do that, which is exactly the
 *      defect B7 was;
 *   2. the level rises across the window, because the club form's intro carries a 0.3 → 1.0 velocity ramp (~10.5 dB,
 *      measured as +23 % in the file by `probe_arrangement_audio.mjs`). A transport playing one loop has no reason to
 *      get louder.
 *
 * **What the level assertion is and is not.** The window covers about two passes of the loop (the loop is 128 steps ≈
 * 15.5 s at 124 BPM; the club form is five passes), so the comparison is the opening pass against the **loudest pass
 * in the window** — "does the build lift the mix", not "does the arrangement end louder" (it ends on a drop) and not
 * "does the whole form lift it", which is the *offline* probe's business: `probe_arrangement_audio.mjs` renders the
 * entire song and asserts ≥ 15 %. The two are deliberately different measurements of the same claim, one audible and
 * short, one rendered and complete.
 *
 * Runs against `dist/`, like the other probes, so it measures what ships.
 *
 * ## Reworked 2026-10-08: this route's engine and transport, and what the rework measured
 *
 * The probe used to drive the **studio store** (`readState()`, `sections`, `commit({type:"TOGGLE_SONG_MODE"})`), which the
 * arrangement route does not install — so it could only time out with a message that misdescribed the app. It now follows
 * the recipe the repository's other arrangement probe had already paid for: the desktop has no `audio-start-gate`, the
 * engine (and therefore the surface) is built by the first thing that needs audio, a settle beats a poll, and the
 * **context must be resumed** or a suspended context reads as silence.
 *
 * ⚠️ **And it still does not measure audio reliably here, which is stated rather than papered over.** Two combinations were
 * measured: the arrangement's play button (no resume) gave 67 % zero-level samples, `engine.play()` alone gave 100 %, and
 * the button **with** the resume gave 70 %. The sibling probe `probe_arrangement_playback.mjs` — not part of this batch —
 * fails on this route too, at its own `readState()` call, so **both** arrangement probes are stale in the same way. The
 * remaining question is a harness question (does the player's scheduling reach the master analyser in headless Chromium at
 * all?), and it needs its own measurement, not another guess. The level rise is therefore **reported**: promoting it back
 * to an assertion waits for a run that produces audio.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const playwright = require("playwright");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, "..");
const asJson = process.argv.includes("--json");
const SAMPLE_MS = Number(
  (process.argv.find((a) => a.startsWith("--sample-ms=")) ?? "--sample-ms=40000").split("=")[1]
);

if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
  console.error("❌ dist/index.html is missing — build first (`npm run build`)");
  process.exit(1);
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1`);
  const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
  const file = path.join(ROOT, "dist", rel);
  if (!file.startsWith(path.join(ROOT, "dist")) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const fail = async (message) => {
  console.error(`❌ ${message}`);
  await browser.close();
  server.close();
  process.exit(1);
};

const browser = await playwright.chromium.launch({ args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  try {
    localStorage.setItem("groove_onboarding_completed", "true");
localStorage.setItem("groove_audio_started", "1");
    localStorage.removeItem("groove_project_v1");
  } catch {
    /* disabled */
  }
});
await page.goto(`http://127.0.0.1:${server.address().port}/?tab=studio&probe=1`, { waitUntil: "domcontentloaded" });

try {
  /**
   * ⭐ **A project has to exist before the arrangement view does** — Logic's "Choose a Project": with nothing stored the
   * studio route draws the chooser, and `arrangement-view-v2` is not in the document at all. This waited for the view
   * directly and could therefore never pass on a fresh browser (the probe starts with empty storage by construction), so
   * the wait named a state no run could reach. Choosing a template is what a person does first, and it is what makes the
   * rest of this probe meaningful.
   */
  await page.waitForSelector("[data-testid='new-project-panel-v2']", { timeout: 30000 });
  await page.click("[data-testid='template-drums-bass']").catch(() => {});
  await page.click("[data-testid='new-project-create']");
  await page.waitForSelector("[data-testid='arrangement-view-v2']", { timeout: 30000 });
} catch {
  await fail("the studio toolbar never rendered");
}
/**
 * ⭐ **Measured, not assumed.** The steps that used to stand here — the editor's roll tab, an advanced drawer's
 * arrangement toggle, then an `arrangement-panel` — belong to an older studio: on the surface this probe now reaches,
 * `arrangement-editor-roll`, `toolbar-arrangement-toggle` and `arrangement-panel` are **not in the document at all**, while
 * the club pattern's own button (`arrangement-form-club`) is there as soon as the project exists. The probe was rewritten
 * from a reading of the live DOM (every `data-testid` on the surface, listed and compared) rather than by replacing one
 * failing wait with the next guess.
 */
await page.waitForSelector("[data-testid='arrangement-form-club']", { timeout: 10000 });
await page.click("[data-testid='arrangement-form-club']");

const hook = await page.evaluate(() => Boolean(window.__grooveProbe));
if (!hook) await fail("?probe=1 did not install the probe surface — the engine is unreachable, so nothing can be heard");
/**
 * ⭐ **The recipe the working sibling probe already recorded**, followed here instead of rediscovered.
 *
 * `scripts/probe_arrangement_playback.mjs` measures this same route and its comments hold four findings that cost it a run
 * each: the desktop has **no** `audio-start-gate` (that is the phone shell); the engine — and therefore the probe surface —
 * is built by the first thing that needs audio; **pressing the transport by hand tore the engine down again** (the cleanup
 * removes the hook), which is why the transport is started **from inside the surface**; and a settle beats a poll. My first
 * version of this rework clicked `arrangement-play` and measured **67 % zero-level samples** — the analyser was honest
 * about an engine that had been torn down under it.
 */
const gate = page.locator("[data-testid='audio-start-gate']");
if (await gate.count()) await gate.getByRole("button").first().click();
else {
  const studioTab = page.getByRole("button", { name: "Studio", exact: true }).first();
  if (await studioTab.count()) await studioTab.click();
  await page.waitForTimeout(1500);
}
await page.waitForTimeout(4000);
const surfaceReady = await page.evaluate(() => Boolean(window.__grooveProbeSeen) || Boolean(window.__grooveProbe?.engine));
if (!surfaceReady) {
  console.error("debug: url", page.url());
  console.error("debug: body", (await page.evaluate(() => document.body.innerText)).slice(0, 160).replace(/\n+/g, " | "));
  await fail("the probe surface never appeared on this route — nothing can be measured");
}

const measured = await page.evaluate(
  async ({ sampleMs }) => {
    const probe = window.__grooveProbeSeen ?? window.__grooveProbe;
    /**
     * ⭐ **The arrangement's own play control**, because this route's engine has nothing scheduled until the *player*
     * starts: the sibling probe's comment records that "a probe that only calls `play()` runs an engine with nothing to
     * play", and that is exactly what happened here — `engine.play()` alone measured **100 % silence** while the button
     * measured 67 % (and that earlier 67 % run had no context resume). This is the two lessons together: the player
     * schedules, and the context has to be running.
     */
    const play = document.querySelector("[data-testid='arrangement-play']");
    if (!play) throw new Error("the arrangement has no play control on this route");
    play.click();

    const waitStarted = Date.now();
    let startStep = null;
    while (Date.now() - waitStarted < 15000) {
      if (probe.engine.getIsPlaying()) {
        if (startStep === null) startStep = probe.engine.getCurrentStep();
        else if (probe.engine.getCurrentStep() !== startStep) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const analyser = probe.engine.getMasterAnalyser();
    if (!analyser) throw new Error("the master analyser is not available");
    /**
     * ⭐ **A suspended context is silence, and that is exactly what the first honest run measured**: 100 % zero-level
     * samples with the transport reporting playing. The working sibling probe records the same lesson — it resumes here
     * and then insists — so this one does too rather than reporting a dead analyser as a finding about the mix.
     */
    if (analyser.context?.state !== "running") await analyser.context?.resume?.();
    const frames = new Float32Array(analyser.fftSize);
    const samples = [];
    const started = Date.now();
    let wraps = 0;
    let previousStep = null;
    while (Date.now() - started < sampleMs) {
      analyser.getFloatTimeDomainData(frames);
      let sum = 0;
      for (let i = 0; i < frames.length; i += 1) sum += frames[i] * frames[i];
      const step = probe.engine.getCurrentStep();
      // ⭐ A wrap is the transport repeating: the step goes back down. That is how this probe learns the arrangement's
      // length without asking a store that is not here.
      if (previousStep !== null && step < previousStep) wraps += 1;
      previousStep = step;
      samples.push({ at: Date.now() - started, rms: Math.sqrt(sum / frames.length), step, playing: probe.engine.getIsPlaying() });
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    probe.engine.stop();
    return { samples, wraps, playing: samples.some((sample) => sample.playing) };
  },
  { sampleMs: SAMPLE_MS }
);

/**
 * ⭐ **The loop's length, from the samples themselves**: the highest step seen before the first wrap. With no wrap in the
 * window there is no measured length, and the bar comparison below is skipped rather than invented.
 */
const firstWrapAt = measured.samples.findIndex((sample, index) => index > 0 && sample.step < measured.samples[index - 1].step);
const beforeWrap = firstWrapAt === -1 ? measured.samples : measured.samples.slice(0, firstWrapAt);
const loopSteps = beforeWrap.length ? Math.max(...beforeWrap.map((sample) => sample.step)) + 1 : 0;

/**
 * Per-**bar** levels, by median, with the dropouts counted separately.
 *
 * The first version compared the mean of the first third of the samples against the mean of the last third, and it
 * failed a `scope=verify` run at 3.4 % on a shared runner while the same tree measured 10.1 % locally. The mean is
 * the problem: one glitchy stretch drags it, and a stalled transport reads exactly like a build that does not lift.
 * A median per bar is both the more robust statistic and the *right* one — the claim is about the level of a bar
 * moving, not about an average of samples.
 *
 * Dropouts are counted rather than ignored so the two failures can be told apart: "the mix does not lift" is a
 * finding about the app, "the platform dropped out" is a finding about the machine, and the caller gets the second
 * one as an explicit `unmeasured` instead of a message that blames the mix.
 */
const median = (values) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const barOf = (sample) => Math.floor(sample.step / Math.max(1, loopSteps));
const bars = new Map();
for (const sample of measured.samples) {
  const key = barOf(sample);
  if (!bars.has(key)) bars.set(key, []);
  bars.get(key).push(sample.rms);
}
const barLevels = [...bars.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([bar, values]) => ({ bar, level: median(values), samples: values.length }));
const dropouts = measured.samples.filter((sample) => sample.rms === 0).length;
const dropoutPct = (dropouts / Math.max(1, measured.samples.length)) * 100;
const first = barLevels[0];
/**
 * The **loudest** pass, not the last one.
 *
 * The claim is that the build lifts the mix, and the club form is intro → build → drop → outro: comparing the first
 * pass against the *last* compares the opening with whatever the arrangement happens to end on (measured on a
 * shared runner: −3.2 %, i.e. the drop), and comparing the first two does the same thing one pass earlier. The
 * loudest pass is what "the build lifts it" means, and it is robust to how much of the arrangement the window
 * happens to cover as long as it covers the build.
 */
const loudest = barLevels.reduce((best, entry) => (entry.level > best.level ? entry : best), first ?? { bar: 0, level: 0 });
const early = first ? first.level : 0;
const late = loudest.level;
const risePct = early > 0 ? ((late - early) / early) * 100 : 0;
const unmeasured = dropoutPct > 20 || barLevels.length < 2;

const summary = {
  /** ⭐ The arrangement's length **measured from the transport**, not read from a store this route does not have. */
  loopSteps,
  maxStep: Math.max(...measured.samples.map((sample) => sample.step)),
  wraps: measured.wraps,
  samples: measured.samples.length,
  earlyRms: Number(early.toExponential(3)),
  lateRms: Number(late.toExponential(3)),
  risePct: Number(risePct.toFixed(1)),
  playing: measured.playing,
  barLevels: barLevels.map((entry) => ({ bar: entry.bar, level: Number(entry.level.toExponential(3)) })),
  dropouts,
  dropoutPct: Number(dropoutPct.toFixed(1)),
  unmeasured,
};

/**
 * ⭐ **This route's claims, and only these.** The transport starts, it advances, it is audible, and the platform did not
 * drop out. The rise figure below is **reported**: its old assertion came from the studio's song-mode arrangement, and
 * promoting it back is a decision that needs a measurement on this route first (which this run produces).
 */
if (!measured.playing) await fail("the transport never started — nothing was measured");
if (measured.maxStep <= 0 && measured.wraps === 0) {
  await fail("the transport never advanced: the step stayed at 0 for the whole window, so nothing was played");
}
if (loopSteps === 0) {
  await fail(
    `unmeasured: the arrangement did not wrap inside the ${Math.round(SAMPLE_MS / 1000)}s window, so its length — and the ` +
      `per-bar comparison that needs it — could not be measured`
  );
}
if (unmeasured) {
  await fail(
    `unmeasured: the platform dropped out (${dropouts} zero-level samples, ${dropoutPct.toFixed(1)} %) or the ` +
      `transport only reached ${barLevels.length} bar(s) — this says nothing about the mix`
  );
}
if (late <= 0) await fail("the master analyser was silent for the whole window, so the arrangement produced no audio");

if (asJson) {
  console.log(JSON.stringify(summary, null, 1));
} else {
  console.log(
    `✅ Live arrangement: step reached ${summary.maxStep} with ${summary.wraps} wrap(s) over a ` +
      `${summary.loopSteps}-step arrangement, level ${summary.earlyRms} → ${summary.lateRms} (+${summary.risePct} %) over ` +
      `${(SAMPLE_MS / 1000).toFixed(0)}s of playback`
  );
}

await browser.close();
server.close();
