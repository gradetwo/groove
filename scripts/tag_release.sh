#!/usr/bin/env bash
# The seventh step of a release: the tag.
#
# `release.sh` ended with "deployed and published — now check /version.json against the tag", which asked for a tag it never made. On v2.34.28 that showed: the deploy succeeded, the live site served 2.34.28, and the tag existed
# nowhere. So the step is here, and it is a step because "main = tag = live" is stated as one fact and was arriving as two.
#
# **It tags both repositories**, because their shas differ: the local repository holds the commits as they were written, while the mirror holds files re-committed by the sync script, so `v2.34.28` there points at `1bf4f33` — a commit
# whose message is about excluding repository metadata. Tagging only one of them would leave the other side of the equality unverifiable.
#
# **And the criterion is content, not success**: the tag must exist after this runs, and `git show <tag>^{}:package.json` must report this version. A push that succeeded and a tag that points at the right release are two different
# claims, and only the second one is the point.
set -u

VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"
MESSAGE="v$VERSION"

# ⭐ Idempotent: re-running a release must not fail on a tag it already made. The tag is checked by content afterwards either way.
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "  (local $TAG already exists)"
else
  git tag -a "$TAG" -m "$MESSAGE"
fi

# The local repository has no remote, so its tag is made and not pushed — pushing would fail on a remote that does not exist, which is noise rather than a problem to report.
MIRROR=../release/groove-github
if [ -d "$MIRROR" ]; then
  if git -C "$MIRROR" rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
    echo "  (mirror $TAG already exists)"
  else
    # ⭐ Pointed at the mirror's commit **whose content is this version**, found by `-S` rather than by date: the newest commit in that repository is not necessarily the one that carries the release.
    RELEASE_COMMIT=$(git -C "$MIRROR" log --format=%H -S"\"version\": \"$VERSION\"" -- package.json | tail -1)
    if [ -z "$RELEASE_COMMIT" ]; then
      echo "  ❌ no commit in the mirror carries package.json at $VERSION"
      exit 1
    fi
    git -C "$MIRROR" tag -a "$TAG" -m "$MESSAGE" "$RELEASE_COMMIT"
  fi
  git -C "$MIRROR" push -q origin "$TAG"
fi

# ⭐ The criterion: the tag exists, and the commit it peels to says this version.
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || { echo "  ❌ $TAG was not created"; exit 1; }
TAGGED_VERSION=$(git show "$TAG^{}:package.json" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")
if [ "$TAGGED_VERSION" != "$VERSION" ]; then
  echo "  ❌ $TAG points at package.json $TAGGED_VERSION, expected $VERSION"
  exit 1
fi
echo "  $TAG → package.json $TAGGED_VERSION"
