#!/usr/bin/env bash
# Push `dev` straight to GitHub. No release mirror in the path.
#
# **Why the mirror is gone (2026-10-01).** The mirror existed because pushing needed a dedicated deploy key and this
# repository had no remote of its own. Both are now in place (`git remote -v` and `core.sshCommand`), so the mirror
# became a second rehearsal of the same push — and it failed in three ways in a single day:
#
#   1. it refused to sync when the mirror and the working tree differed, which blocked the queue whenever anyone left an
#      edit lying around;
#   2. it committed *its own* working tree, so a push could carry work nobody meant to ship;
#   3. when it was left checked out on `main`, the script committed there and ran `git push origin dev` — so the commits
#      landed on the mirror's `main`, `dev` never moved, and the script still printed "✅ pushed". A false success is the
#      worst of the three, because it is the one that makes you stop looking.
#
# A plain `git push` has none of those failure modes: it publishes the branch it names, and it exits non-zero when the
# remote refuses.
#
#   bash scripts/push_dev.sh [commit message, used only if the working tree is dirty]
#   SKIP_LOCAL_GATE=1 bash scripts/push_dev.sh [message]   # the gate lives on GitHub's `dev` branch (docs/OPEN_WORK.md §五)
set -eu

cd "$(dirname "$0")/.." || exit 1

if [ "${SKIP_LOCAL_GATE:-}" = "1" ]; then
  # ⭐ **The gate now lives on GitHub's `dev` branch** (owner's instruction, 2026-10-01), so a push may skip the local
  # one — **explicitly**, with this variable, and it says so in the log. Spelled out rather than deleted, because the
  # local gate is still the fastest way to see which step is red: `bash scripts/check_local.sh`.
  echo "1/3  the local gate is SKIPPED (SKIP_LOCAL_GATE=1) — the gate runs on GitHub's dev branch; see docs/OPEN_WORK.md §五"
else
  echo "1/3  the full local gate (typecheck, lint, styling, the unit suite)"
  bash scripts/check_local.sh
fi

# ⭐ **Refuse a dirty tree rather than quietly committing it.** The old script committed the mirror's working tree, which
# meant an editor left open anywhere in the checkout could end up inside a push. Committing is a decision about what
# belongs together; the push script is the wrong place to make it. Work in progress belongs in a worktree (see
# docs/OPEN_WORK.md §九), or in its own commit, made on purpose.
if [ -n "$(git status --porcelain)" ]; then
  echo "2/3  ✗ the working tree is dirty — commit or move it to a worktree before pushing:"
  git status --short | sed 's/^/       /'
  exit 1
fi
echo "2/3  the working tree is clean"

MESSAGE="${1:-sync}"
echo "3/3  cancelling superseded runs, pushing dev"

# ⭐ **Cancel the runs this push supersedes.** The owner's point: a queue full of runs for commits nobody will look at
# again is a queue that delays the one that matters. A run is superseded when it is still going and its commit is not the
# commit about to be pushed — so the newest push keeps its verdict and the older ones stop costing minutes.
NEW_SHA=$(git rev-parse HEAD)
if command -v gh >/dev/null 2>&1; then
  SUPERSEDED=$(
    gh run list --workflow=ci.yml --limit 20 --json databaseId,status,headSha \
      --jq "[.[] | select(.status != \"completed\") | select(.headSha != \"$NEW_SHA\") | .databaseId]" 2>/dev/null || true
  )
  for RUN in $SUPERSEDED; do
    echo "     cancelling superseded run $RUN"
    gh run cancel "$RUN" >/dev/null 2>&1 || true
  done
fi

# ⭐ **`HEAD:dev`, not `dev`.** The working branch here is `next`; `dev` is the branch GitHub gates and the owner
# promotes from. Pushing `dev` would need a local branch of that name and would silently push whatever it last pointed
# at; `HEAD:dev` publishes exactly the commit you are looking at, which is what the old mirror script meant by "push the
# working tree". `set -e` is the point: a rejected push must fail this script, not print a success line.
#
# ⚠️ **And `git push` also exits 0 when there is nothing to send**, which the line below used to report as
# `✅ pushed (<HEAD>)` — the same false success this script's header exists to prevent, one layer down. In a rebase race
# `HEAD` can already be on `dev`, and the run then credited itself with publishing a commit it never sent. Which of the
# two happened is decided by what the push says, and by nothing else.
if PUSH_OUT=$(git push origin HEAD:dev 2>&1); then
  printf '%s\n' "$PUSH_OUT"
  if printf '%s' "$PUSH_OUT" | grep -q 'Everything up-to-date'; then
    echo "☑️  nothing to push: dev already has $(git log --oneline -1 | cut -c1-40) — this run published nothing"
  else
    echo "✅ pushed ($(git log --oneline -1 | cut -c1-40)) — now read what CI says: npm run ci:status"
  fi
else
  printf '%s\n' "$PUSH_OUT" >&2
  echo "❌ the push was rejected or failed; this run published nothing" >&2
  exit 1
fi
