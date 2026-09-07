from scripts.builder import build_pattern

PATTERNS = {}

# === DNB (9) ===
PATTERNS["jungle"] = build_pattern(
    "jungle", 165, "C minor", 10,
    kick="1000001000100000", snare="0000100100001000", hihat="1111111112111131", perc="0010010010010010",
    bass_steps="1000001000001000", bass_pitch=[36,None,None,None,None,None,36,None,None,None,None,None,34,None,None,None],
    chord_steps="1000000000001000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,63,None,None,None],
    lead_steps="0010001001000010", lead_pitch=[None,None,72,None,None,None,75,None,None,74,None,None,None,None,72,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="808_bass", chord_inst="warm_pad", lead_inst="flute_lead"
)

PATTERNS["liquid-dnb"] = build_pattern(
    "liquid-dnb", 174, "F minor", 5,
    kick="1000000000100000", snare="0000100000001000", hihat="1121112111211121", perc="0000001000000001",
    bass_steps="1000000010100000", bass_pitch=[41,None,None,None,None,None,None,None,41,None,44,None,None,None,None,None],
    chord_steps="1000000100000010", chord_pitch=[65,None,None,None,None,None,None,68,None,None,None,None,None,None,67,None],
    lead_steps="0010100000100100", lead_pitch=[None,None,77,None,80,None,None,None,None,None,79,None,None,77,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="pluck_synth"
)

PATTERNS["neurofunk"] = build_pattern(
    "neurofunk", 174, "D minor", 0,
    kick="1000000000100100", snare="0000100000001000", hihat="1111112111111131", perc="0010000001001000",
    bass_steps="1001001000100110", bass_pitch=[38,None,None,38,None,None,41,None,None,None,38,None,None,43,44,None],
    chord_steps="1000000010000000", chord_pitch=[62,None,None,None,None,None,None,None,65,None,None,None,None,None,None,None],
    lead_steps="0001010000101000", lead_pitch=[None,None,None,74,None,77,None,None,None,None,76,None,74,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="reese_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["jump-up"] = build_pattern(
    "jump-up", 175, "F minor", 0,
    kick="1000000000100000", snare="0000100000001000", hihat="1010101010101010", perc="0001000000010000",
    bass_steps="0010010000100100", bass_pitch=[None,None,41,None,None,53,None,None,None,None,41,None,None,51,None,None],
    chord_steps="1000000000000000", chord_pitch=[65,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,77,None,None,None,80,None,None,None,77,None,None,None,82,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="acid_303", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["techstep"] = build_pattern(
    "techstep", 170, "E minor", 0,
    kick="1000000000100000", snare="0000100000001000", hihat="1111111111111111", perc="0000100000100000",
    bass_steps="1000000010000000", bass_pitch=[40,None,None,None,None,None,None,None,40,None,None,None,None,None,None,None],
    chord_steps="0000000010000000", chord_pitch=[None,None,None,None,None,None,None,None,64,None,None,None,None,None,None,None],
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,76,None,None,None,None,None,None,None,76,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="tight_snare", bass_inst="reese_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["halftime"] = build_pattern(
    "halftime", 87, "D minor", 0,
    kick="1000000000100000", snare="0000000010000000", hihat="1131113111311131", perc="0000010000000010",
    bass_steps="1000001000000100", bass_pitch=[38,None,None,None,None,None,41,None,None,None,None,None,None,38,None,None],
    chord_steps="1000000000000000", chord_pitch=[62,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,74,None,None,None,None,None,77,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="808_snare", bass_inst="808_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["breakcore"] = build_pattern(
    "breakcore", 190, "C minor", 0,
    kick="1010010010010010", snare="0000101000001101", hihat="1131131131113311", perc="0100100100100100",
    bass_steps="1000100010001000", bass_pitch=[36,None,None,None,36,None,None,None,36,None,None,None,39,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0101101001101001", lead_pitch=[None,72,None,75,72,None,79,None,None,75,77,None,72,None,None,80],
    fx_steps="1001000100100010",
    kick_inst="distorted_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="square_lead"
)

PATTERNS["ragga-jungle"] = build_pattern(
    "ragga-jungle", 168, "A minor", 15,
    kick="1000001000100000", snare="0000100000011000", hihat="1111121111111231", perc="0010000010000010",
    bass_steps="1000001000001000", bass_pitch=[45,None,None,None,None,None,45,None,None,None,None,None,43,None,None,None],
    chord_steps="0010000000100000", chord_pitch=[None,None,69,None,None,None,None,None,None,None,69,None,None,None,None,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,81,None,None,None,None,None,84,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="reggae_rim", bass_inst="808_bass", chord_inst="brass_synth", lead_inst="flute_lead"
)

PATTERNS["sambass"] = build_pattern(
    "sambass", 172, "D major", 10,
    kick="1000000000100010", snare="0000100000001000", hihat="1111111111111111", perc="1010010110100110",
    bass_steps="1000001010000010", bass_pitch=[38,None,None,None,None,None,45,None,38,None,None,None,None,None,43,None],
    chord_steps="1000010000100000", chord_pitch=[62,None,None,None,None,66,None,None,None,None,69,None,None,None,None,None],
    lead_steps="0010001010000010", lead_pitch=[None,None,74,None,None,None,78,None,81,None,None,None,None,None,83,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="acoustic_snare", bass_inst="walking_upright", chord_inst="rhodes_ep", lead_inst="flute_lead"
)

# === DUBSTEP (9) ===
PATTERNS["dubstep"] = build_pattern(
    "dubstep", 140, "F minor", 0,
    kick="1000000000100000", snare="0000000010000000", hihat="1000100010001000", perc="0000001000000001",
    bass_steps="1001000000100000", bass_pitch=[41,None,None,41,None,None,None,None,None,None,44,None,None,None,None,None],
    chord_steps="0000000010000000", chord_pitch=[None,None,None,None,None,None,None,None,65,None,None,None,None,None,None,None],
    lead_steps="0000000000100000", lead_pitch=[None,None,None,None,None,None,None,None,None,None,77,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["brostep"] = build_pattern(
    "brostep", 140, "E minor", 0,
    kick="1000001000000000", snare="0000000010000000", hihat="1010101010101031", perc="0000000100000010",
    bass_steps="0010110000101101", bass_pitch=[None,None,40,None,43,40,None,None,None,None,40,None,45,40,None,47],
    chord_steps="1000000000000000", chord_pitch=[64,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,76,None,None,None,None,None,None,None,79,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="saw_lead", chord_inst="supersaw", lead_inst="saw_lead"
)

PATTERNS["riddim"] = build_pattern(
    "riddim", 140, "E minor", 0,
    kick="1000000000000000", snare="0000000010000000", hihat="1010101010101010", perc="0000010000000100",
    bass_steps="0010001000100010", bass_pitch=[None,None,40,None,None,None,40,None,None,None,40,None,None,None,40,None],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0010000000100000", lead_pitch=[None,None,76,None,None,None,None,None,None,None,79,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="tight_snare", bass_inst="saw_lead", chord_inst="warm_pad", lead_inst="square_lead"
)

PATTERNS["melodic-dubstep"] = build_pattern(
    "melodic-dubstep", 140, "A minor", 0,
    kick="1000000000100000", snare="0000000010000000", hihat="1010101010101010", perc="0000000000000010",
    bass_steps="1000000000000000", bass_pitch=[45,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    chord_steps="1001001000100100", chord_pitch=[69,None,None,69,None,None,72,None,None,None,69,None,None,72,None,None],
    lead_steps="0000100000101000", lead_pitch=[None,None,None,None,81,None,None,None,None,None,84,None,83,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="supersaw", lead_inst="saw_lead"
)

PATTERNS["future-garage"] = build_pattern(
    "future-garage", 134, "B minor", 35,
    kick="1000000100100000", snare="0000100000001000", hihat="1011010110100101", perc="0010000010000010",
    bass_steps="1000000010000000", bass_pitch=[47,None,None,None,None,None,None,None,45,None,None,None,None,None,None,None],
    chord_steps="1000000000001000", chord_pitch=[71,None,None,None,None,None,None,None,None,None,None,None,69,None,None,None],
    lead_steps="0000010000100000", lead_pitch=[None,None,None,None,None,83,None,None,None,None,86,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="rimshot", bass_inst="reese_bass", chord_inst="rhodes_ep", lead_inst="flute_lead"
)

PATTERNS["post-dubstep"] = build_pattern(
    "post-dubstep", 132, "C minor", 20,
    kick="1000000000100000", snare="0000000010000000", hihat="0010001000100010", perc="0100001000010000",
    bass_steps="1000000000100000", bass_pitch=[36,None,None,None,None,None,None,None,None,None,39,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000100000000000", lead_pitch=[None,None,None,None,72,None,None,None,None,None,None,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["tearout-dubstep"] = build_pattern(
    "tearout-dubstep", 145, "F minor", 0,
    kick="1000001000000010", snare="0000000010000000", hihat="1010101010101031", perc="0000000100000001",
    bass_steps="1010101000101010", bass_pitch=[41,None,41,None,41,None,41,None,None,None,41,None,44,None,41,None],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0010001000000000", lead_pitch=[None,None,77,None,None,None,80,None,None,None,None,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="tight_snare", bass_inst="saw_lead", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["chillstep"] = build_pattern(
    "chillstep", 138, "D minor", 0,
    kick="1000000000100000", snare="0000000010000000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000000010000000", bass_pitch=[38,None,None,None,None,None,None,None,41,None,None,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[62,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010010000100000", lead_pitch=[None,None,74,None,None,77,None,None,None,None,79,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="pluck_synth"
)

PATTERNS["deathstep"] = build_pattern(
    "deathstep", 145, "E minor", 0,
    kick="1010000000100100", snare="0000000010000000", hihat="1111111111111133", perc="0000000001000000",
    bass_steps="1101001000101101", bass_pitch=[40,40,None,40,None,None,43,None,None,None,40,None,46,40,None,43],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,76,None,None,None,None,None,None,None,79,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="tight_snare", bass_inst="saw_lead", chord_inst="warm_pad", lead_inst="saw_lead"
)

print(f"Loaded {len(PATTERNS)} patterns in data_dnb_dubstep")
