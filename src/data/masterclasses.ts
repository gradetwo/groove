/**
 * Rhythm Masterclasses Curriculum & Lesson Specifications (P6-01)
 * Historical origins, pedagogical breakdowns, acoustic parameters,
 * and sequencer pattern converters for Studio baking.
 */

import { SequencerPattern, SequencerTrack } from "../types/genre";

export type MasterclassId =
  | "polyrhythm"
  | "clave"
  | "downbeat_omission"
  | "balkan_odd_meters"
  | "dilla_microtiming";

export interface MasterclassLesson {
  id: MasterclassId;
  index: number;
  title: { zh: string; en: string };
  subtitle: { zh: string; en: string };
  tag: { zh: string; en: string };
  originPlace: { zh: string; en: string };
  originEra: string;
  culturalContext: { zh: string; en: string };
  acousticPrinciple: { zh: string; en: string };
  defaultBpm: number;
  presets: Array<{
    id: string;
    nameZh: string;
    nameEn: string;
    descZh: string;
    descEn: string;
    params: Record<string, unknown>;
  }>;
  generateStudioPattern: (presetId?: string) => SequencerPattern;
}

export const MASTERCLASSES: MasterclassLesson[] = [
  {
    id: "polyrhythm",
    index: 1,
    title: {
      zh: "复节奏声光对撞机",
      en: "Polyrhythm Collider",
    },
    subtitle: {
      zh: "3:4 与 5:4 律动对冲与周期相位碰撞",
      en: "3:4 & 5:4 Rhythmic Clashing and Phase Convergence",
    },
    tag: {
      zh: "双环多轨声光碰撞",
      en: "Dual-Ring Polyphonic Collision",
    },
    originPlace: {
      zh: "西非约鲁巴、中非俾格米多声部与现代前卫爵士 / Djent",
      en: "West African Yoruba, Central African Pygmy polyphony & Modern Djent / Avant-Garde Jazz",
    },
    originEra: "公元前古老口传 → 20世纪前卫音乐",
    culturalContext: {
      zh: "复节奏（Polyrhythm）是人类律动史上最震撼的声学对冲体验：在相同的时间窗口内，两条互为不可整除比例的时间脉冲（如 3 拍对 4 拍、5 拍对 4 拍）同时运转。在西非与加勒比仪式中，复节奏并非数学炫技，而是多个舞者、鼓手与神明意志在同一时空中交织对话的宇宙声学隐喻。",
      en: "Polyrhythm represents the pinnacle of rhythmic dialogue: two incommensurable metric pulses (such as 3 against 4, or 5 against 4) occurring concurrently within identical time boundaries. In African and diaspora rituals, polyrhythm was never a cold mathematical exercise, but a cosmic metaphor where multiple drummers, dancers, and ancestral spirits converse simultaneously.",
    },
    acousticPrinciple: {
      zh: "当 3 对 4 运行时，由于公倍数为 12，两种声音只在第 1 拍起点重合（Collision Point），随后迅速分离产生极具推力的干涉相位波，并在每小节循环结束时重新归一。口诀为「Pass the golden butter」或「冷热酸甜想吃就吃」。",
      en: "When 3 plays against 4, with a lowest common multiple of 12, both pulses collide perfectly on beat 1, subsequently diverging into a surging acoustic interference pattern before resolving together at the cycle threshold. The mnemonic is 'Pass the golden butter'.",
    },
    defaultBpm: 108,
    presets: [
      {
        id: "3_against_4",
        nameZh: "3 对 4 经典交叉脉冲 (Pass the golden butter)",
        nameEn: "3:4 Classic Cross-Pulse (Pass the golden butter)",
        descZh: "基础 4 拍底鼓搭载 3 等分清脆木鱼音，产生最经典的跳跃与律动悬浮感",
        descEn: "4-beat steady kick baseline intersected by 3 triplet woodblock taps",
        params: { ratioA: 4, ratioB: 3, soundA: "kick", soundB: "woodblock" },
      },
      {
        id: "4_against_3",
        nameZh: "4 对 3 紧密复合交错 (Eat your goddamn spinach)",
        nameEn: "4:3 Inverted Compound (Eat your goddamn spinach)",
        descZh: "华尔兹 3 拍三拍子重音，与 4 等分切分打击乐产生张力挤压",
        descEn: "Triple meter waltz bassline intersected by 4 even syncopated clicks",
        params: { ratioA: 3, ratioB: 4, soundA: "davul", soundB: "bell" },
      },
      {
        id: "5_against_4",
        nameZh: "5 对 4 奇幻五角星波 (Take a little cup of tea)",
        nameEn: "5:4 Quintuplet Phase Wave",
        descZh: "五连音细分对冲 4/4 拍，呈现极具前卫摇滚（Tool、Meshuggah）风格的神秘流动感",
        descEn: "Quintuplet subdivision clashing against 4/4 downbeats, inspired by progressive metal",
        params: { ratioA: 4, ratioB: 5, soundA: "kick", soundB: "clave" },
      },
    ],
    generateStudioPattern: (presetId = "3_against_4"): SequencerPattern => {
      const is34 = presetId === "3_against_4";
      const is54 = presetId === "5_against_4";

      // 16-step grid representation
      const kickSteps = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
      // 3 over 4 cross: hits roughly on 0, 5.33, 10.66 -> steps 0, 5, 11
      const woodSteps = is34
        ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]
        : is54
        ? [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0]
        : [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];

      const tracks: SequencerTrack[] = [
        {
          track_id: "kick",
          name: "Kick Pulse (Ratio 4)",
          steps: kickSteps,
          instrument: "percussion",
          volume: 0.9,
          pan: 0,
          mute: false,
          solo: false,
        },
        {
          track_id: "snare",
          name: "Downbeat Marker",
          steps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
          instrument: "percussion",
          volume: 0.75,
          pan: 0,
          mute: false,
          solo: false,
        },
        {
          track_id: "percussion",
          name: is34 ? "Cross Pulse (Ratio 3)" : "Cross Pulse (Ratio 5)",
          steps: woodSteps,
          instrument: "percussion",
          volume: 0.85,
          pan: 0.25,
          mute: false,
          solo: false,
        },
        {
          track_id: "hihat",
          name: "16th Shimmer Grid",
          steps: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
          instrument: "percussion",
          volume: 0.6,
          pan: -0.2,
          mute: false,
          solo: false,
        },
      ];

      return {
        genre_id: "polyrhythm-masterclass",
        scale: "C Minor",
        bpm: 108,
        timeSignature: "4/4",
        swing: 0,
        tracks,
      };
    },
  },
  {
    id: "clave",
    index: 2,
    title: {
      zh: "Clave 节奏演化树与西非起源",
      en: "Clave Evolution Tree & West African Roots",
    },
    subtitle: {
      zh: "从西非 12/8 铁钟到古巴 Son 与巴西桑巴",
      en: "From West African Iron Bells to Cuban Son, Rumba & Bossa Nova",
    },
    tag: {
      zh: "非裔加勒比骨干律动",
      en: "Afro-Caribbean Backbone Rhythms",
    },
    originPlace: {
      zh: "加纳埃维族（Ewe）/ 尼日利亚约鲁巴 → 古巴哈瓦那 / 巴西里约",
      en: "Ewe/Yoruba sacred bells → Havana, Cuba & Rio de Janeiro, Brazil",
    },
    originEra: "16世纪黑奴大迁移 → 19世纪古巴",
    culturalContext: {
      zh: "在非裔古巴音乐与拉丁美洲音乐中，Clave（西班牙语意为「钥匙 / 核心栓」）拥有至高无上的圣律地位。整个乐队的所有和弦、贝斯行走、歌手唱段与管乐重音，都必须严格服从 Clave 的「三面（Tresillo）」与「二面（Dos）」的呼应法则，逆 Clave 演奏被视作声学亵渎。",
      en: "In Afro-Cuban and Latin music, the Clave (Spanish for 'key' or 'keystone') holds supreme structural authority. Every bass tumbao, piano montuno, brass accent, and vocal phrase must rigorously adhere to the call-and-response polarity of the 3-side and 2-side.",
    },
    acousticPrinciple: {
      zh: "Son Clave 3-2 在 16 步网格中的击点为 [0, 3, 6, 10, 12]（前三击跨度为 3+3+4 步，后两击落于正拍）。而 Rumba Clave 仅将第 3 击后移半拍（从 step 6 移到 step 7），这一微小的半拍延迟却彻底打破了平稳感，催生出野性摇曳的伦巴切分摆动！",
      en: "Son Clave 3-2 hits steps [0, 3, 6, 10, 12] (a 3+3+4 sub-pulse on the 3-side). Rumba Clave delays the 3rd hit by exactly one 16th-note (from step 6 to step 7), a single micro-shift that radically injects infectious syncopated lift.",
    },
    defaultBpm: 96,
    presets: [
      {
        id: "son_clave_32",
        nameZh: "古巴 Son Clave (3-2 走向)",
        nameEn: "Cuban Son Clave (3-2 Direction)",
        descZh: "萨尔萨与 Son Cubano 最庄严优雅的基础心跳：强有力的 Tresillo 起手，两击收尾",
        descEn: "The keystone of Salsa and Son Cubano: powerful Tresillo head with stable 2-beat resolution",
        params: { steps: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0] },
      },
      {
        id: "rumba_clave_32",
        nameZh: "古巴 Rumba Clave (3-2 变奏，第3击延迟)",
        nameEn: "Afro-Cuban Rumba Clave (Delayed 3rd Stroke)",
        descZh: "将第 3 击往后挪动一格（step 7），瞬间引爆充满泥土气息与灵动的黑人伦巴跳跃感",
        descEn: "Delays stroke 3 by one step, triggering authentic earthy Afro-Cuban polyrhythmic swagger",
        params: { steps: [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0] },
      },
      {
        id: "bossa_nova_clave",
        nameZh: "巴西 Bossa Nova Clave (尾击提前切分)",
        nameEn: "Brazilian Bossa Nova Clave",
        descZh: "巴西桑巴与巴萨诺瓦专属：尾部击点提前至反拍（step 14），营造如海风微醺的悬浮流动",
        descEn: "Brazilian syncopated push where the final hit anticipates to the upbeat",
        params: { steps: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0] },
      },
      {
        id: "west_african_bell",
        nameZh: "西非 12/8 铁钟原初母题 (7 击神圣原体)",
        nameEn: "West African 12/8 Sacred Bell (7-Stroke Arch-Pattern)",
        descZh: "跨越千年的大西洋西非铁钟母型，在 12 拍复三连音网格中划分 2+2+1+2+2+2+1",
        descEn: "Millennia-old 12/8 compound meter bell pattern from the Ewe and Yoruba traditions",
        params: { steps: [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1] },
      },
    ],
    generateStudioPattern: (presetId = "son_clave_32"): SequencerPattern => {
      let claveSteps = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0];
      if (presetId === "rumba_clave_32") {
        claveSteps = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0];
      } else if (presetId === "bossa_nova_clave") {
        claveSteps = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0];
      }

      const tracks: SequencerTrack[] = [
        {
          track_id: "kick",
          name: "Tumbao Kick (Beat 4 Anticipation)",
          steps: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
          instrument: "percussion",
          volume: 0.9,
          pan: 0,
          mute: false,
          solo: false,
        },
        {
          track_id: "percussion",
          name: "Clave Woodblock",
          steps: claveSteps,
          instrument: "percussion",
          volume: 1.0,
          pan: 0,
          mute: false,
          solo: false,
        },
        {
          track_id: "snare",
          name: "Conga Slap & Open Tones",
          steps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
          instrument: "percussion",
          volume: 0.8,
          pan: -0.15,
          mute: false,
          solo: false,
        },
        {
          track_id: "hihat",
          name: "Maracas Shaker",
          steps: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
          instrument: "percussion",
          volume: 0.55,
          pan: 0.2,
          mute: false,
          solo: false,
        },
      ];

      return {
        genre_id: "clave-masterclass",
        scale: "C Minor",
        bpm: 96,
        timeSignature: "4/4",
        swing: 0,
        tracks,
      };
    },
  },
  {
    id: "downbeat_omission",
    index: 3,
    title: {
      zh: "下拍避让与放克切分动力学",
      en: "Downbeat Omission & Funk Propulsion",
    },
    subtitle: {
      zh: "空出第一拍：Fela Kuti 与 Tony Allen 的无限推进引擎",
      en: "Leaving Beat 1 Empty: The Hypnotic Groove Mechanics of Afrobeat & Funk",
    },
    tag: {
      zh: "下拍重力破除与切分推进",
      en: "Anti-Downbeat Gravity & Forward Momentum",
    },
    originPlace: {
      zh: "尼日利亚拉各斯（Afrika Shrine）与美国底特律 / 乔治亚州",
      en: "Lagos, Nigeria (The Shrine) & James Brown Funk circuits",
    },
    originEra: "1960年代末 ~ 1970年代",
    culturalContext: {
      zh: "西方传统音乐习惯于在每小节的第 1 拍（Downbeat）稳重着陆，而 Afrobeat 传奇鼓手 Tony Allen 与 Fela Kuti 颠覆了这一惯性：他们常常故意在第 1 拍留下寂静休止（Downbeat Omission），让身体无法停下脚跟，将听觉重心瞬间甩向 1 拍半与第 2 拍，爆发出无限循环的向前推动力。",
      en: "Classical Western meter anchors listener balance on beat 1 ('The One'). Afrobeat legend Tony Allen and Fela Kuti revolutionized popular music by intentionally omitting the downbeat on beat 1, denying the body an anchor and compelling continuous forward dance momentum.",
    },
    acousticPrinciple: {
      zh: "雷鬼的「One Drop」更是将下拍避让推向极致：底鼓在第 1 拍彻底噤声，完全交由贝斯低频留白，而是在第 3 拍由底鼓与军鼓齐奏一记重击（Drop on 3），产生如同在水面波谷滑行般的下潜失重感。",
      en: "Reggae's 'One Drop' pushes downbeat omission to its spiritual zenith: the kick drum stays completely silent on beat 1, allowing bass weight to hang in mid-air before dropping alongside rimshot precisely on beat 3.",
    },
    defaultBpm: 104,
    presets: [
      {
        id: "tony_allen_afrobeat",
        nameZh: "Tony Allen 式 Afrobeat 避让",
        nameEn: "Tony Allen Afrobeat Omission",
        descZh: "第 1 拍底鼓休止留白，踩镲在反拍切分推进，军鼓在第 2 拍与第 4 拍后半拍爆发",
        descEn: "Rest on downbeat 1, polyrhythmic hi-hat momentum with explosive backbeats",
        params: { omitBeat1: true, snarePattern: "afrobeat" },
      },
      {
        id: "reggae_one_drop",
        nameZh: "牙买加经典 One Drop (仅在第3拍下沉)",
        nameEn: "Jamaican Reggae One Drop",
        descZh: "第 1 拍空出，底鼓与带混响军鼓仅在第 3 拍齐奏重击，最纯正的雷鬼悬浮感",
        descEn: "Kick is absent on beat 1; kick and snare drop in unison strictly on beat 3",
        params: { dropOnBeat: 3 },
      },
      {
        id: "james_brown_the_one",
        nameZh: "James Brown: The One (对照组：重击第一拍)",
        nameEn: "James Brown: The One (Anchor Comparison)",
        descZh: "对照组：所有乐器极重砸在第 1 拍，随后 2、3、4 拍做极度松弛的切分回转",
        descEn: "Comparison mode: slam downbeat 1 with immense force, then wild syncopation",
        params: { heavyOne: true },
      },
    ],
    generateStudioPattern: (presetId = "tony_allen_afrobeat"): SequencerPattern => {
      let kickSteps = [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0];
      let snareSteps = [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0];

      if (presetId === "reggae_one_drop") {
        kickSteps = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
        snareSteps = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
      } else if (presetId === "james_brown_the_one") {
        kickSteps = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0];
        snareSteps = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
      }

      const tracks: SequencerTrack[] = [
        {
          track_id: "kick",
          name: "Kick (Downbeat Omitted)",
          steps: kickSteps,
          instrument: "percussion",
          volume: 0.95,
          pan: 0,
          mute: false,
          solo: false,
        },
        {
          track_id: "snare",
          name: "Snare / Rim",
          steps: snareSteps,
          instrument: "percussion",
          volume: 0.85,
          pan: 0,
          mute: false,
          solo: false,
        },
        {
          track_id: "hihat",
          name: "Driving Hi-Hat",
          steps: [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0],
          instrument: "percussion",
          volume: 0.7,
          pan: -0.2,
          mute: false,
          solo: false,
        },
        {
          track_id: "percussion",
          name: "Afro Shekere / Shaker",
          steps: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
          instrument: "percussion",
          volume: 0.5,
          pan: 0.25,
          mute: false,
          solo: false,
        },
      ];

      return {
        genre_id: "downbeat-masterclass",
        scale: "C Minor",
        bpm: 104,
        timeSignature: "4/4",
        swing: 15,
        tracks,
      };
    },
  },
  {
    id: "balkan_odd_meters",
    index: 4,
    title: {
      zh: "巴尔干奇数拍与非对称细分",
      en: "Balkan Odd Meters & Additive Rhythms",
    },
    subtitle: {
      zh: "7/8 与 9/8：短拍与长拍的非对称跳跃舞蹈",
      en: "7/8 & 9/8: Asymmetrical Short-Long Additive Metric Dance",
    },
    tag: {
      zh: "奇数非对称律动 (Aksak)",
      en: "Asymmetric Aksak Meters",
    },
    originPlace: {
      zh: "保加利亚、希腊、马其顿、塞尔维亚与土耳其",
      en: "Bulgaria, Greece, North Macedonia, Serbia & Anatolia",
    },
    originEra: "巴尔干古老民间民俗传统",
    culturalContext: {
      zh: "巴尔干地区的奇数拍并非简单的数学拼凑，而是一种称为「Aksak（土耳其语：瘸行 / 倾斜摇摆）」的加法节拍系统（Additive Meter）。人们根据脚步行走的「短步（2 步）」与「长步（3 步）」组合出令人心跳加速的灵动圈舞（Horo）。",
      en: "Balkan odd meters are structured around the concept of 'Aksak' (Turkish for 'limping/tilting') additive rhythms. Dances are formed by alternating short pulses (2 sixteenths) and elongated pulses (3 sixteenths) mimicking dynamic human gait.",
    },
    acousticPrinciple: {
      zh: "在 7/8 拍中，最著名的 Kalamatianos 模式划分为 2 + 2 + 3（短-短-长），长拍位于小节末尾产生一种优雅的悬停与滑步感；而 Lesnoto 则为 3 + 2 + 2（长-短-短），重音在前冲刺起步。",
      en: "In 7/8, the Kalamatianos rhythm structures beats as 2+2+3 (Short-Short-Long), where the extended 3-beat creates an airborne lift. The Lesnoto meter divides as 3+2+2 (Long-Short-Short), front-loading the accent.",
    },
    defaultBpm: 132,
    presets: [
      {
        id: "kalamatianos_78",
        nameZh: "希腊 7/8 拍 Kalamatianos (2+2+3 短-短-长)",
        nameEn: "7/8 Kalamatianos (2+2+3 Short-Short-Long)",
        descZh: "优雅经典的短-短-长，长拍结尾犹如轻盈一跃落地",
        descEn: "Short-Short-Long pulse pattern with airborne resolution",
        params: { division: [2, 2, 3] },
      },
      {
        id: "lesnoto_78",
        nameZh: "马其顿 7/8 拍 Lesnoto (3+2+2 长-短-短)",
        nameEn: "7/8 Lesnoto (3+2+2 Long-Short-Short)",
        descZh: "长拍在首，沉郁而极富弹性的下沉跨步",
        descEn: "Long-Short-Short pattern front-loading dynamic weight",
        params: { division: [3, 2, 2] },
      },
      {
        id: "karsilama_98",
        nameZh: "土耳其/巴尔干 9/8 拍 Karsilama (2+2+2+3)",
        nameEn: "9/8 Karsilama (2+2+2+3 Short-Short-Short-Long)",
        descZh: "吉普赛婚礼与集市最具感染力的 9 拍狂欢摇摆",
        descEn: "Sensual 9/8 additive gypsy dance meter ending on triplet kick",
        params: { division: [2, 2, 2, 3] },
      },
    ],
    generateStudioPattern: (presetId = "kalamatianos_78"): SequencerPattern => {
      // Mapped to 14/16 grid for loopability
      const is78 = presetId.includes("78");
      const kickSteps = is78
        ? [1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0]
        : [1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0];

      const tracks: SequencerTrack[] = [
        {
          track_id: "kick",
          name: "Davul Heavy Bass",
          steps: kickSteps,
          instrument: "percussion",
          volume: 1.0,
          pan: 0,
          mute: false,
          solo: false,
        },
        {
          track_id: "snare",
          name: "Tapan Rim Accent",
          steps: [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0],
          instrument: "percussion",
          volume: 0.85,
          pan: 0.1,
          mute: false,
          solo: false,
        },
        {
          track_id: "hihat",
          name: "Zill Finger Cymbals",
          steps: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
          instrument: "percussion",
          volume: 0.6,
          pan: -0.2,
          mute: false,
          solo: false,
        },
      ];

      return {
        genre_id: "balkan-masterclass",
        scale: "C Minor",
        bpm: 132,
        timeSignature: "7/8",
        swing: 0,
        tracks,
      };
    },
  },
  {
    id: "dilla_microtiming",
    index: 5,
    title: {
      zh: "J Dilla 微时序与非量化摇摆",
      en: "J Dilla Microtiming & Human Swing",
    },
    subtitle: {
      zh: "解构 MPC 松弛感：前冲底鼓、迟滞军鼓与微动态拖拽",
      en: "Deconstructing MPC Drunk Feel: Pushing Kicks, Dragging Snares & Humanized Swing",
    },
    tag: {
      zh: "非量化人脑时间感知",
      en: "Unquantized Human Time Feel",
    },
    originPlace: {
      zh: "美国密歇根州底特律（Conant Gardens）",
      en: "Detroit, Michigan (Conant Gardens)",
    },
    originEra: "1990年代中 ~ 2000年代（Slum Village / Donuts）",
    culturalContext: {
      zh: "在 90 年代所有制作人都把鼓点死死锁在 16 分音符自动量化网格（Auto-Quantize）上时，底特律天才 J Dilla（James Yancey）关闭了 Akai MPC3000 的自动对齐功能，徒手用手指实时敲击出带有微小时间偏离（Microtiming）的摇摆。这种介于直拍与三连音之间的「醉酒步态（Drunk Beat）」彻底重塑了嘻哈、R&B 与现代爵士（如 Questlove、Robert Glasper）。",
      en: "When 90s hip-hop rigidly snapped all drum hits to digital auto-quantize grids, Detroit visionary J Dilla disabled quantize on his Akai MPC3000, playing rhythms live with deliberate microtiming offsets. This loose 'drunk feel' floating between straight and triplet grids redefined hip-hop, neo-soul, and modern jazz.",
    },
    acousticPrinciple: {
      zh: "Dilla 律动的核心秘密在于分轨微时序位移：底鼓通常略微抢拍（-15ms 至 -25ms）带来前冲渴望感；而军鼓则故意拖延（+30ms 至 +45ms）产生极度慵懒深陷感；踩镲音量忽大忽小并游走在五连音边缘，催生出令人无法抗拒的摇头律动（Head-nodding bounce）。",
      en: "The acoustic secret of Dilla time lies in decoupled track micro-shifts: kick drums nudge slightly ahead (-15ms to -25ms) creating forward eagerness; snares lag behind (+30ms to +45ms) for that deep laid-back pocket; while hi-hat dynamics oscillate naturally on the edge of quintuplets.",
    },
    defaultBpm: 88,
    presets: [
      {
        id: "dilla_drunk_swing",
        nameZh: "经典 Dilla Drunk 摇摆 (底鼓微抢 + 军鼓微拖)",
        nameEn: "Classic Dilla Drunk Pocket (Pushed Kick, Dragging Snare)",
        descZh: "关闭量化，底鼓抢拍 20ms，军鼓拖后 35ms，纯正 Donuts 专辑灵魂",
        descEn: "Unquantized feel with pushed kick (-20ms) and deeply laid-back snare (+35ms)",
        params: { kickShift: -20, snareShift: 35, swingAmount: 58 },
      },
      {
        id: "rigid_quantized",
        nameZh: "死板完全量化 (0ms 机械网格 对照组)",
        nameEn: "Rigid Quantized (0ms Clock Baseline)",
        descZh: "对照组：所有乐器精准踩在 1/16 网格点上，听觉生硬缺乏呼吸感",
        descEn: "Exact 16th grid alignment for direct comparison against human microtiming",
        params: { kickShift: 0, snareShift: 0, swingAmount: 0 },
      },
      {
        id: "mpc_62_swing",
        nameZh: "经典 MPC 62% 摇摆 (Boom Bap 黄金标准)",
        nameEn: "MPC 62% Golden Swing",
        descZh: "90s 东岸嘻哈（Pete Rock, Premier）经典半自动规整摇摆",
        descEn: "The 90s boom-bap gold standard of steady even-step delay",
        params: { kickShift: 0, snareShift: 0, swingAmount: 62 },
      },
    ],
    generateStudioPattern: (presetId = "dilla_drunk_swing"): SequencerPattern => {
      const isDilla = presetId === "dilla_drunk_swing";
      const swing = isDilla ? 55 : presetId === "mpc_62_swing" ? 62 : 0;

      const tracks: SequencerTrack[] = [
        {
          track_id: "kick",
          name: "Dilla Sub Kick",
          steps: [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
          instrument: "percussion",
          volume: 1.0,
          pan: 0,
          mute: false,
          solo: false,
        },
        {
          track_id: "snare",
          name: "Fat Rim/Snare (Laid Back)",
          steps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
          instrument: "percussion",
          volume: 0.9,
          pan: 0,
          mute: false,
          solo: false,
        },
        {
          track_id: "hihat",
          name: "Unquantized Dusty Hat",
          steps: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
          instrument: "percussion",
          volume: 0.7,
          pan: -0.15,
          mute: false,
          solo: false,
        },
        {
          track_id: "bass",
          name: "Low-end Motown Bass",
          steps: [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
          instrument: "percussion",
          volume: 0.85,
          pan: 0,
          mute: false,
          solo: false,
        },
      ];

      return {
        genre_id: "dilla-masterclass",
        scale: "C Minor",
        bpm: 88,
        timeSignature: "4/4",
        swing,
        tracks,
      };
    },
  },
];
