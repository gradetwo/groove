#!/usr/bin/env bash
# Copy the untracked assets a worktree needs — because a fresh worktree has only what git tracks.
#
# **Why this exists.** `genreCovers.test.ts` checks the shipped artwork under `public/covers/<skin>/`, and most of those files are **generated and untracked**: the main tree has 159 per skin, a freshly created worktree has the three that happen to be tracked. The criterion then fails in the
# worktree and passes in the main tree, which looks like a code problem and is not one.
#
#   bash scripts/worktree_assets.sh [path to the main checkout]
#
# It copies untracked, ignored files from the main tree, never overwriting anything the worktree already has. Run it once after `git worktree add`, before running the local gate there.
set -eu

WORKTREE="$(cd "$(dirname "$0")/.." && pwd)"
MAIN="${1:-/home/crow/music/groove}"

[ -d "$MAIN/.git" ] || { echo "❌ $MAIN is not a checkout"; exit 1; }
[ "$WORKTREE" != "$MAIN" ] || { echo "❌ run this from a worktree, not from the main checkout"; exit 1; }

# `public/` is where generated artwork, fonts and cached assets live; it is the directory that makes a fresh worktree look broken to a test that reads files.
echo "copying untracked assets from $MAIN to $WORKTREE"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --ignore-existing --exclude 'coverage' "$MAIN/public/" "$WORKTREE/public/"
else
  # A hand-rolled copy that does not overwrite: `cp -n` is not on every platform, so the test is explicit.
  (cd "$MAIN/public" && find . -type f) | while read -r file; do
    target="$WORKTREE/public/$file"
    [ -e "$target" ] || { mkdir -p "$(dirname "$target")"; cp "$MAIN/public/$file" "$target"; }
  done
fi
echo "✅ done — the worktree now has the assets its criteria read"
