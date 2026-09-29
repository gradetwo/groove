#!/usr/bin/env bash
# Publishing the mirror's branches, and reading back what they contain.
#
# The `remote` step pushed `dev` and only *checked* `main` — it verified main was an ancestor of dev and stopped there, so main never advanced on its own. "main = tag = live" held because main was fast-forwarded by hand after each release,
# which is the kind of step that works exactly until the person doing it stops paying attention. It is also how v2.34.31's release ended up with a hand-pushed main in the middle of it.
#
# The mirror is this project's own copy and its main is defined as the released state, so a fast-forward is the intent. If the push is refused as non-fast-forward, the branch is forced — with that fallback said out loud rather than
# hidden, because a forced main is a claim that dev is what should be published.
#
# The criterion is content, not a successful push: both branches must report this version when their `package.json` is read.
set -u

CHECK_ONLY=0
[ "${1:-}" = "--check-only" ] && CHECK_ONLY=1

VERSION=$(node -p "require('./package.json').version")
MIRROR=../release/groove-github

if [ ! -d "$MIRROR/.git" ]; then
  echo "  ❌ $MIRROR is not a git checkout"
  exit 1
fi

if [ "$CHECK_ONLY" = "0" ]; then
  git -C "$MIRROR" push -q origin dev
  if ! git -C "$MIRROR" push -q origin dev:main 2>/tmp/mirror_main_push.log; then
    echo "  (main refused as non-fast-forward; the mirror's main is defined as the released state, so forcing)"
    git -C "$MIRROR" push -q --force origin dev:main
  fi
fi

git -C "$MIRROR" fetch -q origin
for ref in dev main; do
  GOT=$(git -C "$MIRROR" show "origin/$ref:package.json" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")
  if [ "$GOT" != "$VERSION" ]; then
    echo "  ❌ origin/$ref has package.json $GOT, expected $VERSION from this checkout"
    exit 1
  fi
  echo "  origin/$ref: package.json $GOT"
done
