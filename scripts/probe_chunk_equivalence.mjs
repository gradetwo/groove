#!/usr/bin/env node
/**
 * **Is a chunked render the same music as a whole one?** The measurement `docs/HEADLESS_CORE_PLAN.md` §② asks for.
 *
 * ## Why this exists
 *
 * `RUST_DECISION.md` asserts "chunking is not equivalent"; the owner's decision is that chunking gets built anyway,
 * which means the assertion has to become a number. The number cannot be "identical", and that is not a shortcut: a
 * chunk boundary is a crossfade by construction, so the criterion has to be a **tolerance**, and the tolerance has to
 * be calibrated rather than picked.
 *
 * So this probe measures, in one page at a time, on the app's own renderer:
 *
 *   1. the **wall clock** of a whole render and of the same piece as chunks, with the renderer's own per-phase sink;
 *   2. the **whole-vs-whole floor** — the same render rendered twice — so a tolerance sits above the measurement's own
 *      noise rather than at zero;
 *   3. **whole vs chunked at a sweep of pre-roll lengths**, using the project's own analysis helpers
 *      (`helpers/timbre`'s 13-band fingerprint, `helpers/loudness`'s integrated LUFS and true peak) exactly as
 *      `probe_headless_parity.ts` does — plus the two statistics with the discriminating power a whole-file aggregate
 *      lacks: the largest sample difference anywhere, and the error against signal in the seam window;
 *   4. **the deletion test** — the same code with `preRollSec: 0`, which is "cut at the boundary". If that does not
 *      fail the criterion the pre-roll arms pass, the criterion is decoration.
 *
 * ## Why the driver is a loop over short calls
 *
 * A headless page does not survive an open-ended amount of audio work: one page rendered about 99 s of audio (three
 * 12-bar renders) before the renderer died and took the measurement with it, and the profile's "forty to a hundred and
 * twenty renders" is a **one-bar** figure — the fixture, not the call count, is what exhausts it. The page module is
 * therefore a stateful API called one step at a time, and this driver **recycles the page** when it dies, replaying
 * `build` and `whole` on the fresh page (the only state a fresh page needs).
 *
 * ## Running it
 *
 *     node scripts/probe_chunk_equivalence.mjs --genre=chicago-house --bars=8 --pre-roll=0,0.8,1.6,2.5
 *     node scripts/probe_chunk_equivalence.mjs --mode=song --no-verdict
 *
 * Exit 1 when the criterion does not hold in the direction it has to (the pre-roll arms pass, the deletion test does
 * not). `--no-verdict` reports the arms without asserting anything — how a tolerance gets calibrated.
 */
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwright = require("playwright");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const arg = (name, fallback = "") => {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  if (hit) return hit.slice(name.length + 1);
  const at = process.argv.indexOf(name);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};

const genre = arg("--genre", "chicago-house");
const bars = Math.max(2, Number(arg("--bars", "8")) || 8);
const mode = arg("--mode", "loop") === "song" ? "song" : "loop";
const preRollPoints = (arg("--pre-roll", "0,0.8,1.6,2.5") || "")
  .split(",")
  .map((value) => (value.trim() === "default" ? undefined : Number(value)))
  .filter((value) => value === undefined || (Number.isFinite(value) && value >= 0));
const keepOpen = process.argv.includes("--keep-open");
const noVerdict = process.argv.includes("--no-verdict");
const port = Number(arg("--port", "5731")) || 5731;

const waitForServer = (url, timeoutMs = 60000) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - started > timeoutMs) reject(new Error(`dev server never came up on ${url}`));
          else setTimeout(tick, 250);
        });
    };
    tick();
  });

/**
 * **Warm Vite's module graph before the browser starts.** A dev server optimizes dependencies lazily, and discovering
 * a new one restarts the client — which reloads the page and takes the measurement with it. Fetching every module the
 * probe will import forces the server to discover the set up front.
 */
/**
 * **Warm Vite's module graph before the browser starts, transitively.**
 *
 * A dev server optimizes dependencies lazily and **reloads the client** when it discovers a new one. That reload is
 * what a two-and-a-half minute render cannot survive: the page module's state is reset between two `page.evaluate`
 * calls, and the next step then measures against an empty module. Fetching the entry points is not enough — the set
 * that matters is everything they import, transitively — so this walks the served sources for their own imports,
 * which forces the optimizer to see the whole set up front. It is bounded and read-only: nothing but `GET`s, no page.
 */
