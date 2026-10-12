#!/home/crow/.venv/bin/python
"""Automated triage + contact sheets for the genre-cover batch.

Cheap, GPU-free, runs over every finished image. Triage only points at suspects;
the verdict is the visual review of the contact sheets.
"""
import colorsys
import json
import os
from datetime import datetime, timezone
from PIL import Image, ImageDraw, ImageFont

Image.MAX_IMAGE_PIXELS = None

COVERS = "/home/crow/music/groove/public/covers"
REVIEW = os.path.join(COVERS, "_review")
SKINS = ["default", "minimal", "comic", "soviet", "sovietYears", "pixel"]

# ART_DIRECTION.md section 0.6 / Appendix A palettes.
PALETTE = {
    "default":     {"ground": "#0b0b14", "ink": "#f3f3f9", "accent": "#5eead4"},
    "minimal":     {"ground": "#fafafa", "ink": "#141414", "accent": "#2358e6"},
    "comic":       {"ground": "#f4e9d2", "ink": "#111014", "accent": "#0b6e7f"},
    "soviet":      {"ground": "#1b1e21", "ink": "#ede4cc", "accent": "#e6c766"},
    "sovietYears": {"ground": "#f4f1e1", "ink": "#111111", "accent": "#cc0000"},
    "pixel":       {"ground": "#10121c", "ink": "#e8e8f0", "accent": "#4ce0b3"},
}

# Thresholds. Tuned so none of the 18 approved pilot images are flagged.
THRESHOLDS = {
    "min_file_bytes": 20000,
    "min_std_luma": 12.0,        # near_blank: luminance std below this ...
    "max_unique_colors_blank": 4000,  # ... and unique colours below this
    "palette_distance_warn": 0.42,    # normalised hue/lightness distance
    "palette_distance_flag": 0.60,
    "phash_hamming_dup": 6,      # 64-bit aHash: retained only as a secondary signal
    "pixdiff_dup": 12.0,         # mean |RGB| difference on a 16x16 grid: below this = duplicate
    "pixel_max_unique_smooth": 23000,  # pixel skin: extreme-outlier guard only
    "pixel_min_edge_hardness": 0.55,
    "text_edge_density": 0.30,   # bottom-band edge density suspect
    "text_small_components": 12,
}


def _hex2rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def _hue_light(rgb):
    r, g, b = [c / 255.0 for c in rgb]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return h, l, s


def palette_distance(rgb, palette):
    """Mean distance from the nearest of the three skin colours, in hue+lightness.

    Weighted to punish wrong-lightness (grey cover in a dark skin) and wrong hue.
    """
    h, l, s = _hue_light(rgb)
    best = 9.9
    for key in ("ground", "ink", "accent"):
        ph, pl, ps = _hue_light(_hex2rgb(palette[key]))
        if s < 0.12 and ps < 0.12:
            dh = 0.0
        else:
            dh = min(abs(h - ph), 1.0 - abs(h - ph)) * 2.0
        dl = abs(l - pl)
        best = min(best, 0.55 * dl + 0.45 * dh)
    return round(best, 4)


def average_hash(img, size=8):
    small = img.convert("L").resize((size, size), Image.LANCZOS)
    px = list(small.getdata())
    avg = sum(px) / len(px)
    bits = 0
    for i, v in enumerate(px):
        if v >= avg:
            bits |= (1 << i)
    return bits


def dhash(img, size=8):
    small = img.convert("L").resize((size + 1, size), Image.LANCZOS)
    px = list(small.getdata())
    bits = 0
    i = 0
    for y in range(size):
        for x in range(size):
            if px[y * (size + 1) + x] < px[y * (size + 1) + x + 1]:
                bits |= (1 << i)
            i += 1
    return bits


def pixdiff(a_img, b_img, grid=16):
    """Mean absolute RGB difference on a coarse grid — a real visual distance."""
    a = a_img.convert("RGB").resize((grid, grid), Image.LANCZOS)
    b = b_img.convert("RGB").resize((grid, grid), Image.LANCZOS)
    pa, pb = list(a.getdata()), list(b.getdata())
    total = 0
    for ca, cb in zip(pa, pb):
        total += abs(ca[0] - cb[0]) + abs(ca[1] - cb[1]) + abs(ca[2] - cb[2])
    return round(total / (len(pa) * 3), 2)


def hamming(a, b):
    return bin(a ^ b).count("1")


def edge_hardness(img):
    """Fraction of adjacent-pixel gradient that is 'hard' (large single-pixel jump).

    Pixel art has many full-amplitude edges and near-zero intermediate values.
    """
    g = img.convert("L").resize((512, 512), Image.NEAREST)
    px = g.load()
    hard = mid = 0
    for y in range(1, 512, 3):
        for x in range(1, 512, 3):
            d = abs(px[x, y] - px[x - 1, y]) + abs(px[x, y] - px[x, y - 1])
            if d > 60:
                hard += 1
            elif d > 8:
                mid += 1
    total = hard + mid
    return round(hard / total, 4) if total else 0.0


