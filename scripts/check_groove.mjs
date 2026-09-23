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
 * Usage:
 *   node scripts/check_groove.mjs                     # the sample, serially (the release-verified path)
 *   node scripts/check_groove.mjs --shards=N          # N analyser processes inside one machine
 *   node scripts/check_groove.mjs --shard=i/n --rows-out=dir/rows-i.json
 *                                                     # one slice, for a runner of its own; it writes its rows
 *                                                     # and judges nothing — the aggregator owns the budgets
 *   node scripts/check_groove.mjs --merge-dir=dir     # judge the union of the shards' row files
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const JSON_OUT = process.argv.includes("--json");
/** `--flag value` / `--flag=value`, the same shape the analyser's own CLI uses. */
function value(name, fallback) {
  const argv = process.argv.slice(2);
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index !== -1 && argv[index + 1] ? argv[index + 1] : fallback;
}

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
  /**
   * P1.1: a snare or hat lane whose spread is below 15 MIDI steps.
   *
   * `flatTracks` cannot see this — it counts lanes with a *single* value, and P0.2 took that to 0/12 while the snare
   * lane still reached a spread of 15 in only **1 of 11** sampled genres (measured 2026-09-23). The budget is 0
   * because the generator lands there, and it only goes down.
   */
  thinDynamics: 0,
  // P0.3 landed: every sampled genre whose bass sounds under a kick now dips 3.8-5.1 dB in its deepest 5 ms,
  // and the two genres with no bass under the kick at all (minimal-techno, ambient) are unmeasurable rather
  // than counted as passing.
  weakDuck: 0,
  // disco: a -4.4 dB sidechain that the ceiling's gain recovery refills to -0.4 dB in the file. Budgeted
  // rather than excused — this one is the master chain's dynamics (P2.3), not the mix.
  duckErasedInMaster: 1,
  narrowStereo: 12,
  // P0.4 is held (see the plan): the pan widening that fixes this costs loudness, and its fix is the blocked
  // trim re-record. The budget stays at the measured 12 — the honest "not yet" rather than a moved goalpost.
  sideTooHot: 0,
  thinMids: 11,
  staticHarmony: 0,
  // P0.6: 0. Every sampled genre's tail is below −82 dBFS since the tail is the genre's own reverb/delay decay.
  cutTail: 0,
};

const CLAIMS = {
  flatTracks: {
    label: "flat velocities (≥4 of 8 tracks with one velocity)",
    worse: (count, budget) => count > budget,
  },
  thinDynamics: {
    label: "flat dynamics (a snare/hat lane spread below 15 MIDI steps)",
    worse: (count, budget) => count > budget,
  },
  duckErasedInMaster: {
    label: "duck lost in the mastering chain (sidechain ≥3 dB, file <1.5 dB)",
    worse: (count, budget) => count > budget,
  },
  weakDuck: { label: "inaudible sidechain (dip shallower than 3 dB)", worse: (count, budget) => count > budget },
  sideTooHot: {
    label: "mono-unsafe width (side above −8 dB)",
    worse: (count, budget) => count > budget,
  },
  narrowStereo: { label: "near-mono (channel correlation above 0.98)", worse: (count, budget) => count > budget },
  /**
   * `thinMids` — the 200 Hz - 2 kHz share, against a threshold that turned out to be *aspirational*.
   *
   * P1.2 tried to move this twice and both attempts were rejected by measurement: the content fix (a chord's top note
   * doubled an octave up, plus a bass walk) measured **0.00 dB** on four genres, and a 5 dB tilt that takes the low
   * end away measured **+0.2 dB** (disco) and **+1.0 dB** (reggaeton). Reaching −6 dB that way would need ~25 dB of
   * tilt. The metric and the budget stay — a regression is still a regression, and only the budget can move — but the
   * claim is what it is: this library's mid content is sparse by construction, so the number is a *ratchet against
   * itself*, not a target met. Numbers and reasoning: `docs/GROOVE_QUALITY_PLAN.md` P1.2.
   */
  thinMids: { label: "thin mids (200 Hz–2 kHz share below the −6 dB the plan set, which measurement showed is aspirational)", worse: (count, budget) => count > budget },
  staticHarmony: { label: "static harmony (one chord for the loop)", worse: (count, budget) => count > budget },
  cutTail: { label: "cut tail (last 50 ms above −60 dBFS)", worse: (count, budget) => count > budget },
};