async function warmModuleGraph(url, entries, maxModules = 400) {
  const base = url.replace(/\/$/, "");
  const queue = [...entries];
  const seen = new Set();
  const failures = [];
  const get = (module) =>
    new Promise((resolve, reject) => {
      http
        .get(`${base}${module}`, (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            res.resume();
            reject(new Error(`${module} -> ${res.statusCode}`));
            return;
          }
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => resolve(body));
        })
        .on("error", reject);
    });

  while (queue.length && seen.size < maxModules) {
    const module = queue.shift();
    if (!module || seen.has(module)) continue;
    seen.add(module);
    let body;
    try {
      body = await get(module);
    } catch (error) {
      /** A module that cannot be fetched is recorded and skipped: the point is the optimizer's set, not a census. */
      failures.push(String(error instanceof Error ? error.message : error));
      continue;
    }
    if (!/\.(ts|tsx|js|mjs)(\?|$)/.test(module)) continue;
    for (const match of body.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (!specifier.startsWith("/src/") && !specifier.startsWith("/scripts/")) continue;
      const clean = specifier.split("?")[0];
      if (!seen.has(clean)) queue.push(clean);
    }
  }
  return { fetched: seen.size, failures };
}

const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
/**
 * `--force` on purpose: a long probe must not measure a transform cache. Vite re-transforms the page module when the
 * file changes, but a driver run that starts before that re-transform is a run against the previous source — which is
 * how a step that had just been instrumented printed nothing at all.
 */
const server = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort", "--force"], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => (serverLog += chunk.toString()));
server.stderr.on("data", (chunk) => (serverLog += chunk.toString()));

const PAGE = "/scripts/probe_chunk_equivalence.html";
const MODULE = "/scripts/lib/chunkProbePage.mjs";

/** One page, rebuilt when it dies. The only cross-step state is inside the page, so a death is a restart. */
class ProbeSession {
  constructor(url) {
    this.url = url;
    this.browser = null;
    this.page = null;
  }

