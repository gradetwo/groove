#!/usr/bin/env bash
# Publishing, with the order enforced rather than remembered.
#
# On the v2.34.25 release the deploy failed (`DEPLOY exit=1`, a boot-probe timeout under load) and the steps after it **ran anyway** — so `main` and the tag claimed a version the site was not serving. Nothing was
# broken for users, because the deploy guard had refused, but that was luck rather than process: the same failure with a subtler cause would have shipped a tag that does not match what is live.
#
# `scripts/check_local.sh` exists because "remember to check the exit code" failed three times. This is the same remedy for the same class of mistake: **the deploy must succeed before anything is published as if it
# had**, and the script stops at the first failure with the step named.
set -u

step() {
  local name="$1"; shift
  printf '  %-16s ' "$name"
  if "$@" >/tmp/release_step.log 2>&1; then
    echo "ok"
  else
    echo "FAILED (exit $?)"
    echo "  ---- last 12 lines ----"
    tail -12 /tmp/release_step.log | sed 's/^/  /'
    echo "❌ stopping: nothing has been published as if this step succeeded"
    exit 1
  fi
}

# The version, changelog and derived files are edited by hand before this runs — `package.json` is the one human-edited place, and `version:check` is what proves the rest followed.
echo "release:"
step "version:check" npm run version:check
step "local gate" bash scripts/check_local.sh
step "build" npx vite build

# ⭐ **The gate on publishing.** Everything after this line is a claim about what is live, so it may not run until the deploy that makes it live has succeeded.
step "deploy" npm run deploy:only

step "mirror" ./scripts/sync_release_mirror.sh
# ⭐ Committing what the sync copied: without this the mirror keeps the previous commit, and the push below sends it while the fast-forward check passes.
step "mirror commit" bash scripts/commit_release_mirror.sh
# ⭐ The tag, which this script used to ask for in its final line without making it.
step "tag" bash scripts/tag_release.sh

cd "$(dirname "$0")/.." || exit 1
printf '  %-16s ' "remote"
if git -C ../release/groove-github push origin dev >/tmp/release_step.log 2>&1 \
  && git -C ../release/groove-github fetch -q origin \
  && git -C ../release/groove-github merge-base --is-ancestor origin/main origin/dev; then
  echo "ok"
else
  echo "FAILED"
  tail -8 /tmp/release_step.log | sed 's/^/  /'
  echo "❌ not fast-forwarding main; stop and look"
  exit 1
fi

echo "✅ deployed and published — now check /version.json against the tag"
