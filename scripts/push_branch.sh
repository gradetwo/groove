#!/usr/bin/env bash
# Push a **branch** to GitHub, so its checks run there rather than on this machine.
#
# The owner's instruction (2026-09-30): several worktrees are how parallel work happens, and **CI belongs on GitHub**.
# A pushed branch runs `validate` there — typecheck, lint, the unit suite, build, bundle budget — so a worktree that is
# still being written does not need the gate run twice on the same laptop.
#
#   bash scripts/push_branch.sh <branch> [message]
#
# It never touches `dev`: that branch is published by `push_dev.sh`, and mixing the two would make a half-finished
# feature part of what a person clones.
#
# **Why this no longer goes through a mirror (2026-10-01).** Pushing needed a deploy key, and this repository had no
# remote, so branches were fetched into a mirror checkout and pushed from there. Both are in place now, and the mirror
# brought its own failures: it had to be kept in sync, and a push from a mirror left on another branch published the
# wrong ref while printing success. The lease is kept, because a branch that has been rebased legitimately needs it.
set -eu

BRANCH="${1:?usage: push_branch.sh <branch> [message]}"
MESSAGE="${2:-wip: $BRANCH}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

git -C "$ROOT" rev-parse --verify "$BRANCH" >/dev/null 2>&1 || { echo "❌ no such branch: $BRANCH"; exit 1; }

echo "pushing $BRANCH to GitHub  ($MESSAGE)"
git -C "$ROOT" push -q --force-with-lease origin "refs/heads/$BRANCH:refs/heads/$BRANCH"
echo "✅ $BRANCH pushed — its checks run on GitHub; read them with:"
echo "   gh run list --branch $BRANCH --limit 3   (npm run ci:status shows the newest runs, but takes no --branch)"
