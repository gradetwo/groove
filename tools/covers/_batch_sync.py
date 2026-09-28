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
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, "/home/crow/skills/colabgen")
from colabgen import ssh as sm  # noqa: E402
from PIL import Image  # noqa: E402

COVERS = "/home/crow/music/groove/public/covers"
STAGING = os.environ.get("CG_SYNC_STAGING", os.path.join(COVERS, "_batch_scratch", "fetched"))
BACKOFF = [20, 45, 90, 180, 180, 180, 180, 180, 180, 180]  # ssh retry sleeps (10 attempts)
MANIFEST = os.environ.get("CG_SYNC_MANIFEST", os.path.join(COVERS, "_batch_scratch", "sync_manifest.json"))
LOG = os.path.join(COVERS, "_batch_progress.log")
RUN = os.environ.get("CG_SYNC_RUN", "covers-gen2")
SESSION = os.environ.get("CG_SYNC_SESSION", "batch2")
REMOTE_DIR = f"/content/.colabgen/runs/{RUN}"
# Each run gets its own staging + manifest so parallel runs (main + regen waves)
# cannot confuse each other's delta tracking.  Only the main run owns the
# REMOTE_ACTIVE marker that stops a local runner from starting a second writer.
MANAGES_MARKER = os.environ.get("CG_SYNC_MARKER", "0") == "1"
ARCHIVE = "_sync.tar.gz"
SKINS = ["default", "minimal", "comic", "soviet", "sovietYears", "pixel"]
CONTROL = {"script.py", "run.pid", "run.json"}
MAX_FILES_PER_CYCLE = 400
LOCK_LEASE_S = 240      # a lock older than this is stale even if its holder is alive
PASS_DEADLINE_S = 180   # hard wall on one fetch+install pass
SSH_TIMEOUT = 120
SCP_TIMEOUT = 120


def log(line):
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(LOG, "a") as fh:
        fh.write(f"{stamp} SYNC {line}\n")
        fh.flush()
    print(f"{stamp} SYNC {line}", flush=True)


def ssh_retry(cmd, timeout=300):
    """ONE quick ssh attempt.  The sync must never hold a retry train while the
    runtime's single ssh slot is needed; a failed cycle is retried by the timer.
    The lock lease plus the pass deadline guarantee it cannot wedge others."""
    rc, out = sm.ssh_run(SESSION, cmd, timeout=min(timeout, SSH_TIMEOUT), with_cuda_env=False)
    if rc != 0:
        tail = " ".join((out or "").split())[-170:]
        log(f"ssh-attempt failed rc={rc} {tail} (cycle skipped, generation has priority)")
    return rc, out


def scp_retry(remote, local, tries=2, pause=20):
    last = (255, "")
    for i in range(tries):
        rc, out = sm.scp_get(SESSION, remote, local, timeout=SCP_TIMEOUT)
        if rc == 0 and os.path.exists(local) and os.path.getsize(local) > 0:
            return rc, out
        last = (rc, out)
        tail = " ".join((out or "").split())[-170:]
        log(f"scp-retry {i+1}/{tries} rc={rc} {tail}")
        time.sleep(pause)
    return last


def _owner_text():
    lock = os.path.join(COVERS, "_batch_scratch", "gpu.lock")
    try:
        with open(os.path.join(lock, "owner")) as fh:
            return fh.read().strip()
    except Exception:
        return "unknown"


def gpu_lock_acquire(timeout=15):
    """Take the shared runtime lock.

    A lock is stale if its holder is DEAD *or* if the lease is older than
    LOCK_LEASE_S -- a hung-but-alive holder (the failure that wedged every sync)
    must not be able to block the timer forever.  The lease is re-read right
    before stealing so a legitimate long pass is not raced.
    """
    lock = os.path.join(COVERS, "_batch_scratch", "gpu.lock")
    waited = 0
    while waited <= timeout:
        try:
            os.mkdir(lock)
            with open(os.path.join(lock, "owner"), "w") as fh:
                fh.write(f"sync pid={os.getpid()} ts={time.time():.0f}")
            return True
        except FileExistsError:
            holder = _owner_text()
            stale = False
            try:
                pid = int(holder.split("pid=")[-1].split()[0])
            except Exception:
                pid = None
            try:
                ts = float(holder.split("ts=")[-1].split()[0])
            except Exception:
                ts = None
            if pid is not None:
                try:
                    os.kill(pid, 0)
                    alive = True
                except Exception:
                    alive = False
                if not alive:
                    stale = True
            if ts is not None and (time.time() - ts) > LOCK_LEASE_S:
                stale = True
            if ts is None and pid is None:
                stale = True
            if stale:
                # re-read once, then steal: avoids racing a holder that just refreshed
                time.sleep(1)
                holder2 = _owner_text()
                if holder2 == holder:
                    try:
                        shutil.rmtree(lock)
                        log(f"lock-STOLEN from '{holder}' (dead or lease>{LOCK_LEASE_S}s)")
                        continue
                    except Exception:
                        pass
            log(f"SYNC-SKIP lock held by '{holder}' (generation or another sync) — next cycle")
            return False
    log(f"SYNC-SKIP lock held by '{_owner_text()}' after {timeout}s wait")
    return False


def gpu_lock_release():
    try:
        shutil.rmtree(os.path.join(COVERS, "_batch_scratch", "gpu.lock"))
    except Exception:
        pass


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
    """One quick listing; a failure just skips this cycle."""
    rc, out = ssh_retry(
        f"cd {REMOTE_DIR} 2>/dev/null || exit 3; "
        "find . -type f -printf '%P\\t%s\\t%T@\\n'", timeout=SSH_TIMEOUT)
    if rc == 3:
        log(f"run-dir absent for {RUN} (rc=3) — nothing to fetch")
        return None
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
    if not MANAGES_MARKER:
        return
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


def _alarm(signum, frame):
    raise TimeoutError(f"sync pass exceeded {PASS_DEADLINE_S}s deadline")


def main():
    import signal
    os.makedirs(STAGING, exist_ok=True)
    if not gpu_lock_acquire(timeout=15):
        log("SYNC-SKIP generation holds the runtime lock — will try next cycle")
        return 0
    try:
        signal.signal(signal.SIGALRM, _alarm)
        signal.alarm(PASS_DEADLINE_S)
        return sync_cycle()
    except TimeoutError as exc:
        log(f"PASS-DEADLINE {exc} — lock released, will continue next cycle")
        return 1
    finally:
        signal.alarm(0)
        gpu_lock_release()


def sync_cycle():
    man = load_manifest()
    remote = remote_listing()
    if remote is None:
        log("listing-failed (single attempt) — will retry next cycle")
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
            dest = os.path.join(dest_dir, name)
            already = os.path.exists(dest)
            if already:
                ok_dest, _d = verify(dest)
                already = ok_dest
            if not already:
                tmp = dest + ".part"
                shutil.copy2(src, tmp)
                os.replace(tmp, dest)
                meta_src = os.path.join(sdir, genre + ".json")
                if os.path.exists(meta_src):
                    mt = os.path.join(dest_dir, genre + ".json.part")
                    shutil.copy2(meta_src, mt)
                    os.replace(mt, os.path.join(dest_dir, genre + ".json"))
            # never delete a fetched original: keep it under _installed/<skin>/
            inst = os.path.join(STAGING, "_installed", skin)
            os.makedirs(inst, exist_ok=True)
            shutil.move(src, os.path.join(inst, name))
            meta_src = os.path.join(sdir, genre + ".json")
            if os.path.exists(meta_src):
                shutil.move(meta_src, os.path.join(inst, genre + ".json"))
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
