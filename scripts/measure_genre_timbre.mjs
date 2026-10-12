#!/usr/bin/env node
/**
 * Genre timbre-fingerprint baseline measurement (V-10, `AUDIO_QUALITY_AND_SYNTH_PLAN.md`
 * §4.4). For every genre this renders that genre's arranged default pattern through the
 * app's OWN offline renderer (`renderPatternOffline` in `src/audio/WavExporter.ts`) and
 * fingerprints the result with `fingerprintChannels()` from
 * `src/test/helpers/timbre.ts` — the same module the unit suite validates, not a copy.
 * Then it writes `scripts/timbre.baseline.json`.
 *
 * Why a Vite dev server instead of `dist` + a static server: reaching
 * `renderPatternOffline` from a built page would need a test hook shipped in the
 * production bundle, which is exactly what this project forbids. The dev server serves
 * `src/**` as native ES modules, so the page can `await import("/src/audio/WavExporter.ts")`
 * and friends with zero production surface. (Same architecture as
 * `scripts/measure_genre_loudness.mjs`.)
 *
 * WHAT IS MEASURED
 *  - the full `TimbreFingerprint` per genre (`bandDb[13]`, `centroidHz`, `rolloffBand`,
 *    `correlation`, `rmsDb`), spread in unchanged so a new field added to the helper
 *    cannot be silently dropped here;
 *  - `roleChainDigest` — sha256 (16 hex) of `JSON.stringify` of the eight resolved
 *    `resolveTrackInsertForGenre(role, genreId)` chains, so the gate can tell that the
 *    insert defaults moved without re-rendering (the chains are resolved *in the page*
 *    against the real `src/data/genreInsert.ts`; only the hashing is done in Node,
 *    because `node:crypto` is the digest the gate recomputes);
 *  - `instrumentDigest` — the same idea over the genre's declared
 *    `sequencer_pattern.tracks[].instrument` list, plus the raw list itself, so a timbre
 *    change caused by a data edit is attributable to a genre;
 *  - library-level `distinctness` (via the helper's real `fingerprintDistance`) and
 *    `spread` of `centroidHz` / `rmsDb`.
 *
 * Usage:
 *   node scripts/measure_genre_timbre.mjs                    # full run -> timbre.baseline.json
 *   node scripts/measure_genre_timbre.mjs --limit=8          # quick iteration -> timbre.partial.json
 *   node scripts/measure_genre_timbre.mjs --genres=jazz-fusion,reggae --out=scripts/timbre.partial.json
 *   node scripts/measure_genre_timbre.mjs --bars=4 --repeats=3 --port=3160
 *
 * Anti-clobber discipline: a run that does not cover the whole library (either `--limit`
 * or `--genres`) is written to `scripts/timbre.partial.json` by default and the report
 * carries `subset: true` + `limit`, so a subset can never masquerade as the committed
 * baseline. (The loudness script keys this only off `--limit`; keying it off `--genres`
 * too is a deliberate strengthening, because a `--genres` run with the default `--out`
 * would otherwise overwrite the committed baseline.)
 *
 * Port: defaults to 3160, NOT the loudness script's 3150, so the two Chromium render
 * farms can run concurrently; `PORT` is deliberately not consulted for the same reason.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  TIMBRE_THRESHOLDS,
  insertSourceReport,
  instrumentSourceReport,
  readGenreIds,
  readGenreInstruments,
  readInsertEntries,
  shortDigest,
  spreadOf,
} from "./timbreSource.mjs";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (primaryError) {
    const extraPath = process.env.PLAYWRIGHT_MODULE_PATH;
    if (extraPath) {
      try {
        return createRequire(path.join(extraPath, "noop.js"))("playwright");
      } catch {
        /* fall through */
      }
    }
    console.error(`❌ Could not load Playwright: ${primaryError.message}`);
    process.exit(1);
  }
}

const { chromium } = loadPlaywright();

