from scripts.builder import build_pattern

PATTERNS = {}

# === ROCK & METAL (17) ===
PATTERNS["rock-and-roll"] = build_pattern(
    "rock-and-roll", 145, "A major", 35,
    kick="1000000010000000", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000100010001000", bass_pitch=[45,None,None,None,49,None,None,None,52,None,None,None,54,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[69,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,81,None,None,None,84,None,None,None,81,None,None,None,86,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="walking_upright", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["blues-rock"] = build_pattern(
    "blues-rock", 120, "E minor", 20,
    kick="1000001010000000", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000001010000000", bass_pitch=[40,None,None,None,None,None,43,None,40,None,None,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[64,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010010000100010", lead_pitch=[None,None,76,None,None,79,None,None,None,None,81,None,None,None,79,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["hard-rock"] = build_pattern(
    "hard-rock", 125, "A minor", 0,
    kick="1000000010100000", snare="0000100000001000", hihat="1010101010102010", perc="0000100000001000",
    bass_steps="1000000010100000", bass_pitch=[45,None,None,None,None,None,None,None,45,None,48,None,None,None,None,None],
    chord_steps="1000000010000000", chord_pitch=[69,None,None,None,None,None,None,None,69,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,81,None,None,None,84,None,None,None,81,None,None,None,86,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["punk-rock"] = build_pattern(
    "punk-rock", 170, "E minor", 0,
    kick="1000100010100000", snare="0000100000001000", hihat="1010101010101010", perc="0000000000000000",
    bass_steps="1010101010101010", bass_pitch=[40,None,40,None,40,None,40,None,43,None,43,None,45,None,43,None],
    chord_steps="1010101010101010", chord_pitch=[64,None,64,None,64,None,64,None,67,None,67,None,69,None,67,None],
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,76,None,None,None,None,None,None,None,79,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["post-punk"] = build_pattern(
    "post-punk", 135, "D minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="1010101010101010", perc="0000100000001000",
    bass_steps="1001001010010010", bass_pitch=[50,None,None,50,None,None,53,None,50,None,None,50,None,None,55,None],
    chord_steps="0000000010000000", chord_pitch=[None,None,None,None,None,None,None,None,62,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,74,None,None,None,77,None,None,None,74,None,None,None,79,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["new-wave"] = build_pattern(
    "new-wave", 130, "A minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0000100000001000",
    bass_steps="1001001010010010", bass_pitch=[45,None,None,45,None,None,48,None,45,None,None,45,None,None,50,None],
    chord_steps="1000000010000000", chord_pitch=[69,None,None,None,None,None,None,None,72,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,81,None,None,None,84,None,None,None,81,None,None,None,86,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["heavy-metal"] = build_pattern(
    "heavy-metal", 130, "E minor", 0,
    kick="1000000010100000", snare="0000100000001000", hihat="1010101010101010", perc="0000100000001000",
    bass_steps="0110110110110110", bass_pitch=[None,40,40,None,40,40,None,43,43,None,43,43,None,40,40,None],
    chord_steps="1000000010000000", chord_pitch=[64,None,None,None,None,None,None,None,67,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,76,None,None,None,79,None,None,None,76,None,None,None,81,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["thrash-metal"] = build_pattern(
    "thrash-metal", 190, "E minor", 0,
    kick="1111111111111111", snare="0000100000001000", hihat="1010101010101010", perc="0000000000000000",
    bass_steps="1111111111111111", bass_pitch=[40,40,40,40,40,40,40,40,43,43,43,43,40,40,45,46],
    chord_steps="1000000010000000", chord_pitch=[64,None,None,None,None,None,None,None,67,None,None,None,None,None,None,None],
    lead_steps="0010010000100100", lead_pitch=[None,None,76,None,None,79,None,None,None,None,76,None,None,82,None,None],
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["death-metal"] = build_pattern(
    "death-metal", 200, "C minor", 0,
    kick="1010101010101010", snare="0101010101010101", hihat="1010101010101010", perc="0000000000000000",
    bass_steps="1111111111111111", bass_pitch=[36,36,36,36,36,36,36,36,39,39,39,39,36,36,42,41],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0010001000100010", lead_pitch=[None,None,72,None,None,None,75,None,None,None,72,None,None,None,78,None],
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["black-metal"] = build_pattern(
    "black-metal", 180, "E minor", 0,
    kick="1010101010101010", snare="0101010101010101", hihat="1111111111111111", perc="0000000000000000",
    bass_steps="1111111111111111", bass_pitch=[40,40,40,40,40,40,40,40,43,43,43,43,40,40,44,43],
    chord_steps="1111111111111111", chord_pitch=[64,64,64,64,64,64,64,64,67,67,67,67,64,64,68,67],
    lead_steps="0000000000000000", lead_pitch=[None]*16,
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["doom-metal"] = build_pattern(
    "doom-metal", 65, "C minor", 0,
    kick="1000000000000000", snare="0000000010000000", hihat="1000100010001000", perc="0000000000000000",
    bass_steps="1000000010000000", bass_pitch=[36,None,None,None,None,None,None,None,39,None,None,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000000000100000", lead_pitch=[None,None,None,None,None,None,None,None,None,None,72,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["metalcore"] = build_pattern(
    "metalcore", 145, "D minor", 0,
    kick="1010010010100010", snare="0000000010000000", hihat="1010101010101010", perc="0000000100000001",
    bass_steps="1010010010100010", bass_pitch=[38,None,38,None,None,41,None,None,38,None,38,None,None,None,41,None],
    chord_steps="1010010010100010", chord_pitch=[62,None,62,None,None,65,None,None,62,None,62,None,None,None,65,None],
    lead_steps="0000000000000000", lead_pitch=[None]*16,
    fx_steps="1000000000000000",
    kick_inst="distorted_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["grunge"] = build_pattern(
    "grunge", 110, "E minor", 10,
    kick="1000001000001000", snare="0000100000001000", hihat="1010102010101020", perc="0000001000000001",
    bass_steps="1000001000001000", bass_pitch=[40,None,None,None,None,None,43,None,None,None,None,None,40,None,None,None],
    chord_steps="1000000010000000", chord_pitch=[64,None,None,None,None,None,None,None,67,None,None,None,None,None,None,None],
    lead_steps="0010010000100000", lead_pitch=[None,None,76,None,None,79,None,None,None,None,81,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["alternative-rock"] = build_pattern(
    "alternative-rock", 120, "G major", 5,
    kick="1000001000100000", snare="0000100000001000", hihat="1010101010101010", perc="0000100000001000",
    bass_steps="1000001000100000", bass_pitch=[43,None,None,None,None,None,47,None,None,None,43,None,None,None,None,None],
    chord_steps="1000000010000000", chord_pitch=[67,None,None,None,None,None,None,None,71,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,79,None,None,None,83,None,None,None,79,None,None,None,84,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["progressive-rock"] = build_pattern(
    "progressive-rock", 120, "D minor", 0,
    kick="1000001000100100", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000001000100100", bass_pitch=[38,None,None,None,None,None,41,None,None,None,38,None,None,43,None,None],
    chord_steps="1000000000100000", chord_pitch=[62,None,None,None,None,None,None,None,None,None,65,None,None,None,None,None],
    lead_steps="0010010010000010", lead_pitch=[None,None,74,None,None,77,None,None,81,None,None,None,None,None,79,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="guitar_lead"
)

PATTERNS["math-rock"] = build_pattern(
    "math-rock", 130, "F major", 0,
    kick="1001001000100100", snare="0001000100010010", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1001001000100100", bass_pitch=[41,None,None,45,None,None,41,None,None,None,48,None,None,45,None,None],
    chord_steps="1000000000000000", chord_pitch=[65,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0101101001101001", lead_pitch=[None,77,None,81,77,None,84,None,None,81,82,None,77,None,None,86],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["shoe-gaze"] = build_pattern(
    "shoe-gaze", 108, "A major", 0,
    kick="1000001010000010", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000001010000010", bass_pitch=[45,None,None,None,None,None,49,None,45,None,None,None,None,None,52,None],
    chord_steps="1000000010000000", chord_pitch=[69,None,None,None,None,None,None,None,73,None,None,None,None,None,None,None],
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,81,None,None,None,None,None,None,None,85,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

# === JAZZ & BLUES (14) ===
PATTERNS["delta-blues"] = build_pattern(
    "delta-blues", 80, "E major", 40,
    kick="1000000010000000", snare="0000000000000000", hihat="0000000000000000", perc="0000100000001000",
    bass_steps="1000000010000000", bass_pitch=[40,None,None,None,None,None,None,None,47,None,None,None,None,None,None,None],
    chord_steps="1000100010001000", chord_pitch=[64,None,None,None,67,None,None,None,64,None,None,None,69,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,76,None,None,None,79,None,None,None,76,None,None,None,81,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="walking_upright", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["chicago-blues"] = build_pattern(
    "chicago-blues", 115, "A major", 35,
    kick="1000000010000000", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000100010001000", bass_pitch=[45,None,None,None,49,None,None,None,52,None,None,None,54,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[69,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010010000100010", lead_pitch=[None,None,81,None,None,84,None,None,None,None,86,None,None,None,84,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["texas-blues"] = build_pattern(
    "texas-blues", 128, "E major", 30,
    kick="1000001010000000", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000100010001000", bass_pitch=[40,None,None,None,44,None,None,None,47,None,None,None,49,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[64,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010010000100010", lead_pitch=[None,None,76,None,None,79,None,None,None,None,81,None,None,None,79,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["electric-blues"] = build_pattern(
    "electric-blues", 98, "B major", 35,
    kick="1000000010000000", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000001010000000", bass_pitch=[47,None,None,None,None,None,51,None,47,None,None,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[71,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,83,None,None,None,None,None,86,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="guitar_lead"
)

PATTERNS["traditional-jazz"] = build_pattern(
    "traditional-jazz", 125, "F major", 35,
    kick="1000000010000000", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000100010001000", bass_pitch=[41,None,None,None,45,None,None,None,48,None,None,None,50,None,None,None],
    chord_steps="0010000000100000", chord_pitch=[None,None,65,None,None,None,None,None,None,None,69,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,77,None,None,None,81,None,None,None,77,None,None,None,82,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="walking_upright", chord_inst="guitar_lead", lead_inst="saw_lead"
)

PATTERNS["bebop"] = build_pattern(
    "bebop", 210, "B-flat major", 35,
    kick="1000000000100000", snare="0000010000001000", hihat="1011101110111011", perc="0000001000000001",
    bass_steps="1000100010001000", bass_pitch=[46,None,None,None,50,None,None,None,53,None,None,None,55,None,None,None],
    chord_steps="1000000000100000", chord_pitch=[70,None,None,None,None,None,None,None,None,None,74,None,None,None,None,None],
    lead_steps="1101101101101101", lead_pitch=[82,85,None,89,86,None,82,85,None,91,89,None,86,85,None,82],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="walking_upright", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["hard-bop"] = build_pattern(
    "hard-bop", 128, "C minor", 35,
    kick="1000000010000000", snare="0000100000001000", hihat="1011101110111011", perc="0000001000000001",
    bass_steps="1000100010001000", bass_pitch=[36,None,None,None,40,None,None,None,43,None,None,None,45,None,None,None],
    chord_steps="1000000000100000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,63,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,72,None,None,None,75,None,None,None,72,None,None,None,77,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="walking_upright", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["cool-jazz"] = build_pattern(
    "cool-jazz", 105, "D minor", 35,
    kick="1000000000000000", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000100010001000", bass_pitch=[38,None,None,None,41,None,None,None,45,None,None,None,47,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[62,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,74,None,None,None,None,None,None,None,77,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="rimshot", bass_inst="walking_upright", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["modal-jazz"] = build_pattern(
    "modal-jazz", 115, "D Dorian", 25,
    kick="1000000010000000", snare="0000100000001000", hihat="1011101110111011", perc="0000001000000001",
    bass_steps="1000100010001000", bass_pitch=[38,None,None,None,38,None,None,None,45,None,None,None,38,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[62,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010010000100100", lead_pitch=[None,None,74,None,None,77,None,None,None,None,81,None,None,83,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="walking_upright", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["free-jazz"] = build_pattern(
    "free-jazz", 130, "Atonal", 0,
    kick="1001001000100100", snare="0010100010010001", hihat="1111111111111111", perc="0100100100100100",
    bass_steps="1000100010001000", bass_pitch=[45,None,None,None,48,None,None,None,51,None,None,None,54,None,None,None],
    chord_steps="0000000000000000", chord_pitch=[None]*16,
    lead_steps="0101101001101001", lead_pitch=[None,81,None,85,82,None,88,None,None,84,87,None,81,None,None,90],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="walking_upright", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["jazz-fusion"] = build_pattern(
    "jazz-fusion", 124, "E minor", 10,
    kick="1000001000100000", snare="0000100000001000", hihat="1010102010101020", perc="0010000000100000",
    bass_steps="1001001010010010", bass_pitch=[40,None,None,40,None,None,43,None,40,None,None,40,None,None,45,None],
    chord_steps="0010000000100000", chord_pitch=[None,None,64,None,None,None,None,None,None,None,67,None,None,None,None,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,76,None,None,None,None,None,79,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="slap_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["smooth-jazz"] = build_pattern(
    "smooth-jazz", 90, "F major", 25,
    kick="1000001000001000", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000001000001000", bass_pitch=[41,None,None,None,None,None,45,None,None,None,None,None,48,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[65,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010010000100000", lead_pitch=[None,None,77,None,None,81,None,None,None,None,82,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="flute_lead"
)

PATTERNS["acid-jazz"] = build_pattern(
    "acid-jazz", 118, "D minor", 20,
    kick="1000001000100000", snare="0000100000001000", hihat="1010102010101020", perc="0010000000100000",
    bass_steps="1001001010010010", bass_pitch=[38,None,None,38,None,None,41,None,38,None,None,38,None,None,43,None],
    chord_steps="0010000000100000", chord_pitch=[None,None,62,None,None,None,None,None,None,None,65,None,None,None,None,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,74,None,None,None,None,None,77,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="slap_bass", chord_inst="guitar_lead", lead_inst="saw_lead"
)

PATTERNS["gypsy-jazz"] = build_pattern(
    "gypsy-jazz", 200, "G major", 35,
    kick="1000000010000000", snare="0000000000000000", hihat="0000000000000000", perc="0000100000001000",
    bass_steps="1000100010001000", bass_pitch=[43,None,None,None,47,None,None,None,50,None,None,None,52,None,None,None],
    chord_steps="1000100010001000", chord_pitch=[67,None,None,None,71,None,None,None,67,None,None,None,74,None,None,None],
    lead_steps="0101101001101001", lead_pitch=[None,79,None,83,79,None,86,None,None,83,84,None,79,None,None,88],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="walking_upright", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

print(f"Loaded {len(PATTERNS)} patterns in data_rock_jazz")
