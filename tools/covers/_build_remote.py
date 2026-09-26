#!/home/crow/.venv/bin/python
"""Build `_batch_remote.py`: a self-contained remote generation loop.

The generated script runs INSIDE the VM as a detached colabgen run. It talks to
the already-warm worker over localhost HTTP (`POST /run`), so there is no
per-image CLI round trip, no prompt upload and no PNG download: generation is
~11 s of pure GPU time and the finished tile is written straight into the run
directory, which `colabgen run-fetch` pulls back incrementally.

Data (genres, origins, templates, seeds) is inlined from the local modules so the
remote prompts are byte-identical to the local runner's.
"""
import importlib.util
import json
import os
import sys

COVERS = "/home/crow/music/groove/public/covers"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


runner = load("_batch_runner", os.path.join(COVERS, "_batch_runner.py"))
data = load("_batch_data", os.path.join(COVERS, "_batch_data.py"))

with open("/tmp/cg_payload_parts.json") as fh:
    parts = json.load(fh)

# --- skip list: every (skin, genre) whose local jpg already verifies ---------
skip = []
for skin in runner.SKINS:
    d = os.path.join(COVERS, skin)
    if not os.path.isdir(d):
        continue
    for f in sorted(os.listdir(d)):
        if not f.endswith(".jpg"):
            continue
        ok, _ = runner.verify_image(os.path.join(d, f))
        if ok:
            skip.append(f"{skin}|{f[:-4]}")
print(f"skip list: {len(skip)} verified local tiles", file=sys.stderr)

seeds = {f"{s}|{g}": runner.stable_seed(s, g) for s in runner.SKINS for g in data.GENRES}

DATA = {
    "skins": runner.SKINS,
    "genres": {g: list(v) for g, v in data.GENRES.items()},
    "origins": data.ORIGINS,
    "overrides": data.SKIN_SUBJECT_OVERRIDE,
    "templates": runner.TEMPLATES,
    "negative": runner.SHARED_NEGATIVE,
    "ground": {k: list(v) for k, v in runner.GROUND.items()},
    "pixel_px": runner.PIXEL_PX,
    "seeds": seeds,
    "skip": sorted(skip),
    "profile": parts["profile"],
    "cfg": parts["cfg"],
}

REMOTE = r'''#!/usr/bin/env python3
"""Remote genre-cover generation loop (runs on the colab VM as a detached run).

Modes:
  generate                 all 6 skins x 159 genres, resumable, skip-list aware
  regen "<spec> [<spec>...]"  regenerate specific tiles with tightened prompts
                             spec = skin:genre[:R1,R4][:hint text]

Writes tiles into the current directory (the colabgen run dir) as
<skin>/<genre>.jpg + <skin>/<genre>.json so `colabgen run-fetch` can pull them
incrementally, and keeps progress.json / batch.log / failures.txt there too.
"""
import argparse
import fnmatch
import io
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import _DATA_JSON_  # replaced at build time
PY = None
'''

