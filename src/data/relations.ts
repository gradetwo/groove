import { GenreRelation } from '../types/genre';

export const GENRE_RELATIONS: GenreRelation[] = [
  {
    "source": "disco",
    "target": "chicago-house",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "House evolved from disco edits.",
      "zh": "浩室脱胎于迪斯科黑胶混音。"
    }
  },
  {
    "source": "chicago-house",
    "target": "disco",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "chicago-house links historically back to disco.",
      "zh": "chicago-house 在音乐历史渊源上追溯关联至 disco。"
    }
  },
  {
    "source": "chicago-house",
    "target": "deep-house",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Deep house slowed and deepened Chicago house.",
      "zh": "Deep House 放缓加深了芝加哥浩室。"
    }
  },
  {
    "source": "deep-house",
    "target": "chicago-house",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "deep-house links historically back to chicago-house.",
      "zh": "deep-house 在音乐历史渊源上追溯关联至 chicago-house。"
    }
  },
  {
    "source": "chicago-house",
    "target": "acid-house",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Acid house emerged from 303 experiments.",
      "zh": "Acid House 诞生于 303 合成器实验。"
    }
  },
  {
    "source": "acid-house",
    "target": "chicago-house",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "acid-house links historically back to chicago-house.",
      "zh": "acid-house 在音乐历史渊源上追溯关联至 chicago-house。"
    }
  },
  {
    "source": "chicago-house",
    "target": "tech-house",
    "type": "fusion_with",
    "weight": 4,
    "description": {
      "en": "Tech house merged techno and house.",
      "zh": "Tech House 融合了 Techno 与 House。"
    }
  },
  {
    "source": "tech-house",
    "target": "chicago-house",
    "type": "fusion_with",
    "weight": 4,
    "description": {
      "en": "tech-house links historically back to chicago-house.",
      "zh": "tech-house 在音乐历史渊源上追溯关联至 chicago-house。"
    }
  },
  {
    "source": "chicago-house",
    "target": "french-house",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "French touch sampled disco with house beats.",
      "zh": "法式触感结合了迪斯科采样与浩室节拍。"
    }
  },
  {
    "source": "french-house",
    "target": "chicago-house",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "french-house links historically back to chicago-house.",
      "zh": "french-house 在音乐历史渊源上追溯关联至 chicago-house。"
    }
  },
  {
    "source": "chicago-house",
    "target": "ghetto-house",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Chicago warehouse spawned raw ghetto house.",
      "zh": "芝加哥仓库派对催生了粗砺的 Ghetto House。"
    }
  },
  {
    "source": "ghetto-house",
    "target": "chicago-house",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "ghetto-house links historically back to chicago-house.",
      "zh": "ghetto-house 在音乐历史渊源上追溯关联至 chicago-house。"
    }
  },
  {
    "source": "ghetto-house",
    "target": "footwork",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Footwork evolved from ghetto house and juke.",
      "zh": "Footwork 由 Ghetto House 与 Juke 演进而来。"
    }
  },
  {
    "source": "footwork",
    "target": "ghetto-house",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "footwork links historically back to ghetto-house.",
      "zh": "footwork 在音乐历史渊源上追溯关联至 ghetto-house。"
    }
  },
  {
    "source": "deep-house",
    "target": "amapiano",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "Amapiano fused deep house with jazz and kwaito.",
      "zh": "Amapiano 融合了深邃浩室与爵士和声。"
    }
  },
  {
    "source": "amapiano",
    "target": "deep-house",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "amapiano links historically back to deep-house.",
      "zh": "amapiano 在音乐历史渊源上追溯关联至 deep-house。"
    }
  },
  {
    "source": "deep-house",
    "target": "tropical-house",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Tropical house adapted deep house grooves.",
      "zh": "Tropical House 吸收了 Deep House 的律动。"
    }
  },
  {
    "source": "tropical-house",
    "target": "deep-house",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "tropical-house links historically back to deep-house.",
      "zh": "tropical-house 在音乐历史渊源上追溯关联至 deep-house。"
    }
  },
  {
    "source": "deep-house",
    "target": "melodic-house",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Melodic house enriched deep house with arpeggios.",
      "zh": "Melodic House 为深邃浩室注入电影级琶音。"
    }
  },
  {
    "source": "melodic-house",
    "target": "deep-house",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "melodic-house links historically back to deep-house.",
      "zh": "melodic-house 在音乐历史渊源上追溯关联至 deep-house。"
    }
  },
  {
    "source": "deep-house",
    "target": "microhouse",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Microhouse stripped deep house to subtle micro-textures.",
      "zh": "微型浩室将深邃浩室精简为微观声音颗粒。"
    }
  },
  {
    "source": "microhouse",
    "target": "deep-house",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "microhouse links historically back to deep-house.",
      "zh": "microhouse 在音乐历史渊源上追溯关联至 deep-house。"
    }
  },
  {
    "source": "chicago-house",
    "target": "progressive-house",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Progressive house introduced long build-ups.",
      "zh": "渐进浩室引入了漫长的和声递进。"
    }
  },
  {
    "source": "progressive-house",
    "target": "chicago-house",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "progressive-house links historically back to chicago-house.",
      "zh": "progressive-house 在音乐历史渊源上追溯关联至 chicago-house。"
    }
  },
  {
    "source": "chicago-house",
    "target": "electro-house",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Electro house injected abrasive buzzsaw leads.",
      "zh": "电子浩室注入了极具侵略性的电锯锯齿波。"
    }
  },
  {
    "source": "electro-house",
    "target": "chicago-house",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "electro-house links historically back to chicago-house.",
      "zh": "electro-house 在音乐历史渊源上追溯关联至 chicago-house。"
    }
  },
  {
    "source": "electro-house",
    "target": "bass-house",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Bass house merged electro house with dubstep growls.",
      "zh": "低音浩室融合了电子浩室与 Dubstep 嘶吼。"
    }
  },
  {
    "source": "bass-house",
    "target": "electro-house",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "bass-house links historically back to electro-house.",
      "zh": "bass-house 在音乐历史渊源上追溯关联至 electro-house。"
    }
  },
  {
    "source": "deep-house",
    "target": "afro-house",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "Afro house fused deep house with African polyrhythms.",
      "zh": "非裔浩室融合了深邃浩室与非洲传统打击乐。"
    }
  },
  {
    "source": "afro-house",
    "target": "deep-house",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "afro-house links historically back to deep-house.",
      "zh": "afro-house 在音乐历史渊源上追溯关联至 deep-house。"
    }
  },
  {
    "source": "disco",
    "target": "nu-disco-house",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Nu-disco modernized vintage 70s disco with club punch.",
      "zh": "新迪斯科将 70 年代迪斯科注入现代舞池冲击力。"
    }
  },
  {
    "source": "nu-disco-house",
    "target": "disco",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "nu-disco-house links historically back to disco.",
      "zh": "nu-disco-house 在音乐历史渊源上追溯关联至 disco。"
    }
  },
  {
    "source": "electro",
    "target": "detroit-techno",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "Detroit techno originated from electro and funk.",
      "zh": "底特律 Techno 起源于 Electro 与放克。"
    }
  },
  {
    "source": "detroit-techno",
    "target": "electro",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "detroit-techno links historically back to electro.",
      "zh": "detroit-techno 在音乐历史渊源上追溯关联至 electro。"
    }
  },
  {
    "source": "detroit-techno",
    "target": "minimal-techno",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Minimal techno stripped Detroit techno down.",
      "zh": "极简 Techno 精简了底特律 Techno 骨架。"
    }
  },
  {
    "source": "minimal-techno",
    "target": "detroit-techno",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "minimal-techno links historically back to detroit-techno.",
      "zh": "minimal-techno 在音乐历史渊源上追溯关联至 detroit-techno。"
    }
  },
  {
    "source": "detroit-techno",
    "target": "dub-techno",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "Basic Channel fused techno with Jamaican dub.",
      "zh": "Basic Channel 将 Techno 与牙买加 Dub 融合。"
    }
  },
  {
    "source": "dub-techno",
    "target": "detroit-techno",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "dub-techno links historically back to detroit-techno.",
      "zh": "dub-techno 在音乐历史渊源上追溯关联至 detroit-techno。"
    }
  },
  {
    "source": "detroit-techno",
    "target": "industrial-techno",
    "type": "fusion_with",
    "weight": 4,
    "description": {
      "en": "Industrial techno infused harsh noise.",
      "zh": "工业 Techno 融入了残酷工业噪音。"
    }
  },
  {
    "source": "industrial-techno",
    "target": "detroit-techno",
    "type": "fusion_with",
    "weight": 4,
    "description": {
      "en": "industrial-techno links historically back to detroit-techno.",
      "zh": "industrial-techno 在音乐历史渊源上追溯关联至 detroit-techno。"
    }
  },
  {
    "source": "industrial-techno",
    "target": "hard-techno",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Hard techno accelerated industrial aggression.",
      "zh": "Hard Techno 加速了工业侵略性。"
    }
  },
  {
    "source": "hard-techno",
    "target": "industrial-techno",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "hard-techno links historically back to industrial-techno.",
      "zh": "hard-techno 在音乐历史渊源上追溯关联至 industrial-techno。"
    }
  },
  {
    "source": "hard-techno",
    "target": "schranz",
    "type": "regional_variant",
    "weight": 4,
    "description": {
      "en": "Schranz is Frankfurt's high-speed hard techno.",
      "zh": "Schranz 是德国法兰克福的高速硬核分支。"
    }
  },
  {
    "source": "schranz",
    "target": "hard-techno",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "schranz links historically back to hard-techno.",
      "zh": "schranz 在音乐历史渊源上追溯关联至 hard-techno。"
    }
  },
  {
    "source": "detroit-techno",
    "target": "ambient-techno",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Ambient techno prioritized headphone meditation.",
      "zh": "氛围 Techno 专注于耳机深层冥想。"
    }
  },
  {
    "source": "ambient-techno",
    "target": "detroit-techno",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "ambient-techno links historically back to detroit-techno.",
      "zh": "ambient-techno 在音乐历史渊源上追溯关联至 detroit-techno。"
    }
  },
  {
    "source": "detroit-techno",
    "target": "peak-time-techno",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Peak time techno amplified festival rumbles.",
      "zh": "黄金时段 Techno 放大了音乐节低频轰鸣。"
    }
  },
  {
    "source": "peak-time-techno",
    "target": "detroit-techno",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "peak-time-techno links historically back to detroit-techno.",
      "zh": "peak-time-techno 在音乐历史渊源上追溯关联至 detroit-techno。"
    }
  },
  {
    "source": "minimal-techno",
    "target": "raw-techno",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Raw techno returned to hardware grit.",
      "zh": "原始 Techno 回归模拟硬件纯粹质感。"
    }
  },
  {
    "source": "raw-techno",
    "target": "minimal-techno",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "raw-techno links historically back to minimal-techno.",
      "zh": "raw-techno 在音乐历史渊源上追溯关联至 minimal-techno。"
    }
  },
  {
    "source": "chicago-house",
    "target": "uplifting-trance",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "Trance built on European house and techno.",
      "zh": "Trance 建立在欧洲浩室与 Techno 基础上。"
    }
  },
  {
    "source": "uplifting-trance",
    "target": "chicago-house",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "uplifting-trance links historically back to chicago-house.",
      "zh": "uplifting-trance 在音乐历史渊源上追溯关联至 chicago-house。"
    }
  },
  {
    "source": "uplifting-trance",
    "target": "progressive-trance",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Progressive trance deepened the builds.",
      "zh": "前卫 Trance 深化了氛围铺垫。"
    }
  },
  {
    "source": "progressive-trance",
    "target": "uplifting-trance",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "progressive-trance links historically back to uplifting-trance.",
      "zh": "progressive-trance 在音乐历史渊源上追溯关联至 uplifting-trance。"
    }
  },
  {
    "source": "acid-house",
    "target": "goa-trance",
    "type": "influenced_by",
    "weight": 5,
    "description": {
      "en": "Goa trance adopted 303 acid lines on Goa beaches.",
      "zh": "Goa Trance 在果阿海滩采纳了 303 酸性线条。"
    }
  },
  {
    "source": "goa-trance",
    "target": "acid-house",
    "type": "influenced_by",
    "weight": 5,
    "description": {
      "en": "goa-trance links historically back to acid-house.",
      "zh": "goa-trance 在音乐历史渊源上追溯关联至 acid-house。"
    }
  },
  {
    "source": "goa-trance",
    "target": "psytrance",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Psytrance became global evolution of Goa trance.",
      "zh": "Psytrance 成为果阿 Trance 的全球进化形态。"
    }
  },
  {
    "source": "psytrance",
    "target": "goa-trance",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "psytrance links historically back to goa-trance.",
      "zh": "psytrance 在音乐历史渊源上追溯关联至 goa-trance。"
    }
  },
  {
    "source": "uplifting-trance",
    "target": "hard-trance",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Hard trance added heavy distorted kicks.",
      "zh": "Hard Trance 加入了重型失真底鼓。"
    }
  },
  {
    "source": "hard-trance",
    "target": "uplifting-trance",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "hard-trance links historically back to uplifting-trance.",
      "zh": "hard-trance 在音乐历史渊源上追溯关联至 uplifting-trance。"
    }
  },
  {
    "source": "uplifting-trance",
    "target": "vocal-trance",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Vocal trance centered emotional top-line singing.",
      "zh": "人声 Trance 以深情主旋律声乐为核心。"
    }
  },
  {
    "source": "vocal-trance",
    "target": "uplifting-trance",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "vocal-trance links historically back to uplifting-trance.",
      "zh": "vocal-trance 在音乐历史渊源上追溯关联至 uplifting-trance。"
    }
  },
  {
    "source": "uplifting-trance",
    "target": "euro-trance",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Euro-trance popularized commercial dance-pop hooks.",
      "zh": "欧陆 Trance 普及了商业流行舞曲 Hook。"
    }
  },
  {
    "source": "euro-trance",
    "target": "uplifting-trance",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "euro-trance links historically back to uplifting-trance.",
      "zh": "euro-trance 在音乐历史渊源上追溯关联至 uplifting-trance。"
    }
  },
  {
    "source": "uplifting-trance",
    "target": "dream-trance",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Robert Miles popularized peaceful acoustic piano trance.",
      "zh": "Robert Miles 普及了静谧抒情的原声钢琴出神舞曲。"
    }
  },
  {
    "source": "dream-trance",
    "target": "uplifting-trance",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "dream-trance links historically back to uplifting-trance.",
      "zh": "dream-trance 在音乐历史渊源上追溯关联至 uplifting-trance。"
    }
  },
  {
    "source": "uplifting-trance",
    "target": "tech-trance",
    "type": "fusion_with",
    "weight": 4,
    "description": {
      "en": "Tech trance merged techno percussion with trance energy.",
      "zh": "Tech Trance 融合了 Techno 打击乐与 Trance 能量。"
    }
  },
  {
    "source": "tech-trance",
    "target": "uplifting-trance",
    "type": "fusion_with",
    "weight": 4,
    "description": {
      "en": "tech-trance links historically back to uplifting-trance.",
      "zh": "tech-trance 在音乐历史渊源上追溯关联至 uplifting-trance。"
    }
  },
  {
    "source": "dub",
    "target": "reggae",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "Dub originated from studio manipulations of reggae.",
      "zh": "Dub 起源于雷鬼音乐的调音台解构。"
    }
  },
  {
    "source": "reggae",
    "target": "dub",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "reggae links historically back to dub.",
      "zh": "reggae 在音乐历史渊源上追溯关联至 dub。"
    }
  },
  {
    "source": "dub",
    "target": "dubstep",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "Dubstep inherited dub's space, echo, and sub-bass.",
      "zh": "Dubstep 继承了 Dub 的空间感、回声与超低频。"
    }
  },
  {
    "source": "dubstep",
    "target": "dub",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "dubstep links historically back to dub.",
      "zh": "dubstep 在音乐历史渊源上追溯关联至 dub。"
    }
  },
  {
    "source": "uk-garage",
    "target": "2-step-garage",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "2-Step removed the 4/4 kick for syncopation.",
      "zh": "2-Step 抽去 4/4 稳定踢点以增强切分。"
    }
  },
  {
    "source": "2-step-garage",
    "target": "uk-garage",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "2-step-garage links historically back to uk-garage.",
      "zh": "2-step-garage 在音乐历史渊源上追溯关联至 uk-garage。"
    }
  },
  {
    "source": "2-step-garage",
    "target": "grime",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Grime grew out of dark garage pirate radio.",
      "zh": "Grime 脱胎于黑暗车库音乐电台。"
    }
  },
  {
    "source": "grime",
    "target": "2-step-garage",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "grime links historically back to 2-step-garage.",
      "zh": "grime 在音乐历史渊源上追溯关联至 2-step-garage。"
    }
  },
  {
    "source": "2-step-garage",
    "target": "dubstep",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "Dubstep emerged from instrumental 2-step garage.",
      "zh": "Dubstep 诞生于纯器乐 2-Step 车库音乐。"
    }
  },
  {
    "source": "dubstep",
    "target": "2-step-garage",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "dubstep links historically back to 2-step-garage.",
      "zh": "dubstep 在音乐历史渊源上追溯关联至 2-step-garage。"
    }
  },
  {
    "source": "uk-garage",
    "target": "speed-garage",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Speed garage accelerated garage with heavy drops.",
      "zh": "极速车库加快车库节奏并加入重型下潜。"
    }
  },
  {
    "source": "speed-garage",
    "target": "uk-garage",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "speed-garage links historically back to uk-garage.",
      "zh": "speed-garage 在音乐历史渊源上追溯关联至 uk-garage。"
    }
  },
  {
    "source": "speed-garage",
    "target": "bassline",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Bassline evolved in Sheffield with vocal hooks and donks.",
      "zh": "Bassline 在谢菲尔德演化，加入人声 Hook 与 Donk 低音。"
    }
  },
  {
    "source": "bassline",
    "target": "speed-garage",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "bassline links historically back to speed-garage.",
      "zh": "bassline 在音乐历史渊源上追溯关联至 speed-garage。"
    }
  },
  {
    "source": "uk-garage",
    "target": "uk-funky",
    "type": "fusion_with",
    "weight": 4,
    "description": {
      "en": "UK funky blended UK garage with tribal rhythms.",
      "zh": "UK Funky 将英国车库与部落节奏融合。"
    }
  },
  {
    "source": "uk-funky",
    "target": "uk-garage",
    "type": "fusion_with",
    "weight": 4,
    "description": {
      "en": "uk-funky links historically back to uk-garage.",
      "zh": "uk-funky 在音乐历史渊源上追溯关联至 uk-garage。"
    }
  },
  {
    "source": "bassline",
    "target": "speedbass",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Speedbass accelerated bassline to 160 BPM.",
      "zh": "Speedbass 将 Bassline 加速至 160 BPM。"
    }
  },
  {
    "source": "speedbass",
    "target": "bassline",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "speedbass links historically back to bassline.",
      "zh": "speedbass 在音乐历史渊源上追溯关联至 bassline。"
    }
  },
  {
    "source": "dubstep",
    "target": "brostep",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Brostep pushed mid-range FM growls to festival stages.",
      "zh": "Brostep 将中频 FM 咆哮推向大型舞台。"
    }
  },
  {
    "source": "brostep",
    "target": "dubstep",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "brostep links historically back to dubstep.",
      "zh": "brostep 在音乐历史渊源上追溯关联至 dubstep。"
    }
  },
  {
    "source": "dubstep",
    "target": "riddim",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Riddim isolated minimal, repetitive triplet stabs.",
      "zh": "Riddim 提炼了极简重复的三连音刺音。"
    }
  },
  {
    "source": "riddim",
    "target": "dubstep",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "riddim links historically back to dubstep.",
      "zh": "riddim 在音乐历史渊源上追溯关联至 dubstep。"
    }
  },
  {
    "source": "dubstep",
    "target": "future-garage",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Burial pioneered atmospheric future garage.",
      "zh": "Burial 开创了充满氛围感的未来车库。"
    }
  },
  {
    "source": "future-garage",
    "target": "dubstep",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "future-garage links historically back to dubstep.",
      "zh": "future-garage 在音乐历史渊源上追溯关联至 dubstep。"
    }
  },
  {
    "source": "dubstep",
    "target": "melodic-dubstep",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Melodic dubstep merged dubstep drums with supersaws.",
      "zh": "旋律 Dubstep 融合了 Dubstep 鼓组与 Supersaw 音墙。"
    }
  },
  {
    "source": "melodic-dubstep",
    "target": "dubstep",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "melodic-dubstep links historically back to dubstep.",
      "zh": "melodic-dubstep 在音乐历史渊源上追溯关联至 dubstep。"
    }
  },
  {
    "source": "dubstep",
    "target": "post-dubstep",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Post-dubstep deconstructed bass music for indie songwriting.",
      "zh": "后 Dubstep 为独立创作解构了低音音乐。"
    }
  },
  {
    "source": "post-dubstep",
    "target": "dubstep",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "post-dubstep links historically back to dubstep.",
      "zh": "post-dubstep 在音乐历史渊源上追溯关联至 dubstep。"
    }
  },
  {
    "source": "dubstep",
    "target": "tearout-dubstep",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Tearout pushed machine-gun metallic aggression.",
      "zh": "Tearout 将机关枪金属撕裂感推向极限。"
    }
  },
  {
    "source": "tearout-dubstep",
    "target": "dubstep",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "tearout-dubstep links historically back to dubstep.",
      "zh": "tearout-dubstep 在音乐历史渊源上追溯关联至 dubstep。"
    }
  },
  {
    "source": "dubstep",
    "target": "chillstep",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Chillstep softened 140 BPM beats with ambient pads.",
      "zh": "Chillstep 用氛围铺底柔化了 140 BPM 节拍。"
    }
  },
  {
    "source": "chillstep",
    "target": "dubstep",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "chillstep links historically back to dubstep.",
      "zh": "chillstep 在音乐历史渊源上追溯关联至 dubstep。"
    }
  },
  {
    "source": "dubstep",
    "target": "deathstep",
    "type": "fusion_with",
    "weight": 4,
    "description": {
      "en": "Deathstep fused death metal with aggressive dubstep.",
      "zh": "Deathstep 融合了死亡金属与残暴 Dubstep。"
    }
  },
  {
    "source": "deathstep",
    "target": "dubstep",
    "type": "fusion_with",
    "weight": 4,
    "description": {
      "en": "deathstep links historically back to dubstep.",
      "zh": "deathstep 在音乐历史渊源上追溯关联至 dubstep。"
    }
  },
  {
    "source": "jungle",
    "target": "liquid-dnb",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Liquid DnB smoothed jungle breaks with soul.",
      "zh": "Liquid DnB 用灵魂乐柔化了丛林碎拍。"
    }
  },
  {
    "source": "liquid-dnb",
    "target": "jungle",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "liquid-dnb links historically back to jungle.",
      "zh": "liquid-dnb 在音乐历史渊源上追溯关联至 jungle。"
    }
  },
  {
    "source": "jungle",
    "target": "neurofunk",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Neurofunk introduced complex sci-fi sound design.",
      "zh": "Neurofunk 引入了复杂的科幻声音设计。"
    }
  },
  {
    "source": "neurofunk",
    "target": "jungle",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "neurofunk links historically back to jungle.",
      "zh": "neurofunk 在音乐历史渊源上追溯关联至 jungle。"
    }
  },
  {
    "source": "jungle",
    "target": "jump-up",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Jump up energized DnB with bouncy party screeches.",
      "zh": "Jump Up 用跳跃派对尖叫激活了 DnB。"
    }
  },
  {
    "source": "jump-up",
    "target": "jungle",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "jump-up links historically back to jungle.",
      "zh": "jump-up 在音乐历史渊源上追溯关联至 jungle。"
    }
  },
  {
    "source": "jungle",
    "target": "techstep",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Techstep stripped jungle to cold industrial drums.",
      "zh": "Techstep 将丛林乐精简为冷酷工业鼓点。"
    }
  },
  {
    "source": "techstep",
    "target": "jungle",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "techstep links historically back to jungle.",
      "zh": "techstep 在音乐历史渊源上追溯关联至 jungle。"
    }
  },
  {
    "source": "jungle",
    "target": "breakcore",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Breakcore accelerated drum breaks to chaotic extremes.",
      "zh": "Breakcore 将鼓碎拍加速到混沌极致。"
    }
  },
  {
    "source": "breakcore",
    "target": "jungle",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "breakcore links historically back to jungle.",
      "zh": "breakcore 在音乐历史渊源上追溯关联至 jungle。"
    }
  },
  {
    "source": "jungle",
    "target": "ragga-jungle",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "Ragga jungle fused sliced breaks with Jamaican toasting.",
      "zh": "Ragga 丛林乐融合了切分碎拍与牙买加喊麦。"
    }
  },
  {
    "source": "ragga-jungle",
    "target": "jungle",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "ragga-jungle links historically back to jungle.",
      "zh": "ragga-jungle 在音乐历史渊源上追溯关联至 jungle。"
    }
  },
  {
    "source": "jungle",
    "target": "sambass",
    "type": "fusion_with",
    "weight": 4,
    "description": {
      "en": "Sambass blended DnB breaks with Brazilian samba.",
      "zh": "Sambass 将 DnB 碎拍与巴西桑巴融合。"
    }
  },
  {
    "source": "sambass",
    "target": "jungle",
    "type": "fusion_with",
    "weight": 4,
    "description": {
      "en": "sambass links historically back to jungle.",
      "zh": "sambass 在音乐历史渊源上追溯关联至 jungle。"
    }
  },
  {
    "source": "neurofunk",
    "target": "halftime",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Halftime slowed 174 BPM sound design to hip-hop bounce.",
      "zh": "Halftime 将 174 BPM 音色设计放慢为嘻哈弹跳。"
    }
  },
  {
    "source": "halftime",
    "target": "neurofunk",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "halftime links historically back to neurofunk.",
      "zh": "halftime 在音乐历史渊源上追溯关联至 neurofunk。"
    }
  },
  {
    "source": "southern-hip-hop",
    "target": "trap-rap",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Trap rap emerged from Atlanta southern hip hop.",
      "zh": "Trap 说唱脱胎于亚特兰大南方嘻哈。"
    }
  },
  {
    "source": "trap-rap",
    "target": "southern-hip-hop",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "trap-rap links historically back to southern-hip-hop.",
      "zh": "trap-rap 在音乐历史渊源上追溯关联至 southern-hip-hop。"
    }
  },
  {
    "source": "trap-rap",
    "target": "edm-trap",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "EDM trap combined 808s with festival synths.",
      "zh": "EDM Trap 将 808 与电音节合成器结合。"
    }
  },
  {
    "source": "edm-trap",
    "target": "trap-rap",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "edm-trap links historically back to trap-rap.",
      "zh": "edm-trap 在音乐历史渊源上追溯关联至 trap-rap。"
    }
  },
  {
    "source": "edm-trap",
    "target": "hard-trap",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Hard trap combined distorted kicks with trap bounce.",
      "zh": "Hard Trap 将失真底鼓与 Trap 弹跳结合。"
    }
  },
  {
    "source": "hard-trap",
    "target": "edm-trap",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "hard-trap links historically back to edm-trap.",
      "zh": "hard-trap 在音乐历史渊源上追溯关联至 edm-trap。"
    }
  },
  {
    "source": "edm-trap",
    "target": "hybrid-trap",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Hybrid trap fused EDM trap with dubstep growls.",
      "zh": "混种 Trap 融合了 EDM Trap 与 Dubstep 咆哮。"
    }
  },
  {
    "source": "hybrid-trap",
    "target": "edm-trap",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "hybrid-trap links historically back to edm-trap.",
      "zh": "hybrid-trap 在音乐历史渊源上追溯关联至 edm-trap。"
    }
  },
  {
    "source": "edm-trap",
    "target": "future-bass",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "Future bass borrowed trap half-time beats.",
      "zh": "Future Bass 借鉴了 Trap 的半速节拍。"
    }
  },
  {
    "source": "future-bass",
    "target": "edm-trap",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "future-bass links historically back to edm-trap.",
      "zh": "future-bass 在音乐历史渊源上追溯关联至 edm-trap。"
    }
  },
  {
    "source": "future-bass",
    "target": "kawaii-future-bass",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Kawaii future bass infused anime visuals and chiptune.",
      "zh": "可爱未来贝斯融入了动漫美学与芯片音效。"
    }
  },
  {
    "source": "kawaii-future-bass",
    "target": "future-bass",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "kawaii-future-bass links historically back to future-bass.",
      "zh": "kawaii-future-bass 在音乐历史渊源上追溯关联至 future-bass。"
    }
  },
  {
    "source": "trap-rap",
    "target": "chicago-drill",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Chicago drill hardened trap with street reality.",
      "zh": "芝加哥 Drill 用冷酷现实硬化了 Trap。"
    }
  },
  {
    "source": "chicago-drill",
    "target": "trap-rap",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "chicago-drill links historically back to trap-rap.",
      "zh": "chicago-drill 在音乐历史渊源上追溯关联至 trap-rap。"
    }
  },
  {
    "source": "chicago-drill",
    "target": "uk-drill",
    "type": "regional_variant",
    "weight": 5,
    "description": {
      "en": "UK drill adapted Chicago drill with sliding 808s.",
      "zh": "UK Drill 改造芝加哥钻头，引入滑音 808。"
    }
  },
  {
    "source": "uk-drill",
    "target": "chicago-drill",
    "type": "influenced_by",
    "weight": 5,
    "description": {
      "en": "uk-drill links historically back to chicago-drill.",
      "zh": "uk-drill 在音乐历史渊源上追溯关联至 chicago-drill。"
    }
  },
  {
    "source": "uk-drill",
    "target": "brooklyn-drill",
    "type": "regional_variant",
    "weight": 5,
    "description": {
      "en": "Brooklyn drill brought UK drill sliding 808s to NYC.",
      "zh": "布鲁克林 Drill 将滑音 808 带回纽约。"
    }
  },
  {
    "source": "brooklyn-drill",
    "target": "uk-drill",
    "type": "influenced_by",
    "weight": 5,
    "description": {
      "en": "brooklyn-drill links historically back to uk-drill.",
      "zh": "brooklyn-drill 在音乐历史渊源上追溯关联至 uk-drill。"
    }
  },
  {
    "source": "brooklyn-drill",
    "target": "jersey-drill",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "Jersey drill fused drill 808s with club bounce.",
      "zh": "泽西 Drill 融合了钻头 808 与泽西俱乐部弹跳。"
    }
  },
  {
    "source": "jersey-drill",
    "target": "brooklyn-drill",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "jersey-drill links historically back to brooklyn-drill.",
      "zh": "jersey-drill 在音乐历史渊源上追溯关联至 brooklyn-drill。"
    }
  },
  {
    "source": "jersey-club",
    "target": "jersey-drill",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "Jersey drill adapted Jersey Club's 5-beat kick bounce.",
      "zh": "泽西 Drill 采纳了泽西俱乐部的 5 拍底鼓弹跳。"
    }
  },
  {
    "source": "jersey-drill",
    "target": "jersey-club",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "jersey-drill links historically back to jersey-club.",
      "zh": "jersey-drill 在音乐历史渊源上追溯关联至 jersey-club。"
    }
  },
  {
    "source": "ambient",
    "target": "ambient-dub",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Ambient dub added dub delay and pulsing sub.",
      "zh": "氛围 Dub 加入了 Dub 延迟与脉冲超低音。"
    }
  },
  {
    "source": "ambient-dub",
    "target": "ambient",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "ambient-dub links historically back to ambient.",
      "zh": "ambient-dub 在音乐历史渊源上追溯关联至 ambient。"
    }
  },
  {
    "source": "ambient",
    "target": "downtempo",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Downtempo gave ambient music a relaxed beat.",
      "zh": "缓拍音乐为氛围音乐注入舒缓节拍。"
    }
  },
  {
    "source": "downtempo",
    "target": "ambient",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "downtempo links historically back to ambient.",
      "zh": "downtempo 在音乐历史渊源上追溯关联至 ambient。"
    }
  },
  {
    "source": "downtempo",
    "target": "trip-hop",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Trip hop darkened downtempo with cinematic noir.",
      "zh": "神游舞曲为缓拍注入暗黑电影质感。"
    }
  },
  {
    "source": "trip-hop",
    "target": "downtempo",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "trip-hop links historically back to downtempo.",
      "zh": "trip-hop 在音乐历史渊源上追溯关联至 downtempo。"
    }
  },
  {
    "source": "trip-hop",
    "target": "glitch-hop",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Glitch hop added digital micro-edits to hip-hop.",
      "zh": "故障嘻哈为嘻哈节拍增添数字微切片。"
    }
  },
  {
    "source": "glitch-hop",
    "target": "trip-hop",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "glitch-hop links historically back to trip-hop.",
      "zh": "glitch-hop 在音乐历史渊源上追溯关联至 trip-hop。"
    }
  },
  {
    "source": "ambient",
    "target": "idm",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "IDM expanded ambient textures with complex algorithms.",
      "zh": "IDM 结合复杂算法拓展了氛围纹理。"
    }
  },
  {
    "source": "idm",
    "target": "ambient",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "idm links historically back to ambient.",
      "zh": "idm 在音乐历史渊源上追溯关联至 ambient。"
    }
  },
  {
    "source": "synth-pop",
    "target": "synthwave",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Synthwave revived 80s synth-pop and movie nostalgia.",
      "zh": "合成器波复兴了 80 年代合成流行与电影怀旧。"
    }
  },
  {
    "source": "synthwave",
    "target": "synth-pop",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "synthwave links historically back to synth-pop.",
      "zh": "synthwave 在音乐历史渊源上追溯关联至 synth-pop。"
    }
  },
  {
    "source": "synth-pop",
    "target": "vaporwave",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "Vaporwave slowed down 80s commercial pop.",
      "zh": "蒸汽波慢放解构了 80 年代商业流行。"
    }
  },
  {
    "source": "vaporwave",
    "target": "synth-pop",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "vaporwave links historically back to synth-pop.",
      "zh": "vaporwave 在音乐历史渊源上追溯关联至 synth-pop。"
    }
  },
  {
    "source": "synth-pop",
    "target": "chillwave",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Chillwave introduced dreamy tape-warmed indie pop.",
      "zh": "冷波开创了梦幻磁带质感的独立流行。"
    }
  },
  {
    "source": "chillwave",
    "target": "synth-pop",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "chillwave links historically back to synth-pop.",
      "zh": "chillwave 在音乐历史渊源上追溯关联至 synth-pop。"
    }
  },
  {
    "source": "chicago-house",
    "target": "lofi-house",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Lo-Fi house recorded house onto cassette tapes.",
      "zh": "低保真浩室将浩室音乐实录于卡式磁带。"
    }
  },
  {
    "source": "lofi-house",
    "target": "chicago-house",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "lofi-house links historically back to chicago-house.",
      "zh": "lofi-house 在音乐历史渊源上追溯关联至 chicago-house。"
    }
  },
  {
    "source": "electro",
    "target": "chiptune",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "Chiptune celebrated pure PSG sound chip music.",
      "zh": "芯片音乐颂唱纯粹 PSG 声音芯片的魅力。"
    }
  },
  {
    "source": "chiptune",
    "target": "electro",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "chiptune links historically back to electro.",
      "zh": "chiptune 在音乐历史渊源上追溯关联至 electro。"
    }
  },
  {
    "source": "hard-techno",
    "target": "hardcore-gabber",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Gabber accelerated hard techno to 180 BPM.",
      "zh": "嘎巴硬核将硬核 Techno 加速至 180 BPM。"
    }
  },
  {
    "source": "hardcore-gabber",
    "target": "hard-techno",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "hardcore-gabber links historically back to hard-techno.",
      "zh": "hardcore-gabber 在音乐历史渊源上追溯关联至 hard-techno。"
    }
  },
  {
    "source": "hardcore-gabber",
    "target": "frenchcore",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Frenchcore accelerated kicks to 200 BPM with bounce.",
      "zh": "法兰西硬核将底鼓加速至 200 BPM 并加入反拍弹跳。"
    }
  },
  {
    "source": "frenchcore",
    "target": "hardcore-gabber",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "frenchcore links historically back to hardcore-gabber.",
      "zh": "frenchcore 在音乐历史渊源上追溯关联至 hardcore-gabber。"
    }
  },
  {
    "source": "hardcore-gabber",
    "target": "happy-hardcore",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Happy hardcore added piano riffs and joyful vocals.",
      "zh": "快乐硬核加入了明亮钢琴与欢快人声。"
    }
  },
  {
    "source": "happy-hardcore",
    "target": "hardcore-gabber",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "happy-hardcore links historically back to hardcore-gabber.",
      "zh": "happy-hardcore 在音乐历史渊源上追溯关联至 hardcore-gabber。"
    }
  },
  {
    "source": "hard-techno",
    "target": "hardstyle",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Hardstyle sculpted the signature pitched reverse bass.",
      "zh": "Hardstyle 塑造了标志性的定调反转贝斯。"
    }
  },
  {
    "source": "hardstyle",
    "target": "hard-techno",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "hardstyle links historically back to hard-techno.",
      "zh": "hardstyle 在音乐历史渊源上追溯关联至 hard-techno。"
    }
  },
  {
    "source": "reggaeton",
    "target": "moombahton",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "Moombahton fused Dutch house with reggaeton dembow.",
      "zh": "蒙巴顿融合了荷兰浩室与雷鬼顿 Dembow 节拍。"
    }
  },
  {
    "source": "moombahton",
    "target": "reggaeton",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "moombahton links historically back to reggaeton.",
      "zh": "moombahton 在音乐历史渊源上追溯关联至 reggaeton。"
    }
  },
  {
    "source": "ghetto-house",
    "target": "jersey-club",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "Jersey club evolved bouncy Baltimore & ghetto beats.",
      "zh": "泽西俱乐部演化自充满弹性的街区律动。"
    }
  },
  {
    "source": "jersey-club",
    "target": "ghetto-house",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "jersey-club links historically back to ghetto-house.",
      "zh": "jersey-club 在音乐历史渊源上追溯关联至 ghetto-house。"
    }
  },
  {
    "source": "southern-hip-hop",
    "target": "phonk",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Phonk revived 90s Memphis cassette rap with 808 cowbells.",
      "zh": "Phonk 用 808 牛铃复兴了 90 年代孟菲斯磁带说唱。"
    }
  },
  {
    "source": "phonk",
    "target": "southern-hip-hop",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "phonk links historically back to southern-hip-hop.",
      "zh": "phonk 在音乐历史渊源上追溯关联至 southern-hip-hop。"
    }
  },
  {
    "source": "phonk",
    "target": "drift-phonk",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Drift phonk accelerated phonk with extreme distortion.",
      "zh": "漂移 Phonk 用极限失真加速了放克说唱。"
    }
  },
  {
    "source": "drift-phonk",
    "target": "phonk",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "drift-phonk links historically back to phonk.",
      "zh": "drift-phonk 在音乐历史渊源上追溯关联至 phonk。"
    }
  },
  {
    "source": "electro",
    "target": "breakbeat",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Breakbeat broadened electro funk into UK breakbeats.",
      "zh": "碎拍乐将电子放克拓宽为充满活力的英国碎拍。"
    }
  },
  {
    "source": "breakbeat",
    "target": "electro",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "breakbeat links historically back to electro.",
      "zh": "breakbeat 在音乐历史渊源上追溯关联至 electro。"
    }
  },
  {
    "source": "breakbeat",
    "target": "big-beat",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Big beat amplified breakbeats with heavy rock guitars.",
      "zh": "大碎拍用重型摇滚吉他强化了碎拍能量。"
    }
  },
  {
    "source": "big-beat",
    "target": "breakbeat",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "big-beat links historically back to breakbeat.",
      "zh": "big-beat 在音乐历史渊源上追溯关联至 breakbeat。"
    }
  },
  {
    "source": "delta-blues",
    "target": "chicago-blues",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Chicago blues electrified Mississippi delta blues.",
      "zh": "芝加哥布鲁斯将三角洲布鲁斯通电放大。"
    }
  },
  {
    "source": "chicago-blues",
    "target": "delta-blues",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "chicago-blues links historically back to delta-blues.",
      "zh": "chicago-blues 在音乐历史渊源上追溯关联至 delta-blues。"
    }
  },
  {
    "source": "chicago-blues",
    "target": "rock-and-roll",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "Rock and Roll formed from blues and rhythm and blues.",
      "zh": "摇滚乐脱胎于布鲁斯与节奏布鲁斯。"
    }
  },
  {
    "source": "rock-and-roll",
    "target": "chicago-blues",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "rock-and-roll links historically back to chicago-blues.",
      "zh": "rock-and-roll 在音乐历史渊源上追溯关联至 chicago-blues。"
    }
  },
  {
    "source": "rock-and-roll",
    "target": "blues-rock",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Blues rock amplified blues improvisation.",
      "zh": "布鲁斯摇滚放大了布鲁斯即兴。"
    }
  },
  {
    "source": "blues-rock",
    "target": "rock-and-roll",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "blues-rock links historically back to rock-and-roll.",
      "zh": "blues-rock 在音乐历史渊源上追溯关联至 rock-and-roll。"
    }
  },
  {
    "source": "blues-rock",
    "target": "hard-rock",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Hard rock turned blues riffs into power chords.",
      "zh": "硬摇滚将布鲁斯 Riff 转变为强力和弦。"
    }
  },
  {
    "source": "hard-rock",
    "target": "blues-rock",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "hard-rock links historically back to blues-rock.",
      "zh": "hard-rock 在音乐历史渊源上追溯关联至 blues-rock。"
    }
  },
  {
    "source": "hard-rock",
    "target": "heavy-metal",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Black Sabbath birthed heavy metal from hard rock.",
      "zh": "Black Sabbath 从硬摇滚中孕育了重金属。"
    }
  },
  {
    "source": "heavy-metal",
    "target": "hard-rock",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "heavy-metal links historically back to hard-rock.",
      "zh": "heavy-metal 在音乐历史渊源上追溯关联至 hard-rock。"
    }
  },
  {
    "source": "heavy-metal",
    "target": "thrash-metal",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Thrash metal sped metal up with punk fury.",
      "zh": "激流金属用朋克狂怒加速了金属乐。"
    }
  },
  {
    "source": "thrash-metal",
    "target": "heavy-metal",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "thrash-metal links historically back to heavy-metal.",
      "zh": "thrash-metal 在音乐历史渊源上追溯关联至 heavy-metal。"
    }
  },
  {
    "source": "thrash-metal",
    "target": "death-metal",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Death metal pushed thrash speed into brutal growls.",
      "zh": "死亡金属将激流速度推向狂暴兽吼极限。"
    }
  },
  {
    "source": "death-metal",
    "target": "thrash-metal",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "death-metal links historically back to thrash-metal.",
      "zh": "death-metal 在音乐历史渊源上追溯关联至 thrash-metal。"
    }
  },
  {
    "source": "thrash-metal",
    "target": "black-metal",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Black metal focused on raw cold atmospheric fury.",
      "zh": "黑金属专注于原始冰冷的狂乱氛围。"
    }
  },
  {
    "source": "black-metal",
    "target": "thrash-metal",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "black-metal links historically back to thrash-metal.",
      "zh": "black-metal 在音乐历史渊源上追溯关联至 thrash-metal。"
    }
  },
  {
    "source": "heavy-metal",
    "target": "doom-metal",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Doom metal dragged metal into agonizingly heavy slow tempos.",
      "zh": "毁灭金属将金属乐拉入缓慢沉重的泥沼。"
    }
  },
  {
    "source": "doom-metal",
    "target": "heavy-metal",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "doom-metal links historically back to heavy-metal.",
      "zh": "doom-metal 在音乐历史渊源上追溯关联至 heavy-metal。"
    }
  },
  {
    "source": "heavy-metal",
    "target": "metalcore",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "Metalcore merged melodic death metal with punk breakdowns.",
      "zh": "金属核融合了旋律死金与朋克蹲点。"
    }
  },
  {
    "source": "metalcore",
    "target": "heavy-metal",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "metalcore links historically back to heavy-metal.",
      "zh": "metalcore 在音乐历史渊源上追溯关联至 heavy-metal。"
    }
  },
  {
    "source": "punk-rock",
    "target": "post-punk",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Post-punk transformed punk into artistic expression.",
      "zh": "后朋克将朋克转化为艺术探索。"
    }
  },
  {
    "source": "post-punk",
    "target": "punk-rock",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "post-punk links historically back to punk-rock.",
      "zh": "post-punk 在音乐历史渊源上追溯关联至 punk-rock。"
    }
  },
  {
    "source": "post-punk",
    "target": "new-wave",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "New wave injected pop hooks and synths.",
      "zh": "新浪潮注入了流行 Hook 与合成器。"
    }
  },
  {
    "source": "new-wave",
    "target": "post-punk",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "new-wave links historically back to post-punk.",
      "zh": "new-wave 在音乐历史渊源上追溯关联至 post-punk。"
    }
  },
  {
    "source": "punk-rock",
    "target": "grunge",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "Grunge merged punk raw energy with metal sludge.",
      "zh": "垃圾摇滚融合了朋克粗砺与金属泥泞。"
    }
  },
  {
    "source": "grunge",
    "target": "punk-rock",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "grunge links historically back to punk-rock.",
      "zh": "grunge 在音乐历史渊源上追溯关联至 punk-rock。"
    }
  },
  {
    "source": "grunge",
    "target": "alternative-rock",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Alternative rock expanded grunge's college radio dominance.",
      "zh": "另类摇滚拓展了垃圾摇滚在大学电台的影响。"
    }
  },
  {
    "source": "alternative-rock",
    "target": "grunge",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "alternative-rock links historically back to grunge.",
      "zh": "alternative-rock 在音乐历史渊源上追溯关联至 grunge。"
    }
  },
  {
    "source": "hard-rock",
    "target": "progressive-rock",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "Progressive rock introduced classical complexity to rock.",
      "zh": "前卫摇滚为摇滚引入古典交响复杂度。"
    }
  },
  {
    "source": "progressive-rock",
    "target": "hard-rock",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "progressive-rock links historically back to hard-rock.",
      "zh": "progressive-rock 在音乐历史渊源上追溯关联至 hard-rock。"
    }
  },
  {
    "source": "alternative-rock",
    "target": "math-rock",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Math rock structured rock around odd meters and tapping.",
      "zh": "数学摇滚围绕奇数节拍与点弦构建音乐。"
    }
  },
  {
    "source": "math-rock",
    "target": "alternative-rock",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "math-rock links historically back to alternative-rock.",
      "zh": "math-rock 在音乐历史渊源上追溯关联至 alternative-rock。"
    }
  },
  {
    "source": "post-punk",
    "target": "shoe-gaze",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Shoegaze buried melodies under reverse-reverb noise walls.",
      "zh": "自赏摇滚将旋律隐匿于反向混响吉他噪音之下。"
    }
  },
  {
    "source": "shoe-gaze",
    "target": "post-punk",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "shoe-gaze links historically back to post-punk.",
      "zh": "shoe-gaze 在音乐历史渊源上追溯关联至 post-punk。"
    }
  },
  {
    "source": "old-school-hip-hop",
    "target": "boom-bap",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Boom bap refined the drum breaks on the Akai MPC.",
      "zh": "Boom Bap 在 Akai MPC 上提炼了击打律动。"
    }
  },
  {
    "source": "boom-bap",
    "target": "old-school-hip-hop",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "boom-bap links historically back to old-school-hip-hop.",
      "zh": "boom-bap 在音乐历史渊源上追溯关联至 old-school-hip-hop。"
    }
  },
  {
    "source": "old-school-hip-hop",
    "target": "east-coast-hip-hop",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "East Coast hip hop sharpened street lyrical storytelling.",
      "zh": "东海岸嘻哈磨砺了街头叙事与多音节押韵。"
    }
  },
  {
    "source": "east-coast-hip-hop",
    "target": "old-school-hip-hop",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "east-coast-hip-hop links historically back to old-school-hip-hop.",
      "zh": "east-coast-hip-hop 在音乐历史渊源上追溯关联至 old-school-hip-hop。"
    }
  },
  {
    "source": "old-school-hip-hop",
    "target": "west-coast-hip-hop",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "West Coast hip hop introduced funk bass cruiser bounce.",
      "zh": "西海岸嘻哈引入了放克低音巡游律动。"
    }
  },
  {
    "source": "west-coast-hip-hop",
    "target": "old-school-hip-hop",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "west-coast-hip-hop links historically back to old-school-hip-hop.",
      "zh": "west-coast-hip-hop 在音乐历史渊源上追溯关联至 old-school-hip-hop。"
    }
  },
  {
    "source": "west-coast-hip-hop",
    "target": "g-funk",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Dr. Dre crafted G-funk with sliding Moog synth leads.",
      "zh": "Dr. Dre 用滑音 Moog 合成器独奏铸就 G-Funk。"
    }
  },
  {
    "source": "g-funk",
    "target": "west-coast-hip-hop",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "g-funk links historically back to west-coast-hip-hop.",
      "zh": "g-funk 在音乐历史渊源上追溯关联至 west-coast-hip-hop。"
    }
  },
  {
    "source": "boom-bap",
    "target": "conscious-hip-hop",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "Conscious hip hop brought social awareness to boom-bap.",
      "zh": "自觉说唱为 Boom Bap 注入社会正义反思。"
    }
  },
  {
    "source": "conscious-hip-hop",
    "target": "boom-bap",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "conscious-hip-hop links historically back to boom-bap.",
      "zh": "conscious-hip-hop 在音乐历史渊源上追溯关联至 boom-bap。"
    }
  },
  {
    "source": "boom-bap",
    "target": "lofi-hip-hop",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Lo-Fi hip hop relaxed boom-bap with jazz chords and crackle.",
      "zh": "Lo-Fi 嘻哈用爵士和弦与黑胶底噪舒缓了 Boom-Bap。"
    }
  },
  {
    "source": "lofi-hip-hop",
    "target": "boom-bap",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "lofi-hip-hop links historically back to boom-bap.",
      "zh": "lofi-hip-hop 在音乐历史渊源上追溯关联至 boom-bap。"
    }
  },
  {
    "source": "trap-rap",
    "target": "emo-rap",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Emo rap paired 808 trap drums with vulnerable guitars.",
      "zh": "Emo 说唱将 808 鼓点与感伤吉他独白结合。"
    }
  },
  {
    "source": "emo-rap",
    "target": "trap-rap",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "emo-rap links historically back to trap-rap.",
      "zh": "emo-rap 在音乐历史渊源上追溯关联至 trap-rap。"
    }
  },
  {
    "source": "trap-rap",
    "target": "cloud-rap",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Cloud rap floated trap drums in dreamlike reverb clouds.",
      "zh": "云雾说唱让 Trap 鼓点浮沉于梦境混响云雾中。"
    }
  },
  {
    "source": "cloud-rap",
    "target": "trap-rap",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "cloud-rap links historically back to trap-rap.",
      "zh": "cloud-rap 在音乐历史渊源上追溯关联至 trap-rap。"
    }
  },
  {
    "source": "delta-blues",
    "target": "texas-blues",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Texas blues energized acoustic blues with shuffle.",
      "zh": "德州布鲁斯用摇摆律动激活了原声布鲁斯。"
    }
  },
  {
    "source": "texas-blues",
    "target": "delta-blues",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "texas-blues links historically back to delta-blues.",
      "zh": "texas-blues 在音乐历史渊源上追溯关联至 delta-blues。"
    }
  },
  {
    "source": "chicago-blues",
    "target": "electric-blues",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Electric blues set the template for modern soloing.",
      "zh": "电气布鲁斯奠定了现代电吉他独奏范式。"
    }
  },
  {
    "source": "electric-blues",
    "target": "chicago-blues",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "electric-blues links historically back to chicago-blues.",
      "zh": "electric-blues 在音乐历史渊源上追溯关联至 chicago-blues。"
    }
  },
  {
    "source": "traditional-jazz",
    "target": "bebop",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Bebop transformed swing jazz into complex art.",
      "zh": "Bebop 将摇摆爵士转化为高难度艺术。"
    }
  },
  {
    "source": "bebop",
    "target": "traditional-jazz",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "bebop links historically back to traditional-jazz.",
      "zh": "bebop 在音乐历史渊源上追溯关联至 traditional-jazz。"
    }
  },
  {
    "source": "bebop",
    "target": "cool-jazz",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Cool jazz reacted against bebop with relaxed subtlety.",
      "zh": "冷爵士反叛比波普的燥热，追求温文尔雅。"
    }
  },
  {
    "source": "cool-jazz",
    "target": "bebop",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "cool-jazz links historically back to bebop.",
      "zh": "cool-jazz 在音乐历史渊源上追溯关联至 bebop。"
    }
  },
  {
    "source": "bebop",
    "target": "hard-bop",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Hard bop re-infused bebop with blues and gospel.",
      "zh": "硬波普为比波普重新注入布鲁斯与福音。"
    }
  },
  {
    "source": "hard-bop",
    "target": "bebop",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "hard-bop links historically back to bebop.",
      "zh": "hard-bop 在音乐历史渊源上追溯关联至 bebop。"
    }
  },
  {
    "source": "cool-jazz",
    "target": "modal-jazz",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Kind of Blue established modal improvisation.",
      "zh": "《Kind of Blue》开创了调式即兴时代。"
    }
  },
  {
    "source": "modal-jazz",
    "target": "cool-jazz",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "modal-jazz links historically back to cool-jazz.",
      "zh": "modal-jazz 在音乐历史渊源上追溯关联至 cool-jazz。"
    }
  },
  {
    "source": "bebop",
    "target": "free-jazz",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Free jazz discarded fixed meters and chord charts.",
      "zh": "自由爵士摒弃了固定小节与和弦框架。"
    }
  },
  {
    "source": "free-jazz",
    "target": "bebop",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "free-jazz links historically back to bebop.",
      "zh": "free-jazz 在音乐历史渊源上追溯关联至 bebop。"
    }
  },
  {
    "source": "modal-jazz",
    "target": "jazz-fusion",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Miles Davis fused modal jazz with rock amplifiers.",
      "zh": "Miles Davis 将调式爵士与摇滚放大器结合。"
    }
  },
  {
    "source": "jazz-fusion",
    "target": "modal-jazz",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "jazz-fusion links historically back to modal-jazz.",
      "zh": "jazz-fusion 在音乐历史渊源上追溯关联至 modal-jazz。"
    }
  },
  {
    "source": "jazz-fusion",
    "target": "smooth-jazz",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Smooth jazz commercialized fusion for radio playlists.",
      "zh": "轻柔爵士将融合爵士商业化，适合电台播放。"
    }
  },
  {
    "source": "smooth-jazz",
    "target": "jazz-fusion",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "smooth-jazz links historically back to jazz-fusion.",
      "zh": "smooth-jazz 在音乐历史渊源上追溯关联至 jazz-fusion。"
    }
  },
  {
    "source": "traditional-jazz",
    "target": "acid-jazz",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "Acid jazz sampled jazz records over club breakbeats.",
      "zh": "酸性爵士在俱乐部碎拍上采样爵士黑胶。"
    }
  },
  {
    "source": "acid-jazz",
    "target": "traditional-jazz",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "acid-jazz links historically back to traditional-jazz.",
      "zh": "acid-jazz 在音乐历史渊源上追溯关联至 traditional-jazz。"
    }
  },
  {
    "source": "traditional-jazz",
    "target": "gypsy-jazz",
    "type": "fusion_with",
    "weight": 4,
    "description": {
      "en": "Django Reinhardt fused Paris swing with Romani music.",
      "zh": "Django Reinhardt 将巴黎摇摆与罗姆音乐融合。"
    }
  },
  {
    "source": "gypsy-jazz",
    "target": "traditional-jazz",
    "type": "fusion_with",
    "weight": 4,
    "description": {
      "en": "gypsy-jazz links historically back to traditional-jazz.",
      "zh": "gypsy-jazz 在音乐历史渊源上追溯关联至 traditional-jazz。"
    }
  },
  {
    "source": "traditional-pop",
    "target": "soul",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "Soul merged traditional pop vocal prowess with gospel.",
      "zh": "灵魂乐融合了传统声乐技巧与福音激情。"
    }
  },
  {
    "source": "soul",
    "target": "traditional-pop",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "soul links historically back to traditional-pop.",
      "zh": "soul 在音乐历史渊源上追溯关联至 traditional-pop。"
    }
  },
  {
    "source": "soul",
    "target": "motown",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Motown industrialized soul into global pop anthems.",
      "zh": "摩城将灵魂乐工业化，造就全球流行经典。"
    }
  },
  {
    "source": "motown",
    "target": "soul",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "motown links historically back to soul.",
      "zh": "motown 在音乐历史渊源上追溯关联至 soul。"
    }
  },
  {
    "source": "soul",
    "target": "funk",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "James Brown transformed soul into groove-driven funk.",
      "zh": "James Brown 将灵魂乐升华为主打律动的放克。"
    }
  },
  {
    "source": "funk",
    "target": "soul",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "funk links historically back to soul.",
      "zh": "funk 在音乐历史渊源上追溯关联至 soul。"
    }
  },
  {
    "source": "funk",
    "target": "disco",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Disco streamlined funk rhythms into 4/4 dance floors.",
      "zh": "迪斯科将放克节拍规整为四四拍舞池轰炸。"
    }
  },
  {
    "source": "disco",
    "target": "funk",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "disco links historically back to funk.",
      "zh": "disco 在音乐历史渊源上追溯关联至 funk。"
    }
  },
  {
    "source": "disco",
    "target": "eurodance",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Eurodance accelerated disco grooves to 140 BPM with synths.",
      "zh": "欧陆舞曲将迪斯科节拍加速至 140 BPM。"
    }
  },
  {
    "source": "eurodance",
    "target": "disco",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "eurodance links historically back to disco.",
      "zh": "eurodance 在音乐历史渊源上追溯关联至 disco。"
    }
  },
  {
    "source": "soul",
    "target": "neo-soul",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Neo-soul revitalized 70s soul with hip-hop beats.",
      "zh": "新灵魂乐用嘻哈节拍复兴了 70 年代灵魂乐。"
    }
  },
  {
    "source": "neo-soul",
    "target": "soul",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "neo-soul links historically back to soul.",
      "zh": "neo-soul 在音乐历史渊源上追溯关联至 soul。"
    }
  },
  {
    "source": "soul",
    "target": "contemporary-rnb",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Contemporary R&B modernized soul with 808 drum machines.",
      "zh": "当代 R&B 用 808 鼓机现代化了灵魂乐。"
    }
  },
  {
    "source": "contemporary-rnb",
    "target": "soul",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "contemporary-rnb links historically back to soul.",
      "zh": "contemporary-rnb 在音乐历史渊源上追溯关联至 soul。"
    }
  },
  {
    "source": "contemporary-rnb",
    "target": "alternative-rnb",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Alternative R&B darkened R&B with moody indie aesthetics.",
      "zh": "另类 R&B 用独立暗黑美学深化了 R&B。"
    }
  },
  {
    "source": "alternative-rnb",
    "target": "contemporary-rnb",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "alternative-rnb links historically back to contemporary-rnb.",
      "zh": "alternative-rnb 在音乐历史渊源上追溯关联至 contemporary-rnb。"
    }
  },
  {
    "source": "disco",
    "target": "city-pop",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "City pop merged disco-funk with Japanese urban songwriting.",
      "zh": "City Pop 融合了迪斯科放克与日本都市创作。"
    }
  },
  {
    "source": "city-pop",
    "target": "disco",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "city-pop links historically back to disco.",
      "zh": "city-pop 在音乐历史渊源上追溯关联至 disco。"
    }
  },
  {
    "source": "synth-pop",
    "target": "k-pop",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "K-pop combined modern synth-pop with choreography.",
      "zh": "K-Pop 将现代合成流行与高难度编舞结合。"
    }
  },
  {
    "source": "k-pop",
    "target": "synth-pop",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "k-pop links historically back to synth-pop.",
      "zh": "k-pop 在音乐历史渊源上追溯关联至 synth-pop。"
    }
  },
  {
    "source": "city-pop",
    "target": "j-pop",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "J-pop evolved from City Pop and Kayōkyoku with anime power.",
      "zh": "J-Pop 脱胎于 City Pop 与歌谣曲，充满动漫感染力。"
    }
  },
  {
    "source": "j-pop",
    "target": "city-pop",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "j-pop links historically back to city-pop.",
      "zh": "j-pop 在音乐历史渊源上追溯关联至 city-pop。"
    }
  },
  {
    "source": "samba",
    "target": "bossa-nova",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Bossa nova softened energetic samba into an acoustic sway.",
      "zh": "波萨诺瓦将欢快桑巴柔化为原声慢摇。"
    }
  },
  {
    "source": "bossa-nova",
    "target": "samba",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "bossa-nova links historically back to samba.",
      "zh": "bossa-nova 在音乐历史渊源上追溯关联至 samba。"
    }
  },
  {
    "source": "reggae",
    "target": "dancehall",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Dancehall digitalized reggae riddims for sound-clashes.",
      "zh": "舞厅雷鬼将雷鬼音乐数字化为斗歌利器。"
    }
  },
  {
    "source": "dancehall",
    "target": "reggae",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "dancehall links historically back to reggae.",
      "zh": "dancehall 在音乐历史渊源上追溯关联至 reggae。"
    }
  },
  {
    "source": "dancehall",
    "target": "reggaeton",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Reggaeton adapted dancehall riddims into Dembow bounce.",
      "zh": "雷鬼顿将舞厅雷鬼演化为洗脑的 Dembow 弹跳。"
    }
  },
  {
    "source": "reggaeton",
    "target": "dancehall",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "reggaeton links historically back to dancehall.",
      "zh": "reggaeton 在音乐历史渊源上追溯关联至 dancehall。"
    }
  },
  {
    "source": "afrobeat",
    "target": "amapiano",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "Amapiano drew from Afrobeat and African house roots.",
      "zh": "Amapiano 汲取了非洲节拍与本土浩室的灵性养分。"
    }
  },
  {
    "source": "amapiano",
    "target": "afrobeat",
    "type": "influenced_by",
    "weight": 4,
    "description": {
      "en": "amapiano links historically back to afrobeat.",
      "zh": "amapiano 在音乐历史渊源上追溯关联至 afrobeat。"
    }
  },
  {
    "source": "acid-techno",
    "target": "detroit-techno",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "Acid techno evolved from techno using TB-303 lines.",
      "zh": "Acid Techno 采用 TB-303 酸性贝斯线演化自 Techno。"
    }
  },
  {
    "source": "detroit-techno",
    "target": "acid-techno",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "detroit-techno links historically back to acid-techno.",
      "zh": "detroit-techno 在音乐历史渊源上追溯关联至 acid-techno。"
    }
  },
  {
    "source": "acid-techno",
    "target": "acid-house",
    "type": "influenced_by",
    "weight": 5,
    "description": {
      "en": "Acid techno took heavy cues from early acid house.",
      "zh": "Acid Techno 深受早期 Acid House 启发。"
    }
  },
  {
    "source": "acid-house",
    "target": "acid-techno",
    "type": "influenced_by",
    "weight": 5,
    "description": {
      "en": "acid-house links historically back to acid-techno.",
      "zh": "acid-house 在音乐历史渊源上追溯关联至 acid-techno。"
    }
  },
  {
    "source": "future-house",
    "target": "deep-house",
    "type": "origin_from",
    "weight": 5,
    "description": {
      "en": "Future house energized deep house with metallic plucks.",
      "zh": "Future House 用金属质感拨弦强化了 Deep House。"
    }
  },
  {
    "source": "deep-house",
    "target": "future-house",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "deep-house links historically back to future-house.",
      "zh": "deep-house 在音乐历史渊源上追溯关联至 future-house。"
    }
  },
  {
    "source": "wave",
    "target": "trap-rap",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "Wave music fused trap 808s with ambient synth textures.",
      "zh": "Wave 音乐融合了 Trap 808 与环境合成器纹理。"
    }
  },
  {
    "source": "trap-rap",
    "target": "wave",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "trap-rap links historically back to wave.",
      "zh": "trap-rap 在音乐历史渊源上追溯关联至 wave。"
    }
  },
  {
    "source": "kuduro",
    "target": "afro-house",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "Kuduro combined Angolan rhythms with electronic house.",
      "zh": "Kuduro 将安哥拉民间节奏与电子浩室融合。"
    }
  },
  {
    "source": "afro-house",
    "target": "kuduro",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "afro-house links historically back to kuduro.",
      "zh": "afro-house 在音乐历史渊源上追溯关联至 kuduro。"
    }
  },
  {
    "source": "kuduro",
    "target": "afrobeat",
    "type": "origin_from",
    "weight": 4,
    "description": {
      "en": "Kuduro roots trace back to African percussive traditions.",
      "zh": "Kuduro 根植于非洲打击乐律动传统。"
    }
  },
  {
    "source": "afrobeat",
    "target": "kuduro",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "afrobeat links historically back to kuduro.",
      "zh": "afrobeat 在音乐历史渊源上追溯关联至 kuduro。"
    }
  },
  {
    "source": "bachata",
    "target": "salsa",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "Bachata and salsa share vibrant Caribbean social dance roots.",
      "zh": "Bachata 与 Salsa 共享充满活力的加勒比社交舞曲传统。"
    }
  },
  {
    "source": "salsa",
    "target": "bachata",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "salsa links historically back to bachata.",
      "zh": "salsa 在音乐历史渊源上追溯关联至 bachata。"
    }
  },
  {
    "source": "salsa",
    "target": "cumbia",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "Salsa and Cumbia share deep Afro-Latin syncopated grooves.",
      "zh": "Salsa 与 Cumbia 共享深厚的非裔拉丁切分律动。"
    }
  },
  {
    "source": "cumbia",
    "target": "salsa",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "cumbia links historically back to salsa.",
      "zh": "cumbia 在音乐历史渊源上追溯关联至 salsa。"
    }
  },
  {
    "source": "cumbia",
    "target": "reggaeton",
    "type": "fusion_with",
    "weight": 4,
    "description": {
      "en": "Cumbia syncopations heavily influenced early reggaeton dembow.",
      "zh": "Cumbia 切分律动深度影响了早期 Reggaeton Dembow 鼓点。"
    }
  },
  {
    "source": "reggaeton",
    "target": "cumbia",
    "type": "fusion_with",
    "weight": 4,
    "description": {
      "en": "reggaeton links historically back to cumbia.",
      "zh": "reggaeton 在音乐历史渊源上追溯关联至 cumbia。"
    }
  }
];
