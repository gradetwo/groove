/**
 * Curated Database of Popular Chord Progressions
 * Referencing Hooktheory Theorytab's popular chord progressions catalog
 * (https://www.hooktheory.com/theorytab/popular-chord-progressions)
 */

import { ChordDefinition, ChordQuality } from "../utils/chordTheory";

export interface ProgressionSong {
  title: string;
  artist: string;
  year?: number;
}

export interface PopularProgression {
  id: string;
  name: { zh: string; en: string };
  category: 
    | "pop_anthems"
    | "emotional_cinematic"
    | "jazz_soul_rnb"
    | "jpop_anime"
    | "rock_blues"
    | "edm_electronic"
    | "classic_roots";
  roman: string[];           // e.g. ["I", "V", "vi", "IV"]
  defaultKey: string;        // e.g. "C", "Am", "G"
  isMinorKey?: boolean;
  chords: ChordDefinition[]; // In default key
  description: { zh: string; en: string };
  theoryAnalysis: { zh: string; en: string };
  emotion: { zh: string; en: string };
  songs: ProgressionSong[];
  suggestedBpm: number;
  suggestedTimbre: "piano" | "guitar" | "power-guitar";
  suggestedStyle: "block" | "strum" | "arpeggio" | "ballad";
}

export const POPULAR_PROGRESSION_CATEGORIES = [
  { id: "all", nameZh: "全部走向", nameEn: "All Progressions" },
  { id: "pop_anthems", nameZh: "流行神曲", nameEn: "Pop Anthems" },
  { id: "emotional_cinematic", nameZh: "情感叙事与卡农", nameEn: "Emotional & Canon" },
  { id: "jazz_soul_rnb", nameZh: "爵士与 Neo-Soul", nameEn: "Jazz & Neo-Soul" },
  { id: "jpop_anime", nameZh: "日系王道与动漫", nameEn: "J-Pop & Royal Road" },
  { id: "rock_blues", nameZh: "摇滚与 Power 和弦", nameEn: "Rock & Power Chords" },
  { id: "edm_electronic", nameZh: "电子舞曲与慢拍", nameEn: "EDM & Lo-Fi" },
  { id: "classic_roots", nameZh: "复古 Doo-Wop 与根源", nameEn: "50s Doo-Wop & Roots" },
] as const;

