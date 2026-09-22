#!/usr/bin/env node
/**
 * Groove quality gate — the musical ratchet.
 *
 * `probe:skins` made colour a measured property of the app; this does the same for the *music*, because the
 * listening reports that produced `docs/GROOVE_QUALITY_PLAN.md` described problems that are countable:
 *
 *   · **flat velocities** — tracks whose triggered steps all carry one velocity ("a MIDI dump");
 *   · **an inaudible sidechain** — the ducking stage exists, so the question is whether it does anything;
 *   · **a near-mono file** — pan and the send buses exist, so the question is whether they reach the output;
 *   · **hollow mids** — the 200 Hz – 2 kHz share of the energy;
 *   · **static harmony** — one chord for the whole loop;
 *   · **a cut tail** — a render that stops while the sound is still going.
 *
 * The measurements come from `scripts/analyze_export_audio.mjs` (spawned with `--json`), which renders through
 * the app's own offline engine — this file only decides what counts as a regression and prints the table. Budgets
 * are **today's numbers**: a view of the library that gets worse fails, one that gets better prints the tighter
 * number it could be set to, exactly like the touch-target and skin gates.
 *
 * Usage:  node scripts/check_groove.mjs [--json]
 */
import { spawn } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const JSON_OUT = process.argv.includes("--json");

/**
 * One or two genres per category, chosen because they are the ones the reports named or because they are the
 * category's flagship — the point is coverage of the *kinds* of groove, not all 159 (a full sweep is
 * `analyze_export_audio.mjs` without `--only`, and takes ~20 minutes).
 */
const SAMPLE = [
  "chicago-house", // Electronic — the app's reference genre
  "detroit-techno", // Electronic — a cut tail
  "minimal-techno", // Electronic — long, sparse
  "liquid-dnb", // Electronic — fast breakbeat
  "ambient", // Electronic — the genre with a single velocity library-wide
  "reggaeton", // Latin/World — named in the report
  "afrobeat", // Latin/World — percussion-led
  "chicago-blues", // Jazz/Blues — named in the report
  "boom-bap", // Hip Hop — swung by tradition
  "trap-rap", // Hip Hop — modern half-time
  "disco", // Pop/R&B — groove-driven
  "synthwave", // Pop/R&B (synth) — steady, quantised
];

/**
 * The ratchet, per claim, in *number of sampled genres affected*.
 *
 * Re-derived after two measurement-integrity fixes (P0.2). The analyser used to render
 * `genre.sequencer_pattern` — the authored skeleton no user ever plays — so `flatTracks` and
 * `staticHarmony` were counting values the genre-entry expansion had already replaced. On the
 * pattern the user actually hears the sample is 0/12 flat and 0/12 static, so both budgets fall.
 *
 * `weakDuck` rises from 11 to 12 **because the instrument changed, not because the audio did**: the
 * duck was measured on a bass-only render, where the sidechain is never even scheduled (the trigger
 * lives in the kick's branch), so the old number was the bass part's own envelope. The paired
 * measurement shows a mean dip of at most 0.25 dB with a deepest single dip of −1.8 dB — the plan's
 * "the mechanism is there and the setting is wrong". P0.3 deepens it and this budget goes to 0.
 *
 * Zero is the goal for every one of them — `docs/GROOVE_QUALITY_PLAN.md` is the route — and they can
 * only go down. (History worth keeping: the first calibration named three ids that do not exist here —
 * `house`, `dnb`, `shoegaze` — and the analyser dropped them silently, so the budgets described nine
 * genres. The analyser now names unmatched ids instead of filtering them away.)
 */
const BUDGET = {
  flatTracks: 0,
  weakDuck: 12,
  narrowStereo: 12,
  thinMids: 11,
  staticHarmony: 0,
  // boom-bap only (−29.1 dBFS, and it trips both confirmation renders). detroit-techno's −24.7 dBFS
  // readings were the render nondeterminism, not a cut tail; see P0.8 in the plan.
  cutTail: 1,
};

const CLAIMS = {
  flatTracks: {
    label: "flat velocities (≥4 of 8 tracks with one velocity)",
    worse: (count, budget) => count > budget,
  },
  weakDuck: { label: "inaudible sidechain (duck shallower than 1.5 dB)", worse: (count, budget) => count > budget },
  narrowStereo: { label: "near-mono (channel correlation above 0.98)", worse: (count, budget) => count > budget },
  thinMids: { label: "hollow mids (200 Hz–2 kHz below −6 dB of the total)", worse: (count, budget) => count > budget },
  staticHarmony: { label: "static harmony (one chord for the loop)", worse: (count, budget) => count > budget },
  cutTail: { label: "cut tail (last 50 ms above −30 dBFS)", worse: (count, budget) => count > budget },
};

