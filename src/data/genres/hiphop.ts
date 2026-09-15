import { Genre } from '../../types/genre';

export const HIPHOP_GENRES: Genre[] = [
  {
    "id": "old-school-hip-hop",
    "name": "Old School Hip Hop",
    "aliases": [
      "老派嘻哈"
    ],
    "category": "Hip Hop",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1973",
    "origin_decade": 1970,
    "origin_place": {
      "en": "Bronx, New York, USA",
      "zh": "美国纽约布朗克斯"
    },
    "cultural_context": {
      "en": "Born at Bronx block parties when DJ Kool Herc isolated drum breaks using two turntables, inspiring emcees to rap rhyming party poetry.",
      "zh": "诞生于纽约布朗克斯街头街区派对，DJ Kool Herc 用双黑胶唱机循环延长鼓循环碎拍，催生了 MC 押韵说唱艺术。"
    },
    "bpm_range": "95–115 BPM",
    "default_bpm": 105,
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
      "TR-808 Drum Machine",
      "Turntables & Vinyl Scratches",
      "Funk Bass Guitar",
      "Square-Wave Synth Riff",
      "Analog Synth Pad",
      "Vocal Chants"
    ],
    "sound_design": {
      "en": "Two turntables, disco/funk drum breaks, vinyl scratches, Roland TR-808, simple vocal chants.",
      "zh": "双唱机、放克黑胶碎拍、黑胶搓碟声、Roland TR-808 与现场派对呼喊。"
    },
    "rhythm_features": {
      "en": "Funky syncopated drum breaks sampled from 1970s funk records, heavy on the downbeat.",
      "zh": "源自 70 年代放克黑胶唱片的切分碎拍，首拍坚实有力。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Old School Hip Hop signature kick character.",
        "zh": "Old School Hip Hop 风格代表性底鼓特征。"
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
      "en": "Live electric funk bass riffs sampled directly from records and looped continuously.",
      "zh": "直接从黑胶唱片中截取并无限循环的生动电贝斯放克 Riff。"
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
        "Isolate the 2-bar drum break of a 70s soul record and loop it seamlessly",
        "Layer scratching sounds on the offbeats",
        "Keep MC vocal delivery rhythmic and call-and-response oriented"
      ],
      "zh": [
        "截取一段 70 年代灵魂乐中的 2 小节鼓 Solo 并做无缝循环",
        "在反拍叠入黑胶搓碟拟音（Scratch）",
        "说唱人声强调清晰节奏押韵与派对呼应互动"
      ]
    },
    "representative_tracks": [
      {
        "title": "Old School Hip Hop Anthem",
        "artist": "DJ Kool Herc",
        "year": 1973,
        "link": "https://www.youtube.com/results?search_query=DJ+Kool+Herc+Old+School+Hip+Hop"
      },
      {
        "title": "Midnight in Bronx",
        "artist": "Grandmaster Flash",
        "year": 1975,
        "link": "https://www.youtube.com/results?search_query=Grandmaster+Flash+Old+School+Hip+Hop"
      },
      {
        "title": "Echoes of Old School Hip Hop",
        "artist": "Afrika Bambaataa",
        "year": 1977,
        "link": "https://www.youtube.com/results?search_query=Afrika+Bambaataa+Old+School+Hip+Hop"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Sugarhill Gang",
        "year": 1979,
        "link": "https://www.youtube.com/results?search_query=Sugarhill+Gang+Old+School+Hip+Hop"
      },
      {
        "title": "Essential Old School Hip Hop",
        "artist": "Kurtis Blow",
        "year": 1981,
        "link": "https://www.youtube.com/results?search_query=Kurtis+Blow+Old+School+Hip+Hop"
      }
    ],
    "representative_artists": [
      "DJ Kool Herc",
      "Grandmaster Flash",
      "Afrika Bambaataa",
      "Sugarhill Gang",
      "Kurtis Blow"
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
      "bassEnergy": 9,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "old-school-hip-hop",
      "bpm": 102,
      "scale": "G minor",
      "swing": 15,
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
          "instrument": "808_snare",
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
    "id": "boom-bap",
    "name": "Boom Bap",
    "aliases": [
      "轰趴嘻哈",
      "经典东海岸嘻哈"
    ],
    "category": "Hip Hop",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1988",
    "origin_decade": 1980,
    "origin_place": {
      "en": "New York, USA",
      "zh": "美国纽约"
    },
    "cultural_context": {
      "en": "Golden Age hip-hop defined by hard acoustic kicks ('Boom') and cracking vinyl snares ('Bap') chopped from jazz records on the Akai MPC60.",
      "zh": "嘻哈黄金时代的代名词，由 Akai MPC60 采样爵士黑胶切片，以硬朗原声底鼓（Boom）与炸裂军鼓（Bap）著称。"
    },
    "bpm_range": "85–95 BPM",
    "default_bpm": 90,
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
      "Sampled Jazz Horns",
      "Chopped Rhodes",
      "Upright Bass Loop",
      "MPC60 / SP-1200 Drums",
      "Vinyl Crackle"
    ],
    "sound_design": {
      "en": "Akai MPC60/SP-1200 12-bit crunch, chopped jazz Rhodes and horns, crackling vinyl snare.",
      "zh": "Akai MPC/SP-1200 12位粗糙采样颗粒感、切碎爵士电钢琴与管乐、黑胶爆豆军鼓。"
    },
    "rhythm_features": {
      "en": "The definitive swing: heavy kick on 1 and 3-and, sharp cracking acoustic snare on 2 and 4.",
      "zh": "黄金律动：第 1 拍和第 3 拍后半拍沉重底鼓，第 2、4 拍清脆炸裂原声军鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Boom Bap signature kick character.",
        "zh": "Boom Bap 风格代表性底鼓特征。"
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
      "tempo": "85–95 BPM"
    },
    "bass_pattern": {
      "en": "Deep, low-passed acoustic upright bass loops or warm filtered sub-bass following the jazz sample.",
      "zh": "低通滤波的原声立式贝斯循环，或紧密跟随爵士采样的温暖 Sub 低音。"
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
        "Chop jazz piano and horn stabs into micro-chops and replay on an MPC grid",
        "Apply low-pass filter at 150Hz on the bass sample and boost 60Hz",
        "Layer a vinyl crackle loop beneath the drums"
      ],
      "zh": [
        "将爵士钢琴与铜管刺音切成微片段并在打击垫上网格化重奏",
        "对采样贝斯在 150Hz 做低通滤波并提升 60Hz 超低频基音",
        "在鼓组下方轻柔铺垫黑胶唱针爆豆声底噪"
      ]
    },
    "representative_tracks": [
      {
        "title": "Boom Bap Anthem",
        "artist": "DJ Premier",
        "year": 1988,
        "link": "https://www.youtube.com/results?search_query=DJ+Premier+Boom+Bap"
      },
      {
        "title": "Midnight in New York",
        "artist": "Pete Rock",
        "year": 1990,
        "link": "https://www.youtube.com/results?search_query=Pete+Rock+Boom+Bap"
      },
      {
        "title": "Echoes of Boom Bap",
        "artist": "Nas",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=Nas+Boom+Bap"
      },
      {
        "title": "Pulse & Groove",
        "artist": "The Notorious B.I.G.",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=The+Notorious+B.I.G.+Boom+Bap"
      },
      {
        "title": "Essential Boom Bap",
        "artist": "A Tribe Called Quest",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=A+Tribe+Called+Quest+Boom+Bap"
      }
    ],
    "representative_artists": [
      "DJ Premier",
      "Pete Rock",
      "Nas",
      "The Notorious B.I.G.",
      "A Tribe Called Quest"
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
      "rhythmDensity": 6,
      "bassEnergy": 9,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "boom-bap",
      "bpm": 92,
      "scale": "C minor",
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
            1,
            0,
            1
          ],
          "velocity": [
            0,
            0,
            0,
            55,
            0,
            0,
            70,
            0,
            0,
            55,
            0,
            0,
            0,
            55,
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
            null,
            75,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            74,
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
    "id": "g-funk",
    "name": "G-Funk",
    "aliases": [
      "帮匪放克"
    ],
    "category": "Hip Hop",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1991",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Los Angeles, California, USA",
      "zh": "美国加州洛杉矶"
    },
    "cultural_context": {
      "en": "Pioneered by Dr. Dre on 'The Chronic', marrying laid-back West Coast hip-hop with high-pitched Portamento Moog synth leads and Parliament-Funkadelic samples.",
      "zh": "由 Dr. Dre 凭借《The Chronic》确立，将西海岸悠闲说唱同高音滑音 Moog 合成器单音以及 P-Funk 经典放克结合。"
    },
    "bpm_range": "88–98 BPM",
    "default_bpm": 92,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–iv–v",
      "i–iv–VII–III"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Portamento Sine Lead",
      "Rhodes Chords",
      "Fingerstyle Electric Bass",
      "Funk Guitar",
      "Parliament Horn Samples"
    ],
    "sound_design": {
      "en": "High-pitched sine/saw lead with portamento glide, live slap bass, Rhodes chords, Parliament samples.",
      "zh": "高音滑音正弦/锯齿波合成主奏、现场 Slap 贝斯、Rhodes 和弦与 P-Funk 经典放克采样。"
    },
    "rhythm_features": {
      "en": "Laid-back, hypnotic 4/4 groove with crisp handclaps layered over live-sounding snares.",
      "zh": "慵懒从容、极具催眠感的四四拍放克律动，清脆拍手叠置在原声军鼓之上。"
    },
    "drum_pattern": {
      "kick": {
        "en": "G-Funk signature kick character.",
        "zh": "G-Funk 风格代表性底鼓特征。"
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
      "tempo": "88–98 BPM"
    },
    "bass_pattern": {
      "en": "Funky, syncopated live electric bass guitar playing deep melodic walking grooves.",
      "zh": "充满放克弹跳律动的现场电贝斯吉他，演奏深沉流畅的行进低音线条。"
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
        "Program a high-octave monophonic lead synth with generous portamento (glide time around 120ms)",
        "Use warm, real electric bass guitar recordings with plenty of groove swing",
        "Re-play samples live with studio musicians rather than simple audio chops"
      ],
      "zh": [
        "高八度单音合成器开启 120ms 左右的长滑音（Portamento）打造标志旋律",
        "使用带摇摆弹性的真实电贝斯实录录音",
        "聘请乐手现场重新演奏经典采样片段赋予温暖生命力"
      ]
    },
    "representative_tracks": [
      {
        "title": "G-Funk Anthem",
        "artist": "Dr. Dre",
        "year": 1991,
        "link": "https://www.youtube.com/results?search_query=Dr.+Dre+G-Funk"
      },
      {
        "title": "Midnight in Los Angeles",
        "artist": "Snoop Dogg",
        "year": 1993,
        "link": "https://www.youtube.com/results?search_query=Snoop+Dogg+G-Funk"
      },
      {
        "title": "Echoes of G-Funk",
        "artist": "Warren G",
        "year": 1995,
        "link": "https://www.youtube.com/results?search_query=Warren+G+G-Funk"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Nate Dogg",
        "year": 1997,
        "link": "https://www.youtube.com/results?search_query=Nate+Dogg+G-Funk"
      },
      {
        "title": "Essential G-Funk",
        "artist": "DJ Quik",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=DJ+Quik+G-Funk"
      }
    ],
    "representative_artists": [
      "Dr. Dre",
      "Snoop Dogg",
      "Warren G",
      "Nate Dogg",
      "DJ Quik"
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
      "bassEnergy": 9,
      "melodicFocus": 3
    },
    "sequencer_pattern": {
      "genre_id": "g-funk",
      "bpm": 94,
      "scale": "A minor",
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
            null,
            null,
            45,
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
            69,
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
          "instrument": "sine_lead",
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
            81,
            null,
            null,
            null,
            null,
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
    "id": "trap-rap",
    "name": "Trap Rap",
    "aliases": [
      "陷阱说唱"
    ],
    "category": "Hip Hop",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2003",
    "origin_decade": 2000,
    "origin_place": {
      "en": "Atlanta, Georgia, USA",
      "zh": "美国佐治亚州亚特兰大"
    },
    "cultural_context": {
      "en": "Originated in Atlanta in the early 2000s, defined by gritty street storytelling over booming Roland TR-808 subs, rapid hi-hat rolls, and dark minor bells.",
      "zh": "2000 年代初起源于亚特兰大，以阴冷街头叙事、轰鸣的 Roland TR-808 超重低音、极速飞驰三连音踩镲与暗黑钟琴为核心。"
    },
    "bpm_range": "130–150 BPM",
    "default_bpm": 140,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–VII",
      "i–iv–VI–v"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Dark Minor Bells",
      "808 Sub Bass",
      "Rapid Triplet Hi-Hats",
      "Minor Brass Stabs",
      "Warm Pad"
    ],
    "sound_design": {
      "en": "Booming Roland TR-808 sub-bass, rapid triplet hi-hats, minor brass stabs, eerie flutes.",
      "zh": "轰鸣 Roland TR-808 超低音、速射三连音踩镲、小调铜管刺音与阴郁长笛。"
    },
    "rhythm_features": {
      "en": "Half-time 140 BPM rhythm with sharp snare or clap on beat 3 and intricate 1/32 hi-hat rolls.",
      "zh": "140 BPM 半速节拍，第 3 拍落锋利军鼓/拍手，穿插精密的三十二分音符踩镲滚奏。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Trap Rap signature kick character.",
        "zh": "Trap Rap 风格代表性底鼓特征。"
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
      "tempo": "130–150 BPM"
    },
    "bass_pattern": {
      "en": "Deep 808 sub bass glides providing both foundational chord weight and rhythmic drive.",
      "zh": "深沉的 808 超低音滑音，兼具和声根音重量与节拍推进动力。"
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
        "Automate pitch and panning on fast 1/32 triplet hi-hat rolls",
        "Distort the 808 sub slightly to generate harmonics audible on smartphone speakers",
        "Keep melodies sparse to allow maximum room for rap vocals"
      ],
      "zh": [
        "对三十二分音符三连音踩镲滚奏做音高与立体声声像自动化",
        "对 808 低频施加适度轻微失真，确保在手机扬声器上清晰呈现",
        "保持旋律高度精炼稀疏，留给说唱歌词充分动态空间"
      ]
    },
    "representative_tracks": [
      {
        "title": "Trap Rap Anthem",
        "artist": "T.I.",
        "year": 2003,
        "link": "https://www.youtube.com/results?search_query=T.I.+Trap+Rap"
      },
      {
        "title": "Midnight in Atlanta",
        "artist": "Gucci Mane",
        "year": 2005,
        "link": "https://www.youtube.com/results?search_query=Gucci+Mane+Trap+Rap"
      },
      {
        "title": "Echoes of Trap Rap",
        "artist": "Future",
        "year": 2007,
        "link": "https://www.youtube.com/results?search_query=Future+Trap+Rap"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Metro Boomin",
        "year": 2009,
        "link": "https://www.youtube.com/results?search_query=Metro+Boomin+Trap+Rap"
      },
      {
        "title": "Essential Trap Rap",
        "artist": "Travis Scott",
        "year": 2011,
        "link": "https://www.youtube.com/results?search_query=Travis+Scott+Trap+Rap"
      }
    ],
    "representative_artists": [
      "T.I.",
      "Gucci Mane",
      "Future",
      "Metro Boomin",
      "Travis Scott"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 5,
      "harmonicComplexity": 2,
      "rhythmDensity": 5,
      "bassEnergy": 10,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "trap-rap",
      "bpm": 140,
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
            41,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            41,
            null,
            44,
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
            77,
            null,
            null,
            null,
            null,
            null,
            80,
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
    "id": "conscious-hip-hop",
    "name": "Conscious Hip Hop",
    "aliases": [
      "有意识说唱",
      "自觉嘻哈"
    ],
    "category": "Hip Hop",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1987",
    "origin_decade": 1980,
    "origin_place": {
      "en": "USA",
      "zh": "美国"
    },
    "cultural_context": {
      "en": "Focuses on social justice, political awareness, and philosophical introspection over thoughtful jazz, soul, and funk musical beds.",
      "zh": "专注于社会公平、政治觉醒与哲学思辨，以富有沉淀感的爵士、灵魂乐与放克作为音乐底色。"
    },
    "bpm_range": "85–95 BPM",
    "default_bpm": 90,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–i–VII",
      "ii–V–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Live Horn Section",
      "Rhodes Piano",
      "Upright Acoustic Bass",
      "Organic Drum Kit"
    ],
    "sound_design": {
      "en": "Organic live instrumentation, upright acoustic bass, live horn sections, Rhodes piano.",
      "zh": "有机现场原声乐器编配、立式原声贝斯、现场铜管组与温润 Rhodes 电钢琴。"
    },
    "rhythm_features": {
      "en": "Dynamic, human-played hip-hop grooves with delicate brush snares and expressive cymbals.",
      "zh": "富有动态与人手演奏质感的嘻哈律动，伴随细腻的沙刷军鼓与表现力镲片。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Conscious Hip Hop signature kick character.",
        "zh": "Conscious Hip Hop 风格代表性底鼓特征。"
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
      "tempo": "85–95 BPM"
    },
    "bass_pattern": {
      "en": "Sophisticated upright acoustic basslines playing expressive, walking jazz chord progressions.",
      "zh": "复杂优雅的立式原声贝斯线条，演奏富有叙事感的行进爵士和声。"
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
        "Incorporate live studio musicians (saxophone, upright bass, piano) rather than loop packs",
        "Master track with wide dynamic range and avoid over-squashing with limiters",
        "Use conversational, articulate vocal mixing"
      ],
      "zh": [
        "引入真实的萨克斯、立式贝斯与钢琴乐手实录而非使用套件采样",
        "母带处理保留宽广动态范围，避免用限制器盲目压死",
        "人声混音追求如同面对面交谈般清澈自然的质感"
      ]
    },
    "representative_tracks": [
      {
        "title": "Conscious Hip Hop Anthem",
        "artist": "Kendrick Lamar",
        "year": 1987,
        "link": "https://www.youtube.com/results?search_query=Kendrick+Lamar+Conscious+Hip+Hop"
      },
      {
        "title": "Midnight in USA",
        "artist": "Mos Def",
        "year": 1989,
        "link": "https://www.youtube.com/results?search_query=Mos+Def+Conscious+Hip+Hop"
      },
      {
        "title": "Echoes of Conscious Hip Hop",
        "artist": "Common",
        "year": 1991,
        "link": "https://www.youtube.com/results?search_query=Common+Conscious+Hip+Hop"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Public Enemy",
        "year": 1993,
        "link": "https://www.youtube.com/results?search_query=Public+Enemy+Conscious+Hip+Hop"
      },
      {
        "title": "Essential Conscious Hip Hop",
        "artist": "Talib Kweli",
        "year": 1995,
        "link": "https://www.youtube.com/results?search_query=Talib+Kweli+Conscious+Hip+Hop"
      }
    ],
    "representative_artists": [
      "Kendrick Lamar",
      "Mos Def",
      "Common",
      "Public Enemy",
      "Talib Kweli"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 9,
      "brightness": 8,
      "harmonicComplexity": 4,
      "rhythmDensity": 6,
      "bassEnergy": 3,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "conscious-hip-hop",
      "bpm": 90,
      "scale": "E minor",
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
          "instrument": "walking_upright",
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
            40,
            null,
            null,
            null,
            null,
            null,
            43,
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
            76,
            null,
            null,
            79,
            null,
            null,
            null,
            null,
            81,
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
    "id": "emo-rap",
    "name": "Emo Rap",
    "aliases": [
      "情绪说唱"
    ],
    "category": "Hip Hop",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2015",
    "origin_decade": 2010,
    "origin_place": {
      "en": "USA",
      "zh": "美国"
    },
    "cultural_context": {
      "en": "Mid-2010s movement blending confessional melancholic indie/midwest emo guitar loops with trap 808 beats and vulnerable singing.",
      "zh": "2010 年代中期风潮，将感伤自白的独立/中西部 Emo 摇滚吉他循环与 Trap 808 鼓点和脆弱深情歌唱交织。"
    },
    "bpm_range": "120–140 BPM",
    "default_bpm": 130,
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
      "Clean Emo Guitar Loop",
      "808 Sub Bass",
      "Melancholic Synth Pad",
      "Trap Drum Kit"
    ],
    "sound_design": {
      "en": "Clean plucked acoustic or electric guitar loops, autotuned emotional vocals, booming 808s.",
      "zh": "清脆原声或电吉他拨弦循环、自动修音（Autotune）深情吟唱与轰鸣 808。"
    },
    "rhythm_features": {
      "en": "Half-time trap beats with rolling hi-hats, soft claps, and melancholic pauses.",
      "zh": "半速 Trap 节拍，穿插细腻踩镲滚奏、柔和拍手与充满感伤的停顿。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Emo Rap signature kick character.",
        "zh": "Emo Rap 风格代表性底鼓特征。"
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
      "en": "Deep 808 sub-bass following sad indie chord progressions (often vi-IV-I-V).",
      "zh": "紧随悲伤独立和弦走向（常含 vi-IV-I-V）流淌的深沉 808 超低音。"
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
        "Record a gentle electric guitar riff with chorus and reverb in a minor key",
        "Use heavy pitch correction as an artistic emotional effect on lead vocals",
        "Keep the 808 soft and rounded rather than harshly distorted"
      ],
      "zh": [
        "在小调上录制带有合唱与温和混响的木吉他/电吉他拨弦",
        "将高强度自动修音（Autotune）作为抒发脆弱情绪的艺术音色手段",
        "让 808 保持圆润温暖而非暴烈失真"
      ]
    },
    "representative_tracks": [
      {
        "title": "Emo Rap Anthem",
        "artist": "Juice WRLD",
        "year": 2015,
        "link": "https://www.youtube.com/results?search_query=Juice+WRLD+Emo+Rap"
      },
      {
        "title": "Midnight in USA",
        "artist": "Lil Peep",
        "year": 2017,
        "link": "https://www.youtube.com/results?search_query=Lil+Peep+Emo+Rap"
      },
      {
        "title": "Echoes of Emo Rap",
        "artist": "XXXTENTACION",
        "year": 2019,
        "link": "https://www.youtube.com/results?search_query=XXXTENTACION+Emo+Rap"
      },
      {
        "title": "Pulse & Groove",
        "artist": "iann dior",
        "year": 2021,
        "link": "https://www.youtube.com/results?search_query=iann+dior+Emo+Rap"
      },
      {
        "title": "Essential Emo Rap",
        "artist": "Lil Tracy",
        "year": 2023,
        "link": "https://www.youtube.com/results?search_query=Lil+Tracy+Emo+Rap"
      }
    ],
    "representative_artists": [
      "Juice WRLD",
      "Lil Peep",
      "XXXTENTACION",
      "iann dior",
      "Lil Tracy"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 6,
      "brightness": 5,
      "harmonicComplexity": 2,
      "rhythmDensity": 5,
      "bassEnergy": 9,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "emo-rap",
      "bpm": 135,
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
          "instrument": "clap",
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
            50,
            80,
            50,
            90,
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
          "instrument": "guitar_lead",
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
    "id": "lofi-hip-hop",
    "name": "Lo-Fi Hip Hop",
    "aliases": [
      "低保真嘻哈",
      "治愈嘻哈"
    ],
    "category": "Hip Hop",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2013",
    "origin_decade": 2010,
    "origin_place": {
      "en": "Internet & Japan",
      "zh": "互联网与日本"
    },
    "cultural_context": {
      "en": "Pioneered by Nujabes and J Dilla, globally celebrated for relaxing, nostalgic boom-bap beats, SP-404 vinyl crackle, and muted jazz chords for studying.",
      "zh": "由 Nujabes 与 J Dilla 开创并风靡全球的疗愈风格，以松弛怀旧的 Boom-Bap 碎拍、SP-404 黑胶底噪与温暖爵士和弦陪伴无数人学习睡眠。"
    },
    "bpm_range": "70–85 BPM",
    "default_bpm": 80,
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
      "Muted Rhodes",
      "Vinyl Crackle",
      "Soft Boom-Bap Drums",
      "Warm Sine Sub Bass",
      "Muted Plucked Synth",
      "Cassette Tape Warble"
    ],
    "sound_design": {
      "en": "Vinyl crackle, muted Rhodes piano chords, cassette tape warble, soft acoustic drums.",
      "zh": "黑胶爆豆底噪、弱音温暖 Rhodes 电钢琴、磁带音高抖晃与柔软原声鼓。"
    },
    "rhythm_features": {
      "en": "Unquantized, lazy, behind-the-beat boom-bap swing with soft kicks and brushing snares.",
      "zh": "未量化、松散后倾的醉人摇摆节拍，搭配柔和底鼓与轻扫军鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Lo-Fi Hip Hop signature kick character.",
        "zh": "Lo-Fi Hip Hop 风格代表性底鼓特征。"
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
      "tempo": "70–85 BPM"
    },
    "bass_pattern": {
      "en": "Warm, round, low-passed sine or acoustic upright bass gently humming root notes.",
      "zh": "温暖圆润、经过深低通滤波的正弦波或原声立式贝斯轻柔低鸣。"
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
        "Disable grid snapping and nudge hi-hats and snares manually for lazy J Dilla swing",
        "Add cassette wow/flutter modulation on piano samples",
        "Apply low-pass filter to the master drum bus around 8kHz to remove harsh highs"
      ],
      "zh": [
        "关闭宿主节拍吸附，手动错开军鼓与踩镲营造 J Dilla 式慵懒人手微延迟",
        "为钢琴音色加入模拟卡带走带不均的音高颤动（Wow/Flutter）",
        "在 8kHz 处对鼓总线做低通滚降吸收一切刺耳高频"
      ]
    },
    "representative_tracks": [
      {
        "title": "Lo-Fi Hip Hop Anthem",
        "artist": "Nujabes",
        "year": 2013,
        "link": "https://www.youtube.com/results?search_query=Nujabes+Lo-Fi+Hip+Hop"
      },
      {
        "title": "Midnight in Internet & Japan",
        "artist": "J Dilla",
        "year": 2015,
        "link": "https://www.youtube.com/results?search_query=J+Dilla+Lo-Fi+Hip+Hop"
      },
      {
        "title": "Echoes of Lo-Fi Hip Hop",
        "artist": "Knxwledge",
        "year": 2017,
        "link": "https://www.youtube.com/results?search_query=Knxwledge+Lo-Fi+Hip+Hop"
      },
      {
        "title": "Pulse & Groove",
        "artist": "ChilledCow / Lofi Girl",
        "year": 2019,
        "link": "https://www.youtube.com/results?search_query=ChilledCow+/+Lofi+Girl+Lo-Fi+Hip+Hop"
      },
      {
        "title": "Essential Lo-Fi Hip Hop",
        "artist": " idealism",
        "year": 2021,
        "link": "https://www.youtube.com/results?search_query=+idealism+Lo-Fi+Hip+Hop"
      }
    ],
    "representative_artists": [
      "Nujabes",
      "J Dilla",
      "Knxwledge",
      "ChilledCow / Lofi Girl",
      " idealism"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 8,
      "brightness": 3,
      "harmonicComplexity": 2,
      "rhythmDensity": 4,
      "bassEnergy": 7,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "lofi-hip-hop",
      "bpm": 80,
      "scale": "F minor",
      "swing": 30,
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
    "id": "east-coast-hip-hop",
    "name": "East Coast Hip Hop",
    "aliases": [
      "东海岸嘻哈"
    ],
    "category": "Hip Hop",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1985",
    "origin_decade": 1980,
    "origin_place": {
      "en": "New York, USA",
      "zh": "美国纽约"
    },
    "cultural_context": {
      "en": "Centered in New York, famed for complex multi-syllabic lyricism, dark minor piano chops, gritty vinyl crackle, and aggressive street realism.",
      "zh": "以纽约为大本营，以错综复杂的多音节押韵技巧、暗黑小调黑胶钢琴切片与冷酷写实的街头叙事著称。"
    },
    "bpm_range": "85–95 BPM",
    "default_bpm": 90,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–i–VII",
      "i–VI–iv–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Dark Minor Grand Piano",
      "Rhodes Chords",
      "Filtered Bass Guitar",
      "Crackling Vinyl Breaks",
      "SP-1200 Drums"
    ],
    "sound_design": {
      "en": "Kung fu movie voice samples, dark minor grand piano loops, crackling vinyl breaks, SP-1200 grit.",
      "zh": "功夫电影对话采样、暗黑小调大钢琴循环、黑胶爆豆碎拍与 SP-1200 粗砺采样声。"
    },
    "rhythm_features": {
      "en": "Hard, aggressive boom-bap drums with cracking snares hitting dead-on on beats 2 and 4.",
      "zh": "刚硬有力的 Boom-Bap 鼓点，脆响军鼓在 2、4 拍精准下坠。"
    },
    "drum_pattern": {
      "kick": {
        "en": "East Coast Hip Hop signature kick character.",
        "zh": "East Coast Hip Hop 风格代表性底鼓特征。"
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
      "tempo": "85–95 BPM"
    },
    "bass_pattern": {
      "en": "Deep, rumbling acoustic bass or filtered bass guitar loops anchoring the street poetry.",
      "zh": "深沉低鸣的原声贝斯或滤波贝斯吉他循环，稳稳锚定街头诗篇。"
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
        "Sample kung fu film dialogues or vintage eerie crime soundtracks",
        "Chop piano chords aggressively and replay with sharp attacks",
        "Keep the drum kit raw and hard-hitting with analog clipping"
      ],
      "zh": [
        "采样老派功夫电影对话或复古犯罪悬疑配乐",
        "将小调钢琴和弦粗暴切片并以急促起音重奏",
        "通过模拟过载剪切让鼓组敲击保持生猛原始冲击力"
      ]
    },
    "representative_tracks": [
      {
        "title": "East Coast Hip Hop Anthem",
        "artist": "Wu-Tang Clan",
        "year": 1985,
        "link": "https://www.youtube.com/results?search_query=Wu-Tang+Clan+East+Coast+Hip+Hop"
      },
      {
        "title": "Midnight in New York",
        "artist": "Mobb Deep",
        "year": 1987,
        "link": "https://www.youtube.com/results?search_query=Mobb+Deep+East+Coast+Hip+Hop"
      },
      {
        "title": "Echoes of East Coast Hip Hop",
        "artist": "Nas",
        "year": 1989,
        "link": "https://www.youtube.com/results?search_query=Nas+East+Coast+Hip+Hop"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Big L",
        "year": 1991,
        "link": "https://www.youtube.com/results?search_query=Big+L+East+Coast+Hip+Hop"
      },
      {
        "title": "Essential East Coast Hip Hop",
        "artist": "Jay-Z",
        "year": 1993,
        "link": "https://www.youtube.com/results?search_query=Jay-Z+East+Coast+Hip+Hop"
      }
    ],
    "representative_artists": [
      "Wu-Tang Clan",
      "Mobb Deep",
      "Nas",
      "Big L",
      "Jay-Z"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 5,
      "harmonicComplexity": 4,
      "rhythmDensity": 6,
      "bassEnergy": 7,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "east-coast-hip-hop",
      "bpm": 94,
      "scale": "D minor",
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
            38,
            null,
            null,
            null,
            null,
            null,
            41,
            null,
            null,
            null,
            38,
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
    "id": "west-coast-hip-hop",
    "name": "West Coast Hip Hop",
    "aliases": [
      "西海岸嘻哈"
    ],
    "category": "Hip Hop",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1983",
    "origin_decade": 1980,
    "origin_place": {
      "en": "Los Angeles, California, USA",
      "zh": "美国加州洛杉矶"
    },
    "cultural_context": {
      "en": "Originated in LA, fusing electro-funk and heavy synthesized basslines with raw gangsta rap storytelling and sun-drenched cruising grooves.",
      "zh": "起源于加州洛杉矶，将电子放克与重型合成低音线条同街头说唱故事及加州阳光下的巡游律动融合。"
    },
    "bpm_range": "90–102 BPM",
    "default_bpm": 95,
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
      "Analog Synth Lead",
      "Heavy Analog Synth Bass",
      "Rhodes Chords",
      "Talkbox Vocoder",
      "Funk Rhythm Guitar"
    ],
    "sound_design": {
      "en": "Heavy analog synth bass, talkbox vocoders, crisp handclaps, funk rhythm guitars.",
      "zh": "重型模拟合成贝斯、谈话盒人声效果器、清脆拍手与放克扫弦吉他。"
    },
    "rhythm_features": {
      "en": "Driving mid-tempo funk groove with crisp 808-style claps and prominent open hi-hats.",
      "zh": "推进式中速放克节拍，伴随清脆 808 风格叠层拍手与标志性开镲。"
    },
    "drum_pattern": {
      "kick": {
        "en": "West Coast Hip Hop signature kick character.",
        "zh": "West Coast Hip Hop 风格代表性底鼓特征。"
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
      "tempo": "90–102 BPM"
    },
    "bass_pattern": {
      "en": "Bouncing, highly syncopated analog synth basslines that propel cruising car sound systems.",
      "zh": "弹跳切分的模拟合成低音线条，专为在低底盘汽车音响中巡游炸街而生。"
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
        "Layer handclaps with crisp snares on beats 2 and 4",
        "Write syncopated 16th-note basslines using Moog Minimoog sawtooth and square waves",
        "Add talkbox vocal phrases for classic West Coast swagger"
      ],
      "zh": [
        "在 2、4 拍将响亮拍手与清脆军鼓紧密叠合",
        "使用 Moog Minimoog 锯齿波与方波编写切分十六分音符贝斯线条",
        "加入谈话盒（Talkbox）人声音效赋予纯正西海岸韵味"
      ]
    },
    "representative_tracks": [
      {
        "title": "West Coast Hip Hop Anthem",
        "artist": "N.W.A",
        "year": 1983,
        "link": "https://www.youtube.com/results?search_query=N.W.A+West+Coast+Hip+Hop"
      },
      {
        "title": "Midnight in Los Angeles",
        "artist": "Ice Cube",
        "year": 1985,
        "link": "https://www.youtube.com/results?search_query=Ice+Cube+West+Coast+Hip+Hop"
      },
      {
        "title": "Echoes of West Coast Hip Hop",
        "artist": "2Pac",
        "year": 1987,
        "link": "https://www.youtube.com/results?search_query=2Pac+West+Coast+Hip+Hop"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Eazy-E",
        "year": 1989,
        "link": "https://www.youtube.com/results?search_query=Eazy-E+West+Coast+Hip+Hop"
      },
      {
        "title": "Essential West Coast Hip Hop",
        "artist": "DJ Yella",
        "year": 1991,
        "link": "https://www.youtube.com/results?search_query=DJ+Yella+West+Coast+Hip+Hop"
      }
    ],
    "representative_artists": [
      "N.W.A",
      "Ice Cube",
      "2Pac",
      "Eazy-E",
      "DJ Yella"
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
      "rhythmDensity": 5,
      "bassEnergy": 7,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "west-coast-hip-hop",
      "bpm": 95,
      "scale": "G minor",
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
            43,
            null,
            null,
            null,
            null,
            null,
            46,
            null,
            43,
            null,
            null,
            null,
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
          "instrument": "rhodes_ep",
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
    "id": "southern-hip-hop",
    "name": "Southern Hip Hop",
    "aliases": [
      "南方嘻哈",
      "Dirty South"
    ],
    "category": "Hip Hop",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1990",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Houston, Memphis & Atlanta, USA",
      "zh": "美国休斯敦、孟菲斯与亚特兰大"
    },
    "cultural_context": {
      "en": "Defined by the bounce of Atlanta, the chopped-and-screwed sound of Houston, and dark Memphis tape loops, celebrating massive low end and energetic chants.",
      "zh": "融合亚特兰大弹跳、休斯敦降速撕扯（Chopped and Screwed）与孟菲斯暗黑磁带，以庞大低频与呐喊口号征服全球。"
    },
    "bpm_range": "70–80 BPM (140-160)",
    "default_bpm": 75,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–i–V",
      "i–VI–VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Brass Synth Blasts",
      "Rhodes Chords",
      "808 Sub Bass",
      "Chanted Vocals",
      "Chopped & Screwed Samples"
    ],
    "sound_design": {
      "en": "Roland TR-808 sub bass, brass synthesizer blasts, chants (Yeah!, What!), chopped slowed-down vocals.",
      "zh": "Roland TR-808 超重低音、铜管合成器齐鸣、口号呐喊切片与降速变调人声。"
    },
    "rhythm_features": {
      "en": "Heavy half-time bounce with syncopated 808 kicks and rapid hi-hat trills.",
      "zh": "沉重半速弹跳，伴随切分 808 底鼓与极速踩镲颤音。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Southern Hip Hop signature kick character.",
        "zh": "Southern Hip Hop 风格代表性底鼓特征。"
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
      "tempo": "70–80 BPM (140-160)"
    },
    "bass_pattern": {
      "en": "Massive booming 808 sub kicks held long with pitch drops.",
      "zh": "庞大轰鸣的 808 超重底鼓，带有长延音与音高下潜。"
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
        "Slow down track tempo by 15-20% to emulate the iconic Houston chopped-and-screwed feel",
        "Stack brass synthesisers playing staccato chords in minor keys",
        "Place energetic crowd hype chants on the offbeats"
      ],
      "zh": [
        "将整首音乐降速 15-20% 复刻休斯敦标志性 Chopped and Screwed 质感",
        "多层叠置小调短促断奏铜管合成器和弦",
        "在反拍安放充满感染力的现场人声口号喊麦"
      ]
    },
    "representative_tracks": [
      {
        "title": "Southern Hip Hop Anthem",
        "artist": "Outkast",
        "year": 1990,
        "link": "https://www.youtube.com/results?search_query=Outkast+Southern+Hip+Hop"
      },
      {
        "title": "Midnight in Houston",
        "artist": "Three 6 Mafia",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=Three+6+Mafia+Southern+Hip+Hop"
      },
      {
        "title": "Echoes of Southern Hip Hop",
        "artist": "UGK",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=UGK+Southern+Hip+Hop"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Ludacris",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Ludacris+Southern+Hip+Hop"
      },
      {
        "title": "Essential Southern Hip Hop",
        "artist": "Lil Wayne",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Lil+Wayne+Southern+Hip+Hop"
      }
    ],
    "representative_artists": [
      "Outkast",
      "Three 6 Mafia",
      "UGK",
      "Ludacris",
      "Lil Wayne"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 8,
      "brightness": 8,
      "harmonicComplexity": 2,
      "rhythmDensity": 3,
      "bassEnergy": 9,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "southern-hip-hop",
      "bpm": 92,
      "scale": "F minor",
      "swing": 15,
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
          "instrument": "808_snare",
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
            50,
            80,
            50,
            90,
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
          "instrument": "brass_synth",
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
    "id": "cloud-rap",
    "name": "Cloud Rap",
    "aliases": [
      "云雾说唱"
    ],
    "category": "Hip Hop",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2009",
    "origin_decade": 2000,
    "origin_place": {
      "en": "USA & Sweden",
      "zh": "美国与瑞典"
    },
    "cultural_context": {
      "en": "Pioneered by Clams Casino, featuring ethereal, dreamlike synth pads, slowed-down vocal sighs, floating atmospheres, and spaced-out trap beats.",
      "zh": "由 Clams Casino 等人开创，以缥缈虚幻的梦境合成铺底、叹息般的人声切片、浮空氛围与冥想 Trap 节拍著称。"
    },
    "bpm_range": "120–140 BPM",
    "default_bpm": 130,
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
      "Ethereal Plucked Synth",
      "Warm 808 Sub Bass",
      "Dreamlike Pads",
      "Reversed Vocal Sighs"
    ],
    "sound_design": {
      "en": "Ethereal synth clouds, reversed female vocal sighs, drowning plate reverbs, warm 808s.",
      "zh": "飘渺空灵合成器云雾、反向人声叹息、浸没式板式混响与温暖 808。"
    },
    "rhythm_features": {
      "en": "Spacious, floating half-time trap rhythm with muffled snares and understated hi-hats.",
      "zh": "空旷失重的半速 Trap 节拍，搭配柔和沉闷军鼓与低调细致踩镲。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Cloud Rap signature kick character.",
        "zh": "Cloud Rap 风格代表性底鼓特征。"
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
      "en": "Warm, round 808 sub bass that hums gently beneath the dreamlike synth layers.",
      "zh": "温暖圆润的 808 超低音，在梦幻合成音色下方沉静低鸣。"
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
        "Take an ethereal female vocal phrase, reverse it, pitch it down, and drown it in 80% wet reverb",
        "Filter drum kicks to remove harsh clicks and preserve weight",
        "Keep musical elements floating without sharp transients"
      ],
      "zh": [
        "截取空灵女性人声音节反向翻转、降调并推入 80% 湿声混响中",
        "对底鼓做滤波软化瞬态敲击头，保留温润低频重力",
        "让所有音乐元素如云朵般轻柔漂浮，避免一切尖锐瞬态"
      ]
    },
    "representative_tracks": [
      {
        "title": "Cloud Rap Anthem",
        "artist": "Clams Casino",
        "year": 2009,
        "link": "https://www.youtube.com/results?search_query=Clams+Casino+Cloud+Rap"
      },
      {
        "title": "Midnight in USA & Sweden",
        "artist": "A$AP Rocky",
        "year": 2011,
        "link": "https://www.youtube.com/results?search_query=A$AP+Rocky+Cloud+Rap"
      },
      {
        "title": "Echoes of Cloud Rap",
        "artist": "Yung Lean",
        "year": 2013,
        "link": "https://www.youtube.com/results?search_query=Yung+Lean+Cloud+Rap"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Lil B",
        "year": 2015,
        "link": "https://www.youtube.com/results?search_query=Lil+B+Cloud+Rap"
      },
      {
        "title": "Essential Cloud Rap",
        "artist": "Bladee",
        "year": 2017,
        "link": "https://www.youtube.com/results?search_query=Bladee+Cloud+Rap"
      }
    ],
    "representative_artists": [
      "Clams Casino",
      "A$AP Rocky",
      "Yung Lean",
      "Lil B",
      "Bladee"
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
      "rhythmDensity": 3,
      "bassEnergy": 9,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "cloud-rap",
      "bpm": 125,
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
  }
];
