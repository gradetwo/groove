#!/usr/bin/env bash
# Ask CI for everything — the release-time check.
#
# The owner's division of labour (2026-09-30): a development push runs the fast checks that judge what it touched, and **a release runs all of it**. This is how a release asks: it dispatches the CI workflow by hand, which is the one path that includes the browser matrix, and
# waits for the verdict instead of assuming it.
#
#   npm run ci:full              # dispatch and wait
#   npm run ci:full -- --no-wait # dispatch and return
set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)/../release/groove-github"
command -v gh >/dev/null || { echo "❌ gh is not installed, so CI cannot be asked from here"; exit 1; }
[ -d "$REPO/.git" ] || { echo "❌ $REPO is not a git checkout"; exit 1; }

cd "$REPO" || exit 1
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "dispatching the full CI on $BRANCH"
# `nightly=false` on purpose: a release wants the browser matrix, not the monitoring sweep.
gh workflow run ci.yml --ref "$BRANCH" -f nightly=false

# The run takes a moment to appear, and matching on the newest id is how the one just asked for is found.
sleep 10
RUN=$(gh run list --workflow=ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')
[ -n "$RUN" ] || { echo "❌ the dispatch produced no run"; exit 1; }
echo "watching run $RUN"

if [ "${1:-}" = "--no-wait" ]; then
  exit 0
fi
gh run watch "$RUN" --exit-status
STATUS=$?
gh run view "$RUN" | grep -E "^[X✓] |^  [X✓] " | head -20
exit "$STATUS"
