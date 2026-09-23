# GitHub CI — how this repository is run, and what was measured getting there

The project is public, so GitHub-hosted standard runners are **free and unmetered** (Linux: 4 vCPU / 16 GB);
concurrency on the Free plan is 20 jobs. That is the real currency: single jobs are not faster than the machine in
front of you, but twenty of them in parallel are. This file records the branch flow, what CI runs, and the numbers
that decided the shape.

**The working rule that follows from it: if a check can run on a runner, it runs on a runner — not on the laptop.**
The development loop is a targeted `npx vitest run <file>` (seconds) plus a push; the full suite, the build, the
browser matrix and the probes belong to `dev`'s CI. A local `npm run verify` is for a release candidate, not for
each commit, because it pegs every core for half an hour and answers exactly what CI already answers.

## Branches and the sync flow

| Branch | Who owns it | What it means |
| :--- | :--- | :--- |
| `next` (local, `/home/crow/music/groove`) | the working tree | where development happens; every commit is verified locally |
| `dev` (GitHub) | the agent | integration: feature commits are cherry-picked here, CI runs here |
| `main` (GitHub) | the human | moved by merging `dev` when it is green |

The two trees have **unrelated histories** (the GitHub tree has always been fed by cherry-picks), so:

```bash
# from the GitHub working tree (../release/groove-github)
git fetch apple2011                 # the remote named apple2011 points at ../../groove
git cherry-pick <sha>               # one commit at a time — this is the normal flow
git push origin dev
```

The very first sync was a single squashed commit ("sync(dev): bring dev to the local tree's state") because there
was no shared history to cherry-pick onto. From then on it is per-commit. Verify a sync landed by diffing the two
trees, which must be empty:

```bash
git diff --stat apple2011/next HEAD
```

## What CI runs

`ci.yml`:

* **E2E legs are bounded twice**: each target runs in a **child process with a hard 8-minute watchdog**
  (`E2E_TARGET_TIMEOUT_MS`), and the jobs carry a 45-minute `timeout-minutes`. Measured on 2026-09-23: a wedged
  WebKit process held the iPad leg for **three and a half hours** (07:09 → cancelled at 10:30) while its sibling legs
  finished in minutes, because GitHub's default job timeout is six hours and Playwright's own timeouts cover its
  waits rather than a stalled browser. A hang now fails in eight minutes **with the target named**, and is not
  retried.

* **validate** (every push/PR): actions-runtime gate, `version:check`, `docs:check`, typecheck, lint, red lines,
  unit tests + coverage, genre schema lint/audit, **the loudness report-vs-table gate** (two file reads, ~1 s — it was
  `verify`-only and spent a day red without anyone seeing it), production build, bundle budget.
