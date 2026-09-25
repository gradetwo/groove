#!/home/crow/.venv/bin/python
"""Incremental artifact sync for the remote covers-gen run.

    list (1 ssh) -> tar the delta on the VM (1 ssh) -> scp ONE archive -> untar
    -> PIL verify -> place -> drop the temp archive (1 ssh)

Using a single tar+scp per cycle (instead of one scp per file) matters because
Colab gives this runtime ONE ssh slot, and every scp opens another ssh
connection through the proxy.  All ssh calls use exponential backoff and treat
429 / rc=255 / "Already-active SSH session" as retryable, so a busy slot delays a
cycle rather than failing it.

Only a jpg that opens as a valid 1024x1024 JPEG is moved into
public/covers/<skin>/<genre>.jpg together with its sibling .json. Anything that
fails verification stays in staging and is reported; nothing is ever deleted.
"""
import json
import os
import shlex
import subprocess
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, "/home/crow/skills/colabgen")
from colabgen import ssh as sm  # noqa: E402
from PIL import Image  # noqa: E402

COVERS = "/home/crow/music/groove/public/covers"
STAGING = os.path.join(COVERS, "_batch_scratch", "fetched")
MANIFEST = os.path.join(COVERS, "_batch_scratch", "sync_manifest.json")
LOG = os.path.join(COVERS, "_batch_progress.log")
RUN = "covers-gen"
SESSION = "batch"
REMOTE_DIR = f"/content/.colabgen/runs/{RUN}"
ARCHIVE = "_sync.tar.gz"
SKINS = ["default", "minimal", "comic", "soviet", "sovietYears", "pixel"]
CONTROL = {"script.py", "run.pid", "run.json"}
MAX_FILES_PER_CYCLE = 400
BACKOFF = (20, 45, 90, 180, 180, 180, 180, 180, 180, 180)


def log(line):
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(LOG, "a") as fh:
        fh.write(f"{stamp} SYNC {line}\n")
        fh.flush()
    print(f"{stamp} SYNC {line}", flush=True)


def ssh_retry(cmd, timeout=300):
    """Run one ssh command, retrying transient slot contention for ~25 min."""
    last = (255, "")
    for i, delay in enumerate(BACKOFF):
        rc, out = sm.ssh_run(SESSION, cmd, timeout=timeout, with_cuda_env=False)
        if rc == 0:
            if i:
                log(f"ssh-recovered after {i} retries")
            return rc, out
        last = (rc, out)
        tail = " ".join((out or "").split())[-170:]
        log(f"ssh-retry {i+1}/{len(BACKOFF)} rc={rc} sleep={delay}s {tail}")
        time.sleep(delay)
    return last


def scp_retry(remote, local):
    last = (255, "")
    for i, delay in enumerate(BACKOFF):
        rc, out = sm.scp_get(SESSION, remote, local, timeout=900)
        if rc == 0 and os.path.exists(local) and os.path.getsize(local) > 0:
            return rc, out
        last = (rc, out)
        tail = " ".join((out or "").split())[-170:]
        log(f"scp-retry {i+1}/{len(BACKOFF)} rc={rc} sleep={delay}s {tail}")
        time.sleep(delay)
    return last


def load_manifest():
    try:
        with open(MANIFEST) as fh:
            return json.load(fh)
    except Exception:
        return {}


def save_manifest(man):
    tmp = MANIFEST + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(man, fh)
    os.replace(tmp, MANIFEST)


def remote_listing():
    rc, out = ssh_retry(
        f"cd {REMOTE_DIR} 2>/dev/null || exit 3; "
        "find . -type f -printf '%P\\t%s\\t%T@\\n'", timeout=300)
    if rc != 0:
        return None
    files = {}
    for line in (out or "").splitlines():
        parts = line.rstrip("\n").split("\t")
        if len(parts) != 3:
            continue
        rel, size, mtime = parts
        if rel in CONTROL or rel.endswith(".part") or rel == ARCHIVE:
            continue
        try:
            files[rel] = (int(size), float(mtime))
        except ValueError:
            continue
    return files


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


def touch_remote_marker(alive=True):
    marker = os.path.join(COVERS, "_batch_scratch", "REMOTE_ACTIVE")
    if alive:
        with open(marker, "w") as fh:
            fh.write(RUN)
    else:
        try:
            os.remove(marker)
        except OSError:
            pass


