#!/usr/bin/env node
/**
 * Profile: **where does an offline render's wall clock actually go?**
 *
 * This is the measurement `docs/RUST_DECISION.md` §五 step 2 asks for: the document's own words are that talking about Rust without this number is solving a problem
 * nobody has measured. It drives the **real** `renderPatternOffline` (not a copy, not a model) the way `mcp/render/worker.ts` drives it — a Vite dev server
 * (so no test hook ships in the production bundle) plus a headless Chromium page that imports `/src/audio/WavExporter.ts` — and reports two things per render:
 *
 *   1. **End to end**, timed in Node around the whole `page.evaluate`: page-side render + WAV encode + JSON/binary marshalling back. That is what the MCP tool's
 *      caller waits for.
 *   2. **The phase split**, from the inert instrumentation in `WavExporter.renderPatternOffline` (`globalThis.__grooveRenderTimings`), which is collected only
 *      because this script sets that flag. Phases cover graph construction, GS-1 host build, the whole voice-scheduling loop, audio-lane load/decode/schedule,
 *      `startRendering()`, and the post-render trim/fold — plus the `meta:` keys for the raw `startRendering()` wall and the total.
 *
 * What it deliberately **cannot** split: everything the graph computes *inside* `startRendering()` — voice DSP, the convolution reverb, the limiter, the master
 * chain — because that is a single opaque call. The `--ablate` arms are the honest response to that: they re-render the same pattern with one graph stage
 * switched off (`reverb` off via the bus's own `enabled` flag, the master bus compressor off via the existing `masterBusCompEnabled` option, or a voice lane
 * silenced) and report the **difference**, which is a differential attribution and is labelled as one.
 *
 * Usage:
 *   node scripts/profile_offline_render.mjs                       # the default 8-bar / 7-lane fixture, 3 renders
 *   node scripts/profile_offline_render.mjs --genre=chicago-house --bars=8 --runs=3
 *   node scripts/profile_offline_render.mjs --mode=ablate         # add the differential arms
 *   node scripts/profile_offline_render.mjs --mode=mcp            # the full MCP path, including the file write
 *   node scripts/profile_offline_render.mjs --mode=analysis       # 8 kHz mono, the analysis lever
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const argv = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : fallback;
};

const GENRE = argValue("--genre", "chicago-house");
const BARS = Number(argValue("--bars", "8"));
const RUNS = Math.max(1, Number(argValue("--runs", "3")));
const MODE = argValue("--mode", "render");
const PORT = Number(argValue("--port", "3191"));
const OUT = argValue("--out", "");
const VERBOSE = argv.includes("--verbose");
/**
 * Which Chromium, and it matters: Playwright 1.63's bare `chromium.launch()` defaults to **`chrome-headless-shell`**, which has no
 * `AudioWorklet` at all — so the master limiter silently takes its `DynamicsCompressor` fallback and the render is the degraded path,
 * not the shipped one. `--browser=chromium` selects the full headless Chromium, whose `AudioWorkletNode` exists in an
 * `OfflineAudioContext`. Both are reported, because which one `mcp/render/worker.ts` gets is itself a finding.
 */
const BROWSER = argValue("--browser", "shell");
const ARM_LIST = argValue("--arms", "baseline,reverb-convolution,comp-off,silent,drums-only,only-chords,no-graph").split(",");
const LAUNCH_OPTIONS = BROWSER === "chromium" ? { channel: "chromium", args: ["--no-sandbox"] } : { args: ["--no-sandbox"] };
const BASE_URL = `http://127.0.0.1:${PORT}`;

const { chromium } = require("playwright");
const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");

const server = spawn(process.execPath, [viteBin, "--port", String(PORT), "--strictPort"], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", (chunk) => process.stderr.write(`  [vite] ${chunk}`));

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(1000) });
      if (res.ok || res.status === 404) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("vite did not start");
}

const sum = (values) => values.reduce((a, b) => a + b, 0);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const round = (value, digits = 1) => Number(value.toFixed(digits));
const secs = (value) => `${round(value / 1000, 3)} s`;

/** Load the fixture and describe it, in the page, so the report names what was actually rendered. */
const IN_PAGE_FIXTURE = async ({ genreId, bars }) => {
  const { GENRES_MAP } = await import("/src/data/genres/index.ts");
  const { patternFromGenre } = await import("/src/data/genreMix.ts");
  const genre = GENRES_MAP[genreId];
  if (!genre) return { error: `no genre ${genreId}` };
  const pattern = patternFromGenre(genre);
  const tracks = pattern.tracks.map((track) => ({
    id: track.track_id,
    instrument: track.instrument,
    steps: track.steps.length,
    onsets: track.steps.filter((s) => s > 0).length,
    hasSample: Boolean(track.sample),
  }));
  return {
    genreId,
    genreName: genre.name,
    defaultBpm: genre.default_bpm,
    bars,
    totalSteps: pattern.tracks[0]?.steps.length ?? 0,
    tracks,
    pattern: { genre_id: pattern.genre_id, bpm: pattern.bpm, totalSteps: pattern.totalSteps },
  };
};

