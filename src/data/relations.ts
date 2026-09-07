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
    "target": "deep-house",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Deep house slowed and deepened Chicago house.",
      "zh": "Deep House 放缓加深了芝加哥浩室。"
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
    "target": "footwork",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Footwork evolved from ghetto house and juke.",
      "zh": "Footwork 由 Ghetto House 与 Juke 演进而来。"
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
    "target": "bass-house",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Bass house merged electro house with dubstep growls.",
      "zh": "低音浩室融合了电子浩室与 Dubstep 嘶吼。"
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
    "target": "minimal-techno",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Minimal techno stripped Detroit techno down.",
      "zh": "极简 Techno 精简了底特律 Techno 骨架。"
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
    "target": "schranz",
    "type": "regional_variant",
    "weight": 4,
    "description": {
      "en": "Schranz is Frankfurt's high-speed hard techno.",
      "zh": "Schranz 是德国法兰克福的高速硬核分支。"
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
    "target": "progressive-trance",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Progressive trance deepened the builds.",
      "zh": "前卫 Trance 深化了氛围铺垫。"
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
    "target": "psytrance",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Psytrance became global evolution of Goa trance.",
      "zh": "Psytrance 成为果阿 Trance 的全球进化形态。"
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
    "target": "grime",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Grime grew out of dark garage pirate radio.",
      "zh": "Grime 脱胎于黑暗车库音乐电台。"
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
    "target": "bassline",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Bassline evolved in Sheffield with vocal hooks and donks.",
      "zh": "Bassline 在谢菲尔德演化，加入人声 Hook 与 Donk 低音。"
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
    "target": "hard-trap",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Hard trap combined distorted kicks with trap bounce.",
      "zh": "Hard Trap 将失真底鼓与 Trap 弹跳结合。"
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
    "target": "kawaii-future-bass",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Kawaii future bass infused anime visuals and chiptune.",
      "zh": "可爱未来贝斯融入了动漫美学与芯片音效。"
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
    "target": "jersey-drill",
    "type": "fusion_with",
    "weight": 5,
    "description": {
      "en": "Jersey drill fused drill 808s with club bounce.",
      "zh": "泽西 Drill 融合了钻头 808 与泽西俱乐部弹跳。"
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
    "target": "glitch-hop",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Glitch hop added digital micro-edits to hip-hop.",
      "zh": "故障嘻哈为嘻哈节拍增添数字微切片。"
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
    "target": "frenchcore",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Frenchcore accelerated kicks to 200 BPM with bounce.",
      "zh": "法兰西硬核将底鼓加速至 200 BPM 并加入反拍弹跳。"
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
    "target": "drift-phonk",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Drift phonk accelerated phonk with extreme distortion.",
      "zh": "漂移 Phonk 用极限失真加速了放克说唱。"
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
    "target": "big-beat",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Big beat amplified breakbeats with heavy rock guitars.",
      "zh": "大碎拍用重型摇滚吉他强化了碎拍能量。"
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
    "target": "death-metal",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Death metal pushed thrash speed into brutal growls.",
      "zh": "死亡金属将激流速度推向狂暴兽吼极限。"
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
    "target": "new-wave",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "New wave injected pop hooks and synths.",
      "zh": "新浪潮注入了流行 Hook 与合成器。"
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
    "target": "alternative-rock",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Alternative rock expanded grunge's college radio dominance.",
      "zh": "另类摇滚拓展了垃圾摇滚在大学电台的影响。"
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
    "target": "g-funk",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Dr. Dre crafted G-funk with sliding Moog synth leads.",
      "zh": "Dr. Dre 用滑音 Moog 合成器独奏铸就 G-Funk。"
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
    "target": "cool-jazz",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Cool jazz reacted against bebop with relaxed subtlety.",
      "zh": "冷爵士反叛比波普的燥热，追求温文尔雅。"
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
    "target": "smooth-jazz",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Smooth jazz commercialized fusion for radio playlists.",
      "zh": "轻柔爵士将融合爵士商业化，适合电台播放。"
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
    "target": "motown",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Motown industrialized soul into global pop anthems.",
      "zh": "摩城将灵魂乐工业化，造就全球流行经典。"
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
    "target": "eurodance",
    "type": "derived_to",
    "weight": 4,
    "description": {
      "en": "Eurodance accelerated disco grooves to 140 BPM with synths.",
      "zh": "欧陆舞曲将迪斯科节拍加速至 140 BPM。"
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
    "target": "alternative-rnb",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Alternative R&B darkened R&B with moody indie aesthetics.",
      "zh": "另类 R&B 用独立暗黑美学深化了 R&B。"
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
    "source": "reggae",
    "target": "dub",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Dub stripped reggae down into echoing mixing desk art.",
      "zh": "Dub 将雷鬼解构为充满回声的调音台艺术。"
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
    "target": "reggaeton",
    "type": "derived_to",
    "weight": 5,
    "description": {
      "en": "Reggaeton adapted dancehall riddims into Dembow bounce.",
      "zh": "雷鬼顿将舞厅雷鬼演化为洗脑的 Dembow 弹跳。"
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
  }
];
