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
 * Runs against `dist/`, like the other probes, so it measures what ships.
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
  (process.argv.find((a) => a.startsWith("--sample-ms=")) ?? "--sample-ms=20000").split("=")[1]
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
    localStorage.removeItem("groove_project_v1");
  } catch {
    /* disabled */
  }
});
await page.goto(`http://127.0.0.1:${server.address().port}/?tab=studio&probe=1`, { waitUntil: "domcontentloaded" });

try {
  await page.waitForSelector("[data-testid='toolbar-advanced-toggle']", { timeout: 30000 });
} catch {
  await fail("the studio toolbar never rendered");
}
await page.click("[data-testid='toolbar-advanced-toggle']");
await page.waitForSelector("[data-testid='toolbar-arrangement-toggle']", { timeout: 10000 });
await page.click("[data-testid='toolbar-arrangement-toggle']");
await page.waitForSelector("[data-testid='arrangement-panel']", { timeout: 10000 });
await page.click("[data-testid='arrangement-form-club']");

const hook = await page.evaluate(() => Boolean(window.__grooveProbe));
if (!hook) await fail("?probe=1 did not install the probe surface — the engine is unreachable, so nothing can be heard");

/** One pass of the loop, read from the pattern the store holds, so the probe does not assume a length. */
const loopSteps = await page.evaluate(() => {
  const probe = window.__grooveProbe;
  const state = probe.readState();
  const pattern = state.pattern;
  return pattern.totalSteps || Math.max(...pattern.tracks.map((track) => track.steps.length));
});

const measured = await page.evaluate(
  async ({ sampleMs }) => {
    const probe = window.__grooveProbe;
    if (!probe.readState().songMode) probe.commit({ type: "TOGGLE_SONG_MODE" });
    await probe.engine.play();

    const analyser = probe.engine.getMasterAnalyser();
    if (!analyser) throw new Error("the master analyser is not available");
    const frames = new Float32Array(analyser.fftSize);
    const samples = [];
    const started = Date.now();
    while (Date.now() - started < sampleMs) {
      analyser.getFloatTimeDomainData(frames);
      let sum = 0;
      for (let i = 0; i < frames.length; i += 1) sum += frames[i] * frames[i];
      samples.push({
        at: Date.now() - started,
        rms: Math.sqrt(sum / frames.length),
        step: probe.engine.getCurrentStep(),
        playing: probe.engine.getIsPlaying(),
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    probe.engine.stop();
    return {
      samples,
      songMode: probe.readState().songMode,
      sections: (probe.readState().sections ?? []).length,
      maxStep: Math.max(...samples.map((sample) => sample.step)),
      playing: samples.some((sample) => sample.playing),
    };
  },
  { sampleMs: SAMPLE_MS }
);

const third = Math.max(1, Math.floor(measured.samples.length / 3));
const meanRms = (list) => list.reduce((sum, sample) => sum + sample.rms, 0) / Math.max(1, list.length);
const early = meanRms(measured.samples.slice(0, third));
const late = meanRms(measured.samples.slice(-third));
const risePct = early > 0 ? ((late - early) / early) * 100 : 0;

const summary = {
  loopSteps,
  maxStep: measured.maxStep,
  songMode: measured.songMode,
  sections: measured.sections,
  samples: measured.samples.length,
  earlyRms: Number(early.toExponential(3)),
  lateRms: Number(late.toExponential(3)),
  risePct: Number(risePct.toFixed(1)),
  playing: measured.playing,
};

if (!measured.playing) await fail("the transport never started — nothing was measured");
if (!measured.songMode) await fail("song mode did not turn on, so the transport was told to play the loop");
if (measured.sections < 2) await fail(`the club form produced ${measured.sections} section(s), so there is no arrangement`);
if (!(measured.maxStep > loopSteps)) {
  await fail(
    `the transport never left the loop: highest step ${measured.maxStep} against a ${loopSteps}-step pattern — ` +
      `B7's defect reproduced`
  );
}
if (!(risePct > 5)) {
  await fail(
    `the build does not lift the live mix: ${early.toExponential(3)} → ${late.toExponential(3)} (${risePct.toFixed(1)} %)`
  );
}

if (asJson) {
  console.log(JSON.stringify(summary, null, 1));
} else {
  console.log(
    `✅ Live arrangement: song mode with ${summary.sections} sections, step reached ${summary.maxStep} against a ` +
      `${summary.loopSteps}-step loop, level ${summary.earlyRms} → ${summary.lateRms} (+${summary.risePct} %) over ` +
      `${(SAMPLE_MS / 1000).toFixed(0)}s of playback`
  );
}

await browser.close();
server.close();
