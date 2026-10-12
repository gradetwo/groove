# Cover production

Everything that *makes* the covers lives here, and nothing here is published. It used to live in `public/covers/`, which meant
the build copied it into `dist/covers` and every deploy uploaded it: **794 MB** under `dist/covers` where about **285 MB** is
artwork — 410 MB of `_batch_scratch`, 96 MB of `_rejected`/`_review`/`_installed`, triage JSON, logs, state files, the Python
batch, and `__pycache__`. The owner found it by looking at `dist`.

## What is where

| Path | What it is |
|---|---|
| `_batch_*.py`, `_regen*_remote.py`, `_build_remote.py` | the generation/remote-review pipeline |
| `_batch_*.sh`, `_status.sh` | its drivers |
| `_BATCH_STATE.md`, `_batch_failed.txt`, `*.log`, `*.out` | state and logs |
| `ART_DIRECTION.md`, `CREDITS.md` | how the art is directed; where the photographs come from |
| `_review/`, `_rejected/`, `_installed/` | triage and staging output |
| `<skin>/<genre>.json` | per-image metadata (seed, prompt, source URL, verdict) |

## What is published

Only artwork, under `public/covers/`:

* `<genre>.jpg` — the shared image,
* `<skin>/<genre>.jpg` — one per skin (`default`, `minimal`, `comic`, `soviet`, `sovietYears`, `pixel`),
* `_thumbs/<genre>.jpg` and `_thumbs/<skin>/<genre>.jpg` — the 256 px set the library actually draws, built by
  `node scripts/make_cover_thumbs.mjs`,
* `CREDITS.md` — the attribution the artwork ships with.

## The gate

`node scripts/check_covers_payload.mjs` (also `npm run check:covers`) allows exactly those four shapes and fails on anything
else. It runs in `npm run verify` **and inside `scripts/deploy.mjs`**, so a stray file cannot reach the network even when a
deploy is run without verify. `src/test/coversPayload.test.ts` runs it against `public/covers` so the mistake is caught before a
build rather than in `dist` afterwards.
