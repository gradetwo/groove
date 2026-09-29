#!/usr/bin/env bash
# What CI says about the last push, in one command.
#
# **Why this exists.** Between 2026-09-28 and 29 every push to `dev` failed, forty runs in a row, and every one of them failed on the same step: the bundle budget. The local gate does not build, so it could not see it, and nothing else looked — the
# numbers were produced on each push and thrown away, while "the local gate passed" was read as "this is fine".
#
# So: after pushing, ask this. `--watch` waits for the run to finish and reports its jobs; without it, the last few runs are listed with the step that failed, when one did. Either way the answer comes from CI rather than from a summary of the local gate.
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)/../release/groove-github"
command -v gh >/dev/null || { echo "❌ gh is not installed, so CI cannot be read from here"; exit 1; }
[ -d "$REPO/.git" ] || { echo "❌ $REPO is not a git checkout"; exit 1; }
cd "$REPO" || exit 1

if [ "${1:-}" = "--watch" ]; then
  RUN=$(gh run list --workflow=ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')
  [ -n "$RUN" ] || { echo "❌ no CI run found"; exit 1; }
  echo "watching run $RUN"
  # `--exit-status` makes the wait's exit code the run's conclusion, which is the answer this script exists to give.
  gh run watch "$RUN" --exit-status
  STATUS=$?
  gh run view "$RUN" | grep -E "^[X✓] |^  [X✓] " | head -20
  exit "$STATUS"
fi

gh run list --workflow=ci.yml --limit 5
echo ""
echo "the step that failed, when one did:"
RUN=$(gh run list --workflow=ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')
[ -n "$RUN" ] && gh run view "$RUN" | grep -E "^[X] |^  [X] " | head -5
