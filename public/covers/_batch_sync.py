#!/home/crow/.venv/bin/python
"""Incremental artifact sync for the remote covers-gen run.

    fetch (delta only, via `colabgen run-fetch`) -> PIL verify -> place

Only a jpg that opens as a valid 1024x1024 JPEG is moved into
public/covers/<skin>/<genre>.jpg together with its sibling .json. Anything that
fails verification stays in the staging area and is reported, never counted.

Run it on a timer; it is idempotent (run-fetch keeps its own size manifest, so
already-fetched files are not transferred twice).
"""
import glob
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

from PIL import Image

COVERS = "/home/crow/music/groove/public/covers"
STAGING = os.path.join(COVERS, "_batch_scratch", "fetched")
RUN = "covers-gen"
SESSION = "batch"
LOG = os.path.join(COVERS, "_batch_progress.log")
SKINS = ["default", "minimal", "comic", "soviet", "sovietYears", "pixel"]


def log(line):
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(LOG, "a") as fh:
        fh.write(f"{stamp} SYNC {line}\n")
        fh.flush()
    print(f"{stamp} SYNC {line}", flush=True)



def touch_remote_marker(alive=True):
    """Tell any local runner that the detached remote loop owns the GPU."""
    marker = os.path.join(COVERS, "_batch_scratch", "REMOTE_ACTIVE")
    if alive:
        with open(marker, "w") as fh:
            fh.write(RUN)
    else:
        try:
            os.remove(marker)
        except OSError:
            pass

def run_fetch(tries=5):
    os.makedirs(STAGING, exist_ok=True)
    for i in range(1, tries + 1):
        proc = subprocess.run(
            ["colabgen", "run-fetch", "-s", SESSION, RUN, "--dest", STAGING, "--json"],
            capture_output=True, text=True, timeout=1800)
        out = (proc.stdout or "") + (proc.stderr or "")
        if proc.returncode == 0:
            try:
                idx = out.find("{")
                return json.loads(out[idx:]) if idx >= 0 else {"raw": out}
            except Exception:
                return {"raw": out[:400]}
        retryable = any(t in out for t in ("ssh to session", "429", "Already-active",
                                           "no result from the worker", "rc=255",
                                           "Connection reset", "Timeout"))
        log(f"fetch-attempt={i} rc={proc.returncode} retryable={retryable} "
            f"{out.strip().splitlines()[-1][:180] if out.strip() else ''}")
        if not retryable:
            break
        time.sleep(min(90, 20 * i))
    return None


def verify(path):
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        return False, "missing-or-empty"
    try:
        with Image.open(path) as im:
            im.load()
            if im.format != "JPEG":
                return False, f"format={im.format}"
            if im.size != (1024, 1024):
                return False, f"size={im.size}"
    except Exception as exc:
        return False, f"unreadable:{exc}"
    return True, "ok"


def main():
    res = run_fetch()
    if res is None:
        log("fetch-FAILED after retries — will retry next cycle")
        return 1
    touch_remote_marker(alive=True)
    placed = bad = 0
    for skin in SKINS:
        for jpg in sorted(glob.glob(os.path.join(STAGING, skin, "*.jpg"))):
            genre = os.path.basename(jpg)[:-4]
            ok, detail = verify(jpg)
            if not ok:
                bad += 1
                log(f"REJECT-FETCHED {skin}/{genre} {detail} (left in staging)")
                continue
            dest_dir = os.path.join(COVERS, skin)
            os.makedirs(dest_dir, exist_ok=True)
            dest = os.path.join(dest_dir, genre + ".jpg")
            tmp = dest + ".part"
            shutil.copy2(jpg, tmp)
            os.replace(tmp, dest)
            meta_src = os.path.join(STAGING, skin, genre + ".json")
            if os.path.exists(meta_src):
                mt = os.path.join(dest_dir, genre + ".json.part")
                shutil.copy2(meta_src, mt)
                os.replace(mt, os.path.join(dest_dir, genre + ".json"))
            os.remove(jpg)
            if os.path.exists(meta_src):
                os.remove(meta_src)
            placed += 1

    remote_state = {}
    pj = os.path.join(STAGING, "progress.json")
    if os.path.exists(pj):
        try:
            with open(pj) as fh:
                remote_state = json.load(fh)
        except Exception:
            pass
    counts = {s: len([f for f in os.listdir(os.path.join(COVERS, s))
                      if f.endswith(".jpg")]) for s in SKINS}
    log(f"placed={placed} bad={bad} fetched_total={res.get('fetched_count')} "
        f"unchanged={res.get('unchanged_count')} remote_done={remote_state.get('done')} "
        f"remote_failed={remote_state.get('failed')} last={remote_state.get('last')} "
        f"avg_s={remote_state.get('avg_s')} tiles={counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
