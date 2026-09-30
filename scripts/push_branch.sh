#!/usr/bin/env bash
# Push a **branch** to the mirror, so its checks run on GitHub rather than on this machine.
#
# The owner's instruction (2026-09-30): several worktrees are how parallel work happens, and **CI belongs on GitHub**. A branch pushed to the mirror runs `validate` there — typecheck, lint, the unit suite, build, bundle budget — and a worktree that is still being written does not need
# the gate run twice on the same laptop.
#
#   bash scripts/push_branch.sh <branch> [message]
#
# It never touches `dev`: that branch is published by `push_dev.sh` after the local gate, and mixing the two would make a half-finished feature part of what a person clones.
set -eu

BRANCH="${1:?usage: push_branch.sh <branch> [message]}"
MESSAGE="${2:-wip: $BRANCH}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIRROR="$ROOT/../release/groove-github"

[ -d "$MIRROR/.git" ] || { echo "❌ $MIRROR is not a checkout"; exit 1; }
git -C "$ROOT" rev-parse --verify "$BRANCH" >/dev/null 2>&1 || { echo "❌ no such branch: $BRANCH"; exit 1; }

# The branch is fetched straight out of this repository into the mirror, so the working tree of neither is touched.
git -C "$MIRROR" fetch -q "$ROOT" "$BRANCH:refs/heads/$BRANCH" --force
echo "pushing $BRANCH to the mirror"
git -C "$MIRROR" push -q origin "$BRANCH" --force-with-lease
echo "✅ $BRANCH pushed — its checks run on GitHub; read them with:"
echo "   cd $MIRROR && gh run list --branch $BRANCH --limit 3"
