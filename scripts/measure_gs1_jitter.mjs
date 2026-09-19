#!/usr/bin/env node
/**
 * E7 — live timing jitter of a message-delivered GS-1 note (P6 Phase 2, second precondition).
 *
 * ## The question this answers
 *
 * The vendored GS-1 worklet cannot be told *when* to play a note: every inbound message acts on
 * arrival (`AUDIO_QUALITY_AND_SYNTH_PLAN.md` §5.9). Groove Lab's scheduler, by contrast, enqueues
 * notes with exact `AudioContext` times and a 200 ms lookahead. Before wiring `chords`/`lead`
 * through a protocol like that, the actual error between "the host asked" and "the note sounded"
 * has to be a number.
 *
 * Two host strategies are measured, because both are plausible and they fail differently:
 *
 *   - **`schedule-ahead`** — post the note as soon as the scheduler decides on it (what the
 *     engine's lookahead would naturally do). Expected: large *early* error, bounded by the
 *     lookahead.
 *   - **`last-moment`** — post it from a `setTimeout` a short lead before the intended time (the
 *     only way to aim at a future instant without a timed protocol). Expected: small error, but
 *     with main-thread jitter tail.
 *
 * Onset is detected by `public/gs1OnsetProbe.js` on the audio rendering thread, so the timestamp
 * is sample-accurate to one 128-frame block; the block bound travels with every number in the
 * report rather than being rounded away.
 *
 * Usage:
 *   node scripts/measure_gs1_jitter.mjs                     # 40 trials per strategy
 *   node scripts/measure_gs1_jitter.mjs --trials=12 --lead=20 --port=3180
 *
 * Writes `scripts/gs1.jitter.baseline.json` (`…partial.json` for a narrowed run).
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

const trials = Math.max(4, Number(argValue("--trials", "40")) || 40);
/** How far ahead each note is aimed, in ms. Matches the engine's own 200 ms lookahead. */
const lookaheadMs = Number(argValue("--lookahead", "200")) || 200;
/** Lead used by the `last-moment` strategy: post this many ms before the note is due. */
const leadMs = Number(argValue("--lead", "20")) || 20;
/** Silence between trials, so an onset can never be confused with the previous note's tail. */
const trialGapMs = Number(argValue("--gap", "420")) || 420;
/**
 * Main-thread jank generator, used by the `last-moment-loaded` strategy.
 *
 * The whole reason the engine keeps a 200 ms lookahead is that the main thread stalls while the
 * UI is being dragged. Measuring the last-moment workaround on an idle page therefore produces a
 * *lower bound*; this mode blocks the main thread for `loadMs` out of every `loadPeriodMs`,
 * which is what a busy frame looks like from a timer's point of view.
 */
const loadMs = Number(argValue("--load-ms", "25")) || 25;
const loadPeriodMs = Math.max(loadMs + 5, Number(argValue("--load-period", "50")) || 50);
const port = Number(argValue("--port", process.env.PORT || "3180")) || 3180;
const expectedSampleRate = Number(argValue("--sample-rate", "44100")) || 44100;

const isSubsetRun = argv.some((a) => a.startsWith("--trials") || a.startsWith("--lead"));
const outPath = path.resolve(
  ROOT,
  argValue("--out", isSubsetRun ? "scripts/gs1.jitter.partial.json" : "scripts/gs1.jitter.baseline.json")
);

