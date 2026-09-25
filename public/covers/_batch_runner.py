#!/home/crow/.venv/bin/python
"""Full genre-cover batch for the groove app (6 skins x 159 genres).

Resumable: any (skin, genre) whose local .jpg already verifies is skipped
before any GPU work, and seeds are re-derived deterministically, so a restart
reproduces the same image.

Usage:
  python3 _batch_runner.py            # run to completion
  python3 _batch_runner.py --skins default,minimal
  python3 _batch_runner.py --verify-only
"""
import argparse
import hashlib
import io
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from PIL import Image

COVERS = "/home/crow/music/groove/public/covers"
SCRATCH = "/home/crow/music/groove/public/covers/_batch_scratch"
SRC_DIR = os.path.join(SCRATCH, "src")
GENLOG_DIR = os.path.join(SCRATCH, "genlogs")
PROGRESS = os.path.join(COVERS, "_batch_progress.log")
FAILED = os.path.join(COVERS, "_batch_failed.txt")
MODEL = "qwen-image-2.1"
MODEL_SLUG = "qwen-image-2.1"
PRESET = "quality"
STEPS = 40
SIZE = "1024x1024"
SESSION = "batch"
PIXEL_PX = 160
CHECKPOINT_EVERY = 20

SKINS = ["default", "minimal", "comic", "soviet", "sovietYears", "pixel"]

# Page ground colour per skin, used to flatten the generator's RGBA output.
GROUND = {
    "default": (11, 11, 20),
    "minimal": (250, 250, 250),
    "comic": (244, 233, 210),
    "soviet": (27, 30, 33),
    "sovietYears": (244, 241, 225),
    "pixel": (16, 18, 28),
}

SHARED_NEGATIVE = (
    "text, letters, words, typography, logo, watermark, signature, small print, "
    "fine print, corner mark, caption, UI, screenshot, frame, border, photograph of a "
    "real person, celebrity, album cover, brand, clipart, flat vector icon, stock photo, "
    "generic corporate imagery, floating geometric shapes, plastic 3D render, "
    "oversaturated HDR, low detail, blurry, jpeg artifacts"
)

MINIMAL_STRUCTURE = (
    "CRITICAL — minimum structure: the composition must fill at least half the sheet and "
    "contain 3 to 6 distinct black elements, including one large solid black shape occupying "
    "roughly a third of the frame. White space frames the subject; it is not the whole image. "
    "No empty white squares."
)

