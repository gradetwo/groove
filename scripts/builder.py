"""
Pattern builder utilities
"""
def p16(spec):
    if isinstance(spec, str):
        spec = spec.replace(" ", "").replace("_", "")
        return [int(c) for c in spec]
    return list(spec)

def v16(steps, base_vel=100, accent_vel=115, ghost_vel=60):
    vels = []
    for i, s in enumerate(steps):
        if s == 0:
            vels.append(0)
        elif s == 3: # Triplet roll
            vels.append(accent_vel - 10)
        elif s == 2: # Open hat or accent
            vels.append(accent_vel)
        elif i % 4 == 0: # Downbeat accent
            vels.append(accent_vel)
        elif i % 2 == 1: # Ghost / offbeat
            vels.append(ghost_vel)
        else:
            vels.append(base_vel)
    return vels

def build_pattern(genre_id, bpm, scale, swing,
                  kick, snare, hihat, perc,
                  bass_steps, bass_pitch,
                  chord_steps, chord_pitch,
                  lead_steps, lead_pitch,
                  fx_steps,
                  kick_inst="punchy_kick",
                  snare_inst="tight_snare",
                  hihat_inst="closed_hat",
                  perc_inst="rim_shaker",
                  bass_inst="sub_bass",
                  chord_inst="warm_pad",
                  lead_inst="saw_lead",
                  fx_inst="noise_sweep",
                  kick_vol=0.9, snare_vol=0.85, hihat_vol=0.7, perc_vol=0.65,
                  bass_vol=0.9, chord_vol=0.75, lead_vol=0.8, fx_vol=0.6):
    
    k_s = p16(kick)
    s_s = p16(snare)
    h_s = p16(hihat)
    p_s = p16(perc)
    b_s = p16(bass_steps)
    c_s = p16(chord_steps)
    l_s = p16(lead_steps)
    f_s = p16(fx_steps)

    k_v = v16(k_s, 105, 120, 80)
    s_v = v16(s_s, 95, 115, 65)
    h_v = v16(h_s, 70, 90, 50)
    p_v = v16(p_s, 70, 85, 55)

    return {
        "genre_id": genre_id,
        "bpm": bpm,
        "scale": scale,
        "swing": swing,
        "tracks": [
            {
                "track_id": "kick",
                "name": "Kick Drum",
                "instrument": kick_inst,
                "steps": k_s,
                "velocity": k_v,
                "volume": kick_vol,
                "pan": 0
            },
            {
                "track_id": "snare",
                "name": "Snare / Clap",
                "instrument": snare_inst,
                "steps": s_s,
                "velocity": s_v,
                "volume": snare_vol,
                "pan": 0
            },
            {
                "track_id": "hihat",
                "name": "Hi-Hats",
                "instrument": hihat_inst,
                "steps": h_s,
                "velocity": h_v,
                "volume": hihat_vol,
                "pan": -0.2
            },
            {
                "track_id": "percussion",
                "name": "Percussion",
                "instrument": perc_inst,
                "steps": p_s,
                "velocity": p_v,
                "volume": perc_vol,
                "pan": 0.25
            },
            {
                "track_id": "bass",
                "name": "Bassline",
                "instrument": bass_inst,
                "steps": b_s,
                "pitch": bass_pitch,
                "volume": bass_vol,
                "pan": 0
            },
            {
                "track_id": "chords",
                "name": "Chords / Pad",
                "instrument": chord_inst,
                "steps": c_s,
                "pitch": chord_pitch,
                "volume": chord_vol,
                "pan": 0
            },
            {
                "track_id": "lead",
                "name": "Lead Synth",
                "instrument": lead_inst,
                "steps": l_s,
                "pitch": lead_pitch,
                "volume": lead_vol,
                "pan": 0.1
            },
            {
                "track_id": "fx",
                "name": "FX / Sweep",
                "instrument": fx_inst,
                "steps": f_s,
                "volume": fx_vol,
                "pan": 0
            }
        ]
    }
