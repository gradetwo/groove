#!/usr/bin/env bash
# RETIRED 2026-10-01 — the release mirror is gone; this script fed it.
#
# It committed what `sync_release_mirror.sh` had copied into the mirror and pushed the mirror's `dev`,
# because the mirror was the only checkout that could push. That is the step that made a push carry the
# mirror's own working tree, and the one that reported success while `dev` never moved when the mirror was
# left on another branch. This repository pushes its own `dev` and its own tags now.
#
# **It fails rather than exiting 0.** A script that prints nothing and succeeds is the shape this project
# treats as the worst outcome: the release path would look healthy while the step did nothing at all. If
# something still calls this, the caller is what needs fixing.
#
# See `docs/OPEN_WORK.md` §十 for the retirement and what replaced it.
echo "❌ scripts/commit_release_mirror.sh is retired: the release mirror is gone (docs/OPEN_WORK.md §十)." >&2
echo "   It used to commit this checkout's files into ../release/groove-github and push the mirror's dev." >&2
echo "   Nothing should call it — read §十 and remove that call." >&2
exit 1
