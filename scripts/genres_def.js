// Genre metadata catalogue
export const GENRE_CATALOGUE = [
  // 1. HOUSE (15)
  {
    id: "chicago-house",
    name: "Chicago House",
    aliases: ["芝加哥浩室", "Warehouse House"],
    category: "Electronic",
    parents: ["Disco", "Hi-NRG", "Garage"],
    subgenres: ["Deep House", "Acid House", "Ghetto House"],
    related: ["Detroit Techno", "UK Garage"],
    year: "1984",
    decade: 1980,
    place: { en: "Chicago, Illinois, USA", zh: "美国伊利诺伊州芝加哥" },
    bpm: "120–128 BPM",
    defaultBpm: 124,
    timeSig: "4/4",
    rhythmStyle: "four_on_floor",
    artists: ["Frankie Knuckles", "Ron Hardy", "Marshall Jefferson", "Larry Heard", "Chip E."],
    tracks: [
      { title: "Your Love", artist: "Frankie Knuckles", year: 1987 },
      { title: "Move Your Body (The House Music Anthem)", artist: "Marshall Jefferson", year: 1986 },
      { title: "Can You Feel It", artist: "Larry Heard (Mr. Fingers)", year: 1986 },
      { title: "Time to Jack", artist: "Chip E.", year: 1985 },
      { title: "Baby Wants to Ride", artist: "Frankie Knuckles & Jamie Principle", year: 1987 }
    ],
    sources: ["The Warehouse Chicago Archives", "Sound on Sound: The History of House", "Ishkur's Guide to Electronic Music"],
    radar: { groove: 9, brightness: 6, harmonicComplexity: 6, rhythmDensity: 7, bassEnergy: 8, melodicFocus: 7 },
    context: {
      en: "Originating in Chicago's underground club The Warehouse in the early 1980s by DJ pioneers like Frankie Knuckles and Ron Hardy. It evolved from disco edits played on Roland drum machines and synthesizers, creating a hypnotic, communal 4/4 dance ritual that revolutionized global club culture.",
      zh: "起源于1980年代初芝加哥地下俱乐部 The Warehouse，由 Frankie Knuckles 和 Ron Hardy 等先锋 DJ 创立。它脱胎于迪斯科混音，借助 Roland 鼓机（TR-909/808）和合成器创造出催眠而富有仪式感的四四拍舞曲律动，深刻改变了全球俱乐部文化。"
    },
    chords: ["i–VII–VI–VII", "i–v–VI–V", "i7–iv7–v7"],
    soundDesign: {
      en: "Warm Roland TR-909 open hats on the offbeats, punchy analog kicks, classic Korg M1 organ bass stabs or Roland Juno pads, with rich vinyl sampling textures.",
      zh: "经典的 Roland TR-909 反拍（Offbeat）开镲、厚重结实的模拟底鼓，标志性的 Korg M1 风琴贝斯 Stab 切片或 Roland Juno 模拟柔和铺底，带有温暖的黑胶黑噪采样质感。"
    },
    rhythmFeatures: {
      en: "Solid four-on-the-floor kick pulse with syncopated 16th swing claps and infectious offbeat open hi-hats. Known for the signature 'Jack' swing bounce.",
      zh: "坚实有力的四踩四（Four-on-the-floor）底鼓脉冲，结合带摇摆（Swing）的十六分音符军鼓/拍手切分，以及极具感染力的反拍开镲，构成了标志性的 'Jack' 身体律动感。"
    },
    bassPattern: {
      en: "Syncopated acoustic or organ synth basslines playing octave jumps and walking grooves, tightly locked to the kick.",
      zh: "切分感强烈的风琴合成器贝斯或模拟低音，频繁使用八度跳跃与行进（Walking）低音线条，与底鼓紧密贴合（Lock-in）。"
    },
    productionTips: {
      en: [
        "Use a Roland TR-909 kick tuned between 50-60 Hz and layer with an open hat strictly on the upbeats (& of 1, 2, 3, 4).",
        "Apply 16th-note swing between 54% and 58% to get the authentic Chicago 'Jack' bounce.",
        "Use classic Korg M1 or Yamaha DX7 electric organ presets for staccato chord stabs."
      ],
      zh: [
        "使用调校在 50-60 Hz 的 Roland TR-909 底鼓，并在反拍（1、2、3、4 的后半拍）叠加强劲的开镲（Open Hi-hat）。",
        "将十六分音符摇摆（Swing）参数调整在 54% 到 58% 之间，获得原汁原味的芝加哥 'Jack' 弹性律动。",
        "使用经典 Korg M1 或 Yamaha DX7 的电子风琴音色制作断奏和弦切片（Chord Stabs）。"
      ]
    }
  },

  {
    id: "deep-house",
    name: "Deep House",
    aliases: ["深邃浩室", "深层浩室"],
    category: "Electronic",
    parents: ["Chicago House", "Soul", "Jazz"],
    subgenres: ["Lofi House", "Melodic House", "Microhouse"],
    related: ["Tech House", "Afro House"],
    year: "1985",
    decade: 1980,
    place: { en: "Chicago & New York, USA", zh: "美国芝加哥与纽约" },
    bpm: "120–125 BPM",
    defaultBpm: 122,
    timeSig: "4/4",
    rhythmStyle: "four_on_floor",
    artists: ["Larry Heard", "Kerri Chandler", "Theo Parrish", "Moodymann", "Maya Jane Coles"],
    tracks: [
      { title: "Mystery of Love", artist: "Mr. Fingers", year: 1986 },
      { title: "Atmosphere", artist: "Kerri Chandler", year: 1993 },
      { title: "Footwork", artist: "Theo Parrish", year: 1998 },
      { title: "Dem Young Sconies", artist: "Moodymann", year: 1997 },
      { title: "What They Say", artist: "Maya Jane Coles", year: 2010 }
    ],
    sources: ["Resident Advisor Deep House History", "Attack Magazine: Beat Dissected Deep House", "Sound on Sound"],
    radar: { groove: 9, brightness: 4, harmonicComplexity: 9, rhythmDensity: 6, bassEnergy: 8, melodicFocus: 8 },
    context: {
      en: "Pioneered by Larry Heard and Marshall Jefferson in the mid-1980s, Deep House infused Chicago house with sophisticated jazz chords, soulful vocals, and warm ambient chords, focusing on emotional depth rather than peak-time aggression.",
      zh: "由 Larry Heard 与 Marshall Jefferson 于1980年代中期奠定，Deep House 将复杂的爵士扩展和弦、深情的灵魂乐人声与温暖的环境音铺底注入浩室脉搏，强调内敛深沉的情感与冥想听感，而非尖锐刺耳的炸场能量。"
    },
    chords: ["i9–iv9–v7", "ii9–V13–Imaj7", "i7–VImaj7–iv7"],
    soundDesign: {
      en: "Fender Rhodes electric piano, lush analog low-pass filtered chord pads, warm round sub-bass from sine or triangle waves, and subdued shaker loops.",
      zh: "Fender Rhodes 电钢琴、经过温暖低通滤波（Low-pass Filter）的模拟和弦铺底、纯净圆润的正弦波或三角波 Sub-bass，以及细腻低调的沙锤（Shaker）循环。"
    },
    rhythmFeatures: {
      en: "Laid-back, slightly behind-the-beat 4/4 groove. Soft pillowy kick drum, filtered wooden percussions, and soft closed hats with gentle dynamics.",
      zh: "从容放松、微带后倾（Behind the beat）的四四拍律动。松软而富有弹性的软踢底鼓、经过滤波的木质打击乐，以及带有细腻力度层次的暗色闭镲。"
    },
    bassPattern: {
      en: "Deep, melodic sine sub-bass lines that weave harmonically under the jazz chord changes, with smooth release envelopes.",
      zh: "深沉悠扬的纯正低频正弦波低音线条，在爵士和弦变换下方游走穿梭，具有平滑优雅的包络释放（Release）。"
    },
    productionTips: {
      en: [
        "Stack minor 9th and major 7th chords and filter cutoff down to around 800Hz with subtle resonance.",
        "Layer subtle vinyl crackle or tape hiss to provide warm background analog glue.",
        "Keep the kick drum punchy but attenuate frequencies above 3kHz to maintain the warm aesthetic."
      ],
      zh: [
        "堆叠小九（m9）与大七（maj7）和弦，并将低通滤波截止频率（Cutoff）压在 800Hz 左右，配合微弱的谐振峰（Resonance）。",
        "叠加微弱的黑胶爆豆声或磁带底噪（Tape Hiss），赋予整体混音温暖的模拟胶水质感。",
        "底鼓保持扎实饱满，但适当衰减 3kHz 以上的高频，营造暗调温润的氛围。"
      ]
    }
  },

  {
    id: "tech-house",
    name: "Tech House",
    aliases: ["科技浩室"],
    category: "Electronic",
    parents: ["Chicago House", "Techno", "Minimal Techno"],
    subgenres: ["Minimal Tech", "Latin Tech House", "Bass Tech"],
    related: ["Deep House", "Detroit Techno"],
    year: "1994",
    decade: 1990,
    place: { en: "London, UK & Ibiza, Spain", zh: "英国伦敦与西班牙伊比萨" },
    bpm: "124–128 BPM",
    defaultBpm: 126,
    timeSig: "4/4",
    rhythmStyle: "four_on_floor",
    artists: ["Fisher", "Jamie Jones", "Michael Bibi", "Green Velvet", "Solardo"],
    tracks: [
      { title: "Losing It", artist: "Fisher", year: 2018 },
      { title: "Got The Fire", artist: "Michael Bibi", year: 2019 },
      { title: "Bigger Than Prince", artist: "Green Velvet", year: 2013 },
      { title: "Hungry for the Power", artist: "Jamie Jones", year: 2011 },
      { title: "Tribesmen", artist: "Solardo", year: 2016 }
    ],
    sources: ["Attack Magazine Tech House Guide", "DJ Mag Tech House Evolution", "Sound on Sound"],
    radar: { groove: 9, brightness: 7, harmonicComplexity: 4, rhythmDensity: 8, bassEnergy: 9, melodicFocus: 4 },
    context: {
      en: "Born in London clubs like The End in the mid-1990s, Tech House fuses the rugged sonic purity and hypnotic drive of techno with the funky swing and soul-stirring basslines of house.",
      zh: "诞生于1990年代中期的英国伦敦俱乐部（如 The End），Tech House 完美融合了 Techno 机械硬朗的催眠驱动力与 House 的放克摇摆及灵魂贝斯线条，成为伊比萨与现代音乐节最火爆的风格之一。"
    },
    chords: ["i–i", "i–bVII", "One chord drone (Modal ostinato)"],
    soundDesign: {
      en: "Punchy short transient kicks, resonant FM rolling bass, metallic rimshots, pitched vocal one-shots, and short white-noise risers.",
      zh: "短促有力的瞬态底鼓、饱满滚动的 FM 合成贝斯低音、金属质感的边击（Rimshot）、经过调音的人声切片以及短促利落的白噪声升效（Noise Risers）。"
    },
    rhythmFeatures: {
      en: "Relentless rolling percussion groove with syncopated 16th hats, ghost snares, and heavily sidechained low-end rumble.",
      zh: "连续不断的滚动打击乐律动，配合切分的十六分音符踩镲、幽灵军鼓（Ghost Snares）以及紧贴底鼓侧链的低频轰鸣（Low-end Rumble）。"
    },
    bassPattern: {
      en: "Rolling 16th-note sub bass or syncopated offbeat bouncy FM pluck bass playing staccato notes.",
      zh: "滚动的十六分音符 Sub 低音或带有弹性跳跃感的反拍 FM 拨弦贝斯，采用短促利落的断奏音符。"
    },
    productionTips: {
      en: [
        "Create a rolling low-end by adding a 16th-note bassline sidechained tightly to the kick with fast attack and release.",
        "Add short delay (1/16 or 1/32) and slapback reverb to percussive clicks and claps for groove width.",
        "Keep harmonic elements minimal to let the rhythm and bassline breathe and dominate the mix."
      ],
      zh: [
        "通过编写紧随底鼓滚动的十六分音符低音线条，并配合极快起音释放的侧链压缩，打造坚如磐石的低频地基。",
        "为打击乐音效加入短时双耳延迟（1/16或1/32拍）与拍击混响，拉开打击乐声场宽度。",
        "保持和声元素高度极简，为强劲的律动与贝斯线腾出充足动态空间。"
      ]
    }
  },

  {
    id: "future-house",
    name: "Future House",
    aliases: ["未来浩室"],
    category: "Electronic",
    parents: ["Deep House", "Electro House", "UK Garage"],
    subgenres: ["Future Bounce"],
    related: ["Bass House", "Future Bass"],
    year: "2013",
    decade: 2010,
    place: { en: "Netherlands & UK", zh: "荷兰与英国" },
    bpm: "125–128 BPM",
    defaultBpm: 126,
    timeSig: "4/4",
    rhythmStyle: "four_on_floor",
    artists: ["Oliver Heldens", "Don Diablo", "Tchami", "Brooks", "Mesto"],
    tracks: [
      { title: "Gecko", artist: "Oliver Heldens", year: 2013 },
      { title: "Promesses", artist: "Tchami", year: 2013 },
      { title: "AnyTime", artist: "Don Diablo", year: 2014 },
      { title: "Byte", artist: "Martin Garrix & Brooks", year: 2017 },
      { title: "Koala", artist: "Oliver Heldens", year: 2014 }
    ],
    sources: ["Spinnin' Records Archive", "Sound on Sound: Modern EDM Production", "Attack Magazine"],
    radar: { groove: 8, brightness: 8, harmonicComplexity: 6, rhythmDensity: 7, bassEnergy: 9, melodicFocus: 8 },
    context: {
      en: "Coined by French producer Tchami and popularized globally by Oliver Heldens in 2013-2014. It combines the metallic, punchy FM basslines of UK Garage with the energetic arrangement and festival drops of modern European EDM.",
      zh: "由法国制作人 Tchami 命名并由 Oliver Heldens 于 2013-2014 年风靡全球。它结合了 UK Garage 标志性的金属质感 FM 贝斯线条与现代欧洲 EDM 的高能曲式与音乐节 Drop。"
    },
    chords: ["i–VI–III–VII", "i–iv–VI–V"],
    soundDesign: {
      en: "Distinctive metallic FM bass stabs made with frequency modulation (operator 2 modulating operator 1 with envelope), crisp claps, and bright vocal chops.",
      zh: "极具辨识度的金属质感 FM 合成贝斯切片（通常使用 FM 合成器通过包络调制频率），极其清脆的高频拍手，以及经过高通滤波的人声切片。"
    },
    rhythmFeatures: {
      en: "Snappy, bouncy 4/4 rhythm with crisp claps on 2 and 4, sharp open hats on the upbeats, and driving percussion rolls.",
      zh: "弹性十足的 4/4 拍律动，2、4 拍上带有清脆强劲的叠层拍手，反拍上是锋利的踩镲，搭配充满推进力的打击乐加花。"
    },
    bassPattern: {
      en: "Melodic FM pluck bass playing syncopated hooks across 2 octaves, serving as both rhythm and lead melody.",
      zh: "兼任旋律 Lead 与节奏骨架的跨双八度切分拨弦 FM 贝斯，跳跃感极强。"
    },
    productionTips: {
      en: [
        "In FM synthesis, use a 1:2 ratio with an envelope modulating operator volume with zero attack and 200ms decay.",
        "Layer a clean sub sine wave beneath the FM pluck to guarantee low-end impact below 80Hz.",
        "Use OTT multiband compression on the bass stab for signature crisp EDM high-end presence."
      ],
      zh: [
        "在 FM 合成中，使用 1:2 频率比，调制包络设为 0 起音和约 200ms 衰减以获得标志性金属弹簧音色。",
        "在 FM 贝斯下方必须单独叠一层纯正的超低正弦波（Sub 80Hz 以下），确保低频冲击力稳定。",
        "在贝斯切片上加载 OTT 多频段压缩，获取清脆透亮的现代 EDM 高频质感。"
      ]
    }
  },

  {
    id: "progressive-house",
    name: "Progressive House",
    aliases: ["渐进浩室", "前卫浩室"],
    category: "Electronic",
    parents: ["Chicago House", "Trance", "Eurodance"],
    subgenres: ["Festival Progressive", "Dark Progressive"],
    related: ["Uplifting Trance", "Electro House"],
    year: "1990",
    decade: 1990,
    place: { en: "United Kingdom & Sweden", zh: "英国与瑞典" },
    bpm: "126–130 BPM",
    defaultBpm: 128,
    timeSig: "4/4",
    rhythmStyle: "four_on_floor",
    artists: ["Avicii", "Swedish House Mafia", "Deadmau5", "Eric Prydz", "Alesso"],
    tracks: [
      { title: "Levels", artist: "Avicii", year: 2011 },
      { title: "Strobe", artist: "Deadmau5", year: 2009 },
      { title: "Don't You Worry Child", artist: "Swedish House Mafia", year: 2012 },
      { title: "Opus", artist: "Eric Prydz", year: 2015 },
      { title: "Calling (Lose My Mind)", artist: "Sebastian Ingrosso & Alesso", year: 2012 }
    ],
    sources: ["Mixmag Progressive History", "Sound on Sound: Festival Anthems", "EDM Identity"],
    radar: { groove: 8, brightness: 9, harmonicComplexity: 8, rhythmDensity: 7, bassEnergy: 9, melodicFocus: 10 },
    context: {
      en: "Evolving from the UK club scene in the early 1990s and later reaching peak festival culture via Swedish and Dutch producers. Known for long emotional build-ups, soaring anthemic melodies, lush chord progressions, and grand cathartic drops.",
      zh: "发端于1990年代初英国俱乐部场景，随后在瑞典与荷兰制作人手中走向世界顶级音乐节舞台。以漫长递进的情感铺垫、辽阔恢弘的和弦走向、激荡人心的主音旋律与排山倒海的释放（Drop）著称。"
    },
    chords: ["vi–IV–I–V", "I–V–vi–IV", "vi–V–IV–V"],
    soundDesign: {
      en: "Multi-layered Supersaw leads with stereo detune, massive white noise sweeps, sidechained lush pads, and acoustic piano lead layers.",
      zh: "多层立体声去谐（Detune）的大合唱 Supersaw 主音、震撼的白噪声扫频转场、经过深度侧链泵动的弦乐铺底，以及高频明亮的真钢琴层。"
    },
    rhythmFeatures: {
      en: "Big room punchy kick drum, heavy clap on 2 and 4, rising snare rolls in the build-up with 1/4 to 1/8 to 1/16 to 1/32 subdivisions.",
      zh: "极具冲击力的音乐节大底鼓，2、4 拍重击拍手，在 Build-up 阶段带有从 1/4 到 1/8、1/16 再到 1/32 极速密集的递进军鼓滚奏。"
    },
    bassPattern: {
      en: "Offbeat rolling bass or driving saw bass following the root notes of the chord progression, ducked under the kick drum.",
      zh: "紧跟和弦根音进行的强劲反拍锯齿波贝斯或滚动低音，在底鼓敲击瞬间被深度压制避让。"
    },
    productionTips: {
      en: [
        "Layer at least 3-4 synth presets for the main lead: high saw, mid pluck, stereo detuned supersaw, and mono punch transient.",
        "Automate filter cutoff gradually over 16 to 32 bars to create an epic build-up sensation.",
        "Glue the master mix with gentle bus compression and a high-shelf EQ boost around 10kHz for commercial sparkle."
      ],
      zh: [
        "为主音旋律叠加至少 3-4 层不同特性的音色：高频明亮锯齿波、中频弹拨 Pluck、宽声场去谐 Supersaw 以及中置单声道瞬态层。",
        "对主和弦的滤波截止频率在 16 至 32 小节内进行平滑自动化提升，制造史诗级的能量汇聚感。",
        "使用总线压缩和 10kHz 以上的高架均衡（High-shelf EQ）提亮，打造商业发行的空气感与光泽。"
      ]
    }
  }
];

console.log(`Configured sample genres metadata: ${GENRE_CATALOGUE.length}`);