/**
 * One timed render arm, in the page.
 *
 * `ablate` is applied to the **shared graph object** after `buildMasterGraph` has produced it — see the caller: the page wraps `renderPatternOffline` once and
 * patches `opts` before delegating, which is the only way to switch a stage off without changing the renderer's own API.
 */
const IN_PAGE_RENDER = async ({ genreId, bars, runs, mode }) => {
  /** In-band load probe — see the note in `IN_PAGE_ABLATE`. */
  const controlMs = async () => {
    const ctx = new OfflineAudioContext(2, 22050, 44100);
    const gain = ctx.createGain();
    gain.gain.value = 0.2;
    gain.connect(ctx.destination);
    for (let i = 0; i < 4; i += 1) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 110 * (i + 1);
      osc.connect(gain);
      osc.start(0);
      osc.stop(0.5);
    }
    const t0 = performance.now();
    await ctx.startRendering();
    return performance.now() - t0;
  };
  const { GENRES_MAP } = await import("/src/data/genres/index.ts");
  const { patternFromGenre } = await import("/src/data/genreMix.ts");
  const wav = await import("/src/audio/WavExporter.ts");
  const genre = GENRES_MAP[genreId];
  const pattern = patternFromGenre(genre);
  const device = {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory ?? null,
  };
  const results = [];
  for (let run = 0; run < runs; run += 1) {
    const sink = { phases: {}, onPhase: (name, ms, totalMs) => console.log(`    [phase] ${name} ${ms.toFixed(1)} ms @ ${totalMs.toFixed(1)} ms`) };
    globalThis.__grooveRenderTimings = sink;
    const controlBefore = await controlMs();
    const startedAt = performance.now();
    const buffer = await wav.renderPatternOffline(pattern, { bars });
    const renderFinishedAt = performance.now();
    const encodeStartedAt = performance.now();
    // The byte length is taken rather than the bytes: shipping a multi-megabyte WAV back through `page.evaluate` to report its size stalled the 8-bar run.
    const byteLength = wav.encodeAudioBufferToWav(buffer).byteLength;
    const encodeFinishedAt = performance.now();
    const controlAfter = await controlMs();
    globalThis.__grooveRenderTimings = null;
    const realtimeSec = buffer.length / buffer.sampleRate;
    results.push({
      run,
      device,
      controlMs: (controlBefore + controlAfter) / 2,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      frames: buffer.length,
      audioSec: realtimeSec,
      renderMs: renderFinishedAt - startedAt,
      encodeMs: encodeFinishedAt - encodeStartedAt,
      bytes: byteLength,
      phases: { ...sink.phases },
      meta: { ...(sink.meta ?? {}) },
    });
  }
  return { device, pattern: { genreId, bars, bpm: pattern.bpm }, results };
};