/**
 * Run the analyser over an explicit id list — one process, one dev server, one port.
 *
 * Extracted from `analyseShards` so the single-runner shard mode (`--shard=i/n`) runs *exactly* the same command
 * as one slice of the in-process fan-out: two code paths that "should" produce the same rows is how the aggregate
 * and the per-shard view would drift apart.
 */
function analyseIds(ids, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(ROOT, "scripts", "analyze_export_audio.mjs"),
        `--only=${ids.join(",")}`,
        "--stem-tracks=kick,bass,chords",
        `--port=${port}`,
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
        reject(
          new Error(
            `analyze_export_audio.mjs (${ids.join(",")}) exited ${code}:\n${stderr.slice(-800)}`
          )
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout).rows ?? []);
      } catch (error) {
        reject(new Error(`could not parse the analyser's JSON: ${String(error)}\n${stdout.slice(0, 400)}`));
      }
    });
  });
}

/**
 * One slice of the sample, for a runner of its own.
 *
 * This exists because the sample is bigger than one 4-vCPU runner can chew through comfortably and because the
 * analyser is single-threaded per genre: four runners doing one slice each is the shape the numbers picked (see
 * `docs/GITHUB_CI.md`). It deliberately **judges no budgets** — a shard that only saw three genres cannot know
 * whether the sample as a whole regressed, and a judgement per shard would also mean four places to change when a
 * budget moves. The aggregator judges.
 *
 * It does still fail on a genre that did not render: a shard that silently dropped one would make the aggregate
 * *easier*, which is this file's oldest failure mode.
 */
async function runShard(spec, rowsOut) {
  const match = /^(\d+)\/(\d+)$/.exec(String(spec));
  if (!match) throw new Error(`--shard must be i/n (e.g. 2/4); got "${spec}"`);
  const index = Number(match[1]);
  const total = Number(match[2]);
  const slices = partitionSample(SAMPLE, total);
  if (index < 1 || index > slices.length) {
    throw new Error(`--shard ${spec}: there is no shard ${index} of ${total}`);
  }
  const ids = slices[index - 1];
  const started = Date.now();
  const rows = await analyseIds(ids, Number(value("--port", "5321")) || 5321);
  const failed = rows.filter((row) => row.error);
  const payload = { shard: index, of: total, ids, rows };
  if (rowsOut) {
    fs.mkdirSync(path.dirname(path.resolve(ROOT, rowsOut)), { recursive: true });
    fs.writeFileSync(path.resolve(ROOT, rowsOut), JSON.stringify(payload, null, 2));
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
  console.log(
    `   shard ${index}/${total}: ${rows.length - failed.length}/${ids.length} rendered in ` +
      `${Math.round((Date.now() - started) / 1000)}s${rowsOut ? ` → ${rowsOut}` : ""}`
  );
  if (failed.length !== 0 || rows.length !== ids.length) {
    console.error(`\n❌ shard ${index}/${total} is incomplete, so the aggregate it feeds would be too:`);
    for (const row of failed.slice(0, 4)) console.error(`   · ${row.id}: ${row.error}`);
    for (const id of ids.filter((id) => !rows.some((row) => row.id === id))) {
      console.error(`   · ${id}: the analyser returned no row at all`);
    }
    process.exit(1);
  }
  process.exit(0);
}

/**
 * The union of the shards' rows, or a refusal.
 *
 * The check that matters is **coverage**: every sampled genre must appear exactly once. A missing artifact (a
 * failed shard, a wrong name, a job that uploaded nothing) would otherwise turn twelve genres into nine and every
 * budget would look satisfied — the exact way this gate lied before it was fixed.
 */
function mergeShardRows(dir) {
  const absolute = path.resolve(ROOT, dir);
  if (!fs.existsSync(absolute)) throw new Error(`--merge-dir ${dir} does not exist`);
  const files = fs.readdirSync(absolute).filter((name) => name.endsWith(".json")).sort();
  if (!files.length) throw new Error(`--merge-dir ${dir} has no .json row files`);
  const byId = new Map();
  const problems = [];
  for (const file of files) {
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(path.join(absolute, file), "utf8"));
    } catch (error) {
      problems.push(`${file}: not JSON (${String(error).slice(0, 80)})`);
      continue;
    }
    for (const row of payload.rows ?? []) {
      if (byId.has(row.id)) problems.push(`${row.id} appears in more than one shard`);
      byId.set(row.id, row);
    }
  }
  const missing = SAMPLE.filter((id) => !byId.has(id));
  const extra = [...byId.keys()].filter((id) => !SAMPLE.includes(id));
  if (missing.length) problems.push(`no shard measured: ${missing.join(", ")}`);
  if (extra.length) problems.push(`measured but not in the sample: ${extra.join(", ")}`);
  if (problems.length) {
    console.error(`\n❌ the shards do not add up to the sample (${files.length} file(s) in ${dir}):`);
    for (const problem of problems) console.error(`   · ${problem}`);
    console.error("\n   A partial aggregate is not a passing aggregate: re-run the missing shard.");
    process.exit(1);
  }
  if (!JSON_OUT) console.log(`   (${files.length} shard file(s), ${byId.size} genres)`);
  return { rows: SAMPLE.map((id) => byId.get(id)) };
}

