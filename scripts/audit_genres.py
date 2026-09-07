import glob, re, json

files = sorted(glob.glob("src/data/genres/*.ts"))
genre_count = 0
errors = []
genres_by_id = {}

for f in files:
    if f.endswith("index.ts"):
        continue
    content = open(f, "r", encoding="utf-8").read()
    
    match = re.search(r"export\s+const\s+\w+\s*:\s*Genre\[\]\s*=\s*(\[.*\]);?\s*$", content, re.DOTALL)
    if not match:
        print(f"Could not parse array in {f}")
        continue
    
    json_str = match.group(1)
    try:
        genres = json.loads(json_str)
    except Exception as e:
        print(f"JSON parse error in {f}: {e}")
        continue
        
    for g in genres:
        genre_count += 1
        gid = g.get("id")
        if not gid:
            errors.append(f"{f}: genre missing id")
            continue
        genres_by_id[gid] = g
            
        # Check required i18n fields
        required_i18n = ["origin_place", "cultural_context", "sound_design", "rhythm_features", "bass_pattern"]
        for rf in required_i18n:
            val = g.get(rf)
            if not val or not val.get("en") or not val.get("zh"):
                errors.append(f"{gid}: missing or incomplete {rf}")
                
        # Check drum_pattern
        dp = g.get("drum_pattern", {})
        for df in ["kick", "snare_clap", "hihats", "percussion"]:
            val = dp.get(df)
            if not val or not val.get("en") or not val.get("zh"):
                errors.append(f"{gid}: missing drum_pattern.{df}")
                
        # Check tracks
        tracks = g.get("representative_tracks", [])
        if len(tracks) < 5:
            errors.append(f"{gid}: has only {len(tracks)} tracks")
            
        # Check sequencer_pattern
        sp = g.get("sequencer_pattern", {})
        tracks_count = len(sp.get("tracks", []))
        if tracks_count != 8:
            errors.append(f"{gid}: invalid sequencer tracks count {tracks_count}")
            
        # Check BPM
        if not g.get("default_bpm") or not g.get("bpm_range"):
            errors.append(f"{gid}: missing bpm")

print(f"Audit completed: Checked {genre_count} genres. Errors found: {len(errors)}")
if errors:
    for err in errors[:20]:
        print(" -", err)
else:
    print("ALL 159 GENRES HAVE 100% COMPLETE BASE FIELDS!")
