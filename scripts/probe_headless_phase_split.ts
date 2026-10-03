#!/usr/bin/env node
/**
 * Where does a headless render's wall clock actually go?
 *
 * `scripts/probe_headless_parity.ts` answers "is the Node host the same sound"; it does not answer "how long
 * does one take, and which phase owns it". This probe does, using the renderer's **own** inert phase sink
 * (`globalThis.__grooveRenderTimings`, the same one `scripts/profile_offline_render.mjs` reads) plus two
 * `performance.now()` brackets around the headless entry point, so the split is taken from the code under
 * measurement rather than from a second stopwatch.
 *
 * It runs the **cold** call — the one an MCP `render_song` makes in a fresh server, which pays the optional
 * package load, the module graph, the one-time GS-1 offline capability probe and the host install — and then
 * warm repeats, so "fixed overhead per process" and "cost per bar" can be separated instead of guessed at.
 *
 *     npx vite-node scripts/probe_headless_phase_split.ts -- --bars=2 --bars=8 --runs=2
 *     npx vite-node scripts/probe_headless_phase_split.ts -- --genre=chicago-house --rate=44100 --channels=2
 *
 * Every number it prints is a wall-clock reading on the machine that ran it. It is a measurement harness, not
 * a gate: a gate has to pin a bound, and the honest bound here is a reading, which belongs in the document
 * beside the run that produced it.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const arg = (name: string, fallback?: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
};
const argAll = (name: string): string[] => process.argv.filter((a) => a.startsWith(`${name}=`)).map((a) => a.slice(name.length + 1));

const genreId = arg("--genre", "chicago-house")!;
const rates = [Number(arg("--rate", "44100"))];
const channelCount = Number(arg("--channels", "2")) === 1 ? 1 : 2;
const barCounts = (argAll("--bars").length ? argAll("--bars") : ["2", "8"]).map(Number);
const runs = Number(arg("--runs", "2"));

/** Is the optional native addon installed? The same question `headless.ts` asks, asked before anything else. */
const require = createRequire(import.meta.url);
try {
  require("node-web-audio-api");
} catch {
  console.log("SKIP  `node-web-audio-api` is not installed; nothing to measure.  npm i -D node-web-audio-api");
  process.exit(0);
}

const { GENRES_MAP } = await import("../src/data/genres/index.ts");
const { patternFromGenre } = await import("../src/data/genreMix.ts");
const { renderPatternHeadless } = await import("../mcp/render/headless.ts");
const { readAudioLaneCatalogue, sampleMirrorRoot } = await import("../mcp/render/worker.ts");

const genre = (GENRES_MAP as Record<string, unknown>)[genreId];
if (!genre) {
  console.error(`no genre "${genreId}"`);
  process.exit(1);
}
const pattern = patternFromGenre(genre as never);
const catalogueRead = readAudioLaneCatalogue(pattern as never);

console.log("headless phase split");
console.log(`  when      : ${new Date().toISOString()}`);
console.log(`  host      : ${os.hostname()} · node ${process.version} · ${os.cpus().length} cpus · ${os.cpus()[0]?.model ?? "?"}`);
console.log(`  load avg  : ${os.loadavg().map((n) => n.toFixed(2)).join(" / ")}`);
console.log(`  fixture   : ${genreId} (${pattern.tracks?.length ?? 0} tracks, genre pattern is a 16-step bar)`);
console.log(`  catalogue : ${catalogueRead.text ? `${(catalogueRead.text.length / 1024).toFixed(0)} KB manifest` : "no audio lane, no manifest read"}${catalogueRead.problem ? ` — PROBLEM: ${catalogueRead.problem}` : ""}`);
console.log(`  options   : bars=${barCounts.join("/")} rate=${rates.join("/")} channels=${channelCount} runs=${runs}`);
console.log("");

interface Reading {
  label: string;
  cold: boolean;
  bars: number;
  totalMs: number;
  audioSec: number;
  frames: number;
  sampleRate: number;
  channels: number;
  outsideMs: number;
  phases: Record<string, number>;
  meta: Record<string, number | string>;
  base64Bytes: number;
}

const readings: Reading[] = [];
let first = true;