TEMPLATES = {
    "default": (
        "High-end cinematic 3D render album cover, square, subject: {SUBJECT}, artistically "
        "expressing the sound of {GENRE} — {CHARACTER}. Deep near-black indigo ground (#0b0b14) "
        "fading to pure dark at the edges, lit only by emitted light: mint-teal (#5eead4) as the "
        "single sharp accent, an aurora wash of soft violet (#a78bfa) and rose (#fb7185) behind. "
        "Volumetric haze, bloom, long-exposure light trails, glass and water caustics, deep focus, "
        "generous negative space, subtle film grain over smooth gradients, premium and quietly "
        "futuristic. No text."
    ),
    "minimal": (
        "Swiss editorial graphic design, minimal offset print on uncoated white paper, square "
        "album cover, subject: {SUBJECT} reduced to pure geometry, expressing the sound of "
        "{GENRE} — {CHARACTER}. Flat paper-white ground (#fafafa), ink-black (#141414) hairline "
        "geometry, strict invisible modular grid, very generous empty space, asymmetric and "
        "deliberate placement. Exactly one element in ultramarine blue (#2358e6); everything else "
        "black on white. No gradients, no shadows, no glow, no blur, no 3D, no texture beyond "
        "uncoated paper tooth. One continuous hairline abstraction of the music. No text. "
        + MINIMAL_STRUCTURE
    ),
    "comic": (
        "Vintage 1970s comic book printing, four-colour press on warm newsprint cream paper "
        "(#f4e9d2), square album cover, subject: {SUBJECT} drawn bold and heroic, expressing the "
        "sound of {GENRE} — {CHARACTER}. Heavy black ink (#111014) keylines of varied weight, flat "
        "unshaded spot colour, large visible Ben-Day halftone dot screens, colour plates (process "
        "cyan #0b6e7f, magenta #c4006e, orange #f08a1e) deliberately offset 1-3 px out of register "
        "so edges fringe. Dynamic low-angle composition, radiating action lines and speed lines, "
        "hard zero-blur black drop shadows, ink bleed into paper fibre, slightly worn edges. Loud "
        "and energetic, limited ink palette, no rendering or gradients inside shapes. No text, no "
        "speech balloons, no lettering."
    ),
    "soviet": (
        "Heavy-industry machined-metal rendering, square album cover, subject: {SUBJECT} built as "
        "industrial machinery, expressing the sound of {GENRE} — {CHARACTER}. Cold gunmetal ground "
        "(#1b1e21, panels #22262a / #2b3034) with visible vertical brushed-steel grain, bone-white "
        "(#ede4cc) raked highlights, brass (#e6c766) as the single warm accent on one rated part. "
        "Stamped-steel plates with square corners, 2 px milled edges, inset bevels, rivets, seams, "
        "cast pitting and chipped paint, wide stencilled capital shapes with no readable letters, "
        "technical-plate frontal composition, low-key raking light, oil sheen, faint oxidation in "
        "the recesses. Cold, heavy, precise and premium. No text, no numbers, no logos."
    ),
    "sovietYears": (
        "1920s Soviet constructivist propaganda poster, two flat inks on coarse aged paper, square "
        "album cover, subject: {SUBJECT} as a monumental photomontage silhouette or severely "
        "reduced geometric icon, expressing the sound of {GENRE} — {CHARACTER}. Aged paper ground "
        "(#f4f1e1) as the third colour, flag red (#cc0000) used as a large flat field covering a "
        "third to half of the image, dense black (#111111) carrying all structure. Aggressive "
        "diagonals, skewed and sheared geometry, a red wedge or beam cutting across the square, "
        "radiating and concentric flat shapes, hard overlapping masses, zero-blur plate-offset "
        "shadows, coarse paper fibre, flat misregistered ink, poster pasted and printed too "
        "heavily. Monumental, collective, graphic. No gradients, no soft shadows, no 3D, no text, "
        "no Cyrillic, no lettering."
    ),
    "pixel": (
        "Authentic 16-bit pixel art, low-resolution console graphics, square album cover, scene: "
        "{SUBJECT}, expressing the sound of {GENRE} — {CHARACTER}. Strict pixel grid with hard "
        "aliased edges and no anti-aliasing, limited palette of about twenty colours drawn from "
        "deep indigo (#10121c), panel indigo (#1a1d2e, #262a44), pale ink (#e8e8f0), mint accent "
        "(#4ce0b3) with cyan (#5bc8ff), pink (#ff6b97) and violet (#b06bff) incident light. Ordered "
        "dithering for all shading, flat chunky clusters of pixels, a single-pixel rim light, "
        "strong readable silhouette, flat-shaded scene with a clear horizon or floor line, CRT "
        "scanline veil over the whole image, soft phosphor bloom on the brightest pixels only, "
        "faint vignette. Nostalgic, crisp, deliberately low-resolution. No anti-aliasing, no "
        "smooth curves, no lettering, no HUD text, no UI."
    ),
}


def fnv1a(text):
    h = 2166136261
    for byte in text.encode("utf-8"):
        h ^= byte
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def stable_seed(skin, genre):
    """ART_DIRECTION.md section 0.8: 1000 + 137*skinIndex + fnv1a(genre) % 1000."""
    return 1000 + 137 * SKINS.index(skin) + fnv1a(genre) % 1000


def log(line):
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(PROGRESS, "a") as fh:
        fh.write(f"{stamp} {line}\n")
        fh.flush()
        os.fsync(fh.fileno())
    print(f"{stamp} {line}", flush=True)


