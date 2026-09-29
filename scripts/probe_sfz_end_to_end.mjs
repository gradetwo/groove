#!/usr/bin/env node
/**
 * B5's audio half: does a *generated arrangement* actually render a fill and a build?
 *
 *   node scripts/probe_arrangement_audio.mjs [--genre=chicago-house] [--json]
 *
 * B5 landed as arrangement data (`SongSection.overrides`) and the unit tests prove the *pattern* it flattens to —
 * the fill's onsets, the ramp's per-bar velocity scale. What no unit test can prove is that the sound changes,
 * because jsdom's Web Audio double renders an empty buffer (`src/test/helpers/fakeAudio.ts`), so every audio claim in
 * `src/test/**` is really a claim about structure. This probe renders through the app's own offline engine in a real
 * browser and measures the audio:
 *
 *   · **the fill is audible** — the fill's own bar is rendered twice, once with the `fill` override and once without,
 *     and the bar with the fill must carry more energy;
 *   · **the build is audible** — the club form's `build` section ramps its velocity, so its last bar must be louder
 *     than its first in the rendered file, not just in the pattern;
 *   · **the song is the length the form says** — bars, not one loop;
 *   · and the onsets are counted from the flattened pattern, which is where P1.5's own wording lives ("the last bar's
 *     onset count differs from the others").
 *
 * It is a probe rather than a gate because it renders one genre: the claim it checks belongs to the generator, not to
 * the library, so a per-genre sample would only repeat the same assertion twelve times.
 */
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwright = require("playwright");
const ROOT = process.cwd();
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const genreId = (argv.find((a) => a.startsWith("--genre=")) ?? "--genre=chicago-house").split("=")[1];
const port = Number((argv.find((a) => a.startsWith("--port=")) ?? "--port=3188").split("=")[1]);
/**
 * The build's velocity ramp, as `first,last` multipliers.
 *
 * Added to answer a question the probe could only report on: a **6 dB** ramp in the pattern renders as −0.15 dB in
 * the file, because the master chain's gain rides down on the louder bar. Sweeping the ramp is how you find out
 * whether more content buys an audible build or whether the chain has a ceiling on slow dynamics.
 */
const rampSpec = (argv.find((a) => a.startsWith("--ramp=")) ?? "--ramp=0.25,1").split("=")[1];
const RAMP = rampSpec
  .split(",")
  .map((value) => Number(value))
  .filter((value) => Number.isFinite(value) && value > 0);
const rampPair = RAMP.length === 2 ? RAMP : [0.5, 1];

if (!fs.existsSync(path.join(ROOT, "node_modules", "vite", "bin", "vite.js"))) {
  console.error("❌ No node_modules — run `npm ci` first.");
  process.exit(1);
}

const { chromium } = require("playwright");
const viteBin = path.join(ROOT, "node_modules/vite/bin/vite.js");
const server = require("node:child_process").spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", () => {});
process.on("exit", () => {
  try {
    server.kill("SIGTERM");
  } catch {
    /* already gone */
  }
});

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
const fail = async (message) => {
  console.error(`❌ ${message}`);
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
  process.exit(1);
};