/** The same render, but with a graph stage switched off — the differential attribution for what `startRendering()` hides. */
const IN_PAGE_ABLATE = async ({ genreId, bars, arm }) => {
  /**
   * In-band load probe: a 0.5 s trivial graph, measured at ~4.7 ms with the machine quiet. It rides the same contention as the render it brackets, so the ratio
   * `arm / control` is far more stable than either raw number on this shared laptop (see the note in `main`).
   */
  const controlMs = async () => {
    const ctx = new OfflineAudioContext(2, 22050, 44100);
    const gain = ctx.createGain();
    gain.gain.value = 0.2;
    gain.connect(ctx.destination);
    for (let i = 0; i < 4; i += 1) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 110 * (i + 1);
      osc.connect(gain);
      osc.start(0);
      osc.stop(0.5);
    }
    const t0 = performance.now();
    await ctx.startRendering();
    return performance.now() - t0;
  };
  const { GENRES_MAP } = await import("/src/data/genres/index.ts");
  const { patternFromGenre } = await import("/src/data/genreMix.ts");
  const wav = await import("/src/audio/WavExporter.ts");
  const genre = GENRES_MAP[genreId];
  const base = patternFromGenre(genre);
  /**
   * `silent-…` arms zero every lane so the graph is present but no voice ever sounds; the suffix names the stage also switched off. That is the only way to see
   * what the graph costs when there is nothing to hear, which is where the whole of a "silent" render's 12 s turns out to live.
   */
  const silent = arm.startsWith("silent");
  const stage = silent ? arm.slice("silent".length).replace(/^-/, "") : "";
  const pattern = silent ? { ...base, tracks: base.tracks.map((t) => ({ ...t, steps: t.steps.map(() => 0) })) } : base;
  const sink = { phases: {} };
  globalThis.__grooveRenderTimings = sink;
  globalThis.__grooveRenderAblation = null;
  const controlBefore = await controlMs();
  const startedAt = performance.now();
  let buffer;
  if (silent) {
    if (stage === "reverb" || stage === "reverb-comp") globalThis.__grooveRenderAblation = "reverb-convolution";
    buffer = await wav.renderPatternOffline(pattern, {
      bars,
      ...(stage === "comp" || stage === "reverb-comp" ? { masterBusCompEnabled: false } : {}),
      ...(stage === "fx" ? { bypassFxRack: true } : {}),
      ...(stage === "graph" ? { directOut: true } : {}),
    });
  } else if (arm === "reverb-convolution") {
    // Swaps the impulse for one frame of silence, so the convolution itself stops — a level ramp cannot answer this (see the WavExporter note).
    globalThis.__grooveRenderAblation = "reverb-convolution";
    buffer = await wav.renderPatternOffline(base, { bars });
  } else if (arm === "silent") {
    // A graph with every lane, every node and no voice at all: the floor that graph construction alone costs.
    buffer = await wav.renderPatternOffline(
      { ...base, tracks: base.tracks.map((t) => ({ ...t, steps: t.steps.map(() => 0) })) },
      { bars }
    );
  } else if (arm.startsWith("only-")) {
    const lane = arm.slice("only-".length);
    buffer = await wav.renderPatternOffline(
      { ...base, tracks: base.tracks.map((t) => (String(t.track_id) === lane ? t : { ...t, steps: t.steps.map(() => 0) })) },
      { bars }
    );
  } else if (arm === "no-graph") {
    // `directOut` sends every lane straight to the destination: no master chain, no reverb, no delay, no limiter. The subtraction from `baseline` is the
    // whole master bus, and the subtraction from `silent` is what the master bus costs above the voices.
    buffer = await wav.renderPatternOffline(base, { bars, directOut: true });
  } else if (arm === "drums-only") {
    // Lane 0 alone keeps its onsets; every other lane is zeroed, so the difference is voice synthesis and the FX those voices feed, not graph construction.
    buffer = await wav.renderPatternOffline(
      { ...base, tracks: base.tracks.map((t, i) => (i === 0 ? t : { ...t, steps: t.steps.map(() => 0) })) },
      { bars }
    );
  } else if (arm === "comp-off") {
    buffer = await wav.renderPatternOffline(base, { bars, masterBusCompEnabled: false });
  } else {
    buffer = await wav.renderPatternOffline(base, { bars });
  }
  const renderFinishedAt = performance.now();
  const controlAfter = await controlMs();
  globalThis.__grooveRenderTimings = null;
  globalThis.__grooveRenderAblation = null;
  return {
    arm,
    audioSec: buffer.length / buffer.sampleRate,
    renderMs: renderFinishedAt - startedAt,
    controlMs: (controlBefore + controlAfter) / 2,
    phases: { ...sink.phases },
    meta: { ...(sink.meta ?? {}) },
  };
};

/** The full MCP path: the same page render plus the WAV encode, the JSON round trip and the file write. */
const IN_PAGE_MCP = async ({ genreId, bars }) => {
  const { GENRES_MAP } = await import("/src/data/genres/index.ts");
  const { patternFromGenre } = await import("/src/data/genreMix.ts");
  const wav = await import("/src/audio/WavExporter.ts");
  const pattern = patternFromGenre(GENRES_MAP[genreId]);
  const sink = { phases: {} };
  globalThis.__grooveRenderTimings = sink;
  const buffer = await wav.renderPatternOffline(pattern, { bars });
  const bytes = new Uint8Array(wav.encodeAudioBufferToWav(buffer));
  globalThis.__grooveRenderTimings = null;
  // Base64 is what `mcp/render/worker.ts` actually sends back, so it is what the caller's latency includes.
  const base64StartedAt = performance.now();
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  const base64 = btoa(binary);
  return {
    base64,
    base64Ms: performance.now() - base64StartedAt,
    bytes: bytes.byteLength,
    audioSec: buffer.length / buffer.sampleRate,
    phases: { ...sink.phases },
    meta: { ...(sink.meta ?? {}) },
  };
};

/**
 * **Does the offline render's wall clock track the audio's duration or its sample count?**
 *
 * That is the difference between "the DSP costs this much per sample" and "something is rendering at realtime speed regardless of how little work there is to do" —
 * and it decides whether the fix is a faster DSP or a different renderer. This arm renders one pattern under four (rate, channels) configurations and, for each,
 * one with every lane silent, so the empty-graph floor is visible at each rate too.
 */
