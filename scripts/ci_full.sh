#!/usr/bin/env bash
# Ask CI for everything — the release-time check.
#
# The owner's division of labour (2026-09-30): a development push runs the fast checks that judge what it touched, and **a release runs all of it**. This is how a release asks: it dispatches the CI workflow by hand, which is the one path that includes the browser matrix, and
# waits for the verdict instead of assuming it.
#
#   npm run ci:full              # dispatch and wait
#   npm run ci:full -- --no-wait # dispatch and return
#
# **Why this asks from this checkout (2026-10-01).** It used to `cd` into the release mirror
# (`../release/groove-github`) and read the branch, the dispatch and the run from there. That made a
# release-time check depend on a second checkout, and it asked the wrong question on the way: the branch
# it dispatched was **the mirror's** checked-out branch, so a mirror left on `main` ran the full matrix
# on `main` and reported it while the release being judged sat on `dev` — the same class of false
# success as `push_dev.sh`'s third failure mode (`docs/OPEN_WORK.md` §十). This repository has `origin`
# and the deploy key now, `gh` resolves the repository from the remote, and the branch that gets judged
# is the one this script is standing in. The mirror is retired; see §十.
#
# **A dispatch that cannot be resolved has to say so.** `gh workflow run --ref <branch>` only works for
# a ref GitHub already knows, so the branch is checked against `origin` first. Without that check the
# failure is `gh`'s, and the honest question — "was the full matrix ever run for this commit?" — would
# be answered by a wrench icon instead of a sentence.
set -eu

cd "$(dirname "$0")/.." || exit 1

command -v gh >/dev/null || { echo "❌ gh is not installed, so CI cannot be asked from here"; exit 1; }

# ⭐ **The branch being released is the branch this checkout is on**, not whatever a mirror had checked
# out. Detached HEAD is reported rather than guessed at: `git rev-parse --abbrev-ref HEAD` prints the
# literal `HEAD`, and dispatching on that would be a claim about a ref that does not exist.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" = "HEAD" ]; then
  echo "❌ this checkout is on a detached HEAD, so there is no branch to dispatch the full CI on"
  exit 1
fi
echo "dispatching the full CI on $BRANCH"

# ⭐ **Dispatch is only possible for a ref the remote has**, and saying so here is the difference between
# a named problem and a silent unknown. Checked against the fetched `origin`, so the answer is about
# GitHub rather than about this machine's idea of the branch.
git fetch -q origin || { echo "❌ cannot reach origin, so the branch this would dispatch cannot be checked"; exit 1; }
if ! git rev-parse -q --verify "refs/remotes/origin/$BRANCH" >/dev/null; then
  echo "❌ origin has no branch $BRANCH, and workflow_dispatch needs a ref GitHub already knows"
  echo "   push it first — e.g. bash scripts/push_branch.sh $BRANCH — then run this again"
  exit 1
fi

# ⭐ **…and the commit being judged has to be the one on the remote.** `workflow_dispatch` runs the
# workflow file on GitHub's branch, not on this checkout, so a HEAD ahead of `origin/$BRANCH` would run
# the full matrix over an older commit and call the result a verdict on this one. That is the failure
# this whole script exists to avoid, so it is refused with the two shas named rather than assumed away.
if ! git merge-base --is-ancestor HEAD "refs/remotes/origin/$BRANCH"; then
  echo "❌ HEAD ($(git rev-parse --short HEAD)) is not on origin/$BRANCH — dispatching would judge the remote's ref, not this commit"
  echo "   push it first: bash scripts/push_branch.sh $BRANCH"
  exit 1
fi

# `nightly=false` on purpose: a release wants the browser matrix, not the monitoring sweep.
gh workflow run ci.yml --ref "$BRANCH" -f nightly=false

# The run takes a moment to appear, and matching on the newest id is how the one just asked for is found.
sleep 10
RUN=$(gh run list --workflow=ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')
[ -n "$RUN" ] || { echo "❌ the dispatch produced no run"; exit 1; }
echo "watching run $RUN"

if [ "${1:-}" = "--no-wait" ]; then
  exit 0
fi
gh run watch "$RUN" --exit-status
STATUS=$?
gh run view "$RUN" | grep -E "^[X✓] |^  [X✓] " | head -20
exit "$STATUS"
