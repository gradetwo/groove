#!/usr/bin/env node
/**
 * Does the Node Web Audio host return a **silent render**? Repeatedly, with a denominator.
 *
 * ## Why this exists
 *
 * `scripts/probe_headless_parity.ts` found a whole-buffer-of-silence render — correct frame count
 * (165375), `limiter = "worklet"`, `LUFS = -Infinity`, all thirteen bands on the −120 floor — and
 * refused to score it. That refusal is right, but it leaves the question the browser-vs-headless
 * comparison depends on unanswered: *how often*, and *under what conditions*. A parity probe can
 * only see one instance per run, which is how the recorded count stayed "1 in 6, or 3 in 6, or 1 in
 * 8" (`docs/HEADLESS_CORE_PLAN.md` §6).
 *
 * This probe renders the same fixture many times in one process and reports the rate with its
 * denominator and the wall time, so the number is a measurement rather than an impression.
 *
 * ## What it found, and why the two modes are not the same question
 *
 * **Serial renders do not reproduce it; concurrent ones do.** Measured on this machine
 * (`--mode=serial --count=64` across 44.1 kHz stereo and 8 kHz mono, and `--mode=concurrent
 * --concurrency=8 --rounds=6`): serial was 0/64, concurrent was 2/48 at 44.1 kHz stereo, both silent
 * renders in the first round of the process. So the mode is named and the default is the one that
 * reproduces the defect — a probe that only ran serially would report "not reproducible" and be
 * believed.
 *
 * ## Running it
 *
 *     npm i -D node-web-audio-api
 *     npx vite-node scripts/probe_render_repeats.ts
 *     npx vite-node scripts/probe_render_repeats.ts -- --mode=serial --count=16
 *     npx vite-node scripts/probe_render_repeats.ts -- --mode=concurrent --concurrency=8 --rounds=6
 *
 * It skips, loudly, when `node-web-audio-api` is not installed, exactly like
 * `scripts/probe_headless_parity.ts` and `sfizzAgreement.test.ts` skip without their optional
 * parsers. Exit codes: 0 = no silent render, 2 = at least one silent render (the same contract as
 * the parity probe, so a caller can treat 2 as "the host failed a render", not "the probe broke").
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");

const require = createRequire(import.meta.url);
let wa: any = null;
try {
  wa = require("node-web-audio-api");
} catch {
  console.log(
    "SKIP  render-repeat probe skipped: `node-web-audio-api` is not installed.\n" +
      "   install it to run this probe:  npm i -D node-web-audio-api\n" +
      "   (deliberately not a declared dependency yet — see docs/HEADLESS_CORE_PLAN.md)"
  );
  process.exit(0);
}

/* ------------------------------------------------------------------ arguments */

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
};
const mode = arg("--mode", "concurrent") === "serial" ? "serial" : "concurrent";
const count = Math.max(1, Number(arg("--count", "16")) || 16);
const rounds = Math.max(1, Number(arg("--rounds", "6")) || 6);
const concurrency = Math.max(1, Number(arg("--concurrency", "8")) || 8);
const rate = Number(arg("--rate", "44100")) || 44100;
const channels = Number(arg("--channels", "2")) === 1 ? 1 : 2;
const bars = Math.max(1, Number(arg("--bars", "1")) || 1);
const withGs1 = arg("--gs1", "0") !== "0";

/* ------------------------------------------------------------------ the host */

const RealOAC = wa.OfflineAudioContext;
function HostOfflineAudioContext(this: unknown, c: number, f: number, r: number) {
  const ctx = new RealOAC(c, f, r);
  const worklet = ctx.audioWorklet;
  const addModule = worklet.addModule.bind(worklet);
  // The app asks for root-relative asset URLs ("/limiterWorklet.js"); a Node host has no origin.
  worklet.addModule = (url: string) => addModule(url.startsWith("/") ? path.join(PUBLIC, url) : url);
  return ctx;
}
(globalThis as any).OfflineAudioContext = HostOfflineAudioContext;
(globalThis as any).AudioWorkletNode = wa.AudioWorkletNode;
(globalThis as any).AudioWorkletProcessor = wa.AudioWorkletProcessor;
(globalThis as any).BaseAudioContext = wa.BaseAudioContext;
const origFetch = globalThis.fetch;
(globalThis as any).fetch = async (url: unknown, init?: unknown) => {
  const u = String(url);
  if (u.startsWith("/")) {
    const bytes = readFileSync(path.join(PUBLIC, u));
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  }
  return (origFetch as any)(url, init);
};

/* ------------------------------------------------------------------ the fixture */