/**
 * Split the sample into `shards` slices that stay in the sample's order.
 *
 * Exported shape is deliberately trivial (a list of lists) so the partitioning is testable without spawning a
 * browser: a shard that drops or duplicates a genre would make the gate *easier*, which is the one failure mode
 * this file has already been burned by once (the accumulator bug, and the silent-filter bug before it).
 */
export function partitionSample(sample, shards) {
  const count = Math.max(1, Math.min(sample.length, Math.floor(shards) || 1));
  const slices = Array.from({ length: count }, () => []);
  sample.forEach((id, index) => slices[index % count].push(id));
  return slices;
}

/**
 * Run the analyser, optionally as several independent shards.
 *
 * The analyser is single-threaded per genre (one page, one render at a time), so a plain run leaves every other
 * core idle: measured on the 12-genre sample, four shards finished in 569 s against 1272 s of serial work, and the
 * machine that ran them had 12 cores. Each shard gets its own port (the analyser's dev server is fixed-port) and
 * its own slice, and the rows are merged back into sample order before anything is measured.
 */
function analyseShards(shards) {
  const slices = partitionSample(SAMPLE, shards);
  const basePort = Number(value("--port", "5321")) || 5321;
  return Promise.all(
    slices.map((slice, index) =>
      analyseIds(slice, basePort + index).catch((error) => {
        throw new Error(`shard ${index + 1}/${slices.length} (${slice.join(",")}): ${error.message}`);
      })
    )
  );
}

async function analyse() {
  const shards = Number(value("--shards", process.env.GROOVE_SHARDS || "1")) || 1;
  /**
   * One shard is the *original* single-process analyser, deliberately: the default path must stay the code every
   * release has been verified on, and sharding stays strictly opt-in. (`analyseShards(1)` would be equivalent, but
   * "equivalent" is not "the same code", and this gate was already broken once by a change that looked equivalent.)
   */
  if (shards <= 1) return analyseSerial();
  const started = Date.now();
  const groups = await analyseShards(shards);
  const rows = groups.flat();
  // Sample order, so the table and the offender lists read the same however the shards interleave.
  const order = new Map(SAMPLE.map((id, index) => [id, index]));
  rows.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  if (!JSON_OUT) {
    console.log(`   (${groups.length} shards, ${Math.round((Date.now() - started) / 1000)}s wall)`);
  }
  return { rows };
}

/**
 * One shard per runner, and the aggregator that judges — the CI shape.
 *
 * Dispatch happens at the bottom of the file (see `shardSpec` / `mergeDir` there): a shard writes its rows and
 * judges nothing, and the merge reads them and judges everything. Neither is reachable by accident — `--shard`
 * and `--merge-dir` have to be asked for.
 */

