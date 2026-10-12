export interface TimelineStory {
  id: string;
  decade: number;
  year: string;
  title: { en: string; zh: string };
  description: { en: string; zh: string };
  genre_ids: string[];
}

export const TIMELINE_STORIES: TimelineStory[] = [
  {
    "id": "story-1900-delta",
    "decade": 1900,
    "year": "1900s",
    "title": {
      "en": "Origins: Mud, Churches, and Delta Blues",
      "zh": "源头：泥水、教堂与三角洲布鲁斯"
    },
    "description": {
      "en": "In the Mississippi Delta, African-American laborers combined spiritual field hollers and work songs to forge the blues. Using acoustic slide guitars and foot stomps, they established the 12-bar harmonic foundation that would underpin all modern Western popular and dance music.",
      "zh": "在密西西比三角洲的棉花田里，非裔劳工将灵性田野呼号与福音劳动歌熔铸为最初的布鲁斯。借助原声滑棒吉他与脚步重踏，他们确立了神圣的 12 小节和声架构，奠定了整个现代西方流行乐与舞曲的基石。"
    },
    "genre_ids": [
      "delta-blues",
      "traditional-jazz"
    ]
  },
  {
    "id": "story-1930-swing-city",
    "decade": 1930,
    "year": "1930s",
    "title": {
      "en": "Big Bands, Gypsy Fire, and Texas Roads",
      "zh": "大乐队、吉普赛之火与德州行进"
    },
    "description": {
      "en": "The Swing Era brought jazz to ballroom dancefloors across America. Meanwhile in Paris, Django Reinhardt pioneered Gypsy Jazz with breathtaking acoustic virtuosity, and Texas guitarists began amplifying the blues for crowded honky-tonks.",
      "zh": "摇摆乐大乐队时代让爵士乐风靡全美舞厅。与此同一时期在巴黎，Django Reinhardt 凭借神乎其技的指弹开创了吉普赛爵士，而德州乐手们开始在拥挤的酒馆里将布鲁斯音箱开向过载。"
    },
    "genre_ids": [
      "texas-blues",
      "gypsy-jazz",
      "cumbia",
      "samba"
    ]
  },
  {
    "id": "story-1940-electric-rebirth",
    "decade": 1940,
    "year": "1940s",
    "title": {
      "en": "Electrification, Bebop Revolution, and Post-War Pop",
      "zh": "电气化冲击、比波普革命与战后金曲"
    },
    "description": {
      "en": "Muddy Waters arrived in Chicago, plugging the acoustic blues into tube amplifiers. Simultaneously in Harlem, Charlie Parker and Dizzy Gillespie shattered dance conventions with blistering bebop speeds, turning jazz into high art while crooners ruled popular radio.",
      "zh": "Muddy Waters 抵达芝加哥，将原声布鲁斯插入电子管放大器，炸裂了南区俱乐部。在哈莱姆，Charlie Parker 与 Dizzy Gillespie 用闪电般的比波普速度击碎平庸舞曲规则，将爵士提升为纯艺术。"
    },
    "genre_ids": [
      "chicago-blues",
      "bebop",
      "traditional-pop",
      "electric-blues",
      "cool-jazz"
    ]
  },
  {
    "id": "story-1950-rock-and-soul",
    "decade": 1950,
    "year": "1950s",
    "title": {
      "en": "The Birth of Rock 'n' Roll, Soul, and Bossa Nova",
      "zh": "摇滚破晓、灵魂之声与海滨波萨诺瓦"
    },
    "description": {
      "en": "Chuck Berry and Little Richard married rhythm and blues with country, birthing rock and roll that electrified youth culture. Ray Charles and Sam Cooke forged soul from gospel passion, while in Rio, João Gilberto whispered the gentle bossa nova into world consciousness.",
      "zh": "Chuck Berry 与 Little Richard 将节奏布鲁斯与乡村音乐结合，诞生了令全球青年发狂的摇滚乐。Ray Charles 用福音激情点燃了灵魂乐，而在里约的海滩，João Gilberto 耳语般的 Bossa Nova 飘向全世界。"
    },
    "genre_ids": [
      "rock-and-roll",
      "soul",
      "bossa-nova",
      "modal-jazz",
      "hard-bop",
      "free-jazz",
      "motown"
    ]
  },
  {
    "id": "story-1960-psychedelia-funk",
    "decade": 1960,
    "year": "1960s",
    "title": {
      "en": "The Golden Decade: Funk, Heavy Metal, and Dub",
      "zh": "黄金年代：放克基石、重金属轰鸣与回响实验"
    },
    "description": {
      "en": "James Brown invented funk by landing hard on 'The One', inventing the modern dance groove pocket. Black Sabbath forged heavy metal in Birmingham, Jamaican engineers invented dub with tape echoes, and Miles Davis brought electricity to jazz with Bitches Brew.",
      "zh": "James Brown 以无可撼动的第 1 拍重音（The One）确立了放克，定义了现代舞曲身体律动。Black Sabbath 在伯明翰铸就重金属，牙买加录音师把调音台当作乐器开创了 Dub 回响，Miles Davis 则用通电融合爵士颠覆世界。"
    },
    "genre_ids": [
      "funk",
      "heavy-metal",
      "hard-rock",
      "blues-rock",
      "reggae",
      "dub",
      "afrobeat",
      "progressive-rock",
      "jazz-fusion",
      "salsa"
    ]
  },
  {
    "id": "story-1970-disco-punk-hiphop",
    "decade": 1970,
    "year": "1970s",
    "title": {
      "en": "The Trinity: Disco Fever, Punk Fury, and Bronx Hip Hop",
      "zh": "三位一体：迪斯科热潮、朋克狂怒与嘻哈诞生"
    },
    "description": {
      "en": "Four-on-the-floor disco united dancefloors worldwide, while stripped-down punk rock ignited London and NYC with three chords. In the Bronx, DJ Kool Herc isolated drum breaks on turntables, birthing hip hop culture and changing music production forever.",
      "zh": "四踩四迪斯科统领全球舞池，朋克三和弦在伦敦与纽约点燃地下怒火。在布朗克斯，DJ Kool Herc 用双唱机循环延长鼓碎拍，宣告嘻哈文化降生，永远重塑了全球音乐制作形态。"
    },
    "genre_ids": [
      "disco",
      "punk-rock",
      "old-school-hip-hop",
      "synth-pop",
      "post-punk",
      "new-wave",
      "ambient",
      "city-pop",
      "dancehall"
    ]
  },
  {
    "id": "story-1980-house-techno-dawn",
    "decade": 1980,
    "year": "1980s",
    "title": {
      "en": "Machines Awakening: Chicago House, Detroit Techno, and 808s",
      "zh": "机器觉醒：芝加哥浩室、底特律铁克诺与 808 浪潮"
    },
    "description": {
      "en": "Frankie Knuckles at The Warehouse laid the blueprint for house music. In Detroit, The Belleville Three envisioned machine-funk techno. The Roland TR-808, TR-909, and TB-303 fueled acid house, electro, thrash metal, and golden-age boom bap.",
      "zh": "Frankie Knuckles 在 The Warehouse 描绘出 House 的神圣蓝图；底特律贝尔维尔三人组构想出机械放克 Techno。Roland TR-808、909 与 TB-303 激荡起 Acid House、Electro、激流金属与黄金时代 Boom Bap 的漫天星火。"
    },
    "genre_ids": [
      "chicago-house",
      "detroit-techno",
      "acid-house",
      "deep-house",
      "electro",
      "boom-bap",
      "thrash-metal",
      "death-metal",
      "contemporary-rnb",
      "chiptune"
    ]
  },
  {
    "id": "story-1990-rave-breakbeat",
    "decade": 1990,
    "year": "1990s",
    "title": {
      "en": "The UK Rave Continuum, Trance Anthems, and Grunge",
      "zh": "英国狂欢连续体、出神赞歌与垃圾摇滚冲击"
    },
    "description": {
      "en": "UK producers sliced the Amen break into jungle and drum and bass. Uplifting trance swept stadium festivals with emotional supersaws. Grunge swept American radio, G-Funk cruised West Coast streets, and Bristol trip hop drenched world sound in shadowy beauty.",
      "zh": "英国制作人将 Amen break 切割为丛林乐与 Drum & Bass 疾驰狂欢。Uplifting Trance 以史诗 Supersaw 席卷万人音乐节，西雅图 Grunge 击穿电台，G-Funk 巡游加州街头，布里斯托神游舞曲（Trip Hop）给世界蒙上绝美阴翳。"
    },
    "genre_ids": [
      "jungle",
      "uplifting-trance",
      "progressive-house",
      "trip-hop",
      "g-funk",
      "grunge",
      "uk-garage",
      "hardcore-gabber",
      "minimal-techno",
      "dub-techno",
      "eurodance",
      "neo-soul",
      "metalcore",
      "reggaeton"
    ]
  },
  {
    "id": "story-2000-bass-explosion",
    "decade": 2000,
    "year": "2000s",
    "title": {
      "en": "Sub-Bass Pressure, Grime, Electro House, and Synthwave",
      "zh": "深海重低音、污垢说唱、电锯浩室与合成器波"
    },
    "description": {
      "en": "In South London, dubstep explored physical sub-bass pressure, while grime emerged from East London pirate radio. Electro house brought distorted buzz-saws to peak-time clubs, liquid DnB injected jazz soul, and internet producers forged retro synthwave.",
      "zh": "在南伦敦，Dubstep 探索了撼动胸腔的物理超低压，东伦敦黑电台孕育出野蛮 Grime。Electro House 用狂暴电锯锯齿波统治顶峰俱乐部，Liquid DnB 注入灵魂乐温度，互联网极客则点燃了复古合成波（Synthwave）。"
    },
    "genre_ids": [
      "dubstep",
      "grime",
      "electro-house",
      "liquid-dnb",
      "bassline",
      "afro-house",
      "nu-disco-house",
      "trap-rap",
      "synthwave",
      "moombahton",
      "jersey-club"
    ]
  },
  {
    "id": "story-2010-future-drill-era",
    "decade": 2010,
    "year": "2010s",
    "title": {
      "en": "Future Bass, Festival EDM Trap, and The Drill Revolution",
      "zh": "未来贝斯、音乐节电音陷阱与钻头风暴"
    },
    "description": {
      "en": "Flume and San Holo introduced bright LFO-wobble future bass. EDM trap and brostep dominated festival mainstages. Chicago drill evolved into UK and Brooklyn drill, changing global hip hop forever with sliding 808s and syncopated snare skips.",
      "zh": "Flume 与 San Holo 带来了晶莹绚丽的 Future Bass；EDM Trap 与狂暴 Brostep 主宰世界顶级主舞台；芝加哥 Drill 演变为席卷全球的 UK 与 Brooklyn Drill，以标志性滑音 808 彻底颠覆了现代嘻哈音乐。"
    },
    "genre_ids": [
      "future-bass",
      "edm-trap",
      "brostep",
      "uk-drill",
      "brooklyn-drill",
      "future-house",
      "bass-house",
      "melodic-dubstep",
      "melodic-house",
      "tropical-house",
      "vaporwave",
      "lofi-hip-hop",
      "amapiano",
      "alternative-rnb"
    ]
  },
  {
    "id": "story-2020-hybrid-hyper",
    "decade": 2020,
    "year": "2020s",
    "title": {
      "en": "Speed, Hybrids, and Global Renaissance",
      "zh": "极速突进、无界杂交与全球文艺复兴"
    },
    "description": {
      "en": "Music boundaries dissolved as producers forged Jersey Drill, Drift Phonk, fast Hard Techno, and Amapiano. Global cross-pollination at 150+ BPM proved that groove, emotion, and machine synthesis continue to evolve endlessly.",
      "zh": "流派边界彻底消融，制作人们创造出泽西钻头、漂移放克（Drift Phonk）、155 BPM 极速硬核 Techno 与南非 Amapiano。全球多源跨界证明，律动、情感与机器合成的演进永无止境。"
    },
    "genre_ids": [
      "jersey-drill",
      "drift-phonk",
      "hard-techno",
      "amapiano",
      "speedbass",
      "tearout-dubstep",
      "peak-time-techno"
    ]
  }
];
