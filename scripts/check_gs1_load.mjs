#!/usr/bin/env node
/**
 * GS-1 budget-evidence gate (P6 / Phase 0).
 *
 * Reads the report written by `scripts/measure_gs1_load.mjs` and fails when the *evidence* for
 * the integration decision is no longer sound. Like the loudness and timbre gates it is offline
 * and browser-free: the measurement needs Chromium (slow), checking what it recorded is a file
 * read.
 *
 * **What it can and cannot see.** It cannot detect that GS-1 got slower — it never renders. What
 * it does catch is the specific way this particular measurement can lie to itself, which I hit
 * while building it:
 *
 *   - the processor reports `load = 0` for the first 2000 ms of rendered audio by design, so a
 *     short hold "proves" GS-1 is free. The gate therefore refuses a report whose settled window
 *     is under 2 s, and refuses one whose `warmupMs` disagrees with the processor's constant.
 *   - a report can look healthy while nothing was audible (the first version connected the node
 *     to no destination, so it was never pulled and every frame was missing). Every row must
 *     therefore show voices heard, a non-zero peak and zero allocator violations.
 *   - a claimed polyphony that was silently capped (requesting 24 voices produced 16) is recorded
 *     per row so a reader can see the difference between "asked for" and "heard".
 *
 * Thresholds are deliberately loose and quoted from the committed baseline; the per-voice cost is
 * machine-dependent and a tight gate on it would be noise, not signal.
 *
 *   node scripts/check_gs1_load.mjs [--report=path] [--max-p90-at-ceiling=0.35]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const reportPath = path.resolve(ROOT, argValue("--report", "scripts/gs1.load.baseline.json"));
/**
 * Sustained-load ceiling at the polyphony the integration is scoped to.
 *
 * Measured 2026-09-16 on an 8-core desktop (headless Chromium, the app's own heavy-metal
 * 8-track arrangement playing at the same time): 0.052 at 4 voices, 0.085 at 8, then a real
 * jump at 12 (0.154 p90 plus the processor's own overload verdict) and 16 (0.345). The plan's
 * decision threshold is 0.35. This gate is set at the plan's number for the 8-voice scope: a
 * 4x allowance over the measured 0.085, which will not trip on machine variance but will trip
 * on a genuine slowdown.
 */
const MAX_P90_AT_CEILING = Number(argValue("--max-p90-at-ceiling", "0.35"));
/** The polyphony the Phase 0 measurement says the integration should be scoped to. */
const DOCUMENTED_CEILING_VOICES = Number(argValue("--ceiling-voices", "8"));
/** `WARMUP_MS` in `vendor/gs1/src/audio/worklet-processor.js`. Quoted, not re-derived. */
const PROCESSOR_WARMUP_MS = 2000;
/** Settled audio the gate insists on before believing any load figure. */
const MIN_SETTLED_MS = 2000;

const problems = [];
const oks = [];
const check = (label, ok, detail) => (ok ? oks.push(`${label}${detail ? ` — ${detail}` : ""}`) : problems.push(`${label}${detail ? ` — ${detail}` : ""}`));

