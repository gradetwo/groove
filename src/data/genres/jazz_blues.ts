import { Genre } from '../../types/genre';

export const JAZZ_BLUES_GENRES: Genre[] = [
  {
    "id": "delta-blues",
    "name": "Delta Blues",
    "aliases": [
      "三角洲布鲁斯"
    ],
    "category": "Jazz/Blues",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1900",
    "origin_decade": 1900,
    "origin_place": {
      "en": "Mississippi Delta, USA",
      "zh": "美国密西西比三角洲"
    },
    "cultural_context": {
      "en": "One of the earliest forms of blues, born in the Mississippi Delta, driven by acoustic slide guitar, raw emotional vocals, and porch-stomp rhythms.",
      "zh": "布鲁斯最古老形态之一，诞生于密西西比三角洲，以原声滑棒吉他、粗犷撕裂的歌喉与踩击门廊的脚步节拍著称。"
    },
    "bpm_range": "80–120 BPM",
    "default_bpm": 100,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–IV–I–V",
      "i–iv–i–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Acoustic Slide Guitar",
      "Harmonica",
      "Upright Bass",
      "Foot-Stomp & Handclaps"
    ],
    "sound_design": {
      "en": "Acoustic resonator guitars, brass slide, raw human vocals, foot tapping stomp.",
      "zh": "原声共鸣吉他、黄铜滑棒、原始撕裂人声与脚踏地面重音。"
    },
    "rhythm_features": {
      "en": "Loose, intuitive 12-bar blues pulse driven by foot stomps and thumb-picked bass beats.",
      "zh": "松散自然的 12 小节布鲁斯律动，由脚踏与大拇指拨奏低音驱动。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Delta Blues signature kick character.",
        "zh": "Delta Blues 风格代表性底鼓特征。"
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
      "tempo": "80–120 BPM"
    },
    "bass_pattern": {
      "en": "Steady thumbed alternating bass notes on acoustic guitar lower strings.",
      "zh": "木吉他低音弦上大拇指交替弹奏的沉稳低音线条。"
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
        "Tune acoustic guitar to Open D or Open G for authentic slide playing",
        "Capture single-microphone performance to retain raw room intimacy",
        "Emphasize emotional vocal bends over perfect pitch"
      ],
      "zh": [
        "吉他调至开放 D 或开放 G 弦演奏正宗滑棒",
        "采用单支大振膜电容话筒录音保留亲近空间感",
        "重视喉音弯音与即兴叹息胜过完美音准"
      ]
    },
    "representative_tracks": [
      {
        "title": "Delta Blues Anthem",
        "artist": "Robert Johnson",
        "year": 1900,
        "link": "https://www.youtube.com/results?search_query=Robert+Johnson+Delta+Blues"
      },
      {
        "title": "Midnight in Mississippi Delta",
        "artist": "Charley Patton",
        "year": 1902,
        "link": "https://www.youtube.com/results?search_query=Charley+Patton+Delta+Blues"
      },
      {
        "title": "Echoes of Delta Blues",
        "artist": "Son House",
        "year": 1904,
        "link": "https://www.youtube.com/results?search_query=Son+House+Delta+Blues"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Skip James",
        "year": 1906,
        "link": "https://www.youtube.com/results?search_query=Skip+James+Delta+Blues"
      },
      {
        "title": "Essential Delta Blues",
        "artist": "Blind Willie Johnson",
        "year": 1908,
        "link": "https://www.youtube.com/results?search_query=Blind+Willie+Johnson+Delta+Blues"
      }
    ],
    "representative_artists": [
      "Robert Johnson",
      "Charley Patton",
      "Son House",
      "Skip James",
      "Blind Willie Johnson"
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
      "rhythmDensity": 3,
      "bassEnergy": 3,
      "melodicFocus": 9
    },
    "sequencer_pattern": {
      "genre_id": "delta-blues",
      "bpm": 80,
      "scale": "E major",
      "swing": 40,
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
          "instrument": "acoustic_snare",
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
            0,
            0,
            0,
            0,
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
            0,
            0,
            0,
            0,
            0,
            0,
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
          "instrument": "walking_upright",
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
            40,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            47,
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
          "instrument": "guitar_lead",
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
            64,
            null,
            null,
            null,
            67,
            null,
            null,
            null,
            64,
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
          "instrument": "guitar_lead",
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
    "id": "chicago-blues",
    "name": "Chicago Blues",
    "aliases": [
      "芝加哥布鲁斯"
    ],
    "category": "Jazz/Blues",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1940",
    "origin_decade": 1940,
    "origin_place": {
      "en": "Chicago, USA",
      "zh": "美国芝加哥"
    },
    "cultural_context": {
      "en": "Electrified delta blues in South Side Chicago clubs, adding amplified electric guitars, distorted harmonica, piano, and drums.",
      "zh": "将三角洲布鲁斯电气化，在芝加哥南区俱乐部加入通电电吉他、失真口琴、钢琴与架子鼓。"
    },
    "bpm_range": "110–135 BPM",
    "default_bpm": 120,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–IV–V–IV",
      "I–IV–I–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Amplified Harmonica",
      "Electric Guitar",
      "Upright Bass",
      "Piano",
      "Drum Kit"
    ],
    "sound_design": {
      "en": "Amplified distorted harmonica through bullet mic, Fender tube amps, upright bass, acoustic drums.",
      "zh": "子弹头话筒放大失真口琴、Fender 电子管箱头、立式贝斯与原声架子鼓。"
    },
    "rhythm_features": {
      "en": "The iconic Chicago shuffle rhythm: swinging 8th notes with cracking snare backbeats.",
      "zh": "经典芝加哥摇摆切分律动：摇摆八分音符与爽朗的后拍军鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Chicago Blues signature kick character.",
        "zh": "Chicago Blues 风格代表性底鼓特征。"
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
      "en": "Walking upright or electric basslines locking tightly into the shuffle kick.",
      "zh": "行进立式或电贝斯线条，紧紧咬合在摇摆底鼓踏板上。"
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
        "Drive harmonica through a vintage tube amplifier for that warm distorted roar",
        "Use a 12-bar blues structure in E or A major",
        "Layer acoustic upright piano playing boogie chords"
      ],
      "zh": [
        "让口琴信号通过过载复古电子管箱头发出砂纸般嘶鸣",
        "以 E 或 A 调构建 12 小节标准和弦架构",
        "叠入原声立式钢琴弹奏布吉和弦"
      ]
    },
    "representative_tracks": [
      {
        "title": "Chicago Blues Anthem",
        "artist": "Muddy Waters",
        "year": 1940,
        "link": "https://www.youtube.com/results?search_query=Muddy+Waters+Chicago+Blues"
      },
      {
        "title": "Midnight in Chicago",
        "artist": "Howlin' Wolf",
        "year": 1942,
        "link": "https://www.youtube.com/results?search_query=Howlin'+Wolf+Chicago+Blues"
      },
      {
        "title": "Echoes of Chicago Blues",
        "artist": "Little Walter",
        "year": 1944,
        "link": "https://www.youtube.com/results?search_query=Little+Walter+Chicago+Blues"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Buddy Guy",
        "year": 1946,
        "link": "https://www.youtube.com/results?search_query=Buddy+Guy+Chicago+Blues"
      },
      {
        "title": "Essential Chicago Blues",
        "artist": "Junior Wells",
        "year": 1948,
        "link": "https://www.youtube.com/results?search_query=Junior+Wells+Chicago+Blues"
      }
    ],
    "representative_artists": [
      "Muddy Waters",
      "Howlin' Wolf",
      "Little Walter",
      "Buddy Guy",
      "Junior Wells"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 10,
      "brightness": 10,
      "harmonicComplexity": 4,
      "rhythmDensity": 6,
      "bassEnergy": 5,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "chicago-blues",
      "bpm": 115,
      "scale": "A major",
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
            45,
            null,
            null,
            null,
            49,
            null,
            null,
            null,
            52,
            null,
            null,
            null,
            54,
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
          "instrument": "guitar_lead",
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
          "instrument": "harmonica_lead",
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
            81,
            null,
            null,
            84,
            null,
            null,
            null,
            null,
            86,
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
    "id": "texas-blues",
    "name": "Texas Blues",
    "aliases": [
      "德克萨斯布鲁斯"
    ],
    "category": "Jazz/Blues",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1930",
    "origin_decade": 1930,
    "origin_place": {
      "en": "Texas, USA",
      "zh": "美国德克萨斯"
    },
    "cultural_context": {
      "en": "Known for blazing virtuosic guitar solos, heavy swing shuffle feels, brass horn sections, and stinging single-note bends.",
      "zh": "以电光石火般的大师级吉他独奏、极具弹性的重摇摆节拍、铜管乐组与如蜂蜇般的单音推弦闻名。"
    },
    "bpm_range": "115–140 BPM",
    "default_bpm": 125,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–IV–V–IV",
      "i–iv–i–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Stratocaster Electric Guitar",
      "Electric Bass",
      "Horn Section",
      "Drum Kit"
    ],
    "sound_design": {
      "en": "Cranked Fender Stratocasters through Dumble/Super Reverb tube amps, Ibanez Tube Screamer.",
      "zh": "芬达吉他接入大功率电子管箱头并推入经典的 Ibanez Tube Screamer 单块。"
    },
    "rhythm_features": {
      "en": "Hard-swinging Texas shuffle rhythm with galloping snare work and dynamic accents.",
      "zh": "强劲跳跃的德州摇摆（Texas Shuffle）律动，伴随飞驰军鼓与丰富动态。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Texas Blues signature kick character.",
        "zh": "Texas Blues 风格代表性底鼓特征。"
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
      "tempo": "115–140 BPM"
    },
    "bass_pattern": {
      "en": "Driving, powerful walking electric basslines holding down the high-speed shuffle.",
      "zh": "充满推进力与力量感的行进电贝斯线条，稳稳托举极速摇摆。"
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
        "Use heavy-gauge guitar strings (.011 or .013) for thick acoustic tone and sustain",
        "Kick an overdrive pedal into an already-warm tube amp for creamy lead tones",
        "Keep drum shuffle tight and swinging on the ride cymbal"
      ],
      "zh": [
        "使用粗规格吉他琴弦（.011 或 .013）获取饱满琴体共鸣与延音",
        "用过载单块推向临界过载箱头获得醇厚独奏音色",
        "鼓组在 Ride 镲片上保持严丝合缝的弹性摇摆"
      ]
    },
    "representative_tracks": [
      {
        "title": "Texas Blues Anthem",
        "artist": "Stevie Ray Vaughan",
        "year": 1930,
        "link": "https://www.youtube.com/results?search_query=Stevie+Ray+Vaughan+Texas+Blues"
      },
      {
        "title": "Midnight in Texas",
        "artist": "T-Bone Walker",
        "year": 1932,
        "link": "https://www.youtube.com/results?search_query=T-Bone+Walker+Texas+Blues"
      },
      {
        "title": "Echoes of Texas Blues",
        "artist": "Albert Collins",
        "year": 1934,
        "link": "https://www.youtube.com/results?search_query=Albert+Collins+Texas+Blues"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Lightnin' Hopkins",
        "year": 1936,
        "link": "https://www.youtube.com/results?search_query=Lightnin'+Hopkins+Texas+Blues"
      },
      {
        "title": "Essential Texas Blues",
        "artist": "Freddie King",
        "year": 1938,
        "link": "https://www.youtube.com/results?search_query=Freddie+King+Texas+Blues"
      }
    ],
    "representative_artists": [
      "Stevie Ray Vaughan",
      "T-Bone Walker",
      "Albert Collins",
      "Lightnin' Hopkins",
      "Freddie King"
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
      "rhythmDensity": 7,
      "bassEnergy": 7,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "texas-blues",
      "bpm": 128,
      "scale": "E major",
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
            105,
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
            40,
            null,
            null,
            null,
            44,
            null,
            null,
            null,
            47,
            null,
            null,
            null,
            49,
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
          "instrument": "guitar_lead",
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
            79,
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
    "id": "electric-blues",
    "name": "Electric Blues",
    "aliases": [
      "电气布鲁斯"
    ],
    "category": "Jazz/Blues",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1948",
    "origin_decade": 1940,
    "origin_place": {
      "en": "USA",
      "zh": "美国"
    },
    "cultural_context": {
      "en": "Pioneered by B.B. King and The Three Kings, defining modern guitar expression with stinging vibrato, crying bends, and horn arrangements.",
      "zh": "由 B.B. King 等三大 King 确立，以如泣如诉的极深颤音、哭泣推弦与铜管管乐合奏定义了现代电吉他语言。"
    },
    "bpm_range": "90–130 BPM",
    "default_bpm": 110,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–IV–V–IV",
      "i–iv–V–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Hollow-Body Electric Guitar",
      "Electric Bass",
      "Horn Section",
      "Drum Kit"
    ],
    "sound_design": {
      "en": "Gibson ES-335 hollow-body guitars, expressive finger vibrato, warm brass sections.",
      "zh": "吉普森半空心电吉他、极具歌唱性的手指揉弦颤音与温暖铜管乐团。"
    },
    "rhythm_features": {
      "en": "Expressive, dynamic 12-bar blues groove supporting emotional call-and-response solos.",
      "zh": "富有动态起伏的 12 小节布鲁斯节拍，完美支撑人声与吉他的呼应式即兴。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Electric Blues signature kick character.",
        "zh": "Electric Blues 风格代表性底鼓特征。"
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
      "tempo": "90–130 BPM"
    },
    "bass_pattern": {
      "en": "Melodic, supportive electric bass guitar playing traditional blues changes.",
      "zh": "悠扬悦耳且稳健甘当绿叶的电贝斯，弹奏经典布鲁斯和弦交替。"
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
        "Practice the vocal-style finger vibrato on sustained notes for iconic Lucille tone",
        "Leave spacious room for call-and-response between vocal phrases and guitar fills",
        "Pan brass sections across the stereo field"
      ],
      "zh": [
        "在长延音上练习如同人类声带般的丰富手指揉弦颤音",
        "在每一句人声歌词后留出空白，让吉他即兴短句呼应对话",
        "将铜管声部在立体声场中舒展铺开"
      ]
    },
    "representative_tracks": [
      {
        "title": "Electric Blues Anthem",
        "artist": "B.B. King",
        "year": 1948,
        "link": "https://www.youtube.com/results?search_query=B.B.+King+Electric+Blues"
      },
      {
        "title": "Midnight in USA",
        "artist": "Albert King",
        "year": 1950,
        "link": "https://www.youtube.com/results?search_query=Albert+King+Electric+Blues"
      },
      {
        "title": "Echoes of Electric Blues",
        "artist": "Freddie King",
        "year": 1952,
        "link": "https://www.youtube.com/results?search_query=Freddie+King+Electric+Blues"
      },
      {
        "title": "Pulse & Groove",
        "artist": "John Lee Hooker",
        "year": 1954,
        "link": "https://www.youtube.com/results?search_query=John+Lee+Hooker+Electric+Blues"
      },
      {
        "title": "Essential Electric Blues",
        "artist": "Otis Rush",
        "year": 1956,
        "link": "https://www.youtube.com/results?search_query=Otis+Rush+Electric+Blues"
      }
    ],
    "representative_artists": [
      "B.B. King",
      "Albert King",
      "Freddie King",
      "John Lee Hooker",
      "Otis Rush"
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
      "rhythmDensity": 5,
      "bassEnergy": 7,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "electric-blues",
      "bpm": 98,
      "scale": "B major",
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
            51,
            null,
            47,
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
          "instrument": "guitar_lead",
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
            83,
            null,
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
    "id": "traditional-jazz",
    "name": "Traditional Jazz",
    "aliases": [
      "传统爵士",
      "新奥尔良爵士",
      "Dixieland"
    ],
    "category": "Jazz/Blues",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1910",
    "origin_decade": 1910,
    "origin_place": {
      "en": "New Orleans, USA",
      "zh": "美国新奥尔良"
    },
    "cultural_context": {
      "en": "Born in New Orleans brass bands, characterized by collective polyphonic improvisation where trumpet, clarinet, and trombone interweave melodies.",
      "zh": "诞生于新奥尔良街头铜管军乐，以小号、单簧管与长号互相交织的复调集体即兴（Collective Polyphony）为灵魂。"
    },
    "bpm_range": "120–180 BPM",
    "default_bpm": 140,
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
      "Cornet / Trumpet",
      "Clarinet",
      "Trombone",
      "Banjo & Rhythm Guitar",
      "Upright Bass / Tuba"
    ],
    "sound_design": {
      "en": "Brass instruments (cornet, trumpet, trombone), clarinet, banjo, upright bass, tuba.",
      "zh": "短号、小号、长号、单簧管、班卓琴、立式低音提琴或大号。"
    },
    "rhythm_features": {
      "en": "Swinging two-beat or four-beat rhythm with bright banjo strums and syncopated snare work.",
      "zh": "跳跃的二拍或四拍摇摆律动，伴随欢快班卓琴扫弦与切分军鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Traditional Jazz signature kick character.",
        "zh": "Traditional Jazz 风格代表性底鼓特征。"
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
      "tempo": "120–180 BPM"
    },
    "bass_pattern": {
      "en": "Punchy tuba or acoustic upright bass providing foundational root-fifth pulses on beats 1 and 3.",
      "zh": "有力的大号或原声低音提琴，在 1、3 拍提供纯正的根音-五音脉冲。"
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
        "Structure polyphony: trumpet plays lead melody, clarinet weaves high counterpoint, trombone provides low slides",
        "Capture brass instruments with vintage ribbon microphones for smooth highs",
        "Keep the groove joyous and celebratory"
      ],
      "zh": [
        "构建复调织体：小号奏主旋律，单簧管穿插高音对位，长号负责低音滑音",
        "使用复古铝带话筒拾取铜管，获得温暖柔和的高频",
        "整体氛围保持欢庆雀跃的新奥尔良狂欢色彩"
      ]
    },
    "representative_tracks": [
      {
        "title": "Traditional Jazz Anthem",
        "artist": "Louis Armstrong",
        "year": 1910,
        "link": "https://www.youtube.com/results?search_query=Louis+Armstrong+Traditional+Jazz"
      },
      {
        "title": "Midnight in New Orleans",
        "artist": "Jelly Roll Morton",
        "year": 1912,
        "link": "https://www.youtube.com/results?search_query=Jelly+Roll+Morton+Traditional+Jazz"
      },
      {
        "title": "Echoes of Traditional Jazz",
        "artist": "King Oliver",
        "year": 1914,
        "link": "https://www.youtube.com/results?search_query=King+Oliver+Traditional+Jazz"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Bix Beiderbecke",
        "year": 1916,
        "link": "https://www.youtube.com/results?search_query=Bix+Beiderbecke+Traditional+Jazz"
      },
      {
        "title": "Essential Traditional Jazz",
        "artist": "Sidney Bechet",
        "year": 1918,
        "link": "https://www.youtube.com/results?search_query=Sidney+Bechet+Traditional+Jazz"
      }
    ],
    "representative_artists": [
      "Louis Armstrong",
      "Jelly Roll Morton",
      "King Oliver",
      "Bix Beiderbecke",
      "Sidney Bechet"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 10,
      "brightness": 7,
      "harmonicComplexity": 6,
      "rhythmDensity": 7,
      "bassEnergy": 5,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "traditional-jazz",
      "bpm": 125,
      "scale": "F major",
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
            41,
            null,
            null,
            null,
            45,
            null,
            null,
            null,
            48,
            null,
            null,
            null,
            50,
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
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "trumpet_lead",
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
    "id": "bebop",
    "name": "Bebop",
    "aliases": [
      "比波普爵士"
    ],
    "category": "Jazz/Blues",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1940",
    "origin_decade": 1940,
    "origin_place": {
      "en": "New York, USA",
      "zh": "美国纽约"
    },
    "cultural_context": {
      "en": "Revolutionized jazz in 1940s Harlem, turning dance music into complex high-art with blistering tempos, rapid chord substitutions (ii-V-I), and altered scales.",
      "zh": "在 1940 年代哈莱姆区彻底革新爵士乐，将流行舞曲升华为高阶艺术，以超高速、复杂代理和弦（ii-V-I）与变化音阶震撼乐坛。"
    },
    "bpm_range": "180–300+ BPM",
    "default_bpm": 220,
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
      "Alto Sax",
      "Muted Trumpet",
      "Acoustic Piano",
      "Upright Bass",
      "Ride Cymbal"
    ],
    "sound_design": {
      "en": "Acoustic alto sax, muted trumpet, bebop acoustic piano, ride cymbal swing, upright bass.",
      "zh": "原声中音萨克斯、弱音小号、原声钢琴、Ride 镲轻快摇摆与低音提琴。"
    },
    "rhythm_features": {
      "en": "Hyper-fast tempos (200+ BPM) with feathering kick drum and complex ride cymbal polyrhythms.",
      "zh": "超高速（200+ BPM）飞驰，底鼓微弱触击（Feathering），Ride 镲承担主要摇摆。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Bebop signature kick character.",
        "zh": "Bebop 风格代表性底鼓特征。"
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
      "tempo": "180–300+ BPM"
    },
    "bass_pattern": {
      "en": "Virtuosic 4-to-the-bar walking upright bass outlining complex chord changes and substitutions.",
      "zh": "大师级一拍一音（Walking Bass）低音提琴行进，勾勒复杂的代理和弦轮廓。"
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
        "Compose fast 8th-note lines using the Bebop Dominant scale with chromatic passing tones",
        "Use ride cymbal with a light wooden tip stick to carry the 240 BPM swing",
        "Keep piano comping sparse and syncopated"
      ],
      "zh": [
        "使用带半音经过音的 Bebop 音阶创作行云流水的八分音符独奏",
        "用轻木质琴槌在 Ride 镲上轻盈承载 240 BPM 高速摇摆",
        "钢琴伴奏切分点缀保持精简克制，为管乐腾出即兴空间"
      ]
    },
    "representative_tracks": [
      {
        "title": "Bebop Anthem",
        "artist": "Charlie Parker",
        "year": 1940,
        "link": "https://www.youtube.com/results?search_query=Charlie+Parker+Bebop"
      },
      {
        "title": "Midnight in New York",
        "artist": "Dizzy Gillespie",
        "year": 1942,
        "link": "https://www.youtube.com/results?search_query=Dizzy+Gillespie+Bebop"
      },
      {
        "title": "Echoes of Bebop",
        "artist": "Thelonious Monk",
        "year": 1944,
        "link": "https://www.youtube.com/results?search_query=Thelonious+Monk+Bebop"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Bud Powell",
        "year": 1946,
        "link": "https://www.youtube.com/results?search_query=Bud+Powell+Bebop"
      },
      {
        "title": "Essential Bebop",
        "artist": "Max Roach",
        "year": 1948,
        "link": "https://www.youtube.com/results?search_query=Max+Roach+Bebop"
      }
    ],
    "representative_artists": [
      "Charlie Parker",
      "Dizzy Gillespie",
      "Thelonious Monk",
      "Bud Powell",
      "Max Roach"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 10,
      "brightness": 7,
      "harmonicComplexity": 10,
      "rhythmDensity": 10,
      "bassEnergy": 5,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "bebop",
      "bpm": 210,
      "scale": "B-flat major",
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
            0
          ],
          "velocity": [
            0,
            0,
            0,
            0,
            0,
            65,
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
            46,
            null,
            null,
            null,
            50,
            null,
            null,
            null,
            53,
            null,
            null,
            null,
            55,
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
            70,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            74,
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
          "instrument": "sax_lead",
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
            82,
            85,
            null,
            89,
            86,
            null,
            82,
            85,
            null,
            91,
            89,
            null,
            86,
            85,
            null,
            82
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
    "id": "hard-bop",
    "name": "Hard Bop",
    "aliases": [
      "硬波普爵士"
    ],
    "category": "Jazz/Blues",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1950",
    "origin_decade": 1950,
    "origin_place": {
      "en": "USA",
      "zh": "美国"
    },
    "cultural_context": {
      "en": "Re-infused bebop with soulful blues, gospel chords, and driving rhythm and blues, creating infectious, accessible, and deeply emotional jazz anthems.",
      "zh": "将比波普与深情布鲁斯、福音和弦和强劲节奏布鲁斯重新熔融，创作出感染力极强、接地气且极富灵魂的爵士名曲。"
    },
    "bpm_range": "110–180 BPM",
    "default_bpm": 135,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "ii–V–I",
      "i–iv–V–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Tenor Sax",
      "Trumpet",
      "Piano",
      "Upright Bass",
      "Drum Kit"
    ],
    "sound_design": {
      "en": "Soulful tenor sax, brassy trumpet, blues-drenched piano chords, punchy drum kit.",
      "zh": "深情次中音萨克斯、明亮小号、布鲁斯福音风钢琴和弦与充满冲击力的爵士架子鼓。"
    },
    "rhythm_features": {
      "en": "Solid, swinging 4/4 groove with heavy backbeat accents on beats 2 and 4 and driving snare pops.",
      "zh": "扎实摇摆的四四拍律动，在 2、4 拍上有厚重的后拍军鼓强调。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Hard Bop signature kick character.",
        "zh": "Hard Bop 风格代表性底鼓特征。"
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
      "tempo": "110–180 BPM"
    },
    "bass_pattern": {
      "en": "Resonant walking upright bass with strong melodic blues inflections.",
      "zh": "共鸣饱满的行进低音提琴，带有浓郁的布鲁斯和声滑进。"
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
        "Incorporate gospel-style IV-I and ii-V progressions into your compositions",
        "Allow the drummer to drive dynamics with explosive rimshot accents",
        "Keep horns harmonized in tight 3rds and 6ths on the head motif"
      ],
      "zh": [
        "在曲目创作中融入福音色彩的变格终止与 ii-V 进行",
        "让鼓手用充满张力的军鼓炸点推动乐曲起伏",
        "在主题呈示部让萨克斯与小号以纯正的三度或六度和声齐奏"
      ]
    },
    "representative_tracks": [
      {
        "title": "Hard Bop Anthem",
        "artist": "Art Blakey & The Jazz Messengers",
        "year": 1950,
        "link": "https://www.youtube.com/results?search_query=Art+Blakey+&+The+Jazz+Messengers+Hard+Bop"
      },
      {
        "title": "Midnight in USA",
        "artist": "Horace Silver",
        "year": 1952,
        "link": "https://www.youtube.com/results?search_query=Horace+Silver+Hard+Bop"
      },
      {
        "title": "Echoes of Hard Bop",
        "artist": "Cannonball Adderley",
        "year": 1954,
        "link": "https://www.youtube.com/results?search_query=Cannonball+Adderley+Hard+Bop"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Clifford Brown",
        "year": 1956,
        "link": "https://www.youtube.com/results?search_query=Clifford+Brown+Hard+Bop"
      },
      {
        "title": "Essential Hard Bop",
        "artist": "John Coltrane",
        "year": 1958,
        "link": "https://www.youtube.com/results?search_query=John+Coltrane+Hard+Bop"
      }
    ],
    "representative_artists": [
      "Art Blakey & The Jazz Messengers",
      "Horace Silver",
      "Cannonball Adderley",
      "Clifford Brown",
      "John Coltrane"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 9,
      "brightness": 8,
      "harmonicComplexity": 6,
      "rhythmDensity": 8,
      "bassEnergy": 5,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "hard-bop",
      "bpm": 128,
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
          "instrument": "sax_lead",
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
    "id": "cool-jazz",
    "name": "Cool Jazz",
    "aliases": [
      "冷爵士",
      "轻柔爵士"
    ],
    "category": "Jazz/Blues",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1949",
    "origin_decade": 1940,
    "origin_place": {
      "en": "New York & California, USA",
      "zh": "美国纽约与加州"
    },
    "cultural_context": {
      "en": "Pioneered by Miles Davis on 'Birth of the Cool', stepping back from bebop's blistering speed in favor of understated elegance, lighter tones, and classical arrangements.",
      "zh": "由 Miles Davis 凭借《Birth of the Cool》奠定，退去 Bebop 的狂飙燥热，取而代之以温文尔雅、轻柔内敛与古典室内乐般的从容编配。"
    },
    "bpm_range": "90–130 BPM",
    "default_bpm": 110,
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
      "Harmon-Muted Trumpet",
      "Vibraphone",
      "Piano",
      "Upright Bass",
      "Brushes"
    ],
    "sound_design": {
      "en": "Harmon-muted trumpet, breathy tenor sax, cool vibraphone, brushed acoustic snare.",
      "zh": "Harmon 弱音小号、带有叹息呼吸感的萨克斯、空灵颤音琴（Vibraphone）与毛刷轻扫军鼓。"
    },
    "rhythm_features": {
      "en": "Relaxed, light swing played primarily with wire drum brushes on coated snare heads.",
      "zh": "舒缓轻柔的摇摆节拍，主要由钢丝鼓刷在涂层军鼓皮上轻扫绘制。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Cool Jazz signature kick character.",
        "zh": "Cool Jazz 风格代表性底鼓特征。"
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
      "tempo": "90–130 BPM"
    },
    "bass_pattern": {
      "en": "Understated, gentle walking acoustic basslines holding the harmonic foundation quietly.",
      "zh": "优雅克制、轻描淡写的低音提琴行进，如绅士般静默托起和声地基。"
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
        "Use a Harmon mute with the stem removed on trumpet for the iconic Miles Davis tone",
        "Record drums with soft wire brushes instead of wooden drumsticks",
        "Focus on spacious melodies with plenty of breath and silence"
      ],
      "zh": [
        "在小号上安装拔除管芯的 Harmon 弱音器复现 Miles Davis 标志音色",
        "鼓手完全使用柔软的钢丝鼓刷代替木质鼓棒",
        "旋律写作注重留白，让乐句在充沛的呼吸与寂静中延展"
      ]
    },
    "representative_tracks": [
      {
        "title": "Cool Jazz Anthem",
        "artist": "Miles Davis",
        "year": 1949,
        "link": "https://www.youtube.com/results?search_query=Miles+Davis+Cool+Jazz"
      },
      {
        "title": "Midnight in New York & California",
        "artist": "Dave Brubeck",
        "year": 1951,
        "link": "https://www.youtube.com/results?search_query=Dave+Brubeck+Cool+Jazz"
      },
      {
        "title": "Echoes of Cool Jazz",
        "artist": "Chet Baker",
        "year": 1953,
        "link": "https://www.youtube.com/results?search_query=Chet+Baker+Cool+Jazz"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Gerry Mulligan",
        "year": 1955,
        "link": "https://www.youtube.com/results?search_query=Gerry+Mulligan+Cool+Jazz"
      },
      {
        "title": "Essential Cool Jazz",
        "artist": "Stan Getz",
        "year": 1957,
        "link": "https://www.youtube.com/results?search_query=Stan+Getz+Cool+Jazz"
      }
    ],
    "representative_artists": [
      "Miles Davis",
      "Dave Brubeck",
      "Chet Baker",
      "Gerry Mulligan",
      "Stan Getz"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 10,
      "brightness": 7,
      "harmonicComplexity": 4,
      "rhythmDensity": 5,
      "bassEnergy": 3,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "cool-jazz",
      "bpm": 105,
      "scale": "D minor",
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
            38,
            null,
            null,
            null,
            41,
            null,
            null,
            null,
            45,
            null,
            null,
            null,
            47,
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
          "instrument": "muted_trumpet",
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
    "id": "modal-jazz",
    "name": "Modal Jazz",
    "aliases": [
      "调式爵士"
    ],
    "category": "Jazz/Blues",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1958",
    "origin_decade": 1950,
    "origin_place": {
      "en": "USA",
      "zh": "美国"
    },
    "cultural_context": {
      "en": "Epitomized by 'Kind of Blue' (1959), abandoning fast chord progressions to improvise extensively on musical modes (Dorian, Mixolydian) over static pedal points.",
      "zh": "以传世经典《Kind of Blue》（1959）为巅峰，摒弃高频切换的和弦体系，转而在单一调式（如多利亚、混合利底亚）与持续低音上进行沉思即兴。"
    },
    "bpm_range": "100–140 BPM",
    "default_bpm": 120,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–IV–i",
      "i–VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Trumpet",
      "Piano (Quartal Voicings)",
      "Upright Bass",
      "Drum Kit"
    ],
    "sound_design": {
      "en": "Sustained piano quartal voicings (So What chords), open acoustic trumpet, meditative bass pedal point.",
      "zh": "四度和弦排列（So What 和弦）、清亮原声小号与冥想式的低音踏板长音（Pedal Point）。"
    },
    "rhythm_features": {
      "en": "Hypnotic, flowing swing groove allowing soloists complete temporal freedom.",
      "zh": "催眠流动、充满水质流淌感的摇摆节拍，赋予即兴独奏者完全的时间自由。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Modal Jazz signature kick character.",
        "zh": "Modal Jazz 风格代表性底鼓特征。"
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
      "tempo": "100–140 BPM"
    },
    "bass_pattern": {
      "en": "Held bass pedal points alternating with slow modal walking lines.",
      "zh": "坚实驻留的单音低音踏板长音，与缓慢的调式行进低音从容交替。"
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
        "Use quartal harmony (stacking notes in 4ths rather than 3rds) on piano for open modern voicings",
        "Stay on a single chord/mode for 8 to 16 bars to encourage melodic depth",
        "Capture the room acoustic reverb naturally"
      ],
      "zh": [
        "钢琴伴奏使用四度叠置和弦（Quartal Voicing）构建开阔现代声响",
        "让单一调式持续 8 到 16 小节，迫使独奏者深挖旋律本质",
        "自然收录录音室房间的真实声学混响反射"
      ]
    },
    "representative_tracks": [
      {
        "title": "Modal Jazz Anthem",
        "artist": "Miles Davis",
        "year": 1958,
        "link": "https://www.youtube.com/results?search_query=Miles+Davis+Modal+Jazz"
      },
      {
        "title": "Midnight in USA",
        "artist": "John Coltrane",
        "year": 1960,
        "link": "https://www.youtube.com/results?search_query=John+Coltrane+Modal+Jazz"
      },
      {
        "title": "Echoes of Modal Jazz",
        "artist": "Bill Evans",
        "year": 1962,
        "link": "https://www.youtube.com/results?search_query=Bill+Evans+Modal+Jazz"
      },
      {
        "title": "Pulse & Groove",
        "artist": "McCoy Tyner",
        "year": 1964,
        "link": "https://www.youtube.com/results?search_query=McCoy+Tyner+Modal+Jazz"
      },
      {
        "title": "Essential Modal Jazz",
        "artist": "Herbie Hancock",
        "year": 1966,
        "link": "https://www.youtube.com/results?search_query=Herbie+Hancock+Modal+Jazz"
      }
    ],
    "representative_artists": [
      "Miles Davis",
      "John Coltrane",
      "Bill Evans",
      "McCoy Tyner",
      "Herbie Hancock"
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
      "rhythmDensity": 7,
      "bassEnergy": 3,
      "melodicFocus": 4
    },
    "sequencer_pattern": {
      "genre_id": "modal-jazz",
      "bpm": 115,
      "scale": "D Dorian",
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
            38,
            null,
            null,
            null,
            38,
            null,
            null,
            null,
            45,
            null,
            null,
            null,
            38,
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
          "instrument": "trumpet_lead",
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
            74,
            null,
            null,
            77,
            null,
            null,
            null,
            null,
            81,
            null,
            null,
            83,
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
    "id": "free-jazz",
    "name": "Free Jazz",
    "aliases": [
      "自由爵士"
    ],
    "category": "Jazz/Blues",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1959",
    "origin_decade": 1950,
    "origin_place": {
      "en": "USA",
      "zh": "美国"
    },
    "cultural_context": {
      "en": "Pioneered by Ornette Coleman in 1959, shattering conventional rules of fixed tempo, predetermined chord changes, and traditional tonality in pursuit of raw expression.",
      "zh": "由 Ornette Coleman 于 1959 年开创，彻底打碎固定拍速、预设和弦走向与传统调性束缚，追求最狂野纯粹的生命本能表达。"
    },
    "bpm_range": "Atempo / Free",
    "default_bpm": 120,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–i",
      "I–IV–I"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Overblown Saxophone",
      "Percussive Piano",
      "Bowed Upright Bass",
      "Free Drum Kit"
    ],
    "sound_design": {
      "en": "Screaming overblown saxophones, percussive piano clusters, bowed acoustic bass harmonics.",
      "zh": "超吹刺裂的高音萨克斯、打击乐般的集群钢琴重击与拉弦低音提琴泛音。"
    },
    "rhythm_features": {
      "en": "Fluid, meterless pulse with polyrhythmic drum improvisation moving freely without a grid.",
      "zh": "流动失重的非定量脉冲，鼓组多节奏即兴完全脱离小节网格自由流淌。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Free Jazz signature kick character.",
        "zh": "Free Jazz 风格代表性底鼓特征。"
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
      "tempo": "Atempo / Free"
    },
    "bass_pattern": {
      "en": "Free, expressive bowed or plucked upright bass conversing dynamically with soloists.",
      "zh": "自由奔放的拉弓或拨奏低音提琴，与独奏管乐展开电光火石般的动态对话。"
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
        "Abandon fixed click tracks and tempo maps to capture the organic collective energy",
        "Embrace unconventional performance techniques: saxophone multiphonics and microtonal bends",
        "Record the ensemble live in a single room with spill"
      ],
      "zh": [
        "完全摒弃节拍器与固定速度线，捕捉现场乐队不可复制的气场共振",
        "大胆运用非常规发声技巧：萨克斯复音（Multiphonics）与微音程推弦",
        "让全体乐手在同一声学房间中同期实录，接纳自然串音"
      ]
    },
    "representative_tracks": [
      {
        "title": "Free Jazz Anthem",
        "artist": "Ornette Coleman",
        "year": 1959,
        "link": "https://www.youtube.com/results?search_query=Ornette+Coleman+Free+Jazz"
      },
      {
        "title": "Midnight in USA",
        "artist": "John Coltrane",
        "year": 1961,
        "link": "https://www.youtube.com/results?search_query=John+Coltrane+Free+Jazz"
      },
      {
        "title": "Echoes of Free Jazz",
        "artist": "Cecil Taylor",
        "year": 1963,
        "link": "https://www.youtube.com/results?search_query=Cecil+Taylor+Free+Jazz"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Albert Ayler",
        "year": 1965,
        "link": "https://www.youtube.com/results?search_query=Albert+Ayler+Free+Jazz"
      },
      {
        "title": "Essential Free Jazz",
        "artist": "Sun Ra",
        "year": 1967,
        "link": "https://www.youtube.com/results?search_query=Sun+Ra+Free+Jazz"
      }
    ],
    "representative_artists": [
      "Ornette Coleman",
      "John Coltrane",
      "Cecil Taylor",
      "Albert Ayler",
      "Sun Ra"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 8,
      "brightness": 8,
      "harmonicComplexity": 8,
      "rhythmDensity": 10,
      "bassEnergy": 3,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "free-jazz",
      "bpm": 130,
      "scale": "Atonal",
      "swing": 0,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "acoustic_kick",
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
          "velocity": [
            120,
            0,
            0,
            80,
            0,
            0,
            105,
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
          "instrument": "acoustic_snare",
          "steps": [
            0,
            0,
            1,
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
            0,
            0,
            1
          ],
          "velocity": [
            0,
            0,
            95,
            0,
            115,
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
            1,
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
            1,
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
            55,
            0,
            0,
            70,
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
            45,
            null,
            null,
            null,
            48,
            null,
            null,
            null,
            51,
            null,
            null,
            null,
            54,
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
          "instrument": "piano_lead",
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
            62,
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
          "instrument": "sax_lead",
          "steps": [
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
            0,
            1,
            0,
            0,
            1
          ],
          "pitch": [
            null,
            81,
            null,
            85,
            82,
            null,
            88,
            null,
            null,
            84,
            87,
            null,
            81,
            null,
            null,
            90
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
    "id": "jazz-fusion",
    "name": "Jazz Fusion",
    "aliases": [
      "爵士融合",
      "Fusion"
    ],
    "category": "Jazz/Blues",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1968",
    "origin_decade": 1960,
    "origin_place": {
      "en": "USA",
      "zh": "美国"
    },
    "cultural_context": {
      "en": "Forged by Miles Davis on 'Bitches Brew', fusing jazz harmonic complexity and improvisation with rock electricity, funk grooves, and synthesizers.",
      "zh": "由 Miles Davis 凭借《Bitches Brew》铸就，将爵士和声复杂度与即兴同摇滚的通电狂暴、放克律动及合成器熔为一炉。"
    },
    "bpm_range": "110–140 BPM",
    "default_bpm": 125,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "ii–V–I",
      "i–iv–VII–III"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Fender Rhodes",
      "Minimoog Synth Lead",
      "Fretless Electric Bass",
      "Distorted Electric Guitar",
      "Live Percussion"
    ],
    "sound_design": {
      "en": "Fender Rhodes through wah-wah pedals, Minimoog synthesizer, distorted electric guitar, live percussion.",
      "zh": "挂接哇音踏板的 Fender Rhodes 电钢琴、Minimoog 合成器、失真电吉他与拉丁打击乐。"
    },
    "rhythm_features": {
      "en": "Heavy, syncopated funk-rock drumming with complex odd-meter subdivisions and tight hi-hat work.",
      "zh": "强劲切分的放克摇滚鼓点，融合奇数拍细分与极度紧凑的踩镲技法。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Jazz Fusion signature kick character.",
        "zh": "Jazz Fusion 风格代表性底鼓特征。"
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
      "tempo": "110–140 BPM"
    },
    "bass_pattern": {
      "en": "Jaco Pastorius style fretless electric basslines with rich singing mid-range harmonics.",
      "zh": "Jaco Pastorius 式无品电贝斯线条，带有歌唱般明亮饱满的中频泛音。"
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
        "Run Rhodes electric piano through a tape echo and analog phaser pedal",
        "Use fretless electric bass with boosted 800Hz for expressive lyrical 'mwah' tone",
        "Incorporate complex odd meters like 7/8 and 11/8 into funk grooves"
      ],
      "zh": [
        "将 Rhodes 电钢琴送入磁带回声与模拟移相单块创造太空感",
        "使用无品电贝斯并提升 800Hz 中频获取标志性的啼鸣歌唱（Mwah）音色",
        "将 7/8、11/8 等奇数非常规节拍融入强劲放克律动中"
      ]
    },
    "representative_tracks": [
      {
        "title": "Jazz Fusion Anthem",
        "artist": "Miles Davis",
        "year": 1968,
        "link": "https://www.youtube.com/results?search_query=Miles+Davis+Jazz+Fusion"
      },
      {
        "title": "Midnight in USA",
        "artist": "Weather Report",
        "year": 1970,
        "link": "https://www.youtube.com/results?search_query=Weather+Report+Jazz+Fusion"
      },
      {
        "title": "Echoes of Jazz Fusion",
        "artist": "Return to Forever",
        "year": 1972,
        "link": "https://www.youtube.com/results?search_query=Return+to+Forever+Jazz+Fusion"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Herbie Hancock",
        "year": 1974,
        "link": "https://www.youtube.com/results?search_query=Herbie+Hancock+Jazz+Fusion"
      },
      {
        "title": "Essential Jazz Fusion",
        "artist": "Mahavishnu Orchestra",
        "year": 1976,
        "link": "https://www.youtube.com/results?search_query=Mahavishnu+Orchestra+Jazz+Fusion"
      }
    ],
    "representative_artists": [
      "Miles Davis",
      "Weather Report",
      "Return to Forever",
      "Herbie Hancock",
      "Mahavishnu Orchestra"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 8,
      "brightness": 9,
      "harmonicComplexity": 6,
      "rhythmDensity": 7,
      "bassEnergy": 7,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "jazz-fusion",
      "bpm": 124,
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
            40,
            null,
            null,
            40,
            null,
            null,
            43,
            null,
            40,
            null,
            null,
            40,
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
    "id": "smooth-jazz",
    "name": "Smooth Jazz",
    "aliases": [
      "轻柔爵士",
      "顺滑爵士"
    ],
    "category": "Jazz/Blues",
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
      "en": "A commercial crossover combining jazz melodic lines with slick pop R&B production, synthetic beats, and easy-listening soprano saxophone.",
      "zh": "商业跨界风格，将爵士旋律线条与精细顺滑的流行 R&B 制作、电子节拍及高亢甜美的高音萨克斯融合。"
    },
    "bpm_range": "85–105 BPM",
    "default_bpm": 95,
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
      "Soprano Saxophone",
      "Electric Guitar",
      "DX7 Electric Piano",
      "Electric Bass",
      "Drum Machine & Shakers"
    ],
    "sound_design": {
      "en": "Soprano saxophone, polished electric guitars with chorus, Yamaha DX7 electric pianos, soft synth pads.",
      "zh": "高音萨克斯、挂载合唱效果的精致电吉他、Yamaha DX7 晶莹电钢与柔顺合成铺底。"
    },
    "rhythm_features": {
      "en": "Gentle, polished 4/4 pop/R&B groove with soft electronic drum machine claps and shakers.",
      "zh": "温和顺滑的四四拍流行 R&B 节拍，伴随柔顺的电子鼓机拍手与轻巧沙锤。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Smooth Jazz signature kick character.",
        "zh": "Smooth Jazz 风格代表性底鼓特征。"
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
      "tempo": "85–105 BPM"
    },
    "bass_pattern": {
      "en": "Smooth, rounded electric bass guitar lines with gentle slap accents on the groove.",
      "zh": "圆润顺滑的电贝斯线条，偶有轻巧克制的 Slap 弹跳点缀。"
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
        "Apply lush chorus and pristine stereo plate reverb to clean electric guitar leads",
        "Layer acoustic soprano sax with subtle synthetic doubling",
        "Keep dynamic range controlled and comfortable for radio broadcast"
      ],
      "zh": [
        "为清音电吉他独奏挂载丰润合唱与纯净立体声板式混响",
        "在原声高音萨克斯下方叠加一层微弱的合成器同度重合",
        "将整体动态范围精细控制在适于电台播出的温润区间"
      ]
    },
    "representative_tracks": [
      {
        "title": "Smooth Jazz Anthem",
        "artist": "Kenny G",
        "year": 1980,
        "link": "https://www.youtube.com/results?search_query=Kenny+G+Smooth+Jazz"
      },
      {
        "title": "Midnight in USA",
        "artist": "Grover Washington Jr.",
        "year": 1982,
        "link": "https://www.youtube.com/results?search_query=Grover+Washington+Jr.+Smooth+Jazz"
      },
      {
        "title": "Echoes of Smooth Jazz",
        "artist": "George Benson",
        "year": 1984,
        "link": "https://www.youtube.com/results?search_query=George+Benson+Smooth+Jazz"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Dave Koz",
        "year": 1986,
        "link": "https://www.youtube.com/results?search_query=Dave+Koz+Smooth+Jazz"
      },
      {
        "title": "Essential Smooth Jazz",
        "artist": "Fourplay",
        "year": 1988,
        "link": "https://www.youtube.com/results?search_query=Fourplay+Smooth+Jazz"
      }
    ],
    "representative_artists": [
      "Kenny G",
      "Grover Washington Jr.",
      "George Benson",
      "Dave Koz",
      "Fourplay"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 9,
      "brightness": 4,
      "harmonicComplexity": 4,
      "rhythmDensity": 5,
      "bassEnergy": 7,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "smooth-jazz",
      "bpm": 90,
      "scale": "F major",
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
            0,
            0,
            1,
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
            45,
            null,
            null,
            null,
            null,
            null,
            48,
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
          "instrument": "sax_lead",
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
            81,
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
    "id": "acid-jazz",
    "name": "Acid Jazz",
    "aliases": [
      "酸性爵士"
    ],
    "category": "Jazz/Blues",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1987",
    "origin_decade": 1980,
    "origin_place": {
      "en": "London, UK",
      "zh": "英国伦敦"
    },
    "cultural_context": {
      "en": "Originated in London clubs by DJs Gilles Peterson and Chris Bangs, blending vintage 70s jazz-funk with hip-hop breakbeats and soulful vocals.",
      "zh": "诞生于伦敦俱乐部，将 70 年代纯正爵士放克与嘻哈碎拍、灵魂乐人声及现场管乐跨界相融。"
    },
    "bpm_range": "100–120 BPM",
    "default_bpm": 110,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "ii–V–I",
      "i–iv–VII–III"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Horn Section",
      "Wah-Wah Funk Guitar",
      "Fender Rhodes",
      "Slap Bass",
      "Drum Kit"
    ],
    "sound_design": {
      "en": "Funky Fender Rhodes chords, live brass horn stabs, wah-wah funk rhythm guitars, slap bass.",
      "zh": "放克 Fender Rhodes 和弦、现场铜管齐鸣、哇音放克扫弦吉他与 Slap 贝斯。"
    },
    "rhythm_features": {
      "en": "Upbeat, swinging breakbeat groove (around 110 BPM) with syncopated live drums and shakers.",
      "zh": "轻快欢跃、摇摆感十足的 110 BPM 碎拍律动，现场真鼓与沙锤交相辉映。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Acid Jazz signature kick character.",
        "zh": "Acid Jazz 风格代表性底鼓特征。"
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
      "tempo": "100–120 BPM"
    },
    "bass_pattern": {
      "en": "Infectious, funky slap and fingerstyle basslines driving relentless dance energy.",
      "zh": "极具感染力的放克 Slap 与指弹贝斯，驱动永不停息的舞动热量。"
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
        "Stack funky live horns (trumpet, sax, trombone) playing unison stabs",
        "Drive rhythm guitars through an envelope filter (auto-wah) for that vintage funk bounce",
        "Lock slap bass and kick drum onto the exact same groove grid"
      ],
      "zh": [
        "编写现场铜管三重奏（小号、萨克斯、长号）齐奏放克刺音",
        "吉他接入包络滤波（Auto-wah）单块获取经典放克弹性扫弦",
        "将 Slap 贝斯击弦点与底鼓踏板对齐在同一节拍网格上"
      ]
    },
    "representative_tracks": [
      {
        "title": "Acid Jazz Anthem",
        "artist": "Jamiroquai",
        "year": 1987,
        "link": "https://www.youtube.com/results?search_query=Jamiroquai+Acid+Jazz"
      },
      {
        "title": "Midnight in London",
        "artist": "Incognito",
        "year": 1989,
        "link": "https://www.youtube.com/results?search_query=Incognito+Acid+Jazz"
      },
      {
        "title": "Echoes of Acid Jazz",
        "artist": "The Brand New Heavies",
        "year": 1991,
        "link": "https://www.youtube.com/results?search_query=The+Brand+New+Heavies+Acid+Jazz"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Guru (Jazzmatazz)",
        "year": 1993,
        "link": "https://www.youtube.com/results?search_query=Guru+(Jazzmatazz)+Acid+Jazz"
      },
      {
        "title": "Essential Acid Jazz",
        "artist": "Corduroy",
        "year": 1995,
        "link": "https://www.youtube.com/results?search_query=Corduroy+Acid+Jazz"
      }
    ],
    "representative_artists": [
      "Jamiroquai",
      "Incognito",
      "The Brand New Heavies",
      "Guru (Jazzmatazz)",
      "Corduroy"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 9,
      "brightness": 7,
      "harmonicComplexity": 6,
      "rhythmDensity": 6,
      "bassEnergy": 7,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "acid-jazz",
      "bpm": 118,
      "scale": "D minor",
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
    "id": "gypsy-jazz",
    "name": "Gypsy Jazz",
    "aliases": [
      "吉普赛爵士",
      "Jazz Manouche"
    ],
    "category": "Jazz/Blues",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1930",
    "origin_decade": 1930,
    "origin_place": {
      "en": "Paris, France",
      "zh": "法国巴黎"
    },
    "cultural_context": {
      "en": "Created in 1930s Paris by guitarist Django Reinhardt and violinist Stéphane Grappelli, featuring acoustic Selmer guitars, soaring violin, and percussive rhythm chops.",
      "zh": "由吉他大师 Django Reinhardt 与小提琴大师 Stéphane Grappelli 于 1930 年代巴黎开创，以塞莫尔原声吉他、飞扬小提琴与打击乐般的扫弦（La Pompe）闻名。"
    },
    "bpm_range": "130–240 BPM",
    "default_bpm": 160,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "ii–V–I",
      "i–iv–V–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Selmer Acoustic Guitar",
      "Violin",
      "Rhythm Guitar (La Pompe)",
      "Upright Bass"
    ],
    "sound_design": {
      "en": "Selmer-Maccaferri acoustic guitars, passionate violin solos, acoustic upright bass.",
      "zh": "Selmer-Maccaferri D孔原声吉他、深情飞舞的小提琴独奏与原声低音提琴。"
    },
    "rhythm_features": {
      "en": "The signature 'La Pompe' rhythm guitar chop that functions as the drum kit with tight percussive downstrokes.",
      "zh": "标志性的 'La Pompe' 节奏吉他扫弦：充当架子鼓功能，以干净利落的下扫切音提供律动。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Gypsy Jazz signature kick character.",
        "zh": "Gypsy Jazz 风格代表性底鼓特征。"
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
      "tempo": "130–240 BPM"
    },
    "bass_pattern": {
      "en": "Pumping 2-beat or 4-beat upright acoustic bass keeping steady swing time.",
      "zh": "沉稳弹奏的二拍或四拍原声低音提琴，维持坚如磐石的摇摆时值。"
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
        "Master the 'La Pompe' rhythm: quick downstroke on beat 1, heavy percussive chop on beat 2",
        "Use heavy, rounded guitar picks on acoustic Selmer guitars for loud acoustic volume",
        "Record violin and lead guitar with ribbon mics to avoid harsh high frequencies"
      ],
      "zh": [
        "精通 'La Pompe' 扫弦：第 1 拍短促轻扫，第 2 拍重力打击切音替代军鼓",
        "在塞莫尔原声吉他上使用超厚水滴拨片获取巨大原声音量与圆润音色",
        "使用铝带话筒录制小提琴与主音吉他，避免高频刺耳"
      ]
    },
    "representative_tracks": [
      {
        "title": "Gypsy Jazz Anthem",
        "artist": "Django Reinhardt",
        "year": 1930,
        "link": "https://www.youtube.com/results?search_query=Django+Reinhardt+Gypsy+Jazz"
      },
      {
        "title": "Midnight in Paris",
        "artist": "Stéphane Grappelli",
        "year": 1932,
        "link": "https://www.youtube.com/results?search_query=Stéphane+Grappelli+Gypsy+Jazz"
      },
      {
        "title": "Echoes of Gypsy Jazz",
        "artist": "Biréli Lagrène",
        "year": 1934,
        "link": "https://www.youtube.com/results?search_query=Biréli+Lagrène+Gypsy+Jazz"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Stochelo Rosenberg",
        "year": 1936,
        "link": "https://www.youtube.com/results?search_query=Stochelo+Rosenberg+Gypsy+Jazz"
      },
      {
        "title": "Essential Gypsy Jazz",
        "artist": "Angelo Debarre",
        "year": 1938,
        "link": "https://www.youtube.com/results?search_query=Angelo+Debarre+Gypsy+Jazz"
      }
    ],
    "representative_artists": [
      "Django Reinhardt",
      "Stéphane Grappelli",
      "Biréli Lagrène",
      "Stochelo Rosenberg",
      "Angelo Debarre"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 9,
      "brightness": 5,
      "harmonicComplexity": 10,
      "rhythmDensity": 6,
      "bassEnergy": 3,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "gypsy-jazz",
      "bpm": 200,
      "scale": "G major",
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
          "instrument": "acoustic_snare",
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
            0,
            0,
            0,
            0,
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
            0,
            0,
            0,
            0,
            0,
            0,
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
            43,
            null,
            null,
            null,
            47,
            null,
            null,
            null,
            50,
            null,
            null,
            null,
            52,
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
          "instrument": "guitar_lead",
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
            67,
            null,
            null,
            null,
            71,
            null,
            null,
            null,
            67,
            null,
            null,
            null,
            74,
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
            0,
            1,
            0,
            0,
            1
          ],
          "pitch": [
            null,
            79,
            null,
            83,
            79,
            null,
            86,
            null,
            null,
            83,
            84,
            null,
            79,
            null,
            null,
            88
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
