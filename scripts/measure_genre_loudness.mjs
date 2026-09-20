#!/usr/bin/env node
/**
 * Genre loudness baseline measurement (feat/genre-mix-loudness).
 *
 * For every genre this renders that genre's default pattern through the app's OWN
 * offline renderer (`renderPatternOffline` in `src/audio/WavExporter.ts`) and measures
 * ITU-R BS.1770-4 gated integrated loudness (LUFS) plus sample peak. Then:
 *
 *   1. `legacy`  — the raw genre pattern (the pre-feature placeholder mix), trim 0 dB.
 *                  This is the "before" the user complained about and is directly
 *                  comparable with the live-path probe the integrator runs.
 *   2. `arranged`— the pattern after `applyGenreMixDefaults`, trim 0 dB.
 *   3. `trimmed` — the arranged pattern with `trimDb = clamp(target − arranged, −9, +6)`
 *                  applied, where `target` is the MEDIAN arranged loudness across the
 *                  whole library (so the library's overall level does not move).
 *
 * Why a Vite dev server instead of `dist` + a static server: reaching
 * `renderPatternOffline` from a built page would need a test hook shipped in the
 * production bundle, which is exactly what this project forbids. The dev server
 * serves `src/**` as native ES modules, so the page can
 * `await import("/src/audio/WavExporter.ts")` and friends with zero production
 * surface. The BS.1770 implementation is the same module the unit suite validates
 * (`src/test/helpers/loudness.ts`) — not an inline copy.
 *
 * Usage:
 *   node scripts/measure_genre_loudness.mjs                 # full 159-genre run
 *   node scripts/measure_genre_loudness.mjs --limit=8       # quick iteration
 *   node scripts/measure_genre_loudness.mjs --bars=4 --repeats=3
 *   node scripts/measure_genre_loudness.mjs --sample=3      # is the report still true?
 *   node scripts/measure_genre_loudness.mjs --force-fallback  # measure the degraded limiter path
 *
 * A full run recycles its measuring page (see `--reload-every`) because a page that has rendered
 * ~50-75 genres starts rendering the same genre up to 2.45 dB louder; the sentinel check aborts the
 * run if that happens anyway.
 *
 * `--limit` writes `scripts/loudness.partial.json` (untracked scratch) so an
 * iteration can never overwrite the committed baseline.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

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

// Type-stripped directly by Node (the repository's engine floor is 22.22.2, where that is on by
// default), so the sampler and the drift rule are the same code the unit tests exercise.
import {
  LOUDNESS_FRESHNESS_TOLERANCE_DB,
  loudnessDrift,
  sampleGenreIds,
} from "../src/utils/loudnessFreshness.ts";

const argv = process.argv.slice(2);
/** Accepts both `--flag value` and `--flag=value`. */
const argValue = (flag, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const limit = Number(argValue("--limit", "0")) || 0;
/**
 * Sample mode: re-render this many genres (spread across the catalog) and compare them with the
 * committed report, writing nothing.
 *
 * This is the one check that can tell a *stale* report from a consistent one: every other loudness
 * gate compares the report with itself and with \`genreMix.ts\`, both of which stay perfectly
 * consistent while the code moves underneath them (PRODUCT_PLAN_v2.1.0.md G.52).
 */
const sampleCount = Math.max(0, Number(argValue("--sample", "0")) || 0);
const reportPath = path.resolve(ROOT, argValue("--report", "scripts/loudness.baseline.json"));
/** Optional explicit genre list (`--genres=a,b,c`) — handy for repeat/noise checks. */
const genreFilter = (argValue("--genres", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const bars = Math.max(1, Number(argValue("--bars", "3")) || 3);
const repeats = Math.max(1, Number(argValue("--repeats", "2")) || 2);
const port = Number(argValue("--port", process.env.PORT || "3150")) || 3150;
/**
 * `--force-fallback` makes the page unable to load the limiter worklet, so every render takes the
 * `DynamicsCompressorNode` path.
 *
 * The fallback used to be reachable only by luck — whether Chromium accepted `audioWorklet.addModule`
 * for `/limiterWorklet.js` varied between runs of the *same* command, which is exactly how a
 * re-record came back with rows at +1.75 dBTP while a re-run of the same genres sat at −1.30 dBTP.
 * A defect whose reproduction is a coin flip cannot be regression-tested, so this flag removes the
 * coin: it routes the worklet URL to a 404, `addModule` rejects for a deterministic reason, and the
 * resulting rows are labelled `fallback` by the renderer itself. Use it to check the offline
 * true-peak ceiling on the degraded path, and never for publishing a baseline.
 */
const forceFallback = argValue("--force-fallback", "") !== "";
/**
 * `--allow-mixed-limiter` publishes (or samples against) a report even when some genre rendered
 * through the compressor fallback. Only for diagnostics: see `assertSingleLimiterPath`.
 */
const allowMixedLimiter = argValue("--allow-mixed-limiter", "") !== "";
/**
 * Recycling budget for the measuring page, in measurements (`--reload-every=K`, 0 disables).
 *
 * See the long-page degradation note in the run body: past ~50-75 offline renders in one page the
 * same genre renders up to 2.45 dB louder. 12 keeps a ~4x margin under the measured onset.
 */
const reloadEveryArg = Number(argValue("--reload-every", "12"));
const reloadEvery = Number.isFinite(reloadEveryArg) && reloadEveryArg >= 0 ? Math.floor(reloadEveryArg) : 12;

/**
 * The genre used as the run's canary, and how far it may move before the run gives up.
 *
 * `alternative-rock` is not special; it is the genre whose render was measured to move the most when a
 * page degrades (+2.451 dB after 75 renders, −12.711 → −10.259 LUFS), so it is the most sensitive
 * probe available. The tolerance is 0.3 dB: fresh-page repeats of the same genre land within 0.12 dB
 * of each other (measured, 3 renders in each of three pages), so a real degradation is unmissable and
 * the check does not fire on noise.
 */
const SENTINEL_GENRE_ID = "alternative-rock";
const SENTINEL_TOLERANCE_DB = 0.3;
/**
 * Absolute delivery target, or empty to keep the historical "match the library's own median"
 * behaviour. The fitted trims only ever made the genres match *each other*; the absolute level
 * was whatever the median happened to be (−15.7 LUFS), which is 1.7 dB below Spotify's
 * normalisation point and 6–9 dB below a modern master of the same material. Naming a target is
 * how the library stops being self-referential.
 */
const targetArg = argValue("--target", "");
const explicitTargetLufs = targetArg === "" ? null : Number(targetArg);
/**
 * Per-category delivery targets, in LUFS.
 *
 * A single number for 159 genres is the wrong shape: a metal master and an ambient master are not
 * mastered to the same loudness in the real world, and forcing them together is what produced the
 * old self-referential −15.7 LUFS median. These values follow how each family is actually
 * delivered, and they are *ceilings* — a genre whose own dynamics cannot reach its category
 * target stops at the loudest level its crest allows (see `achievableCeilingLufs`), which is why
 * the report names every capped genre instead of silently missing.
 *
 * `--target=<number>` still overrides the whole table with one number.
 */
const CATEGORY_TARGET_LUFS = {
  "Rock/Metal": -10,
  "Hip Hop": -12.5,
  Electronic: -13,
  "Pop/R&B": -13.5,
  "Latin/World": -13.5,
  "Jazz/Blues": -14.5,
};
const DEFAULT_CATEGORY_TARGET_LUFS = -13.5;
/**
 * The absolute makeup the master graph now applies (`MASTER_MAKEUP_DB`). The measurement must
 * include it or the trims would be solved against a signal the user never hears. `--makeup=0`
 * measures the pre-makeup level, which is what a spread-only re-fit wants.
 */
const makeupArg = argValue("--makeup", "default");
const masterMakeupDb = makeupArg === "default" ? undefined : Number(makeupArg);
/**
 * Which measured quantity the trims are derived from.
 *
 * `lufs` (default) is BS.1770-4 gated integrated loudness — the broadcast/streaming
 * standard, and the metric the brief prefers. Its gate deliberately ignores the
 * silence *between* a sparse genre's hits, so ambient is not punished for being
 * sparse. `rms` derives trims from the whole-render unweighted RMS instead, which is
 * what a windowed live-path probe measures; the two views differ by ~7 dB of spread
 * on this library. Both are always reported; the flag only decides which one the
 * committed trims match.
 */
/** E-12/N-15: the master true-peak ceiling the limiter targets, in dBTP. */
const CEILING_DBTP = -1.0;

const metricKey = argValue("--metric", "lufs");
if (!["lufs", "rms"].includes(metricKey)) {
  console.error(`❌ --metric must be "lufs" or "rms" (got "${metricKey}")`);
  process.exit(1);
}
const METRIC = {
  lufs: {
    label: "LUFS (ITU-R BS.1770-4 gated integrated loudness)",
    legacy: "legacyLufs",
    before: "arrangedLufs",
    after: "trimmedLufs",
  },
  rms: {
    label: "unweighted broadband RMS (dBFS, whole render)",
    legacy: "legacyRmsDb",
    before: "arrangedRmsDb",
    after: "trimmedRmsDb",
  },
}[metricKey];
/**
 * A subset run must never be able to clobber the committed baseline.
 *
 * The first version of this guard only looked at `--limit`, so
 * `--genres=dubstep,doom-metal` — also a subset — wrote straight to
 * `scripts/loudness.baseline.json` and replaced the 159-genre baseline with 7 genres.
 * Any narrowing flag now redirects to the scratch file; `--out` still overrides.
 */
const isSubsetRun = limit > 0 || genreFilter.length > 0;
const outPath = path.resolve(
  ROOT,
  argValue("--out", isSubsetRun ? "scripts/loudness.partial.json" : "scripts/loudness.baseline.json")
);

// Must match `LOUDNESS_TRIM_MIN_DB` / `LOUDNESS_TRIM_MAX_DB` in src/data/genreMix.ts.
// `src/test/loudnessReport.test.ts` fails if these drift from the committed report.
const TRIM_MIN_DB = -9;
const TRIM_MAX_DB = 9;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
}

function spreadOf(entries, key) {
  const values = entries
    .map((e) => ({ id: e.id, value: e[key] }))
    .filter((e) => Number.isFinite(e.value));
  values.sort((a, b) => a.value - b.value);
  const sorted = values.map((v) => v.value);
  const min = values[0];
  const max = values[values.length - 1];
  const p10 = percentile(sorted, 10);
  const p90 = percentile(sorted, 90);
  return {
    count: values.length,
    min: min?.value ?? null,
    minGenre: min?.id ?? null,
    max: max?.value ?? null,
    maxGenre: max?.id ?? null,
    p10,
    p90,
    p90p10: p90 - p10,
    fullRange: (max?.value ?? 0) - (min?.value ?? 0),
  };
}

/** Renders + measures one genre in the page. Runs inside Chromium, so plain JS. */
/**
 * Refuse to publish (or judge) numbers that came from more than one limiter path.
 *
 * The `worklet` limiter is a hard lookahead ceiling; the `fallback` is a soft compressor that
 * (G.14) renders 2.36 dB louder overall on the same material. A row measured through each is not one
 * measurement, so a run that hit both is not a baseline — and the failure mode this replaces is
 * exactly that: a re-record whose rows were half fallback looked internally consistent and passed
 * every check in `check:loudness`, because each row was self-consistent. Sampling mode gets the same
 * treatment, since a fallback row there reads as "the report has drifted" when only the limiter did.
 */
function assertSingleLimiterPath(ids, context) {
  if (forceFallback || allowMixedLimiter) return;
  const offenders = ids
    .map((id) => {
      const seen = observedLimiterKinds.get(id);
      return [id, seen ? [...seen].join("+") : "unrendered"];
    })
    .filter(([, kind]) => kind !== "worklet");
  if (offenders.length === 0) return;
  console.error(`\n❌ ${offenders.length} of ${ids.length} genre(s) did not render through the worklet limiter (${context}):`);
  for (const [id, kind] of offenders) console.error(`   ${id}: ${kind}`);
  console.error(
    "   The compressor fallback is a different renderer (2.36 dB louder overall, G.14), so these\n" +
      "   numbers cannot be published alongside worklet rows. Re-run; if it persists, pass\n" +
      "   --allow-mixed-limiter to inspect it (never to land a baseline), or --force-fallback to\n" +
      "   measure the degraded path on its own."
  );
  process.exit(1);
}

/**
 * Every limiter path each genre was rendered through, across *all* of this run's calls.
 *
 * `measureGenre` is called repeatedly per genre (the arranged pass, then one call per trim round),
 * so a genre's row has to be the union of what actually rendered it: `worklet+fallback` is a
 * different claim from `worklet`, and a baseline whose rows silently mix the two is describing two
 * different renderers with one number (G.14 measures the compressor path 2.36 dB louder overall).
 */
const observedLimiterKinds = new Map();

/** Measurements taken since the page was last recycled; see `--reload-every`. */
let measurementsSinceReload = 0;

async function measureGenre(page, genreId, trimDb, { discard = false } = {}) {
  measurementsSinceReload += 1;
  const measured = await page.evaluate(
    async ({ genreId: id, trimDb: trim, bars: barsArg, repeats: repeatsArg, makeupDb }) => {
      const [wav, genresModule, mixModule, loudness, trackUtils] = await Promise.all([
        import("/src/audio/WavExporter.ts"),
        import("/src/data/genres/index.ts"),
        import("/src/data/genreMix.ts"),
        import("/src/test/helpers/loudness.ts"),
        import("/src/utils/trackUtils.ts"),
      ]);

      const genre = genresModule.ALL_GENRES.find((g) => g.id === id);
      if (!genre) throw new Error(`unknown genre id: ${id}`);

      const drumKit = trackUtils.getDefaultDrumKitForGenre(genre);
      const runs = [];

      // `legacy` renders the genre file's own mix (the pre-feature placeholder);
      // `arranged` renders the table's mix. `trim === null` means "measure the raw
      // mix", otherwise the trim is applied by the same code path the exporter uses.
      /**
       * Which limiter each render actually installed.
       *
       * The run-level probe answers this once, but the probe's own notes are explicit that "a report
       * that does not say which one rendered cannot be interpreted" — and the two paths behave
       * differently (the worklet is a hard lookahead ceiling, the compressor fallback is soft). Now
       * every row carries the kind it was rendered with, which is how the +1.75 dBTP rows were traced
       * to a render that never went through a ceiling at all.
       */
      const limiterKinds = new Set();
      const render = async (pattern) => {
        const buffer = await wav.renderPatternOffline(pattern, {
          bars: barsArg,
          drumKit,
          loudnessTrimDb: trim === null ? 0 : trim,
          // `undefined` means "use the graph's shared default", which is what playback does.
          masterMakeupDb: makeupDb,
          onLimiterKind: (kind) => limiterKinds.add(kind),
        });
        const channels = [];
        for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
        const result = loudness.measureLoudness(channels, buffer.sampleRate);
        return {
          integratedLufs: result.integratedLufs,
          samplePeakDb: result.samplePeakDb,
          // V-03/E-12: inter-sample peak. The limiter's ceiling is a *true*-peak
          // ceiling, so sample peak alone cannot show whether N-15 is fixed.
          truePeakDb: result.truePeakDb,
          rmsDb: loudness.sampleRmsDb(channels),
          gatedBlockCount: result.gatedBlockCount,
          durationSec: buffer.duration,
        };
      };

      for (let r = 0; r < repeatsArg; r++) {
        runs.push(await render(mixModule.applyGenreMixDefaults(genre.sequencer_pattern, genre.id)));
      }
      // Median across repeats: the renderer's noise-based drum voices are not seeded,
      // so a single render carries a few tenths of a dB of run-to-run variation.
      const median = (key) => {
        const sorted = runs.map((run) => run[key]).sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
      };
      const spread = Math.max(...runs.map((r) => r.integratedLufs)) -
        Math.min(...runs.map((r) => r.integratedLufs));

      return {
        arrangedLufs: median("integratedLufs"),
        arrangedPeakDb: median("samplePeakDb"),
        arrangedTruePeakDb: median("truePeakDb"),
        arrangedRmsDb: median("rmsDb"),
        gatedBlockCount: runs[0].gatedBlockCount,
        limiterKind: [...limiterKinds].join("+") || "unknown",
        withinGenreSpreadDb: spread,
        durationSec: runs[0].durationSec,
        sampleRate: 44100,
      };
    },
    { genreId, trimDb, bars, repeats, makeupDb: masterMakeupDb }
  );

  /**
   * Merge this call's limiter paths into the genre's union — on the **Node** side.
   *
   * `measureGenre`'s body runs inside the page, so it cannot touch this map (the first attempt did
   * and threw `ReferenceError: observedLimiterKinds is not defined` from `page.evaluate`); the page
   * returns the paths it saw and the merge happens here.
   *
   * The warm-up render is excluded deliberately: it exists *because* the first render in a fresh page
   * is the degraded one (cold-start −15.55 LUFS against −12.68 warm), so counting its path would
   * mark that genre `worklet+fallback` and abort a run that is in fact entirely on the worklet.
   */
  const seen = observedLimiterKinds.get(genreId) ?? new Set();
  if (!discard) {
    // Split on "+" so a round that itself mixed both paths lands as two entries, never as one
    // string that would then read `worklet+worklet+fallback` in the union.
    for (const kind of String(measured?.limiterKind ?? "").split("+")) {
      if (kind && kind !== "unknown") seen.add(kind);
    }
    observedLimiterKinds.set(genreId, seen);
  }
  return measured;
}

/** Renders the untouched genre file (legacy placeholder mix), trim 0. */
async function measureLegacy(page, genreId) {
  measurementsSinceReload += 1;
  return page.evaluate(
    async ({ genreId: id, bars: barsArg }) => {
      const [wav, genresModule, loudness, trackUtils] = await Promise.all([
        import("/src/audio/WavExporter.ts"),
        import("/src/data/genres/index.ts"),
        import("/src/test/helpers/loudness.ts"),
        import("/src/utils/trackUtils.ts"),
      ]);
      const genre = genresModule.ALL_GENRES.find((g) => g.id === id);
      const buffer = await wav.renderPatternOffline(genre.sequencer_pattern, {
        bars: barsArg,
        drumKit: trackUtils.getDefaultDrumKitForGenre(genre),
        loudnessTrimDb: 0,
      });
      const channels = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
      const result = loudness.measureLoudness(channels, buffer.sampleRate);
      return {
        legacyLufs: result.integratedLufs,
        legacyPeakDb: result.samplePeakDb,
        legacyTruePeakDb: result.truePeakDb,
        legacyRmsDb: loudness.sampleRmsDb(channels),
      };
    },
    { genreId, bars }
  );
}

/**
 * Which limiter the offline path actually installs, plus its measured ceiling behaviour.
 *
 * The V-03 true-peak check compares the *measured* peak against -1.0 dBTP, and the limiter
 * is the only thing enforcing it. The two paths behave differently — the AudioWorklet is a
 * hard lookahead ceiling, the `DynamicsCompressor` fallback is soft — so a report that does
 * not say which one rendered cannot be interpreted. This probe answers it once per run
 * instead of leaving it to be guessed from the numbers.
 */
async function probeLimiterKind(page) {
  return page.evaluate(async () => {
    const [{ buildMasterGraph }, limiterModule] = await Promise.all([
      import("/src/audio/masterGraph.ts"),
      import("/src/audio/MasterLimiter.ts"),
    ]);
    const ctx = new OfflineAudioContext(2, 4096, 44100);
    const graph = buildMasterGraph(ctx, { loudnessTrimDb: 0 });
    try {
      const kind = await graph.limiter.ready;
      return {
        kind,
        // The contract ceiling and the ceiling the detector actually targets. The gap is
        // the documented detector margin; both are reported so a reader can tell which one
        // the measured true peaks should be compared against.
        contractCeilingDb: limiterModule.MASTER_LIMITER_CEILING_DB,
        internalCeilingDb: limiterModule.MASTER_LIMITER_INTERNAL_CEILING_DB,
        latencySeconds: graph.limiter.latencySeconds ?? null,
        hasWorkletApi: typeof ctx.audioWorklet?.addModule === "function",
      };
    } finally {
      try {
        graph.destroy();
      } catch {
        /* best effort */
      }
    }
  });
}

async function listGenreIds(page) {
  return page.evaluate(async () => {
    const { ALL_GENRES } = await import("/src/data/genres/index.ts");
    return ALL_GENRES.map((g) => ({ id: g.id, category: g.category }));
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
  console.log("  🔊 GROOVE LAB genre loudness baseline (BS.1770 LUFS, offline render)");
  console.log(`  target: ${baseUrl}   bars=${bars}   repeats=${repeats}${limit ? `   limit=${limit}` : ""}`);
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
      // The limiter's install failure is a `console.warn`, and a silent fallback is exactly how a
      // render can come out above the true-peak ceiling without anything saying so. Forward it.
      else if (/MasterLimiter/.test(msg.text())) process.stderr.write(`  [limiter] ${msg.text()}\n`);
    });
    // Serve a bare same-origin document instead of the app shell: the app boots React,
    // registers a service worker and can navigate/reload, which destroys the evaluate
    // context mid-run. This page exists only for this measurement and ships nothing.
    await page.route("**/__loudness_probe__.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><head><meta charset=\"utf-8\"><title>groove loudness probe</title></head><body></body></html>",
      })
    );
    if (forceFallback) {
      /**
       * Make the platform refuse to register the limiter worklet.
       *
       * A `page.route` 404 on `/limiterWorklet.js` was tried first and **does not work**: the module
       * is fetched by the audio rendering thread, which Playwright request routing does not see, so
       * every render still reported `limiterKind: "worklet"` while the route was installed. Tainting
       * the API before any app code runs is the honest stand-in for a platform (or a CSP, or a
       * blocked asset) that cannot load the processor — it is the same rejection `addModule` gives.
       */
      await page.addInitScript(() => {
        if (typeof AudioWorklet === "undefined") return;
        AudioWorklet.prototype.addModule = function forcedFallback() {
          return Promise.reject(new DOMException("forced fallback (measurement mode)", "NotSupportedError"));
        };
      });
      console.log("Forcing the compressor fallback (addModule always rejects) — not a baseline run.");
    }
    await page.goto(`${baseUrl}/__loudness_probe__.html`, { waitUntil: "domcontentloaded", timeout: 60000 });

    let catalog = await listGenreIds(page);
    if (genreFilter.length > 0) {
      const wanted = new Set(genreFilter);
      const unknown = genreFilter.filter((id) => !catalog.some((c) => c.id === id));
      if (unknown.length) throw new Error(`unknown --genres id(s): ${unknown.join(", ")}`);
      catalog = genreFilter.map((id) => catalog.find((c) => c.id === id));
    } else if (limit > 0) {
      catalog = catalog.slice(0, limit);
    }
    console.log(`Measuring ${catalog.length} genre(s)...`);
    if (sampleCount === 0) {
      console.log(`[start] ${catalog.length} genres → ${path.relative(ROOT, outPath)} (progress: ${path.relative(ROOT, outPath)}.progress.json) at ${new Date().toISOString()}`);
    }
    let limiterProbe = null;
    try {
      limiterProbe = await probeLimiterKind(page);
      console.log(
        `Limiter path: ${limiterProbe.kind} (contract ${limiterProbe.contractCeilingDb} dBTP, ` +
          `detector targets ${limiterProbe.internalCeilingDb} dBTP, lookahead ${limiterProbe.latencySeconds}s, ` +
          `AudioWorklet API ${limiterProbe.hasWorkletApi ? "available" : "missing"})`
      );
    } catch (error) {
      console.log(`Limiter probe failed: ${error.message}`);
    }

    /**
     * Warm-up render, discarded.
     *
     * The **first** offline render in a fresh page does not go through the limiter worklet — its
     * module is registered lazily — so it falls back to the dynamics compressor, and for a genre
     * pinned at the ceiling that is not a rounding difference: `kawaii-future-bass` renders at
     * −15.55 LUFS cold and −12.68 LUFS warm, measured three times each. Every measurement below
     * therefore throws its first render away.
     *
     * This is also why a one-genre run must not be compared with a full-library baseline: its single
     * render *is* the cold one. (The export path has the same hazard and solves it differently — it
     * reports `limiterKind: "fallback"` to the user instead of hiding it.)
     */
    try {
      const warmupStartedAt = Date.now();
      await measureGenre(page, catalog[0].id, null, { discard: true });
      console.log(`Warm-up render (discarded): ${catalog[0].id} (${Date.now() - warmupStartedAt} ms)`);
    } catch (error) {
      console.log(`Warm-up render failed (continuing): ${error.message}`);
    }

    /**
     * Long-page degradation, and the two things that contain it.
     *
     * Measured 2026-09-20 with `scripts/probe_page_degradation.mjs`: in a page that has already performed
     * ~50-75 offline renders, the *same* genre renders up to **+2.45 dB louder** — `alternative-rock`
     * at −12.711 LUFS in a fresh page and −10.259 once 75 other genres have rendered, three identical
     * renders each way, with the true peak still pinned at the ceiling and the pattern untouched. It
     * survives `limiter.dispose()` and `ctx.close()` (so it is not the limiter node leaking), it is
     * deterministic per page, and a page reload clears it completely.
     *
     * That number is not academic: −10.259 is exactly the value the first full re-record published for
     * that row, which is why 5 of 12 re-checked rows came back 0.5-2.5 dB away from the freshly
     * recorded baseline and why that baseline was never landed. A measuring device that silently
     * changes what it measures halfway through a two-hour run cannot be trusted for a ±0.35 dB gate,
     * so:
     *
     *   1. the page is recycled every `reloadEvery` measurements (default 12, against a measured onset
     *      at 45-60; a 15-render cycle held the sentinel within ±0.12 dB across 135 renders), and the
     *      fresh page is warmed up again with a discarded render;
     *   2. a **sentinel** genre is re-measured after every recycle and the run aborts if it moved more
     *      than `SENTINEL_TOLERANCE_DB` — so a run that degrades anyway publishes nothing.
     */
    const sentinelId = catalog.some((c) => c.id === SENTINEL_GENRE_ID) ? SENTINEL_GENRE_ID : catalog[0].id;
    let sentinelLufs = null;
    const checkSentinel = async (context) => {
      const sentinel = await measureGenre(page, sentinelId, null);
      if (!Number.isFinite(sentinel?.arrangedLufs)) return;
      if (sentinelLufs === null) {
        sentinelLufs = sentinel.arrangedLufs;
        console.log(`  sentinel ${sentinelId}: ${sentinelLufs.toFixed(3)} LUFS (${context})`);
        return;
      }
      const drift = sentinel.arrangedLufs - sentinelLufs;
      // Logged on every check, not only on failure: the sentinel's stability *is* the evidence that
      // the page recycling is working, so a run's log has to show it.
      console.log(
        `  sentinel ${sentinelId}: ${sentinel.arrangedLufs.toFixed(3)} LUFS ` +
          `(Δ ${drift >= 0 ? "+" : ""}${drift.toFixed(3)} dB, ${context})`
      );
      if (Math.abs(drift) > SENTINEL_TOLERANCE_DB) {
        console.error(
          `\n❌ the measuring page degraded: sentinel ${sentinelId} measured ${sentinelLufs.toFixed(3)} LUFS ` +
            `and now measures ${sentinel.arrangedLufs.toFixed(3)} (Δ ${drift >= 0 ? "+" : ""}${drift.toFixed(3)} dB) ${context}.\n` +
            "   A page that has rendered too many genres renders the same genre differently, so no row\n" +
            "   from this run can be published. Nothing was written."
        );
        process.exit(1);
      }
    };
    const recyclePageIfDue = async () => {
      if (reloadEvery <= 0 || measurementsSinceReload < reloadEvery) return;
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
      measurementsSinceReload = 0;
      // The first render in a reloaded page is the cold one (lazy worklet registration), exactly like
      // the run's opening render, so it is discarded the same way.
      await measureGenre(page, catalog[0].id, null, { discard: true });
      measurementsSinceReload = 0;
      console.log(`  recycled the measuring page after ${reloadEvery} measurement(s)`);
      await checkSentinel("after page reload");
    };

    if (sampleCount > 0) {
      const ids = sampleGenreIds(
        catalog.map((c) => c.id),
        sampleCount
      );
      if (!fs.existsSync(reportPath)) {
        throw new Error(`--sample needs a readable report: ${path.relative(ROOT, reportPath)}`);
      }
      const baseline = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      if (!baseline?.genres) {
        throw new Error(`--sample needs a report with a genre table: ${path.relative(ROOT, reportPath)}`);
      }
      console.log(
        `Re-rendering ${ids.length} genre(s) to check the report still describes the code ` +
          `(tolerance ±${LOUDNESS_FRESHNESS_TOLERANCE_DB} dB)...`
      );
      const measuredNow = [];
      for (const [index, id] of ids.entries()) {
        const startedAt = Date.now();
        const arranged = await measureGenre(page, id, null);
        const expected = baseline.genres[id]?.arrangedLufs;
        measuredNow.push({ genreId: id, arrangedLufs: arranged.arrangedLufs });
        const delta = typeof expected === "number" ? arranged.arrangedLufs - expected : Number.NaN;
        console.log(
          `  [${String(index + 1).padStart(3)}/${ids.length}] ${id.padEnd(24)}` +
            ` report ${typeof expected === "number" ? expected.toFixed(2) : "—"} LUFS` +
            `   now ${arranged.arrangedLufs.toFixed(2)} LUFS` +
            `   Δ ${Number.isFinite(delta) ? (delta >= 0 ? "+" : "") + delta.toFixed(2) : "n/a"}` +
            `  (${Date.now() - startedAt} ms)`
        );
      }
      assertSingleLimiterPath(ids, "sample check");
      const drift = loudnessDrift(measuredNow, baseline.genres, LOUDNESS_FRESHNESS_TOLERANCE_DB);
      console.log("===============================================================");
      if (drift.length === 0) {
        console.log(
          `✅ The loudness report still describes the code (${ids.length} genre(s) re-rendered, ` +
            `all within ±${LOUDNESS_FRESHNESS_TOLERANCE_DB} dB).`
        );
      } else {
        console.error(`❌ ${drift.length} of ${ids.length} sampled genre(s) no longer match the report:`);
        for (const row of drift) {
          console.error(
            `   ${row.genreId}: report ${Number.isFinite(row.expected) ? row.expected.toFixed(2) : "missing"}` +
              ` LUFS, now ${row.actual.toFixed(2)} LUFS (Δ ${Number.isFinite(row.delta) ? row.delta.toFixed(2) : "n/a"} dB)`
          );
        }
        console.error(
          "\n   Re-record with `node scripts/measure_genre_loudness.mjs` and update src/data/genreMix.ts" +
            " (`node scripts/apply_loudness_trims.mjs`) before landing."
        );
        process.exitCode = 1;
      }
      console.log("===============================================================");
      return;
    }

    // Pass 1 — legacy (before) + arranged at unity trim.
    // The sentinel's reference value comes from this warmed-up fresh page, so every later check is a
    // comparison against a page that was known good rather than against a page that had already run.
    await checkSentinel("start of run");
    const measured = [];
    for (const [index, entry] of catalog.entries()) {
      const startedAt = Date.now();
      try {
        await recyclePageIfDue();
        const legacy = await measureLegacy(page, entry.id);
        const arranged = await measureGenre(page, entry.id, null);
        measured.push({ ...entry, ...legacy, ...arranged, trimDb: 0 });
        // Flush progress every few genres: a long run that only writes its report at the end
        // looks exactly like a hang from the outside (and an interrupted run leaves nothing).
        if (measured.length % 5 === 0) {
          fs.writeFileSync(`${outPath}.progress.json`, `${JSON.stringify({ generatedBy: "measure_genre_loudness.mjs", partial: true, done: measured.length, total: catalog.length, genres: measured }, null, 0)}\n`);
        }
        // Fail fast rather than at the end: a full run is an hour of renders, and the check that
        // matters (one limiter path) is knowable after each genre.
        assertSingleLimiterPath([entry.id], "pass 1");
        process.stdout.write(
          `  [${String(index + 1).padStart(3)}/${catalog.length}] ${entry.id.padEnd(24)}` +
            ` legacy ${legacy.legacyLufs.toFixed(2)} LUFS   arranged ${arranged.arrangedLufs.toFixed(2)} LUFS` +
            `   ±${arranged.withinGenreSpreadDb.toFixed(2)} dB  (${Date.now() - startedAt} ms)\n`
        );
      } catch (error) {
        failures.push({ genreId: entry.id, pass: "unity", error: String(error.message || error) });
        process.stdout.write(`  [${String(index + 1).padStart(3)}/${catalog.length}] ${entry.id} FAILED: ${error.message}\n`);
      }
    }

    if (measured.length === 0) throw new Error("no genre could be measured");

    // Target = median arranged loudness in the chosen metric, so the library's
    // overall level stays put and only the spread is corrected.
    const arrangedSorted = measured.map((m) => m[METRIC.before]).sort((a, b) => a - b);
    const libraryMedianLufs = percentile(arrangedSorted, 50);
    /**
     * An explicit `--target` names the delivery level; without one the historical behaviour is
     * kept (match the library's own median), which is the right choice for a pure spread re-fit.
     */
    /**
     * How loud a genre can *physically* go: a true-peak ceiling minus its own peak-to-loudness
     * ratio. Measured with the limiter in place, which is the honest figure — anything above it
     * is simply absorbed by the limiter (a controlled test on `chicago-house` transferred 0% of
     * a +10 dB makeup step once it was pinned at the ceiling).
     */
    const LIMITER_CEILING_DBTP = -1.3;
    const achievableCeilingLufs = (entry, lufs, truePeak) => {
      const crest = Number.isFinite(truePeak) && Number.isFinite(lufs) ? truePeak - lufs : null;
      if (crest === null || crest <= 0) return null;
      return LIMITER_CEILING_DBTP - crest;
    };
    const categoryTargetOf = (entry) =>
      explicitTargetLufs !== null && Number.isFinite(explicitTargetLufs)
        ? explicitTargetLufs
        : CATEGORY_TARGET_LUFS[entry.category] ?? DEFAULT_CATEGORY_TARGET_LUFS;
    for (const entry of measured) {
      // `arrangedTruePeakDb` already carries the limiter's effect at the measured operating
      // point, so the crest derived from it is the one the ceiling actually applies to.
      const ceiling = achievableCeilingLufs(entry, entry[METRIC.before], entry.arrangedTruePeakDb);
      const wanted = categoryTargetOf(entry);
      entry.categoryTargetLufs = Number(wanted.toFixed(2));
      entry.achievableLufs = ceiling === null ? null : Number(ceiling.toFixed(2));
      // `targetLufs` per genre: the category's goal, or the crest-limited maximum when lower.
      entry.targetLufs = Number((ceiling === null ? wanted : Math.min(wanted, ceiling)).toFixed(3));
      entry.crestDb = Number.isFinite(entry.arrangedTruePeakDb)
        ? Number((entry.arrangedTruePeakDb - entry[METRIC.before]).toFixed(3))
        : null;
      if (entry.achievableLufs !== null && entry.achievableLufs < wanted - 0.05) {
        entry.targetCappedByDynamics = true;
      }
    }
    const targetLufs = libraryMedianLufs;
    const targetFor = (entry) => entry.targetLufs;
    const clampHits = { min: 0, max: 0, total: 0 };
    const noteClamp = (raw) => {
      if (raw < TRIM_MIN_DB) clampHits.min++;
      if (raw > TRIM_MAX_DB) clampHits.max++;
      if (raw < TRIM_MIN_DB || raw > TRIM_MAX_DB) clampHits.total++;
    };
    for (const entry of measured) {
      const raw = targetFor(entry) - entry[METRIC.before];
      noteClamp(raw);
      entry.trimDb = Number(clamp(raw, TRIM_MIN_DB, TRIM_MAX_DB).toFixed(2));
      entry.trimIterations = 0;
    }
    const capped = measured.filter((e) => e.targetCappedByDynamics);
    console.log(
      `\nTargets: ${explicitTargetLufs !== null ? `explicit ${targetLufs.toFixed(2)} LUFS` : "per category"}` +
        `   [library median ${libraryMedianLufs.toFixed(2)}]`
    );
    if (explicitTargetLufs === null) {
      for (const [cat, lufs] of Object.entries(CATEGORY_TARGET_LUFS)) {
        const n = measured.filter((e) => e.category === cat).length;
        console.log(`  ${cat.padEnd(14)} target ${String(lufs).padStart(6)} LUFS   (${n} genre(s))`);
      }
    }
    if (capped.length > 0) {
      console.log(
        `  ${capped.length}/${measured.length} genre(s) capped by their own dynamics: their ` +
          `peak-to-loudness ratio is too wide for their category target at a ` +
          `${LIMITER_CEILING_DBTP} dBTP ceiling, so they stop at the loudest level it allows.`
      );
    }

    /**
     * Passes 2..N — solve the trim instead of assuming one subtraction is enough.
     *
     * A single `target - arranged` is only exact if the measured quantity is linear in
     * gain. BS.1770 gated integrated loudness is *not*: the relative gate (-10 LU below the
     * ungated mean) changes which blocks are included as the level moves, so a genre with a
     * wide dynamic range loses less loudness than the dB cut suggests. The first version of
     * this script assumed linearity and left a 1.97 dB post-trim spread against a 1.5 dB
     * gate — not because the trims were wrong to begin with, but because they were never
     * re-checked after being applied.
     *
     * Each round therefore only re-renders the genres that are still outside the tolerance
     * and moves each by its *measured* residual, which converges in two or three rounds for
     * a handful of high-crest genres and costs nothing for the rest.
     */
    const MAX_TRIM_ROUNDS = 5;
    /** Half the 1.5 dB gate: converging tighter than this buys nothing. */
    const TRIM_TOLERANCE_DB = 0.2;
    const clampLimited = [];
    const stillOutside = [];
    /**
     * `trimDb` is only ever changed immediately before that genre is rendered again.
     *
     * The first version of this loop moved the trim first and re-rendered later, so a genre
     * that moved on the final round ended the run with a trim and **no measurement at that
     * trim** — the report then carried 26 nulls and the gate could not tell whether the
     * shipped trim had ever been verified. A trim that has not been measured at its final
     * value is not evidence, so the rule is now: measure, then decide, then (only if there is
     * another round) move.
     */
    let queue = measured.slice();
    let roundsRun = 0;
    for (let round = 1; round <= MAX_TRIM_ROUNDS; round++) {
      roundsRun = round;
      console.log(`\nTrim round ${round}: rendering ${queue.length} genre(s)...`);
      for (const [index, entry] of queue.entries()) {
        try {
          await recyclePageIfDue();
          const trimmed = await measureGenre(page, entry.id, entry.trimDb);
          entry.trimmedLufs = trimmed.arrangedLufs;
          entry.trimmedPeakDb = trimmed.arrangedPeakDb;
          entry.trimmedTruePeakDb = trimmed.arrangedTruePeakDb;
          entry.trimmedRmsDb = trimmed.arrangedRmsDb;
          entry.trimIterations = round;
          assertSingleLimiterPath([entry.id], `trim round ${round}`);
        } catch (error) {
          failures.push({ genreId: entry.id, pass: `trim-round-${round}`, error: String(error.message || error) });
        }
        if ((index + 1) % 10 === 0 || index === queue.length - 1) {
          process.stdout.write(`  round ${round}: ${index + 1}/${queue.length}\n`);
        }
      }

      // Decide who moves next, but do not touch their trims yet.
      const next = [];
      for (const entry of measured) {
        const residual = targetFor(entry) - entry.trimmedLufs;
        if (!Number.isFinite(residual) || Math.abs(residual) <= TRIM_TOLERANCE_DB) continue;
        const candidate = clamp(entry.trimDb + residual, TRIM_MIN_DB, TRIM_MAX_DB);
        if (candidate === entry.trimDb) {
          // Already pinned at the clamp: no further progress is possible, and pretending
          // otherwise would just burn render time. Recorded as a clamp-limited residual.
          clampLimited.push({ id: entry.id, trimDb: entry.trimDb, residualDb: Number(residual.toFixed(3)) });
          continue;
        }
        next.push({ entry, trim: Number(candidate.toFixed(2)) });
      }
      if (next.length === 0) {
        console.log(`  converged after round ${round}`);
        break;
      }
      console.log(`  ${next.length} genre(s) still outside ±${TRIM_TOLERANCE_DB} dB`);
      for (const { entry, trim } of next) entry.trimDb = trim;
      queue = next.map((n) => n.entry);
    }

    for (const entry of measured) {
      const residual = targetFor(entry) - entry.trimmedLufs;
      if (Number.isFinite(residual) && Math.abs(residual) > TRIM_TOLERANCE_DB) {
        stillOutside.push({ id: entry.id, residualDb: Number(residual.toFixed(3)), trimDb: entry.trimDb, trimIterations: entry.trimIterations ?? 0 });
      }
    }
    if (stillOutside.length > 0) {
      console.log(
        `\n  informational: ${stillOutside.length} genre(s) finished outside ±${TRIM_TOLERANCE_DB} dB after ${roundsRun} round(s); ` +
          `worst ${stillOutside
            .slice()
            .sort((a, b) => Math.abs(b.residualDb) - Math.abs(a.residualDb))[0]
            .residualDb.toFixed(2)} dB`
      );
    }

    const spreadPass = (legacyKey, beforeKey, afterKey) => ({
      legacyBefore: spreadOf(measured, legacyKey),
      arrangedBefore: spreadOf(measured, beforeKey),
      after: spreadOf(measured, afterKey),
    });
    const spread = {
      ...spreadPass(METRIC.legacy, METRIC.before, METRIC.after),
      metric: METRIC.label,
      lufs: spreadPass("legacyLufs", "arrangedLufs", "trimmedLufs"),
      rms: spreadPass("legacyRmsDb", "arrangedRmsDb", "trimmedRmsDb"),
    };

    assertSingleLimiterPath(measured.map((entry) => entry.id), "full run");

    /**
     * Publish each row's **union** of limiter paths, not just the arranged pass's.
     *
     * A genre re-rendered across trim rounds can meet both paths; the row is one number, so it has to
     * say which renderers produced it. This is also the field that made the abandoned +1.75 dBTP
     * re-record readable at all.
     */
    for (const entry of measured) {
      const seen = observedLimiterKinds.get(entry.id);
      if (seen && seen.size > 0) entry.limiterKind = [...seen].join("+");
    }

    const report = {
      generatedBy: "scripts/measure_genre_loudness.mjs",
      generatedAt: new Date().toISOString(),
      subset: isSubsetRun,
      limit: limit > 0 ? limit : null,
      genreCount: measured.length,
      bars,
      repeats,
      limiter: limiterProbe,
      trimConvergence: {
        rounds: roundsRun,
        toleranceDb: TRIM_TOLERANCE_DB,
        maxRounds: MAX_TRIM_ROUNDS,
        stillOutside,
        clampLimited,
      },
      sampleRate: 44100,
      path: "offline: renderPatternOffline() via Vite dev server (no live AudioContext, post-limiter)",
      metric: {
        primary: metricKey,
        primaryLabel: METRIC.label,
        loudness:
          "ITU-R BS.1770-4 gated integrated loudness (LUFS), K-weighting designed analytically, 400 ms blocks / 75% overlap, -70 LUFS absolute + -10 LU relative gate",
        rms: "unweighted broadband RMS over the whole render, dBFS (cross-check for windowed live-path probes)",
        peak: "sample peak in dBFS (true-peak/oversampled metering is NOT implemented)",
        trimPlacement: "master trim applied pre-limiter (same relative position as the live engine)",
        note: "the gate ignores silence-between-hits, which is why sparse genres read far higher in LUFS than in windowed RMS",
      },
      targetLufs: Number(targetLufs.toFixed(3)),
      target: Number(targetLufs.toFixed(3)),
      targetSource: explicitTargetLufs !== null ? "explicit" : "per-category",
      categoryTargets: explicitTargetLufs !== null ? null : CATEGORY_TARGET_LUFS,
      cappedByDynamics: measured.filter((e) => e.targetCappedByDynamics).map((e) => e.id),
      libraryMedianLufs: Number(libraryMedianLufs.toFixed(3)),
      masterMakeupDb: masterMakeupDb === undefined ? "graph-default" : masterMakeupDb,
      targetMetric: METRIC.label,
      trimRangeDb: { min: TRIM_MIN_DB, max: TRIM_MAX_DB },
      clampHits,
      spread,
      genres: Object.fromEntries(
        measured.map((entry) => [
          entry.id,
          {
            category: entry.category,
            legacyLufs: Number(entry.legacyLufs.toFixed(3)),
            legacyPeakDb: Number(entry.legacyPeakDb.toFixed(3)),
            legacyRmsDb: Number(entry.legacyRmsDb.toFixed(3)),
            arrangedLufs: Number(entry.arrangedLufs.toFixed(3)),
            arrangedPeakDb: Number(entry.arrangedPeakDb.toFixed(3)),
            arrangedTruePeakDb: Number.isFinite(entry.arrangedTruePeakDb)
              ? Number(entry.arrangedTruePeakDb.toFixed(3))
              : null,
            arrangedRmsDb: Number(entry.arrangedRmsDb.toFixed(3)),
            /**
             * Which master limiter this genre's renders installed.
             *
             * Kept in the published row because a report that does not say so cannot be interpreted:
             * `worklet` is the hard lookahead ceiling, `fallback` is the compressor (whose own
             * warning admits it has no true-peak ceiling), and `worklet+fallback` means the page used
             * both within one genre. The 2026-09-18 re-record's +1.75 dBTP rows were only traceable
             * at all by re-running with this field, and the run-level `report.limiter` is a single
             * probe that can disagree with what the genre rows actually did.
             */
            limiterKind: entry.limiterKind ?? "unknown",
            trimDb: entry.trimDb,
            trimmedLufs: Number.isFinite(entry.trimmedLufs) ? Number(entry.trimmedLufs.toFixed(3)) : null,
            trimmedPeakDb: Number.isFinite(entry.trimmedPeakDb) ? Number(entry.trimmedPeakDb.toFixed(3)) : null,
            trimmedTruePeakDb: Number.isFinite(entry.trimmedTruePeakDb) ? Number(entry.trimmedTruePeakDb.toFixed(3)) : null,
            trimmedRmsDb: Number.isFinite(entry.trimmedRmsDb) ? Number(entry.trimmedRmsDb.toFixed(3)) : null,
            withinGenreSpreadDb: Number(entry.withinGenreSpreadDb.toFixed(3)),
            // Why this genre stopped where it did, so a reader can tell a fitted target from a
            // crest-limited one without re-deriving it.
            categoryTargetLufs: entry.categoryTargetLufs,
            targetLufs: entry.targetLufs,
            achievableLufs: entry.achievableLufs,
            crestDb: entry.crestDb,
            targetCappedByDynamics: Boolean(entry.targetCappedByDynamics),
            gatedBlockCount: entry.gatedBlockCount,
            // How many render rounds the trim needed before it measured on target. 0 means
            // the first subtraction was already within tolerance.
            trimIterations: entry.trimIterations ?? 0,
          },
        ])
      ),
      unmeasured: failures,
    };

    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

    console.log("\n---------------------------------------------------------------");
    console.log(`  genres measured      : ${report.genreCount}${failures.length ? ` (${failures.length} failure(s))` : ""}`);
    console.log(`  target (median LUFS) : ${report.targetLufs}`);
    const printSpread = (label, s) =>
      console.log(
        `  ${label.padEnd(26)}: p10 ${s.p10.toFixed(2)}  p90 ${s.p90.toFixed(2)}  ` +
          `p90−p10 ${s.p90p10.toFixed(2)} dB   min ${s.min.toFixed(2)} (${s.minGenre})  ` +
          `max ${s.max.toFixed(2)} (${s.maxGenre})`
      );
    console.log(`  primary metric       : ${METRIC.label}`);
    printSpread(`before/legacy [${metricKey}]`, spread.legacyBefore);
    printSpread(`before/arranged [${metricKey}]`, spread.arrangedBefore);
    printSpread(`after [${metricKey}]`, spread.after);
    // The other view is always reported so the two metrics can be compared honestly.
    const other = metricKey === "lufs" ? spread.rms : spread.lufs;
    printSpread(`after [${metricKey === "lufs" ? "rms" : "lufs"}]`, other.after);
    console.log(
      `  clamp hits           : ${clampHits.total} (min ${clampHits.min}, max ${clampHits.max})`
    );

    // N-15 / E-12: the master ceiling is a *true*-peak ceiling, so report how many
    // genres still exceed it. Before the lookahead limiter landed this was 121/159
    // genres above 0 dBFS on the sample-peak metric, hard-clipped by the 16-bit encoder.
    // `report.genres` is an object keyed by genre id, not an array.
    const truePeakRows = Object.values(report.genres).filter(
      (g) =>
        Number.isFinite(g.trimmedTruePeakDb) ||
        Number.isFinite(g.arrangedTruePeakDb) ||
        Number.isFinite(g.legacyTruePeakDb)
    );
    if (truePeakRows.length > 0) {
      const pick = (g) =>
        Number.isFinite(g.trimmedTruePeakDb)
          ? g.trimmedTruePeakDb
          : Number.isFinite(g.arrangedTruePeakDb)
            ? g.arrangedTruePeakDb
            : g.legacyTruePeakDb;
      const worst = Object.entries(report.genres)
        .map(([id, g]) => ({ id, db: pick(g) }))
        .filter((r) => Number.isFinite(r.db))
        .sort((a, b) => b.db - a.db);
      const overCeiling = worst.filter((r) => r.db > CEILING_DBTP).length;
      console.log(
        `  true peak (dBTP)     : worst ${worst[0] ? `${worst[0].db.toFixed(2)} (${worst[0].id})` : "n/a"}` +
          `   above ${CEILING_DBTP} dBTP: ${overCeiling}/${worst.length}`
      );
      if (overCeiling > 0) {
        console.log(
          `    ⚠️  ${overCeiling} genre(s) still exceed the ${CEILING_DBTP} dBTP ceiling:` +
            ` ${worst.filter((r) => r.db > CEILING_DBTP).slice(0, 5).map((r) => `${r.id} ${r.db.toFixed(2)}`).join(", ")}`
        );
      }
    }
    console.log(`  report               : ${path.relative(ROOT, outPath)}`);
    console.log("===============================================================");
  } finally {
    await browser.close();
    server.kill("SIGTERM");
  }

  if (failures.length > 0) {
    console.error(`\n⚠️  ${failures.length} measurement(s) failed — see report.unmeasured`);
  }
})();