  async open() {
    await this.close();
    this.browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
    this.page = await this.browser.newPage();
    console.error("  [page] new page");
    this.page.on("pageerror", (error) => console.error("[page]", error.message));
    this.page.on("console", (message) => {
      /** Every page log, not only errors: the page's own diagnostics are how a measurement is bisected. */
      if (message.type() === "error") console.error("[page console]", message.text());
      else if (message.text().startsWith("[page]")) console.error(`  ${message.text()}`);
    });
    await this.page.goto(`${this.url}${PAGE.replace(/^\//, "")}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    return this;
  }

  async close() {
    try {
      await this.browser?.close();
    } catch {
      // A browser that already died is the case this class exists for.
    }
    this.browser = null;
    this.page = null;
  }

  /** One step, with a page rebuild and a retry if the renderer died. */
  async step(name, fn, attempts = 3) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        if (!this.page) await this.open();
        return await fn(this.page);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`  [step ${name} attempt ${attempt}/${attempts}] ${message.split("\n")[0]}`);
        await this.close();
        if (attempt === attempts) throw error;
      }
    }
    throw new Error(`step ${name} never ran`);
  }

  /**
   * One step, dispatched by the page's own bootstrap.
   *
   * The import happens **in the page's HTML**, not in this callback: `import()` written here is transformed by Vite
   * into a browser-side import that gets its own module instance per call, so the page module's state was written by
   * one instance and read by another — the probe said "this page has no fixture" immediately after building one. The
   * page's dispatcher also returns its step counter, which the driver checks: a page that has been reloaded behind
   * the driver's back is a page whose counter went backwards, and that must be a loud failure rather than a
   * measurement of a fresh, empty module.
   */
  async run(step, arg) {
    const result = await this.step(step, (page) =>
      page.evaluate(
        (input) => window.__chunkProbeStep(input.step, input.arg),
        { step,
          arg }
      )
    );
    /**
     * `steps` is how many dispatches this **page** has served. It is recorded, not asserted on: a page that Vite
     * reloaded behind the driver's back reports a smaller number, and the honest response to that is to keep going —
     * every step now carries its own inputs, so a fresh page is a valid page. What must never be silent is a step that
     * returns nothing, so the value is checked where it is used.
     */
    if (result.value === undefined || result.value === null) {
      throw new Error(`step ${step} returned nothing on page step ${result.steps}`);
    }
    return result.value;
  }

  /** Build + whole render + (optionally) one arm, in a single call — see `chunkProbePage.measure`. */
  measure(request) {
    return this.run("measure", request);
  }

  /** The pure cut: slice the whole render, never re-render — see `chunkProbePage.cut`. */
  cut(request) {
    return this.run("cut", request);
  }

  collected() {
    return this.run("collected");
  }
}

let exitCode = 0;
const session = new ProbeSession(`http://127.0.0.1:${port}/`);
try {
  const url = `http://127.0.0.1:${port}/`;
  await waitForServer(url);
  const warmed = await warmModuleGraph(url, [
    "/scripts/probe_chunk_equivalence.html",
    "/scripts/lib/chunkProbePage.mjs",
  ]);
  console.error(
    `  [vite] warmed ${warmed.fetched} module(s) before opening a page` +
      (warmed.failures.length ? `, ${warmed.failures.length} unfetchable` : "")
  );
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const options = { genre, bars, mode };
  /**
   * One call per step: build, render the whole piece, then one arm. A Vite reload between calls wipes the page
   * module's state, so a step that assumed the previous call's state would measure against an empty module — which is
   * exactly the failure this layout replaces.
   */
  const wholeStep = await session.measure({ options });
  const fixture = wholeStep.fixture;
  let whole = wholeStep.whole;
  console.log(
    `chunk equivalence · ${fixture.genre} · ${fixture.mode} · ${fixture.bars} bars (clip ${fixture.clipBars}) split at bar ${fixture.split}`
  );
  console.log(
    `  reverb: decay ${whole.reverbDecaySec.toFixed(3)} s · impulse ${whole.impulseFrames} frames = ${whole.impulseSeconds.toFixed(3)} s`
  );
  console.log(
    `  whole: ${whole.seconds.toFixed(3)} s, ${whole.frames} frames, ${whole.wallMs.toFixed(0)} ms wall · whole-vs-whole band L1 ${whole.bandL1.toFixed(4)} dB, worst band ${whole.worstBand.worst.toFixed(4)} dB`
  );

  /**
   * The renderer's own default, the deletion test, and every sweep point. Each arm re-renders the whole piece in the
   * same call it measures against (the app's renderer is deterministic, so this is the reference, not a new take).
   */
  const plan = [
    { label: "default pre-roll", preRollSec: undefined },
    { label: "pre-roll deleted", preRollSec: 0 },
    ...preRollPoints.map((value) => ({ label: `${value} s`, preRollSec: value })),
  ];
  const seen = new Set();
  const arms = [];
  for (const job of plan) {
    const key = `${job.preRollSec}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const step = await session.measure({ options, arm: job });
    whole = step.whole;
    const result = step.arm;
    arms.push(result);
    console.log(
      `  arm ${String(job.label).padEnd(16)} preRoll ${String(result.preRollFrames).padStart(6)} f (${result.preRollSec.toFixed(3)} s)` +
        ` · worst diff ${fmt(result.worstDifference.db, 2)} dBFS` +
        ` (at seam ${fmt(result.worstDifference.seamDb, 2)})` +
        ` · seam sig/err ${fmt(result.seamRegion.ratioDb, 2)} dB` +
        ` · ${result.wallMs.toFixed(0)} ms`
    );
  }

  /**
   * The summary is assembled here, in Node, from the steps' own return values — **not** by asking the page to
   * recollect. The page's copy lives in module state that a Vite reload can wipe, and a summary that silently lost the
   * arms would be a report of a measurement that did not happen.
   */
  /**
   * **The cut arm last**, after every chunked arm, because it explains them: slicing the whole render cannot change a
   * sample, so the cut's difference from the whole is the analysis's own floor, and anything the splice adds on top of
   * it is what putting two renders together costs.
   */
  let cutResult = null;
  try {
    cutResult = await session.cut({});
  } catch (error) {
    console.error(`  cut arm failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  }
  if (cutResult) {
    console.log("");
    console.log(
      `  cut arm (slice the whole render at frame ${cutResult.splitFrame} = ${cutResult.splitSeconds.toFixed(3)} s, nothing re-rendered)`
    );
    console.log(
      `    cut vs whole: worst diff ${fmt(cutResult.vsWhole.db, 2)} dBFS · at seam ${fmt(cutResult.vsWhole.seamDb, 2)} dBFS · band L1 ${fmt(cutResult.bandL1, 4)} dB · LUFS delta ${fmt(cutResult.lufsDelta, 4)} · rms delta ${fmt(cutResult.rmsDelta, 4)} dB · cut ${cutResult.frames} frames vs whole ${cutResult.wholeFrames}`
    );
    console.log(
      `    ${"arm".padEnd(18)} ${"chunkA vs whole".padStart(17)} ${"chunkB vs whole".padStart(17)} ${"splice vs whole".padStart(17)}`
    );
    for (const arm of cutResult.arms) {
      console.log(
        `    ${String(arm.label).padEnd(18)} ${fmt(arm.alignment?.chunkA?.ratioDb, 2).padStart(17)} ${fmt(arm.alignment?.chunkB?.ratioDb, 2).padStart(17)} ${fmt(arm.alignment?.splice?.ratioDb, 2).padStart(17)}`
      );
    }
  }

  const collected = { whole, arms };
  const defaultArm = collected.arms.find((arm) => arm.label === "default pre-roll") ?? collected.arms[0];
  const deletedArm = collected.arms.find((arm) => arm.label === "pre-roll deleted");
  const wholeMetrics = collected.whole.metrics;

  console.log("");
  console.log("  metric                              whole      default pre-roll   pre-roll deleted");
  const row = (label, a, b, c, digits = 3) =>
    console.log(
      `  ${label.padEnd(34)} ${fmt(a, digits).padStart(10)} ${fmt(b, digits).padStart(18)} ${fmt(c, digits).padStart(17)}`
    );
  row("integrated LUFS", wholeMetrics.integratedLufs, defaultArm.metrics.integratedLufs, deletedArm?.metrics.integratedLufs);
  row("true peak dBTP", wholeMetrics.truePeakDb, defaultArm.metrics.truePeakDb, deletedArm?.metrics.truePeakDb);
  row("rms dBFS", wholeMetrics.rmsDb, defaultArm.metrics.rmsDb, deletedArm?.metrics.rmsDb);
  row("13-band L1 distance dB", 0, defaultArm.bandL1, deletedArm?.bandL1, 4);
  row("13-band worst band dB", 0, defaultArm.worstBand.worst, deletedArm?.worstBand.worst, 4);
  row("LUFS delta", 0, defaultArm.lufsDelta, deletedArm?.lufsDelta, 4);
  row("true-peak delta dB", 0, defaultArm.truePeakDelta, deletedArm?.truePeakDelta, 4);
  row("worst sample diff dBFS", 0, defaultArm.worstDifference.db, deletedArm?.worstDifference.db, 2);
  row("worst diff at seam dBFS", 0, defaultArm.worstDifference.seamDb, deletedArm?.worstDifference.seamDb, 2);
  row("worst diff span s", 0, defaultArm.worstDifference.spanSec, deletedArm?.worstDifference.spanSec, 3);
  row("seam signal/error dB", 0, defaultArm.seamRegion.ratioDb, deletedArm?.seamRegion.ratioDb, 2);

  console.log("");
  console.log("  pre-roll sweep");
  console.log(
    `    ${"pre-roll s".padEnd(10)} ${"worst diff dBFS".padStart(15)} ${"at seam dBFS".padStart(13)} ${"seam sig/err dB".padStart(15)} ${"band L1 dB".padStart(10)} ${"LUFS delta".padStart(11)} ${"wall ms".padStart(8)}`
  );
  for (const arm of [...collected.arms].sort((a, b) => a.preRollSec - b.preRollSec)) {
    console.log(
      `    ${arm.preRollSec.toFixed(3).padEnd(10)} ${fmt(arm.worstDifference.db, 2).padStart(15)} ${fmt(arm.worstDifference.seamDb, 2).padStart(13)} ${fmt(arm.seamRegion.ratioDb, 2).padStart(15)} ${fmt(arm.bandL1, 4).padStart(10)} ${fmt(arm.lufsDelta, 4).padStart(11)} ${arm.wallMs.toFixed(0).padStart(8)}`
    );
  }

  if (defaultArm.phases || collected.whole.phases) {
    const names = [...new Set([...Object.keys(collected.whole.phases ?? {}), ...Object.keys(defaultArm.phases ?? {})])].sort();
    console.log("");
    console.log("  per-render wall clock by phase (ms), from the renderer's own __grooveRenderTimings sink");
    console.log(`    ${"phase".padEnd(30)} ${"whole".padStart(11)} ${"two chunks".padStart(12)}`);
    for (const name of names) {
      console.log(
        `    ${name.padEnd(30)} ${((collected.whole.phases ?? {})[name] ?? 0).toFixed(0).padStart(11)} ${((defaultArm.phases ?? {})[name] ?? 0).toFixed(0).padStart(12)}`
      );
    }
    console.log(
      `    ${"TOTAL".padEnd(30)} ${collected.whole.wallMs.toFixed(0).padStart(11)} ${defaultArm.wallMs.toFixed(0).padStart(12)}`
    );
    console.log(
      `    chunking cost: ${(defaultArm.wallMs / collected.whole.wallMs).toFixed(2)}x the whole render's wall clock (${(collected.whole.wallMs / 1000).toFixed(1)} s → ${(defaultArm.wallMs / 1000).toFixed(1)} s)`
    );
  }

  /* ------------------------------------------------------------------ the criterion */
  const tolerances = {
    bandL1Db: Number(arg("--band-l1-db", "0.75")),
    bandWorstDb: Number(arg("--band-worst-db", "1.0")),
    lufsDb: Number(arg("--lufs-db", "0.5")),
    truePeakDb: Number(arg("--true-peak-db", "0.5")),
    /**
     * The discriminating statistic. A whole-file band fingerprint cannot see a boundary — measured, the pre-roll makes
     * it *slightly worse* than a hard splice, because a crossfade is a second, time-shifted copy of the audio — but the
     * worst sample difference can: with the pre-roll the seam is nearly identical to the whole render, and without it
     * the difference is the missing reverb, which is what "cut at the boundary" is.
     */
    seamWorstDiffDb: Number(arg("--seam-worst-diff-db", "-60")),
  };

  const passes = (arm) =>
    arm.bandL1 <= tolerances.bandL1Db &&
    arm.worstBand.worst <= tolerances.bandWorstDb &&
    Math.abs(arm.lufsDelta) <= tolerances.lufsDb &&
    Math.abs(arm.truePeakDelta) <= tolerances.truePeakDb &&
    arm.worstDifference.seamDb <= tolerances.seamWorstDiffDb;

  console.log("");
  console.log(
    `  criterion: band L1 <= ${tolerances.bandL1Db} dB · worst band <= ${tolerances.bandWorstDb} dB · |LUFS delta| <= ${tolerances.lufsDb} · |true-peak delta| <= ${tolerances.truePeakDb} dB · sample difference at the seam <= ${tolerances.seamWorstDiffDb} dBFS`
  );
  const defaultPass = passes(defaultArm);
  const deletedPass = deletedArm ? passes(deletedArm) : null;
  console.log(`    default pre-roll ${defaultPass ? "PASS" : "FAIL"}`);
  if (deletedArm) console.log(`    pre-roll deleted ${deletedPass ? "PASS" : "FAIL (required)"}`);
  const holds = defaultPass && deletedPass === false;
  if (!holds && !noVerdict) exitCode = 1;
  console.log(
    holds
      ? "\n✅ the pre-roll merge is within tolerance and deleting the pre-roll is not"
      : "\n❌ the equivalence criterion did not hold in the direction it has to"
  );

  if (!keepOpen) await session.close();
} catch (error) {
  exitCode = 1;
  console.error(`probe failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  if (serverLog) console.error(serverLog.split("\n").slice(-12).join("\n"));
} finally {
  await session.close().catch(() => {});
  server.kill("SIGTERM");
}
process.exit(exitCode);

function fmt(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "-inf";
}
