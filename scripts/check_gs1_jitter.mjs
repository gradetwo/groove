#!/usr/bin/env node
/**
 * E7 evidence gate — live timing jitter of message-delivered GS-1 notes (P6 Phase 2).
 *
 * Reads `scripts/gs1.jitter.baseline.json` and fails when the evidence behind the Phase 2 timing
 * conclusion stops being sound. Offline and browser-free, like the other three evidence gates:
 * the measurement needs Chromium, checking it is a file read.
 *
 * What it checks, and why each one matters:
 *
 *   - **Both strategies are present with the full trial count.** The two strategies answer
 *     different questions (how early a scheduler-time post lands, and how much the last-moment
 *     workaround scatters), and reporting only the flattering one is the obvious way to make the
 *     protocol look acceptable.
 *   - **Every trial produced an onset.** A missed onset silently drops the worst tails; a
 *     detection rate below 100% means the distribution being summarised is not the distribution
 *     that happened.
 *   - **The schedule-ahead error really is the lookahead.** This is the mechanism §5.9 claims:
 *     posting when the scheduler decides makes a note sound early by roughly the lookahead. If
 *     that stops being true, the whole conclusion needs re-deriving rather than patching.
 *   - **The last-moment spread stays inside a documented ceiling.** This is the one number that
 *     decides whether the workaround is usable at all, so a regression (a busier main thread, a
 *     heavier page) must be visible rather than absorbed into a median.
 *
 *   node scripts/check_gs1_jitter.mjs [--report=path] [--max-spread=60]
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

const reportPath = path.resolve(ROOT, argValue("--report", "scripts/gs1.jitter.baseline.json"));
/**
 * Ceiling on the last-moment spread (max − min onset error), in ms.
 *
 * Measured 2026-09-16 on an idle headless Chromium: 11.8 ms (range −20.1 … −8.3 ms over 40
 * trials), i.e. almost every note landed within a millisecond of the tuned lead and the tail was
 * a single main-thread timer that ran ~11 ms late. The gate allows 60 ms: a 5x allowance, because
 * this is a *timer health* check on shared CI hardware, not a product threshold. The product
 * conclusion does not depend on this number — it depends on the spread being non-zero at all,
 * which is why that fact is recorded rather than gated.
 */
const MAX_LAST_MOMENT_SPREAD_MS = Number(argValue("--max-spread", "60"));
/** The lookahead the engine actually uses; the schedule-ahead strategy must reproduce it. */
const EXPECTED_LOOKAHEAD_MS = Number(argValue("--lookahead", "200"));
/** How close to the lookahead the schedule-ahead median must land. */
const LOOKAHEAD_AGREEMENT = 0.8;

const problems = [];
const oks = [];
const check = (label, ok, detail) =>
  (ok ? oks.push(`${label}${detail ? ` — ${detail}` : ""}`) : problems.push(`${label}${detail ? ` — ${detail}` : ""}`));

if (!fs.existsSync(reportPath)) {
  console.error(`❌ E7 jitter report not found: ${path.relative(ROOT, reportPath)}`);
  console.error("   run: node scripts/measure_gs1_jitter.mjs");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const rel = path.relative(ROOT, reportPath);
const results = report.results ?? {};

check(`${rel} is a full run`, report.subset === false, `subset=${report.subset}`);
check(
  `${rel} records the onset resolution`,
  Number.isFinite(report.onsetResolutionMs) && report.onsetResolutionMs > 0,
  `${report.onsetResolutionMs?.toFixed?.(2)} ms per block`
);
check(
  `${rel} measured the same lookahead the engine uses`,
  Math.abs(Number(report.lookaheadMs) - EXPECTED_LOOKAHEAD_MS) < 1,
  `report ${report.lookaheadMs} ms vs engine ${EXPECTED_LOOKAHEAD_MS} ms`
);

for (const strategy of ["schedule-ahead", "last-moment", "last-moment-loaded"]) {
  const entry = results[strategy];
  check(`${strategy}: measured at least ${report.trials} trials`, entry?.summary?.trials >= report.trials, `${entry?.summary?.trials}`);
  check(
    `${strategy}: every trial produced an onset`,
    entry?.summary?.detected === entry?.summary?.trials,
    `${entry?.summary?.detected}/${entry?.summary?.trials}`
  );
}

const ahead = results["schedule-ahead"]?.summary;
if (ahead) {
  check(
    "schedule-ahead lands early by roughly the lookahead (the §5.9 mechanism)",
    Number.isFinite(ahead.medianErrorMs) &&
      Math.abs(ahead.medianErrorMs) >= EXPECTED_LOOKAHEAD_MS * LOOKAHEAD_AGREEMENT &&
      ahead.medianErrorMs < 0,
    `median ${ahead.medianErrorMs.toFixed(1)} ms`
  );
}

const lastMoment = results["last-moment"]?.summary;
let spreadMs = null;
if (lastMoment) {
  spreadMs = lastMoment.maxErrorMs - lastMoment.minErrorMs;
  check(
    `last-moment spread is inside ${MAX_LAST_MOMENT_SPREAD_MS} ms`,
    Number.isFinite(spreadMs) && spreadMs <= MAX_LAST_MOMENT_SPREAD_MS,
    `${spreadMs.toFixed(1)} ms (${lastMoment.minErrorMs.toFixed(1)}…${lastMoment.maxErrorMs.toFixed(1)} ms)`
  );
  // The product conclusion: the workaround can be *centred* by tuning the lead, but it cannot be
  // made sample-accurate, because the tail is main-thread timer lateness.
  check(
    "the last-moment workaround is measurably not sample-accurate",
    Number.isFinite(spreadMs) && spreadMs > report.onsetResolutionMs,
    `spread ${spreadMs.toFixed(1)} ms vs ${report.onsetResolutionMs.toFixed(2)} ms onset resolution`
  );
}

console.log("===============================================================");
console.log("  🎹 GS-1 LIVE TIMING JITTER GATE (E7)");
console.log("===============================================================");
for (const line of oks) console.log(`✅ ${line}`);
for (const line of problems) console.log(`❌ ${line}`);
console.log("");
if (problems.length > 0) {
  console.log(`❌ ${problems.length} problem(s) with the E7 timing evidence.`);
  process.exit(1);
}
console.log("✅ The E7 timing evidence is sound.");
const loaded = results["last-moment-loaded"]?.summary;
const loadedSpread = loaded ? loaded.maxErrorMs - loaded.minErrorMs : NaN;
console.log(
  `   schedule-ahead median ${ahead.medianErrorMs.toFixed(1)} ms (early) · last-moment spread ${spreadMs.toFixed(1)} ms (idle) / ${loadedSpread.toFixed(1)} ms (main thread blocked ${report.mainThreadLoad?.dutyMs}/${report.mainThreadLoad?.periodMs} ms) over ${lastMoment.trials} trials`
);
