/**
 * Probe (not a gate): *when* does a long measurement page start rendering differently?
 *
 *   node scripts/probe_page_degradation.mjs --genre=alternative-rock --block=15 --max=135
 *   node scripts/probe_page_degradation.mjs --reload-every=15   # does recycling contain it?
 *
 * `probe_render_repeatability.mjs` established that the effect is deterministic per page: a fresh page renders
 * `alternative-rock` at -12.71 LUFS, three times over, and the same page after 118 other renders gives
 * -10.259 three times over (exactly the value the full re-record published), and a reload restores
 * -12.71. This walks the page forward in blocks and measures the target after each block, so the onset
 * (cliff or gradual) and the safe block size are measured rather than guessed.
 *
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const argv = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : fallback;
};
const genreId = argValue("--genre", "alternative-rock");
const block = Math.max(1, Number(argValue("--block", "10")));
const max = Math.max(block, Number(argValue("--max", "140")));
const port = Number(argValue("--port", "3183"));
/** Reload the page every N renders (0 = never) and warm it up again, to test the containment. */
const reloadEvery = Math.max(0, Number(argValue("--reload-every", "0")));

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
      /* not up */
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
    if (/MasterLimiter/.test(msg.text())) process.stdout.write(`  [page] ${msg.text()}\n`);
  });
  await page.route("**/__diag_probe__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><head><meta charset=\"utf-8\"><title>diag</title></head><body></body></html>",
    })
  );
  await page.goto(`${baseUrl}/__diag_probe__.html`, { waitUntil: "domcontentloaded", timeout: 60000 });

  const script = async (id) =>
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
      const buffer = await wav.renderPatternOffline(pattern, {
        bars: 3,
        drumKit: trackUtils.getDefaultDrumKitForGenre(genre),
        loudnessTrimDb: 0,
      });
      const channels = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
      const result = loudness.measureLoudness(channels, buffer.sampleRate);
      return { lufs: result.integratedLufs, truePeak: result.truePeakDb, samplePeak: result.samplePeakDb };
    }, id);

  const catalog = await page.evaluate(async () => {
    const genres = await import("/src/data/genres/index.ts");
    return genres.ALL_GENRES.map((g) => g.id);
  });
  const others = catalog.filter((id) => id !== genreId);

  const base = await script(catalog[0]);
  void base;
  const first = await script(genreId);
  console.log(`onset probe: genre=${genreId} block=${block} max=${max} catalog=${catalog.length}`);
  console.log(`  after   0 other render(s): ${first.lufs.toFixed(3)} LUFS  ${first.truePeak.toFixed(2)} dBTP`);

  let done = 0;
  while (done < Math.min(max, others.length)) {
    const slice = others.slice(done, done + block);
    for (const id of slice) await script(id);
    done += slice.length;
    if (reloadEvery > 0 && done % reloadEvery === 0 && done < Math.min(max, others.length)) {
      await page.reload({ waitUntil: "domcontentloaded" });
      // A reloaded page's first render is the cold one (the limiter worklet is not registered yet),
      // so it is discarded exactly like the run's opening warm-up.
      await script(catalog[0]);
      console.log(`  [reloaded at ${done} renders, warmed up]`);
    }
    const r = await script(genreId);
    const delta = r.lufs - first.lufs;
    console.log(
      `  after ${String(done).padStart(3)} other render(s): ${r.lufs.toFixed(3)} LUFS  ` +
        `${r.truePeak.toFixed(2)} dBTP  Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(3)} dB`
    );
  }
} finally {
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
}
