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

/** Merge: every chunk's rows, plus the seed's header fields, into one report. */
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
fs.writeFileSync(outPath, `${JSON.stringify(merged, null, 1)}\n`);
console.log(`\n✅ ${measured} genre(s) merged into ${path.relative(ROOT, outPath)} from ${chunks.length} process(es)`);
