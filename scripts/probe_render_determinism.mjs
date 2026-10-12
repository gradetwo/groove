/**
 * Does the same genre render the same way twice — and does it depend on the page's history?
 *
 * The loudness re-record refuses to publish when its sentinel drifts: `alternative-rock` measured −10.782 LUFS on the fresh page
 * and −11.493 after a reload, Δ −0.711 dB, with the tool's own explanation — "a page that has rendered too many genres renders
 * the same genre differently". This probe asks the narrow version of that question, because a **level** difference between two
 * renders of the same pattern has few possible causes and one of them is visible from outside: the master limiter renders
 * either as its **AudioWorklet** or, until that module has loaded, as a **DynamicsCompressor fallback**, and the two do not
 * sound the same.
 *
 * So: render one genre three times **in one page** and then again **after a reload**, reporting the limiter kind the exporter
 * says it used and a plain RMS/peak for each. If the kind flips, that is the drift; if the kinds agree and the levels do not,
 * the cause is elsewhere and the numbers say which.
 *
 * Usage:
 *   node scripts/probe_render_determinism.mjs [--genre=chicago-house] [--bars=2] [--repeats=3] [--port=5361]
 */
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const genre = value("genre", "chicago-house");
const bars = Number(value("bars", "2")) || 2;
const repeats = Math.max(2, Number(value("repeats", "3")) || 3);
/**
 * How many *other* genres to render before the measurement, which is the variable that matters.
 *
 * Two renders of the same genre in a fresh page agree to a thousandth of a dB. The loudness tool's sentinel drifts by 0.7 dB
 * after a full 159-genre sweep, so the effect is cumulative: this warms the page with N other genres first and then measures,
 * and the number to find is where it starts moving.
 */
const warm = Math.max(0, Number(value("warm", "0")) || 0);
const port = Number(value("port", "5361")) || 5361;

const waitForServer = (url, timeoutMs = 60000) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () =>
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - started > timeoutMs) reject(new Error(`dev server never came up on ${url}`));
          else setTimeout(tick, 250);
        });
    tick();
  });

const server = spawn(process.execPath, [path.join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--port", String(port), "--strictPort"], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => (serverLog += chunk.toString()));
server.stderr.on("data", (chunk) => (serverLog += chunk.toString()));

/** Render once in the page and report what came out: the limiter kind and a level. */
const renderOnce = (page) =>
  page.evaluate(async ({ genreId, barsCount }) => {
    const [genres, wav, mix] = await Promise.all([
      import("/src/data/genres/index.ts"),
      import("/src/audio/WavExporter.ts"),
      // `patternFromGenre` is what the app itself plays: it applies the mix defaults and writes the genre's chords as real
      // notes, so a probe that renders anything else is not measuring the thing the user hears.
      import("/src/data/genreMix.ts"),
    ]);
    const entry = genres.ALL_GENRES.find((g) => g.id === genreId);
    if (!entry) return { error: `unknown genre ${genreId}` };
    const pattern = mix.patternFromGenre(entry);
    let kind = null;
    let hostFailures = 0;
    const buffer = await wav.renderPatternOffline(pattern, {
      bars: barsCount,
      onLimiterKind: (value) => {
        kind = value;
      },
      /**
       * The other way a render can silently differ: a GS-1 host that fails to load leaves that track on the **native**
       * synth, which the exporter's own comment measures at up to 3.7 dB in a band — the same order as the sentinel drift
       * the loudness tool refused to publish.
       */
      onGs1HostFailures: (count) => {
        hostFailures = count;
      },
    });
    let sum = 0;
    let peak = 0;
    const left = buffer.getChannelData(0);
    for (let i = 0; i < left.length; i += 1) {
      const v = left[i];
      sum += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    return {
      limiterKind: kind,
      hostFailures,
      rmsDbfs: Number((20 * Math.log10(Math.sqrt(sum / left.length) + 1e-12)).toFixed(3)),
      peakDbfs: Number((20 * Math.log10(peak + 1e-12)).toFixed(3)),
      frames: left.length,
      sampleRate: buffer.sampleRate,
    };
  }, { genreId: genre, barsCount: bars });

const { chromium } = await import("playwright");
let exitCode = 0;
let browser;
try {
  await waitForServer(`http://127.0.0.1:${port}/`);
  browser = await chromium.launch({ args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/?probe=1`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  if (warm > 0) {
    const warmed = await page.evaluate(async (count) => {
      const [genres, wav, mix] = await Promise.all([
        import("/src/data/genres/index.ts"),
        import("/src/audio/WavExporter.ts"),
        import("/src/data/genreMix.ts"),
      ]);
      const list = genres.ALL_GENRES.slice(0, count);
      let failures = 0;
      for (const entry of list) {
        await wav.renderPatternOffline(mix.patternFromGenre(entry), {
          bars: 2,
          onGs1HostFailures: (n) => {
            failures += n;
          },
        });
      }
      const memory = performance.memory;
      return {
        rendered: list.length,
        failures,
        heapMb: memory ? Math.round((memory.usedJSHeapSize / 1048576) * 10) / 10 : null,
      };
    }, warm);
    console.log(
      `warmed with ${warmed.rendered} genre(s): ${warmed.failures} GS-1 host failure(s), heap ${warmed.heapMb ?? "?"} MB\n`
    );
  }

  const rows = [];
  for (let index = 0; index < repeats; index += 1) {
    const result = await renderOnce(page);
    rows.push({ phase: "same page", index: index + 1, ...result });
  }
  // A reload, which is exactly what the loudness tool's sentinel does between its two measurements.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  for (let index = 0; index < repeats; index += 1) {
    const result = await renderOnce(page);
    rows.push({ phase: "after reload", index: index + 1, ...result });
  }

  const first = rows[0];
  console.log(`${genre}, ${bars} bar(s), ${first.sampleRate} Hz\n`);
  for (const row of rows) {
    console.log(
      `${row.phase.padEnd(13)} #${row.index}  limiter ${String(row.limiterKind).padEnd(8)}  ` +
        `hosts failed ${String(row.hostFailures).padStart(2)}  RMS ${row.rmsDbfs} dBFS  peak ${row.peakDbfs} dBFS`
    );
  }
  const kinds = new Set(rows.map((row) => row.limiterKind));
  const failures = rows.reduce((sum, row) => sum + row.hostFailures, 0);
  const rms = rows.map((row) => row.rmsDbfs);
  const spread = Math.max(...rms) - Math.min(...rms);
  console.log(
    `\nlimiter kinds seen: ${[...kinds].join(", ")} · GS-1 host failures ${failures} · RMS spread ${spread.toFixed(3)} dB`
  );
  if (kinds.size > 1) {
    console.log("❌ the limiter kind is not stable across renders — the export depends on whether a worklet module won a race");
    exitCode = 1;
  } else if (failures > 0) {
    console.log("❌ a GS-1 host failed in at least one render — that track fell back to the native synth, which is audible");
    exitCode = 1;
  } else if (spread > 0.05) {
    console.log("❌ the same limiter kind produced different levels — the cause is not the limiter");
    exitCode = 1;
  } else {
    console.log("✅ renders are consistent in this page");
  }
} catch (error) {
  console.error(`❌ ${error.message}`);
  if (serverLog) console.error(serverLog.slice(-1200));
  exitCode = 1;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
process.exit(exitCode);
