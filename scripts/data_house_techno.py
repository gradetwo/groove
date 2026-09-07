from scripts.builder import build_pattern

PATTERNS = {}

# === HOUSE (15) ===
PATTERNS["chicago-house"] = build_pattern(
    "chicago-house", 124, "C minor", 15,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0010000001000010",
    bass_steps="1001001010010100", bass_pitch=[36,None,None,36,None,None,38,None,36,None,None,41,None,43,None,None],
    chord_steps="1000001000100000", chord_pitch=[60,None,None,None,None,None,63,None,None,None,65,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,72,None,None,None,75,None,None,None,74,None,None,None,72,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="clap", bass_inst="sub_bass", chord_inst="m1_organ", lead_inst="saw_lead"
)

PATTERNS["deep-house"] = build_pattern(
    "deep-house", 122, "A minor", 20,
    kick="1000100010001000", snare="0000100000001000", hihat="1011102110111021", perc="0000001000000001",
    bass_steps="1000001000100000", bass_pitch=[45,None,None,None,None,None,48,None,None,None,45,None,None,None,None,None],
    chord_steps="0010000010000010", chord_pitch=[None,None,69,None,None,None,None,None,72,None,None,None,None,None,71,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,81,None,None,None,None,None,84,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="pluck_synth"
)

PATTERNS["tech-house"] = build_pattern(
    "tech-house", 126, "D minor", 10,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0010100100101001",
    bass_steps="1001001010010010", bass_pitch=[38,None,None,38,None,None,41,None,38,None,None,38,None,None,41,None],
    chord_steps="0000100000001000", chord_pitch=[None,None,None,None,62,None,None,None,None,None,None,None,65,None,None,None],
    lead_steps="0010000000100000", lead_pitch=[None,None,74,None,None,None,None,None,None,None,77,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["future-house"] = build_pattern(
    "future-house", 126, "E minor", 10,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0000000100000001",
    bass_steps="0101010101010101", bass_pitch=[None,40,None,40,None,43,None,40,None,45,None,43,None,40,None,43],
    chord_steps="1000000010000000", chord_pitch=[64,None,None,None,None,None,None,None,67,None,None,None,None,None,None,None],
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,76,None,None,None,None,None,None,None,79,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="clap", bass_inst="acid_303", chord_inst="supersaw", lead_inst="saw_lead"
)

PATTERNS["progressive-house"] = build_pattern(
    "progressive-house", 128, "F minor", 5,
    kick="1000100010001000", snare="0000100000001000", hihat="1121112111211121", perc="0000100000001000",
    bass_steps="1111111111111111", bass_pitch=[41,41,41,41,41,41,41,41,44,44,44,44,41,41,44,46],
    chord_steps="1000001000001000", chord_pitch=[65,None,None,None,None,None,68,None,None,None,None,None,65,None,None,None],
    lead_steps="0010001000100100", lead_pitch=[None,None,77,None,None,None,80,None,None,None,77,None,None,82,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="reese_bass", chord_inst="supersaw", lead_inst="saw_lead"
)

PATTERNS["electro-house"] = build_pattern(
    "electro-house", 128, "G minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0001000000010000",
    bass_steps="1010101010101010", bass_pitch=[43,None,43,None,46,None,43,None,48,None,46,None,43,None,46,None],
    chord_steps="1000000010000000", chord_pitch=[67,None,None,None,None,None,None,None,70,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,79,None,None,None,82,None,None,None,79,None,None,None,82,None],
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="clap", bass_inst="saw_lead", chord_inst="supersaw", lead_inst="saw_lead"
)

PATTERNS["bass-house"] = build_pattern(
    "bass-house", 128, "E minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="1010101010101010", perc="0000100000001000",
    bass_steps="0010110000101101", bass_pitch=[None,None,40,None,43,40,None,None,None,None,40,None,45,40,None,47],
    chord_steps="1000000000000000", chord_pitch=[64,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000001000000010", lead_pitch=[None,None,None,None,None,None,76,None,None,None,None,None,None,None,79,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="acid_303", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["ghetto-house"] = build_pattern(
    "ghetto-house", 138, "C minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="1111111111111111", perc="0010001000100010",
    bass_steps="1000100010001000", bass_pitch=[36,None,None,None,36,None,None,None,39,None,None,None,36,None,None,None],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0010001000100010", lead_pitch=[None,None,72,None,None,None,75,None,None,None,72,None,None,None,75,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="clap", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="square_lead"
)

PATTERNS["tropical-house"] = build_pattern(
    "tropical-house", 112, "C major", 10,
    kick="1000100010001000", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000001000001000", bass_pitch=[36,None,None,None,None,None,40,None,None,None,None,None,43,None,None,None],
    chord_steps="1000010000100000", chord_pitch=[60,None,None,None,None,64,None,None,None,None,67,None,None,None,None,None],
    lead_steps="0010010010000010", lead_pitch=[None,None,72,None,None,76,None,None,79,None,None,None,None,None,81,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="pluck_synth"
)

PATTERNS["acid-house"] = build_pattern(
    "acid-house", 125, "C minor", 10,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0001000000010000",
    bass_steps="1011010110110110", bass_pitch=[36,None,36,48,None,36,None,39,36,None,41,43,None,36,48,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,72,None,None,None,75,None,None,None,72,None,None,None,77,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="clap", bass_inst="acid_303", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["french-house"] = build_pattern(
    "french-house", 126, "A minor", 15,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0000100000001000",
    bass_steps="1001001010010010", bass_pitch=[45,None,None,45,None,None,48,None,45,None,None,45,None,None,50,None],
    chord_steps="1000010000100010", chord_pitch=[69,None,None,None,None,72,None,None,None,None,74,None,None,None,72,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,81,None,None,None,84,None,None,None,81,None,None,None,86,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="clap", bass_inst="slap_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["melodic-house"] = build_pattern(
    "melodic-house", 123, "F minor", 5,
    kick="1000100010001000", snare="0000100000001000", hihat="1010102010101020", perc="0000001000000001",
    bass_steps="1000001010000010", bass_pitch=[41,None,None,None,None,None,44,None,41,None,None,None,None,None,46,None],
    chord_steps="1000000010000000", chord_pitch=[65,None,None,None,None,None,None,None,68,None,None,None,None,None,None,None],
    lead_steps="0010010000100100", lead_pitch=[None,None,77,None,None,80,None,None,None,None,79,None,None,82,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="pluck_synth"
)

PATTERNS["afro-house"] = build_pattern(
    "afro-house", 122, "G minor", 15,
    kick="1000100010001000", snare="0000100000001000", hihat="1011101110111011", perc="1010010110100110",
    bass_steps="1000001000100000", bass_pitch=[43,None,None,None,None,None,46,None,None,None,43,None,None,None,None,None],
    chord_steps="0010000010000000", chord_pitch=[None,None,67,None,None,None,None,None,70,None,None,None,None,None,None,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,79,None,None,None,None,None,82,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="flute_lead"
)

PATTERNS["nu-disco-house"] = build_pattern(
    "nu-disco-house", 122, "A minor", 15,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="1000100010001000",
    bass_steps="1001001010010010", bass_pitch=[45,None,None,45,None,None,48,None,45,None,None,45,None,None,50,None],
    chord_steps="0010000000100000", chord_pitch=[None,None,69,None,None,None,None,None,None,None,72,None,None,None,None,None],
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,81,None,None,None,None,None,None,None,84,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="clap", bass_inst="slap_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["microhouse"] = build_pattern(
    "microhouse", 123, "C minor", 10,
    kick="1000100010001000", snare="0000100000001000", hihat="0010001000100010", perc="0100001000010000",
    bass_steps="1000000010000000", bass_pitch=[36,None,None,None,None,None,None,None,39,None,None,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,72,None,None,None,None,None,None,None,75,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="pluck_synth"
)

# === TECHNO (10) ===
PATTERNS["detroit-techno"] = build_pattern(
    "detroit-techno", 128, "C minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0000100000001000",
    bass_steps="1001001010010010", bass_pitch=[36,None,None,36,None,None,39,None,36,None,None,36,None,None,41,None],
    chord_steps="1000000010000000", chord_pitch=[60,None,None,None,None,None,None,None,63,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,72,None,None,None,75,None,None,None,74,None,None,None,77,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="clap", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["minimal-techno"] = build_pattern(
    "minimal-techno", 125, "A minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="1010101010101010", perc="0100001000010010",
    bass_steps="0010000000100000", bass_pitch=[None,None,45,None,None,None,None,None,None,None,48,None,None,None,None,None],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,81,None,None,None,None,None,None,None,84,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="pluck_synth"
)

PATTERNS["acid-techno"] = build_pattern(
    "acid-techno", 138, "D minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0001000000010000",
    bass_steps="1011010110110110", bass_pitch=[38,None,38,50,None,38,None,41,38,None,43,45,None,38,50,None],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="1101101101101101", lead_pitch=[74,74,None,77,74,None,79,74,None,81,74,None,77,74,None,82],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="acid_303", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["dub-techno"] = build_pattern(
    "dub-techno", 122, "C minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="0010001000100010", perc="0000001000000001",
    bass_steps="1000000010000000", bass_pitch=[36,None,None,None,None,None,None,None,36,None,None,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000000000100000", lead_pitch=[None,None,None,None,None,None,None,None,None,None,72,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["industrial-techno"] = build_pattern(
    "industrial-techno", 138, "E minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="1111111111111111", perc="0100100001001000",
    bass_steps="1111111111111111", bass_pitch=[40,40,40,40,40,40,40,40,43,43,43,43,40,40,45,46],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,76,None,None,None,None,None,None,None,79,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="tight_snare", bass_inst="reese_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["peak-time-techno"] = build_pattern(
    "peak-time-techno", 134, "F minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0000100000001000",
    bass_steps="1111111111111111", bass_pitch=[41,41,41,41,41,41,41,41,44,44,44,44,41,41,46,47],
    chord_steps="1000000010000000", chord_pitch=[65,None,None,None,None,None,None,None,68,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,77,None,None,None,80,None,None,None,77,None,None,None,82,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="clap", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["hard-techno"] = build_pattern(
    "hard-techno", 150, "G minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0010000000100000",
    bass_steps="1011101110111011", bass_pitch=[43,None,43,43,43,None,43,43,46,None,46,46,43,None,48,46],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,79,None,None,None,None,None,None,None,82,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="tight_snare", bass_inst="acid_303", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["ambient-techno"] = build_pattern(
    "ambient-techno", 120, "D minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="0010001000100010", perc="0000001000000001",
    bass_steps="1000000010000000", bass_pitch=[38,None,None,None,None,None,None,None,41,None,None,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[62,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,74,None,None,None,None,None,77,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["raw-techno"] = build_pattern(
    "raw-techno", 134, "A minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="1121112111211121", perc="0010000001000000",
    bass_steps="1001001010010010", bass_pitch=[45,None,None,45,None,None,48,None,45,None,None,45,None,None,50,None],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0010001000100010", lead_pitch=[None,None,81,None,None,None,84,None,None,None,81,None,None,None,86,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["schranz"] = build_pattern(
    "schranz", 155, "C minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="1111111111111111", perc="1001100110011001",
    bass_steps="1000100010001000", bass_pitch=[36,None,None,None,36,None,None,None,39,None,None,None,36,None,None,None],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0000000000000000", lead_pitch=[None]*16,
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

print(f"Loaded {len(PATTERNS)} patterns in data_house_techno")
