/**
 * Do the **engines** play the same lead? (The live half of the Safari report.)
 *
 * The offline half is measured: on WebKit every GS-1-routed lane renders silence (`probe_engine_parity.mjs`), which is
 * why a stem export of `chords` or `lead` is an empty file on Safari. The *live* half is a different failure — the
 * user's words are "the lead has sound, and it is a very strange sound" — so this probe listens to the running app
 * instead of rendering it: it starts the transport, reads the master analyser's spectrum, and prints the average level
 * per band. Two engines, two spectra, one answer about what "strange" means.
 *
 * `--browser=webkit` is the point of it; `chromium` is the control.
 *
 * Usage: node scripts/probe_live_voice.mjs [--browser=webkit] [--genre=uk-garage] [--sample-ms=8000] [--json]
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
const value = (flag, fallback) => {
  const inline = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const at = process.argv.indexOf(flag);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};
const BROWSER = value("--browser", "chromium");
const GENRE = value("--genre", "uk-garage");
const SAMPLE_MS = Number(value("--sample-ms", "8000")) || 8000;
/** `--gs1=off` switches the synth engine off before the transport starts, which is how the A/B is taken. */
const GS1 = value("--gs1", "on");
/**
 * `--timeline` samples every ~120 ms and prints one line per second: peak, rms and how many samples are at or above
 * the ceiling. A defect that *starts* — "fine for a moment, then crackling" — is a timeline question, not an average
 * one, and a pinned peak with a rising rms is what clipping looks like from here.
 */
const TIMELINE = process.argv.includes("--timeline");

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

const engineModule = playwright[BROWSER];
if (!engineModule) {
  console.error(`❌ unknown browser ${BROWSER} (chromium | webkit | firefox)`);
  process.exit(2);
}
const browser = await engineModule.launch({
  args: BROWSER === "chromium" ? ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] : [],
});
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
const url = `http://127.0.0.1:${server.address().port}/?tab=studio&probe=1&genre=${encodeURIComponent(GENRE)}`;
await page.goto(url, { waitUntil: "domcontentloaded" });

let exitCode = 0;
try {
  await page.waitForFunction(() => Boolean(window.__grooveProbe), null, { timeout: 30000 });
  const measured = await page.evaluate(async ({ sampleMs, gs1, timeline }) => {
    const probe = window.__grooveProbe;
    if (gs1 === "off") probe.engine.setGs1Enabled(false);
    await probe.engine.play();
    const analyser = probe.engine.getMasterAnalyser();
    if (!analyser) throw new Error("no master analyser");
    const started = Date.now();
    while (Date.now() - started < 1500) await new Promise((r) => setTimeout(r, 100));
    const bins = new Float32Array(analyser.frequencyBinCount);
    const sums = new Float32Array(analyser.frequencyBinCount);
    const wave = new Float32Array(analyser.fftSize);
    const buckets = [];
    let frames = 0;
    let bucket = { peak: 0, sum: 0, count: 0, clipped: 0, at: 0 };
    while (Date.now() - started < sampleMs) {
      analyser.getFloatFrequencyData(bins);
      for (let i = 0; i < bins.length; i += 1) {
        const v = Number.isFinite(bins[i]) ? bins[i] : -140;
        sums[i] += v;
      }
      analyser.getFloatTimeDomainData(wave);
      for (let i = 0; i < wave.length; i += 1) {
        const v = wave[i];
        const a = Math.abs(v);
        if (a > bucket.peak) bucket.peak = a;
        if (a >= 0.999) bucket.clipped += 1;
        bucket.sum += v * v;
        bucket.count += 1;
      }
      frames += 1;
      const elapsed = Date.now() - started;
      if (elapsed - bucket.at >= 1000) {
        buckets.push({
          at: Math.round(elapsed / 1000),
          peak: Number(bucket.peak.toFixed(4)),
          rms: Number(Math.sqrt(bucket.sum / Math.max(1, bucket.count)).toFixed(5)),
          clipped: bucket.clipped,
        });
        bucket = { peak: 0, sum: 0, count: 0, clipped: 0, at: elapsed };
      }
      await new Promise((r) => setTimeout(r, 60));
    }
    probe.engine.stop();
    const average = Array.from(sums, (v) => v / Math.max(1, frames));
    return {
      sampleRate: analyser.context.sampleRate,
      fftSize: analyser.fftSize,
      frames,
      average,
      buckets,
      gs1: probe.engine.isGs1Enabled(),
    };
  }, { sampleMs: SAMPLE_MS, gs1: GS1, timeline: TIMELINE });

  const nyquist = measured.sampleRate / 2;
  const bandCount = 12;
  const bandDb = [];
  for (let band = 0; band < bandCount; band += 1) {
    const from = Math.floor((band / bandCount) * measured.average.length);
    const to = Math.max(from + 1, Math.floor(((band + 1) / bandCount) * measured.average.length));
    let sum = 0;
    for (let i = from; i < to; i += 1) sum += measured.average[i];
    bandDb.push(sum / (to - from));
  }
  const summary = {
    browser: BROWSER,
    genre: GENRE,
    sampleRate: measured.sampleRate,
    fftSize: measured.fftSize,
    frames: measured.frames,
    bandDb: bandDb.map((v) => Number(v.toFixed(1))),
    bandsHz: Array.from({ length: bandCount }, (_, i) => Math.round((i / bandCount) * nyquist)),
  };
  if (asJson) {
    console.log(JSON.stringify({ ...summary, buckets: measured.buckets, gs1: measured.gs1 }, null, 1));
  } else if (TIMELINE) {
    console.log(`${BROWSER} · ${GENRE} · GS-1 ${measured.gs1 ? "on" : "off"} · ${measured.sampleRate} Hz`);
    for (const b of measured.buckets) {
      console.log(`  ${String(b.at).padStart(3)}s  peak ${b.peak.toFixed(4)}  rms ${b.rms.toFixed(5)}  clipped ${b.clipped}`);
    }
  } else {
    console.log(`${BROWSER} · ${GENRE} · ${measured.sampleRate} Hz · ${measured.frames} frames`);
    console.log(
      `  bands (dB): ${summary.bandDb.map((v, i) => `${summary.bandsHz[i]}=${v}`).join("  ")}`
    );
  }
} catch (error) {
  console.error(`❌ ${error.message}`);
  exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
process.exit(exitCode);
