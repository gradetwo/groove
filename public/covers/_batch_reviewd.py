#!/home/crow/.venv/bin/python
"""Review daemon for the genre-cover batch.

Runs alongside the generation loop. For every skin whose generation is complete
it (a) runs automated triage, (b) builds contact sheets, (c) appends the triage
summary to the progress log, and (d) applies the reviewer's verdicts, moving
rejects to _rejected/<skin>/ and regenerating them with the same stable seed but
a tightened prompt.

Verdicts are read from:
  _review/verdicts.json   {"skin": ["genre-id", ...], ...}   (reviewer's visual verdict)
  _review/decisions.jsonl {"skin":..,"genre":..,"reasons":["R1",..],"hint":".."}

Apply verdicts by creating _review/verdicts.ready (touch); the daemon consumes it,
so the same verdict file is never applied twice. The GPU is shared with the
generation loop via _batch_scratch/gpu.lock.
"""
import importlib.util
import json
import os
import sys
import time

COVERS = "/home/crow/music/groove/public/covers"
REVIEW = os.path.join(COVERS, "_review")
SKINS = ["default", "minimal", "comic", "soviet", "sovietYears", "pixel"]
PER_SKIN = 159
POLL_S = 60


def load_runner():
    spec = importlib.util.spec_from_file_location("_batch_runner",
                                                 os.path.join(COVERS, "_batch_runner.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


R = load_runner()
sys.path.insert(0, COVERS)
import _batch_data as data  # noqa: E402
import _batch_review as review  # noqa: E402


def log(line):
    R.log(f"REVIEWD {line}")


def skin_counts(skin):
    d = os.path.join(COVERS, skin)
    if not os.path.isdir(d):
        return 0
    return len([f for f in os.listdir(d) if f.endswith(".jpg")])


def generation_done(skin):
    """All 159 tiles present and passing verification."""
    if skin_counts(skin) < PER_SKIN:
        return False
    d = os.path.join(COVERS, skin)
    for f in os.listdir(d):
        if f.endswith(".jpg"):
            ok, _ = R.verify_image(os.path.join(d, f))
            if not ok:
                return False
    return True


def do_triage(skin, tag=""):
    rep = review.triage_skin(skin)
    sheets = review.contact_sheets(skin)
    counts_str = ",".join(f"{k}:{v}" for k, v in sorted(rep["flag_counts"].items())) or "none"
    log(f"{tag}TRIAGE {skin} reviewed={rep['_header']['images']} flags={{{counts_str}}}")
    if rep["flagged"]:
        log(f"{tag}TRIAGE-FLAGGED {skin} ids={','.join(sorted(rep['flagged']))}")
    log(f"{tag}SHEETS {skin} " + " ".join(os.path.relpath(p, COVERS) for p in sheets))
    return rep, sheets


def load_verdicts(skin):
    out = []
    path = os.path.join(REVIEW, "verdicts.json")
    if os.path.exists(path):
        try:
            with open(path) as fh:
                obj = json.load(fh)
            for item in obj.get(skin, []):
                if isinstance(item, str):
                    out.append({"skin": skin, "genre": item, "reasons": ["VISUAL"], "hint": ""})
                else:
                    out.append({"skin": skin, "genre": item["genre"],
                                "reasons": item.get("reasons", ["VISUAL"]),
                                "hint": item.get("hint", "")})
        except Exception as exc:
            log(f"VERDICT-PARSE-FAIL {skin} {exc}")
    out += R.read_decisions(skin)
    return out


def apply_verdicts(skin):
    decisions = load_verdicts(skin)
    if not decisions:
        return None
    log(f"VERDICT {skin} count={len(decisions)} ids={','.join(d['genre'] for d in decisions)}")
    stats = R.process_rejects(skin, decisions, data)
    reasons = sorted({r for d in decisions for r in d.get("reasons", ["VISUAL"])})
    log(f"REVIEW {skin} reviewed={skin_counts(skin)} rejected={stats['rejected']} "
        f"regen_ok={stats['regen_ok']} accepted_after_2={stats['accepted_after_2']} "
        f"regen_failed={stats['regen_failed']} reasons={{{','.join(reasons)}}} "
        f"ids={','.join(d['genre'] for d in decisions)}")
    return stats


def main():
    os.makedirs(REVIEW, exist_ok=True)
    log("START watching skins; verdicts in _review/verdicts.json; "
        "touch _review/verdicts.ready to apply (consumed once)")
    triaged = set()
    while True:
        for skin in SKINS:
            if skin in triaged or not generation_done(skin):
                continue
            log(f"WAVE {skin} generation complete — triaging")
            do_triage(skin)
            log(f"AWAIT-VERDICT {skin} write _review/verdicts.json and touch "
                f"_review/verdicts.ready")
            triaged.add(skin)

        ready = os.path.join(REVIEW, "verdicts.ready")
        if os.path.exists(ready):
            try:
                os.remove(ready)
            except OSError:
                pass
            applied = False
            for skin in SKINS:
                if apply_verdicts(skin):
                    do_triage(skin, tag="RE-")
                    applied = True
            if not applied:
                log("VERDICT-READY but no verdicts matched any skin")

        if triaged and len(triaged) == len(SKINS):
            log("DONE all skins triaged; daemon exiting")
            return
        time.sleep(POLL_S)


if __name__ == "__main__":
    main()
