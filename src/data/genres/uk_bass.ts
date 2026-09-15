import { Genre } from '../../types/genre';

export const UK_BASS_GENRES: Genre[] = [
  {
    "id": "uk-garage",
    "name": "UK Garage",
    "aliases": [
      "车库舞曲",
      "UKG"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1994",
    "origin_decade": 1990,
    "origin_place": {
      "en": "London, UK",
      "zh": "英国伦敦"
    },
    "cultural_context": {
      "en": "Evolved from New York garage house in London clubs, speeding up the beat, adding heavy syncopated shuffle, vocal chops, and bouncy organ basslines.",
      "zh": "在伦敦俱乐部脱胎于纽约车库浩室，加快速度并注入重度切分摇摆、短促人声切片与弹跳风琴低音。"
    },
    "bpm_range": "128–134 BPM",
    "default_bpm": 130,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–iv–V",
      "i–iv–VII–III"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Korg M1 Organ Bass Stabs",
      "Time-Stretched Vocal Micro-Samples",
      "Rhodes Chords",
      "Crisp Hi-Hats",
      "Vinyl Dust",
      "Sub Bass"
    ],
    "sound_design": {
      "en": "Time-stretched vocal micro-samples, Korg M1 organ bass stabs, crisp high hats, warm vinyl dust.",
      "zh": "时间拉伸的人声微粒切片、Korg M1 风琴低音刺音、清脆踩镲与温暖黑胶底噪。"
    },
    "rhythm_features": {
      "en": "Shuffled 4/4 or 2-step rhythm with heavy 16th-note swing between 56% and 62%.",
      "zh": "深度摇摆的 4/4 拍或 2-Step 节奏，十六分音符摇摆度高达 56% 到 62%。"
    },
    "drum_pattern": {
      "kick": {
        "en": "UK Garage signature kick character.",
        "zh": "UK Garage 风格代表性底鼓特征。"
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
      "en": "Bouncy, syncopated organ or sine basslines playing energetic question-and-answer hooks.",
      "zh": "充满弹性的切分风琴或正弦波贝斯，演奏充满活力的呼应式旋律 Hook。"
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
        "Pitch vocal syllables up 3 semitones and chop into 16th notes",
        "Use 16th-note triplet swing on hi-hats for classic London bounce",
        "Layer an organ stab with a sub sine to hit hard on dancefloors"
      ],
      "zh": [
        "将人声音节升高 3 个半音并切成十六分音符短促片段",
        "在踩镲上应用十六分音符三连音摇摆获取正宗伦敦弹性律动",
        "把风琴音色与纯低音正弦波叠合确保舞池打击力"
      ]
    },
    "representative_tracks": [
      {
        "title": "UK Garage Anthem",
        "artist": "MJ Cole",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=MJ+Cole+UK+Garage"
      },
      {
        "title": "Midnight in London",
        "artist": "Todd Edwards",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Todd+Edwards+UK+Garage"
      },
      {
        "title": "Echoes of UK Garage",
        "artist": "Grant Nelson",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Grant+Nelson+UK+Garage"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Tuff Jam",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=Tuff+Jam+UK+Garage"
      },
      {
        "title": "Essential UK Garage",
        "artist": "Sunship",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=Sunship+UK+Garage"
      }
    ],
    "representative_artists": [
      "MJ Cole",
      "Todd Edwards",
      "Grant Nelson",
      "Tuff Jam",
      "Sunship"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 10,
      "brightness": 6,
      "harmonicComplexity": 4,
      "rhythmDensity": 5,
      "bassEnergy": 9,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "uk-garage",
      "bpm": 132,
      "scale": "C minor",
      "swing": 35,
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
            0,
            1,
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
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "m1_organ",
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
            1,
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
    "id": "2-step-garage",
    "name": "2-Step Garage",
    "aliases": [
      "两步车库"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1997",
    "origin_decade": 1990,
    "origin_place": {
      "en": "London, UK",
      "zh": "英国伦敦"
    },
    "cultural_context": {
      "en": "Stripped the steady 4/4 kick of house, creating an irregular syncopated skip with kick on beat 1 and 2-and, sparking a massive UK pop and underground movement.",
      "zh": "抽去 House 坚硬稳固的四踩四底鼓，代之以极富切分跳跃感的两步跳跃节奏，引爆了英国流行乐与地下低音革命。"
    },
    "bpm_range": "130–136 BPM",
    "default_bpm": 132,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–iv–v",
      "ii–V–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Smooth R&B Vocal Acapellas",
      "Rhodes Chords",
      "Snappy Rimshots",
      "Bouncy Sub Bass",
      "Plucked Synth Chops"
    ],
    "sound_design": {
      "en": "Smooth R&B vocal acapellas, Rhodes chords, snappy rimshots, bouncy sub-bass.",
      "zh": "丝滑 R&B 人声干声、Rhodes 和弦、脆响边击与弹跳超低频。"
    },
    "rhythm_features": {
      "en": "The iconic 2-step skip: kick on 1, ghost snare, snare on 2 and 4 with kick skipping on offbeats.",
      "zh": "标志性 2-Step 跳步：第 1 拍底鼓，反拍底鼓跳跃，第 2、4 拍利落军鼓与幽灵音。"
    },
    "drum_pattern": {
      "kick": {
        "en": "2-Step Garage signature kick character.",
        "zh": "2-Step Garage 风格代表性底鼓特征。"
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
      "en": "Deep, rolling, syncopated basslines skipping around the vocal delivery with playful bounce.",
      "zh": "深沉、滚动且高度切分的贝斯线条，配合人声起伏跳跃。"
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
        "Mute kick on beat 2 and 4 to let the snare and bassline bounce",
        "Add swing around 60% on all percussive layers",
        "Sidechain sub bass to ghost percussions for pump"
      ],
      "zh": [
        "静音 2、4 拍的底鼓，留给军鼓与贝斯充沛的弹跳空间",
        "在所有打击乐轨道注入 60% 左右的深度摇摆",
        "使超低频针对幽灵打击乐做微妙侧链闪避增添动感"
      ]
    },
    "representative_tracks": [
      {
        "title": "2-Step Garage Anthem",
        "artist": "Artful Dodger",
        "year": 1997,
        "link": "https://www.youtube.com/results?search_query=Artful+Dodger+2-Step+Garage"
      },
      {
        "title": "Midnight in London",
        "artist": "Craig David",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=Craig+David+2-Step+Garage"
      },
      {
        "title": "Echoes of 2-Step Garage",
        "artist": "Sticky",
        "year": 2001,
        "link": "https://www.youtube.com/results?search_query=Sticky+2-Step+Garage"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Wookie",
        "year": 2003,
        "link": "https://www.youtube.com/results?search_query=Wookie+2-Step+Garage"
      },
      {
        "title": "Essential 2-Step Garage",
        "artist": "Zed Bias",
        "year": 2005,
        "link": "https://www.youtube.com/results?search_query=Zed+Bias+2-Step+Garage"
      }
    ],
    "representative_artists": [
      "Artful Dodger",
      "Craig David",
      "Sticky",
      "Wookie",
      "Zed Bias"
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
      "rhythmDensity": 9,
      "bassEnergy": 9,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "2-step-garage",
      "bpm": 134,
      "scale": "F minor",
      "swing": 45,
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
            1,
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
            70,
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
            null,
            null,
            null,
            null,
            68,
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
    "id": "speed-garage",
    "name": "Speed Garage",
    "aliases": [
      "极速车库"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1996",
    "origin_decade": 1990,
    "origin_place": {
      "en": "UK",
      "zh": "英国"
    },
    "cultural_context": {
      "en": "High-octane evolution of garage with 4/4 driving beats, warped time-stretched vocal screams, and thunderous sub-bass drops.",
      "zh": "高能车库演变流派，具备四踩四强劲底鼓、扭曲拉伸的人声尖叫与惊雷般的超低频重击。"
    },
    "bpm_range": "128–135 BPM",
    "default_bpm": 132,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–VI–V",
      "i–VI–III–VII"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Pitched-Down Jungle Breaks",
      "Heavy Sirens",
      "Roaring Sub Bass",
      "Warm Pad",
      "Square-Wave Stabs",
      "Time-Stretch Artifacts"
    ],
    "sound_design": {
      "en": "Warped time-stretch artifacts, heavy sirens, pitched-down jungle breaks, roaring sub drops.",
      "zh": "变速拉伸扭曲声、强力警报、降调丛林碎拍与咆哮超低频下沉。"
    },
    "rhythm_features": {
      "en": "Fast 4/4 driving kick with syncopated 16th hats and explosive pre-drop snare fills.",
      "zh": "高速 4/4 推进底鼓，伴随切分十六分音符踩镲与转场前爆炸般的军鼓加花。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Speed Garage signature kick character.",
        "zh": "Speed Garage 风格代表性底鼓特征。"
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
      "tempo": "128–135 BPM"
    },
    "bass_pattern": {
      "en": "Heavy, distorted offbeat bassline or resonant pitch-diving low-end bomb.",
      "zh": "厚重失真的反拍贝斯或带有共鸣音高下落的低频重击炸弹。"
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
        "Use extreme time-stretching on vocal loops to create grainy high-end textures",
        "Drop all drums before the bassline punches on the upbeat of beat 1",
        "Layer 909 kick with a sub-bass sine drop"
      ],
      "zh": [
        "对人声循环进行极端时间拉伸制造粗颗粒高频纹理",
        "在贝斯于第 1 拍后半拍重击前瞬间切除所有鼓点",
        "将 909 底鼓与超低正弦波下沉音叠层"
      ]
    },
    "representative_tracks": [
      {
        "title": "Speed Garage Anthem",
        "artist": "Double 99",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Double+99+Speed+Garage"
      },
      {
        "title": "Midnight in UK",
        "artist": "187 Lockdown",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=187+Lockdown+Speed+Garage"
      },
      {
        "title": "Echoes of Speed Garage",
        "artist": "Armand Van Helden",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=Armand+Van+Helden+Speed+Garage"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Rip Productions",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=Rip+Productions+Speed+Garage"
      },
      {
        "title": "Essential Speed Garage",
        "artist": "Serious Danger",
        "year": 2004,
        "link": "https://www.youtube.com/results?search_query=Serious+Danger+Speed+Garage"
      }
    ],
    "representative_artists": [
      "Double 99",
      "187 Lockdown",
      "Armand Van Helden",
      "Rip Productions",
      "Serious Danger"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 8,
      "brightness": 6,
      "harmonicComplexity": 2,
      "rhythmDensity": 6,
      "bassEnergy": 6,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "speed-garage",
      "bpm": 138,
      "scale": "E minor",
      "swing": 20,
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
          "instrument": "sub_bass",
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
            40,
            null,
            null,
            52,
            null,
            null,
            null,
            null,
            40,
            null,
            null,
            55,
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
          "instrument": "sweep_down",
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
    "id": "grime",
    "name": "Grime",
    "aliases": [
      "污垢乐"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2002",
    "origin_decade": 2000,
    "origin_place": {
      "en": "East London, UK",
      "zh": "英国东伦敦"
    },
    "cultural_context": {
      "en": "Forged on East London pirate radio, marrying 140 BPM square-wave video-game synth plucks with rapid-fire, aggressive UK street lyricism.",
      "zh": "熔铸于东伦敦黑广播电台，将 140 BPM 方波电子游戏芯片音色与狂风暴雨般的硬核伦敦街头说唱结合。"
    },
    "bpm_range": "140 BPM",
    "default_bpm": 140,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭II–i",
      "i–♭VI–♭VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "PlayStation / Triton Square Bass",
      "8-Bit Chip Blips",
      "Laser Zaps",
      "Cold Orchestral Stabs",
      "Warm Pad"
    ],
    "sound_design": {
      "en": "PlayStation/Korg Triton square wave bass, laser zaps, 8-bit chip blips, cold orchestral stabs.",
      "zh": "复古主机/Korg Triton 方波贝斯、激光射线音、8位芯片点音与冰冷管弦乐刺音。"
    },
    "rhythm_features": {
      "en": "Staccato, jagged 140 BPM half-time rhythm with sparse, mechanical clap/snare hits.",
      "zh": "短促锯齿状的 140 BPM 半速节拍，伴随稀疏机械的拍手/军鼓敲击。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Grime signature kick character.",
        "zh": "Grime 风格代表性底鼓特征。"
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
      "tempo": "140 BPM"
    },
    "bass_pattern": {
      "en": "Aggressive, buzzing square-wave sub bass playing raw, single-finger melodies.",
      "zh": "粗砺蜂鸣的方波超低频贝斯，演奏纯粹生猛的单指旋律。"
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
        "Use cheap GM MIDI sound sets or vintage gaming synths for authentic raw grit",
        "Keep drum sounds extremely dry without any room reverb",
        "Write melodies with harsh minor second dissonances"
      ],
      "zh": [
        "使用廉价复古游戏芯片或通用 MIDI 音色获取原汁原味的粗糙质感",
        "保持鼓组完全干冷绝不加任何房间混响",
        "在旋律中大胆使用尖锐的小二度不协和音程增添攻击性"
      ]
    },
    "representative_tracks": [
      {
        "title": "Grime Anthem",
        "artist": "Dizzee Rascal",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=Dizzee+Rascal+Grime"
      },
      {
        "title": "Midnight in East London",
        "artist": "Wiley",
        "year": 2004,
        "link": "https://www.youtube.com/results?search_query=Wiley+Grime"
      },
      {
        "title": "Echoes of Grime",
        "artist": "Skepta",
        "year": 2006,
        "link": "https://www.youtube.com/results?search_query=Skepta+Grime"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Jme",
        "year": 2008,
        "link": "https://www.youtube.com/results?search_query=Jme+Grime"
      },
      {
        "title": "Essential Grime",
        "artist": "Kano",
        "year": 2010,
        "link": "https://www.youtube.com/results?search_query=Kano+Grime"
      }
    ],
    "representative_artists": [
      "Dizzee Rascal",
      "Wiley",
      "Skepta",
      "Jme",
      "Kano"
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
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "grime",
      "bpm": 140,
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
          "instrument": "square_lead",
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
            38,
            null,
            null,
            null,
            null,
            null,
            38,
            null,
            41,
            null,
            null,
            null,
            null,
            null,
            38,
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
  },
  {
    "id": "bassline",
    "name": "Bassline",
    "aliases": [
      "低音线",
      "Bassline House"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2002",
    "origin_decade": 2000,
    "origin_place": {
      "en": "Sheffield & Leeds, UK",
      "zh": "英国谢菲尔德与利兹"
    },
    "cultural_context": {
      "en": "Born in Northern UK clubs like Niche in Sheffield, featuring 4/4 four-on-the-floor kicks, catchy female vocal pop hooks, and aggressive bouncy warped basslines.",
      "zh": "诞生于英国北部俱乐部（如谢菲尔德 Niche），具备 4/4 四踩四底鼓、洗脑女性流行人声与弹跳扭动的强劲贝斯。"
    },
    "bpm_range": "135–142 BPM",
    "default_bpm": 138,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–iv–V",
      "i–iv–VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Screaming FM Donk Bass",
      "Pitched-Up Vocal Hooks",
      "Bouncy Plucked Synth",
      "Warm Pad",
      "Clean Claps"
    ],
    "sound_design": {
      "en": "Pitched-up catchy vocal hooks, screaming FM donk bass, bouncy Reese plucks, clean claps.",
      "zh": "升调洗脑人声 Hook、尖叫 FM 碰碰低音（Donk）、弹跳 Reese 弹拨与清脆拍手。"
    },
    "rhythm_features": {
      "en": "Energetic 4-on-the-floor kick with sharp offbeat hi-hats and syncopated clap fills.",
      "zh": "高能四踩四底鼓，搭配锐利反拍踩镲与切分拍手加花。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Bassline signature kick character.",
        "zh": "Bassline 风格代表性底鼓特征。"
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
      "en": "Intensely bouncy, syncopated basslines skipping rapidly across 2 octaves.",
      "zh": "极富弹跳力与摇摆感的切分低音线条，在两个八度内快速跳跃穿梭。"
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
        "Create bouncy 'donk' sounds using FM synthesis with pitch envelopes",
        "Keep the kick punchy and tuned around 55Hz",
        "Layer sweet commercial pop vocals with high compression over violent basslines"
      ],
      "zh": [
        "使用带有快速音高包络的 FM 合成制作标志性弹跳 Donk 音色",
        "底鼓保持扎实有力，精准定调在 55Hz",
        "将甜美商业流行人声经过高压缩后与狂暴弹跳贝斯反差碰撞"
      ]
    },
    "representative_tracks": [
      {
        "title": "Bassline Anthem",
        "artist": "T2",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=T2+Bassline"
      },
      {
        "title": "Midnight in Sheffield & Leeds",
        "artist": "DJ Q",
        "year": 2004,
        "link": "https://www.youtube.com/results?search_query=DJ+Q+Bassline"
      },
      {
        "title": "Echoes of Bassline",
        "artist": "Flava D",
        "year": 2006,
        "link": "https://www.youtube.com/results?search_query=Flava+D+Bassline"
      },
      {
        "title": "Pulse & Groove",
        "artist": "TS7",
        "year": 2008,
        "link": "https://www.youtube.com/results?search_query=TS7+Bassline"
      },
      {
        "title": "Essential Bassline",
        "artist": "Burgaboy",
        "year": 2010,
        "link": "https://www.youtube.com/results?search_query=Burgaboy+Bassline"
      }
    ],
    "representative_artists": [
      "T2",
      "DJ Q",
      "Flava D",
      "TS7",
      "Burgaboy"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 8,
      "brightness": 6,
      "harmonicComplexity": 4,
      "rhythmDensity": 6,
      "bassEnergy": 10,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "bassline",
      "bpm": 140,
      "scale": "F minor",
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
          "instrument": "fm_lead",
          "steps": [
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
            0,
            1,
            0,
            0,
            0
          ],
          "pitch": [
            null,
            null,
            41,
            null,
            53,
            null,
            null,
            null,
            null,
            null,
            41,
            null,
            56,
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
    "id": "uk-funky",
    "name": "UK Funky",
    "aliases": [
      "英伦放克"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2006",
    "origin_decade": 2000,
    "origin_place": {
      "en": "London, UK",
      "zh": "英国伦敦"
    },
    "cultural_context": {
      "en": "Fuses UK garage with African polyrhythms, soca, and tribal house, creating infectious syncopated dance rhythms.",
      "zh": "将英国车库音乐与非洲复合节奏、加勒比索卡（Soca）及部落浩室交融，创造出极具感染力的切分舞曲律动。"
    },
    "bpm_range": "128–132 BPM",
    "default_bpm": 130,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–i–VII",
      "i–VI–iv–v"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Bright Piano Stabs",
      "Resonant Bongos & Congas",
      "Deep Sub Bass",
      "Rhodes Chords",
      "Smooth Female Vocals"
    ],
    "sound_design": {
      "en": "Resonant bongos, congas, bright piano stabs, smooth female vocals, deep sub-bass.",
      "zh": "共振邦戈鼓、康加鼓、明亮钢琴刺音、顺滑女性人声与深沉超低频。"
    },
    "rhythm_features": {
      "en": "Tribal, syncopated 4/4 rhythm with swinging congas, rimshots, and rolling triplets.",
      "zh": "部落切分四四拍律动，伴随摇摆的康加鼓、边击与滚动的连音。"
    },
    "drum_pattern": {
      "kick": {
        "en": "UK Funky signature kick character.",
        "zh": "UK Funky 风格代表性底鼓特征。"
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
      "en": "Warm, rolling sub-bass that snakes dynamically around the tribal percussion hits.",
      "zh": "温暖滚动的超低音，在部落打击乐的鼓点缝隙中自如游弋。"
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
        "Layer organic Latin/African percussion loops over standard 4/4 electronic kicks",
        "Use syncopated piano chord stabs on the upbeats",
        "Keep basslines warm with low-pass filtered triangle waves"
      ],
      "zh": [
        "在标准 4/4 电子底鼓上方叠置原声拉丁与非洲打击乐循环",
        "在反拍使用切分的明亮钢琴和弦切片",
        "使用低通滤波三角波保持贝斯线条的圆润与温暖"
      ]
    },
    "representative_tracks": [
      {
        "title": "UK Funky Anthem",
        "artist": "Crazy Cousinz",
        "year": 2006,
        "link": "https://www.youtube.com/results?search_query=Crazy+Cousinz+UK+Funky"
      },
      {
        "title": "Midnight in London",
        "artist": "Donae'o",
        "year": 2008,
        "link": "https://www.youtube.com/results?search_query=Donae'o+UK+Funky"
      },
      {
        "title": "Echoes of UK Funky",
        "artist": "Lil Silva",
        "year": 2010,
        "link": "https://www.youtube.com/results?search_query=Lil+Silva+UK+Funky"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Roska",
        "year": 2012,
        "link": "https://www.youtube.com/results?search_query=Roska+UK+Funky"
      },
      {
        "title": "Essential UK Funky",
        "artist": "Kyla",
        "year": 2014,
        "link": "https://www.youtube.com/results?search_query=Kyla+UK+Funky"
      }
    ],
    "representative_artists": [
      "Crazy Cousinz",
      "Donae'o",
      "Lil Silva",
      "Roska",
      "Kyla"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 9,
      "brightness": 7,
      "harmonicComplexity": 4,
      "rhythmDensity": 8,
      "bassEnergy": 9,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "uk-funky",
      "bpm": 130,
      "scale": "A minor",
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
            0
          ],
          "velocity": [
            0,
            0,
            0,
            65,
            0,
            0,
            95,
            0,
            0,
            0,
            0,
            65,
            0,
            0,
            95,
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
            0,
            1,
            0,
            0
          ],
          "velocity": [
            85,
            0,
            0,
            55,
            0,
            55,
            0,
            0,
            85,
            0,
            0,
            55,
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
            45,
            null,
            null,
            null,
            null,
            null,
            48,
            null,
            45,
            null,
            null,
            null,
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
          "instrument": "piano_lead",
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
    "id": "dub",
    "name": "Dub",
    "aliases": [
      "配音音乐",
      "回响音乐"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1968",
    "origin_decade": 1960,
    "origin_place": {
      "en": "Kingston, Jamaica",
      "zh": "牙买加金斯敦"
    },
    "cultural_context": {
      "en": "Originated in late-60s Jamaica by studio geniuses who treated the mixing desk as an instrument, pioneering tape delays, reverb drops, and massive sub-bass.",
      "zh": "60 年代末诞生于牙买加，先锋录音师将调音台作为乐器，开创了磁带延迟、混响跌落与超重低频的现代制作基石。"
    },
    "bpm_range": "65–85 BPM (130-170)",
    "default_bpm": 75,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–i–V",
      "i–VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Melodica / Harmonica",
      "Hammond Organ",
      "Deep Electric Bass",
      "Tape Echo Delays",
      "Spring Reverb Crashes"
    ],
    "sound_design": {
      "en": "Tape echo delay oscillations, spring reverb tank crashes, melodica, deep electric bass.",
      "zh": "磁带回声自激震荡、弹簧混响敲击声、口风琴与深沉原声电贝斯。"
    },
    "rhythm_features": {
      "en": "One-drop drum pattern with kick hitting on beat 3, rimshots with infinite echo repeats.",
      "zh": "One-drop 鼓点模式（底鼓仅落在第 3 拍），边击带有无尽回响延迟。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Dub signature kick character.",
        "zh": "Dub 风格代表性底鼓特征。"
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
      "tempo": "65–85 BPM (130-170)"
    },
    "bass_pattern": {
      "en": "Heavy, melodic, foundational electric basslines dominating the frequency spectrum.",
      "zh": "厚重、极富歌唱性且作为灵魂地基的电贝斯线条，统治整个低音频段。"
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
        "Feed delays back into themselves until they border on harmonic self-oscillation",
        "Kick your spring reverb unit (or emulate it) for classic metallic dub splash",
        "Mute rhythm guitar and let bass and drums carry the entire weight"
      ],
      "zh": [
        "让延迟效果器产生反馈环回直至临近自激震荡",
        "制造弹簧混响的敲击金属泼溅水花音效",
        "突然静音节奏吉他，仅留贝斯与鼓组承载全部重力"
      ]
    },
    "representative_tracks": [
      {
        "title": "Dub Anthem",
        "artist": "King Tubby",
        "year": 1968,
        "link": "https://www.youtube.com/results?search_query=King+Tubby+Dub"
      },
      {
        "title": "Midnight in Kingston",
        "artist": "Lee 'Scratch' Perry",
        "year": 1970,
        "link": "https://www.youtube.com/results?search_query=Lee+'Scratch'+Perry+Dub"
      },
      {
        "title": "Echoes of Dub",
        "artist": "Scientist",
        "year": 1972,
        "link": "https://www.youtube.com/results?search_query=Scientist+Dub"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Augustus Pablo",
        "year": 1974,
        "link": "https://www.youtube.com/results?search_query=Augustus+Pablo+Dub"
      },
      {
        "title": "Essential Dub",
        "artist": "Mad Professor",
        "year": 1976,
        "link": "https://www.youtube.com/results?search_query=Mad+Professor+Dub"
      }
    ],
    "representative_artists": [
      "King Tubby",
      "Lee 'Scratch' Perry",
      "Scientist",
      "Augustus Pablo",
      "Mad Professor"
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
      "rhythmDensity": 1,
      "bassEnergy": 7,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "dub",
      "bpm": 72,
      "scale": "G minor",
      "swing": 10,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "sub_kick",
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
            120,
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
          "instrument": "reggae_rim",
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
            1,
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
            43,
            null,
            null,
            null,
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
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "harmonica_lead",
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
          "instrument": "tape_stop",
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
    "id": "speedbass",
    "name": "Speedbass",
    "aliases": [
      "极速低音"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2018",
    "origin_decade": 2010,
    "origin_place": {
      "en": "UK & Global",
      "zh": "英国与全球"
    },
    "cultural_context": {
      "en": "A modern hyper-speed hybrid fusing the 160 BPM velocity of DnB and Footwork with the bouncy bassline wobbles and vocal hooks of UK Bassline.",
      "zh": "现代高能跨界流派，将 160 BPM 的高速冲击力同 UK Bassline 的弹跳低音与人声 Hook 熔合。"
    },
    "bpm_range": "155–165 BPM",
    "default_bpm": 160,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭VII–i",
      "i–♭II–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "High-Velocity FM Bass Wobbles",
      "Metallic Donk Plucks",
      "Warm Pad",
      "Speed-Pitched Vocal Shouts"
    ],
    "sound_design": {
      "en": "High-velocity FM bass wobbles, metallic donk plucks, speed-pitched vocal shouts.",
      "zh": "高速飞驰的 FM 摇摆低音、金属质感 Donk 弹拨与变速人声喊麦。"
    },
    "rhythm_features": {
      "en": "Breakneck 4/4 or syncopated 160 BPM hybrid beat driving furious club energy.",
      "zh": "在 160 BPM 极速下的四四拍与切分混血节拍，点燃狂暴俱乐部能量。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Speedbass signature kick character.",
        "zh": "Speedbass 风格代表性底鼓特征。"
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
      "tempo": "155–165 BPM"
    },
    "bass_pattern": {
      "en": "Hyperactive syncopated FM growl and pluck basslines switching tones every 2 beats.",
      "zh": "极度活跃的切分 FM 咆哮与弹拨贝斯，每两拍便切换一次音色质感。"
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
        "Design short, punchy bass plucks with instant envelope releases to avoid blur at 160 BPM",
        "Keep the kick punchy and under 40ms decay",
        "Use high-pass sidechain on master compressor to preserve punch"
      ],
      "zh": [
        "为贝斯设计瞬时释放的短促弹拨，避免在 160 BPM 下糊成一片",
        "底鼓衰减保持在 40ms 以内确保拳拳到肉",
        "母带压缩器开启高通侧链保留低频冲击力"
      ]
    },
    "representative_tracks": [
      {
        "title": "Speedbass Anthem",
        "artist": "Zero",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=Zero+Speedbass"
      },
      {
        "title": "Midnight in UK & Global",
        "artist": "Corrupt UK",
        "year": 2020,
        "link": "https://www.youtube.com/results?search_query=Corrupt+UK+Speedbass"
      },
      {
        "title": "Echoes of Speedbass",
        "artist": "Sammy Virji",
        "year": 2022,
        "link": "https://www.youtube.com/results?search_query=Sammy+Virji+Speedbass"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Holy Goof",
        "year": 2024,
        "link": "https://www.youtube.com/results?search_query=Holy+Goof+Speedbass"
      },
      {
        "title": "Essential Speedbass",
        "artist": "Darkzy",
        "year": 2026,
        "link": "https://www.youtube.com/results?search_query=Darkzy+Speedbass"
      }
    ],
    "representative_artists": [
      "Zero",
      "Corrupt UK",
      "Sammy Virji",
      "Holy Goof",
      "Darkzy"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 6,
      "brightness": 8,
      "harmonicComplexity": 2,
      "rhythmDensity": 9,
      "bassEnergy": 10,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "speedbass",
      "bpm": 145,
      "scale": "F minor",
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
          "instrument": "fm_lead",
          "steps": [
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
            1,
            1,
            0
          ],
          "pitch": [
            null,
            41,
            41,
            null,
            null,
            41,
            41,
            null,
            null,
            44,
            44,
            null,
            null,
            41,
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
  }
];
