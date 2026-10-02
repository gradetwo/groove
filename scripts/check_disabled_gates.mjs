#!/usr/bin/env node
/**
 * ⭐ **The criterion that keeps "temporarily disabled" from becoming "quietly forgotten".**
 *
 * `npm run check:disabled-gates` — reads `scripts/disabledGates.mjs` and refuses a tree in which the
 * disabled set and the wiring disagree in **either** direction:
 *
 *   · a gate listed as disabled that still runs (the ledger would be lying about what is switched
 *     off), or that was deleted rather than disabled, or that dropped one of the three facts the
 *     owner asked for (why / when it returns / who decided);
 *   · a gate routed through `scripts/disabled_gate_guard.mjs` with no ledger entry — the silent
 *     extra disable the owner's rider must never turn into;
 *   · a `NEVER_DISABLED` gate (typecheck, lint, tests, build, budget, red lines, schema, docs, the
 *     genre audit) that was disabled, deleted, or dropped out of the verify chain;
 *   · a listed gate that no workflow invokes any more, or a tree where the ledger itself is not
 *     checked in CI.
 *
 * Cheap, offline, and deliberately the *only* implementation: `src/test/disabledGates.test.ts` calls
 * the same `auditDisabledGates`, so the executable gate and the unit criterion cannot drift.
 */
import { auditDisabledGates, DISABLED_GATES, NEVER_DISABLED } from "./disabledGates.mjs";

const { problems, oks, wrapped } = auditDisabledGates(process.cwd());

console.log("===============================================================");
console.log("  ⏸  DISABLED-GATES LEDGER");
console.log("===============================================================");
console.log(`  disabled (${DISABLED_GATES.length}): ${DISABLED_GATES.map((gate) => gate.id).join(", ")}`);
console.log(`  wired through the guard: ${wrapped.length ? wrapped.join(", ") : "(none)"}`);
console.log(`  protected from disablement (${NEVER_DISABLED.length}): ${NEVER_DISABLED.join(", ")}`);
console.log("");

for (const line of oks) console.log(`✅ ${line}`);
for (const line of problems) console.error(`❌ ${line}`);

if (problems.length === 0) {
  console.log("\n✅ The disabled set is exactly the ledger, and nothing else was switched off.");
  process.exit(0);
}
console.error(`\n❌ ${problems.length} problem(s): the ledger and the wiring disagree.`);
process.exit(1);
