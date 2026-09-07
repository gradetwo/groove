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
  Activity
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
      glow: "rgba(244,63,94,0.3)",
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
      glow: "rgba(6,182,212,0.3)",
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
      glow: "rgba(59,130,246,0.3)",
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
      glow: "rgba(249,115,22,0.3)",
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
      glow: "rgba(168,85,247,0.3)",
    },
    genres: DUBSTEP_GENRES,
    birthDecade: 2000,
    predecessor: {
      zh: "溯源自 90s UK Garage 2-Step、牙买加 Dub 空间混响与暗黑丛林次低音",
      en: "Rooted in 90s UK Garage 2-Step, Jamaican Dub reverb & Darkside Jungle sub-bass"
    },
  },
  {
    id: "uk_bass",
    name: { zh: "英伦车库、污垢与低音风暴", en: "UK Bass, Garage & Grime" },
    category: "Electronic",
    color: {
      primary: "#10b981",
      secondary: "#34d399",
      border: "border-emerald-500/40",
      hoverBorder: "hover:border-emerald-400",
      bgTint: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
      glow: "rgba(16,185,129,0.3)",
    },
    genres: UK_BASS_GENRES,
    birthDecade: 1990,
    predecessor: {
      zh: "溯源自 90s Speed Garage、海盗电台文化与伦敦街头加勒比低音体系",
      en: "Rooted in 90s Speed Garage, pirate radio culture & London Caribbean basslines"
    },
  },
  {
    id: "trap_drill",
    name: { zh: "陷阱乐与钻头音乐脉络", en: "Trap & Drill Lineage" },
    category: "Hip Hop",
    color: {
      primary: "#eab308",
      secondary: "#facc15",
      border: "border-yellow-500/40",
      hoverBorder: "hover:border-yellow-400",
      bgTint: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
      glow: "rgba(234,179,8,0.3)",
    },
    genres: TRAP_DRILL_GENRES,
    birthDecade: 2000,
    predecessor: {
      zh: "溯源自 80s-90s Roland TR-808 狂潮、孟菲斯暗黑磁带说唱与亚特兰大脏南嘻哈",
      en: "Rooted in TR-808 hype, Memphis underground dark rap & Atlanta Dirty South"
    },
  },
  {
    id: "future_downtempo",
    name: { zh: "未来低音、智能舞曲与氛围实验", en: "Future Bass, IDM & Ambient" },
    category: "Electronic",
    color: {
      primary: "#ec4899",
      secondary: "#f472b6",
      border: "border-pink-500/40",
      hoverBorder: "hover:border-pink-400",
      bgTint: "bg-pink-500/15 text-pink-300 border-pink-500/30",
      glow: "rgba(236,72,153,0.3)",
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
      glow: "rgba(239,68,68,0.3)",
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
      glow: "rgba(245,158,11,0.3)",
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
      glow: "rgba(220,38,38,0.3)",
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
      glow: "rgba(99,102,241,0.3)",
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
      glow: "rgba(219,39,119,0.3)",
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
      glow: "rgba(5,150,105,0.3)",
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
    widthClass: "min-w-[220px] flex-[1.4]",
    filter: (g: Genre) => (g.origin_decade || 1980) <= 1960,
    yearThreshold: 1960,
  },
  {
    id: "70s",
    label: "1970s",
    tag: { zh: "电子启蒙", en: "Synth Dawn" },
    desc: { zh: "Disco, Funk, Krautrock & Synth-Pop", en: "Disco & Funk Pulse" },
    widthClass: "min-w-[260px] flex-[1.8]",
    filter: (g: Genre) => g.origin_decade === 1970,
    yearThreshold: 1970,
  },
  {
    id: "80s",
    label: "1980s",
    tag: { zh: "黄金诞生", en: "Golden Birth" },
    desc: { zh: "House, Techno & Golden Hip-Hop", en: "House & Techno Genesis" },
    widthClass: "min-w-[440px] flex-[3.8]",
    filter: (g: Genre) => g.origin_decade === 1980,
    yearThreshold: 1980,
  },
  {
    id: "90s",
    label: "1990s",
    tag: { zh: "全球大爆发", en: "Explosion" },
    desc: { zh: "Trance, Jungle, DnB, IDM & Garage", en: "The Electronic Explosion" },
    widthClass: "min-w-[680px] flex-[5.8]",
    filter: (g: Genre) => g.origin_decade === 1990,
    yearThreshold: 1990,
  },
  {
    id: "00s",
    label: "2000s",
    tag: { zh: "千禧浪潮", en: "Millennium" },
    desc: { zh: "Dubstep, Grime & Electro House", en: "Bass Revolution" },
    widthClass: "min-w-[390px] flex-[3.2]",
    filter: (g: Genre) => g.origin_decade === 2000,
    yearThreshold: 2000,
  },
  {
    id: "10s_now",
    label: "2010s–2020s+",
    tag: { zh: "现代微流派", en: "Modern Era" },
    desc: { zh: "Trap, Drill, Future Bass & Hyperpop", en: "Internet & Hybrid Grooves" },
    widthClass: "min-w-[520px] flex-[4.4]",
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
  widthClass: "min-w-[260px] flex-1",
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
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

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
      }, 300 / playbackSpeed);
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

  return (
    <div className="w-full max-w-[1500px] mx-auto px-2 sm:px-4 py-4 space-y-4">
      {/* Top Header & Evolution Controls Bar */}
      <div className="bg-[#121317] border border-[#23262d] rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#f5b73d]/15 border border-[#f5b73d]/40 flex items-center justify-center text-[#f5b73d] shadow-[0_0_12px_rgba(245,183,61,0.2)]">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#e9e7e0] tracking-wide flex items-center gap-2">
                <span>{t("nav_timeline_h")}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#f5b73d]/15 text-[#f5b73d] border border-[#f5b73d]/30 font-semibold">
                  159 GENRES · 1900–2024
                </span>
              </h2>
              <p className="text-xs text-[#8b8f99] mt-0.5">
                {language === "zh" 
                  ? "非线性历史自适应尺度 · 消除留白 · 完整呈现 14 大家族演进脉络与律动细节" 
                  : "Non-linear adaptive scale · 14 Music Genealogies & Detailed Groove DNA"}
              </p>
            </div>
          </div>
        </div>

        {/* Middle Toolbar: Timeline Mode Switcher & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Non-linear vs Linear Mode Toggle */}
          <div className="flex items-center bg-[#0d0e12] border border-[#23262d] rounded-xl p-0.5 text-xs font-semibold">
            <button
              onClick={() => setScaleMode("nonlinear")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                scaleMode === "nonlinear"
                  ? "bg-[#f5b73d] text-black shadow-[0_0_10px_rgba(245,183,61,0.3)] font-bold"
                  : "text-[#8b8f99] hover:text-[#e9e7e0]"
              }`}
              title={language === "zh" ? "根据各时代曲风密度自适应扩展，消除留白" : "Adaptive density-weighted non-linear scale"}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t("timeline_scale_nonlinear")}</span>
            </button>
            <button
              onClick={() => setScaleMode("linear")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                scaleMode === "linear"
                  ? "bg-[#f5b73d] text-black shadow-[0_0_10px_rgba(245,183,61,0.3)] font-bold"
                  : "text-[#8b8f99] hover:text-[#e9e7e0]"
              }`}
              title={language === "zh" ? "传统等距年代分布" : "Linear equal-width decades"}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{t("timeline_scale_linear")}</span>
            </button>
          </div>

          {/* Category Filter */}
          <div className="flex items-center space-x-1.5 bg-[#0d0e12] px-2.5 py-1.5 rounded-xl border border-[#23262d]">
            <Filter className="w-3.5 h-3.5 text-[#5a5e68]" />
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setActiveLaneFilter("ALL");
              }}
              className="bg-transparent text-[#b9b7b0] text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-[#121317]">
                {language === "zh" ? "全部大类 (6)" : "All Categories (6)"}
              </option>
              <option value="Electronic" className="bg-[#121317]">Electronic (8 泳道)</option>
              <option value="Hip Hop" className="bg-[#121317]">Hip Hop (2 泳道)</option>
              <option value="Rock/Metal" className="bg-[#121317]">Rock & Metal</option>
              <option value="Jazz/Blues" className="bg-[#121317]">Jazz & Blues</option>
              <option value="Pop/R&B" className="bg-[#121317]">Pop & R&B</option>
              <option value="Latin/World" className="bg-[#121317]">Latin & World</option>
            </select>
          </div>

          {/* Lane Selector */}
          <select
            value={activeLaneFilter}
            onChange={(e) => setActiveLaneFilter(e.target.value)}
            className="bg-[#0d0e12] border border-[#23262d] text-[#b9b7b0] text-xs font-semibold px-3 py-1.5 rounded-xl focus:outline-none focus:border-[#f5b73d] cursor-pointer"
          >
            <option value="ALL" className="bg-[#121317]">
              {language === "zh" ? `全部演化泳道 (${LANES.length})` : `All Lanes (${LANES.length})`}
            </option>
            {LANES.map((l) => (
              <option key={l.id} value={l.id} className="bg-[#121317]">
                {l.name[language]} ({l.genres.length})
              </option>
            ))}
          </select>
        </div>

        {/* Evolution Player Transport */}
        <div className="flex items-center space-x-3 bg-[#0d0e12] px-3.5 py-1.5 rounded-2xl border border-[#23262d]">
          <button
            onClick={handleTogglePlay}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs transition-all ${
              animationPlaying
                ? "bg-[#f5b73d] text-black shadow-[0_0_12px_rgba(245,183,61,0.4)]"
                : "bg-indigo-600 hover:bg-indigo-500 text-[#e9e7e0]"
            }`}
          >
            {animationPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{animationPlaying ? t("pause") : (language === "zh" ? "演进播放" : "Play Evolution")}</span>
          </button>

          <button
            onClick={handleStartEvolution}
            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[#b9b7b0] hover:text-[#e9e7e0] transition-colors"
            title={language === "zh" ? "从 1920 重置" : "Restart from 1920"}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Current Year Display */}
          <div className="flex items-center space-x-2 pl-2 border-l border-[#23262d]">
            <span className="text-xs text-[#5a5e68] font-semibold uppercase">YEAR:</span>
            <span className="text-sm font-mono font-extrabold text-[#f5b73d] w-12">
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
            className="w-24 sm:w-36 accent-[#f5b73d] cursor-pointer"
          />
        </div>
      </div>

      {/* Horizontal Scrollable Timeline Matrix */}
      <div 
        ref={scrollContainerRef}
        className="bg-[#121317] border border-[#23262d]/90 rounded-2xl p-4 shadow-2xl overflow-x-auto overflow-y-hidden"
      >
        <div className="min-w-[1700px] space-y-6">
          {/* Timeline Header Ruler */}
          <div className="flex items-stretch border-b border-[#23262d] pb-3 pl-56">
            {activeColumns.map((col) => {
              const isPast = col.yearThreshold <= currentYear;
              return (
                <div 
                  key={col.id} 
                  className={`${col.widthClass} px-3 flex flex-col items-center justify-between relative transition-colors border-r border-[#23262d]/40 last:border-none`}
                >
                  <div className="text-center">
                    <div className={`text-sm font-mono tracking-wider font-bold ${isPast ? "text-[#f5b73d]" : "text-neutral-500"}`}>
                      {col.label}
                    </div>
                    <div className="text-[10px] font-semibold text-[#8b8f99] uppercase tracking-wider mt-0.5">
                      {col.tag[language]}
                    </div>
                    <div className="text-[9.5px] text-[#555a66] truncate max-w-[200px] mt-0.5">
                      {col.desc[language]}
                    </div>
                  </div>
                  <div className={`w-2.5 h-2.5 rounded-full mt-2 transition-all ${
                    isPast ? "bg-[#f5b73d] shadow-[0_0_8px_#f5b73d]" : "bg-neutral-800"
                  }`} />
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
                  className="flex items-stretch p-3 rounded-2xl bg-[#0d0e12] border border-[#23262d]/80 hover:border-[#383d4a] transition-colors relative"
                >
                  {/* Lane Title & Family Info Column */}
                  <div className="w-56 shrink-0 pr-4 pl-2 flex flex-col justify-between border-r border-[#23262d]/80">
                    <div>
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: lane.color.primary, boxShadow: `0 0 8px ${lane.color.glow}` }}
                        />
                        <span 
                          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border"
                          style={{ 
                            color: lane.color.secondary, 
                            borderColor: `${lane.color.primary}40`,
                            backgroundColor: `${lane.color.primary}15`
                          }}
                        >
                          {lane.category}
                        </span>
                      </div>
                      <h4 className="font-bold text-[#e9e7e0] text-sm mt-2 leading-tight" title={lane.name[language]}>
                        {lane.name[language]}
                      </h4>
                      <p className="text-[11px] text-[#8b8f99] mt-1 font-mono">
                        {lane.genres.length} {language === "zh" ? "种代表曲风" : "genres"}
                      </p>
                    </div>

                    {/* Lane birth year badge */}
                    <div className="mt-3 pt-2 border-t border-[#23262d]/60 text-[10px] text-[#5a5e68]">
                      <span>{language === "zh" ? "发源起始:" : "Inception:"} </span>
                      <span className="font-mono font-bold text-[#b9b7b0]">{lane.birthDecade}s</span>
                    </div>
                  </div>

                  {/* Columns for this lane */}
                  <div className="flex-1 flex items-stretch divide-x divide-[#23262d]/40 pl-2">
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
                                    className={`group relative p-3 rounded-2xl transition-all duration-300 flex flex-col justify-between w-full sm:min-w-[210px] sm:max-w-[280px] flex-1 ${
                                      isRevealed 
                                        ? "bg-gradient-to-b from-[#171821] to-[#0f1015] border shadow-lg cursor-pointer scale-100 opacity-100" 
                                        : "opacity-20 bg-[#0d0e12] border-neutral-900 scale-95 pointer-events-none"
                                    } ${
                                      isPlayingThis 
                                        ? "border-2 shadow-[0_0_20px_rgba(245,183,61,0.35)]" 
                                        : "border-[#262a36] hover:border-neutral-500"
                                    }`}
                                    style={{
                                      borderColor: isPlayingThis 
                                        ? "#f5b73d" 
                                        : undefined,
                                      borderTopColor: lane.color.primary,
                                      borderTopWidth: 2
                                    }}
                                  >
                                    {/* Card Header */}
                                    <div>
                                      <div className="flex items-start justify-between gap-1.5">
                                        <h5 
                                          className="font-bold text-xs sm:text-sm text-[#f0ede6] group-hover:text-amber-400 transition-colors leading-snug line-clamp-1"
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
                                        <span className="font-mono bg-[#0c0d11] px-1.5 py-0.5 rounded border border-[#23262d] text-[#c0beba]">
                                          {genre.time_signature || "4/4"} · {genre.bpm_range} BPM
                                        </span>
                                        <span className="truncate max-w-[90px] text-[#737887]">
                                          {genre.origin_place[language]}
                                        </span>
                                      </div>

                                      {/* Useful Text: Rhythm & Groove Core (核心律动特征) */}
                                      <div className="bg-[#0a0b0e]/90 border border-[#20232c] rounded-xl p-2 mt-2.5 group-hover:border-[#353945] transition-colors">
                                        <div className="flex items-center justify-between text-[10px] font-bold text-[#8b8f99]">
                                          <span className="flex items-center gap-1 text-[#f5b73d]">
                                            <Sparkles className="w-3 h-3" />
                                            <span>{t("timeline_groove_core")}</span>
                                          </span>
                                        </div>
                                        <p className="text-[11px] text-[#c4c7cf] leading-snug line-clamp-2 mt-1 font-sans">
                                          {genre.key_characteristics[language] || genre.rhythm_features[language]}
                                        </p>
                                      </div>

                                      {/* Useful Text: Iconic Gear Badges (经典设备) */}
                                      {genre.instrumentation && genre.instrumentation.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1 items-center">
                                          {genre.instrumentation.slice(0, 3).map((gear, idx) => (
                                            <span 
                                              key={idx}
                                              className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-[#161820] text-[#9ca1ad] border border-[#272b36]"
                                            >
                                              {gear}
                                            </span>
                                          ))}
                                        </div>
                                      )}

                                      {/* Representative Artists / Pioneers (代表人物) */}
                                      {genre.representative_artists && genre.representative_artists.length > 0 && (
                                        <div className="mt-1.5 text-[10px] text-[#737887] truncate">
                                          <span className="text-[#555a66] font-medium">{t("timeline_pioneers")}: </span>
                                          <span className="text-[#a4a9b5]">{genre.representative_artists.slice(0, 2).join(", ")}</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Action Buttons: Audition & Studio */}
                                    <div className="mt-3 pt-2.5 border-t border-[#23262d]/80 flex items-center gap-2">
                                      {/* Instant Realtime Synthetic Audition Button */}
                                      <button
                                        onClick={(e) => handleToggleAudition(genre, e)}
                                        className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-xl font-bold text-[11px] transition-all ${
                                          isPlayingThis
                                            ? "bg-[#f5b73d] text-black shadow-[0_0_12px_rgba(245,183,61,0.5)]"
                                            : "bg-[#181a22] hover:bg-[#252834] text-[#d6d4ce] border border-[#2d313d]"
                                        }`}
                                        title={isPlayingThis ? t("timeline_stop_preview") : t("timeline_play_preview")}
                                      >
                                        {isPlayingThis ? (
                                          <>
                                            <Square className="w-3 h-3 fill-current text-black" />
                                            <span>{t("timeline_stop_preview")}</span>
                                            <div className="flex items-end gap-0.5 h-3 ml-1">
                                              <span className="w-0.5 h-3 bg-black animate-pulse" />
                                              <span className="w-0.5 h-2 bg-black animate-ping" />
                                              <span className="w-0.5 h-3 bg-black animate-pulse" />
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <Volume2 className="w-3.5 h-3.5 text-[#f5b73d]" />
                                            <span>{t("timeline_play_preview")}</span>
                                          </>
                                        )}
                                      </button>

                                      {/* Open in Studio Button */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onOpenStudio(genre);
                                        }}
                                        className="p-1.5 rounded-xl bg-[#181a22] hover:bg-[#f5b73d] hover:text-black text-[#8b8f99] border border-[#2d313d] transition-all shrink-0"
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
                            /* Empty Decade: Non-Linear Smart Lineage Bridge (消除大面积留白) */
                            <div className="h-full min-h-[140px] w-full rounded-2xl border border-dashed border-[#232732] bg-gradient-to-r from-[#12141a]/60 via-[#161820]/30 to-[#12141a]/60 p-3.5 flex flex-col justify-center items-center text-center group/bridge hover:border-[#f5b73d]/40 transition-colors">
                              {isPreBirth ? (
                                <>
                                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#f5b73d] uppercase tracking-wider bg-[#f5b73d]/10 px-2.5 py-0.5 rounded-full border border-[#f5b73d]/25">
                                    <GitBranch className="w-3 h-3" />
                                    <span>{t("timeline_lineage")}</span>
                                  </div>
                                  <p className="text-[11px] text-[#8e93a0] leading-relaxed mt-2 max-w-[260px] font-sans">
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
                                <div className="flex flex-col items-center justify-center text-[#5a5f6e] space-y-1">
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
