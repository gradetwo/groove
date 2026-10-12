#!/usr/bin/env bash
# Publish `dev` and promote it to `main`, then read back what the remote actually contains.
#
# **Why this no longer goes through a mirror (2026-10-01).** The release mirror existed because pushing needed a
# dedicated deploy key and this repository had no remote of its own. Both are in place now, so the mirror had become a
# second rehearsal of every push — and it got the details wrong in ways that mattered: it committed *its own* working
# tree, and when it was left checked out on `main`, a push of `dev` landed on the mirror's `main` while `dev` never
# moved. Both of those printed success. See `docs/OPEN_WORK.md` §十.
#
# The push is now direct, but the **criterion is unchanged and is still about content**: after pushing, both branches
# must report this checkout's `package.json` version when read from the remote. A push that exits zero while the remote
# still has the old version is exactly the failure this check exists to catch.
#
# `main` is defined as the released state, so the promotion fast-forwards whenever it can; the force is kept for the case
# where `main` has drifted, which is a claim that `dev` is what should be published and is therefore stated in the log
# rather than hidden.
set -u

CHECK_ONLY=0
[ "${1:-}" = "--check-only" ] && CHECK_ONLY=1

cd "$(dirname "$0")/.." || exit 1
VERSION=$(node -p "require('./package.json').version")

if [ "$CHECK_ONLY" = "0" ]; then
  git push -q origin HEAD:dev
  if ! git push -q origin HEAD:main 2>/tmp/publish_main_push.log; then
    echo "  (main refused as non-fast-forward; the released state is defined as dev, so main is forced to it)"
    git push -q --force-with-lease origin HEAD:main
  fi
fi

git fetch -q origin
for ref in dev main; do
  GOT=$(git show "origin/$ref:package.json" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")
  if [ "$GOT" != "$VERSION" ]; then
    echo "  ❌ origin/$ref has package.json $GOT, expected $VERSION from this checkout"
    exit 1
  fi
  echo "  origin/$ref: package.json $GOT"
done
