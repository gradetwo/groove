/**
 * Every routed instrument, measured against the genres that use it.
 *
 * The per-genre sweep answered "does this lane sound like the part it replaces" for twelve genres. The work that
 * remains is **all** of them, and the shape of the routing is what makes that tractable: 159 genres reach GS-1 through
 * only **~30 instruments** (8 chord voices, 17 lead voices, 5 texture voices). So this walks the instruments, picks the
 * genres that use each one, renders the lane with GS-1 and with `--no-gs1`, and reports the **median** brightness ratio
 * and level delta per instrument — the number that decides whether that instrument's patch (or the genre's use of it)
 * needs its own voice.
 *
 * `--shard=i/n` splits the instrument list so a CI matrix can run it in parallel, which is how this is meant to be
 * used: a local run of all 30 instruments × 2 lanes × 2 renders is half an hour, a sharded matrix is a few minutes.
 *
 * Usage:
 *   node scripts/probe_gs1_instrument_voicing.mjs [--lane=all] [--per-instrument=1] [--shard=1/4] [--out=report.json]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const value = (flag, fallback) => {
  const inline = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const at = process.argv.indexOf(flag);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};
const LANE = value("--lane", "all");
const PER = Math.max(1, Number(value("--per-instrument", "2")) || 2);
const SHARD = value("--shard", "1/1");
const OUT = value("--out", "");
const BARS = Number(value("--bars", "2")) || 2;
const BRIGHTNESS_FACTOR = 1.5;
const LEVEL_DB = 3;

/** The routing tables, read from source so this cannot drift from what the app actually does. */
function routedInstruments() {
  const src = fs.readFileSync(path.join(ROOT, "src/data/gs1Patches.ts"), "utf8");
  const rows = [];
  for (const [table, role] of [
    ["GS1_CHORDS_ROUTING", "chords"],
    ["GS1_LEAD_ROUTING", "lead"],
    ["GS1_TEXTURE_ROUTING", "fx"],
  ]) {
    const start = src.indexOf(`export const ${table}`);
    const end = src.indexOf("\n};", start);
    const body = src.slice(start, end);
    for (const m of body.matchAll(/^\s*"?([a-z0-9_-]+)"?:\s*\{\s*patch:\s*"([A-Za-z]+)"/gm)) {
      rows.push({ role, instrument: m[1], patch: m[2] });
    }
  }
  return rows;
}

/**
 * Which genres use a given instrument on a given lane.
 *
 * Read from `scripts/genreLanes.json`, which is a dump of the app's own routing over the catalogue (26 lane/instrument
 * pairs cover all 159 genres). Regenerate it with a one-off vitest that walks `ALL_GENRES` and calls `gs1PatchFor`:
 * parsing the genre sources with a regex was the first attempt and it found nothing, because the fields' order and
 * nesting are not what a regex guesses.
 */
function genresUsing() {
  const file = path.join(ROOT, "scripts", "genreLanes.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return new Map(Object.entries(raw));
}

const readWav = (file) => {
  const b = fs.readFileSync(file);
  const channels = b.readUInt16LE(22);
  let off = 12;
  while (off < b.length) {
    const id = b.toString("ascii", off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === "data") {
      const frames = size / 2 / channels;
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i += 1) out[i] = b.readInt16LE(off + 8 + i * channels * 2) / 32768;
      return out;
    }
    off += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${file}`);
};
const rmsOf = (x) => {
  let sum = 0;
  for (let i = 0; i < x.length; i += 1) sum += x[i] * x[i];
  return Math.sqrt(sum / Math.max(1, x.length));
};
const zcrOf = (x) => {
  let crossings = 0;
  for (let i = 1; i < x.length; i += 1) if ((x[i] >= 0) !== (x[i - 1] >= 0)) crossings += 1;
  return crossings / (x.length / 44100);
};
const db = (v) => (v <= 1e-9 ? -120 : 20 * Math.log10(v));
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const all = routedInstruments();
const genres = genresUsing();
const [shardIndex, shardCount] = SHARD.split("/").map(Number);
const targets = all.filter((_, i) => i % (shardCount || 1) === (shardIndex || 1) - 1);
const rows = [];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "voicing-all-"));

for (const target of targets) {
  const lane = target.role;
  if (LANE !== "all" && LANE !== lane) continue;
  const candidates = genres.get(`${lane === "fx" ? "fx" : lane}::${target.instrument}`) ?? [];
  const genresToUse = candidates.slice(0, PER);
  const measurements = [];
  for (const genre of genresToUse) {
    const render = (extra, name) => {
      const out = path.join(scratch, name);
      execFileSync(
        process.execPath,
        [
          path.join(ROOT, "scripts", "render_genre_wav.mjs"),
          `--genre=${genre}`,
          `--stem=${lane}`,
          `--bars=${String(BARS)}`,
          `--out=${out}`,
          ...extra,
        ],
        { cwd: ROOT, stdio: "pipe" }
      );
      return readWav(out);
    };
    try {
      const gs1 = render([], "gs1.wav");
      const native = render(["--no-gs1"], "native.wav");
      const nativeZcr = zcrOf(native);
      // A silent native render means the lane has no notes in this genre: there is nothing to match, and a ratio
      // against silence would be meaningless (this is what the first chords sweep reported as "×3051").
      if (rmsOf(native) < 1e-5) {
        measurements.push({ genre, silent: true });
        continue;
      }
      measurements.push({
        genre,
        brightnessRatio: zcrOf(gs1) / Math.max(1, nativeZcr),
        levelDb: db(rmsOf(gs1)) - db(rmsOf(native)),
      });
    } catch (error) {
      measurements.push({ genre, error: String(error?.message ?? error).slice(0, 80) });
    }
  }
  const usable = measurements.filter((m) => !m.silent && !m.error);
  const ratio = median(usable.map((m) => m.brightnessRatio));
  const level = median(usable.map((m) => m.levelDb));
  const verdict =
    ratio === null
      ? usable.length === 0
        ? "silent-lane"
        : "unknown"
      : ratio > BRIGHTNESS_FACTOR || ratio < 1 / BRIGHTNESS_FACTOR
        ? "timbre"
        : Math.abs(level) > LEVEL_DB
          ? "level"
          : "ok";
  rows.push({
    instrument: target.instrument,
    lane,
    patch: target.patch,
    genres: genresToUse,
    brightnessRatio: ratio === null ? null : Number(ratio.toFixed(2)),
    levelDb: level === null ? null : Number(level.toFixed(1)),
    verdict,
    measurements,
  });
}
fs.rmSync(scratch, { recursive: true, force: true });

rows.sort((a, b) => (b.brightnessRatio ?? 0) - (a.brightnessRatio ?? 0));
if (OUT) fs.writeFileSync(OUT, `${JSON.stringify(rows, null, 1)}\n`);
console.log(
  `GS-1 instrument voicing · shard ${SHARD} · lane ${LANE} · band ±${BRIGHTNESS_FACTOR}× / ±${LEVEL_DB} dB · ${rows.length} instrument(s)`
);
for (const row of rows) {
  const mark = row.verdict === "ok" ? "✅" : row.verdict === "silent-lane" ? "··" : "⚠️ ";
  console.log(
    `  ${mark} ${row.lane.padEnd(7)} ${row.instrument.padEnd(16)} →${String(row.patch).padEnd(18)} ` +
      `brightness ${String(row.brightnessRatio ?? "-").padStart(5)}  level ${String(row.levelDb ?? "-").padStart(6)} dB  ` +
      `${row.verdict}  [${row.genres.join(", ") || "no genre"}]`
  );
}
process.exit(0);