const argv = process.argv.slice(2);
/** Accepts both `--flag value` and `--flag=value`. */
const argValue = (flag, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const limit = Number(argValue("--limit", "0")) || 0;
/** Optional explicit genre list (`--genres=a,b,c`) — handy for repeat/noise checks. */
const genreFilter = (argValue("--genres", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const bars = Math.max(1, Number(argValue("--bars", "3")) || 3);
const repeats = Math.max(1, Number(argValue("--repeats", "2")) || 2);
const port = Number(argValue("--port", "3160")) || 3160;
/** Any run that does not cover the whole library is a subset run. */
const isSubset = limit > 0 || genreFilter.length > 0;
const outPath = path.resolve(
  ROOT,
  argValue("--out", isSubset ? "scripts/timbre.partial.json" : "scripts/timbre.baseline.json")
);

/**
 * Source-side ground truth, read before the browser starts so a broken reader fails in
 * milliseconds instead of after a multi-minute render.
 */
const allGenreIds = readGenreIds(ROOT);
const insertEntries = readInsertEntries(ROOT);
const sourceInstruments = readGenreInstruments(ROOT);
const missingInsertEntries = allGenreIds.filter((id) => !insertEntries.has(id));
if (missingInsertEntries.length > 0) {
  console.error(
    `❌ scripts/timbreSource.mjs found ${insertEntries.size} GENRE_INSERT entries for ` +
      `${allGenreIds.length} genres; missing: ${missingInsertEntries.slice(0, 8).join(", ")}`
  );
  process.exit(1);
}

/** Renders + fingerprints one genre in the page. Runs inside Chromium, so plain JS. */
async function measureGenre(page, genreId) {
  return page.evaluate(
    async ({ genreId: id, bars: barsArg, repeats: repeatsArg }) => {
      const [wav, genresModule, mixModule, timbre, genreInsert, trackUtils] = await Promise.all([
        import("/src/audio/WavExporter.ts"),
        import("/src/data/genres/index.ts"),
        import("/src/data/genreMix.ts"),
        import("/src/test/helpers/timbre.ts"),
        import("/src/data/genreInsert.ts"),
        import("/src/utils/trackUtils.ts"),
      ]);

      const genre = genresModule.ALL_GENRES.find((g) => g.id === id);
      if (!genre) throw new Error(`unknown genre id: ${id}`);

      const drumKit = trackUtils.getDefaultDrumKitForGenre(genre);
      const fingerprints = [];
      let sampleRate = 0;
      let channelCount = 0;
      let durationSec = 0;

      for (let r = 0; r < repeatsArg; r++) {
        // Same call shape as scripts/measure_genre_loudness.mjs: the arranged genre
        // pattern, the genre's default drum kit, unity master trim. The mixer defaults
        // are re-derived each repeat so the renderer never sees a mutated pattern.
        const buffer = await wav.renderPatternOffline(
          mixModule.applyGenreMixDefaults(genre.sequencer_pattern, genre.id),
          { bars: barsArg, drumKit, loudnessTrimDb: 0 }
        );
        const channels = [];
        for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
        fingerprints.push(timbre.fingerprintChannels(channels, buffer.sampleRate));
        sampleRate = buffer.sampleRate;
        channelCount = buffer.numberOfChannels;
        durationSec = buffer.duration;
      }

      // The renderer is seeded (V-01), so repeats should be bit-identical. Recording the
      // spread makes that claim checkable per genre instead of assumed.
      let repeatMaxBandDeltaDb = 0;
      for (let r = 1; r < fingerprints.length; r++) {
        for (let k = 0; k < timbre.TIMBRE_BAND_COUNT; k++) {
          repeatMaxBandDeltaDb = Math.max(
            repeatMaxBandDeltaDb,
            Math.abs(fingerprints[r].bandDb[k] - fingerprints[0].bandDb[k])
          );
        }
      }

      const roleChains = {};
      for (const role of genreInsert.GENRE_INSERT_ROLES) {
        roleChains[role] = genreInsert.resolveTrackInsertForGenre(role, genre.id);
      }

      return {
        fingerprint: fingerprints[0],
        fingerprintCount: fingerprints.length,
        repeatMaxBandDeltaDb,
        sampleRate,
        channelCount,
        durationSec,
        category: genre.category,
        bandCount: timbre.TIMBRE_BAND_COUNT,
        roleChainJson: JSON.stringify(roleChains),
        instruments: genre.sequencer_pattern.tracks.map((t) => t.instrument ?? null),
      };
    },
    { genreId, bars, repeats }
  );
}

/** Library-level distinctness, computed in the page so the REAL `fingerprintDistance` is used. */
async function computeDistinctness(page, rows) {
  return page.evaluate(async (rowsArg) => {
    const { fingerprintDistance, TIMBRE_BAND_COUNT } = await import(
      "/src/test/helpers/timbre.ts"
    );
    const keys = new Set();
    for (const row of rowsArg) keys.add(row.bandDb.map((v) => v.toFixed(2)).join(","));

    let closestPair = null;
    let sum = 0;
    let pairs = 0;
    let maxPairDistance = 0;
    for (let i = 0; i < rowsArg.length; i++) {
      for (let j = i + 1; j < rowsArg.length; j++) {
        const distance = fingerprintDistance(rowsArg[i], rowsArg[j]);
        sum += distance;
        pairs++;
        if (distance > maxPairDistance) maxPairDistance = distance;
        if (!closestPair || distance < closestPair.distance) {
          closestPair = { a: rowsArg[i].id, b: rowsArg[j].id, distance };
        }
      }
    }
    return {
      distinctFingerprints: keys.size,
      bandCount: TIMBRE_BAND_COUNT,
      closestPair,
      meanPairDistance: pairs > 0 ? sum / pairs : 0,
      maxPairDistance,
      pairCount: pairs,
    };
  }, rows);
}

async function listGenreIds(page) {
  return page.evaluate(async () => {
    const { ALL_GENRES } = await import("/src/data/genres/index.ts");
    return ALL_GENRES.map((g) => ({ id: g.id, category: g.category }));
  });
}

async function readBandGeometry(page) {
  return page.evaluate(async () => {
    const timbre = await import("/src/test/helpers/timbre.ts");
    return {
      bandCentresHz: [...timbre.TIMBRE_BAND_CENTRES_HZ],
      bandCount: timbre.TIMBRE_BAND_COUNT,
    };
  });
}

function startDevServer() {
  return new Promise((resolve, reject) => {
    const viteBin = path.join(ROOT, "node_modules/vite/bin/vite.js");
    const child = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const onData = (chunk) => {
      output += chunk.toString();
      if (/Local:\s+http/.test(output) || /ready in/.test(output)) resolve(child);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`vite exited early (${code}):\n${output}`)));
    setTimeout(() => reject(new Error(`vite did not become ready in 60s:\n${output}`)), 60000);
  });
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dev server never answered at ${url}`);
}

(async () => {
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log("===============================================================");
  console.log("  🎚️  GROOVE LAB genre timbre baseline (V-10, offline render)");
  console.log(
    `  target: ${baseUrl}   bars=${bars}   repeats=${repeats}` +
      `${limit ? `   limit=${limit}` : ""}${genreFilter.length ? `   genres=${genreFilter.length}` : ""}`
  );
  console.log(`  output: ${path.relative(ROOT, outPath)}${isSubset ? "   (SUBSET run)" : ""}`);
  console.log("===============================================================\n");

  const server = await startDevServer();
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const results = [];
  const failures = [];

  try {
    await waitForServer(baseUrl);
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") process.stderr.write(`  [page error] ${msg.text()}\n`);
    });
    // A bare same-origin document instead of the app shell: the app boots React and a
    // service worker that can navigate/reload and destroy the evaluate context mid-run.
    await page.route("**/__timbre_probe__.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><head><meta charset="utf-8"><title>groove timbre probe</title></head><body></body></html>',
      })
    );
    await page.goto(`${baseUrl}/__timbre_probe__.html`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    const geometry = await readBandGeometry(page);
    let catalog = await listGenreIds(page);
    if (genreFilter.length > 0) {
      const unknown = genreFilter.filter((id) => !catalog.some((c) => c.id === id));
      if (unknown.length) throw new Error(`unknown --genres id(s): ${unknown.join(", ")}`);
      catalog = genreFilter.map((id) => catalog.find((c) => c.id === id));
    } else if (limit > 0) {
      catalog = catalog.slice(0, limit);
    }
    console.log(
      `Measuring ${catalog.length} genre(s), ${geometry.bandCount} bands from ` +
        `${geometry.bandCentresHz[0]} Hz to ${geometry.bandCentresHz[geometry.bandCount - 1]} Hz...\n`
    );

    for (const [index, entry] of catalog.entries()) {
      const startedAt = Date.now();
      try {
        const measured = await measureGenre(page, entry.id);
        results.push({ ...entry, ...measured });
        // Flush progress every few genres: a long run that writes only at the end is
        // indistinguishable from a hang from the outside, and an interrupted run leaves nothing.
        if (results.length % 5 === 0) {
          fs.writeFileSync(`${outPath}.progress.json`, `${JSON.stringify({ generatedBy: "measure_genre_timbre.mjs", partial: true, done: results.length, total: catalog.length, genres: results }, null, 0)}\n`);
        }
        const f = measured.fingerprint;
        process.stdout.write(
          `  [${String(index + 1).padStart(3)}/${catalog.length}] ${entry.id.padEnd(22)}` +
            ` centroid ${f.centroidHz.toFixed(1).padStart(7)} Hz` +
            `  rolloff ${String(f.rolloffBand).padStart(2)}` +
            `  rms ${f.rmsDb.toFixed(2).padStart(7)} dBFS` +
            `  corr ${f.correlation.toFixed(2).padStart(5)}` +
            `  (${Date.now() - startedAt} ms)\n`
        );
      } catch (error) {
        failures.push({ genreId: entry.id, error: String(error?.message || error) });
        process.stdout.write(
          `  [${String(index + 1).padStart(3)}/${catalog.length}] ${entry.id} FAILED: ${error.message}\n`
        );
      }
    }

    if (results.length === 0) throw new Error("no genre could be measured");

    // The offline instrument reader must agree with the page's own read of the data, or
    // the gate would compare a baseline against a misread source and cry wolf. Fail the
    // measurement rather than write a baseline the gate cannot trust.
    const instrumentMismatches = [];
    for (const result of results) {
      const fromSource = sourceInstruments.get(result.id);
      if (JSON.stringify(fromSource) !== JSON.stringify(result.instruments)) {
        instrumentMismatches.push(result.id);
      }
    }
    if (instrumentMismatches.length > 0) {
      throw new Error(
        `scripts/timbreSource.mjs read different instruments than the app for ` +
          `${instrumentMismatches.length} genre(s): ${instrumentMismatches.slice(0, 8).join(", ")}`
      );
    }

    const distinctnessRaw = await computeDistinctness(
      page,
      results.map((r) => ({ id: r.id, bandDb: r.fingerprint.bandDb }))
    );
    const round4 = (v) => Number(v.toFixed(4));
    const roundSpread = (s) => ({
      min: s.min === null ? null : round4(s.min),
      minGenre: s.minGenre,
      max: s.max === null ? null : round4(s.max),
      maxGenre: s.maxGenre,
      median: s.median === null ? null : round4(s.median),
    });
    const distinctness = {
      distinctFingerprints: distinctnessRaw.distinctFingerprints,
      pairCount: distinctnessRaw.pairCount,
      closestPair: distinctnessRaw.closestPair
        ? { ...distinctnessRaw.closestPair, distance: round4(distinctnessRaw.closestPair.distance) }
        : null,
      meanPairDistance: round4(distinctnessRaw.meanPairDistance),
      maxPairDistance: round4(distinctnessRaw.maxPairDistance),
    };

    const sampleRates = new Set(results.map((r) => r.sampleRate));
    if (sampleRates.size !== 1) {
      throw new Error(`renders disagree on sample rate: ${[...sampleRates].join(", ")}`);
    }
    const sampleRate = results[0].sampleRate;

    const report = {
      generatedBy: "scripts/measure_genre_timbre.mjs",
      generatedAt: new Date().toISOString(),
      subset: isSubset,
      limit: limit > 0 ? limit : null,
      genresFilter: genreFilter.length > 0 ? genreFilter : null,
      genreCount: results.length,
      bars,
      repeats,
      sampleRate,
      path: "offline: renderPatternOffline() via Vite dev server (no live AudioContext, post-limiter, loudnessTrimDb 0)",
      bandCentresHz: geometry.bandCentresHz,
      bandCount: geometry.bandCount,
      thresholds: TIMBRE_THRESHOLDS,
      distinctness,
      spread: {
        centroidHz: roundSpread(
          spreadOf(results.map((r) => ({ id: r.id, value: r.fingerprint.centroidHz })), "value")
        ),
        rmsDb: roundSpread(
          spreadOf(results.map((r) => ({ id: r.id, value: r.fingerprint.rmsDb })), "value")
        ),
      },
      insertSources: insertSourceReport(ROOT),
      instrumentSources: instrumentSourceReport(ROOT),
      genres: Object.fromEntries(
        results.map((result) => {
          const f = result.fingerprint;
          return [
            result.id,
            {
              category: result.category,
              // The full TimbreFingerprint, spread in so a new helper field is recorded
              // here automatically instead of being dropped by a hand-picked subset.
              ...f,
              bandDb: f.bandDb.map((v) => Number(v.toFixed(6))),
              centroidHz: Number(f.centroidHz.toFixed(4)),
              correlation: Number(f.correlation.toFixed(6)),
              rmsDb: Number(f.rmsDb.toFixed(4)),
              // Gate bookkeeping -------------------------------------------------------
              roleChainDigest: shortDigest(result.roleChainJson),
              rolePatchDigest: insertEntries.get(result.id)?.digest ?? null,
              instrumentDigest: shortDigest(JSON.stringify(result.instruments)),
              instruments: result.instruments,
              fingerprintCount: result.fingerprintCount,
              repeatMaxBandDeltaDb: Number(result.repeatMaxBandDeltaDb.toFixed(6)),
              channelCount: result.channelCount,
              durationSec: Number(result.durationSec.toFixed(4)),
            },
          ];
        })
      ),
      unmeasured: failures,
    };

    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

    console.log("\n---------------------------------------------------------------");
    console.log(
      `  genres measured      : ${report.genreCount}${failures.length ? ` (${failures.length} failure(s))` : ""}`
    );
    console.log(
      `  distinct fingerprints: ${distinctness.distinctFingerprints}/${report.genreCount}` +
        `  (quantised to 0.01 dB)`
    );
    if (distinctness.closestPair) {
      console.log(
        `  closest pair         : ${distinctness.closestPair.a} ↔ ${distinctness.closestPair.b}` +
          `  ${distinctness.closestPair.distance.toFixed(4)} dB` +
          `   (floor ${TIMBRE_THRESHOLDS.closestPairFloorDb} dB)`
      );
      console.log(
        `  pair distance        : mean ${distinctness.meanPairDistance.toFixed(4)} dB` +
          `   max ${distinctness.maxPairDistance.toFixed(4)} dB` +
          `   over ${distinctness.pairCount} pairs`
      );
    }
    const worstRepeat = results.reduce(
      (worst, r) => (r.repeatMaxBandDeltaDb > worst.value ? { id: r.id, value: r.repeatMaxBandDeltaDb } : worst),
      { id: null, value: 0 }
    );
    console.log(
      `  repeat stability     : worst |ΔbandDb| across ${repeats} repeat(s) ` +
        `${worstRepeat.value.toFixed(6)} dB (${worstRepeat.id ?? "n/a"})`
    );
    console.log(
      `  centroid spread      : min ${report.spread.centroidHz.min.toFixed(1)} Hz (${report.spread.centroidHz.minGenre})` +
        `   median ${report.spread.centroidHz.median.toFixed(1)} Hz` +
        `   max ${report.spread.centroidHz.max.toFixed(1)} Hz (${report.spread.centroidHz.maxGenre})`
    );
    console.log(
      `  rms spread           : min ${report.spread.rmsDb.min.toFixed(2)} dBFS (${report.spread.rmsDb.minGenre})` +
        `   median ${report.spread.rmsDb.median.toFixed(2)} dBFS` +
        `   max ${report.spread.rmsDb.max.toFixed(2)} dBFS (${report.spread.rmsDb.maxGenre})`
    );
    console.log(`  report               : ${path.relative(ROOT, outPath)}`);
    console.log("===============================================================");
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }

  if (failures.length > 0) {
    console.error(`\n⚠️  ${failures.length} measurement(s) failed — see report.unmeasured`);
  }
})().catch((error) => {
  console.error(`❌ ${error?.stack || error}`);
  process.exit(1);
});
