/**
 * Run the loudness sweep in **separate invocations**, one per chunk, and merge the result.
 *
 * The measurement itself is correct; what it cannot do is a 159-genre sweep inside one browser process. A page reload resets
 * the JS realm but **not** the process's WebAssembly memory, and the GS-1 core's `WebAssembly.Memory` is never returned —
 * `WavExporter` documents the wall (~124 hosts, then every further instantiate fails, "whatever teardown is used"). A
 * previous single-process run aborted exactly as its own guard requires: the sentinel `alternative-rock` measured
 * −10.782 LUFS on the warm page and −11.493 after a reload (Δ −0.711 dB), with the reload having restored nothing.
 *
 * So each chunk of genres is one `measure_genre_loudness.mjs` invocation — a fresh Chromium, therefore a fresh WASM budget —
 * and their `genres` tables are merged into the single report the trim step and the CI freshness check consume.
 *
 * Usage:
 *   node scripts/run_loudness_sweep.mjs [--chunk=20] [--out=scripts/loudness.baseline.json] [--keep]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const chunkSize = Math.max(1, Number(value("chunk", "20")) || 20);
const outPath = path.resolve(ROOT, value("out", "scripts/loudness.baseline.json"));
const keepChunks = args.includes("--keep");
const chunkDir = `${outPath}.chunks`;

/** The genre order comes from the report being replaced, or from whatever partial run exists. */
const source = [outPath, `${outPath}.progress.json`, path.join(ROOT, "scripts", "loudness.baseline.json")].find(
  (candidate) => fs.existsSync(candidate)
);
if (!source) {
  console.error("no existing report to take the genre order from — run one genre first to seed it.");
  process.exit(1);
}
const seed = JSON.parse(fs.readFileSync(source, "utf8"));
const ids = Object.keys(seed.genres ?? {});
if (ids.length === 0) {
  console.error(`${source} has no genre rows to order the sweep by.`);
  process.exit(1);
}

fs.mkdirSync(chunkDir, { recursive: true });
const chunks = [];
for (let start = 0; start < ids.length; start += chunkSize) chunks.push(ids.slice(start, start + chunkSize));
console.log(`${ids.length} genre(s) → ${chunks.length} chunk(s) of ≤${chunkSize}, seed ${path.relative(ROOT, source)}`);

const genreFlagName = "--genres";
for (const [index, chunk] of chunks.entries()) {
  const chunkPath = path.join(chunkDir, `chunk-${String(index).padStart(2, "0")}.json`);
  if (fs.existsSync(chunkPath) && !keepChunks) {
    const existing = JSON.parse(fs.readFileSync(chunkPath, "utf8"));
    if (Object.keys(existing.genres ?? {}).length === chunk.length) {
      console.log(`chunk ${index + 1}/${chunks.length}: already measured, skipping`);
      continue;
    }
  }
  console.log(`\nchunk ${index + 1}/${chunks.length}: ${chunk.length} genre(s)`);
  /**
   * One genre is measured with `--limit=1`-style narrowing only in the first chunk; every later one names its genres, which
   * is the flag that reaches the tool's own catalog filter.
   */
  const result = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "scripts", "measure_genre_loudness.mjs"),
      `${genreFlagName}=${chunk.join(",")}`,
      `--out=${chunkPath}`,
    ],
    { cwd: ROOT, stdio: "inherit" }
  );
  if (result.status !== 0) {
    console.error(`\n❌ chunk ${index + 1} failed (exit ${result.status}); its report is at ${path.relative(ROOT, chunkPath)}`);
    process.exit(result.status ?? 1);
  }
}

/**
 * Merge: every chunk's rows into one report, with the header **recomputed** from them.
 *
 * The header is a summary of the rows — the library median, the three spreads (legacy → arranged → trimmed) and the list of
 * genres whose target is capped by dynamics — so inheriting it from a seed describes a different set of measurements. That is
 * exactly what the first merged sweep did, and the report's own gate caught it: a row whose trim is zero came back with no
 * post-trim measurement, and the spreads disagreed with the rows beneath them.
 *
 * The formulas are the measurement tool's own (`spreadOf` and the percentile of the arranged values); they are repeated here
 * because that file runs a measurement when imported, and a two-hour sweep is not the place to find out that a summary helper
 * was not exported.
 */
const merged = { ...seed, genres: {} };
for (const [index] of chunks.entries()) {
  const chunkPath = path.join(chunkDir, `chunk-${String(index).padStart(2, "0")}.json`);
  if (!fs.existsSync(chunkPath)) {
    console.error(`❌ chunk ${index + 1} produced no report; refusing to write a partial sweep`);
    process.exit(1);
  }
  Object.assign(merged.genres, JSON.parse(fs.readFileSync(chunkPath, "utf8")).genres ?? {});
}
const measured = Object.keys(merged.genres).length;
if (measured !== ids.length) {
  console.error(`❌ merged ${measured} of ${ids.length} genre(s); refusing to write a partial sweep`);
  process.exit(1);
}
merged.genreCount = measured;
merged.generatedAt = new Date().toISOString();

/** A zero trim's post-trim measurement is the arranged render — the tool does this too, for rows it measures itself. */
for (const row of Object.values(merged.genres)) {
  if (row.trimDb === 0) {
    for (const [from, to] of [
      ["arrangedLufs", "trimmedLufs"],
      ["arrangedPeakDb", "trimmedPeakDb"],
      ["arrangedTruePeakDb", "trimmedTruePeakDb"],
      ["arrangedRmsDb", "trimmedRmsDb"],
    ]) {
      if (!Number.isFinite(row[to]) && Number.isFinite(row[from])) row[to] = row[from];
    }
  }
}

const spreadOf = (key) => {
  const values = Object.values(merged.genres)
    .map((row) => row[key])
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const at = (fraction) => values[Math.min(values.length - 1, Math.floor(values.length * fraction))];
  return {
    count: values.length,
    min: Number(values[0].toFixed(3)),
    max: Number(values[values.length - 1].toFixed(3)),
    median: Number(at(0.5).toFixed(3)),
    p90p10: Number((at(0.9) - at(0.1)).toFixed(3)),
    fullRange: Number((values[values.length - 1] - values[0]).toFixed(3)),
  };
};
const pass = (legacyKey, beforeKey, afterKey) => ({
  legacyBefore: spreadOf(legacyKey),
  arrangedBefore: spreadOf(beforeKey),
  after: spreadOf(afterKey),
});
merged.spread = {
  ...pass("legacyLufs", "arrangedLufs", "trimmedLufs"),
  metric: merged.spread?.metric ?? "LUFS (ITU-R BS.1770-4 gated integrated loudness)",
  lufs: pass("legacyLufs", "arrangedLufs", "trimmedLufs"),
  rms: pass("legacyRmsDb", "arrangedRmsDb", "trimmedRmsDb"),
};
const arranged = Object.values(merged.genres)
  .map((row) => row.arrangedLufs)
  .filter((value) => Number.isFinite(value))
  .sort((a, b) => a - b);
merged.libraryMedianLufs = Number(arranged[Math.floor(arranged.length / 2)].toFixed(3));
merged.cappedByDynamics = Object.entries(merged.genres)
  .filter(([, row]) => row.targetCappedByDynamics)
  .map(([id]) => id);
fs.writeFileSync(outPath, `${JSON.stringify(merged, null, 1)}\n`);
console.log(`\n✅ ${measured} genre(s) merged into ${path.relative(ROOT, outPath)} from ${chunks.length} process(es)`);