function analyseSerial() {
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
  const tally = {
    flatTracks: 0,
    thinDynamics: 0,
    weakDuck: 0,
    duckErasedInMaster: 0,
    narrowStereo: 0,
    sideTooHot: 0,
    thinMids: 0,
    staticHarmony: 0,
    cutTail: 0,
  };
  const detail = {
    flatTracks: [],
    thinDynamics: [],
    weakDuck: [],
    duckErasedInMaster: [],
    narrowStereo: [],
    sideTooHot: [],
    thinMids: [],
    staticHarmony: [],
    cutTail: [],
  };
  for (const row of rows) {
    if (row.error) continue;
    const velocity = Object.values(row.musical?.velocityByTrack ?? {}).filter(Boolean);
    if (velocity.length && velocity.filter((entry) => entry.distinct <= 1).length >= 4) {
      tally.flatTracks += 1;
      detail.flatTracks.push(`${row.id} (${velocity.filter((e) => e.distinct <= 1).length}/8 flat)`);
    }
    /**
     * P1.1: the lanes an idiom ornaments, and how wide their dynamics are.
     *
     * `flatTracks` above asks whether a lane has one value; this asks whether the variation is enough to hear, which
     * is a different claim about the same data — and the one the plan's P1.1 is written against. A genre with neither
     * lane sounding is unmeasurable, not passing.
     */
    const dynamicsLanes = ["snare", "hihat"]
      .map((id) => ({ id, lane: row.musical?.velocityByTrack?.[id] }))
      .filter((entry) => entry.lane && entry.lane.onsets > 0);
    const thin = dynamicsLanes.filter((entry) => entry.lane.max - entry.lane.min < 15);
    if (thin.length) {
      tally.thinDynamics += 1;
      detail.thinDynamics.push(`${row.id} (${thin.map((e) => `${e.id} ${e.lane.max - e.lane.min}`).join(", ")})`);
    }
    const duck = row.musical?.duck;
    // `duckOnsets`, not `kickOnsets`: a kick that lands in a bass rest has no sidechain to measure. The median
    // of the deepest 5 ms window per onset, not the mean — see the analyser's `weakDuck` for why.
    if (duck && duck.duckOnsets > 0 && (duck.duckMedianDb ?? 0) > -3) {
      tally.weakDuck += 1;
      detail.weakDuck.push(`${row.id} (${duck.duckMedianDb} dB dip over ${duck.duckOnsets} onsets)`);
    }
    if (duck && duck.duckOnsets > 0 && (duck.duckMedianDb ?? 0) <= -3 && (duck.duckMasterMedianDb ?? 0) > -1.5) {
      tally.duckErasedInMaster += 1;
      detail.duckErasedInMaster.push(
        `${row.id} (sidechain ${duck.duckMedianDb} dB, file ${duck.duckMasterMedianDb} dB)`
      );
    }
    if (row.correlation > 0.98) {
      tally.narrowStereo += 1;
      detail.narrowStereo.push(`${row.id} (${row.correlation.toFixed(4)})`);
    }
    if (row.sideToMidDb > -8) {
      tally.sideTooHot += 1;
      detail.sideTooHot.push(`${row.id} (${row.sideToMidDb.toFixed(1)} dB)`);
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
    // P0.6 tightened this from -30 dBFS to the -60 dBFS the plan promised: every tail now measures below -82.
    if (row.tailRmsDb > -60) {
      tally.cutTail += 1;
      detail.cutTail.push(`${row.id} (${row.tailRmsDb.toFixed(1)} dBFS)`);
    }
  }
  return { counts: tally, detail };
}

/**
 * Judge a set of rows — the whole gate, in one place.
 *
 * It is a function rather than top-level code because there are two ways to arrive with rows now (the analysed
 * sample, and the merged shard files) and **the budgets must be judged in exactly one place**: two copies of this
 * comparison is how "the sharded run passes and the serial run fails" would start.
 */
function judge(rows) {
  const rendered = rows.filter((row) => !row.error);
  const failed = rows.filter((row) => row.error);
  const { counts: measured, detail } = measureRows(rows);

  /**
   * A genre that fails to render must not make the gate *easier*.
   *
   * `measureRows` skips `row.error`, so three failed renders quietly turned "12 sampled genres" into 9 and every
   * budget looked satisfied — the same "a gate that cannot fail is worse than no gate" trap the accumulator bug
   * was. The run is invalid unless every sampled genre rendered.
   */
  if (failed.length) {
    console.error(`\n❌ ${failed.length} of ${rows.length} sampled genres did not render, so no claim can be judged:`);
    for (const row of failed.slice(0, 4)) console.error(`   · ${row.id}: ${row.error}`);
    console.error("\n   Fix the render (typically a stale dev server or an edited file mid-run, which hot-reloads the");
    console.error("   measuring page) and re-run; a partial sample is not a passing sample.");
    process.exit(1);
  }

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
}

/**
 * `--shard=i/n` writes one slice's rows and stops; `--merge-dir=<dir>` reads the shard files and judges their
 * union. Anything else is the ordinary gate over the sample.
 */
const shardSpec = value("--shard", null);
const mergeDir = value("--merge-dir", null);

if (shardSpec) {
  await runShard(shardSpec, value("--rows-out", null));
} else {
  const data = mergeDir ? { rows: mergeShardRows(mergeDir).rows } : await analyse();
  judge(data.rows ?? []);
}