for (const rate of rates) {
  for (const bars of barCounts) {
    for (let run = 0; run < runs; run += 1) {
      const sink = { phases: {} as Record<string, number>, meta: {} as Record<string, number | string> };
      (globalThis as Record<string, unknown>).__grooveRenderTimings = sink;
      const startedAt = performance.now();
      const payload = await renderPatternHeadless(
        pattern as never,
        { format: "wav", bars, sampleRate: rate, channels: channelCount as 1 | 2 },
        catalogueRead,
        { publicRoot: path.join(ROOT, "public"), sampleRoot: sampleMirrorRoot() }
      );
      const finishedAt = performance.now();
      (globalThis as Record<string, unknown>).__grooveRenderTimings = null;

      const totalMs = finishedAt - startedAt;
      const insideMs = Number(sink.phases["meta:totalWall"] ?? 0);
      const reading: Reading = {
        label: `${bars} bar(s) @ ${rate} Hz ${channelCount}ch${first ? " [cold]" : run === 0 ? "" : ` [run ${run + 1}]`}`,
        cold: first,
        bars,
        totalMs,
        audioSec: payload.durationSec,
        frames: Math.round(payload.durationSec * payload.sampleRate),
        sampleRate: payload.sampleRate,
        channels: payload.channels,
        outsideMs: totalMs - insideMs,
        phases: { ...sink.phases },
        meta: { ...sink.meta },
        base64Bytes: Buffer.from(payload.base64, "base64").length,
      };
      readings.push(reading);
      first = false;
      console.log(`── ${reading.label}`);
      console.log(
        `   total ${totalMs.toFixed(0)} ms for ${reading.audioSec.toFixed(2)} s of audio ` +
          `= ${(reading.audioSec / (totalMs / 1000)).toFixed(2)}× realtime · ${reading.frames} frames · file ${(reading.base64Bytes / 1024).toFixed(0)} KB`
      );
      console.log(`   WavExporter totalWall ${insideMs.toFixed(0)} ms · headless.ts outside it ${reading.outsideMs.toFixed(0)} ms (imports, manifest parse, WAV encode, base64, loudness)`);
      // `WavExporter` writes its `meta:` readings into the same `phases` map as the phase boundaries, so they are
      // printed with them rather than looked for in a second place that is never filled.
      for (const [name, ms] of Object.entries(reading.phases).sort((a, b) => b[1] - a[1])) {
        console.log(`     ${name.padEnd(34)} ${ms.toFixed(1).padStart(8)} ms`);
      }
      console.log("");
    }
  }
}

/** The split the owner's question asks for: how much is paid once per process and how much per bar. */
console.log("=== fixed overhead vs per-bar ===");
for (const rate of rates) {
  const forRate = readings.filter((r) => r.sampleRate === rate);
  const cold = forRate.find((r) => r.cold);
  const warm = forRate.filter((r) => !r.cold);
  if (cold && warm.length) {
    const shortest = warm.reduce((a, b) => (a.bars <= b.bars ? a : b));
    console.log(
      `  ${rate} Hz: cold ${cold.label} ${cold.totalMs.toFixed(0)} ms vs warm ${shortest.label} ${shortest.totalMs.toFixed(0)} ms ` +
        `⇒ one-time-per-process ≈ ${(cold.totalMs - (warm.find((w) => w.bars === cold.bars)?.totalMs ?? shortest.totalMs)).toFixed(0)} ms`
    );
  }
  const byBars = new Map<number, number[]>();
  for (const r of forRate) {
    if (r.cold) continue;
    byBars.set(r.bars, [...(byBars.get(r.bars) ?? []), r.totalMs]);
  }
  const medians = [...byBars.entries()]
    .map(([bars, xs]) => [bars, xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]!] as const)
    .sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < medians.length; i += 1) {
    const [b0, t0] = medians[i - 1]!;
    const [b1, t1] = medians[i]!;
    console.log(`  ${rate} Hz: warm ${b0}→${b1} bars costs ${(t1 - t0).toFixed(0)} ms more ⇒ ${((t1 - t0) / (b1 - b0)).toFixed(0)} ms/bar (linear only if this holds at both ends)`);
  }
}

/** The renderer's own audio clock, so "× realtime" is audio-per-wall rather than a nominal bar length. */
console.log("\n=== the phases that own the WavExporter half (warm, median ms) ===");
const phaseNames = new Set<string>();
for (const r of readings) for (const name of Object.keys(r.phases)) phaseNames.add(name);
const warmReadings = readings.filter((r) => !r.cold);
for (const name of [...phaseNames].sort()) {
  const values = warmReadings.map((r) => r.phases[name]).filter((v) => v !== undefined) as number[];
  if (!values.length) continue;
  const median = values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  console.log(`  ${name.padEnd(34)} ${median.toFixed(1).padStart(8)} ms  (n=${values.length})`);
}
for (const name of ["meta:startRenderingWall", "meta:renderCallCount", "meta:scheduleWall", "meta:toFinished"]) {
  const values = warmReadings.map((r) => r.phases[name]).filter((v) => v !== undefined) as number[];
  if (!values.length) continue;
  const median = values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  console.log(`  ${name.padEnd(34)} ${median.toFixed(1).padStart(8)}`);
}
console.log("");