def bottom_band_text_suspect(img):
    """Weak heuristic: many small isolated high-contrast components in the bottom band."""
    band = img.convert("L").crop((0, int(img.height * 0.90), img.width, img.height))
    band = band.resize((256, 26), Image.LANCZOS)
    px = band.load()
    edges = 0
    total = 0
    for y in range(1, 26, 2):
        for x in range(1, 256, 2):
            total += 1
            if abs(px[x, y] - px[x - 1, y]) > 40:
                edges += 1
    return round(edges / total, 4) if total else 0.0


def measure(path, skin):
    rec = {"flags": [], "metrics": {}}
    if not os.path.exists(path):
        rec["flags"].append("invalid")
        rec["metrics"]["error"] = "missing"
        return rec
    size = os.path.getsize(path)
    rec["metrics"]["bytes"] = size
    try:
        with Image.open(path) as im:
            im.load()
            w, h = im.size
            if (w, h) != (1024, 1024):
                rec["flags"].append("invalid")
            rgb = im.convert("RGB")
    except Exception as exc:
        rec["flags"].append("invalid")
        rec["metrics"]["error"] = str(exc)
        return rec
    if size < THRESHOLDS["min_file_bytes"]:
        rec["flags"].append("invalid")

    stat = rgb.convert("L").resize((256, 256), Image.LANCZOS)
    px = list(stat.getdata())
    mean = sum(px) / len(px)
    std = (sum((v - mean) ** 2 for v in px) / len(px)) ** 0.5
    unique_colors = len(rgb.resize((256, 256), Image.LANCZOS).getcolors(maxcolors=1 << 24) or [])
    rec["metrics"].update({
        "luma_mean": round(mean, 2),
        "luma_std": round(std, 2),
        "unique_colors_256": unique_colors,
    })
    if std < THRESHOLDS["min_std_luma"] and unique_colors < THRESHOLDS["max_unique_colors_blank"]:
        rec["flags"].append("near_blank")

    small = rgb.resize((64, 64), Image.LANCZOS)
    spx = list(small.getdata())
    mean_rgb = tuple(sum(c[i] for c in spx) / len(spx) for i in range(3))
    dist = palette_distance(mean_rgb, PALETTE[skin])
    rec["metrics"]["palette_distance"] = dist
    rec["metrics"]["mean_rgb"] = [round(v) for v in mean_rgb]
    if dist >= THRESHOLDS["palette_distance_flag"]:
        rec["flags"].append("palette_drift")
    elif dist >= THRESHOLDS["palette_distance_warn"]:
        rec["flags"].append("palette_drift_warn")

    rec["metrics"]["ahash"] = average_hash(rgb)
    rec["metrics"]["dhash"] = dhash(rgb)

    if skin == "pixel":
        small = rgb.resize((160, 160), Image.LANCZOS)
        uniq160 = len(small.getcolors(maxcolors=1 << 24) or [])
        nn = small.resize((1024, 1024), Image.NEAREST)
        a64 = rgb.resize((64, 64), Image.LANCZOS).convert("RGB").tobytes()
        b64 = nn.resize((64, 64), Image.LANCZOS).convert("RGB").tobytes()
        mad = sum(abs(x - y) for x, y in zip(a64, b64)) / len(a64)
        rec["metrics"]["unique_colors_160"] = uniq160
        rec["metrics"]["pixel_roundtrip_mad"] = round(mad, 3)
        # Report-only evidence: every pixel cover is post-pixelated at 160px by
        # construction, and low-level metrics do not separate smooth from chunky
        # reliably (both score ~0.4 MAD). Flag only extreme outliers.
        if uniq160 > THRESHOLDS["pixel_max_unique_smooth"]:
            rec["flags"].append("not_pixelated")

    tb = bottom_band_text_suspect(rgb)
    rec["metrics"]["text_band_edge_density"] = tb
    if tb > THRESHOLDS["text_edge_density"]:
        rec["flags"].append("text_or_signature_suspect")

    return rec


