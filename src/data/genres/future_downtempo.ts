import { Genre } from '../../types/genre';

export const FUTURE_DOWNTEMPO_GENRES: Genre[] = [
  {
    "id": "future-bass",
    "name": "Future Bass",
    "aliases": [
      "未来贝斯"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2012",
    "origin_decade": 2010,
    "origin_place": {
      "en": "Australia & USA",
      "zh": "澳大利亚与美国"
    },
    "cultural_context": {
      "en": "Emerged in early 2010s championed by Flume, featuring sidechained lush supersaw chords modulated by LFOs, bright arpeggios, and heavy 808s.",
      "zh": "2010 年代初由 Flume 等人掀起风潮，以受 LFO 调制的侧链明亮 Supersaw 和弦、晶莹琶音与厚重 808 著称。"
    },
    "bpm_range": "140–160 BPM",
    "default_bpm": 150,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–V–vi–IV",
      "vi–IV–I–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Detuned Supersaw Lead",
      "Low-Pass LFO Wobble",
      "Clean 808 Bass",
      "Bright Arpeggios",
      "Vocal Chops"
    ],
    "sound_design": {
      "en": "Detuned supersaws with low-pass LFO wobble, vocal chops, bright arpeggios, clean 808 bass.",
      "zh": "带有 LFO 滤波摇动的去谐 Supersaw、音高滑音人声切片、闪烁琶音与纯净 808 贝斯。"
    },
    "rhythm_features": {
      "en": "Syncopated half-time groove with prominent snare on beat 3 and stuttering hi-hat rolls.",
      "zh": "切分半速律动，第 3 拍落响亮大军鼓，配合灵动的踩镲滚奏与顿挫停顿。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Future Bass signature kick character.",
        "zh": "Future Bass 风格代表性底鼓特征。"
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
      "tempo": "140–160 BPM"
    },
    "bass_pattern": {
      "en": "Deep 808 sub bass following chord root notes with smooth envelope glides.",
      "zh": "紧跟和弦根音进行的深沉 808 超低音，带有顺滑的包络滑音。"
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
        "Modulate low-pass filter cutoff with a syncopated LFO on the supersaw bus",
        "Use vocal chops as melodic lead elements with heavy stereo ping-pong delay",
        "Sidechain everything to the kick and snare for immense bounce"
      ],
      "zh": [
        "用切分节奏的 LFO 调制 Supersaw 总线上的低通滤波截止频率",
        "把人声切片作为主音旋律并挂载宽立体声乒乓延迟",
        "对所有和声乐器施加深侧链闪避营造极佳弹性"
      ]
    },
    "representative_tracks": [
      {
        "title": "Future Bass Anthem",
        "artist": "Flume",
        "year": 2012,
        "link": "https://www.youtube.com/results?search_query=Flume+Future+Bass"
      },
      {
        "title": "Midnight in Australia & USA",
        "artist": "San Holo",
        "year": 2014,
        "link": "https://www.youtube.com/results?search_query=San+Holo+Future+Bass"
      },
      {
        "title": "Echoes of Future Bass",
        "artist": "Illenium",
        "year": 2016,
        "link": "https://www.youtube.com/results?search_query=Illenium+Future+Bass"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Marshmello",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=Marshmello+Future+Bass"
      },
      {
        "title": "Essential Future Bass",
        "artist": "Wave Racer",
        "year": 2020,
        "link": "https://www.youtube.com/results?search_query=Wave+Racer+Future+Bass"
      }
    ],
    "representative_artists": [
      "Flume",
      "San Holo",
      "Illenium",
      "Marshmello",
      "Wave Racer"
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
      "rhythmDensity": 5,
      "bassEnergy": 10,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "future-bass",
      "bpm": 150,
      "scale": "F major",
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
            3,
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
            65,
            null,
            null,
            69,
            null,
            null,
            65,
            null,
            null,
            null,
            65,
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
    "id": "kawaii-future-bass",
    "name": "Kawaii Future Bass",
    "aliases": [
      "可爱未来贝斯"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2015",
    "origin_decade": 2010,
    "origin_place": {
      "en": "Japan",
      "zh": "日本"
    },
    "cultural_context": {
      "en": "Pioneered in Japan by Snail's House, infusing future bass with cheerful anime vocal samples, chiptune 8-bit blips, and upbeat major keys.",
      "zh": "由 Snail's House 等人在日本创立，将未来贝斯与欢快萌系动漫人声采样、8位复古芯片音效及阳光大调旋律结合。"
    },
    "bpm_range": "150–165 BPM",
    "default_bpm": 160,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–V–vi–IV",
      "IV–V–iii–vi"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Bright Bells",
      "8-Bit Game Arpeggios",
      "Super-Bouncy Supersaws",
      "808 Bass",
      "Anime Vocal Giggles"
    ],
    "sound_design": {
      "en": "High-pitched anime vocal giggles, 8-bit game arpeggios, bright bells, super-bouncy supersaws.",
      "zh": "高音调动漫萌系人声、8位复古游戏点音、晶莹八音盒电铃与极具弹跳感的亮彩 Supersaw。"
    },
    "rhythm_features": {
      "en": "Frantic, playful half-time beats layered with rapid foley clicks, vinyl pops, and bright claps.",
      "zh": "活泼俏皮的半速节拍，叠置密集的拟音微撞击、黑胶爆豆与清脆拍手。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Kawaii Future Bass signature kick character.",
        "zh": "Kawaii Future Bass 风格代表性底鼓特征。"
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
      "tempo": "150–165 BPM"
    },
    "bass_pattern": {
      "en": "Warm, bouncing sub-bass supporting cheerful major 7th and add9 chord progressions.",
      "zh": "温暖有弹性的超低音，坚实托起欢欣的大七（maj7）与加九（add9）和弦走向。"
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
        "Compose in major keys (F major, C major) with anime-style IV-V-iii-vi chord progressions",
        "Incorporate video game foley (coin collects, jump sounds) as percussion",
        "Keep saw chords bright by leaving the low-pass filter open"
      ],
      "zh": [
        "使用王道进行（IV-V-iii-vi）等日系大调和弦创作旋律",
        "融入复古电子游戏音效（金币拾取、跳跃弹簧）作为打击乐点缀",
        "让低通滤波器充分打开保持和弦音色晶莹剔透"
      ]
    },
    "representative_tracks": [
      {
        "title": "Kawaii Future Bass Anthem",
        "artist": "Snail's House",
        "year": 2015,
        "link": "https://www.youtube.com/results?search_query=Snail's+House+Kawaii+Future+Bass"
      },
      {
        "title": "Midnight in Japan",
        "artist": "Yunomi",
        "year": 2017,
        "link": "https://www.youtube.com/results?search_query=Yunomi+Kawaii+Future+Bass"
      },
      {
        "title": "Echoes of Kawaii Future Bass",
        "artist": "Kero Kero Bonito",
        "year": 2019,
        "link": "https://www.youtube.com/results?search_query=Kero+Kero+Bonito+Kawaii+Future+Bass"
      },
      {
        "title": "Pulse & Groove",
        "artist": "TORIENA",
        "year": 2021,
        "link": "https://www.youtube.com/results?search_query=TORIENA+Kawaii+Future+Bass"
      },
      {
        "title": "Essential Kawaii Future Bass",
        "artist": "PSYQUI",
        "year": 2023,
        "link": "https://www.youtube.com/results?search_query=PSYQUI+Kawaii+Future+Bass"
      }
    ],
    "representative_artists": [
      "Snail's House",
      "Yunomi",
      "Kero Kero Bonito",
      "TORIENA",
      "PSYQUI"
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
      "rhythmDensity": 6,
      "bassEnergy": 10,
      "melodicFocus": 10
    },
    "sequencer_pattern": {
      "genre_id": "kawaii-future-bass",
      "bpm": 155,
      "scale": "C major",
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
            60,
            null,
            null,
            64,
            null,
            null,
            60,
            null,
            null,
            null,
            60,
            null,
            null,
            67,
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
            1,
            0,
            0,
            1,
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
            79,
            null,
            null,
            84,
            null,
            83,
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
    "id": "synthwave",
    "name": "Synthwave",
    "aliases": [
      "合成器波",
      "复古合成"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2005",
    "origin_decade": 2000,
    "origin_place": {
      "en": "France & USA",
      "zh": "法国与美国"
    },
    "cultural_context": {
      "en": "Inspired by 1980s film soundtracks and video games, celebrating retro-futuristic nostalgia with gated reverbs and analog polysynths.",
      "zh": "灵感源自 80 年代经典科幻电影配乐与街机游戏，以门限混响军鼓与经典模拟多音合成器颂唱复古未来怀旧。"
    },
    "bpm_range": "100–125 BPM",
    "default_bpm": 115,
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
      "Jupiter-8 Polysynth Pads",
      "DX7 Electric Piano",
      "Analog Synth Lead",
      "LinnDrum Gated Snares",
      "Analog Synth Bass"
    ],
    "sound_design": {
      "en": "LinnDrum/Oberheim DMX gated snares, Roland Jupiter-8 polysynth pads, Yamaha DX7 electric pianos.",
      "zh": "LinnDrum 门限混响军鼓、Roland Jupiter-8 温暖多音铺底与 Yamaha DX7 晶莹电钢琴。"
    },
    "rhythm_features": {
      "en": "Driving 4/4 rhythm with powerful gated snare on beats 2 and 4 and driving 16th hats.",
      "zh": "充满推进力的四四拍律动，在 2、4 拍击打震耳欲聋的门限混响大军鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Synthwave signature kick character.",
        "zh": "Synthwave 风格代表性底鼓特征。"
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
      "tempo": "100–125 BPM"
    },
    "bass_pattern": {
      "en": "Driving, running 16th-note analog arpeggiated basslines (the 'running bass').",
      "zh": "飞驰奔流的十六分音符模拟合成琶音低音（经典的 Running Bass 律动）。"
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
        "Apply non-linear gated reverb to your snare with 0.5s cutoff",
        "Use an arpeggiator on an analog saw bass preset running 16th notes",
        "Add subtle pitch chorus and tape flutter to polysynth pads"
      ],
      "zh": [
        "为军鼓挂载衰减 0.5 秒截断的非线性门限混响（Gated Reverb）",
        "在模拟锯齿波低音上加载十六分音符琶音器打造奔跑律动",
        "为和弦铺底加入微小合唱与模拟磁带颤音效果"
      ]
    },
    "representative_tracks": [
      {
        "title": "Synthwave Anthem",
        "artist": "Kavinsky",
        "year": 2005,
        "link": "https://www.youtube.com/results?search_query=Kavinsky+Synthwave"
      },
      {
        "title": "Midnight in France & USA",
        "artist": "Carpenter Brut",
        "year": 2007,
        "link": "https://www.youtube.com/results?search_query=Carpenter+Brut+Synthwave"
      },
      {
        "title": "Echoes of Synthwave",
        "artist": "The Midnight",
        "year": 2009,
        "link": "https://www.youtube.com/results?search_query=The+Midnight+Synthwave"
      },
      {
        "title": "Pulse & Groove",
        "artist": "GUNSHIP",
        "year": 2011,
        "link": "https://www.youtube.com/results?search_query=GUNSHIP+Synthwave"
      },
      {
        "title": "Essential Synthwave",
        "artist": "Timecop1983",
        "year": 2013,
        "link": "https://www.youtube.com/results?search_query=Timecop1983+Synthwave"
      }
    ],
    "representative_artists": [
      "Kavinsky",
      "Carpenter Brut",
      "The Midnight",
      "GUNSHIP",
      "Timecop1983"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 4,
      "brightness": 7,
      "harmonicComplexity": 8,
      "rhythmDensity": 9,
      "bassEnergy": 6,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "synthwave",
      "bpm": 110,
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
    "id": "vaporwave",
    "name": "Vaporwave",
    "aliases": [
      "蒸汽波"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2010",
    "origin_decade": 2010,
    "origin_place": {
      "en": "Internet",
      "zh": "互联网"
    },
    "cultural_context": {
      "en": "An internet-born satirical microgenre chopping and slowing down 1980s smooth jazz, corporate lounge music, and commercial jingles.",
      "zh": "发端于互联网的解构流派，截取 80 年代轻柔爵士、电梯音乐与广告伴奏并降速变调，充盈消费主义迷梦。"
    },
    "bpm_range": "60–90 BPM",
    "default_bpm": 75,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–vi–IV–V",
      "ii–V–I"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Slowed Vinyl Samples",
      "Tape Chorus & Wow",
      "Muffled Synth Plucks",
      "Rhodes Chords",
      "Sub Bass",
      "Phaser Sweeps"
    ],
    "sound_design": {
      "en": "Slowed-down vinyl samples, phasers, tape chorus, muffled telephone filters.",
      "zh": "降速降调的黑胶采样、移相器、磁带合唱与沉闷的电话滤波质感。"
    },
    "rhythm_features": {
      "en": "Languid, heavy, slowed-down 4/4 or boom-bap beats with lazy swung hi-hats.",
      "zh": "慵懒沉重、放慢步调的四四拍或 Boom-Bap 节拍，踩镲带有松垮摇摆。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Vaporwave signature kick character.",
        "zh": "Vaporwave 风格代表性底鼓特征。"
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
      "en": "Warm, pillowy, pitched-down acoustic or synth bass lines from original samples.",
      "zh": "源自原采样的温暖绵软、降调后充满低频共鸣的原声或合成贝斯线条。"
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
        "Slow down a 1980s city pop or smooth jazz track by 15-25% without time correction",
        "Apply stereo phasers and tape flangers to the entire master bus",
        "Layer tape hiss and VHS audio static in the background"
      ],
      "zh": [
        "将 80 年代城市流行或轻爵士采样降速 15-25% 且不进行时间矫正",
        "在总线上挂载宽立体声移相器与磁带凸缘效果",
        "在背景层轻柔铺设录像带（VHS）电流底噪"
      ]
    },
    "representative_tracks": [
      {
        "title": "Vaporwave Anthem",
        "artist": "Macintosh Plus",
        "year": 2010,
        "link": "https://www.youtube.com/results?search_query=Macintosh+Plus+Vaporwave"
      },
      {
        "title": "Midnight in Internet",
        "artist": "Saint Pepsi",
        "year": 2012,
        "link": "https://www.youtube.com/results?search_query=Saint+Pepsi+Vaporwave"
      },
      {
        "title": "Echoes of Vaporwave",
        "artist": "Blank Banshee",
        "year": 2014,
        "link": "https://www.youtube.com/results?search_query=Blank+Banshee+Vaporwave"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Surfing",
        "year": 2016,
        "link": "https://www.youtube.com/results?search_query=Surfing+Vaporwave"
      },
      {
        "title": "Essential Vaporwave",
        "artist": "ECO VIRTUAL",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=ECO+VIRTUAL+Vaporwave"
      }
    ],
    "representative_artists": [
      "Macintosh Plus",
      "Saint Pepsi",
      "Blank Banshee",
      "Surfing",
      "ECO VIRTUAL"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 5,
      "harmonicComplexity": 6,
      "rhythmDensity": 4,
      "bassEnergy": 7,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "vaporwave",
      "bpm": 84,
      "scale": "F major",
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
            45,
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
            77,
            null,
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
    "id": "chillwave",
    "name": "Chillwave",
    "aliases": [
      "冷波",
      "寒潮音乐"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2009",
    "origin_decade": 2000,
    "origin_place": {
      "en": "USA",
      "zh": "美国"
    },
    "cultural_context": {
      "en": "Emerged in late 2000s, characterized by hazy analog synths, reverb-soaked vocals, lo-fi aesthetics, and sunny summer nostalgia.",
      "zh": "兴起于 2000 年代末，以如梦似幻的薄雾模拟合成器、浸润混响的梦幻人声与夏日怀旧感闻名。"
    },
    "bpm_range": "80–100 BPM",
    "default_bpm": 90,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–V–vi–IV",
      "vi–IV–I–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Analog Polysynths",
      "Woozy Tape Vibrato",
      "Drenched Vocal Reverbs",
      "Plucked Synth",
      "Warm Pad",
      "Sub Bass"
    ],
    "sound_design": {
      "en": "Analog polysynths, woozy tape vibrato, drenched vocal reverbs, soft acoustic drums.",
      "zh": "温暖模拟多音合成器、微醺的磁带音高抖动、开阔人声混响与松软原声鼓。"
    },
    "rhythm_features": {
      "en": "Mid-tempo, relaxing drum machine rhythms with gentle tambourines and loose swing.",
      "zh": "中速舒缓的电子鼓机节拍，穿插着柔和的手摇铃与松散自然的摇摆。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Chillwave signature kick character.",
        "zh": "Chillwave 风格代表性底鼓特征。"
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
      "tempo": "80–100 BPM"
    },
    "bass_pattern": {
      "en": "Simple, melodic, warm synth basslines holding down relaxed chord progressions.",
      "zh": "质朴温暖且极具旋律美的合成低音线条，托举舒缓惬意的和弦流动。"
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
        "Add tape pitch flutter modulation (vibrato) to synth chords for an authentic vintage warp",
        "Drench vocals in 100% wet plate reverb with long decay",
        "Keep drum machine sounds warm with analog tape saturation"
      ],
      "zh": [
        "为合成和弦加入磁带音高颤动调制，营造复古微醺感",
        "将背景人声推入全湿板式混响中打造空灵氛围",
        "对电子鼓组做模拟磁带饱和让击打质地温润自然"
      ]
    },
    "representative_tracks": [
      {
        "title": "Chillwave Anthem",
        "artist": "Washed Out",
        "year": 2009,
        "link": "https://www.youtube.com/results?search_query=Washed+Out+Chillwave"
      },
      {
        "title": "Midnight in USA",
        "artist": "Toro y Moi",
        "year": 2011,
        "link": "https://www.youtube.com/results?search_query=Toro+y+Moi+Chillwave"
      },
      {
        "title": "Echoes of Chillwave",
        "artist": "Neon Indian",
        "year": 2013,
        "link": "https://www.youtube.com/results?search_query=Neon+Indian+Chillwave"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Small Black",
        "year": 2015,
        "link": "https://www.youtube.com/results?search_query=Small+Black+Chillwave"
      },
      {
        "title": "Essential Chillwave",
        "artist": "Memory Tapes",
        "year": 2017,
        "link": "https://www.youtube.com/results?search_query=Memory+Tapes+Chillwave"
      }
    ],
    "representative_artists": [
      "Washed Out",
      "Toro y Moi",
      "Neon Indian",
      "Small Black",
      "Memory Tapes"
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
      "rhythmDensity": 4,
      "bassEnergy": 5,
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "chillwave",
      "bpm": 90,
      "scale": "G major",
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
            43,
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
    "id": "downtempo",
    "name": "Downtempo",
    "aliases": [
      "缓拍音乐",
      "慢摇"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1990",
    "origin_decade": 1990,
    "origin_place": {
      "en": "UK & Europe",
      "zh": "英国与欧洲"
    },
    "cultural_context": {
      "en": "A relaxed electronic genre emphasizing acoustic instruments, ambient atmospheres, warm organic grooves, and slow breakbeats.",
      "zh": "注重原声乐器质感、环境氛围、温暖有机律动与慢速碎拍的舒缓电子流派。"
    },
    "bpm_range": "80–105 BPM",
    "default_bpm": 90,
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
      "Warm Fender Rhodes",
      "Acoustic Bass Guitar",
      "Lush String Quartet",
      "Gentle Wind Chimes"
    ],
    "sound_design": {
      "en": "Acoustic bass guitars, warm Fender Rhodes, lush string quartets, gentle wind chimes.",
      "zh": "原声贝斯吉他、温暖 Fender Rhodes、原声弦乐四重奏与轻柔风铃。"
    },
    "rhythm_features": {
      "en": "Relaxed, laid-back breakbeat groove with organic percussion layers and subtle ghost notes.",
      "zh": "从容放松的慢速碎拍律动，配合有机打击乐叠层与细腻幽灵音。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Downtempo signature kick character.",
        "zh": "Downtempo 风格代表性底鼓特征。"
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
      "tempo": "80–105 BPM"
    },
    "bass_pattern": {
      "en": "Warm acoustic upright bass or round electric bass playing expressive walking lines.",
      "zh": "温暖的立式原声低音或圆润电贝斯，演奏富有表现力的行进低音。"
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
        "Layer real recorded shakers and bongos over electronic drum loops",
        "Use dynamic tape saturation on acoustic instruments",
        "Keep track tempos below 100 BPM for ultimate relaxation"
      ],
      "zh": [
        "在电子鼓循环上方叠录真实的沙锤与邦戈鼓敲击",
        "在原声乐器上应用动态磁带饱和赋予模拟厚度",
        "严格将速度控制在 100 BPM 以下以确保极致放松体验"
      ]
    },
    "representative_tracks": [
      {
        "title": "Downtempo Anthem",
        "artist": "Bonobo",
        "year": 1990,
        "link": "https://www.youtube.com/results?search_query=Bonobo+Downtempo"
      },
      {
        "title": "Midnight in UK & Europe",
        "artist": "Tycho",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=Tycho+Downtempo"
      },
      {
        "title": "Echoes of Downtempo",
        "artist": "Thievery Corporation",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=Thievery+Corporation+Downtempo"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Kruder & Dorfmeister",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Kruder+&+Dorfmeister+Downtempo"
      },
      {
        "title": "Essential Downtempo",
        "artist": "Zero 7",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Zero+7+Downtempo"
      }
    ],
    "representative_artists": [
      "Bonobo",
      "Tycho",
      "Thievery Corporation",
      "Kruder & Dorfmeister",
      "Zero 7"
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
      "rhythmDensity": 5,
      "bassEnergy": 5,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "downtempo",
      "bpm": 95,
      "scale": "D minor",
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
          "instrument": "strings_lead",
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
    "id": "trip-hop",
    "name": "Trip Hop",
    "aliases": [
      "神游舞曲"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1993",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Bristol, UK",
      "zh": "英国布里斯托"
    },
    "cultural_context": {
      "en": "Pioneered in Bristol by Massive Attack and Portishead, blending slow hip-hop breakbeats with dark cinematic strings, jazz samples, and soul.",
      "zh": "由 Massive Attack 与 Portishead 等人在布里斯托创立，将慢速嘻哈碎拍、暗黑电影弦乐与迷幻爵士融于一炉。"
    },
    "bpm_range": "75–95 BPM",
    "default_bpm": 85,
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
      "Cinematic Dark Strings",
      "Muted Trumpet",
      "Crackling Vinyl Chops",
      "Heavy Sub Bass",
      "Warm Pad"
    ],
    "sound_design": {
      "en": "Cinematic dark strings, crackling vinyl jazz chops, muted trumpets, heavy sub-bass.",
      "zh": "暗黑电影管弦乐、黑胶爵士切片、弱音小号与深沉超低频。"
    },
    "rhythm_features": {
      "en": "Heavy, slow, dragging hip-hop breakbeat with crackling vinyl snare and laid-back feel.",
      "zh": "沉重拖沓的慢速嘻哈碎拍，伴随黑胶爆豆军鼓与深沉后倾听感。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Trip Hop signature kick character.",
        "zh": "Trip Hop 风格代表性底鼓特征。"
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
      "en": "Deep, rumbling dub-influenced electric basslines anchoring dark minor chords.",
      "zh": "受牙买加 Dub 启发的深邃轰鸣电贝斯线条，奠定暗黑小调和声地基。"
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
        "Sample vintage 1960s spy or noir soundtrack strings",
        "Slow down acoustic funk drum breaks to 85 BPM for heavy drag",
        "Add spring reverb to guitars and rimshots for shadowy space"
      ],
      "zh": [
        "采样 60 年代复古黑色谍战电影弦乐片段",
        "将原声放克鼓循环放慢至 85 BPM 营造沉重拖拽感",
        "为吉他与边击挂载弹簧混响营造阴郁悬疑空间"
      ]
    },
    "representative_tracks": [
      {
        "title": "Trip Hop Anthem",
        "artist": "Massive Attack",
        "year": 1993,
        "link": "https://www.youtube.com/results?search_query=Massive+Attack+Trip+Hop"
      },
      {
        "title": "Midnight in Bristol",
        "artist": "Portishead",
        "year": 1995,
        "link": "https://www.youtube.com/results?search_query=Portishead+Trip+Hop"
      },
      {
        "title": "Echoes of Trip Hop",
        "artist": "Tricky",
        "year": 1997,
        "link": "https://www.youtube.com/results?search_query=Tricky+Trip+Hop"
      },
      {
        "title": "Pulse & Groove",
        "artist": "DJ Shadow",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=DJ+Shadow+Trip+Hop"
      },
      {
        "title": "Essential Trip Hop",
        "artist": "Morcheeba",
        "year": 2001,
        "link": "https://www.youtube.com/results?search_query=Morcheeba+Trip+Hop"
      }
    ],
    "representative_artists": [
      "Massive Attack",
      "Portishead",
      "Tricky",
      "DJ Shadow",
      "Morcheeba"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 3,
      "harmonicComplexity": 2,
      "rhythmDensity": 4,
      "bassEnergy": 9,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "trip-hop",
      "bpm": 85,
      "scale": "C minor",
      "swing": 25,
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
          "instrument": "strings_lead",
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
            72,
            null,
            null,
            null,
            null,
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
    "id": "glitch-hop",
    "name": "Glitch Hop",
    "aliases": [
      "故障嘻哈"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2001",
    "origin_decade": 2000,
    "origin_place": {
      "en": "Global",
      "zh": "全球"
    },
    "cultural_context": {
      "en": "Marries the funky swing of mid-tempo hip-hop with cutting-edge digital audio glitches, micro-edits, and neuro-bass sound design.",
      "zh": "将中速嘻哈的放克摇摆与前沿数字音频毛刺、微观精密切片及神经质贝斯音色设计融合。"
    },
    "bpm_range": "100–115 BPM",
    "default_bpm": 105,
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
      "Microscopic Buffer Repeats",
      "Bitcrushed Clicks",
      "Funky Clavinet Stabs",
      "Modular Growl Bass",
      "Square-Wave Lead",
      "Warm Pad"
    ],
    "sound_design": {
      "en": "Microscopic buffer repeats, bitcrushed clicks, funky clavinet stabs, modular growl basses.",
      "zh": "微观音频缓冲重复、降采样点击声、放克电古钢琴刺音与模块化咆哮贝斯。"
    },
    "rhythm_features": {
      "en": "Funky, swinging 105 BPM groove with heavily syncopated snares and micro-stutter fills.",
      "zh": "极具放克摇摆感的 105 BPM 律动，切分军鼓穿插着毫秒级音频口吃加花。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Glitch Hop signature kick character.",
        "zh": "Glitch Hop 风格代表性底鼓特征。"
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
      "tempo": "100–115 BPM"
    },
    "bass_pattern": {
      "en": "Surgically processed neurofunk-style mid-bass growls punctuated by clean sub-bass drops.",
      "zh": "经过手术刀级精雕细琢的中频咆哮贝斯，与纯净超低音重击穿插交织。"
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
        "Use buffer-repeat or granular stutter plugins on rhythmic fills",
        "Lock your swing around 58% to get that funky hip-hop pocket at 105 BPM",
        "Automate bitcrush depth on drum fills right before drops"
      ],
      "zh": [
        "在加花段落使用音频缓冲重复或粒子卡顿插件",
        "将摇摆度锁定在 58% 左右获取正宗放克弹性",
        "在进入 Drop 前对鼓组加花段落做降采样自动化"
      ]
    },
    "representative_tracks": [
      {
        "title": "Glitch Hop Anthem",
        "artist": "The Glitch Mob",
        "year": 2001,
        "link": "https://www.youtube.com/results?search_query=The+Glitch+Mob+Glitch+Hop"
      },
      {
        "title": "Midnight in Global",
        "artist": "Koan Sound",
        "year": 2003,
        "link": "https://www.youtube.com/results?search_query=Koan+Sound+Glitch+Hop"
      },
      {
        "title": "Echoes of Glitch Hop",
        "artist": "Opiuo",
        "year": 2005,
        "link": "https://www.youtube.com/results?search_query=Opiuo+Glitch+Hop"
      },
      {
        "title": "Pulse & Groove",
        "artist": "GRiZ",
        "year": 2007,
        "link": "https://www.youtube.com/results?search_query=GRiZ+Glitch+Hop"
      },
      {
        "title": "Essential Glitch Hop",
        "artist": "Prefuse 73",
        "year": 2009,
        "link": "https://www.youtube.com/results?search_query=Prefuse+73+Glitch+Hop"
      }
    ],
    "representative_artists": [
      "The Glitch Mob",
      "Koan Sound",
      "Opiuo",
      "GRiZ",
      "Prefuse 73"
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
      "rhythmDensity": 7,
      "bassEnergy": 9,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "glitch-hop",
      "bpm": 105,
      "scale": "E minor",
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
          "instrument": "growl_lead",
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
    "id": "idm",
    "name": "IDM",
    "aliases": [
      "智能舞曲",
      "脑力舞曲"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1992",
    "origin_decade": 1990,
    "origin_place": {
      "en": "UK",
      "zh": "英国"
    },
    "cultural_context": {
      "en": "Pioneered by Warp Records artists, prioritizing complex rhythmic sequencing, generative algorithms, and avant-garde headphone listening over dancefloors.",
      "zh": "由 Warp 唱片旗下先锋艺术家开创，专注于复杂多变的算法音序、前卫听觉探索与耳机内深层冥想。"
    },
    "bpm_range": "110–180 BPM",
    "default_bpm": 130,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–VII–i",
      "I–vi–ii–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Generative Modular Bleeps",
      "Granular Audio Clouds",
      "FM Bells",
      "Warm Pad",
      "Sub Bass",
      "Micro-Sampled Transients"
    ],
    "sound_design": {
      "en": "Generative modular bleeps, granular audio clouds, micro-sampled transients, FM bells.",
      "zh": "生成式模块蜂鸣、粒子合成云、微采样瞬态打击乐与复杂 FM 金属钟声。"
    },
    "rhythm_features": {
      "en": "Intricate, constantly evolving algorithmic beat slicing, polyrhythms, and metric modulation.",
      "zh": "错综复杂且不断蜕变的算法碎拍切片、复合节奏与速度度量调制。"
    },
    "drum_pattern": {
      "kick": {
        "en": "IDM signature kick character.",
        "zh": "IDM 风格代表性底鼓特征。"
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
      "en": "Unpredictable analog sub bursts and rapid pitch-sliding micro basses weaving through chaos.",
      "zh": "难以预测的模拟超低音突发脉冲与快速滑音微型贝斯穿梭于混沌之中。"
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
        "Utilize Max/MSP or modular sequencers to generate semi-random drum triggers",
        "Reverse tiny micro-slices within a standard breakbeat",
        "Contrast harsh digital clicks with warm analog synth melodies"
      ],
      "zh": [
        "利用模块化音序器生成半随机鼓点触发",
        "在标准碎拍中将极短微切片进行反向翻转",
        "用冰冷尖锐的数字咔哒声与温暖如春的模拟旋律制造张力"
      ]
    },
    "representative_tracks": [
      {
        "title": "IDM Anthem",
        "artist": "Aphex Twin",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=Aphex+Twin+IDM"
      },
      {
        "title": "Midnight in UK",
        "artist": "Autechre",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=Autechre+IDM"
      },
      {
        "title": "Echoes of IDM",
        "artist": "Squarepusher",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Squarepusher+IDM"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Boards of Canada",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Boards+of+Canada+IDM"
      },
      {
        "title": "Essential IDM",
        "artist": "Plaid",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=Plaid+IDM"
      }
    ],
    "representative_artists": [
      "Aphex Twin",
      "Autechre",
      "Squarepusher",
      "Boards of Canada",
      "Plaid"
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
      "bassEnergy": 6,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "idm",
      "bpm": 120,
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
            80,
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
            0,
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
            3,
            1,
            1,
            3,
            1,
            1,
            3,
            1,
            1,
            1,
            3,
            3,
            1,
            1
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
            70,
            50,
            80,
            80,
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
          "instrument": "tape_stop",
          "steps": [
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
            0,
            0,
            1,
            0
          ],
          "volume": 0.6,
          "pan": 0
        }
      ]
    }
  },
  {
    "id": "ambient",
    "name": "Ambient",
    "aliases": [
      "氛围音乐",
      "环境音乐"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1975",
    "origin_decade": 1970,
    "origin_place": {
      "en": "UK",
      "zh": "英国"
    },
    "cultural_context": {
      "en": "Conceived by Brian Eno in the mid-1970s as music intended to induce calm and space to think, designed to be as ignorable as it is interesting.",
      "zh": "由 Brian Eno 于 1970 年代中期开创，旨在营造宁静氛围与沉思空间，可被聆听亦可浑然融入环境。"
    },
    "bpm_range": "Free / Beatless",
    "default_bpm": 60,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–IV–I",
      "i–VI–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Infinite Reverb Washes",
      "Bowed Guitar & Strings",
      "Tape Loop Decay",
      "Warm Pad",
      "Subtle Sub Bass Drones"
    ],
    "sound_design": {
      "en": "Infinite reverb washes, tape loop decay, bowed guitars, subtle sub-bass drones.",
      "zh": "无垠混响、磁带循环自然物理衰减、弓弦拉奏吉他与微弱超低频长鸣。"
    },
    "rhythm_features": {
      "en": "Generally beatless or featuring gentle, non-metered rhythmic pulses and nature recordings.",
      "zh": "通常完全无明确鼓点节拍，或仅包含轻柔非定量的脉动与自然环境录音。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Ambient signature kick character.",
        "zh": "Ambient 风格代表性底鼓特征。"
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
      "tempo": "Free / Beatless"
    },
    "bass_pattern": {
      "en": "Slow, evolving sub-bass foundation that supports shifting acoustic chords over minutes.",
      "zh": "极缓舒展的超低频基石，在数分钟的漫长时间跨度内平缓托举和声变迁。"
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
        "Use 100% wet convolution reverbs with impulse responses from cathedrals or caves",
        "Automate volume faders slowly with gentle curves over 2-3 minutes",
        "Introduce subtle pitch drift with analog tape emulation plugins"
      ],
      "zh": [
        "使用大教堂或洞穴脉冲响应的全湿卷积混响",
        "以极平缓的弧线在 2-3 分钟内慢慢推移音轨音量",
        "挂载模拟磁带插件为铺底引入微小的音高漂移"
      ]
    },
    "representative_tracks": [
      {
        "title": "Ambient Anthem",
        "artist": "Brian Eno",
        "year": 1975,
        "link": "https://www.youtube.com/results?search_query=Brian+Eno+Ambient"
      },
      {
        "title": "Midnight in UK",
        "artist": "Harold Budd",
        "year": 1977,
        "link": "https://www.youtube.com/results?search_query=Harold+Budd+Ambient"
      },
      {
        "title": "Echoes of Ambient",
        "artist": "Stars of the Lid",
        "year": 1979,
        "link": "https://www.youtube.com/results?search_query=Stars+of+the+Lid+Ambient"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Tim Hecker",
        "year": 1981,
        "link": "https://www.youtube.com/results?search_query=Tim+Hecker+Ambient"
      },
      {
        "title": "Essential Ambient",
        "artist": "William Basinski",
        "year": 1983,
        "link": "https://www.youtube.com/results?search_query=William+Basinski+Ambient"
      }
    ],
    "representative_artists": [
      "Brian Eno",
      "Harold Budd",
      "Stars of the Lid",
      "Tim Hecker",
      "William Basinski"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 2,
      "brightness": 1,
      "harmonicComplexity": 6,
      "rhythmDensity": 1,
      "bassEnergy": 9,
      "melodicFocus": 2
    },
    "sequencer_pattern": {
      "genre_id": "ambient",
      "bpm": 70,
      "scale": "C major",
      "swing": 0,
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
            0,
            0,
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
          "instrument": "strings_lead",
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
            72,
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
    "id": "ambient-dub",
    "name": "Ambient Dub",
    "aliases": [
      "氛围回响"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1991",
    "origin_decade": 1990,
    "origin_place": {
      "en": "UK & Germany",
      "zh": "英国与德国"
    },
    "cultural_context": {
      "en": "Blends the vast spaciousness of ambient soundscapes with the heavy, pulsing basslines and tape delays of dub reggae.",
      "zh": "将氛围音乐的辽阔空灵与牙买加 Dub 雷鬼沉重脉动的低音线条和磁带回声融为一体。"
    },
    "bpm_range": "70–110 BPM",
    "default_bpm": 80,
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
      "Cavernous Tape Delay Feedbacks",
      "Warm Sine Sub Bass",
      "Floating Synth Pads",
      "Echo Plucks",
      "Spring Reverb Splashes"
    ],
    "sound_design": {
      "en": "Cavernous tape delay feedbacks, warm sine sub-bass, floating synth pads, echo splashes.",
      "zh": "深邃洞穴磁带延迟反馈、温润正弦波超低音、漂浮合成铺底与回声泼溅。"
    },
    "rhythm_features": {
      "en": "Sparse, skeletal slow beats anchored by intermittent rimshots and deep delayed percussions.",
      "zh": "稀疏骨架化的慢速节拍，由间歇性的边击与深沉延迟打击乐锚定。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Ambient Dub signature kick character.",
        "zh": "Ambient Dub 风格代表性底鼓特征。"
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
      "tempo": "70–110 BPM"
    },
    "bass_pattern": {
      "en": "Heavy, resonant low-frequency dub basslines pulsing through the ambient space.",
      "zh": "厚重、带有深邃共鸣的低频 Dub 贝斯线条，穿透氛围空间深沉脉动。"
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
        "Route tape delays through a sweeping low-pass filter with high resonance",
        "Keep the kick drum sub-heavy and muted with low-pass filtering around 300Hz",
        "Let space and silence breathe between dub hits"
      ],
      "zh": [
        "将磁带延迟输出路由至带高共鸣的低通滤波器",
        "底鼓保持深沉并做 300Hz 低通滤波以柔化瞬态",
        "在每次 Dub 重击之间留足让空间与寂静回响的空白"
      ]
    },
    "representative_tracks": [
      {
        "title": "Ambient Dub Anthem",
        "artist": "The Orb",
        "year": 1991,
        "link": "https://www.youtube.com/results?search_query=The+Orb+Ambient+Dub"
      },
      {
        "title": "Midnight in UK & Germany",
        "artist": "Bill Laswell",
        "year": 1993,
        "link": "https://www.youtube.com/results?search_query=Bill+Laswell+Ambient+Dub"
      },
      {
        "title": "Echoes of Ambient Dub",
        "artist": "Linton Kwesi Johnson",
        "year": 1995,
        "link": "https://www.youtube.com/results?search_query=Linton+Kwesi+Johnson+Ambient+Dub"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Pole",
        "year": 1997,
        "link": "https://www.youtube.com/results?search_query=Pole+Ambient+Dub"
      },
      {
        "title": "Essential Ambient Dub",
        "artist": "Automaton",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=Automaton+Ambient+Dub"
      }
    ],
    "representative_artists": [
      "The Orb",
      "Bill Laswell",
      "Linton Kwesi Johnson",
      "Pole",
      "Automaton"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 2,
      "brightness": 4,
      "harmonicComplexity": 4,
      "rhythmDensity": 2,
      "bassEnergy": 9,
      "melodicFocus": 4
    },
    "sequencer_pattern": {
      "genre_id": "ambient-dub",
      "bpm": 95,
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
          "instrument": "warm_pad",
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
          "instrument": "pluck_synth",
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
    "id": "lofi-house",
    "name": "Lo-Fi House",
    "aliases": [
      "低保真浩室"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2015",
    "origin_decade": 2010,
    "origin_place": {
      "en": "Global & UK",
      "zh": "全球与英国"
    },
    "cultural_context": {
      "en": "A gritty, nostalgic mid-2010s movement recording house tracks to cassette tape with murky filters, crunchy drums, and bittersweet soul samples.",
      "zh": "2010 年代中期的复古粗糙潮流，将浩室录入卡式磁带，以浑浊滤波、颗粒感鼓组与苦甜相伴的采样著称。"
    },
    "bpm_range": "120–126 BPM",
    "default_bpm": 124,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–III–VII",
      "ii–V–I"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Cassette Tape Saturation",
      "Muffled Soul Chops",
      "Plucked Synth Chops",
      "Crunchy 909 Drums",
      "Rhodes Chords",
      "Sub Bass"
    ],
    "sound_design": {
      "en": "Cassette tape saturation and wow/flutter, crunchy 909 drums, muffled soul chops.",
      "zh": "卡式磁带饱和与抖晃颤音、粗颗粒 909 鼓组与沉闷怀旧灵魂乐采样。"
    },
    "rhythm_features": {
      "en": "Raw, dusty 4/4 four-on-the-floor kick with crunchy compressed open hats and dusty claps.",
      "zh": "粗砺布满灰尘感的四四拍底鼓，搭配高压缩颗粒感开镲与暗色拍手。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Lo-Fi House signature kick character.",
        "zh": "Lo-Fi House 风格代表性底鼓特征。"
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
      "tempo": "120–126 BPM"
    },
    "bass_pattern": {
      "en": "Simple, saturated analog basslines or warm sine subs humming through tape fuzz.",
      "zh": "质朴饱和的模拟贝斯线条或在磁带底噪中轻柔嗡鸣的温暖正弦低音。"
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
        "Record your entire mix to a real cassette tape deck and re-record it back into your DAW",
        "Use heavy low-pass filtering and bitcrushing on drum samples",
        "Layer nostalgic anime or movie voiceover samples before drops"
      ],
      "zh": [
        "将整首混音实录到真实的卡带机中再录回宿主",
        "对鼓组采样施加较重的低通滤波与降采样处理",
        "在 Drop 爆发前叠入一段怀旧电影或动漫对白采样"
      ]
    },
    "representative_tracks": [
      {
        "title": "Lo-Fi House Anthem",
        "artist": "Mall Grab",
        "year": 2015,
        "link": "https://www.youtube.com/results?search_query=Mall+Grab+Lo-Fi+House"
      },
      {
        "title": "Midnight in Global & UK",
        "artist": "DJ Seinfeld",
        "year": 2017,
        "link": "https://www.youtube.com/results?search_query=DJ+Seinfeld+Lo-Fi+House"
      },
      {
        "title": "Echoes of Lo-Fi House",
        "artist": "Ross From Friends",
        "year": 2019,
        "link": "https://www.youtube.com/results?search_query=Ross+From+Friends+Lo-Fi+House"
      },
      {
        "title": "Pulse & Groove",
        "artist": "DJ Boring",
        "year": 2021,
        "link": "https://www.youtube.com/results?search_query=DJ+Boring+Lo-Fi+House"
      },
      {
        "title": "Essential Lo-Fi House",
        "artist": "Baltic Fleet",
        "year": 2023,
        "link": "https://www.youtube.com/results?search_query=Baltic+Fleet+Lo-Fi+House"
      }
    ],
    "representative_artists": [
      "Mall Grab",
      "DJ Seinfeld",
      "Ross From Friends",
      "DJ Boring",
      "Baltic Fleet"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 3,
      "harmonicComplexity": 4,
      "rhythmDensity": 9,
      "bassEnergy": 9,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "lofi-house",
      "bpm": 122,
      "scale": "A minor",
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
            1,
            1,
            0,
            2,
            1,
            1,
            0,
            1,
            1,
            1,
            0,
            2,
            1
          ],
          "velocity": [
            90,
            0,
            70,
            50,
            90,
            0,
            90,
            50,
            90,
            0,
            70,
            50,
            90,
            0,
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
          "instrument": "rhodes_ep",
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
            69,
            null,
            null,
            null,
            null,
            72,
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
    "id": "chiptune",
    "name": "Chiptune",
    "aliases": [
      "芯片音乐",
      "8-Bit"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1980",
    "origin_decade": 1980,
    "origin_place": {
      "en": "Global & Japan",
      "zh": "全球与日本"
    },
    "cultural_context": {
      "en": "Synthesized electronic music created using vintage programmable sound generator (PSG) sound chips from classic game consoles (NES, Game Boy, Commodore 64).",
      "zh": "使用复古经典主机（NES、Game Boy、C64）的可编程声音发生芯片创作的原生复古电子音乐。"
    },
    "bpm_range": "120–160 BPM",
    "default_bpm": 140,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–IV–V–IV",
      "vi–IV–I–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Pure Square Waves",
      "Triangle-Wave Bass",
      "Warm Pad",
      "White-Noise Percussion",
      "Rapid Arpeggios"
    ],
    "sound_design": {
      "en": "Pure square waves, triangle wave bass, pseudo-random white noise percussions, rapid arpeggios.",
      "zh": "纯方波、三角波低音、伪随机白噪声打击乐与极速分解琶音。"
    },
    "rhythm_features": {
      "en": "Punchy 8-bit rhythms built purely out of noise channel bursts and rapid volume envelopes.",
      "zh": "完全由白噪声通道突发与快速音量包络构筑的清脆 8 位节拍。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Chiptune signature kick character.",
        "zh": "Chiptune 风格代表性底鼓特征。"
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
      "tempo": "120–160 BPM"
    },
    "bass_pattern": {
      "en": "Clean, unadorned triangle-wave basslines playing tight, energetic melodic runs.",
      "zh": "干净无修饰的纯三角波低音线条，演奏紧凑充满活力的旋律跑动。"
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
        "Emulate hardware constraints: restrict yourself to 2 pulse channels, 1 triangle wave, and 1 noise channel",
        "Use ultra-fast 3-note arpeggios on a single pulse channel to fake chords",
        "Avoid all modern reverb and delay plugins"
      ],
      "zh": [
        "严格遵循硬件物理限制：仅使用 2 轨方波、1 轨三角波与 1 轨噪声通道",
        "在单个方波通道上使用极速三连琶音模拟复合和弦",
        "杜绝现代混响与延迟，保留最纯粹干燥的芯片音质"
      ]
    },
    "representative_tracks": [
      {
        "title": "Chiptune Anthem",
        "artist": "Anamanaguchi",
        "year": 1980,
        "link": "https://www.youtube.com/results?search_query=Anamanaguchi+Chiptune"
      },
      {
        "title": "Midnight in Global & Japan",
        "artist": "Disasterpeace",
        "year": 1982,
        "link": "https://www.youtube.com/results?search_query=Disasterpeace+Chiptune"
      },
      {
        "title": "Echoes of Chiptune",
        "artist": "Chipzel",
        "year": 1984,
        "link": "https://www.youtube.com/results?search_query=Chipzel+Chiptune"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Sabrepulse",
        "year": 1986,
        "link": "https://www.youtube.com/results?search_query=Sabrepulse+Chiptune"
      },
      {
        "title": "Essential Chiptune",
        "artist": "Yuzo Koshiro",
        "year": 1988,
        "link": "https://www.youtube.com/results?search_query=Yuzo+Koshiro+Chiptune"
      }
    ],
    "representative_artists": [
      "Anamanaguchi",
      "Disasterpeace",
      "Chipzel",
      "Sabrepulse",
      "Yuzo Koshiro"
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
      "melodicFocus": 7
    },
    "sequencer_pattern": {
      "genre_id": "chiptune",
      "bpm": 140,
      "scale": "C major",
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
          "instrument": "square_lead",
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
            36,
            null,
            36,
            null,
            40,
            null,
            36,
            null,
            43,
            null,
            40,
            null,
            36,
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
            64,
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
            72,
            72,
            null,
            76,
            72,
            null,
            79,
            72,
            null,
            84,
            72,
            null,
            79,
            72,
            null,
            84
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
