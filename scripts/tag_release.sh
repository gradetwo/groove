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
    # The tag goes on **the mirror's HEAD, after reading the version out of that tree**.
    #
    # This used to search for the commit that *introduced* the version string (`git log -S … package.json`)
    # and tag that. It is the wrong question, and v2.34.34 was tagged wrong because of it: `-S` lists only
    # commits that **changed** the occurrence, so it returned the commit that bumped `package.json` to
    # 2.34.34 — five commits before the release. The tag's tree was missing `src/data/stemNaming.ts` and
    # `src/data/midiToArrangement.ts` while the deployed site had them: a tag that disagreed with the thing
    # it names.
    #
    # Every commit after the bump still carries the version, so "which commit has this version" has many
    # answers and the only useful one is **the content being released**. That is the mirror's HEAD, and it is
    # verified by reading it rather than assumed — which keeps the original intent (content, not date) and
    # drops the part that was wrong.
    MIRROR_VERSION=$(git -C "$MIRROR" show HEAD:package.json | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")
    if [ "$MIRROR_VERSION" != "$VERSION" ]; then
      echo "  ❌ the mirror's HEAD carries $MIRROR_VERSION, not $VERSION — tag it only when its content is this release"
      exit 1
    fi
    git -C "$MIRROR" tag -a "$TAG" -m "$MESSAGE" HEAD
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
