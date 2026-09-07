from scripts.builder import build_pattern

PATTERNS = {}

# === TRANCE (9) ===
PATTERNS["uplifting-trance"] = build_pattern(
    "uplifting-trance", 138, "F minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0000100000001000",
    bass_steps="0111011101110111", bass_pitch=[None,41,41,41,None,41,41,41,None,44,44,44,None,41,44,46],
    chord_steps="1000001000100000", chord_pitch=[65,None,None,None,None,None,68,None,None,None,65,None,None,None,None,None],
    lead_steps="0010001000100100", lead_pitch=[None,None,77,None,None,None,80,None,None,None,77,None,None,82,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="clap", bass_inst="sub_bass", chord_inst="supersaw", lead_inst="saw_lead"
)

PATTERNS["progressive-trance"] = build_pattern(
    "progressive-trance", 130, "A minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="1121112111211121", perc="0000001000000001",
    bass_steps="1011101110111011", bass_pitch=[45,None,45,45,45,None,45,45,48,None,48,48,45,None,50,48],
    chord_steps="1000000010000000", chord_pitch=[69,None,None,None,None,None,None,None,72,None,None,None,None,None,None,None],
    lead_steps="0010010000100100", lead_pitch=[None,None,81,None,None,84,None,None,None,None,83,None,None,86,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="pluck_synth"
)

PATTERNS["psytrance"] = build_pattern(
    "psytrance", 142, "E minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0100000101000010",
    bass_steps="0111011101110111", bass_pitch=[None,40,40,40,None,40,40,40,None,40,40,40,None,43,40,43],
    chord_steps="1000000000000000", chord_pitch=[64,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,76,None,None,None,79,None,None,None,76,None,None,None,81,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="acid_303", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["goa-trance"] = build_pattern(
    "goa-trance", 142, "D minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="1121112111211121", perc="0010000001000000",
    bass_steps="0111011101110111", bass_pitch=[None,38,38,38,None,38,38,38,None,38,38,38,None,41,38,42],
    chord_steps="1000000000000000", chord_pitch=[62,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010100100101100", lead_pitch=[None,None,74,None,75,None,None,78,None,None,77,None,74,75,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="acid_303", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["tech-trance"] = build_pattern(
    "tech-trance", 140, "F minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0001000000010000",
    bass_steps="0111011101110111", bass_pitch=[None,41,41,41,None,41,41,41,None,44,44,44,None,41,44,46],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,77,None,None,None,None,None,None,None,80,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["hard-trance"] = build_pattern(
    "hard-trance", 145, "G minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0010000000100000",
    bass_steps="0010001000100010", bass_pitch=[None,None,43,None,None,None,43,None,None,None,46,None,None,None,43,None],
    chord_steps="1000000010000000", chord_pitch=[67,None,None,None,None,None,None,None,70,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,79,None,None,None,82,None,None,None,79,None,None,None,84,None],
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="tight_snare", bass_inst="acid_303", chord_inst="supersaw", lead_inst="saw_lead"
)

PATTERNS["vocal-trance"] = build_pattern(
    "vocal-trance", 136, "A minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="1121112111211121", perc="0000100000001000",
    bass_steps="0111011101110111", bass_pitch=[None,45,45,45,None,45,45,45,None,48,48,48,None,45,48,50],
    chord_steps="1000001000001000", chord_pitch=[69,None,None,None,None,None,72,None,None,None,None,None,69,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,81,None,None,None,84,None,None,None,81,None,None,None,86,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="clap", bass_inst="sub_bass", chord_inst="supersaw", lead_inst="flute_lead"
)

PATTERNS["euro-trance"] = build_pattern(
    "euro-trance", 140, "C minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0000100000001000",
    bass_steps="0101010101010101", bass_pitch=[None,36,None,36,None,39,None,36,None,41,None,39,None,36,None,39],
    chord_steps="1000000010000000", chord_pitch=[60,None,None,None,None,None,None,None,63,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,72,None,None,None,75,None,None,None,72,None,None,None,77,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="clap", bass_inst="sub_bass", chord_inst="supersaw", lead_inst="saw_lead"
)

PATTERNS["dream-trance"] = build_pattern(
    "dream-trance", 134, "F minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="1121112111211121", perc="0000001000000001",
    bass_steps="0111011101110111", bass_pitch=[None,41,41,41,None,41,41,41,None,44,44,44,None,41,44,46],
    chord_steps="1000000010000000", chord_pitch=[65,None,None,None,None,None,None,None,68,None,None,None,None,None,None,None],
    lead_steps="1010101010101010", lead_pitch=[77,None,80,None,77,None,82,None,77,None,80,None,77,None,84,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="pluck_synth"
)

# === HARD ELECTRO (12) ===
PATTERNS["hardstyle"] = build_pattern(
    "hardstyle", 150, "F minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0000100000001000",
    bass_steps="0100010001000100", bass_pitch=[None,41,None,None,None,41,None,None,None,44,None,None,None,41,None,None],
    chord_steps="1000000010000000", chord_pitch=[65,None,None,None,None,None,None,None,68,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,77,None,None,None,80,None,None,None,77,None,None,None,82,None],
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="clap", bass_inst="saw_lead", chord_inst="supersaw", lead_inst="saw_lead"
)

PATTERNS["hardcore-gabber"] = build_pattern(
    "hardcore-gabber", 180, "E minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0010000000100000",
    bass_steps="1000100010001000", bass_pitch=[40,None,None,None,40,None,None,None,43,None,None,None,40,None,None,None],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,76,None,None,None,None,None,None,None,79,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["frenchcore"] = build_pattern(
    "frenchcore", 195, "D minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="1111111111111111", perc="0000100000001000",
    bass_steps="0100010001000100", bass_pitch=[None,38,None,None,None,38,None,None,None,41,None,None,None,38,None,None],
    chord_steps="1000000000000000", chord_pitch=[62,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,74,None,None,None,77,None,None,None,74,None,None,None,79,None],
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="supersaw", lead_inst="saw_lead"
)

PATTERNS["happy-hardcore"] = build_pattern(
    "happy-hardcore", 170, "C major", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0000100000001000",
    bass_steps="0100010001000100", bass_pitch=[None,36,None,None,None,36,None,None,None,40,None,None,None,36,None,None],
    chord_steps="1000000010000000", chord_pitch=[60,None,None,None,None,None,None,None,64,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,72,None,None,None,76,None,None,None,72,None,None,None,79,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="clap", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["moombahton"] = build_pattern(
    "moombahton", 110, "G minor", 5,
    kick="1000100010001000", snare="0001001000010010", hihat="1010101010101010", perc="0010000010000010",
    bass_steps="1000001010000010", bass_pitch=[43,None,None,None,None,None,46,None,43,None,None,None,None,None,48,None],
    chord_steps="0010000000100000", chord_pitch=[None,None,67,None,None,None,None,None,None,None,70,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,79,None,None,None,82,None,None,None,79,None,None,None,84,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="brass_synth", lead_inst="saw_lead"
)

PATTERNS["jersey-club"] = build_pattern(
    "jersey-club", 132, "C minor", 0,
    kick="1000100000101010", snare="0000100000001000", hihat="1010101010101010", perc="0000000000101010",
    bass_steps="1000100000101010", bass_pitch=[36,None,None,None,36,None,None,None,None,None,39,None,36,None,41,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,72,None,None,None,75,None,None,None,72,None,None,None,77,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="clap", bass_inst="808_bass", chord_inst="rhodes_ep", lead_inst="pluck_synth"
)

PATTERNS["footwork"] = build_pattern(
    "footwork", 160, "F minor", 0,
    kick="1001010010010100", snare="0000100000001000", hihat="1131113113111331", perc="0010000100100001",
    bass_steps="1000001010000010", bass_pitch=[41,None,None,None,None,None,44,None,41,None,None,None,None,None,46,None],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0010010000100100", lead_pitch=[None,None,77,None,None,80,None,None,None,None,77,None,None,82,None,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="rimshot", bass_inst="808_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["phonk"] = build_pattern(
    "phonk", 125, "F minor", 10,
    kick="1000001000100000", snare="0000100000001000", hihat="1111111111111131", perc="0000000100000001",
    bass_steps="1000001000100000", bass_pitch=[41,None,None,None,None,None,44,None,None,None,41,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[65,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="1001001001001000", lead_pitch=[77,None,None,80,None,None,77,None,None,82,None,None,77,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="808_snare", bass_inst="808_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["drift-phonk"] = build_pattern(
    "drift-phonk", 150, "E minor", 0,
    kick="1000001000100000", snare="0000100000001000", hihat="1131113113311331", perc="0000000100000001",
    bass_steps="1000001000100000", bass_pitch=[40,None,None,None,None,None,43,None,None,None,40,None,None,None,None,None],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="1010101010101010", lead_pitch=[76,None,79,None,76,None,82,None,76,None,79,None,76,None,84,None],
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="808_snare", bass_inst="distorted_kick", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["electro"] = build_pattern(
    "electro", 128, "D minor", 0,
    kick="1000001001000010", snare="0000100000001000", hihat="1010101010101010", perc="0001000000010000",
    bass_steps="1000001001000010", bass_pitch=[38,None,None,None,None,None,41,None,None,38,None,None,None,None,43,None],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0010001000100010", lead_pitch=[None,None,74,None,None,None,77,None,None,None,74,None,None,None,79,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="808_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["breakbeat"] = build_pattern(
    "breakbeat", 134, "A minor", 10,
    kick="1000001000100000", snare="0000100000001000", hihat="1111112111111121", perc="0010000010000010",
    bass_steps="1000001000100000", bass_pitch=[45,None,None,None,None,None,48,None,None,None,45,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[69,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,81,None,None,None,None,None,84,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["big-beat"] = build_pattern(
    "big-beat", 130, "E minor", 0,
    kick="1000001000100000", snare="0000100000001000", hihat="1010101010101010", perc="0100001001000010",
    bass_steps="1000001000100000", bass_pitch=[40,None,None,None,None,None,43,None,None,None,40,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[64,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,76,None,None,None,None,None,None,None,79,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="acoustic_snare", bass_inst="reese_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

print(f"Loaded {len(PATTERNS)} patterns in data_trance_hard")
