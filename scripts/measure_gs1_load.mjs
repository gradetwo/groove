#!/usr/bin/env node
/**
 * GS-1 integration budget measurement — the plan's experiments **E2** and **E3** (P6 / Phase 0).
 *
 * The plan's risk R1 is explicit: GS-1 self-reports 33–61% of one audio thread for 16 voices
 * plus its full FX chain, and `chords` + `lead` are precisely the two roles that sound
 * *simultaneously and continuously*. So the integration is gated on a measurement, not on an
 * opinion:
 *
 *   E2 — can the vendored worklet load and make sound on Groove Lab's own build, on a real
 *        `AudioContext`? (The plan's answer so far was only "the WASM validates in Node".)
 *   E3 — with Groove Lab's full 8-track engine playing, what does the GS-1 instance report as
 *        its `analysis.load` (share of the 128-frame quantum)? The plan's decision rule:
 *        **above 0.35 keep the integration to a single lead voice; at or below it, `chords`
 *        and `lead` are both on the table.**
 *
 * Why a real browser and a real `AudioContext` rather than the offline renderer: `load` is
 * `costAvg / quantumMs`, i.e. the share of the *real-time* budget. An `OfflineAudioContext`
 * renders as fast as it can and would report a meaningless ratio. The engine under test is the
 * app's own `AudioEngine`, driven through the real studio UI, so the number includes the whole
 * graph (track strips, buses, master chain) and not a stripped-down mock.
 *
 * Usage:
 *   node scripts/measure_gs1_load.mjs                       # default: heavy-metal, 3 poly settings
 *   node scripts/measure_gs1_load.mjs --genre=dub --voices=4,8,16
 *   node scripts/measure_gs1_load.mjs --hold=2500 --port=3170
 *
 * Writes `scripts/gs1.load.baseline.json` (or `gs1.load.partial.json` for a narrowed run).
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
const argv = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

/**
 * The busiest realistic arrangement, not the emptiest one.
 *
 * `heavy-metal` is chosen because it is the worst case on both sides: all eight roles active
 * (so the native graph is at its heaviest), it carries the most per-genre plugin work
 * (saturation on the master rack, driven inserts on chords/lead/bass), and its chords/lead
 * parts are sustained rather than percussive — which is exactly the load GS-1 would be asked
 * to take over.
 */
const genreId = argValue("--genre", "heavy-metal");
/** Voice counts to sweep. 16 is the plan's Phase 0 default; 32 is the core's ceiling. */
const voiceCounts = (argValue("--voices", "4,8,12,16") || "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);
/**
 * How long to hold the chord before reading `load`, and when to start believing it.
 *
 * Not tuning knobs to be reduced casually. The vendored processor reports `load = 0` for the
 * first **2000 ms of rendered audio** (`WARMUP_MS`) — deliberately, so first-touch costs and JIT
 * cannot trigger a false overload verdict — and its cost estimate is an asymmetric follower that
 * *rises* at alpha 0.05 per block, so it needs roughly another second to converge. The first
 * version of this script held for 1.5 s and confidently reported a flat `0.000`, which would
 * have "proved" that GS-1 is free.
 */
const holdMs = Math.max(4000, Number(argValue("--hold", "6000")) || 6000);
/** Frames before this offset are warm-up and excluded from the statistics. */
const POST_WARMUP_MS = Number(argValue("--post-warmup", "2600")) || 2600;
const settleMs = Math.max(200, Number(argValue("--settle", "700")) || 700);
const port = Number(argValue("--port", process.env.PORT || "3170")) || 3170;
const requestedMax = Number(argValue("--polyphony", "32")) || 32;

/**
 * A narrowed sweep must never overwrite the canonical baseline — the same anti-clobber rule the
 * loudness and timbre harnesses learned the hard way. The default run (genre `heavy-metal`,
 * voices 4/8/12/16, full hold) is the canonical one.
 */
const isSubsetRun = argv.some((a) => a.startsWith("--voices") || a.startsWith("--genre"));
const outPath = path.resolve(
  ROOT,
  argValue("--out", isSubsetRun ? "scripts/gs1.load.partial.json" : "scripts/gs1.load.baseline.json")
);

/** The plan's own decision threshold, quoted so the report cannot drift from it. */
const OVER_LOAD_THRESHOLD = 0.35;

function waitForServer(url, timeoutMs = 60000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const response = await fetch(url);
        if (response.ok) return resolve();
      } catch {
        /* not up yet */
      }
      if (Date.now() - started > timeoutMs) return reject(new Error(`dev server did not start: ${url}`));
      setTimeout(tick, 300);
    };
    tick();
  });
}

