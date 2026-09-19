import { Genre } from '../../types/genre';

export const TRANCE_GENRES: Genre[] = [
  {
    "id": "uplifting-trance",
    "name": "Uplifting Trance",
    "aliases": [
      "升华出神"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1997",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Germany & UK",
      "zh": "德国与英国"
    },
    "cultural_context": {
      "en": "Soaring emotional melodies, massive multi-octave supersaws, dramatic piano breakdowns, and euphoric drops.",
      "zh": "以直冲云霄的情感旋律、跨多八度的史诗 Supersaw 音墙、宏伟钢琴分解段落与升华释放著称。"
    },
    "bpm_range": "136–142 BPM",
    "default_bpm": 138,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–III–VII",
      "i–VII–VI–VII"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Detuned Supersaw Leads",
      "Dramatic Piano Chords",
      "Lush Strings",
      "Soaring Sweeps",
      "Sub Bass"
    ],
    "sound_design": {
      "en": "Detuned supersaw synth leads, dramatic piano chords, lush strings, soaring sweeps.",
      "zh": "多层去谐超锯齿波主音（Roland JP-8000）、戏剧性纯钢琴和弦与宏阔交响弦乐铺底。"
    },
    "rhythm_features": {
      "en": "Fast driving 138 BPM 4/4 kick drum with snappy offbeat open hats and continuous 16th bass.",
      "zh": "极速推进的 138 BPM 四踩四底鼓，配合明快的反拍开镲与奔流不息的十六分音符滚动贝斯。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Uplifting Trance signature kick character.",
        "zh": "Uplifting Trance 风格代表性底鼓特征。"
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
      "tempo": "136–142 BPM"
    },
    "bass_pattern": {
      "en": "Rolling 16th-note triplets or driving sub-bass lines following chord root notes.",
      "zh": "滚动的十六分音符或三连音推进式低音线条，紧跟和弦根音波澜壮阔流转。"
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
        "In breakdown remove percussion, let piano build tension",
        "Layer 7 detuned saw oscillators with stereo spread",
        "Sidechain lead supersaws gently to kick"
      ],
      "zh": [
        "在转场过渡段切除打击乐蓄积情感张力",
        "使用 7 个去谐立体声锯齿波振荡器",
        "对主音 Supersaw 音墙进行轻度侧链闪避"
      ]
    },
    "representative_tracks": [
      {
        "title": "Uplifting Trance Anthem",
        "artist": "Armin van Buuren",
        "year": 1997,
        "link": "https://www.youtube.com/results?search_query=Armin+van+Buuren+Uplifting+Trance"
      },
      {
        "title": "Midnight in Germany & UK",
        "artist": "Aly & Fila",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=Aly+&+Fila+Uplifting+Trance"
      },
      {
        "title": "Echoes of Uplifting Trance",
        "artist": "Paul van Dyk",
        "year": 2001,
        "link": "https://www.youtube.com/results?search_query=Paul+van+Dyk+Uplifting+Trance"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Ferry Corsten",
        "year": 2003,
        "link": "https://www.youtube.com/results?search_query=Ferry+Corsten+Uplifting+Trance"
      },
      {
        "title": "Essential Uplifting Trance",
        "artist": "John O'Callaghan",
        "year": 2005,
        "link": "https://www.youtube.com/results?search_query=John+O'Callaghan+Uplifting+Trance"
      }
    ],
    "representative_artists": [
      "Armin van Buuren",
      "Aly & Fila",
      "Paul van Dyk",
      "Ferry Corsten",
      "John O'Callaghan"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 4,
      "brightness": 10,
      "harmonicComplexity": 4,
      "rhythmDensity": 9,
      "bassEnergy": 9,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "uplifting-trance",
      "bpm": 138,
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
            1,
            1
          ],
          "pitch": [
            null,
            41,
            41,
            41,
            null,
            41,
            41,
            41,
            null,
            44,
            44,
            44,
            null,
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
            1,
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
            68,
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
          "instrument": "supersaw",
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
    "id": "progressive-trance",
    "name": "Progressive Trance",
    "aliases": [
      "前卫出神"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1996",
    "origin_decade": 1990,
    "origin_place": {
      "en": "UK & Israel",
      "zh": "英国与以色列"
    },
    "cultural_context": {
      "en": "Focuses on steady atmospheric progression rather than rapid breakdowns, blending trance melodies with house grooves.",
      "zh": "注重平稳连贯的氛围递进演变而非突兀大起大落，将 Trance 和声美感与深邃浩室律动结合。"
    },
    "bpm_range": "128–134 BPM",
    "default_bpm": 132,
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
      "Plucked Synth Arpeggios",
      "Filtered Analog Pads",
      "Warm Sub Bass",
      "Delay Tails"
    ],
    "sound_design": {
      "en": "Plucked synth arpeggios, filtered analog pads, warm low-end basslines, delay tails.",
      "zh": "弹拨合成琶音、经过滤波的模拟铺底、温润有力的低音线条与精细回声尾音。"
    },
    "rhythm_features": {
      "en": "Tight balanced 4/4 beat at around 130 BPM with syncopated shaker loops and dynamic hats.",
      "zh": "在 130 BPM 保持紧凑均衡的四踩四节拍，搭配切分沙锤循环与富于动态变化的踩镲。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Progressive Trance signature kick character.",
        "zh": "Progressive Trance 风格代表性底鼓特征。"
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
      "tempo": "128–134 BPM"
    },
    "bass_pattern": {
      "en": "Grooving offbeat bass or syncopated rolling lines with modulated filter cutoffs.",
      "zh": "富有律动感的反拍贝斯或带有平滑滤波调制的切分滚动线条。"
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
        "Focus on 32-bar blocks that evolve subtly",
        "Blend plucked transient layer with sustained pad",
        "High-pass non-bass elements above 120Hz"
      ],
      "zh": [
        "以 32 小节为单元依靠平缓滤波自动化实现蜕变",
        "将瞬态弹拨层与延音铺底层叠合获得多维和弦",
        "对所有非贝斯乐器在 120Hz 处做干净高通切除"
      ]
    },
    "representative_tracks": [
      {
        "title": "Progressive Trance Anthem",
        "artist": "Above & Beyond",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Above+&+Beyond+Progressive+Trance"
      },
      {
        "title": "Midnight in UK & Israel",
        "artist": "Sasha & John Digweed",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Sasha+&+John+Digweed+Progressive+Trance"
      },
      {
        "title": "Echoes of Progressive Trance",
        "artist": "Cosmic Gate",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=Cosmic+Gate+Progressive+Trance"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Grum",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=Grum+Progressive+Trance"
      },
      {
        "title": "Essential Progressive Trance",
        "artist": "Ilan Bluestone",
        "year": 2004,
        "link": "https://www.youtube.com/results?search_query=Ilan+Bluestone+Progressive+Trance"
      }
    ],
    "representative_artists": [
      "Above & Beyond",
      "Sasha & John Digweed",
      "Cosmic Gate",
      "Grum",
      "Ilan Bluestone"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 7,
      "harmonicComplexity": 6,
      "rhythmDensity": 10,
      "bassEnergy": 6,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "progressive-trance",
      "bpm": 130,
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
            45,
            null,
            45,
            45,
            45,
            null,
            45,
            45,
            48,
            null,
            48,
            48,
            45,
            null,
            50,
            48
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
            81,
            null,
            null,
            84,
            null,
            null,
            null,
            null,
            83,
            null,
            null,
            86,
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
    "id": "psytrance",
    "name": "Psytrance",
    "aliases": [
      "迷幻出神"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1995",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Goa & Israel",
      "zh": "果阿与以色列"
    },
    "cultural_context": {
      "en": "Relentless rolling 16th-note basslines (K-B-B-B), otherworldly psychedelic synth sweeps, and tribal chants.",
      "zh": "以标志性如疾风骤雨般的十六分音符低音（K-B-B-B 律动）、天外来客般的迷幻滤波扫频闻名。"
    },
    "bpm_range": "138–148 BPM",
    "default_bpm": 142,
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
      "Complex FM Squelch Lead",
      "303 Acid Bass",
      "Warm Pad",
      "Resonant Pitch Zaps",
      "Tribal Chants"
    ],
    "sound_design": {
      "en": "Complex FM squelches, resonant pitch zaps, granular audio glitches, tribal chants.",
      "zh": "复杂的 FM 酸性啸叫、高谐振音高扫频、粒子化音频毛刺与古老部落呼唤人声。"
    },
    "rhythm_features": {
      "en": "Punchy 4/4 kick immediately followed by three rolling 16th-note bass hits on each quarter beat.",
      "zh": "极速有力的四踩四底鼓，每拍后紧随三个十六分音符的连贯暴击（Kick-Bass-Bass-Bass）。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Psytrance signature kick character.",
        "zh": "Psytrance 风格代表性底鼓特征。"
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
      "tempo": "138–148 BPM"
    },
    "bass_pattern": {
      "en": "Signature K-B-B-B saw bass with tight decay envelope and surgical EQ notched for kick.",
      "zh": "标志性 K-B-B-B 贝斯线：锯齿波配合紧凑衰减包络与手术刀式挖频。"
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
        "Tune kick and bass to exact same key",
        "Set bass notes with zero attack and 60ms decay",
        "Create psychedelic squelches using FM with random LFO"
      ],
      "zh": [
        "将底鼓与贝斯精准校准在相同调性上对齐相位",
        "贝斯包络设定为 0 起音、60ms 衰减确保机关枪颗粒感",
        "使用 FM 合成器将随机 LFO 路由至音高生成迷幻音色"
      ]
    },
    "representative_tracks": [
      {
        "title": "Psytrance Anthem",
        "artist": "Infected Mushroom",
        "year": 1995,
        "link": "https://www.youtube.com/results?search_query=Infected+Mushroom+Psytrance"
      },
      {
        "title": "Midnight in Goa & Israel",
        "artist": "Astrix",
        "year": 1997,
        "link": "https://www.youtube.com/results?search_query=Astrix+Psytrance"
      },
      {
        "title": "Echoes of Psytrance",
        "artist": "Vini Vici",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=Vini+Vici+Psytrance"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Ace Ventura",
        "year": 2001,
        "link": "https://www.youtube.com/results?search_query=Ace+Ventura+Psytrance"
      },
      {
        "title": "Essential Psytrance",
        "artist": "1200 Micrograms",
        "year": 2003,
        "link": "https://www.youtube.com/results?search_query=1200+Micrograms+Psytrance"
      }
    ],
    "representative_artists": [
      "Infected Mushroom",
      "Astrix",
      "Vini Vici",
      "Ace Ventura",
      "1200 Micrograms"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 5,
      "brightness": 8,
      "harmonicComplexity": 2,
      "rhythmDensity": 9,
      "bassEnergy": 6,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "psytrance",
      "bpm": 142,
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
            0,
            55,
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
          "instrument": "acid_303",
          "steps": [
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
            1,
            1
          ],
          "pitch": [
            null,
            40,
            40,
            40,
            null,
            40,
            40,
            40,
            null,
            40,
            40,
            40,
            null,
            43,
            40,
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
            76,
            null,
            null,
            null,
            79,
            null,
            null,
            null,
            76,
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
    "id": "goa-trance",
    "name": "Goa Trance",
    "aliases": [
      "果阿出神"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1992",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Goa, India",
      "zh": "印度果阿"
    },
    "cultural_context": {
      "en": "Born on the beaches of Goa in the early 1990s, blending spiritual Indian scales, 303 acid lines, and outdoor celebration vibes.",
      "zh": "发端于 90 年代初印度果阿海滩，将灵性神秘的印度调式、高共振 303 酸性旋律与满月户外狂欢熔铸。"
    },
    "bpm_range": "130–145 BPM",
    "default_bpm": 138,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–III–VII",
      "i–VII–VI–VII"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Sitar Lead",
      "Layered 303 Acid Riffs",
      "Warm Pad",
      "Eastern Modal Textures",
      "Tanpura Drone"
    ],
    "sound_design": {
      "en": "Multiple layered 303 acid riffs, eastern modal melodies, sitar/tanpura textures.",
      "zh": "多层叠置的 303 酸性 Riff、东方神秘调式旋律、西塔琴环境纹理与共鸣滤波扫频。"
    },
    "rhythm_features": {
      "en": "Driving 4/4 kicks with continuous rolling percussion and syncopated 16th closed hats.",
      "zh": "推进式四踩四底鼓，伴随连续不断的滚动打击乐和切分十六分音符闭镲。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Goa Trance signature kick character.",
        "zh": "Goa Trance 风格代表性底鼓特征。"
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
      "en": "Bouncy offbeat analog saw bass galloping rhythmically behind the driving kick.",
      "zh": "富有弹性跳跃感的反拍模拟锯齿波贝斯，在推进的底鼓后方如骏马奔腾。"
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
        "Compose melodies using Phrygian Dominant scale",
        "Layer two 303 synths playing counterpoint arpeggios",
        "Incorporate ethnic instruments with long stereo delay"
      ],
      "zh": [
        "使用弗里吉亚属调式构筑神秘主义色彩异域旋律",
        "两台 303 合成器演奏对位琶音制造交织光芒",
        "加入经立体声漫长延时重复处理的传统民族乐器"
      ]
    },
    "representative_tracks": [
      {
        "title": "Goa Trance Anthem",
        "artist": "Astral Projection",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=Astral+Projection+Goa+Trance"
      },
      {
        "title": "Midnight in Goa",
        "artist": "Man With No Name",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=Man+With+No+Name+Goa+Trance"
      },
      {
        "title": "Echoes of Goa Trance",
        "artist": "Hallucinogen",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Hallucinogen+Goa+Trance"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Juno Reactor",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Juno+Reactor+Goa+Trance"
      },
      {
        "title": "Essential Goa Trance",
        "artist": "Total Eclipse",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=Total+Eclipse+Goa+Trance"
      }
    ],
    "representative_artists": [
      "Astral Projection",
      "Man With No Name",
      "Hallucinogen",
      "Juno Reactor",
      "Total Eclipse"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 6,
      "brightness": 9,
      "harmonicComplexity": 6,
      "rhythmDensity": 10,
      "bassEnergy": 6,
      "melodicFocus": 9
    },
    "sequencer_pattern": {
      "genre_id": "goa-trance",
      "bpm": 142,
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
          "instrument": "acid_303",
          "steps": [
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
            1,
            1
          ],
          "pitch": [
            null,
            38,
            38,
            38,
            null,
            38,
            38,
            38,
            null,
            38,
            38,
            38,
            null,
            41,
            38,
            42
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
          "instrument": "sitar_lead",
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
            1,
            0,
            0
          ],
          "pitch": [
            null,
            null,
            74,
            null,
            75,
            null,
            null,
            78,
            null,
            null,
            77,
            null,
            74,
            75,
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
    "id": "tech-trance",
    "name": "Tech Trance",
    "aliases": [
      "科技出神"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1999",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Germany & UK",
      "zh": "德国与英国"
    },
    "cultural_context": {
      "en": "Fuses aggressive industrial percussion and dark basslines of techno with soaring trance energy.",
      "zh": "将 Techno 坚硬冰冷的工业打击乐与 Uplifting Trance 激昂升腾的能量和史诗爆发焊接。"
    },
    "bpm_range": "138–144 BPM",
    "default_bpm": 140,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭VII–♭VI–i",
      "i–iv–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Aggressive Saw Synth Stabs",
      "Distorted Kicks",
      "Metallic Percussive Clicks",
      "Warm Pad",
      "Sub Bass"
    ],
    "sound_design": {
      "en": "Distorted kicks, metallic percussive clicks, short aggressive saw stabs, stutter FX.",
      "zh": "过载坚实底鼓、金属质感点击打击乐、短促凶猛锯齿波刺音与门限卡顿效果。"
    },
    "rhythm_features": {
      "en": "Hard stomping 4/4 techno beat integrated with rapid syncopated percussion fills.",
      "zh": "硬朗重踏的四四拍 Techno 鼓点，融合极速切分的打击乐加花与利落军鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Tech Trance signature kick character.",
        "zh": "Tech Trance 风格代表性底鼓特征。"
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
      "tempo": "138–144 BPM"
    },
    "bass_pattern": {
      "en": "Relentless rolling sub-bass or offbeat staccato bass with extreme punch.",
      "zh": "持续不断的滚动超低频或极具压迫感瞬态冲力的反拍断奏低音。"
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
        "Layer heavy acoustic kick click on top of electronic sub boom",
        "Use pitch-shifters on vocal chops for dark robotic textures",
        "Keep breakdown brief to maintain dancefloor pressure"
      ],
      "zh": [
        "在电子超低频底鼓上方叠一层高瞬态有机敲击头",
        "对人声切片做音高下移处理打造暗黑机械质感",
        "保持转场时间紧凑短促，防止舞池被过长抒情打断"
      ]
    },
    "representative_tracks": [
      {
        "title": "Tech Trance Anthem",
        "artist": "Marco V",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=Marco+V+Tech+Trance"
      },
      {
        "title": "Midnight in Germany & UK",
        "artist": "Sander van Doorn",
        "year": 2001,
        "link": "https://www.youtube.com/results?search_query=Sander+van+Doorn+Tech+Trance"
      },
      {
        "title": "Echoes of Tech Trance",
        "artist": "Bryan Kearney",
        "year": 2003,
        "link": "https://www.youtube.com/results?search_query=Bryan+Kearney+Tech+Trance"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Mark Sherry",
        "year": 2005,
        "link": "https://www.youtube.com/results?search_query=Mark+Sherry+Tech+Trance"
      },
      {
        "title": "Essential Tech Trance",
        "artist": "Jordan Suckley",
        "year": 2007,
        "link": "https://www.youtube.com/results?search_query=Jordan+Suckley+Tech+Trance"
      }
    ],
    "representative_artists": [
      "Marco V",
      "Sander van Doorn",
      "Bryan Kearney",
      "Mark Sherry",
      "Jordan Suckley"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 10,
      "harmonicComplexity": 2,
      "rhythmDensity": 8,
      "bassEnergy": 9,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "tech-trance",
      "bpm": 140,
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
          "instrument": "sub_bass",
          "steps": [
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
            1,
            1
          ],
          "pitch": [
            null,
            41,
            41,
            41,
            null,
            41,
            41,
            41,
            null,
            44,
            44,
            44,
            null,
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
            77,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            80,
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
    "id": "hard-trance",
    "name": "Hard Trance",
    "aliases": [
      "硬核出神"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1993",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Frankfurt, Germany",
      "zh": "德国法兰克福"
    },
    "cultural_context": {
      "en": "Takes trance to higher BPMs with hard resonant kicks, distorted basslines, and fast acid riffs.",
      "zh": "将 Trance 推向更高 BPM 极限，具备硬朗结实的重击底鼓与飞旋酸性 Riff。"
    },
    "bpm_range": "140–152 BPM",
    "default_bpm": 145,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–III–VII",
      "i–♭VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Screaming Acid Lead",
      "Hoover Synths",
      "Supersaw Chords",
      "Compressed 909 Kicks"
    ],
    "sound_design": {
      "en": "Heavily compressed 909 kicks, screaming resonant acid leads, aggressive hoover synths.",
      "zh": "高强度压缩 909 底鼓、尖啸共鸣酸性主音与侵略性 Hoover 合成音效。"
    },
    "rhythm_features": {
      "en": "High-tempo 145 BPM driving 4/4 kick with pounding offbeat reverse-bass energy.",
      "zh": "145 BPM 高速飞驰的四踩四底鼓，伴随充满反冲推力的反拍反转贝斯能量。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Hard Trance signature kick character.",
        "zh": "Hard Trance 风格代表性底鼓特征。"
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
      "tempo": "140–152 BPM"
    },
    "bass_pattern": {
      "en": "Aggressive offbeat reverse-bass punching through the mix on the offbeat.",
      "zh": "高侵略性的反拍 Reverse-bass 或失真锯齿波低音，在反拍凶狠穿透混音。"
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
        "Process bass with reverse-decay envelope for whoop effect",
        "Use hard clipping on drum channel for warehouse power",
        "Introduce anthemic synth stabs with wide stereo"
      ],
      "zh": [
        "反向衰减包络处理贝斯创造经典吸入后抛感",
        "鼓组通道应用硬剪切失真还原老派仓库暴烈感",
        "宏大宽立体声和弦刺音覆盖在单声道鼓机之上"
      ]
    },
    "representative_tracks": [
      {
        "title": "Hard Trance Anthem",
        "artist": "Cosmic Baby",
        "year": 1993,
        "link": "https://www.youtube.com/results?search_query=Cosmic+Baby+Hard+Trance"
      },
      {
        "title": "Midnight in Frankfurt",
        "artist": "Nostrum",
        "year": 1995,
        "link": "https://www.youtube.com/results?search_query=Nostrum+Hard+Trance"
      },
      {
        "title": "Echoes of Hard Trance",
        "artist": "Scot Project",
        "year": 1997,
        "link": "https://www.youtube.com/results?search_query=Scot+Project+Hard+Trance"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Yoji Biomehanika",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=Yoji+Biomehanika+Hard+Trance"
      },
      {
        "title": "Essential Hard Trance",
        "artist": "Jones & Stephenson",
        "year": 2001,
        "link": "https://www.youtube.com/results?search_query=Jones+&+Stephenson+Hard+Trance"
      }
    ],
    "representative_artists": [
      "Cosmic Baby",
      "Nostrum",
      "Scot Project",
      "Yoji Biomehanika",
      "Jones & Stephenson"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 4,
      "brightness": 8,
      "harmonicComplexity": 4,
      "rhythmDensity": 7,
      "bassEnergy": 6,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "hard-trance",
      "bpm": 145,
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
            43,
            null,
            null,
            null,
            43,
            null,
            null,
            null,
            46,
            null,
            null,
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
    "id": "vocal-trance",
    "name": "Vocal Trance",
    "aliases": [
      "人声出神"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1998",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Netherlands & UK",
      "zh": "荷兰与英国"
    },
    "cultural_context": {
      "en": "Emotive female vocal top-lines paired with verse-chorus song structures in majestic trance productions.",
      "zh": "以深情凄美的主旋律人声咏唱为核心，依托经典主歌-副歌结构，由壮丽出神舞曲烘托。"
    },
    "bpm_range": "135–140 BPM",
    "default_bpm": 138,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–III–VII",
      "VI–VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Warm Piano Lead",
      "Massive Supersaws",
      "Autotuned Vocal Chains",
      "Sub Bass",
      "Lush Delays"
    ],
    "sound_design": {
      "en": "Polished vocal chains with autotune and lush delays, warm pianos, massive supersaws.",
      "zh": "精心打磨的人声音轨链（含精致修音与辽阔延迟）、温暖原声钢琴与宏大宽立体声 Supersaw。"
    },
    "rhythm_features": {
      "en": "Crisp 138 BPM 4/4 beats with light shakers, bright open hats, pre-chorus builds.",
      "zh": "清脆利落的 138 BPM 四踩四节拍，搭配轻盈沙锤、明亮开镲与副歌爆发前戏剧性递增。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Vocal Trance signature kick character.",
        "zh": "Vocal Trance 风格代表性底鼓特征。"
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
      "en": "Melodic rolling 16th basslines ducking smoothly beneath vocals and kick.",
      "zh": "悠扬滚动的十六分音符低音线条，在人声歌词与底鼓重击下平滑自如地闪避。"
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
        "Carve out pocket between 1kHz-3kHz in synths for vocals",
        "Add stereo ping-pong delay to vocal ad-libs",
        "Drop heavy drums during verse for intimacy"
      ],
      "zh": [
        "在主音合成器 1kHz 到 3kHz 挖空隙确保人声清晰",
        "为人声吟唱尾音加入附点八分音符立体声乒乓回声",
        "在人声主歌段落撤掉全部重型打击乐将亲密感拉满"
      ]
    },
    "representative_tracks": [
      {
        "title": "Vocal Trance Anthem",
        "artist": "OceanLab",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=OceanLab+Vocal+Trance"
      },
      {
        "title": "Midnight in Netherlands & UK",
        "artist": "ATB",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=ATB+Vocal+Trance"
      },
      {
        "title": "Echoes of Vocal Trance",
        "artist": "Dash Berlin",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=Dash+Berlin+Vocal+Trance"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Emma Hewitt",
        "year": 2004,
        "link": "https://www.youtube.com/results?search_query=Emma+Hewitt+Vocal+Trance"
      },
      {
        "title": "Essential Vocal Trance",
        "artist": "Gareth Emery",
        "year": 2006,
        "link": "https://www.youtube.com/results?search_query=Gareth+Emery+Vocal+Trance"
      }
    ],
    "representative_artists": [
      "OceanLab",
      "ATB",
      "Dash Berlin",
      "Emma Hewitt",
      "Gareth Emery"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 5,
      "brightness": 9,
      "harmonicComplexity": 4,
      "rhythmDensity": 10,
      "bassEnergy": 6,
      "melodicFocus": 10
    },
    "sequencer_pattern": {
      "genre_id": "vocal-trance",
      "bpm": 136,
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
          "instrument": "sub_bass",
          "steps": [
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
            1,
            1
          ],
          "pitch": [
            null,
            45,
            45,
            45,
            null,
            45,
            45,
            45,
            null,
            48,
            48,
            48,
            null,
            45,
            48,
            50
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
          "instrument": "piano_lead",
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
    "id": "euro-trance",
    "name": "Euro-Trance",
    "aliases": [
      "欧陆出神"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1998",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Germany & Belgium",
      "zh": "德国与比利时"
    },
    "cultural_context": {
      "en": "A commercialized pop-trance hybrid with high-energy lead melodies, dance-pop vocals, and offbeat bass.",
      "zh": "高度商业化流行出神跨界风格，以高能量快乐跳跃的主旋律、流行舞曲人声与反拍贝斯著称。"
    },
    "bpm_range": "138–144 BPM",
    "default_bpm": 140,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–III–VII",
      "i–VII–VI–VII"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Bright Supersaw Stabs",
      "Bouncy Synth Leads",
      "Commercial Pop Vocals",
      "Sub Bass"
    ],
    "sound_design": {
      "en": "Bright supersaw stabs, commercial pop vocal production, bouncy synth leads.",
      "zh": "明亮轻快 Supersaw 弹拨、流行人声精细制作、极具弹跳感的合成主奏与白噪声冲刷。"
    },
    "rhythm_features": {
      "en": "Driving 4/4 kicks with high-energy claps on 2 and 4 and bouncy offbeat open hats.",
      "zh": "充满推进力的四四拍底鼓，2、4 拍搭配高能量拍手与充满弹跳感的反拍开镲。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Euro-Trance signature kick character.",
        "zh": "Euro-Trance 风格代表性底鼓特征。"
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
      "tempo": "138–144 BPM"
    },
    "bass_pattern": {
      "en": "Bouncy offbeat pluck bassline alternating octaves to propel fast forward motion.",
      "zh": "带有弹性跳跃感的反拍拨弦贝斯，在高低八度之间快速交替以推动舞步狂欢。"
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
        "Focus on memorable 4-bar repeating motifs",
        "Layer sharp bell on top of supersaw lead",
        "Keep BPM stable at 140 to maximize club energy"
      ],
      "zh": [
        "专注于创作朗朗上口的 4 小节精悍重复乐汇",
        "在 Supersaw 主音上方叠一层清脆电铃弹拨",
        "将 BPM 牢牢稳定在 140 最大化点燃狂欢派对能量"
      ]
    },
    "representative_tracks": [
      {
        "title": "Euro-Trance Anthem",
        "artist": "Cascada",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Cascada+Euro-Trance"
      },
      {
        "title": "Midnight in Germany & Belgium",
        "artist": "Groove Coverage",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=Groove+Coverage+Euro-Trance"
      },
      {
        "title": "Echoes of Euro-Trance",
        "artist": "Milk Inc.",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=Milk+Inc.+Euro-Trance"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Lasgo",
        "year": 2004,
        "link": "https://www.youtube.com/results?search_query=Lasgo+Euro-Trance"
      },
      {
        "title": "Essential Euro-Trance",
        "artist": "Special D",
        "year": 2006,
        "link": "https://www.youtube.com/results?search_query=Special+D+Euro-Trance"
      }
    ],
    "representative_artists": [
      "Cascada",
      "Groove Coverage",
      "Milk Inc.",
      "Lasgo",
      "Special D"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 4,
      "brightness": 10,
      "harmonicComplexity": 4,
      "rhythmDensity": 8,
      "bassEnergy": 6,
      "melodicFocus": 10
    },
    "sequencer_pattern": {
      "genre_id": "euro-trance",
      "bpm": 140,
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
            36,
            null,
            36,
            null,
            39,
            null,
            36,
            null,
            41,
            null,
            39,
            null,
            36,
            null,
            39
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
          "instrument": "supersaw",
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
    "id": "dream-trance",
    "name": "Dream Trance",
    "aliases": [
      "梦幻出神"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1995",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Italy & Switzerland",
      "zh": "意大利与瑞士"
    },
    "cultural_context": {
      "en": "Pioneered by Robert Miles with Children in 1995, featuring soothing acoustic piano over rolling trance beats.",
      "zh": "由 Robert Miles 凭《Children》开创，以舒缓清澈的原声钢琴在出神节拍上流淌闻名。"
    },
    "bpm_range": "130–138 BPM",
    "default_bpm": 134,
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
      "Acoustic Grand Piano",
      "Soft Synth Pads",
      "Gentle String Sweeps",
      "Warm Round Drum Hits",
      "Sub Bass"
    ],
    "sound_design": {
      "en": "Acoustic grand piano, soft synth pads, gentle string sweeps, warm round drum hits.",
      "zh": "温暖原声大钢琴、柔和合成器铺底、典雅弦乐扫弦与温润圆滑的电子鼓机击打。"
    },
    "rhythm_features": {
      "en": "Smooth non-aggressive 4/4 kicks with gentle shakers and muted open hats.",
      "zh": "平滑不显突兀的四踩四底鼓，搭配轻柔沙锤与暗色开镲营造恬静梦幻体验。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Dream Trance signature kick character.",
        "zh": "Dream Trance 风格代表性底鼓特征。"
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
      "en": "Gentle offbeat or rolling sub-bass following piano chord progressions.",
      "zh": "轻柔的反拍或滚动超低音，伴随钢琴和弦轻缓前行，温顺而从不抢戏。"
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
        "Use high-quality grand piano samples with natural dynamics",
        "Add lush hall reverbs with 4-5s decay to piano",
        "Soften kick punch by rolling off high-end at 4kHz"
      ],
      "zh": [
        "使用高品质大钢琴采样保留逼真人手动态",
        "为钢琴主旋律挂载衰减 4-5 秒的大厅混响",
        "在 4kHz 处轻柔滚降底鼓高频使其更显温润"
      ]
    },
    "representative_tracks": [
      {
        "title": "Dream Trance Anthem",
        "artist": "Robert Miles",
        "year": 1995,
        "link": "https://www.youtube.com/results?search_query=Robert+Miles+Dream+Trance"
      },
      {
        "title": "Midnight in Italy & Switzerland",
        "artist": "DJ Dado",
        "year": 1997,
        "link": "https://www.youtube.com/results?search_query=DJ+Dado+Dream+Trance"
      },
      {
        "title": "Echoes of Dream Trance",
        "artist": "Zhi-Vago",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=Zhi-Vago+Dream+Trance"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Nylon Moon",
        "year": 2001,
        "link": "https://www.youtube.com/results?search_query=Nylon+Moon+Dream+Trance"
      },
      {
        "title": "Essential Dream Trance",
        "artist": "Mauro Picotto",
        "year": 2003,
        "link": "https://www.youtube.com/results?search_query=Mauro+Picotto+Dream+Trance"
      }
    ],
    "representative_artists": [
      "Robert Miles",
      "DJ Dado",
      "Zhi-Vago",
      "Nylon Moon",
      "Mauro Picotto"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 6,
      "brightness": 7,
      "harmonicComplexity": 8,
      "rhythmDensity": 10,
      "bassEnergy": 9,
      "melodicFocus": 9
    },
    "sequencer_pattern": {
      "genre_id": "dream-trance",
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
            1,
            1
          ],
          "pitch": [
            null,
            41,
            41,
            41,
            null,
            41,
            41,
            41,
            null,
            44,
            44,
            44,
            null,
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
          "instrument": "piano_lead",
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
            77,
            null,
            80,
            null,
            77,
            null,
            82,
            null,
            77,
            null,
            80,
            null,
            77,
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
  }
];
