#!/usr/bin/env bash
# The step between copying the mirror and tagging it: committing what was copied.
#
# `sync_release_mirror.sh` copies every tracked file into the mirror's working tree and verifies each one, and it deliberately stops there — its own comment explains that the local side must be committed first. What was missing is that
# nothing on the mirror side ever committed, so the release's `remote` step pushed the *previous* commit, its fast-forward check passed, and both steps reported ok while the mirror lagged: on v2.34.29 it sat at `341787a` with
# `package.json` 2.34.28. The seventh step found that by looking for the version **in the content**, which is why its criterion is content.
#
# **Idempotent, and it ends by reading content**: a mirror already matching this checkout reports "nothing to commit" rather than failing, and then `origin/dev:package.json` must report this version.
set -u

VERSION=$(node -p "require('./package.json').version")
MIRROR=../release/groove-github

if [ ! -d "$MIRROR/.git" ]; then
  echo "  ❌ $MIRROR is not a git checkout"
  exit 1
fi

git -C "$MIRROR" add -A
if git -C "$MIRROR" diff --cached --quiet; then
  echo "  (the mirror already matches this checkout; nothing to commit)"
else
  git -C "$MIRROR" commit -q -m "release: v$VERSION"
  echo "  committed release: v$VERSION into the mirror"
fi

git -C "$MIRROR" push -q origin dev

# ⭐ The criterion: the version on the mirror's `dev`, read from the file rather than inferred from a successful push.
PUSHED=$(git -C "$MIRROR" show origin/dev:package.json | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")
if [ "$PUSHED" != "$VERSION" ]; then
  echo "  ❌ the mirror's origin/dev has package.json $PUSHED, expected $VERSION"
  exit 1
fi
echo "  mirror origin/dev: package.json $PUSHED"
