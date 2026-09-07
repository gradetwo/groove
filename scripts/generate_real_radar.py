import glob, re, json, os

files = sorted(glob.glob("src/data/genres/*.ts"))
genres_by_file = {}

def clamp(v, lo, hi):
    return max(lo, min(hi, int(round(v))))

def compute_radar(g):
    gid = g["id"]
    cat = g.get("category", "")
    bpm = g.get("default_bpm", 120)
    swing = g.get("sequencer_pattern", {}).get("swing", 0)
    chords_list = g.get("common_chords", [])
    chords_str = " ".join(chords_list)
    
    tracks = {t["track_id"]: t for t in g.get("sequencer_pattern", {}).get("tracks", [])}
    def get_hits(tid):
        if tid not in tracks: return 0
        return sum(1 for s in tracks[tid].get("steps", []) if s > 0)
        
    def get_offbeat_hits(tid):
        if tid not in tracks: return 0
        steps = tracks[tid].get("steps", [])
        return sum(1 for i, s in enumerate(steps) if s > 0 and i % 2 == 1)

    kick_hits = get_hits("kick")
    snare_hits = get_hits("snare")
    hihat_hits = get_hits("hihat")
    perc_hits = get_hits("percussion")
    bass_hits = get_hits("bass")
    chord_hits = get_hits("chords")
    lead_hits = get_hits("lead")
    fx_hits = get_hits("fx")
    total_drum_hits = kick_hits + snare_hits + hihat_hits + perc_hits
    offbeat_drum_hits = get_offbeat_hits("kick") + get_offbeat_hits("snare") + get_offbeat_hits("hihat") + get_offbeat_hits("percussion")
    
    sd = (g.get("sound_design", {}).get("en", "") + " " + g.get("key_characteristics", {}).get("en", "") + " " + " ".join(g.get("instrumentation", []))).lower()
    rf = (g.get("rhythm_features", {}).get("en", "") + " " + g.get("drum_pattern", {}).get("kick", {}).get("en", "")).lower()
    bp = (g.get("bass_pattern", {}).get("en", "")).lower()
    culture = (g.get("cultural_context", {}).get("en", "")).lower()

    # 1. GROOVE (律动感 1-10)
    # Measures swing, syncopation, human pocket, offbeat dance bounce vs rigid mechanical grid
    groove = 5.0
    groove += (swing / 50.0) * 3.0  # Swing adds up to 3 points
    if total_drum_hits > 0:
        groove += (offbeat_drum_hits / total_drum_hits) * 1.8
    if any(k in rf or k in sd for k in ["syncopat", "swing", "funk", "pocket", "groove", "shuffle", "triplet", "polyrhythm", "clave", "swung"]):
        groove += 1.4
    if any(k in rf or k in sd for k in ["four-on-the-floor", "rigid", "motorik", "straight", "driving"]):
        groove -= 0.8
    if cat in ["Jazz/Blues", "Latin/World"] or any(k in gid for k in ["house", "funk", "garage", "afro", "disco", "soul", "cumbia", "samba", "reggae"]):
        groove += 1.2
    if any(k in gid for k in ["industrial", "techno", "gabber", "hardcore", "ebm"]):
        groove -= 0.6
    if any(k in gid for k in ["ambient", "drone", "noise"]):
        groove = 2.0

    # 2. BRIGHTNESS (音色明亮度 1-10)
    # High frequency sizzle, supersaws, distortion vs dark, warm, sub, low-pass
    bright = 5.0
    bright += min(hihat_hits / 4.0, 2.2)
    if any(k in sd for k in ["supersaw", "bright", "crisp", "sizzle", "metallic", "distort", "fuzz", "clang", "high-end", "sparkl", "open hat", "overdrive", "shimmer"]):
        bright += 2.2
    if any(k in sd or k in bp for k in ["dark", "low-pass", "filtered", "sub-heavy", "warm", "muffled", "deep", "cavernous", "tape", "smooth", "muddy"]):
        bright -= 2.2
    if cat == "Rock/Metal":
        bright += 1.6
    if any(k in gid for k in ["trance", "eurodance", "future-bass", "hyperpop", "hardstyle", "happy-hardcore", "synth-pop", "chiptune"]):
        bright += 2.0
    if any(k in gid for k in ["dub", "deep", "trip-hop", "lofi", "ambient", "drone"]):
        bright -= 1.5

    # 3. HARMONIC COMPLEXITY (和声复杂度 1-10)
    # Extended jazz chords, altered scales vs single note drones, power chords
    harm = 4.0
    if any(k in chords_str or k in culture for k in ["9", "11", "13", "maj7", "m7b5", "dim", "alt", "+", "aug", "6/9", "substitution", "altered"]):
        harm += 4.2
    elif any(k in chords_str for k in ["7", "m7", "sus", "add9", "6"]):
        harm += 2.2
    if any(k in chords_str for k in ["5", "power chord", "root", "drone", "single note"]) or len(chords_list) == 0 or chord_hits <= 1:
        harm -= 1.8
    if cat == "Jazz/Blues" or any(k in gid for k in ["soul", "bossa", "city-pop", "progressive", "neo-soul", "fusion"]):
        harm += 2.0
    if any(k in gid for k in ["techno", "drill", "minimal", "punk", "dubstep", "noise"]):
        harm -= 1.5

    # 4. RHYTHM DENSITY (节奏密度 1-10)
    # Events per bar scaled by tempo
    effective_bpm = bpm
    if any(k in rf for k in ["half-time", "halftime"]):
        effective_bpm *= 0.55
    density_raw = (total_drum_hits + bass_hits + lead_hits) * (effective_bpm / 120.0)
    density = 1.0 + (density_raw / 34.0) * 8.0
    if any(k in gid for k in ["dnb", "jungle", "breakcore", "speedcore", "thrash", "death-metal", "bebop"]):
        density += 1.5
    if any(k in gid for k in ["ambient", "drone", "dub"]):
        density -= 2.0

    # 5. BASS ENERGY (低频能量 1-10)
    # 808, sub-bass, reese vs acoustic folk
    bass = 5.0
    if any(k in bp or k in sd for k in ["808", "sub-bass", "sub bass", "reese", "50hz", "40hz", "sine", "wobble", "distorted 808", "heavy bass", "subwoofer", "rumble", "sub pressure"]):
        bass += 3.6
    elif any(k in bp or k in sd for k in ["electric bass", "synth bass", "slap bass", "acid bass", "tb-303", "bass guitar", "reese"]):
        bass += 1.8
    if any(k in sd for k in ["acoustic", "folk", "lo-fi", "vintage recording", "phonograph"]) and not ("sub" in bp):
        bass -= 2.2
    if any(k in gid for k in ["dubstep", "trap", "drill", "dnb", "bass", "jungle", "sub"]):
        bass += 1.6
    if cat in ["Electronic", "Hip Hop"]:
        bass += 0.5

    # 6. MELODIC FOCUS (旋律性 1-10)
    # Lead presence, memorable hooks vs hypnotic texture
    melodic = 4.0
    melodic += min(lead_hits / 2.0, 3.2)
    if chord_hits >= 4:
        melodic += 1.2
    if any(k in sd or k in culture for k in ["vocal", "hook", "singable", "catchy", "anthem", "topline", "melody", "pop", "ballad", "crooner", "songwriting", "chorus", "melodic"]):
        melodic += 2.2
    if any(k in sd or k in rf for k in ["hypnotic", "monotonous", "drone", "rhythm-first", "atonal", "percussive only", "minimalism", "industrial noise"]):
        melodic -= 2.2
    if cat == "Pop/R&B" or any(k in gid for k in ["trance", "synthwave", "city-pop", "eurodance", "motown"]):
        melodic += 1.8
    if any(k in gid for k in ["techno", "noise", "dark", "industrial", "minimal"]):
        melodic -= 1.2

    # Deterministic micro-fingerprint based on genre id hash so identical broad archetypes still have unique nuances
    h = sum(ord(c) * (i + 1) for i, c in enumerate(gid))
    j1 = (h % 3) - 1
    j2 = ((h // 3) % 3) - 1

    return {
        "groove": clamp(groove + j1 * 0.3, 1, 10),
        "brightness": clamp(bright + j2 * 0.3, 1, 10),
        "harmonicComplexity": clamp(harm, 1, 10),
        "rhythmDensity": clamp(density, 1, 10),
        "bassEnergy": clamp(bass, 1, 10),
        "melodicFocus": clamp(melodic, 1, 10)
    }

total = 0
all_computed = {}
for f in files:
    if f.endswith("index.ts"): continue
    content = open(f).read()
    match = re.search(r"export\s+const\s+\w+\s*:\s*Genre\[\]\s*=\s*(\[.*\]);?\s*$", content, re.DOTALL)
    if match:
        parsed = json.loads(match.group(1))
        genres_by_file[f] = parsed
        for g in parsed:
            total += 1
            all_computed[g["id"]] = compute_radar(g)

print(f"Computed real radar metrics for {total} genres across {len(genres_by_file)} files.")

# Check uniqueness
profiles = [tuple(sorted(v.items())) for v in all_computed.values()]
unique_profiles = len(set(profiles))
print(f"Unique radar profiles: {unique_profiles} out of {total} genres!")
