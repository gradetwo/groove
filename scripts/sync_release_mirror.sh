#!/usr/bin/env bash
# RETIRED 2026-10-01 — the release mirror is gone; this script fed it.
#
# It copied every tracked file from this checkout into the mirror (`../release/groove-github`) and proved
# the copy matched, because pushing needed a deploy key that only the mirror had. This repository now has
# `origin` and the same deploy key, so there is no second checkout to copy into and nothing for this to do.
#
# **It fails rather than exiting 0.** A script that prints nothing and succeeds is the shape this project
# treats as the worst outcome: the release path would look healthy while the step did nothing at all. If
# something still calls this, the caller is what needs fixing.
#
# See `docs/OPEN_WORK.md` §十 for the retirement and what replaced it.
echo "❌ scripts/sync_release_mirror.sh is retired: the release mirror is gone (docs/OPEN_WORK.md §十)." >&2
echo "   It used to copy this checkout into ../release/groove-github so the mirror could push; pushes are direct now." >&2
echo "   Nothing should call it — read §十 and remove that call." >&2
exit 1
