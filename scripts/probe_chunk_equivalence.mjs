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
async function warmModuleGraph(url) {
  const modules = [
    "/scripts/probe_chunk_equivalence.html",
    "/scripts/lib/chunkProbePage.mjs",
    "/src/data/genres/index.ts",
    "/src/data/genreMix.ts",
    "/src/audio/WavExporter.ts",
    "/src/test/helpers/loudness.ts",
    "/src/test/helpers/timbre.ts",
  ];
  for (const module of modules) {
    /**
     * Retried, like `waitForServer`: the first request after Vite binds its listener can still fail with
     * `ECONNRESET`, and a warm-up that gives up on a race it exists to absorb reports a network fault where there is
     * only a server that had not finished starting.
     */
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await new Promise((resolve, reject) => {
          http
            .get(`${url.replace(/\/$/, "")}${module}`, (res) => {
              res.resume();
              if (res.statusCode && res.statusCode >= 400) reject(new Error(`${module} -> ${res.statusCode}`));
              else resolve();
            })
            .on("error", reject);
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    if (lastError) throw lastError;
  }
}

const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
const server = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
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
      if (message.type() === "error") console.error("[page console]", message.text());
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
    if (result.steps === 1 && step !== "build") {
      throw new Error(`step ${step} ran on a page whose fixture was never built (step counter restarted)`);
    }
    return result.value;
  }

  build(options) {
    return this.run("build", options);
  }

  whole() {
    return this.run("whole");
  }

  arm(plan) {
    return this.run("arm", plan);
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
  await warmModuleGraph(url);
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const options = { genre, bars, mode };
  let fixture = await session.build(options);
  let whole = await session.whole();
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
   * The renderer's own default, the deletion test, and every sweep point. Each is its own call, so a page death costs
   * one arm rather than the run.
   */
  const plan = [
    { label: "default pre-roll", preRollSec: undefined },
    { label: "pre-roll deleted", preRollSec: 0 },
    ...preRollPoints.map((value) => ({ label: `${value} s`, preRollSec: value })),
  ];
  const seen = new Set();
  for (const job of plan) {
    const key = `${job.preRollSec}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let result;
    try {
      result = await session.arm(job);
    } catch {
      console.error(`  arm "${job.label}" failed after retries; rebuilding the page and replaying build/whole`);
      fixture = await session.build(options);
      whole = await session.whole();
      result = await session.arm(job);
    }
    console.log(
      `  arm ${String(job.label).padEnd(16)} preRoll ${String(result.preRollFrames).padStart(6)} f (${result.preRollSec.toFixed(3)} s)` +
        ` · worst diff ${fmt(result.worstDifference.db, 2)} dBFS` +
        ` · span ${result.worstDifference.spanSec.toFixed(3)} s` +
        ` · seam sig/err ${fmt(result.seamRegion.ratioDb, 2)} dB` +
        ` · ${result.wallMs.toFixed(0)} ms`
    );
  }

  const collected = await session.collected();
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
  row("worst diff span s", 0, defaultArm.worstDifference.spanSec, deletedArm?.worstDifference.spanSec, 3);
  row("seam signal/error dB", 0, defaultArm.seamRegion.ratioDb, deletedArm?.seamRegion.ratioDb, 2);

  console.log("");
  console.log("  pre-roll sweep");
  console.log(
    `    ${"pre-roll s".padEnd(10)} ${"worst diff dBFS".padStart(15)} ${"diff span s".padStart(11)} ${"seam sig/err dB".padStart(15)} ${"band L1 dB".padStart(10)} ${"LUFS delta".padStart(11)} ${"wall ms".padStart(8)}`
  );
  for (const arm of [...collected.arms].sort((a, b) => a.preRollSec - b.preRollSec)) {
    console.log(
      `    ${arm.preRollSec.toFixed(3).padEnd(10)} ${fmt(arm.worstDifference.db, 2).padStart(15)} ${fmt(arm.worstDifference.spanSec, 3).padStart(11)} ${fmt(arm.seamRegion.ratioDb, 2).padStart(15)} ${fmt(arm.bandL1, 4).padStart(10)} ${fmt(arm.lufsDelta, 4).padStart(11)} ${arm.wallMs.toFixed(0).padStart(8)}`
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
    seamSpanSec: Number(arg("--seam-span-sec", "1.0")),
  };

  const passes = (arm) =>
    arm.bandL1 <= tolerances.bandL1Db &&
    arm.worstBand.worst <= tolerances.bandWorstDb &&
    Math.abs(arm.lufsDelta) <= tolerances.lufsDb &&
    Math.abs(arm.truePeakDelta) <= tolerances.truePeakDb &&
    arm.worstDifference.db <= tolerances.seamWorstDiffDb &&
    arm.worstDifference.spanSec <= tolerances.seamSpanSec;

  console.log("");
  console.log(
    `  criterion: band L1 <= ${tolerances.bandL1Db} dB · worst band <= ${tolerances.bandWorstDb} dB · |LUFS delta| <= ${tolerances.lufsDb} · |true-peak delta| <= ${tolerances.truePeakDb} dB · worst sample diff <= ${tolerances.seamWorstDiffDb} dBFS over <= ${tolerances.seamSpanSec} s`
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
