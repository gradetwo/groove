/**
 * Does GS-1 voice a lane the way the **native** render of that lane sounds?
 *
 * The owner's rule is that each genre should voice its own lanes by its own habit, and "sounds right" has to become
 * something a sweep can be run against. The native engine is the reference: those presets are what the parts in the
 * library were written for, and the app has shipped them for the whole project. So for each genre and lane this renders
 * the same stem twice — once with GS-1 routing on, once with `--no-gs1` — and reports two numbers that bracket the
 * complaints that actually arrived:
 *
 *   · **zero-crossing rate** — high-frequency activity, which is what "harsh" means (`uk-garage`'s lead measured
 *     7.9 kHz against the native 2.0 kHz, and the owner heard it before any of this existed);
 *   · **rms and peak** — level, which is what "too quiet" or "too loud" means;
 *   · **last audible window** — where the sound ends, which is what "too short" means.
 *
 * A lane is worth an override when a ratio leaves this band; a lane inside it needs nothing.
 *
 * Usage: node scripts/probe_gs1_voicing.mjs [--genres=a,b] [--lane=lead] [--bars=2] [--json]
 */
import fs from "node:fs";
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
const GENRES = value("--genres", "uk-garage,chicago-house,ambient,liquid-dnb").split(",").filter(Boolean);
const LANE = value("--lane", "lead");
const BARS = Number(value("--bars", "2")) || 2;
const asJson = process.argv.includes("--json");
/** How far GS-1 may sit from the native lane before it is worth a genre's own patch. */
const BRIGHTNESS_FACTOR = 1.5;
const LEVEL_DB = 3;

const readWav = (file) => {
  const b = fs.readFileSync(file);
  const rate = b.readUInt32LE(24);
  const channels = b.readUInt16LE(22);
  let off = 12;
  while (off < b.length) {
    const id = b.toString("ascii", off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === "data") {
      const frames = size / 2 / channels;
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i += 1) out[i] = b.readInt16LE(off + 8 + i * channels * 2) / 32768;
      return { rate, out };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${file}`);
};
const rmsOf = (x, from = 0, to = x.length) => {
  let sum = 0;
  for (let i = from; i < Math.min(to, x.length); i += 1) sum += x[i] * x[i];
  return Math.sqrt(sum / Math.max(1, Math.min(to, x.length) - from));
};
const zcrOf = (x) => {
  let crossings = 0;
  for (let i = 1; i < x.length; i += 1) if ((x[i] >= 0) !== (x[i - 1] >= 0)) crossings += 1;
  return crossings / (x.length / 44100);
};
const db = (v) => (v <= 1e-9 ? -120 : 20 * Math.log10(v));
/** The last 250 ms window still within 20 dB of the loudest one: where the sound stops, in seconds. */
const tailEnd = (x) => {
  const win = Math.round(0.25 * 44100);
  let loudest = 0;
  for (let i = 0; i + win < x.length; i += win) loudest = Math.max(loudest, rmsOf(x, i, i + win));
  let last = 0;
  for (let i = 0; i + win < x.length; i += win) if (rmsOf(x, i, i + win) > loudest * 0.1) last = i + win;
  return last / 44100;
};

const rows = [];
for (const genre of GENRES) {
  const scratch = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "voicing-"));
  const render = (extra, name) => {
    const out = path.join(scratch, name);
    execFileSync(
      process.execPath,
      [path.join(ROOT, "scripts", "render_genre_wav.mjs"), `--genre=${genre}`, `--stem=${LANE}`, `--bars=${String(BARS)}`, `--out=${out}`, ...extra],
      { cwd: ROOT, stdio: "pipe" }
    );
    return readWav(out);
  };
  try {
    const gs1 = render([], "gs1.wav");
    const native = render(["--no-gs1"], "native.wav");
    const gs1Zcr = zcrOf(gs1.out);
    const nativeZcr = zcrOf(native.out);
    const gs1Rms = rmsOf(gs1.out);
    const nativeRms = rmsOf(native.out);
    const row = {
      genre,
      lane: LANE,
      gs1Zcr: Math.round(gs1Zcr),
      nativeZcr: Math.round(nativeZcr),
      brightnessRatio: Number((gs1Zcr / Math.max(1, nativeZcr)).toFixed(2)),
      levelDb: Number((db(gs1Rms) - db(nativeRms)).toFixed(1)),
      gs1End: Number(tailEnd(gs1.out).toFixed(2)),
      nativeEnd: Number(tailEnd(native.out).toFixed(2)),
      verdict: "ok",
    };
    if (row.brightnessRatio > BRIGHTNESS_FACTOR || row.brightnessRatio < 1 / BRIGHTNESS_FACTOR) row.verdict = "timbre";
    if (Math.abs(row.levelDb) > LEVEL_DB) row.verdict = row.verdict === "ok" ? "level" : `${row.verdict}+level`;
    rows.push(row);
  } catch (error) {
    rows.push({ genre, lane: LANE, error: String(error?.message ?? error).slice(0, 120) });
  }
  fs.rmSync(scratch, { recursive: true, force: true });
}

if (asJson) {
  console.log(JSON.stringify(rows, null, 1));
} else {
  console.log(`GS-1 voicing against the native reference · lane ${LANE} · band ±${BRIGHTNESS_FACTOR}× brightness, ±${LEVEL_DB} dB`);
  for (const row of rows) {
    if (row.error) {
      console.log(`  ${row.genre.padEnd(16)} ❌ ${row.error}`);
      continue;
    }
    const mark = row.verdict === "ok" ? "✅" : "⚠️ ";
    console.log(
      `  ${mark} ${row.genre.padEnd(16)} brightness ${String(row.gs1Zcr).padStart(5)} vs ${String(row.nativeZcr).padStart(5)} Hz ` +
        `(×${row.brightnessRatio})  level ${row.levelDb >= 0 ? "+" : ""}${row.levelDb} dB  ends ${row.gs1End}s vs ${row.nativeEnd}s  ${row.verdict}`
    );
  }
}
process.exit(0);
