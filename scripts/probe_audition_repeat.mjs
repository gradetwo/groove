/**
 * Tap a track header's preview button a few times — the user's reproduction of the lead defect.
 *
 * The report is exact and small: open uk-garage, tap the lead's own preview button (the speaker icon in the track
 * header) two or three times, and with GS-1 on the lane goes silent or wrong. It reproduces on Safari *and* Chrome, so
 * it can be reproduced here, in a headless browser, against the built app — which is what this probe does.
 *
 * Per tap it prints the master's peak over a short window, the GS-1 host's own report (voices, load, violations), and
 * whether the panel would show a host at all. That is enough to tell the three candidate stories apart:
 *
 *   · **voices climbing** and then the lane going quiet — the core's allocator is filling up (notes not released);
 *   · **peak 0 while `voices` is 0** — the host is idle and the note never reached it (a routing/readiness fallback);
 *   · **peak pinned or spiky** with violations — the DSP is being driven out of range.
 *
 * Usage: node scripts/probe_audition_repeat.mjs [--track=6] [--taps=6] [--gap-ms=350] [--gs1=on|off] [--browser=chromium]
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

const value = (flag, fallback) => {
  const inline = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const at = process.argv.indexOf(flag);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};
const TRACK = Number(value("--track", "6")) || 6;
const TAPS = Number(value("--taps", "6")) || 6;
const GAP_MS = Number(value("--gap-ms", "350")) || 350;
const GS1 = value("--gs1", "on");
const BROWSER = value("--browser", "chromium");
const GENRE = value("--genre", "uk-garage");
const asJson = process.argv.includes("--json");
/**
 * `--rate=44100` forces the context's sample rate, which is how the 44.1-vs-48 kHz difference is isolated: the defect
 * reported on Safari (44.1 kHz) does not appear in headless Chromium (48 kHz), and that is the one variable left.
 */