function analyse() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(ROOT, "scripts", "analyze_export_audio.mjs"),
        `--only=${SAMPLE.join(",")}`,
        "--stem-tracks=kick,bass,chords",
        "--json",
      ],
      { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`analyze_export_audio.mjs exited ${code}:\n${stderr.slice(-800)}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`could not parse the analyser's JSON: ${String(error)}\n${stdout.slice(0, 400)}`));
      }
    });
  });
}

/**
 * Apply the same predicates the analyser documents, so the gate and the report cannot disagree.
 *
 * The first version of this accumulated into a local called `counts` *inside* a function called `counts`: every
 * increment landed on the function object, every comparison became `NaN > budget` (false), and the gate passed
 * unconditionally. A gate that cannot fail is worse than no gate, so the accumulator is named `tally`.
 */
function measureRows(rows) {
  const tally = { flatTracks: 0, weakDuck: 0, narrowStereo: 0, thinMids: 0, staticHarmony: 0, cutTail: 0 };
  const detail = { flatTracks: [], weakDuck: [], narrowStereo: [], thinMids: [], staticHarmony: [], cutTail: [] };
  for (const row of rows) {
    if (row.error) continue;
    const velocity = Object.values(row.musical?.velocityByTrack ?? {}).filter(Boolean);
    if (velocity.length && velocity.filter((entry) => entry.distinct <= 1).length >= 4) {
      tally.flatTracks += 1;
      detail.flatTracks.push(`${row.id} (${velocity.filter((e) => e.distinct <= 1).length}/8 flat)`);
    }
    const duck = row.musical?.duck;
    // `duckOnsets`, not `kickOnsets`: a kick that lands in a bass rest has no sidechain to measure.
    if (duck && duck.duckOnsets > 0 && duck.duckDb > -1.5) {
      tally.weakDuck += 1;
      detail.weakDuck.push(`${row.id} (${duck.duckDb} dB over ${duck.duckOnsets} onsets)`);
    }
    if (row.correlation > 0.98) {
      tally.narrowStereo += 1;
      detail.narrowStereo.push(`${row.id} (${row.correlation.toFixed(4)})`);
    }
    if ((row.musical?.midBandShareDb ?? 0) < -6) {
      tally.thinMids += 1;
      detail.thinMids.push(`${row.id} (${row.musical.midBandShareDb.toFixed(1)} dB)`);
    }
    const chords = row.musical?.pitchByTrack?.chords;
    if (chords && chords.distinct <= 1) {
      tally.staticHarmony += 1;
      detail.staticHarmony.push(row.id);
    }
    if (row.tailRmsDb > -30) {
      tally.cutTail += 1;
      detail.cutTail.push(`${row.id} (${row.tailRmsDb.toFixed(1)} dBFS)`);
    }
  }
  return { counts: tally, detail };
}

const data = await analyse();
const rows = data.rows ?? [];
const rendered = rows.filter((row) => !row.error);
const { counts: measured, detail } = measureRows(rows);

const failures = [];
const tighten = [];
for (const [claim, spec] of Object.entries(CLAIMS)) {
  const budget = BUDGET[claim];
  if (spec.worse(measured[claim], budget)) {
    failures.push(
      `${spec.label}: ${measured[claim]} of ${rendered.length} sampled genres (budget ${budget}) — ${detail[claim].slice(0, 4).join(", ")}`
    );
  } else if (measured[claim] < budget) {
    tighten.push(`${claim} ${measured[claim]} < ${budget}`);
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ rendered: rendered.length, measured, budget: BUDGET, detail }, null, 2));
} else {
  console.log("\n🎚️  GROOVE QUALITY GATE\n");
  console.log(`   ${rendered.length}/${rows.length} sampled genres rendered · offline engine, per-track stems\n`);
  console.log("   claim".padEnd(24) + "now".padEnd(8) + "budget".padEnd(9) + "worst offenders");
  for (const [claim, spec] of Object.entries(CLAIMS)) {
    console.log(
      `   ${claim.padEnd(22)}${String(measured[claim]).padEnd(8)}${String(BUDGET[claim]).padEnd(9)}${detail[claim].slice(0, 3).join(", ")}`
    );
    void spec;
  }
  if (tighten.length) console.log(`\n   budget could be tightened: ${tighten.join(", ")}`);
}

if (failures.length) {
  console.error("\n❌ groove quality regressed:");
  for (const line of failures) console.error(`   · ${line}`);
  console.error("\n   The plan for each of these is in docs/GROOVE_QUALITY_PLAN.md.");
  process.exit(1);
}
if (!JSON_OUT) {
  console.log("\n✅ groove quality holds: no claim above its budget (and the budgets only go down)");
}
