import React, { useState, useRef, useEffect, useMemo } from "react";
import { 
  Play, 
  Pause, 
  Square,
  RotateCcw, 
  Clock, 
  Sliders, 
  Volume2, 
  Sparkles,
  Filter,
  GitBranch,
  Layers,
  Activity,
  ChevronRight,
  Disc,
  Compass,
  ArrowRight
} from "lucide-react";
import { Genre, GenreCategory } from "../types/genre";
import { 
  HOUSE_GENRES,
  TECHNO_GENRES,
  TRANCE_GENRES,
  DUBSTEP_GENRES,
  DNB_GENRES,
  UK_BASS_GENRES,
  TRAP_DRILL_GENRES,
  FUTURE_DOWNTEMPO_GENRES,
  HARD_ELECTRO_GENRES,
  ROCK_METAL_GENRES,
  HIPHOP_GENRES,
  JAZZ_BLUES_GENRES,
  POP_RNB_GENRES,
  LATIN_WORLD_GENRES,
} from "../data/genres";
import { AudioEngine } from "../audio/AudioEngine";
import { useLanguage } from "../i18n/LanguageContext";

interface HorizontalTimelineViewProps {
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
}

interface LaneConfig {
  id: string;
  name: { zh: string; en: string };
  category: GenreCategory;
  color: {
    primary: string;       // Hex accent
    secondary: string;     // Lighter accent
    border: string;        // Tailwind border class
    hoverBorder: string;
    bgTint: string;
    glow: string;
  };
  genres: Genre[];
  birthDecade: number;     // e.g. 1980
  predecessor: { zh: string; en: string };
}

