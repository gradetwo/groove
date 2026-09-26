/**
 * The voicing queue: which genre/lane pairs are furthest from their native render.
 *
 * The `Voice Sweep` workflow fans the voicing probe across shards and uploads one JSON per shard; each row is an
 * instrument/lane pair with a **per-genre** measurement inside it. This reads a downloaded artefact directory and turns it
 * into the thing the quality plan keeps asking for: a queue, ordered by how far off a genre's lane is, with the note that
 * the detector *lists* and the controlled calibration *decides* (`docs/SYNTH_UPSTREAM_PLAN.md` §1g — four repetitions of
 * that lesson are why it is written down).
 *
 * Usage:
 *   gh run download <run-id> -D /tmp/vs
 *   node scripts/report_voicing_queue.mjs --dir=/tmp/vs [--limit=25] [--lane=lead]
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const dir = value("dir", "");
const limit = Number(value("limit", "25")) || 25;
const laneFilter = value("lane", "");

if (!dir || !fs.existsSync(dir)) {
  console.error("usage: node scripts/report_voicing_queue.mjs --dir=<downloaded artefacts> [--limit=25] [--lane=lead]");
  process.exit(1);
}

/** Every row in every shard, flattened to one entry per (genre, lane, instrument). */
function rows() {
  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    const shardDir = path.join(dir, entry);
    if (!fs.statSync(shardDir).isDirectory()) continue;
    for (const file of fs.readdirSync(shardDir)) {
      if (!file.endsWith(".json")) continue;
      let parsed;
      try {
        parsed = JSON.parse(fs.readFileSync(path.join(shardDir, file), "utf8"));
      } catch {
        continue;
      }
      for (const row of Array.isArray(parsed) ? parsed : [parsed]) {
        if (!row || !row.instrument || row.brightnessRatio === undefined) continue;
        for (const measurement of row.measurements ?? []) {
          out.push({
            genre: measurement.genre,
            lane: row.lane,
            instrument: row.instrument,
            patch: row.patch,
            brightness: measurement.brightnessRatio,
            levelDb: measurement.levelDb,
          });
        }
      }
    }
  }
  return out;
}

const all = rows().filter((row) => (laneFilter ? row.lane === laneFilter : true));
if (all.length === 0) {
  console.error(`no voicing rows under ${dir}${laneFilter ? ` for lane ${laneFilter}` : ""}`);
  process.exit(1);
}

/**
 * How far a row is from "the same as native", in one number.
 *
 * Brightness is a ratio, so it is scored in **octaves** (`|log2|`) — a 2x-bright lane and a 0.5x one are equally wrong —
 * and the level is scored in dB against a 3 dB tolerance, because a dB is already a ratio. Neither score is a verdict; the
 * point of the ordering is that the top of the list is where a controlled calibration is worth running first.
 */
const score = (row) => Math.abs(Math.log2(Math.max(1e-6, row.brightness))) + Math.max(0, Math.abs(row.levelDb) - 3) / 6;
const ranked = [...all].sort((a, b) => score(b) - score(a));

const byGenre = new Map();
for (const row of all) {
  const entry = byGenre.get(row.genre) ?? { genre: row.genre, worst: 0, lanes: 0 };
  entry.worst = Math.max(entry.worst, score(row));
  entry.lanes += 1;
  byGenre.set(row.genre, entry);
}
const genreRanked = [...byGenre.values()].sort((a, b) => b.worst - a.worst);

console.log(`voicing queue · ${all.length} genre/lane measurements from ${dir}\n`);
console.log("worst pairs (score = octaves of brightness + dB of level beyond 3):");
for (const row of ranked.slice(0, limit)) {
  const bright = row.brightness >= 1 ? `${row.brightness.toFixed(2)}x` : `1/${(1 / row.brightness).toFixed(2)}x`;
  console.log(
    `  ${score(row).toFixed(2)}  ${String(row.genre).padEnd(20)} ${String(row.lane).padEnd(7)} ` +
      `${String(row.instrument).padEnd(17)} -> ${String(row.patch).padEnd(17)} brightness ${bright.padEnd(8)} level ${row.levelDb.toFixed(1)} dB`
  );
}
console.log("\nworst genres (their single worst lane):");
for (const entry of genreRanked.slice(0, 12)) {
  console.log(`  ${entry.worst.toFixed(2)}  ${entry.genre} (${entry.lanes} lane${entry.lanes === 1 ? "" : "s"})`);
}