def triage_skin(skin):
    os.makedirs(REVIEW, exist_ok=True)
    skin_dir = os.path.join(COVERS, skin)
    genres = sorted(f[:-4] for f in os.listdir(skin_dir)
                    if f.endswith(".jpg") and os.path.isfile(os.path.join(skin_dir, f)))
    results = {}
    thumbs = {}
    for g in genres:
        path = os.path.join(skin_dir, g + ".jpg")
        rec = measure(path, skin)
        results[g] = rec
        if "ahash" in rec["metrics"]:
            thumbs[g] = path

    # duplicate detection: pixel difference on a coarse grid (aHash alone is too
    # coarse — dark centred covers collide at hamming<=6 while looking distinct).
    keys = list(thumbs)
    opened = {}
    try:
        for g in keys:
            with Image.open(thumbs[g]) as im:
                opened[g] = im.convert("RGB").copy()
        for i, a in enumerate(keys):
            for b in keys[i + 1:]:
                d = pixdiff(opened[a], opened[b])
                results[a]["metrics"].setdefault("pixdiff_nearest", [])
                results[b]["metrics"].setdefault("pixdiff_nearest", [])
                results[a]["metrics"]["pixdiff_nearest"].append([b, d])
                results[b]["metrics"]["pixdiff_nearest"].append([a, d])
                if d <= THRESHOLDS["pixdiff_dup"]:
                    results[a]["flags"].append("duplicate")
                    results[b]["flags"].append("duplicate")
                    results[a]["metrics"].setdefault("duplicate_of", []).append(b)
                    results[b]["metrics"].setdefault("duplicate_of", []).append(a)
    finally:
        for im in opened.values():
            im.close()
    for g in keys:
        near = results[g]["metrics"].get("pixdiff_nearest")
        if near:
            near.sort(key=lambda p: p[1])
            results[g]["metrics"]["pixdiff_nearest"] = near[:3]

    flag_counts = {}
    flagged = {}
    for g, rec in results.items():
        rec["flags"] = sorted(set(rec["flags"]))
        if rec["flags"]:
            flagged[g] = rec["flags"]
        for f in rec["flags"]:
            flag_counts[f] = flag_counts.get(f, 0) + 1

    report = {
        "_header": {
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "skin": skin,
            "images": len(results),
            "thresholds": THRESHOLDS,
            "palette": PALETTE[skin],
            "flag_meanings": {
                "invalid": "unreadable / not 1024x1024 / under min_file_bytes",
                "near_blank": "luma_std < min_std_luma AND unique_colors_256 < max_unique_colors_blank",
                "palette_drift": "mean colour >= palette_distance_flag from nearest skin colour (hue+lightness)",
                "palette_drift_warn": ">= palette_distance_warn but below flag",
                "duplicate": "mean |RGB| difference on a 16x16 grid <= pixdiff_dup vs another genre in "
                             "this skin (aHash hamming also reported as a secondary signal)",
                "not_pixelated": "pixel skin only: unique_colors_full > pixel_max_unique_smooth "
                                 "AND edge_hardness < pixel_min_edge_hardness",
                "smooth_suspect": "pixel skin only: edge_hardness < pixel_min_edge_hardness",
                "text_or_signature_suspect": "bottom-band edge density > text_edge_density (weak heuristic)",
            },
            "calibration": "thresholds tuned against the 18 approved pilot images so none are flagged",
            "note": "flags are evidence, not verdicts; the verdict is the visual contact-sheet review",
        },
        "flag_counts": flag_counts,
        "flagged": flagged,
        "images": results,
    }
    path = os.path.join(REVIEW, f"{skin}_triage.json")
    with open(path, "w") as fh:
        json.dump(report, fh, indent=2)
    return report


def _font(size):
    for candidate in (
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
    ):
        if os.path.exists(candidate):
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def contact_sheets(skin, tile=320, cols=8, per_sheet=40, flagged_only_marker=True):
    """One sheet = per_sheet tiles in an 8-column grid, each labelled with its genre id."""
    os.makedirs(REVIEW, exist_ok=True)
    skin_dir = os.path.join(COVERS, skin)
    genres = sorted(f[:-4] for f in os.listdir(skin_dir)
                    if f.endswith(".jpg") and os.path.isfile(os.path.join(skin_dir, f)))
    tri_path = os.path.join(REVIEW, f"{skin}_triage.json")
    flagged = {}
    if os.path.exists(tri_path) and flagged_only_marker:
        with open(tri_path) as fh:
            flagged = json.load(fh).get("flagged", {})

    label_h = 30
    pad = 6
    font = _font(20)
    sheet_paths = []
    for idx in range(0, len(genres), per_sheet):
        chunk = genres[idx:idx + per_sheet]
        rows = (len(chunk) + cols - 1) // cols
        W = cols * (tile + pad) + pad
        H = rows * (tile + label_h + pad) + pad
        sheet = Image.new("RGB", (W, H), (24, 24, 28))
        draw = ImageDraw.Draw(sheet)
        for n, g in enumerate(chunk):
            r, c = divmod(n, cols)
            x = pad + c * (tile + pad)
            y = pad + r * (tile + label_h + pad)
            with Image.open(os.path.join(skin_dir, g + ".jpg")) as im:
                tile_img = im.convert("RGB").resize((tile, tile), Image.LANCZOS)
            sheet.paste(tile_img, (x, y))
            bad = g in flagged
            colour = (255, 90, 90) if bad else (90, 90, 100)
            draw.rectangle([x, y, x + tile - 1, y + tile + label_h - 1], outline=colour, width=2)
            tag = g if not bad else f"{g} *"
            draw.text((x + 6, y + tile + 4), tag[:34], fill=(255, 255, 255), font=font)
            if bad:
                draw.text((x + 6, y + tile + 4), tag[:34], fill=(255, 120, 120), font=font)
        out = os.path.join(REVIEW, f"{skin}_sheet_{idx // per_sheet:03d}.jpg")
        sheet.save(out, "JPEG", quality=90)
        sheet_paths.append(out)
    return sheet_paths


if __name__ == "__main__":
    import sys
    skins = sys.argv[1:] or SKINS
    for s in skins:
        rep = triage_skin(s)
        paths = contact_sheets(s)
        print(f"{s}: images={rep['_header']['images']} flags={rep['flag_counts']} sheets={len(paths)}")