const LANES: LaneConfig[] = [
  {
    id: "house",
    name: { zh: "浩室音乐演化脉络", en: "House Music Evolution" },
    category: "Electronic",
    color: {
      primary: "#f43f5e",
      secondary: "#fb7185",
      border: "border-rose-500/40",
      hoverBorder: "hover:border-rose-400",
      bgTint: "bg-rose-500/10 text-rose-300 border-rose-500/30",
      glow: "rgba(244,63,94,0.35)",
    },
    genres: HOUSE_GENRES,
    birthDecade: 1980,
    predecessor: {
      zh: "溯源自 70s Disco、Philadelphia Soul 与 Funk 鼓机四四拍实验",
      en: "Rooted in 70s Disco, Philadelphia Soul & Funk 4-on-the-floor drum machines"
    },
  },
  {
    id: "techno",
    name: { zh: "底特律科技舞曲演进", en: "Detroit Techno Lineage" },
    category: "Electronic",
    color: {
      primary: "#06b6d4",
      secondary: "#22d3ee",
      border: "border-cyan-500/40",
      hoverBorder: "hover:border-cyan-400",
      bgTint: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
      glow: "rgba(6,182,212,0.35)",
    },
    genres: TECHNO_GENRES,
    birthDecade: 1980,
    predecessor: {
      zh: "溯源自 70s 德国 Krautrock (Kraftwerk) 与底特律汽车城工业电子放克",
      en: "Rooted in 70s Krautrock (Kraftwerk) & Detroit industrial electronic funk"
    },
  },
  {
    id: "trance",
    name: { zh: "出神音乐史与旋律演进", en: "Trance Journey & Euphoria" },
    category: "Electronic",
    color: {
      primary: "#3b82f6",
      secondary: "#60a5fa",
      border: "border-blue-500/40",
      hoverBorder: "hover:border-blue-400",
      bgTint: "bg-blue-500/15 text-blue-300 border-blue-500/30",
      glow: "rgba(59,130,246,0.35)",
    },
    genres: TRANCE_GENRES,
    birthDecade: 1990,
    predecessor: {
      zh: "溯源自 80s 酸性浩室 (Acid House)、早期 Euro Techno 与德国氛围合成器琶音",
      en: "Rooted in 80s Acid House, Euro Techno & ambient synthesizer arpeggios"
    },
  },
  {
    id: "dnb",
    name: { zh: "鼓打贝斯与丛林破拍", en: "Drum & Bass / Jungle" },
    category: "Electronic",
    color: {
      primary: "#f97316",
      secondary: "#fb923c",
      border: "border-orange-500/40",
      hoverBorder: "hover:border-orange-400",
      bgTint: "bg-orange-500/15 text-orange-300 border-orange-500/30",
      glow: "rgba(249,115,22,0.35)",
    },
    genres: DNB_GENRES,
    birthDecade: 1990,
    predecessor: {
      zh: "溯源自 英国硬核破拍 (Hardcore Breakbeat)、牙买加音响系统与 Amen Break 变速切片",
      en: "Rooted in UK Hardcore Breakbeat, Jamaican soundsystems & Amen Break chopping"
    },
  },
  {
    id: "dubstep",
    name: { zh: "回响贝斯与重低音浪潮", en: "Dubstep & Heavy Bass Waves" },
    category: "Electronic",
    color: {
      primary: "#a855f7",
      secondary: "#c084fc",
      border: "border-purple-500/40",
      hoverBorder: "hover:border-purple-400",
      bgTint: "bg-purple-500/15 text-purple-300 border-purple-500/30",
      glow: "rgba(168,85,247,0.35)",
    },
    genres: DUBSTEP_GENRES,
    birthDecade: 2000,
    predecessor: {
      zh: "溯源自 90s UK Garage 2-Step、牙买加 Dub 空间混响与暗黑丛林次低音",
      en: "Rooted in 90s UK Garage 2-Step, Jamaican Dub reverb & dark jungle sub-bass"
    },
  },
  {
    id: "uk_bass",
    name: { zh: "英国低音与车库碎拍体系", en: "UK Bass & Garage Continuum" },
    category: "Electronic",
    color: {
      primary: "#14b8a6",
      secondary: "#2dd4bf",
      border: "border-teal-500/40",
      hoverBorder: "hover:border-teal-400",
      bgTint: "bg-teal-500/15 text-teal-300 border-teal-500/30",
      glow: "rgba(20,184,166,0.35)",
    },
    genres: UK_BASS_GENRES,
    birthDecade: 1990,
    predecessor: {
      zh: "溯源自 90s 英国海盗电台文化、Speed Garage、加勒比移民音响与 2-Step 摇摆",
      en: "Rooted in 90s UK pirate radio, Speed Garage, Caribbean soundsystems & 2-Step swing"
    },
  },
  {
    id: "trap_drill",
    name: { zh: "陷阱说唱与钻头重低音", en: "Trap & Drill Sonic Movement" },
    category: "Hip Hop",
    color: {
      primary: "#eab308",
      secondary: "#fde047",
      border: "border-yellow-500/40",
      hoverBorder: "hover:border-yellow-400",
      bgTint: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
      glow: "rgba(234,179,8,0.35)",
    },
    genres: TRAP_DRILL_GENRES,
    birthDecade: 2000,
    predecessor: {
      zh: "溯源自 90s 美国南部亚特兰大脏南嘻哈、Roland TR-808 次重低音与密集三连音滚奏",
      en: "Rooted in 90s Dirty South hip-hop, Roland TR-808 sub-bass & rapid hi-hat rolls"
    },
  },
  {
    id: "future_downtempo",
    name: { zh: "未来流派与慢摇氛围美学", en: "Future & Ambient Soundscapes" },
    category: "Electronic",
    color: {
      primary: "#ec4899",
      secondary: "#f472b6",
      border: "border-pink-500/40",
      hoverBorder: "hover:border-pink-400",
      bgTint: "bg-pink-500/15 text-pink-300 border-pink-500/30",
      glow: "rgba(236,72,153,0.35)",
    },
    genres: FUTURE_DOWNTEMPO_GENRES,
    birthDecade: 1990,
    predecessor: {
      zh: "溯源自 90s Warp Records 智能舞曲 (IDM)、环境声学与 8-bit 电玩音效芯片",
      en: "Rooted in 90s Warp IDM, ambient soundscapes & 8-bit chiptune sound chips"
    },
  },
  {
    id: "hard_electro",
    name: { zh: "硬核舞曲、电音与极速碰撞", en: "Hard Dance & Electro Fusion" },
    category: "Electronic",
    color: {
      primary: "#ef4444",
      secondary: "#f87171",
      border: "border-red-500/40",
      hoverBorder: "hover:border-red-400",
      bgTint: "bg-red-500/15 text-red-300 border-red-500/30",
      glow: "rgba(239,68,68,0.35)",
    },
    genres: HARD_ELECTRO_GENRES,
    birthDecade: 1980,
    predecessor: {
      zh: "溯源自 80s 工业 EBM、电音放克与鹿特丹 909 失真硬核大鼓风暴",
      en: "Rooted in 80s Industrial EBM, Electro Funk & Rotterdam distorted 909 kicks"
    },
  },
  {
    id: "hiphop",
    name: { zh: "经典嘻哈与城市音乐浪潮", en: "Hip-Hop Golden Age & Urban" },
    category: "Hip Hop",
    color: {
      primary: "#f59e0b",
      secondary: "#fbbf24",
      border: "border-amber-500/40",
      hoverBorder: "hover:border-amber-400",
      bgTint: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      glow: "rgba(245,158,11,0.35)",
    },
    genres: HIPHOP_GENRES,
    birthDecade: 1970,
    predecessor: {
      zh: "溯源自 70s 纽约布朗克斯街区派对、放克鼓组 Break 循环切片与牙买加 MC Toasting",
      en: "Rooted in 70s Bronx block parties, Funk drum breaks & Jamaican MC toasting"
    },
  },
  {
    id: "rock_metal",
    name: { zh: "摇滚、朋克与重金属脉络", en: "Rock & Heavy Metal Waves" },
    category: "Rock/Metal",
    color: {
      primary: "#dc2626",
      secondary: "#ef4444",
      border: "border-red-600/40",
      hoverBorder: "hover:border-red-500",
      bgTint: "bg-red-600/15 text-red-300 border-red-600/30",
      glow: "rgba(220,38,38,0.35)",
    },
    genres: ROCK_METAL_GENRES,
    birthDecade: 1950,
    predecessor: {
      zh: "溯源自 50s 芝加哥电吉他蓝调、迷幻摇滚与早期重型电子管失真实验",
      en: "Rooted in 50s Chicago electric blues, psychedelic rock & heavy tube distortion"
    },
  },
  {
    id: "jazz_blues",
    name: { zh: "爵士与蓝调世纪根源", en: "Jazz & Blues Century Roots" },
    category: "Jazz/Blues",
    color: {
      primary: "#6366f1",
      secondary: "#818cf8",
      border: "border-indigo-500/40",
      hoverBorder: "hover:border-indigo-400",
      bgTint: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
      glow: "rgba(99,102,241,0.35)",
    },
    genres: JAZZ_BLUES_GENRES,
    birthDecade: 1900,
    predecessor: {
      zh: "溯源自 19世纪非裔灵歌、密西西比三角洲蓝调与新奥尔良铜管切分节奏",
      en: "Rooted in 19th-century African-American spirituals, Delta blues & ragtime syncopation"
    },
  },
  {
    id: "pop_rnb",
    name: { zh: "流行、节奏蓝调与放克变革", en: "Pop, R&B & Funk Revolutions" },
    category: "Pop/R&B",
    color: {
      primary: "#db2777",
      secondary: "#f472b6",
      border: "border-pink-600/40",
      hoverBorder: "hover:border-pink-500",
      bgTint: "bg-pink-600/15 text-pink-300 border-pink-600/30",
      glow: "rgba(219,39,119,0.35)",
    },
    genres: POP_RNB_GENRES,
    birthDecade: 1950,
    predecessor: {
      zh: "溯源自 50s 摩城之声、福音圣乐与 James Brown 放克重击第一拍变革",
      en: "Rooted in 50s Motown soul, gospel rhythms & James Brown's 'The One' funk"
    },
  },
  {
    id: "latin_world",
    name: { zh: "拉丁与全球世界律动", en: "Latin & Global World Grooves" },
    category: "Latin/World",
    color: {
      primary: "#059669",
      secondary: "#10b981",
      border: "border-emerald-600/40",
      hoverBorder: "hover:border-emerald-500",
      bgTint: "bg-emerald-600/15 text-emerald-300 border-emerald-600/30",
      glow: "rgba(5,150,105,0.35)",
    },
    genres: LATIN_WORLD_GENRES,
    birthDecade: 1940,
    predecessor: {
      zh: "溯源自 西非对位复节奏 (Polyrhythm)、古巴 Clave 节奏骨架与加勒比海岛民谣",
      en: "Rooted in West African polyrhythms, Cuban Clave framework & Caribbean folk"
    },
  },
];