# --- GPU mutual exclusion -------------------------------------------------
# The generation loop and the review/regen daemon are separate processes that
# both call colabgen on the one GPU. Serialise them with an atomic mkdir lock.
GPU_LOCK = os.path.join(SCRATCH, "gpu.lock")
# When the review daemon sets this, the generation loop yields the GPU between
# images so rejected tiles are regenerated promptly instead of being starved.
GPU_URGENT = os.path.join(SCRATCH, "gpu.urgent")


def yield_to_review(cap_s=900):
    waited = 0
    while os.path.exists(GPU_URGENT) and waited < cap_s:
        if waited == 0:
            log("GPU-YIELD generation loop pausing for review regeneration")
        time.sleep(5)
        waited += 5
    if waited:
        log(f"GPU-YIELD-RESUME waited_s={waited}")


def acquire_gpu_lock(label, timeout=5400):
    waited = 0
    while True:
        try:
            os.mkdir(GPU_LOCK)
            with open(os.path.join(GPU_LOCK, "owner"), "w") as fh:
                fh.write(f"{label} pid={os.getpid()}")
            return True
        except FileExistsError:
            owner = "?"
            try:
                with open(os.path.join(GPU_LOCK, "owner")) as fh:
                    owner = fh.read().strip()
            except Exception:
                pass
            # steal a stale lock from a dead process
            try:
                pid = int(owner.split("pid=")[-1])
                os.kill(pid, 0)
            except Exception:
                try:
                    shutil.rmtree(GPU_LOCK)
                except Exception:
                    pass
                continue
            if waited >= timeout:
                log(f"GPU-LOCK-TIMEOUT {label} held_by={owner}")
                return False
            time.sleep(10)
            waited += 10
            if waited % 300 == 0:
                log(f"GPU-LOCK-WAIT {label} held_by={owner} waited_s={waited}")


def release_gpu_lock():
    try:
        shutil.rmtree(GPU_LOCK)
    except Exception:
        pass


def usage_balance():
    try:
        out = subprocess.run(["colabgen", "usage"], capture_output=True, text=True, timeout=120).stdout
        for ln in out.splitlines():
            if "Current balance" in ln:
                return ln.split(":")[1].strip().split()[0]
    except Exception as exc:  # pragma: no cover - diagnostics only
        return f"err({exc})"
    return "unknown"


def verify_image(path):
    """Return (ok, detail). Enforces existence, non-zero, valid image, ~1024x1024."""
    if not os.path.exists(path):
        return False, "missing"
    size = os.path.getsize(path)
    if size == 0:
        return False, "zero-bytes"
    try:
        with Image.open(path) as im:
            im.load()
            w, h = im.size
            fmt = im.format
    except Exception as exc:
        return False, f"unreadable({exc})"
    if fmt != "JPEG":
        return False, f"format={fmt}"
    if not (1000 <= w <= 1048 and 1000 <= h <= 1048):
        return False, f"size={w}x{h}"
    return True, f"{w}x{h} {size}B"


def finalise(png_bytes, jpg_path, skin, pixelate):
    """PNG bytes -> 1024x1024 JPEG q92, flattening RGBA onto the skin ground."""
    with Image.open(io.BytesIO(png_bytes)) as im:
        im.load()
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, GROUND[skin])
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert("RGB")
        if im.size != (1024, 1024):
            im = im.resize((1024, 1024), Image.LANCZOS)
        if pixelate:
            im = im.resize((PIXEL_PX, PIXEL_PX), Image.NEAREST).resize((1024, 1024), Image.NEAREST)
        tmp = jpg_path + ".tmp"
        im.save(tmp, "JPEG", quality=92)
    os.replace(tmp, jpg_path)


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
           "watermark or fine print, no melted or impossible geometry; the tile must read at "
           "120px."),
    "R4": ("Avoid the obvious stock cliche for this genre; choose a specific physical object or "
           "place instead of a floating instrument or a generic swirl."),
    "R5": ("Add one concrete origin anchor — the scene's city or region, its defining decade, and "
           "its signature equipment, venue or artefact — as one element of the picture, not a "
           "postcard."),
}