def remote_status():
    rc, out = ssh_retry(
        f"pid=$(cat {REMOTE_DIR}/run.pid 2>/dev/null); "
        "kill -0 $pid 2>/dev/null && echo ALIVE || echo DEAD; "
        f"echo jpgs=$(find {REMOTE_DIR} -name '*.jpg' | wc -l)", timeout=240)
    if rc != 0:
        return None, None
    alive = "ALIVE" in (out or "")
    n = None
    for tok in (out or "").split():
        if tok.startswith("jpgs="):
            n = tok.split("=", 1)[1]
    return alive, n


def main():
    os.makedirs(STAGING, exist_ok=True)
    man = load_manifest()

    remote = remote_listing()
    if remote is None:
        log("listing-FAILED after full backoff — will retry next cycle")
        return 1
    touch_remote_marker(alive=True)

    new, changed = [], []
    for rel, (size, mtime) in sorted(remote.items()):
        prev = man.get(rel)
        if prev is None:
            new.append(rel)
        elif int(prev.get("size", -1)) != size or abs(float(prev.get("mtime", 0)) - mtime) > 0.5:
            changed.append(rel)

    delta = (new + changed)[:MAX_FILES_PER_CYCLE]
    placed = bad = 0
    if delta:
        listing = " ".join(shlex.quote(r) for r in delta)
        rc, out = ssh_retry(
            f"cd {shlex.quote(REMOTE_DIR)} || exit 3; tar czf {ARCHIVE} -- {listing} && "
            f"stat -c %s {ARCHIVE}", timeout=900)
        if rc != 0:
            log(f"tar-FAILED delta={len(delta)} — will retry next cycle")
        else:
            local_arc = os.path.join(STAGING, ARCHIVE)
            rc2, out2 = scp_retry(f"{REMOTE_DIR}/{ARCHIVE}", local_arc)
            if rc2 != 0:
                log(f"archive-scp-FAILED delta={len(delta)} — will retry next cycle")
            else:
                proc = subprocess.run(["tar", "xzf", local_arc, "-C", STAGING],
                                      capture_output=True, text=True)
                if proc.returncode != 0:
                    log(f"untar-FAILED {proc.stderr.strip()[:200]}")
                else:
                    for rel in delta:
                        size, mtime = remote[rel]
                        man[rel] = {"size": size, "mtime": mtime, "fetched_at": time.time()}
                    save_manifest(man)   # persist per cycle: a crash keeps progress
                    log(f"tar-ok files={len(delta)} archive_bytes={os.path.getsize(local_arc)}")
                os.remove(local_arc)
            ssh_retry(f"rm -f {shlex.quote(REMOTE_DIR)}/{ARCHIVE}", timeout=180)

    for skin in SKINS:
        sdir = os.path.join(STAGING, skin)
        if not os.path.isdir(sdir):
            continue
        for name in sorted(os.listdir(sdir)):
            if not name.endswith(".jpg"):
                continue
            genre = name[:-4]
            src = os.path.join(sdir, name)
            ok, detail = verify(src)
            if not ok:
                bad += 1
                log(f"REJECT-FETCHED {skin}/{genre} {detail} (left in staging)")
                continue
            dest_dir = os.path.join(COVERS, skin)
            os.makedirs(dest_dir, exist_ok=True)
            tmp = os.path.join(dest_dir, name + ".part")
            shutil.copy2(src, tmp)
            os.replace(tmp, os.path.join(dest_dir, name))
            meta_src = os.path.join(sdir, genre + ".json")
            if os.path.exists(meta_src):
                mt = os.path.join(dest_dir, genre + ".json.part")
                shutil.copy2(meta_src, mt)
                os.replace(mt, os.path.join(dest_dir, genre + ".json"))
                os.remove(meta_src)
            os.remove(src)
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
    alive, remote_n = remote_status()
    log(f"placed={placed} bad={bad} updated={len(changed)} new={len(new)} "
        f"remote_done={remote_state.get('done')} remote_failed={remote_state.get('failed')} "
        f"remote_jpgs={remote_n} remote_alive={alive} avg_s={remote_state.get('avg_s')} "
        f"last={remote_state.get('last')} local_total={sum(counts.values())} tiles={counts}")
    if alive is False:
        touch_remote_marker(alive=False)
        log("remote run no longer alive — cleared REMOTE_ACTIVE marker")
    return 0


if __name__ == "__main__":
    sys.exit(main())
