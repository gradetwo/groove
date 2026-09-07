# coding: utf-8
# 93 Electronic genres with rich production metadata

ELECTRONIC_GENRES = [
  # --- HOUSE (15) ---
  {
    "id": "chicago-house", "name": "Chicago House", "aliases": ["芝加哥浩室", "Warehouse House"],
    "category": "Electronic", "parents": ["Disco", "Hi-NRG"], "subgenres": ["Deep House", "Acid House", "Ghetto House"],
    "related": ["Detroit Techno", "UK Garage"], "year": "1984", "decade": 1980,
    "place": {"en": "Chicago, Illinois, USA", "zh": "美国伊利诺伊州芝加哥"},
    "bpm": "120–128 BPM", "defaultBpm": 124, "style": "four_on_floor",
    "artists": ["Frankie Knuckles", "Ron Hardy", "Marshall Jefferson", "Larry Heard", "Chip E."],
    "tracks": [
      {"title": "Your Love", "artist": "Frankie Knuckles", "year": 1987},
      {"title": "Move Your Body (House Anthem)", "artist": "Marshall Jefferson", "year": 1986},
      {"title": "Can You Feel It", "artist": "Larry Heard", "year": 1986},
      {"title": "Time to Jack", "artist": "Chip E.", "year": 1985},
      {"title": "Baby Wants to Ride", "artist": "Frankie Knuckles", "year": 1987}
    ],
    "context": {
      "en": "Born at Chicago club The Warehouse in the early 1980s by DJ Frankie Knuckles. It transformed disco edits into hypnotic 4/4 electronic drum machine workouts that sparked modern club culture worldwide.",
      "zh": "1980年代初诞生于芝加哥 The Warehouse 俱乐部，由 DJ Frankie Knuckles 等人开创。将迪斯科编辑转化为催眠的 4/4 电子鼓机律动，开创了现代全球俱乐部文化。"
    },
    "soundDesign": {"en": "Roland TR-909 open hats on offbeats, punchy analog kicks, Korg M1 organ bass stabs, warm vinyl grit.", "zh": "Roland TR-909 反拍开镲、厚重模拟底鼓、Korg M1 风琴贝斯切片与温暖黑胶质感。"},
    "rhythmFeatures": {"en": "Four-on-the-floor kick, offbeat open hats, 16th swing claps with signature Jack bounce.", "zh": "四四拍底鼓、反拍开镲、带十六分音符摇摆的拍手与标志性 Jack 律动。"},
    "bassPattern": {"en": "Syncopated organ or analog basslines playing octave jumps and walking figures locked to kick.", "zh": "切分感强烈的风琴或模拟低音，频繁使用八度跳跃与行进线条，与底鼓紧密贴合。"},
    "productionTips": {
      "en": ["Tune TR-909 kick to 55 Hz and place open hats strictly on upbeats.", "Apply 54%-58% 16th swing for authentic Chicago bounce.", "Use Korg M1 organ presets for short staccato chord stabs."],
      "zh": ["将 TR-909 底鼓调至 55Hz，并在反拍放置清脆开镲。", "施加 54%-58% 的十六分音符摇摆获得芝加哥弹性律动。", "使用 Korg M1 风琴预设制作短促切分和弦切片。"]
    },
    "radar": {"groove": 9, "brightness": 6, "harmonicComplexity": 6, "rhythmDensity": 7, "bassEnergy": 8, "melodicFocus": 7}
  },
  {
    "id": "deep-house", "name": "Deep House", "aliases": ["深邃浩室", "深层浩室"],
    "category": "Electronic", "parents": ["Chicago House", "Soul", "Jazz"], "subgenres": ["Lofi House", "Melodic House"],
    "related": ["Tech House", "Afro House"], "year": "1985", "decade": 1980,
    "place": {"en": "Chicago & New York, USA", "zh": "美国芝加哥与纽约"},
    "bpm": "120–125 BPM", "defaultBpm: 122", "defaultBpm": 122, "style": "four_on_floor",
    "artists": ["Larry Heard", "Kerri Chandler", "Theo Parrish", "Moodymann", "Maya Jane Coles"],
    "tracks": [
      {"title": "Mystery of Love", "artist": "Mr. Fingers", "year": 1986},
      {"title": "Atmosphere", "artist": "Kerri Chandler", "year": 1993},
      {"title": "Footwork", "artist": "Theo Parrish", "year": 1998},
      {"title": "Dem Young Sconies", "artist": "Moodymann", "year": 1997},
      {"title": "What They Say", "artist": "Maya Jane Coles", "year": 2010}
    ],
    "context": {
      "en": "Infuses house with sophisticated jazz chords, soulful Rhodes chords, and ambient depth, prioritizing spiritual warmth over peak-time aggression.",
      "zh": "将复杂的爵士扩展和弦、深情的 Rhodes 电钢琴与氛围深度注入浩室，强调内敛温润的心灵对话而非炸场侵略感。"
    },
    "soundDesign": {"en": "Fender Rhodes electric piano, low-pass filtered chord pads, warm round sine sub-bass.", "zh": "Fender Rhodes 电钢琴、经过低通滤波的温暖铺底、圆润温和的正弦波 Sub 贝斯。"},
    "rhythmFeatures": {"en": "Laid-back, slightly behind-the-beat 4/4 groove with pillowy kick and organic wooden shakers.", "zh": "从容放松、微带后倾的四四拍律动，搭配松软底鼓与有机木质沙锤。"},
    "bassPattern": {"en": "Smooth melodic sine sub lines weaving under minor 9th jazz chord changes.", "zh": "深沉悠扬的正弦波低音线条，在小九度爵士和弦变换下方游走穿梭。"},
    "productionTips": {
      "en": ["Stack minor 9th chords and filter cutoff down to 800Hz.", "Layer subtle tape hiss or vinyl crackle for analog glue.", "Attenuate kick frequencies above 3kHz for a rounded tone."],
      "zh": ["堆叠小九（m9）和弦并将低通滤波截止频率压在 800Hz 左右。", "叠加微弱黑胶爆豆声或磁带底噪赋予模拟胶水质感。", "衰减底鼓 3kHz 以上的高频，营造温润暗调。"]
    },
    "radar": {"groove": 9, "brightness": 4, "harmonicComplexity": 9, "rhythmDensity": 6, "bassEnergy": 8, "melodicFocus": 8}
  },
  {
    "id": "tech-house", "name": "Tech House", "aliases": ["科技浩室"],
    "category": "Electronic", "parents": ["Chicago House", "Techno"], "subgenres": ["Minimal Tech", "Latin Tech"],
    "related": ["Detroit Techno", "Deep House"], "year": "1994", "decade": 1990,
    "place": {"en": "London, UK & Ibiza, Spain", "zh": "英国伦敦与西班牙伊比萨"},
    "bpm": "124–128 BPM", "defaultBpm": 126, "style": "four_on_floor",
    "artists": ["Fisher", "Jamie Jones", "Michael Bibi", "Green Velvet", "Solardo"],
    "tracks": [
      {"title": "Losing It", "artist": "Fisher", "year": 2018},
      {"title": "Got The Fire", "artist": "Michael Bibi", "year": 2019},
      {"title": "Bigger Than Prince", "artist": "Green Velvet", "year": 2013},
      {"title": "Hungry for the Power", "artist": "Jamie Jones", "year": 2011},
      {"title": "Tribesmen", "artist": "Solardo", "year": 2016}
    ],
    "context": {
      "en": "Fuses the hypnotic drive and raw sonic purity of techno with the funky swing and bouncing low-end of house.",
      "zh": "融合了 Techno 机械催眠的纯粹驱动力与 House 的放克摇摆及弹性低频。"
    },
    "soundDesign": {"en": "Punchy short kicks, resonant FM rolling bass, metallic rimshots, and pitched vocal chops.", "zh": "短促有力的瞬态底鼓、滚动的 FM 合成贝斯、金属边击与调音人声切片。"},
    "rhythmFeatures": {"en": "Relentless rolling percussion groove with syncopated 16th hats, ghost snares, and sidechained rumble.", "zh": "连续不断的滚动打击乐律动，切分十六分音符踩镲与幽灵军鼓。"},
    "bassPattern": {"en": "Rolling 16th-note sub bass or syncopated offbeat bouncy FM pluck bass.", "zh": "滚动的十六分音符 Sub 低音或富有弹性跳跃感的反拍 FM 拨弦贝斯。"},
    "productionTips": {
      "en": ["Write a 16th-note rolling bassline sidechained tightly to the kick.", "Add short 1/16 delay to percussive clicks for stereo width.", "Keep harmonic elements sparse so the bassline dominates."],
      "zh": ["编写紧贴底鼓侧链的十六分音符滚动低音线条。", "为打击乐音效加入短时 1/16 延迟拉开声场宽度。", "保持和声元素精简，让贝斯线条主导混音。"]
    },
    "radar": {"groove": 9, "brightness": 7, "harmonicComplexity: 4", "rhythmDensity": 8, "bassEnergy": 9, "melodicFocus": 4, "harmonicComplexity": 4}
  },
  {
    "id": "future-house", "name": "Future House", "aliases": ["未来浩室"],
    "category": "Electronic", "parents": ["Deep House", "Electro House", "UK Garage"], "subgenres": ["Future Bounce"],
    "related": ["Bass House", "Future Bass"], "year": "2013", "decade": 2010,
    "place": {"en": "Netherlands & UK", "zh": "荷兰与英国"},
    "bpm": "125–128 BPM", "defaultBpm": 126, "style": "four_on_floor",
    "artists": ["Oliver Heldens", "Don Diablo", "Tchami", "Brooks", "Mesto"],
    "tracks": [
      {"title": "Gecko", "artist": "Oliver Heldens", "year": 2013},
      {"title": "Promesses", "artist": "Tchami", "year": 2013},
      {"title": "AnyTime", "artist": "Don Diablo", "year": 2014},
      {"title": "Byte", "artist": "Martin Garrix & Brooks", "year": 2017},
      {"title": "Koala", "artist": "Oliver Heldens", "year": 2014}
    ],
    "context": {
      "en": "Pioneered by Tchami and Oliver Heldens, pairing UK Garage metallic FM bass stabs with modern EDM festival arrangements.",
      "zh": "由 Tchami 和 Oliver Heldens 等人开创，将 UK Garage 金属质感 FM 贝斯与现代 EDM 音乐节曲式融合。"
    },
    "soundDesign": {"en": "Metallic FM bass stabs, crisp high-end claps, and high-pass filtered vocal chops.", "zh": "金属质感 FM 合成贝斯切片、清脆高频拍手与高通滤波人声切片。"},
    "rhythmFeatures": {"en": "Bouncy 4/4 rhythm with crisp claps on 2 and 4, sharp open hats on upbeats.", "zh": "弹性十足的 4/4 拍律动，2、4 拍重击拍手，反拍搭配锋利开镲。"},
    "bassPattern": {"en": "Melodic FM pluck bass playing syncopated hooks across 2 octaves.", "zh": "兼任旋律与节奏骨架的跨双八度切分拨弦 FM 贝斯。"},
    "productionTips": {
      "en": ["Use 1:2 FM ratio with quick envelope decay for springy metallic sound.", "Layer a clean sub sine wave beneath the FM pluck.", "Use OTT multiband compression for crisp high-end punch."],
      "zh": ["在 FM 合成中使用 1:2 频率比与快速衰减包络打造弹簧金属感。", "在 FM 贝斯下方单独叠一层纯正超低正弦波。", "使用 OTT 多频段压缩获取清脆透亮的现代质感。"]
    },
    "radar": {"groove": 8, "brightness": 8, "harmonicComplexity": 6, "rhythmDensity": 7, "bassEnergy": 9, "melodicFocus": 8}
  },
  {
    "id": "progressive-house", "name": "Progressive House", "aliases": ["渐进浩室", "前卫浩室"],
    "category": "Electronic", "parents": ["Chicago House", "Trance"], "subgenres": ["Festival Progressive"],
    "related": ["Uplifting Trance", "Electro House"], "year": "1990", "decade": 1990,
    "place": {"en": "UK & Sweden", "zh": "英国与瑞典"},
    "bpm": "126–130 BPM", "defaultBpm": 128, "style": "four_on_floor",
    "artists": ["Avicii", "Swedish House Mafia", "Deadmau5", "Eric Prydz", "Alesso"],
    "tracks": [
      {"title": "Levels", "artist": "Avicii", "year": 2011},
      {"title": "Strobe", "artist": "Deadmau5", "year": 2009},
      {"title": "Don't You Worry Child", "artist": "Swedish House Mafia", "year": 2012},
      {"title": "Opus", "artist": "Eric Prydz", "year": 2015},
      {"title": "Calling (Lose My Mind)", "artist": "Alesso", "year": 2012}
    ],
    "context": {
      "en": "Famous for expansive build-ups, soaring anthemic melodies, lush chords, and cathartic festival drops.",
      "zh": "以漫长递进的情感铺垫、辽阔恢弘的和弦走向、激荡人心的主音旋律与排山倒海的释放著称。"
    },
    "soundDesign": {"en": "Multi-layered detuned supersaws, massive white-noise sweeps, sidechained lush pads.", "zh": "多层立体声去谐 Supersaw 主音、震撼白噪声扫频与深度侧链泵动的铺底。"},
    "rhythmFeatures": {"en": "Big room punchy kick, heavy clap on 2 and 4, rising snare rolls in builds.", "zh": "极具冲击力的大底鼓，2、4 拍重击拍手，在 Build-up 阶段带有极速密集的递进军鼓。"},
    "bassPattern": {"en": "Driving saw bass following root notes, heavily ducked under the kick.", "zh": "紧跟和弦根音进行的强劲反拍锯齿波贝斯，在底鼓敲击瞬间深度避让。"},
    "productionTips": {
      "en": ["Layer 3-4 synth presets for the lead: high saw, mid pluck, stereo supersaw.", "Automate filter cutoff gradually over 32 bars for epic tension.", "Glue mix with bus compression and high-shelf boost at 10kHz."],
      "zh": ["为主音旋律叠加 3-4 层音色：高频锯齿、中频 Pluck 与宽声场 Supersaw。", "对主和弦的滤波截止在 32 小节内平滑提升制造史诗汇聚感。", "使用总线压缩和 10kHz 高架均衡提亮，打造商业光泽。"]
    },
    "radar": {"groove": 8, "brightness": 9, "harmonicComplexity": 8, "rhythmDensity": 7, "bassEnergy": 9, "melodicFocus": 10}
  },
  {
    "id": "electro-house", "name": "Electro House", "aliases": ["电子浩室"],
    "category": "Electronic", "parents": ["Chicago House", "Electro"], "subgenres": ["Complextro"],
    "related": ["Big Room House", "Dubstep"], "year": "2002", "decade": 2000,
    "place": {"en": "Europe & USA", "zh": "欧洲与美国"},
    "bpm": "128–132 BPM", "defaultBpm": 128, "style": "four_on_floor",
    "artists": ["Benny Benassi", "Wolfgang Gartner", "Hardwell", "Fedde Le Grand", "Steve Aoki"],
    "tracks": [
      {"title": "Satisfaction", "artist": "Benny Benassi", "year": 2002},
      {"title": "Illmerica", "artist": "Wolfgang Gartner", "year": 2010},
      {"title": "Spaceman", "artist": "Hardwell", "year": 2012},
      {"title": "Put Your Hands Up 4 Detroit", "artist": "Fedde Le Grand", "year": 2006},
      {"title": "Boneless", "artist": "Steve Aoki", "year": 2013}
    ],
    "context": {
      "en": "Pioneered by Benny Benassi, known for abrasive buzzing saw basslines, heavy distortion, and aggressive sidechain ducking.",
      "zh": "由 Benny Benassi 等人开创，以侵略性蜂鸣电锯锯齿波贝斯、重度失真与夸张侧链闪避著称。"
    },
    "soundDesign": {"en": "Detuned saw waves with bitcrushing and distortion, vocoders, aggressive sub drops.", "zh": "经过降采样失真处理的去谐锯齿波、声码器机械人声和强烈的超低频下潜。"},
    "rhythmFeatures": {"en": "Heavy stomping 4/4 beat with sharp layered snares and punchy claps.", "zh": "重击般的四踩四底鼓律动，伴随锋利的双层叠军鼓和强劲拍手。"},
    "bassPattern": {"en": "Buzz-saw staccato riffs playing rapid syncopations right on the grid.", "zh": "电锯般撕裂的断奏低音 Riff，在节拍网格上进行极速切分轰击。"},
    "productionTips": {
      "en": ["Apply hard clipping distortion on saw bass for harsh harmonics.", "Use heavy sidechain compression to pull the synth wall back when kick hits.", "Invert phases of multiple synth layers to prevent cancellation."],
      "zh": ["在锯齿波贝斯上使用硬剪切失真获得穿透力强的高次谐波。", "施加激进的侧链闪避，使合成器音墙在底鼓敲击瞬间腾退。", "检查多层合成器的相位反转，避免低频抵消。"]
    },
    "radar": {"groove": 8, "brightness": 9, "harmonicComplexity": 5, "rhythmDensity": 8, "bassEnergy": 9, "melodicFocus": 7}
  },
  {
    "id": "bass-house", "name": "Bass House", "aliases": ["低音浩室"],
    "category": "Electronic", "parents": ["Future House", "UK Bass", "Dubstep"], "subgenres": [],
    "related": ["Tech House", "Speed Garage"], "year": "2014", "decade": 2010,
    "place": {"en": "UK & USA", "zh": "英国与美国"},
    "bpm": "126–128 BPM", "defaultBpm": 128, "style": "four_on_floor",
    "artists": ["Jauz", "Habstrakt", "JOYRYDE", "AC Slater", "Ephwurd"],
    "tracks": [
      {"title": "Feel the Volume", "artist": "Jauz", "year": 2014},
      {"title": "Vibrate", "artist": "Habstrakt", "year": 2015},
      {"title": "Hot Drum", "artist": "JOYRYDE", "year": 2016},
      {"title": "Duck Face", "artist": "Ephwurd", "year": 2015},
      {"title": "Bass Inside", "artist": "AC Slater", "year": 2016}
    ],
    "context": {
      "en": "Fuses 4/4 house groove with aggressive FM growls, wobbly basslines, and sheer low-end weight from dubstep and UK bass.",
      "zh": "融合了 4/4 浩室律动与 Dubstep 及英国低音（UK Bass）狂暴的 FM 嘶吼、摇摆低音和超重低频。"
    },
    "soundDesign": {"en": "Wavetable growls, aggressive FM screech plucks, metallic pitch-bends.", "zh": "受 LFO 调制的波表嘶吼低音、金属 FM 尖叫弹拨与快速音高滑音。"},
    "rhythmFeatures": {"en": "Tight punchy 4/4 kicks with chunky claps and snappy ghost percussion fills.", "zh": "紧凑扎实的 4/4 底鼓，搭配厚实的拍手与干脆利落的幽灵打击乐过门。"},
    "bassPattern": {"en": "Heavy syncopated wobbly bass shifting between mid-growl hooks and rumbling subs.", "zh": "重型切分摇摆贝斯，在中频咆哮旋律 Hook 与轰鸣超低频之间交织切换。"},
    "productionTips": {
      "en": ["Design bass in wavetables with comb filters and pitch envelopes.", "Split bass at 120Hz: distort mid/high band, keep sub in mono.", "Use pitch bends at note starts for bouncy punch."],
      "zh": ["在波表合成器中利用梳状滤波和音高包络为贝斯带来金属咬合感。", "在 120Hz 处分频处理：中高频加入失真拓宽，超低频严格单声道。", "在每个贝斯音符起始处加入微小滑音增加弹跳感。"]
    },
    "radar": {"groove": 8, "brightness": 8, "harmonicComplexity": 4, "rhythmDensity": 8, "bassEnergy": 10, "melodicFocus": 6}
  },
  {
    "id": "ghetto-house", "name": "Ghetto House", "aliases": ["贫民区浩室", "Booty House"],
    "category": "Electronic", "parents": ["Chicago House", "Miami Bass"], "subgenres": ["Footwork", "Juke"],
    "related": ["Ghettotech", "Electro"], "year": "1992", "decade": 1990,
    "place": {"en": "Chicago, Illinois, USA", "zh": "美国芝加哥"},
    "bpm": "125–135 BPM", "defaultBpm": 130, "style": "four_on_floor",
    "artists": ["DJ Deeon", "DJ Slugo", "DJ Funk", "Paul Johnson", "Houz' Mon"],
    "tracks": [
      {"title": "Freak Like Me", "artist": "DJ Deeon", "year": 1996},
      {"title": "Work That Motherfucker", "artist": "DJ Funk", "year": 1993},
      {"title": "Wouldn't You Like to Be a Hoe", "artist": "DJ Slugo", "year": 1994},
      {"title": "Feel My Motherfucking Bass", "artist": "DJ Deeon", "year": 1994},
      {"title": "Hear the Drummer Get Wicked", "artist": "Paul Johnson", "year": 1995}
    ],
    "context": {
      "en": "A raw Chicago offshoot stripping house down to fast 808/909 drum machine workouts with sexually explicit, repetitive vocal loops.",
      "zh": "芝加哥浩室的粗砺原始分支，将音乐精简为极速的 808/909 鼓机节奏与直白露骨的人声循环。"
    },
    "soundDesign": {"en": "Raw TR-808 cowbells and toms, unpolished tape distortion, short vocal sampler chops.", "zh": "未经修饰的 TR-808 牛铃与通鼓、磁带失真质感与短促人声切片。"},
    "rhythmFeatures": {"en": "Fast 4/4 kicks with syncopated 808 clap rolls and energetic polyrhythmic toms.", "zh": "快速奔跑的四踩四底鼓，穿插着切分 808 拍手滚奏与活力通鼓。"},
    "bassPattern": {"en": "Boom-heavy 808 sub kicks doubled with short analog bass stabs.", "zh": "极简的 808 超重轰鸣低频，与短促的模拟合成贝斯刺音双重叠加。"},
    "productionTips": {
      "en": ["Embrace raw drum programming with minimal EQ.", "Pitch up a vocal snippet and loop every 2 beats.", "Overdrive mixer input channel for authentic 90s cassette warmth."],
      "zh": ["保持粗犷未过度打磨的鼓机编写，少用过度雕琢的 EQ。", "截取口号词汇升高两个半音并每隔 2 拍循环一次形成洗脑 Hook。", "将调音台输入增益适度过载，获得 90 年代磁带质感。"]
    },
    "radar": {"groove": 9, "brightness": 5, "harmonicComplexity": 2, "rhythmDensity": 8, "bassEnergy": 9, "melodicFocus": 4}
  },
  {
    "id": "tropical-house", "name": "Tropical House", "aliases": ["热带浩室"],
    "category": "Electronic", "parents": ["Deep House", "Balearic Beat"], "subgenres": [],
    "related": ["Melodic House", "Moombahton"], "year": "2013", "decade": 2010,
    "place": {"en": "Norway & Australia", "zh": "挪威与澳大利亚"},
    "bpm": "100–115 BPM", "defaultBpm": 108, "style": "four_on_floor",
    "artists": ["Kygo", "Thomas Jack", "Matoma", "Sam Feldt", "Robin Schulz"],
    "tracks": [
      {"title": "Firestone", "artist": "Kygo", "year": 2014},
      {"title": "Rivers", "artist": "Thomas Jack", "year": 2015},
      {"title": "Old Thing Back", "artist": "Matoma", "year": 2015},
      {"title": "Show Me Love", "artist": "Sam Feldt", "year": 2015},
      {"title": "Stay", "artist": "Kygo", "year": 2015}
    ],
    "context": {
      "en": "Slowed house music down to breezy 100-115 BPM, evoking sun-drenched beaches with acoustic instruments and bright major melodies.",
      "zh": "将浩室节奏放慢至惬意的 100-115 BPM，融入原声乐器与明朗大调，勾勒阳光明媚的海滩度假听感。"
    },
    "soundDesign": {"en": "Wooden marimbas, pan flutes, bright acoustic guitar plucks, saxophones, airy reverb.", "zh": "木质马林巴琴、排箫、明亮原声吉他拨弦、萨克斯与空灵混响空间。"},
    "rhythmFeatures": {"en": "Relaxed bounce-oriented 4/4 kick with gentle claps, bongos, and crisp shakers.", "zh": "舒缓兼具弹跳感的 4/4 底鼓，柔和拍手、邦戈鼓与清脆沙锤循环。"},
    "bassPattern": {"en": "Warm bouncy upright bass or soft round sub complementing the melody.", "zh": "温暖有弹性的原声贝斯或圆润 Sub 低音，轻柔支撑着主旋律线条。"},
    "productionTips": {
      "en": ["Layer physical-modeling marimba with plucked synth.", "Keep tempo below 115 BPM to let percussion breathe.", "Use lush hall reverbs with 30-40ms pre-delay."],
      "zh": ["将物理建模马林巴琴与合成拨弦叠层增添木质打击敲击质感。", "速度控制在 115 BPM 以下让打击乐自然舒展。", "在主奏原声乐器上使用预延时 30-40ms 的大厅混响。"]
    },
    "radar": {"groove": 8, "brightness": 9, "harmonicComplexity": 6, "rhythmDensity": 6, "bassEnergy": 6, "melodicFocus": 9}
  },
  {
    "id": "acid-house", "name": "Acid House", "aliases": ["迷幻浩室", "酸性浩室"],
    "category": "Electronic", "parents": ["Chicago House"], "subgenres": ["Acid Techno", "Acid Trance"],
    "related": ["Detroit Techno", "New Beat"], "year": "1985", "decade": 1980,
    "place": {"en": "Chicago, Illinois, USA", "zh": "美国芝加哥"},
    "bpm": "120–130 BPM", "defaultBpm": 125, "style": "four_on_floor",
    "artists": ["Phuture", "DJ Pierre", "Sleezy D", "808 State", "Adonis"],
    "tracks": [
      {"title": "Acid Tracks", "artist": "Phuture", "year": 1987},
      {"title": "I've Lost Control", "artist": "Sleezy D", "year": 1986},
      {"title": "Flow Coma", "artist": "808 State", "year": 1988},
      {"title": "No Way Back", "artist": "Adonis", "year": 1986},
      {"title": "Box Energy", "artist": "DJ Pierre", "year": 1988}
    ],
    "context": {
      "en": "Invented by Phuture in Chicago in 1985 on the Roland TB-303. Squelchy resonant sweeps sparked the UK Second Summer of Love in 1988.",
      "zh": "由芝加哥组合 Phuture 于 1985 年在 Roland TB-303 上偶然创立。尖锐酸楚的共鸣滤波扫频催生了 1988 年英国“第二爱之夏”。"
    },
    "soundDesign": {"en": "Roland TB-303 with high resonance, modulated cutoff, accented steps, and tape saturation.", "zh": "调高谐振峰的 Roland TB-303 贝斯合成器，搭配手拧滤波截止与磁带饱和。"},
    "rhythmFeatures": {"en": "TR-707 or 909 4/4 drums with snapping snares, rimshots, and driving rides.", "zh": "Roland TR-707/909 四四拍鼓机节奏，脆响军鼓、边击和激进 Ride 镲。"},
    "bassPattern": {"en": "Hypnotic 16-step 303 sequence full of slide and accent commands.", "zh": "催眠魔性的 16 步 303 音序，充满连音滑音（Slide）与重音（Accent）。"},
    "productionTips": {
      "en": ["Program legato notes to trigger hardware slide portamento.", "Automate cutoff and resonance in real-time for live feel.", "Add distortion before delay to make squelch cut through."],
      "zh": ["将音序音符编写为连奏触发连音滑音。", "手拧实时自动化滤波截止与谐振峰赋予生命力。", "在延迟前串联轻微失真单块让酸性音色穿透混音。"]
    },
    "radar": {"groove": 8, "brightness": 8, "harmonicComplexity": 3, "rhythmDensity": 8, "bassEnergy": 9, "melodicFocus": 6}
  },
  {
    "id": "french-house", "name": "French House", "aliases": ["法国浩室", "French Touch"],
    "category": "Electronic", "parents": ["Chicago House", "Disco", "Funk"], "subgenres": [],
    "related": ["Nu-Disco", "Electro House"], "year": "1995", "decade": 1990,
    "place": {"en": "Paris, France", "zh": "法国巴黎"},
    "bpm": "120–128 BPM", "defaultBpm": 124, "style": "four_on_floor",
    "artists": ["Daft Punk", "Cassius", "Alan Braxe", "Fred Falke", "Stardust"],
    "tracks": [
      {"title": "Music Sounds Better With You", "artist": "Stardust", "year": 1998},
      {"title": "Around the World", "artist": "Daft Punk", "year": 1997},
      {"title": "1999", "artist": "Cassius", "year": 1999},
      {"title": "Intro", "artist": "Alan Braxe", "year": 2000},
      {"title": "One More Time", "artist": "Daft Punk", "year": 2000}
    ],
    "context": {
      "en": "Known globally as French Touch, taking 70s disco and funk vinyl samples, chopping them up, and soaking them in extreme sidechain pumping and phasers.",
      "zh: "享誉全球的“法式触感”，截取 70 年代放克迪斯科黑胶采样微粒，浸润在极度夸张的侧链抽吸压缩与移相器效果中。"
    },
    "soundDesign": {"en": "Heavy Alesis 3630 sidechain pumping, sweeping phasers, vinyl disco chops, slap bass.", "zh": "Alesis 3630 侧链抽吸泵感、大范围扫动移相器、复古黑胶切片与放克 Slap 电贝斯。"},
    "rhythmFeatures": {"en": "Uplifting 4/4 kick with disco hi-hat shuffles, handclaps, and tambourine rolls.", "zh": "充满欢愉能量的四四拍底鼓，迪斯科摇摆踩镲、拍手与摇铃滚奏。"},
    "bassPattern": {"en": "Funky walking slap electric bass or rounded Juno bass mirroring the disco riff.", "zh": "极富放克律动的行进 Slap 贝斯或圆润 Juno 低音，呼应采样的放克和弦。"},
    "productionTips": {
      "en": ["Sample 2-bar disco loop and slam into heavy sidechain compressor.", "Use vintage phaser with high feedback on the disco loop.", "Layer live slap bass directly underneath the sample."],
      "zh": ["截取迪斯科放克循环并挂载由底鼓触发的凶猛侧链压缩。", "在采样上施加慢速高反馈复古移相器营造法式光泽。", "在采样下方叠录一条 Slap 原声电贝斯补齐低频律动。"]
    },
    "radar": {"groove": 10, "brightness": 8, "harmonicComplexity": 7, "rhythmDensity": 7, "bassEnergy": 8, "melodicFocus": 9}
  },
  {
    "id": "melodic-house", "name": "Melodic House", "aliases": ["旋律浩室"],
    "category": "Electronic", "parents": ["Deep House", "Progressive House"], "subgenres": [],
    "related": ["Techno", "Ambient"], "year": "2016", "decade": 2010,
    "place": {"en": "Berlin, Germany & London, UK", "zh": "德国柏林与英国伦敦"},
    "bpm": "120–125 BPM", "defaultBpm": 123, "style": "four_on_floor",
    "artists": ["Ben Böhmer", "Lane 8", "Tale of Us", "Yotto", "Nora En Pure"],
    "tracks": [
      {"title": "Beyond Beliefs", "artist": "Ben Böhmer", "year": 2021},
      {"title": "Brightest Lights", "artist": "Lane 8", "year": 2019},
      {"title": "Nova", "artist": "Tale of Us", "year": 2018},
      {"title": "Hyperfall", "artist": "Yotto", "year": 2018},
      {"title": "Come With Me", "artist": "Nora En Pure", "year": 2013}
    ],
    "context": {
      "en": "Championed by labels like Anjunadeep, blending deep house grooves with emotive, cinematic synth arpeggios.",
      "zh": "由 Anjunadeep 等厂牌引领，将深邃四四拍律动与充满电影感的花阶合成琶音和小调和声深度结合。"
    },
    "soundDesign": {"en": "Intricate synth arpeggios, organic acoustic percussion, felt piano, tape delays.", "zh": "细腻调制的花阶合成琶音、有机原声打击乐、毛毡静音真钢琴与磁带模拟延迟。"},
    "rhythmFeatures": {"en": "Deep driving kick with organic shaker loops, subtle clicks, delicate offbeat hats.", "zh": "深沉推进的圆润底鼓，有机沙锤循环、细小质感打击击弦音与反拍踩镲。"},
    "bassPattern": {"en": "Warm rolling Reese or Moog saw bass filtered down with gentle LFO movement.", "zh": "温暖滚动的 Reese 贝斯或低通滤波 Moog 低音，带有柔和 LFO 呼吸感。"},
    "productionTips": {
      "en": ["Automate arpeggio decay and filter cutoff over 32 bars.", "Layer real acoustic percussion with synthetic drums for warmth.", "Use ping-pong delay with dotted-eighth setting."],
      "zh": ["对琶音衰减与滤波截止进行长达 32 小节的自动化推演。", "将原声打击乐与电子鼓组交叠注入有机温度。", "使用附点八分音符乒乓延迟配合磁带饱和构筑深远空间。"]
    },
    "radar": {"groove": 8, "brightness": 6, "harmonicComplexity": 9, "rhythmDensity": 7, "bassEnergy": 8, "melodicFocus": 10}
  },
  {
    "id": "afro-house", "name": "Afro House", "aliases": ["非裔浩室", "非洲浩室"],
    "category": "Electronic", "parents": ["Deep House", "Tribal House", "Kwaito"], "subgenres": ["Amapiano"],
    "related": ["Afrobeat", "Tech House"], "year": "2000", "decade": 2000,
    "place": {"en": "South Africa & Angola", "zh": "南非与安哥拉"},
    "bpm": "120–125 BPM", "defaultBpm": 122, "style": "four_on_floor",
    "artists": ["Black Coffee", "Culoe De Song", "Da Capo", "Shimza", "THEMBA"],
    "tracks": [
      {"title": "Drive", "artist": "Black Coffee", "year": 2018},
      {"title": "Webaba", "artist": "Culoe De Song", "year": 2009},
      {"title": "Kelvin's Groove", "artist": "Da Capo", "year": 2017},
      {"title": "We Dance Again", "artist": "Black Coffee", "year": 2015},
      {"title": "Eminence", "artist": "Shimza", "year": 2019}
    ],
    "context": {
      "en": "Combines hypnotic 4/4 deep house with traditional African percussion, complex polyrhythms, and spiritual vocal chants.",
      "zh": "将 Deep House 四四拍基调与非洲原住传统打击乐、丰富交错的复合节奏与灵性人声颂唱浑然熔铸。"
    },
    "soundDesign": {"en": "Organic djembes, congas, talking drums, warm Rhodes, and grounded sub-bass.", "zh": "原声非洲金贝鼓、康加鼓、会说话的鼓、温暖 Rhodes 和弦与沉稳超低频。"},
    "rhythmFeatures": {"en": "Polyrhythmic drum layering with triplets, syncopated rimshots, and 4/4 kick.", "zh": "复杂复合节奏鼓组叠置，三连音与十六分音符相互嵌套，切分边击与 4/4 底鼓呼应。"},
    "bassPattern": {"en": "Rolling syncopated low-end basslines weaving between traditional drum hits.", "zh": "滚动切分的低音线条，穿插游走于传统打击乐鼓点之间。"},
    "productionTips": {
      "en": ["Incorporate 3-against-4 polyrhythmic percussion loops against kick.", "Keep sub clean below 70Hz leaving low-mids open for congas.", "Use dynamic EQ on African drums to tame harsh resonance."],
      "zh": ["让三对四复合节奏打击乐循环与四踩四底鼓互相碰撞。", "让 70Hz 以下超低频纯净，为康加鼓腾出中低频区间。", "对原声打击乐采用动态均衡器吸收毛刺谐振。"]
    },
    "radar": {"groove": 10, "brightness": 6, "harmonicComplexity": 7, "rhythmDensity": 9, "bassEnergy": 8, "melodicFocus": 8}
  },
  {
    "id": "nu-disco-house", "name": "Nu-Disco House", "aliases": ["新迪斯科浩室", "Nu-Disco"],
    "category": "Electronic", "parents": ["Disco", "Chicago House", "Funk"], "subgenres": [],
    "related": ["French House", "Synth-pop"], "year": "2002", "decade": 2000,
    "place": {"en": "Norway, UK & France", "zh": "挪威、英国与法国"},
    "bpm": "118–124 BPM", "defaultBpm": 120, "style": "four_on_floor",
    "artists": ["Todd Terje", "Lindstrøm", "Purple Disco Machine", "Dimitri From Paris", "Yuksek"],
    "tracks": [
      {"title": "Inspector Norse", "artist": "Todd Terje", "year": 2012},
      {"title": "I Feel Space", "artist": "Lindstrøm", "year": 2005},
      {"title": "Hypnotized", "artist": "Purple Disco Machine", "year": 2020},
      {"title": "Devil in Me", "artist": "Purple Disco Machine", "year": 2017},
      {"title": "Tonight", "artist": "Yuksek", "year": 2018}
    ],
    "context": {
      "en": "21st-century revitalization of vintage 70s/80s disco with analog synths, live slap bass, and modern punch.",
      "zh": "21世纪对经典迪斯科的现代化复兴，融合复古模拟合成器、生动的现场放克贝斯与现代舞池清脆重击混音。"
    },
    "soundDesign": {"en": "Arp Odyssey and Juno arpeggios, slap bass guitar, clavinet chops, brass stabs.", "zh": "复古 Arp 与 Juno 合成琶音、Slap 电贝斯、电古钢琴切片与明亮铜管刺音。"},
    "rhythmFeatures": {"en": "Crisp 4/4 disco beat with offbeat open hats, acoustic snare + claps, cowbells.", "zh": "清脆四四拍迪斯科律动，反拍开镲、原声军鼓与拍手层叠敲击及律动牛铃。"},
    "bassPattern": {"en": "Syncopated live funk bass featuring slap/pop articulations and ghost notes.", "zh": "极富表现力的切分现场放克贝斯线条，充满击勾弦与幽灵音符。"},
    "productionTips": {
      "en": ["Program realistic bass guitar ghost notes for authentic pocket.", "Add auto-wah envelope follower to clavinet.", "Use tape flanging across drum bus in pre-drop fills."],
      "zh": ["编写生动的贝斯幽灵音营造放克人手演奏松弛感。", "为电古钢琴加上包络跟随器获得标志性自动哇音。", "在过门加花阶段为鼓组总线挂载磁带凸缘效果器。"]
    },
    "radar": {"groove": 10, "brightness": 8, "harmonicComplexity": 7, "rhythmDensity": 7, "bassEnergy": 7, "melodicFocus": 8}
  },
  {
    "id": "microhouse", "name": "Microhouse", "aliases": ["微型浩室"],
    "category": "Electronic", "parents": ["Minimal Techno", "Deep House", "Glitch"], "subgenres": [],
    "related": ["Minimal Techno", "IDM"], "year": "1998", "decade": 1990,
    "place": {"en": "Germany & Canada", "zh": "德国与加拿大"},
    "bpm": "120–126 BPM", "defaultBpm": 122, "style": "four_on_floor",
    "artists": ["Akufen", "Ricardo Villalobos", "Matthew Herbert", "Jan Jelinek", "Luomo"],
    "tracks": [
      {"title": "Deck the House", "artist": "Akufen", "year": 2002},
      {"title": "Easy Lee", "artist": "Ricardo Villalobos", "year": 2003},
      {"title": "The Audience", "artist": "Matthew Herbert", "year": 2001},
      {"title": "Tendency", "artist": "Jan Jelinek", "year": 2001},
      {"title": "Tessio", "artist": "Luomo", "year": 2000}
    ],
    "context": {
      "en": "Minimal house characterized by micro-samples, audio clicks and cuts, stripped-down drums, and subtle swing.",
      "zh": "由微采样切片、精巧毛刺与极度精简骨架鼓组构筑的极简浩室流派。"
    },
    "soundDesign": {"en": "Microscopic radio clicks, vinyl needle drops, subtle low-passed chords, sub sine.", "zh": "显微镜般的收音机电流轻击声、唱针摩擦音、低通滤波和弦与纯净正弦波。"},
    "rhythmFeatures": {"en": "Sparse, delicate rhythm composed of clicks, cuts, and organic foley over 4/4 kick.", "zh": "由咔哒声与微小拟音构筑的细腻稀疏节拍，倚靠在柔软四四拍底鼓之上。"},
    "bassPattern": {"en": "Subdued warm sine pulses beneath micro-percussions without drawing attention.", "zh": "克制温润的正弦低频在微观打击乐下方轻柔脉动。"},
    "productionTips": {
      "en": ["Slice a shortwave radio snippet into 32 micro-grains.", "Keep transient clicks at around -18dB for intimate dynamics.", "Pan subtle micro-percussions randomly left and right."],
      "zh": ["截取短波收音机广播切分成 32 个微小颗粒并按律动编排。", "将瞬态咔哒声电平控制在 -18dB 左右保留亲近听感。", "对微型打击乐使用随机声像偏置营造沉浸空间。"]
    },
    "radar": {"groove": 8, "brightness": 5, "harmonicComplexity": 6, "rhythmDensity": 6, "bassEnergy": 7, "melodicFocus": 5}
  }
]

print(f"Loaded {len(ELECTRONIC_GENRES)} base House genres.")
