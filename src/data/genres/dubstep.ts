import { Genre } from '../../types/genre';

export const DUBSTEP_GENRES: Genre[] = [
  {
    "id": "dubstep",
    "name": "Dubstep",
    "aliases": [
      "回响贝斯",
      "深邃回响"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2002",
    "origin_decade": 2000,
    "origin_place": {
      "en": "South London, UK",
      "zh": "英国南伦敦"
    },
    "cultural_context": {
      "en": "Emerged from South London around 2002 out of 2-step garage and dub, defined by cavernous space, half-time 140 BPM riddims, and physical sub-bass weight.",
      "zh": "2002 年前后发源于英国南伦敦，脱胎于 2-Step 与牙买加 Dub，以深邃洞穴混响空间、140 BPM 半速律动与撼动身体的超低频著称。"
    },
    "bpm_range": "138–142 BPM",
    "default_bpm": 140,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–III–VII",
      "i–♭VII–♭VI–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Chest-Rattling Sub Bass",
      "Warm Pad",
      "Sawtooth Synth Lead",
      "Sparse Rim Clicks",
      "Cavernous Spring Reverb"
    ],
    "sound_design": {
      "en": "Chest-rattling sub-bass below 50Hz, cavernous spring reverbs, tape delays, sparse rim clicks.",
      "zh": "震撼胸腔的 50Hz 以下超低音、深邃弹簧混响、磁带延迟与稀疏边击。"
    },
    "rhythm_features": {
      "en": "Syncopated half-time beat with kick on beat 1 and heavy snare/clap on beat 3.",
      "zh": "切分的半速（Half-time）节拍，第 1 拍下底鼓，第 3 拍重击军鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Dubstep signature kick character.",
        "zh": "Dubstep 风格代表性底鼓特征。"
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
      "tempo": "138–142 BPM"
    },
    "bass_pattern": {
      "en": "Deep, undulating sine sub-bass and low-passed modulated Reese lines with physical chest pressure.",
      "zh": "深沉起伏的正弦波超低音与低通滤波 Reese 贝斯线条，带来极强的身体压迫感。"
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
        "Tune sub sine bass strictly between 40-55Hz",
        "Use long tape delays with feedback on snare rimshots",
        "Leave generous empty space between drum hits"
      ],
      "zh": [
        "超低正弦波严格对齐在 40-55Hz 之间",
        "在军鼓边击上使用高反馈长磁带延迟",
        "在鼓点之间保留大量令人窒息的呼吸空白"
      ]
    },
    "representative_tracks": [
      {
        "title": "Dubstep Anthem",
        "artist": "Skream",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=Skream+Dubstep"
      },
      {
        "title": "Midnight in South London",
        "artist": "Benga",
        "year": 2004,
        "link": "https://www.youtube.com/results?search_query=Benga+Dubstep"
      },
      {
        "title": "Echoes of Dubstep",
        "artist": "Digital Mystikz (Mala & Coki)",
        "year": 2006,
        "link": "https://www.youtube.com/results?search_query=Digital+Mystikz+(Mala+&+Coki)+Dubstep"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Loefah",
        "year": 2008,
        "link": "https://www.youtube.com/results?search_query=Loefah+Dubstep"
      },
      {
        "title": "Essential Dubstep",
        "artist": "Kode9",
        "year": 2010,
        "link": "https://www.youtube.com/results?search_query=Kode9+Dubstep"
      }
    ],
    "representative_artists": [
      "Skream",
      "Benga",
      "Digital Mystikz (Mala & Coki)",
      "Loefah",
      "Kode9"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 3,
      "harmonicComplexity": 5,
      "rhythmDensity": 1,
      "bassEnergy": 10,
      "melodicFocus": 4
    },
    "sequencer_pattern": {
      "genre_id": "dubstep",
      "bpm": 140,
      "scale": "F minor",
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
            120,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            105,
            0,
            0,
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
          "velocity": [
            0,
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
            0,
            0,
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
            0,
            0,
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
            0
          ],
          "pitch": [
            41,
            null,
            null,
            41,
            null,
            null,
            null,
            null,
            null,
            null,
            44,
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
            null,
            null,
            null,
            null,
            null,
            null,
            65,
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
          "instrument": "sub_drop",
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
    "id": "brostep",
    "name": "Brostep",
    "aliases": [
      "咆哮贝斯",
      "狂暴回响"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2009",
    "origin_decade": 2000,
    "origin_place": {
      "en": "USA & UK",
      "zh": "美国与英国"
    },
    "cultural_context": {
      "en": "Popularized by Skrillex in 2010, shifting focus from low-end sub bass to aggressive mid-range FM screech growls and robotic talk-box talkers.",
      "zh": "2010 年由 Skrillex 等人引爆全球，将视觉焦点从地底 Sub 转移至狂暴的中频 FM 嘶吼咆哮音色与机器人谈话盒滤波。"
    },
    "bpm_range": "140–150 BPM",
    "default_bpm": 140,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭VI–♭VII–i",
      "i–♭II–♭VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Wavetable Growl Lead",
      "Supersaw Chords",
      "Reese Bass",
      "Punchy Snares",
      "Vocal Formant Cuts"
    ],
    "sound_design": {
      "en": "Aggressive wavetable growls, vocal formants (Yoii/Auu), heavy OTT compression, and punchy snares.",
      "zh": "狂暴波表咆哮低音、人声元音共振峰（Yoii/Auu）、多重 OTT 压缩与厚重军鼓。"
    },
    "rhythm_features": {
      "en": "Half-time 140 BPM with thunderous snare on beat 3 and machine-gun syncopated growl fills.",
      "zh": "140 BPM 半速节拍，第 3 拍雷霆军鼓，伴随机关枪般切分的凶狠咆哮加花。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Brostep signature kick character.",
        "zh": "Brostep 风格代表性底鼓特征。"
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
      "tempo": "140–150 BPM"
    },
    "bass_pattern": {
      "en": "Interlocking puzzle of 5-8 different screech and growl basses exchanging every beat.",
      "zh": "由 5 至 8 种不同质感的尖叫与嘶吼贝斯切片拼图般严丝合缝交替拼装。"
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
        "Bounce audio clips and chop tiny 1/16 growl snippets",
        "Apply OTT compression at 50-80% depth on bass bus",
        "Layer acoustic snare with synthesized white noise burst"
      ],
      "zh": [
        "导出音频块并切碎为十六分音符短切片重新拼接",
        "在贝斯总线上挂载深度 50-80% 的 OTT 压缩",
        "将真军鼓敲击与合成白噪声爆炸紧密叠层"
      ]
    },
    "representative_tracks": [
      {
        "title": "Brostep Anthem",
        "artist": "Skrillex",
        "year": 2009,
        "link": "https://www.youtube.com/results?search_query=Skrillex+Brostep"
      },
      {
        "title": "Midnight in USA & UK",
        "artist": "Excision",
        "year": 2011,
        "link": "https://www.youtube.com/results?search_query=Excision+Brostep"
      },
      {
        "title": "Echoes of Brostep",
        "artist": "Datsik",
        "year": 2013,
        "link": "https://www.youtube.com/results?search_query=Datsik+Brostep"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Zomboy",
        "year": 2015,
        "link": "https://www.youtube.com/results?search_query=Zomboy+Brostep"
      },
      {
        "title": "Essential Brostep",
        "artist": "Knife Party",
        "year": 2017,
        "link": "https://www.youtube.com/results?search_query=Knife+Party+Brostep"
      }
    ],
    "representative_artists": [
      "Skrillex",
      "Excision",
      "Datsik",
      "Zomboy",
      "Knife Party"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 7,
      "harmonicComplexity": 2,
      "rhythmDensity": 4,
      "bassEnergy": 6,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "brostep",
      "bpm": 140,
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
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            0,
            0,
            105,
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
          "velocity": [
            0,
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
            0,
            0,
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
            3,
            1
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
            80,
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
            0,
            1,
            0,
            0,
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
            70,
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
          "instrument": "growl_lead",
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
    "id": "riddim",
    "name": "Riddim",
    "aliases": [
      "锐汀贝斯",
      "极简回响"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2012",
    "origin_decade": 2010,
    "origin_place": {
      "en": "UK & USA",
      "zh": "英国与美国"
    },
    "cultural_context": {
      "en": "A minimalist, repetitious strain of dubstep focused on syncopated square-wave and FM laser stabs over a relentless triplet swing bounce.",
      "zh": "Dubstep 的极简高度重复分支，专注于切分方波与 FM 激光短刺音，并在三连音弹跳律动中循环往复。"
    },
    "bpm_range": "140–145 BPM",
    "default_bpm": 140,
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
      "Resonant Square Plucks",
      "Laser Pitch-Down Zaps",
      "Reese Sub Bass",
      "Warm Pad",
      "Short Wooden Snares"
    ],
    "sound_design": {
      "en": "Resonant square wave plucks, laser pitch-down zaps, short wooden snares, and flanged sub.",
      "zh": "高谐振方波拨弦、激光下扫音、短促木质军鼓与微带凸缘的超低音。"
    },
    "rhythm_features": {
      "en": "Hypnotic 5-beat syncopation and triplet feel with snare consistently on beat 3.",
      "zh": "极富催眠感的切分三连音摇摆弹性，军鼓坚定地落在第 3 拍。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Riddim signature kick character.",
        "zh": "Riddim 风格代表性底鼓特征。"
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
      "tempo": "140–145 BPM"
    },
    "bass_pattern": {
      "en": "Sparse, repeating single-bar laser synth stab riff playing with micro-timing variations.",
      "zh": "极简重复的单小节激光合成贝斯短 Riff，伴随微小时值迟滞变化。"
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
        "Use flanger on square bass with high feedback and short delay time",
        "Keep the main bass motif repeating for at least 16 bars with subtle fills",
        "Make your snare very short and punchy around 200Hz"
      ],
      "zh": [
        "在方波贝斯上挂载高反馈短延迟的凸缘效果器",
        "让核心贝斯乐句重复至少 16 小节仅做微量加花",
        "将第 3 拍军鼓做得短促干练，基频锁定 200Hz"
      ]
    },
    "representative_tracks": [
      {
        "title": "Riddim Anthem",
        "artist": "Subtronics",
        "year": 2012,
        "link": "https://www.youtube.com/results?search_query=Subtronics+Riddim"
      },
      {
        "title": "Midnight in UK & USA",
        "artist": "Virtual Riot",
        "year": 2014,
        "link": "https://www.youtube.com/results?search_query=Virtual+Riot+Riddim"
      },
      {
        "title": "Echoes of Riddim",
        "artist": "Infekt",
        "year": 2016,
        "link": "https://www.youtube.com/results?search_query=Infekt+Riddim"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Aweminus",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=Aweminus+Riddim"
      },
      {
        "title": "Essential Riddim",
        "artist": "Boogie T",
        "year": 2020,
        "link": "https://www.youtube.com/results?search_query=Boogie+T+Riddim"
      }
    ],
    "representative_artists": [
      "Subtronics",
      "Virtual Riot",
      "Infekt",
      "Aweminus",
      "Boogie T"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 7,
      "harmonicComplexity": 2,
      "rhythmDensity": 6,
      "bassEnergy": 6,
      "melodicFocus": 3
    },
    "sequencer_pattern": {
      "genre_id": "riddim",
      "bpm": 140,
      "scale": "E minor",
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
          "velocity": [
            120,
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
          "velocity": [
            0,
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
            0,
            0,
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
            0
          ],
          "velocity": [
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
            55,
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
            40,
            null,
            null,
            null,
            40,
            null,
            null,
            null,
            40,
            null,
            null,
            null,
            40,
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
          "instrument": "laser_zap",
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
    "id": "melodic-dubstep",
    "name": "Melodic Dubstep",
    "aliases": [
      "旋律回响贝斯"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2012",
    "origin_decade": 2010,
    "origin_place": {
      "en": "USA",
      "zh": "美国"
    },
    "cultural_context": {
      "en": "Pioneered by Seven Lions, combining aggressive dubstep drums with lush, emotive progressive trance supersaws and epic vocal anthems.",
      "zh": "由 Seven Lions 等人奠定，将狂野的 Dubstep 半速鼓组与辽阔凄美的情感 Trance Supersaw 音墙及宏大史诗歌词结合。"
    },
    "bpm_range": "140–150 BPM",
    "default_bpm": 140,
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
      "Massive Layered Supersaws",
      "Acoustic Piano",
      "Deep Mono Sub Bass",
      "Sweeping Vocal Chops"
    ],
    "sound_design": {
      "en": "Massive layered supersaws, sweeping vocal chops, acoustic piano, and deep mono sub-bass.",
      "zh": "宏大多层 Supersaw 音墙、滑音人声切片、清澈原声钢琴与纯净单声道超低音。"
    },
    "rhythm_features": {
      "en": "Huge halftime punch with reverb-soaked snare on beat 3 and rapid hi-hat rolls.",
      "zh": "震撼半速重击，第 3 拍是饱满浸润在混响中的大军鼓，配合细密踩镲滚奏。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Melodic Dubstep signature kick character.",
        "zh": "Melodic Dubstep 风格代表性底鼓特征。"
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
      "tempo": "140–150 BPM"
    },
    "bass_pattern": {
      "en": "Heavily sidechained sub bass following chord progression root notes under lush supersaws.",
      "zh": "在宏大和弦下方紧随根音进行的深度侧链 Sub 贝斯。"
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
        "Stack 8+ supersaw layers detuned and panned wide across stereo",
        "Automate pitch-bend on chord drops for emotional slides",
        "Sidechain the entire drop synth bus violently to the kick and snare"
      ],
      "zh": [
        "堆叠 8 层以上去谐立体声 Supersaw 并大幅度声像展宽",
        "在副歌和弦释放瞬间加入音高滑音营造揪心下潜",
        "将整个释放段落的合成器总线极度凶猛地侧链给底鼓与军鼓"
      ]
    },
    "representative_tracks": [
      {
        "title": "Melodic Dubstep Anthem",
        "artist": "Seven Lions",
        "year": 2012,
        "link": "https://www.youtube.com/results?search_query=Seven+Lions+Melodic+Dubstep"
      },
      {
        "title": "Midnight in USA",
        "artist": "Illenium",
        "year": 2014,
        "link": "https://www.youtube.com/results?search_query=Illenium+Melodic+Dubstep"
      },
      {
        "title": "Echoes of Melodic Dubstep",
        "artist": "Said The Sky",
        "year": 2016,
        "link": "https://www.youtube.com/results?search_query=Said+The+Sky+Melodic+Dubstep"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Adventure Club",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=Adventure+Club+Melodic+Dubstep"
      },
      {
        "title": "Essential Melodic Dubstep",
        "artist": "Au5",
        "year": 2020,
        "link": "https://www.youtube.com/results?search_query=Au5+Melodic+Dubstep"
      }
    ],
    "representative_artists": [
      "Seven Lions",
      "Illenium",
      "Said The Sky",
      "Adventure Club",
      "Au5"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 5,
      "brightness": 6,
      "harmonicComplexity": 2,
      "rhythmDensity": 1,
      "bassEnergy": 10,
      "melodicFocus": 9
    },
    "sequencer_pattern": {
      "genre_id": "melodic-dubstep",
      "bpm": 140,
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
            120,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            105,
            0,
            0,
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
          "velocity": [
            0,
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
            0,
            0,
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
            0,
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
          "velocity": [
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
            45,
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
            1,
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
            69,
            null,
            null,
            69,
            null,
            null,
            72,
            null,
            null,
            null,
            69,
            null,
            null,
            72,
            null,
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "supersaw",
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
            84,
            null,
            83,
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
    "id": "future-garage",
    "name": "Future Garage",
    "aliases": [
      "未来车库"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2008",
    "origin_decade": 2000,
    "origin_place": {
      "en": "London, UK",
      "zh": "英国伦敦"
    },
    "cultural_context": {
      "en": "Pioneered by Burial, defined by syncopated 2-step swing, melancholic pitched-down vocal chops, vinyl crackle, and rainy night nostalgia.",
      "zh": "由 Burial 等人开创，以切分 2-Step 摇摆律动、凄美哀伤的降调人声切片、黑胶爆豆底噪与雨夜怀旧情绪著称。"
    },
    "bpm_range": "130–136 BPM",
    "default_bpm": 134,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–iv–VII",
      "i–VII–VI–VII"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Pitched Vocal Fragments",
      "Plucked Synth Chops",
      "Warm Reese Bass",
      "Rhodes Chords",
      "Vinyl Crackle",
      "Rain Soundscapes"
    ],
    "sound_design": {
      "en": "Vinyl crackle, rain soundscapes, pitched and time-stretched vocal fragments, warm Reese bass.",
      "zh": "黑胶唱片刮擦爆豆声、雨声自然采样、变速变调的人声碎片与温润 Reese 贝斯。"
    },
    "rhythm_features": {
      "en": "Irregular syncopated 2-step skips, ghost rim clicks, off-grid wooden percussion.",
      "zh": "不规则切分的 2-Step 跳跃节奏、幽灵边击与脱离量化网格的天然木质打击乐。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Future Garage signature kick character.",
        "zh": "Future Garage 风格代表性底鼓特征。"
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
      "en": "Warm, detuned low-pass filtered Reese bass humming smoothly beneath the percussion.",
      "zh": "温暖、去谐并经过深低通滤波的 Reese 低音，在打击乐下方如海潮般低鸣。"
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
        "Nudge hi-hats and snares manually off the grid for human swing",
        "Pitch vocal phrases down 5-7 semitones with formant preservation",
        "Drench foley clicks in medium dark plate reverbs"
      ],
      "zh": [
        "手动将踩镲和军鼓移出量化节拍线营造真实人手摇摆",
        "将人声旋律向下移调 5-7 个半音并保留共振峰",
        "将拟音打击乐浸润在中等暗色的板式混响中"
      ]
    },
    "representative_tracks": [
      {
        "title": "Future Garage Anthem",
        "artist": "Burial",
        "year": 2008,
        "link": "https://www.youtube.com/results?search_query=Burial+Future+Garage"
      },
      {
        "title": "Midnight in London",
        "artist": "Synkro",
        "year": 2010,
        "link": "https://www.youtube.com/results?search_query=Synkro+Future+Garage"
      },
      {
        "title": "Echoes of Future Garage",
        "artist": "Sorrow",
        "year": 2012,
        "link": "https://www.youtube.com/results?search_query=Sorrow+Future+Garage"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Volor Flex",
        "year": 2014,
        "link": "https://www.youtube.com/results?search_query=Volor+Flex+Future+Garage"
      },
      {
        "title": "Essential Future Garage",
        "artist": "Phaeleh",
        "year": 2016,
        "link": "https://www.youtube.com/results?search_query=Phaeleh+Future+Garage"
      }
    ],
    "representative_artists": [
      "Burial",
      "Synkro",
      "Sorrow",
      "Volor Flex",
      "Phaeleh"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 10,
      "brightness": 5,
      "harmonicComplexity": 4,
      "rhythmDensity": 7,
      "bassEnergy": 9,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "future-garage",
      "bpm": 134,
      "scale": "B minor",
      "swing": 35,
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
            0,
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
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            0,
            0,
            0,
            80,
            0,
            0,
            105,
            0,
            0,
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
            0,
            1
          ],
          "velocity": [
            90,
            0,
            70,
            50,
            0,
            50,
            0,
            50,
            90,
            0,
            70,
            0,
            0,
            50,
            0,
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
            1,
            0,
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
            85,
            0,
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
          "instrument": "reese_bass",
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
            47,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            45,
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
          "instrument": "rhodes_ep",
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
            1,
            0,
            0,
            0
          ],
          "pitch": [
            71,
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
            69,
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
            null,
            null,
            null,
            null,
            null,
            83,
            null,
            null,
            null,
            null,
            86,
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
    "id": "post-dubstep",
    "name": "Post-Dubstep",
    "aliases": [
      "后回响贝斯"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2009",
    "origin_decade": 2000,
    "origin_place": {
      "en": "London, UK",
      "zh": "英国伦敦"
    },
    "cultural_context": {
      "en": "A deconstruction of bass music blending minimalist soul, indie songwriting, warm analog synths, and spacious club rhythms.",
      "zh": "低音音乐的解构主义流派，融合极简灵魂乐、独立创作精神、温暖模拟合成器与留白深沉的俱乐部节奏。"
    },
    "bpm_range": "120–138 BPM",
    "default_bpm": 130,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–iv–i",
      "i–v–VI–iv"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Intimate Vocal Samples",
      "Plucked Synth Chops",
      "Warm Moog Analog Bass",
      "Rhodes Chords",
      "Gated Reverb Hits"
    ],
    "sound_design": {
      "en": "Intimate vocal recordings, warm Moog bass, organic acoustic samples, short gated reverbs.",
      "zh": "极近距离的亲密人声录音、温暖 Moog 贝斯、有机原声采样与短促门限混响。"
    },
    "rhythm_features": {
      "en": "Deconstructed half-time or syncopated 4/4 beats with unexpected pauses and negative space.",
      "zh": "解构的半速或切分四踩四节拍，充满意想不到的停顿与充满张力的留白。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Post-Dubstep signature kick character.",
        "zh": "Post-Dubstep 风格代表性底鼓特征。"
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
      "tempo": "120–138 BPM"
    },
    "bass_pattern": {
      "en": "Heavy physical sub-bass notes held long beneath delicate fragile vocal phrases.",
      "zh": "在脆弱纤细的人声下方长久支撑的极具物理压迫感的超低音音符。"
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
        "Use extreme dynamic contrast between silent drops and roaring sub hits",
        "Layer pitched vocal harmonies with analog chorus pedals",
        "Keep drum sounds completely dry without reverbs"
      ],
      "zh": [
        "在寂静停顿与轰鸣超低频之间拉开极端的动态对比",
        "用模拟合唱单块让人声音轨层叠产生复古和声",
        "保持鼓组完全干燥不加过量混响以突出近场质感"
      ]
    },
    "representative_tracks": [
      {
        "title": "Post-Dubstep Anthem",
        "artist": "James Blake",
        "year": 2009,
        "link": "https://www.youtube.com/results?search_query=James+Blake+Post-Dubstep"
      },
      {
        "title": "Midnight in London",
        "artist": "Mount Kimbie",
        "year": 2011,
        "link": "https://www.youtube.com/results?search_query=Mount+Kimbie+Post-Dubstep"
      },
      {
        "title": "Echoes of Post-Dubstep",
        "artist": "SBTRKT",
        "year": 2013,
        "link": "https://www.youtube.com/results?search_query=SBTRKT+Post-Dubstep"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Jamie xx",
        "year": 2015,
        "link": "https://www.youtube.com/results?search_query=Jamie+xx+Post-Dubstep"
      },
      {
        "title": "Essential Post-Dubstep",
        "artist": "Joy Orbison",
        "year": 2017,
        "link": "https://www.youtube.com/results?search_query=Joy+Orbison+Post-Dubstep"
      }
    ],
    "representative_artists": [
      "James Blake",
      "Mount Kimbie",
      "SBTRKT",
      "Jamie xx",
      "Joy Orbison"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 8,
      "brightness": 2,
      "harmonicComplexity": 1,
      "rhythmDensity": 1,
      "bassEnergy": 10,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "post-dubstep",
      "bpm": 132,
      "scale": "C minor",
      "swing": 20,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "acoustic_kick",
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
            1,
            0,
            0,
            0,
            0,
            0
          ],
          "velocity": [
            120,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            105,
            0,
            0,
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
          "velocity": [
            0,
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
            0,
            0,
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
          "instrument": "analog_bass",
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
            1,
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
            null,
            null,
            39,
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
            72,
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
  },
  {
    "id": "tearout-dubstep",
    "name": "Tearout Dubstep",
    "aliases": [
      "撕裂回响贝斯"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2018",
    "origin_decade": 2010,
    "origin_place": {
      "en": "USA",
      "zh": "美国"
    },
    "cultural_context": {
      "en": "An ultra-aggressive modern evolution of dubstep featuring machine-gun metallic stabs, brutal distortion, and continuous high-intensity walls of sound.",
      "zh": "Dubstep 现代极限狂暴演进，以机关枪般金属撕裂刺音、残暴过载与持续高能的金属音墙轰炸著称。"
    },
    "bpm_range": "140–150 BPM",
    "default_bpm": 145,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭II–♭VII–i",
      "i–♭VI–♭VII"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Machine-Gun Metallic Growl",
      "Warm Pad",
      "Extreme Clipping Distortion",
      "Aggressive Gun Cock FX"
    ],
    "sound_design": {
      "en": "Machine-gun comb-filtered metallic basses, extreme clipping distortion, aggressive gun cock FX.",
      "zh": "机关枪般的梳状滤波金属贝斯、极端削波失真与凶狠枪械上膛音效。"
    },
    "rhythm_features": {
      "en": "Relentless 1/8 and 1/16 rapid-fire syncopated machine-gun snare attacks at 145 BPM.",
      "zh": "在 145 BPM 下进行不休止的八分与十六分音符速射切分军鼓攻击。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Tearout Dubstep signature kick character.",
        "zh": "Tearout Dubstep 风格代表性底鼓特征。"
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
      "tempo": "140–150 BPM"
    },
    "bass_pattern": {
      "en": "Continuous tearing metallic screech basses with minimal silence between rhythmic bars.",
      "zh": "连绵不断撕裂耳膜的金属尖叫贝斯，各小节之间几乎不留任何喘息余地。"
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
        "Use comb filters modulated by ultra-fast LFOs on wavetable synths",
        "Drive bass bus into hard clip limiters for maximum perceived loudness",
        "Layer gunshots on top of snare transients"
      ],
      "zh": [
        "在波表合成器上用极速 LFO 调制梳状滤波器产生金属撕裂感",
        "将贝斯总线推入硬剪切限制器榨取极致响度",
        "在军鼓瞬态上方叠加真实枪栓与射击采样"
      ]
    },
    "representative_tracks": [
      {
        "title": "Tearout Dubstep Anthem",
        "artist": "Marauda",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=Marauda+Tearout+Dubstep"
      },
      {
        "title": "Midnight in USA",
        "artist": "SVDDEN DEATH",
        "year": 2020,
        "link": "https://www.youtube.com/results?search_query=SVDDEN+DEATH+Tearout+Dubstep"
      },
      {
        "title": "Echoes of Tearout Dubstep",
        "artist": "Trampa",
        "year": 2022,
        "link": "https://www.youtube.com/results?search_query=Trampa+Tearout+Dubstep"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Nimda",
        "year": 2024,
        "link": "https://www.youtube.com/results?search_query=Nimda+Tearout+Dubstep"
      },
      {
        "title": "Essential Tearout Dubstep",
        "artist": "PhaseOne",
        "year": 2026,
        "link": "https://www.youtube.com/results?search_query=PhaseOne+Tearout+Dubstep"
      }
    ],
    "representative_artists": [
      "Marauda",
      "SVDDEN DEATH",
      "Trampa",
      "Nimda",
      "PhaseOne"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 6,
      "brightness": 6,
      "harmonicComplexity": 1,
      "rhythmDensity": 6,
      "bassEnergy": 7,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "tearout-dubstep",
      "bpm": 145,
      "scale": "F minor",
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
          "velocity": [
            120,
            0,
            0,
            0,
            0,
            0,
            105,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            105,
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
          "velocity": [
            0,
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
            0,
            0,
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
            3,
            1
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
            80,
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
          "instrument": "growl_lead",
          "steps": [
            1,
            0,
            1,
            0,
            1,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            1,
            0,
            1,
            0
          ],
          "pitch": [
            41,
            null,
            41,
            null,
            41,
            null,
            41,
            null,
            null,
            null,
            41,
            null,
            44,
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
          "instrument": "growl_lead",
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
            77,
            null,
            null,
            null,
            80,
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
          "instrument": "laser_zap",
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
    "id": "chillstep",
    "name": "Chillstep",
    "aliases": [
      "舒缓回响贝斯"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2010",
    "origin_decade": 2010,
    "origin_place": {
      "en": "Global & UK",
      "zh": "全球与英国"
    },
    "cultural_context": {
      "en": "Slow, relaxed 140 BPM half-time beats layered with serene ambient pads, acoustic melodies, and soothing sub bass.",
      "zh": "从容舒缓的 140 BPM 半速节拍，交织着宁静空灵的铺底、原声乐器旋律与温润抚慰人心的超低频。"
    },
    "bpm_range": "135–140 BPM",
    "default_bpm": 140,
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
      "Soft Rhodes",
      "Acoustic Guitar Strums",
      "Plucked Synth",
      "Lush Ambient Reverb Washes",
      "Smooth Sub Bass"
    ],
    "sound_design": {
      "en": "Soft Rhodes electric piano, acoustic guitar strums, lush ambient reverb washes, smooth sub sine.",
      "zh": "柔和 Rhodes 电钢琴、木吉他扫弦、如梦似幻的开阔混响与平滑纯正弦低音。"
    },
    "rhythm_features": {
      "en": "Gentle, non-aggressive half-time drums with soft claps and whispered hi-hats.",
      "zh": "温和舒缓的半速鼓组，搭配轻柔拍手与微风细雨般的踩镲。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Chillstep signature kick character.",
        "zh": "Chillstep 风格代表性底鼓特征。"
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
      "tempo": "135–140 BPM"
    },
    "bass_pattern": {
      "en": "Soothing, warm sine sub-bass flowing harmonically with chord progressions.",
      "zh": "温暖治愈的正弦超低频线条，随和声和弦水乳交融般缓缓流动。"
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
        "Keep drum transients soft and rounded with gentle low-pass filtering",
        "Apply large hall reverbs with 6+ seconds decay to vocal samples",
        "Use minor pentatonic guitar plucks for peaceful hooks"
      ],
      "zh": [
        "对鼓组瞬态做温和低通滤波保持圆润不刺耳",
        "为人声采样挂载混响时间超过 6 秒的大厅混响",
        "使用小调五声原声吉他弹拨创作宁静悠远的旋律"
      ]
    },
    "representative_tracks": [
      {
        "title": "Chillstep Anthem",
        "artist": "Blackmill",
        "year": 2010,
        "link": "https://www.youtube.com/results?search_query=Blackmill+Chillstep"
      },
      {
        "title": "Midnight in Global & UK",
        "artist": "Seven Lions",
        "year": 2012,
        "link": "https://www.youtube.com/results?search_query=Seven+Lions+Chillstep"
      },
      {
        "title": "Echoes of Chillstep",
        "artist": "CMA",
        "year": 2014,
        "link": "https://www.youtube.com/results?search_query=CMA+Chillstep"
      },
      {
        "title": "Pulse & Groove",
        "artist": "MitiS",
        "year": 2016,
        "link": "https://www.youtube.com/results?search_query=MitiS+Chillstep"
      },
      {
        "title": "Essential Chillstep",
        "artist": "Jacoo",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=Jacoo+Chillstep"
      }
    ],
    "representative_artists": [
      "Blackmill",
      "Seven Lions",
      "CMA",
      "MitiS",
      "Jacoo"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 5,
      "brightness": 5,
      "harmonicComplexity": 2,
      "rhythmDensity": 4,
      "bassEnergy": 9,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "chillstep",
      "bpm": 138,
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
            120,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            105,
            0,
            0,
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
          "velocity": [
            0,
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
            0,
            0,
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
          "instrument": "rhodes_ep",
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
            77,
            null,
            null,
            null,
            null,
            79,
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
    "id": "deathstep",
    "name": "Deathstep",
    "aliases": [
      "死亡回响贝斯"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2011",
    "origin_decade": 2010,
    "origin_place": {
      "en": "Global",
      "zh": "全球"
    },
    "cultural_context": {
      "en": "Blends extreme death metal aesthetics, horror movie voice samples, and blast-beat-like intensity with brutal dubstep growls.",
      "zh": "将极端死亡金属的美学意象、恐怖电影对白采样与残暴 Dubstep 咆哮低音融为一体。"
    },
    "bpm_range": "140–150 BPM",
    "default_bpm": 140,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭II–i–♭VII",
      "i–♭VI–♭VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Down-Tuned Distorted Guitar",
      "Picked Distorted Bass Guitar",
      "Industrial Slams",
      "Sub Explosions",
      "Warm Pad"
    ],
    "sound_design": {
      "en": "Down-tuned distorted electric guitars, guttural demon growls, industrial slams, and sub explosions.",
      "zh": "降调重度失真电吉他、低沉恶魔嘶吼采样、工业重击与超低频爆炸。"
    },
    "rhythm_features": {
      "en": "Pounding half-time drum beat combined with double-bass pedal drum rolls and thrashing snares.",
      "zh": "重击半速鼓点，融合双踩双底鼓滚奏与碾压式军鼓击打。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Deathstep signature kick character.",
        "zh": "Deathstep 风格代表性底鼓特征。"
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
      "tempo": "140–150 BPM"
    },
    "bass_pattern": {
      "en": "Violently modulated wavetable guttural basses matching distorted metal power chords.",
      "zh": "剧烈调制的波表喉音嘶吼贝斯，与失真金属强力和弦完全同步轰击。"
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
        "Sample real death metal guitar chugs and layer with FM synthesized growls",
        "Process vocal growls with ring modulators for monstrous alien textures",
        "Keep sub below 80Hz in mono and slam through wave-shapers"
      ],
      "zh": [
        "采样真实金属闷音吉他并与 FM 合成嘶吼低音紧密叠层",
        "对人声嘶吼使用环形调制器（Ring Mod）制造异形怪物质感",
        "严格将 80Hz 以下 Sub 保持单声道并经波形塑形器推向极限"
      ]
    },
    "representative_tracks": [
      {
        "title": "Deathstep Anthem",
        "artist": "Code: Pandorum",
        "year": 2011,
        "link": "https://www.youtube.com/results?search_query=Code:+Pandorum+Deathstep"
      },
      {
        "title": "Midnight in Global",
        "artist": "Captain Panic!",
        "year": 2013,
        "link": "https://www.youtube.com/results?search_query=Captain+Panic!+Deathstep"
      },
      {
        "title": "Echoes of Deathstep",
        "artist": "Mantis",
        "year": 2015,
        "link": "https://www.youtube.com/results?search_query=Mantis+Deathstep"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Sadhu",
        "year": 2017,
        "link": "https://www.youtube.com/results?search_query=Sadhu+Deathstep"
      },
      {
        "title": "Essential Deathstep",
        "artist": "D-Jahsta",
        "year": 2019,
        "link": "https://www.youtube.com/results?search_query=D-Jahsta+Deathstep"
      }
    ],
    "representative_artists": [
      "Code: Pandorum",
      "Captain Panic!",
      "Mantis",
      "Sadhu",
      "D-Jahsta"
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
      "rhythmDensity": 6,
      "bassEnergy": 6,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "deathstep",
      "bpm": 145,
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
            1,
            0,
            0
          ],
          "velocity": [
            120,
            0,
            105,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            105,
            0,
            0,
            80,
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
          "velocity": [
            0,
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
            0,
            0,
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
            3,
            3
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
            80,
            80
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
            0
          ],
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "pick_bass",
          "steps": [
            1,
            1,
            0,
            1,
            0,
            0,
            1,
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
            40,
            40,
            null,
            40,
            null,
            null,
            43,
            null,
            null,
            null,
            40,
            null,
            46,
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
          "instrument": "guitar_lead",
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
          "instrument": "sub_drop",
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
