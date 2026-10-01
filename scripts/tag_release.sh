#!/usr/bin/env bash
# The seventh step of a release: the tag.
#
# `release.sh` ended with "deployed and published — now check /version.json against the tag", which asked for a tag it never made. On v2.34.28 that showed: the deploy succeeded, the live site served 2.34.28, and the tag existed
# nowhere. So the step is here, and it is a step because "main = tag = live" is stated as one fact and was arriving as two.
#
# **Why this tag is pushed from this checkout (2026-10-01).** It used to be made in the release mirror and
# pushed by the mirror, because that checkout held the deploy key and this repository had no remote. The
# mirror's history is *not* this history — its commits are files re-committed by the sync script — which
# is why the tag had to be made there as well, and it is exactly how the two sides of "main = tag = live"
# drifted apart. This repository has `origin` and the same deploy key now, so the tag is made on the
# commit being released, in the checkout being released, and pushed from it. See `docs/OPEN_WORK.md` §十.
#
# **A tag that already exists is refused, not moved.** The old script was idempotent — a re-run reported
# `(mirror vX already exists)` and went on to `git push` — and that intent is preserved: when the tag is
# already there naming this release, there is nothing to make and the run proceeds. What is *not*
# preserved is silence about a disagreement. The old script pushed an existing tag name unconditionally,
# so a tag that had drifted surfaced as a raw push rejection in the middle of a release. Here the three
# cases are told apart by **content read from the remote**: the name is absent (create and push), the
# name is present naming this release (nothing to push), the name is present naming a **different**
# release (refuse, and say which version the remote tag carries). Moving a published tag is a claim that
# the release it named was wrong, so it needs `--move` said out loud; that is the deliberate act, not the
# default, and it is what keeps a forced tag push from ever being an accident.
#
# **And the criterion is content, not success**: the tag must exist after this runs, and the tag read
# back from `origin` must name this version's `package.json`. A push that returned zero and a tag that
# names the right release are two different claims, and only the second one is the point.
#
#   bash scripts/tag_release.sh              # create + push, refusing to move an existing tag
#   bash scripts/tag_release.sh --move       # deliberately re-point an existing remote tag at this release
#   bash scripts/tag_release.sh --dry-run    # every check, and the push it would make, but no push
set -u

DRY_RUN=0
MOVE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --move) MOVE=1 ;;
    *) echo "  ❌ unknown argument: $arg (expected --dry-run or --move)"; exit 1 ;;
  esac
done

cd "$(dirname "$0")/.." || exit 1

VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"
MESSAGE="v$VERSION"
VERIFY_REF="refs/groove-tag-check/$TAG"

# ⭐ **A checkout scratch ref is used to read origin's tag, and it is removed however this script ends.**
# A failed run must not leave a ref behind that the next run would mistake for origin's answer.
cleanup() { git update-ref -d "$VERIFY_REF" 2>/dev/null || true; }
trap cleanup EXIT

# ⭐ **The commit being tagged is the content being released**, and the only useful answer to "which
# commit has this version" is this one. Searching for the commit that *introduced* the version string
# (`git log -S … package.json`) was the old mirror's method; it is the wrong question and v2.34.34 was
# tagged wrong because of it — `-S` lists only commits that **changed** the occurrence, so it returned
# the bump commit, five commits early, whose tree was missing files the deployed site had. The tag goes
# on HEAD, and HEAD is checked against the version rather than assumed to be it.
if [ "$(git show HEAD:package.json | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")" != "$VERSION" ]; then
  echo "  ❌ HEAD's package.json is not $VERSION — refusing to tag a commit that is not this release"
  exit 1
fi

