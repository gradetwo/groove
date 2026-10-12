# Cover batch — authoritative state (auto-written 2026-09-25T14:50:53Z)

GOAL: 6 skins x 159 genres = 954 covers, 1024x1024, Qwen-Image-2.1 on Colab G4.
Progress (updated 2026-09-25T15:24:59Z): 119 verified jpgs installed. GPU SESSION LOST - the `batch` runtime was reallocated as a CPU machine (torch 2.11.0+cpu, no /colab/ssh endpoint, /content/.colabgen/runs empty). The remote run `covers-gen` and its VM output are gone; 33 tiles were recovered from _batch_scratch/fetched/ (originals kept in fetched/_installed/). Stale marker moved to REMOTE_ACTIVE.stale-23:11 so a local loop can start again.

## Where things live
- final tiles:      public/covers/<skin>/<genre>.jpg      (PIL-verified 1024x1024 JPEG)
- pristine source:  public/covers/_batch_scratch/src/<skin>__<genre>.png
- rejects (kept):   public/covers/_rejected/<skin>/<genre>.jpg
- provenance json:  next to each jpg
- progress log:     public/covers/_batch_progress.log   (CHECKPOINT every 20 images)
- failures:         public/covers/_batch_failed.txt
- review artifacts: public/covers/_review/ (triage json + contact sheets per skin)
- art direction:    public/covers/ART_DIRECTION.md
- runner code:      public/covers/_batch_runner.py, _batch_reviewd.py, _batch_data.py, _batch_origins_A.py

## How to resume (idempotent: skips verified jpgs, re-derives identical seeds)
1. colabgen status -s batch          # expect RTX PRO 6000 + non-empty warm + drive mounted
2. colabgen up -s batch --gpu g4 --warm qwen-image-2.1     # only if the session is gone
3. if the model fails to import (numpy/_slice, _Ink, GenerationMixin): colabgen restart -s batch && colabgen warm -s batch qwen-image-2.1
4. /home/crow/.venv/bin/python public/covers/_batch_runner.py
   /home/crow/.venv/bin/python public/covers/_batch_reviewd.py

## Rules that must not be broken
- review every tile: R1 genre fit, R2 skin fit, R3 craft, R4 no lazy cliche -> _rejected/ + regenerate (max 2 attempts)
- R5 origin/history anchor is a BONUS, prefer it when choosing between candidates
- three durable copies per tile (local jpg + local PNG + remote /content/out and MyDrive/DSH)
- pull artifacts back INCREMENTALLY, never only at the end
- never colabgen down/restart/warm/serve from inside the loop; report instead
- never pipe long colabgen commands through `tail` (it buffers and hides errors)
- a fresh process must load models after any dependency install (kernel staleness caused two batch deaths)

## Cost
rate 8.90 units/hr (G4). Baseline at resume: 242.16 units.

## Lessons from this run (do not relearn the hard way)
- Colab allows ONE ssh connection per runtime. Concurrent ssh users collide with `HTTP 429 Already-active SSH session` or `rc=255`; colabgen then silently falls back to the notebook kernel. Stale local `colab ssh --proxy-mode` processes hold the slot: find them and kill by EXPLICIT PID (never `pkill -f` - the pattern matches your own shell).
- Transport failures (`no result from the worker server`, rc=255, 429) are RETRYABLE. They must never be recorded as tile failures - retry with backoff (20/45/90s) before counting anything.
- GPU-lock starvation: the reviewd held the model lock across a whole review wave and the runner idled for minutes at ~1% CPU. The lock must cover ONLY the regeneration call; triage, contact sheets and PIL checks are CPU-only and belong outside the lock. If generation stalls while processes are alive, that is the first thing to check.
- Dependency installs must happen in a fresh process, never in the kernel that already imported the packages (two batch deaths: `_slice`/`_Ink`/`GenerationMixin`). Recovery: `colabgen restart -s batch && colabgen warm -s batch qwen-image-2.1`.
- `colabgen` must never let a resolver swap torch on a GPU VM (it did once: cu128 -> cpu, GPU detached). Constraints now pin torch and a subprocess verifies `cuda.is_available()`.

## Resume after the GPU loss (state as of the incident)
1. The old G4 is gone. Create a FRESH runtime that has the /colab/ssh endpoint: `colab new` (or `colabgen up -s batch2 --gpu g4`). A runtime reallocated as CPU has no ssh endpoint and cannot be used - verify with `colabgen status -s <name>` (expect RTX PRO 6000 and backend=server, not `exec`).
2. Warm: `colabgen warm -s <name> qwen-image-2.1`. If imports break: `colabgen restart -s <name> && colabgen warm ...`.
3. Drive: `colabgen drive mount -s <name> --agent`, send the URL to the user, then `colabgen drive confirm -s <name>`.
4. Resume the loops locally (they skip verified jpgs and re-derive identical seeds):
   /home/crow/.venv/bin/python _batch_runner.py
   /home/crow/.venv/bin/python _batch_reviewd.py
   If _batch_runner.py refuses to start with `REFUSING ... remote run ... is active`, a stale marker is present: move _batch_scratch/REMOTE_ACTIVE aside (do not delete - it tells you which remote run existed).
5. If you use the remote-run path instead (`colabgen submit -s <name> ...`), fetch with `colabgen run-fetch -s <name> <run> --dest _batch_scratch/fetched` and then run `_batch_sync.py` to install verified tiles into covers/<skin>/.
6. Verify tiles land in covers/<skin>/ with PIL (1024x1024) before counting them; keep rejects in _rejected/.