export const POPULAR_PROGRESSIONS: PopularProgression[] = [
  // 1. Pop Anthems
  {
    id: "axis-of-awesome",
    name: { zh: "四和弦神曲 (I - V - vi - IV)", en: "The 4-Chord Pop Anthem (I - V - vi - IV)" },
    category: "pop_anthems",
    roman: ["I", "V", "vi", "IV"],
    defaultKey: "C",
    isMinorKey: false,
    chords: [
      { root: "C", quality: "maj", duration: 4 },
      { root: "G", quality: "maj", duration: 4 },
      { root: "A", quality: "min", duration: 4 },
      { root: "F", quality: "maj", duration: 4 },
    ],
    description: {
      zh: "现代流行音乐史上最成功的和弦走向。被 Axis of Awesome 乐队演绎并串联了上百首欧美榜首热单，极其悦耳且具备无限循环的魔力。",
      en: "The most commercially successful chord progression in modern music history. Famously parodied by The Axis of Awesome for powering dozens of Billboard #1 hits."
    },
    theoryAnalysis: {
      zh: "主和弦(I)启程，属和弦(V)构建上行推力，下行进入关系小调副主和弦(vi)注入抒情色彩，最后通过下属和弦(IV)平稳回转主和弦。",
      en: "Tonic (I) moves to Dominant (V), steps into relative minor Submediant (vi) for emotional depth, and returns via Subdominant (IV)."
    },
    emotion: { zh: "振奋 · 昂扬 · 经典流行", en: "Uplifting · Euphoric · Anthem" },
    songs: [
      { title: "Don't Stop Believin'", artist: "Journey", year: 1981 },
      { title: "Someone Like You", artist: "Adele", year: 2011 },
      { title: "With or Without You", artist: "U2", year: 1987 },
      { title: "Let It Be", artist: "The Beatles", year: 1970 },
      { title: "Despacito", artist: "Luis Fonsi ft. Daddy Yankee", year: 2017 },
      { title: "She Will Be Loved", artist: "Maroon 5", year: 2002 },
    ],
    suggestedBpm: 120,
    suggestedTimbre: "piano",
    suggestedStyle: "ballad"
  },
  {
    id: "sensitive-female",
    name: { zh: "现代伤感流行走向 (vi - IV - I - V)", en: "Sensitive Pop Progression (vi - IV - I - V)" },
    category: "pop_anthems",
    roman: ["vi", "IV", "I", "V"],
    defaultKey: "C",
    isMinorKey: false,
    chords: [
      { root: "A", quality: "min", duration: 4 },
      { root: "F", quality: "maj", duration: 4 },
      { root: "C", quality: "maj", duration: 4 },
      { root: "G", quality: "maj", duration: 4 },
    ],
    description: {
      zh: "以小和弦开篇的倒转四和弦，带有浓烈的伤感、释怀与奔跑感。从 90 年代另类摇滚到当代 EDM / 电音流行无处不在。",
      en: "The inverted 4-chord progression starting on the minor sixth, delivering immediate vulnerability, driving momentum, and modern emotional catharsis."
    },
    theoryAnalysis: {
      zh: "以副主和弦(vi)直接奠定感伤底色，下行到(IV)产生希望感，回归大调主和弦(I)带来片刻温暖，最后以属和弦(V)留下悬念。",
      en: "Begins on the evocative vi minor chord, blooms into the hopeful IV, touches the warm tonic I, and ends with an open dominant V."
    },
    emotion: { zh: "感伤 · 奔跑 · 释怀", en: "Melancholy · Driving · Cathartic" },
    songs: [
      { title: "Faded", artist: "Alan Walker", year: 2015 },
      { title: "Zombie", artist: "The Cranberries", year: 1994 },
      { title: "Counting Stars", artist: "OneRepublic", year: 2013 },
      { title: "Complicated", artist: "Avril Lavigne", year: 2002 },
      { title: "Poker Face", artist: "Lady Gaga", year: 2008 },
    ],
    suggestedBpm: 124,
    suggestedTimbre: "piano",
    // A keyboard has no strings to sweep: the flowing feel this progression wants is a broken
    // chord, which is `ballad`. (It previously suggested `strum`, a style a piano cannot play —
    // see src/audio/chordStyles.ts.)
    suggestedStyle: "ballad"
  },
  {
    id: "pop-rock-turnaround",
    name: { zh: "流行摇滚回转 (I - IV - vi - V)", en: "Pop-Rock Drive (I - IV - vi - V)" },
    category: "pop_anthems",
    roman: ["I", "IV", "vi", "V"],
    defaultKey: "C",
    isMinorKey: false,
    chords: [
      { root: "C", quality: "maj", duration: 4 },
      { root: "F", quality: "maj", duration: 4 },
      { root: "A", quality: "min", duration: 4 },
      { root: "G", quality: "maj", duration: 4 },
    ],
    description: {
      zh: "充满阳光与向前推动力的流行摇滚经典进行，从波士顿乐队到当代流行朋克频繁使用。",
      en: "A forward-surging, sun-soaked rock progression favored by 80s arena rock and modern pop-punk bands."
    },
    theoryAnalysis: {
      zh: "从(I)跃升到下属和弦(IV)，随后下行到关系小调(vi)，最后属和弦(V)完美推向下一个循环。",
      en: "Ascends directly from I to IV for lift, dips into vi, and powers through V."
    },
    emotion: { zh: "阳光 · 青春 · 奔涌", en: "Sunny · Youthful · Forward" },
    songs: [
      { title: "More Than a Feeling", artist: "Boston", year: 1976 },
      { title: "Peace of Mind", artist: "Boston", year: 1976 },
      { title: "Semi-Charmed Life", artist: "Third Eye Blind", year: 1997 },
    ],
    suggestedBpm: 116,
    suggestedTimbre: "guitar",
    suggestedStyle: "strum"
  },

  // 2. Emotional & Cinematic
  {
    id: "pachelbel-canon",
    name: { zh: "帕赫贝尔卡农进行 (I - V - vi - iii - IV - I - IV - V)", en: "Pachelbel's Canon Progression" },
    category: "emotional_cinematic",
    roman: ["I", "V", "vi", "iii", "IV", "I", "IV", "V"],
    defaultKey: "C",
    isMinorKey: false,
    chords: [
      { root: "C", quality: "maj", duration: 4 },
      { root: "G", quality: "maj", duration: 4 },
      { root: "A", quality: "min", duration: 4 },
      { root: "E", quality: "min", duration: 4 },
      { root: "F", quality: "maj", duration: 4 },
      { root: "C", quality: "maj", duration: 4 },
      { root: "F", quality: "maj", duration: 4 },
      { root: "G", quality: "maj", duration: 4 },
    ],
    description: {
      zh: "古典巴洛克时期帕赫贝尔《D大调卡农》的灵魂骨架，300年来被全球流行乐不断借用，堪称人类音乐史上的终极叙事进行。",
      en: "The immortal backbone from Pachelbel's Canon in D (c. 1680). The most borrowed and deeply emotional sequential progression in music history."
    },
    theoryAnalysis: {
      zh: "下行四度序列模进（Stepwise Fall with Sequential Resolution），低音声部优美平缓地下行阶梯，创造出无与伦比的深邃叙事厚度。",
      en: "Classic sequential circle-of-fifths / descending root motion creating a timeless stepwise bassline."
    },
    emotion: { zh: "神圣 · 婚礼 · 怀旧 · 史诗", en: "Sacred · Nostalgic · Epic · Graceful" },
    songs: [
      { title: "Memories", artist: "Maroon 5", year: 2019 },
      { title: "Graduation (Friends Forever)", artist: "Vitamin C", year: 1999 },
      { title: "Basket Case", artist: "Green Day", year: 1994 },
      { title: "Cryin'", artist: "Aerosmith", year: 1993 },
      { title: "Canon in D", artist: "Johann Pachelbel", year: 1680 },
    ],
    suggestedBpm: 92,
    suggestedTimbre: "piano",
    suggestedStyle: "arpeggio"
  },
  {
    id: "epic-minor-hero",
    name: { zh: "史诗小调英雄走向 (i - VI - III - VII)", en: "Epic Minor Hero Progression (i - VI - III - VII)" },
    category: "emotional_cinematic",
    roman: ["i", "VI", "III", "VII"],
    defaultKey: "A",
    isMinorKey: true,
    chords: [
      { root: "A", quality: "min", duration: 4 },
      { root: "F", quality: "maj", duration: 4 },
      { root: "C", quality: "maj", duration: 4 },
      { root: "G", quality: "maj", duration: 4 },
    ],
    description: {
      zh: "电影预告片、重型摇滚与史诗电子的标志性走向。黑暗中蕴含着巨大的破晓力量，英雄史诗的绝配。",
      en: "The definitive cinematic trailer and alternative rock progression. Evokes dramatic struggle, heroic defiance, and massive climaxes."
    },
    theoryAnalysis: {
      zh: "小调主和弦(i)开局，大六度(VI)爆发张力，跳跃到大调平行主和弦(III)展现光明，最后以大七度(VII)带来恢弘的开放感。",
      en: "Starts on tonic minor, soars to flat-VI major for monumental scale, resolves to parallel major III, and loops via flat-VII."
    },
    emotion: { zh: "悲壮 · 英雄 · 史诗 · 决战", en: "Epic · Defiant · Heroic · Cinematic" },
    songs: [
      { title: "In the End", artist: "Linkin Park", year: 2000 },
      { title: "Radioactive", artist: "Imagine Dragons", year: 2012 },
      { title: "Demons", artist: "Imagine Dragons", year: 2012 },
      { title: "Say Something", artist: "A Great Big World", year: 2013 },
    ],
    suggestedBpm: 108,
    suggestedTimbre: "piano",
    suggestedStyle: "block"
  },
  {
    id: "andalusian-cadence",
    name: { zh: "安达卢西亚终止式 (i - VII - VI - V)", en: "Andalusian Cadence (i - VII - VI - V)" },
    category: "emotional_cinematic",
    roman: ["i", "VII", "VI", "V"],
    defaultKey: "A",
    isMinorKey: true,
    chords: [
      { root: "A", quality: "min", duration: 4 },
      { root: "G", quality: "maj", duration: 4 },
      { root: "F", quality: "maj", duration: 4 },
      { root: "E", quality: "maj", duration: 4 },
    ],
    description: {
      zh: "源自西班牙弗拉门戈传统的阶梯下行走向。脚步般的下行低音线条，充满吉普赛风情与强烈的宿命决绝感。",
      en: "A centuries-old flamenco progression derived from Moorish Andalusia. Features a continuous stepwise descending bassline dripping with drama."
    },
    theoryAnalysis: {
      zh: "由主音连续半音或全音阶梯式级进下行（A -> G -> F -> E），并在最后一拍通过大调属和弦(V)的和声小调导音强烈回扯主和弦。",
      en: "Stepwise descending tetrachord (1 - b7 - b6 - 5) resolving to major V with harmonic minor leading tone."
    },
    emotion: { zh: "宿命 · 决绝 · 异域风情", en: "Fate · Dramatic · Exotic · Flamenco" },
    songs: [
      { title: "Hit the Road Jack", artist: "Ray Charles", year: 1961 },
      { title: "Sultans of Swing", artist: "Dire Straits", year: 1978 },
      { title: "Smooth", artist: "Santana ft. Rob Thomas", year: 1999 },
      { title: "Stray Cat Strut", artist: "Stray Cats", year: 1981 },
    ],
    suggestedBpm: 112,
    suggestedTimbre: "guitar",
    suggestedStyle: "strum"
  },

  // 3. Jazz, Soul & Neo-Soul
  {
    id: "major-two-five-one",
    name: { zh: "爵士大调黄金基石 (ii7 - V7 - Imaj7)", en: "Major 2-5-1 (ii7 - V7 - Imaj7)" },
    category: "jazz_soul_rnb",
    roman: ["ii7", "V7", "Imaj7"],
    defaultKey: "C",
    isMinorKey: false,
    chords: [
      { root: "D", quality: "min7", duration: 4 },
      { root: "G", quality: "7", duration: 4 },
      { root: "C", quality: "maj7", duration: 8 },
    ],
    description: {
      zh: "整个爵士乐历史中最核心的语法句式，涵盖了从摇摆乐、比波普到波萨诺瓦的全部经典标准曲。",
      en: "The quintessential harmonic cadence in jazz. Understanding 2-5-1 is the key to unlocking the entire Great American Songbook."
    },
    theoryAnalysis: {
      zh: "由预备和弦(ii7)引出强张力五度圈属和弦(V7)，导音与七音对向解决至稳定的大七主和弦(Imaj7)。",
      en: "Pre-dominant minor 7th moves through dominant 7th cycle-of-fifths to resolve gracefully into major 7th tonic."
    },
    emotion: { zh: "典雅 · 丝滑 · 醇厚", en: "Sophisticated · Smooth · Timeless" },
    songs: [
      { title: "Autumn Leaves", artist: "Jazz Standard", year: 1945 },
      { title: "Fly Me to the Moon", artist: "Frank Sinatra", year: 1954 },
      { title: "Take the 'A' Train", artist: "Duke Ellington", year: 1939 },
      { title: "Sunday Morning", artist: "Maroon 5", year: 2002 },
    ],
    suggestedBpm: 100,
    suggestedTimbre: "piano",
    suggestedStyle: "ballad"
  },
  {
    id: "just-the-two-of-us",
    name: { zh: "日落浪漫律动 (IVmaj7 - iii7 - vi7 - I7)", en: "Sunset Groove / Just the Two of Us (IVmaj7 - iii7 - vi7)" },
    category: "jazz_soul_rnb",
    roman: ["IVmaj7", "iii7", "vi7", "I7"],
    defaultKey: "C",
    isMinorKey: false,
    chords: [
      { root: "F", quality: "maj7", duration: 4 },
      { root: "E", quality: "min7", duration: 4 },
      { root: "A", quality: "min7", duration: 4 },
      { root: "C", quality: "7", duration: 4 },
    ],
    description: {
      zh: "以格罗弗·华盛顿与比尔·威瑟斯同名金曲为代表，近年来在 Lo-Fi、City Pop 与 Neo-Soul 领域掀起狂热回潮的浪漫律动。",
      en: "The immortal sunset R&B groove popularized by Bill Withers & Grover Washington Jr. A staple of modern Neo-Soul and City Pop."
    },
    theoryAnalysis: {
      zh: "大七和弦(IVmaj7)起步带来飘逸离地感，下行至(iii7)，落入副主和弦(vi7)，结尾次属和弦(I7)引导回下属和弦。",
      en: "Airy IVmaj7 glides down to iii7, resolves into vi7, with a dominant I7 acting as secondary dominant to cycle back."
    },
    emotion: { zh: "丝滑 · 暮色 · 浪漫 · 摇摆", en: "Silky · Sunset · Romantic · Groovy" },
    songs: [
      { title: "Just the Two of Us", artist: "Bill Withers & Grover Washington Jr.", year: 1980 },
      { title: "Redbone", artist: "Childish Gambino", year: 2016 },
      { title: "Tokyo Drift", artist: "Teriyaki Boyz", year: 2006 },
      { title: "Sunroof", artist: "Nicky Youre", year: 2021 },
    ],
    suggestedBpm: 96,
    suggestedTimbre: "piano",
    // Rhodes-style broken chords, not a strum — a keyboard cannot sweep strings
    // (see src/audio/chordStyles.ts).
    suggestedStyle: "ballad"
  },

  // 4. J-Pop & Anime Royal Road
  {
    id: "royal-road-jpop",
    name: { zh: "日系王道进行 (IVmaj7 - V7 - iii7 - vi)", en: "J-Pop Royal Road (IVmaj7 - V7 - iii7 - vi)" },
    category: "jpop_anime",
    roman: ["IVmaj7", "V7", "iii7", "vi"],
    defaultKey: "C",
    isMinorKey: false,
    chords: [
      { root: "F", quality: "maj7", duration: 4 },
      { root: "G", quality: "7", duration: 4 },
      { root: "E", quality: "min7", duration: 4 },
      { root: "A", quality: "min", duration: 4 },
    ],
    description: {
      zh: "日本音乐产业公认的“王道进行”（Oudo Shinkou）。几乎统治了动漫神曲、J-Pop 与 Vocaloid 创作，情感饱满兼具疾走感。",
      en: "Known in Japan as 'Oudo Shinkou' (Royal Road Progression). Dominates Japanese anime theme songs, Vocaloid anthems, and J-Pop masterpieces."
    },
    theoryAnalysis: {
      zh: "避免直接给出主和弦(I)，通过(IVmaj7)的上行与(V7)推进，巧妙接住三级小和弦(iii7)，最后落回(vi)，形成无穷无尽的抒情回甘。",
      en: "Suspends resolution by avoiding the tonic chord, creating emotional longing through IVmaj7 -> V7 -> iii7 -> vi."
    },
    emotion: { zh: "青春 · 疾走 · 执着 · 泪目", en: "Youthful · Emotional · Driving · Nostalgic" },
    songs: [
      { title: "丸之内虐待狂 (Marunouchi Sadistic)", artist: "椎名林檎 (Sheena Ringo)", year: 1999 },
      { title: "打上花火 (Uchiage Hanabi)", artist: "米津玄师 & DAOKO", year: 2017 },
      { title: "红莲华 (Gurenge)", artist: "LiSA", year: 2019 },
      { title: "千本樱 (Senbonzakura)", artist: "Kurousa-P", year: 2011 },
      { title: "God Knows...", artist: "凉宫春日的忧郁", year: 2006 },
    ],
    suggestedBpm: 128,
    suggestedTimbre: "piano",
    suggestedStyle: "ballad"
  },
  {
    id: "mario-cadence",
    name: { zh: "马里奥胜利破晓式 (bVI - bVII - I)", en: "Mario Cadence / Epic Dawn (bVI - bVII - I)" },
    category: "jpop_anime",
    roman: ["bVI", "bVII", "I"],
    defaultKey: "C",
    isMinorKey: false,
    chords: [
      { root: "G#", quality: "maj", duration: 4 },
      { root: "A#", quality: "maj", duration: 4 },
      { root: "C", quality: "maj", duration: 8 },
    ],
    description: {
      zh: "任天堂超级马里奥过关结算、最终幻想水晶序曲的经典和声，也称为调外大和弦全音阶跃进，充斥着破晓胜利与奇迹之感。",
      en: "The classic Nintendo fanfare progression (Super Mario flag pole, Final Fantasy victory). Stepwise major chords bursting into triumphant resolution."
    },
    theoryAnalysis: {
      zh: "借用同主音自然小调的平降六级(bVI)与平降七级(bVII)，以双重全音阶跃升猛烈撞击大调主和弦(I)，释放震撼的光明感。",
      en: "Modal interchange borrowing bVI and bVII from Aeolian mode, stepping whole tones directly into a blazing major tonic I."
    },
    emotion: { zh: "破晓 · 凯旋 · 奇迹 · 胜利", en: "Triumphant · Fanfare · Wonder · Victory" },
    songs: [
      { title: "Super Mario Level Clear", artist: "Koji Kondo", year: 1985 },
      { title: "Final Fantasy Victory Fanfare", artist: "Nobuo Uematsu", year: 1987 },
      { title: "Lady Madonna", artist: "The Beatles", year: 1968 },
    ],
    suggestedBpm: 120,
    suggestedTimbre: "power-guitar",
    suggestedStyle: "block"
  },

  // 5. Rock, Blues & Power Chords
  {
    id: "twelve-bar-blues",
    name: { zh: "12小节标准布鲁斯 (I7 - IV7 - V7)", en: "12-Bar Blues Progression" },
    category: "rock_blues",
    roman: ["I7", "I7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"],
    defaultKey: "C",
    isMinorKey: false,
    chords: [
      { root: "C", quality: "7", duration: 4 },
      { root: "C", quality: "7", duration: 4 },
      { root: "C", quality: "7", duration: 4 },
      { root: "C", quality: "7", duration: 4 },
      { root: "F", quality: "7", duration: 4 },
      { root: "F", quality: "7", duration: 4 },
      { root: "C", quality: "7", duration: 4 },
      { root: "C", quality: "7", duration: 4 },
      { root: "G", quality: "7", duration: 4 },
      { root: "F", quality: "7", duration: 4 },
      { root: "C", quality: "7", duration: 4 },
      { root: "G", quality: "7", duration: 4 },
    ],
    description: {
      zh: "摇滚乐与现代西方流行音乐的绝对基石。全部采用属七和弦，充满密西西比蓝调的野性与即兴灵魂。",
      en: "The bedrock of modern rock 'n' roll and blues. Standard 12-measure form utilizing dominant 7th chords exclusively."
    },
    theoryAnalysis: {
      zh: "以属七和弦代替传统大三和弦，弱化调性解决，通过小七度蓝调音（Blue Note）创造永动机般的即兴律动张力。",
      en: "All-dominant chord structure breaking classical voice leading, establishing the raw swing and blue note tension."
    },
    emotion: { zh: "狂放 · 即兴 · 粗粝 · 纯正", en: "Raw · Roots · Soulful · Energetic" },
    songs: [
      { title: "Johnny B. Goode", artist: "Chuck Berry", year: 1958 },
      { title: "Hound Dog", artist: "Elvis Presley", year: 1956 },
      { title: "Pride and Joy", artist: "Stevie Ray Vaughan", year: 1983 },
      { title: "Sweet Home Chicago", artist: "Robert Johnson", year: 1936 },
    ],
    suggestedBpm: 124,
    suggestedTimbre: "guitar",
    suggestedStyle: "strum"
  },
  {
    id: "punk-power-chords",
    name: { zh: "朋克狂飙五和弦 (I5 - bVII5 - bVI5 - bVII5)", en: "Punk / Metal Power Chords (I5 - bVII5 - bVI5)" },
    category: "rock_blues",
    roman: ["I5", "bVII5", "bVI5", "bVII5"],
    defaultKey: "C",
    isMinorKey: false,
    chords: [
      { root: "C", quality: "5", duration: 4 },
      { root: "A#", quality: "5", duration: 4 },
      { root: "G#", quality: "5", duration: 4 },
      { root: "A#", quality: "5", duration: 4 },
    ],
    description: {
      zh: "纯粹的根音加五度音，无三音干扰，适合大失真电吉他强力下拨或掌音闷音（Palm Mute），朋克与重金属的核心燃料。",
      en: "Raw, unadulterated fifth power chords designed for heavy distortion. Zero third intervals, pure sonic punch and driving rage."
    },
    theoryAnalysis: {
      zh: "省略三音消除了大调或小调的情感限定，在大功率过载失真下泛音整齐共振，阶梯下行轰鸣极具冲击力。",
      en: "Absence of the third eliminates harsh intermodulation distortion, creating thunderous high-gain clarity."
    },
    emotion: { zh: "暴烈 · 冲击 · 狂躁 · 力量", en: "Heavy · Powerful · Raw · Aggressive" },
    songs: [
      { title: "Smells Like Teen Spirit", artist: "Nirvana", year: 1991 },
      { title: "When I Come Around", artist: "Green Day", year: 1994 },
      { title: "The Trooper", artist: "Iron Maiden", year: 1983 },
      { title: "Paranoid", artist: "Black Sabbath", year: 1970 },
    ],
    suggestedBpm: 140,
    suggestedTimbre: "power-guitar",
    suggestedStyle: "strum"
  },

  // 6. EDM & Electronic
  {
    id: "lofi-chill-glide",
    name: { zh: "Lo-Fi 温暖雨夜 (ii7 - V7 - Imaj7 - VI7)", en: "Lo-Fi Chillhop Glide (ii7 - V7 - Imaj7 - VI7)" },
    category: "edm_electronic",
    roman: ["ii7", "V7", "Imaj7", "VI7"],
    defaultKey: "C",
    isMinorKey: false,
    chords: [
      // Spelled to match the numerals the engine maps (`ii7 V7 Imaj7 VI7`): the card used to
      // print min9/9/maj9 while the engine played min7/7/maj7, i.e. it named chords the user would
      // never hear. `romanToChord` does not parse a bare `9`, so the numerals stay 7ths.
      { root: "D", quality: "min7", duration: 4 },
      { root: "G", quality: "7", duration: 4 },
      { root: "C", quality: "maj7", duration: 4 },
      { root: "A", quality: "7", duration: 4 },
    ],
    description: {
      zh: "带有浓郁黑胶质感与雨声混响的九和弦走向，Lo-Fi Hip Hop 学习直播间里的标志性温暖循环。",
      en: "Rich 9th chords dripping in dusty vinyl warmth and mellow rain textures. The signature sound of Lo-Fi study beats."
    },
    theoryAnalysis: {
      zh: "加入扩展九音（add9/maj9），使和声色彩更丰富饱满，结尾的(VI7)作为重属和弦将耳朵温柔推回起点。",
      en: "Extended color tones (ninths) add velvet warmth; VI7 acts as secondary dominant cycling seamlessly back to ii."
    },
    emotion: { zh: "治愈 · 温暖 · 独处 · 专注", en: "Chill · Cozy · Introspective · Mellow" },
    songs: [
      { title: "Snowman", artist: "WYS", year: 2019 },
      { title: "Affection", artist: "Jinsang", year: 2016 },
      { title: "Get You", artist: "Daniel Caesar", year: 2017 },
    ],
    suggestedBpm: 84,
    suggestedTimbre: "piano",
    suggestedStyle: "arpeggio"
  },

  // 7. Classic 50s Doo-Wop & Roots
  {
    id: "doo-wop-fifties",
    name: { zh: "50年代经典 Doo-Wop (I - vi - IV - V)", en: "The 50s Progression / Doo-Wop (I - vi - IV - V)" },
    category: "classic_roots",
    roman: ["I", "vi", "IV", "V"],
    defaultKey: "C",
    isMinorKey: false,
    chords: [
      { root: "C", quality: "maj", duration: 4 },
      { root: "A", quality: "min", duration: 4 },
      { root: "F", quality: "maj", duration: 4 },
      { root: "G", quality: "maj", duration: 4 },
    ],
    description: {
      zh: "上世纪50年代美国街头人声合唱的灵魂走向，也是整个早期摇滚与节奏布鲁斯的黄金模版，充满纯真怀旧年代感。",
      en: "The legendary street-corner vocal harmony progression of the 1950s. The golden formula of early rock 'n' roll, soul, and sweet nostalgia."
    },
    theoryAnalysis: {
      zh: "主和弦(I)直落小调副主(vi)，借下属和弦(IV)跳至属和弦(V)，构建起最纯正的闭环回转。",
      en: "Textbook circle progression moving from I to vi, down to subdominant IV, and climbing to dominant V."
    },
    emotion: { zh: "纯真 · 怀旧 · 浪漫 · 永恒", en: "Innocent · Nostalgic · Sweet · Timeless" },
    songs: [
      { title: "Stand By Me", artist: "Ben E. King", year: 1961 },
      { title: "Every Breath You Take", artist: "The Police", year: 1983 },
      { title: "Earth Angel", artist: "The Penguins", year: 1954 },
      { title: "Perfect", artist: "Ed Sheeran", year: 2017 },
      { title: "Unchained Melody", artist: "The Righteous Brothers", year: 1965 },
    ],
    suggestedBpm: 104,
    suggestedTimbre: "guitar",
    suggestedStyle: "ballad"
  },
];