# ⭐ Idempotent: re-running a release must not fail on a tag it already made. Verified by content, so
# "it already exists" is only accepted when it exists *naming this release*.
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  LOCAL_TAGGED=$(git show "$TAG^{}:package.json" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")
  if [ "$LOCAL_TAGGED" != "$VERSION" ]; then
    echo "  ❌ local $TAG already exists and carries package.json $LOCAL_TAGGED, not $VERSION"
    echo "     it names a different release; move it on purpose with --move, or delete it and re-run"
    exit 1
  fi
  echo "  (local $TAG already exists, and names $LOCAL_TAGGED)"
else
  git tag -a "$TAG" -m "$MESSAGE"
  echo "  tagged $(git rev-parse --short HEAD) as $TAG"
fi
# The local tag's object and the commit it peels to, fixed now: a re-tag or a later `git tag -f` would
# change these, and the read-back below has to compare against what was *pushed*.
LOCAL_TAG_OBJ=$(git rev-parse "refs/tags/$TAG")
LOCAL_TAG_COMMIT=$(git rev-parse "$TAG^{}")
LOCAL_TAGGED=$(git show "$TAG^{}:package.json" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")

# ⭐ **Ask origin what it has, and read the answer rather than the exit code of a push.** Fetching the tag
# into a scratch ref is what makes two things possible at once: the content check below can read origin's
# `package.json` directly, and the forced move in the `--move` case has a ref to base its lease on —
# `--force-with-lease` has no remote-tracking ref for a tag, so without this it would fail as "stale
# info" rather than do the one thing it was asked to do.
REMOTE_TAG=$(git ls-remote --tags origin "refs/tags/$TAG" | awk '{print $1}')
REMOTE_READABLE=0
# ⭐ `--no-tags` on both fetches in this script: fetching a tag by name *into a scratch ref* would otherwise
# let git auto-follow it and create `refs/tags/$TAG` locally as a side effect — so a verification step would
# be quietly rewriting the local tag it is verifying, and a local tag an operator did not create would
# appear. The scratch ref is the only thing this fetch is allowed to touch.
if [ -n "$REMOTE_TAG" ] && git fetch -q --no-tags --force origin "refs/tags/$TAG:$VERIFY_REF" 2>/dev/null; then
  REMOTE_READABLE=1
  REMOTE_TAGGED=$(git show "$VERIFY_REF^{}:package.json" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")
fi
FORCE=0
PUSHED=1   # 1 unless the branch below decides there is nothing to send
if [ -z "$REMOTE_TAG" ]; then
  echo "  origin has no $TAG; pushing it"
elif [ "$REMOTE_READABLE" = "0" ]; then
  # ⭐ A tag that exists but cannot be read back is not a tag to push over. The only way past is the
  # deliberate one, so the refusal names it.
  if [ "$MOVE" = "1" ]; then
    echo "  ⚠️  --move: origin's $TAG ($REMOTE_TAG) could not be read back; re-pointing it at $LOCAL_TAG_COMMIT"
    FORCE=1
  else
    echo "  ❌ origin's $TAG already exists ($REMOTE_TAG) but could not be read back to compare its content"
    echo "     a tag is a release artefact; if this release is meant to re-point it, say so: bash scripts/tag_release.sh --move"
    exit 1
  fi
elif [ "$MOVE" = "1" ]; then
  echo "  ⚠️  --move: origin's $TAG ($REMOTE_TAG, package.json $REMOTE_TAGGED) will be re-pointed at $LOCAL_TAG_COMMIT (package.json $LOCAL_TAGGED)"
  FORCE=1
elif [ "$REMOTE_TAGGED" != "$VERSION" ]; then
  echo "  ❌ origin's $TAG already exists ($REMOTE_TAG) and carries package.json $REMOTE_TAGGED, not $VERSION"
  echo "     a tag is a release artefact; if this release is meant to re-point it, say so: bash scripts/tag_release.sh --move"
  exit 1
elif [ "$(git rev-parse "$VERIFY_REF^{}")" != "$LOCAL_TAG_COMMIT" ]; then
  # ⭐ Same version, different commit: the tag names a different tree that happens to carry the same
  # `package.json`. Refused for the same reason as a different version — the tag is a release artefact
  # and this run would silently leave it pointing somewhere else than the release being published.
  echo "  ❌ origin's $TAG exists ($REMOTE_TAG) naming commit $(git rev-parse "$VERIFY_REF^{}"), not $LOCAL_TAG_COMMIT"
  echo "     same version, different content; re-point it on purpose with --move"
  exit 1
else
  echo "  (origin's $TAG already names $REMOTE_TAGGED at $LOCAL_TAG_COMMIT; nothing to push)"
  PUSHED=0
fi

if [ "$DRY_RUN" = "1" ]; then
  # ⭐ `--dry-run` reaches the real decision — which ref, which lease — and prints what git would send, so
  # the path being verified is the path that would run. It deliberately does not push.
  echo "  --dry-run: the push this would make:"
  if [ "$FORCE" = "1" ]; then
    LEASE=""
    [ "$REMOTE_READABLE" = "1" ] && LEASE="--force-with-lease=refs/tags/$TAG:$REMOTE_TAG"
    git push --dry-run origin "refs/tags/$TAG:refs/tags/$TAG" $LEASE || { echo "  ❌ even the dry-run push was refused"; exit 1; }
  else
    git push --dry-run origin "refs/tags/$TAG:refs/tags/$TAG" || { echo "  ❌ even the dry-run push was refused"; exit 1; }
  fi
  echo "  --dry-run: nothing pushed; $TAG names package.json $LOCAL_TAGGED locally"
  exit 0
fi

# ⭐ **The forced case is done and verified by content.** `--force-with-lease` with the remote's tag sha
# read above: it refuses if origin's tag moved between that read and this push, which is the one thing a
# deliberate move must still not do blindly.
if [ "$PUSHED" = "0" ]; then
  # ⭐ Honest wording: the read-back below still runs — the criterion is what origin holds, not what this
  # script just did — but the log may not say "pushed" about a run that pushed nothing.
  echo "  nothing to push; origin's $TAG already names this release"
elif [ "$FORCE" = "1" ]; then
  if [ "$REMOTE_READABLE" = "1" ]; then
    git push -q origin "refs/tags/$TAG:refs/tags/$TAG" "--force-with-lease=refs/tags/$TAG:$REMOTE_TAG"
  else
    git push -q --force origin "refs/tags/$TAG:refs/tags/$TAG"
  fi
  echo "  pushed $TAG to origin (moved)"
else
  git push -q origin "refs/tags/$TAG:refs/tags/$TAG"
  echo "  pushed $TAG to origin"
fi

# ⭐ **Read the tag back from origin and compare what it names**, not just the exit code of the push.
# `refs/groove-tag-check/` is force-fetched, so this is origin's answer and not a local leftover.
if ! git fetch -q --force origin "refs/tags/$TAG:$VERIFY_REF"; then
  echo "  ❌ origin's $TAG could not be read back after the push"
  exit 1
fi
if [ "$(git rev-parse "$VERIFY_REF^{}")" != "$LOCAL_TAG_COMMIT" ]; then
  echo "  ❌ origin's $TAG names commit $(git rev-parse "$VERIFY_REF^{}"), not $LOCAL_TAG_COMMIT — the push did not land"
  exit 1
fi
# ⭐ The commit, not just the tag object: an annotated tag is a new object on every re-make, so comparing
# tag objects would report a disagreement that is only about the annotation. The version is then read
# out of the published tree, which is the claim "main = tag = live" actually makes.
PUBLISHED_VERSION=$(git show "$VERIFY_REF^{}:package.json" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")
if [ "$PUBLISHED_VERSION" != "$VERSION" ]; then
  echo "  ❌ origin's $TAG points at package.json $PUBLISHED_VERSION, expected $VERSION"
  exit 1
fi
echo "  $TAG → origin's package.json $PUBLISHED_VERSION"
