/**
 * Probe (not a gate): is a genre's offline render reproducible page-to-page?
 *
 *   node scripts/probe_render_repeatability.mjs --genre=alternative-rock --warm=118 --port=3180
 *
 * The diagnostic that turned "the baseline has some odd rows" into a mechanism. See
 * `scripts/probe_page_degradation.mjs` for the onset curve and `--help` in
 * `scripts/measure_genre_loudness.mjs` for what the measuring device now does about it.
 *
 * Context: the freshly recorded 159-genre baseline puts `alternative-rock` at -10.26 LUFS and
 * `2-step-garage` at -15.03, but a fresh page measures -12.71 / -14.31 (twice, in two pages), and
 * `chicago-house` agrees to 0.16 dB. Within the long run the two repeats agreed to 0.000 dB, so the
 * render looks deterministic *per page* and different *between pages*. This script renders one genre
 * repeatedly in a fresh page, then after the page has rendered many other genres, and prints the
 * pattern fields that seed the renderer so an in-place mutation cannot hide.
 *
 */
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const argv = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : fallback;
};
const genreId = argValue("--genre", "alternative-rock");
const warm = Number(argValue("--warm", "60"));
const port = Number(argValue("--port", "3180"));

const { chromium } = require("playwright");

const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
const server = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", () => {});
server.stderr.on("data", (chunk) => process.stderr.write(`  [vite] ${chunk}`));

const baseUrl = `http://127.0.0.1:${port}`;
const waitForServer = async () => {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(baseUrl, { signal: AbortSignal.timeout(1000) });
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
    if (/MasterLimiter|error/.test(msg.text())) process.stdout.write(`  [page] ${msg.text()}\n`);
  });
  await page.goto(`${baseUrl}/__diag_probe__.html`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.route("**/__diag_probe__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><head><meta charset=\"utf-8\"><title>diag</title></head><body></body></html>",
    })
  );
  await page.goto(`${baseUrl}/__diag_probe__.html`, { waitUntil: "domcontentloaded", timeout: 60000 });

  const catalog = await page.evaluate(async () => {
    const genres = await import("/src/data/genres/index.ts");
    return genres.ALL_GENRES.map((g) => g.id);
  });

  const measure = async (id) =>
    page.evaluate(async (genreIdArg) => {
      const [wav, genresModule, mixModule, loudness, trackUtils] = await Promise.all([
        import("/src/audio/WavExporter.ts"),
        import("/src/data/genres/index.ts"),
        import("/src/data/genreMix.ts"),
        import("/src/test/helpers/loudness.ts"),
        import("/src/utils/trackUtils.ts"),
      ]);
      const genre = genresModule.ALL_GENRES.find((g) => g.id === genreIdArg);
      const pattern = mixModule.applyGenreMixDefaults(genre.sequencer_pattern);
      const before = {
        totalSteps: pattern.totalSteps ?? null,
        bpm: pattern.bpm ?? null,
        stepLengths: pattern.tracks.map((t) => t.steps.length).join(","),
        volumes: pattern.tracks.map((t) => t.volume).join(","),
      };
      const buffer = await wav.renderPatternOffline(pattern, {
        bars: 3,
        drumKit: trackUtils.getDefaultDrumKitForGenre(genre),
        loudnessTrimDb: 0,
      });
      const after = {
        totalSteps: pattern.totalSteps ?? null,
        bpm: pattern.bpm ?? null,
        stepLengths: pattern.tracks.map((t) => t.steps.length).join(","),
        volumes: pattern.tracks.map((t) => t.volume).join(","),
      };
      const channels = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
      const result = loudness.measureLoudness(channels, buffer.sampleRate);
      return {
        lufs: result.integratedLufs,
        truePeak: result.truePeakDb,
        mutated: JSON.stringify(before) !== JSON.stringify(after),
        before,
        after,
      };
    }, id);

  const report = (label, r) =>
    console.log(
      `${label.padEnd(34)} ${r.lufs.toFixed(3)} LUFS  ${r.truePeak.toFixed(2)} dBTP` +
        (r.mutated ? `  PATTERN MUTATED ${JSON.stringify(r.before)} -> ${JSON.stringify(r.after)}` : "")
    );

  console.log(`genre=${genreId} warm=${warm} catalog=${catalog.length}`);
  await measure(catalog[0]);
  for (let i = 0; i < 3; i++) report(`fresh page, render ${i + 1}`, await measure(genreId));

  const others = catalog.filter((id) => id !== genreId).slice(0, warm);
  for (const id of others) await measure(id);
  console.log(`-- rendered ${others.length} other genre(s) in this page --`);
  for (let i = 0; i < 3; i++) report(`after ${others.length} genres, render ${i + 1}`, await measure(genreId));

  const reload = await page.evaluate(() => 1);
  void reload;
  await page.reload({ waitUntil: "domcontentloaded" });
  for (let i = 0; i < 3; i++) report(`after reload, render ${i + 1}`, await measure(genreId));
} finally {
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
  void fs;
}
