#!/usr/bin/env bash
# The local gate, run as **one command that fails loudly** — because "remember to check the exit code" has now failed three times.
#
# Three separate incidents, all the same shape: a chain whose *last* command decided the exit status, so a red gate reported success.
#
#   1. `npm run deploy 2>&1 | tail -25`      — a pipeline's status is `tail`'s; `verify` had failed and I called it deployed.
#   2. `npm run lint 2>&1 | tail -1`         — printed the `--fix` hint ("0 errors … fixable"), which reads like a clean result.
#   3. `;`-chained commands                   — the next command runs whatever the previous one did.
#
# So this script checks **exit statuses**, prints only what failed, and stops at the first failure. The output is deliberately boring when everything passes: a line per step and no tail to misread.
set -u

# ⭐ **One log per run, and one gate per machine.**
#
# Both of these come from running several worktrees at once (owner's instruction, 2026-09-30) and reading the result wrong:
#
#   · the log path used to be the fixed `/tmp/check_local_step.log`, so **three gates in three worktrees overwrote each other** and a failing run printed another worktree's failure as its own. Found by an agent who noticed the printed paths belonged to a different checkout. The path now carries the checkout and the pid, and a failure prints which file it came from.
#   · a second full suite on the same machine makes the **timing-sensitive criteria** flake — a real-sfizz pitch criterion failed at load average 24 and passed twice alone, at 880.00 vs 880.01 Hz against a 1% tolerance. A lock is cheaper than a flake: the second gate waits, and says so.
LOCK="${TMPDIR:-/tmp}/groove-local-gate.lock"
if [ -z "${GROOVE_GATE_LOCK_HELD:-}" ]; then
  exec 9>"$LOCK"
  if ! flock -n 9; then
    echo "another local gate is running on this machine; waiting for it (a second suite makes timing-sensitive criteria flake)"
    flock 9
  fi
  export GROOVE_GATE_LOCK_HELD=1
fi

LOG="${TMPDIR:-/tmp}/check_local_step.$(basename "$PWD").$$.log"

failed=0
step() {
  local name="$1"; shift
  printf '  %-14s ' "$name"
  if "$@" >"$LOG" 2>&1; then
    echo "ok"
  else
    echo "FAILED (exit $?)"
    echo "  ---- last 15 lines of $LOG ----"
    tail -15 "$LOG" | sed 's/^/  /'
    failed=1
  fi
}

# **What this gate does not decide, and where those decisions live.**
#
# It runs typecheck, lint, styling and the unit suite — no build and no browser — because it has to stay fast enough to run on every change. So the checks that need either are judged elsewhere, and the list is named rather than left to be remembered:
#
#   · the bundle budget          → `npm run check:budget` after a build, and **`release.sh` refuses to publish without it**
#   · the end-to-end Playwright legs, the audio probes, the sfizz comparison → CI (`ci.yml`, and `manual-verify.yml`'s scopes)
#
# The reason this paragraph exists: the budget step failed on **forty consecutive pushes** while this gate reported ok each time, because nothing local could see it and nothing else was looking. After pushing, `npm run ci:status` is the answer — the local
# gate passing only means the local gate passed.
echo "local gate:"
step "typecheck" npm run typecheck
step "lint" npm run lint
# ⭐ The check whose absence let the new interface ship as unstyled text: a component that uses no styling renders as plain markup, and none of the other checks ask about appearance.
step "styling" node scripts/check_component_styling.mjs
# The unit suite is the long one, and it is the one that caught assertions left behind by a behaviour change.
#
# **Two files are excluded, and the reason is measured rather than assumed.** `mobileApp.test.tsx` and `mobileExplore.test.tsx` are timing-sensitive and fail under the load of a full parallel run — four
# consecutive re-runs of both together reported **zero** failures, while the full suite reported five. A gate that fails on scheduling noise is a gate people learn to bypass, which is exactly what happened
# to the jank budget: it was red, absent from CI, and I routed around it. So CI judges those two, and this gate stays a statement about the code.
#
# The exclusion is **named here rather than silent**, and it is two files, not a pattern: a growing list would mean the gate had stopped meaning anything.
step "tests" npx vitest run --exclude '**/mobileApp.test.tsx' --exclude '**/mobileExplore.test.tsx'

if [ "$failed" -ne 0 ]; then
  echo "❌ the local gate failed — do not commit"
  exit 1
fi
echo "✅ the local gate passed"
