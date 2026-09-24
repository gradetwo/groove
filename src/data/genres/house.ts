import { Genre } from '../../types/genre';

export const HOUSE_GENRES: Genre[] = [
  {
    "id": "chicago-house",
    "name": "Chicago House",
    "aliases": [
      "芝加哥浩室"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1984",
    "origin_decade": 1980,
    "origin_place": {
      "en": "Chicago, USA",
      "zh": "美国芝加哥"
    },
    "cultural_context": {
      "en": "Pioneered at The Warehouse club, turning disco into hypnotic 4/4 electronic drum workouts.",
      "zh": "发源于芝加哥 The Warehouse 俱乐部，将迪斯科改造为催眠的四四拍电子鼓机律动。"
    },
    "bpm_range": "120–128 BPM",
    "default_bpm": 124,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–III–VII",
      "i–iv–VII–III"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "M1 Organ Bass Stabs",
      "Analog Synth Lead",
      "Sub Bass",
      "TR-909 Hats & Kicks"
    ],
    "sound_design": {
      "en": "TR-909 open hats, punchy analog kicks, Korg M1 organ bass stabs.",
      "zh": "Roland TR-909 反拍开镲、厚重模拟底鼓与 Korg M1 风琴贝斯切片。"
    },
    "rhythm_features": {
      "en": "Four-on-the-floor kick with 16th swing claps and offbeat open hi-hats.",
      "zh": "四踩四底鼓配合带摇摆的十六分音符拍手与反拍开镲。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Chicago House signature kick character.",
        "zh": "Chicago House 风格代表性底鼓特征。"
      },
      "snare_clap": {
        "en": "Layered snare and clap with crisp mid-high punch.",
        "zh": "叠层军鼓与拍手，带有扎实的中高频瞬态。"
      },
      "hihats": {
        "en": "Closed and open hi-hats providing drive and syncopation.",
        "zh": "闭镲与开镲交替提供推进力与切分感。"
      },
      "percussion": {
        "en": "Supplementary rhythmic accents and foley.",
        "zh": "辅助打击乐加花与质感点缀。"
      },
      "swing": {
        "en": "Typical swing around 15%.",
        "zh": "典型摇摆度约 15%。"
      },
      "tempo": "120–128 BPM"
    },
    "bass_pattern": {
      "en": "Walking organ or analog basslines with octave leaps locked to kick.",
      "zh": "八度跳跃的行进风琴或模拟低音线条，与底鼓紧密贴合。"
    },
    "structure": [
      "Intro",
      "Verse / Groove",
      "Build",
      "Drop / Chorus",
      "Breakdown",
      "Drop 2",
      "Outro"
    ],
    "production_tips": {
      "en": [
        "Tune kick to 55Hz",
        "Apply 55% swing",
        "Use M1 organ stabs"
      ],
      "zh": [
        "底鼓调至 55Hz",
        "应用 55% 摇摆度",
        "使用 M1 风琴和弦切片"
      ]
    },
    "representative_tracks": [
      {
        "title": "Chicago House Anthem",
        "artist": "Frankie Knuckles",
        "year": 1984,
        "link": "https://www.youtube.com/results?search_query=Frankie+Knuckles+Chicago+House"
      },
      {
        "title": "Midnight in Chicago",
        "artist": "Marshall Jefferson",
        "year": 1986,
        "link": "https://www.youtube.com/results?search_query=Marshall+Jefferson+Chicago+House"
      },
      {
        "title": "Echoes of Chicago House",
        "artist": "Larry Heard",
        "year": 1988,
        "link": "https://www.youtube.com/results?search_query=Larry+Heard+Chicago+House"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Ron Hardy",
        "year": 1990,
        "link": "https://www.youtube.com/results?search_query=Ron+Hardy+Chicago+House"
      },
      {
        "title": "Essential Chicago House",
        "artist": "Chip E.",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=Chip+E.+Chicago+House"
      }
    ],
    "representative_artists": [
      "Frankie Knuckles",
      "Marshall Jefferson",
      "Larry Heard",
      "Ron Hardy",
      "Chip E."
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 8,
      "brightness": 8,
      "harmonicComplexity": 4,
      "rhythmDensity": 7,
      "bassEnergy": 6,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "chicago-house",
      "bpm": 124,
      "scale": "C minor",
      "swing": 15,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "punchy_kick",
          "steps": [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "snare",
          "name": "Snare / Clap",
          "instrument": "clap",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0
          ],
          "volume": 0.85,
          "pan": 0
        },
        {
          "track_id": "hihat",
          "name": "Hi-Hats",
          "instrument": "closed_hat",
          "steps": [
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0
          ],
          "velocity": [
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0
          ],
          "volume": 0.7,
          "pan": -0.2
        },
        {
          "track_id": "percussion",
          "name": "Percussion",
          "instrument": "rim_shaker",
          "steps": [
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0
          ],
          "velocity": [
            0,
            0,
            70,
            0,
            0,
            0,
            0,
            0,
            0,
            55,
            0,
            0,
            0,
            0,
            70,
            0
          ],
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "sub_bass",
          "steps": [
            1,
            0,
            0,
            1,
            0,
            0,
            1,
            0,
            1,
            0,
            0,
            1,
            0,
            1,
            0,
            0
          ],
          "pitch": [
            36,
            null,
            null,
            36,
            null,
            null,
            38,
            null,
            36,
            null,
            null,
            41,
            null,
            43,
            null,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "m1_organ",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            60,
            null,
            null,
            null,
            null,
            null,
            63,
            null,
            null,
            null,
            65,
            null,
            null,
            null,
            null,
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "saw_lead",
          "steps": [
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0
          ],
          "pitch": [
            null,
            null,
            72,
            null,
            null,
            null,
            75,
            null,
            null,
            null,
            74,
            null,
            null,
            null,
            72,
            null
          ],
          "volume": 0.8,
          "pan": 0.1
        },
        {
          "track_id": "fx",
          "name": "FX / Sweep",
          "instrument": "noise_sweep",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "volume": 0.6,
          "pan": 0
        }
      ]
    }
  },
  {
    "id": "deep-house",
    "name": "Deep House",
    "aliases": [
      "深邃浩室"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1985",
    "origin_decade": 1980,
    "origin_place": {
      "en": "Chicago & NY, USA",
      "zh": "美国芝加哥与纽约"
    },
    "cultural_context": {
      "en": "Infuses house with sophisticated jazz chords, soulful Rhodes, and ambient warmth.",
      "zh": "将复杂的爵士和弦、深情的 Rhodes 电钢琴与氛围深度注入浩室。"
    },
    "bpm_range": "120–125 BPM",
    "default_bpm": 122,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "ii–V–I",
      "vi–ii–V–I"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Fender Rhodes Chords",
      "Plucked Synth Arps",
      "Warm Sine Sub Bass",
      "Low-Pass Filtered Pads"
    ],
    "sound_design": {
      "en": "Fender Rhodes chords, low-pass filtered pads, warm sine sub-bass.",
      "zh": "Fender Rhodes 电钢琴、低通滤波铺底与纯净正弦波 Sub 贝斯。"
    },
    "rhythm_features": {
      "en": "Laid-back, slightly behind-the-beat 4/4 groove with pillowy kicks.",
      "zh": "从容放松、微带后倾的四四拍律动，搭配柔软底鼓与有机木质打击乐。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Deep House signature kick character.",
        "zh": "Deep House 风格代表性底鼓特征。"
      },
      "snare_clap": {
        "en": "Layered snare and clap with crisp mid-high punch.",
        "zh": "叠层军鼓与拍手，带有扎实的中高频瞬态。"
      },
      "hihats": {
        "en": "Closed and open hi-hats providing drive and syncopation.",
        "zh": "闭镲与开镲交替提供推进力与切分感。"
      },
      "percussion": {
        "en": "Supplementary rhythmic accents and foley.",
        "zh": "辅助打击乐加花与质感点缀。"
      },
      "swing": {
        "en": "Typical swing around 15%.",
        "zh": "典型摇摆度约 15%。"
      },
      "tempo": "120–125 BPM"
    },
    "bass_pattern": {
      "en": "Melodic sine sub lines weaving under minor 9th jazz chord changes.",
      "zh": "深沉悠扬的正弦波低音线条，在小九度爵士和弦变换下方游走穿梭。"
    },
    "structure": [
      "Intro",
      "Verse / Groove",
      "Build",
      "Drop / Chorus",
      "Breakdown",
      "Drop 2",
      "Outro"
    ],
    "production_tips": {
      "en": [
        "Stack minor 9th chords",
        "Filter cutoff down to 800Hz",
        "Attenuate kick above 3kHz"
      ],
      "zh": [
        "堆叠小九和弦",
        "低通滤波截止压在 800Hz",
        "衰减底鼓 3kHz 以上高频"
      ]
    },
    "representative_tracks": [
      {
        "title": "Deep House Anthem",
        "artist": "Larry Heard",
        "year": 1985,
        "link": "https://www.youtube.com/results?search_query=Larry+Heard+Deep+House"
      },
      {
        "title": "Midnight in Chicago & NY",
        "artist": "Kerri Chandler",
        "year": 1987,
        "link": "https://www.youtube.com/results?search_query=Kerri+Chandler+Deep+House"
      },
      {
        "title": "Echoes of Deep House",
        "artist": "Theo Parrish",
        "year": 1989,
        "link": "https://www.youtube.com/results?search_query=Theo+Parrish+Deep+House"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Moodymann",
        "year": 1991,
        "link": "https://www.youtube.com/results?search_query=Moodymann+Deep+House"
      },
      {
        "title": "Essential Deep House",
        "artist": "Maya Jane Coles",
        "year": 1993,
        "link": "https://www.youtube.com/results?search_query=Maya+Jane+Coles+Deep+House"
      }
    ],
    "representative_artists": [
      "Larry Heard",
      "Kerri Chandler",
      "Theo Parrish",
      "Moodymann",
      "Maya Jane Coles"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 10,
      "brightness": 4,
      "harmonicComplexity": 4,
      "rhythmDensity": 7,
      "bassEnergy": 9,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "deep-house",
      "bpm": 122,
      "scale": "A minor",
      "swing": 20,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "sub_kick",
          "steps": [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "snare",
          "name": "Snare / Clap",
          "instrument": "rimshot",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0
          ],
          "volume": 0.85,
          "pan": 0
        },
        {
          "track_id": "hihat",
          "name": "Hi-Hats",
          "instrument": "closed_hat",
          "steps": [
            1,
            0,
            1,
            1,
            1,
            0,
            2,
            1,
            1,
            0,
            1,
            1,
            1,
            0,
            2,
            1
          ],
          "velocity": [
            90,
            0,
            70,
            50,
            90,
            0,
            90,
            50,
            90,
            0,
            70,
            50,
            90,
            0,
            90,
            50
          ],
          "volume": 0.7,
          "pan": -0.2
        },
        {
          "track_id": "percussion",
          "name": "Percussion",
          "instrument": "rim_shaker",
          "steps": [
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            0,
            0,
            70,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            55
          ],
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "sub_bass",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            45,
            null,
            null,
            null,
            null,
            null,
            48,
            null,
            null,
            null,
            45,
            null,
            null,
            null,
            null,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "rhodes_ep",
          "steps": [
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0
          ],
          "pitch": [
            null,
            null,
            69,
            null,
            null,
            null,
            null,
            null,
            72,
            null,
            null,
            null,
            null,
            null,
            71,
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "pluck_synth",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            null,
            null,
            null,
            null,
            81,
            null,
            null,
            null,
            null,
            null,
            84,
            null,
            null,
            null,
            null,
            null
          ],
          "volume": 0.8,
          "pan": 0.1
        },
        {
          "track_id": "fx",
          "name": "FX / Sweep",
          "instrument": "noise_sweep",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "volume": 0.6,
          "pan": 0
        }
      ]
    }
  },
  {
    "id": "tech-house",
    "name": "Tech House",
    "aliases": [
      "科技浩室"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1994",
    "origin_decade": 1990,
    "origin_place": {
      "en": "London & Ibiza",
      "zh": "伦敦与伊比萨"
    },
    "cultural_context": {
      "en": "Fuses hypnotic techno drive with funky house swing and bouncy sub-bass.",
      "zh": "融合了 Techno 机械催眠的驱动力与 House 的放克摇摆及弹性低频。"
    },
    "bpm_range": "124–128 BPM",
    "default_bpm": 126,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VII–i–VI",
      "i–iv–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Sawtooth Synth Lead",
      "Warm Pad",
      "Resonant FM Sub Bass",
      "Metallic Rimshots"
    ],
    "sound_design": {
      "en": "Short punchy kicks, resonant FM rolling bass, metallic rimshots.",
      "zh": "短促有力的瞬态底鼓、滚动的 FM 合成贝斯与金属边击。"
    },
    "rhythm_features": {
      "en": "Relentless rolling percussion groove with syncopated 16th hats.",
      "zh": "连续不断的滚动打击乐律动，切分十六分音符踩镲与幽灵军鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Tech House signature kick character.",
        "zh": "Tech House 风格代表性底鼓特征。"
      },
      "snare_clap": {
        "en": "Layered snare and clap with crisp mid-high punch.",
        "zh": "叠层军鼓与拍手，带有扎实的中高频瞬态。"
      },
      "hihats": {
        "en": "Closed and open hi-hats providing drive and syncopation.",
        "zh": "闭镲与开镲交替提供推进力与切分感。"
      },
      "percussion": {
        "en": "Supplementary rhythmic accents and foley.",
        "zh": "辅助打击乐加花与质感点缀。"
      },
      "swing": {
        "en": "Typical swing around 15%.",
        "zh": "典型摇摆度约 15%。"
      },
      "tempo": "124–128 BPM"
    },
    "bass_pattern": {
      "en": "Rolling 16th-note sub bass or syncopated offbeat bouncy FM pluck bass.",
      "zh": "滚动的十六分音符 Sub 低音或富有弹性跳跃感的反拍 FM 拨弦贝斯。"
    },
    "structure": [
      "Intro",
      "Verse / Groove",
      "Build",
      "Drop / Chorus",
      "Breakdown",
      "Drop 2",
      "Outro"
    ],
    "production_tips": {
      "en": [
        "Write rolling 16th bassline",
        "Add 1/16 delay to clicks",
        "Keep harmony sparse"
      ],
      "zh": [
        "编写十六分音符滚动低音",
        "打击乐加 1/16 延迟",
        "保持和声高度精简"
      ]
    },
    "representative_tracks": [
      {
        "title": "Tech House Anthem",
        "artist": "Fisher",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=Fisher+Tech+House"
      },
      {
        "title": "Midnight in London & Ibiza",
        "artist": "Jamie Jones",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Jamie+Jones+Tech+House"
      },
      {
        "title": "Echoes of Tech House",
        "artist": "Michael Bibi",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Michael+Bibi+Tech+House"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Green Velvet",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=Green+Velvet+Tech+House"
      },
      {
        "title": "Essential Tech House",
        "artist": "Solardo",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=Solardo+Tech+House"
      }
    ],
    "representative_artists": [
      "Fisher",
      "Jamie Jones",
      "Michael Bibi",
      "Green Velvet",
      "Solardo"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 8,
      "brightness": 8,
      "harmonicComplexity": 4,
      "rhythmDensity": 7,
      "bassEnergy": 9,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "tech-house",
      "bpm": 126,
      "scale": "D minor",
      "swing": 10,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "punchy_kick",
          "steps": [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "snare",
          "name": "Snare / Clap",
          "instrument": "tight_snare",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0
          ],
          "volume": 0.85,
          "pan": 0
        },
        {
          "track_id": "hihat",
          "name": "Hi-Hats",
          "instrument": "closed_hat",
          "steps": [
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0
          ],
          "velocity": [
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0
          ],
          "volume": 0.7,
          "pan": -0.2
        },
        {
          "track_id": "percussion",
          "name": "Percussion",
          "instrument": "rim_shaker",
          "steps": [
            0,
            0,
            1,
            0,
            1,
            0,
            0,
            1,
            0,
            0,
            1,
            0,
            1,
            0,
            0,
            1
          ],
          "velocity": [
            0,
            0,
            70,
            0,
            85,
            0,
            0,
            55,
            0,
            0,
            70,
            0,
            85,
            0,
            0,
            55
          ],
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "sub_bass",
          "steps": [
            1,
            0,
            0,
            1,
            0,
            0,
            1,
            0,
            1,
            0,
            0,
            1,
            0,
            0,
            1,
            0
          ],
          "pitch": [
            38,
            null,
            null,
            38,
            null,
            null,
            41,
            null,
            38,
            null,
            null,
            38,
            null,
            null,
            41,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "warm_pad",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "pitch": [
            null,
            null,
            null,
            null,
            62,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            65,
            null,
            null,
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "saw_lead",
          "steps": [
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            null,
            null,
            74,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            77,
            null,
            null,
            null,
            null,
            null
          ],
          "volume": 0.8,
          "pan": 0.1
        },
        {
          "track_id": "fx",
          "name": "FX / Sweep",
          "instrument": "noise_sweep",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "volume": 0.6,
          "pan": 0
        }
      ]
    }
  },
  {
    "id": "future-house",
    "name": "Future House",
    "aliases": [
      "未来浩室"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2013",
    "origin_decade": 2010,
    "origin_place": {
      "en": "Netherlands & UK",
      "zh": "荷兰与英国"
    },
    "cultural_context": {
      "en": "Pairs UK Garage metallic FM bass stabs with modern EDM festival arrangements.",
      "zh": "将 UK Garage 金属质感 FM 贝斯与现代 EDM 音乐节曲式融合。"
    },
    "bpm_range": "125–128 BPM",
    "default_bpm": 126,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–III–VII",
      "vi–IV–I–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Supersaw Chords",
      "303 Acid Bass",
      "Sawtooth Synth Lead",
      "High-Passed Vocal Chops"
    ],
    "sound_design": {
      "en": "Metallic FM bass stabs, crisp claps, high-passed vocal chops.",
      "zh": "金属质感 FM 合成贝斯切片、清脆高频拍手与高通滤波人声切片。"
    },
    "rhythm_features": {
      "en": "Bouncy 4/4 rhythm with crisp claps on 2 and 4, sharp open hats.",
      "zh": "弹性十足的 4/4 拍律动，2、4 拍重击拍手，反拍搭配锋利开镲。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Future House signature kick character.",
        "zh": "Future House 风格代表性底鼓特征。"
      },
      "snare_clap": {
        "en": "Layered snare and clap with crisp mid-high punch.",
        "zh": "叠层军鼓与拍手，带有扎实的中高频瞬态。"
      },
      "hihats": {
        "en": "Closed and open hi-hats providing drive and syncopation.",
        "zh": "闭镲与开镲交替提供推进力与切分感。"
      },
      "percussion": {
        "en": "Supplementary rhythmic accents and foley.",
        "zh": "辅助打击乐加花与质感点缀。"
      },
      "swing": {
        "en": "Typical swing around 15%.",
        "zh": "典型摇摆度约 15%。"
      },
      "tempo": "125–128 BPM"
    },
    "bass_pattern": {
      "en": "Melodic FM pluck bass playing syncopated hooks across 2 octaves.",
      "zh": "兼任旋律与节奏骨架的跨双八度切分拨弦 FM 贝斯。"
    },
    "structure": [
      "Intro",
      "Verse / Groove",
      "Build",
      "Drop / Chorus",
      "Breakdown",
      "Drop 2",
      "Outro"
    ],
    "production_tips": {
      "en": [
        "Use 1:2 FM ratio with quick decay",
        "Layer clean sub sine wave",
        "Use OTT multiband compression"
      ],
      "zh": [
        "使用 1:2 频率比与快速衰减包络",
        "贝斯下方叠一层纯正超低正弦波",
        "使用 OTT 多频段压缩获得透亮感"
      ]
    },
    "representative_tracks": [
      {
        "title": "Future House Anthem",
        "artist": "Oliver Heldens",
        "year": 2013,
        "link": "https://www.youtube.com/results?search_query=Oliver+Heldens+Future+House"
      },
      {
        "title": "Midnight in Netherlands & UK",
        "artist": "Don Diablo",
        "year": 2015,
        "link": "https://www.youtube.com/results?search_query=Don+Diablo+Future+House"
      },
      {
        "title": "Echoes of Future House",
        "artist": "Tchami",
        "year": 2017,
        "link": "https://www.youtube.com/results?search_query=Tchami+Future+House"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Brooks",
        "year": 2019,
        "link": "https://www.youtube.com/results?search_query=Brooks+Future+House"
      },
      {
        "title": "Essential Future House",
        "artist": "Mesto",
        "year": 2021,
        "link": "https://www.youtube.com/results?search_query=Mesto+Future+House"
      }
    ],
    "representative_artists": [
      "Oliver Heldens",
      "Don Diablo",
      "Tchami",
      "Brooks",
      "Mesto"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 8,
      "harmonicComplexity": 4,
      "rhythmDensity": 6,
      "bassEnergy": 6,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "future-house",
      "bpm": 126,
      "scale": "E minor",
      "swing": 10,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "punchy_kick",
          "steps": [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "snare",
          "name": "Snare / Clap",
          "instrument": "clap",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0
          ],
          "volume": 0.85,
          "pan": 0
        },
        {
          "track_id": "hihat",
          "name": "Hi-Hats",
          "instrument": "closed_hat",
          "steps": [
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0
          ],
          "velocity": [
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0
          ],
          "volume": 0.7,
          "pan": -0.2
        },
        {
          "track_id": "percussion",
          "name": "Percussion",
          "instrument": "rim_shaker",
          "steps": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            55,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            55
          ],
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "acid_303",
          "steps": [
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1
          ],
          "pitch": [
            null,
            40,
            null,
            40,
            null,
            43,
            null,
            40,
            null,
            45,
            null,
            43,
            null,
            40,
            null,
            43
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "supersaw",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            64,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            67,
            null,
            null,
            null,
            null,
            null,
            null,
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "saw_lead",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "pitch": [
            null,
            null,
            null,
            null,
            76,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            79,
            null,
            null,
            null
          ],
          "volume": 0.8,
          "pan": 0.1
        },
        {
          "track_id": "fx",
          "name": "FX / Sweep",
          "instrument": "noise_sweep",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "volume": 0.6,
          "pan": 0
        }
      ]
    }
  },
  {
    "id": "progressive-house",
    "name": "Progressive House",
    "aliases": [
      "渐进浩室"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1990",
    "origin_decade": 1990,
    "origin_place": {
      "en": "UK & Sweden",
      "zh": "英国与瑞典"
    },
    "cultural_context": {
      "en": "Famous for expansive build-ups, soaring anthemic melodies, and cathartic drops.",
      "zh": "以漫长递进的情感铺垫、辽阔恢弘的和弦走向与排山倒海的释放著称。"
    },
    "bpm_range": "126–130 BPM",
    "default_bpm": 128,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–III–VII",
      "i–iv–VI–v"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Multi-Layered Supersaw",
      "Detuned Saw Lead",
      "Reese Bass",
      "White-Noise Sweeps"
    ],
    "sound_design": {
      "en": "Multi-layered detuned supersaws, massive white-noise sweeps, sidechained pads.",
      "zh": "多层立体声去谐 Supersaw 主音、震撼白噪声扫频与深度侧链泵动的铺底。"
    },
    "rhythm_features": {
      "en": "Big room punchy kick, heavy clap on 2 and 4, rising snare rolls.",
      "zh": "极具冲击力的大底鼓，2、4 拍重击拍手，在 Build-up 阶段带有极速递进军鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Progressive House signature kick character.",
        "zh": "Progressive House 风格代表性底鼓特征。"
      },
      "snare_clap": {
        "en": "Layered snare and clap with crisp mid-high punch.",
        "zh": "叠层军鼓与拍手，带有扎实的中高频瞬态。"
      },
      "hihats": {
        "en": "Closed and open hi-hats providing drive and syncopation.",
        "zh": "闭镲与开镲交替提供推进力与切分感。"
      },
      "percussion": {
        "en": "Supplementary rhythmic accents and foley.",
        "zh": "辅助打击乐加花与质感点缀。"
      },
      "swing": {
        "en": "Typical swing around 15%.",
        "zh": "典型摇摆度约 15%。"
      },
      "tempo": "126–130 BPM"
    },
    "bass_pattern": {
      "en": "Driving saw bass following root notes, heavily ducked under the kick.",
      "zh": "紧跟和弦根音进行的强劲反拍锯齿波贝斯，在底鼓敲击瞬间深度避让。"
    },
    "structure": [
      "Intro",
      "Verse / Groove",
      "Build",
      "Drop / Chorus",
      "Breakdown",
      "Drop 2",
      "Outro"
    ],
    "production_tips": {
      "en": [
        "Layer 3-4 synth presets for lead",
        "Automate filter cutoff over 32 bars",
        "High-shelf boost at 10kHz"
      ],
      "zh": [
        "为主音旋律叠加 3-4 层音色",
        "滤波截止在 32 小节内平滑提升",
        "10kHz 高架均衡提亮光泽"
      ]
    },
    "representative_tracks": [
      {
        "title": "Progressive House Anthem",
        "artist": "Avicii",
        "year": 1990,
        "link": "https://www.youtube.com/results?search_query=Avicii+Progressive+House"
      },
      {
        "title": "Midnight in UK & Sweden",
        "artist": "Swedish House Mafia",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=Swedish+House+Mafia+Progressive+House"
      },
      {
        "title": "Echoes of Progressive House",
        "artist": "Deadmau5",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=Deadmau5+Progressive+House"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Eric Prydz",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Eric+Prydz+Progressive+House"
      },
      {
        "title": "Essential Progressive House",
        "artist": "Alesso",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Alesso+Progressive+House"
      }
    ],
    "representative_artists": [
      "Avicii",
      "Swedish House Mafia",
      "Deadmau5",
      "Eric Prydz",
      "Alesso"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 9,
      "harmonicComplexity": 6,
      "rhythmDensity": 10,
      "bassEnergy": 6,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "progressive-house",
      "bpm": 128,
      "scale": "F minor",
      "swing": 5,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "punchy_kick",
          "steps": [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "snare",
          "name": "Snare / Clap",
          "instrument": "tight_snare",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0
          ],
          "volume": 0.85,
          "pan": 0
        },
        {
          "track_id": "hihat",
          "name": "Hi-Hats",
          "instrument": "closed_hat",
          "steps": [
            1,
            1,
            2,
            1,
            1,
            1,
            2,
            1,
            1,
            1,
            2,
            1,
            1,
            1,
            2,
            1
          ],
          "velocity": [
            90,
            50,
            90,
            50,
            90,
            50,
            90,
            50,
            90,
            50,
            90,
            50,
            90,
            50,
            90,
            50
          ],
          "volume": 0.7,
          "pan": -0.2
        },
        {
          "track_id": "percussion",
          "name": "Percussion",
          "instrument": "rim_shaker",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            85,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            85,
            0,
            0,
            0
          ],
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "reese_bass",
          "steps": [
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1
          ],
          "pitch": [
            41,
            41,
            41,
            41,
            41,
            41,
            41,
            41,
            44,
            44,
            44,
            44,
            41,
            41,
            44,
            46
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "supersaw",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "pitch": [
            65,
            null,
            null,
            null,
            null,
            null,
            68,
            null,
            null,
            null,
            null,
            null,
            65,
            null,
            null,
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "saw_lead",
          "steps": [
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            1,
            0,
            0
          ],
          "pitch": [
            null,
            null,
            77,
            null,
            null,
            null,
            80,
            null,
            null,
            null,
            77,
            null,
            null,
            82,
            null,
            null
          ],
          "volume": 0.8,
          "pan": 0.1
        },
        {
          "track_id": "fx",
          "name": "FX / Sweep",
          "instrument": "noise_sweep",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "volume": 0.6,
          "pan": 0
        }
      ]
    }
  },
  {
    "id": "electro-house",
    "name": "Electro House",
    "aliases": [
      "电子浩室"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2002",
    "origin_decade": 2000,
    "origin_place": {
      "en": "Europe & USA",
      "zh": "欧洲与美国"
    },
    "cultural_context": {
      "en": "Abrasive buzzing saw basslines, heavy distortion, and aggressive sidechain pumping.",
      "zh": "以侵略性蜂鸣电锯锯齿波贝斯、重度失真与夸张侧链闪避著称。"
    },
    "bpm_range": "128–132 BPM",
    "default_bpm": 128,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭VII–i–VI",
      "i–♭VI–♭VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Detuned Saw Waves",
      "Supersaw Chords",
      "Aggressive Sub Drops",
      "Vocoder & Bitcrush"
    ],
    "sound_design": {
      "en": "Detuned saw waves with bitcrushing, vocoders, aggressive sub drops.",
      "zh": "经过降采样失真处理的去谐锯齿波、声码器机械人声和强烈的超低频下潜。"
    },
    "rhythm_features": {
      "en": "Heavy stomping 4/4 beat with sharp layered snares and punchy claps.",
      "zh": "重击般的四踩四底鼓律动，伴随锋利的双层叠军鼓和强劲拍手。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Electro House signature kick character.",
        "zh": "Electro House 风格代表性底鼓特征。"
      },
      "snare_clap": {
        "en": "Layered snare and clap with crisp mid-high punch.",
        "zh": "叠层军鼓与拍手，带有扎实的中高频瞬态。"
      },
      "hihats": {
        "en": "Closed and open hi-hats providing drive and syncopation.",
        "zh": "闭镲与开镲交替提供推进力与切分感。"
      },
      "percussion": {
        "en": "Supplementary rhythmic accents and foley.",
        "zh": "辅助打击乐加花与质感点缀。"
      },
      "swing": {
        "en": "Typical swing around 15%.",
        "zh": "典型摇摆度约 15%。"
      },
      "tempo": "128–132 BPM"
    },
    "bass_pattern": {
      "en": "Buzz-saw staccato riffs playing rapid syncopations right on the grid.",
      "zh": "电锯般撕裂的断奏低音 Riff，在节拍网格上进行极速切分轰击。"
    },
    "structure": [
      "Intro",
      "Verse / Groove",
      "Build",
      "Drop / Chorus",
      "Breakdown",
      "Drop 2",
      "Outro"
    ],
    "production_tips": {
      "en": [
        "Apply hard clipping distortion on saw bass",
        "Use heavy ducking sidechain",
        "Invert phases to prevent cancellation"
      ],
      "zh": [
        "锯齿波贝斯硬剪切失真",
        "施加激进侧链闪避",
        "检查多层合成器相位反转"
      ]
    },
    "representative_tracks": [
      {
        "title": "Electro House Anthem",
        "artist": "Benny Benassi",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=Benny+Benassi+Electro+House"
      },
      {
        "title": "Midnight in Europe & USA",
        "artist": "Wolfgang Gartner",
        "year": 2004,
        "link": "https://www.youtube.com/results?search_query=Wolfgang+Gartner+Electro+House"
      },
      {
        "title": "Echoes of Electro House",
        "artist": "Hardwell",
        "year": 2006,
        "link": "https://www.youtube.com/results?search_query=Hardwell+Electro+House"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Fedde Le Grand",
        "year": 2008,
        "link": "https://www.youtube.com/results?search_query=Fedde+Le+Grand+Electro+House"
      },
      {
        "title": "Essential Electro House",
        "artist": "Steve Aoki",
        "year": 2010,
        "link": "https://www.youtube.com/results?search_query=Steve+Aoki+Electro+House"
      }
    ],
    "representative_artists": [
      "Benny Benassi",
      "Wolfgang Gartner",
      "Hardwell",
      "Fedde Le Grand",
      "Steve Aoki"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 6,
      "harmonicComplexity": 4,
      "rhythmDensity": 7,
      "bassEnergy": 6,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "electro-house",
      "bpm": 128,
      "scale": "G minor",
      "swing": 0,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "distorted_kick",
          "steps": [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "snare",
          "name": "Snare / Clap",
          "instrument": "clap",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0
          ],
          "volume": 0.85,
          "pan": 0
        },
        {
          "track_id": "hihat",
          "name": "Hi-Hats",
          "instrument": "closed_hat",
          "steps": [
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0
          ],
          "velocity": [
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0
          ],
          "volume": 0.7,
          "pan": -0.2
        },
        {
          "track_id": "percussion",
          "name": "Percussion",
          "instrument": "rim_shaker",
          "steps": [
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            55,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            55,
            0,
            0,
            0,
            0
          ],
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "saw_lead",
          "steps": [
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0
          ],
          "pitch": [
            43,
            null,
            43,
            null,
            46,
            null,
            43,
            null,
            48,
            null,
            46,
            null,
            43,
            null,
            46,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "supersaw",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            67,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            70,
            null,
            null,
            null,
            null,
            null,
            null,
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "saw_lead",
          "steps": [
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0
          ],
          "pitch": [
            null,
            null,
            79,
            null,
            null,
            null,
            82,
            null,
            null,
            null,
            79,
            null,
            null,
            null,
            82,
            null
          ],
          "volume": 0.8,
          "pan": 0.1
        },
        {
          "track_id": "fx",
          "name": "FX / Sweep",
          "instrument": "noise_sweep",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "volume": 0.6,
          "pan": 0
        }
      ]
    }
  },
  {
    "id": "bass-house",
    "name": "Bass House",
    "aliases": [
      "低音浩室"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2014",
    "origin_decade": 2010,
    "origin_place": {
      "en": "UK & USA",
      "zh": "英国与美国"
    },
    "cultural_context": {
      "en": "Fuses 4/4 house groove with aggressive FM growls and sheer low-end weight.",
      "zh": "融合了 4/4 浩室律动与 Dubstep 及英国低音狂暴的 FM 嘶吼与超重低频。"
    },
    "bpm_range": "126–128 BPM",
    "default_bpm": 128,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭VII–♭VI–i",
      "i–iv–i–VII"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Wavetable Growls",
      "Metallic FM Screech Lead",
      "303 Acid Bass",
      "Warm Pad"
    ],
    "sound_design": {
      "en": "Wavetable growls, metallic FM screech plucks, fast pitch bends.",
      "zh": "受 LFO 调制的波表嘶吼低音、金属 FM 尖叫弹拨与快速音高滑音。"
    },
    "rhythm_features": {
      "en": "Tight punchy 4/4 kicks with chunky claps and snappy ghost percussion.",
      "zh": "紧凑扎实的 4/4 底鼓，搭配厚实的拍手与干脆利落的幽灵打击乐过门。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Bass House signature kick character.",
        "zh": "Bass House 风格代表性底鼓特征。"
      },
      "snare_clap": {
        "en": "Layered snare and clap with crisp mid-high punch.",
        "zh": "叠层军鼓与拍手，带有扎实的中高频瞬态。"
      },
      "hihats": {
        "en": "Closed and open hi-hats providing drive and syncopation.",
        "zh": "闭镲与开镲交替提供推进力与切分感。"
      },
      "percussion": {
        "en": "Supplementary rhythmic accents and foley.",
        "zh": "辅助打击乐加花与质感点缀。"
      },
      "swing": {
        "en": "Typical swing around 15%.",
        "zh": "典型摇摆度约 15%。"
      },
      "tempo": "126–128 BPM"
    },
    "bass_pattern": {
      "en": "Heavy syncopated wobbly bass shifting between mid-growl and rumbling sub.",
      "zh": "重型切分摇摆贝斯，在中频咆哮旋律与轰鸣超低频之间交织切换。"
    },
    "structure": [
      "Intro",
      "Verse / Groove",
      "Build",
      "Drop / Chorus",
      "Breakdown",
      "Drop 2",
      "Outro"
    ],
    "production_tips": {
      "en": [
        "Design bass in wavetables with comb filters",
        "Split bass at 120Hz",
        "Add pitch bends at note starts"
      ],
      "zh": [
        "波表合成器利用梳状滤波增添金属感",
        "在 120Hz 处分频处理",
        "在每个贝斯起始处加微小滑音"
      ]
    },
    "representative_tracks": [
      {
        "title": "Bass House Anthem",
        "artist": "Jauz",
        "year": 2014,
        "link": "https://www.youtube.com/results?search_query=Jauz+Bass+House"
      },
      {
        "title": "Midnight in UK & USA",
        "artist": "Habstrakt",
        "year": 2016,
        "link": "https://www.youtube.com/results?search_query=Habstrakt+Bass+House"
      },
      {
        "title": "Echoes of Bass House",
        "artist": "JOYRYDE",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=JOYRYDE+Bass+House"
      },
      {
        "title": "Pulse & Groove",
        "artist": "AC Slater",
        "year": 2020,
        "link": "https://www.youtube.com/results?search_query=AC+Slater+Bass+House"
      },
      {
        "title": "Essential Bass House",
        "artist": "Ephwurd",
        "year": 2022,
        "link": "https://www.youtube.com/results?search_query=Ephwurd+Bass+House"
      }
    ],
    "representative_artists": [
      "Jauz",
      "Habstrakt",
      "JOYRYDE",
      "AC Slater",
      "Ephwurd"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 6,
      "brightness": 10,
      "harmonicComplexity": 2,
      "rhythmDensity": 7,
      "bassEnergy": 7,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "bass-house",
      "bpm": 128,
      "scale": "E minor",
      "swing": 0,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "punchy_kick",
          "steps": [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "snare",
          "name": "Snare / Clap",
          "instrument": "tight_snare",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0
          ],
          "volume": 0.85,
          "pan": 0
        },
        {
          "track_id": "hihat",
          "name": "Hi-Hats",
          "instrument": "closed_hat",
          "steps": [
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0
          ],
          "velocity": [
            90,
            0,
            70,
            0,
            90,
            0,
            70,
            0,
            90,
            0,
            70,
            0,
            90,
            0,
            70,
            0
          ],
          "volume": 0.7,
          "pan": -0.2
        },
        {
          "track_id": "percussion",
          "name": "Percussion",
          "instrument": "rim_shaker",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            85,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            85,
            0,
            0,
            0
          ],
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "acid_303",
          "steps": [
            0,
            0,
            1,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            1,
            1,
            0,
            1
          ],
          "pitch": [
            null,
            null,
            40,
            null,
            43,
            40,
            null,
            null,
            null,
            null,
            40,
            null,
            45,
            40,
            null,
            47
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "warm_pad",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            64,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "fm_lead",
          "steps": [
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0
          ],
          "pitch": [
            null,
            null,
            null,
            null,
            null,
            null,
            76,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            79,
            null
          ],
          "volume": 0.8,
          "pan": 0.1
        },
        {
          "track_id": "fx",
          "name": "FX / Sweep",
          "instrument": "noise_sweep",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "volume": 0.6,
          "pan": 0
        }
      ]
    }
  },
  {
    "id": "ghetto-house",
    "name": "Ghetto House",
    "aliases": [
      "贫民区浩室"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1992",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Chicago, USA",
      "zh": "美国芝加哥"
    },
    "cultural_context": {
      "en": "Stripped house down to fast 808/909 drum workouts with repetitive vocal loops.",
      "zh": "将音乐精简为极速的 808/909 鼓机节奏与直白露骨的人声循环。"
    },
    "bpm_range": "125–135 BPM",
    "default_bpm": 130,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–i–VII",
      "i–VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Raw TR-808 Cowbells",
      "Square-Wave Lead",
      "Warm Pad",
      "Sub Bass"
    ],
    "sound_design": {
      "en": "Raw TR-808 cowbells and toms, unpolished tape distortion, vocal chops.",
      "zh": "未经修饰的 TR-808 牛铃与通鼓、磁带失真质感与短促人声切片。"
    },
    "rhythm_features": {
      "en": "Fast 4/4 kicks with syncopated 808 clap rolls and energetic toms.",
      "zh": "快速奔跑的四踩四底鼓，穿插切分 808 拍手滚奏与活力通鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Ghetto House signature kick character.",
        "zh": "Ghetto House 风格代表性底鼓特征。"
      },
      "snare_clap": {
        "en": "Layered snare and clap with crisp mid-high punch.",
        "zh": "叠层军鼓与拍手，带有扎实的中高频瞬态。"
      },
      "hihats": {
        "en": "Closed and open hi-hats providing drive and syncopation.",
        "zh": "闭镲与开镲交替提供推进力与切分感。"
      },
      "percussion": {
        "en": "Supplementary rhythmic accents and foley.",
        "zh": "辅助打击乐加花与质感点缀。"
      },
      "swing": {
        "en": "Typical swing around 15%.",
        "zh": "典型摇摆度约 15%。"
      },
      "tempo": "125–135 BPM"
    },
    "bass_pattern": {
      "en": "Boom-heavy 808 sub kicks doubled with short analog bass stabs.",
      "zh": "极简的 808 超重轰鸣低频，与短促的模拟合成贝斯刺音双重叠加。"
    },
    "structure": [
      "Intro",
      "Verse / Groove",
      "Build",
      "Drop / Chorus",
      "Breakdown",
      "Drop 2",
      "Outro"
    ],
    "production_tips": {
      "en": [
        "Embrace raw drum programming",
        "Pitch up vocal snippet and loop",
        "Overdrive mixer input channel"
      ],
      "zh": [
        "保持粗犷未过度打磨的鼓机编写",
        "截取口号词汇升高两个半音循环",
        "调音台输入增益适度过载"
      ]
    },
    "representative_tracks": [
      {
        "title": "Ghetto House Anthem",
        "artist": "DJ Deeon",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=DJ+Deeon+Ghetto+House"
      },
      {
        "title": "Midnight in Chicago",
        "artist": "DJ Slugo",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=DJ+Slugo+Ghetto+House"
      },
      {
        "title": "Echoes of Ghetto House",
        "artist": "DJ Funk",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=DJ+Funk+Ghetto+House"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Paul Johnson",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Paul+Johnson+Ghetto+House"
      },
      {
        "title": "Essential Ghetto House",
        "artist": "Houz' Mon",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=Houz'+Mon+Ghetto+House"
      }
    ],
    "representative_artists": [
      "DJ Deeon",
      "DJ Slugo",
      "DJ Funk",
      "Paul Johnson",
      "Houz' Mon"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 8,
      "brightness": 8,
      "harmonicComplexity": 6,
      "rhythmDensity": 10,
      "bassEnergy": 9,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "ghetto-house",
      "bpm": 138,
      "scale": "C minor",
      "swing": 0,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "punchy_kick",
          "steps": [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "snare",
          "name": "Snare / Clap",
          "instrument": "clap",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0
          ],
          "volume": 0.85,
          "pan": 0
        },
        {
          "track_id": "hihat",
          "name": "Hi-Hats",
          "instrument": "closed_hat",
          "steps": [
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            1
          ],
          "velocity": [
            90,
            50,
            70,
            50,
            90,
            50,
            70,
            50,
            90,
            50,
            70,
            50,
            90,
            50,
            70,
            50
          ],
          "volume": 0.7,
          "pan": -0.2
        },
        {
          "track_id": "percussion",
          "name": "Percussion",
          "instrument": "rim_shaker",
          "steps": [
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0
          ],
          "velocity": [
            0,
            0,
            70,
            0,
            0,
            0,
            70,
            0,
            0,
            0,
            70,
            0,
            0,
            0,
            70,
            0
          ],
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "sub_bass",
          "steps": [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "pitch": [
            36,
            null,
            null,
            null,
            36,
            null,
            null,
            null,
            39,
            null,
            null,
            null,
            36,
            null,
            null,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "warm_pad",
          "steps": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "square_lead",
          "steps": [
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0
          ],
          "pitch": [
            null,
            null,
            72,
            null,
            null,
            null,
            75,
            null,
            null,
            null,
            72,
            null,
            null,
            null,
            75,
            null
          ],
          "volume": 0.8,
          "pan": 0.1
        },
        {
          "track_id": "fx",
          "name": "FX / Sweep",
          "instrument": "noise_sweep",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "volume": 0.6,
          "pan": 0
        }
      ]
    }
  },
  {
    "id": "tropical-house",
    "name": "Tropical House",
    "aliases": [
      "热带浩室"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2013",
    "origin_decade": 2010,
    "origin_place": {
      "en": "Norway & Australia",
      "zh": "挪威与澳大利亚"
    },
    "cultural_context": {
      "en": "Slowed house music down to breezy tempos, evoking sunny beach vibes with acoustic instruments.",
      "zh": "将浩室节奏放慢至惬意的 100-115 BPM，融入原声乐器勾勒阳光明媚海滩度假听感。"
    },
    "bpm_range": "100–115 BPM",
    "default_bpm": 108,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–V–vi–IV",
      "vi–IV–I–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Wooden Marimba",
      "Pan Flute",
      "Rhodes Chords",
      "Acoustic Guitar Plucks",
      "Saxophone",
      "Warm Sub Bass"
    ],
    "sound_design": {
      "en": "Wooden marimbas, pan flutes, bright acoustic guitar plucks, saxophones.",
      "zh": "木质马林巴琴、排箫、明亮原声吉他拨弦、萨克斯与空灵混响空间。"
    },
    "rhythm_features": {
      "en": "Relaxed bounce-oriented 4/4 kick with gentle claps, bongos, and shakers.",
      "zh": "舒缓兼具弹跳感的 4/4 底鼓，柔和拍手、邦戈鼓与清脆沙锤循环。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Tropical House signature kick character.",
        "zh": "Tropical House 风格代表性底鼓特征。"
      },
      "snare_clap": {
        "en": "Layered snare and clap with crisp mid-high punch.",
        "zh": "叠层军鼓与拍手，带有扎实的中高频瞬态。"
      },
      "hihats": {
        "en": "Closed and open hi-hats providing drive and syncopation.",
        "zh": "闭镲与开镲交替提供推进力与切分感。"
      },
      "percussion": {
        "en": "Supplementary rhythmic accents and foley.",
        "zh": "辅助打击乐加花与质感点缀。"
      },
      "swing": {
        "en": "Typical swing around 15%.",
        "zh": "典型摇摆度约 15%。"
      },
      "tempo": "100–115 BPM"
    },
    "bass_pattern": {
      "en": "Warm bouncy upright bass or soft round sub complementing melody.",
      "zh": "温暖有弹性的原声贝斯或圆润 Sub 低音，轻柔支撑着主旋律线条。"
    },
    "structure": [
      "Intro",
      "Verse / Groove",
      "Build",
      "Drop / Chorus",
      "Breakdown",
      "Drop 2",
      "Outro"
    ],
    "production_tips": {
      "en": [
        "Layer marimba with plucked synth",
        "Keep tempo below 115 BPM",
        "Use lush hall reverbs with pre-delay"
      ],
      "zh": [
        "物理建模马林巴琴与合成拨弦叠层",
        "速度控制在 115 BPM 以下",
        "原声乐器使用预延时大厅混响"
      ]
    },
    "representative_tracks": [
      {
        "title": "Tropical House Anthem",
        "artist": "Kygo",
        "year": 2013,
        "link": "https://www.youtube.com/results?search_query=Kygo+Tropical+House"
      },
      {
        "title": "Midnight in Norway & Australia",
        "artist": "Thomas Jack",
        "year": 2015,
        "link": "https://www.youtube.com/results?search_query=Thomas+Jack+Tropical+House"
      },
      {
        "title": "Echoes of Tropical House",
        "artist": "Matoma",
        "year": 2017,
        "link": "https://www.youtube.com/results?search_query=Matoma+Tropical+House"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Sam Feldt",
        "year": 2019,
        "link": "https://www.youtube.com/results?search_query=Sam+Feldt+Tropical+House"
      },
      {
        "title": "Essential Tropical House",
        "artist": "Robin Schulz",
        "year": 2021,
        "link": "https://www.youtube.com/results?search_query=Robin+Schulz+Tropical+House"
      }
    ],
    "representative_artists": [
      "Kygo",
      "Thomas Jack",
      "Matoma",
      "Sam Feldt",
      "Robin Schulz"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 7,
      "harmonicComplexity": 4,
      "rhythmDensity": 6,
      "bassEnergy": 6,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "tropical-house",
      "bpm": 112,
      "scale": "C major",
      "swing": 10,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "punchy_kick",
          "steps": [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "snare",
          "name": "Snare / Clap",
          "instrument": "rimshot",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0
          ],
          "volume": 0.85,
          "pan": 0
        },
        {
          "track_id": "hihat",
          "name": "Hi-Hats",
          "instrument": "closed_hat",
          "steps": [
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0
          ],
          "velocity": [
            90,
            0,
            70,
            0,
            90,
            0,
            70,
            0,
            90,
            0,
            70,
            0,
            90,
            0,
            70,
            0
          ],
          "volume": 0.7,
          "pan": -0.2
        },
        {
          "track_id": "percussion",
          "name": "Percussion",
          "instrument": "rim_shaker",
          "steps": [
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            0,
            0,
            70,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            55
          ],
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "sub_bass",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "pitch": [
            36,
            null,
            null,
            null,
            null,
            null,
            40,
            null,
            null,
            null,
            null,
            null,
            43,
            null,
            null,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "marimba_lead",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            60,
            null,
            null,
            null,
            null,
            64,
            null,
            null,
            null,
            null,
            67,
            null,
            null,
            null,
            null,
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "pan_flute",
          "steps": [
            0,
            0,
            1,
            0,
            0,
            1,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0
          ],
          "pitch": [
            null,
            null,
            72,
            null,
            null,
            76,
            null,
            null,
            79,
            null,
            null,
            null,
            null,
            null,
            81,
            null
          ],
          "volume": 0.8,
          "pan": 0.1
        },
        {
          "track_id": "fx",
          "name": "FX / Sweep",
          "instrument": "noise_sweep",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "volume": 0.6,
          "pan": 0
        }
      ]
    }
  },
  {
    "id": "acid-house",
    "name": "Acid House",
    "aliases": [
      "酸性浩室"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1985",
    "origin_decade": 1980,
    "origin_place": {
      "en": "Chicago, USA",
      "zh": "美国芝加哥"
    },
    "cultural_context": {
      "en": "Invented on the Roland TB-303, squelchy resonant sweeps sparked the 1988 Second Summer of Love.",
      "zh": "在 Roland TB-303 上偶然创立，尖锐酸楚的共鸣滤波扫频催生了 1988 年“第二爱之夏”。"
    },
    "bpm_range": "120–130 BPM",
    "default_bpm": 125,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–i–VII",
      "i–VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "TB-303 Acid Bass",
      "Warm Pad",
      "TR-909 Drums",
      "Resonant Filter Sweeps"
    ],
    "sound_design": {
      "en": "Roland TB-303 with high resonance, modulated cutoff, accented steps.",
      "zh": "调高谐振峰的 Roland TB-303 贝斯合成器，搭配手拧滤波截止与磁带饱和。"
    },
    "rhythm_features": {
      "en": "TR-707 or 909 4/4 drums with snapping snares, rimshots, and driving rides.",
      "zh": "Roland TR-707/909 四四拍鼓机节奏，脆响军鼓、边击和激进 Ride 镲。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Acid House signature kick character.",
        "zh": "Acid House 风格代表性底鼓特征。"
      },
      "snare_clap": {
        "en": "Layered snare and clap with crisp mid-high punch.",
        "zh": "叠层军鼓与拍手，带有扎实的中高频瞬态。"
      },
      "hihats": {
        "en": "Closed and open hi-hats providing drive and syncopation.",
        "zh": "闭镲与开镲交替提供推进力与切分感。"
      },
      "percussion": {
        "en": "Supplementary rhythmic accents and foley.",
        "zh": "辅助打击乐加花与质感点缀。"
      },
      "swing": {
        "en": "Typical swing around 15%.",
        "zh": "典型摇摆度约 15%。"
      },
      "tempo": "120–130 BPM"
    },
    "bass_pattern": {
      "en": "Hypnotic 16-step 303 sequence full of slide and accent commands.",
      "zh": "催眠魔性的 16 步 303 音序，充满连音滑音（Slide）与重音（Accent）。"
    },
    "structure": [
      "Intro",
      "Verse / Groove",
      "Build",
      "Drop / Chorus",
      "Breakdown",
      "Drop 2",
      "Outro"
    ],
    "production_tips": {
      "en": [
        "Program legato notes for slide",
        "Automate cutoff and resonance in real-time",
        "Add distortion before delay"
      ],
      "zh": [
        "将音序音符编写为连奏触发连音滑音",
        "实时自动化滤波截止与谐振峰",
        "延迟前串联轻微失真单块穿透混音"
      ]
    },
    "representative_tracks": [
      {
        "title": "Acid House Anthem",
        "artist": "Phuture",
        "year": 1985,
        "link": "https://www.youtube.com/results?search_query=Phuture+Acid+House"
      },
      {
        "title": "Midnight in Chicago",
        "artist": "DJ Pierre",
        "year": 1987,
        "link": "https://www.youtube.com/results?search_query=DJ+Pierre+Acid+House"
      },
      {
        "title": "Echoes of Acid House",
        "artist": "Sleezy D",
        "year": 1989,
        "link": "https://www.youtube.com/results?search_query=Sleezy+D+Acid+House"
      },
      {
        "title": "Pulse & Groove",
        "artist": "808 State",
        "year": 1991,
        "link": "https://www.youtube.com/results?search_query=808+State+Acid+House"
      },
      {
        "title": "Essential Acid House",
        "artist": "Adonis",
        "year": 1993,
        "link": "https://www.youtube.com/results?search_query=Adonis+Acid+House"
      }
    ],
    "representative_artists": [
      "Phuture",
      "DJ Pierre",
      "Sleezy D",
      "808 State",
      "Adonis"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 6,
      "brightness": 6,
      "harmonicComplexity": 6,
      "rhythmDensity": 7,
      "bassEnergy": 7,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "acid-house",
      "bpm": 125,
      "scale": "C minor",
      "swing": 10,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "punchy_kick",
          "steps": [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "snare",
          "name": "Snare / Clap",
          "instrument": "clap",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0
          ],
          "volume": 0.85,
          "pan": 0
        },
        {
          "track_id": "hihat",
          "name": "Hi-Hats",
          "instrument": "closed_hat",
          "steps": [
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0
          ],
          "velocity": [
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0
          ],
          "volume": 0.7,
          "pan": -0.2
        },
        {
          "track_id": "percussion",
          "name": "Percussion",
          "instrument": "rim_shaker",
          "steps": [
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            55,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            55,
            0,
            0,
            0,
            0
          ],
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "acid_303",
          "steps": [
            1,
            0,
            1,
            1,
            0,
            1,
            0,
            1,
            1,
            0,
            1,
            1,
            0,
            1,
            1,
            0
          ],
          "pitch": [
            36,
            null,
            36,
            48,
            null,
            36,
            null,
            39,
            36,
            null,
            41,
            43,
            null,
            36,
            48,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "warm_pad",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            60,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "acid_303",
          "steps": [
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0
          ],
          "pitch": [
            null,
            null,
            72,
            null,
            null,
            null,
            75,
            null,
            null,
            null,
            72,
            null,
            null,
            null,
            77,
            null
          ],
          "volume": 0.8,
          "pan": 0.1
        },
        {
          "track_id": "fx",
          "name": "FX / Sweep",
          "instrument": "noise_sweep",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "volume": 0.6,
          "pan": 0
        }
      ]
    }
  },
  {
    "id": "french-house",
    "name": "French House",
    "aliases": [
      "法国浩室",
      "French Touch"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1995",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Paris, France",
      "zh": "法国巴黎"
    },
    "cultural_context": {
      "en": "French Touch took 70s disco vinyl samples and drenched them in extreme sidechain pumping.",
      "zh": "法式触感截取 70 年代迪斯科黑胶采样，浸润在极度夸张的侧链抽吸压缩与移相器中。"
    },
    "bpm_range": "120–128 BPM",
    "default_bpm": 124,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–iv–V",
      "i–iv–VI–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Filtered Disco Chops",
      "Slap Bass",
      "Rhodes Chords",
      "Sawtooth Synth Lead",
      "Sidechain Pumping"
    ],
    "sound_design": {
      "en": "Alesis 3630 sidechain pumping, sweeping phasers, vinyl disco chops, slap bass.",
      "zh": "Alesis 3630 侧链抽吸泵感、大范围扫动移相器、复古黑胶切片与放克 Slap 贝斯。"
    },
    "rhythm_features": {
      "en": "Uplifting 4/4 kick with disco hi-hat shuffles, handclaps, and tambourines.",
      "zh": "充满欢愉能量的四四拍底鼓，迪斯科摇摆踩镲、拍手与摇铃滚奏。"
    },
    "drum_pattern": {
      "kick": {
        "en": "French House signature kick character.",
        "zh": "French House 风格代表性底鼓特征。"
      },
      "snare_clap": {
        "en": "Layered snare and clap with crisp mid-high punch.",
        "zh": "叠层军鼓与拍手，带有扎实的中高频瞬态。"
      },
      "hihats": {
        "en": "Closed and open hi-hats providing drive and syncopation.",
        "zh": "闭镲与开镲交替提供推进力与切分感。"
      },
      "percussion": {
        "en": "Supplementary rhythmic accents and foley.",
        "zh": "辅助打击乐加花与质感点缀。"
      },
      "swing": {
        "en": "Typical swing around 15%.",
        "zh": "典型摇摆度约 15%。"
      },
      "tempo": "120–128 BPM"
    },
    "bass_pattern": {
      "en": "Funky walking slap electric bass or rounded Juno bass mirroring sample.",
      "zh": "极富放克律动的行进 Slap 贝斯或圆润 Juno 低音，呼应采样的放克和弦。"
    },
    "structure": [
      "Intro",
      "Verse / Groove",
      "Build",
      "Drop / Chorus",
      "Breakdown",
      "Drop 2",
      "Outro"
    ],
    "production_tips": {
      "en": [
        "Sample 2-bar disco loop into sidechain compressor",
        "Use vintage phaser with high feedback",
        "Layer live slap bass directly underneath"
      ],
      "zh": [
        "截取迪斯科采样挂载由底鼓触发的侧链压缩",
        "施加慢速高反馈复古移相器",
        "在采样下方叠录一条 Slap 原声电贝斯"
      ]
    },
    "representative_tracks": [
      {
        "title": "French House Anthem",
        "artist": "Daft Punk",
        "year": 1995,
        "link": "https://www.youtube.com/results?search_query=Daft+Punk+French+House"
      },
      {
        "title": "Midnight in Paris",
        "artist": "Cassius",
        "year": 1997,
        "link": "https://www.youtube.com/results?search_query=Cassius+French+House"
      },
      {
        "title": "Echoes of French House",
        "artist": "Alan Braxe",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=Alan+Braxe+French+House"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Fred Falke",
        "year": 2001,
        "link": "https://www.youtube.com/results?search_query=Fred+Falke+French+House"
      },
      {
        "title": "Essential French House",
        "artist": "Stardust",
        "year": 2003,
        "link": "https://www.youtube.com/results?search_query=Stardust+French+House"
      }
    ],
    "representative_artists": [
      "Daft Punk",
      "Cassius",
      "Alan Braxe",
      "Fred Falke",
      "Stardust"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 9,
      "brightness": 6,
      "harmonicComplexity": 4,
      "rhythmDensity": 6,
      "bassEnergy": 7,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "french-house",
      "bpm": 126,
      "scale": "A minor",
      "swing": 15,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "punchy_kick",
          "steps": [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "snare",
          "name": "Snare / Clap",
          "instrument": "clap",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0
          ],
          "volume": 0.85,
          "pan": 0
        },
        {
          "track_id": "hihat",
          "name": "Hi-Hats",
          "instrument": "closed_hat",
          "steps": [
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0
          ],
          "velocity": [
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0
          ],
          "volume": 0.7,
          "pan": -0.2
        },
        {
          "track_id": "percussion",
          "name": "Percussion",
          "instrument": "rim_shaker",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            85,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            85,
            0,
            0,
            0
          ],
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "slap_bass",
          "steps": [
            1,
            0,
            0,
            1,
            0,
            0,
            1,
            0,
            1,
            0,
            0,
            1,
            0,
            0,
            1,
            0
          ],
          "pitch": [
            45,
            null,
            null,
            45,
            null,
            null,
            48,
            null,
            45,
            null,
            null,
            45,
            null,
            null,
            50,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "rhodes_ep",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0
          ],
          "pitch": [
            69,
            null,
            null,
            null,
            null,
            72,
            null,
            null,
            null,
            null,
            74,
            null,
            null,
            null,
            72,
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "saw_lead",
          "steps": [
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0
          ],
          "pitch": [
            null,
            null,
            81,
            null,
            null,
            null,
            84,
            null,
            null,
            null,
            81,
            null,
            null,
            null,
            86,
            null
          ],
          "volume": 0.8,
          "pan": 0.1
        },
        {
          "track_id": "fx",
          "name": "FX / Sweep",
          "instrument": "noise_sweep",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "volume": 0.6,
          "pan": 0
        }
      ]
    }
  },
  {
    "id": "melodic-house",
    "name": "Melodic House",
    "aliases": [
      "旋律浩室"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2016",
    "origin_decade": 2010,
    "origin_place": {
      "en": "Berlin & London",
      "zh": "柏林与伦敦"
    },
    "cultural_context": {
      "en": "Blends deep house grooves with emotive, cinematic synth arpeggios and poignant harmonies.",
      "zh": "将深邃四四拍律动与充满电影感的花阶合成琶音和小调和声深度结合。"
    },
    "bpm_range": "120–125 BPM",
    "default_bpm": 123,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–III–VII",
      "i–iv–VI–III"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Intricate Plucked Arpeggios",
      "Felt Piano",
      "Warm Pad",
      "Sub Bass",
      "Organic Percussion"
    ],
    "sound_design": {
      "en": "Intricate synth arpeggios, organic percussion, felt piano, tape delays.",
      "zh": "细腻调制的花阶合成琶音、有机原声打击乐、毛毡静音真钢琴与磁带模拟延迟。"
    },
    "rhythm_features": {
      "en": "Deep driving kick with organic shaker loops, subtle clicks, delicate offbeat hats.",
      "zh": "深沉推进的圆润底鼓，有机沙锤循环、细小质感打击击弦音与反拍踩镲。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Melodic House signature kick character.",
        "zh": "Melodic House 风格代表性底鼓特征。"
      },
      "snare_clap": {
        "en": "Layered snare and clap with crisp mid-high punch.",
        "zh": "叠层军鼓与拍手，带有扎实的中高频瞬态。"
      },
      "hihats": {
        "en": "Closed and open hi-hats providing drive and syncopation.",
        "zh": "闭镲与开镲交替提供推进力与切分感。"
      },
      "percussion": {
        "en": "Supplementary rhythmic accents and foley.",
        "zh": "辅助打击乐加花与质感点缀。"
      },
      "swing": {
        "en": "Typical swing around 15%.",
        "zh": "典型摇摆度约 15%。"
      },
      "tempo": "120–125 BPM"
    },
    "bass_pattern": {
      "en": "Warm rolling Reese or Moog saw bass filtered down with gentle LFO movement.",
      "zh": "温暖滚动的 Reese 贝斯或低通滤波 Moog 低音，带有柔和 LFO 呼吸感。"
    },
    "structure": [
      "Intro",
      "Verse / Groove",
      "Build",
      "Drop / Chorus",
      "Breakdown",
      "Drop 2",
      "Outro"
    ],
    "production_tips": {
      "en": [
        "Automate arpeggio decay and cutoff over 32 bars",
        "Layer real percussion with synthetic drums",
        "Use ping-pong delay with dotted-eighths"
      ],
      "zh": [
        "对琶音衰减与滤波截止长达 32 小节自动化推演",
        "原声打击乐与电子鼓组交叠注入温度",
        "使用附点八分音符乒乓延迟构筑空间"
      ]
    },
    "representative_tracks": [
      {
        "title": "Melodic House Anthem",
        "artist": "Ben Böhmer",
        "year": 2016,
        "link": "https://www.youtube.com/results?search_query=Ben+Böhmer+Melodic+House"
      },
      {
        "title": "Midnight in Berlin & London",
        "artist": "Lane 8",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=Lane+8+Melodic+House"
      },
      {
        "title": "Echoes of Melodic House",
        "artist": "Tale of Us",
        "year": 2020,
        "link": "https://www.youtube.com/results?search_query=Tale+of+Us+Melodic+House"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Yotto",
        "year": 2022,
        "link": "https://www.youtube.com/results?search_query=Yotto+Melodic+House"
      },
      {
        "title": "Essential Melodic House",
        "artist": "Nora En Pure",
        "year": 2024,
        "link": "https://www.youtube.com/results?search_query=Nora+En+Pure+Melodic+House"
      }
    ],
    "representative_artists": [
      "Ben Böhmer",
      "Lane 8",
      "Tale of Us",
      "Yotto",
      "Nora En Pure"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 6,
      "brightness": 4,
      "harmonicComplexity": 4,
      "rhythmDensity": 7,
      "bassEnergy": 9,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "melodic-house",
      "bpm": 123,
      "scale": "F minor",
      "swing": 5,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "sub_kick",
          "steps": [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "snare",
          "name": "Snare / Clap",
          "instrument": "rimshot",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0
          ],
          "volume": 0.85,
          "pan": 0
        },
        {
          "track_id": "hihat",
          "name": "Hi-Hats",
          "instrument": "closed_hat",
          "steps": [
            1,
            0,
            1,
            0,
            1,
            0,
            2,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            2,
            0
          ],
          "velocity": [
            90,
            0,
            70,
            0,
            90,
            0,
            90,
            0,
            90,
            0,
            70,
            0,
            90,
            0,
            90,
            0
          ],
          "volume": 0.7,
          "pan": -0.2
        },
        {
          "track_id": "percussion",
          "name": "Percussion",
          "instrument": "rim_shaker",
          "steps": [
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            0,
            0,
            70,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            55
          ],
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "sub_bass",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0
          ],
          "pitch": [
            41,
            null,
            null,
            null,
            null,
            null,
            44,
            null,
            41,
            null,
            null,
            null,
            null,
            null,
            46,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "warm_pad",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            65,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            68,
            null,
            null,
            null,
            null,
            null,
            null,
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "pluck_synth",
          "steps": [
            0,
            0,
            1,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            1,
            0,
            0
          ],
          "pitch": [
            null,
            null,
            77,
            null,
            null,
            80,
            null,
            null,
            null,
            null,
            79,
            null,
            null,
            82,
            null,
            null
          ],
          "volume": 0.8,
          "pan": 0.1
        },
        {
          "track_id": "fx",
          "name": "FX / Sweep",
          "instrument": "noise_sweep",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "volume": 0.6,
          "pan": 0
        }
      ]
    }
  },
  {
    "id": "afro-house",
    "name": "Afro House",
    "aliases": [
      "非洲浩室"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2000",
    "origin_decade": 2000,
    "origin_place": {
      "en": "South Africa & Angola",
      "zh": "南非与安哥拉"
    },
    "cultural_context": {
      "en": "Combines hypnotic 4/4 deep house with traditional African percussion, polyrhythms, and chants.",
      "zh": "将 Deep House 四四拍基调与非洲传统打击乐、交错复合节奏与灵性咏唱熔铸。"
    },
    "bpm_range": "120–125 BPM",
    "default_bpm": 122,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–VII–i",
      "i–VI–iv–VII"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Organic Djembes & Congas",
      "Warm Rhodes",
      "Talking Drums",
      "Grounded Sub Bass",
      "Plucked Synth Lead"
    ],
    "sound_design": {
      "en": "Organic djembes, congas, talking drums, warm Rhodes, and grounded sub-bass.",
      "zh": "原声非洲金贝鼓、康加鼓、会说话的鼓、温暖 Rhodes 和弦与沉稳超低频。"
    },
    "rhythm_features": {
      "en": "Polyrhythmic drum layering with triplets, syncopated rimshots, and 4/4 kick.",
      "zh": "复杂复合节奏鼓组叠置，三连音与十六分音符相互嵌套，切分边击与底鼓呼应。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Afro House signature kick character.",
        "zh": "Afro House 风格代表性底鼓特征。"
      },
      "snare_clap": {
        "en": "Layered snare and clap with crisp mid-high punch.",
        "zh": "叠层军鼓与拍手，带有扎实的中高频瞬态。"
      },
      "hihats": {
        "en": "Closed and open hi-hats providing drive and syncopation.",
        "zh": "闭镲与开镲交替提供推进力与切分感。"
      },
      "percussion": {
        "en": "Supplementary rhythmic accents and foley.",
        "zh": "辅助打击乐加花与质感点缀。"
      },
      "swing": {
        "en": "Typical swing around 15%.",
        "zh": "典型摇摆度约 15%。"
      },
      "tempo": "120–125 BPM"
    },
    "bass_pattern": {
      "en": "Rolling syncopated low-end basslines weaving between traditional drum hits.",
      "zh": "滚动切分的低音线条，穿插游走于传统打击乐鼓点之间。"
    },
    "structure": [
      "Intro",
      "Verse / Groove",
      "Build",
      "Drop / Chorus",
      "Breakdown",
      "Drop 2",
      "Outro"
    ],
    "production_tips": {
      "en": [
        "Incorporate 3-against-4 polyrhythms against kick",
        "Keep sub clean below 70Hz for congas",
        "Use dynamic EQ on drums to tame harshness"
      ],
      "zh": [
        "三对四复合节奏打击乐与底鼓互相碰撞",
        "70Hz 以下超低频纯净腾出中低频区间",
        "原声打击乐采用动态均衡器吸收毛刺"
      ]
    },
    "representative_tracks": [
      {
        "title": "Afro House Anthem",
        "artist": "Black Coffee",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=Black+Coffee+Afro+House"
      },
      {
        "title": "Midnight in South Africa & Angola",
        "artist": "Culoe De Song",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=Culoe+De+Song+Afro+House"
      },
      {
        "title": "Echoes of Afro House",
        "artist": "Da Capo",
        "year": 2004,
        "link": "https://www.youtube.com/results?search_query=Da+Capo+Afro+House"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Shimza",
        "year": 2006,
        "link": "https://www.youtube.com/results?search_query=Shimza+Afro+House"
      },
      {
        "title": "Essential Afro House",
        "artist": "THEMBA",
        "year": 2008,
        "link": "https://www.youtube.com/results?search_query=THEMBA+Afro+House"
      }
    ],
    "representative_artists": [
      "Black Coffee",
      "Culoe De Song",
      "Da Capo",
      "Shimza",
      "THEMBA"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 9,
      "brightness": 5,
      "harmonicComplexity": 4,
      "rhythmDensity": 8,
      "bassEnergy": 9,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "afro-house",
      "bpm": 122,
      "scale": "G minor",
      "swing": 15,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "punchy_kick",
          "steps": [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "snare",
          "name": "Snare / Clap",
          "instrument": "rimshot",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0
          ],
          "volume": 0.85,
          "pan": 0
        },
        {
          "track_id": "hihat",
          "name": "Hi-Hats",
          "instrument": "closed_hat",
          "steps": [
            1,
            0,
            1,
            1,
            1,
            0,
            1,
            1,
            1,
            0,
            1,
            1,
            1,
            0,
            1,
            1
          ],
          "velocity": [
            90,
            0,
            70,
            50,
            90,
            0,
            70,
            50,
            90,
            0,
            70,
            50,
            90,
            0,
            70,
            50
          ],
          "volume": 0.7,
          "pan": -0.2
        },
        {
          "track_id": "percussion",
          "name": "Percussion",
          "instrument": "rim_shaker",
          "steps": [
            1,
            0,
            1,
            0,
            0,
            1,
            0,
            1,
            1,
            0,
            1,
            0,
            0,
            1,
            1,
            0
          ],
          "velocity": [
            85,
            0,
            70,
            0,
            0,
            55,
            0,
            55,
            85,
            0,
            70,
            0,
            0,
            55,
            70,
            0
          ],
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "sub_bass",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            43,
            null,
            null,
            null,
            null,
            null,
            46,
            null,
            null,
            null,
            43,
            null,
            null,
            null,
            null,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "rhodes_ep",
          "steps": [
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            null,
            null,
            67,
            null,
            null,
            null,
            null,
            null,
            70,
            null,
            null,
            null,
            null,
            null,
            null,
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "pluck_synth",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            null,
            null,
            null,
            null,
            79,
            null,
            null,
            null,
            null,
            null,
            82,
            null,
            null,
            null,
            null,
            null
          ],
          "volume": 0.8,
          "pan": 0.1
        },
        {
          "track_id": "fx",
          "name": "FX / Sweep",
          "instrument": "noise_sweep",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "volume": 0.6,
          "pan": 0
        }
      ]
    }
  },
  {
    "id": "nu-disco-house",
    "name": "Nu-Disco House",
    "aliases": [
      "新迪斯科浩室"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2002",
    "origin_decade": 2000,
    "origin_place": {
      "en": "Norway & UK",
      "zh": "挪威与英国"
    },
    "cultural_context": {
      "en": "Revitalization of vintage disco with analog synths, live slap bass, and modern punch.",
      "zh": "对经典迪斯科的现代化复兴，融合复古模拟合成器、生动的放克贝斯与现代清脆重击。"
    },
    "bpm_range": "118–124 BPM",
    "default_bpm": 120,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–iv–v",
      "I–vi–ii–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Arp Odyssey Arpeggios",
      "Plucked Synth Chords",
      "Fingerstyle Electric Bass",
      "Organ Chords",
      "Brass Stabs"
    ],
    "sound_design": {
      "en": "Arp Odyssey and Juno arpeggios, slap bass guitar, clavinet chops, brass stabs.",
      "zh": "复古合成琶音、Slap 电贝斯、电古钢琴切片与明亮铜管刺音。"
    },
    "rhythm_features": {
      "en": "Crisp 4/4 disco beat with offbeat open hats, acoustic snare + claps, cowbells.",
      "zh": "清脆四四拍迪斯科律动，反拍开镲、原声军鼓与拍手层叠敲击及律动牛铃。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Nu-Disco House signature kick character.",
        "zh": "Nu-Disco House 风格代表性底鼓特征。"
      },
      "snare_clap": {
        "en": "Layered snare and clap with crisp mid-high punch.",
        "zh": "叠层军鼓与拍手，带有扎实的中高频瞬态。"
      },
      "hihats": {
        "en": "Closed and open hi-hats providing drive and syncopation.",
        "zh": "闭镲与开镲交替提供推进力与切分感。"
      },
      "percussion": {
        "en": "Supplementary rhythmic accents and foley.",
        "zh": "辅助打击乐加花与质感点缀。"
      },
      "swing": {
        "en": "Typical swing around 15%.",
        "zh": "典型摇摆度约 15%。"
      },
      "tempo": "118–124 BPM"
    },
    "bass_pattern": {
      "en": "Syncopated live funk bass featuring slap/pop articulations and ghost notes.",
      "zh": "极富表现力的切分现场放克贝斯线条，充满击勾弦与幽灵音符。"
    },
    "structure": [
      "Intro",
      "Verse / Groove",
      "Build",
      "Drop / Chorus",
      "Breakdown",
      "Drop 2",
      "Outro"
    ],
    "production_tips": {
      "en": [
        "Program realistic bass ghost notes for pocket",
        "Add auto-wah envelope follower to clavinet",
        "Use tape flanging across drum bus in fills"
      ],
      "zh": [
        "编写贝斯幽灵音营造放克松弛感",
        "为电古钢琴加上包络跟随器获得自动哇音",
        "过门加花阶段为鼓总线挂载磁带凸缘效果"
      ]
    },
    "representative_tracks": [
      {
        "title": "Nu-Disco House Anthem",
        "artist": "Todd Terje",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=Todd+Terje+Nu-Disco+House"
      },
      {
        "title": "Midnight in Norway & UK",
        "artist": "Lindstrøm",
        "year": 2004,
        "link": "https://www.youtube.com/results?search_query=Lindstrøm+Nu-Disco+House"
      },
      {
        "title": "Echoes of Nu-Disco House",
        "artist": "Purple Disco Machine",
        "year": 2006,
        "link": "https://www.youtube.com/results?search_query=Purple+Disco+Machine+Nu-Disco+House"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Dimitri From Paris",
        "year": 2008,
        "link": "https://www.youtube.com/results?search_query=Dimitri+From+Paris+Nu-Disco+House"
      },
      {
        "title": "Essential Nu-Disco House",
        "artist": "Yuksek",
        "year": 2010,
        "link": "https://www.youtube.com/results?search_query=Yuksek+Nu-Disco+House"
      }
    ],
    "representative_artists": [
      "Todd Terje",
      "Lindstrøm",
      "Purple Disco Machine",
      "Dimitri From Paris",
      "Yuksek"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 6,
      "harmonicComplexity": 4,
      "rhythmDensity": 6,
      "bassEnergy": 7,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "nu-disco-house",
      "bpm": 122,
      "scale": "A minor",
      "swing": 15,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "punchy_kick",
          "steps": [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "snare",
          "name": "Snare / Clap",
          "instrument": "clap",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0
          ],
          "volume": 0.85,
          "pan": 0
        },
        {
          "track_id": "hihat",
          "name": "Hi-Hats",
          "instrument": "closed_hat",
          "steps": [
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0,
            0,
            0,
            2,
            0
          ],
          "velocity": [
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0,
            0,
            0,
            90,
            0
          ],
          "volume": 0.7,
          "pan": -0.2
        },
        {
          "track_id": "percussion",
          "name": "Percussion",
          "instrument": "rim_shaker",
          "steps": [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            85,
            0,
            0,
            0,
            85,
            0,
            0,
            0,
            85,
            0,
            0,
            0,
            85,
            0,
            0,
            0
          ],
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "finger_bass",
          "steps": [
            1,
            0,
            0,
            1,
            0,
            0,
            1,
            0,
            1,
            0,
            0,
            1,
            0,
            0,
            1,
            0
          ],
          "pitch": [
            45,
            null,
            null,
            45,
            null,
            null,
            48,
            null,
            45,
            null,
            null,
            45,
            null,
            null,
            50,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "m1_organ",
          "steps": [
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            null,
            null,
            69,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            72,
            null,
            null,
            null,
            null,
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "pluck_synth",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "pitch": [
            null,
            null,
            null,
            null,
            81,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            84,
            null,
            null,
            null
          ],
          "volume": 0.8,
          "pan": 0.1
        },
        {
          "track_id": "fx",
          "name": "FX / Sweep",
          "instrument": "noise_sweep",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "volume": 0.6,
          "pan": 0
        }
      ]
    }
  },
  {
    "id": "microhouse",
    "name": "Microhouse",
    "aliases": [
      "微型浩室"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1998",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Germany & Canada",
      "zh": "德国与加拿大"
    },
    "cultural_context": {
      "en": "Minimal house characterized by micro-samples, audio clicks and cuts, and subtle swing.",
      "zh": "由微采样切片、精巧毛刺与极度精简骨架鼓组构筑的极简浩室流派。"
    },
    "bpm_range": "120–126 BPM",
    "default_bpm": 122,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–i",
      "i–VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Microscopic Radio Clicks",
      "Vinyl Needle Drops",
      "Vibraphone Chords",
      "Bell Lead",
      "Fingerstyle Electric Bass"
    ],
    "sound_design": {
      "en": "Microscopic radio clicks, vinyl needle drops, subtle low-passed chords, sub sine.",
      "zh": "显微镜般的收音机电流轻击声、唱针摩擦音、低通滤波和弦与纯净正弦波。"
    },
    "rhythm_features": {
      "en": "Sparse, delicate rhythm composed of clicks, cuts, and organic foley over 4/4 kick.",
      "zh": "由咔哒声与微小拟音构筑的细腻稀疏节拍，倚靠在柔软四四拍底鼓之上。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Microhouse signature kick character.",
        "zh": "Microhouse 风格代表性底鼓特征。"
      },
      "snare_clap": {
        "en": "Layered snare and clap with crisp mid-high punch.",
        "zh": "叠层军鼓与拍手，带有扎实的中高频瞬态。"
      },
      "hihats": {
        "en": "Closed and open hi-hats providing drive and syncopation.",
        "zh": "闭镲与开镲交替提供推进力与切分感。"
      },
      "percussion": {
        "en": "Supplementary rhythmic accents and foley.",
        "zh": "辅助打击乐加花与质感点缀。"
      },
      "swing": {
        "en": "Typical swing around 15%.",
        "zh": "典型摇摆度约 15%。"
      },
      "tempo": "120–126 BPM"
    },
    "bass_pattern": {
      "en": "Subdued warm sine pulses beneath micro-percussions without drawing attention.",
      "zh": "克制温润的正弦低频在微观打击乐下方轻柔脉动。"
    },
    "structure": [
      "Intro",
      "Verse / Groove",
      "Build",
      "Drop / Chorus",
      "Breakdown",
      "Drop 2",
      "Outro"
    ],
    "production_tips": {
      "en": [
        "Slice radio snippet into 32 micro-grains",
        "Keep transient clicks at around -18dB",
        "Pan subtle micro-percussions randomly left and right"
      ],
      "zh": [
        "短波收音机广播切分成 32 个微颗粒按律动编排",
        "瞬态咔哒声电平控制在 -18dB 保留亲近听感",
        "微型打击乐使用随机声像偏置营造沉浸空间"
      ]
    },
    "representative_tracks": [
      {
        "title": "Microhouse Anthem",
        "artist": "Akufen",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Akufen+Microhouse"
      },
      {
        "title": "Midnight in Germany & Canada",
        "artist": "Ricardo Villalobos",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=Ricardo+Villalobos+Microhouse"
      },
      {
        "title": "Echoes of Microhouse",
        "artist": "Matthew Herbert",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=Matthew+Herbert+Microhouse"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Jan Jelinek",
        "year": 2004,
        "link": "https://www.youtube.com/results?search_query=Jan+Jelinek+Microhouse"
      },
      {
        "title": "Essential Microhouse",
        "artist": "Luomo",
        "year": 2006,
        "link": "https://www.youtube.com/results?search_query=Luomo+Microhouse"
      }
    ],
    "representative_artists": [
      "Akufen",
      "Ricardo Villalobos",
      "Matthew Herbert",
      "Jan Jelinek",
      "Luomo"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 4,
      "harmonicComplexity": 2,
      "rhythmDensity": 5,
      "bassEnergy": 9,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "microhouse",
      "bpm": 123,
      "scale": "C minor",
      "swing": 10,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "punchy_kick",
          "steps": [
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0,
            120,
            0,
            0,
            0
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "snare",
          "name": "Snare / Clap",
          "instrument": "rimshot",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            0
          ],
          "volume": 0.85,
          "pan": 0
        },
        {
          "track_id": "hihat",
          "name": "Hi-Hats",
          "instrument": "closed_hat",
          "steps": [
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0
          ],
          "velocity": [
            0,
            0,
            70,
            0,
            0,
            0,
            70,
            0,
            0,
            0,
            70,
            0,
            0,
            0,
            70,
            0
          ],
          "volume": 0.7,
          "pan": -0.2
        },
        {
          "track_id": "percussion",
          "name": "Percussion",
          "instrument": "rim_shaker",
          "steps": [
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0
          ],
          "velocity": [
            0,
            55,
            0,
            0,
            0,
            0,
            70,
            0,
            0,
            0,
            0,
            55,
            0,
            0,
            0,
            0
          ],
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "finger_bass",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            36,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            39,
            null,
            null,
            null,
            null,
            null,
            null,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "vibraphone",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            60,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "bell_lead",
          "steps": [
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "pitch": [
            null,
            null,
            null,
            null,
            72,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            75,
            null,
            null,
            null
          ],
          "volume": 0.8,
          "pan": 0.1
        },
        {
          "track_id": "fx",
          "name": "FX / Sweep",
          "instrument": "vinyl_crackle",
          "steps": [
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "volume": 0.6,
          "pan": 0
        }
      ]
    }
  }
];
