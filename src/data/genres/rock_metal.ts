import { Genre } from '../../types/genre';

export const ROCK_METAL_GENRES: Genre[] = [
  {
    "id": "rock-and-roll",
    "name": "Rock and Roll",
    "aliases": [
      "摇滚乐",
      "经典摇滚"
    ],
    "category": "Rock/Metal",
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
      "en": "Emerged in the US in the 1950s out of rhythm and blues, boogie-woogie, and country, driven by energetic backbeats and electric guitar licks.",
      "zh": "1950 年代初融合节奏布鲁斯、布吉乌吉与乡村音乐在美国诞生，由充满活力的反拍与电吉他激奏驱动。"
    },
    "bpm_range": "140–175 BPM",
    "default_bpm": 150,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–IV–V–IV",
      "I–vi–IV–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Tube-Overdriven Electric Guitar",
      "Upright Bass",
      "Honky-Tonk Piano",
      "Drum Kit"
    ],
    "sound_design": {
      "en": "Vintage tube-overdriven electric guitars, upright acoustic bass, pounding honky-tonk piano.",
      "zh": "复古电子管轻度过载电吉他、立式原声贝斯与强劲的酒馆钢琴。"
    },
    "rhythm_features": {
      "en": "Driving 4/4 rhythm with strong accent on beats 2 and 4 (backbeat) and swinging 8th-note shuffle.",
      "zh": "驱动力十足的四四拍律动，在 2、4 拍上有强烈后拍（Backbeat）重音，带有八分音符摇摆。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Rock and Roll signature kick character.",
        "zh": "Rock and Roll 风格代表性底鼓特征。"
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
      "tempo": "140–175 BPM"
    },
    "bass_pattern": {
      "en": "Walking upright bass playing classic 12-bar blues arpeggiated root-3rd-5th-6th lines.",
      "zh": "行进立式贝斯演奏经典 12 小节布鲁斯分解根音-三音-五音-六音走音。"
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
        "Use classic 12-bar blues progressions (I-IV-I-V-IV-I)",
        "Apply light analog tape slapback delay to lead vocals and guitars",
        "Keep drum sounds natural and dynamic without modern compression"
      ],
      "zh": [
        "采用经典 12 小节布鲁斯和弦骨架（I-IV-I-V-IV-I）",
        "为主唱与吉他加入轻微模拟磁带拍击延迟（Slapback Echo）",
        "保持鼓组动态自然呼吸，避免现代过度压缩"
      ]
    },
    "representative_tracks": [
      {
        "title": "Rock and Roll Anthem",
        "artist": "Chuck Berry",
        "year": 1950,
        "link": "https://www.youtube.com/results?search_query=Chuck+Berry+Rock+and+Roll"
      },
      {
        "title": "Midnight in USA",
        "artist": "Little Richard",
        "year": 1952,
        "link": "https://www.youtube.com/results?search_query=Little+Richard+Rock+and+Roll"
      },
      {
        "title": "Echoes of Rock and Roll",
        "artist": "Elvis Presley",
        "year": 1954,
        "link": "https://www.youtube.com/results?search_query=Elvis+Presley+Rock+and+Roll"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Buddy Holly",
        "year": 1956,
        "link": "https://www.youtube.com/results?search_query=Buddy+Holly+Rock+and+Roll"
      },
      {
        "title": "Essential Rock and Roll",
        "artist": "Jerry Lee Lewis",
        "year": 1958,
        "link": "https://www.youtube.com/results?search_query=Jerry+Lee+Lewis+Rock+and+Roll"
      }
    ],
    "representative_artists": [
      "Chuck Berry",
      "Little Richard",
      "Elvis Presley",
      "Buddy Holly",
      "Jerry Lee Lewis"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 8,
      "brightness": 10,
      "harmonicComplexity": 6,
      "rhythmDensity": 7,
      "bassEnergy": 3,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "rock-and-roll",
      "bpm": 145,
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
    "id": "blues-rock",
    "name": "Blues Rock",
    "aliases": [
      "布鲁斯摇滚"
    ],
    "category": "Rock/Metal",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1960",
    "origin_decade": 1960,
    "origin_place": {
      "en": "UK & USA",
      "zh": "英国与美国"
    },
    "cultural_context": {
      "en": "Combines traditional blues improvisational scale runs with cranked electric guitar amplifiers and heavy driving rock rhythms.",
      "zh": "将传统布鲁斯即兴音阶演奏与开到极响的电吉他过载箱头和沉重推进的摇滚节拍结合。"
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
      "i–iv–V–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Cranked Electric Guitar",
      "Picked Bass Guitar",
      "Fuzz & Wah Pedals",
      "Drum Kit"
    ],
    "sound_design": {
      "en": "Fender Stratocaster / Gibson Les Paul into cranked Marshall stacks, fuzz pedals, wah-wah.",
      "zh": "芬达/吉普森吉他接入大功率马歇尔箱头、法兹单块与哇音踏板。"
    },
    "rhythm_features": {
      "en": "Heavy shuffle or straight rock groove with dynamic drum fills and prominent ride cymbal work.",
      "zh": "厚重摇摆或直板摇滚律动，伴随动态极大的鼓加花与突出的 Ride 镲片。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Blues Rock signature kick character.",
        "zh": "Blues Rock 风格代表性底鼓特征。"
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
      "en": "Improvisational blues-scale walking basslines locking with the drummer's kick pedal.",
      "zh": "即兴布鲁斯音阶行进贝斯线条，与鼓手的底鼓踏板紧密契合。"
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
        "Capture real room bleed when tracking live guitar amplifier cabinets",
        "Use pentatonic minor scale with flattened 5th (the blue note) for searing solos",
        "Layer warm Hammond B3 organ beneath rhythm guitars"
      ],
      "zh": [
        "实录电吉他箱头时捕捉自然的房间环境串音增添现场感",
        "使用带降五度（蓝调音）的小调五声音阶演奏撕裂独奏",
        "在节奏吉他下方铺一层温暖的 Hammond B3 电子管风琴"
      ]
    },
    "representative_tracks": [
      {
        "title": "Blues Rock Anthem",
        "artist": "The Jimi Hendrix Experience",
        "year": 1960,
        "link": "https://www.youtube.com/results?search_query=The+Jimi+Hendrix+Experience+Blues+Rock"
      },
      {
        "title": "Midnight in UK & USA",
        "artist": "Cream",
        "year": 1962,
        "link": "https://www.youtube.com/results?search_query=Cream+Blues+Rock"
      },
      {
        "title": "Echoes of Blues Rock",
        "artist": "Led Zeppelin",
        "year": 1964,
        "link": "https://www.youtube.com/results?search_query=Led+Zeppelin+Blues+Rock"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Stevie Ray Vaughan",
        "year": 1966,
        "link": "https://www.youtube.com/results?search_query=Stevie+Ray+Vaughan+Blues+Rock"
      },
      {
        "title": "Essential Blues Rock",
        "artist": "The Rolling Stones",
        "year": 1968,
        "link": "https://www.youtube.com/results?search_query=The+Rolling+Stones+Blues+Rock"
      }
    ],
    "representative_artists": [
      "The Jimi Hendrix Experience",
      "Cream",
      "Led Zeppelin",
      "Stevie Ray Vaughan",
      "The Rolling Stones"
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
      "rhythmDensity": 6,
      "bassEnergy": 5,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "blues-rock",
      "bpm": 120,
      "scale": "E minor",
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
          "instrument": "pick_bass",
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
            40,
            null,
            null,
            null,
            null,
            null,
            43,
            null,
            40,
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
    "id": "hard-rock",
    "name": "Hard Rock",
    "aliases": [
      "硬摇滚"
    ],
    "category": "Rock/Metal",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1968",
    "origin_decade": 1960,
    "origin_place": {
      "en": "UK & USA",
      "zh": "英国与美国"
    },
    "cultural_context": {
      "en": "Pioneered in the late 1960s with heavily distorted guitars, aggressive power chord riffs, soaring vocals, and pounding drums.",
      "zh": "发端于 1960 年代末，以重度失真电吉他、具有侵略性的强力和弦 Riff、高亢主唱与重锤底鼓震撼世界。"
    },
    "bpm_range": "115–140 BPM",
    "default_bpm": 125,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–♭VII–IV–I",
      "i–♭VI–♭VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Overdriven Guitar Stacks",
      "Picked Bass Guitar",
      "Power-Chord Riffs",
      "Drum Kit"
    ],
    "sound_design": {
      "en": "Overdriven Marshall guitar stacks, aggressive power chords, driving bass guitars, heavy room drums.",
      "zh": "过载马歇尔吉他箱头、强力和弦、穿透力强的电贝斯与宽广房间真鼓。"
    },
    "rhythm_features": {
      "en": "Solid, driving 4/4 beat with cracking snare on 2 and 4 and powerful downbeat kicks.",
      "zh": "扎实坚定的四四拍节奏，在 2、4 拍发出炸裂般的军鼓撞击。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Hard Rock signature kick character.",
        "zh": "Hard Rock 风格代表性底鼓特征。"
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
      "en": "Thick, distorted pick-played bass doubling the main guitar riff for colossal weight.",
      "zh": "用拨片弹奏的厚重微失真贝斯，与主吉他 Riff 完全齐奏构筑磅礴分量。"
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
        "Double-track rhythm guitars hard left and hard right for a massive stereo wall",
        "Capture large ambient drum room mics and compress heavily with an 1176",
        "Keep the kick and bass frequencies tightly locked together"
      ],
      "zh": [
        "将节奏吉他双实录并极左极右对称分置打造庞大立体声吉他音墙",
        "采集远距离大立体声房间鼓话筒并使用 1176 压缩器重度挤压",
        "将底鼓与贝斯的低频基频紧密咬合"
      ]
    },
    "representative_tracks": [
      {
        "title": "Hard Rock Anthem",
        "artist": "Led Zeppelin",
        "year": 1968,
        "link": "https://www.youtube.com/results?search_query=Led+Zeppelin+Hard+Rock"
      },
      {
        "title": "Midnight in UK & USA",
        "artist": "AC/DC",
        "year": 1970,
        "link": "https://www.youtube.com/results?search_query=AC/DC+Hard+Rock"
      },
      {
        "title": "Echoes of Hard Rock",
        "artist": "Deep Purple",
        "year": 1972,
        "link": "https://www.youtube.com/results?search_query=Deep+Purple+Hard+Rock"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Guns N' Roses",
        "year": 1974,
        "link": "https://www.youtube.com/results?search_query=Guns+N'+Roses+Hard+Rock"
      },
      {
        "title": "Essential Hard Rock",
        "artist": "Aerosmith",
        "year": 1976,
        "link": "https://www.youtube.com/results?search_query=Aerosmith+Hard+Rock"
      }
    ],
    "representative_artists": [
      "Led Zeppelin",
      "AC/DC",
      "Deep Purple",
      "Guns N' Roses",
      "Aerosmith"
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
      "rhythmDensity": 6,
      "bassEnergy": 7,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "hard-rock",
      "bpm": 125,
      "scale": "A minor",
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
            2,
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
          "instrument": "pick_bass",
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
            null,
            null,
            45,
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
          "instrument": "distorted_guitar",
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
    "id": "punk-rock",
    "name": "Punk Rock",
    "aliases": [
      "朋克摇滚"
    ],
    "category": "Rock/Metal",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1975",
    "origin_decade": 1970,
    "origin_place": {
      "en": "New York, USA & London, UK",
      "zh": "美国纽约与英国伦敦"
    },
    "cultural_context": {
      "en": "Stripped rock music down to its fast, raw, three-chord essentials in mid-70s NYC and London, embracing DIY counter-culture.",
      "zh": "70 年代中期在纽约与伦敦将摇滚剥离至极速、粗粝的三和弦本质，拥抱反叛的 DIY 独立文化。"
    },
    "bpm_range": "160–200 BPM",
    "default_bpm": 175,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–IV–V–IV",
      "i–♭VII–IV–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Distorted Solid-Body Guitar",
      "Downpicked Bass Guitar",
      "Raw Vocals",
      "Fast Drum Kit"
    ],
    "sound_design": {
      "en": "Distorted solid-body guitars through tube amps, aggressive plectrum bass, raw vocals.",
      "zh": "实心电吉他直入过载箱头、粗暴拨片弹奏贝斯与未经修饰的呐喊主唱。"
    },
    "rhythm_features": {
      "en": "Fast, driving straight 8th-note beats with pounding downstroke hi-hats and aggressive snares.",
      "zh": "高速飞驰的纯直板八分音符节拍，下扫踩镲与充满攻击性的干脆军鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Punk Rock signature kick character.",
        "zh": "Punk Rock 风格代表性底鼓特征。"
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
      "tempo": "160–200 BPM"
    },
    "bass_pattern": {
      "en": "Relentless 8th-note downpicked root notes driving straight ahead without fills.",
      "zh": "全下拨（Downpick）八分音符根音狂轰滥炸，毫无多余花哨装饰。"
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
        "Keep song arrangements short and direct (under 3 minutes)",
        "Use aggressive downpicking on rhythm guitars for punchy percussive impact",
        "Avoid studio polish; record the band live together in one room when possible"
      ],
      "zh": [
        "歌曲编排短小精悍直截了当（通常在 3 分钟以内）",
        "节奏吉他采用全下拨扫弦获取极具打击感的颗粒度",
        "拒绝过度录音棚精修，尽可能让乐队同期在同一房间实录"
      ]
    },
    "representative_tracks": [
      {
        "title": "Punk Rock Anthem",
        "artist": "The Ramones",
        "year": 1975,
        "link": "https://www.youtube.com/results?search_query=The+Ramones+Punk+Rock"
      },
      {
        "title": "Midnight in New York",
        "artist": "Sex Pistols",
        "year": 1977,
        "link": "https://www.youtube.com/results?search_query=Sex+Pistols+Punk+Rock"
      },
      {
        "title": "Echoes of Punk Rock",
        "artist": "The Clash",
        "year": 1979,
        "link": "https://www.youtube.com/results?search_query=The+Clash+Punk+Rock"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Green Day",
        "year": 1981,
        "link": "https://www.youtube.com/results?search_query=Green+Day+Punk+Rock"
      },
      {
        "title": "Essential Punk Rock",
        "artist": "Bad Religion",
        "year": 1983,
        "link": "https://www.youtube.com/results?search_query=Bad+Religion+Punk+Rock"
      }
    ],
    "representative_artists": [
      "The Ramones",
      "Sex Pistols",
      "The Clash",
      "Green Day",
      "Bad Religion"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 4,
      "brightness": 10,
      "harmonicComplexity": 2,
      "rhythmDensity": 9,
      "bassEnergy": 5,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "punk-rock",
      "bpm": 170,
      "scale": "E minor",
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
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "pick_bass",
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
            40,
            null,
            40,
            null,
            40,
            null,
            40,
            null,
            43,
            null,
            43,
            null,
            45,
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
          "instrument": "distorted_guitar",
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
            64,
            null,
            64,
            null,
            64,
            null,
            64,
            null,
            67,
            null,
            67,
            null,
            69,
            null,
            67,
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
    "id": "post-punk",
    "name": "Post-Punk",
    "aliases": [
      "后朋克"
    ],
    "category": "Rock/Metal",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1977",
    "origin_decade": 1970,
    "origin_place": {
      "en": "UK",
      "zh": "英国"
    },
    "cultural_context": {
      "en": "Emerged from punk's wake, trading raw anger for artful experimentation, gothic atmospheres, prominent chorus basslines, and dance rhythms.",
      "zh": "脱胎于朋克浪潮，将粗糙愤怒升华至艺术探索、哥特幽暗氛围、突出的合唱低音与舞动节拍。"
    },
    "bpm_range": "120–145 BPM",
    "default_bpm": 130,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–iv–i",
      "i–VII–VI–VII"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Chorus Guitar",
      "Melodic Chorus Bass Guitar",
      "Analog Synth Textures",
      "Gated-Snare Drum Kit"
    ],
    "sound_design": {
      "en": "Prominent bass guitar with chorus and flanger pedals, jangly chorus guitars, gated snares.",
      "zh": "挂载合唱与凸缘单块的突出贝斯、清脆合唱电吉他扫弦与门限军鼓。"
    },
    "rhythm_features": {
      "en": "Motorik or disco-influenced driving 4/4 beats with sharp rimshots and mechanical precision.",
      "zh": "受德国机械律动（Motorik）或迪斯科启发的推进节拍，机械利落。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Post-Punk signature kick character.",
        "zh": "Post-Punk 风格代表性底鼓特征。"
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
      "tempo": "120–145 BPM"
    },
    "bass_pattern": {
      "en": "High-register, melodic basslines serving as the main melodic hook rather than just backing harmony.",
      "zh": "在高把位弹奏的极富歌唱性贝斯线条，直接担当歌曲核心主旋律 Hook。"
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
        "Place the bass guitar in the frequency and volume center of the mix with stereo chorus",
        "Apply cold, metallic plate reverbs to vocals and drums",
        "Use sparse, angular single-note guitar riffs"
      ],
      "zh": [
        "将贝斯置于混音绝对核心并施加宽立体声合唱效果",
        "为人声与鼓组挂载冰冷金属质感的板式混响",
        "吉他编写稀疏、具有棱角感的单音 Riff 而非厚重和弦扫弦"
      ]
    },
    "representative_tracks": [
      {
        "title": "Post-Punk Anthem",
        "artist": "Joy Division",
        "year": 1977,
        "link": "https://www.youtube.com/results?search_query=Joy+Division+Post-Punk"
      },
      {
        "title": "Midnight in UK",
        "artist": "The Cure",
        "year": 1979,
        "link": "https://www.youtube.com/results?search_query=The+Cure+Post-Punk"
      },
      {
        "title": "Echoes of Post-Punk",
        "artist": "Siouxsie and the Banshees",
        "year": 1981,
        "link": "https://www.youtube.com/results?search_query=Siouxsie+and+the+Banshees+Post-Punk"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Bauhaus",
        "year": 1983,
        "link": "https://www.youtube.com/results?search_query=Bauhaus+Post-Punk"
      },
      {
        "title": "Essential Post-Punk",
        "artist": "Gang of Four",
        "year": 1985,
        "link": "https://www.youtube.com/results?search_query=Gang+of+Four+Post-Punk"
      }
    ],
    "representative_artists": [
      "Joy Division",
      "The Cure",
      "Siouxsie and the Banshees",
      "Bauhaus",
      "Gang of Four"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 4,
      "brightness": 9,
      "harmonicComplexity": 1,
      "rhythmDensity": 8,
      "bassEnergy": 7,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "post-punk",
      "bpm": 135,
      "scale": "D minor",
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
          "instrument": "pick_bass",
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
            50,
            null,
            null,
            50,
            null,
            null,
            53,
            null,
            50,
            null,
            null,
            50,
            null,
            null,
            55,
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
            62,
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
    "id": "new-wave",
    "name": "New Wave",
    "aliases": [
      "新浪潮"
    ],
    "category": "Rock/Metal",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1978",
    "origin_decade": 1970,
    "origin_place": {
      "en": "UK & USA",
      "zh": "英国与美国"
    },
    "cultural_context": {
      "en": "Blended punk's energy with synthesizers, quirky pop songwriting, funky basslines, and polished art-school aesthetics.",
      "zh": "将朋克的朝气与电子合成器、前卫古怪的流行创作、放克贝斯与精致艺术美学交汇。"
    },
    "bpm_range": "120–140 BPM",
    "default_bpm": 128,
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
      "Prophet-5 Analog Synth Pads",
      "Analog Synth Lead",
      "Analog Synth Bass",
      "Clean Chorused Guitar",
      "LinnDrum"
    ],
    "sound_design": {
      "en": "Prophet-5 and Roland Jupiter synthesizers, clean chorused guitars, LinnDrum/acoustic hybrid drums.",
      "zh": "Prophet-5 与 Roland Jupiter 合成器、通透合唱清音吉他与原声/电子混血鼓组。"
    },
    "rhythm_features": {
      "en": "Upbeat, energetic 4/4 rhythms with dance-rock grooves and syncopated high-hat patterns.",
      "zh": "轻快活泼的四四拍律动，兼具舞曲摇滚动感与切分踩镲。"
    },
    "drum_pattern": {
      "kick": {
        "en": "New Wave signature kick character.",
        "zh": "New Wave 风格代表性底鼓特征。"
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
      "en": "Funky, syncopated electric basslines or pulsing analog synth bass lines.",
      "zh": "极富放克律动的切分电贝斯线条，或跳动感十足的模拟合成低音。"
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
        "Balance electronic synthesizers evenly against clean electric guitars",
        "Use crisp Roland CE-2 style chorus on guitars and bass",
        "Emphasize infectious, quirky vocal hooks and danceable grooves"
      ],
      "zh": [
        "让电子合成器与清音电吉他在混音中保持声学平衡",
        "在吉他与贝斯上使用清脆通透的复古合唱效果器",
        "突出记忆点极强的洗脑人声唱段与适合跳舞的放克律动"
      ]
    },
    "representative_tracks": [
      {
        "title": "New Wave Anthem",
        "artist": "Talking Heads",
        "year": 1978,
        "link": "https://www.youtube.com/results?search_query=Talking+Heads+New+Wave"
      },
      {
        "title": "Midnight in UK & USA",
        "artist": "Blondie",
        "year": 1980,
        "link": "https://www.youtube.com/results?search_query=Blondie+New+Wave"
      },
      {
        "title": "Echoes of New Wave",
        "artist": "The Police",
        "year": 1982,
        "link": "https://www.youtube.com/results?search_query=The+Police+New+Wave"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Devo",
        "year": 1984,
        "link": "https://www.youtube.com/results?search_query=Devo+New+Wave"
      },
      {
        "title": "Essential New Wave",
        "artist": "Duran Duran",
        "year": 1986,
        "link": "https://www.youtube.com/results?search_query=Duran+Duran+New+Wave"
      }
    ],
    "representative_artists": [
      "Talking Heads",
      "Blondie",
      "The Police",
      "Devo",
      "Duran Duran"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 6,
      "brightness": 8,
      "harmonicComplexity": 4,
      "rhythmDensity": 7,
      "bassEnergy": 5,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "new-wave",
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
    "id": "heavy-metal",
    "name": "Heavy Metal",
    "aliases": [
      "重金属"
    ],
    "category": "Rock/Metal",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1969",
    "origin_decade": 1960,
    "origin_place": {
      "en": "Birmingham, UK",
      "zh": "英国伯明翰"
    },
    "cultural_context": {
      "en": "Forged in industrial Birmingham by Black Sabbath in 1969, defined by dark tritone riffs, down-tuned guitars, galloping rhythms, and operatic vocals.",
      "zh": "1969 年由 Black Sabbath 开创于伯明翰工业区，以暗黑三全音、降调失真吉他、铁骑奔腾节奏与戏剧性主唱著称。"
    },
    "bpm_range": "110–140 BPM",
    "default_bpm": 120,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭VI–♭VII–i",
      "I–♭VII–IV–I"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Down-Tuned Distorted Guitar",
      "Galloping Picked Bass",
      "Twin Guitar Harmonies",
      "Double-Bass Drum Kit"
    ],
    "sound_design": {
      "en": "Heavy tube distortion, dark tritone intervals, Marshall stacks, galloping double bass drums.",
      "zh": "重度电子管失真、暗黑三全音（魔鬼音程）、马歇尔吉他箱头与狂奔的双底鼓。"
    },
    "rhythm_features": {
      "en": "Heavy pounding 4/4 beats, dynamic tempo changes, and galloping 16th-note double kicks.",
      "zh": "沉重轰鸣的四四拍节拍，戏剧性的速度变化与铁蹄飞奔般的十六分音符双踩底鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Heavy Metal signature kick character.",
        "zh": "Heavy Metal 风格代表性底鼓特征。"
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
      "en": "Galloping basslines (Iron Maiden Steve Harris style) locked to twin guitar harmonies.",
      "zh": "标志性的铁骑奔腾低音线条，与双吉他三度和声紧密齐奏。"
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
        "Use the tritone (augmented 4th / diminished 5th) interval to craft menacing dark riffs",
        "Pan twin lead guitars left and right playing tight melodic harmonies in thirds",
        "Use fast finger-style triplet picking on bass"
      ],
      "zh": [
        "运用三全音（增四度/减五度）构筑充满末世压迫感的暗黑 Riff",
        "将双主音吉他左右分置演奏精密的三度和声对位",
        "在贝斯上采用极速三连音手指拨奏还原经典奔腾感"
      ]
    },
    "representative_tracks": [
      {
        "title": "Heavy Metal Anthem",
        "artist": "Black Sabbath",
        "year": 1969,
        "link": "https://www.youtube.com/results?search_query=Black+Sabbath+Heavy+Metal"
      },
      {
        "title": "Midnight in Birmingham",
        "artist": "Judas Priest",
        "year": 1971,
        "link": "https://www.youtube.com/results?search_query=Judas+Priest+Heavy+Metal"
      },
      {
        "title": "Echoes of Heavy Metal",
        "artist": "Iron Maiden",
        "year": 1973,
        "link": "https://www.youtube.com/results?search_query=Iron+Maiden+Heavy+Metal"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Motörhead",
        "year": 1975,
        "link": "https://www.youtube.com/results?search_query=Motörhead+Heavy+Metal"
      },
      {
        "title": "Essential Heavy Metal",
        "artist": "Ozzy Osbourne",
        "year": 1977,
        "link": "https://www.youtube.com/results?search_query=Ozzy+Osbourne+Heavy+Metal"
      }
    ],
    "representative_artists": [
      "Black Sabbath",
      "Judas Priest",
      "Iron Maiden",
      "Motörhead",
      "Ozzy Osbourne"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 5,
      "brightness": 9,
      "harmonicComplexity": 8,
      "rhythmDensity": 8,
      "bassEnergy": 5,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "heavy-metal",
      "bpm": 130,
      "scale": "E minor",
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
          "instrument": "pick_bass",
          "steps": [
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
            1,
            1,
            0
          ],
          "pitch": [
            null,
            40,
            40,
            null,
            40,
            40,
            null,
            43,
            43,
            null,
            43,
            43,
            null,
            40,
            40,
            null
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "distorted_guitar",
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
    "id": "thrash-metal",
    "name": "Thrash Metal",
    "aliases": [
      "激流金属"
    ],
    "category": "Rock/Metal",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1981",
    "origin_decade": 1980,
    "origin_place": {
      "en": "California, USA",
      "zh": "美国加州"
    },
    "cultural_context": {
      "en": "The Big Four emerged in early 1980s combining the fast tempos of hardcore punk with the intricate twin-guitar shredding of the NWOBHM.",
      "zh": "80 年代初由“激流四巨头”掀起风暴，结合硬核朋克的超高速度与重金属精致激进的双吉他速弹。"
    },
    "bpm_range": "170–220 BPM",
    "default_bpm": 190,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭II–♭VII–i",
      "i–♭VI–♭VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Scooped-Mid High-Gain Guitar",
      "16th-Note Picked Bass",
      "Tight Double Kick",
      "Palm-Muted Riffs"
    ],
    "sound_design": {
      "en": "Scooped-mid tube amplifiers, palm-muted high-speed riffing, tight clicky double kicks.",
      "zh": "凹陷中频（Scooped-mid）失真吉他箱头、极速手掌闷音扫弦与清脆双踩底鼓。"
    },
    "rhythm_features": {
      "en": "Breakneck 180+ BPM tempos with relentless machine-gun double-bass drums and skank beats.",
      "zh": "180+ BPM 极速飞驰，伴随狂风骤雨般的机关枪双踩底鼓与 Skank 快速朋克鼓点。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Thrash Metal signature kick character.",
        "zh": "Thrash Metal 风格代表性底鼓特征。"
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
      "tempo": "170–220 BPM"
    },
    "bass_pattern": {
      "en": "Rapid-fire 16th-note downpicking tightly locked with palm-muted guitar chugs.",
      "zh": "速射十六分音符下拨低音，与吉他手掌闷音重击严丝合缝咬合。"
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
        "Scoop the 800Hz-1kHz range on rhythm guitars to create the aggressive thrash bite",
        "Ensure high-frequency transient click on double-bass drums for clarity at 200 BPM",
        "Tighten low-end guitar frequencies with a high-pass filter around 80Hz"
      ],
      "zh": [
        "衰减吉他 800Hz-1kHz 中频塑造极具侵略性的经典金属切削感",
        "为双踩底鼓增强 4-5kHz 的清脆敲击瞬态以在 200 BPM 下保持颗粒清晰",
        "在 80Hz 对吉他做低切，杜绝超低频杂音与贝斯冲突"
      ]
    },
    "representative_tracks": [
      {
        "title": "Thrash Metal Anthem",
        "artist": "Metallica",
        "year": 1981,
        "link": "https://www.youtube.com/results?search_query=Metallica+Thrash+Metal"
      },
      {
        "title": "Midnight in California",
        "artist": "Slayer",
        "year": 1983,
        "link": "https://www.youtube.com/results?search_query=Slayer+Thrash+Metal"
      },
      {
        "title": "Echoes of Thrash Metal",
        "artist": "Megadeth",
        "year": 1985,
        "link": "https://www.youtube.com/results?search_query=Megadeth+Thrash+Metal"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Anthrax",
        "year": 1987,
        "link": "https://www.youtube.com/results?search_query=Anthrax+Thrash+Metal"
      },
      {
        "title": "Essential Thrash Metal",
        "artist": "Exodus",
        "year": 1989,
        "link": "https://www.youtube.com/results?search_query=Exodus+Thrash+Metal"
      }
    ],
    "representative_artists": [
      "Metallica",
      "Slayer",
      "Megadeth",
      "Anthrax",
      "Exodus"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 5,
      "brightness": 9,
      "harmonicComplexity": 8,
      "rhythmDensity": 10,
      "bassEnergy": 5,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "thrash-metal",
      "bpm": 190,
      "scale": "E minor",
      "swing": 0,
      "tracks": [
        {
          "track_id": "kick",
          "name": "Kick Drum",
          "instrument": "distorted_kick",
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
            120,
            80,
            105,
            80,
            120,
            80,
            105,
            80,
            120,
            80,
            105,
            80,
            120,
            80,
            105,
            80
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
          "instrument": "distorted_guitar",
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
            1,
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
            76,
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
    "id": "death-metal",
    "name": "Death Metal",
    "aliases": [
      "死亡金属"
    ],
    "category": "Rock/Metal",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1984",
    "origin_decade": 1980,
    "origin_place": {
      "en": "Florida, USA & Sweden",
      "zh": "美国佛罗里达与瑞典"
    },
    "cultural_context": {
      "en": "Pioneered by Chuck Schuldiner (Death) and Possessed, pushing metal to brutal extremes with deep guttural growls and blast beats.",
      "zh": "由 Chuck Schuldiner（Death）等人开创，将金属乐推向凶狠极限，以低吼咆哮唱腔与狂暴碎拍（Blast Beat）著称。"
    },
    "bpm_range": "160–240 BPM",
    "default_bpm": 200,
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
      "HM-2 Buzzsaw Guitar",
      "Distorted Bass Guitar",
      "Blast-Beat Drum Kit",
      "Guttural Vocals"
    ],
    "sound_design": {
      "en": "Heavily down-tuned guitars (D-standard, B-standard), Boss HM-2 buzzsaw pedal, guttural vocals.",
      "zh": "大幅降调吉他、Boss HM-2 电锯失真单块、低沉兽吼人声与金属打击击打。"
    },
    "rhythm_features": {
      "en": "Relentless blast beats, extreme double-bass drum barrages, and abrupt stop-start tempo shifts.",
      "zh": "暴风雨般的 Blast Beat 碎拍、极端双踩轰炸与急停急起的骤变变速。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Death Metal signature kick character.",
        "zh": "Death Metal 风格代表性底鼓特征。"
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
      "tempo": "160–240 BPM"
    },
    "bass_pattern": {
      "en": "Distorted, down-tuned pick bass doubling complex chromatic guitar riffs.",
      "zh": "过载降调拨片贝斯，完全齐奏复杂半音阶吉他 Riff。"
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
        "Use the Boss HM-2 with all knobs set to 10 for the legendary Swedish buzzsaw tone",
        "Double-track death metal guttural vocals with an octave lower growl",
        "Use sample reinforcement on kick drums to maintain audible attack during blast beats"
      ],
      "zh": [
        "将 Boss HM-2 踏板全部旋钮拧到满格获得传奇瑞典电锯吉他音色",
        "为死嗓人声叠录低八度的深喉咆哮",
        "在 Blast Beat 极速鼓点下使用底鼓采样强化敲击瞬间瞬态"
      ]
    },
    "representative_tracks": [
      {
        "title": "Death Metal Anthem",
        "artist": "Death",
        "year": 1984,
        "link": "https://www.youtube.com/results?search_query=Death+Death+Metal"
      },
      {
        "title": "Midnight in Florida",
        "artist": "Cannibal Corpse",
        "year": 1986,
        "link": "https://www.youtube.com/results?search_query=Cannibal+Corpse+Death+Metal"
      },
      {
        "title": "Echoes of Death Metal",
        "artist": "Morbid Angel",
        "year": 1988,
        "link": "https://www.youtube.com/results?search_query=Morbid+Angel+Death+Metal"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Obituary",
        "year": 1990,
        "link": "https://www.youtube.com/results?search_query=Obituary+Death+Metal"
      },
      {
        "title": "Essential Death Metal",
        "artist": "Entombed",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=Entombed+Death+Metal"
      }
    ],
    "representative_artists": [
      "Death",
      "Cannibal Corpse",
      "Morbid Angel",
      "Obituary",
      "Entombed"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 6,
      "brightness": 9,
      "harmonicComplexity": 2,
      "rhythmDensity": 10,
      "bassEnergy": 5,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "death-metal",
      "bpm": 200,
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
            120,
            0,
            105,
            0,
            120,
            0,
            105,
            0,
            120,
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
          "instrument": "acoustic_snare",
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
          "velocity": [
            0,
            65,
            0,
            65,
            0,
            65,
            0,
            65,
            0,
            65,
            0,
            65,
            0,
            65,
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
            36,
            36,
            36,
            36,
            36,
            36,
            36,
            36,
            39,
            39,
            39,
            39,
            36,
            36,
            42,
            41
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "distorted_guitar",
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
            78,
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
    "id": "black-metal",
    "name": "Black Metal",
    "aliases": [
      "黑金属"
    ],
    "category": "Rock/Metal",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1984",
    "origin_decade": 1980,
    "origin_place": {
      "en": "Norway & Sweden",
      "zh": "挪威与瑞典"
    },
    "cultural_context": {
      "en": "The early 90s Norwegian second wave defined the genre with raw cold lo-fi production, tremolo picking, blast beats, and high shrieking rasps.",
      "zh": "90 年代初挪威第二浪潮定义了黑金属，以寒冷粗糙的低保真制作、极速轮指扫弦、狂暴碎拍与高音嘶吼著称。"
    },
    "bpm_range": "150–220 BPM",
    "default_bpm": 180,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭II–♭VII–i",
      "i–♭VI–♭II–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Tremolo-Picked Cold Guitar",
      "Buried Distorted Bass Guitar",
      "Lo-Fi Cassette Drums",
      "Shrieked Vocals"
    ],
    "sound_design": {
      "en": "Cold, treble-heavy distorted guitars, rapid tremolo picking, shrieking rasps, lo-fi cassette hiss.",
      "zh": "高频尖锐冰冷的失真吉他、极速轮指扫弦、凄厉尖叫与低保真磁带底噪。"
    },
    "rhythm_features": {
      "en": "Fast, continuous blast beats with washing cymbal rides creating a relentless wall of noise.",
      "zh": "极速持续不断的 Blast Beat 鼓点，伴随碎镲构筑持续不断的轰鸣噪音之墙。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Black Metal signature kick character.",
        "zh": "Black Metal 风格代表性底鼓特征。"
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
      "tempo": "150–220 BPM"
    },
    "bass_pattern": {
      "en": "Buried, understated bassline following the guitar root notes in the background.",
      "zh": "沉潜、克制地跟随吉他根音在深暗背景中隐现的低音线条。"
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
        "Avoid clean studio compression; capture a raw, icy room sound",
        "Layer continuous tremolo picking guitars left and right without palm muting",
        "Use cold digital reverbs on vocals to evoke desolate northern winter landscapes"
      ],
      "zh": [
        "拒绝过度修饰的录音棚平滑压缩，捕捉纯正冰冷的房间质感",
        "让吉他在左右声道持续全速轮指扫弦而不做手掌闷音",
        "为人声加入深邃冰冷的数字混响，勾勒北欧寒冬绝美与绝望"
      ]
    },
    "representative_tracks": [
      {
        "title": "Black Metal Anthem",
        "artist": "Mayhem",
        "year": 1984,
        "link": "https://www.youtube.com/results?search_query=Mayhem+Black+Metal"
      },
      {
        "title": "Midnight in Norway & Sweden",
        "artist": "Darkthrone",
        "year": 1986,
        "link": "https://www.youtube.com/results?search_query=Darkthrone+Black+Metal"
      },
      {
        "title": "Echoes of Black Metal",
        "artist": "Burzum",
        "year": 1988,
        "link": "https://www.youtube.com/results?search_query=Burzum+Black+Metal"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Emperor",
        "year": 1990,
        "link": "https://www.youtube.com/results?search_query=Emperor+Black+Metal"
      },
      {
        "title": "Essential Black Metal",
        "artist": "Immortal",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=Immortal+Black+Metal"
      }
    ],
    "representative_artists": [
      "Mayhem",
      "Darkthrone",
      "Burzum",
      "Emperor",
      "Immortal"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 6,
      "brightness": 10,
      "harmonicComplexity": 8,
      "rhythmDensity": 10,
      "bassEnergy": 3,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "black-metal",
      "bpm": 180,
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
            120,
            0,
            105,
            0,
            120,
            0,
            105,
            0,
            120,
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
          "instrument": "acoustic_snare",
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
          "velocity": [
            0,
            65,
            0,
            65,
            0,
            65,
            0,
            65,
            0,
            65,
            0,
            65,
            0,
            65,
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
            0,
            0,
            0,
            0,
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
            44,
            43
          ],
          "volume": 0.9,
          "pan": 0
        },
        {
          "track_id": "chords",
          "name": "Chords / Pad",
          "instrument": "distorted_guitar",
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
            64,
            64,
            64,
            64,
            64,
            64,
            64,
            64,
            67,
            67,
            67,
            67,
            64,
            64,
            68,
            67
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
            0,
            0,
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
    "id": "doom-metal",
    "name": "Doom Metal",
    "aliases": [
      "毁灭金属"
    ],
    "category": "Rock/Metal",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1980",
    "origin_decade": 1980,
    "origin_place": {
      "en": "UK & USA",
      "zh": "英国与美国"
    },
    "cultural_context": {
      "en": "Takes Black Sabbath's heaviest, slowest riffs to agonizingly slow tempos, invoking crushing weight, despair, and atmospheric gloom.",
      "zh": "将 Black Sabbath 最沉重的暗黑 Riff 推向极其漫长缓慢的时速，营造碾压式的绝望与深邃阴郁。"
    },
    "bpm_range": "45–80 BPM",
    "default_bpm": 65,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭VI–iv–i",
      "i–♭VII–♭VI–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Fuzz-Distorted Down-Tuned Guitar",
      "Fuzzy Analog Bass Guitar",
      "Cavernous Drum Kit",
      "Slow Heavy Riffs"
    ],
    "sound_design": {
      "en": "Massively fuzz-distorted down-tuned guitars, thick analog bass fuzz, cavernous room drums.",
      "zh": "极端法兹过载的超低降调吉他、浓稠模拟贝斯失真与洞穴般开阔真鼓。"
    },
    "rhythm_features": {
      "en": "Glacial, agonizingly slow tempos with massive crashing cymbals and dragging snares.",
      "zh": "如冰川移动般极其缓慢的节奏，伴随震天动地的镲片巨响与拖沓军鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Doom Metal signature kick character.",
        "zh": "Doom Metal 风格代表性底鼓特征。"
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
      "tempo": "45–80 BPM"
    },
    "bass_pattern": {
      "en": "Massive, fuzzy, vibrating low-end bass riffs that sustain for full bars.",
      "zh": "庞大、法兹共振的超重低音 Riff，整小节持续延音撼动地板。"
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
        "Tune guitars down to C-standard or B-standard through vintage Sunn O))) or Orange amplifiers",
        "Keep tempos below 70 BPM to allow guitar chord sustain to fully bloom",
        "Layer a Big Muff fuzz pedal with an overdriven tube preamp"
      ],
      "zh": [
        "吉他降调至 C 或 B 标准音，并通过经典 Sunn O))) 或 Orange 箱头放大",
        "速度严格保持在 70 BPM 以下，让吉他和弦延音充分泛音共振",
        "将 Big Muff 法兹单块与过载电子管前级串联获得浓稠低音"
      ]
    },
    "representative_tracks": [
      {
        "title": "Doom Metal Anthem",
        "artist": "Candlemass",
        "year": 1980,
        "link": "https://www.youtube.com/results?search_query=Candlemass+Doom+Metal"
      },
      {
        "title": "Midnight in UK & USA",
        "artist": "Saint Vitus",
        "year": 1982,
        "link": "https://www.youtube.com/results?search_query=Saint+Vitus+Doom+Metal"
      },
      {
        "title": "Echoes of Doom Metal",
        "artist": "Trouble",
        "year": 1984,
        "link": "https://www.youtube.com/results?search_query=Trouble+Doom+Metal"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Electric Wizard",
        "year": 1986,
        "link": "https://www.youtube.com/results?search_query=Electric+Wizard+Doom+Metal"
      },
      {
        "title": "Essential Doom Metal",
        "artist": "Sleep",
        "year": 1988,
        "link": "https://www.youtube.com/results?search_query=Sleep+Doom+Metal"
      }
    ],
    "representative_artists": [
      "Candlemass",
      "Saint Vitus",
      "Trouble",
      "Electric Wizard",
      "Sleep"
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
      "rhythmDensity": 2,
      "bassEnergy": 5,
      "melodicFocus": 4
    },
    "sequencer_pattern": {
      "genre_id": "doom-metal",
      "bpm": 65,
      "scale": "C minor",
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
            0,
            0,
            0,
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
          "volume": 0.65,
          "pan": 0.25
        },
        {
          "track_id": "bass",
          "name": "Bassline",
          "instrument": "pick_bass",
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
          "instrument": "distorted_guitar",
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
    "id": "metalcore",
    "name": "Metalcore",
    "aliases": [
      "金属核"
    ],
    "category": "Rock/Metal",
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
      "en": "Fuses extreme metal guitar riffing and melodic death metal harmonies with the aggressive breakdowns and gang vocals of hardcore punk.",
      "zh": "将极端金属技巧与旋律死亡金属三度和声同硬核朋克的高能 Breakdown（大蹲点）与怒吼结合。"
    },
    "bpm_range": "130–160 BPM",
    "default_bpm": 140,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭VI–♭VII–i",
      "i–iv–♭VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "High-Gain 5150 Guitar",
      "Clanky Compressed Bass Guitar",
      "Double-Kick Drum Kit",
      "Sub-Bass Breakdown Drops"
    ],
    "sound_design": {
      "en": "High-gain modern 5150 guitar tone, sub-bass drops before breakdowns, crisp double kicks.",
      "zh": "高增益现代 5150 箱头吉他音色、Breakdown 前的超低频下沉炸点与清脆双踩。"
    },
    "rhythm_features": {
      "en": "Dynamic shifts between fast double-bass thrash beats and slow, punishing half-time breakdowns.",
      "zh": "在高速双踩狂奔节拍与极其沉重迟缓的半速 Breakdown 间形成强烈动态切换。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Metalcore signature kick character.",
        "zh": "Metalcore 风格代表性底鼓特征。"
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
      "tempo": "130–160 BPM"
    },
    "bass_pattern": {
      "en": "Modern clanky, high-compression bass with distorted mids and clean sub fundamental.",
      "zh": "现代清脆金属撞击感（Clanky）贝斯，中频失真而超低频坚固干净。"
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
        "Insert a sub-bass sine drop right before the main half-time breakdown hits",
        "Use Darkglass distortion plugin on bass for that modern metallic clank",
        "Alternate between screamed verses and soaring clean vocal choruses"
      ],
      "zh": [
        "在核心半速 Breakdown 爆发前插入超低频正弦波炸弹（Sub Drop）",
        "使用 Darkglass 类贝斯失真插件制作现代金属标志性的金属敲击咔哒声",
        "在嘶吼主歌与高亢清嗓副歌之间形成鲜明情感反差"
      ]
    },
    "representative_tracks": [
      {
        "title": "Metalcore Anthem",
        "artist": "Killswitch Engage",
        "year": 1995,
        "link": "https://www.youtube.com/results?search_query=Killswitch+Engage+Metalcore"
      },
      {
        "title": "Midnight in USA",
        "artist": "As I Lay Dying",
        "year": 1997,
        "link": "https://www.youtube.com/results?search_query=As+I+Lay+Dying+Metalcore"
      },
      {
        "title": "Echoes of Metalcore",
        "artist": "Bring Me The Horizon",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=Bring+Me+The+Horizon+Metalcore"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Architects",
        "year": 2001,
        "link": "https://www.youtube.com/results?search_query=Architects+Metalcore"
      },
      {
        "title": "Essential Metalcore",
        "artist": "Parkway Drive",
        "year": 2003,
        "link": "https://www.youtube.com/results?search_query=Parkway+Drive+Metalcore"
      }
    ],
    "representative_artists": [
      "Killswitch Engage",
      "As I Lay Dying",
      "Bring Me The Horizon",
      "Architects",
      "Parkway Drive"
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
      "rhythmDensity": 4,
      "bassEnergy": 9,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "metalcore",
      "bpm": 145,
      "scale": "D minor",
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
            1,
            0,
            0,
            1,
            0,
            1,
            0,
            0,
            0,
            1,
            0
          ],
          "velocity": [
            120,
            0,
            105,
            0,
            0,
            80,
            0,
            0,
            120,
            0,
            105,
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
            0,
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
          "instrument": "pick_bass",
          "steps": [
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
            0,
            1,
            0
          ],
          "pitch": [
            38,
            null,
            38,
            null,
            null,
            41,
            null,
            null,
            38,
            null,
            38,
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
          "instrument": "distorted_guitar",
          "steps": [
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
            0,
            1,
            0
          ],
          "pitch": [
            62,
            null,
            62,
            null,
            null,
            65,
            null,
            null,
            62,
            null,
            62,
            null,
            null,
            null,
            65,
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
            0,
            0,
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
    "id": "grunge",
    "name": "Grunge",
    "aliases": [
      "垃圾摇滚",
      "西雅图之声"
    ],
    "category": "Rock/Metal",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1986",
    "origin_decade": 1980,
    "origin_place": {
      "en": "Seattle, Washington, USA",
      "zh": "美国华盛顿州西雅图"
    },
    "cultural_context": {
      "en": "Born in late-80s Seattle via Sub Pop records, fusing punk rock raw energy with heavy metal sludge and dynamic quiet-verse-explosive-chorus songwriting.",
      "zh": "80 年代末诞生于西雅图，融合朋克粗砺与重金属泥泞质感，以静谧主歌对撞爆发副歌的动态设计席卷世界。"
    },
    "bpm_range": "90–135 BPM",
    "default_bpm": 115,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭VII–IV–i",
      "i–VI–III–VII"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "DS-1 Distorted Guitar",
      "Warm Picked Bass Guitar",
      "Chorus Pedals",
      "Raw Drum Kit"
    ],
    "sound_design": {
      "en": "Fender Mustang / Jaguar through Boss DS-1 distortion, Electro-Harmonix Small Clone chorus.",
      "zh": "芬达吉他接入 Boss DS-1 失真单块与 Electro-Harmonix Small Clone 合唱效果器。"
    },
    "rhythm_features": {
      "en": "Loose, sludgy 4/4 rock beats with heavy acoustic drum room dynamics.",
      "zh": "松弛粗重、充满泥泞质感的四四拍摇滚律动，伴随辽阔原声房间动态。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Grunge signature kick character.",
        "zh": "Grunge 风格代表性底鼓特征。"
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
      "tempo": "90–135 BPM"
    },
    "bass_pattern": {
      "en": "Warm, melodic, driving pick-played basslines anchoring verse structures.",
      "zh": "温暖、旋律优美且充满推进力的拨片贝斯线条，稳稳撑起主歌骨架。"
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
        "Master the 'quiet-verse, explosive-chorus' dynamic: clean chorused guitars in verse, stomped DS-1 in chorus",
        "Keep drum sounds organic, large, and natural without quantization",
        "Use raspy, emotionally raw vocal tracking"
      ],
      "zh": [
        "精通“静音主歌-爆炸副歌”动态哲学：主歌清音合唱，副歌一脚踩下 DS-1 失真",
        "保持鼓组真实庞大自然，坚决不进行机械量化",
        "保留沙哑破音、情感近乎崩溃的原始人声实录"
      ]
    },
    "representative_tracks": [
      {
        "title": "Grunge Anthem",
        "artist": "Nirvana",
        "year": 1986,
        "link": "https://www.youtube.com/results?search_query=Nirvana+Grunge"
      },
      {
        "title": "Midnight in Seattle",
        "artist": "Pearl Jam",
        "year": 1988,
        "link": "https://www.youtube.com/results?search_query=Pearl+Jam+Grunge"
      },
      {
        "title": "Echoes of Grunge",
        "artist": "Soundgarden",
        "year": 1990,
        "link": "https://www.youtube.com/results?search_query=Soundgarden+Grunge"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Alice in Chains",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=Alice+in+Chains+Grunge"
      },
      {
        "title": "Essential Grunge",
        "artist": "Stone Temple Pilots",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=Stone+Temple+Pilots+Grunge"
      }
    ],
    "representative_artists": [
      "Nirvana",
      "Pearl Jam",
      "Soundgarden",
      "Alice in Chains",
      "Stone Temple Pilots"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 6,
      "brightness": 8,
      "harmonicComplexity": 4,
      "rhythmDensity": 6,
      "bassEnergy": 5,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "grunge",
      "bpm": 110,
      "scale": "E minor",
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
          "instrument": "pick_bass",
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
            null,
            null,
            40,
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
          "instrument": "distorted_guitar",
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
    "id": "alternative-rock",
    "name": "Alternative Rock",
    "aliases": [
      "另类摇滚"
    ],
    "category": "Rock/Metal",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1982",
    "origin_decade": 1980,
    "origin_place": {
      "en": "USA & UK",
      "zh": "美国与英国"
    },
    "cultural_context": {
      "en": "Rose from 1980s underground college radio into 1990s dominance, embracing diverse unconventional chord progressions and poetic angst.",
      "zh": "从 80 年代大学地下电台走向 90 年代全球主流，包容非常规和弦探索与诗意反叛。"
    },
    "bpm_range": "110–140 BPM",
    "default_bpm": 125,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–III–VII",
      "i–♭VII–IV–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Jangly Clean Guitar",
      "Melodic Picked Bass Guitar",
      "Textured Synths",
      "Drum Kit"
    ],
    "sound_design": {
      "en": "Jangly clean electric guitars, fuzz pedals, textured synthesizers, acoustic guitar layers.",
      "zh": "清脆晶莹电吉他、法兹过载、质感合成器与原声木吉他叠层。"
    },
    "rhythm_features": {
      "en": "Dynamic rock rhythm varying from delicate acoustic brush patterns to driving choruses.",
      "zh": "富于动态张力的摇滚节拍，从轻柔沙刷鼓点自由切换至怒放副歌。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Alternative Rock signature kick character.",
        "zh": "Alternative Rock 风格代表性底鼓特征。"
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
      "en": "Expressive, melodic basslines that provide independent counterpoint to guitar hooks.",
      "zh": "富有歌唱性的独立贝斯线条，与吉他旋律形成精巧的对位呼应。"
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
        "Experiment with unconventional chord extensions (add9, sus4) to stand out from standard rock",
        "Blend acoustic and distorted electric guitars in the chorus",
        "Avoid over-tuning vocals to preserve human authenticity"
      ],
      "zh": [
        "大胆使用非常规和弦扩展音（add9、sus4）摆脱平庸摇滚套路",
        "在副歌阶段将木吉他与重型失真电吉他叠层获得浩大声场",
        "避免过度使用音准修正，保留人声颤动与真挚情感"
      ]
    },
    "representative_tracks": [
      {
        "title": "Alternative Rock Anthem",
        "artist": "R.E.M.",
        "year": 1982,
        "link": "https://www.youtube.com/results?search_query=R.E.M.+Alternative+Rock"
      },
      {
        "title": "Midnight in USA & UK",
        "artist": "The Pixies",
        "year": 1984,
        "link": "https://www.youtube.com/results?search_query=The+Pixies+Alternative+Rock"
      },
      {
        "title": "Echoes of Alternative Rock",
        "artist": "Radiohead",
        "year": 1986,
        "link": "https://www.youtube.com/results?search_query=Radiohead+Alternative+Rock"
      },
      {
        "title": "Pulse & Groove",
        "artist": "The Smashing Pumpkins",
        "year": 1988,
        "link": "https://www.youtube.com/results?search_query=The+Smashing+Pumpkins+Alternative+Rock"
      },
      {
        "title": "Essential Alternative Rock",
        "artist": "Foo Fighters",
        "year": 1990,
        "link": "https://www.youtube.com/results?search_query=Foo+Fighters+Alternative+Rock"
      }
    ],
    "representative_artists": [
      "R.E.M.",
      "The Pixies",
      "Radiohead",
      "The Smashing Pumpkins",
      "Foo Fighters"
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
      "rhythmDensity": 6,
      "bassEnergy": 3,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "alternative-rock",
      "bpm": 120,
      "scale": "G major",
      "swing": 5,
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
          "instrument": "pick_bass",
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
            71,
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
    "id": "progressive-rock",
    "name": "Progressive Rock",
    "aliases": [
      "前卫摇滚",
      "Prog Rock"
    ],
    "category": "Rock/Metal",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1968",
    "origin_decade": 1960,
    "origin_place": {
      "en": "UK",
      "zh": "英国"
    },
    "cultural_context": {
      "en": "Elevated rock music to high art by incorporating classical composition, odd time signatures (7/8, 5/4), Mellotrons, and epic extended suites.",
      "zh": "将摇滚乐提升至高阶艺术殿堂，融入古典音乐作曲构架、奇数奇幻拍号（7/8、5/4）、Mellotron 采样器与史诗长篇套曲。"
    },
    "bpm_range": "Complex / Shifting",
    "default_bpm": 120,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–VII–III",
      "ii–V–I"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Electric Guitar",
      "Hammond Organ",
      "Mellotron Strings",
      "Moog Modular Synth",
      "Rickenbacker Bass Guitar"
    ],
    "sound_design": {
      "en": "Mellotron string/flute tapes, Hammond organs, Moog modular synths, acoustic 12-string guitars.",
      "zh": "Mellotron 磁带弦乐与长笛、Hammond 风琴、Moog 模块合成器与 12 弦原声吉他。"
    },
    "rhythm_features": {
      "en": "Constantly shifting, complex time signatures (5/8, 7/8, 11/8) with virtuosic drum fills.",
      "zh": "不断转换的复杂非常规拍号（5/8、7/8、11/8），伴随大师级演奏水准的鼓加花。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Progressive Rock signature kick character.",
        "zh": "Progressive Rock 风格代表性底鼓特征。"
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
      "tempo": "Complex / Shifting"
    },
    "bass_pattern": {
      "en": "Virtuosic, melodic Rickenbacker basslines played with bright attack and aggressive complexity.",
      "zh": "高超大师级、充满歌唱性的 Rickenbacker 贝斯演奏，音色明亮带有清脆击弦质感。"
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
        "Incorporate metric modulation and shifting time signatures across arrangement sections",
        "Layer Mellotron and Hammond organ to create symphonic rock textures",
        "Allow arrangements to breathe across extended 8-15 minute durations"
      ],
      "zh": [
        "在不同段落间自由切换非常规拍号与速度度量转换",
        "将 Mellotron 磁带音色与 Hammond 风琴交叠打造交响摇滚质感",
        "给作品充足时间跨度展开（长达 8 至 15 分钟宏篇巨构）"
      ]
    },
    "representative_tracks": [
      {
        "title": "Progressive Rock Anthem",
        "artist": "Pink Floyd",
        "year": 1968,
        "link": "https://www.youtube.com/results?search_query=Pink+Floyd+Progressive+Rock"
      },
      {
        "title": "Midnight in UK",
        "artist": "King Crimson",
        "year": 1970,
        "link": "https://www.youtube.com/results?search_query=King+Crimson+Progressive+Rock"
      },
      {
        "title": "Echoes of Progressive Rock",
        "artist": "Yes",
        "year": 1972,
        "link": "https://www.youtube.com/results?search_query=Yes+Progressive+Rock"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Genesis",
        "year": 1974,
        "link": "https://www.youtube.com/results?search_query=Genesis+Progressive+Rock"
      },
      {
        "title": "Essential Progressive Rock",
        "artist": "Rush",
        "year": 1976,
        "link": "https://www.youtube.com/results?search_query=Rush+Progressive+Rock"
      }
    ],
    "representative_artists": [
      "Pink Floyd",
      "King Crimson",
      "Yes",
      "Genesis",
      "Rush"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 5,
      "brightness": 6,
      "harmonicComplexity": 6,
      "rhythmDensity": 7,
      "bassEnergy": 3,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "progressive-rock",
      "bpm": 120,
      "scale": "D minor",
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
          "instrument": "pick_bass",
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
            1,
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
            74,
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
    "id": "math-rock",
    "name": "Math Rock",
    "aliases": [
      "数学摇滚"
    ],
    "category": "Rock/Metal",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1989",
    "origin_decade": 1980,
    "origin_place": {
      "en": "USA & Japan",
      "zh": "美国与日本"
    },
    "cultural_context": {
      "en": "Characterized by complex, asymmetrical time signatures (often 7/8, 11/8), intricate two-handed guitar tapping, and clean melodic math precision.",
      "zh": "以非对称奇数拍号（7/8、11/8）、精细复杂的双手点弦技巧与清脆明澈的数学级精密旋律为标志。"
    },
    "bpm_range": "Intricate / Shifting",
    "default_bpm": 130,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭VII–♭VI–V",
      "i–iv–i–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Clean Telecaster Guitar",
      "Two-Handed Tapping",
      "Counter-Melodic Bass Guitar",
      "Natural Drum Kit"
    ],
    "sound_design": {
      "en": "Sparkling clean Telecaster tones, two-handed finger tapping, natural acoustic drums.",
      "zh": "晶莹剔透的 Telecaster 清音吉他、双手点弦泛音与未修饰的自然原声鼓。"
    },
    "rhythm_features": {
      "en": "Asymmetrical polyrhythmic drum grooves shifting between 5/4, 7/8, and 13/8 meters.",
      "zh": "在 5/4、7/8 与 13/8 节拍间自如穿梭的非对称复合节奏鼓组。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Math Rock signature kick character.",
        "zh": "Math Rock 风格代表性底鼓特征。"
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
      "tempo": "Intricate / Shifting"
    },
    "bass_pattern": {
      "en": "Intricate counter-melodic basslines threading between complex guitar tapping loops.",
      "zh": "复杂对位旋律贝斯线条，在交织的点弦吉他乐句中如穿针引线。"
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
        "Use open tunings (such as DAEAC#E or FACGCE) for resonant two-handed tapping",
        "Keep guitar tone sparkling clean with subtle compression and fast room reverb",
        "Record drums with minimal compression to preserve wide dynamic subtleties"
      ],
      "zh": [
        "使用特殊开放调弦（如 DAEAC#E 或 FACGCE）获取空灵点弦共鸣",
        "吉他音色保持极致清澈，配合微量压缩与短房间混响",
        "鼓组录音避免重度压缩，完整保留乐手演奏的呼吸弱音细节"
      ]
    },
    "representative_tracks": [
      {
        "title": "Math Rock Anthem",
        "artist": "American Football",
        "year": 1989,
        "link": "https://www.youtube.com/results?search_query=American+Football+Math+Rock"
      },
      {
        "title": "Midnight in USA & Japan",
        "artist": "Covet",
        "year": 1991,
        "link": "https://www.youtube.com/results?search_query=Covet+Math+Rock"
      },
      {
        "title": "Echoes of Math Rock",
        "artist": "Toe",
        "year": 1993,
        "link": "https://www.youtube.com/results?search_query=Toe+Math+Rock"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Battles",
        "year": 1995,
        "link": "https://www.youtube.com/results?search_query=Battles+Math+Rock"
      },
      {
        "title": "Essential Math Rock",
        "artist": "Don Caballero",
        "year": 1997,
        "link": "https://www.youtube.com/results?search_query=Don+Caballero+Math+Rock"
      }
    ],
    "representative_artists": [
      "American Football",
      "Covet",
      "Toe",
      "Battles",
      "Don Caballero"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 10,
      "harmonicComplexity": 6,
      "rhythmDensity": 9,
      "bassEnergy": 3,
      "melodicFocus": 9
    },
    "sequencer_pattern": {
      "genre_id": "math-rock",
      "bpm": 130,
      "scale": "F major",
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
          "instrument": "tight_snare",
          "steps": [
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
            0,
            65,
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
          "instrument": "pick_bass",
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
            41,
            null,
            null,
            45,
            null,
            null,
            41,
            null,
            null,
            null,
            48,
            null,
            null,
            45,
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
            77,
            null,
            81,
            77,
            null,
            84,
            null,
            null,
            81,
            82,
            null,
            77,
            null,
            null,
            86
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
    "id": "shoe-gaze",
    "name": "Shoegaze",
    "aliases": [
      "自赏摇滚",
      "鞋窥摇滚"
    ],
    "category": "Rock/Metal",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1988",
    "origin_decade": 1980,
    "origin_place": {
      "en": "UK & Ireland",
      "zh": "英国与爱尔兰"
    },
    "cultural_context": {
      "en": "Pioneered by Kevin Shields with Loveless, drowning dream-pop melodies in colossal walls of whammy-bar reverse-reverb guitar noise.",
      "zh": "由 Kevin Shields（My Bloody Valentine）等人开创，将梦泡旋律彻底沉浸在由摇把滑弦、反向混响与失真共筑的浩瀚吉他音海中。"
    },
    "bpm_range": "95–130 BPM",
    "default_bpm": 115,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–III–VII",
      "I–V–vi–IV"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Glide Guitar (Whammy Bar)",
      "Reverse-Reverb Fuzz Walls",
      "Driving Root-Note Bass Guitar",
      "Hushed Vocals & Drums"
    ],
    "sound_design": {
      "en": "Yamaha SPX90 reverse reverb, glide guitar whammy strumming, fuzz walls, hushed whisper vocals.",
      "zh": "Yamaha SPX90 反向混响、摇把滑弦演奏（Glide Guitar）、法兹音墙与耳畔低语般的人声。"
    },
    "rhythm_features": {
      "en": "Steady, driving 4/4 beats buried softly beneath an all-consuming sonic wave of swirling distortion.",
      "zh": "沉潜于铺天盖地失真音浪之下的稳定四四拍节奏，柔和而不失律动。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Shoegaze signature kick character.",
        "zh": "Shoegaze 风格代表性底鼓特征。"
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
      "tempo": "95–130 BPM"
    },
    "bass_pattern": {
      "en": "Driving root-note basslines holding the harmonic anchor while guitars swirl chaotically.",
      "zh": "坚实稳固的根音贝斯线条，在吉他狂乱回旋飘扬时牢牢锁定和声引力。"
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
        "Route fuzz pedals into a reverse reverb processor (or reverse reverb into fuzz) for the signature MBV wall",
        "Hold the guitar tremolo arm while strumming to create the iconic pitch glide",
        "Bury the vocals in the mix at equal volume with the guitars"
      ],
      "zh": [
        "将法兹单块接入反向混响（或反向混响推入法兹）获得标志性 MBV 轰鸣音墙",
        "扫弦时右手手掌始终握住吉他摇把形成迷离音高微滑（Glide Guitar）",
        "将人声音轨音量降至与吉他平齐，制造隐匿于云雾中的朦胧听感"
      ]
    },
    "representative_tracks": [
      {
        "title": "Shoegaze Anthem",
        "artist": "My Bloody Valentine",
        "year": 1988,
        "link": "https://www.youtube.com/results?search_query=My+Bloody+Valentine+Shoegaze"
      },
      {
        "title": "Midnight in UK & Ireland",
        "artist": "Slowdive",
        "year": 1990,
        "link": "https://www.youtube.com/results?search_query=Slowdive+Shoegaze"
      },
      {
        "title": "Echoes of Shoegaze",
        "artist": "Ride",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=Ride+Shoegaze"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Lush",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=Lush+Shoegaze"
      },
      {
        "title": "Essential Shoegaze",
        "artist": "Swervedriver",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Swervedriver+Shoegaze"
      }
    ],
    "representative_artists": [
      "My Bloody Valentine",
      "Slowdive",
      "Ride",
      "Lush",
      "Swervedriver"
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
      "rhythmDensity": 6,
      "bassEnergy": 5,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "shoe-gaze",
      "bpm": 108,
      "scale": "A major",
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
          "instrument": "pick_bass",
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
            49,
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
            73,
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
            81,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            85,
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
