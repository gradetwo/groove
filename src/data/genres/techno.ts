import { Genre } from '../../types/genre';

export const TECHNO_GENRES: Genre[] = [
  {
    "id": "detroit-techno",
    "name": "Detroit Techno",
    "aliases": [
      "底特律铁克诺"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1985",
    "origin_decade": 1980,
    "origin_place": {
      "en": "Detroit, USA",
      "zh": "美国底特律"
    },
    "cultural_context": {
      "en": "Created in mid-1980s Detroit, channeling post-industrial decline into Afro-futurist machine funk.",
      "zh": "1980 年代中期开创于底特律，将后工业时代的萧条感化为科幻意象的机械放克。"
    },
    "bpm_range": "125–135 BPM",
    "default_bpm": 128,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–i–VII",
      "i–VI–VII"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Juno Synth Pads",
      "Metallic String Stabs",
      "Sawtooth Synth Lead",
      "TR-909 / 808 Drums",
      "Sub Bass"
    ],
    "sound_design": {
      "en": "Roland TR-909/808 drums, Juno synths, Yamaha DX100, metallic string stabs.",
      "zh": "Roland TR-909/808 鼓机、Roland Juno 与 Yamaha DX100 合成器及金属弦乐刺音。"
    },
    "rhythm_features": {
      "en": "Driving 4/4 mechanical pulse, high-energy ride cymbals, syncopated snares.",
      "zh": "极富催眠感的四四拍机械脉冲，能量充沛的 Ride 镲片敲击与切分军鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Detroit Techno signature kick character.",
        "zh": "Detroit Techno 风格代表性底鼓特征。"
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
      "en": "Repetitive, driving synth bass sequences locked with kick for relentless momentum.",
      "zh": "重复性极高的合成贝斯音序与底鼓咬合，赋予不可阻挡的向前冲击力。"
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
        "Sequence dynamic 16th-note hats with velocity nuances",
        "Sample orchestral stabs, pitch down 4 semitones",
        "Keep arrangement minimal, introducing elements slowly"
      ],
      "zh": [
        "踩镲轨道编写带有力度阶梯的十六分音符",
        "采样管弦乐刺音向下移调 4 个半音获复古色彩",
        "结构极简克制，缓慢引入变化"
      ]
    },
    "representative_tracks": [
      {
        "title": "Detroit Techno Anthem",
        "artist": "Juan Atkins",
        "year": 1985,
        "link": "https://www.youtube.com/results?search_query=Juan+Atkins+Detroit+Techno"
      },
      {
        "title": "Midnight in Detroit",
        "artist": "Derrick May",
        "year": 1987,
        "link": "https://www.youtube.com/results?search_query=Derrick+May+Detroit+Techno"
      },
      {
        "title": "Echoes of Detroit Techno",
        "artist": "Kevin Saunderson",
        "year": 1989,
        "link": "https://www.youtube.com/results?search_query=Kevin+Saunderson+Detroit+Techno"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Jeff Mills",
        "year": 1991,
        "link": "https://www.youtube.com/results?search_query=Jeff+Mills+Detroit+Techno"
      },
      {
        "title": "Essential Detroit Techno",
        "artist": "Robert Hood",
        "year": 1993,
        "link": "https://www.youtube.com/results?search_query=Robert+Hood+Detroit+Techno"
      }
    ],
    "representative_artists": [
      "Juan Atkins",
      "Derrick May",
      "Kevin Saunderson",
      "Jeff Mills",
      "Robert Hood"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 5,
      "brightness": 8,
      "harmonicComplexity": 7,
      "rhythmDensity": 7,
      "bassEnergy": 9,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "detroit-techno",
      "bpm": 128,
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
            36,
            null,
            null,
            36,
            null,
            null,
            39,
            null,
            36,
            null,
            null,
            36,
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
            60,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            63,
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
    "id": "minimal-techno",
    "name": "Minimal Techno",
    "aliases": [
      "极简铁克诺"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1994",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Detroit & Berlin",
      "zh": "底特律与柏林"
    },
    "cultural_context": {
      "en": "Stripped techno down to skeletal rhythms and skeletal repetition, avoiding overproduction.",
      "zh": "反抗过度制作的繁杂，将音乐精炼为骨骼般的纯粹节奏与极简重复。"
    },
    "bpm_range": "124–130 BPM",
    "default_bpm": 126,
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
      "Short Metallic Clicks",
      "Resonant Blips",
      "Filtered Noise Bursts",
      "Plucked Synth Stabs",
      "Warm Pad",
      "Dry Sub Bass"
    ],
    "sound_design": {
      "en": "Short metallic clicks, resonant blips, filtered noise bursts, dry sub-bass kicks.",
      "zh": "极短金属敲击声、高共鸣蜂鸣点音、滤波噪声突发与干燥超低底鼓。"
    },
    "rhythm_features": {
      "en": "Hypnotic stripped 4/4 kick with micro-timed percussion clicks and sparse hats.",
      "zh": "极富催眠感的极简四踩四底鼓，搭配微观时值控制的打击乐点击声。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Minimal Techno signature kick character.",
        "zh": "Minimal Techno 风格代表性底鼓特征。"
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
      "tempo": "124–130 BPM"
    },
    "bass_pattern": {
      "en": "Monolithic single-note sub pulses or short bass staccato pulses locked on grid.",
      "zh": "铁板一块的单音超低频脉冲，或节拍网格上短促干练的断奏贝斯跳动。"
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
        "Limit composition to 6-8 audio tracks",
        "Rely on envelope adjustments rather than new sounds",
        "Use tight noise gates to chop sound tails"
      ],
      "zh": [
        "强制整首作品使用不超过 6 到 8 条音轨",
        "依靠毫秒级衰减与释放包络微调推进段落",
        "使用严格噪声门切断尾音获得冷峻利落感"
      ]
    },
    "representative_tracks": [
      {
        "title": "Minimal Techno Anthem",
        "artist": "Robert Hood",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=Robert+Hood+Minimal+Techno"
      },
      {
        "title": "Midnight in Detroit & Berlin",
        "artist": "Richie Hawtin",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Richie+Hawtin+Minimal+Techno"
      },
      {
        "title": "Echoes of Minimal Techno",
        "artist": "Daniel Bell",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Daniel+Bell+Minimal+Techno"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Ricardo Villalobos",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=Ricardo+Villalobos+Minimal+Techno"
      },
      {
        "title": "Essential Minimal Techno",
        "artist": "Marc Houle",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=Marc+Houle+Minimal+Techno"
      }
    ],
    "representative_artists": [
      "Robert Hood",
      "Richie Hawtin",
      "Daniel Bell",
      "Ricardo Villalobos",
      "Marc Houle"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 5,
      "brightness": 7,
      "harmonicComplexity": 1,
      "rhythmDensity": 6,
      "bassEnergy": 9,
      "melodicFocus": 2
    },
    "sequencer_pattern": {
      "genre_id": "minimal-techno",
      "bpm": 125,
      "scale": "A minor",
      "swing": 0,
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
            1,
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
            45,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            48,
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
    "id": "acid-techno",
    "name": "Acid Techno",
    "aliases": [
      "酸性铁克诺"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1992",
    "origin_decade": 1990,
    "origin_place": {
      "en": "London & Berlin",
      "zh": "伦敦与柏林"
    },
    "cultural_context": {
      "en": "Marrying squelching TB-303s with hard distorted 140+ BPM kicks and raw squat rave energy.",
      "zh": "将酸性尖叫的 TB-303 与 140+ BPM 硬核失真底鼓和暴烈地下狂欢能量联姻。"
    },
    "bpm_range": "135–145 BPM",
    "default_bpm": 138,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–i–VII",
      "i–♭VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Overdriven TB-303",
      "Warm Pad",
      "Distorted 909 Kicks",
      "Screaming Resonance"
    ],
    "sound_design": {
      "en": "Multiple overdriven TB-303 synths, screaming resonance, distorted 909 kicks.",
      "zh": "多台踏板过载的 TB-303、咆哮共振峰、失真 TR-909 底鼓与工业警报声。"
    },
    "rhythm_features": {
      "en": "Aggressive 4/4 stomping kick, relentless 16th-note ride cymbals, whipping snares.",
      "zh": "极速暴击的四踩四重踏底鼓、不休止的十六分音符 Ride 镲与清脆军鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Acid Techno signature kick character.",
        "zh": "Acid Techno 风格代表性底鼓特征。"
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
      "tempo": "135–145 BPM"
    },
    "bass_pattern": {
      "en": "Dual interleaved 303 sequences running high resonance and continuous slides.",
      "zh": "双轨交错的 303 音序，开启高谐振峰与连续不断的音高连音滑音。"
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
        "Route 303 into guitar amp distortion simulator",
        "Stack two 303 patterns an octave apart",
        "Sidechain 303 heavily to kick"
      ],
      "zh": [
        "将 303 接入吉他箱头失真单块模拟器",
        "相隔八度的两条 303 音序并置播放制造音墙",
        "在 140 BPM 极速下对 303 精细侧链闪避"
      ]
    },
    "representative_tracks": [
      {
        "title": "Acid Techno Anthem",
        "artist": "Chris Liberator",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=Chris+Liberator+Acid+Techno"
      },
      {
        "title": "Midnight in London & Berlin",
        "artist": "D.A.V.E. The Drummer",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=D.A.V.E.+The+Drummer+Acid+Techno"
      },
      {
        "title": "Echoes of Acid Techno",
        "artist": "Sterling Moss",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Sterling+Moss+Acid+Techno"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Hardfloor",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Hardfloor+Acid+Techno"
      },
      {
        "title": "Essential Acid Techno",
        "artist": "Emmanuel Top",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=Emmanuel+Top+Acid+Techno"
      }
    ],
    "representative_artists": [
      "Chris Liberator",
      "D.A.V.E. The Drummer",
      "Sterling Moss",
      "Hardfloor",
      "Emmanuel Top"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 4,
      "brightness": 8,
      "harmonicComplexity": 5,
      "rhythmDensity": 10,
      "bassEnergy": 7,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "acid-techno",
      "bpm": 138,
      "scale": "D minor",
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
            38,
            null,
            38,
            50,
            null,
            38,
            null,
            41,
            38,
            null,
            43,
            45,
            null,
            38,
            50,
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
          "instrument": "acid_303",
          "steps": [
            1,
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
            0,
            1,
            1,
            0,
            1
          ],
          "pitch": [
            74,
            74,
            null,
            77,
            74,
            null,
            79,
            74,
            null,
            81,
            74,
            null,
            77,
            74,
            null,
            82
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
    "id": "dub-techno",
    "name": "Dub Techno",
    "aliases": [
      "回响铁克诺"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1993",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Berlin, Germany",
      "zh": "德国柏林"
    },
    "cultural_context": {
      "en": "Invented by Basic Channel in Berlin, fusing Detroit techno with tape delays and cavernous reverb.",
      "zh": "由 Basic Channel 在柏林开创，将底特律 Techno 与牙买加 Dub 磁带回声和洞穴混响交融。"
    },
    "bpm_range": "118–125 BPM",
    "default_bpm": 120,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–i",
      "i–iv–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Tape-Delayed Chord Stabs",
      "Warm Pad",
      "Sawtooth Synth Lead",
      "Analog Noise",
      "Deep Sub Bass"
    ],
    "sound_design": {
      "en": "Tape-delayed minor chord stabs, sweeping filters with high feedback, analog noise.",
      "zh": "磁带延迟小调和弦切片、大反馈滤波回响、黑胶底噪与棉花般超低频。"
    },
    "rhythm_features": {
      "en": "Subdued soft 4/4 kick pulse muffled under analog noise and delayed percussive ripples.",
      "zh": "在层层模拟底噪与延迟波纹下沉潜的温和四四拍底鼓，克制冥想。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Dub Techno signature kick character.",
        "zh": "Dub Techno 风格代表性底鼓特征。"
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
      "tempo": "118–125 BPM"
    },
    "bass_pattern": {
      "en": "Warm round sub-bass drone pulsing gently in sync with filtered chords.",
      "zh": "温暖圆润的超低频长鸣，与滤波和弦保持同步的微弱呼吸起伏。"
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
        "Feed tape delay output back into resonant filter",
        "Stack minor 9th stabs into 100% wet spring reverb",
        "Keep continuous analog hiss in background"
      ],
      "zh": [
        "磁带延迟输出重新环回馈入带共振低通滤波器",
        "小九和弦刺音推入全湿弹簧混响",
        "始终保留一条持续的模拟磁带嘶嘶声"
      ]
    },
    "representative_tracks": [
      {
        "title": "Dub Techno Anthem",
        "artist": "Basic Channel",
        "year": 1993,
        "link": "https://www.youtube.com/results?search_query=Basic+Channel+Dub+Techno"
      },
      {
        "title": "Midnight in Berlin",
        "artist": "Deepchord",
        "year": 1995,
        "link": "https://www.youtube.com/results?search_query=Deepchord+Dub+Techno"
      },
      {
        "title": "Echoes of Dub Techno",
        "artist": "Echospace",
        "year": 1997,
        "link": "https://www.youtube.com/results?search_query=Echospace+Dub+Techno"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Rhythm & Sound",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=Rhythm+&+Sound+Dub+Techno"
      },
      {
        "title": "Essential Dub Techno",
        "artist": "Rod Modell",
        "year": 2001,
        "link": "https://www.youtube.com/results?search_query=Rod+Modell+Dub+Techno"
      }
    ],
    "representative_artists": [
      "Basic Channel",
      "Deepchord",
      "Echospace",
      "Rhythm & Sound",
      "Rod Modell"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 4,
      "brightness": 2,
      "harmonicComplexity": 1,
      "rhythmDensity": 3,
      "bassEnergy": 9,
      "melodicFocus": 3
    },
    "sequencer_pattern": {
      "genre_id": "dub-techno",
      "bpm": 122,
      "scale": "C minor",
      "swing": 0,
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
            36,
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
          "instrument": "saw_lead",
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
    "id": "industrial-techno",
    "name": "Industrial Techno",
    "aliases": [
      "工业铁克诺"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1990",
    "origin_decade": 1990,
    "origin_place": {
      "en": "UK & Germany",
      "zh": "英国与德国"
    },
    "cultural_context": {
      "en": "A dark subgenre merging techno hypnotic repetition with metal scrapes, clangs, and brutal distortion.",
      "zh": "将 Techno 催眠循环律动与工业金属摩擦声、机械撞击声和残暴失真融合。"
    },
    "bpm_range": "135–150 BPM",
    "default_bpm": 140,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭II–i",
      "i–♭VI–♭VII"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Crushed Anvil Impacts",
      "Distorted 909 Kicks",
      "Reese Bass",
      "Harsh Metallic Feedback",
      "Warm Pad",
      "Sawtooth Synth Lead"
    ],
    "sound_design": {
      "en": "Crushed anvil impacts, distorted 909 kicks into analog mixers, harsh metallic feedback.",
      "zh": "重击铁砧采样、在模拟调音台上爆表的失真 909 底鼓与尖锐金属啸叫。"
    },
    "rhythm_features": {
      "en": "Heavy stomping kicks with syncopated metallic clangs serving as percussive markers.",
      "zh": "重型践踏式压迫底鼓，穿插着切分金属敲击声作为节奏标尺。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Industrial Techno signature kick character.",
        "zh": "Industrial Techno 风格代表性底鼓特征。"
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
      "tempo": "135–150 BPM"
    },
    "bass_pattern": {
      "en": "Massive distorted low-end rumble generated by overdriving reverb tails from kick.",
      "zh": "由底鼓的超长混响尾音经过激进过载失真后形成的庞大低频轰鸣。"
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
        "Send kick to reverb at 100% wet and bitcrush",
        "Sample metal impacts and pitch down for claps",
        "Apply aggressive parallel distortion"
      ],
      "zh": [
        "底鼓送入纯湿声混响切低通并加失真制造轰鸣",
        "采集金属撞击声向下移调制作暗黑拍手",
        "对鼓组采用并行失真保留瞬态清晰度"
      ]
    },
    "representative_tracks": [
      {
        "title": "Industrial Techno Anthem",
        "artist": "Perc",
        "year": 1990,
        "link": "https://www.youtube.com/results?search_query=Perc+Industrial+Techno"
      },
      {
        "title": "Midnight in UK & Germany",
        "artist": "Paula Temple",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=Paula+Temple+Industrial+Techno"
      },
      {
        "title": "Echoes of Industrial Techno",
        "artist": "Surgeon",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=Surgeon+Industrial+Techno"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Ancient Methods",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Ancient+Methods+Industrial+Techno"
      },
      {
        "title": "Essential Industrial Techno",
        "artist": "Dax J",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Dax+J+Industrial+Techno"
      }
    ],
    "representative_artists": [
      "Perc",
      "Paula Temple",
      "Surgeon",
      "Ancient Methods",
      "Dax J"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 6,
      "brightness": 10,
      "harmonicComplexity": 1,
      "rhythmDensity": 10,
      "bassEnergy": 9,
      "melodicFocus": 4
    },
    "sequencer_pattern": {
      "genre_id": "industrial-techno",
      "bpm": 138,
      "scale": "E minor",
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
            0,
            0
          ],
          "velocity": [
            0,
            55,
            0,
            0,
            85,
            0,
            0,
            0,
            0,
            55,
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
            40,
            40,
            40,
            40,
            40,
            40,
            40,
            40,
            43,
            43,
            43,
            43,
            40,
            40,
            45,
            46
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
    "id": "peak-time-techno",
    "name": "Peak Time Techno",
    "aliases": [
      "黄金时段铁克诺"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2010",
    "origin_decade": 2010,
    "origin_place": {
      "en": "Berlin & Amsterdam",
      "zh": "柏林与阿姆斯特丹"
    },
    "cultural_context": {
      "en": "Tailored for peak-time stages with thunderous sub rumbles and dramatic breakdowns.",
      "zh": "专为音乐节黄金时段量身定制，以雷霆万钧的低频轰鸣与戏剧性合成器大分解著称。"
    },
    "bpm_range": "130–136 BPM",
    "default_bpm": 132,
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
      "Pulsing Rumble Kicks",
      "Monosynth Hook Lines",
      "Warm Pad",
      "White-Noise Risers",
      "Sub Bass"
    ],
    "sound_design": {
      "en": "Pulsing rumble kicks, monosynth hook lines, white-noise risers, vocal chants.",
      "zh": "脉动轰鸣底鼓（Rumble Kick）、催眠单音合成器 Hook、白噪升效与沉浸吟唱。"
    },
    "rhythm_features": {
      "en": "Straight driving 4/4 kicks with high-energy rolling 16th hats and build-up snare risers.",
      "zh": "笔直推进的四四拍底鼓，伴随高能量滚动十六分音符踩镲与密集军鼓提升。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Peak Time Techno signature kick character.",
        "zh": "Peak Time Techno 风格代表性底鼓特征。"
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
      "tempo": "130–136 BPM"
    },
    "bass_pattern": {
      "en": "Tuned kick-rumble bassline locked into root note providing continuous low-end tsunami.",
      "zh": "定调精准紧扣主根音的底鼓轰鸣低音，制造源源不断的低频海啸。"
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
        "Craft rumble kick using delay + reverb + overdrive",
        "Automate reverb send and delay feedback during breakdowns",
        "Keep master dynamics punchy with modern limiter"
      ],
      "zh": [
        "利用延迟+混响+过载反向侧链雕琢 Rumble Kick",
        "在转场阶段对主旋律合成器混响做激进抬升",
        "使用透明度极高的母带限制器控制峰值"
      ]
    },
    "representative_tracks": [
      {
        "title": "Peak Time Techno Anthem",
        "artist": "Adam Beyer",
        "year": 2010,
        "link": "https://www.youtube.com/results?search_query=Adam+Beyer+Peak+Time+Techno"
      },
      {
        "title": "Midnight in Berlin & Amsterdam",
        "artist": "Charlotte de Witte",
        "year": 2012,
        "link": "https://www.youtube.com/results?search_query=Charlotte+de+Witte+Peak+Time+Techno"
      },
      {
        "title": "Echoes of Peak Time Techno",
        "artist": "Amelie Lens",
        "year": 2014,
        "link": "https://www.youtube.com/results?search_query=Amelie+Lens+Peak+Time+Techno"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Enrico Sangiuliano",
        "year": 2016,
        "link": "https://www.youtube.com/results?search_query=Enrico+Sangiuliano+Peak+Time+Techno"
      },
      {
        "title": "Essential Peak Time Techno",
        "artist": "Joyhauser",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=Joyhauser+Peak+Time+Techno"
      }
    ],
    "representative_artists": [
      "Adam Beyer",
      "Charlotte de Witte",
      "Amelie Lens",
      "Enrico Sangiuliano",
      "Joyhauser"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 4,
      "brightness": 6,
      "harmonicComplexity": 2,
      "rhythmDensity": 9,
      "bassEnergy": 9,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "peak-time-techno",
      "bpm": 134,
      "scale": "F minor",
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
          "instrument": "sub_bass",
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
            46,
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
    "id": "hard-techno",
    "name": "Hard Techno",
    "aliases": [
      "硬核铁克诺"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1995",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Frankfurt & Paris",
      "zh": "法兰克福与巴黎"
    },
    "cultural_context": {
      "en": "Pushes tempos past 150 BPM with distorted blown-out kick drums and relentless aggression.",
      "zh": "将速度狂飙至 150 BPM 以上，以失真炸裂的底鼓、复古狂欢旋律与野蛮冲击力著称。"
    },
    "bpm_range": "145–160 BPM",
    "default_bpm": 152,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭VII–i",
      "i–♭II–♭VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Hard Clipped Kicks",
      "Screaming Screech Synth",
      "303 Acid Bass",
      "Warm Pad",
      "Metallic Clatter"
    ],
    "sound_design": {
      "en": "Hard clipped kicks, screaming screech synths, metallic clatter, saturated rave stabs.",
      "zh": "硬剪切底鼓、尖叫撕裂的 Screech 合成音色、金属碎裂声与饱和复古刺音。"
    },
    "rhythm_features": {
      "en": "Blistering 4/4 pounding kicks with furious 16th-note ride cymbals, whipping offbeat snares.",
      "zh": "狂风骤雨般的四四拍狂锤底鼓，配合暴风般的十六分音符 Ride 镲与反拍军鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Hard Techno signature kick character.",
        "zh": "Hard Techno 风格代表性底鼓特征。"
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
      "tempo": "145–160 BPM"
    },
    "bass_pattern": {
      "en": "Extreme distorted sub bass tails that continuously shake the low spectrum without pauses.",
      "zh": "极度失真过载的超低音尾音，密不透风地持续撼动整个超低音频段。"
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
        "Overdrive drum bus with analog tape saturation",
        "Tweak high-pass filters on mid screeches",
        "Layer punch kicks with shortened decay for 155 BPM"
      ],
      "zh": [
        "使用模拟磁带饱和插件适度过载鼓组总线",
        "对中频尖叫音色做严格高通切除防止污染低频",
        "选用衰减极短的高瞬态底鼓确保 155 BPM 清晰"
      ]
    },
    "representative_tracks": [
      {
        "title": "Hard Techno Anthem",
        "artist": "Nico Moreno",
        "year": 1995,
        "link": "https://www.youtube.com/results?search_query=Nico+Moreno+Hard+Techno"
      },
      {
        "title": "Midnight in Frankfurt & Paris",
        "artist": "Klangkuenstler",
        "year": 1997,
        "link": "https://www.youtube.com/results?search_query=Klangkuenstler+Hard+Techno"
      },
      {
        "title": "Echoes of Hard Techno",
        "artist": "I Hate Models",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=I+Hate+Models+Hard+Techno"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Alignment",
        "year": 2001,
        "link": "https://www.youtube.com/results?search_query=Alignment+Hard+Techno"
      },
      {
        "title": "Essential Hard Techno",
        "artist": "Viper Diva",
        "year": 2003,
        "link": "https://www.youtube.com/results?search_query=Viper+Diva+Hard+Techno"
      }
    ],
    "representative_artists": [
      "Nico Moreno",
      "Klangkuenstler",
      "I Hate Models",
      "Alignment",
      "Viper Diva"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 4,
      "brightness": 8,
      "harmonicComplexity": 1,
      "rhythmDensity": 9,
      "bassEnergy": 9,
      "melodicFocus": 4
    },
    "sequencer_pattern": {
      "genre_id": "hard-techno",
      "bpm": 150,
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
            0,
            70,
            0,
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
          "pitch": [
            43,
            null,
            43,
            43,
            43,
            null,
            43,
            43,
            46,
            null,
            46,
            46,
            43,
            null,
            48,
            46
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
            79,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            82,
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
    "id": "ambient-techno",
    "name": "Ambient Techno",
    "aliases": [
      "氛围铁克诺"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1991",
    "origin_decade": 1990,
    "origin_place": {
      "en": "UK & Belgium",
      "zh": "英国与比利时"
    },
    "cultural_context": {
      "en": "Chill-out room music merging subtle 4/4 techno pulses with weightless ambient soundscapes.",
      "zh": "派对 Chill-out 休息区音乐，将 Techno 克制四四拍脉动与 Ambient 辽阔声音景观熔合。"
    },
    "bpm_range": "115–124 BPM",
    "default_bpm": 120,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–i",
      "i–iv–VI"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Ethereal String Washes",
      "Warm Pad",
      "Sub Bass",
      "Nature Field Recordings",
      "Pillowy Kicks"
    ],
    "sound_design": {
      "en": "Ethereal synth washes, shimmering reverbs, nature field recordings, pillowy kicks.",
      "zh": "飘渺空灵的合成铺底、闪烁晶莹的漫长混响、自然环境采样与柔和底鼓。"
    },
    "rhythm_features": {
      "en": "Gentle, understated 4/4 rhythm providing a hypnotic anchor without overwhelming space.",
      "zh": "温和内敛的四四拍节奏，为浩瀚声音空间提供催眠引力锚点。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Ambient Techno signature kick character.",
        "zh": "Ambient Techno 风格代表性底鼓特征。"
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
      "tempo": "115–124 BPM"
    },
    "bass_pattern": {
      "en": "Deep, slow-moving sine sub-bass drones shifting gently over extended periods.",
      "zh": "深沉缓慢移动的正弦波低音长鸣，在漫长时间跨度内平缓流动。"
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
        "Send pads into reverbs with decay over 10 seconds",
        "Layer vinyl noise or forest ambience",
        "Soften drum transients with slow attack compressors"
      ],
      "zh": [
        "合成器送入衰减超过 10 秒的深空混响",
        "在背景层叠录微弱黑胶爆豆声注入触觉温度",
        "使用慢起音压缩器软化鼓组瞬态使其融入环境"
      ]
    },
    "representative_tracks": [
      {
        "title": "Ambient Techno Anthem",
        "artist": "The Orb",
        "year": 1991,
        "link": "https://www.youtube.com/results?search_query=The+Orb+Ambient+Techno"
      },
      {
        "title": "Midnight in UK & Belgium",
        "artist": "Biosphere",
        "year": 1993,
        "link": "https://www.youtube.com/results?search_query=Biosphere+Ambient+Techno"
      },
      {
        "title": "Echoes of Ambient Techno",
        "artist": "Aphex Twin",
        "year": 1995,
        "link": "https://www.youtube.com/results?search_query=Aphex+Twin+Ambient+Techno"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Global Communication",
        "year": 1997,
        "link": "https://www.youtube.com/results?search_query=Global+Communication+Ambient+Techno"
      },
      {
        "title": "Essential Ambient Techno",
        "artist": "GAS",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=GAS+Ambient+Techno"
      }
    ],
    "representative_artists": [
      "The Orb",
      "Biosphere",
      "Aphex Twin",
      "Global Communication",
      "GAS"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 2,
      "brightness": 4,
      "harmonicComplexity": 1,
      "rhythmDensity": 3,
      "bassEnergy": 9,
      "melodicFocus": 2
    },
    "sequencer_pattern": {
      "genre_id": "ambient-techno",
      "bpm": 120,
      "scale": "D minor",
      "swing": 0,
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
            38,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            41,
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
            62,
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
          "instrument": "strings_lead",
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
            74,
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
          "instrument": "noise_rise",
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
    "id": "raw-techno",
    "name": "Raw Techno",
    "aliases": [
      "原始铁克诺"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2012",
    "origin_decade": 2010,
    "origin_place": {
      "en": "UK & Germany",
      "zh": "英国与德国"
    },
    "cultural_context": {
      "en": "A return to analog hardware fundamentals and tape grit, prioritizing modular polyrhythms.",
      "zh": "对模拟硬件本源与磁带粗糙质感的致敬与回归，专注于模块化复合节奏与深层催眠律动。"
    },
    "bpm_range": "130–138 BPM",
    "default_bpm": 134,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–i",
      "i–♭VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Overdriven Analog Drum Synths",
      "Eurorack Modular Squeals",
      "Square-Wave Lead",
      "Tape Hiss",
      "Warm Pad",
      "Sub Bass"
    ],
    "sound_design": {
      "en": "Overdriven analog drum synths, Eurorack modular squeals, tape hiss, dark metal percussion.",
      "zh": "过载模拟鼓机音色、模块合成啸叫、磁带底噪与暗色金属敲击打击乐。"
    },
    "rhythm_features": {
      "en": "Syncopated hypnotic percussive grooves with polyrhythmic step sequencing and ghost hits.",
      "zh": "切分且极其催眠的打击乐律动，充满多节奏音序排列与幽灵敲击点。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Raw Techno signature kick character.",
        "zh": "Raw Techno 风格代表性底鼓特征。"
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
      "tempo": "130–138 BPM"
    },
    "bass_pattern": {
      "en": "Subdued analog sub-frequency pulses locking tightly with the kick tail.",
      "zh": "深潜内敛的模拟超低频脉冲，与底鼓尾部紧密啮合为一体。"
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
        "Record hardware synthesizers live",
        "Drive drum loops through real analog guitar preamps",
        "Automate envelope parameters polyrhythmically"
      ],
      "zh": [
        "实时实录硬件合成器演奏保留微妙时间差",
        "将鼓循环送入真实吉他前级电子管设备染色",
        "采用非常规步进循环对包络进行调制"
      ]
    },
    "representative_tracks": [
      {
        "title": "Raw Techno Anthem",
        "artist": "Oscar Mulero",
        "year": 2012,
        "link": "https://www.youtube.com/results?search_query=Oscar+Mulero+Raw+Techno"
      },
      {
        "title": "Midnight in UK & Germany",
        "artist": "Blawan",
        "year": 2014,
        "link": "https://www.youtube.com/results?search_query=Blawan+Raw+Techno"
      },
      {
        "title": "Echoes of Raw Techno",
        "artist": "Karenn",
        "year": 2016,
        "link": "https://www.youtube.com/results?search_query=Karenn+Raw+Techno"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Shifted",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=Shifted+Raw+Techno"
      },
      {
        "title": "Essential Raw Techno",
        "artist": "Setaoc Mass",
        "year": 2020,
        "link": "https://www.youtube.com/results?search_query=Setaoc+Mass+Raw+Techno"
      }
    ],
    "representative_artists": [
      "Oscar Mulero",
      "Blawan",
      "Karenn",
      "Shifted",
      "Setaoc Mass"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 6,
      "brightness": 7,
      "harmonicComplexity": 1,
      "rhythmDensity": 10,
      "bassEnergy": 6,
      "melodicFocus": 3
    },
    "sequencer_pattern": {
      "genre_id": "raw-techno",
      "bpm": 134,
      "scale": "A minor",
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
            0,
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
            0,
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
  },
  {
    "id": "schranz",
    "name": "Schranz",
    "aliases": [
      "施兰茨铁克诺"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1999",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Frankfurt, Germany",
      "zh": "德国法兰克福"
    },
    "cultural_context": {
      "en": "150+ BPM techno built around heavily distorted, repetitive rhythmic loops that sound like smashing metal.",
      "zh": "速度突破 150+ BPM、围绕极度失真重复的铁石击打般碎裂循环建立的高能硬核 Techno。"
    },
    "bpm_range": "150–160 BPM",
    "default_bpm": 155,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭II–i",
      "i–♭VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Massively Compressed Saturated Loops",
      "Distorted Kicks",
      "Grinding Metallic Noise",
      "Sawtooth Synth Lead",
      "Warm Pad",
      "Sub Bass"
    ],
    "sound_design": {
      "en": "Massively compressed saturated loops, heavily distorted kicks, grinding metallic noise.",
      "zh": "超高压缩比与极度饱和打击乐循环、重度失真削波底鼓与摩擦金属噪声。"
    },
    "rhythm_features": {
      "en": "Monolithic pulverizing 4/4 kick assault with syncopated distorted loops at breakneck speed.",
      "zh": "如压路机般碾压的坚硬四踩四底鼓轰炸，伴随极速飞驰的切分失真循环。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Schranz signature kick character.",
        "zh": "Schranz 风格代表性底鼓特征。"
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
      "tempo": "150–160 BPM"
    },
    "bass_pattern": {
      "en": "Blended completely into distorted kick body, forming a relentless low-end sledgehammer.",
      "zh": "完全融化在失真底鼓本体中，形成一柄毫无停歇的超重低频铁锤。"
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
        "Slam drum loop through 3 consecutive distortion plugins",
        "Apply aggressive band-pass filtering for mid punch",
        "Keep kicks tuned and tight to prevent mud at 155 BPM"
      ],
      "zh": [
        "鼓循环连续送入 3 个串联过载失真效果器",
        "对节奏循环使用窄频带通滤波打造中频重击",
        "底鼓精准定调并收紧衰减防止低频混浊"
      ]
    },
    "representative_tracks": [
      {
        "title": "Schranz Anthem",
        "artist": "Chris Liebing",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=Chris+Liebing+Schranz"
      },
      {
        "title": "Midnight in Frankfurt",
        "artist": "DJ Rush",
        "year": 2001,
        "link": "https://www.youtube.com/results?search_query=DJ+Rush+Schranz"
      },
      {
        "title": "Echoes of Schranz",
        "artist": "Speedy J",
        "year": 2003,
        "link": "https://www.youtube.com/results?search_query=Speedy+J+Schranz"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Boris S.",
        "year": 2005,
        "link": "https://www.youtube.com/results?search_query=Boris+S.+Schranz"
      },
      {
        "title": "Essential Schranz",
        "artist": "Felix Kröcher",
        "year": 2007,
        "link": "https://www.youtube.com/results?search_query=Felix+Kröcher+Schranz"
      }
    ],
    "representative_artists": [
      "Chris Liebing",
      "DJ Rush",
      "Speedy J",
      "Boris S.",
      "Felix Kröcher"
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
      "melodicFocus": 4
    },
    "sequencer_pattern": {
      "genre_id": "schranz",
      "bpm": 155,
      "scale": "C minor",
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
            1,
            0,
            0,
            1,
            1,
            0,
            0,
            1,
            1,
            0,
            0,
            1,
            1,
            0,
            0,
            1
          ],
          "velocity": [
            85,
            0,
            0,
            55,
            85,
            0,
            0,
            55,
            85,
            0,
            0,
            55,
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
          "instrument": "saw_lead",
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
  }
];