def build_regen_prompt(skin, genre, subject, character, origin, reasons):
    """Tightened prompt for a rejected tile: restate medium, material and single accent."""
    base = build_prompt(skin, genre, subject, character, origin)
    notes = " ".join(REASON_INJECTION[r] for r in reasons if r in REASON_INJECTION)
    return f"{base} {notes} Render only the physical medium and materials named above."


def write_meta(meta_path, skin, genre, seed, prompt, pilot=False, origin=None, review=None):
    payload = {
        "model": MODEL,
        "preset": PRESET,
        "size": SIZE,
        "steps": STEPS,
        "seed": seed,
        "skin": skin,
        "genre": genre,
        "prompt": prompt,
        "origin": origin,
        "negative_prompt": SHARED_NEGATIVE,
        "postprocess": "pixelate_160_nearest" if skin == "pixel" else None,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    if pilot:
        payload["provenance"] = (
            "pilot image from ART_DIRECTION.md Appendix C/D; metadata backfilled by the full "
            "batch, generator seed not recorded at pilot time"
        )
        payload["seed"] = None
    if review:
        payload["review"] = review
    with open(meta_path, "w") as fh:
        json.dump(payload, fh, indent=2)


def run_generation(skin, genre, prompt, seed, attempt):
    """One colabgen gen call, serialised against the review/regen daemon."""
    if not acquire_gpu_lock(f"gen:{skin}:{genre}"):
        return False, "gpu-lock-timeout"
    try:
        return _run_generation_locked(skin, genre, prompt, seed, attempt)
    finally:
        release_gpu_lock()


def _run_generation_locked(skin, genre, prompt, seed, attempt):
    """One colabgen gen call. Returns (ok, png_path_or_detail)."""
    stem = f"{skin}__{genre}"
    job = f"{skin}-{genre}-a{attempt}"
    logfile = os.path.join(GENLOG_DIR, f"{stem}.a{attempt}.log")
    cmd = [
        "colabgen", "gen", "-s", SESSION, prompt,
        "--size", SIZE, "--steps", str(STEPS), "--preset", PRESET,
        "--seed", str(seed), "-o", stem,
        "--negative-prompt", SHARED_NEGATIVE,
    ]
    with open(logfile, "w") as fh:
        proc = subprocess.run(cmd, cwd=SCRATCH, stdout=fh, stderr=subprocess.STDOUT)
    if proc.returncode != 0:
        return False, f"exit={proc.returncode} see {logfile}"
    latest = os.path.join(SCRATCH, "colabgen-out")
    matches = []
    if os.path.isdir(latest):
        for entry in os.scandir(latest):
            candidate = os.path.join(entry.path, stem + ".png")
            if os.path.exists(candidate):
                matches.append((os.path.getmtime(candidate), candidate))
    if not matches:
        return False, f"no output png (see {logfile})"
    matches.sort()
    return True, matches[-1][1]


def remotes_for(job_hint):
    """Safety-net locations for the remote copy of a job (approximate, for recovery)."""
    return f"/content/out/<job>/ and MyDrive/DSH/<job>"


def read_decisions(skin):
    """Reviewer's reject decisions for a skin, from _review/decisions.jsonl.

    Each line: {"skin": s, "genre": g, "reasons": ["R1",...], "hint": "optional"}
    """
    path = os.path.join(COVERS, "_review", "decisions.jsonl")
    if not os.path.exists(path):
        return []
    out = []
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except Exception:
                log(f"DECISION-UNPARSEABLE {line[:120]}")
                continue
            if rec.get("skin") == skin:
                out.append(rec)
    return out


def process_rejects(skin, decisions, data):
    """Move rejected tiles to _rejected/<skin>/ and regenerate in place, same seed."""
    rej_dir = os.path.join(COVERS, "_rejected", skin)
    os.makedirs(rej_dir, exist_ok=True)
    # ask the generation loop to stand down between images while we regenerate
    with open(GPU_URGENT, "w") as fh:
        fh.write(f"{skin} pid={os.getpid()}\n")
    try:
        return _process_rejects_inner(skin, decisions, data, rej_dir)
    finally:
        try:
            os.remove(GPU_URGENT)
        except OSError:
            pass


def _process_rejects_inner(skin, decisions, data, rej_dir):
    stats = {"rejected": 0, "regen_ok": 0, "regen_failed": 0, "accepted_after_2": 0,
             "regen_attempt1_ok": 0}
    for rec in decisions:
        genre = rec.get("genre")
        reasons = rec.get("reasons") or ["R3"]
        if genre not in data.GENRES:
            log(f"REJECT-UNKNOWN-GENRE {skin} {genre}")
            continue
        jpg = os.path.join(COVERS, skin, genre + ".jpg")
        old = os.path.join(rej_dir, genre + ".jpg")
        if os.path.exists(jpg):
            shutil.move(jpg, old)          # never delete anything
        stats["rejected"] += 1

        seed = stable_seed(skin, genre)
        subject, character = data.GENRES[genre]
        subject = data.SKIN_SUBJECT_OVERRIDE.get(skin, {}).get(genre, subject)
        origin = getattr(data, "ORIGINS", {}).get(genre)
        hint = rec.get("hint")
        prompt = build_regen_prompt(skin, genre, subject, character, origin, reasons)
        if hint:
            prompt = f"{prompt} {hint}"

        if not acquire_gpu_lock(f"regen:{skin}:{genre}"):
            log(f"REJECT-GPU-LOCK-TIMEOUT {skin} {genre}")
            stats["regen_failed"] += 1
            continue

        ok_done = False
        try:
            for attempt in (1, 2):
                t0 = time.time()
                ok, result = _run_generation_locked(skin, genre, prompt, seed, 100 + attempt)
                if not ok:
                    log(f"REJECT-GEN-FAIL {skin} {genre} attempt={attempt} seed={seed} {result}")
                    continue
                try:
                    with open(result, "rb") as fh:
                        png_bytes = fh.read()
                    finalise(png_bytes, jpg, skin, pixelate=(skin == "pixel"))
                    vok, detail = verify_image(jpg)
                    if not vok:
                        raise RuntimeError(detail)
                    kept = os.path.join(SRC_DIR, f"{skin}__{genre}.png")
                    shutil.copy2(result, kept)
                    write_meta(os.path.join(COVERS, skin, genre + ".json"), skin, genre, seed,
                               prompt, origin=origin,
                               review={"decision": "regenerated_after_reject",
                                       "reasons": reasons,
                                       "attempt": attempt,
                                       "previous": f"_rejected/{skin}/{genre}.jpg",
                                       "seconds": round(time.time() - t0, 1)})
                    log(f"REGEN-OK {skin} {genre} reasons={','.join(reasons)} attempt={attempt} "
                        f"seconds={time.time()-t0:.1f} seed={seed}")
                    if attempt == 1:
                        stats["regen_attempt1_ok"] += 1
                    else:
                        stats["accepted_after_2"] += 1
                        log(f"ACCEPTED-AFTER-2 {skin} {genre} "
                            f"reasons={','.join(reasons)} (kept attempt 2)")
                    stats["regen_ok"] += 1
                    ok_done = True
                    break
                except Exception as exc:
                    log(f"REJECT-POSTPROCESS-FAIL {skin} {genre} attempt={attempt} {exc}")
        finally:
            release_gpu_lock()

        if not ok_done:
            stats["regen_failed"] += 1
            # never leave a hole: put the previous image back in place
            if os.path.exists(old) and not os.path.exists(jpg):
                shutil.copy2(old, jpg)
            with open(FAILED, "a") as fh:
                fh.write(f"{skin}/{genre}\tseed={seed}\treason=regen_failed reasons={reasons}\n")
            log(f"REJECT-REGEN-FAILED {skin} {genre} reasons={','.join(reasons)} "
                f"previous image restored from _rejected/{skin}/{genre}.jpg")
    return stats


def run_review(skin, completed):
    """Triage + contact sheets + progress-log summary for one finished skin wave."""
    import _batch_review as review
    rep = review.triage_skin(skin)
    sheets = review.contact_sheets(skin)
    counts_str = ",".join(f"{k}:{v}" for k, v in sorted(rep["flag_counts"].items())) or "none"
    flagged = sorted(rep["flagged"])
    log(f"TRIAGE {skin} reviewed={rep['_header']['images']} generation_completed={completed} "
        f"flags={{{counts_str}}} balance={usage_balance()}")
    if flagged:
        log(f"TRIAGE-FLAGGED {skin} ids={','.join(flagged)}")
    log(f"SHEETS {skin} " + " ".join(os.path.relpath(p, COVERS) for p in sheets))
    return rep, sheets


def main():
    def _term(signum, frame):
        log(f"BATCH-INTERRUPTED signal={signum} — safe to restart, completed images are skipped")
        sys.exit(143)

    signal.signal(signal.SIGTERM, _term)
    signal.signal(signal.SIGINT, _term)

    ap = argparse.ArgumentParser()
    ap.add_argument("--skins", default=",".join(SKINS))
    ap.add_argument("--verify-only", action="store_true")
    ap.add_argument("--no-review", dest="review", action="store_false", default=True,
                    help="skip triage/contact-sheets/reject handling after each skin")
    ap.add_argument("--limited", action="store_true", help="internal: stop after one skin")
    args = ap.parse_args()

    os.makedirs(SRC_DIR, exist_ok=True)
    os.makedirs(GENLOG_DIR, exist_ok=True)
    os.makedirs(SCRATCH, exist_ok=True)

    sys.path.insert(0, COVERS)
    import _batch_data as data

    genres = sorted(f[:-4] for f in os.listdir(COVERS)
                    if f.endswith(".jpg") and os.path.isfile(os.path.join(COVERS, f)))
    missing_data = [g for g in genres if g not in data.GENRES]
    if missing_data:
        raise SystemExit(f"genre data missing for: {missing_data}")

    skins = args.skins.split(",")
    for skin in skins:
        os.makedirs(os.path.join(COVERS, skin), exist_ok=True)

    total_elapsed_start = time.time()
    if not args.verify_only:
        balance0 = usage_balance()
        log(f"BATCH-START session={SESSION} model={MODEL} preset={PRESET} steps={STEPS} size={SIZE} "
            f"genres={len(genres)} skins={len(skins)} targets={len(genres)*len(skins)} "
            f"balance={balance0} cwd={SCRATCH}")
        log("RECOVERY remote copies per job: VM /content/out/<job>/ and Drive MyDrive/DSH/<job> "
            "(recover with `colabgen jobs` / `colabgen cp --get`)")
        log("RECOVERY local source PNGs kept at " + SRC_DIR)
        log("FIXES applied: minimal+=min-structure clause; pixel=post-pixelate 160px NEAREST; "
            "negative+=signature/small print/fine print/corner mark")

    counts = {s: {"done": 0, "skipped": 0, "failed": 0} for s in skins}
    run_done = run_skipped = run_failed = 0
    run_times = []
    since_checkpoint = 0
    elapsed_before = 0.0

    for skin in skins:
        skin_start = time.time()
        log(f"SKIN-START {skin} balance={usage_balance()}")
        for genre in genres:
            yield_to_review()
            jpg = os.path.join(COVERS, skin, genre + ".jpg")
            meta_path = os.path.join(COVERS, skin, genre + ".json")
            seed = stable_seed(skin, genre)
            subject, character = data.GENRES[genre]
            ov = data.SKIN_SUBJECT_OVERRIDE.get(skin, {})
            subject = ov.get(genre, subject)
            origin = getattr(data, "ORIGINS", {}).get(genre)
            prompt = build_prompt(skin, genre, subject, character, origin)

            if args.verify_only:
                ok, detail = verify_image(jpg)
                if not ok:
                    print(f"FAIL {skin}/{genre}: {detail}")
                    counts[skin]["failed"] += 1
                elif not os.path.exists(meta_path):
                    print(f"NOMETA {skin}/{genre}")
                continue

            ok, detail = verify_image(jpg)
            if ok:
                if not os.path.exists(meta_path):
                    write_meta(meta_path, skin, genre, None, prompt, pilot=True, origin=origin)
                    log(f"BACKFILL-META {skin} {genre} (verified existing image)")
                counts[skin]["skipped"] += 1
                run_skipped += 1
                since_checkpoint += 1
                if since_checkpoint >= CHECKPOINT_EVERY:
                    since_checkpoint = 0
                    elapsed_min = (time.time() - total_elapsed_start) / 60
                    avg = sum(run_times) / len(run_times) if run_times else 0
                    log(f"CHECKPOINT {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} "
                        f"done={run_done} skipped={run_skipped} failed={run_failed} "
                        f"elapsed_min={elapsed_min:.1f} avg_s={avg:.1f} balance={usage_balance()}")
                continue

            if detail not in ("missing",):
                log(f"UNVERIFIED-EXISTING {skin} {genre} {detail} -> regenerating")

            t0 = time.time()
            got = False
            png_path = None
            for attempt in (1, 2):
                ok, result = run_generation(skin, genre, prompt, seed, attempt)
                if ok:
                    png_path = result
                    got = True
                    break
                log(f"GEN-FAIL {skin} {genre} attempt={attempt} seed={seed} {result}")
                time.sleep(5)

            if not got:
                counts[skin]["failed"] += 1
                run_failed += 1
                since_checkpoint += 1
                with open(FAILED, "a") as fh:
                    fh.write(f"{skin}/{genre}\tseed={seed}\treason={result}\n")
                log(f"FAIL {skin} {genre} seconds={time.time()-t0:.1f} seed={seed}")
                continue

            try:
                with open(png_path, "rb") as fh:
                    png_bytes = fh.read()
                finalise(png_bytes, jpg, skin, pixelate=(skin == "pixel"))
                ok, detail = verify_image(jpg)
                if not ok:
                    raise RuntimeError(f"post-verify failed: {detail}")
                # keep the pristine generator PNG locally as a free re-derivation source
                kept = os.path.join(SRC_DIR, f"{skin}__{genre}.png")
                if not os.path.exists(kept):
                    shutil.copy2(png_path, kept)
            except Exception as exc:
                counts[skin]["failed"] += 1
                run_failed += 1
                with open(FAILED, "a") as fh:
                    fh.write(f"{skin}/{genre}\tseed={seed}\treason=postprocess:{exc}\n")
                log(f"FAIL {skin} {genre} seconds={time.time()-t0:.1f} seed={seed} postprocess={exc}")
                continue

            secs = time.time() - t0
            run_times.append(secs)
            counts[skin]["done"] += 1
            run_done += 1
            since_checkpoint += 1
            write_meta(meta_path, skin, genre, seed, prompt, origin=origin)
            log(f"OK {skin} {genre} seconds={secs:.1f} seed={seed}")

            if since_checkpoint >= CHECKPOINT_EVERY:
                since_checkpoint = 0
                elapsed_min = (time.time() - total_elapsed_start) / 60
                avg = sum(run_times) / len(run_times) if run_times else 0
                log(f"CHECKPOINT {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} "
                    f"done={run_done} skipped={run_skipped} failed={run_failed} "
                    f"elapsed_min={elapsed_min:.1f} avg_s={avg:.1f} balance={usage_balance()}")

        skin_min = (time.time() - skin_start) / 60
        c = counts[skin]
        avg = sum(run_times) / len(run_times) if run_times else 0
        log(f"SKIN-DONE {skin} completed={c['done']} skipped={c['skipped']} failed={c['failed']} "
            f"skin_min={skin_min:.1f} avg_s={avg:.1f} balance={usage_balance()}")

        # Review (triage + contact sheets + rejected-tile regeneration) is handled by
        # _batch_reviewd.py, which runs alongside this loop and never blocks it.

        if args.limited:
            break

    if args.verify_only:
        for s in skins:
            print(s, counts[s])
        return

    elapsed_min = (time.time() - total_elapsed_start) / 60
    avg = sum(run_times) / len(run_times) if run_times else 0
    log(f"BATCH-END completed={run_done} skipped={run_skipped} failed={run_failed} "
        f"elapsed_min={elapsed_min:.1f} avg_s={avg:.1f} balance={usage_balance()}")


if __name__ == "__main__":
    main()
