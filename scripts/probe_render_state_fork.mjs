#!/usr/bin/env node
/**
 * The minimal reproduction of the render's **page-state fork**: two discrete, individually reproducible outcomes.
 *
 *   node scripts/probe_render_state_fork.mjs [--genre=chicago-house] [--rounds=5] [--port=3186]
 *
 * ## What it reproduces, and why it needed a new tool
 *
 * The full loudness run aborted on its own sentinel: `chicago-house` read −12.349 LUFS on the page the run opened
 * in and −11.589 after the first page reload (Δ **+0.760 dB** against a 0.3 dB tolerance), and every row measured
 * after that reload agreed with the *later* value. `probe_page_degradation.mjs` could not see it — that probe
 * measures the same genre six times across six reloads and reads the same value to 0.002 dB — because it renders
 * `applyGenreMixDefaults(pattern)` and reads LUFS from its own call, while the run goes through `measureGenre`'s
 * path (two-arg mix resolution, `repeats = 2`, `onLimiterKind` / `onGs1HostFailures` callbacks).
 *
 * This runs `measureGenre`'s exact body several times **in one page** and prints every individual render, so
 * "the median over the repeats is stable" and "each render is stable" stop being confusable. Measured on
 * 2026-09-23, five rounds × two renders of `chicago-house`:
 *
 *   round 0  a -11.589  b -12.349   |Δ| 0.760 dB
 *   round 1  a -11.589  b -12.349   |Δ| 0.760 dB
 *   round 2  a -11.589  b -11.589   |Δ| 0.000 dB
 *   round 3+ identical to round 2
 *
 * Three facts fall out of that table, and they are why this is a *fork* rather than noise:
 *
 *   - the values are **exactly reproducible** (three decimals, repeat after repeat), so a page is in one of two
 *     discrete states rather than accumulating float error;
 *   - the quieter-LUFS state has the **higher** RMS (−9.89 against −9.98 dB) and the *same* true peak (−1.30 dBTP),
 *     so it is a change in K-weighted content, not a gain;
 *   - the fork affects the first renders of a **cold** page and stops: a page that has loaded once before is stable
 *     from its first measurement. That is the fact `measure_genre_loudness.mjs` now relies on — it recycles the page
 *     before taking its sentinel reference.
 *
 * ## What it rules out, and what it does not
 *
 * Both states report `limiter: worklet` and zero GS-1 host failures, and 1500 fresh limiter creations all took the
 * worklet path (`diagnose_repeat_determinism.mjs --limiter-trials=1500`), so neither the limiter fallback nor the
 * silent GS-1 host fallback is the cause. What is *not* answered here is what the two states are; the candidates
 * left are lazy module/WASM compilation completing mid-life and a worklet whose processor state depends on when it
 * was installed. That is the next experiment, and this script is its harness.
 */
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const argv = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const genreId = argValue("--genre", "chicago-house");
const rounds = Math.max(2, Number(argValue("--rounds", "5")) || 5);
const port = Number(argValue("--port", "3186"));

const { chromium } = require("playwright");
const viteBin = path.join(ROOT, "node_modules/vite/bin/vite.js");
const server = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", () => {});
const base = `http://127.0.0.1:${port}`;
const waitForServer = async () => {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(base, { signal: AbortSignal.timeout(1000) });
      if (res.ok || res.status === 404) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("vite did not start");
};

const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  await waitForServer();
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (/MasterLimiter|Gs1/i.test(msg.text())) process.stdout.write(`  [page] ${msg.text()}\n`);
  });
  await page.route("**/__diag_probe__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
    })
  );
  await page.goto(`${base}/__diag_probe__.html`, { waitUntil: "domcontentloaded", timeout: 60000 });

  const body = page.evaluate(
    async ({ id, rounds: n }) => {
      const [wav, genresModule, mixModule, loudness, trackUtils] = await Promise.all([
        import("/src/audio/WavExporter.ts"),
        import("/src/data/genres/index.ts"),
        import("/src/data/genreMix.ts"),
        import("/src/test/helpers/loudness.ts"),
        import("/src/utils/trackUtils.ts"),
      ]);
      const genre = genresModule.ALL_GENRES.find((g) => g.id === id);
      const drumKit = trackUtils.getDefaultDrumKitForGenre(genre);
      const out = [];
      for (let r = 0; r < n; r++) {
        const kinds = new Set();
        let hostFailures = 0;
        // Exactly `measureGenre`'s render, twice — once per repeat, reported separately.
        const perRepeat = [];
        for (let k = 0; k < 2; k++) {
          const buffer = await wav.renderPatternOffline(mixModule.applyGenreMixDefaults(genre.sequencer_pattern, id), {
            bars: 3,
            drumKit,
            loudnessTrimDb: 0,
            onLimiterKind: (kind) => kinds.add(kind),
            onGs1HostFailures: (count) => {
              hostFailures = Math.max(hostFailures, count);
            },
          });
          const channels = [];
          for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
          const measured = loudness.measureLoudness(channels, buffer.sampleRate);
          perRepeat.push({
            lufs: measured.integratedLufs,
            truePeak: measured.truePeakDb,
            rms: loudness.sampleRmsDb(channels),
          });
        }
        out.push({ round: r, perRepeat: [...perRepeat], kinds: [...kinds], hostFailures });
      }
      return out;
    },
    { id: genreId, rounds }
  );

  const rows = await body;
  console.log(`\n=== ${genreId}: ${rounds} rounds × 2 repeats, one page ===\n`);
  for (const row of rows) {
    const [a, b] = row.perRepeat;
    console.log(
      `  round ${row.round}  a ${a.lufs.toFixed(3)}  b ${b.lufs.toFixed(3)}  ` +
        `|Δ| ${Math.abs(a.lufs - b.lufs).toFixed(3)} dB   tp ${a.truePeak.toFixed(2)}/${b.truePeak.toFixed(2)}   ` +
        `rms ${a.rms.toFixed(2)}/${b.rms.toFixed(2)}   limiter ${row.kinds.join("+")}  gs1Fail ${row.hostFailures}`
    );
  }
  const all = rows.flatMap((r) => r.perRepeat.map((p) => p.lufs));
  const spread = Math.max(...all) - Math.min(...all);
  console.log(
    `\n   ${all.length} renders: min ${Math.min(...all).toFixed(3)}  max ${Math.max(...all).toFixed(3)}  ` +
      `spread ${spread.toFixed(3)} dB`
  );
} finally {
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
}