interface TimelineColumnDef {
  id: string;
  label: string;
  tag: { zh: string; en: string };
  desc: { zh: string; en: string };
  widthClass: string;
  filter: (g: Genre) => boolean;
  yearThreshold: number;
}

// 1. Non-linear adaptive epoch scale: expands dense eras, compacts early roots, eliminates blank space
const NONLINEAR_EPOCHS: TimelineColumnDef[] = [
  {
    id: "roots",
    label: "1900–1960s",
    tag: { zh: "根源奠基", en: "Roots Era" },
    desc: { zh: "Jazz, Blues, Rock'n'Roll & Bossa", en: "Acoustic Foundations" },
    widthClass: "min-w-[240px] flex-[1.4]",
    filter: (g: Genre) => (g.origin_decade || 1980) <= 1960,
    yearThreshold: 1960,
  },
  {
    id: "70s",
    label: "1970s",
    tag: { zh: "电子启蒙", en: "Synth Dawn" },
    desc: { zh: "Disco, Funk, Krautrock & Synth-Pop", en: "Disco & Funk Pulse" },
    widthClass: "min-w-[280px] flex-[1.8]",
    filter: (g: Genre) => g.origin_decade === 1970,
    yearThreshold: 1970,
  },
  {
    id: "80s",
    label: "1980s",
    tag: { zh: "黄金诞生", en: "Golden Birth" },
    desc: { zh: "House, Techno & Golden Hip-Hop", en: "House & Techno Genesis" },
    widthClass: "min-w-[460px] flex-[3.8]",
    filter: (g: Genre) => g.origin_decade === 1980,
    yearThreshold: 1980,
  },
  {
    id: "90s",
    label: "1990s",
    tag: { zh: "全球大爆发", en: "Explosion" },
    desc: { zh: "Trance, Jungle, DnB, IDM & Garage", en: "The Electronic Explosion" },
    widthClass: "min-w-[700px] flex-[5.8]",
    filter: (g: Genre) => g.origin_decade === 1990,
    yearThreshold: 1990,
  },
  {
    id: "00s",
    label: "2000s",
    tag: { zh: "千禧浪潮", en: "Millennium" },
    desc: { zh: "Dubstep, Grime & Electro House", en: "Bass Revolution" },
    widthClass: "min-w-[420px] flex-[3.2]",
    filter: (g: Genre) => g.origin_decade === 2000,
    yearThreshold: 2000,
  },
  {
    id: "10s_now",
    label: "2010s–2020s+",
    tag: { zh: "现代微流派", en: "Modern Era" },
    desc: { zh: "Trap, Drill, Future Bass & Hyperpop", en: "Internet & Hybrid Grooves" },
    widthClass: "min-w-[540px] flex-[4.4]",
    filter: (g: Genre) => (g.origin_decade || 1980) >= 2010,
    yearThreshold: 2024,
  },
];

