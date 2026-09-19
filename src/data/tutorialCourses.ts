import type { NavTab } from "../app/navigation";
import type { MessageKey } from "../i18n/locales";

export interface TutorialCourseStep {
  labelKey: MessageKey;
  tipZh?: string;
  tipEn?: string;
  targetTab?: NavTab;
  /**
   * The control this step is about.
   *
   * The coach used to be words only: it could switch to the right *view*, but nothing pointed at the
   * button or cell the text described — "click a step cell" with no step cell indicated, which is the
   * remaining half of U2. The coach now dims the app, rings this control and keeps the app
   * interactive, so the instruction can actually be followed.
   *
   * An attribute pair rather than a raw CSS selector, because that is what makes the anchor
   * *checkable*: `tutorialCoachAnchor.test.tsx` greps `src/` for the attribute and fails when a
   * control is renamed or deleted, so a step can never quietly point at nothing.
   *
   * A step whose control does not exist on the current surface (a phone layout, a closed panel) is
   * reported as such instead of showing a ring around empty space.
   */
  anchor?: { attribute: "data-testid" | "data-toolbar-id"; value: string };
}

export interface TutorialCourseDef {
  id: string;
  titleKey: MessageKey;
  descKey: MessageKey;
  targetTab: NavTab;
  targetBtnZh: string;
  targetBtnEn: string;
  secondaryTab?: NavTab;
  secondaryBtnZh?: string;
  secondaryBtnEn?: string;
  steps: TutorialCourseStep[];
}

