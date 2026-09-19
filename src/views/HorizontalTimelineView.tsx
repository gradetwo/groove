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
  ArrowRight,
  ExternalLink,
  BookOpen
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
import { useGenreAudition } from "../hooks/useGenreAudition";
import { useLanguage } from "../i18n/LanguageContext";

interface HorizontalTimelineViewProps {
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
  onOpenHelp?: () => void;
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

// 1. Refined Compact Adaptive Epoch scale: tight, balanced, and readable
const NONLINEAR_EPOCHS: TimelineColumnDef[] = [
  {
    id: "roots",
    label: "1900–1960s",
    tag: { zh: "根源奠基", en: "Roots" },
    desc: { zh: "Jazz, Blues, Rock'n'Roll & Bossa", en: "Acoustic Foundations" },
    widthClass: "min-w-[170px] flex-[1.2]",
    filter: (g: Genre) => (g.origin_decade || 1980) <= 1960,
    yearThreshold: 1960,
  },
  {
    id: "70s",
    label: "1970s",
    tag: { zh: "电子启蒙", en: "Synth Dawn" },
    desc: { zh: "Disco, Funk, Krautrock & Synth-Pop", en: "Disco & Funk Pulse" },
    widthClass: "min-w-[190px] flex-[1.4]",
    filter: (g: Genre) => g.origin_decade === 1970,
    yearThreshold: 1970,
  },
  {
    id: "80s",
    label: "1980s",
    tag: { zh: "黄金诞生", en: "Genesis" },
    desc: { zh: "House, Techno & Golden Hip-Hop", en: "House & Techno Genesis" },
    widthClass: "min-w-[270px] flex-[2.2]",
    filter: (g: Genre) => g.origin_decade === 1980,
    yearThreshold: 1980,
  },
  {
    id: "90s",
    label: "1990s",
    tag: { zh: "全球大爆发", en: "Explosion" },
    desc: { zh: "Trance, Jungle, DnB, IDM & Garage", en: "The Electronic Explosion" },
    widthClass: "min-w-[340px] flex-[2.8]",
    filter: (g: Genre) => g.origin_decade === 1990,
    yearThreshold: 1990,
  },
  {
    id: "00s",
    label: "2000s",
    tag: { zh: "千禧浪潮", en: "Millennium" },
    desc: { zh: "Dubstep, Grime & Electro House", en: "Bass Revolution" },
    widthClass: "min-w-[240px] flex-[1.9]",
    filter: (g: Genre) => g.origin_decade === 2000,
    yearThreshold: 2000,
  },
  {
    id: "10s_now",
    label: "2010s–2020s+",
    tag: { zh: "现代微流派", en: "Modern" },
    desc: { zh: "Trap, Drill, Future Bass & Hybrids", en: "Internet & Hybrid Grooves" },
    widthClass: "min-w-[290px] flex-[2.4]",
    filter: (g: Genre) => (g.origin_decade || 1980) >= 2010,
    yearThreshold: 2024,
  },
];

// 2. Linear equal-width decade scale (P0-24: complete decades without duplicate <=1950 filtering)
const LINEAR_COLUMNS: TimelineColumnDef[] = [1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map((decade) => ({
  id: String(decade),
  label: `${decade}s`,
  tag: { zh: `${decade} 年代`, en: `${decade}s` },
  desc: { zh: `${decade} 年代典型曲风`, en: `Decade of ${decade}s` },
  widthClass: "min-w-[190px] flex-1",
  filter: (g: Genre) => {
    const d = g.origin_decade || 1980;
    if (decade === 1920) return d <= 1929;
    if (decade === 2020) return d >= 2020;
    return d === decade || (d >= decade && d <= decade + 9);
  },
  yearThreshold: decade,
}));

export const HorizontalTimelineView: React.FC<HorizontalTimelineViewProps> = ({
  onSelectGenre,
  onOpenStudio,
  onOpenHelp,
}) => {
  const { t, language, isZh } = useLanguage();
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

  // Realtime audio audition state via shared hook
  const { playingGenreId, isPlaying, toggleAudition } = useGenreAudition();

  // Floating inspection tooltip singleton
  interface HoveredGenreTooltip {
    genre: Genre;
    rect: DOMRect;
  }
  const [hoveredTooltip, setHoveredTooltip] = useState<HoveredGenreTooltip | null>(null);

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

  // Dynamic column widths calculated by genre density (P2-12)
  const columnWidthStyles = useMemo(() => {
    const styles: Record<string, { minWidth: string; flex: string }> = {};
    for (const col of activeColumns) {
      let maxLaneCount = 0;
      let totalCount = 0;
      for (const lane of displayLanes) {
        const count = lane.genres.filter(col.filter).length;
        if (count > maxLaneCount) maxLaneCount = count;
        totalCount += count;
      }

      if (scaleMode === "nonlinear") {
        if (maxLaneCount <= 1) {
          styles[col.id] = { minWidth: "170px", flex: "1.2 1 0%" };
        } else if (maxLaneCount === 2) {
          styles[col.id] = { minWidth: "220px", flex: "1.6 1 0%" };
        } else if (maxLaneCount === 3) {
          styles[col.id] = { minWidth: "290px", flex: "2.3 1 0%" };
        } else if (maxLaneCount <= 5) {
          styles[col.id] = { minWidth: "360px", flex: "3.0 1 0%" };
        } else {
          styles[col.id] = { minWidth: `${Math.min(520, 360 + (maxLaneCount - 5) * 50)}px`, flex: "4.0 1 0%" };
        }
      } else {
        if (maxLaneCount === 0 && totalCount === 0) {
          styles[col.id] = { minWidth: "130px", flex: "0.8 1 0%" };
        } else if (maxLaneCount <= 1) {
          styles[col.id] = { minWidth: "180px", flex: "1 1 0%" };
        } else if (maxLaneCount === 2) {
          styles[col.id] = { minWidth: "240px", flex: "1.5 1 0%" };
        } else {
          styles[col.id] = { minWidth: `${Math.min(460, 240 + (maxLaneCount - 2) * 50)}px`, flex: "2.5 1 0%" };
        }
      }
    }
    return styles;
  }, [activeColumns, displayLanes, scaleMode]);

  // Lane virtualization for initial DOM <= 800 & ultra-smooth 60fps scrolling
  const [visibleLaneIds, setVisibleLaneIds] = useState<Set<string>>(() => {
    return new Set(displayLanes.slice(0, 2).map((l) => l.id));
  });

  const laneObserverRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setVisibleLaneIds(new Set(displayLanes.map((l) => l.id)));
      return;
    }

    laneObserverRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const laneId = entry.target.getAttribute("data-lane-id");
            if (laneId) {
              setVisibleLaneIds((prev) => {
                if (prev.has(laneId)) return prev;
                const next = new Set(prev);
                next.add(laneId);
                return next;
              });
            }
          }
        });
      },
      { rootMargin: "-160px 0px" }
    );

    return () => {
      if (laneObserverRef.current) {
        laneObserverRef.current.disconnect();
      }
    };
  }, [displayLanes]);

  useEffect(() => {
    setVisibleLaneIds((prev) => {
      const next = new Set(prev);
      displayLanes.slice(0, 2).forEach((l) => next.add(l.id));
      return next;
    });
  }, [displayLanes]);

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
      }, 260 / playbackSpeed);
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

  // Scroll smoothly to a column
  const scrollToColumn = (colId: string) => {
    const colElement = document.getElementById(`timeline-col-${colId}`);
    if (colElement && scrollContainerRef.current) {
      const containerRect = scrollContainerRef.current.getBoundingClientRect();
      const colRect = colElement.getBoundingClientRect();
      const scrollOffset = colRect.left - containerRect.left + scrollContainerRef.current.scrollLeft - 180;
      scrollContainerRef.current.scrollTo({ left: Math.max(0, scrollOffset), behavior: "smooth" });
    }
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto px-2 sm:px-4 py-3 space-y-3">
      {/* Compact Master Deck (精致高雅主控面板) */}
      <div className="rounded-2xl bg-[#0f1117]/95 border border-white/[0.08] p-3.5 shadow-xl backdrop-blur-xl flex flex-wrap items-center justify-between gap-3">
        {/* Left: Branding & Metrics */}
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-accent">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-[#f5f4ef] tracking-wide">
                {t("nav_timeline_h")}
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-amber-500/15 text-accent border border-amber-500/30 font-bold">
                159 GENRES
              </span>
              {onOpenHelp && (
                <button
                  type="button"
                  data-testid="timeline-h-help-button"
                  onClick={onOpenHelp}
                  title={t("timeline_guide_btn")}
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border border-accent/40 bg-accent/10 text-accent font-semibold text-[11px] hover:bg-accent/20 transition-all ml-1"
                >
                  <BookOpen className="w-3 h-3 text-accent" />
                  <span className="hidden sm:inline">{t("timeline_guide_btn")}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Middle Toolbar: Mode Switcher & Category Dropdown */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Non-linear vs Linear Mode Toggle */}
          <div className="flex items-center bg-[#090a0e] border border-white/[0.08] rounded-xl p-0.5 text-xs font-semibold">
            <button
              onClick={() => setScaleMode("nonlinear")}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                scaleMode === "nonlinear"
                  ? "bg-accent text-black font-bold shadow-sm"
                  : "text-[#8e93a0] hover:text-[#f5f4ef]"
              }`}
              title={t("timeline_adaptive_density_tooltip")}
            >
              <Layers className="w-3 h-3 shrink-0" />
              <span className="text-[11px] whitespace-nowrap truncate max-w-[80px]">{t("timeline_scale_nonlinear")}</span>
            </button>
            <button
              onClick={() => setScaleMode("linear")}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 shrink-0 ${
                scaleMode === "linear"
                  ? "bg-accent text-black font-bold shadow-sm"
                  : "text-[#8e93a0] hover:text-[#f5f4ef]"
              }`}
              title={t("timeline_linear_tooltip")}
            >
              <Clock className="w-3 h-3 shrink-0" />
              <span className="text-[11px] whitespace-nowrap truncate max-w-[80px]">{t("timeline_scale_linear")}</span>
            </button>
          </div>

          {/* Category Filter */}
          <div className="flex items-center space-x-1.5 bg-[#090a0e] px-2.5 py-1 rounded-xl border border-white/[0.08]">
            <Filter className="w-3 h-3 text-[#636875]" />
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setActiveLaneFilter("ALL");
              }}
              className="bg-transparent text-[#c4c7cf] text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-[#12131a]">
                {t("all_categories_six")}
              </option>
              <option value="Electronic" className="bg-[#12131a]">Electronic 电子</option>
              <option value="Hip Hop" className="bg-[#12131a]">Hip Hop 嘻哈</option>
              <option value="Rock/Metal" className="bg-[#12131a]">Rock & Metal 摇滚</option>
              <option value="Jazz/Blues" className="bg-[#12131a]">Jazz & Blues 爵士</option>
              <option value="Pop/R&B" className="bg-[#12131a]">Pop & R&B 流行</option>
              <option value="Latin/World" className="bg-[#12131a]">Latin & World 拉丁</option>
            </select>
          </div>

          {/* Lane Selector */}
          <select
            value={activeLaneFilter}
            onChange={(e) => setActiveLaneFilter(e.target.value)}
            className="bg-[#090a0e] border border-white/[0.08] text-[#c4c7cf] text-xs font-semibold px-2.5 py-1 rounded-xl focus:outline-none focus:border-accent cursor-pointer max-w-[160px] truncate"
          >
            <option value="ALL" className="bg-[#12131a]">
              {t("timeline_all_lanes", { count: LANES.length })}
            </option>
            {LANES.map((l) => (
              <option key={l.id} value={l.id} className="bg-[#12131a]">
                {l.name[language]} ({l.genres.length})
              </option>
            ))}
          </select>
        </div>

        {/* Right: Master Transport Console */}
        <div className="flex items-center space-x-2.5 bg-[#090a0e] px-3 py-1 rounded-xl border border-white/[0.08]">
          <button
            onClick={handleTogglePlay}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
              animationPlaying
                ? "bg-accent text-black shadow-sm"
                : "bg-indigo-600 hover:bg-indigo-500 text-[#f5f4ef]"
            }`}
          >
            {animationPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
            <span className="text-[11px]">{animationPlaying ? t("pause") : t("play")}</span>
          </button>

          <button
            type="button"
            onClick={handleStartEvolution}
            className="p-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[#9ca1ad] hover:text-[#f5f4ef] transition-colors"
            title={t("timeline_restart_1920")}
            aria-label={t("timeline_restart_1920")}
          >
            <RotateCcw className="w-3 h-3" />
          </button>

          {/* Current Year Display */}
          <div className="flex items-center space-x-1 pl-2 border-l border-white/[0.08]">
            <span className="text-[9px] text-[#636875] font-mono font-bold">YEAR:</span>
            <span className="text-sm font-mono font-extrabold text-accent w-10 text-center">
              {currentYear}
            </span>
          </div>

          <input
            type="range"
            min="1920"
            max="2024"
            value={currentYear}
            onChange={(e) => setCurrentYear(Number(e.target.value))}
            className="w-20 sm:w-28 accent-accent cursor-pointer"
          />

          {/* Speed */}
          <div className="flex items-center gap-0.5 border-l border-white/[0.08] pl-1.5">
            {[1, 2].map((spd) => (
              <button
                key={spd}
                onClick={() => setPlaybackSpeed(spd)}
                className={`text-[9px] font-mono px-1 py-0.5 rounded ${
                  playbackSpeed === spd
                    ? "bg-amber-500/20 text-accent font-bold"
                    : "text-[#636875] hover:text-[#9ca1ad]"
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Epoch Navigation Jump Line */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none px-1">
        <span className="text-[10px] font-mono uppercase text-[#636875] tracking-wider shrink-0 mr-1">
          {t("timeline_epoch")}
        </span>
        {activeColumns.map((col) => (
          <button
            key={col.id}
            onClick={() => scrollToColumn(col.id)}
            className="px-2 py-0.5 rounded-lg bg-[#0e1017] hover:bg-[#181b24] border border-white/[0.06] hover:border-white/20 text-[10.5px] font-mono text-[#9ca1ad] hover:text-[#f5f4ef] transition-colors shrink-0"
          >
            <span className="text-accent font-bold mr-1">{col.label}</span>
            · {col.tag[language]}
          </button>
        ))}
      </div>

      {/* Horizontal Scrollable Timeline Matrix (精致紧凑矩阵) */}
      <div 
        ref={scrollContainerRef}
        data-testid="timeline-scroll-container"
        onScroll={() => { if (hoveredTooltip) setHoveredTooltip(null); }}
        className="bg-[#0b0c11] border border-white/[0.08] rounded-2xl p-3 sm:p-4 shadow-xl overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-white/10"
      >
        <div className="min-w-[1500px] space-y-3">
          {/* Precision Chronological Ruler Header */}
          <div className="flex items-stretch border-b border-white/[0.08] pb-2">
            {/* Sticky Corner Header */}
            <div className="sticky left-0 z-20 w-44 shrink-0 bg-[#0b0c11] border-r border-white/[0.08] pr-2.5 flex items-center justify-between">
              <span className="text-[10px] font-mono font-extrabold uppercase text-[#8e93a0] tracking-wider">
                {t("timeline_all_lanes", { count: displayLanes.length })}
              </span>
              <span className="text-[9px] font-mono text-accent">ERA / DECADE</span>
            </div>

            {/* Active Column Headers */}
            <div className="flex-1 flex items-stretch">
              {activeColumns.map((col) => {
                const isPast = col.yearThreshold <= currentYear;
                const colStyle = columnWidthStyles[col.id] || { minWidth: "180px", flex: "1 1 0%" };
                return (
                  <div 
                    key={col.id} 
                    id={`timeline-col-${col.id}`}
                    style={colStyle}
                    className="px-2 flex flex-col items-center justify-between relative transition-colors border-r border-white/[0.05] last:border-none"
                  >
                    <div className="text-center">
                      <div className={`text-xs font-mono font-extrabold ${isPast ? "text-accent" : "text-[#555a68]"}`}>
                        {col.label}
                      </div>
                      <div className="text-[9.5px] font-semibold text-[#8e93a0] uppercase tracking-wider mt-0.5">
                        {col.tag[language]}
                      </div>
                    </div>

                    {/* Tick Dot */}
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 transition-all ${
                      isPast ? "bg-accent shadow-[0_0_6px_#f5b73d]" : "bg-[#181a24]"
                    }`} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Swimlanes */}
          <div className="space-y-2.5">
            {displayLanes.map((lane) => {
              const isLaneVisible = visibleLaneIds.has(lane.id);

              return (
                <div 
                  key={lane.id}
                  data-lane-id={lane.id}
                  ref={(el) => {
                    if (el && laneObserverRef.current) {
                      laneObserverRef.current.observe(el);
                    }
                  }}
                  className="flex items-stretch rounded-xl bg-[#0e1017]/90 border border-white/[0.06] hover:border-white/[0.15] transition-all relative shadow-sm min-h-[88px]"
                >
                  {/* Left Lane Title Header (Sticky on horizontal scroll) */}
                  <div className="sticky left-0 z-10 w-44 shrink-0 p-2.5 flex flex-col justify-between border-r border-white/[0.07] bg-[#0d0f17] shadow-lg rounded-l-xl">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span 
                          className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: lane.color.primary, boxShadow: `0 0 8px ${lane.color.glow}` }}
                        />
                        <span 
                          className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border"
                          style={{ 
                            color: lane.color.secondary, 
                            borderColor: `${lane.color.primary}35`,
                            backgroundColor: `${lane.color.primary}12`
                          }}
                        >
                          {lane.category}
                        </span>
                      </div>

                      <h4 className="font-bold text-[#f5f4ef] text-xs mt-1.5 leading-tight truncate" title={lane.name[language]}>
                        {lane.name[language]}
                      </h4>
                    </div>

                    <div className="mt-1 pt-1 border-t border-white/[0.05] flex items-center justify-between text-[9.5px] text-[#636875] font-mono">
                      <span>{lane.genres.length} 曲风</span>
                      <span className="font-bold text-[#9ca1ad]">{lane.birthDecade}s</span>
                    </div>
                  </div>

                  {/* Columns for this lane */}
                  {isLaneVisible ? (
                    <div className="flex-1 flex items-stretch divide-x divide-white/[0.04] p-1.5">
                      {activeColumns.map((col) => {
                        const colGenres = lane.genres.filter(col.filter);
                        const hasGenres = colGenres.length > 0;
                        const isPreBirth = col.yearThreshold < lane.birthDecade;
                        const colStyle = columnWidthStyles[col.id] || { minWidth: "180px", flex: "1 1 0%" };

                        return (
                          <div 
                            key={col.id} 
                            style={colStyle}
                            className="p-1 flex flex-col justify-center"
                          >
                            {hasGenres ? (
                              /* Genre Chips Grid */
                              <div className="flex flex-wrap gap-1.5 items-center content-center w-full">
                                {colGenres.map((genre) => {
                                  const isRevealed = (genre.origin_decade || 1980) <= currentYear;
                                  const isPlayingThis = isPlaying(genre.id);

                                  return (
                                    <div
                                      key={genre.id}
                                      data-genre-id={genre.id}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => onSelectGenre(genre)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          onSelectGenre(genre);
                                        }
                                      }}
                                      onMouseEnter={(e) => {
                                        setHoveredTooltip({
                                          genre,
                                          rect: e.currentTarget.getBoundingClientRect(),
                                        });
                                      }}
                                      onMouseLeave={() => setHoveredTooltip(null)}
                                      className={`group/chip relative px-2.5 py-1.5 rounded-xl transition-all duration-200 flex flex-col justify-between w-[150px] sm:w-[168px] shrink-0 border text-left outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                                        isRevealed 
                                          ? "bg-[#11131a]/90 hover:bg-[#181a24] border-white/[0.08] hover:border-white/30 shadow-sm cursor-pointer hover:shadow-md hover:-translate-y-0.5" 
                                          : "opacity-20 bg-[#07080b] border-white/[0.03] scale-95 pointer-events-none"
                                      } ${
                                        isPlayingThis 
                                          ? "ring-1.5 ring-[#f5b73d] shadow-[0_0_12px_rgba(245,183,61,0.35)] bg-[#181b28]" 
                                          : ""
                                      }`}
                                      style={{
                                        borderLeftColor: lane.color.primary,
                                        borderLeftWidth: 3,
                                      }}
                                      aria-label={`${genre.name} (${genre.origin_year})`}
                                    >
                                      {/* Top: Name and Year */}
                                      <div className="flex items-center justify-between gap-1">
                                        <span 
                                          className="font-bold text-xs text-[#f5f4ef] group-hover/chip:text-accent transition-colors truncate"
                                          title={genre.name}
                                        >
                                          {genre.name}
                                        </span>
                                        <span className="text-[9.5px] font-mono font-bold text-[#8e93a0] shrink-0">
                                          {genre.origin_year}
                                        </span>
                                      </div>

                                      {/* Bottom: BPM & Micro Action Buttons */}
                                      <div className="flex items-center justify-between gap-1 mt-1 pt-1 border-t border-white/[0.04]">
                                        <span className="text-[9px] font-mono text-[#8e93a0] px-1 py-0.2 rounded bg-white/[0.04]">
                                          {genre.default_bpm || genre.bpm_range.split("-")[0]} BPM
                                        </span>

                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={(e) => toggleAudition(genre, e)}
                                            className={`p-1 rounded-lg transition-all ${
                                              isPlayingThis
                                                ? "bg-accent text-black shadow-sm"
                                                : "bg-white/[0.06] hover:bg-white/[0.15] text-[#b9b7b0] hover:text-[#f5f4ef]"
                                            }`}
                                            title={isPlayingThis ? t("timeline_stop_preview") : t("timeline_play_preview")}
                                            aria-label={isPlayingThis ? t("timeline_stop_preview") : t("timeline_play_preview")}
                                          >
                                            {isPlayingThis ? (
                                              <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                                            ) : (
                                              <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3" /></svg>
                                            )}
                                          </button>

                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onOpenStudio(genre);
                                            }}
                                            className="p-1 rounded-lg bg-white/[0.06] hover:bg-accent hover:text-black text-[#8e93a0] transition-colors"
                                            title={t("open_in_studio")}
                                            aria-label={t("open_in_studio")}
                                          >
                                            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 21v-7m0-4V3m8 14v-4m0-4V3m8 14v-1m0-4V3M1 14h6m2-6h6m2 8h6" /></svg>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              /* Slim Lineage Ribbon */
                              <div className="h-full min-h-[44px] w-full flex items-center justify-center px-1.5">
                                {isPreBirth ? (
                                  <div className="w-full flex items-center gap-1.5 py-1 px-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[9.5px] text-[#636875] font-sans">
                                    <GitBranch className="w-3 h-3 text-accent shrink-0" />
                                    <span className="truncate max-w-[200px]" title={lane.predecessor[language]}>
                                      {lane.predecessor[language]}
                                    </span>
                                    <span className="text-accent font-mono text-[9px] shrink-0 ml-auto font-bold">➔ {lane.birthDecade}s</span>
                                  </div>
                                ) : (
                                  <div className="w-full border-t border-dashed border-white/[0.06]" />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center px-4 text-xs text-[#555a68] font-mono">
                      <span>Loading {lane.name[language]}...</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Singleton Tooltip Popover (P2-12: Uncropped by overflow-y-hidden) */}
      {hoveredTooltip && (
        <div
          className="fixed z-50 w-72 p-3 rounded-2xl bg-[#12141c]/95 backdrop-blur-xl border border-white/20 shadow-[0_12px_32px_rgba(0,0,0,0.85)] pointer-events-none text-left animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: `${Math.max(16, Math.min(window.innerWidth - 304, hoveredTooltip.rect.left + hoveredTooltip.rect.width / 2 - 144))}px`,
            ...(hoveredTooltip.rect.top >= 220
              ? { bottom: `${window.innerHeight - hoveredTooltip.rect.top + 8}px` }
              : { top: `${hoveredTooltip.rect.bottom + 8}px` }),
          }}
          role="tooltip"
        >
          <div className="flex items-start justify-between gap-1.5 pb-2 border-b border-white/[0.08]">
            <div>
              <h6 className="text-xs font-extrabold text-[#f5f4ef]">{hoveredTooltip.genre.name}</h6>
              {hoveredTooltip.genre.aliases[0] && isZh && (
                <span className="text-[10px] text-[#8e93a0]">{hoveredTooltip.genre.aliases[0]}</span>
              )}
            </div>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-accent border border-amber-500/30">
              {hoveredTooltip.genre.origin_year}
            </span>
          </div>

          <div className="mt-2 space-y-1.5 text-[10.5px]">
            <div className="text-[#8e93a0] flex items-center justify-between font-mono">
              <span>{hoveredTooltip.genre.origin_place[language]}</span>
              <span className="text-accent">{hoveredTooltip.genre.time_signature} · {hoveredTooltip.genre.bpm_range} BPM</span>
            </div>
            <p className="text-[#c4c7cf] leading-relaxed line-clamp-2">
              {hoveredTooltip.genre.key_characteristics[language] || hoveredTooltip.genre.rhythm_features[language]}
            </p>
            {hoveredTooltip.genre.instrumentation && hoveredTooltip.genre.instrumentation.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {hoveredTooltip.genre.instrumentation.slice(0, 3).map((gear, gIdx) => (
                  <span key={gIdx} className="px-1.5 py-0.5 rounded bg-[#181a24] text-[#9ca1ad] font-mono text-[9px] border border-white/[0.06]">
                    {gear}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