const IN_PAGE_RATE_SWEEP = async ({ genreId, bars, sampleRate, channels, silent }) => {
  /** In-band load probe — see the note in `IN_PAGE_ABLATE`. */
  const controlMs = async () => {
    const ctx = new OfflineAudioContext(2, 22050, 44100);
    const gain = ctx.createGain();
    gain.gain.value = 0.2;
    gain.connect(ctx.destination);
    for (let i = 0; i < 4; i += 1) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 110 * (i + 1);
      osc.connect(gain);
      osc.start(0);
      osc.stop(0.5);
    }
    const t0 = performance.now();
    await ctx.startRendering();
    return performance.now() - t0;
  };
  const { GENRES_MAP } = await import("/src/data/genres/index.ts");
  const { patternFromGenre } = await import("/src/data/genreMix.ts");
  const wav = await import("/src/audio/WavExporter.ts");
  const base = patternFromGenre(GENRES_MAP[genreId]);
  const pattern = silent ? { ...base, tracks: base.tracks.map((t) => ({ ...t, steps: t.steps.map(() => 0) })) } : base;
  const sink = { phases: {} };
  globalThis.__grooveRenderTimings = sink;
  const controlBefore = await controlMs();
  const startedAt = performance.now();
  const buffer = await wav.renderPatternOffline(pattern, { bars, sampleRate, channels });
  const finishedAt = performance.now();
  const controlAfter = await controlMs();
  globalThis.__grooveRenderTimings = null;
  return {
    sampleRate,
    channels,
    silent,
    controlMs: (controlBefore + controlAfter) / 2,
    audioSec: buffer.length / buffer.sampleRate,
    frames: buffer.length,
    renderMs: finishedAt - startedAt,
    startRenderingWall: sink.phases["meta:startRenderingWall"] ?? 0,
    phases: { ...sink.phases },
  };
};

/**
 * **The load probe, run in-band around every timed render, and the control that makes the rest of this report interpretable.**
 *
 * This checkout shares a laptop with several other agents' Chromium renders (load average 4-11 on 8 cores across these runs), and a single-threaded render's wall
 * clock moves by tens of percent with that load — measured: the same 1-bar `silent` render came in at 11.0 s and 15.2 s an hour apart. A trivial-graph render of
 * the *same browser* rides the same contention, so `arm / control` is far more stable than either raw number, and every figure below is given both ways.
 *
 * A `silent` arm of the real renderer still builds the app's whole master graph, so it cannot tell "the app's graph is expensive" from "this Chromium renders any
 * graph at about realtime". This renders nothing but four oscillators into one gain into the destination — no app code — at three durations and two rates. If a
 * trivial graph is also ~1× realtime, then no measurement of this renderer on this browser can be compared with a number taken elsewhere, and the honest report
 * says so.
 */
const IN_PAGE_CONTROL = async ({ seconds, sampleRate, channels, oscillators }) => {
  const frames = Math.round(seconds * sampleRate);
  const ctx = new OfflineAudioContext(channels, frames, sampleRate);
  const gain = ctx.createGain();
  gain.gain.value = 0.2;
  gain.connect(ctx.destination);
  for (let i = 0; i < oscillators; i += 1) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 110 * (i + 1);
    osc.connect(gain);
    osc.start(0);
    osc.stop(seconds);
  }
  const startedAt = performance.now();
  const rendered = await ctx.startRendering();
  const finishedAt = performance.now();
  // Read one sample so nothing can be optimised away.
  return {
    seconds,
    sampleRate,
    channels,
    oscillators,
    frames: rendered.length,
    ms: finishedAt - startedAt,
  };
};

/** The analysis lever: 8 kHz mono, exactly what `mcp/render/worker.ts` offers for an analysis render. */
const IN_PAGE_ANALYSIS = async ({ genreId, bars }) => {
  const { GENRES_MAP } = await import("/src/data/genres/index.ts");
  const { patternFromGenre } = await import("/src/data/genreMix.ts");
  const wav = await import("/src/audio/WavExporter.ts");
  const pattern = patternFromGenre(GENRES_MAP[genreId]);
  const sink = { phases: {} };
  globalThis.__grooveRenderTimings = sink;
  const startedAt = performance.now();
  const buffer = await wav.renderPatternOffline(pattern, { bars, sampleRate: 8000, channels: 1 });
  const finishedAt = performance.now();
  globalThis.__grooveRenderTimings = null;
  return {
    audioSec: buffer.length / buffer.sampleRate,
    renderMs: finishedAt - startedAt,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    phases: { ...sink.phases },
    meta: { ...(sink.meta ?? {}) },
  };
};

