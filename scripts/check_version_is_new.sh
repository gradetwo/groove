#!/usr/bin/env bash
# A version is published once.
#
# The guard exists because of what happened on 2.34.31: the manifest gained a whole library, the release ran, and because nothing had bumped the version the script published **different content under a version that was already tagged**. All eight
# steps reported ok. The tag still pointed at the earlier commit — whose `package.json` also said 2.34.31, so the tag step's content criterion passed — and the tag therefore named a version whose content was not what was live.
#
# The tag is the record of what a version means, so re-publishing under an existing one makes that record false in a way no content check can catch, because the version itself did not change. The check belongs first, before anything expensive.
set -u

VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "  ❌ $TAG is already tagged, so this content would publish under a version that already means something else"
  echo "     bump the version in package.json, run npm run version:sync, and release again"
  exit 1
fi

echo "  $TAG is new"
