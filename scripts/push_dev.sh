#!/usr/bin/env bash
# Push `dev` — with the full local gate in front of it, because twice it was not.
#
# **Why this exists.** Two pushes in a row went red for the same reason: the full unit suite was not run first. One was a change to a shared parse path judged with four related test files; the other was a component that used a literal colour, which the generated desktop-skin sheet
# has to map, judged without the test that checks that sheet. Neither was subtle, and neither was caught by discipline — which is the point: "remember to run the whole suite" is a rule that fails exactly when a person is in a hurry, so it is a script instead.
#
# The order matters: nothing is pushed until the gate passes, so `dev` never carries a commit the local gate has already rejected.
#
#   bash scripts/push_dev.sh [commit message for the mirror]
set -eu

cd "$(dirname "$0")/.." || exit 1

echo "1/3  the full local gate (typecheck, lint, styling, the unit suite)"
bash scripts/check_local.sh

echo "2/3  the release mirror"
./scripts/sync_release_mirror.sh

echo "3/3  cancelling superseded runs, committing the mirror, pushing dev"
#
# ⭐ **Cancel the runs this push supersedes.** The owner's point: a queue full of runs for commits nobody will look at again is a queue that delays the one that matters. A run is superseded when it is still going and its commit is **not** the commit about to be
# pushed — so the newest push keeps its verdict and the older ones stop costing minutes. The check is on the sha rather than on the title, because two pushes can share a title and only one of them is current.
if command -v gh >/dev/null 2>&1 && [ -d ../release/groove-github/.git ]; then
  # `gh` has no `-C`, and a silently-failing cancel would be worse than none: the subshell makes the repository explicit.
  NEW_SHA=$(git -C ../release/groove-github rev-parse HEAD)
  SUPERSEDED=$(
    cd ../release/groove-github || exit 0
    gh run list --workflow=ci.yml --limit 20 --json databaseId,status,headSha \
      --jq "[.[] | select(.status != \"completed\") | select(.headSha != \"$NEW_SHA\") | .databaseId]" 2>/dev/null || true
  )
  for RUN in $SUPERSEDED; do
    echo "     cancelling superseded run $RUN"
    (cd ../release/groove-github && gh run cancel "$RUN" >/dev/null 2>&1) || true
  done
fi
MESSAGE="${1:-sync}"
if [ -n "$(git -C ../release/groove-github status --porcelain)" ]; then
  git -C ../release/groove-github add -A
  git -C ../release/groove-github commit -q -m "$MESSAGE"
fi
git -C ../release/groove-github push origin dev
echo "✅ pushed — now read what CI says: npm run ci:status"
