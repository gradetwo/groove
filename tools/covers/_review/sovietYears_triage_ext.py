#!/home/crow/.venv/bin/python
"""sovietYears-only triage extension.

The stock triage in _batch_review.py is calibrated so the 18 pilot images pass,
which means it barely discriminates on a light-paper skin: sovietYears scored
ZERO flags. These extra, skin-specific signals encode the ART_DIRECTION.md §5
recipe so the visual review has suspects to confirm instead of a blank list.

Signals (all evidence, never verdicts):
  red_field      fraction of pixels that are flag-red dominant (#cc0000 family)
  paper_field    fraction of pixels that are aged-paper light + low saturation
  black_field    fraction of pixels near the dense black plate (#111111)
  dark_tile      mean luma < 90 -> reads as the *soviet* (gunmetal) skin, not paper
  green_major / blue_major   banned secondary used as a major colour
  flat_fraction  fraction of pixels in near-constant neighbourhoods (flat inks)
  corner_edge_*  bottom/top band edge density, for D.3 signature/caption defects
"""
import importlib.util
import json
import os
from datetime import datetime, timezone

from PIL import Image

COVERS = "/home/crow/music/groove/public/covers"
REVIEW = os.path.join(COVERS, "_review")
SKIN = "sovietYears"

spec = importlib.util.spec_from_file_location("_batch_review",
                                              os.path.join(COVERS, "_batch_review.py"))
BR = importlib.util.module_from_spec(spec)
spec.loader.exec_module(BR)

Image.MAX_IMAGE_PIXELS = None


def _fraction(rgb_small, pred):
    px = list(rgb_small.getdata())
    return round(sum(1 for c in px if pred(c)) / len(px), 4)


def ext_measure(path):
    m = {}
    with Image.open(path) as im:
        rgb = im.convert("RGB")
    s = rgb.resize((256, 256), Image.LANCZOS)

    def is_red(c):
        r, g, b = c
        return r > 110 and r - g > 55 and r - b > 55 and g < 140

    def is_paper(c):
        r, g, b = c
        mx, mn = max(c), min(c)
        return (r + g + b) / 3 > 155 and (mx - mn) < 55

    def is_black(c):
        return max(c) < 70

    def green_major(c):
        r, g, b = c
        return g > 60 and g - r > 25 and g - b > 25

    def blue_major(c):
        r, g, b = c
        return b > 70 and b - r > 30 and b - g > 15

    m["red_field"] = _fraction(s, is_red)
    m["paper_field"] = _fraction(s, is_paper)
    m["black_field"] = _fraction(s, is_black)
    m["green_major"] = _fraction(s, green_major)
    m["blue_major"] = _fraction(s, blue_major)

    g = rgb.convert("L").resize((256, 256), Image.LANCZOS)
    gpx = g.load()
    flat = tot = 0
    for y in range(1, 255, 2):
        for x in range(1, 255, 2):
            tot += 1
            d = (abs(gpx[x, y] - gpx[x - 1, y]) + abs(gpx[x, y] - gpx[x, y - 1])
                 + abs(gpx[x, y] - gpx[x + 1, y]) + abs(gpx[x, y] - gpx[x, y + 1]))
            if d <= 6:
                flat += 1
    m["flat_fraction"] = round(flat / tot, 4) if tot else 0.0

    # corner / band text heuristics (D.3 signature marks)
    def band_edges(box):
        band = g.crop(box).resize((256, 32), Image.LANCZOS)
        bp = band.load()
        e = t = 0
        for yy in range(1, 32, 2):
            for xx in range(1, 256, 2):
                t += 1
                if abs(bp[xx, yy] - bp[xx - 1, yy]) > 40:
                    e += 1
        return round(e / t, 4) if t else 0.0

    m["bottom_edge"] = band_edges((0, int(rgb.height * 0.90), rgb.width, rgb.height))
    m["top_edge"] = band_edges((0, 0, rgb.width, int(rgb.height * 0.10)))
    return m


def main():
    skin_dir = os.path.join(COVERS, SKIN)
    genres = sorted(f[:-4] for f in os.listdir(skin_dir) if f.endswith(".jpg"))
    out = {}
    for g in genres:
        m = ext_measure(os.path.join(skin_dir, g + ".jpg"))
        flags = []
        if m["red_field"] < 0.06:
            flags.append("low_red_field")
        if m["red_field"] > 0.72:
            flags.append("red_everywhere")
        if m["paper_field"] < 0.12:
            flags.append("low_paper_field")
        if m["green_major"] > 0.12:
            flags.append("green_major")
        if m["blue_major"] > 0.12:
            flags.append("blue_major")
        if m["flat_fraction"] < 0.30:
            flags.append("not_flat_print")
        if m["bottom_edge"] > 0.14:
            flags.append("bottom_text_suspect")
        if m["top_edge"] > 0.14:
            flags.append("top_text_suspect")
        m["flags"] = flags
        out[g] = m

    # skin-confusion check using the stock luma metric
    for g in genres:
        rec = BR.measure(os.path.join(skin_dir, g + ".jpg"), SKIN)
        lm = rec["metrics"].get("luma_mean", 0)
        out[g]["luma_mean"] = lm
        out[g]["palette_distance"] = rec["metrics"].get("palette_distance")
        if lm < 90:
            out[g]["flags"].append("dark_tile")

    fc = {}
    for g, m in out.items():
        for f in m["flags"]:
            fc[f] = fc.get(f, 0) + 1
    flagged = {g: m["flags"] for g, m in out.items() if m["flags"]}
    doc = {
        "_header": {
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "skin": SKIN,
            "images": len(out),
            "note": "skin-specific extension; flags are suspects for visual confirmation",
            "flag_counts": fc,
        },
        "flag_counts": fc,
        "flagged": flagged,
        "images": out,
    }
    p = os.path.join(REVIEW, f"{SKIN}_triage_ext.json")
    with open(p, "w") as fh:
        json.dump(doc, fh, indent=2)
    print(f"{SKIN}: images={len(out)} ext_flags={fc} flagged={len(flagged)} -> {p}")
    for g in sorted(flagged):
        m = out[g]
        print(f"  {g:28s} {','.join(m['flags']):45s} red={m['red_field']:.3f} "
              f"paper={m['paper_field']:.3f} flat={m['flat_fraction']:.3f} "
              f"luma={m['luma_mean']}")


if __name__ == "__main__":
    main()
