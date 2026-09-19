import { Genre } from '../../types/genre';

export const HARD_ELECTRO_GENRES: Genre[] = [
  {
    "id": "hardstyle",
    "name": "Hardstyle",
    "aliases": [
      "硬派舞曲"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1999",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Netherlands & Italy",
      "zh": "荷兰与意大利"
    },
    "cultural_context": {
      "en": "Born in the Netherlands and Italy around 1999, famous for its signature pitched, distorted kick drum tail (the 'reverse bass'), emotional melody builds, and 150 BPM energy.",
      "zh": "1999 年前后诞生于荷兰与意大利，以标志性定调失真底鼓尾部（Reverse Bass）、宏大史诗旋律与 150 BPM 能量著称。"
    },
    "bpm_range": "148–152 BPM",
    "default_bpm": 150,
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
      "Detuned Saw Screech Leads",
      "Epic Supersaw Melodies",
      "Pitched Distorted Kicks",
      "Sub Bass",
      "Euphoric Anthems"
    ],
    "sound_design": {
      "en": "Pitched distorted kick drums, detuned screech leads, epic supersaw melodies, euphoric anthems.",
      "zh": "定调失真大底鼓、高侵略性 Screech 尖叫合成器与恢弘史诗 Supersaw 旋律。"
    },
    "rhythm_features": {
      "en": "Driving 150 BPM four-on-the-floor stomping kick with offbeat reverse bass energy.",
      "zh": "推进式 150 BPM 四踩四重踏底鼓，伴随充满反冲推力的反拍低音。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Hardstyle signature kick character.",
        "zh": "Hardstyle 风格代表性底鼓特征。"
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
      "tempo": "148–152 BPM"
    },
    "bass_pattern": {
      "en": "Pitch-following distorted kick tail that plays the melodic bassline notes directly.",
      "zh": "紧随主和弦音高变换的失真底鼓尾音，直接承担旋律低音线条功能。"
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
        "Layer a punchy transient kick with an overdriven, pitched low-pass tail",
        "Use distortion, EQ, and saturation in 5+ successive stages to sculpt the kick",
        "Stack massive supersaw leads with reverb for the emotional climax"
      ],
      "zh": [
        "将高瞬态敲击头与经过多级过载定调的低通尾部紧密贴合",
        "使用失真、EQ 与饱和器连续串联 5 级以上精心雕琢底鼓音色",
        "为高潮段落堆叠宽广混响的巨幅 Supersaw 音墙"
      ]
    },
    "representative_tracks": [
      {
        "title": "Hardstyle Anthem",
        "artist": "Headhunterz",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=Headhunterz+Hardstyle"
      },
      {
        "title": "Midnight in Netherlands & Italy",
        "artist": "Wildstylez",
        "year": 2001,
        "link": "https://www.youtube.com/results?search_query=Wildstylez+Hardstyle"
      },
      {
        "title": "Echoes of Hardstyle",
        "artist": "Noisecontrollers",
        "year": 2003,
        "link": "https://www.youtube.com/results?search_query=Noisecontrollers+Hardstyle"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Coone",
        "year": 2005,
        "link": "https://www.youtube.com/results?search_query=Coone+Hardstyle"
      },
      {
        "title": "Essential Hardstyle",
        "artist": "Sub Zero Project",
        "year": 2007,
        "link": "https://www.youtube.com/results?search_query=Sub+Zero+Project+Hardstyle"
      }
    ],
    "representative_artists": [
      "Headhunterz",
      "Wildstylez",
      "Noisecontrollers",
      "Coone",
      "Sub Zero Project"
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
      "rhythmDensity": 7,
      "bassEnergy": 6,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "hardstyle",
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
            0
          ],
          "pitch": [
            null,
            41,
            null,
            null,
            null,
            41,
            null,
            null,
            null,
            44,
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
  },
  {
    "id": "hardcore-gabber",
    "name": "Hardcore / Gabber",
    "aliases": [
      "嘎巴硬核",
      "早期硬核"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1992",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Rotterdam, Netherlands",
      "zh": "荷兰鹿特丹"
    },
    "cultural_context": {
      "en": "Born in Rotterdam in 1992 as a furious counter-reaction to commercial house, pushing tempos past 170 BPM with extreme distorted 909 kicks and hoover synths.",
      "zh": "1992 年发源于荷兰鹿特丹，反叛商业浩室，将速度推向 170-200 BPM，以极限失真 909 底鼓与 Hoover 合成器统治地下。"
    },
    "bpm_range": "160–200 BPM",
    "default_bpm": 175,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭VII–♭VI–i",
      "i–♭II–♭VII"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Severely Clipped 909 Kicks",
      "Alpha Juno Hoovers",
      "Sawtooth Synth Lead",
      "Warm Pad",
      "Dark Pitch Risers",
      "Sub Bass"
    ],
    "sound_design": {
      "en": "Severely clipped and overdriven TR-909 kicks, classic Alpha Juno hoovers, dark pitch risers.",
      "zh": "极度削波过载的 TR-909 底鼓、经典 Alpha Juno 狂暴真空管吸尘器音效（Hoover）与暗黑升效。"
    },
    "rhythm_features": {
      "en": "Relentless, furious 175+ BPM 4/4 stomping kick barrage with offbeat distorted noise.",
      "zh": "狂暴不息的 175+ BPM 四踩四践踏式底鼓弹幕，伴随反拍失真噪声。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Hardcore / Gabber signature kick character.",
        "zh": "Hardcore / Gabber 风格代表性底鼓特征。"
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
      "en": "Kick and bass are completely fused into a single pulverizing, distorted low-end hammer.",
      "zh": "底鼓与低音完全熔铸为单一柄粉碎性的失真超低频铁锤。"
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
        "Slam a 909 kick into analog mixer overdrive until the sine wave squares off",
        "Use Alpha Juno 'What the' preset for the authentic classic hoover lead",
        "Keep percussion minimal to leave maximum energy for the kick"
      ],
      "zh": [
        "将 909 底鼓推入调音台过载直至正弦波被削成方波",
        "使用 Alpha Juno 经典音色复现纯正老派 Hoover 尖叫",
        "精简打击乐配器，将极致动态与能量全部留给重击底鼓"
      ]
    },
    "representative_tracks": [
      {
        "title": "Hardcore / Gabber Anthem",
        "artist": "Angerfist",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=Angerfist+Hardcore+/+Gabber"
      },
      {
        "title": "Midnight in Rotterdam",
        "artist": "Paul Elstak",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=Paul+Elstak+Hardcore+/+Gabber"
      },
      {
        "title": "Echoes of Hardcore / Gabber",
        "artist": "Neophyte",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Neophyte+Hardcore+/+Gabber"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Mad Dog",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Mad+Dog+Hardcore+/+Gabber"
      },
      {
        "title": "Essential Hardcore / Gabber",
        "artist": "Evil Activities",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=Evil+Activities+Hardcore+/+Gabber"
      }
    ],
    "representative_artists": [
      "Angerfist",
      "Paul Elstak",
      "Neophyte",
      "Mad Dog",
      "Evil Activities"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 4,
      "brightness": 6,
      "harmonicComplexity": 6,
      "rhythmDensity": 7,
      "bassEnergy": 6,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "hardcore-gabber",
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
          "instrument": "sub_bass",
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
            40,
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
    "id": "frenchcore",
    "name": "Frenchcore",
    "aliases": [
      "法兰西硬核"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1998",
    "origin_decade": 1990,
    "origin_place": {
      "en": "France",
      "zh": "法国"
    },
    "cultural_context": {
      "en": "Emerged from the French free party rave scene, characterized by blistering 200 BPM tempos, dynamic offbeat bass kicks, and euphoric classical/folk melodies.",
      "zh": "脱胎于法国自由派对地下狂欢，以极速 200 BPM 飞驰、弹跳反拍失真底鼓与壮丽交响/民谣旋律著称。"
    },
    "bpm_range": "190–210 BPM",
    "default_bpm": 200,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭VI–♭VII–i",
      "i–♭II–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Orchestral Strings",
      "Choir Chants",
      "Accordion Lead",
      "Supersaw Chords",
      "Sub Bass",
      "Distorted Offbeat Kick"
    ],
    "sound_design": {
      "en": "Bouncy distorted kick with distinctive offbeat tail, orchestral strings, choir chants, accordion.",
      "zh": "带有鲜明反拍弹跳尾音的失真底鼓、管弦乐弦乐、史诗唱诗班合唱与手风琴。"
    },
    "rhythm_features": {
      "en": "Ultra-fast 200 BPM four-on-the-floor kick with an unmistakable bouncy offbeat pump.",
      "zh": "极速 200 BPM 四四拍底鼓，伴随极具辨识度的弹跳反拍抽吸律动。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Frenchcore signature kick character.",
        "zh": "Frenchcore 风格代表性底鼓特征。"
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
      "tempo": "190–210 BPM"
    },
    "bass_pattern": {
      "en": "Fast, driving reverse-bass offbeat that creates a continuous galloping sensation at 200 BPM.",
      "zh": "高速飞奔的反拍反转低音，在 200 BPM 下构筑骏马奔腾般的飞驰推进感。"
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
        "Shape the kick with a short snappy attack and a resonant offbeat bass swell",
        "Incorporate classical piano and orchestral breakdowns before drop assaults",
        "High-pass melodic elements around 250Hz to preserve clarity at 200 BPM"
      ],
      "zh": [
        "将底鼓塑形为短促干脆的敲击头与带共振的反拍涌动尾音",
        "在极速爆发前加入古典钢琴与恢弘管弦乐大分解段落",
        "对旋律元素在 250Hz 做高通滤波保证 200 BPM 下纯净不混浊"
      ]
    },
    "representative_tracks": [
      {
        "title": "Frenchcore Anthem",
        "artist": "Sefa",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Sefa+Frenchcore"
      },
      {
        "title": "Midnight in France",
        "artist": "Dr. Peacock",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=Dr.+Peacock+Frenchcore"
      },
      {
        "title": "Echoes of Frenchcore",
        "artist": "Radium",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=Radium+Frenchcore"
      },
      {
        "title": "Pulse & Groove",
        "artist": "The Sickest Squad",
        "year": 2004,
        "link": "https://www.youtube.com/results?search_query=The+Sickest+Squad+Frenchcore"
      },
      {
        "title": "Essential Frenchcore",
        "artist": "Billx",
        "year": 2006,
        "link": "https://www.youtube.com/results?search_query=Billx+Frenchcore"
      }
    ],
    "representative_artists": [
      "Sefa",
      "Dr. Peacock",
      "Radium",
      "The Sickest Squad",
      "Billx"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 5,
      "brightness": 9,
      "harmonicComplexity": 2,
      "rhythmDensity": 10,
      "bassEnergy": 6,
      "melodicFocus": 6
    },
    "sequencer_pattern": {
      "genre_id": "frenchcore",
      "bpm": 195,
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
          "instrument": "sub_bass",
          "steps": [
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
            0,
            0
          ],
          "pitch": [
            null,
            38,
            null,
            null,
            null,
            38,
            null,
            null,
            null,
            41,
            null,
            null,
            null,
            38,
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
            0,
            0,
            0,
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
    "id": "happy-hardcore",
    "name": "Happy Hardcore",
    "aliases": [
      "快乐硬核"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1994",
    "origin_decade": 1990,
    "origin_place": {
      "en": "UK & Scotland",
      "zh": "英国与苏格兰"
    },
    "cultural_context": {
      "en": "Mid-90s UK rave movement combining 170 BPM breakbeats, upbeat piano stabs, pitched-up chipmunk vocals, and euphoric joyful melodies.",
      "zh": "90 年代中期英国狂欢运动，将 170 BPM 碎拍、欢快钢琴切片、升调花栗鼠人声与极乐旋律融为一体。"
    },
    "bpm_range": "165–180 BPM",
    "default_bpm": 170,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "I–V–vi–IV",
      "i–VI–III–VII"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Bright M1 Piano Stabs",
      "Euphoric Supersaws",
      "Pitch-Shifted Female Vocals",
      "909 Kicks",
      "Sub Bass"
    ],
    "sound_design": {
      "en": "Pitch-shifted female vocals (+5 to +7 semitones), bright M1 piano stabs, euphoric supersaws, 909 kicks.",
      "zh": "大幅升调的人声（+5至+7个半音）、明亮 M1 钢琴和弦切片、欢乐 Supersaw 与 909 底鼓。"
    },
    "rhythm_features": {
      "en": "Fast 4/4 kick layered with rolling syncopated breakbeats running at 170 BPM.",
      "zh": "高速 4/4 底鼓与在 170 BPM 下狂奔的切分碎拍紧密贴合。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Happy Hardcore signature kick character.",
        "zh": "Happy Hardcore 风格代表性底鼓特征。"
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
      "tempo": "165–180 BPM"
    },
    "bass_pattern": {
      "en": "Bouncy offbeat analog pluck or rounded sub-bass bouncing happily beneath piano riffs.",
      "zh": "富有弹性跳跃的反拍模拟弹拨或圆润超低音，在钢琴旋律下方快乐跳动。"
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
        "Pitch upbeat vocal acapellas up 5-6 semitones for the signature chipmunk effect",
        "Layer bright acoustic piano chords with 16th-note syncopations",
        "Keep track energy overwhelmingly positive and joyful in major keys"
      ],
      "zh": [
        "将人声干声向上移调 5-6 个半音获得标志性花栗鼠声线",
        "用明亮真钢琴和弦弹奏切分的十六分音符律动",
        "在大调和声中保持压倒性的纯粹快乐与阳光能量"
      ]
    },
    "representative_tracks": [
      {
        "title": "Happy Hardcore Anthem",
        "artist": "Scott Brown",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=Scott+Brown+Happy+Hardcore"
      },
      {
        "title": "Midnight in UK & Scotland",
        "artist": "DJ Paul Elstak",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=DJ+Paul+Elstak+Happy+Hardcore"
      },
      {
        "title": "Echoes of Happy Hardcore",
        "artist": "Darren Styles",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Darren+Styles+Happy+Hardcore"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Slammin Vinyl",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=Slammin+Vinyl+Happy+Hardcore"
      },
      {
        "title": "Essential Happy Hardcore",
        "artist": "Hixxy",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=Hixxy+Happy+Hardcore"
      }
    ],
    "representative_artists": [
      "Scott Brown",
      "DJ Paul Elstak",
      "Darren Styles",
      "Slammin Vinyl",
      "Hixxy"
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
      "rhythmDensity": 8,
      "bassEnergy": 9,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "happy-hardcore",
      "bpm": 170,
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
            0
          ],
          "pitch": [
            null,
            36,
            null,
            null,
            null,
            36,
            null,
            null,
            null,
            40,
            null,
            null,
            null,
            36,
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
    "id": "moombahton",
    "name": "Moombahton",
    "aliases": [
      "蒙巴顿"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2009",
    "origin_decade": 2000,
    "origin_place": {
      "en": "Washington DC, USA",
      "zh": "美国华盛顿特区"
    },
    "cultural_context": {
      "en": "Invented by Dave Nada in 2009 by slowing down Afrojack's remix of 'Moombah' to 108 BPM, merging Dutch house screeches with the reggaeton dembow beat.",
      "zh": "由 Dave Nada 于 2009 年将 Afrojack 的混音慢放至 108 BPM 时偶然创立，将荷兰浩室的尖叫音色与雷鬼顿 Dembow 律动结合。"
    },
    "bpm_range": "108–112 BPM",
    "default_bpm": 110,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–VI–VII–i",
      "i–iv–VII–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Dutch House Laser Synth Lead",
      "Thick Sub Bass",
      "Synth Brass Stabs",
      "Latin Percussion Fills",
      "Pitched Vocal Shouts"
    ],
    "sound_design": {
      "en": "Dutch house laser synths, pitched vocal shouts, thick sub-bass, Latin percussion fills.",
      "zh": "荷兰浩室高音激光尖叫、调音人声呼喊、厚重超低音与拉丁打击乐加花。"
    },
    "rhythm_features": {
      "en": "The iconic 108 BPM dembow rhythm: 4/4 kick pulse with syncopated snare on beats 2-and and 4-and.",
      "zh": "标志性 108 BPM Dembow 律动：四踩四底鼓脉冲，军鼓落在附点反拍上（咚-哒-咚-哒）。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Moombahton signature kick character.",
        "zh": "Moombahton 风格代表性底鼓特征。"
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
      "tempo": "108–112 BPM"
    },
    "bass_pattern": {
      "en": "Deep, rolling sub-bass that follows the swinging dembow rhythm with tropical warmth.",
      "zh": "深沉滚动的超低音，伴随着摇摆的 Dembow 节奏散发热带温度。"
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
        "Program the dembow snare pattern: dotted 8th note followed by 16th note",
        "Slow down screechy 128 BPM electro synths to 108 BPM for thick swing",
        "Layer timbales and cowbells for Latin flavor"
      ],
      "zh": [
        "编写经典的 Dembow 军鼓律动（附点八分音符紧随十六分音符）",
        "将 128 BPM 尖啸合成音色降速至 108 BPM 增添厚重视听感",
        "加入铜铃与天巴鼓（Timbales）赋予纯正拉丁色彩"
      ]
    },
    "representative_tracks": [
      {
        "title": "Moombahton Anthem",
        "artist": "Dave Nada",
        "year": 2009,
        "link": "https://www.youtube.com/results?search_query=Dave+Nada+Moombahton"
      },
      {
        "title": "Midnight in Washington DC",
        "artist": "Dillon Francis",
        "year": 2011,
        "link": "https://www.youtube.com/results?search_query=Dillon+Francis+Moombahton"
      },
      {
        "title": "Echoes of Moombahton",
        "artist": "Major Lazer",
        "year": 2013,
        "link": "https://www.youtube.com/results?search_query=Major+Lazer+Moombahton"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Munchi",
        "year": 2015,
        "link": "https://www.youtube.com/results?search_query=Munchi+Moombahton"
      },
      {
        "title": "Essential Moombahton",
        "artist": "Diplo",
        "year": 2017,
        "link": "https://www.youtube.com/results?search_query=Diplo+Moombahton"
      }
    ],
    "representative_artists": [
      "Dave Nada",
      "Dillon Francis",
      "Major Lazer",
      "Munchi",
      "Diplo"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 7,
      "brightness": 5,
      "harmonicComplexity": 8,
      "rhythmDensity": 7,
      "bassEnergy": 9,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "moombahton",
      "bpm": 110,
      "scale": "G minor",
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
          "instrument": "brass_synth",
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
    "id": "jersey-club",
    "name": "Jersey Club",
    "aliases": [
      "泽西俱乐部"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2001",
    "origin_decade": 2000,
    "origin_place": {
      "en": "Newark, New Jersey, USA",
      "zh": "美国新泽西纽瓦克"
    },
    "cultural_context": {
      "en": "Emerged from Newark, NJ, evolving from Baltimore club, known for its signature 5-beat kick pattern, squeaky bed spring samples, and rapid vocal chops.",
      "zh": "诞生于新泽西纽瓦克，演化自巴尔的摩俱乐部音乐，以标志性 5 拍弹跳底鼓、吱呀床簧采样与极速人声切片风靡。"
    },
    "bpm_range": "130–140 BPM",
    "default_bpm": 135,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–VI–VII",
      "i–VI–iv–V"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Bed Squeak Samples",
      "Water Drop Clicks",
      "Chopped Vocal Loop Stutters",
      "808 Bass",
      "Plucked Synth Chops",
      "Rhodes Chords"
    ],
    "sound_design": {
      "en": "Bed spring squeak sample, water drop clicks, gunshots, chopped vocal loop stutters.",
      "zh": "床簧吱呀声采样、水滴轻响、开枪射击声与短促卡顿人声切片。"
    },
    "rhythm_features": {
      "en": "The iconic 5-beat kick pattern: boom... boom... boom-boom-boom with rapid triple claps.",
      "zh": "标志性 5 拍弹跳底鼓：咚……咚……咚-咚-咚，伴随极速三连拍手。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Jersey Club signature kick character.",
        "zh": "Jersey Club 风格代表性底鼓特征。"
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
      "tempo": "130–140 BPM"
    },
    "bass_pattern": {
      "en": "Short, bouncy 808 sub hits that punctuate the 5-beat kick pattern with instant releases.",
      "zh": "短促有弹性的 808 超低音重击，紧密配合 5 拍底鼓，带有干脆利落的瞬时释放。"
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
        "Place the bed spring squeak sample on the offbeat after beat 2",
        "Program the 5-beat kick bounce: beat 1, beat 2, and beats 3, 3.5, 4",
        "Chop an R&B vocal hook and trigger it every quarter note"
      ],
      "zh": [
        "在第 2 拍的反拍安放经典床簧吱呀采样",
        "编写 5 拍底鼓弹跳：第 1 拍、第 2 拍以及 3、3.5、4 拍",
        "截取 R&B 人声片段并每隔一拍进行触发形成洗脑循环"
      ]
    },
    "representative_tracks": [
      {
        "title": "Jersey Club Anthem",
        "artist": "DJ Sliink",
        "year": 2001,
        "link": "https://www.youtube.com/results?search_query=DJ+Sliink+Jersey+Club"
      },
      {
        "title": "Midnight in Newark",
        "artist": "DJ Tameil",
        "year": 2003,
        "link": "https://www.youtube.com/results?search_query=DJ+Tameil+Jersey+Club"
      },
      {
        "title": "Echoes of Jersey Club",
        "artist": "Uniiqu3",
        "year": 2005,
        "link": "https://www.youtube.com/results?search_query=Uniiqu3+Jersey+Club"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Trippyturtle",
        "year": 2007,
        "link": "https://www.youtube.com/results?search_query=Trippyturtle+Jersey+Club"
      },
      {
        "title": "Essential Jersey Club",
        "artist": "Nadus",
        "year": 2009,
        "link": "https://www.youtube.com/results?search_query=Nadus+Jersey+Club"
      }
    ],
    "representative_artists": [
      "DJ Sliink",
      "DJ Tameil",
      "Uniiqu3",
      "Trippyturtle",
      "Nadus"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 5,
      "brightness": 7,
      "harmonicComplexity": 6,
      "rhythmDensity": 8,
      "bassEnergy": 9,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "jersey-club",
      "bpm": 132,
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
            36,
            null,
            null,
            null,
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
    "id": "footwork",
    "name": "Footwork",
    "aliases": [
      "步法舞曲",
      "芝加哥步法"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1998",
    "origin_decade": 1990,
    "origin_place": {
      "en": "Chicago, Illinois, USA",
      "zh": "美国芝加哥"
    },
    "cultural_context": {
      "en": "Evolved from Chicago ghetto house and juke for hyper-speed competitive dance battles, featuring 160 BPM syncopated polyrhythmic triplets and micro-chopped soul loops.",
      "zh": "由芝加哥贫民窟浩室与 Juke 演化而来，专为极速斗舞比赛打造，具备 160 BPM 切分三连音复合节奏与微切片灵魂乐采样。"
    },
    "bpm_range": "155–165 BPM",
    "default_bpm": 160,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–iv–i–VII",
      "i–VI–VII"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Rapid-Fire 808 Toms",
      "Sliced Soul Vocal Chops",
      "Sub-Bass Pitch Dives",
      "Plucked Synth Stabs",
      "Warm Pad"
    ],
    "sound_design": {
      "en": "Rapid-fire 808 toms, sliced soul vocals repeated frantically, sub-bass pitch dives.",
      "zh": "速射 808 通鼓、疯狂重复切碎的灵魂乐人声与快速音高下坠的超低音。"
    },
    "rhythm_features": {
      "en": "Frenetic 160 BPM syncopation switching between half-time 80 BPM feel and polyrhythmic triplets.",
      "zh": "狂热飞奔的 160 BPM 切分节奏，在 80 BPM 半速与多节奏三连音之间瞬息万变。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Footwork signature kick character.",
        "zh": "Footwork 风格代表性底鼓特征。"
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
      "en": "Gliding 808 sub drops and rapid walking tom-bass patterns shifting constantly.",
      "zh": "滑音 808 下沉音与极速行进的通鼓贝斯模式不断交织演变。"
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
        "Chop a 1-second soul vocal loop into 16 slices and trigger across complex triplet grids",
        "Use rapid-fire Roland 808 low toms as melodic bass elements",
        "Keep the energy raw, unpolished, and spontaneous"
      ],
      "zh": [
        "将 1 秒灵魂乐采样切碎为 16 片并排布在复杂三连音网格上",
        "将速射 Roland 808 低通鼓作为旋律低音乐器使用",
        "保持声音质感质朴粗砺与不可预测的即兴冲动"
      ]
    },
    "representative_tracks": [
      {
        "title": "Footwork Anthem",
        "artist": "DJ Rashad",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=DJ+Rashad+Footwork"
      },
      {
        "title": "Midnight in Chicago",
        "artist": "DJ Spinn",
        "year": 2000,
        "link": "https://www.youtube.com/results?search_query=DJ+Spinn+Footwork"
      },
      {
        "title": "Echoes of Footwork",
        "artist": "RP Boo",
        "year": 2002,
        "link": "https://www.youtube.com/results?search_query=RP+Boo+Footwork"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Jlin",
        "year": 2004,
        "link": "https://www.youtube.com/results?search_query=Jlin+Footwork"
      },
      {
        "title": "Essential Footwork",
        "artist": "DJ Taye",
        "year": 2006,
        "link": "https://www.youtube.com/results?search_query=DJ+Taye+Footwork"
      }
    ],
    "representative_artists": [
      "DJ Rashad",
      "DJ Spinn",
      "RP Boo",
      "Jlin",
      "DJ Taye"
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
      "rhythmDensity": 7,
      "bassEnergy": 9,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "footwork",
      "bpm": 160,
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
            120,
            0,
            0,
            80,
            0,
            80,
            0,
            0,
            120,
            0,
            0,
            80,
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
            0,
            0,
            0,
            1
          ],
          "velocity": [
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
            41,
            null,
            null,
            null,
            null,
            null,
            44,
            null,
            41,
            null,
            null,
            null,
            null,
            null,
            46,
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
            77,
            null,
            null,
            80,
            null,
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
    "id": "phonk",
    "name": "Phonk",
    "aliases": [
      "放克说唱",
      "孟菲斯放克"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2012",
    "origin_decade": 2010,
    "origin_place": {
      "en": "Memphis, USA & Online",
      "zh": "美国孟菲斯与互联网"
    },
    "cultural_context": {
      "en": "Emerged online inspired by 1990s Memphis rap cassette tapes, defined by chopped Memphis rap vocal loops, jazz Rhodes chords, and Roland TR-808 cowbells.",
      "zh": "发端于网络，致敬 90 年代孟菲斯地下磁带说唱，以孟菲斯人声切片、爵士 Rhodes 和弦与 TR-808 标志性牛铃为特征。"
    },
    "bpm_range": "130–145 BPM",
    "default_bpm": 135,
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
      "Roland TR-808 Cowbell Lead",
      "Dusty Vinyl Rhodes",
      "Cassette Hiss",
      "Chopped Memphis Acapellas",
      "808 Bass"
    ],
    "sound_design": {
      "en": "Roland TR-808 cowbell leads, dusty vinyl Rhodes, chopped Memphis acapellas, cassette hiss.",
      "zh": "Roland TR-808 牛铃主音旋律、蒙尘黑胶 Rhodes 电钢、孟菲斯人声干声与磁带底噪。"
    },
    "rhythm_features": {
      "en": "Heavy 135 BPM half-time bounce with rolling hi-hats and deep booming 808 kicks.",
      "zh": "沉重有力的 135 BPM 半速弹跳，伴随细密踩镲滚奏与轰鸣 808 底鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Phonk signature kick character.",
        "zh": "Phonk 风格代表性底鼓特征。"
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
      "en": "Heavy, warm 808 sub kicks with long decay that fill the low end with analog tape fuzz.",
      "zh": "厚重深沉的纯正 808 超低音，带有超长衰减，充盈着模拟磁带的温暖毛刺。"
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
        "Program melodies using the classic Roland TR-808 cowbell pitched across minor scales",
        "Apply vintage cassette tape saturation and low-pass filtering to sample chops",
        "Layer chopped vocal chants from 90s Memphis rap tapes"
      ],
      "zh": [
        "将经典 Roland TR-808 牛铃采样在小调音阶上编排洗脑旋律",
        "在采样切片上挂载复古磁带饱和与温和低通滤波",
        "叠入 90 年代孟菲斯地下说唱磁带的人声呐喊口号"
      ]
    },
    "representative_tracks": [
      {
        "title": "Phonk Anthem",
        "artist": "SpaceGhostPurrp",
        "year": 2012,
        "link": "https://www.youtube.com/results?search_query=SpaceGhostPurrp+Phonk"
      },
      {
        "title": "Midnight in Memphis",
        "artist": "DJ Smokey",
        "year": 2014,
        "link": "https://www.youtube.com/results?search_query=DJ+Smokey+Phonk"
      },
      {
        "title": "Echoes of Phonk",
        "artist": "Soudiere",
        "year": 2016,
        "link": "https://www.youtube.com/results?search_query=Soudiere+Phonk"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Mythic",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=Mythic+Phonk"
      },
      {
        "title": "Essential Phonk",
        "artist": "Roland Jones",
        "year": 2020,
        "link": "https://www.youtube.com/results?search_query=Roland+Jones+Phonk"
      }
    ],
    "representative_artists": [
      "SpaceGhostPurrp",
      "DJ Smokey",
      "Soudiere",
      "Mythic",
      "Roland Jones"
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
      "rhythmDensity": 6,
      "bassEnergy": 9,
      "melodicFocus": 9
    },
    "sequencer_pattern": {
      "genre_id": "phonk",
      "bpm": 125,
      "scale": "F minor",
      "swing": 10,
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
          "instrument": "cowbell_lead",
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
            77,
            null,
            null,
            80,
            null,
            null,
            77,
            null,
            null,
            82,
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
    "id": "drift-phonk",
    "name": "Drift Phonk",
    "aliases": [
      "漂移放克"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "2018",
    "origin_decade": 2010,
    "origin_place": {
      "en": "Russia & Global",
      "zh": "俄罗斯与全球"
    },
    "cultural_context": {
      "en": "High-octane evolution of phonk popularized via car drifting videos, featuring heavily distorted 808 cowbell melodies and brutal bass saturation.",
      "zh": "由汽车漂移短视频引爆全球的高能放克演进，以极度失真过载的 808 牛铃旋律与暴烈低频饱和震撼舞池。"
    },
    "bpm_range": "150–165 BPM",
    "default_bpm": 160,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭VI–♭VII–i",
      "i–iv–i–VII"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Blown-Out 808 Cowbell Lead",
      "Heavily Clipped Sub Bass",
      "Distorted Kick Bass",
      "Aggressive Vocal Shouts",
      "Warm Pad"
    ],
    "sound_design": {
      "en": "Blown-out overdriven 808 cowbells, heavily clipped sub bass, aggressive industrial vocal shouts.",
      "zh": "炸裂过载的 808 牛铃、硬剪切削波超低频与侵略性工业人声嘶吼。"
    },
    "rhythm_features": {
      "en": "Driving 160 BPM beats with crushing distorted snares, fast triplet hi-hats, and raw bounce.",
      "zh": "飞驰的 160 BPM 推进节拍，伴随粉碎性失真军鼓与极速三连音踩镲。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Drift Phonk signature kick character.",
        "zh": "Drift Phonk 风格代表性底鼓特征。"
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
      "en": "Massive distorted 808 basslines driven past 0dB to create square-wave low-end roar.",
      "zh": "推过 0dB 极限失真的庞大 808 低音线条，营造方波撕裂般的超低频咆哮。"
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
        "Drive the 808 cowbell melody through severe wave-shaping distortion",
        "Clip the master output with soft/hard clipping for relentless perceived volume",
        "Keep tempo fast around 160 BPM for high adrenaline"
      ],
      "zh": [
        "让 808 牛铃旋律通过激进的波形塑形失真单块",
        "在母带输出端使用软/硬剪切压榨出极致听觉响度",
        "将速度保持在 160 BPM 左右点燃肾上腺素"
      ]
    },
    "representative_tracks": [
      {
        "title": "Drift Phonk Anthem",
        "artist": "Kordhell",
        "year": 2018,
        "link": "https://www.youtube.com/results?search_query=Kordhell+Drift+Phonk"
      },
      {
        "title": "Midnight in Russia & Global",
        "artist": "DVRST",
        "year": 2020,
        "link": "https://www.youtube.com/results?search_query=DVRST+Drift+Phonk"
      },
      {
        "title": "Echoes of Drift Phonk",
        "artist": "PlayaPhonk",
        "year": 2022,
        "link": "https://www.youtube.com/results?search_query=PlayaPhonk+Drift+Phonk"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Pharmacist",
        "year": 2024,
        "link": "https://www.youtube.com/results?search_query=Pharmacist+Drift+Phonk"
      },
      {
        "title": "Essential Drift Phonk",
        "artist": "Hensonn",
        "year": 2026,
        "link": "https://www.youtube.com/results?search_query=Hensonn+Drift+Phonk"
      }
    ],
    "representative_artists": [
      "Kordhell",
      "DVRST",
      "PlayaPhonk",
      "Pharmacist",
      "Hensonn"
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
      "rhythmDensity": 10,
      "bassEnergy": 9,
      "melodicFocus": 9
    },
    "sequencer_pattern": {
      "genre_id": "drift-phonk",
      "bpm": 150,
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
            0,
            0,
            0,
            0,
            0,
            0,
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
          "instrument": "cowbell_lead",
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
            76,
            null,
            79,
            null,
            76,
            null,
            82,
            null,
            76,
            null,
            79,
            null,
            76,
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
    "id": "electro",
    "name": "Electro",
    "aliases": [
      "电子放克",
      "Classic Electro"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1982",
    "origin_decade": 1980,
    "origin_place": {
      "en": "New York & Detroit, USA",
      "zh": "美国纽约与底特律"
    },
    "cultural_context": {
      "en": "Pioneered in 1982 by Afrika Bambaataa ('Planet Rock') and Cybotron, merging Kraftwerk's electronic minimalism with funk rhythms and the Roland TR-808.",
      "zh": "由 Afrika Bambaataa 与 Cybotron 于 1982 年开创，将 Kraftwerk 的极简电子律动与放克节拍和 Roland TR-808 完美结合。"
    },
    "bpm_range": "120–135 BPM",
    "default_bpm": 128,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭VII–i–VI",
      "i–iv–i"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Robotic Vocoder Vocals",
      "TR-808 Syncopated Breaks",
      "Laser Zaps",
      "Analog Saw Synths",
      "Warm Pad",
      "Sub Bass"
    ],
    "sound_design": {
      "en": "Robotic vocoder vocals, Roland TR-808 syncopated drum breaks, laser zaps, analog saw synths.",
      "zh": "机器人声码器人声、Roland TR-808 切分鼓点、激光音效与模拟锯齿波合成器。"
    },
    "rhythm_features": {
      "en": "Syncopated, mechanical breakbeats powered by TR-808 kick patterns and crisp handclaps on 2 and 4.",
      "zh": "切分机械的碎拍，由 TR-808 底鼓与在 2、4 拍击打的清脆拍手驱动。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Electro signature kick character.",
        "zh": "Electro 风格代表性底鼓特征。"
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
      "tempo": "120–135 BPM"
    },
    "bass_pattern": {
      "en": "Bouncy, syncopated analog synth basslines playing futuristic funk riffs.",
      "zh": "富有弹跳感的切分模拟合成贝斯线条，演奏未来主义放克 Riff。"
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
        "Use genuine TR-808 drum samples with accent nuances on the hi-hats and snares",
        "Run lead vocals through a hardware vocoder fed by a sawtooth carrier synth",
        "Keep drum sounds completely dry for authentic early-80s punch"
      ],
      "zh": [
        "使用纯正 TR-808 鼓组采样并保留踩镲与军鼓的重音力度差异",
        "将人声送入以锯齿波为载波的硬件声码器中",
        "保持鼓组音色干燥无混响还原 80 年代初扎实质感"
      ]
    },
    "representative_tracks": [
      {
        "title": "Electro Anthem",
        "artist": "Afrika Bambaataa",
        "year": 1982,
        "link": "https://www.youtube.com/results?search_query=Afrika+Bambaataa+Electro"
      },
      {
        "title": "Midnight in New York & Detroit",
        "artist": "Cybotron",
        "year": 1984,
        "link": "https://www.youtube.com/results?search_query=Cybotron+Electro"
      },
      {
        "title": "Echoes of Electro",
        "artist": "Egyptian Lover",
        "year": 1986,
        "link": "https://www.youtube.com/results?search_query=Egyptian+Lover+Electro"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Kraftwerk",
        "year": 1988,
        "link": "https://www.youtube.com/results?search_query=Kraftwerk+Electro"
      },
      {
        "title": "Essential Electro",
        "artist": "Aux 88",
        "year": 1990,
        "link": "https://www.youtube.com/results?search_query=Aux+88+Electro"
      }
    ],
    "representative_artists": [
      "Afrika Bambaataa",
      "Cybotron",
      "Egyptian Lover",
      "Kraftwerk",
      "Aux 88"
    ],
    "sources": [
      "Sound on Sound",
      "Ishkur's Guide to Electronic Music",
      "AllMusic Guide"
    ],
    "radar_metrics": {
      "groove": 6,
      "brightness": 7,
      "harmonicComplexity": 6,
      "rhythmDensity": 7,
      "bassEnergy": 9,
      "melodicFocus": 8
    },
    "sequencer_pattern": {
      "genre_id": "electro",
      "bpm": 128,
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
            38,
            null,
            null,
            null,
            null,
            null,
            41,
            null,
            null,
            38,
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
            0,
            0,
            0,
            0,
            0,
            0,
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
    "id": "breakbeat",
    "name": "Breakbeat",
    "aliases": [
      "碎拍乐"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1990",
    "origin_decade": 1990,
    "origin_place": {
      "en": "UK & USA",
      "zh": "英国与美国"
    },
    "cultural_context": {
      "en": "Evolved from funk drum breaks into an energetic 4/4 non-four-on-the-floor dance music style featuring rolling basslines and dancefloor party grooves.",
      "zh": "脱胎于放克鼓循环，发展为充满能量的非直板四踩四电子舞曲，以连绵滚动的贝斯与派对律动著称。"
    },
    "bpm_range": "125–135 BPM",
    "default_bpm": 130,
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
      "Punchy Syncopated Drum Chops",
      "Acid Squeals",
      "Heavy Sub Bass",
      "Vinyl Scratches",
      "Warm Pad"
    ],
    "sound_design": {
      "en": "Punchy syncopated acoustic drum chops, heavy sub-bass, acid squeals, vinyl scratches.",
      "zh": "清脆切分的原声鼓切片、厚重超低音、酸性啸叫与黑胶搓碟声。"
    },
    "rhythm_features": {
      "en": "Driving syncopated drum break with kick on 1, snare on 2 and 4, and offbeat secondary kicks.",
      "zh": "充满推进力的切分鼓循环，第 1 拍底鼓，2、4 拍军鼓，并穿插反拍跳跃底鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Breakbeat signature kick character.",
        "zh": "Breakbeat 风格代表性底鼓特征。"
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
      "tempo": "125–135 BPM"
    },
    "bass_pattern": {
      "en": "Heavy rolling Reese or acid basslines locking tightly into the syncopated drum breaks.",
      "zh": "厚重滚动的 Reese 或酸性低音线条，与切分碎拍紧密贴合。"
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
        "Layer processed acoustic drum breaks with modern punchy synthesized kicks and snares",
        "Add shuffle swing around 55% to the hi-hats",
        "Use dynamic sidechain on the bass to duck whenever the broken kick hits"
      ],
      "zh": [
        "将处理过的原声碎拍与现代高冲击力合成底鼓和军鼓叠层",
        "为踩镲注入 55% 左右的摇摆度",
        "在每个切分底鼓敲击瞬间对贝斯做动态侧链闪避"
      ]
    },
    "representative_tracks": [
      {
        "title": "Breakbeat Anthem",
        "artist": "The Crystal Method",
        "year": 1990,
        "link": "https://www.youtube.com/results?search_query=The+Crystal+Method+Breakbeat"
      },
      {
        "title": "Midnight in UK & USA",
        "artist": "Freestylers",
        "year": 1992,
        "link": "https://www.youtube.com/results?search_query=Freestylers+Breakbeat"
      },
      {
        "title": "Echoes of Breakbeat",
        "artist": "Plump DJs",
        "year": 1994,
        "link": "https://www.youtube.com/results?search_query=Plump+DJs+Breakbeat"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Stanton Warriors",
        "year": 1996,
        "link": "https://www.youtube.com/results?search_query=Stanton+Warriors+Breakbeat"
      },
      {
        "title": "Essential Breakbeat",
        "artist": "Krafty Kuts",
        "year": 1998,
        "link": "https://www.youtube.com/results?search_query=Krafty+Kuts+Breakbeat"
      }
    ],
    "representative_artists": [
      "The Crystal Method",
      "Freestylers",
      "Plump DJs",
      "Stanton Warriors",
      "Krafty Kuts"
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
      "rhythmDensity": 8,
      "bassEnergy": 7,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "breakbeat",
      "bpm": 134,
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
          "instrument": "acid_303",
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
    "id": "big-beat",
    "name": "Big Beat",
    "aliases": [
      "大碎拍"
    ],
    "category": "Electronic",
    "parent_genres": [],
    "subgenres": [],
    "related_genres": [],
    "origin_year": "1995",
    "origin_decade": 1990,
    "origin_place": {
      "en": "London & Brighton, UK",
      "zh": "英国伦敦与布莱顿"
    },
    "cultural_context": {
      "en": "Pioneered in mid-90s UK by Fatboy Slim and The Chemical Brothers, marrying heavy, distorted rock-like drum breaks with aggressive guitar riffs and acid synths.",
      "zh": "90 年代中叶由 Fatboy Slim 与 The Chemical Brothers 等开创，将粗重失真如摇滚般的鼓循环与狂暴吉他 Riff 和酸性合成器联姻。"
    },
    "bpm_range": "120–135 BPM",
    "default_bpm": 128,
    "time_signature": "4/4",
    "key_characteristics": {
      "en": "Frequently uses minor scales, blues inflections, and minor progressions.",
      "zh": "常使用自然小调、五声音阶及特征明显的和声走向。"
    },
    "common_chords": [
      "i–♭VII–IV–i",
      "I–♭VII–IV–I"
    ],
    "chord_inversions": {
      "en": "Root-position fundamentals on downbeats with open inversions on syncopated layers.",
      "zh": "正拍使用根音排列夯实低频，切分音色使用开阔转位扩展立体声感。"
    },
    "instrumentation": [
      "Heavy Distorted Drum Breaks",
      "Fuzz Guitars",
      "TB-303 Acid Sweeps",
      "Brass Samples",
      "Reese Bass",
      "Warm Pad"
    ],
    "sound_design": {
      "en": "Heavy distorted acoustic drum breaks, fuzz guitars, TB-303 acid sweeps, brass samples.",
      "zh": "重度失真原声鼓循环、法兹过载吉他、TB-303 酸性扫频与铜管采样。"
    },
    "rhythm_features": {
      "en": "Mid-tempo, massively compressed drum loops with thunderous snare clacks and syncopated kicks.",
      "zh": "中速大动态压缩的狂暴鼓循环，带有雷霆万钧的军鼓与切分底鼓。"
    },
    "drum_pattern": {
      "kick": {
        "en": "Big Beat signature kick character.",
        "zh": "Big Beat 风格代表性底鼓特征。"
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
      "tempo": "120–135 BPM"
    },
    "bass_pattern": {
      "en": "Abrasive, buzzing fuzz bass or distorted acid lines driving infectious party energy.",
      "zh": "粗砺蜂鸣的法兹贝斯或失真酸性线条，驱动派对狂欢能量。"
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
        "Compress drum loops heavily using an analog limiter until the room tone pumps audibly",
        "Layer distorted rock guitar power chords over electronic synthesizers",
        "Drop unexpected vocal and horn samples right before main drops"
      ],
      "zh": [
        "使用模拟限制器极度重压鼓循环，使房间混响产生明显抽吸",
        "在电子合成器上方叠加失真摇滚吉他强力和弦",
        "在主爆发前插入出其不意的人声或号角切片"
      ]
    },
    "representative_tracks": [
      {
        "title": "Big Beat Anthem",
        "artist": "The Prodigy",
        "year": 1995,
        "link": "https://www.youtube.com/results?search_query=The+Prodigy+Big+Beat"
      },
      {
        "title": "Midnight in London & Brighton",
        "artist": "The Chemical Brothers",
        "year": 1997,
        "link": "https://www.youtube.com/results?search_query=The+Chemical+Brothers+Big+Beat"
      },
      {
        "title": "Echoes of Big Beat",
        "artist": "Fatboy Slim",
        "year": 1999,
        "link": "https://www.youtube.com/results?search_query=Fatboy+Slim+Big+Beat"
      },
      {
        "title": "Pulse & Groove",
        "artist": "Propellerheads",
        "year": 2001,
        "link": "https://www.youtube.com/results?search_query=Propellerheads+Big+Beat"
      },
      {
        "title": "Essential Big Beat",
        "artist": "Crystal Method",
        "year": 2003,
        "link": "https://www.youtube.com/results?search_query=Crystal+Method+Big+Beat"
      }
    ],
    "representative_artists": [
      "The Prodigy",
      "The Chemical Brothers",
      "Fatboy Slim",
      "Propellerheads",
      "Crystal Method"
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
      "rhythmDensity": 7,
      "bassEnergy": 5,
      "melodicFocus": 5
    },
    "sequencer_pattern": {
      "genre_id": "big-beat",
      "bpm": 130,
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
            70,
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
          "instrument": "reese_bass",
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
  }
];