/** One render quantum; the onset probe cannot resolve finer than this. */
const BLOCK_FRAMES = 128;

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
console.log("  🎹 GS-1 LIVE TIMING JITTER (E7)");
console.log("===============================================================");
console.log(`  trials ${trials}/strategy · lookahead ${lookaheadMs} ms · last-moment lead ${leadMs} ms · port ${port}`);

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
    args: ["--autoplay-policy=no-user-gesture-required", "--disable-features=AudioServiceOutOfProcess"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${base}/studio`, { waitUntil: "domcontentloaded" });

  /** Build the instrument + probe once; the strategies only differ in when they post. */
  const setup = await page.evaluate(async () => {
    const { createGs1Host } = await import("/src/audio/gs1/Gs1Host.ts");
    const { Param } = await import("/vendor/gs1/src/audio/params.ts");

    const ctx = new AudioContext({ latencyHint: "interactive" });
    await ctx.resume();
    const host = await createGs1Host({ context: ctx, maxPolyphony: 8 });
    const ready = await host.ready;

    // A bright, fast-attack, short note: an onset is easy to detect and the tail cannot leak
    // into the next trial.
    host.setPatch({
      [Param.OSC1_ON]: 1,
      [Param.OSC1_WAVE]: 2,
      [Param.OSC1_LEVEL]: 0.9,
      [Param.OSC2_ON]: 0,
      [Param.FILTER_CUTOFF]: 6000,
      [Param.FILTER_RES]: 0.2,
      [Param.ENV_ATTACK]: 0.002,
      [Param.ENV_DECAY]: 0.08,
      [Param.ENV_SUSTAIN]: 0,
      [Param.ENV_RELEASE]: 0.05,
      [Param.PATCH_GAIN]: 0.6,
    });

    const probeUrl = "/gs1OnsetProbe.js";
    await ctx.audioWorklet.addModule(probeUrl);
    const probe = new AudioWorkletNode(ctx, "gs1-onset-probe", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    const sink = ctx.createGain();
    sink.gain.value = 0; // silent: the probe still sees the signal, nothing is audible
    host.output.connect(probe);
    probe.connect(sink);
    sink.connect(ctx.destination);

    window.__e7 = { ctx, host, probe, ready, onsets: [] };
    probe.port.onmessage = (event) => {
      if (event.data?.type === "onset") window.__e7.onsets.push(event.data);
    };
    return { abi: ready.abi, variant: host.variant, sampleRate: ctx.sampleRate, baseLatency: ctx.baseLatency };
  });

  console.log(
    `  instrument: abi ${setup.abi} · ${setup.variant} core · ${setup.sampleRate} Hz · baseLatency ${(setup.baseLatency * 1000).toFixed(2)} ms`
  );

  /**
   * Run one trial in the page and return both clocks.
   *
   * The intended time is expressed in `ctx.currentTime` seconds; the onset comes back as an
   * absolute sample frame, and the frame→seconds conversion uses the context's own sample rate.
   */
  const measure = (strategy) =>
    page.evaluate(
      async ({ strategy: mode, lookaheadMs: lookahead, leadMs: lead, gapMs, blockFrames, loadMs: burstMs, loadPeriodMs: periodMs }) => {
        const { ctx, host, probe, onsets } = window.__e7;
        // Let the previous note's tail decay away completely.
        await new Promise((r) => setTimeout(r, gapMs));
        onsets.length = 0;
        probe.port.postMessage({ type: "arm" });

        const postOn = () => host.noteOn(60, 0.9);
        const postOff = () => host.noteOff(60);

        let intended = null;
        let postedAt = null;
        if (mode === "schedule-ahead") {
          // What the engine's lookahead would do: decide now, sound later — but the protocol
          // has no "later", so it sounds now.
          intended = ctx.currentTime + lookahead / 1000;
          postedAt = ctx.currentTime;
          postOn();
        } else {
          // Aim at a future instant the only way the protocol allows: sleep until shortly
          // before it, then post. The `-loaded` variant does the same thing with the main thread
          // deliberately busy, which is the condition the engine's lookahead exists for.
          intended = ctx.currentTime + (lookahead + 120) / 1000;
          const waitMs = Math.max(0, (intended - ctx.currentTime) * 1000 - lead);
          if (mode === "last-moment-loaded") {
            const stopAt = performance.now() + waitMs;
            // Block in `loadMs` chunks until the post is due. This is jank, on purpose.
            while (performance.now() < stopAt) {
              const burstEnd = performance.now() + burstMs;
              while (performance.now() < burstEnd) {
                /* spin */
              }
              await new Promise((r) => setTimeout(r, Math.max(0, periodMs - burstMs)));
            }
          } else {
            await new Promise((r) => setTimeout(r, waitMs));
          }
          postedAt = ctx.currentTime;
          postOn();
        }

        // Wait for the probe, then release the note.
        const deadline = performance.now() + 1500;
        while (onsets.length === 0 && performance.now() < deadline) {
          await new Promise((r) => setTimeout(r, 5));
        }
        postOff();
        const onset = onsets[0] ?? null;
        return {
          strategy: mode,
          intended,
          postedAt,
          // `frame / sampleRate` is the exact time in the context's own timeline.
          onsetTime: onset ? onset.frame / ctx.sampleRate : null,
          onsetFrame: onset ? onset.frame : null,
          blockFrames,
          peak: onset ? onset.peak : 0,
          sampleRate: ctx.sampleRate,
        };
      },
      { strategy, lookaheadMs, leadMs, gapMs: trialGapMs, blockFrames: BLOCK_FRAMES }
    );

  const summarise = (rows) => {
    const errorsMs = rows.map((r) => r.errorMs).filter((v) => Number.isFinite(v));
    const sorted = [...errorsMs].sort((a, b) => a - b);
    const pick = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : NaN);
    const abs = [...errorsMs].map(Math.abs).sort((a, b) => a - b);
    const pickAbs = (p) => (abs.length ? abs[Math.min(abs.length - 1, Math.floor(p * abs.length))] : NaN);
    const mean = sorted.length ? sorted.reduce((s, v) => s + v, 0) / sorted.length : NaN;
    return {
      trials: rows.length,
      detected: errorsMs.length,
      meanErrorMs: mean,
      medianErrorMs: pick(0.5),
      p90AbsErrorMs: pickAbs(0.9),
      maxAbsErrorMs: abs.length ? abs[abs.length - 1] : NaN,
      minErrorMs: sorted.length ? sorted[0] : NaN,
      maxErrorMs: sorted.length ? sorted[sorted.length - 1] : NaN,
    };
  };

  const results = {};
  for (const strategy of ["schedule-ahead", "last-moment", "last-moment-loaded"]) {
    const rows = [];
    for (let i = 0; i < trials; i++) {
      const row = await measure(strategy);
      row.errorMs = row.onsetTime === null ? NaN : (row.onsetTime - row.intended) * 1000;
      row.postLatencyMs = row.postedAt === null ? NaN : (row.postedAt - row.intended) * 1000;
      rows.push(row);
      if ((i + 1) % 10 === 0 || i === trials - 1) {
        process.stdout.write(`  ${strategy}: ${i + 1}/${trials}\n`);
      }
    }
    results[strategy] = { summary: summarise(rows), rows };
    const s = results[strategy].summary;
    console.log(
      `  ${strategy.padEnd(15)} detected ${s.detected}/${s.trials} · median ${s.medianErrorMs.toFixed(1)} ms · ` +
        `p90|err| ${s.p90AbsErrorMs.toFixed(1)} ms · max|err| ${s.maxAbsErrorMs.toFixed(1)} ms ` +
        `(range ${s.minErrorMs.toFixed(1)}…${s.maxErrorMs.toFixed(1)} ms)`
    );
  }

  const report = {
    generatedBy: "scripts/measure_gs1_jitter.mjs",
    generatedAt: new Date().toISOString(),
    subset: isSubsetRun,
    trials,
    lookaheadMs,
    leadMs,
    trialGapMs,
    mainThreadLoad: { dutyMs: loadMs, periodMs: loadPeriodMs },
    instrument: setup,
    onsetResolutionMs: (BLOCK_FRAMES / expectedSampleRate) * 1000,
    path: "live AudioContext (Playwright, headless Chromium) + vendored GS-1 worklet; onset timestamped on the audio rendering thread by public/gs1OnsetProbe.js",
    results,
    pageErrors: errors.slice(0, 10),
  };
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log("\n---------------------------------------------------------------");
  for (const [name, data] of Object.entries(results)) {
    console.log(
      `  ${name.padEnd(15)} median ${data.summary.medianErrorMs.toFixed(1)} ms · p90 ${data.summary.p90AbsErrorMs.toFixed(1)} ms · max ${data.summary.maxAbsErrorMs.toFixed(1)} ms`
    );
  }
  console.log(`  onset resolution : ${report.onsetResolutionMs.toFixed(2)} ms (one 128-frame block)`);
  if (errors.length) console.log(`  page errors      : ${errors.length} (first: ${errors[0].slice(0, 120)})`);
  console.log(`  report           : ${path.relative(ROOT, outPath)}`);
  console.log("===============================================================");
} catch (error) {
  console.error(`❌ E7 measurement failed: ${error?.stack || error}`);
  if (viteLog) console.error(viteLog.slice(-2000));
  process.exitCode = 1;
} finally {
  stop();
}
