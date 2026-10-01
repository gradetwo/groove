#!/usr/bin/env bash
# Publishing, with the order enforced rather than remembered.
#
# On the v2.34.25 release the deploy failed (`DEPLOY exit=1`, a boot-probe timeout under load) and the steps after it **ran anyway** — so `main` and the tag claimed a version the site was not serving. Nothing was
# broken for users, because the deploy guard had refused, but that was luck rather than process: the same failure with a subtler cause would have shipped a tag that does not match what is live.
#
# `scripts/check_local.sh` exists because "remember to check the exit code" failed three times. This is the same remedy for the same class of mistake: **the deploy must succeed before anything is published as if it
# had**, and the script stops at the first failure with the step named.
set -u

# ⭐ **Whether the deploy has already happened.** Everything before it is a claim about a build; everything after it is a claim about what is live. A failure on the far side therefore leaves a *partly* published release — the site
# is new while `main` and the tag are not — and that is the dangerous shape, because it presents as a failure. On v2.34.29 exactly that happened: `deploy` succeeded, the tag step refused (correctly, finding no mirror commit carrying
# the version), and the script's message said "nothing has been published as if this step succeeded" while the site was already serving the new version.
DEPLOYED=0

step() {
  local name="$1"; shift
  printf '  %-16s ' "$name"
  if "$@" >/tmp/release_step.log 2>&1; then
    echo "ok"
  else
    echo "FAILED (exit $?)"
    echo "  ---- last 12 lines ----"
    tail -12 /tmp/release_step.log | sed 's/^/  /'
    if [ "$DEPLOYED" = "1" ]; then
      # ⭐ The honest sentence for this case: the deploy is already out, so this is a **partly** published release rather than a stopped one.
      echo "⚠️  STOPPING AFTER THE DEPLOY: the live site is already this version, and everything after it — main, the tag — is not."
      echo "    Push those before leaving this alone, or the release is half done and looks like none of it happened."
    else
      echo "❌ stopping: nothing has been published as if this step succeeded"
    fi
    exit 1
  fi
}

# The version, changelog and derived files are edited by hand before this runs — `package.json` is the one human-edited place, and `version:check` is what proves the rest followed.
echo "release:"
step "version:check" npm run version:check
# ⭐ A version is published once: content that changed must carry a new version, or the tag stops describing what is live.
step "version:new" bash scripts/check_version_is_new.sh
step "local gate" bash scripts/check_local.sh
step "build" npx vite build
# ⭐ The bundle budget, **before** anything is published. It lived only in CI, where it had been failing on every push for forty runs without stopping a release — an advisory check on a site that deploys anyway is an annotation, not a gate. Here it
# refuses to publish an over-budget bundle.
step "budget" npm run check:budget
# ⭐ **The full check, at the one moment it is worth its cost.** Development pushes run the fast checks (`validate`); the browser matrix is skipped on `dev` so iteration is not thirty minutes behind every change. A release is where "all of it" belongs, and this
# step asks for it and waits — so publishing is gated on the same matrix a person would have run by hand.
step "full CI" bash scripts/ci_full.sh

# ⭐ **The gate on publishing.** Everything after this line is a claim about what is live, so it may not run until the deploy that makes it live has succeeded.
step "deploy" npm run deploy:only
DEPLOYED=1   # ⭐ From here on a failure leaves the site newer than main and the tag, and the failure path says so.

# ⭐ **The two mirror steps are gone, not reordered (2026-10-01).** `sync_release_mirror.sh` copied this
# checkout into the mirror and `commit_release_mirror.sh` committed and pushed it; this repository has
# `origin` and the deploy key now, so `tag_release.sh` tags the released commit and pushes the tag from
# here, and `publish_mirror_main.sh` pushes `dev` and `main` from here. Keeping the steps would leave the
# release chain calling retired scripts — and `release.sh` suppresses their output when they succeed, so a
# step that did nothing would have looked exactly like one that worked. See `docs/OPEN_WORK.md` §十.
# ⭐ The tag, which this script used to ask for in its final line without making it.
step "tag" bash scripts/tag_release.sh

# ⭐ Publishing `dev` **and** fast-forwarding `main`, with both read back by content. The old inline block pushed dev and only checked that main was an ancestor of it, so main never advanced on its own.
step "remote" bash scripts/publish_mirror_main.sh

echo "✅ deployed and published — now check /version.json against the tag"