if (!fs.existsSync(reportPath)) {
  console.error(`❌ GS-1 load report not found: ${path.relative(ROOT, reportPath)}`);
  console.error("   run: node scripts/measure_gs1_load.mjs");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const rel = path.relative(ROOT, reportPath);

/* ---- The evidence must be capable of telling the truth -------------------- */
check(`${rel} is a full sweep`, report.subset === false, `subset=${report.subset}`);
check(
  `${rel} quotes the processor's warm-up window`,
  report.warmupMs === PROCESSOR_WARMUP_MS,
  `report ${report.warmupMs} vs processor ${PROCESSOR_WARMUP_MS}`
);
const settledMs = Number(report.holdMs) - Number(report.postWarmupMs);
check(
  `${rel} measures at least ${MIN_SETTLED_MS} ms of settled audio`,
  Number.isFinite(settledMs) && settledMs >= MIN_SETTLED_MS,
  `hold ${report.holdMs} ms − post-warmup ${report.postWarmupMs} ms = ${settledMs} ms`
);
check(
  `${rel} ran against a running app context`,
  report.appContext && report.appContext.state === "running" && report.appContext.contexts > 0,
  `contexts=${report.appContext?.contexts} state=${report.appContext?.state}`
);
check(`${rel} has no page errors`, (report.pageErrors ?? []).length === 0, `${(report.pageErrors ?? []).length} error(s)`);

const rows = Array.isArray(report.results) ? report.results : [];
check(`${rel} carries at least one measured voice count`, rows.length > 0, `${rows.length} row(s)`);

/* ---- Every row must be a real, audible, valid render ---------------------- */
for (const row of rows) {
  const at = `${row.requestedVoices} voices`;
  check(`${at}: core ABI is the pinned 8`, row.abi === 8, `abi=${row.abi}`);
  check(`${at}: a wasm variant actually loaded`, row.variant === "simd" || row.variant === "scalar", `variant=${row.variant}`);
  check(`${at}: notes were really sounding`, row.voicesMax > 0 && row.peakMax > 0, `voices=${row.voicesMax} peak=${row.peakMax}`);
  check(`${at}: no allocator violations`, row.allocViolations === 0, `violations=${row.allocViolations}`);
  check(`${at}: settled frames were collected`, row.settledFrames > 0, `${row.settledFrames}/${row.frames} settled`);
  check(`${at}: real-time ratio is finite and positive`, Number.isFinite(row.realtimeRatio) && row.realtimeRatio > 0, `${row.realtimeRatio}`);
}

/* ---- The documented scope must still fit the budget ---------------------- */
const atCeiling = rows.find((r) => r.requestedVoices === DOCUMENTED_CEILING_VOICES);
if (!atCeiling) {
  problems.push(
    `${rel} has no row at the documented ${DOCUMENTED_CEILING_VOICES}-voice scope, so the claim that it fits the budget is unverified`
  );
} else {
  check(
    `${DOCUMENTED_CEILING_VOICES}-voice sustained p90 is within ${MAX_P90_AT_CEILING}`,
    Number.isFinite(atCeiling.loadP90) && atCeiling.loadP90 <= MAX_P90_AT_CEILING,
    `p90 ${Number(atCeiling.loadP90).toFixed(3)}`,
  );
  check(
    `${DOCUMENTED_CEILING_VOICES}-voice rendering keeps real time`,
    Number.isFinite(atCeiling.realtimeRatio) && atCeiling.realtimeRatio >= 0.9,
    `ratio ${Number(atCeiling.realtimeRatio).toFixed(3)}`
  );
}

/* ---- The decision must be recorded, not just implied -------------------- */
check(
  `${rel} records a decision`,
  typeof report.decision?.verdict === "string" && report.decision.verdict.length > 0,
  report.decision?.verdict
);
check(
  `${rel} applies the plan's threshold`,
  report.decision?.threshold === 0.35 && report.loadThreshold === 0.35,
  `decision ${report.decision?.threshold}, loadThreshold ${report.loadThreshold}`
);

/* ---- Report ------------------------------------------------------------- */
console.log("===============================================================");
console.log("  🎹 GS-1 BUDGET EVIDENCE GATE (P6 Phase 0)");
console.log("===============================================================");
for (const line of oks) console.log(`✅ ${line}`);
for (const line of problems) console.log(`❌ ${line}`);
console.log("");
if (problems.length > 0) {
  console.log(`❌ ${problems.length} problem(s) with the GS-1 budget evidence.`);
  process.exit(1);
}
console.log(`✅ The GS-1 budget evidence is sound (${rows.length} voice counts, scope ${DOCUMENTED_CEILING_VOICES} voices).`);
if (report.decision?.verdict) {
  console.log(`   recorded verdict: ${report.decision.verdict}`);
}