/** The parity probe's fixture, so a rate here and a parity result there describe the same render. */
const steps = 16;
const pattern: any = {
  genre_id: "chicago-house",
  bpm: 120,
  swing: 0,
  scale: "C minor",
  totalSteps: steps,
  tracks: [
    { track_id: "kick", name: "Kick", instrument: "drum", steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], velocity: new Array(steps).fill(110), pitch: new Array(steps).fill(0), gate: new Array(steps).fill(0.8), volume: 0.9, pan: 0, mute: false, solo: false },
    { track_id: "bass", name: "Bass", instrument: "bass", steps: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0], velocity: new Array(steps).fill(95), pitch: [36, 36, 36, 36, 38, 38, 38, 38, 36, 36, 36, 36, 41, 41, 41, 41], gate: new Array(steps).fill(0.7), volume: 0.85, pan: 0, mute: false, solo: false },
    { track_id: "chords", name: "Chords", instrument: "warm_pad", steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], velocity: new Array(steps).fill(90), pitch: [60, 60, 60, 60, 62, 62, 62, 62, 64, 64, 64, 64, 67, 67, 67, 67], gate: new Array(steps).fill(0.9), volume: 0.8, pan: 0, mute: false, solo: false },
  ],
};

const wav: any = await import("../src/audio/WavExporter.ts");
const gs1: any = await import("../src/audio/gs1/gs1Tracks.ts");
const { bufferPeak } = await import("../src/audio/renderSilence.ts");

/* ------------------------------------------------------------------ one render */

interface Outcome {
  peak: number;
  frames: number;
  limiter: string;
  /** Problems the renderer reported, e.g. "the host returned a silent render…; retrying". */
  problems: string[];
  silent: boolean;
}

async function renderOnce(): Promise<Outcome> {
  let limiter = "?";
  const problems: string[] = [];
  const buffer = await wav.renderPatternOffline(pattern, {
    bars,
    sampleRate: rate,
    channels,
    onLimiterKind: (kind: string) => {
      limiter = kind;
    },
    onProblems: (reported: readonly string[]) => problems.push(...reported),
  });
  const peak = bufferPeak(buffer);
  return { peak, frames: buffer.length, limiter, problems, silent: !(peak > 1e-6) };
}

/* ------------------------------------------------------------------ run */

gs1.setGs1RoutingEnabled(withGs1);
console.log(
  `render-repeat probe — mode=${mode} ${bars} bar(s), ${channels}ch @ ${rate} Hz, GS-1 ${withGs1 ? "on" : "off"}` +
    (mode === "concurrent" ? `, concurrency=${concurrency}, rounds=${rounds}` : `, count=${count}`)
);
if (mode === "serial") {
  console.log("note: serial renders have not reproduced the defect on this machine — measured 0/64; use --mode=concurrent");
}

const started = Date.now();
const outcomes: Outcome[] = [];
let retriedRenders = 0;
if (mode === "serial") {
  for (let i = 0; i < count; i += 1) {
    const outcome = await renderOnce();
    outcomes.push(outcome);
    if (outcome.problems.length > 0) retriedRenders += 1;
    console.log(
      `  render ${String(i).padStart(3)}: frames=${outcome.frames} peak=${outcome.peak.toFixed(6)} limiter=${outcome.limiter}` +
        (outcome.silent ? "  <-- SILENT" : "") +
        (outcome.problems.length ? `  (retried: ${outcome.problems[0]})` : "")
    );
  }
} else {
  for (let round = 0; round < rounds; round += 1) {
    const roundStarted = Date.now();
    const results = await Promise.all(Array.from({ length: concurrency }, () => renderOnce()));
    for (const outcome of results) {
      outcomes.push(outcome);
      if (outcome.problems.length > 0) retriedRenders += 1;
      if (outcome.silent || outcome.problems.length > 0) {
        console.log(
          `  round ${round}: frames=${outcome.frames} peak=${outcome.peak.toFixed(6)} limiter=${outcome.limiter}` +
            (outcome.silent ? "  <-- SILENT" : "") +
            (outcome.problems.length ? `  (retried: ${outcome.problems[0]})` : "")
        );
      }
    }
    console.log(`round ${round}: ${results.length} renders, ${((Date.now() - roundStarted) / 1000).toFixed(1)}s`);
  }
}

const total = outcomes.length;
const silent = outcomes.filter((o) => o.silent);
const seconds = (Date.now() - started) / 1000;
console.log(
  `\nRESULT mode=${mode} silent ${silent.length}/${total}` +
    ` (${((silent.length / total) * 100).toFixed(1)}%)` +
    ` · renders that needed a retry: ${retriedRenders}/${total}` +
    ` · ${seconds.toFixed(1)}s (${((seconds / total) * 1000).toFixed(0)} ms/render)`
);
console.log(
  "Exit 2 means the host returned at least one buffer with no samples in it — a failed render, not a quiet one " +
    "(docs/HEADLESS_CORE_PLAN.md §6)."
);
process.exit(silent.length > 0 ? 2 : 0);
