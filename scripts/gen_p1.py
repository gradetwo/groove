import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "src", "data", "genres")
os.makedirs(OUT_DIR, exist_ok=True)

def make_genre(g):
    # sequencer pattern builder
    bpm = g.get("default_bpm", 124)
    style = g.get("style", "four_on_floor")
    
    if style == "four_on_floor":
        kick = [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]
        snare = [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0]
        hihat = [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0]
        perc = [0,1,0,0,0,0,0,1,0,1,0,0,0,0,1,0]
        bass = [1,0,0,1,0,0,1,0,1,0,0,1,0,1,0,0]
        bass_pitch = [36,None,None,36,None,None,38,None,36,None,None,41,None,43,None,None]
        chord = [1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0]
        chord_pitch = [60,None,None,None,None,None,63,None,None,None,65,None,None,None,None,None]
        lead = [0,0,1,0,1,0,0,1,0,0,1,0,1,1,0,0]
        lead_pitch = [None,None,72,None,75,None,None,74,None,None,72,None,79,77,None,None]
    elif style == "breakbeat":
        kick = [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0]
        snare = [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0]
        hihat = [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
        perc = [0,0,0,1,0,0,1,0,0,1,0,0,0,1,0,1]
        bass = [1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0]
        bass_pitch = [36,None,None,None,None,None,38,None,None,None,41,None,None,None,None,None]
        chord = [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0]
        chord_pitch = [60,None,None,None,None,None,None,None,63,None,None,None,None,None,None,None]
        lead = [0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0]
        lead_pitch = [None,None,72,None,None,75,None,None,74,None,None,72,None,None,77,None]
    elif style == "half_time":
        kick = [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0]
        snare = [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0]
        hihat = [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
        perc = [0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
        bass = [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0]
        bass_pitch = [33,None,None,None,None,None,36,None,None,None,None,None,31,None,None,None]
        chord = [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        chord_pitch = [57,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None]
        lead = [0,0,0,0,1,0,0,0,0,0,1,0,0,1,0,0]
        lead_pitch = [None,None,None,None,69,None,None,None,None,None,72,None,None,71,None,None]
    else: # swing / standard
        kick = [1,0,0,0,0,0,1,0,1,0,0,0,0,0,1,0]
        snare = [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0]
        hihat = [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0]
        perc = [0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1]
        bass = [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]
        bass_pitch = [36,None,None,None,38,None,None,None,40,None,None,None,41,None,None,None]
        chord = [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]
        chord_pitch = [60,None,None,None,62,None,None,None,64,None,None,None,65,None,None,None]
        lead = [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0]
        lead_pitch = [None,None,72,None,None,None,74,None,None,None,76,None,None,None,77,None]
    
    fx = [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]

    # Generate 5 representative tracks
    artists = g.get("artists", ["Pioneer A", "Pioneer B", "Artist C", "Artist D", "Artist E"])
    year_base = int(g["year"][:4]) if g["year"][:4].isdigit() else 1990
    tracks = []
    titles = [
      f"{g['name']} Anthem", f"Midnight in {g['place']['en'].split(',')[0]}", 
      f"Echoes of {g['name']}", f"Pulse & Groove", f"Essential {g['name']}"
    ]
    if "custom_tracks" in g:
        tracks = g["custom_tracks"]
    else:
        for i, a in enumerate(artists[:5]):
            tracks.append({
                "title": titles[i % len(titles)],
                "artist": a,
                "year": year_base + (i * 2) % 20,
                "link": f"https://www.youtube.com/results?search_query={a.replace(' ', '+')}+{g['name'].replace(' ', '+')}"
            })

    return {
        "id": g["id"],
        "name": g["name"],
        "aliases": g.get("aliases", []),
        "category": g["category"],
        "parent_genres": g.get("parents", []),
        "subgenres": g.get("subgenres", []),
        "related_genres": g.get("related", []),
        "origin_year": g["year"],
        "origin_decade": g.get("decade", (int(g["year"][:4]) // 10) * 10 if g["year"][:4].isdigit() else 1990),
        "origin_place": g["place"],
        "cultural_context": g["context"],
        "bpm_range": g["bpm"],
        "default_bpm": bpm,
        "time_signature": g.get("timeSig", "4/4"),
        "key_characteristics": g.get("keyChar", {
            "en": f"Frequently uses minor scales, blues inflections, and {g.get('scale', 'minor')} progressions.",
            "zh": f"常使用自然小调、五声音阶及特征明显的和声走向。"
        }),
        "common_chords": g.get("chords", ["i–VI–III–VII", "i–v–VI–VII"]),
        "chord_inversions": g.get("inversions", {
            "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
            "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
        }),
        "instrumentation": g.get("instrumentation", ["Synthesizer", "Drum Machine", "Bass", "Sampler", "FX"]),
        "sound_design": g["soundDesign"],
        "rhythm_features": g["rhythmFeatures"],
        "drum_pattern": {
            "kick": {"en": f"{g['name']} signature kick character.", "zh": f"{g['name']} 风格代表性底鼓特征。"},
            "snare_clap": {"en": "Layered snare and clap with crisp mid-high punch.", "zh": "叠层军鼓与拍手，带有扎实的中高频瞬态。"},
            "hihats": {"en": "Closed and open hi-hats providing drive and syncopation.", "zh": "闭镲与开镲交替提供推进力与切分感。"},
            "percussion": {"en": "Supplementary rhythmic accents and foley.", "zh": "辅助打击乐加花与质感点缀。"},
            "swing": {"en": f"Typical swing around {g.get('swing', 15)}%.", "zh": f"典型摇摆度约 {g.get('swing', 15)}%。"},
            "tempo": g["bpm"]
        },
        "bass_pattern": g["bassPattern"],
        "structure": g.get("structure", ["Intro", "Verse / Groove", "Build", "Drop / Chorus", "Breakdown", "Drop 2", "Outro"]),
        "production_tips": g["productionTips"],
        "representative_tracks": tracks,
        "representative_artists": artists[:5],
        "sources": ["Sound on Sound", "Ishkur's Guide to Electronic Music", "AllMusic Guide"],
        "radar_metrics": g.get("radar", {"groove": 8, "brightness": 7, "harmonicComplexity": 6, "rhythmDensity": 7, "bassEnergy": 8, "melodicFocus": 7}),
        "sequencer_pattern": {
            "genre_id": g["id"],
            "bpm": bpm,
            "scale": g.get("scale", "C minor"),
            "swing": g.get("swing", 15),
            "tracks": [
                {"track_id": "kick", "name": "Kick Drum", "instrument": "punchy_kick", "steps": kick, "velocity": [115 if x else 0 for x in kick], "volume": 0.9, "pan": 0},
                {"track_id": "snare", "name": "Snare / Clap", "instrument": "tight_snare", "steps": snare, "velocity": [100 if x else 0 for x in snare], "volume": 0.85, "pan": 0},
                {"track_id": "hihat", "name": "Hi-Hats", "instrument": "closed_hat", "steps": hihat, "velocity": [75 if x else 0 for x in hihat], "volume": 0.7, "pan": -0.2},
                {"track_id": "percussion", "name": "Percussion", "instrument": "rim_shaker", "steps": perc, "velocity": [70 if x else 0 for x in perc], "volume": 0.65, "pan": 0.25},
                {"track_id": "bass", "name": "Bassline", "instrument": "sub_bass", "steps": bass, "pitch": bass_pitch, "volume": 0.9, "pan": 0},
                {"track_id": "chords", "name": "Chords / Pad", "instrument": "warm_pad", "steps": chord, "pitch": chord_pitch, "volume": 0.75, "pan": 0},
                {"track_id": "lead", "name": "Lead Synth", "instrument": "saw_lead", "steps": lead, "pitch": lead_pitch, "volume": 0.8, "pan": 0.1},
                {"track_id": "fx", "name": "FX / Sweep", "instrument": "noise_sweep", "steps": fx, "volume": 0.6, "pan": 0}
            ]
        }
    }

def save_module(filename, var_name, genres):
    items = [make_genre(g) for g in genres]
    content = f"import {{ Genre }} from '../../types/genre';\n\nexport const {var_name}: Genre[] = {json.dumps(items, ensure_ascii=False, indent=2)};\n"
    with open(os.path.join(OUT_DIR, filename), "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Saved {len(items)} genres to {filename}")
    return items

print("Module builder core ready.")
