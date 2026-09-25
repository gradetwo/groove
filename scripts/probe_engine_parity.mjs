#!/usr/bin/env node
/**
 * Do the engines render the same track? (Safari parity, after a user report.)
 *
 * ## What this found
 *
 * A report that a genre's **lead** sounds wrong on Safari — desktop and phone — while Chrome is fine. Rendering the
 * same lane in both engines settled it: on WebKit **every GS-1-routed role is silent** (`chords`, `lead`, and the
 * `fx` lane when it plays a sample texture), while the native lanes render with only rounding-level differences
 * (0.0–0.9 dB rms). Because the renderer treats "a host was built for this track" as "this track is handled", those
 * lanes are not silent-and-fallen-back, they are just silent.
 *
 * That is not one genre's problem: GS-1 voices `chords` and `lead` across the library, so the lead is missing on
 * Safari in every genre that routes it. The probe exists so the claim is checked rather than remembered.
 *
 * ## How
 *
 * It shells out to `render_genre_wav.mjs` (the app's own offline renderer, in each engine) once per lane per engine
 * and compares the two files: a lane that is audible in one engine and silent in the other is the failure, and a
 * lane that differs only by a small rms delta is the engine's own arithmetic. `--tolerance-db` sets "small".
 *
 * Usage:
 *   node scripts/probe_engine_parity.mjs [--genres=chicago-house,uk-garage] [--bars=2] [--tolerance-db=6]
 *                                       [--engines=chromium,webkit] [--keep]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const arg = (name, fallback = "") => {
  const inline = process.argv.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const at = process.argv.indexOf(name);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};

const genres = (arg("--genres", "uk-garage,chicago-house") || "").split(",").filter(Boolean);
const bars = Number(arg("--bars", "2")) || 2;
const toleranceDb = Number(arg("--tolerance-db", "6"));
const engines = (arg("--engines", "chromium,webkit") || "").split(",").filter(Boolean);
const keep = process.argv.includes("--keep");
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-parity-"));

/** Lanes to compare: the whole kit, because "the lead is wrong" is only answerable next to the lanes that are right. */
const LANES = ["kick", "snare", "hihat", "percussion", "bass", "chords", "lead", "fx"];

function readWav(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`${file}: not a RIFF/WAVE file`);
  }
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset < buf.length - 8) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      fmt = { channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === "data") {
      data = buf.subarray(body, body + size);
    }
    offset = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`${file}: missing fmt or data chunk`);
  const bytes = fmt.bits / 8;
  const frames = Math.floor(data.length / (bytes * fmt.channels));
  const rms = [];
  for (let c = 0; c < fmt.channels; c += 1) {
    let sum = 0;
    for (let i = 0; i < frames; i += 1) {
      const v = data.readInt16LE((i * fmt.channels + c) * bytes) / 32768;
      sum += v * v;
    }
    rms.push(Math.sqrt(sum / Math.max(1, frames)));
  }
  return { rms, frames, sampleRate: fmt.sampleRate };
}

const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);

function render(engine, genre, lane) {
  const out = path.join(workDir, `${engine}-${genre}-${lane}.wav`);
  const result = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "scripts", "render_genre_wav.mjs"),
      `--genre=${genre}`,
      `--bars=${bars}`,
      `--stem=${lane}`,
      `--browser=${engine}`,
      `--out=${out}`,
      `--port=${5200 + Math.floor(Math.random() * 400)}`,
    ],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (result.status !== 0 || !fs.existsSync(out)) {
    return { error: (result.stderr || result.stdout || "render failed").trim().split("\n").slice(-3).join(" ") };
  }
  return readWav(out);
}

const failures = [];
const rows = [];
for (const genre of genres) {
  for (const lane of LANES) {
    const rendered = engines.map((engine) => ({ engine, ...render(engine, genre, lane) }));
    const bad = rendered.filter((r) => r.error);
    if (bad.length) {
      failures.push(`${genre}/${lane}: ${bad.map((r) => `${r.engine}: ${r.error}`).join("; ")}`);
      continue;
    }
    const [a, b] = rendered;
    const rmsA = Math.max(...a.rms);
    const rmsB = Math.max(...b.rms);
    const delta = db(rmsB) - db(rmsA);
    const silentA = rmsA <= 0;
    const silentB = rmsB <= 0;
    rows.push({ genre, lane, engineA: a.engine, dbA: db(rmsA), engineB: b.engine, dbB: db(rmsB), delta });
    if (silentA !== silentB) {
      failures.push(
        `${genre}/${lane}: ${silentA ? a.engine : b.engine} renders silence while the other does not ` +
          `(${a.engine} ${silentA ? "-inf" : db(rmsA).toFixed(2)} dB, ${b.engine} ${silentB ? "-inf" : db(rmsB).toFixed(2)} dB)`
      );
    } else if (!silentA && !silentB && Math.abs(delta) > toleranceDb) {
      failures.push(
        `${genre}/${lane}: ${a.engine} ${db(rmsA).toFixed(2)} dB vs ${b.engine} ${db(rmsB).toFixed(2)} dB ` +
          `(${delta.toFixed(2)} dB, tolerance ${toleranceDb})`
      );
    }
  }
}

const fmt = (v) => (Number.isFinite(v) ? v.toFixed(2).padStart(7) : "   -inf");
console.log(`engine parity · ${genres.join(", ")} · ${engines.join(" vs ")} · ${bars} bar(s) · tolerance ${toleranceDb} dB`);
console.log(`  ${"lane".padEnd(11)} ${engines[0].padStart(8)} ${engines[1] ?? ""}   delta`);
for (const row of rows) {
  console.log(
    `  ${row.lane.padEnd(11)} ${fmt(row.dbA)} ${fmt(row.dbB)}   ${Number.isFinite(row.delta) ? row.delta.toFixed(2).padStart(6) : "  -inf"}`
  );
}

if (!keep) fs.rmSync(workDir, { recursive: true, force: true });
else console.log(`  wavs kept in ${workDir}`);

if (failures.length) {
  console.log("\n❌ engine parity failed:");
  for (const failure of failures) console.log(`   · ${failure}`);
  console.log(
    "\n   A GS-1-routed lane (chords/lead/fx) that is silent on WebKit is the report this probe was written for:\n" +
      "   the worklet host builds, the planner treats the track as handled, and no fallback plays."
  );
  process.exit(1);
}
console.log("\n✅ every lane renders in both engines (within tolerance)");
