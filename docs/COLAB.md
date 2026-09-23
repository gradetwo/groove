# Colab as a build machine — measured, with the recipe

The long jobs in this repo (`npm run verify`, the E2E matrix, the audio analysers, the 159-genre loudness sweep)
are why a rented 12-vCPU VM is attractive. This file records what actually works, the two CLI bugs that had to be
fixed first, and the measured speedups — so the next session does not repeat the investigation.

## Verdict

**Usable, with caveats.** The CLI's `exec` path was broken out of the box on this machine; after the fix below it
works, and the VM (L4 shape: **12 vCPU, 52 GB RAM, 190 GB free**, Node installed by us) is worth using for
**parallel** work. It is *not* worth using as-is for the serial audio analysers — see the numbers.

## The two fixes that make the CLI work

1. **CLI 0.6.0 could not run anything.** Its `exec` raised
   `AttributeError: module 'jupyter_kernel_client' has no attribute 'KernelClient'` because the installed
   `jupyter-kernel-client` (1.0.2) had renamed that class.
2. **CLI 0.7.2 fixes that but has a packaging bug of its own**: its metadata pins
   `jupyter-kernel-client==0.8`, while its code needs `jupyter_kernel_client.JupyterSubprotocol`, which only
   exists from **0.9.0**. Upgrading without overriding the pin leaves `exec` failing with
   `AttributeError: ... has no attribute 'JupyterSubprotocol'`.

```bash
colab update --install                                   # 0.6.0 -> 0.7.2 (also downgrades the kernel client to 0.8.0)
uv pip install --python "$(dirname "$(readlink -f "$(command -v colab)")")/python" 'jupyter-kernel-client==0.9.0'
colab version    # 0.7.2
```

A future `colab update` will re-pin 0.8 and break `exec` again — re-apply the second line if it does.

## Quirks worth knowing before scripting

- **Uploads resolve against `/`, not the kernel's `/content`.** `colab upload f.sh f.sh` lands at `/f.sh`; use an
  absolute `/content/f.sh` remote path (small files work with the absolute form; the earlier `400` was size).
- **The contents API rejects large files** (~114 MB failed with `500`). Ship a ≤20 MB tarball — excluding
  `node_modules`, `dist`, `scratch` and `.git` takes this repo from 114 MB to **16 MB**, and `redlines` only needs
  `git ls-files`, which a synthetic `git init && git add -A && git commit` on the VM satisfies.
- **A cell that runs longer than ~10 s fails the CLI request** (HTTP read timeout, independent of `--timeout`).
  Start long work detached (`nohup … > log 2>&1 &`) and poll the log, or run it in `colab console` (tmux-backed,
  non-interactive when stdin is piped: `echo "cmd" | colab console -s <name>`).
- **The kernel is single-threaded**: one long cell blocks the next one, and a `subprocess.run(capture_output=True)`
  around a detach command keeps the pipe open until the child exits (making the cell look busy for the whole job).
  Redirect the child's stdout/stderr to a file, as the scripts here do.
- **Sessions are billable** until `colab stop -s <name>` (24 h keep-alive cap). Nothing reclaims them for you.
- `colab run script.py` (fresh VM, one shot, exit code propagated) cannot fetch this repo: there is no git remote,
  so the persistent-session + tarball upload pattern is the one that works.

## Measured speedups

Host for comparison: local machine, 8 vCPU (i7-2635QM @2.00 GHz), 15 GB RAM. VM: 12 vCPU (Xeon @2.20 GHz), 52 GB.

| Job | Local | Colab | Speedup |
| :--- | ---: | ---: | ---: |
| Full unit suite (`vitest run`, 229 files / 2669 tests) | 170 s | **69 s** | **2.5×** |
| Audio analyser, 3 genres, serial (`analyze_export_audio.mjs`) | 377 s | 318 s | 1.19× |
| Audio analyser, all 12 gate genres, **sharded 4-way** (`--port` per shard) | ~1500 s serial (est.) | **569 s** | **~2.6×** |

What the numbers mean:

- **Parallel workloads win big.** The unit suite scales with cores almost linearly; that is where the VM earns its
  keep, and the E2E matrix (Playwright workers) should behave the same way.
- **The audio analysers are serial per genre** (one page, one render at a time; Web Audio is single-threaded), so
  12 cores do almost nothing for a plain run — 1.19× is clock, not cores. **Sharding is the fix**: the analyser
  already takes `--only` and `--port`, so four independent shards turned ~21 minutes of work into 9.5. That is a
  change worth making in `check_groove.mjs` regardless of where it runs (it would speed the local gate up too).
- **The GPU is irrelevant to this work** (no ML, no CUDA); the L4 shape is valuable for its 12 vCPU and 52 GB.
  Sharding into 6 shards × 2 genres would use more of those cores than the 4 × 3 tried here.

## Reproducing the VM from scratch

```bash
# 1. (once) fix the CLI, see above — `colab exec` does not work without it.
# 2. a payload without history (16 MB; the contents API rejects the 114 MB one):
tar --exclude=node_modules --exclude=dist --exclude=dist-mcp --exclude=scratch --exclude=.git \
    -czf /tmp/groove-src.tgz .
colab new -s gooday --gpu L4
colab upload -s gooday /tmp/groove-src.tgz /content/groove-src.tgz
colab upload -s gooday scripts/colab/bootstrap.sh /content/bootstrap.sh
# 3. run it detached (a cell longer than ~10 s fails the CLI request), then poll the log:
echo "nohup bash /content/bootstrap.sh > /content/bootstrap.log 2>&1 &" | colab console -s gooday
echo "tail -5 /content/bootstrap.log" | colab console -s gooday
```

`scripts/colab/bootstrap.sh` installs Node 22 into `/usr/local`, extracts the payload, makes the synthetic
`git` baseline (with `safe.directory`, because the shell runs as root over files owned by `ubuntu`) and runs
`npm ci` plus the unit suite as a smoke test.

**Sessions do not survive on their own.** The `gooday` session used for the measurements below was reclaimed
(404) mid-session, taking the VM filesystem with it — so treat the VM as disposable and keep the source of truth
local. `colab sessions` shows what is alive; `colab stop -s <name>` releases it deliberately.

## What the VM state was (session `gooday`)

Set up and idle: Node v22.22.2 in `/usr/local`, the repo at `/content/groove` (16 MB tarball, no history),
`node_modules` installed (`npm ci`, 552 packages, **10 s**), Playwright's Chromium headless shell downloaded,
and a synthetic git baseline so `git ls-files` works. Helper scripts live at `/content/{setup,bench,heavy,shard}.sh`
with their logs beside them.

To refresh the source after local changes, ship the changed files (or a fresh 16 MB tarball) rather than the whole
repository with history, and re-extract.