const RATE = Number(value("--rate", "0")) || 0;

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
  const url = new URL(req.url, "http://127.0.0.1");
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
const browser = await engineModule.launch({
  args: BROWSER === "chromium" ? ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] : [],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript((forcedRate) => {
  if (forcedRate) {
    const Native = window.AudioContext;
    const Patched = function (options) {
      return new Native({ ...(options ?? {}), sampleRate: forcedRate });
    };
    Patched.prototype = Native.prototype;
    window.AudioContext = Patched;
    if (window.webkitAudioContext) window.webkitAudioContext = Patched;
  }
  // Diagnostic: make the SIMD core fail validation so the host loads the scalar one.
  if (new URLSearchParams(location.search).get("scalar") === "1") {
    const validate = WebAssembly.validate.bind(WebAssembly);
    // eslint-disable-next-line no-global-assign
    WebAssembly.validate = (bytes) => {
      try {
        const mod = new WebAssembly.Module(bytes);
        const simd = WebAssembly.Module.exports(mod).length > 0 && bytes.byteLength > 200000;
        if (simd) return false;
      } catch {
        /* fall through to the real validator */
      }
      return validate(bytes);
    };
  }
  try {
    localStorage.setItem("groove_onboarding_completed", "true");
    localStorage.setItem("groove_audio_started", "1");
    localStorage.removeItem("groove_project_v1");
  } catch {
    /* disabled */
  }
}, RATE);
const url = `http://127.0.0.1:${server.address().port}/?tab=studio&probe=1&genre=${encodeURIComponent(GENRE)}${process.argv.includes("--scalar") ? "&scalar=1" : ""}`;
await page.goto(url, { waitUntil: "domcontentloaded" });

let exitCode = 0;
try {
  await page.waitForFunction(() => Boolean(window.__grooveProbe), null, { timeout: 30000 });
  // The engine needs a context before a preview can sound; the gate does this from a tap, and a probe taps for it.
  await page.evaluate(() => window.__grooveProbe.engine.primeAudioContext());
  const contextState = await page.evaluate(() => {
    const engine = window.__grooveProbe.engine;
    return { state: engine.getScrubTarget()?.ctx?.state ?? "no ctx" };
  });
  if (!asJson) console.log(`context state before tapping: ${contextState.state}`);
  if (process.argv.includes("--probe")) {
    // The app's own live verdict, which is what decides whether a silent browser keeps GS-1 at all.
    const verdict = await page.evaluate(async () => {
      const engine = window.__grooveProbe.engine;
      const result = await engine.probeLiveGs1();
      return { result, enabledAfter: engine.isGs1Enabled() };
    });
    console.log(`live GS-1 probe: ${verdict.result} → gs1Enabled ${verdict.enabledAfter}`);
  }

  const button = `[data-testid="track-audition-${TRACK}"]`;
  await page.waitForSelector(button, { timeout: 15000 });
  // The GS-1 host is created on the first note, so the first tap is allowed to be the warm-up one.
  // The tap itself has to come from Playwright (a trusted gesture), so the page side calls back out for each one.
  await page.exposeFunction("__grooveTap", async (selector) => {
    await page.click(selector, { timeout: 5000 });
  });
  const measured = await page.evaluate(
    async ({ buttonSelector, taps, gapMs, gs1 }) => {
      const probe = window.__grooveProbe;
      if (gs1 === "off") probe.engine.setGs1Enabled(false);
      const analyser = probe.engine.getMasterAnalyser();
      const wave = new Float32Array(analyser.fftSize);
      const out = [];
      const peakWindow = (ms) =>
        new Promise((resolve) => {
          let peak = 0;
          let sum = 0;
          let count = 0;
          const started = Date.now();
          const tick = () => {
            analyser.getFloatTimeDomainData(wave);
            for (let i = 0; i < wave.length; i += 1) {
              const a = Math.abs(wave[i]);
              if (a > peak) peak = a;
              sum += wave[i] * wave[i];
              count += 1;
            }
            if (Date.now() - started < ms) setTimeout(tick, 25);
            else resolve({ peak: Number(peak.toFixed(4)), rms: Number(Math.sqrt(sum / Math.max(1, count)).toFixed(5)) });
          };
          tick();
        });

      /**
       * The measure window is installed first, then a **real** click is issued from outside the page: a synthetic
       * `element.click()` is not a user gesture, and WebKit will not let audio start on one — which is how a run of
       * all-zero readings was produced and briefly mistaken for the defect.
       */
      for (let tap = 1; tap <= taps; tap += 1) {
        const reading = peakWindow(gapMs);
        await window.__grooveTap?.(buttonSelector);
        const level = await reading;
        const diag = probe.engine.getGs1Diagnostics();
        const host = diag.hosts.find((h) => h.role === "lead") ?? diag.hosts[0] ?? null;
        out.push({
          tap,
          peak: level.peak,
          rms: level.rms,
          host: host ? `${host.role}/${host.patch}${host.ready ? "" : "(not ready)"}` : "none",
          voices: host?.analysis?.voices ?? null,
          load: host?.analysis?.load ?? null,
          violations: host?.analysis?.violations ?? null,
          hosts: diag.hosts.length,
        });
      }
      return { rate: analyser.context.sampleRate, rows: out };
    },
    { buttonSelector: button, taps: TAPS, gapMs: GAP_MS, gs1: GS1 }
  );

  const { rate, rows } = measured;
  if (asJson) {
    console.log(JSON.stringify(measured, null, 1));
  } else {
    console.log(
      `${BROWSER} · ${GENRE} · track ${TRACK} · GS-1 ${GS1} · ${rate} Hz · ${TAPS} taps every ${GAP_MS} ms`
    );
    for (const row of rows) {
      console.log(
        `  tap ${row.tap}  peak ${String(row.peak).padEnd(7)} rms ${String(row.rms).padEnd(8)} ` +
          `voices ${String(row.voices).padEnd(4)} load ${String(row.load).padEnd(6)} viol ${row.violations}  ${row.host}`
      );
    }
    // The reading this probe exists for: does the level collapse, or climb, as the taps repeat?
    const peaks = rows.map((r) => r.peak);
    const silent = peaks.filter((p) => p < 0.005).length;
    if (silent > 1) {
      console.log(`  ❌ ${silent} of ${peaks.length} taps produced no output (peak < 0.005) — the reported defect`);
      exitCode = 1;
    } else {
      console.log(`  ✅ every tap produced output (min peak ${Math.min(...peaks).toFixed(4)})`);
    }
  }
} catch (error) {
  console.error("❌ probe failed:", error?.message ?? error);
  exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
process.exit(exitCode);