function printPhaseTable(label, channels) {
  const names = new Set();
  for (const channel of channels) for (const key of Object.keys(channel.phases)) names.add(key);
  const rows = [...names].map((name) => ({
    name,
    ms: median(channels.map((c) => c.phases[name] ?? 0)),
  }));
  rows.sort((a, b) => b.ms - a.ms);
  console.log(`\n${label} — median over ${channels.length} run(s)`);
  console.log(`  ${"phase".padEnd(34)} ${"ms".padStart(9)}   share of total`);
  for (const row of rows) {
    const total = median(channels.map((c) => c.phases["meta:totalWall"] ?? c.renderMs));
    const share = total > 0 ? `  ${((row.ms / total) * 100).toFixed(1)}%` : "";
    console.log(`  ${row.name.padEnd(34)} ${row.ms.toFixed(1).padStart(9)}${share}`);
  }
}

async function main() {
  await waitForServer();
  console.log(`offline render profile — fixture: ${GENRE} (${BARS} bars), mode ${MODE}, ${RUNS} run(s)`);
  console.log(`load average at start: ${(await import("node:fs")).readFileSync("/proc/loadavg", "utf8").trim()}`);

  console.log(`browser: ${BROWSER === "chromium" ? "full headless Chromium (AudioWorklet present)" : "chrome-headless-shell (no AudioWorklet)"}`);
  const browser = await chromium.launch(LAUNCH_OPTIONS);
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error(`  [page error] ${msg.text()}`);
    else if (VERBOSE) console.log(`  [page] ${msg.text()}`);
  });
  await page.route("**/__render_profile__.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><meta charset="utf-8"><title>render profile</title></head><body></body></html>',
    })
  );
  await page.goto(`${BASE_URL}/__render_profile__.html`, { waitUntil: "domcontentloaded", timeout: 60000 });

  if (MODE === "control") {
    console.log("\ncontrol — four oscillators, one gain, into the destination (no app code):");
    console.log("  seconds   rate  ch  osc   frames    wall ms   ×realtime");
    for (const config of [
      { seconds: 0.5, sampleRate: 44100, channels: 2 },
      { seconds: 2, sampleRate: 44100, channels: 2 },
      { seconds: 10, sampleRate: 44100, channels: 2 },
      { seconds: 17, sampleRate: 44100, channels: 2 },
      { seconds: 10, sampleRate: 8000, channels: 2 },
      { seconds: 10, sampleRate: 44100, channels: 1 },
      { seconds: 10, sampleRate: 44100, channels: 2, oscillators: 64 },
    ]) {
      const result = await page.evaluate(IN_PAGE_CONTROL, { oscillators: 4, ...config });
      console.log(
        `  ${String(result.seconds).padStart(7)}  ${String(result.sampleRate).padStart(5)}  ${result.channels}  ${String(result.oscillators).padStart(3)}  ` +
          `${String(result.frames).padStart(8)}  ${result.ms.toFixed(1).padStart(9)}  ${(result.seconds / (result.ms / 1000)).toFixed(2).padStart(8)}×`
      );
    }
    await browser.close().catch(() => {});
    server.kill("SIGTERM");
    return;
  }

  const fixture = await page.evaluate(IN_PAGE_FIXTURE, { genreId: GENRE, bars: BARS });
  if (fixture.error) throw new Error(fixture.error);
  console.log(
    `\nfixture: ${fixture.genreName} (${fixture.genreId}), default ${fixture.defaultBpm} BPM, ${fixture.bars} bars, ` +
      `${fixture.tracks.length} lanes, ${fixture.totalSteps} steps/lane`
  );
  for (const track of fixture.tracks) {
    console.log(
      `  ${String(track.id).padEnd(12)} ${String(track.instrument ?? "-").padEnd(20)} ${String(track.onsets).padStart(3)} onsets over ${track.steps} steps` +
        (track.hasSample ? "  [audio lane]" : "")
    );
  }

  if (MODE === "ablate") {
    const arms = ARM_LIST;
    const byArm = {};
    /**
     * A repeated arm name is allowed and is the reproducibility control: `--arms=baseline,reverb,reverb,silent` runs the same arm twice in the same
     * round-robin, so "is this effect real, or is it the load window?" is answered by the run itself rather than by repeating the whole invocation.
     */
    const counts = new Map();
    for (const arm of arms) counts.set(arm, (counts.get(arm) ?? 0) + 1);
    const seen = new Map();
    for (const arm of arms) {
      const n = (seen.get(arm) ?? 0) + 1;
      seen.set(arm, n);
      byArm[counts.get(arm) > 1 ? `${arm}#${n}` : arm] = [];
    }
    /**
     * **Round-robin, not arm-by-arm.** Load drifts over minutes here, so running all repeats of one arm together bakes that drift into whichever arm happened to
     * run during the noisy window — the mistake that produced a "reverb costs *negative* 1.9 s" reading on the first attempt. One pass over every arm per round,
     * then medians, keeps the drift common to all arms.
     */
    for (let round = 0; round < RUNS; round += 1) {
      const seenInRound = new Map();
      for (const arm of arms) {
        const n = (seenInRound.get(arm) ?? 0) + 1;
        seenInRound.set(arm, n);
        const key = counts.get(arm) > 1 ? `${arm}#${n}` : arm;
        byArm[key].push(await page.evaluate(IN_PAGE_ABLATE, { genreId: GENRE, bars: BARS, arm }));
      }
    }
    const keys = Object.keys(byArm);
    const referenceControl = median(keys.flatMap((key) => byArm[key].map((s) => s.controlMs)));
    const summarise = (samples) => {
      const norma = (pick) => samples.map((s) => pick(s) * (referenceControl / s.controlMs));
      return {
        renderMs: median(samples.map((s) => s.renderMs)),
        renderMsNorm: median(norma((s) => s.renderMs)),
        startRenderingWall: median(samples.map((s) => s.phases["meta:startRenderingWall"] ?? 0)),
        startRenderingWallNorm: median(norma((s) => s.phases["meta:startRenderingWall"] ?? 0)),
        controlMs: median(samples.map((s) => s.controlMs)),
        audioSec: samples[0].audioSec,
        n: samples.length,
      };
    };
    console.log(`\nreference control render (0.5 s trivial graph): ${referenceControl.toFixed(1)} ms`);
    console.log(`\n${"arm".padEnd(16)} ${"raw render".padStart(11)} ${"load-normalised".padStart(16)} ${"×realtime".padStart(10)} ${"control ms".padStart(11)}  n`);
    for (const arm of keys) {
      const row = summarise(byArm[arm]);
      console.log(
        `  ${arm.padEnd(14)} ${(row.renderMs / 1000).toFixed(3).padStart(9)} s ${(row.renderMsNorm / 1000).toFixed(3).padStart(14)} s ` +
          `${(row.audioSec / (row.renderMsNorm / 1000)).toFixed(2).padStart(9)}× ${row.controlMs.toFixed(1).padStart(10)}  ${row.n}`
      );
    }
    const base = summarise(byArm.baseline);
    console.log("\ndeltas against baseline — raw and load-normalised (total render / inside startRendering):");
    for (const arm of keys.slice(1)) {
      const row = summarise(byArm[arm]);
      console.log(
        `  ${arm.padEnd(18)} total ${((row.renderMs - base.renderMs) / 1000).toFixed(3).padStart(8)} s ` +
          `(norm ${((row.renderMsNorm - base.renderMsNorm) / 1000).toFixed(3).padStart(8)} s),  ` +
          `startRendering ${((row.startRenderingWall - base.startRenderingWall) / 1000).toFixed(3).padStart(8)} s ` +
          `(norm ${((row.startRenderingWallNorm - base.startRenderingWallNorm) / 1000).toFixed(3).padStart(8)} s)`
      );
    }
  } else if (MODE === "mcp") {
    const samples = [];
    for (let i = 0; i < RUNS; i += 1) {
      const wallStart = performance.now();
      const result = await page.evaluate(IN_PAGE_MCP, { genreId: GENRE, bars: BARS });
      const wallMs = performance.now() - wallStart;
      const file = path.join(os.tmpdir(), `groove-profile-${Date.now()}-${i}.wav`);
      const buffer = Buffer.from(result.base64, "base64");
      const writeStart = performance.now();
      writeFileSync(file, buffer);
      const writeMs = performance.now() - writeStart;
      samples.push({ ...result, wallMs, writeMs });
      console.log(
        `\nrun ${i}: end-to-end ${secs(wallMs)} (page→Node round trip ${round(wallMs - result.base64Ms - (result.phases["meta:totalWall"] ?? 0), 0)} ms), ` +
          `base64 ${round(result.base64Ms, 0)} ms, Node write ${round(writeMs, 1)} ms, ${(result.bytes / 1024).toFixed(0)} KiB`
      );
      printPhaseTable("  phases", [result]);
    }
    printPhaseTable("end-to-end (all runs)", samples.map((s) => ({ phases: s.phases, renderMs: s.wallMs })));
    console.log(`  median end-to-end: ${secs(median(samples.map((s) => s.wallMs)))}`);
  } else if (MODE === "bars") {
    const rows = [];
    for (const bars of [1, 2, 4, 8]) rows.push({ bars, full: [], silent: [] });
    for (let round = 0; round < RUNS; round += 1) {
      for (const row of rows) {
        row.full.push(await page.evaluate(IN_PAGE_RATE_SWEEP, { genreId: GENRE, bars: row.bars, sampleRate: 44100, channels: 2, silent: false }));
        row.silent.push(await page.evaluate(IN_PAGE_RATE_SWEEP, { genreId: GENRE, bars: row.bars, sampleRate: 44100, channels: 2, silent: true }));
      }
    }
    const referenceControl = median(rows.flatMap((r) => [...r.full, ...r.silent].map((s) => s.controlMs)));
    console.log(`\nreference control render: ${referenceControl.toFixed(1)} ms`);
    console.log("\n  bars  steps   audio s   full render s   ×realtime   silent render s   silent ×realtime");
    for (const row of rows) {
      const norm = (samples) => median(samples.map((x) => x.renderMs * (referenceControl / x.controlMs)));
      const fullMs = norm(row.full);
      const silentMs = norm(row.silent);
      const audioSec = row.full[0].audioSec;
      console.log(
        `  ${String(row.bars).padStart(4)}  ${String(row.bars * (fixture.totalSteps / fixture.bars)).padStart(5)}  ` +
          `${audioSec.toFixed(2).padStart(8)}  ${(fullMs / 1000).toFixed(3).padStart(14)}  ${(audioSec / (fullMs / 1000)).toFixed(2).padStart(9)}×  ` +
          `${(silentMs / 1000).toFixed(3).padStart(15)}  ${(audioSec / (silentMs / 1000)).toFixed(2).padStart(15)}×`
      );
    }
  } else if (MODE === "cpu") {
    /**
     * **Is the render burning CPU, or waiting?**
     *
     * A `startRendering()` that takes 12 s for an empty graph is either doing 12 s of real work or sitting in a lock/timer — and those are different findings with
     * different fixes. The page cannot see its own process CPU time, so this reads the renderer process's own `utime + stime` across each render. One long render
     * per reading, so no other work in the process pollutes the delta.
     */
    const cpuMs = async (pid) => {
      const stat = (await import("node:fs")).readFileSync(`/proc/${pid}/stat`, "utf8");
      const after = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      // Fields after the comm: state=0, ppid=1, … utime=11, stime=12.
      return (Number(after[11]) + Number(after[12])) * (1000 / 100);
    };
    /**
     * Find the renderer by walking the process tree: our own pid → the Chromium browser child → its `--type=renderer` child. Matching on a command-line
     * substring would have picked one of the seven other agents' renderers sharing this laptop.
     */
    const fs = await import("node:fs");
    const ppidOf = (pid) => {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
    };
    const isRenderer = (pid) => {
      try {
        return fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").includes("--type=renderer");
      } catch {
        return false;
      }
    };
    const allPids = () => fs.readdirSync("/proc").filter((n) => /^\d+$/.test(n)).map(Number);
    const descendants = [process.pid, ...allPids().filter((pid) => {
      try {
        return ppidOf(pid) === process.pid;
      } catch {
        return false;
      }
    })];
    let targetPid = null;
    for (const root of descendants) {
      const stack = [root];
      while (stack.length && !targetPid) {
        const pid = stack.pop();
        if (isRenderer(pid)) targetPid = pid;
        else for (const child of allPids()) {
          try {
            if (ppidOf(child) === pid) stack.push(child);
          } catch {
            /* gone */
          }
        }
      }
      if (targetPid) break;
    }
    if (!targetPid) throw new Error("could not find this run's renderer process");
    console.log(`\nrenderer pid ${targetPid}`);
    for (const arm of ["silent", "only-kick", "baseline"]) {
      const before = await cpuMs(targetPid);
      const result = await page.evaluate(IN_PAGE_ABLATE, { genreId: GENRE, bars: BARS, arm });
      const after = await cpuMs(targetPid);
      console.log(
        `  ${arm.padEnd(12)} wall ${(result.renderMs / 1000).toFixed(2)} s, process CPU ${((after - before) / 1000).toFixed(2)} s ` +
          `⇒ ${(((after - before) / result.renderMs) * 100).toFixed(0)}% of one core`
      );
    }
  } else if (MODE === "sweep") {
    const configs = [
      { sampleRate: 44100, channels: 2 },
      { sampleRate: 44100, channels: 1 },
      { sampleRate: 8000, channels: 2 },
      { sampleRate: 8000, channels: 1 },
    ];
    const cells = [];
    for (const config of configs) for (const silent of [false, true]) cells.push({ ...config, silent, samples: [] });
    for (let round = 0; round < RUNS; round += 1) {
      for (const cell of cells) {
        cell.samples.push(
          await page.evaluate(IN_PAGE_RATE_SWEEP, { genreId: GENRE, bars: BARS, sampleRate: cell.sampleRate, channels: cell.channels, silent: cell.silent })
        );
      }
    }
    const referenceControl = median(cells.flatMap((c) => c.samples.map((s) => s.controlMs)));
    console.log(`\nreference control render: ${referenceControl.toFixed(1)} ms`);
    console.log("\n  rate   ch  voices   audio s   raw render s   load-normalised s   ×realtime");
    for (const cell of cells) {
      const ms = median(cell.samples.map((x) => x.renderMs * (referenceControl / x.controlMs)));
      const audioSec = cell.samples[0].audioSec;
      console.log(
        `  ${String(cell.sampleRate).padStart(5)}  ${cell.channels}   ${(cell.silent ? "silent" : "full").padEnd(6)}  ` +
          `${audioSec.toFixed(2).padStart(7)}  ${(median(cell.samples.map((x) => x.renderMs)) / 1000).toFixed(3).padStart(13)}  ` +
          `${(ms / 1000).toFixed(3).padStart(18)}  ${(audioSec / (ms / 1000)).toFixed(2).padStart(9)}×`
      );
    }
  } else if (MODE === "analysis") {
    for (let i = 0; i < RUNS; i += 1) {
      const result = await page.evaluate(IN_PAGE_ANALYSIS, { genreId: GENRE, bars: BARS });
      console.log(
        `\nrun ${i}: ${result.audioSec.toFixed(2)} s audio at ${result.sampleRate} Hz × ${result.channels}ch in ${secs(result.renderMs)} ` +
          `(${(result.audioSec / (result.renderMs / 1000)).toFixed(1)}× realtime)`
      );
      printPhaseTable("  phases", [result]);
    }
  } else {
    const measured = await page.evaluate(IN_PAGE_RENDER, { genreId: GENRE, bars: BARS, runs: RUNS, mode: MODE });
    console.log(
      `\ndevice: ${measured.device.userAgent}\n  hardwareConcurrency=${measured.device.hardwareConcurrency} deviceMemory=${measured.device.deviceMemory}`
    );
    for (const sample of measured.results) {
      console.log(
        `\nrun ${sample.run}: ${round(sample.audioSec, 2)} s audio (${sample.frames} frames @ ${sample.sampleRate} Hz × ${sample.channels}ch), ` +
          `${sample.channels === 2 ? "stereo" : "mono"}`
      );
      console.log(
        `  end to end  ${secs(sample.renderMs)} raw (load probe ${sample.controlMs.toFixed(1)} ms)  = ` +
          `${(sample.audioSec / (sample.renderMs / 1000)).toFixed(1)}× realtime   ` +
          `(of which startRendering ${secs(sample.phases["meta:startRenderingWall"] ?? 0)})`
      );
      console.log(`  WAV encode  ${round(sample.encodeMs, 1)} ms  → ${(sample.bytes / 1024).toFixed(0)} KiB`);
      const meta = sample.meta ?? {};
      console.log(
        `  graph: rate ${meta.sampleRate} Hz × ${meta.channels}ch, ${meta.lengthInSamples} frames, reverb decay ${meta.reverbDecaySec} s ` +
          `⇒ impulse ${meta.reverbImpulseFrames} frames (${(Number(meta.reverbImpulseFrames) / Number(meta.sampleRate)).toFixed(2)} s), ` +
          `${meta.reverbImpulseBuilds} build(s), limiter ${meta.limiterKind}`
      );
      printPhaseTable("  phases", [sample]);
    }
    const referenceControl = median(measured.results.map((r) => r.controlMs));
    const norm = measured.results.map((r) => r.renderMs * (referenceControl / r.controlMs));
    console.log(
      `\nload-normalised end to end (reference control ${referenceControl.toFixed(1)} ms): median ${secs(median(norm))}, ` +
        `all runs: ${norm.map((v) => (v / 1000).toFixed(3)).join(" / ")} s`
    );
    console.log(
      `  load-normalised startRendering: median ${secs(
        median(measured.results.map((r) => (r.phases["meta:startRenderingWall"] ?? 0) * (referenceControl / r.controlMs)))
      )}`
    );
    const medianEnd = median(measured.results.map((r) => r.renderMs));
    console.log(
      `\nmedian end to end: ${secs(medianEnd)}; median inside startRendering: ${secs(
        median(measured.results.map((r) => r.phases["meta:startRenderingWall"] ?? 0))
      )}; median audio ${round(median(measured.results.map((r) => r.audioSec)), 2)} s ⇒ ` +
        `${(median(measured.results.map((r) => r.audioSec)) / (medianEnd / 1000)).toFixed(1)}× realtime`
    );
    console.log(`load average at end: ${(await import("node:fs")).readFileSync("/proc/loadavg", "utf8").trim()}`);
  }

  if (OUT) {
    writeFileSync(OUT, JSON.stringify({ fixture, mode: MODE, runs: RUNS, genre: GENRE, bars: BARS }, null, 2));
    console.log(`\nwrote ${OUT}`);
  }
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
}

main().catch((error) => {
  console.error(error);
  server.kill("SIGTERM");
  process.exit(1);
});
