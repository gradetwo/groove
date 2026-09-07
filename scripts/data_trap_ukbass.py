from scripts.builder import build_pattern

PATTERNS = {}

# === TRAP & DRILL (8) ===
PATTERNS["edm-trap"] = build_pattern(
    "edm-trap", 145, "C minor", 0,
    kick="1000000000100100", snare="0000000010000000", hihat="1131113113113131", perc="0000000100000010",
    bass_steps="1000000000100100", bass_pitch=[36,None,None,None,None,None,None,None,None,None,36,None,34,None,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,72,None,None,None,None,None,75,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="808_snare", bass_inst="808_bass", chord_inst="brass_synth", lead_inst="saw_lead"
)

PATTERNS["hard-trap"] = build_pattern(
    "hard-trap", 150, "F minor", 0,
    kick="1000001000000100", snare="0000000010000000", hihat="1131113113311133", perc="0000100000001000",
    bass_steps="1000001000000100", bass_pitch=[41,None,None,None,None,None,44,None,None,None,None,None,None,41,None,None],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0010001000100010", lead_pitch=[None,None,77,None,None,None,80,None,None,None,77,None,None,None,82,None],
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="808_snare", bass_inst="808_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["hybrid-trap"] = build_pattern(
    "hybrid-trap", 145, "E minor", 0,
    kick="1000000000100000", snare="0000000010000000", hihat="1111113111111331", perc="0000010000000010",
    bass_steps="0010110000101100", bass_pitch=[None,None,40,None,43,40,None,None,None,None,40,None,46,40,None,None],
    chord_steps="1000000000000000", chord_pitch=[64,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,76,None,None,None,None,None,79,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="saw_lead", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["wave"] = build_pattern(
    "wave", 130, "C minor", 0,
    kick="1000000000100000", snare="0000000010000000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000000010000000", bass_pitch=[36,None,None,None,None,None,None,None,39,None,None,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010010000100010", lead_pitch=[None,None,72,None,None,75,None,None,None,None,77,None,None,None,75,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="rimshot", bass_inst="reese_bass", chord_inst="warm_pad", lead_inst="pluck_synth"
)

PATTERNS["chicago-drill"] = build_pattern(
    "chicago-drill", 138, "G minor", 0,
    kick="1000000000100000", snare="0000000010000000", hihat="1131113111311331", perc="0000000100000010",
    bass_steps="1000000000100000", bass_pitch=[43,None,None,None,None,None,None,None,None,None,46,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[67,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,79,None,None,None,82,None,None,None,79,None,None,None,84,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="808_snare", bass_inst="808_bass", chord_inst="rhodes_ep", lead_inst="pluck_synth"
)

PATTERNS["uk-drill"] = build_pattern(
    "uk-drill", 141, "C minor", 0,
    kick="1000001000010000", snare="0000000010000100", hihat="1131131131311133", perc="0000010000000010",
    bass_steps="1000001000010000", bass_pitch=[36,None,None,None,None,None,48,None,None,None,None,39,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010000000100100", lead_pitch=[None,None,72,None,None,None,None,None,None,None,75,None,None,74,None,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="808_snare", bass_inst="808_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["brooklyn-drill"] = build_pattern(
    "brooklyn-drill", 142, "F minor", 0,
    kick="1000001000010000", snare="0000000010000100", hihat="1311311131311331", perc="0000001000000001",
    bass_steps="1000001000010000", bass_pitch=[41,None,None,None,None,None,53,None,None,None,None,44,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[65,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010010000100000", lead_pitch=[None,None,77,None,None,80,None,None,None,None,79,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="808_snare", bass_inst="808_bass", chord_inst="rhodes_ep", lead_inst="guitar_lead"
)

PATTERNS["jersey-drill"] = build_pattern(
    "jersey-drill", 140, "D minor", 0,
    kick="1000100000101010", snare="0000000010000100", hihat="1131113113311331", perc="0000000000101010",
    bass_steps="1000100000101010", bass_pitch=[38,None,None,None,38,None,None,None,None,None,41,None,38,None,43,None],
    chord_steps="1000000000000000", chord_pitch=[62,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,74,None,None,None,77,None,None,None,74,None,None,None,79,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="808_snare", bass_inst="808_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

# === UK BASS (8) ===
PATTERNS["uk-garage"] = build_pattern(
    "uk-garage", 132, "C minor", 35,
    kick="1000000000100000", snare="0000100000001000", hihat="0020002000200020", perc="0010000000010010",
    bass_steps="1000001000100000", bass_pitch=[36,None,None,None,None,None,48,None,None,None,39,None,None,None,None,None],
    chord_steps="0010000000100000", chord_pitch=[None,None,60,None,None,None,None,None,None,None,63,None,None,None,None,None],
    lead_steps="0000100000100100", lead_pitch=[None,None,None,None,72,None,None,None,None,None,75,None,None,74,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["2-step-garage"] = build_pattern(
    "2-step-garage", 134, "F minor", 45,
    kick="1000000000100000", snare="0000100000001000", hihat="1121112111211121", perc="0000001000000011",
    bass_steps="1000001000100000", bass_pitch=[41,None,None,None,None,None,53,None,None,None,44,None,None,None,None,None],
    chord_steps="1000000000100000", chord_pitch=[65,None,None,None,None,None,None,None,None,None,68,None,None,None,None,None],
    lead_steps="0010001000000010", lead_pitch=[None,None,77,None,None,None,80,None,None,None,None,None,None,None,79,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="rimshot", bass_inst="reese_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["speed-garage"] = build_pattern(
    "speed-garage", 138, "E minor", 20,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0001000000010000",
    bass_steps="0010010000100100", bass_pitch=[None,None,40,None,None,52,None,None,None,None,40,None,None,55,None,None],
    chord_steps="1000000000000000", chord_pitch=[64,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,76,None,None,None,None,None,None,None,79,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["grime"] = build_pattern(
    "grime", 140, "D minor", 0,
    kick="1000001000000010", snare="0000100000001000", hihat="1010101010101010", perc="0000000100000001",
    bass_steps="1000001010000010", bass_pitch=[38,None,None,None,None,None,38,None,41,None,None,None,None,None,38,None],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0010001000100010", lead_pitch=[None,None,74,None,None,None,77,None,None,None,74,None,None,None,79,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="square_lead", chord_inst="warm_pad", lead_inst="square_lead"
)

PATTERNS["bassline"] = build_pattern(
    "bassline", 140, "F minor", 15,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0001000000010000",
    bass_steps="0010100000101000", bass_pitch=[None,None,41,None,53,None,None,None,None,None,41,None,56,None,None,None],
    chord_steps="1000000010000000", chord_pitch=[65,None,None,None,None,None,None,None,68,None,None,None,None,None,None,None],
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,77,None,None,None,None,None,None,None,80,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="acid_303", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["uk-funky"] = build_pattern(
    "uk-funky", 130, "A minor", 10,
    kick="1000100010001000", snare="0001001000010010", hihat="1010101010101010", perc="1001010010010100",
    bass_steps="1000001010000010", bass_pitch=[45,None,None,None,None,None,48,None,45,None,None,None,None,None,50,None],
    chord_steps="0010000000100000", chord_pitch=[None,None,69,None,None,None,None,None,None,None,72,None,None,None,None,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,81,None,None,None,None,None,84,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["dub"] = build_pattern(
    "dub", 72, "G minor", 10,
    kick="0000000010000000", snare="0000000010000000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000000010000010", bass_pitch=[43,None,None,None,None,None,None,None,43,None,None,None,None,None,41,None],
    chord_steps="0010000000100000", chord_pitch=[None,None,67,None,None,None,None,None,None,None,70,None,None,None,None,None],
    lead_steps="0000000000100000", lead_pitch=[None,None,None,None,None,None,None,None,None,None,79,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="reggae_rim", bass_inst="sub_bass", chord_inst="m1_organ", lead_inst="flute_lead"
)

PATTERNS["speedbass"] = build_pattern(
    "speedbass", 145, "F minor", 10,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0010000000100000",
    bass_steps="0110011001100110", bass_pitch=[None,41,41,None,None,41,41,None,None,44,44,None,None,41,41,None],
    chord_steps="1000000000000000", chord_pitch=[65,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,77,None,None,None,80,None,None,None,77,None,None,None,82,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

print(f"Loaded {len(PATTERNS)} patterns in data_trap_ukbass")
