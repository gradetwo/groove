from scripts.builder import build_pattern

PATTERNS = {}

# === FUTURE & DOWNTEMPO (13) ===
PATTERNS["future-bass"] = build_pattern(
    "future-bass", 150, "F major", 0,
    kick="1000000000100000", snare="0000000010000000", hihat="1131113113111331", perc="0000000100000010",
    bass_steps="1000000000100000", bass_pitch=[41,None,None,None,None,None,None,None,None,None,41,None,None,None,None,None],
    chord_steps="1001001000100100", chord_pitch=[65,None,None,69,None,None,65,None,None,None,65,None,None,72,None,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,77,None,None,None,None,None,81,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="clap", bass_inst="808_bass", chord_inst="supersaw", lead_inst="saw_lead"
)

PATTERNS["kawaii-future-bass"] = build_pattern(
    "kawaii-future-bass", 155, "C major", 0,
    kick="1000000000100000", snare="0000000010000000", hihat="1131113111311331", perc="0000000100000010",
    bass_steps="1000000000100000", bass_pitch=[36,None,None,None,None,None,None,None,None,None,36,None,None,None,None,None],
    chord_steps="1001001000100100", chord_pitch=[60,None,None,64,None,None,60,None,None,None,60,None,None,67,None,None],
    lead_steps="0010001001001010", lead_pitch=[None,None,72,None,None,None,76,None,None,79,None,None,84,None,83,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="clap", bass_inst="808_bass", chord_inst="supersaw", lead_inst="pluck_synth"
)

PATTERNS["synthwave"] = build_pattern(
    "synthwave", 110, "A minor", 0,
    kick="1000000010000010", snare="0000100000001000", hihat="1010101010101010", perc="0000100000001000",
    bass_steps="1111111111111111", bass_pitch=[45,45,45,45,45,45,45,45,48,48,48,48,45,45,50,48],
    chord_steps="1000000010000000", chord_pitch=[69,None,None,None,None,None,None,None,72,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,81,None,None,None,84,None,None,None,81,None,None,None,86,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="brass_synth", lead_inst="saw_lead"
)

PATTERNS["vaporwave"] = build_pattern(
    "vaporwave", 84, "F major", 10,
    kick="1000001000100000", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000001000100000", bass_pitch=[41,None,None,None,None,None,45,None,None,None,41,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[65,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010000000100000", lead_pitch=[None,None,77,None,None,None,None,None,None,None,81,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["chillwave"] = build_pattern(
    "chillwave", 90, "G major", 15,
    kick="1000000010000000", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000000010000000", bass_pitch=[43,None,None,None,None,None,None,None,47,None,None,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[67,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,79,None,None,None,None,None,None,None,83,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="pluck_synth"
)

PATTERNS["downtempo"] = build_pattern(
    "downtempo", 95, "D minor", 20,
    kick="1000001000001000", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000001000001000", bass_pitch=[38,None,None,None,None,None,41,None,None,None,None,None,38,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[62,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010010000100000", lead_pitch=[None,None,74,None,None,77,None,None,None,None,79,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="walking_upright", chord_inst="rhodes_ep", lead_inst="flute_lead"
)

PATTERNS["trip-hop"] = build_pattern(
    "trip-hop", 85, "C minor", 25,
    kick="1000001000100000", snare="0000100000001000", hihat="1010101010101010", perc="0000000100000001",
    bass_steps="1000001000100000", bass_pitch=[36,None,None,None,None,None,39,None,None,None,36,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000001000000010", lead_pitch=[None,None,None,None,None,None,72,None,None,None,None,None,None,None,75,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["glitch-hop"] = build_pattern(
    "glitch-hop", 105, "E minor", 15,
    kick="1000001000100000", snare="0000100000001000", hihat="1131113111311131", perc="0100001000010010",
    bass_steps="1000001000100000", bass_pitch=[40,None,None,None,None,None,43,None,None,None,40,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[64,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010000000100000", lead_pitch=[None,None,76,None,None,None,None,None,None,None,79,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="saw_lead", chord_inst="warm_pad", lead_inst="square_lead"
)

PATTERNS["idm"] = build_pattern(
    "idm", 120, "D minor", 0,
    kick="1001001001001000", snare="0000100000001001", hihat="1131131131113311", perc="0100100100100100",
    bass_steps="1000001000100000", bass_pitch=[38,None,None,None,None,None,41,None,None,None,38,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[62,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010010010000010", lead_pitch=[None,None,74,None,None,77,None,None,81,None,None,None,None,None,79,None],
    fx_steps="1001000100100010",
    kick_inst="distorted_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="square_lead"
)

PATTERNS["ambient"] = build_pattern(
    "ambient", 70, "C major", 0,
    kick="0000000000000000", snare="0000000000000000", hihat="0000000000000000", perc="0000000000000000",
    bass_steps="1000000000000000", bass_pitch=[36,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000000010000000", lead_pitch=[None,None,None,None,None,None,None,None,72,None,None,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="flute_lead"
)

PATTERNS["ambient-dub"] = build_pattern(
    "ambient-dub", 95, "G minor", 10,
    kick="0000000010000000", snare="0000000010000000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000000010000010", bass_pitch=[43,None,None,None,None,None,None,None,43,None,None,None,None,None,41,None],
    chord_steps="0010000000100000", chord_pitch=[None,None,67,None,None,None,None,None,None,None,70,None,None,None,None,None],
    lead_steps="0000000000100000", lead_pitch=[None,None,None,None,None,None,None,None,None,None,79,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="reggae_rim", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="flute_lead"
)

PATTERNS["lofi-house"] = build_pattern(
    "lofi-house", 122, "A minor", 20,
    kick="1000100010001000", snare="0000100000001000", hihat="1011102110111021", perc="0010000001000010",
    bass_steps="1001001010010010", bass_pitch=[45,None,None,45,None,None,48,None,45,None,None,45,None,None,50,None],
    chord_steps="1000010000100000", chord_pitch=[69,None,None,None,None,72,None,None,None,None,74,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,81,None,None,None,84,None,None,None,81,None,None,None,86,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="clap", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["chiptune"] = build_pattern(
    "chiptune", 140, "C major", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="1010101010101010", perc="0000100000001000",
    bass_steps="1010101010101010", bass_pitch=[36,None,36,None,40,None,36,None,43,None,40,None,36,None,40,None],
    chord_steps="1000000010000000", chord_pitch=[60,None,None,None,None,None,None,None,64,None,None,None,None,None,None,None],
    lead_steps="1101101101101101", lead_pitch=[72,72,None,76,72,None,79,72,None,84,72,None,79,72,None,84],
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="tight_snare", bass_inst="square_lead", chord_inst="warm_pad", lead_inst="square_lead"
)

# === HIP HOP (11) ===
PATTERNS["old-school-hip-hop"] = build_pattern(
    "old-school-hip-hop", 102, "G minor", 15,
    kick="1000001000100000", snare="0000100000001000", hihat="1010101010101010", perc="0000100000001000",
    bass_steps="1000001000100000", bass_pitch=[43,None,None,None,None,None,46,None,None,None,43,None,None,None,None,None],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,79,None,None,None,None,None,None,None,82,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="808_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["boom-bap"] = build_pattern(
    "boom-bap", 92, "C minor", 35,
    kick="1000000000100000", snare="0000100000001000", hihat="1111111111111111", perc="0001001001000101",
    bass_steps="1000001000100000", bass_pitch=[36,None,None,None,None,None,39,None,None,None,36,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010001000000010", lead_pitch=[None,None,72,None,None,None,75,None,None,None,None,None,None,None,74,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="walking_upright", chord_inst="rhodes_ep", lead_inst="flute_lead"
)

PATTERNS["g-funk"] = build_pattern(
    "g-funk", 94, "A minor", 20,
    kick="1000001000100000", snare="0000100000001000", hihat="1010101010101010", perc="0000100000001000",
    bass_steps="1000001000100010", bass_pitch=[45,None,None,None,None,None,48,None,None,None,45,None,None,None,50,None],
    chord_steps="1000000000000000", chord_pitch=[69,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000001000000010", lead_pitch=[None,None,None,None,None,None,81,None,None,None,None,None,None,None,84,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="clap", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["trap-rap"] = build_pattern(
    "trap-rap", 140, "F minor", 0,
    kick="1000000000100100", snare="0000000010000000", hihat="1131113113113131", perc="0000000100000010",
    bass_steps="1000000000100100", bass_pitch=[41,None,None,None,None,None,None,None,None,None,41,None,44,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[65,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,77,None,None,None,None,None,80,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="808_snare", bass_inst="808_bass", chord_inst="warm_pad", lead_inst="pluck_synth"
)

PATTERNS["conscious-hip-hop"] = build_pattern(
    "conscious-hip-hop", 90, "E minor", 30,
    kick="1000000000100000", snare="0000100000001000", hihat="1111111111111111", perc="0010000010000010",
    bass_steps="1000001000100000", bass_pitch=[40,None,None,None,None,None,43,None,None,None,40,None,None,None,None,None],
    chord_steps="1000000000100000", chord_pitch=[64,None,None,None,None,None,None,None,None,None,67,None,None,None,None,None],
    lead_steps="0010010000100000", lead_pitch=[None,None,76,None,None,79,None,None,None,None,81,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="walking_upright", chord_inst="rhodes_ep", lead_inst="flute_lead"
)

PATTERNS["emo-rap"] = build_pattern(
    "emo-rap", 135, "C minor", 0,
    kick="1000000000100000", snare="0000000010000000", hihat="1131113111311131", perc="0000000100000010",
    bass_steps="1000000000100000", bass_pitch=[36,None,None,None,None,None,None,None,None,None,36,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010010000100010", lead_pitch=[None,None,72,None,None,75,None,None,None,None,77,None,None,None,75,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="clap", bass_inst="808_bass", chord_inst="warm_pad", lead_inst="guitar_lead"
)

PATTERNS["lofi-hip-hop"] = build_pattern(
    "lofi-hip-hop", 80, "F minor", 30,
    kick="1000000000100000", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000001000100000", bass_pitch=[41,None,None,None,None,None,44,None,None,None,41,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[65,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010010000100000", lead_pitch=[None,None,77,None,None,80,None,None,None,None,82,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="pluck_synth"
)

PATTERNS["east-coast-hip-hop"] = build_pattern(
    "east-coast-hip-hop", 94, "D minor", 25,
    kick="1000001000100000", snare="0000100000001000", hihat="1111111111111111", perc="0010000010000010",
    bass_steps="1000001000100000", bass_pitch=[38,None,None,None,None,None,41,None,None,None,38,None,None,None,None,None],
    chord_steps="1000000000001000", chord_pitch=[62,None,None,None,None,None,None,None,None,None,None,None,65,None,None,None],
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,74,None,None,None,None,None,None,None,77,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["west-coast-hip-hop"] = build_pattern(
    "west-coast-hip-hop", 95, "G minor", 20,
    kick="1000001000100000", snare="0000100000001000", hihat="1010101010101010", perc="0000100000001000",
    bass_steps="1000001010000010", bass_pitch=[43,None,None,None,None,None,46,None,43,None,None,None,None,None,48,None],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,79,None,None,None,None,None,None,None,82,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="clap", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["southern-hip-hop"] = build_pattern(
    "southern-hip-hop", 92, "F minor", 15,
    kick="1000001000100000", snare="0000100000001000", hihat="1131113111311131", perc="0001000000010000",
    bass_steps="1000001000100000", bass_pitch=[41,None,None,None,None,None,44,None,None,None,41,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[65,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,77,None,None,None,80,None,None,None,77,None,None,None,82,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="808_snare", bass_inst="808_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["cloud-rap"] = build_pattern(
    "cloud-rap", 125, "C minor", 0,
    kick="1000000000100000", snare="0000000010000000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000000000100000", bass_pitch=[36,None,None,None,None,None,None,None,None,None,36,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,72,None,None,None,None,None,None,None,75,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="rimshot", bass_inst="808_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

print(f"Loaded {len(PATTERNS)} patterns in data_future_hiphop")
