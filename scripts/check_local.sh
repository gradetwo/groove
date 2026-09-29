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

failed=0
step() {
  local name="$1"; shift
  printf '  %-14s ' "$name"
  if "$@" >/tmp/check_local_step.log 2>&1; then
    echo "ok"
  else
    echo "FAILED (exit $?)"
    echo "  ---- last 15 lines ----"
    tail -15 /tmp/check_local_step.log | sed 's/^/  /'
    failed=1
  fi
}

echo "local gate:"
step "typecheck" npm run typecheck
step "lint" npm run lint
# The unit suite is the long one, and it is the one that caught assertions left behind by a behaviour change.
step "tests" npx vitest run

if [ "$failed" -ne 0 ]; then
  echo "❌ the local gate failed — do not commit"
  exit 1
fi
echo "✅ the local gate passed"