// 2. Linear equal-width decade scale
const LINEAR_COLUMNS: TimelineColumnDef[] = [1920, 1940, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map((decade) => ({
  id: String(decade),
  label: `${decade}s`,
  tag: { zh: `${decade} 年代`, en: `${decade}s` },
  desc: { zh: `${decade} 年代典型曲风`, en: `Decade of ${decade}s` },
  widthClass: "min-w-[280px] flex-1",
  filter: (g: Genre) => {
    if (decade <= 1940) return (g.origin_decade || 1980) <= 1950;
    return g.origin_decade === decade;
  },
  yearThreshold: decade,
}));

export const HorizontalTimelineView: React.FC<HorizontalTimelineViewProps> = ({
  onSelectGenre,
  onOpenStudio,
}) => {
  const { t, language } = useLanguage();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scale mode: "nonlinear" (adaptive, eliminates blank space) vs "linear" (fixed decades)
  const [scaleMode, setScaleMode] = useState<"nonlinear" | "linear">("nonlinear");

  // Animation timeline year
  const [animationPlaying, setAnimationPlaying] = useState(false);
  const [currentYear, setCurrentYear] = useState(2024);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // Active category or lane filter
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [activeLaneFilter, setActiveLaneFilter] = useState<string>("ALL");

  // Realtime audio audition state
  const engineRef = useRef<AudioEngine | null>(null);
  const [playingGenreId, setPlayingGenreId] = useState<string | null>(null);

  // Clean up audio engine on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
        engineRef.current = null;
      }
    };
  }, []);

  // Filtered lanes
  const displayLanes = useMemo(() => {
    let result = LANES;
    if (selectedCategory !== "ALL") {
      result = result.filter((l) => l.category === selectedCategory);
    }
    if (activeLaneFilter !== "ALL") {
      result = result.filter((l) => l.id === activeLaneFilter);
    }
    return result;
  }, [selectedCategory, activeLaneFilter]);

  // Current active columns based on scale mode
  const activeColumns = useMemo(() => {
    return scaleMode === "nonlinear" ? NONLINEAR_EPOCHS : LINEAR_COLUMNS;
  }, [scaleMode]);

  // Animation player loop
  useEffect(() => {
    let timer: any = null;
    if (animationPlaying) {
      timer = setInterval(() => {
        setCurrentYear((prev) => {
          if (prev >= 2024) {
            setAnimationPlaying(false);
            return 2024;
          }
          return prev + 2;
        });
      }, 280 / playbackSpeed);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [animationPlaying, playbackSpeed]);

  const handleStartEvolution = () => {
    setCurrentYear(1920);
    setAnimationPlaying(true);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, behavior: "smooth" });
    }
  };

  const handleTogglePlay = () => {
    if (currentYear >= 2024 && !animationPlaying) {
      setCurrentYear(1920);
    }
    setAnimationPlaying(!animationPlaying);
  };

  // Handle instant audition
  const handleToggleAudition = async (genre: Genre, e: React.MouseEvent) => {
    e.stopPropagation();

    if (playingGenreId === genre.id) {
      if (engineRef.current) {
        engineRef.current.stop();
      }
      setPlayingGenreId(null);
      return;
    }

    if (!engineRef.current) {
      engineRef.current = new AudioEngine({
        onStop: () => setPlayingGenreId(null),
      });
    }

    const engine = engineRef.current;
    engine.stop();
    engine.setPattern(genre.sequencer_pattern);
    setPlayingGenreId(genre.id);
    await engine.play();
  };

  // Scroll smoothly to a column
  const scrollToColumn = (colId: string) => {
    const colElement = document.getElementById(`timeline-col-${colId}`);
    if (colElement && scrollContainerRef.current) {
      const containerRect = scrollContainerRef.current.getBoundingClientRect();
      const colRect = colElement.getBoundingClientRect();
      const scrollOffset = colRect.left - containerRect.left + scrollContainerRef.current.scrollLeft - 240;
      scrollContainerRef.current.scrollTo({ left: Math.max(0, scrollOffset), behavior: "smooth" });
    }
  };

  return (
    <div className="w-full max-w-[1580px] mx-auto px-2 sm:px-4 py-4 space-y-5">
      {/* Luxury Master Control Deck (高端数字演变控制台) */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#141622] via-[#0f1118] to-[#141622] border border-white/[0.08] p-5 shadow-2xl">
        {/* Subtle ambient lighting glows */}
        <div className="absolute top-0 left-1/3 w-80 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-80 h-32 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          {/* Brand & Scale Spec */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/40 flex items-center justify-center text-[#f5b73d] shadow-[0_0_16px_rgba(245,183,61,0.25)]">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-extrabold text-[#f5f4ef] tracking-wide">
                  {t("nav_timeline_h")}
                </h1>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/15 text-[#f5b73d] border border-amber-500/30 font-bold shadow-sm">
                  159 GENRES · 1900–2024
                </span>
              </div>
              <p className="text-xs text-[#8e93a0] mt-0.5">
                {language === "zh" 
                  ? "非线性历史自适应尺度 · 消除留白 · 完整呈现 14 大家族演进脉络与律动细节" 
                  : "Non-linear adaptive scale · 14 Music Genealogies & Detailed Groove DNA"}
              </p>
            </div>
          </div>

          {/* Scale Mode Switcher & Category Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Non-linear vs Linear Mode Toggle */}
            <div className="flex items-center bg-[#090a0e] border border-white/[0.08] rounded-2xl p-1 text-xs font-semibold shadow-inner">
              <button
                onClick={() => setScaleMode("nonlinear")}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  scaleMode === "nonlinear"
                    ? "bg-[#f5b73d] text-black shadow-[0_0_14px_rgba(245,183,61,0.4)] font-bold"
                    : "text-[#8e93a0] hover:text-[#f5f4ef]"
                }`}
                title={language === "zh" ? "根据各时代曲风密度自适应扩展，消除留白" : "Adaptive density-weighted non-linear scale"}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{t("timeline_scale_nonlinear")}</span>
              </button>
              <button
                onClick={() => setScaleMode("linear")}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  scaleMode === "linear"
                    ? "bg-[#f5b73d] text-black shadow-[0_0_14px_rgba(245,183,61,0.4)] font-bold"
                    : "text-[#8e93a0] hover:text-[#f5f4ef]"
                }`}
                title={language === "zh" ? "传统等距年代分布" : "Linear equal-width decades"}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{t("timeline_scale_linear")}</span>
              </button>
            </div>

            {/* Category Filter */}
            <div className="flex items-center space-x-1.5 bg-[#090a0e] px-3 py-1.5 rounded-2xl border border-white/[0.08]">
              <Filter className="w-3.5 h-3.5 text-[#636875]" />
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setActiveLaneFilter("ALL");
                }}
                className="bg-transparent text-[#c4c7cf] text-xs font-semibold focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-[#12131a]">
                  {language === "zh" ? "全部大类 (6)" : "All Categories (6)"}
                </option>
                <option value="Electronic" className="bg-[#12131a]">Electronic 电子舞曲</option>
                <option value="Hip Hop" className="bg-[#12131a]">Hip Hop 嘻哈说唱</option>
                <option value="Rock/Metal" className="bg-[#12131a]">Rock & Metal 摇滚金属</option>
                <option value="Jazz/Blues" className="bg-[#12131a]">Jazz & Blues 爵士蓝调</option>
                <option value="Pop/R&B" className="bg-[#12131a]">Pop & R&B 流行节奏蓝调</option>
                <option value="Latin/World" className="bg-[#12131a]">Latin & World 拉丁世界</option>
              </select>
            </div>

            {/* Lane Selector */}
            <select
              value={activeLaneFilter}
              onChange={(e) => setActiveLaneFilter(e.target.value)}
              className="bg-[#090a0e] border border-white/[0.08] text-[#c4c7cf] text-xs font-semibold px-3 py-1.5 rounded-2xl focus:outline-none focus:border-[#f5b73d] cursor-pointer"
            >
              <option value="ALL" className="bg-[#12131a]">
                {language === "zh" ? `全部演化泳道 (${LANES.length})` : `All Lanes (${LANES.length})`}
              </option>
              {LANES.map((l) => (
                <option key={l.id} value={l.id} className="bg-[#12131a]">
                  {l.name[language]} ({l.genres.length})
                </option>
              ))}
            </select>
          </div>

          {/* Master Transport Console (播放与年历巡航) */}
          <div className="flex items-center space-x-3 bg-[#090a0e]/95 px-4 py-2 rounded-2xl border border-white/[0.08] shadow-inner">
            <button
              onClick={handleTogglePlay}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all ${
                animationPlaying
                  ? "bg-[#f5b73d] text-black shadow-[0_0_14px_rgba(245,183,61,0.5)]"
                  : "bg-indigo-600 hover:bg-indigo-500 text-[#f5f4ef]"
              }`}
            >
              {animationPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{animationPlaying ? t("pause") : (language === "zh" ? "演进播放" : "Play Evolution")}</span>
            </button>

            <button
              onClick={handleStartEvolution}
              className="p-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-[#9ca1ad] hover:text-[#f5f4ef] transition-colors"
              title={language === "zh" ? "从 1920 重置" : "Restart from 1920"}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Current Year Illuminated Display */}
            <div className="flex items-center space-x-2 pl-2 border-l border-white/[0.08]">
              <span className="text-[10px] text-[#636875] font-mono uppercase font-bold tracking-wider">YEAR:</span>
              <span className="text-base font-mono font-extrabold text-[#f5b73d] w-12 drop-shadow-[0_0_8px_rgba(245,183,61,0.4)]">
                {currentYear}
              </span>
            </div>

            {/* Year Range Slider */}
            <input
              type="range"
              min="1920"
              max="2024"
              value={currentYear}
              onChange={(e) => setCurrentYear(Number(e.target.value))}
              className="w-24 sm:w-32 accent-[#f5b73d] cursor-pointer"
            />

            {/* Speed Selector */}
            <div className="flex items-center gap-1 border-l border-white/[0.08] pl-2">
              {[1, 2, 4].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                    playbackSpeed === spd
                      ? "bg-amber-500/20 text-[#f5b73d] font-bold border border-amber-500/40"
                      : "text-[#636875] hover:text-[#9ca1ad]"
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Epoch Quick Jump Bar */}
        <div className="relative z-10 mt-4 pt-3 border-t border-white/[0.06] flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <span className="text-[10px] font-mono uppercase text-[#636875] tracking-wider shrink-0 mr-1">
            {language === "zh" ? "纪元跳转:" : "JUMP:"}
          </span>
          {activeColumns.map((col) => (
            <button
              key={col.id}
              onClick={() => scrollToColumn(col.id)}
              className="px-2.5 py-0.5 rounded-lg bg-[#090a0e] hover:bg-[#1a1d28] border border-white/[0.06] hover:border-white/20 text-[11px] font-mono text-[#9ca1ad] hover:text-[#f5f4ef] transition-colors shrink-0"
            >
              {col.label} · {col.tag[language]}
            </button>
          ))}
        </div>
      </div>

      {/* Horizontal Scrollable Timeline Matrix (横向演化流光矩阵) */}
      <div 
        ref={scrollContainerRef}
        className="bg-[#0b0c11] border border-white/[0.08] rounded-3xl p-4 sm:p-5 shadow-2xl overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-white/10"
      >
        <div className="min-w-[1780px] space-y-6">
          {/* Precision Chronological Ruler */}
          <div className="flex items-stretch border-b border-white/[0.08] pb-4 pl-60">
            {activeColumns.map((col) => {
              const isPast = col.yearThreshold <= currentYear;
              return (
                <div 
                  key={col.id} 
                  id={`timeline-col-${col.id}`}
                  className={`${col.widthClass} px-3 flex flex-col items-center justify-between relative transition-colors border-r border-white/[0.05] last:border-none`}
                >
                  <div className="text-center">
                    <div className={`text-sm font-mono tracking-wider font-extrabold ${isPast ? "text-[#f5b73d] drop-shadow-[0_0_8px_rgba(245,183,61,0.3)]" : "text-[#555a68]"}`}>
                      {col.label}
                    </div>
                    <div className="text-[10px] font-semibold text-[#8e93a0] uppercase tracking-wider mt-0.5">
                      {col.tag[language]}
                    </div>
                    <div className="text-[9.5px] text-[#555a68] truncate max-w-[210px] mt-0.5 font-sans">
                      {col.desc[language]}
                    </div>
                  </div>

                  {/* Laser graduation tick */}
                  <div className="flex flex-col items-center mt-3">
                    <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                      isPast 
                        ? "bg-[#f5b73d] shadow-[0_0_10px_#f5b73d] scale-110" 
                        : "bg-[#181a24] border border-white/[0.1]"
                    }`} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Swimlanes */}
          <div className="space-y-4">
            {displayLanes.map((lane) => {
              return (
                <div 
                  key={lane.id}
                  className="flex items-stretch p-3 rounded-2xl bg-[#0e1017]/90 border border-white/[0.06] hover:border-white/[0.18] transition-all relative shadow-lg"
                >
                  {/* Lane Title & Family Info Column */}
                  <div className="w-60 shrink-0 pr-4 pl-2 flex flex-col justify-between border-r border-white/[0.07]">
                    <div>
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: lane.color.primary, boxShadow: `0 0 10px ${lane.color.glow}` }}
                        />
                        <span 
                          className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border"
                          style={{ 
                            color: lane.color.secondary, 
                            borderColor: `${lane.color.primary}40`,
                            backgroundColor: `${lane.color.primary}15`
                          }}
                        >
                          {lane.category}
                        </span>
                      </div>

                      <h4 className="font-extrabold text-[#f5f4ef] text-sm mt-2.5 leading-snug tracking-wide" title={lane.name[language]}>
                        {lane.name[language]}
                      </h4>
                      <p className="text-[11px] text-[#8e93a0] mt-1 font-mono">
                        {lane.genres.length} {language === "zh" ? "种代表曲风" : "genres"}
                      </p>
                    </div>

                    {/* Lane Inception Badge */}
                    <div className="mt-3 pt-2 border-t border-white/[0.06] text-[10.5px] text-[#636875] flex items-center justify-between">
                      <span>{language === "zh" ? "发源起始纪元:" : "Inception:"}</span>
                      <span 
                        className="font-mono font-bold px-1.5 py-0.5 rounded text-[10px]"
                        style={{
                          color: lane.color.secondary,
                          backgroundColor: `${lane.color.primary}12`,
                        }}
                      >
                        {lane.birthDecade}s
                      </span>
                    </div>
                  </div>

                  {/* Columns for this lane */}
                  <div className="flex-1 flex items-stretch divide-x divide-white/[0.04] pl-2">
                    {activeColumns.map((col) => {
                      const colGenres = lane.genres.filter(col.filter);
                      const hasGenres = colGenres.length > 0;
                      const isPreBirth = col.yearThreshold < lane.birthDecade;

                      return (
                        <div 
                          key={col.id} 
                          className={`${col.widthClass} p-2 flex flex-col justify-center`}
                        >
                          {hasGenres ? (
                            /* Genre Cards Grid */
                            <div className="flex flex-wrap gap-3 items-stretch content-start w-full">
                              {colGenres.map((genre) => {
                                const isRevealed = (genre.origin_decade || 1980) <= currentYear;
                                const isPlayingThis = playingGenreId === genre.id;

                                return (
                                  <div
                                    key={genre.id}
                                    onClick={() => onSelectGenre(genre)}
                                    className={`group relative p-3.5 rounded-2xl transition-all duration-300 flex flex-col justify-between w-full sm:min-w-[210px] sm:max-w-[290px] flex-1 ${
                                      isRevealed 
                                        ? "bg-gradient-to-b from-[#141622] to-[#0c0d12] border border-white/[0.08] shadow-lg cursor-pointer scale-100 opacity-100 hover:border-white/25 hover:-translate-y-0.5" 
                                        : "opacity-20 bg-[#08090d] border-white/[0.03] scale-95 pointer-events-none"
                                    } ${
                                      isPlayingThis 
                                        ? "ring-2 ring-[#f5b73d] shadow-[0_0_24px_rgba(245,183,61,0.4)]" 
                                        : ""
                                    }`}
                                    style={{
                                      borderTopColor: lane.color.primary,
                                      borderTopWidth: 2,
                                    }}
                                  >
                                    {/* Card Top: Name & Origin Year */}
                                    <div>
                                      <div className="flex items-start justify-between gap-1.5">
                                        <h5 
                                          className="font-bold text-xs sm:text-sm text-[#f5f4ef] group-hover:text-[#f5b73d] transition-colors leading-snug line-clamp-1"
                                          title={genre.name}
                                        >
                                          {genre.name}
                                        </h5>
                                        <span 
                                          className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0"
                                          style={{
                                            color: lane.color.secondary,
                                            backgroundColor: `${lane.color.primary}18`,
                                            border: `1px solid ${lane.color.primary}35`
                                          }}
                                        >
                                          {genre.origin_year}
                                        </span>
                                      </div>

                                      {/* Tempo, Meter & Origin Place */}
                                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[#8e93a0]">
                                        <span className="font-mono bg-[#090a0e] px-1.5 py-0.5 rounded border border-white/[0.06] text-[#d6d4ce]">
                                          {genre.time_signature || "4/4"} · {genre.bpm_range} BPM
                                        </span>
                                        <span className="truncate max-w-[100px] text-[#737887]">
                                          {genre.origin_place[language]}
                                        </span>
                                      </div>

                                      {/* Groove Core Box */}
                                      <div className="bg-[#090a0e]/90 border border-white/[0.06] rounded-xl p-2 mt-2.5 group-hover:border-white/15 transition-colors">
                                        <div className="flex items-center justify-between text-[10px] font-bold text-[#8e93a0]">
                                          <span className="flex items-center gap-1 text-[#f5b73d]">
                                            <Sparkles className="w-3 h-3" />
                                            <span>{t("timeline_groove_core")}</span>
                                          </span>
                                        </div>
                                        <p className="text-[10.5px] text-[#b4b7c2] leading-relaxed line-clamp-2 mt-1 font-sans">
                                          {genre.key_characteristics[language] || genre.rhythm_features[language]}
                                        </p>
                                      </div>

                                      {/* Iconic Gear Badges */}
                                      {genre.instrumentation && genre.instrumentation.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1 items-center">
                                          {genre.instrumentation.slice(0, 3).map((gear, idx) => (
                                            <span 
                                              key={idx}
                                              className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-[#161822] text-[#9ca1ad] border border-white/[0.06]"
                                            >
                                              {gear}
                                            </span>
                                          ))}
                                        </div>
                                      )}

                                      {/* Representative Artists */}
                                      {genre.representative_artists && genre.representative_artists.length > 0 && (
                                        <div className="mt-1.5 text-[10px] text-[#737887] truncate">
                                          <span className="text-[#555a68] font-medium">{t("timeline_pioneers")}: </span>
                                          <span className="text-[#9ca1ad]">{genre.representative_artists.slice(0, 2).join(", ")}</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Action Buttons: Audition & Studio */}
                                    <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center gap-2">
                                      <button
                                        onClick={(e) => handleToggleAudition(genre, e)}
                                        className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-xl font-bold text-[11px] transition-all ${
                                          isPlayingThis
                                            ? "bg-[#f5b73d] text-black shadow-[0_0_12px_rgba(245,183,61,0.5)]"
                                            : "bg-[#181a24] hover:bg-[#222534] text-[#d6d4ce] border border-white/[0.08]"
                                        }`}
                                        title={isPlayingThis ? t("timeline_stop_preview") : t("timeline_play_preview")}
                                      >
                                        {isPlayingThis ? (
                                          <>
                                            <Square className="w-3 h-3 fill-current text-black" />
                                            <span>{t("timeline_stop_preview")}</span>
                                            <div className="flex items-end gap-0.5 h-3 ml-1">
                                              <span className="w-0.5 h-3 bg-black animate-pulse" />
                                              <span className="w-0.5 h-1.5 bg-black animate-ping" />
                                              <span className="w-0.5 h-2.5 bg-black animate-pulse" />
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <Volume2 className="w-3.5 h-3.5 text-[#f5b73d]" />
                                            <span>{t("timeline_play_preview")}</span>
                                          </>
                                        )}
                                      </button>

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onOpenStudio(genre);
                                        }}
                                        className="p-1.5 rounded-xl bg-[#181a24] hover:bg-[#f5b73d] hover:text-black text-[#8e93a0] border border-white/[0.08] transition-all shrink-0"
                                        title={t("open_in_studio")}
                                      >
                                        <Sliders className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            /* Smart Lineage Ribbon: Fills empty space with high-end historical narrative */
                            <div className="h-full min-h-[140px] w-full rounded-2xl border border-dashed border-white/[0.08] bg-gradient-to-r from-[#10121a]/70 via-[#151722]/40 to-[#10121a]/70 p-3.5 flex flex-col justify-center items-center text-center group/bridge hover:border-amber-500/40 transition-colors">
                              {isPreBirth ? (
                                <>
                                  <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#f5b73d] uppercase tracking-wider bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/25">
                                    <GitBranch className="w-3 h-3" />
                                    <span>{t("timeline_lineage")}</span>
                                  </div>
                                  <p className="text-[11px] text-[#8e93a0] leading-relaxed mt-2 max-w-[280px] font-sans">
                                    {lane.predecessor[language]}
                                  </p>
                                  <div className="flex items-center gap-1.5 text-[10px] text-[#f5b73d] font-mono mt-2 font-semibold">
                                    <span>➔</span>
                                    <span>
                                      {language === "zh" ? `孕育 ${lane.birthDecade}s 破晓诞生` : `Leads to ${lane.birthDecade}s genesis`}
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <div className="flex flex-col items-center justify-center text-[#555a68] space-y-1">
                                  <Activity className="w-4 h-4 opacity-40" />
                                  <span className="text-[10px] font-mono">
                                    {language === "zh" ? "流派跨界融合与演进" : "Evolution & Cross-fusion"}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
