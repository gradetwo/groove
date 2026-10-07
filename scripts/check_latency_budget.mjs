#!/usr/bin/env node
/**
 * ⭐ The readings from `probe:latency`, judged against budgets instead of only printed.
 *
 * The probe was repaired so it runs and reports; nothing then watched the numbers, so a change that
 * made every timbre switch three times slower would have gone unnoticed as long as the probe still
 * exited zero. This judges the readings.
 *
 *     node scripts/check_latency_budget.mjs                 # runs the probe itself
 *     node scripts/check_latency_budget.mjs --from FILE     # judges a stored --json payload
 *
 * ⚠️ **Re-derived 2026-10-07 for the v2 surface**, because the actions themselves changed: the probe used to drive
 * `TrackInspector` (a synth preset swap, "observed max 111.2 ms") and the studio sequencer's step cells, and it now
 * drives the arrangement's instrument chip — which **loads a sampled instrument** (an SFZ and its audio) — and writes a
 * note into the piano roll. Measured on that surface, one run, 2026-10-07: GS-1 60-68 ms / 0 long tasks; timbre
 * 471-578 ms / 4 long tasks / worst 207 ms; write one note 759 ms / 5 long tasks / worst 223 ms. The ceilings below are
 * ~2.5x the measured settle and ~2x the measured long tasks, which is the multiple this file has always used — a gate
 * that reddens on noise gets switched off, and then it guards nothing.
 *
 * The `--from` form is what makes this testable without a browser: a criterion hands it a payload
 * with one number pushed out of range and expects a non-zero exit.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const argv = process.argv.slice(2);
const fromIndex = argv.indexOf("--from");
const from = fromIndex !== -1 ? argv[fromIndex + 1] : null;

/** settle ceilings in ms, and how many long tasks each action may have. */
const BUDGETS = [
  { match: /^baseline/, min: 1400, max: 1700, longTasks: 0, why: "the baseline is a fixed 1.5 s window" },
  { match: /^GS-1/, min: 0, max: 300, longTasks: 0, why: "measured 60-68 ms on the v2 surface" },
  { match: /^timbre →/, min: 0, max: 1500, longTasks: 8, why: "measured 471-578 ms with 4 long tasks (a sampled instrument loads)" },
  { match: /^write one note/, min: 0, max: 2000, longTasks: 10, why: "measured 759 ms with 5 long tasks (a roll repaint)" },
];
const WORST_TASK_BUDGET_MS = 450;

function load() {
  if (from) return JSON.parse(fs.readFileSync(from, "utf8"));
  const run = spawnSync("npm", ["run", "probe:latency", "--", "--json"], { encoding: "utf8" });
  if (run.status !== 0) {
    console.error(run.stdout ?? "");
    console.error(run.stderr ?? "");
    throw new Error(`probe:latency exited ${run.status}`);
  }
  const start = run.stdout.indexOf("{");
  return JSON.parse(run.stdout.slice(start));
}

const payload = load();
const breaches = [];
console.log("action                       settle(ms)  budget(ms)  longTasks  worst(ms)");
for (const row of payload.results ?? []) {
  const budget = BUDGETS.find((b) => b.match.test(row.label));
  if (!budget) {
    breaches.push(`${row.label}: no budget covers this action`);
    continue;
  }
  const ok = row.latencyMs >= budget.min && row.latencyMs <= budget.max && row.longTasks <= budget.longTasks;
  const worstOk = row.worstTaskMs <= WORST_TASK_BUDGET_MS;
  console.log(
    `${row.label.padEnd(28)} ${String(row.latencyMs).padStart(10)}  ${String(budget.max).padStart(10)}  ` +
      `${String(row.longTasks).padStart(9)}  ${String(row.worstTaskMs).padStart(9)}${ok && worstOk ? "" : "   ❌"}`
  );
  if (!ok) breaches.push(`${row.label}: ${row.latencyMs} ms and ${row.longTasks} long task(s), budget ${budget.max} ms and ${budget.longTasks} (${budget.why})`);
  if (!worstOk) breaches.push(`${row.label}: worst long task ${row.worstTaskMs} ms, budget ${WORST_TASK_BUDGET_MS} ms`);
}

if (breaches.length) {
  console.error(`\n❌ ${breaches.length} latency budget breach(es):`);
  for (const b of breaches) console.error(`   ${b}`);
  process.exit(1);
}
console.log("\n✅ every action is inside its budget");