export const TUTORIAL_COURSES: TutorialCourseDef[] = [
  {
    id: "drum",
    titleKey: "tut_drum_title",
    descKey: "tut_drum_desc",
    targetTab: "studio",
    targetBtnZh: "进入编曲台编排鼓机",
    targetBtnEn: "Launch Sequencer Grid",
    steps: [
      {
        labelKey: "tut_drum_s1",
        tipZh: "四四拍是 House、Techno 和 Funk 的经典基底",
        tipEn: "Four-on-the-floor is the backbone of House & Techno",
        targetTab: "studio",
        anchor: { attribute: "data-toolbar-id", value: "play" },
      },
      {
        labelKey: "tut_drum_s2",
        tipZh: "军鼓提供清晰的反拍律动点",
        tipEn: "Snare drives the essential rhythmic backbeat",
        targetTab: "studio",
        // Track 1, step 4: the backbeat the tip is describing, on the grid itself.
        anchor: { attribute: "data-testid", value: "step-cell-1-4" },
      },
      {
        labelKey: "tut_drum_s3",
        tipZh: "欧几里得律动利用最大公约数算法分布节奏点",
        tipEn: "Euclidean math distributes hits across steps evenly",
        targetTab: "studio",
        anchor: { attribute: "data-toolbar-id", value: "euclid" },
      },
      {
        labelKey: "tut_drum_s4",
        tipZh: "高对比度力度通道提供从 p 到 fff 的动态控制",
        tipEn: "Dynamic velocity shaping from p to fff adds realism",
        targetTab: "studio",
        anchor: { attribute: "data-toolbar-id", value: "velocity-lane" },
      },
    ],
  },
  {
    id: "piano",
    titleKey: "tut_piano_title",
    descKey: "tut_piano_desc",
    targetTab: "studio",
    targetBtnZh: "打开钢琴卷帘编曲",
    targetBtnEn: "Open Piano Roll Canvas",
    steps: [
      {
        labelKey: "tut_piano_s1",
        tipZh: "支持黑白键全音域纵向排布与音符拖拽",
        tipEn: "High-contrast full-range pitch canvas with dragging",
        targetTab: "studio",
        anchor: { attribute: "data-testid", value: "toolbar-piano-roll-toggle" },
      },
      {
        labelKey: "tut_piano_s2",
        tipZh: "22 种音阶高亮辅助避免写出离调音",
        tipEn: "In-scale lanes and ROOT watermarks guide harmonic writing",
        targetTab: "studio",
      },
      {
        labelKey: "tut_piano_s3",
        tipZh: "和弦印章支持三和弦、七和弦、九和弦与挂留和弦",
        tipEn: "Multi-note chord ghost preview stamps full voicings",
        targetTab: "studio",
        anchor: { attribute: "data-testid", value: "piano-roll-progression-suite" },
      },
      {
        labelKey: "tut_piano_s4",
        tipZh: "升序 (Arp ▲) 与降序 (Arp ▼) 琶音器一键展开",
        tipEn: "Arpeggiate selected chord notes chronologically across steps",
        targetTab: "studio",
        anchor: { attribute: "data-testid", value: "piano-roll-arp-up" },
      },
    ],
  },
  {
    id: "mixer",
    titleKey: "tut_mixer_title",
    descKey: "tut_mixer_desc",
    targetTab: "console",
    targetBtnZh: "进入独立硬件调音台",
    targetBtnEn: "Open Console Mixer",
    steps: [
      {
        labelKey: "tut_mixer_s1",
        tipZh: "具备多轨独立推子、声像平衡与静音独奏",
        tipEn: "Full channel strips with precision faders and mute/solo",
        targetTab: "console",
        anchor: { attribute: "data-testid", value: "console-fader-0" },
      },
      {
        labelKey: "tut_mixer_s2",
        tipZh: "立体声乒乓延迟与算法混响总线发送",
        tipEn: "Dedicated stereo ping-pong delay and algorithmic reverb buses",
        targetTab: "console",
      },
      {
        labelKey: "tut_mixer_s3",
        tipZh: "母带级真实峰值砖墙限制器杜绝爆音",
        tipEn: "True-peak brickwall limiter protects master output",
        targetTab: "console",
      },
    ],
  },
  {
    id: "acoustics",
    titleKey: "tut_acoustics_title",
    descKey: "tut_acoustics_desc",
    targetTab: "analyzer",
    targetBtnZh: "查看全景声谱分析仪",
    targetBtnEn: "Open Panoramic Analyzer",
    secondaryTab: "kick",
    secondaryBtnZh: "进入底鼓实验室",
    secondaryBtnEn: "Kick Anatomy Lab",
    steps: [
      {
        labelKey: "tut_acoustics_s1",
        tipZh: "可在底鼓实验室解构击打瞬态与低频下潜",
        tipEn: "Inspect kick transient clicks, pitch drop, and resonance",
        targetTab: "kick",
      },
      {
        labelKey: "tut_acoustics_s2",
        tipZh: "32 频段高精频谱与李萨如立体声相位椭圆",
        tipEn: "Real-time FFT spectrogram and Lissajous phase scope",
        targetTab: "analyzer",
      },
      {
        labelKey: "tut_acoustics_s3",
        tipZh: "内置 440Hz 纯音与粉红噪声校准发生器",
        tipEn: "Reference sine wave and pink noise signal generator",
        targetTab: "analyzer",
      },
    ],
  },
  {
    id: "maker",
    titleKey: "tut_maker_title",
    descKey: "tut_maker_desc",
    targetTab: "maker",
    targetBtnZh: "进入曲风制作工坊",
    targetBtnEn: "Open Genre Maker",
    steps: [
      {
        labelKey: "tut_maker_s1",
        tipZh: "可自由分叉 159 种曲风或从零构建全新流派",
        tipEn: "Fork existing genres or craft hybrid musical styles",
        targetTab: "maker",
      },
      {
        labelKey: "tut_maker_s2",
        tipZh: "定制 BPM、摇摆律动、合成器参数与打击乐",
        tipEn: "Customize tempo, swing, synth timbres, and step patterns",
        targetTab: "maker",
      },
      {
        labelKey: "tut_maker_s3",
        tipZh: "生成包含完整参数的无损压缩 URL 链接分享",
        tipEn: "Share lossless compressed URLs or export GS1 patch bundles",
        targetTab: "maker",
      },
    ],
  },
  {
    id: "chords",
    titleKey: "tut_chords_title",
    descKey: "tut_chords_desc",
    targetTab: "chords",
    targetBtnZh: "进入和弦工坊编配",
    targetBtnEn: "Open Chord Studio",
    steps: [
      {
        labelKey: "tut_chords_s1",
        tipZh: "提供大调、自然小调与各类和声模态调式中心",
        tipEn: "Select root keys and explore major/minor modal theory",
        targetTab: "chords",
      },
      {
        labelKey: "tut_chords_s2",
        tipZh: "内置王道进行、爵士2-5-1、流行4和弦等经典走向",
        tipEn: "Load curated progressions from Hooktheory & classic hits",
        targetTab: "chords",
      },
      {
        labelKey: "tut_chords_s3",
        tipZh: "弹奏方式支持抒情分解、扫弦、琶音与柱式和弦",
        tipEn: "Audition ballad, strum, arpeggio, and block chord voicings",
        targetTab: "chords",
      },
      {
        labelKey: "tut_chords_s4",
        tipZh: "将和弦骨架与琶音一键烘焙并加载回工作台编曲",
        tipEn: "Bake progressions directly into Studio sequencer tracks",
        targetTab: "chords",
      },
    ],
  },
  {
    id: "masterclass",
    titleKey: "tut_masterclass_title",
    descKey: "tut_masterclass_desc",
    targetTab: "masterclass",
    targetBtnZh: "进入节奏律动实验室",
    targetBtnEn: "Open Rhythm & Grooves Lab",
    steps: [
      {
        labelKey: "tut_masterclass_s1",
        tipZh: "包含复节奏对撞、拉丁Clave演化、反拍重音消隐等深度律动课题",
        tipEn: "Explore Polyrhythm Colliders, Clave Trees, and Odd Meters",
        targetTab: "masterclass",
      },
      {
        labelKey: "tut_masterclass_s2",
        tipZh: "通过粒子对撞示波器与动态时钟感悟数学律动美感",
        tipEn: "Interact with live step visualizers and timing experiments",
        targetTab: "masterclass",
      },
      {
        labelKey: "tut_masterclass_s3",
        tipZh: "跟随 J Dilla 微时序解构人声与贝斯后置拉扯感",
        tipEn: "Deconstruct J Dilla swing delay and drunk drum feels",
        targetTab: "masterclass",
      },
      {
        labelKey: "tut_masterclass_s4",
        tipZh: "考核挑战模式实时评分反馈打击精度",
        tipEn: "Complete tap challenges with real-time millisecond scoring",
        targetTab: "masterclass",
      },
    ],
  },
  {
    id: "galaxy",
    titleKey: "tut_galaxy_title",
    descKey: "tut_galaxy_desc",
    targetTab: "galaxy",
    targetBtnZh: "漫游曲风星系图谱",
    targetBtnEn: "Explore Genre Galaxy",
    steps: [
      {
        labelKey: "tut_galaxy_s1",
        tipZh: "三维立体星系可视化呈现全球 159 种现代音乐流派",
        tipEn: "3D interactive galaxy mapping 159 global music styles",
        targetTab: "galaxy",
      },
      {
        labelKey: "tut_galaxy_s2",
        tipZh: "节点间发光引力连线揭示曲风衍化、融合与传承脉络",
        tipEn: "Luminous lineage connections illustrate influences & roots",
        targetTab: "galaxy",
      },
      {
        labelKey: "tut_galaxy_s3",
        tipZh: "横向演变轴与纵向时间轴多重视角穿梭百年音乐史",
        tipEn: "Navigate horizontal and vertical evolutionary timelines",
        targetTab: "galaxy",
      },
      {
        labelKey: "tut_galaxy_s4",
        tipZh: "轻点任意星体即时触发真实曲风试听与一键编曲",
        tipEn: "Click any galaxy node for instant audition and arrangement",
        targetTab: "galaxy",
      },
    ],
  },
];
