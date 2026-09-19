import { Genre } from '../../types/genre';

export const POP_RNB_GENRES: Genre[] = [
  {
    "id": "traditional-pop",
    "name": "Traditional Pop",
    "aliases": [
      "传统流行",
      "经典声乐流行"
    ],
    "category": "Pop/R&B",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1940",
    "origin_decade": 1940,
    "origin_place": {
      "en": "USA",
      "zh": "美国"
    },
    "cultural_context": {
      "en": "The golden age of the Great American Songbook, defined by lush big band orchestrations, string arrangements, and charismatic crooner vocal delivery.",
      "zh": "美国流行金曲簿的黄金年代，以恢弘的爵士大乐队管弦编配、交响弦乐与魅力十足的低音吟唱者（Crooner）唱腔为标志。"
    },
    "bpm_range": "70–120 BPM",
    "default_bpm": 95,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–V–vi–IV",
      "I–vi–IV–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Big-Band Brass",
      "Symphonic Strings",
      "Grand Piano",
      "Upright Bass",
      "Crooner Vocals"
    ],
    "sound_design": {
      "en": "Full symphonic string sections, big band brass, grand acoustic piano, upright bass.",
      "zh": "全交响弦乐声部、大乐队铜管阵列、三角大钢琴与原声低音提琴。"
    },
    "rhythm_features": {
      "en": "Gentle, elegant 4/4 swing rhythm played with soft wire brushes on snare drums.",
      "zh": "典雅从容的四四拍摇摆节拍，由软钢丝鼓刷在军鼓上细腻勾勒。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Traditional Pop signature kick character.",
        "zh": "Traditional Pop 风格代表性底鼓特征。"
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
      "tempo": "70–120 BPM"
    },
    "bass_pattern": {
      "en": "Warm, resonant walking upright basslines supporting rich harmonic modulations.",
      "zh": "温暖醇厚的行进低音提琴线条，稳固托起丰富的和声离调与转调。"
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
        "Record lead vocals with a vintage tube condenser microphone (Telefunken U47 style)",
        "Arrange string sections with rich contrary motion to support the vocal line",
        "Allow the tempo to breathe naturally with emotional rubato passages"
      ],
      "zh": [
        "使用经典电子管大振膜话筒实录主唱，捕捉丝绒般的醇厚胸腔共鸣",
        "弦乐声部采用丰富的反向进行织体，烘托人声起伏",
        "在抒情高潮段落允许速度有细微的人性化弹性速度（Rubato）起伏"
      ]
    },
    "representative_tracks": [
      {
        "title": "Traditional Pop Anthem",
        "artist": "Frank Sinatra",
        "year": 1940,
        "link": "https://www.youtube.com/results?search_query=Frank+Sinatra+Traditional+Pop"
      },
      {
        "title": "Midnight in USA",
        "artist": "Tony Bennett",
        "year": 1942,
        "link": "https://www.youtube.com/results?search_query=Tony+Bennett+Traditional+Pop"
      },
      {
        "title": "Echoes of Traditional Pop",
        "artist": "Nat King Cole",
        "year": 1944,
        "link": "https://www.youtube.com/results?search_query=Nat+King+Cole+Traditional+Pop"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Ella Fitzgerald",
        "year": 1946,
        "link": "https://www.youtube.com/results?search_query=Ella+Fitzgerald+Traditional+Pop"
      },
      {
        "title": "Essential Traditional Pop",
        "artist": "Dean Martin",
        "year": 1948,
        "link": "https://www.youtube.com/results?search_query=Dean+Martin+Traditional+Pop"
      }
    ],
    "representative_artists": [
      "Frank Sinatra",
      "Tony Bennett",
      "Nat King Cole",
      "Ella Fitzgerald",
      "Dean Martin"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 9,
      "brightness": 5,
      "harmonicComplexity": 2,
      "rhythmDensity": 5,
      "bassEnergy": 3,
      "melodicFocus": 10
    },
    "sequencer_pattern": {
      "genre_id": "traditional-pop",
      "bpm": 115,
      "scale": "C major",
      "swing": 35,
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
            120,
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
          "instrument": "walking_upright",
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
            40,
            null,
            null,
            null,
            43,
            null,
            null,
            null,
            45,
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
          "instrument": "strings_lead",
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
          "instrument": "brass_section",
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
            76,
            null,
            null,
            null,
            72,
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
    "id": "synth-pop",
    "name": "Synth-pop",
    "aliases": [
      "合成器流行"
    ],
    "category": "Pop/R&B",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1977",
    "origin_decade": 1970,
    "origin_place": {
      "en": "UK & Germany",
      "zh": "英国与德国"
    },
    "cultural_context": {
      "en": "Pioneered in late-70s Europe, replacing traditional rock guitars with synthesizers and drum machines while crafting brilliant commercial pop hooks.",
      "zh": "70 年代末欧洲开创，用电子合成器与鼓机全面取代传统摇滚吉他，打造出传唱不衰的商业流行金曲。"
    },
    "bpm_range": "115–130 BPM",
    "default_bpm": 120,
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
      "Bright Analog Synth Lead",
      "Juno-60 Pads",
      "Minimoog Bass",
      "LinnDrum"
    ],
    "sound_design": {
      "en": "Roland Juno-60 pads, Minimoog bass, LinnDrum snares, bright analog synthesizer hooks.",
      "zh": "Roland Juno-60 温暖铺底、Minimoog 贝斯、LinnDrum 经典军鼓与明亮合成主音 Hook。"
    },
    "rhythm_features": {
      "en": "Driving, mechanical 4/4 rhythm sequenced on drum machines with snappy claps on 2 and 4.",
      "zh": "由电子鼓机精确量化的四四拍律动，2、4 拍上伴随清脆干练的拍手。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Synth-pop signature kick character.",
        "zh": "Synth-pop 风格代表性底鼓特征。"
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
      "tempo": "115–130 BPM"
    },
    "bass_pattern": {
      "en": "Sequenced 16th-note analog basslines running continuously with bright filter envelopes.",
      "zh": "连续音序化的十六分音符模拟合成贝斯，带有明朗开合的滤波包络。"
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
        "Sequence repetitive 16th-note basslines on an analog monosynth for driving momentum",
        "Layer classic LinnDrum or Simmons electronic drum sounds",
        "Write catchy, bittersweet vocal hooks in minor keys"
      ],
      "zh": [
        "在模拟单音合成器上编写重复的十六分音符低音线条，带来机械推进力",
        "叠入经典 LinnDrum 或 Simmons 标志性电子打击乐音色",
        "创作小调色彩、兼具甜美与伤感的过耳不忘副歌旋律"
      ]
    },
    "representative_tracks": [
      {
        "title": "Synth-pop Anthem",
        "artist": "Depeche Mode",
        "year": 1977,
        "link": "https://www.youtube.com/results?search_query=Depeche+Mode+Synth-pop"
      },
      {
        "title": "Midnight in UK & Germany",
        "artist": "New Order",
        "year": 1979,
        "link": "https://www.youtube.com/results?search_query=New+Order+Synth-pop"
      },
      {
        "title": "Echoes of Synth-pop",
        "artist": "Pet Shop Boys",
        "year": 1981,
        "link": "https://www.youtube.com/results?search_query=Pet+Shop+Boys+Synth-pop"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Eurythmics",
        "year": 1983,
        "link": "https://www.youtube.com/results?search_query=Eurythmics+Synth-pop"
      },
      {
        "title": "Essential Synth-pop",
        "artist": "The Human League",
        "year": 1985,
        "link": "https://www.youtube.com/results?search_query=The+Human+League+Synth-pop"
      }
    ],
    "representative_artists": [
      "Depeche Mode",
      "New Order",
      "Pet Shop Boys",
      "Eurythmics",
      "The Human League"
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
      "bassEnergy": 5,
      "melodicFocus": 10
    },
    "sequencer_pattern": {
      "genre_id": "synth-pop",
      "bpm": 120,
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
            120,
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
          "instrument": "analog_bass",
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
            45,
            45,
            45,
            45,
            45,
            45,
            45,
            45,
            48,
            48,
            48,
            48,
            45,
            45,
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
    "id": "disco",
    "name": "Disco",
    "aliases": [
      "迪斯科"
    ],
    "category": "Pop/R&B",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1970",
    "origin_decade": 1970,
    "origin_place": {
      "en": "New York & Philadelphia, USA",
      "zh": "美国纽约与费城"
    },
    "cultural_context": {
      "en": "Born in 1970s New York and Philadelphia clubs, defining dance music forever with four-on-the-floor kicks, soaring string sections, and Nile Rodgers funk guitar.",
      "zh": "70 年代诞生于纽约与费城俱乐部，以开创性的四四拍（Four-on-the-floor）底鼓、翱翔交响弦乐与 Nile Rodgers 放克吉他永远重塑了全球舞曲。"
    },
    "bpm_range": "115–130 BPM",
    "default_bpm": 120,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–VII–III",
      "I–vi–ii–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Soaring Disco Strings",
      "Chucking Funk Guitar",
      "Slap Bass",
      "Electric Piano",
      "Orchestral Brass"
    ],
    "sound_design": {
      "en": "Soaring orchestral disco strings, Nile Rodgers chucking guitar, slap bass, orchestral brass.",
      "zh": "翱翔起伏的迪斯科交响弦乐、Nile Rodgers 标志性切音放克吉他、Slap 电贝斯与嘹亮铜管。"
    },
    "rhythm_features": {
      "en": "The iconic four-on-the-floor kick with open hi-hats on every upbeat and syncopated snare claps.",
      "zh": "标志性四踩四底鼓，每一个反拍敲击清脆开镲，第 2、4 拍军鼓与拍手齐鸣。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Disco signature kick character.",
        "zh": "Disco 风格代表性底鼓特征。"
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
      "tempo": "115–130 BPM"
    },
    "bass_pattern": {
      "en": "Active, syncopated, walking octave basslines playing constant dancefloor grooves.",
      "zh": "极度活跃、富于切分、充满八度跳跃的行进贝斯，驱动舞池狂欢。"
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
        "Arrange authentic disco strings: fast ascending octave runs into sustained high notes",
        "Record electric guitar playing sixteenth-note muted funk rhythm (the Chic 'chank')",
        "Place open hi-hats consistently on the 'and' of every beat"
      ],
      "zh": [
        "编配正统迪斯科弦乐：极速八度爬升大滑弦随后切入高音长延音",
        "实录电吉他十六分音符闷音放克扫弦（Nile Rodgers 招牌技法）",
        "踩镲严格在每一拍的后半拍打开开镲（Open Hat）形成吸吐感"
      ]
    },
    "representative_tracks": [
      {
        "title": "Disco Anthem",
        "artist": "Donna Summer",
        "year": 1970,
        "link": "https://www.youtube.com/results?search_query=Donna+Summer+Disco"
      },
      {
        "title": "Midnight in New York & Philadelphia",
        "artist": "Bee Gees",
        "year": 1972,
        "link": "https://www.youtube.com/results?search_query=Bee+Gees+Disco"
      },
      {
        "title": "Echoes of Disco",
        "artist": "Chic (Nile Rodgers)",
        "year": 1974,
        "link": "https://www.youtube.com/results?search_query=Chic+(Nile+Rodgers)+Disco"
      },
      {
        "title": "Pulse & Groove",
        "artist": "ABBA",
        "year": 1976,
        "link": "https://www.youtube.com/results?search_query=ABBA+Disco"
      },
      {
        "title": "Essential Disco",
        "artist": "Earth, Wind & Fire",
        "year": 1978,
        "link": "https://www.youtube.com/results?search_query=Earth,+Wind+&+Fire+Disco"
      }
    ],
    "representative_artists": [
      "Donna Summer",
      "Bee Gees",
      "Chic (Nile Rodgers)",
      "ABBA",
      "Earth, Wind & Fire"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 6,
      "harmonicComplexity": 8,
      "rhythmDensity": 6,
      "bassEnergy": 7,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "disco",
      "bpm": 122,
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
            43,
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
            null
          ],
          "volume": 0.8,
          "pan": 0.1
        },
        {
          "track_id": "fx",
          "name": "FX / Sweep",
          "instrument": "horn_stab",
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
    "id": "eurodance",
    "name": "Eurodance",
    "aliases": [
      "欧陆舞曲"
    ],
    "category": "Pop/R&B",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1989",
    "origin_decade": 1980,
    "origin_place": {
      "en": "Europe",
      "zh": "欧洲"
    },
    "cultural_context": {
      "en": "Swept 1990s Europe and the world, combining 140 BPM four-on-the-floor beats with high-energy rap verses and anthemic female vocal choruses.",
      "zh": "90 年代横扫全球，将 140 BPM 四踩四狂飙节拍、高能说唱主歌与女性大主唱史诗级洗脑副歌完美结合。"
    },
    "bpm_range": "135–145 BPM",
    "default_bpm": 140,
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
      "JP-8000 Supersaw Lead",
      "Korg M1 Piano Stabs",
      "Offbeat Analog Bass",
      "Four-on-the-Floor Kick"
    ],
    "sound_design": {
      "en": "Korg M1 piano chords, Roland JP-8000 supersaws, energetic male rap, soaring female vocals.",
      "zh": "Korg M1 亮丽大钢琴切片、Roland JP-8000 狂飙 Supersaw、硬核男性说唱与高亢女性主唱。"
    },
    "rhythm_features": {
      "en": "Fast, high-octane 140 BPM four-on-the-floor kick with driving offbeat open hats.",
      "zh": "高速高能的 140 BPM 四踩四底鼓，伴随充满前冲推力的反拍开镲。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Eurodance signature kick character.",
        "zh": "Eurodance 风格代表性底鼓特征。"
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
      "en": "Punchy offbeat bassline or fast rolling 16th saw bass driving underneath piano chords.",
      "zh": "强劲反拍低音或快速滚动的十六分音符锯齿波贝斯，在钢琴和弦下方飞驰。"
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
        "Structure songs with an aggressive rap verse followed by a euphoric female sung hook",
        "Layer bright sampled M1 piano stabs across the quarter beats",
        "Keep the kick drum punchy and loud at 140 BPM"
      ],
      "zh": [
        "采用经典曲式编排：充满压迫感的说唱主歌无缝衔接极度明亮的唱诗般副歌",
        "在四分音符强拍上叠置明亮 Korg M1 采样钢琴切片",
        "让底鼓在 140 BPM 高速下保持短促结实与极高响度"
      ]
    },
    "representative_tracks": [
      {
        "title": "Eurodance Anthem",
        "artist": "2 Unlimited",
        "year": 1989,
        "link": "https://www.youtube.com/results?search_query=2+Unlimited+Eurodance"
      },
      {
        "title": "Midnight in Europe",
        "artist": "Snap!",
        "year": 1991,
        "link": "https://www.youtube.com/results?search_query=Snap!+Eurodance"
      },
      {
        "title": "Echoes of Eurodance",
        "artist": "Culture Beat",
        "year": 1993,
        "link": "https://www.youtube.com/results?search_query=Culture+Beat+Eurodance"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Corona",
        "year": 1995,
        "link": "https://www.youtube.com/results?search_query=Corona+Eurodance"
      },
      {
        "title": "Essential Eurodance",
        "artist": "Haddaway",
        "year": 1997,
        "link": "https://www.youtube.com/results?search_query=Haddaway+Eurodance"
      }
    ],
    "representative_artists": [
      "2 Unlimited",
      "Snap!",
      "Culture Beat",
      "Corona",
      "Haddaway"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 4,
      "brightness": 10,
      "harmonicComplexity": 8,
      "rhythmDensity": 8,
      "bassEnergy": 5,
      "melodicFocus": 10
    },
    "sequencer_pattern": {
      "genre_id": "eurodance",
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
          "instrument": "analog_bass",
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
          "instrument": "piano_lead",
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
    "id": "funk",
    "name": "Funk",
    "aliases": [
      "放克音乐"
    ],
    "category": "Pop/R&B",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1965",
    "origin_decade": 1960,
    "origin_place": {
      "en": "USA",
      "zh": "美国"
    },
    "cultural_context": {
      "en": "Pioneered by James Brown in the mid-1960s, shifting musical emphasis from melody and harmony to a complex, interlocking rhythmic groove anchored on 'The One'.",
      "zh": "由 James Brown 于 1960 年代中期奠定，将音乐重心从旋律和声转移到以第 1 拍重音（The One）为核心的交错复合节奏律动中。"
    },
    "bpm_range": "95–115 BPM",
    "default_bpm": 105,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–i",
      "i–IV–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Tight Brass Horn Stabs",
      "Slap Bass",
      "Clavinet",
      "Clean Rhythm Guitar",
      "The One Drum Groove"
    ],
    "sound_design": {
      "en": "Tight brass horn stabs, syncopated slap bass, clavinet through auto-wah, clean rhythm guitar.",
      "zh": "短促尖锐的铜管切片、切分 Slap 贝斯、过载自动哇音电古钢琴与清脆电吉他。"
    },
    "rhythm_features": {
      "en": "The One: massive downbeat impact on beat 1, followed by syncopated polyrhythmic funk pockets.",
      "zh": "“The One”哲学：第 1 拍绝对重击，随后展开千变万化切分交错的放克凹槽律动。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Funk signature kick character.",
        "zh": "Funk 风格代表性底鼓特征。"
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
      "tempo": "95–115 BPM"
    },
    "bass_pattern": {
      "en": "Virtuosic, highly syncopated slap, pop, and fingerstyle basslines that lead the dance groove.",
      "zh": "大师级击勾弦（Slap & Pop）与指弹贝斯，直接统领舞曲律动灵魂。"
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
        "Make beat 1 undeniable: every instrument locks together on the downbeat of bar 1",
        "Use muted, scratching 16th-note rhythm guitar chops ('skank')",
        "Layer horn section hits tightly together with minimal reverb"
      ],
      "zh": [
        "把第 1 拍做到无可撼动：所有乐器在第 1 小节首拍坚决合击",
        "节奏吉他采用十六分音符闷音轻微刮弦扫弦（Skank 技巧）",
        "铜管合奏切片保持高度干燥紧凑，避免大混响稀释冲击力"
      ]
    },
    "representative_tracks": [
      {
        "title": "Funk Anthem",
        "artist": "James Brown",
        "year": 1965,
        "link": "https://www.youtube.com/results?search_query=James+Brown+Funk"
      },
      {
        "title": "Midnight in USA",
        "artist": "Parliament-Funkadelic",
        "year": 1967,
        "link": "https://www.youtube.com/results?search_query=Parliament-Funkadelic+Funk"
      },
      {
        "title": "Echoes of Funk",
        "artist": "Sly and the Family Stone",
        "year": 1969,
        "link": "https://www.youtube.com/results?search_query=Sly+and+the+Family+Stone+Funk"
      },
      {
        "title": "Pulse & Groove",
        "artist": "The Meters",
        "year": 1971,
        "link": "https://www.youtube.com/results?search_query=The+Meters+Funk"
      },
      {
        "title": "Essential Funk",
        "artist": "Kool & The Gang",
        "year": 1973,
        "link": "https://www.youtube.com/results?search_query=Kool+&+The+Gang+Funk"
      }
    ],
    "representative_artists": [
      "James Brown",
      "Parliament-Funkadelic",
      "Sly and the Family Stone",
      "The Meters",
      "Kool & The Gang"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 10,
      "brightness": 7,
      "harmonicComplexity": 8,
      "rhythmDensity": 8,
      "bassEnergy": 7,
      "melodicFocus": 9
    },
    "sequencer_pattern": {
      "genre_id": "funk",
      "bpm": 108,
      "scale": "E minor",
      "swing": 25,
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
            1,
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
            120,
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
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            1
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            65,
            0,
            0,
            0,
            0,
            115,
            0,
            0,
            65
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
          "instrument": "slap_bass",
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
            1,
            0,
            0,
            0,
            0,
            1,
            0
          ],
          "pitch": [
            40,
            null,
            null,
            null,
            null,
            null,
            43,
            null,
            null,
            40,
            null,
            null,
            null,
            null,
            45,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "guitar_lead",
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
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "brass_section",
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
          "instrument": "horn_stab",
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
    "id": "soul",
    "name": "Soul",
    "aliases": [
      "灵魂乐"
    ],
    "category": "Pop/R&B",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1955",
    "origin_decade": 1950,
    "origin_place": {
      "en": "USA",
      "zh": "美国"
    },
    "cultural_context": {
      "en": "Born out of African-American gospel music and rhythm and blues in the 1950s, defined by passionate, melismatic vocal delivery and deep emotional authenticity.",
      "zh": "1950 年代由非裔美国福音音乐与节奏布鲁斯融合诞生，以深情充沛的真挚花腔唱腔与触及灵魂的情感震撼世界。"
    },
    "bpm_range": "70–115 BPM",
    "default_bpm": 95,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–vi–ii–V",
      "ii–V–I"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Hammond B3 Organ",
      "Memphis Horn Section",
      "Electric Bass",
      "Electric Guitar",
      "Drum Kit"
    ],
    "sound_design": {
      "en": "Warm Hammond B3 organ with Leslie speaker, real horn section, electric guitar, upright/Fender bass.",
      "zh": "连接莱斯利旋转扬声器的 Hammond B3 电子管风琴、真实铜管组、电吉他与贝斯。"
    },
    "rhythm_features": {
      "en": "Soulful 4/4 or 6/8 ballad groove with prominent backbeat tambourine and expressive drums.",
      "zh": "深情 4/4 或 6/8 拍慢板律动，伴随突出的后拍手摇铃与极具呼吸感的鼓组。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Soul signature kick character.",
        "zh": "Soul 风格代表性底鼓特征。"
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
      "tempo": "70–115 BPM"
    },
    "bass_pattern": {
      "en": "Deep, lyrical electric basslines that melodically interact with the lead vocal phrases.",
      "zh": "深沉优美的旋律化电贝斯线条，与主唱唱段如同知己般交织唱和。"
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
        "Capture vocal performances without pitch correction to preserve raw emotional vibrato",
        "Use a real Leslie speaker simulator on the Hammond organ chords",
        "Place tambourine hits firmly on beats 2 and 4 alongside the snare"
      ],
      "zh": [
        "完全杜绝人声音高修正插件，完整保留真实颤音与情感裂纹",
        "为 Hammond 风琴和弦加载真实的莱斯利旋转箱体立体声漫游效果",
        "在第 2、4 拍军鼓敲击瞬间精准叠加现场手摇铃提升亮度"
      ]
    },
    "representative_tracks": [
      {
        "title": "Soul Anthem",
        "artist": "Aretha Franklin",
        "year": 1955,
        "link": "https://www.youtube.com/results?search_query=Aretha+Franklin+Soul"
      },
      {
        "title": "Midnight in USA",
        "artist": "Otis Redding",
        "year": 1957,
        "link": "https://www.youtube.com/results?search_query=Otis+Redding+Soul"
      },
      {
        "title": "Echoes of Soul",
        "artist": "Ray Charles",
        "year": 1959,
        "link": "https://www.youtube.com/results?search_query=Ray+Charles+Soul"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Sam Cooke",
        "year": 1961,
        "link": "https://www.youtube.com/results?search_query=Sam+Cooke+Soul"
      },
      {
        "title": "Essential Soul",
        "artist": "Al Green",
        "year": 1963,
        "link": "https://www.youtube.com/results?search_query=Al+Green+Soul"
      }
    ],
    "representative_artists": [
      "Aretha Franklin",
      "Otis Redding",
      "Ray Charles",
      "Sam Cooke",
      "Al Green"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 9,
      "brightness": 5,
      "harmonicComplexity": 8,
      "rhythmDensity": 5,
      "bassEnergy": 7,
      "melodicFocus": 10
    },
    "sequencer_pattern": {
      "genre_id": "soul",
      "bpm": 95,
      "scale": "G major",
      "swing": 30,
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
          "instrument": "acoustic_snare",
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
          "instrument": "finger_bass",
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
            47,
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
          "instrument": "m1_organ",
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
          "instrument": "organ_lead",
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
            83,
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
          "instrument": "horn_stab",
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
    "id": "neo-soul",
    "name": "Neo-Soul",
    "aliases": [
      "新灵魂乐"
    ],
    "category": "Pop/R&B",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1995",
    "origin_decade": 1990,
    "origin_place": {
      "en": "USA",
      "zh": "美国"
    },
    "cultural_context": {
      "en": "Pioneered in mid-90s by The Soulquarians (D'Angelo, J Dilla, Questlove), merging classic 70s soul with hip-hop beats, jazz chords, and deep groove pocket.",
      "zh": "由 Soulquarians 艺术家团体（D'Angelo、J Dilla、Questlove）在 90 年代中期开创，将 70 年代经典灵魂乐与嘻哈鼓点、爵士九和弦及深邃后倾律动交织。"
    },
    "bpm_range": "75–95 BPM",
    "default_bpm": 85,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "ii–V–I",
      "iii–vi–ii–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Fender Rhodes",
      "Warm Fingerstyle Bass",
      "Layered Plucked Synth",
      "Pocket Drum Kit",
      "Vocal Layers"
    ],
    "sound_design": {
      "en": "Fender Rhodes electric piano, unquantized live drums, warm bass guitar, subtle vocal layers.",
      "zh": "Fender Rhodes 电钢琴、未量化后倾现场原声鼓、温暖电贝斯与多轨和声人声。"
    },
    "rhythm_features": {
      "en": "Signature drunken, lazy, behind-the-beat swing (the D'Angelo / Questlove pocket).",
      "zh": "标志性微醺拖沓、深陷拍子后方的懒散摇摆律动（极具辨识度的 Questlove 节拍口袋）。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Neo-Soul signature kick character.",
        "zh": "Neo-Soul 风格代表性底鼓特征。"
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
      "tempo": "75–95 BPM"
    },
    "bass_pattern": {
      "en": "Warm, fat, fingerstyle basslines played slightly behind the beat with lush low-mids.",
      "zh": "温暖饱满的指弹电贝斯线条，稍稍滞后于节拍点演奏，低频醇厚。"
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
        "Shift the snare drum 10-25 milliseconds later than the grid for that iconic lazy pocket",
        "Stack minor 9th and major 9th chords on a warm Rhodes electric piano",
        "Layer 4-8 tracks of tight vocal harmonies with subtle stereo panning"
      ],
      "zh": [
        "将军鼓比标准量化网格刻意延后 10-25 毫秒营造经典后倾拖泥带水感",
        "在温暖 Rhodes 电钢琴上弹奏延展的小九与大九和弦",
        "叠录 4-8 轨极其严谨的人声和声并做细腻立体声展开"
      ]
    },
    "representative_tracks": [
      {
        "title": "Neo-Soul Anthem",
        "artist": "D'Angelo",
        "year": 1995,
        "link": "https://www.youtube.com/results?search_query=D'Angelo+Neo-Soul"
      },
      {
        "title": "Midnight in USA",
        "artist": "Erykah Badu",
        "year": 1997,
        "link": "https://www.youtube.com/results?search_query=Erykah+Badu+Neo-Soul"
      },
      {
        "title": "Echoes of Neo-Soul",
        "artist": "Lauryn Hill",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=Lauryn+Hill+Neo-Soul"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Maxwell",
        "year": 2001,
        "link": "https://www.youtube.com/results?search_query=Maxwell+Neo-Soul"
      },
      {
        "title": "Essential Neo-Soul",
        "artist": "Jill Scott",
        "year": 2003,
        "link": "https://www.youtube.com/results?search_query=Jill+Scott+Neo-Soul"
      }
    ],
    "representative_artists": [
      "D'Angelo",
      "Erykah Badu",
      "Lauryn Hill",
      "Maxwell",
      "Jill Scott"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 10,
      "brightness": 5,
      "harmonicComplexity": 10,
      "rhythmDensity": 4,
      "bassEnergy": 7,
      "melodicFocus": 10
    },
    "sequencer_pattern": {
      "genre_id": "neo-soul",
      "bpm": 84,
      "scale": "F minor",
      "swing": 45,
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
          "instrument": "finger_bass",
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
            44,
            null,
            null,
            null,
            41,
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
    "id": "contemporary-rnb",
    "name": "Contemporary R&B",
    "aliases": [
      "当代节奏布鲁斯"
    ],
    "category": "Pop/R&B",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1980",
    "origin_decade": 1980,
    "origin_place": {
      "en": "USA",
      "zh": "美国"
    },
    "cultural_context": {
      "en": "Evolved from soul and disco in the 1980s, combining electronic drum programming (TR-808), melismatic vocal virtuosity, and slick modern pop production.",
      "zh": "80 年代脱胎于灵魂乐与迪斯科，将电子鼓机编曲（TR-808）、高超花腔转音与现代精致流行舞曲制作融为一体。"
    },
    "bpm_range": "90–120 BPM",
    "default_bpm": 100,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–iv–v",
      "ii–V–I"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Polished Synth Lead",
      "Digital Synth Pads",
      "808 Sub Bass",
      "Rhodes Chords",
      "Trap-Style Claps & Kicks"
    ],
    "sound_design": {
      "en": "Roland TR-808 kicks and claps, lush digital synth pads, polished melismatic vocals.",
      "zh": "Roland TR-808 弹跳底鼓与拍手、精致现代数字铺底与精修花腔人声。"
    },
    "rhythm_features": {
      "en": "Bouncy, syncopated R&B groove with crisp electronic claps on beats 2 and 4.",
      "zh": "充满弹性跳跃感的切分 R&B 律动，在 2、4 拍击打清脆现代合成拍手。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Contemporary R&B signature kick character.",
        "zh": "Contemporary R&B 风格代表性底鼓特征。"
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
      "tempo": "90–120 BPM"
    },
    "bass_pattern": {
      "en": "Smooth, rounded synth bass or deep 808 sub driving modern pop arrangements.",
      "zh": "圆润顺滑的合成低音或深沉 808 超低频，稳健推动现代流行曲式。"
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
        "Tune and tighten lead vocal tracks with modern pitch correction software while keeping expressive runs",
        "Layer layered background vocal stacks (lead, harmony high, harmony low)",
        "Sidechain bass gently to the kick drum"
      ],
      "zh": [
        "使用现代修音软件对主唱音轨进行微调，同时完整保留华丽花腔转音",
        "多层堆叠背景和声体系（主声部、高三度、低八度）",
        "贝斯对底鼓进行温和侧链避让保持整体平滑通透"
      ]
    },
    "representative_tracks": [
      {
        "title": "Contemporary R&B Anthem",
        "artist": "Beyoncé",
        "year": 1980,
        "link": "https://www.youtube.com/results?search_query=Beyoncé+Contemporary+R&B"
      },
      {
        "title": "Midnight in USA",
        "artist": "Usher",
        "year": 1982,
        "link": "https://www.youtube.com/results?search_query=Usher+Contemporary+R&B"
      },
      {
        "title": "Echoes of Contemporary R&B",
        "artist": "Whitney Houston",
        "year": 1984,
        "link": "https://www.youtube.com/results?search_query=Whitney+Houston+Contemporary+R&B"
      },
      {
        "title": "Pulse & Groove",
        "artist": "R. Kelly",
        "year": 1986,
        "link": "https://www.youtube.com/results?search_query=R.+Kelly+Contemporary+R&B"
      },
      {
        "title": "Essential Contemporary R&B",
        "artist": "Bruno Mars",
        "year": 1988,
        "link": "https://www.youtube.com/results?search_query=Bruno+Mars+Contemporary+R&B"
      }
    ],
    "representative_artists": [
      "Beyoncé",
      "Usher",
      "Whitney Houston",
      "R. Kelly",
      "Bruno Mars"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 8,
      "brightness": 5,
      "harmonicComplexity": 6,
      "rhythmDensity": 6,
      "bassEnergy": 9,
      "melodicFocus": 10
    },
    "sequencer_pattern": {
      "genre_id": "contemporary-rnb",
      "bpm": 98,
      "scale": "C minor",
      "swing": 20,
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
            105,
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
            39,
            null,
            null,
            null,
            36,
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
    "id": "alternative-rnb",
    "name": "Alternative R&B",
    "aliases": [
      "另类节奏布鲁斯",
      "暗黑 R&B"
    ],
    "category": "Pop/R&B",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2010",
    "origin_decade": 2010,
    "origin_place": {
      "en": "USA & Canada",
      "zh": "美国与加拿大"
    },
    "cultural_context": {
      "en": "Emerged around 2011 led by Frank Ocean and The Weeknd, trading glossy pop R&B for moody atmospheres, pitch-shifted vocals, druggy synths, and indie songwriting.",
      "zh": "2011 年由 Frank Ocean 与 The Weeknd 引爆，舍弃甜美流行套路，换以幽暗电影氛围、变调人声、微醺迷幻合成器与自省独立创作。"
    },
    "bpm_range": "110–135 BPM",
    "default_bpm": 120,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–iv–i",
      "vi–IV–I–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Filtered Ambient Pads",
      "Murky Sub Bass",
      "Muted Plucked Synth",
      "Pitch-Shifted Vocal Chops"
    ],
    "sound_design": {
      "en": "Filtered ambient synth pads, pitch-shifted vocal chops, murky sub-bass, underwater reverbs.",
      "zh": "经过深低通滤波的氛围铺底、变速变调人声微粒、深沉 Sub 贝斯与水下空间混响。"
    },
    "rhythm_features": {
      "en": "Spacious, slow-burning half-time beats with rolling hi-hats and muffled snares.",
      "zh": "开阔深邃、慢火慢炖的半速节拍，伴随细致踩镲滚奏与沉闷低调军鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Alternative R&B signature kick character.",
        "zh": "Alternative R&B 风格代表性底鼓特征。"
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
      "tempo": "110–135 BPM"
    },
    "bass_pattern": {
      "en": "Deep, rumbling 808 subs or warm Reese bass humming under dark minor progressions.",
      "zh": "深邃轰鸣的 808 超低频或在暗黑小调和弦下方低徊沉沦的温暖 Reese 贝斯。"
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
        "Apply a low-pass filter to the entire master drum bus to create an intimate, underwater sound",
        "Pitch-shift vocal doubles down 12 semitones with formant preservation for dark undertones",
        "Drench instruments in dark plate reverbs"
      ],
      "zh": [
        "在鼓组总线上挂载低通滤波器营造亲密耳语般的水下沉浸听感",
        "将副人声音轨向下移调 12 个半音（低八度）并保留共振峰增添暗黑色彩",
        "将乐器浸润在暗黑板式混响中制造迷离空间"
      ]
    },
    "representative_tracks": [
      {
        "title": "Alternative R&B Anthem",
        "artist": "Frank Ocean",
        "year": 2010,
        "link": "https://www.youtube.com/results?search_query=Frank+Ocean+Alternative+R&B"
      },
      {
        "title": "Midnight in USA & Canada",
        "artist": "The Weeknd",
        "year": 2012,
        "link": "https://www.youtube.com/results?search_query=The+Weeknd+Alternative+R&B"
      },
      {
        "title": "Echoes of Alternative R&B",
        "artist": "SZA",
        "year": 2014,
        "link": "https://www.youtube.com/results?search_query=SZA+Alternative+R&B"
      },
      {
        "title": "Pulse & Groove",
        "artist": "FKA twigs",
        "year": 2016,
        "link": "https://www.youtube.com/results?search_query=FKA+twigs+Alternative+R&B"
      },
      {
        "title": "Essential Alternative R&B",
        "artist": "Jhené Aiko",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=Jhené+Aiko+Alternative+R&B"
      }
    ],
    "representative_artists": [
      "Frank Ocean",
      "The Weeknd",
      "SZA",
      "FKA twigs",
      "Jhené Aiko"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 6,
      "brightness": 4,
      "harmonicComplexity": 6,
      "rhythmDensity": 3,
      "bassEnergy": 9,
      "melodicFocus": 9
    },
    "sequencer_pattern": {
      "genre_id": "alternative-rnb",
      "bpm": 90,
      "scale": "E minor",
      "swing": 15,
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
            40,
            null,
            null,
            null,
            null,
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
          "instrument": "reverse_cymbal",
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
    "id": "motown",
    "name": "Motown",
    "aliases": [
      "摩城音乐",
      "底特律灵魂乐"
    ],
    "category": "Pop/R&B",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1959",
    "origin_decade": 1950,
    "origin_place": {
      "en": "Detroit, Michigan, USA",
      "zh": "美国密歇根州底特律"
    },
    "cultural_context": {
      "en": "Founded by Berry Gordy in Detroit ('Hitsville U.S.A.'), creating an iconic crossover sound with driving tambourines, melodic basslines, and gospel pop harmonies.",
      "zh": "由 Berry Gordy 在底特律创立，以极具推进力的手摇铃反拍、James Jamerson 的传世旋律贝斯与福音流行和声书写了辉煌奇迹。"
    },
    "bpm_range": "115–135 BPM",
    "default_bpm": 125,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–IV–V–IV",
      "I–vi–ii–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Acoustic Piano",
      "Vibraphone",
      "Fender Precision Bass",
      "Tambourine & Drums",
      "Gospel Pop Harmonies"
    ],
    "sound_design": {
      "en": "Fender Precision Bass through direct-box, driving tambourines, acoustic piano, vibraphone.",
      "zh": "Fender Precision 电贝斯直通（DI）录音、驱动性手摇铃、原声钢琴与颤音琴。"
    },
    "rhythm_features": {
      "en": "Incessant four-beat tambourine pulse with driving 4/4 snare claps and foot stomps.",
      "zh": "永不停歇的四拍连贯手摇铃脉冲，配合极富推进力的四四拍军鼓拍手。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Motown signature kick character.",
        "zh": "Motown 风格代表性底鼓特征。"
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
      "tempo": "115–135 BPM"
    },
    "bass_pattern": {
      "en": "Legendary James Jamerson one-finger 'The Hook' syncopated, walking, melodic basslines.",
      "zh": "传奇乐手 James Jamerson 单指演奏的极富表现力、切分行进且极具歌唱性的神级贝斯线条。"
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
        "Use flatwound bass strings on a Fender P-bass and record direct into a vintage tube preamp",
        "Layer a bright tambourine on every beat (beats 1, 2, 3, 4) to propel the tempo",
        "Double the bassline with a muted acoustic baritone guitar"
      ],
      "zh": [
        "在芬达 P-bass 上使用纯平卷琴弦（Flatwound）并直入复古电子管前级放大",
        "在每一拍（1、2、3、4拍）均匀叠加清亮手摇铃敲击以推动步频",
        "用弱音原声男低音吉他齐奏贝斯线条勾勒清晰轮廓"
      ]
    },
    "representative_tracks": [
      {
        "title": "Motown Anthem",
        "artist": "Stevie Wonder",
        "year": 1959,
        "link": "https://www.youtube.com/results?search_query=Stevie+Wonder+Motown"
      },
      {
        "title": "Midnight in Detroit",
        "artist": "Marvin Gaye",
        "year": 1961,
        "link": "https://www.youtube.com/results?search_query=Marvin+Gaye+Motown"
      },
      {
        "title": "Echoes of Motown",
        "artist": "The Supremes",
        "year": 1963,
        "link": "https://www.youtube.com/results?search_query=The+Supremes+Motown"
      },
      {
        "title": "Pulse & Groove",
        "artist": "The Temptations",
        "year": 1965,
        "link": "https://www.youtube.com/results?search_query=The+Temptations+Motown"
      },
      {
        "title": "Essential Motown",
        "artist": "The Jackson 5",
        "year": 1967,
        "link": "https://www.youtube.com/results?search_query=The+Jackson+5+Motown"
      }
    ],
    "representative_artists": [
      "Stevie Wonder",
      "Marvin Gaye",
      "The Supremes",
      "The Temptations",
      "The Jackson 5"
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
      "rhythmDensity": 8,
      "bassEnergy": 3,
      "melodicFocus": 9
    },
    "sequencer_pattern": {
      "genre_id": "motown",
      "bpm": 125,
      "scale": "G major",
      "swing": 15,
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
          "velocity": [
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
          "instrument": "acoustic_snare",
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
            85,
            0,
            70,
            0,
            85,
            0,
            70,
            0,
            85,
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
            43,
            null,
            null,
            43,
            null,
            null,
            47,
            null,
            43,
            null,
            null,
            43,
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
    "id": "city-pop",
    "name": "City Pop",
    "aliases": [
      "城市流行"
    ],
    "category": "Pop/R&B",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1975",
    "origin_decade": 1970,
    "origin_place": {
      "en": "Tokyo, Japan",
      "zh": "日本东京"
    },
    "cultural_context": {
      "en": "Boomed during Japan's 1970s/80s economic bubble, celebrating sophisticated metropolitan lifestyles with a lush fusion of funk, disco, soft rock, and jazz chords.",
      "zh": "繁盛于日本 70、80 年代经济黄金期，融合放克、迪斯科、轻摇滚与精致爵士和弦，歌唱大都会繁华都市夜生活与海滨浪漫。"
    },
    "bpm_range": "110–125 BPM",
    "default_bpm": 118,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "ii–V–I",
      "I–vi–ii–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Lush Brass Horns",
      "Roland Rhodes",
      "Slap Bass",
      "Tight Studio Drums",
      "Funk Guitar"
    ],
    "sound_design": {
      "en": "Sparkling Roland Rhodes electric piano, lush brass horns, slap bass, tight studio drums.",
      "zh": "晶莹明澈的电钢琴、华丽铜管阵列、放克 Slap 贝斯与精细棚录原声鼓。"
    },
    "rhythm_features": {
      "en": "Breezy, sophisticated 4/4 disco-funk groove with syncopated open hats and crisp snare.",
      "zh": "微风拂面般轻快考究的四四拍迪斯科放克律动，反拍开镲清脆利落。"
    },
    "drum_pattern": {
      "kick": {
        "en": "City Pop signature kick character.",
        "zh": "City Pop 风格代表性底鼓特征。"
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
      "tempo": "110–125 BPM"
    },
    "bass_pattern": {
      "en": "Virtuosic slap and pop funk basslines weaving through complex jazz chord transitions.",
      "zh": "大师级 Slap & Pop 放克电贝斯线条，游刃有余穿行于复杂爵士和弦过门之中。"
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
        "Utilize the 'Royal Road' chord progression (IVmaj7 - V7 - iiim7 - vim7) with sophisticated extensions",
        "Record live brass horn sections with wide stereo panning",
        "Use clean, compressed chorus guitars playing funky 16th-note chucks"
      ],
      "zh": [
        "使用“王道进行”（IVmaj7 - V7 - iiim7 - vim7）并加入丰润扩展音",
        "实录现场铜管大编制声部并做华丽立体声左右拉宽",
        "电吉他挂载通透合唱效果器弹奏跳跃轻盈的十六分音符放克切音"
      ]
    },
    "representative_tracks": [
      {
        "title": "City Pop Anthem",
        "artist": "Tatsuro Yamashita",
        "year": 1975,
        "link": "https://www.youtube.com/results?search_query=Tatsuro+Yamashita+City+Pop"
      },
      {
        "title": "Midnight in Tokyo",
        "artist": "Mariya Takeuchi",
        "year": 1977,
        "link": "https://www.youtube.com/results?search_query=Mariya+Takeuchi+City+Pop"
      },
      {
        "title": "Echoes of City Pop",
        "artist": "Miki Matsubara",
        "year": 1979,
        "link": "https://www.youtube.com/results?search_query=Miki+Matsubara+City+Pop"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Toshiki Kadomatsu",
        "year": 1981,
        "link": "https://www.youtube.com/results?search_query=Toshiki+Kadomatsu+City+Pop"
      },
      {
        "title": "Essential City Pop",
        "artist": "Anri",
        "year": 1983,
        "link": "https://www.youtube.com/results?search_query=Anri+City+Pop"
      }
    ],
    "representative_artists": [
      "Tatsuro Yamashita",
      "Mariya Takeuchi",
      "Miki Matsubara",
      "Toshiki Kadomatsu",
      "Anri"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 9,
      "harmonicComplexity": 10,
      "rhythmDensity": 6,
      "bassEnergy": 7,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "city-pop",
      "bpm": 120,
      "scale": "D major",
      "swing": 15,
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
            38,
            null,
            null,
            38,
            null,
            null,
            42,
            null,
            38,
            null,
            null,
            38,
            null,
            null,
            45,
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
            62,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            66,
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
          "instrument": "brass_section",
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
            78,
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
    "id": "k-pop",
    "name": "K-Pop",
    "aliases": [
      "韩国流行音乐"
    ],
    "category": "Pop/R&B",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1992",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Seoul, South Korea",
      "zh": "韩国首尔"
    },
    "cultural_context": {
      "en": "A globally dominant multi-genre spectacle originating from Seoul, characterized by hyper-polished production, sudden genre shifts within a single song, and choreography.",
      "zh": "从首尔走向全球的多元流派盛宴，以千锤百炼的极致工业制作、一首歌内戏剧性的跨流派突变与高能编舞著称。"
    },
    "bpm_range": "110–135 BPM",
    "default_bpm": 125,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "vi–IV–I–V",
      "I–V–vi–IV"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Modern Synth Lead Stacks",
      "Supersaw Chords",
      "Sub Bass",
      "Punchy Modern Drums",
      "Trap 808s"
    ],
    "sound_design": {
      "en": "High-budget modern synthesizer stacks, processed vocal hooks, trap 808s, punchy modern drums.",
      "zh": "顶尖现代合成器音色堆叠、精细打磨人声 Hook、Trap 808 低音与现代高冲击力鼓组。"
    },
    "rhythm_features": {
      "en": "Dynamic rhythm switching frequently between four-on-the-floor house, half-time trap, and EDM drops.",
      "zh": "极度动态的节奏变换，在四踩四浩室、半速 Trap 与电子爆发之间自如穿梭切换。"
    },
    "drum_pattern": {
      "kick": {
        "en": "K-Pop signature kick character.",
        "zh": "K-Pop 风格代表性底鼓特征。"
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
      "tempo": "110–135 BPM"
    },
    "bass_pattern": {
      "en": "Massive modern synth basslines shifting seamlessly from FM plucks to sliding 808s.",
      "zh": "震撼现代合成贝斯线条，在清脆 FM 弹拨与下沉滑音 808 之间无缝流转。"
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
        "Introduce distinct musical genres in different sections (e.g. house verse, trap pre-chorus, rock drop)",
        "Process vocal chops with intense pitch and formant manipulation",
        "Maximize master loudness while maintaining crisp transient punch"
      ],
      "zh": [
        "在不同段落大胆拼接截然不同的音乐风格（如浩室主歌+Trap过渡+摇滚爆发）",
        "对人声切片施加极致的音高与共振峰调制打造未来感",
        "在确保瞬态清脆有力的前提下将母带响度推向商业发行极致"
      ]
    },
    "representative_tracks": [
      {
        "title": "K-Pop Anthem",
        "artist": "BTS",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=BTS+K-Pop"
      },
      {
        "title": "Midnight in Seoul",
        "artist": "BLACKPINK",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=BLACKPINK+K-Pop"
      },
      {
        "title": "Echoes of K-Pop",
        "artist": "NewJeans",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=NewJeans+K-Pop"
      },
      {
        "title": "Pulse & Groove",
        "artist": "EXO",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=EXO+K-Pop"
      },
      {
        "title": "Essential K-Pop",
        "artist": "TWICE",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=TWICE+K-Pop"
      }
    ],
    "representative_artists": [
      "BTS",
      "BLACKPINK",
      "NewJeans",
      "EXO",
      "TWICE"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 4,
      "brightness": 7,
      "harmonicComplexity": 4,
      "rhythmDensity": 5,
      "bassEnergy": 9,
      "melodicFocus": 10
    },
    "sequencer_pattern": {
      "genre_id": "k-pop",
      "bpm": 126,
      "scale": "A minor",
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
    "id": "j-pop",
    "name": "J-Pop",
    "aliases": [
      "日本流行音乐"
    ],
    "category": "Pop/R&B",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1988",
    "origin_decade": 1980,
    "origin_place": {
      "en": "Tokyo, Japan",
      "zh": "日本东京"
    },
    "cultural_context": {
      "en": "Evolved from Kayōkyoku and City Pop, famous for rapid chord modulations, intricate melodic lines, anime theme power, and complex emotional songwriting.",
      "zh": "脱胎于昭和歌谣曲与 City Pop，以高速和弦调性转调、精细跌宕的优美旋律线、动漫主题曲感染力与宏大和声著称。"
    },
    "bpm_range": "120–170 BPM",
    "default_bpm": 145,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "IV–V–iii–vi",
      "I–V–vi–IV"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Acoustic Grand Piano",
      "String Section",
      "Bright Distorted Guitar",
      "Melodic Electric Bass",
      "Punchy Electronic Drums"
    ],
    "sound_design": {
      "en": "Acoustic grand piano fast runs, strings, bright distorted guitars, punchy electronic drums.",
      "zh": "三角大钢琴高速跑音、交响弦乐合奏、明亮失真吉他与清脆电子鼓组。"
    },
    "rhythm_features": {
      "en": "High-speed 140-165 BPM driving rock-pop beats with tight snare accents and rapid hi-hats.",
      "zh": "时速 140-165 BPM 的高速推进摇滚流行节拍，伴随紧凑军鼓与飞驰踩镲。"
    },
    "drum_pattern": {
      "kick": {
        "en": "J-Pop signature kick character.",
        "zh": "J-Pop 风格代表性底鼓特征。"
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
      "tempo": "120–170 BPM"
    },
    "bass_pattern": {
      "en": "Hyperactive melodic walking basslines weaving between fast jazz chord changes.",
      "zh": "极度活跃、兼具歌唱性的旋律行进贝斯，穿梭在极速爵士和声转换中。"
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
        "Compose with the Royal Road chord progression and frequent half-step key changes",
        "Write hyper-melodic basslines that act as a second lead instrument",
        "Layer sweeping orchestral strings with fast rock drum kits"
      ],
      "zh": [
        "巧妙运用王道和弦进行并在副歌前加入半音突然转调（Key Change）",
        "编写高度旋律化的贝斯线条，使其宛如第二主旋律般歌唱",
        "将恢弘交响弦乐与高速摇滚架子鼓精密贴合叠层"
      ]
    },
    "representative_tracks": [
      {
        "title": "J-Pop Anthem",
        "artist": "Hikaru Utada",
        "year": 1988,
        "link": "https://www.youtube.com/results?search_query=Hikaru+Utada+J-Pop"
      },
      {
        "title": "Midnight in Tokyo",
        "artist": "YOASOBI",
        "year": 1990,
        "link": "https://www.youtube.com/results?search_query=YOASOBI+J-Pop"
      },
      {
        "title": "Echoes of J-Pop",
        "artist": "Kenshi Yonezu",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=Kenshi+Yonezu+J-Pop"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Ayumi Hamasaki",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=Ayumi+Hamasaki+J-Pop"
      },
      {
        "title": "Essential J-Pop",
        "artist": "Official HIGE DANDISM",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Official+HIGE+DANDISM+J-Pop"
      }
    ],
    "representative_artists": [
      "Hikaru Utada",
      "YOASOBI",
      "Kenshi Yonezu",
      "Ayumi Hamasaki",
      "Official HIGE DANDISM"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 5,
      "brightness": 10,
      "harmonicComplexity": 4,
      "rhythmDensity": 10,
      "bassEnergy": 3,
      "melodicFocus": 10
    },
    "sequencer_pattern": {
      "genre_id": "j-pop",
      "bpm": 132,
      "scale": "F major",
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
          "velocity": [
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
            1,
            1,
            1,
            1,
            1,
            2,
            1,
            1,
            1,
            1,
            1,
            1,
            1,
            2,
            1
          ],
          "velocity": [
            90,
            50,
            70,
            50,
            90,
            50,
            90,
            50,
            90,
            50,
            70,
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
            41,
            null,
            null,
            41,
            null,
            null,
            45,
            null,
            41,
            null,
            null,
            41,
            null,
            null,
            48,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "strings_lead",
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
            69,
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
            81,
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
