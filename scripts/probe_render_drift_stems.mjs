#!/usr/bin/env node
/**
 * Probe: *where* does the long-page render drift come from?
 *
 * `probe_page_degradation.mjs` measured *that* a page which has rendered ~50-75 genres renders the
 * same genre differently (and `probe_render_repeatability.mjs` that a reload clears it). It did not
 * say where in the graph the difference is created, which is what a fix needs. This renders one genre
 * in several configurations before and after a batch of other genres and reports the deltas:
 *
 *   master                     the normal arranged render
 *   master, no bus comp        `masterBusCompEnabled: false` — removes the master bus compressor
 *   master, makeup 0           `masterMakeupDb: 0` — removes the shared makeup gain
 *   master, makeup -12 dB      the limiter should not engage at all, so this shows the *content*
 *   stem 0..N-1                one track each, through the same master chain
 *
 * Reading it:
 *  - every configuration drifts by the same amount  → the difference is upstream of all of them (the
 *    voices / the pattern), not the master chain;
 *  - only `master` drifts, `makeup -12` does not  → the difference is created by the limiter/makeup
 *    stage (i.e. the same content is limited differently);
 *  - one stem drifts and the others do not        → that voice is the culprit.
 *
 *   node scripts/probe_render_drift_stems.mjs --genre=ambient --warm=60 --port=3195
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
const genreId = argValue("--genre", "ambient");
const warmCount = Math.max(0, Number(argValue("--warm", "60")));
const port = Number(argValue("--port", "3195"));

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

/** Runs in the page: render every configuration for one genre and measure it. */
const IN_PAGE_SNAPSHOT = async ({ genreId: id, bars }) => {
  const [wav, genresModule, mixModule, loudness, trackUtils] = await Promise.all([
    import("/src/audio/WavExporter.ts"),
    import("/src/data/genres/index.ts"),
    import("/src/data/genreMix.ts"),
    import("/src/test/helpers/loudness.ts"),
    import("/src/utils/trackUtils.ts"),
  ]);
  const genre = genresModule.ALL_GENRES.find((g) => g.id === id);
  const pattern = mixModule.applyGenreMixDefaults(genre.sequencer_pattern);
  const base = {
    bars,
    drumKit: trackUtils.getDefaultDrumKitForGenre(genre),
    loudnessTrimDb: 0,
  };

  let gs1RoutingEnabled = null;
  const measure = async (extra) => {
    let gs1HostFailures = null;
    let limiterKind = null;
    const buffer = await wav.renderPatternOffline(pattern, {
      ...base,
      ...extra,
      // The renderer already reports both of these; a probe that does not collect them cannot tell
      // "the synth changed" from "the limiter changed", which is exactly the ambiguity this run has
      // to resolve.
      onGs1HostFailures: (count) => {
        gs1HostFailures = count;
      },
      onLimiterKind: (kind) => {
        limiterKind = kind;
      },
    });
    if (gs1RoutingEnabled === null) {
      const gs1 = await import("/src/audio/gs1/gs1Tracks.ts");
      gs1RoutingEnabled = gs1.isGs1RoutingEnabled();
    }
    const channels = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
    const result = loudness.measureLoudness(channels, buffer.sampleRate);
    return {
      lufs: Number(result.integratedLufs.toFixed(3)),
      truePeakDb: Number(result.truePeakDb.toFixed(3)),
      rmsDb: Number(loudness.sampleRmsDb(channels).toFixed(3)),
      gs1HostFailures,
      limiterKind,
    };
  };

  const configurations = [];
  configurations.push({ name: "master", ...(await measure({})) });
  configurations.push({ name: "no bus comp", ...(await measure({ masterBusCompEnabled: false })) });
  configurations.push({ name: "makeup 0", ...(await measure({ masterMakeupDb: 0 })) });
  configurations.push({ name: "makeup -12", ...(await measure({ masterMakeupDb: -12 })) });

  const stems = [];
  for (let i = 0; i < pattern.tracks.length; i++) {
    const track = pattern.tracks[i];
    stems.push({
      name: `${i}:${track.track_id || track.name || "track"}`,
      ...(await measure({ stemTrackIdx: i })),
    });
  }

  return { configurations, stems, gs1RoutingEnabled };
};

const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  await waitForServer();
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (/MasterLimiter|gs1-probe/.test(msg.text())) process.stdout.write(`  [page] ${msg.text()}\n`);
  });
  await page.route("**/__drift_probe__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><head><meta charset=\"utf-8\"><title>drift probe</title></head><body></body></html>",
    })
  );
  await page.goto(`${baseUrl}/__drift_probe__.html`, { waitUntil: "domcontentloaded", timeout: 60000 });

  const catalog = await page.evaluate(async () => {
    const genres = await import("/src/data/genres/index.ts");
    return genres.ALL_GENRES.map((g) => g.id);
  });

  const snapshot = (id) => page.evaluate(IN_PAGE_SNAPSHOT, { genreId: id, bars: 3 });
  /**
   * The warm-up deliberately renders only the master configuration.
   *
   * The point of the batch is to move the page past the measured onset (~50-75 offline renders), so
   * each warm-up render should cost one render, not the twelve a full snapshot costs: 60 snapshots
   * would be 720 renders (~1.5 h) and would test nothing extra.
   */
  const warmOnce = (id) =>
    page.evaluate(async ({ genreId: warmId, bars }) => {
      const [wav, genresModule, mixModule, trackUtils] = await Promise.all([
        import("/src/audio/WavExporter.ts"),
        import("/src/data/genres/index.ts"),
        import("/src/data/genreMix.ts"),
        import("/src/utils/trackUtils.ts"),
      ]);
      const genre = genresModule.ALL_GENRES.find((g) => g.id === warmId);
      await wav.renderPatternOffline(mixModule.applyGenreMixDefaults(genre.sequencer_pattern), {
        bars,
        drumKit: trackUtils.getDefaultDrumKitForGenre(genre),
        loudnessTrimDb: 0,
      });
    }, { genreId: id, bars: 3 });

  console.log(`drift probe: genre=${genreId} warm=${warmCount} catalog=${catalog.length}`);
  await snapshot(catalog[0]); // discarded warm-up (lazy worklet registration)
  const before = await snapshot(genreId);

  const others = catalog.filter((id) => id !== genreId).slice(0, warmCount);
  const startedAt = Date.now();
  for (const id of others) await warmOnce(id);
  console.log(`rendered ${others.length} other genre(s) in ${((Date.now() - startedAt) / 1000).toFixed(0)} s`);

  const after = await snapshot(genreId);

  const line = (label, a, b) => {
    const delta = b.lufs - a.lufs;
    console.log(
      `  ${label.padEnd(22)} before ${String(a.lufs).padStart(8)}  after ${String(b.lufs).padStart(8)}  ` +
        `Δ ${(delta >= 0 ? "+" : "") + delta.toFixed(3)} dB   (gs1 failures ${a.gs1HostFailures} → ${b.gs1HostFailures}, ` +
        `limiter ${a.limiterKind} → ${b.limiterKind}, truePeak ${a.truePeakDb} → ${b.truePeakDb})`
    );
  };

  console.log(`GS-1 routing enabled: ${before.gs1RoutingEnabled}`);
  console.log("\nconfigurations:");
  for (const [index, config] of before.configurations.entries()) {
    line(config.name, config, after.configurations[index]);
  }
  console.log("\nstems:");
  for (const [index, stem] of before.stems.entries()) {
    line(stem.name, stem, after.stems[index]);
  }
} finally {
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
}