# The remote body is assembled as a normal python source string with the data
# injected as a JSON literal.
REMOTE_BODY = r'''
import argparse
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone


def log(line):
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"{stamp} {line}", flush=True)


def fnv1a(text):
    h = 2166136261
    for byte in text.encode("utf-8"):
        h ^= byte
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def stable_seed(skin, genre):
    return 1000 + 137 * SKINS.index(skin) + fnv1a(genre) % 1000


def build_prompt(skin, genre, subject, character, origin=None):
    prompt = (TEMPLATES[skin]
              .replace("{SUBJECT}", subject)
              .replace("{GENRE}", genre.replace("-", " "))
              .replace("{CHARACTER}", character))
    if origin:
        prompt = prompt.replace(". ", f", drawing on {origin}. ", 1)
    return prompt


REASON_INJECTION = {
    "R1": ("The genre's own instruments, venue and era must be unmistakable: it must read as this "
           "specific music to a listener of it, not as generic music imagery."),
    "R2": ("Hold the skin's medium and palette exactly: use only the skin's ground, ink and one "
           "accent, and do not drift into another medium."),
    "R3": ("One dominant silhouette, clean deliberate framing, no lettering of any kind, no "
           "watermark or fine print, no melted or impossible geometry; the tile must read at 120px."),
    "R4": ("Avoid the obvious stock cliche for this genre; choose a specific physical object or "
           "place instead of a floating instrument or a generic swirl."),
    "R5": ("Add one concrete origin anchor - the scene's city or region, its defining decade, and "
           "its signature equipment, venue or artefact - as one element of the picture, not a "
           "postcard."),
}


def build_regen_prompt(skin, genre, subject, character, origin, reasons):
    base = build_prompt(skin, genre, subject, character, origin)
    notes = " ".join(REASON_INJECTION[r] for r in reasons if r in REASON_INJECTION)
    return f"{base} {notes} Render only the physical medium and materials named above."


def subject_for(skin, genre):
    subject, character = GENRES[genre]
    over = OVERRIDES.get(skin, {})
    return over.get(genre, subject), character


# ---------------------------------------------------------------- worker client
WORKER = "http://127.0.0.1:8787/run"


def worker_run(task, timeout=1800):
    """POST one run task to the local worker and return its result dict."""
    payload = {"action": "run", "profile": PROFILE, "task": task,
               "cfg": CFG, "deps": None}
    body = json.dumps(payload).encode()
    req = urllib.request.Request(WORKER, data=body,
                                 headers={"Content-Type": "application/json"})
    result = None
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        for raw in resp:
            line = raw.decode("utf-8", "replace").strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except Exception:
                continue
            if msg.get("type") == "result":
                result = msg.get("result")
    if result is None:
        raise RuntimeError("worker returned no result")
    if not result.get("ok"):
        raise RuntimeError(str(result.get("error"))[:400])
    return result


# ------------------------------------------------------------------ postprocess
def finalise(png_path, jpg_path, skin):
    from PIL import Image
    with Image.open(png_path) as im:
        im.load()
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, tuple(GROUND[skin]))
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert("RGB")
        if im.size != (1024, 1024):
            im = im.resize((1024, 1024), Image.LANCZOS)
        if skin == "pixel":
            im = (im.resize((PIXEL_PX, PIXEL_PX), Image.NEAREST)
                    .resize((1024, 1024), Image.NEAREST))
        tmp = jpg_path + ".part"
        im.save(tmp, "JPEG", quality=92)
    os.replace(tmp, jpg_path)


def verify_local(path):
    from PIL import Image
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        return False, "missing-or-empty"
    try:
        with Image.open(path) as im:
            im.load()
            if im.format != "JPEG":
                return False, "not-jpeg"
            if im.size != (1024, 1024):
                return False, f"size={im.size}"
    except Exception as exc:
        return False, f"unreadable:{exc}"
    return True, "ok"


def write_meta(path, skin, genre, seed, prompt, origin, review=None):
    payload = {
        "model": "qwen-image-2.1", "preset": "quality", "size": "1024x1024",
        "steps": 40, "seed": seed, "skin": skin, "genre": genre,
        "prompt": prompt, "origin": origin,
        "negative_prompt": SHARED_NEGATIVE,
        "postprocess": "pixelate_160_nearest" if skin == "pixel" else None,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    if review:
        payload["review"] = review
    tmp = path + ".part"
    with open(tmp, "w") as fh:
        json.dump(payload, fh, indent=2)
    os.replace(tmp, path)


def cleanup_worker_png(path):
    """Keep the /content/out PNG by default: it is one of the three durable copies
    (VM /content/out, Drive MyDrive/DSH/<job>, and the fetched local jpg)."""
    if os.environ.get("CG_CLEAN_PNG") != "1":
        return
    try:
        if path and os.path.exists(path) and "/content/out/" in path:
            os.remove(path)
    except Exception:
        pass


def generate_one(skin, genre, seed, prompt, origin, attempt_tag="", review=None,
                 keep_png_dir=None):
    """One tile: worker -> PNG -> JPEG + JSON. Returns (ok, seconds, detail)."""
    t0 = time.time()
    stem = f"{skin}__{genre}"
    job = f"{skin}-{genre}{attempt_tag}"
    task = {
        "kind": "image", "job": job, "prompt": prompt,
        "negative_prompt": SHARED_NEGATIVE, "steps": 40, "seed": seed,
        "aspect": None, "width": 1024, "height": 1024, "num_images": 1,
        "offload": None, "out_name": stem,
    }
    try:
        res = worker_run(task)
    except Exception as exc:
        return False, time.time() - t0, f"worker:{type(exc).__name__}:{str(exc)[:200]}"
    files = res.get("files") or []
    if not files:
        return False, time.time() - t0, "no-files-in-result"
    png = files[0]
    jpg = os.path.join(skin, genre + ".jpg")
    os.makedirs(skin, exist_ok=True)
    try:
        finalise(png, jpg, skin)
    except Exception as exc:
        return False, time.time() - t0, f"postprocess:{type(exc).__name__}:{str(exc)[:200]}"
    ok, detail = verify_local(jpg)
    if not ok:
        return False, time.time() - t0, f"verify:{detail}"
    write_meta(os.path.join(skin, genre + ".json"), skin, genre, seed, prompt, origin,
               review=review)
    if keep_png_dir:
        try:
            import shutil
            os.makedirs(keep_png_dir, exist_ok=True)
            shutil.copy2(png, os.path.join(keep_png_dir, skin + "__" + genre + ".png"))
        except Exception:
            pass
    cleanup_worker_png(png)
    return True, time.time() - t0, "ok"


def save_progress(state):
    tmp = "progress.json.part"
    with open(tmp, "w") as fh:
        json.dump(state, fh, indent=2)
    os.replace(tmp, "progress.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["generate", "regen"])
    ap.add_argument("specs", nargs="*")
    ap.add_argument("--skins", default="")
    ap.add_argument("--keep-png", action="store_true")
    args = ap.parse_args()

    keep = os.path.join("src_png") if args.keep_png else None
    state = {"started": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
             "mode": args.mode, "done": 0, "skipped": 0, "failed": 0, "work": []}
    if os.path.exists("progress.json"):
        try:
            with open("progress.json") as fh:
                prev = json.load(fh)
            state["work"] = prev.get("work", [])
        except Exception:
            pass

    if args.mode == "regen":
        items = []
        for spec in args.specs:
            bits = spec.split(":", 3)
            if len(bits) < 2:
                log(f"REGEN-BAD-SPEC {spec}")
                continue
            skin, genre = bits[0], bits[1]
            reasons = [r for r in (bits[2].split(",") if len(bits) > 2 and bits[2] else ["R5"]) if r]
            hint = bits[3] if len(bits) > 3 else ""
            items.append((skin, genre, reasons, hint, True))
        log(f"REGEN-START tiles={len(items)}")
    else:
        skins = [s for s in (args.skins.split(",") if args.skins else SKINS) if s]
        items = []
        for skin in skins:
            for genre in sorted(GENRES):
                if f"{skin}|{genre}" in SKIP:
                    continue
                if os.path.exists(os.path.join(skin, genre + ".jpg")):
                    ok, _ = verify_local(os.path.join(skin, genre + ".jpg"))
                    if ok:
                        continue
                items.append((skin, genre, [], "", False))
        log(f"GENERATE-START tiles={len(items)} skip_list={len(SKIP)}")

    batch_start = time.time()
    times = []
    for n, (skin, genre, reasons, hint, is_regen) in enumerate(items, 1):
        seed = SEEDS.get(f"{skin}|{genre}") or stable_seed(skin, genre)
        origin = ORIGINS.get(genre)
        subject, character = subject_for(skin, genre)
        if is_regen:
            prompt = build_regen_prompt(skin, genre, subject, character, origin, reasons)
            if hint:
                prompt = f"{prompt} {hint}"
            review = {"decision": "regenerated_after_reject", "reasons": reasons}
            tag = "-r"
        else:
            prompt = build_prompt(skin, genre, subject, character, origin)
            review = None
            tag = ""

        ok = False
        detail = ""
        secs = 0.0
        for attempt in (1, 2):
            ok, secs, detail = generate_one(skin, genre, seed, prompt, origin,
                                            attempt_tag=f"{tag}-a{attempt}",
                                            review=review, keep_png_dir=keep)
            if ok:
                break
            log(f"FAIL {skin} {genre} attempt={attempt} seed={seed} {detail}")
            time.sleep(5)
        if ok:
            state["done"] += 1
            times.append(secs)
            entry = {"skin": skin, "genre": genre, "ok": True, "seconds": round(secs, 1),
                     "seed": seed, "reasons": reasons}
            log(f"OK {skin} {genre} seconds={secs:.1f} seed={seed} reasons={','.join(reasons) or '-'}")
        else:
            state["failed"] += 1
            entry = {"skin": skin, "genre": genre, "ok": False, "seconds": round(secs, 1),
                     "seed": seed, "detail": detail, "reasons": reasons}
            log(f"FAILED {skin} {genre} seed={seed} {detail}")
            with open("failures.txt", "a") as fh:
                fh.write(f"{skin}/{genre}\tseed={seed}\treasons={','.join(reasons)}\t{detail}\n")
        state["work"].append(entry)

        if n % 20 == 0 or n == len(items):
            avg = sum(times) / len(times) if times else 0
            elapsed = (time.time() - batch_start) / 60
            state["avg_s"] = round(avg, 1)
            state["elapsed_min"] = round(elapsed, 1)
            state["last"] = f"{skin}/{genre}"
            save_progress(state)
            log(f"CHECKPOINT done={state['done']} failed={state['failed']} "
                f"n={n}/{len(items)} elapsed_min={elapsed:.1f} avg_s={avg:.1f}")

    save_progress(state)
    avg = sum(times) / len(times) if times else 0
    log(f"REMOTE-END mode={args.mode} done={state['done']} failed={state['failed']} "
        f"elapsed_min={(time.time()-batch_start)/60:.1f} avg_s={avg:.1f}")


if __name__ == "__main__":
    main()
'''

payload = f'''
import json as _json
_DATA = _json.loads(r"""{json.dumps(DATA)}""")
SKINS = _DATA["skins"]
GENRES = _DATA["genres"]
ORIGINS = _DATA["origins"]
OVERRIDES = _DATA["overrides"]
TEMPLATES = _DATA["templates"]
SHARED_NEGATIVE = _DATA["negative"]
GROUND = _DATA["ground"]
PIXEL_PX = _DATA["pixel_px"]
SEEDS = _DATA["seeds"]
SKIP = set(_DATA["skip"])
PROFILE = _DATA["profile"]
CFG = _DATA["cfg"]
'''

out = "/home/crow/music/groove/public/covers/_batch_remote.py"
with open(out, "w") as fh:
    fh.write("#!/usr/bin/env python3\n")
    fh.write('"""Generated by _build_remote.py - do not edit by hand."""\n')
    fh.write(payload)
    fh.write(REMOTE_BODY)
print("wrote", out, os.path.getsize(out), "bytes")
