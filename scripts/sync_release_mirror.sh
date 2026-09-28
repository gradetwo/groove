#!/usr/bin/env bash
#
# Make the release mirror equal to this checkout, then **prove** it — because hand-copying the files I just edited is how a hybrid tree gets pushed.
#
# The incident this exists for: CI failed a release build with `'"kick" | … | "fx"' and '"audio"' have no overlap`, which made no sense against a local tree where
# `track_id` does include `"audio"`. The pushed branch was a mirror that differed from this checkout in **1791 files** — one file had been edited across two
# commits, my per-commit `cp` loops carried the others, and the result compiled nowhere while every local check was green.
#
# So: compare **every tracked file**, copy the ones that differ, and fail loudly if anything still differs afterwards. A local green is evidence about the tree
# that was checked, not about the tree that gets pushed; this script is what makes those the same tree.
#
#
# **Order matters:** commit locally **first**, then run this. It walks `git ls-files`, so a file that is still untracked is invisible to it — which cost a round when a
# brand-new test file was written, synced, and skipped in the same command.
#
# Usage: scripts/sync_release_mirror.sh [mirror-path]
set -euo pipefail

SOURCE="$(git rev-parse --show-toplevel)"
MIRROR="${1:-/home/crow/music/release/groove-github}"

if [ ! -d "$MIRROR/.git" ]; then
  echo "❌ $MIRROR is not a git checkout" >&2
  exit 1
fi

copied=0
missing=0
while IFS= read -r file; do
  target="$MIRROR/$file"
  if [ ! -e "$target" ]; then
    mkdir -p "$(dirname "$target")"
    cp "$SOURCE/$file" "$target"
    copied=$((copied + 1))
    missing=$((missing + 1))
  elif ! cmp -s "$SOURCE/$file" "$target"; then
    mkdir -p "$(dirname "$target")"
    cp "$SOURCE/$file" "$target"
    copied=$((copied + 1))
  fi
done < <(git ls-files)

# Files the mirror has and this checkout does not: reported rather than deleted, because a deletion is a decision.
extra=0
while IFS= read -r file; do
  if [ ! -e "$SOURCE/$file" ]; then
    echo "⚠️  mirror has a file this checkout does not: $file"
    extra=$((extra + 1))
  fi
done < <(cd "$MIRROR" && git ls-files)

echo "copied $copied file(s) ($missing were missing entirely); $extra extra in the mirror"

# The proof: nothing tracked may differ now.
differing=0
while IFS= read -r file; do
  if ! cmp -s "$SOURCE/$file" "$MIRROR/$file"; then
    echo "❌ still differs: $file" >&2
    differing=$((differing + 1))
  fi
done < <(git ls-files)

if [ "$differing" -ne 0 ]; then
  echo "❌ $differing file(s) still differ — the mirror is not a copy of this checkout" >&2
  exit 1
fi
echo "✅ every tracked file matches; the mirror is a copy of $(git rev-parse --short HEAD)"