* **e2e** — **three parallel legs** (`Desktop browsers`, `iPhone 14`, `iPad Pro 11`) over the same seven targets,
  partitioned by the `E2E_ONLY` filter, with `fail-fast: false` so one engine cannot block the others. Every leg
  still runs the complete-matrix script (the workflow test asserts it, because "one leg quietly becomes the
  desktop-only profile" is how two thirds of the targets stopped being checked once). The desktop leg then runs the
  **studio DOM probes** (`probe:toolbar`, `probe:grid-gutter`, `probe:arrangement`) against the same build — they
  serve `dist/` themselves, so that leg has everything they need and no other leg needs a copy — and the
  performance gate (the number belongs to the build, not to the engine).
* **nightly** (schedule / dispatch): coverage, build, `check:loudness:fresh`, the full matrix, the performance
  gate, and the artifacts. The musical ratchet is **not** in this job any more — see below.
* **groove-shards** (schedule / dispatch): four runners, one slice of the twelve-genre sample each
  (`--shard=i/4 --rows-out=…`). A shard judges **no budgets**: it renders its three genres, writes the rows and
  uploads them as an artifact.
* **groove-gate** (schedule / dispatch, `needs: groove-shards`): downloads the four artifacts, merges them, refuses
  anything that is not the sample exactly once, and *there* the budgets are compared — one place, so the sharded run
  and the serial run cannot disagree. It runs with `if: always()` and no `npm ci` (the merge path imports nothing but
  Node), so a dead shard produces "no shard measured: …" instead of silence.

`manual-verify.yml` is the on-demand switch (`scope: e2e | verify | audio | trim | jank | skins | all`, plus
`profile`/`only`) and is the right tool for "just the phone legs", "just the timbre gate", or the 159-genre loudness
trim re-record (`trim`, which uploads the report as an artifact and never commits a baseline).

### Gating policy

`check:loudness:fresh` is red until **P0.9** lands (the swing and sidechain changes moved the fitted trims, so the
committed report no longer describes the code). Its blocker was **P0.8**, and that is now resolved by measurement
rather than by luck: the gate's sentinel was comparing two page states, not two renders. The run now takes its
reference on a recycled page (`measure_genre_loudness.mjs`), and the 14-genre subset that aborted at Δ +0.760 dB
finishes at Δ −0.000 dB. What remains is the re-record itself — run `Manual verify` with `scope: trim`, download the
artifact, apply it with `node scripts/apply_loudness_trims.mjs`, and commit. Until then `check:loudness:fresh` runs in
**nightly and does not gate pull requests**, by decision rather than by accident. Everything else is a blocking check.

### Measured results

| Fact | Number |
| :--- | :--- |
| First CI on `dev`, before the fixes | failed in 27 s at `version:check` |
| After the release-date fix (`c000f3a`) | ✅ 13m4s |
| After the three-leg matrix (`3d6936b`) | ✅ 11m13s — Desktop 5m39s, iPad 5m6s, iPhone 3m46s, in parallel |
| Local full unit suite (8 vCPU laptop) | 170 s |
| Same suite on a 12-vCPU Colab VM | 69 s (**2.5×**) |
| `check:groove`, 12 genres, serial | ~21 min locally |
| The 159-genre trim re-record (`Manual verify` · `scope: trim`) | ~2 h on a 4-vCPU runner, artifact only |
| Same gate, 4 shards on the 12-vCPU VM | 569 s, 12 rows, 0 errors (vs 1272 s of serial work) |
| Same gate, 4 shards on the 8-vCPU/15 GB laptop | **timed out** — four (Vite + Chromium) stacks do not fit |
| One shard (`--shard=1/4`: 3 genres) on one core | 517 s — i.e. a shard costs one core, which is why four runners beat one machine |

Two conclusions came out of those numbers, and both are load-bearing:

1. **Parallel work belongs in CI; a single serial job gains almost nothing.** The unit suite (2.5×) and the E2E
   legs (parallel, attributable failures) are the wins. The audio analyser is single-threaded per genre, so its
   1.19× on the VM is clock, not cores.
2. **Sharding must be one shard per runner, not N shards inside one runner.** A 4-vCPU runner cannot host four
   (Vite + Chromium) stacks — the 8-vCPU laptop could not either. That is now the shape in `ci.yml`
   (`groove-shards` + `groove-gate`), and the in-process `--shards=N` is kept for a many-core host (Colab).

## Operating notes (each one cost time to learn)

* **`gh` needs `-R gradetwo/groove`** — the local tree has no git remote, so `gh` cannot infer the repository.
  `gh run list/view -R gradetwo/groove --branch dev` is the way; SSH push already works.
* **The PAT cannot dispatch a workflow** (`HTTP 403: Resource not accessible by personal access token`): it has
  `repo` + `actions:read` but not `workflow`. Pushes work, so the push-time jobs (`validate`, the three `e2e` legs)
  run by themselves; the **schedule/dispatch-only** jobs (`nightly`, `groove-shards`, `groove-gate`) need either a
  PAT with the `workflow` scope or a click on *Run workflow* in the Actions tab.
* **Long CI work is unreadable without a token? No longer** — `gh` is authenticated on this machine (account
  `gradetwo`, protocol ssh).
* **Never `pkill -f <pattern>` when the pattern can match your own command line** (a heredoc containing
  `scripts/check_groove.mjs` matches `check_groove`): it kills the invoking shell. Build the pattern from parts
  (`P="analyze_export""_audio.mjs"`) and exclude `$$`.
* **The analyser's dev server is `--strictPort`**, so the base port must be free; a killed run can leave one
  behind, and the next shard then fails with a `page.goto` timeout that looks like a code problem.
* **`version:check` no longer fails on a calendar rollover**: `releaseDate` belongs to the version, not to today
  (it cost the first `dev` CI run, and would have failed every day on an untouched tree).
* Colab remains useful for many-core, long-running experiments (`docs/COLAB.md`); the GPU is irrelevant to this
  CPU-only workload.

## Next steps

1. CI phase 3: a tag workflow (`v*`) that runs verify + build, uploads `dist` as an artifact and drafts the GitHub
   Release from `public/changelog.json`. Deployment stays local (`node scripts/deploy.mjs`) by decision.
2. Shard the nightly 159-genre loudness/timbre sweeps the same way the groove gate is sharded now (artifacts only,
   no auto-committed baselines).
3. The product work the plans still own: **B5** (fills/variation as arrangement data, unblocked now that B3's
   timeline view edits `sections`), **P1** (content design through a generator), **P2** (per-note timbre,
   saturation depth, top-end texture), the phone's multi-level genre picker, and **P0.8 → P0.9** (the render
   nondeterminism and the loudness re-record that is waiting on it).

## What the laptop still owes

Nothing that a runner can do. What remains local on purpose:

* the **first** run of a new probe (`probe:arrangement` was written and debugged locally, then wired into the
  desktop leg — debugging a brand-new check through CI round-trips is slower than one local run);
* `npm run build` when a probe needs `dist/` *right now*;
* `node scripts/deploy.mjs`, which needs Cloudflare credentials and is deliberately not a CI job;
* the release-candidate `npm run verify`, once, before a version is published.

