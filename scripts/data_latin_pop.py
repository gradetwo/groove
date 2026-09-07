from scripts.builder import build_pattern

PATTERNS = {}

# === LATIN & WORLD (11) ===
PATTERNS["salsa"] = build_pattern(
    "salsa", 100, "C minor", 0,
    kick="0000001000000010", snare="0000100000001000", hihat="1010101010101010", perc="1001001000101000",
    bass_steps="0000001000000010", bass_pitch=[None,None,None,None,None,None,36,None,None,None,None,None,None,None,43,None],
    chord_steps="1001001001001000", chord_pitch=[60,None,None,63,None,None,67,None,None,60,None,None,63,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,72,None,None,None,75,None,None,None,72,None,None,None,77,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="acoustic_snare", bass_inst="walking_upright", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["bachata"] = build_pattern(
    "bachata", 130, "A minor", 10,
    kick="1000100010001000", snare="0000000000001010", hihat="1111111111111111", perc="0000100000001000",
    bass_steps="1000001010000010", bass_pitch=[45,None,None,None,None,None,48,None,45,None,None,None,None,None,50,None],
    chord_steps="1010101010101010", chord_pitch=[69,None,72,None,69,None,76,None,69,None,72,None,69,None,77,None],
    lead_steps="0010010000100010", lead_pitch=[None,None,81,None,None,84,None,None,None,None,81,None,None,None,86,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="guitar_lead", lead_inst="guitar_lead"
)

PATTERNS["reggae"] = build_pattern(
    "reggae", 78, "G minor", 10,
    kick="0000000010000000", snare="0000000010000000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000000010000010", bass_pitch=[43,None,None,None,None,None,None,None,43,None,None,None,None,None,41,None],
    chord_steps="0010000000100000", chord_pitch=[None,None,67,None,None,None,None,None,None,None,70,None,None,None,None,None],
    lead_steps="0000000000100000", lead_pitch=[None,None,None,None,None,None,None,None,None,None,79,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="reggae_rim", bass_inst="sub_bass", chord_inst="m1_organ", lead_inst="flute_lead"
)

PATTERNS["dancehall"] = build_pattern(
    "dancehall", 100, "F minor", 5,
    kick="1000001000100000", snare="0001001000010010", hihat="1010101010101010", perc="0010000010000010",
    bass_steps="1000001000100000", bass_pitch=[41,None,None,None,None,None,44,None,None,None,41,None,None,None,None,None],
    chord_steps="0010000000100000", chord_pitch=[None,None,65,None,None,None,None,None,None,None,68,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,77,None,None,None,80,None,None,None,77,None,None,None,82,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["reggaeton"] = build_pattern(
    "reggaeton", 95, "C minor", 5,
    kick="1000100010001000", snare="0001001000010010", hihat="1010101010101010", perc="0000000100000001",
    bass_steps="1000001010000010", bass_pitch=[36,None,None,None,None,None,39,None,36,None,None,None,None,None,41,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,72,None,None,None,75,None,None,None,72,None,None,None,77,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["afrobeat"] = build_pattern(
    "afrobeat", 115, "A minor", 15,
    kick="1000001001000010", snare="0000100000001000", hihat="1111111111111111", perc="1010010110100110",
    bass_steps="1000001010000010", bass_pitch=[45,None,None,None,None,None,48,None,45,None,None,None,None,None,50,None],
    chord_steps="0010000000100000", chord_pitch=[None,None,69,None,None,None,None,None,None,None,72,None,None,None,None,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,81,None,None,None,None,None,84,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="slap_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["amapiano"] = build_pattern(
    "amapiano", 113, "E minor", 10,
    kick="1000000010000000", snare="0000100000001000", hihat="1111111111111111", perc="0010000001000010",
    bass_steps="1001010000101000", bass_pitch=[40,None,None,43,None,40,None,None,None,None,40,None,45,None,None,None],
    chord_steps="1000000010000000", chord_pitch=[64,None,None,None,None,None,None,None,67,None,None,None,None,None,None,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,76,None,None,None,None,None,79,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="flute_lead"
)

PATTERNS["bossa-nova"] = build_pattern(
    "bossa-nova", 130, "D minor", 15,
    kick="1000000010000000", snare="1001001000100100", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000000010000000", bass_pitch=[38,None,None,None,None,None,None,None,45,None,None,None,None,None,None,None],
    chord_steps="1001001000100100", chord_pitch=[62,None,None,65,None,None,69,None,None,None,62,None,None,65,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,74,None,None,None,77,None,None,None,74,None,None,None,79,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="rimshot", bass_inst="walking_upright", chord_inst="guitar_lead", lead_inst="flute_lead"
)

PATTERNS["samba"] = build_pattern(
    "samba", 105, "G major", 10,
    kick="0000001010000010", snare="1111111111111111", hihat="1010101010101010", perc="1010010110100110",
    bass_steps="1000001010000010", bass_pitch=[43,None,None,None,None,None,47,None,43,None,None,None,None,None,50,None],
    chord_steps="1000010000100000", chord_pitch=[67,None,None,None,None,71,None,None,None,None,74,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,79,None,None,None,83,None,None,None,79,None,None,None,84,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="walking_upright", chord_inst="guitar_lead", lead_inst="flute_lead"
)

PATTERNS["cumbia"] = build_pattern(
    "cumbia", 95, "A minor", 10,
    kick="1000001010000010", snare="0000100000001000", hihat="1111111111111111", perc="1000100010001000",
    bass_steps="1000001010000010", bass_pitch=[45,None,None,None,None,None,48,None,45,None,None,None,None,None,52,None],
    chord_steps="0010000000100000", chord_pitch=[None,None,69,None,None,None,None,None,None,None,72,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,81,None,None,None,84,None,None,None,81,None,None,None,86,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["kuduro"] = build_pattern(
    "kuduro", 140, "D minor", 5,
    kick="1000100010001000", snare="0001001000010010", hihat="1111111111111111", perc="1001010010010100",
    bass_steps="1000001010000010", bass_pitch=[38,None,None,None,None,None,41,None,38,None,None,None,None,None,43,None],
    chord_steps="1000000000000000", chord_pitch=[62,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,74,None,None,None,77,None,None,None,74,None,None,None,79,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

# === POP & RNB (13) ===
PATTERNS["traditional-pop"] = build_pattern(
    "traditional-pop", 115, "C major", 35,
    kick="1000000010000000", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000100010001000", bass_pitch=[36,None,None,None,40,None,None,None,43,None,None,None,45,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,72,None,None,None,76,None,None,None,72,None,None,None,79,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="rimshot", bass_inst="walking_upright", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["synth-pop"] = build_pattern(
    "synth-pop", 120, "A minor", 0,
    kick="1000000010000010", snare="0000100000001000", hihat="1010101010101010", perc="0000100000001000",
    bass_steps="1111111111111111", bass_pitch=[45,45,45,45,45,45,45,45,48,48,48,48,45,45,50,48],
    chord_steps="1000000010000000", chord_pitch=[69,None,None,None,None,None,None,None,72,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,81,None,None,None,84,None,None,None,81,None,None,None,86,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="saw_lead"
)

PATTERNS["disco"] = build_pattern(
    "disco", 122, "D minor", 10,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="1000100010001000",
    bass_steps="1001001010010010", bass_pitch=[38,None,None,38,None,None,41,None,38,None,None,38,None,None,43,None],
    chord_steps="0010000000100000", chord_pitch=[None,None,62,None,None,None,None,None,None,None,65,None,None,None,None,None],
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,74,None,None,None,None,None,None,None,77,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="clap", bass_inst="slap_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["eurodance"] = build_pattern(
    "eurodance", 140, "C minor", 0,
    kick="1000100010001000", snare="0000100000001000", hihat="0020002000200020", perc="0000100000001000",
    bass_steps="0101010101010101", bass_pitch=[None,36,None,36,None,39,None,36,None,41,None,39,None,36,None,39],
    chord_steps="1000000010000000", chord_pitch=[60,None,None,None,None,None,None,None,63,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,72,None,None,None,75,None,None,None,72,None,None,None,77,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="clap", bass_inst="sub_bass", chord_inst="supersaw", lead_inst="saw_lead"
)

PATTERNS["funk"] = build_pattern(
    "funk", 108, "E minor", 25,
    kick="1000001001000010", snare="0000100100001001", hihat="1111111111111111", perc="0010000000100000",
    bass_steps="1000001001000010", bass_pitch=[40,None,None,None,None,None,43,None,None,40,None,None,None,None,45,None],
    chord_steps="0010000000100000", chord_pitch=[None,None,64,None,None,None,None,None,None,None,67,None,None,None,None,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,76,None,None,None,None,None,79,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="tight_snare", bass_inst="slap_bass", chord_inst="guitar_lead", lead_inst="saw_lead"
)

PATTERNS["soul"] = build_pattern(
    "soul", 95, "G major", 30,
    kick="1000001000001000", snare="0000100000001000", hihat="1010101010101010", perc="0000100000001000",
    bass_steps="1000001000100000", bass_pitch=[43,None,None,None,None,None,47,None,None,None,43,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[67,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,79,None,None,None,83,None,None,None,79,None,None,None,84,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="sub_bass", chord_inst="m1_organ", lead_inst="saw_lead"
)

PATTERNS["neo-soul"] = build_pattern(
    "neo-soul", 84, "F minor", 45,
    kick="1000000000100000", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000001000100000", bass_pitch=[41,None,None,None,None,None,44,None,None,None,41,None,None,None,None,None],
    chord_steps="1000000000100000", chord_pitch=[65,None,None,None,None,None,None,None,None,None,68,None,None,None,None,None],
    lead_steps="0010010000100000", lead_pitch=[None,None,77,None,None,80,None,None,None,None,82,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="pluck_synth"
)

PATTERNS["contemporary-rnb"] = build_pattern(
    "contemporary-rnb", 98, "C minor", 20,
    kick="1000001000100000", snare="0000100000001000", hihat="1010101010101031", perc="0000001000000001",
    bass_steps="1000001000100000", bass_pitch=[36,None,None,None,None,None,39,None,None,None,36,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[60,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,72,None,None,None,75,None,None,None,72,None,None,None,77,None],
    fx_steps="1000000000000000",
    kick_inst="808_kick", snare_inst="clap", bass_inst="808_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["alternative-rnb"] = build_pattern(
    "alternative-rnb", 90, "E minor", 15,
    kick="1000000000100000", snare="0000100000001000", hihat="1010101010101010", perc="0000001000000001",
    bass_steps="1000000000100000", bass_pitch=[40,None,None,None,None,None,None,None,None,None,40,None,None,None,None,None],
    chord_steps="1000000000000000", chord_pitch=[64,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,76,None,None,None,None,None,None,None,79,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="sub_kick", snare_inst="rimshot", bass_inst="sub_bass", chord_inst="warm_pad", lead_inst="guitar_lead"
)

PATTERNS["motown"] = build_pattern(
    "motown", 125, "G major", 15,
    kick="1000001010000010", snare="0000100000001000", hihat="1010101010101010", perc="1010101010101010",
    bass_steps="1001001010010010", bass_pitch=[43,None,None,43,None,None,47,None,43,None,None,43,None,None,50,None],
    chord_steps="1000000000000000", chord_pitch=[67,None,None,None,None,None,None,None,None,None,None,None,None,None,None,None],
    lead_steps="0000100000001000", lead_pitch=[None,None,None,None,79,None,None,None,None,None,None,None,83,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="acoustic_snare", bass_inst="walking_upright", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

PATTERNS["city-pop"] = build_pattern(
    "city-pop", 120, "D major", 15,
    kick="1000001000100000", snare="0000100000001000", hihat="1010102010101020", perc="0010000000100000",
    bass_steps="1001001010010010", bass_pitch=[38,None,None,38,None,None,42,None,38,None,None,38,None,None,45,None],
    chord_steps="0010000000100000", chord_pitch=[None,None,62,None,None,None,None,None,None,None,66,None,None,None,None,None],
    lead_steps="0000100000100000", lead_pitch=[None,None,None,None,74,None,None,None,None,None,78,None,None,None,None,None],
    fx_steps="1000000000000000",
    kick_inst="acoustic_kick", snare_inst="tight_snare", bass_inst="slap_bass", chord_inst="rhodes_ep", lead_inst="guitar_lead"
)

PATTERNS["k-pop"] = build_pattern(
    "k-pop", 126, "A minor", 5,
    kick="1000100010001000", snare="0000100000001000", hihat="1010102010101020", perc="0000100000001000",
    bass_steps="1001001010010010", bass_pitch=[45,None,None,45,None,None,48,None,45,None,None,45,None,None,50,None],
    chord_steps="1000000010000000", chord_pitch=[69,None,None,None,None,None,None,None,72,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,81,None,None,None,84,None,None,None,81,None,None,None,86,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="clap", bass_inst="sub_bass", chord_inst="supersaw", lead_inst="saw_lead"
)

PATTERNS["j-pop"] = build_pattern(
    "j-pop", 132, "F major", 5,
    kick="1000001010000010", snare="0000100000001000", hihat="1111112111111121", perc="0000100000001000",
    bass_steps="1001001010010010", bass_pitch=[41,None,None,41,None,None,45,None,41,None,None,41,None,None,48,None],
    chord_steps="1000000010000000", chord_pitch=[65,None,None,None,None,None,None,None,69,None,None,None,None,None,None,None],
    lead_steps="0010001000100010", lead_pitch=[None,None,77,None,None,None,81,None,None,None,77,None,None,None,82,None],
    fx_steps="1000000000000000",
    kick_inst="punchy_kick", snare_inst="tight_snare", bass_inst="sub_bass", chord_inst="rhodes_ep", lead_inst="saw_lead"
)

print(f"Loaded {len(PATTERNS)} patterns in data_latin_pop")
