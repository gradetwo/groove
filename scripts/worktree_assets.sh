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

# ⭐ **And keep the copies out of git's way.** They are untracked *generated* artwork, and `git add -A` in a worktree committed 114 of them — which made CI report "a skin directory exists but its covers are incomplete" on a branch whose content was otherwise identical to a passing one. The list is written into the shared
# `.git/info/exclude`, so it covers every worktree and the main checkout, and it never becomes part of a commit.
EXCLUDE="$(git -C "$WORKTREE" rev-parse --git-common-dir)/info/exclude"
mkdir -p "$(dirname "$EXCLUDE")"
if ! grep -q "Generated artwork: the cover pipeline" "$EXCLUDE" 2>/dev/null; then
  {
    echo ""
    echo "# Generated artwork: the cover pipeline writes these into the tree, and they are not authored content."
    echo "# Written by scripts/worktree_assets.sh so that a copy cannot be committed by \`git add -A\`."
  } >> "$EXCLUDE"
fi
(cd "$WORKTREE" && git ls-files --others --exclude-standard public/covers) | while read -r file; do
  grep -qx "/$file" "$EXCLUDE" 2>/dev/null || echo "/$file" >> "$EXCLUDE"
done

echo "✅ done — the worktree now has the assets its criteria read, and git ignores the copies"