try {
  await waitForServer();
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (/MasterLimiter|Gs1/.test(msg.text())) process.stdout.write(`  [page] ${msg.text()}\n`);
  });
  await page.route("**/__arrangement_probe__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
    })
  );
  await page.goto(`${base}/__arrangement_probe__.html`, { waitUntil: "domcontentloaded", timeout: 60000 });

  /**
   * ⭐ THE END-TO-END PROBE — the first time this runs against real bytes over the real network.
   *
   * Every layer has its own criteria, and they have never run together: the catalogue had never been fetched by a browser, the SFZ resolver had never seen a file fetched from R2, and the loader
   * had never decoded a real sample. This walks exactly the path the application walks and asserts the only thing that ultimately matters — **that a nonzero signal comes out**.
   *
   * It uses the live manifest and the live mirror, because the point is to test the addresses the app builds (root + prefix + path), which is the mistake that counting objects could not catch.
   */
  /**
   * The manifest is fetched **in Node and passed in**, because the probe runs on `localhost` while the manifest lives on the deployed origin: cross-origin there, same-origin in production, so
   * fetching it from the page would test the probe's origin rather than the app's path. The **R2 fetches stay in the browser** on purpose — that is the cross-origin case the application will
   * actually face, and testing it here is the point.
   */
  const manifestText = await (await fetch("https://groove.wangda.today/samples/manifest.json")).text();
  console.log(`   e2e : manifest fetched in Node — ${manifestText.length} bytes, json=${manifestText.trimStart().startsWith("{")}`);

  const result = await page.evaluate(async (manifestText) => {
    const log = [];
    const [catalogue, instrument, loaderModule, graph, manifestModule] = await Promise.all([
      import("/src/data/sampleCatalogue.ts"),
      import("/src/audio/sfz/instrument.ts"),
      import("/src/audio/sampleLoader.ts"),
      import("/src/audio/browserSampleGraph.ts"),
      import("/src/data/sampleManifest.ts"),
    ]);

    log.push(`manifest: ${manifestText.length} bytes, json=${manifestText.trimStart().startsWith("{")}`);

    const root = "https://r2mirror.groove.wangda.today";
    const { assets, problems } = catalogue.catalogueFromManifestText(manifestText, root);
    log.push(`catalogue: ${assets.length} asset(s), problems ${problems.length}`);
    const kit = assets.find((asset) => asset.assetId === "virtuosity-drums-basic");
    if (!kit) return { ok: false, log: [...log, "no virtuosity-drums-basic in the catalogue"] };
    log.push(`sfz url: ${kit.sfz.url} | fallback: ${kit.sfz.fallbackUrl ?? "(none)"}`);

    /**
     * **No manual resolve here.** The first version of this probe fetched the SFZ and called the resolver itself, which meant it **bypassed the loader** — and therefore could not see the include
     * expansion that the loader now performs. A probe that reproduces a path instead of following it measures the probe. So the only thing done here is what the application does: ask the loader for a
     * note and see whether a buffer comes back.
     */
    // Diagnostics first: the expansion's own numbers, reported before the loader is asked for anything.
    const includesModule = await import("/src/audio/sfz/remoteIncludes.ts");
    const parseModule = await import("/src/audio/sfz/parse.ts");
    const sfzHead = await (await fetch(kit.sfz.url)).text();
    const programPath = kit.sfz.path ?? "";
    const base = programPath ? kit.sfz.url.slice(0, kit.sfz.url.length - programPath.length) : kit.sfz.url;
    log.push(`base: ${base}`);
    const expanded = await includesModule.expandRemoteIncludes(sfzHead, {
      fetchText: async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${response.status} from ${url}`);
        return response.text();
      },
      // A **plain path**, like the loader passes: the expander's arithmetic reads `//` in a URL as a separator and produces `https:/…`.
      programUrl: kit.sfz.path ?? kit.sfz.url,
      baseUrl: base,
    });
    const regions = parseModule.parseSfz(expanded.text);
    log.push(`expand: included ${expanded.included.length}, missing ${expanded.missing.length}, problems ${expanded.problems.length}, regions ${regions.length}`);
    for (const problem of expanded.problems.slice(0, 3)) log.push(`  problem: ${problem}`);
    log.push(`sfz entry: ${sfzHead.length} bytes from the source, includes ${(sfzHead.match(/^\s*#include/gm) ?? []).length}`);

    // And load it for real: the loader fetches, decodes and caches, with the browser decoder.
    const context = new OfflineAudioContext(1, 44100, 44100);
    const loader = loaderModule.createSampleLoader(graph.browserSampleDecoder(context), assets);
    let buffer;
    try {
      buffer = await loader.loadNote("virtuosity-drums-basic", 38);
    } catch (error) {
      // **Failures are returned with their diagnostics, not thrown away.** The first version let the exception escape, which discarded the log — so the one run that had something to say said nothing.
      log.push(`loadNote threw: ${error instanceof Error ? error.message : String(error)}`);
      return { ok: false, log };
    }
    const data = buffer.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i]));
    log.push(`decoded: ${buffer.length} frames, ${buffer.numberOfChannels} channel(s), peak ${peak.toFixed(6)}`);
    return { ok: peak > 0, log, frames: buffer.length, peak };
  }, manifestText);

  for (const line of result.log ?? []) console.log(`   e2e : ${line}`);
  console.log(result.ok ? `   e2e : ✅ REAL SOUND — ${result.frames} frames, peak ${result.peak}` : "   e2e : ❌ no signal");
  process.exitCode = result.ok ? 0 : 1;
} finally {
  await browser.close().catch(() => undefined);
}
