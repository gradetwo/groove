# GitHub CI — how this repository is run, and what was measured getting there

The project is public, so GitHub-hosted standard runners are **free and unmetered** (Linux: 4 vCPU / 16 GB);
concurrency on the Free plan is 20 jobs. That is the real currency: single jobs are not faster than the machine in
front of you, but twenty of them in parallel are. This file records the branch flow, what CI runs, and the numbers
that decided the shape.

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

* **validate** (every push/PR): actions-runtime gate, `version:check`, `docs:check`, typecheck, lint, red lines,
  unit tests + coverage, genre schema lint/audit, production build, bundle budget.
* **e2e** — **three parallel legs** (`Desktop browsers`, `iPhone 14`, `iPad Pro 11`) over the same seven targets,
  partitioned by the `E2E_ONLY` filter, with `fail-fast: false` so one engine cannot block the others. Every leg
  still runs the complete-matrix script (the workflow test asserts it, because "one leg quietly becomes the
  desktop-only profile" is how two thirds of the targets stopped being checked once). The performance gate runs on
  the desktop leg only — the number belongs to the build.
* **nightly** (schedule / dispatch): coverage, build, `check:loudness:fresh`, **`check:groove`** (the musical
  ratchet: twelve genres through the offline engine), the full matrix, the performance gate, and the artifacts.

`manual-verify.yml` is the on-demand switch (`scope: e2e | verify | audio | jank | skins | all`, plus
`profile`/`only`) and is the right tool for "just the phone legs" or "just the timbre gate".

### Gating policy

`check:loudness:fresh` is red until **P0.8 → P0.9** land (the swing timing change needs the 159 loudness trims
re-recorded, and the re-record cannot publish while the renderer's repeat nondeterminism is open — the measurement's
own sentinel refuses). It therefore runs in **nightly and does not gate pull requests**, by decision rather than by
accident. Everything else is a blocking check.

### Measured results

| Fact | Number |
| :--- | :--- |
| First CI on `dev`, before the fixes | failed in 27 s at `version:check` |
| After the release-date fix (`c000f3a`) | ✅ 13m4s |
| After the three-leg matrix (`3d6936b`) | ✅ 11m13s — Desktop 5m39s, iPad 5m6s, iPhone 3m46s, in parallel |
| Local full unit suite (8 vCPU laptop) | 170 s |
| Same suite on a 12-vCPU Colab VM | 69 s (**2.5×**) |
| `check:groove`, 12 genres, serial | ~21 min locally |
| Same gate, 4 shards on the 12-vCPU VM | 569 s, 12 rows, 0 errors (vs 1272 s of serial work) |
| Same gate, 4 shards on the 8-vCPU/15 GB laptop | **timed out** — four (Vite + Chromium) stacks do not fit |

Two conclusions came out of those numbers, and both are load-bearing:

1. **Parallel work belongs in CI; a single serial job gains almost nothing.** The unit suite (2.5×) and the E2E
   legs (parallel, attributable failures) are the wins. The audio analyser is single-threaded per genre, so its
   1.19× on the VM is clock, not cores.
2. **Sharding must be one shard per runner, not N shards inside one runner.** A 4-vCPU runner cannot host four
   (Vite + Chromium) stacks — the 8-vCPU laptop could not either. `check_groove.mjs --shards=N` (in-process,
   opt-in) is for a many-core host; the CI-shaped version is `--shard=i/n` per runner plus an aggregator job that
   judges the budgets in one place. **That refactor is the next CI step.**

## Operating notes (each one cost time to learn)

* **`gh` needs `-R gradetwo/groove`** — the local tree has no git remote, so `gh` cannot infer the repository.
  `gh run list/view -R gradetwo/groove --branch dev` is the way; SSH push already works.
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

1. CI phase 2: `check_groove.mjs --shard=i/n` + a workflow matrix (one shard per runner) + an aggregator job;
   shard the nightly 159-genre loudness/timbre sweeps the same way (artifacts only, no auto-committed baselines).
2. CI phase 3: a tag workflow (`v*`) that runs verify + build, uploads `dist` as an artifact and drafts the GitHub
   Release from `public/changelog.json`. Deployment stays local (`node scripts/deploy.mjs`) by decision.
3. The product work the plans still own: **B3** (arrangement view), **B5** (fills/variation as arrangement data),
   **P1** (content design through a generator), **P2** (per-note timbre, saturation depth, top-end texture), the
   phone's multi-level genre picker, and **P0.8 → P0.9** (the render nondeterminism and the loudness re-record that
   is waiting on it).
