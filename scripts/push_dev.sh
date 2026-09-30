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

echo "3/3  committing the mirror and pushing dev"
MESSAGE="${1:-sync}"
if [ -n "$(git -C ../release/groove-github status --porcelain)" ]; then
  git -C ../release/groove-github add -A
  git -C ../release/groove-github commit -q -m "$MESSAGE"
fi
git -C ../release/groove-github push origin dev
echo "✅ pushed — now read what CI says: npm run ci:status"
