#!/usr/bin/env node
/**
 * The switch that reads `scripts/disabledGates.mjs`.
 *
 * A guarded entry point is written as:
 *
 *   node scripts/disabled_gate_guard.mjs <gate-id> -- <the real command>
 *
 * and this program is the only thing that decides whether the real command runs. When the id is in
 * the ledger it prints the notice (why / when / who — the owner asked for all three) and exits **0**,
 * so the gate's CI step stays in the workflow and says out loud that it is switched off rather than
 * disappearing from the list. When the id is **not** in the ledger the command runs anyway: a gate
 * that was wired through the guard without a ledger entry must keep working, because the failure
 * this guards against is a gate that quietly stops judging.
 *
 * `DISABLED_GATES_IGNORE=1` runs the real gate even when it is listed — the switch is reversible
 * without an edit, which is what makes "temporary" true.
 */
import { spawnSync } from "node:child_process";
import { disabledGate, disabledGateNotice } from "./disabledGates.mjs";

const argv = process.argv.slice(2);
const id = argv[0];
const rest = argv[1] === "--" ? argv.slice(2) : argv.slice(1);

if (!id || rest.length === 0) {
  console.error(
    "usage: node scripts/disabled_gate_guard.mjs <gate-id> -- <command> [args…]\n" +
      "       e.g. node scripts/disabled_gate_guard.mjs check:loudness -- node scripts/check_loudness_spread.mjs"
  );
  process.exit(2);
}

const entry = disabledGate(id);
const forced = process.env.DISABLED_GATES_IGNORE === "1";

if (entry && !forced) {
  // The notice names the reason, the return condition and the decision — see `disabledGates.mjs`.
  process.stdout.write(disabledGateNotice(entry));
  process.exit(0);
}

if (entry && forced) {
  process.stdout.write(`\n▶ ${id} is DISABLED in scripts/disabledGates.mjs, but DISABLED_GATES_IGNORE=1 — running the real gate.\n\n`);
} else {
  process.stderr.write(
    `\n⚠ ${id} is routed through disabled_gate_guard.mjs but has no entry in scripts/disabledGates.mjs.\n` +
      "  Running it anyway (a gate may only be switched off by a ledger entry), and `npm run check:disabled-gates` will fail until this is fixed.\n\n"
  );
}

const [command, ...args] = rest;
const result = spawnSync(command, args, { stdio: "inherit", shell: false });
process.exit(result.status ?? 1);
