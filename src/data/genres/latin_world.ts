import { Genre } from '../../types/genre';

export const LATIN_WORLD_GENRES: Genre[] = [
  {
    "id": "salsa",
    "name": "Salsa",
    "aliases": [
      "萨尔萨音乐"
    ],
    "category": "Latin/World",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1965",
    "origin_decade": 1960,
    "origin_place": {
      "en": "New York, Cuba & Puerto Rico",
      "zh": "纽约、古巴与波多黎各"
    },
    "cultural_context": {
      "en": "Developed in 1960s New York by Cuban and Puerto Rican immigrants, structured around the sacred Clave rhythm with furious brass, montuno piano, and congas.",
      "zh": "1960 年代由古巴与波多黎各移民在纽约确立，以神圣的克拉维节奏（Clave）为骨架，伴随咆哮铜管、Montuno 钢琴与康加鼓。"
    },
    "bpm_range": "160–220 BPM",
    "default_bpm": 180,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–V–i",
      "I–IV–V–I"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Trumpet Section",
      "Piano Montuno",
      "Upright Bass (Tumbao)",
      "Congas & Bongos",
      "Timbales"
    ],
    "sound_design": {
      "en": "Acoustic congas (tumbao), bongo, timbales, piano montuno, bright trumpet section.",
      "zh": "康加鼓 Tumbao 律动、邦戈鼓、天巴鼓、Montuno 钢琴琶音与明亮小号乐组。"
    },
    "rhythm_features": {
      "en": "Structured strictly around the 3:2 or 2:3 Son Clave with complex syncopated polyrhythms.",
      "zh": "严格围绕 3:2 或 2:3 的 Son Clave 击拍为核心，展开复杂的切分多重打击乐。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Salsa signature kick character.",
        "zh": "Salsa 风格代表性底鼓特征。"
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
      "tempo": "160–220 BPM"
    },
    "bass_pattern": {
      "en": "The iconic 'Tumbao' bass: anticipating the root on the offbeat of beat 2 and beat 4, avoiding beat 1.",
      "zh": "标志性 Tumbao 贝斯：刻意避开第 1 拍，而在第 2 拍反拍与第 4 拍提前预击根音。"
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
        "Lock the entire arrangement strictly to either 3:2 or 2:3 Clave orientation",
        "The bass must play the anticipatory Tumbao pattern (silent on 1, hitting on 4)",
        "Layer timbales fills right before brass horn section explosions"
      ],
      "zh": [
        "整首编曲必须严格统一遵循 3:2 或 2:3 的 Clave 律动朝向",
        "贝斯必须演奏标志性抢拍 Tumbao 律动（第 1 拍休止，在第 4 拍重弹）",
        "在铜管爆发前安插华丽的天巴鼓滚奏（Abanico）"
      ]
    },
    "representative_tracks": [
      {
        "title": "Salsa Anthem",
        "artist": "Celia Cruz",
        "year": 1965,
        "link": "https://www.youtube.com/results?search_query=Celia+Cruz+Salsa"
      },
      {
        "title": "Midnight in New York",
        "artist": "Héctor Lavoe",
        "year": 1967,
        "link": "https://www.youtube.com/results?search_query=Héctor+Lavoe+Salsa"
      },
      {
        "title": "Echoes of Salsa",
        "artist": "Willie Colón",
        "year": 1969,
        "link": "https://www.youtube.com/results?search_query=Willie+Colón+Salsa"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Tito Puente",
        "year": 1971,
        "link": "https://www.youtube.com/results?search_query=Tito+Puente+Salsa"
      },
      {
        "title": "Essential Salsa",
        "artist": "Fania All-Stars",
        "year": 1973,
        "link": "https://www.youtube.com/results?search_query=Fania+All-Stars+Salsa"
      }
    ],
    "representative_artists": [
      "Celia Cruz",
      "Héctor Lavoe",
      "Willie Colón",
      "Tito Puente",
      "Fania All-Stars"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 9,
      "harmonicComplexity": 8,
      "rhythmDensity": 9,
      "bassEnergy": 3,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "salsa",
      "bpm": 100,
      "scale": "C minor",
      "swing": 0,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "punchy_kick",
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
          "velocity": [
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
            0,
            0,
            0
          ],
          "velocity": [
            85,
            0,
            0,
            55,
            0,
            0,
            70,
            0,
            0,
            0,
            70,
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
            36,
            null,
            null,
            null,
            null,
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
          "instrument": "piano_lead",
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
            1,
            0,
            0,
            1,
            0,
            0,
            0
          ],
          "pitch": [
            60,
            null,
            null,
            63,
            null,
            null,
            67,
            null,
            null,
            60,
            null,
            null,
            63,
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
    "id": "bachata",
    "name": "Bachata",
    "aliases": [
      "巴恰塔"
    ],
    "category": "Latin/World",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1961",
    "origin_decade": 1960,
    "origin_place": {
      "en": "Dominican Republic",
      "zh": "多米尼加共和国"
    },
    "cultural_context": {
      "en": "Born in the rural Dominican Republic, evolving into a global romantic sensation driven by intricate acoustic Requinto guitar arpeggios, bongo, and güira.",
      "zh": "诞生于多米尼加乡村，由精致凄美的小吉他（Requinto）分解琶音、邦戈鼓与金属刮器（Güira）驱动，演化为全球浪漫舞曲。"
    },
    "bpm_range": "115–140 BPM",
    "default_bpm": 125,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–V–i",
      "i–VII–VI–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Requinto Acoustic Guitar",
      "Electric Bass",
      "Bongo & Güira",
      "Rhythm Guitar"
    ],
    "sound_design": {
      "en": "Requinto acoustic guitar with chorus pedal, bongo, güira metal scraper, electric bass.",
      "zh": "挂接合唱单块的 Requinto 木吉他、邦戈鼓、金属刮管（Güira）与电贝斯。"
    },
    "rhythm_features": {
      "en": "4/4 Latin rhythm characterized by the iconic bongo syncopation with pop accent on beat 4.",
      "zh": "4/4 拍拉丁律动，第 4 拍上带有鲜明跳跃的重音提拍。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Bachata signature kick character.",
        "zh": "Bachata 风格代表性底鼓特征。"
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
      "en": "Syncopated, melodic bassline playing root on beat 1 and hopping rhythmically onto beat 4.",
      "zh": "切分悦耳的贝斯线条，在第 1 拍落根音，并在第 4 拍伴随人声轻盈起跳。"
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
        "Apply vintage stereo chorus to the acoustic Requinto lead guitar for authentic modern tone",
        "The güira metal scraper must carry a continuous 16th-note driving friction rhythm",
        "Accent the 4th beat with an open bongo pop"
      ],
      "zh": [
        "为原声小吉他挂载复古立体声合唱单块获得现代标志音色",
        "金属刮管（Güira）必须持续演奏推进性的十六分音符摩擦律动",
        "在第 4 拍用开音邦戈鼓击打强调标志性起拍"
      ]
    },
    "representative_tracks": [
      {
        "title": "Bachata Anthem",
        "artist": "Aventura",
        "year": 1961,
        "link": "https://www.youtube.com/results?search_query=Aventura+Bachata"
      },
      {
        "title": "Midnight in Dominican Republic",
        "artist": "Romeo Santos",
        "year": 1963,
        "link": "https://www.youtube.com/results?search_query=Romeo+Santos+Bachata"
      },
      {
        "title": "Echoes of Bachata",
        "artist": "Juan Luis Guerra",
        "year": 1965,
        "link": "https://www.youtube.com/results?search_query=Juan+Luis+Guerra+Bachata"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Prince Royce",
        "year": 1967,
        "link": "https://www.youtube.com/results?search_query=Prince+Royce+Bachata"
      },
      {
        "title": "Essential Bachata",
        "artist": "Frank Reyes",
        "year": 1969,
        "link": "https://www.youtube.com/results?search_query=Frank+Reyes+Bachata"
      }
    ],
    "representative_artists": [
      "Aventura",
      "Romeo Santos",
      "Juan Luis Guerra",
      "Prince Royce",
      "Frank Reyes"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 8,
      "brightness": 7,
      "harmonicComplexity": 4,
      "rhythmDensity": 9,
      "bassEnergy": 5,
      "melodicFocus": 9
    },
    "sequencer_pattern": {
      "genre_id": "bachata",
      "bpm": 130,
      "scale": "A minor",
      "swing": 10,
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
            0,
            0,
            115,
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
          "instrument": "guitar_lead",
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
            69,
            null,
            72,
            null,
            69,
            null,
            76,
            null,
            69,
            null,
            72,
            null,
            69,
            null,
            77,
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
            81,
            null,
            null,
            84,
            null,
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
    "id": "reggae",
    "name": "Reggae",
    "aliases": [
      "雷鬼乐"
    ],
    "category": "Latin/World",
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
      "en": "Originated in late-60s Kingston out of rocksteady and ska, anchored by Rastafari spirituality, the signature One-Drop drum beat, and offbeat guitar skanks.",
      "zh": "60 年代末发源于牙买加金斯敦，依托拉斯塔法里精神，以标志性的 One-Drop 鼓点与反拍吉他切弦（Skank）重塑世界音乐。"
    },
    "bpm_range": "60–90 BPM",
    "default_bpm": 75,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–IV–V–IV",
      "i–VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Electric Bass",
      "Hammond Organ",
      "Offbeat Rhythm Guitar",
      "Horn Section",
      "One-Drop Drum Kit"
    ],
    "sound_design": {
      "en": "Offbeat chop guitar (skank), Hammond organ bubble, heavy flatwound electric bass, rimshots.",
      "zh": "反拍切音吉他（Skank）、Hammond 管风琴气泡弹奏、纯平卷弦重低音贝斯与边击军鼓。"
    },
    "rhythm_features": {
      "en": "The iconic 'One Drop' beat: the kick and snare hit together strictly on beat 3 while beat 1 is silent.",
      "zh": "标志性 'One Drop' 鼓点：第 1 拍完全留空，底鼓与军鼓在第 3 拍同时重击下坠。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Reggae signature kick character.",
        "zh": "Reggae 风格代表性底鼓特征。"
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
      "tempo": "60–90 BPM"
    },
    "bass_pattern": {
      "en": "Deep, foundational, highly melodic electric basslines that define the song identity.",
      "zh": "深沉圆润、作为整首歌曲灵魂支柱的旋律化电贝斯线条。"
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
        "Never hit the kick on beat 1; let the bassline and rhythm guitar carry the downbeat",
        "Double the offbeat guitar skank with a Hammond organ 'bubble' on the 16th-note upbeats",
        "Keep the bass tone warm by cutting high frequencies above 1kHz"
      ],
      "zh": [
        "第 1 拍坚决不敲底鼓，让贝斯与反拍吉他承载首拍律动",
        "反拍吉他切弦与 Hammond 风琴十六分音符气泡弹奏紧密咬合",
        "彻底切除贝斯 1kHz 以上的高频，只保留醇厚如大地的低频"
      ]
    },
    "representative_tracks": [
      {
        "title": "Reggae Anthem",
        "artist": "Bob Marley & The Wailers",
        "year": 1968,
        "link": "https://www.youtube.com/results?search_query=Bob+Marley+&+The+Wailers+Reggae"
      },
      {
        "title": "Midnight in Kingston",
        "artist": "Peter Tosh",
        "year": 1970,
        "link": "https://www.youtube.com/results?search_query=Peter+Tosh+Reggae"
      },
      {
        "title": "Echoes of Reggae",
        "artist": "Burning Spear",
        "year": 1972,
        "link": "https://www.youtube.com/results?search_query=Burning+Spear+Reggae"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Dennis Brown",
        "year": 1974,
        "link": "https://www.youtube.com/results?search_query=Dennis+Brown+Reggae"
      },
      {
        "title": "Essential Reggae",
        "artist": "Black Uhuru",
        "year": 1976,
        "link": "https://www.youtube.com/results?search_query=Black+Uhuru+Reggae"
      }
    ],
    "representative_artists": [
      "Bob Marley & The Wailers",
      "Peter Tosh",
      "Burning Spear",
      "Dennis Brown",
      "Black Uhuru"
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
      "rhythmDensity": 3,
      "bassEnergy": 7,
      "melodicFocus": 4
    },
    "sequencer_pattern": {
      "genre_id": "reggae",
      "bpm": 78,
      "scale": "G minor",
      "swing": 10,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "acoustic_kick",
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
          "instrument": "brass_section",
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
    "id": "dancehall",
    "name": "Dancehall",
    "aliases": [
      "舞厅雷鬼"
    ],
    "category": "Latin/World",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1977",
    "origin_decade": 1970,
    "origin_place": {
      "en": "Kingston, Jamaica",
      "zh": "牙买加金斯敦"
    },
    "cultural_context": {
      "en": "Evolved from reggae with digital Casio MT-40 riddims (Sleng Teng), energetic deejay toasting, hard synthetic drums, and raw party energy.",
      "zh": "脱胎于雷鬼，以 Casio MT-40 键盘开创的数码 Riddim（如 Sleng Teng）为里程碑，具备狂野喊麦与硬朗电子鼓组。"
    },
    "bpm_range": "90–115 BPM",
    "default_bpm": 100,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–VII–i",
      "i–iv–i–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Digital Casio Synth",
      "Sub Bass",
      "Rhodes Keys",
      "Drum Machine & Rimshots"
    ],
    "sound_design": {
      "en": "Casio/Yamaha digital synths, crisp synthesized rimshots, heavy sub-bass, vocal toasting.",
      "zh": "卡西欧复古数字合成器、清脆合成边击军鼓、超重 Sub 贝斯与牙买加土语喊麦。"
    },
    "rhythm_features": {
      "en": "Syncopated digital riddim with kick on 1 and offbeat snare syncopations (precursor to dembow).",
      "zh": "切分数码 Riddim 节拍，第 1 拍底鼓配合反拍切分军鼓（Dembow 律动直系鼻祖）。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Dancehall signature kick character.",
        "zh": "Dancehall 风格代表性底鼓特征。"
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
      "tempo": "90–115 BPM"
    },
    "bass_pattern": {
      "en": "Heavy, repetitive synthesized sub-bass loops providing colossal sound system pressure.",
      "zh": "厚重重复的合成超低频循环，专为牙买加户外巨型音响系统震颤而生。"
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
        "Create memorable 1-bar or 2-bar riddim bass loops that repeat hypnotically",
        "Layer short wooden rimshots with digital snares",
        "Leave plenty of sonic room for energetic vocal toasting"
      ],
      "zh": [
        "打造极具记忆点的 1 小节或 2 小节洗脑 Riddim 低音循环",
        "将短小原声木质边击与数字军鼓紧密叠层",
        "为人声高速机关枪般的吐字留出宽裕的听觉空间"
      ]
    },
    "representative_tracks": [
      {
        "title": "Dancehall Anthem",
        "artist": "Sean Paul",
        "year": 1977,
        "link": "https://www.youtube.com/results?search_query=Sean+Paul+Dancehall"
      },
      {
        "title": "Midnight in Kingston",
        "artist": "Vybz Kartel",
        "year": 1979,
        "link": "https://www.youtube.com/results?search_query=Vybz+Kartel+Dancehall"
      },
      {
        "title": "Echoes of Dancehall",
        "artist": "Shabba Ranks",
        "year": 1981,
        "link": "https://www.youtube.com/results?search_query=Shabba+Ranks+Dancehall"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Buju Banton",
        "year": 1983,
        "link": "https://www.youtube.com/results?search_query=Buju+Banton+Dancehall"
      },
      {
        "title": "Essential Dancehall",
        "artist": "Popcaan",
        "year": 1985,
        "link": "https://www.youtube.com/results?search_query=Popcaan+Dancehall"
      }
    ],
    "representative_artists": [
      "Sean Paul",
      "Vybz Kartel",
      "Shabba Ranks",
      "Buju Banton",
      "Popcaan"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 8,
      "brightness": 9,
      "harmonicComplexity": 8,
      "rhythmDensity": 6,
      "bassEnergy": 9,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "dancehall",
      "bpm": 100,
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
    "id": "reggaeton",
    "name": "Reggaeton",
    "aliases": [
      "雷鬼顿"
    ],
    "category": "Latin/World",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1994",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Puerto Rico & Panama",
      "zh": "波多黎各与巴拿马"
    },
    "cultural_context": {
      "en": "Born in Puerto Rico fusing Jamaican dancehall, hip-hop, and Latin rhythms around the infectious 4/4 Dembow drum beat.",
      "zh": "诞生于波多黎各地下俱乐部，将牙买加舞厅雷鬼、嘻哈与拉丁旋律围绕洗脑的 Dembow 鼓点熔合。"
    },
    "bpm_range": "88–100 BPM",
    "default_bpm": 95,
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
      "Synth Brass",
      "808 Sub Bass",
      "Dembow Drum Machine",
      "Rhodes Keys"
    ],
    "sound_design": {
      "en": "Signature Dembow snare, synth brass, pitched autotuned vocals, deep 808 sub-bass.",
      "zh": "标志性 Dembow 军鼓切音、合成铜管、自动修音热带人声与深沉 808 超低音。"
    },
    "rhythm_features": {
      "en": "The iconic Dembow beat: 4/4 kick pulse paired with syncopated snare hits on beats 2-and and 4-and (boom-ch-boom-chick).",
      "zh": "传世 Dembow 律动：坚实的四四拍底鼓配合附点反拍军鼓（咚-恰-咚-恰）。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Reggaeton signature kick character.",
        "zh": "Reggaeton 风格代表性底鼓特征。"
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
      "tempo": "88–100 BPM"
    },
    "bass_pattern": {
      "en": "Deep, warm sub-bass or 808 slides following the Dembow swing.",
      "zh": "深沉温暖的 Sub 低音或带有顺滑滑音的 808，紧随 Dembow 摇摆。"
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
        "Program the Dembow snare: dotted 8th note followed by a 16th note against the steady 4/4 kick",
        "Use synthesized brass stabs or minor piano chords for the main harmony",
        "Keep the mix clean and club-focused"
      ],
      "zh": [
        "编写 Dembow 军鼓：稳健四踩四底鼓上覆盖附点八分音符接十六分音符军鼓",
        "使用合成铜管刺音或暗色小调钢琴构建主和声",
        "混音保持清脆透亮，低频在俱乐部大功率音响上直击胸膛"
      ]
    },
    "representative_tracks": [
      {
        "title": "Reggaeton Anthem",
        "artist": "Daddy Yankee",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=Daddy+Yankee+Reggaeton"
      },
      {
        "title": "Midnight in Puerto Rico & Panama",
        "artist": "Bad Bunny",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Bad+Bunny+Reggaeton"
      },
      {
        "title": "Echoes of Reggaeton",
        "artist": "J Balvin",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=J+Balvin+Reggaeton"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Don Omar",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=Don+Omar+Reggaeton"
      },
      {
        "title": "Essential Reggaeton",
        "artist": "Ozuna",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=Ozuna+Reggaeton"
      }
    ],
    "representative_artists": [
      "Daddy Yankee",
      "Bad Bunny",
      "J Balvin",
      "Don Omar",
      "Ozuna"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 8,
      "brightness": 5,
      "harmonicComplexity": 2,
      "rhythmDensity": 6,
      "bassEnergy": 9,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "reggaeton",
      "bpm": 95,
      "scale": "C minor",
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
            36,
            null,
            null,
            null,
            null,
            null,
            39,
            null,
            36,
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
    "id": "afrobeat",
    "name": "Afrobeat",
    "aliases": [
      "非洲节拍"
    ],
    "category": "Latin/World",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1968",
    "origin_decade": 1960,
    "origin_place": {
      "en": "Lagos, Nigeria",
      "zh": "尼日利亚拉各斯"
    },
    "cultural_context": {
      "en": "Created in late-60s Lagos by Fela Kuti and legendary drummer Tony Allen, fusing Yoruba polyrhythms, funk, jazz, and political resistance.",
      "zh": "由 Fela Kuti 与传奇鼓手 Tony Allen 在拉各斯开创，将约鲁巴传统复合节奏、放克、爵士与反抗精神凝为史诗。"
    },
    "bpm_range": "110–130 BPM",
    "default_bpm": 120,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–i–V",
      "I–IV–V–IV"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Big-Band Horn Section",
      "Electric Piano",
      "Interlocking Funk Guitar",
      "Electric Bass",
      "Talking Drum & Shekere"
    ],
    "sound_design": {
      "en": "Large big-band brass horns, interlocking funk guitars, organic percussion (claves, shekere), electric piano.",
      "zh": "大型大乐队铜管阵列、交错对位放克吉他、传统沙锤打击乐与电钢琴。"
    },
    "rhythm_features": {
      "en": "Tony Allen's four-limb polyrhythmic drumming: independent patterns across hi-hat, snare, kick, and toms.",
      "zh": "Tony Allen 标志性四肢独立多重节奏：踩镲、底鼓、通鼓与军鼓各奏完全不同独立切分。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Afrobeat signature kick character.",
        "zh": "Afrobeat 风格代表性底鼓特征。"
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
      "tempo": "110–130 BPM"
    },
    "bass_pattern": {
      "en": "Hypnotic, syncopated electric bass grooves repeating relentlessly for 10-15 minutes.",
      "zh": "极度催眠、富有切分弹跳的电贝斯线条，在一首歌中持续狂奔 10 至 15 分钟。"
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
        "Arrange two rhythm guitars playing interlocking, syncopated single-note lines",
        "Layer shekere, congas, and woodblock percussion over the drum kit",
        "Keep arrangements expansive across 10+ minute tracks"
      ],
      "zh": [
        "编排两把节奏吉他演奏相互咬合交错的单音放克切音线条",
        "在架子鼓上方叠录非洲传统沙锤（Shekere）、康加鼓与木鱼",
        "作品结构舒展宏大，留足器乐即兴与铜管呼应的长篇篇幅"
      ]
    },
    "representative_tracks": [
      {
        "title": "Afrobeat Anthem",
        "artist": "Fela Kuti",
        "year": 1968,
        "link": "https://www.youtube.com/results?search_query=Fela+Kuti+Afrobeat"
      },
      {
        "title": "Midnight in Lagos",
        "artist": "Tony Allen",
        "year": 1970,
        "link": "https://www.youtube.com/results?search_query=Tony+Allen+Afrobeat"
      },
      {
        "title": "Echoes of Afrobeat",
        "artist": "Antibalas",
        "year": 1972,
        "link": "https://www.youtube.com/results?search_query=Antibalas+Afrobeat"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Seun Kuti",
        "year": 1974,
        "link": "https://www.youtube.com/results?search_query=Seun+Kuti+Afrobeat"
      },
      {
        "title": "Essential Afrobeat",
        "artist": "Femi Kuti",
        "year": 1976,
        "link": "https://www.youtube.com/results?search_query=Femi+Kuti+Afrobeat"
      }
    ],
    "representative_artists": [
      "Fela Kuti",
      "Tony Allen",
      "Antibalas",
      "Seun Kuti",
      "Femi Kuti"
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
      "rhythmDensity": 9,
      "bassEnergy": 7,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "afrobeat",
      "bpm": 115,
      "scale": "A minor",
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
    "id": "amapiano",
    "name": "Amapiano",
    "aliases": [
      "阿玛钢琴",
      "南非钢琴浩室"
    ],
    "category": "Latin/World",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2012",
    "origin_decade": 2010,
    "origin_place": {
      "en": "Johannesburg & Pretoria, South Africa",
      "zh": "南非约翰内斯堡与比勒陀利亚"
    },
    "cultural_context": {
      "en": "Swept the globe from South Africa, blending deep house grooves with jazz piano chords, continuous shaker loops, and signature rolling log drums.",
      "zh": "从南非横扫全球的音乐奇迹，融合深邃浩室律动、爵士 Rhodes 钢琴、永不停歇的沙锤与标志性滚动的木原木鼓（Log Drum）。"
    },
    "bpm_range": "110–118 BPM",
    "default_bpm": 113,
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
      "Log Drum (Pitched 808)",
      "Jazz Piano Chords",
      "Rhodes Keys",
      "Shaker Loops"
    ],
    "sound_design": {
      "en": "Signature synthesized 'Log Drum' (distorted 808 percussion bass), lush Rhodes chords, shaker loops.",
      "zh": "标志性合成原木鼓（Log Drum，带失真敲击瞬态的 808 贝斯）、典雅 Rhodes 和弦与沙锤循环。"
    },
    "rhythm_features": {
      "en": "Steady 113 BPM 4/4 kick accompanied by continuous, intricate, multi-layered shaker loops.",
      "zh": "稳健的 113 BPM 四四拍底鼓，伴随连绵不绝、层次细腻的多层沙锤循环。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Amapiano signature kick character.",
        "zh": "Amapiano 风格代表性底鼓特征。"
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
      "tempo": "110–118 BPM"
    },
    "bass_pattern": {
      "en": "The iconic pitch-bending, syncopated rolling 'log drum' bassline playing complex polyrhythms.",
      "zh": "标志性带有音高弯音滑音与弹跳敲击质感的滚动原木鼓低音线条。"
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
        "Create the signature log drum using an FM or 808 kick with extreme pitch envelope and saturation",
        "Layer at least 3 distinct shaker loops playing slightly different syncopations",
        "Use lush jazz piano minor 9th chords on the breakdown"
      ],
      "zh": [
        "使用具有极速音高包络与轻度饱和的 808 底鼓制作招牌 Log Drum",
        "叠置至少 3 条带有微小时间差与声像分置的细腻沙锤循环",
        "在分解段落使用优雅的爵士小九和弦电钢琴进行抒情点缀"
      ]
    },
    "representative_tracks": [
      {
        "title": "Amapiano Anthem",
        "artist": "Kabza De Small",
        "year": 2012,
        "link": "https://www.youtube.com/results?search_query=Kabza+De+Small+Amapiano"
      },
      {
        "title": "Midnight in Johannesburg & Pretoria",
        "artist": "DJ Maphorisa",
        "year": 2014,
        "link": "https://www.youtube.com/results?search_query=DJ+Maphorisa+Amapiano"
      },
      {
        "title": "Echoes of Amapiano",
        "artist": "Focalistic",
        "year": 2016,
        "link": "https://www.youtube.com/results?search_query=Focalistic+Amapiano"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Major League Djz",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=Major+League+Djz+Amapiano"
      },
      {
        "title": "Essential Amapiano",
        "artist": "Uncle Waffles",
        "year": 2020,
        "link": "https://www.youtube.com/results?search_query=Uncle+Waffles+Amapiano"
      }
    ],
    "representative_artists": [
      "Kabza De Small",
      "DJ Maphorisa",
      "Focalistic",
      "Major League Djz",
      "Uncle Waffles"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 9,
      "harmonicComplexity": 4,
      "rhythmDensity": 8,
      "bassEnergy": 9,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "amapiano",
      "bpm": 113,
      "scale": "E minor",
      "swing": 10,
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
          "instrument": "808_bass",
          "steps": [
            1,
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
            43,
            null,
            40,
            null,
            null,
            null,
            null,
            40,
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
    "id": "bossa-nova",
    "name": "Bossa Nova",
    "aliases": [
      "波萨诺瓦",
      "巴萨诺瓦"
    ],
    "category": "Latin/World",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1957",
    "origin_decade": 1950,
    "origin_place": {
      "en": "Rio de Janeiro, Brazil",
      "zh": "巴西里约热内卢"
    },
    "cultural_context": {
      "en": "Created in late-50s Rio de Janeiro by João Gilberto and Tom Jobim, slowing samba rhythms to a gentle acoustic sway with jazz harmonies and whispered vocals.",
      "zh": "50 年代末由 João Gilberto 与 Tom Jobim 开创于里约海滨，将狂欢桑巴转化为轻柔的木吉他摇曳、优雅爵士和声与耳语低吟。"
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
      "I–vi–ii–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Nylon-String Acoustic Guitar",
      "Flute / Sax",
      "Upright Bass",
      "Brushes & Rim Clicks"
    ],
    "sound_design": {
      "en": "Nylon-string acoustic guitar, delicate brushed snare rim clicks, warm flute/sax, whisper vocals.",
      "zh": "尼龙弦古典吉他、细腻的鼓刷边击敲击、温暖木质长笛/萨克斯与耳语般人声。"
    },
    "rhythm_features": {
      "en": "Syncopated Brazilian acoustic guitar thumb-and-finger picking pattern simulating the samba groove.",
      "zh": "大拇指与手指拨奏的切分尼龙吉他律动，精巧模拟了巴西桑巴节拍。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Bossa Nova signature kick character.",
        "zh": "Bossa Nova 风格代表性底鼓特征。"
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
      "en": "Soft, acoustic upright bass alternating between root and 5th on downbeats with gentle syncopation.",
      "zh": "柔和的原声立式低音提琴，在正拍与反拍间轻柔交替根音与五音。"
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
        "Play acoustic nylon guitar without a pick, using thumb for bass and three fingers for chords",
        "Cross-stick rim clicks should be soft and delicate on coated snare heads",
        "Compose using lush maj9, m9, and diminished passing chords"
      ],
      "zh": [
        "不用拨片直接用右手大拇指与三指弹奏尼龙吉他拇指行进与和弦抓弦",
        "军鼓边击敲击务必柔和克制，使用带涂层鼓皮展现温度",
        "大量运用大九和弦、小九和弦与半音减七经过和弦"
      ]
    },
    "representative_tracks": [
      {
        "title": "Bossa Nova Anthem",
        "artist": "Antônio Carlos Jobim",
        "year": 1957,
        "link": "https://www.youtube.com/results?search_query=Antônio+Carlos+Jobim+Bossa+Nova"
      },
      {
        "title": "Midnight in Rio de Janeiro",
        "artist": "João Gilberto",
        "year": 1959,
        "link": "https://www.youtube.com/results?search_query=João+Gilberto+Bossa+Nova"
      },
      {
        "title": "Echoes of Bossa Nova",
        "artist": "Astrud Gilberto",
        "year": 1961,
        "link": "https://www.youtube.com/results?search_query=Astrud+Gilberto+Bossa+Nova"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Stan Getz",
        "year": 1963,
        "link": "https://www.youtube.com/results?search_query=Stan+Getz+Bossa+Nova"
      },
      {
        "title": "Essential Bossa Nova",
        "artist": "Vinicius de Moraes",
        "year": 1965,
        "link": "https://www.youtube.com/results?search_query=Vinicius+de+Moraes+Bossa+Nova"
      }
    ],
    "representative_artists": [
      "Antônio Carlos Jobim",
      "João Gilberto",
      "Astrud Gilberto",
      "Stan Getz",
      "Vinicius de Moraes"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 9,
      "brightness": 5,
      "harmonicComplexity": 6,
      "rhythmDensity": 7,
      "bassEnergy": 3,
      "melodicFocus": 9
    },
    "sequencer_pattern": {
      "genre_id": "bossa-nova",
      "bpm": 130,
      "scale": "D minor",
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
            115,
            0,
            0,
            65,
            0,
            0,
            95,
            0,
            0,
            0,
            95,
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
          "instrument": "guitar_lead",
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
            62,
            null,
            null,
            65,
            null,
            null,
            69,
            null,
            null,
            null,
            62,
            null,
            null,
            65,
            null,
            null
          ],
          "volume": 0.75,
          "pan": 0
        },
        {
          "track_id": "lead",
          "name": "Lead Synth",
          "instrument": "flute_lead",
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
    "id": "samba",
    "name": "Samba",
    "aliases": [
      "桑巴"
    ],
    "category": "Latin/World",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1910",
    "origin_decade": 1910,
    "origin_place": {
      "en": "Rio de Janeiro, Brazil",
      "zh": "巴西里约热内卢"
    },
    "cultural_context": {
      "en": "The heartbeat of Brazilian Carnival, born in Rio de Janeiro out of Afro-Brazilian traditions, driven by massive batucada percussion ensembles.",
      "zh": "巴西狂欢节的激荡心跳，脱胎于非裔巴西传统，由庞大的巴图卡达（Batucada）打击乐军团与桑巴歌者驱动。"
    },
    "bpm_range": "90–120 BPM (2/4)",
    "default_bpm": 105,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–IV–V–I",
      "ii–V–I"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Cavaquinho Guitar",
      "Flute",
      "Surdo & Pandeiro",
      "Cuíca",
      "Upright Bass"
    ],
    "sound_design": {
      "en": "Surdo bass drums, cuíca friction drum, pandeiro tambourine, caixa snare, cavaquinho guitar.",
      "zh": "Surdo 重型低音大鼓、Cuíca 摩擦鼓、Pandeiro 巴西手鼓、Caixa 军鼓与卡瓦金尼奥小吉他。"
    },
    "rhythm_features": {
      "en": "Brisk 2/4 rhythm with characteristic syncopated pulse on the second beat provided by the surdo.",
      "zh": "轻快的 2/4 拍律动，在第 2 拍上由 Surdo 大鼓提供深沉鲜明的切分脉冲。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Samba signature kick character.",
        "zh": "Samba 风格代表性底鼓特征。"
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
      "tempo": "90–120 BPM (2/4)"
    },
    "bass_pattern": {
      "en": "Surdo-driven low-end acoustic pulse alternating between high and low surdo tones.",
      "zh": "由 Surdo 大鼓高低音交替敲击主导的宏大低频脉动。"
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
        "Layer the 3 sizes of Surdo drums: Surdo 1 (deep downbeat), Surdo 2 (answering high), Surdo 3 (syncopated cutting)",
        "Include the squeaking Cuíca friction drum for iconic carnival flavor",
        "Record cavaquinho strumming high-register chord rhythms"
      ],
      "zh": [
        "叠录三种尺寸的 Surdo 大鼓：1号深沉重音、2号高音呼应、3号切分加花",
        "加入发出吱呀啸叫的 Cuíca 摩擦鼓增添原汁原味狂欢色彩",
        "录制卡瓦金尼奥四弦小吉他演奏高音区明朗扫弦"
      ]
    },
    "representative_tracks": [
      {
        "title": "Samba Anthem",
        "artist": "Cartola",
        "year": 1910,
        "link": "https://www.youtube.com/results?search_query=Cartola+Samba"
      },
      {
        "title": "Midnight in Rio de Janeiro",
        "artist": "Beth Carvalho",
        "year": 1912,
        "link": "https://www.youtube.com/results?search_query=Beth+Carvalho+Samba"
      },
      {
        "title": "Echoes of Samba",
        "artist": "Zeca Pagodinho",
        "year": 1914,
        "link": "https://www.youtube.com/results?search_query=Zeca+Pagodinho+Samba"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Alcione",
        "year": 1916,
        "link": "https://www.youtube.com/results?search_query=Alcione+Samba"
      },
      {
        "title": "Essential Samba",
        "artist": "Jorge Ben Jor",
        "year": 1918,
        "link": "https://www.youtube.com/results?search_query=Jorge+Ben+Jor+Samba"
      }
    ],
    "representative_artists": [
      "Cartola",
      "Beth Carvalho",
      "Zeca Pagodinho",
      "Alcione",
      "Jorge Ben Jor"
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
      "rhythmDensity": 10,
      "bassEnergy": 5,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "samba",
      "bpm": 105,
      "scale": "G major",
      "swing": 10,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "acoustic_kick",
          "steps": [
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
            115,
            65,
            95,
            65,
            115,
            65,
            95,
            65,
            115,
            65,
            95,
            65,
            115,
            65,
            95,
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
            47,
            null,
            43,
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
          "instrument": "guitar_lead",
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
            67,
            null,
            null,
            null,
            null,
            71,
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
          "instrument": "flute_lead",
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
    "id": "cumbia",
    "name": "Cumbia",
    "aliases": [
      "坎比亚"
    ],
    "category": "Latin/World",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1940",
    "origin_decade": 1940,
    "origin_place": {
      "en": "Colombia",
      "zh": "哥伦比亚"
    },
    "cultural_context": {
      "en": "Traditional folk dance of Colombia that evolved into a pan-Latin American sensation, driven by accordion melodies, guache shakers, and infectious 2/4 bounce.",
      "zh": "诞生于哥伦比亚的传统民间歌舞，演化为风靡全拉丁美洲的文化瑰宝，以手风琴、沙锤与欢快 2/4 拍弹跳闻名。"
    },
    "bpm_range": "90–110 BPM",
    "default_bpm": 100,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–V–i",
      "i–VII–V–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Button Accordion",
      "Electric Bass",
      "Guacharaca & Tambor",
      "Guache Shakers",
      "Horn Section"
    ],
    "sound_design": {
      "en": "Button accordion, guache/maracón shakers, tambor alegre drum, acoustic electric bass.",
      "zh": "按钮手风琴、Guache 沙管/沙锤、Alegre 欢悦鼓与清脆电贝斯。"
    },
    "rhythm_features": {
      "en": "Characteristic 2/4 rhythm with the distinctive 'shhh-chika-chika' shaker scraping pattern.",
      "zh": "标志性 2/4 拍律动，伴随极具辨识度的沙锤沙沙声（shhh-chika-chika）。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Cumbia signature kick character.",
        "zh": "Cumbia 风格代表性底鼓特征。"
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
      "tempo": "90–110 BPM"
    },
    "bass_pattern": {
      "en": "Bouncy, syncopated basslines playing continuous walking intervals that make dancing irresistible.",
      "zh": "富有弹性跳跃的切分低音线条，不断演奏行进音程催生难以自抑的舞动冲动。"
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
        "Record accordion playing bright, syncopated lead melodies with rich reed vibrato",
        "Keep the shaker scraping continuously on the 16th-note grid",
        "Use melodic acoustic basslines that emphasize the upbeat"
      ],
      "zh": [
        "实录手风琴演奏明朗切分的主奏旋律，带有丰满的簧片颤音",
        "沙管刮管在十六分音符网格上持续不断地进行摩擦律动",
        "贝斯线条强调反拍弹跳以强化跳舞欲望"
      ]
    },
    "representative_tracks": [
      {
        "title": "Cumbia Anthem",
        "artist": "Los Ángeles Azules",
        "year": 1940,
        "link": "https://www.youtube.com/results?search_query=Los+Ángeles+Azules+Cumbia"
      },
      {
        "title": "Midnight in Colombia",
        "artist": "Lucho Bermúdez",
        "year": 1942,
        "link": "https://www.youtube.com/results?search_query=Lucho+Bermúdez+Cumbia"
      },
      {
        "title": "Echoes of Cumbia",
        "artist": "Totó La Momposina",
        "year": 1944,
        "link": "https://www.youtube.com/results?search_query=Totó+La+Momposina+Cumbia"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Ska Cubano",
        "year": 1946,
        "link": "https://www.youtube.com/results?search_query=Ska+Cubano+Cumbia"
      },
      {
        "title": "Essential Cumbia",
        "artist": "Bomba Estéreo",
        "year": 1948,
        "link": "https://www.youtube.com/results?search_query=Bomba+Estéreo+Cumbia"
      }
    ],
    "representative_artists": [
      "Los Ángeles Azules",
      "Lucho Bermúdez",
      "Totó La Momposina",
      "Ska Cubano",
      "Bomba Estéreo"
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
      "rhythmDensity": 8,
      "bassEnergy": 5,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "cumbia",
      "bpm": 95,
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
            52,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "accordion_lead",
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
          "instrument": "accordion_lead",
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
    "id": "kuduro",
    "name": "Kuduro",
    "aliases": [
      "库杜罗"
    ],
    "category": "Latin/World",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1996",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Luanda, Angola",
      "zh": "安哥拉罗安达"
    },
    "cultural_context": {
      "en": "Born in Luanda, Angola, during the civil war, blending traditional Angolan soca/kilapanga with fast four-on-the-floor European techno beats and energetic vocal chants.",
      "zh": "诞生于内战时期的安哥拉首都罗安达，将传统索卡节拍与高速四踩四欧洲 Techno 鼓点和激情四射的人声呐喊结合。"
    },
    "bpm_range": "135–145 BPM",
    "default_bpm": 140,
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
      "Punchy Analog Synth Lead",
      "Sub Bass",
      "Fast Congas",
      "Warm Pad",
      "Whistle Blasts"
    ],
    "sound_design": {
      "en": "Fast syncopated congas, electronic whistle blasts, high-octane rap chants, heavy punchy kicks.",
      "zh": "极速切分康加鼓、电子裁判口哨声、高能葡语说唱呐喊与重击底鼓。"
    },
    "rhythm_features": {
      "en": "Furious 140 BPM four-on-the-floor kick pattern laced with polyrhythmic tribal percussion.",
      "zh": "狂风暴雨般的 140 BPM 四四拍底鼓，穿插交错着复合节奏部落打击乐。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Kuduro signature kick character.",
        "zh": "Kuduro 风格代表性底鼓特征。"
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
      "en": "Short, punchy sub-bass hits locked with the kick drum to propel hyper-speed street choreography.",
      "zh": "短促有力的超低频重击，与底鼓紧密贴合，支撑极速街头斗舞步法。"
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
        "Keep tempo driving around 140 BPM with relentless energy",
        "Layer electronic sports whistle samples on key syncopated drops",
        "Process shouting group vocals with aggressive compression"
      ],
      "zh": [
        "将速度稳稳锁定在 140 BPM 附近，释放不间断的澎湃动能",
        "在关键切分重拍上叠入狂欢运动口哨音效",
        "对群体呐喊人声施加激进压缩以强化现场呼号的感染力"
      ]
    },
    "representative_tracks": [
      {
        "title": "Kuduro Anthem",
        "artist": "Buraka Som Sistema",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Buraka+Som+Sistema+Kuduro"
      },
      {
        "title": "Midnight in Luanda",
        "artist": "Titica",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Titica+Kuduro"
      },
      {
        "title": "Echoes of Kuduro",
        "artist": "Cabo Snoop",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=Cabo+Snoop+Kuduro"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Batida",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=Batida+Kuduro"
      },
      {
        "title": "Essential Kuduro",
        "artist": "Nagrelha",
        "year": 2004,
        "link": "https://www.youtube.com/results?search_query=Nagrelha+Kuduro"
      }
    ],
    "representative_artists": [
      "Buraka Som Sistema",
      "Titica",
      "Cabo Snoop",
      "Batida",
      "Nagrelha"
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
      "rhythmDensity": 10,
      "bassEnergy": 9,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "kuduro",
      "bpm": 140,
      "scale": "D minor",
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
            null,
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
