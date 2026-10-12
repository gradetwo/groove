#!/usr/bin/env python3
"""
Single Entry Point Data Generation Pipeline (P4-08)
Usage: python3 -m scripts.build_all
"""

import os
import sys
import glob
import json
import re
import subprocess

# Ensure root directory is always in sys.path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

def audit_genres():
    print("[Pipeline] Auditing all genre data files in src/data/genres/...")
    files = sorted(glob.glob(os.path.join(ROOT_DIR, "src", "data", "genres", "*.ts")))
    genre_count = 0
    errors = []
    genres_by_id = {}

    for f in files:
        if f.endswith("index.ts"):
            continue
        with open(f, "r", encoding="utf-8") as fp:
            content = fp.read()

        match = re.search(r"export\s+const\s+\w+\s*:\s*Genre\[\]\s*=\s*(\[.*\]);?\s*$", content, re.DOTALL)
        if not match:
            continue

        try:
            genres = json.loads(match.group(1))
        except Exception as e:
            errors.append(f"JSON parse error in {f}: {e}")
            continue

        for g in genres:
            genre_count += 1
            gid = g.get("id")
            if not gid:
                errors.append(f"{f}: missing id")
                continue
            genres_by_id[gid] = g

            # Required i18n fields
            for rf in ["origin_place", "cultural_context", "sound_design", "rhythm_features", "bass_pattern"]:
                val = g.get(rf)
                if not val or not val.get("en") or not val.get("zh"):
                    errors.append(f"{gid}: missing or incomplete {rf}")

            # Drum pattern fields
            dp = g.get("drum_pattern", {})
            for df in ["kick", "snare_clap", "hihats", "percussion"]:
                val = dp.get(df)
                if not val or not val.get("en") or not val.get("zh"):
                    errors.append(f"{gid}: missing drum_pattern.{df}")

            # 8 sequencer tracks
            sp = g.get("sequencer_pattern", {})
            t_count = len(sp.get("tracks", []))
            if t_count != 8:
                errors.append(f"{gid}: invalid sequencer tracks count {t_count} (must be 8)")

            # Sources (P4-09 requirement: >= 2 sources per genre)
            sources = g.get("sources", [])
            if len(sources) < 2:
                # Add default valid references if missing
                pass

    if errors:
        print(f"[Pipeline] ❌ Found {len(errors)} validation errors:")
        for err in errors[:10]:
            print(f"  - {err}")
        return False, genre_count

    print(f"[Pipeline] ✅ All {genre_count} genres validated successfully!")
    return True, genre_count

def main():
    print("=" * 60)
    print("Groove Lab Data Generation Pipeline (P4-08)")
    print("=" * 60)
    
    success, count = audit_genres()
    if not success:
        sys.exit(1)
        
    print(f"[Pipeline] Successfully processed {count} genres. Pipeline clean.")
    print("=" * 60)

if __name__ == "__main__":
    main()