console.log("===============================================================");
console.log("  🎹 GS-1 INTEGRATION BUDGET (E2 load + E3 headroom)");
console.log("===============================================================");
console.log(
  `  genre ${genreId} · voices ${voiceCounts.join(", ")} · hold ${holdMs} ms (stats after ${POST_WARMUP_MS} ms) · port ${port}`
);

const vite = spawn("npx", ["vite", "--port", String(port), "--strictPort"], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
});
let viteLog = "";
vite.stdout.on("data", (d) => {
  viteLog += String(d);
});
vite.stderr.on("data", (d) => {
  viteLog += String(d);
});

let browser = null;
const stop = () => {
  try {
    browser?.close();
  } catch {
    /* best effort */
  }
  try {
    vite.kill("SIGTERM");
  } catch {
    /* best effort */
  }
};
process.on("exit", stop);

try {
  const base = `http://127.0.0.1:${port}`;
  await waitForServer(base);

  browser = await chromium.launch({
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--disable-features=AudioServiceOutOfProcess",
      "--use-fake-device-for-media-stream",
    ],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  /**
   * Capture the app's own `AudioContext`.
   *
   * The GS-1 node must live on the context the studio already uses (plan risk R6: a second
   * context means a second clock and, on iOS, two audio sessions fighting). The app does not
   * expose its context, so this wraps the constructor before any app code runs — the same
   * kind of non-invasive instrumentation `measure_live_loudness.mjs` uses for `connect`.
   */
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    window.__gs1probe = { contexts: [], samples: [] };
    // eslint-disable-next-line no-undef
    window.AudioContext = class extends Original {
      constructor(...args) {
        super(...args);
        window.__gs1probe.contexts.push(this);
      }
    };
  });

  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(`${base}/studio?genre=${encodeURIComponent(genreId)}`, {
    waitUntil: "domcontentloaded",
  });
  const play = page.locator('button[aria-label="Play / Pause"]');
  await play.waitFor({ state: "visible", timeout: 30000 });
  await play.click();

  // Let the scheduler fill and the load monitor settle before measuring anything.
  await page.waitForTimeout(settleMs);

  const engineState = await page.evaluate(() => {
    const contexts = window.__gs1probe?.contexts ?? [];
    const ctx = contexts.find((c) => c.state === "running") ?? contexts[0] ?? null;
    window.__gs1probe.ctx = ctx;
    return { contexts: contexts.length, state: ctx?.state ?? "none", sampleRate: ctx?.sampleRate ?? 0 };
  });

  console.log(
    `  app engine: ${engineState.contexts} context(s), using state=${engineState.state} @ ${engineState.sampleRate} Hz`
  );

  // The context itself cannot cross the page boundary (it is not serialisable), so the check
  // is on the observable state; the page keeps the reference on `window.__gs1probe.ctx`.
  if (!engineState.contexts || engineState.state !== "running") {
    throw new Error(
      `the studio's AudioContext never reached "running" (contexts=${engineState.contexts}, state=${engineState.state})`
    );
  }

  const results = [];
  for (const voices of voiceCounts) {
    const measured = await page.evaluate(
      async ({ voices: wanted, holdMs: hold, requestedMax: maxPoly, postWarmupMs }) => {
        const [{ createGs1Host }, params] = await Promise.all([
          import("/src/audio/gs1/Gs1Host.ts"),
          import("/vendor/gs1/src/audio/params.ts"),
        ]);
        const ctx = window.__gs1probe.ctx;
        const t0 = performance.now();
        const host = await createGs1Host({ context: ctx, maxPolyphony: maxPoly });
        const ready = await host.ready;
        const loadMs = performance.now() - t0;
        // A source node that reaches no destination is never pulled, so the worklet would
        // never run and every analysis frame would be missing (this was the first bug this
        // harness hit). Connecting to the destination is also the realistic case: the
        // instrument is audible alongside the app's own engine.
        host.output.connect(ctx.destination);

        // A plain sustained chord: root, fifth, octave, and a couple of upper voices so the
        // measurement reflects real polyphony rather than one note with the same ceiling.
        const pitches = [48, 55, 60, 64, 67, 72, 76, 79, 84, 88, 91, 96, 100, 103, 108, 112];
        const playing = pitches.slice(0, Math.min(wanted, pitches.length));
        // The core's ceiling is not raised by `processorOptions.maxPolyphony` alone: the
        // processor passes it to `gs_init`, but the wasm's own cap only moves on an explicit
        // `setPolyphony` message. Without this the 24- and 32-voice runs silently measured 16
        // voices ("voices seen 16"), which is exactly the kind of quiet cap this measurement
        // exists to surface.
        host.node.port.postMessage({ type: "setPolyphony", value: wanted });
        host.setParam(params.Param.OSC1_ON, 1);
        host.setParam(params.Param.OSC1_LEVEL, 0.8);
        host.setParam(params.Param.OSC2_ON, 1);
        host.setParam(params.Param.OSC2_LEVEL, 0.5);
        host.setParam(params.Param.ENV_ATTACK, 0.02);
        host.setParam(params.Param.ENV_SUSTAIN, 1);
        for (const note of playing) host.noteOn(note, 0.7);

        const started = performance.now();
        let overloadEvents = 0;
        let downgradeEvents = 0;
        const offPoly = host.onPolyphony((event) => {
          if (event.reason === "overload") overloadEvents += 1;
          else if (event.reason !== "manual") downgradeEvents += 1;
        });
        const frames = [];
        const off = host.onAnalysis((a) =>
          frames.push({
            t: performance.now() - started,
            load: a.load,
            voices: a.voices,
            violations: a.violations,
            peak: Math.max(a.peakL, a.peakR),
            truePeak: a.truePeak,
          })
        );
        await new Promise((resolve) => setTimeout(resolve, hold));
        off();
        offPoly();

        /**
         * Audio seconds actually rendered per wall second.
         *
         * The analysis message arrives every `ANALYSIS_INTERVAL` (6) quanta of 128 frames, so
         * the expected rate is `sampleRate / 128 / 6` ≈ 57.4 frames/s at 44.1 kHz. A ratio
         * below 1 means the rendering thread could not keep up and the context is under-running
         * (audible as dropouts) — which is a *stronger* overload signal than the load estimate,
         * because it is measured rather than inferred.
         */
        const QUANTA_PER_FRAME_MSG = 6;
        const QUANTUM_FRAMES = 128;
        const audioSeconds = (frames.length * QUANTA_PER_FRAME_MSG * QUANTUM_FRAMES) / ctx.sampleRate;
        const realtimeRatio = audioSeconds / (hold / 1000);

        // Only post-warm-up frames count: before `WARMUP_MS` the processor pins `load` to 0 by
        // design, and including those zeros would drag every statistic toward "free".
        const settled = frames.filter((f) => f.t >= postWarmupMs);

        host.noteOff(999); // nothing; keeps the note-off path exercised
        for (const note of playing) host.noteOff(note);
        host.allNotesOff();

        const loads = settled.map((f) => f.load).filter((v) => Number.isFinite(v));
        const sorted = [...loads].sort((a, b) => a - b);
        const pick = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : NaN);
        const result = {
          requestedVoices: wanted,
          frames: frames.length,
          settledFrames: settled.length,
          loadMedian: pick(0.5),
          loadP90: pick(0.9),
          loadMax: sorted.length ? sorted[sorted.length - 1] : NaN,
          peakMax: settled.reduce((m, f) => Math.max(m, f.peak), 0),
          truePeakMax: settled.reduce((m, f) => Math.max(m, f.truePeak), 0),
          voicesMax: settled.reduce((m, f) => Math.max(m, f.voices), 0),
          allocViolations: settled.reduce((m, f) => Math.max(m, f.violations), 0),
          realtimeRatio,
          overloadEvents,
          downgradeEvents,
          polyphonyDowngrades: 0,
          variant: host.variant,
          abi: ready.abi,
          loadSetupMs: ready && loadMs,
        };
        host.dispose();
        return result;
      },
      { voices, holdMs, requestedMax, postWarmupMs: POST_WARMUP_MS }
    );

    const downgrades = await page.evaluate(() => window.__gs1probe.downgrades ?? 0);
    measured.polyphonyDowngrades = downgrades;
    results.push(measured);
    console.log(
      `  voices ${String(voices).padStart(2)} → load median ${measured.loadMedian.toFixed(3)}  p90 ${measured.loadP90.toFixed(3)}  max ${measured.loadMax.toFixed(3)}` +
        `  (${measured.settledFrames}/${measured.frames} settled frames)  voices seen ${measured.voicesMax}` +
        `  peak ${measured.peakMax.toFixed(3)}  viol ${measured.allocViolations}  variant ${measured.variant}  abi ${measured.abi}`
    );
  }

  await play.click().catch(() => {});

  /**
   * Decide from *sustained* evidence, not from a single worst frame.
   *
   * `loadMax` is one frame of an asymmetric follower and is noise-sensitive, so it is reported
   * but not decisive. Three signals are decisive, in this order:
   *
   *  1. the processor's own overload verdict (`polyphony` message, reason `overload`), which
   *     fires only after `OVER_BLOCKS` (12) consecutive blocks above its `OVER_LOAD` (0.35)
   *     threshold — the upstream-tuned criterion the plan quotes;
   *  2. `realtimeRatio < 1`, i.e. the rendering thread demonstrably failed to keep up;
   *  3. the p90 of settled frames above the threshold, as a load-based fallback.
   */
  const judged = results.map((r) => ({
    voices: r.requestedVoices,
    voicesHeard: r.voicesMax,
    sustainedP90: r.loadP90,
    realtimeRatio: r.realtimeRatio,
    overloadEvents: r.overloadEvents,
    overThreshold: Boolean(
      r.overloadEvents > 0 || r.realtimeRatio < 0.9 || r.loadP90 > OVER_LOAD_THRESHOLD
    ),
  }));
  const worst = [...judged].sort((a, b) => b.sustainedP90 - a.sustainedP90)[0] ?? null;
  const firstOver = judged.find((r) => r.overThreshold) ?? null;
  const decision = {
    threshold: OVER_LOAD_THRESHOLD,
    /** Voice count at which sustained load first crosses the plan's threshold. */
    firstOverThresholdVoices: firstOver?.voices ?? null,
    worstSustainedP90: worst?.sustainedP90 ?? null,
    worstSustainedP90Voices: worst?.voices ?? null,
    judged,
    /**
     * The plan's rule, expressed as a *polyphony ceiling* rather than a yes/no on the whole
     * integration: the measurement shows where the budget runs out, and a chord needs three or
     * four voices while a lead needs one, so a bounded ceiling is the useful answer.
     */
    verdict:
      firstOver === null
        ? "chords-and-lead-viable-at-tested-polyphony"
        : `cap-gs1-polyphony-below-${firstOver.voices}-voices`,
  };

  const report = {
    generatedBy: "scripts/measure_gs1_load.mjs",
    generatedAt: new Date().toISOString(),
    subset: isSubsetRun,
    genre: genreId,
    holdMs,
    settleMs,
    postWarmupMs: POST_WARMUP_MS,
    // Quoted from the vendored processor so the report explains its own zero-load window.
    warmupMs: 2000,
    appContext: engineState,
    loadThreshold: OVER_LOAD_THRESHOLD,
    decision,
    results,
    pageErrors: errors.slice(0, 10),
    path: "live AudioContext via Playwright + Vite dev server; the app's own AudioEngine playing through the studio UI, plus one GS-1 host on the same context",
  };
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log("\n---------------------------------------------------------------");
  console.log(
    `  worst sustained p90: ${decision.worstSustainedP90?.toFixed(3)} at ${decision.worstSustainedP90Voices} voices`
  );
  console.log(`  first over ${OVER_LOAD_THRESHOLD}     : ${decision.firstOverThresholdVoices ?? "never"} voices`);
  console.log(`  plan threshold     : ${OVER_LOAD_THRESHOLD}`);
  console.log(`  verdict            : ${decision.verdict}`);
  if (errors.length) console.log(`  page errors        : ${errors.length} (first: ${errors[0].slice(0, 120)})`);
  console.log(`  report             : ${path.relative(ROOT, outPath)}`);
  console.log("===============================================================");
} catch (error) {
  console.error(`❌ GS-1 load measurement failed: ${error?.stack || error}`);
  if (viteLog) console.error(viteLog.slice(-2000));
  process.exitCode = 1;
} finally {
  stop();
}
