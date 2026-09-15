import { Genre } from '../../types/genre';

export const TRAP_DRILL_GENRES: Genre[] = [
  {
    "id": "edm-trap",
    "name": "EDM Trap",
    "aliases": [
      "舞曲陷阱"
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
      "en": "Exploded onto the festival scene around 2012, blending Southern hip-hop 808 booms and rapid hi-hat rolls with big room Dutch house build-ups and brass leads.",
      "zh": "2012 年前后引爆大型音乐节，将美国南方嘻哈轰鸣 808 与极速三连音踩镲同欧洲高能铜管主音融合。"
    },
    "bpm_range": "140–150 BPM",
    "default_bpm": 145,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–VII",
      "i–iv–VII"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Synthesized Brass Horns",
      "Pitch-Bent 808 Sub Kicks",
      "Rave Lasers",
      "Vocal Chants"
    ],
    "sound_design": {
      "en": "Massive pitch-bent 808 sub kicks, synthesized brass horns, vocal chants, rave lasers.",
      "zh": "大范围音高滑音 808 超重底鼓、合成号角铜管刺音、人声口号喊麦与激光枪音效。"
    },
    "rhythm_features": {
      "en": "Half-time 145 BPM bounce with rolling 1/16 and 1/32 triplet hi-hats, hard claps on 3.",
      "zh": "145 BPM 半速弹跳律动，穿插密集飞驰的三连音踩镲滚奏，第 3 拍重击拍手。"
    },
    "drum_pattern": {
      "kick": {
        "en": "EDM Trap signature kick character.",
        "zh": "EDM Trap 风格代表性底鼓特征。"
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
      "en": "Long gliding 808 sub bass notes sliding across octaves beneath brass stabs.",
      "zh": "在铜管刺音下方跨八度自由大幅度滑音延音的 808 巨幅超低音。"
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
        "Tune your 808 sample to match the track key perfectly",
        "Use envelope pitch-glides (Portamento) on 808 notes for octave leaps",
        "Layer crisp claps with bright white-noise bursts"
      ],
      "zh": [
        "精准校准 808 采样调性与工程和声完全一致",
        "为 808 开启滑音（Portamento）实现顺滑八度飞掠",
        "将清脆拍手与明亮白噪声瞬态叠加"
      ]
    },
    "representative_tracks": [
      {
        "title": "EDM Trap Anthem",
        "artist": "RL Grime",
        "year": 2012,
        "link": "https://www.youtube.com/results?search_query=RL+Grime+EDM+Trap"
      },
      {
        "title": "Midnight in USA",
        "artist": "Baauer",
        "year": 2014,
        "link": "https://www.youtube.com/results?search_query=Baauer+EDM+Trap"
      },
      {
        "title": "Echoes of EDM Trap",
        "artist": "Flosstradamus",
        "year": 2016,
        "link": "https://www.youtube.com/results?search_query=Flosstradamus+EDM+Trap"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Yellow Claw",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=Yellow+Claw+EDM+Trap"
      },
      {
        "title": "Essential EDM Trap",
        "artist": "Boombox Cartel",
        "year": 2020,
        "link": "https://www.youtube.com/results?search_query=Boombox+Cartel+EDM+Trap"
      }
    ],
    "representative_artists": [
      "RL Grime",
      "Baauer",
      "Flosstradamus",
      "Yellow Claw",
      "Boombox Cartel"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 8,
      "brightness": 7,
      "harmonicComplexity": 2,
      "rhythmDensity": 5,
      "bassEnergy": 10,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "edm-trap",
      "bpm": 145,
      "scale": "C minor",
      "swing": 0,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "808_kick",
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
            1,
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
          "instrument": "808_snare",
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
            3,
            1,
            1,
            1,
            3,
            1,
            1,
            3,
            1,
            1,
            3,
            1,
            3,
            1
          ],
          "velocity": [
            90,
            50,
            80,
            50,
            90,
            50,
            80,
            50,
            90,
            80,
            70,
            50,
            80,
            50,
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
          "instrument": "808_bass",
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
            1,
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
            36,
            null,
            34,
            null,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "brass_synth",
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
          "instrument": "brass_synth",
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
            72,
            null,
            null,
            null,
            null,
            null,
            75,
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
    "id": "hard-trap",
    "name": "Hard Trap",
    "aliases": [
      "硬核陷阱"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2016",
    "origin_decade": 2010,
    "origin_place": {
      "en": "USA & Europe",
      "zh": "美国与欧洲"
    },
    "cultural_context": {
      "en": "Pioneered by SayMyName, fusing distorted hardstyle reverse kicks and harsh screeches with half-time trap rhythms.",
      "zh": "由 SayMyName 等人开创，将 Hardstyle 失真反转底鼓、狂暴尖叫与半速 Trap 律动融合。"
    },
    "bpm_range": "145–155 BPM",
    "default_bpm": 150,
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
      "Hardstyle Screech Synth",
      "Distorted 808 Bass",
      "Aggressive Sirens",
      "Warm Pad",
      "Compressed Vocal Screams"
    ],
    "sound_design": {
      "en": "Distorted 808s, hardstyle screeches, aggressive industrial sirens, compressed vocal screams.",
      "zh": "重度失真 808、Hardstyle 金属尖啸音、工业警报与极限压缩人声嘶吼。"
    },
    "rhythm_features": {
      "en": "Aggressive half-time bounce with crushing snares and rapid-fire metallic percussion.",
      "zh": "极具攻击性的半速弹跳，伴随具有粉碎感的军鼓与金属质感速射打击乐。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Hard Trap signature kick character.",
        "zh": "Hard Trap 风格代表性底鼓特征。"
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
      "tempo": "145–155 BPM"
    },
    "bass_pattern": {
      "en": "Hard-clipped, overdriven 808s with extreme harmonic saturation punching the master bus.",
      "zh": "硬剪切过载 808，带有极端高次谐波饱和，猛烈撞击母带总线。"
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
        "Drive 808s into hard clipping limiters for aggressive square-wave buzz",
        "Layer screech synths with comb filters",
        "Keep breakdown brief and high in tension"
      ],
      "zh": [
        "将 808 推入硬剪切限制器获得侵略性方波质感",
        "利用梳状滤波强化尖叫合成器的金属撕裂感",
        "转场保持紧凑高压，迅速汇聚能量"
      ]
    },
    "representative_tracks": [
      {
        "title": "Hard Trap Anthem",
        "artist": "SayMyName",
        "year": 2016,
        "link": "https://www.youtube.com/results?search_query=SayMyName+Hard+Trap"
      },
      {
        "title": "Midnight in USA & Europe",
        "artist": "Sikdope",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=Sikdope+Hard+Trap"
      },
      {
        "title": "Echoes of Hard Trap",
        "artist": "Carnage",
        "year": 2020,
        "link": "https://www.youtube.com/results?search_query=Carnage+Hard+Trap"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Junkie Kid",
        "year": 2022,
        "link": "https://www.youtube.com/results?search_query=Junkie+Kid+Hard+Trap"
      },
      {
        "title": "Essential Hard Trap",
        "artist": "Lit Lords",
        "year": 2024,
        "link": "https://www.youtube.com/results?search_query=Lit+Lords+Hard+Trap"
      }
    ],
    "representative_artists": [
      "SayMyName",
      "Sikdope",
      "Carnage",
      "Junkie Kid",
      "Lit Lords"
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
      "bassEnergy": 10,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "hard-trap",
      "bpm": 150,
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
            1,
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
          "instrument": "808_snare",
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
            3,
            1,
            1,
            1,
            3,
            1,
            1,
            3,
            3,
            1,
            1,
            1,
            3,
            3
          ],
          "velocity": [
            90,
            50,
            80,
            50,
            90,
            50,
            80,
            50,
            90,
            80,
            80,
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
          "instrument": "808_bass",
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
            1,
            0,
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
            null,
            null,
            null,
            null,
            null,
            41,
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
    "id": "hybrid-trap",
    "name": "Hybrid Trap",
    "aliases": [
      "混种陷阱"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2014",
    "origin_decade": 2010,
    "origin_place": {
      "en": "USA",
      "zh": "美国"
    },
    "cultural_context": {
      "en": "Combines the half-time bounce and sliding 808s of trap with modulated dubstep FM growls and sound design.",
      "zh": "将 Trap 的半速弹跳、滑音 808 与 Dubstep 复杂的 FM 调制嘶吼咆哮低音深度熔接。"
    },
    "bpm_range": "140–150 BPM",
    "default_bpm": 145,
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
      "Modulated FM Growls",
      "Metallic Tearout Screeches",
      "Brass Synth Horns",
      "Reese Bass",
      "Punchy Transient Kicks"
    ],
    "sound_design": {
      "en": "Modulated FM growls, metallic tearout screeches, brass synth horns, punchy transient kicks.",
      "zh": "受 LFO 调制的 FM 咆哮、金属撕裂尖叫、铜管合成器与超高瞬态底鼓。"
    },
    "rhythm_features": {
      "en": "Syncopated half-time bounce with intricate percussion fills and snare drops on beat 3.",
      "zh": "切分半速律动，搭配精巧绝伦的打击乐加花，第 3 拍落重击军鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Hybrid Trap signature kick character.",
        "zh": "Hybrid Trap 风格代表性底鼓特征。"
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
      "en": "Rapid-fire alternation between sliding 808 sub kicks and aggressive mid-growl bass fills.",
      "zh": "在滑音 808 超低频与狂暴中频咆哮音色之间进行高频次的无缝切替。"
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
        "Chop growl basses into 1/16 snippets and alternate between 4 different patches",
        "Use pitch bends on 808s at the end of bars for bouncy movement",
        "Saturate the mid-band of the bass to cut through mobile speakers"
      ],
      "zh": [
        "将咆哮贝斯切碎为十六分音符短片并在 4 种预设间交替",
        "在小节末尾为 808 加入上滑滑音制造回弹动力",
        "饱和增强贝斯中频以确保手机扬声器清晰听感"
      ]
    },
    "representative_tracks": [
      {
        "title": "Hybrid Trap Anthem",
        "artist": "NGHTMRE",
        "year": 2014,
        "link": "https://www.youtube.com/results?search_query=NGHTMRE+Hybrid+Trap"
      },
      {
        "title": "Midnight in USA",
        "artist": "Herobust",
        "year": 2016,
        "link": "https://www.youtube.com/results?search_query=Herobust+Hybrid+Trap"
      },
      {
        "title": "Echoes of Hybrid Trap",
        "artist": "Boombox Cartel",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=Boombox+Cartel+Hybrid+Trap"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Slander",
        "year": 2020,
        "link": "https://www.youtube.com/results?search_query=Slander+Hybrid+Trap"
      },
      {
        "title": "Essential Hybrid Trap",
        "artist": "Lookas",
        "year": 2022,
        "link": "https://www.youtube.com/results?search_query=Lookas+Hybrid+Trap"
      }
    ],
    "representative_artists": [
      "NGHTMRE",
      "Herobust",
      "Boombox Cartel",
      "Slander",
      "Lookas"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 9,
      "harmonicComplexity": 2,
      "rhythmDensity": 6,
      "bassEnergy": 10,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "hybrid-trap",
      "bpm": 145,
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
            1,
            1,
            1,
            1,
            1,
            3,
            1,
            1,
            1,
            1,
            1,
            1,
            3,
            3,
            1
          ],
          "velocity": [
            90,
            50,
            70,
            50,
            90,
            50,
            80,
            50,
            90,
            50,
            70,
            50,
            90,
            80,
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
            1,
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
            55,
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
            0
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
            46,
            40,
            null,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "brass_synth",
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
            76,
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
    "id": "wave",
    "name": "Wave",
    "aliases": [
      "浪潮音乐"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2015",
    "origin_decade": 2010,
    "origin_place": {
      "en": "London & Global",
      "zh": "伦敦与全球"
    },
    "cultural_context": {
      "en": "An emotional, atmospheric underground electronic genre blending cinematic trap beats, detuned Reese bass, and cyberpunk nostalgia.",
      "zh": "充满深沉情感与电影氛围的地下流派，融合电影质感 Trap 节拍、去谐 Reese 低音与赛博朋克怀旧美学。"
    },
    "bpm_range": "120–140 BPM",
    "default_bpm": 130,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–iv–i",
      "i–VII–VI"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Detuned Reese Bass",
      "Sidechained Supersaw Arpeggios",
      "Rain Ambiences",
      "Re-Pitched Vocal Chops",
      "Plucked Synth Chops",
      "Warm Pad"
    ],
    "sound_design": {
      "en": "Detuned Reese bass, lush sidechained supersaw arpeggios, rain ambiences, re-pitched vocal chops.",
      "zh": "去谐 Reese 贝斯、深度侧链的 Supersaw 琶音、淅沥雨声环境音与变调人声切片。"
    },
    "rhythm_features": {
      "en": "Slow, spacious trap half-time beats with rolling hi-hats and gentle rim clicks.",
      "zh": "开阔深邃的 Trap 半速节拍，伴随轻盈细腻的踩镲滚奏与温和边击。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Wave signature kick character.",
        "zh": "Wave 风格代表性底鼓特征。"
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
      "tempo": "120–140 BPM"
    },
    "bass_pattern": {
      "en": "Massive, warm Reese bass that slides smoothly across notes, creating an ocean of low end.",
      "zh": "庞大温暖的 Reese 贝斯线条，在不同音符间顺滑滑动，构筑低频汪洋。"
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
        "Use generous stereo detune on Reese bass while keeping frequencies below 100Hz in mono",
        "Drench supersaws in cavernous reverbs",
        "Incorporate cyberpunk neon soundscapes in the background"
      ],
      "zh": [
        "对 Reese 贝斯施加宽立体声去谐，同时严格保持 100Hz 以下单声道",
        "将 Supersaw 浸润在深邃如深空的辽阔混响中",
        "在背景层轻微混入赛博朋克霓虹雨夜环境纹理"
      ]
    },
    "representative_tracks": [
      {
        "title": "Wave Anthem",
        "artist": "Kareful",
        "year": 2015,
        "link": "https://www.youtube.com/results?search_query=Kareful+Wave"
      },
      {
        "title": "Midnight in London & Global",
        "artist": "Sorsari",
        "year": 2017,
        "link": "https://www.youtube.com/results?search_query=Sorsari+Wave"
      },
      {
        "title": "Echoes of Wave",
        "artist": "Skeler",
        "year": 2019,
        "link": "https://www.youtube.com/results?search_query=Skeler+Wave"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Barnacle Boi",
        "year": 2021,
        "link": "https://www.youtube.com/results?search_query=Barnacle+Boi+Wave"
      },
      {
        "title": "Essential Wave",
        "artist": "Deadcrow",
        "year": 2023,
        "link": "https://www.youtube.com/results?search_query=Deadcrow+Wave"
      }
    ],
    "representative_artists": [
      "Kareful",
      "Sorsari",
      "Skeler",
      "Barnacle Boi",
      "Deadcrow"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 5,
      "brightness": 7,
      "harmonicComplexity": 2,
      "rhythmDensity": 4,
      "bassEnergy": 9,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "wave",
      "bpm": 130,
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
            1,
            0
          ],
          "pitch": [
            null,
            null,
            72,
            null,
            null,
            75,
            null,
            null,
            null,
            null,
            77,
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
    "id": "chicago-drill",
    "name": "Chicago Drill",
    "aliases": [
      "芝加哥钻头"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2011",
    "origin_decade": 2010,
    "origin_place": {
      "en": "Chicago, Illinois, USA",
      "zh": "美国芝加哥"
    },
    "cultural_context": {
      "en": "Born on Chicago's South Side, reflecting grim street reality through dark trap beats, menacing minor bells, and thunderous 808 kicks.",
      "zh": "发端于芝加哥南区街头，以阴暗冷酷的小调钟琴琶音、肃杀氛围与轰鸣 808 底鼓折射残酷现实。"
    },
    "bpm_range": "130–145 BPM",
    "default_bpm": 138,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–iv–v",
      "i–♭VII–♭VI–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Dark Minor-Key Bells",
      "Menacing Brass Stabs",
      "TR-808 Sub Booms",
      "Clean Rim Snares",
      "Rhodes Chords"
    ],
    "sound_design": {
      "en": "Dark minor-key bells, menacing brass stabs, Roland TR-808 sub booms, clean rim snares.",
      "zh": "暗黑小调钟琴、肃杀铜管刺音、Roland TR-808 轰鸣与清脆边击军鼓。"
    },
    "rhythm_features": {
      "en": "Half-time trap groove with rapid hi-hat rolls and snare hitting firmly on beat 3.",
      "zh": "半速 Trap 律动，伴随极速十六分与三连音踩镲滚奏，军鼓重重落在第 3 拍。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Chicago Drill signature kick character.",
        "zh": "Chicago Drill 风格代表性底鼓特征。"
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
      "tempo": "130–145 BPM"
    },
    "bass_pattern": {
      "en": "Booming, punchy 808 sub kicks anchoring the downbeat with minimal melodic glides.",
      "zh": "质朴强悍的 808 超重底鼓锁定重拍，较少使用复杂的滑音，突出骨架力量。"
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
        "Write simple 2-bar repeating melodies using minor second intervals",
        "Keep the 808 kick punchy with clean sub fundamental around 45Hz",
        "Use acoustic clap layered with bright snare"
      ],
      "zh": [
        "使用小二度音程创作极度阴暗冰冷的 2 小节重复旋律",
        "保持 808 底鼓基频在 45Hz 附近坚如磐石",
        "将原声拍手与明亮军鼓紧密叠层增强打击感"
      ]
    },
    "representative_tracks": [
      {
        "title": "Chicago Drill Anthem",
        "artist": "Chief Keef",
        "year": 2011,
        "link": "https://www.youtube.com/results?search_query=Chief+Keef+Chicago+Drill"
      },
      {
        "title": "Midnight in Chicago",
        "artist": "King Von",
        "year": 2013,
        "link": "https://www.youtube.com/results?search_query=King+Von+Chicago+Drill"
      },
      {
        "title": "Echoes of Chicago Drill",
        "artist": "Lil Durk",
        "year": 2015,
        "link": "https://www.youtube.com/results?search_query=Lil+Durk+Chicago+Drill"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Young Chop",
        "year": 2017,
        "link": "https://www.youtube.com/results?search_query=Young+Chop+Chicago+Drill"
      },
      {
        "title": "Essential Chicago Drill",
        "artist": "G Herbo",
        "year": 2019,
        "link": "https://www.youtube.com/results?search_query=G+Herbo+Chicago+Drill"
      }
    ],
    "representative_artists": [
      "Chief Keef",
      "King Von",
      "Lil Durk",
      "Young Chop",
      "G Herbo"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 5,
      "harmonicComplexity": 1,
      "rhythmDensity": 5,
      "bassEnergy": 10,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "chicago-drill",
      "bpm": 138,
      "scale": "G minor",
      "swing": 0,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "808_kick",
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
          "instrument": "808_snare",
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
            3,
            1,
            1,
            1,
            3,
            1,
            1,
            1,
            3,
            1,
            1,
            3,
            3,
            1
          ],
          "velocity": [
            90,
            50,
            80,
            50,
            90,
            50,
            80,
            50,
            90,
            50,
            80,
            50,
            90,
            80,
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
          "instrument": "808_bass",
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
            43,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            46,
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
            67,
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
            84,
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
    "id": "uk-drill",
    "name": "UK Drill",
    "aliases": [
      "英国钻头"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2015",
    "origin_decade": 2010,
    "origin_place": {
      "en": "London, UK",
      "zh": "英国伦敦"
    },
    "cultural_context": {
      "en": "Evolved from Chicago drill in Brixton, London, revolutionizing modern rap with sliding 808 pitch glides and syncopated snare skips.",
      "zh": "由伦敦布里克斯顿青年将芝加哥钻头本土化，以标志性的长程 808 音高大幅度滑音与切分跳跃军鼓震撼全球。"
    },
    "bpm_range": "140–145 BPM",
    "default_bpm": 142,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–iv–v",
      "i–iv–VI–v"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Melancholic Minor Piano",
      "Extreme Gliding 808 Subs",
      "Warm Pad",
      "Reversing Hi-Hats",
      "Vocal Ad-Lib Cries"
    ],
    "sound_design": {
      "en": "Extreme gliding 808 subs, melancholic minor piano, reversing hi-hats, vocal ad-lib cries.",
      "zh": "大幅度滑音 808 超低音、忧郁小调真钢琴、反向抽吸踩镲与空灵人声呼喊。"
    },
    "rhythm_features": {
      "en": "The iconic drill skip: snare on beat 3 and beat 8 (syncopated offbeat skip) with triplet hats.",
      "zh": "标志性 Drill 切分律动：军鼓落在第 3 拍与第 8 拍（反拍切分跳跃），配合三连音踩镲。"
    },
    "drum_pattern": {
      "kick": {
        "en": "UK Drill signature kick character.",
        "zh": "UK Drill 风格代表性底鼓特征。"
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
      "en": "High-register 808 slides jumping up an octave or 7 semitones with rapid pitch envelopes.",
      "zh": "跨越八度或 7 个半音的高音区 808 剧烈滑音，带有极快的音高弯音包络。"
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
        "Program slide notes in your 808 piano roll with portamento time around 100ms",
        "Place the secondary snare hit on the 8th sixteenth-note of the bar",
        "Add pitch modulation and reverse automation to hi-hat loops"
      ],
      "zh": [
        "在 808 钢琴窗中写入跨八度滑音音符，滑音时间设在 100ms 左右",
        "将第二个军鼓拍点准确安放在小节的第 8 个十六分音符上",
        "在踩镲循环中加入音高颤音自动化与反向抽吸切片"
      ]
    },
    "representative_tracks": [
      {
        "title": "UK Drill Anthem",
        "artist": "Russ Millions",
        "year": 2015,
        "link": "https://www.youtube.com/results?search_query=Russ+Millions+UK+Drill"
      },
      {
        "title": "Midnight in London",
        "artist": "Headie One",
        "year": 2017,
        "link": "https://www.youtube.com/results?search_query=Headie+One+UK+Drill"
      },
      {
        "title": "Echoes of UK Drill",
        "artist": "Digga D",
        "year": 2019,
        "link": "https://www.youtube.com/results?search_query=Digga+D+UK+Drill"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Unknown T",
        "year": 2021,
        "link": "https://www.youtube.com/results?search_query=Unknown+T+UK+Drill"
      },
      {
        "title": "Essential UK Drill",
        "artist": "Loski",
        "year": 2023,
        "link": "https://www.youtube.com/results?search_query=Loski+UK+Drill"
      }
    ],
    "representative_artists": [
      "Russ Millions",
      "Headie One",
      "Digga D",
      "Unknown T",
      "Loski"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 8,
      "brightness": 7,
      "harmonicComplexity": 1,
      "rhythmDensity": 9,
      "bassEnergy": 10,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "uk-drill",
      "bpm": 141,
      "scale": "C minor",
      "swing": 0,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "808_kick",
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
            1,
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
            80,
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
          "instrument": "808_snare",
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
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            65,
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
            3,
            1,
            1,
            3,
            1,
            1,
            3,
            1,
            3,
            1,
            1,
            1,
            3,
            3
          ],
          "velocity": [
            90,
            50,
            80,
            50,
            90,
            80,
            70,
            50,
            80,
            50,
            80,
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
            1,
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
            55,
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
          "instrument": "808_bass",
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
            1,
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
            48,
            null,
            null,
            null,
            null,
            39,
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
          "instrument": "piano_lead",
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
            1,
            0,
            0
          ],
          "pitch": [
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
            74,
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
    "id": "brooklyn-drill",
    "name": "Brooklyn Drill",
    "aliases": [
      "布鲁克林钻头"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2018",
    "origin_decade": 2010,
    "origin_place": {
      "en": "Brooklyn, New York, USA",
      "zh": "美国纽约布鲁克林"
    },
    "cultural_context": {
      "en": "Brought UK drill production back to New York, popularized globally by Pop Smoke with baritone growls and high-energy Brooklyn swagger.",
      "zh": "将英国钻头制作带回纽约，由 Pop Smoke 等人推向世界顶峰，融合雄浑低沉的嗓音与布鲁克林自信嚣张的能量。"
    },
    "bpm_range": "140–145 BPM",
    "default_bpm": 142,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–iv–v",
      "i–♭VII–VI–iv"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Haunting Music Box Bells",
      "Aggressive Sliding 808s",
      "Heavy Sub Saturation",
      "Gunshot FX",
      "Rhodes Chords"
    ],
    "sound_design": {
      "en": "Aggressive sliding 808s, haunting music box bells, heavy sub saturation, gunshot FX.",
      "zh": "凶狠滑音 808、凄美八音盒钟琴、厚重超低频饱和与真实枪声拟音。"
    },
    "rhythm_features": {
      "en": "Bouncy 142 BPM syncopated UK drill skip paired with explosive 808 slides and sharp snares.",
      "zh": "充满弹跳感的 142 BPM 切分跳跃节奏，搭配爆炸般的 808 滑音与锋利军鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Brooklyn Drill signature kick character.",
        "zh": "Brooklyn Drill 风格代表性底鼓特征。"
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
      "en": "Aggressive, pitch-bent 808 lines weaving dynamically around the vocal delivery.",
      "zh": "极具侵略性的大范围音高滑音 808，与说唱人声交错呼应。"
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
        "Drive the 808 into soft saturation to give it mid-range presence for smartphones",
        "Use short, crisp acoustic snares layered with synthesized rims",
        "Keep bell melodies eerie and repetitive"
      ],
      "zh": [
        "对 808 施加温和饱和失真，确保在手机扬声器上清晰辨识",
        "选用短小干脆的原声军鼓与合成边击叠层",
        "保持小调钟琴旋律阴冷孤寂且不断循环"
      ]
    },
    "representative_tracks": [
      {
        "title": "Brooklyn Drill Anthem",
        "artist": "Pop Smoke",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=Pop+Smoke+Brooklyn+Drill"
      },
      {
        "title": "Midnight in Brooklyn",
        "artist": "Fivio Foreign",
        "year": 2020,
        "link": "https://www.youtube.com/results?search_query=Fivio+Foreign+Brooklyn+Drill"
      },
      {
        "title": "Echoes of Brooklyn Drill",
        "artist": "Sheff G",
        "year": 2022,
        "link": "https://www.youtube.com/results?search_query=Sheff+G+Brooklyn+Drill"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Sleepy Hallow",
        "year": 2024,
        "link": "https://www.youtube.com/results?search_query=Sleepy+Hallow+Brooklyn+Drill"
      },
      {
        "title": "Essential Brooklyn Drill",
        "artist": "22Gz",
        "year": 2026,
        "link": "https://www.youtube.com/results?search_query=22Gz+Brooklyn+Drill"
      }
    ],
    "representative_artists": [
      "Pop Smoke",
      "Fivio Foreign",
      "Sheff G",
      "Sleepy Hallow",
      "22Gz"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 7,
      "harmonicComplexity": 1,
      "rhythmDensity": 9,
      "bassEnergy": 10,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "brooklyn-drill",
      "bpm": 142,
      "scale": "F minor",
      "swing": 0,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "808_kick",
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
            1,
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
            80,
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
          "instrument": "808_snare",
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
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            65,
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
            3,
            1,
            1,
            3,
            1,
            1,
            1,
            3,
            1,
            3,
            1,
            1,
            3,
            3,
            1
          ],
          "velocity": [
            90,
            80,
            70,
            50,
            80,
            50,
            70,
            50,
            80,
            50,
            80,
            50,
            90,
            80,
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
          "instrument": "808_bass",
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
            1,
            0,
            0,
            0,
            0
          ],
          "pitch": [
            41,
            null,
            null,
            null,
            null,
            null,
            53,
            null,
            null,
            null,
            null,
            44,
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
            65,
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
    "id": "jersey-drill",
    "name": "Jersey Drill",
    "aliases": [
      "泽西钻头"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2022",
    "origin_decade": 2020,
    "origin_place": {
      "en": "New Jersey, USA",
      "zh": "美国新泽西"
    },
    "cultural_context": {
      "en": "A viral hybrid marrying Brooklyn drill's aggressive sliding 808s with the fast 5-beat bouncy kick pattern of Jersey Club.",
      "zh": "风靡互联网的跨界风格，将布鲁克林钻头的凶狠滑音 808 与新泽西俱乐部标志性的 5 拍弹跳底鼓浑然交融。"
    },
    "bpm_range": "135–142 BPM",
    "default_bpm": 140,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–iv–v",
      "i–iv–VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Sliding 808 Bass",
      "Chopped Sample Flips",
      "Bed Squeak Samples",
      "Water Drop Clicks",
      "Sawtooth Synth Lead",
      "Warm Pad"
    ],
    "sound_design": {
      "en": "Sliding 808s, bed squeak samples, water drop foley, chopped sample flips.",
      "zh": "滑音 808、标志性床簧吱呀声、水滴拟音与经典老歌变速切片。"
    },
    "rhythm_features": {
      "en": "The iconic 5-beat Jersey Club kick bounce: Boom... Boom... Boom-Boom-Boom, at 140 BPM.",
      "zh": "标志性 5 拍泽西弹跳底鼓律动：咚……咚……咚-咚-咚，时速 140 BPM。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Jersey Drill signature kick character.",
        "zh": "Jersey Drill 风格代表性底鼓特征。"
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
      "tempo": "135–142 BPM"
    },
    "bass_pattern": {
      "en": "Rapid 808 slides locking directly onto the 5-beat bouncy kick hits.",
      "zh": "极速滑音 808 牢牢咬合在 5 拍弹跳底鼓鼓点之上。"
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
        "Sequence the 5-beat kick pattern: beats 1, 2, and the 16th-notes of beats 3 and 4",
        "Sample popular pop/R&B acapellas, pitch up 3 semitones and speed up to 140 BPM",
        "Slide the 808 up on the rapid double-kicks"
      ],
      "zh": [
        "编写经典 5 拍底鼓：落在 1、2 拍及 3、4 拍的十六分音符跳跃点",
        "采样流行歌曲原声切片，升高 3 个半音并加速至 140 BPM",
        "在极速连击底鼓点上让 808 音高极速上滑"
      ]
    },
    "representative_tracks": [
      {
        "title": "Jersey Drill Anthem",
        "artist": "Bandmanrill",
        "year": 2022,
        "link": "https://www.youtube.com/results?search_query=Bandmanrill+Jersey+Drill"
      },
      {
        "title": "Midnight in New Jersey",
        "artist": "DJ Smallz 732",
        "year": 2024,
        "link": "https://www.youtube.com/results?search_query=DJ+Smallz+732+Jersey+Drill"
      },
      {
        "title": "Echoes of Jersey Drill",
        "artist": "MCVERTT",
        "year": 2026,
        "link": "https://www.youtube.com/results?search_query=MCVERTT+Jersey+Drill"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Sha EK",
        "year": 2023,
        "link": "https://www.youtube.com/results?search_query=Sha+EK+Jersey+Drill"
      },
      {
        "title": "Essential Jersey Drill",
        "artist": "DD Osama",
        "year": 2023,
        "link": "https://www.youtube.com/results?search_query=DD+Osama+Jersey+Drill"
      }
    ],
    "representative_artists": [
      "Bandmanrill",
      "DJ Smallz 732",
      "MCVERTT",
      "Sha EK",
      "DD Osama"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 5,
      "brightness": 8,
      "harmonicComplexity": 1,
      "rhythmDensity": 10,
      "bassEnergy": 10,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "jersey-drill",
      "bpm": 140,
      "scale": "D minor",
      "swing": 0,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "808_kick",
          "steps": [
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
            1,
            0,
            1,
            0,
            1,
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
            0,
            0,
            105,
            0,
            120,
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
          "instrument": "808_snare",
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
            0,
            0,
            0,
            115,
            0,
            0,
            0,
            0,
            65,
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
            3,
            1,
            1,
            1,
            3,
            1,
            1,
            3,
            3,
            1,
            1,
            3,
            3,
            1
          ],
          "velocity": [
            90,
            50,
            80,
            50,
            90,
            50,
            80,
            50,
            90,
            80,
            80,
            50,
            90,
            80,
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
            70,
            0,
            85,
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
          "instrument": "808_bass",
          "steps": [
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
            1,
            0,
            1,
            0,
            1,
            0
          ],
          "pitch": [
            38,
            null,
            null,
            null,
            38,
            null,
            null,
            null,
            null,
            null,
            41,
            null,
            38,
            null,
            43,
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
            74,
            null,
            null,
            null,
            77,
            null,
            null,
            null,
            74,
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
  }
];
