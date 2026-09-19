import React, { useState, useRef, useEffect, useMemo } from "react";
import { 
  Sparkles, 
  Sliders, 
  Play,
  Square,
  Volume2,
  Clock, 
  Radio,
  Disc, 
  Music,
  Compass,
  Cpu,
  Flame,
  ChevronRight,
  Filter,
  BookOpen
} from "lucide-react";
import { TIMELINE_STORIES, TimelineStory } from "../data/timeline_stories";
import { GENRES_MAP } from "../data/genres";
import { Genre, GenreCategory } from "../types/genre";
import { useLanguage } from "../i18n/LanguageContext";
import { useGenreAudition } from "../hooks/useGenreAudition";

interface VerticalTimelineViewProps {
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
  onOpenHelp?: () => void;
}

interface EraAesthetic {
  accentColor: string;
  glowColor: string;
  badgeBg: string;
  badgeBorder: string;
  gradient: string;
  techMilestones: { zh: string; en: string }[];
  culturalTag: { zh: string; en: string };
}

const ERA_AESTHETICS: Record<number, EraAesthetic> = {
  1900: {
    accentColor: "#d97706", // Amber
    glowColor: "rgba(217, 119, 6, 0.35)",
    badgeBg: "rgba(217, 119, 6, 0.12)",
    badgeBorder: "rgba(217, 119, 6, 0.35)",
    gradient: "from-amber-950/30 via-[#12131a] to-[#0c0d12]",
    techMilestones: [
      { zh: "原声滑棒吉他与脚步重踏", en: "Acoustic Slide & Foot Stomps" },
      { zh: "神圣 12 小节布鲁斯和声基石", en: "Sacred 12-Bar Blues Foundation" },
      { zh: "早蜡盘与留声机声学录音", en: "Acoustic Horn Wax Recording" },
    ],
    culturalTag: { zh: "棉花田灵歌与三角洲源头", en: "Delta Roots & Spiritual Hollers" },
  },
  1930: {
    accentColor: "#f59e0b",
    glowColor: "rgba(245, 158, 11, 0.35)",
    badgeBg: "rgba(245, 158, 11, 0.12)",
    badgeBorder: "rgba(245, 158, 11, 0.35)",
    gradient: "from-amber-950/25 via-[#12131a] to-[#0c0d12]",
    techMilestones: [
      { zh: "大乐队管乐组切分对位", en: "Big Band Brass Section Syncopation" },
      { zh: "Django 吉普赛原声指弹神技", en: "Django Acoustic Gypsy Virtuosity" },
      { zh: "德州公路小酒馆过载功放", en: "Texas Honky-Tonk Tube Overdrive" },
    ],
    culturalTag: { zh: "舞厅大乐队狂潮与吉普赛火焰", en: "Ballroom Swing Era & Gypsy Fire" },
  },
  1940: {
    accentColor: "#3b82f6",
    glowColor: "rgba(59, 130, 246, 0.35)",
    badgeBg: "rgba(59, 130, 246, 0.12)",
    badgeBorder: "rgba(59, 130, 246, 0.35)",
    gradient: "from-blue-950/25 via-[#12131a] to-[#0c0d12]",
    techMilestones: [
      { zh: "芝加哥电吉他与电子管功放炸裂", en: "Chicago Tube Amplifier Electrification" },
      { zh: "比波普闪电即兴与前卫和声", en: "Bebop Lightning Virtuosity" },
      { zh: "战后 78 转唱片广播普及", en: "Post-War Radio Broadcasting" },
    ],
    culturalTag: { zh: "电气化震撼与比波普纯艺术革命", en: "Electric Shock & Bebop Revolution" },
  },
  1950: {
    accentColor: "#ec4899",
    glowColor: "rgba(236, 72, 153, 0.35)",
    badgeBg: "rgba(236, 72, 153, 0.12)",
    badgeBorder: "rgba(236, 72, 153, 0.35)",
    gradient: "from-pink-950/25 via-[#12131a] to-[#0c0d12]",
    techMilestones: [
      { zh: "Fender 实体电吉他与贝斯问世", en: "Fender Solid-Body Electric Guitars" },
      { zh: "45 转 7 英寸黑胶单曲唱片", en: "45-RPM 7-inch Vinyl Singles" },
      { zh: "Bossa Nova 里约耳语般摇曳扫弦", en: "Bossa Nova Syncopated Nylon Strumming" },
    ],
    culturalTag: { zh: "青年文化觉醒与摇滚乐破晓", en: "Birth of Rock 'n' Roll & Soul" },
  },
  1960: {
    accentColor: "#8b5cf6",
    glowColor: "rgba(139, 92, 246, 0.35)",
    badgeBg: "rgba(139, 92, 246, 0.12)",
    badgeBorder: "rgba(139, 92, 246, 0.35)",
    gradient: "from-purple-950/25 via-[#12131a] to-[#0c0d12]",
    techMilestones: [
      { zh: "James Brown 确立第 1 拍重音 (The One)", en: "James Brown's 'The One' Funk Pocket" },
      { zh: "牙买加录音台磁带延迟 (Tape Echo) 实验", en: "Jamaican Tape Echo Dub Experiments" },
      { zh: "伯明翰重金属失真重型三全音", en: "Birmingham Heavy Metal Tritone Riffs" },
    ],
    culturalTag: { zh: "放克舞曲根基与重型迷幻狂澜", en: "The Golden Era: Funk, Metal & Dub" },
  },
  1970: {
    accentColor: "#10b981",
    glowColor: "rgba(16, 185, 129, 0.35)",
    badgeBg: "rgba(16, 185, 129, 0.12)",
    badgeBorder: "rgba(16, 185, 129, 0.35)",
    gradient: "from-emerald-950/25 via-[#12131a] to-[#0c0d12]",
    techMilestones: [
      { zh: "Technics SL-1200 双黑胶唱机混音", en: "Technics SL-1200 Direct-Drive Turntables" },
      { zh: "四踩四 (Four-on-the-Floor) 迪斯科大鼓", en: "Four-on-the-Floor Kick Drum Grid" },
      { zh: "布朗克斯 Break 鼓碎拍循环切片", en: "Bronx Turntable Drum Break Looping" },
      { zh: "Minimoog 模拟单音合成器贝斯", en: "Minimoog Analog Synthesizer Bass" },
    ],
    culturalTag: { zh: "迪斯科统治全球舞池与嘻哈降生", en: "Disco Supremacy, Punk & Bronx Hip-Hop" },
  },
  1980: {
    accentColor: "#06b6d4",
    glowColor: "rgba(6, 182, 212, 0.35)",
    badgeBg: "rgba(6, 182, 212, 0.12)",
    badgeBorder: "rgba(6, 182, 212, 0.35)",
    gradient: "from-cyan-950/25 via-[#12131a] to-[#0c0d12]",
    techMilestones: [
      { zh: "Roland TR-808 / TR-909 经典可编程鼓机", en: "Roland TR-808 & TR-909 Drum Machines" },
      { zh: "Roland TB-303 酸性共鸣低通滤波器", en: "Roland TB-303 Acid Resonant Filter" },
      { zh: "MIDI 1.0 电子乐器通用通信协议", en: "MIDI 1.0 Universal Digital Protocol" },
      { zh: "Akai MPC60 采样与打击垫音序器", en: "Akai MPC60 Sampling Drum Sequencer" },
    ],
    culturalTag: { zh: "芝加哥浩室与底特律铁克诺机器觉醒", en: "House, Techno & Golden Age 808s" },
  },
  1990: {
    accentColor: "#6366f1",
    glowColor: "rgba(99, 102, 241, 0.35)",
    badgeBg: "rgba(99, 102, 241, 0.12)",
    badgeBorder: "rgba(99, 102, 241, 0.35)",
    gradient: "from-indigo-950/25 via-[#12131a] to-[#0c0d12]",
    techMilestones: [
      { zh: "Amen Break 变速切片重构极速破拍", en: "Amen Break Timestretching & Slicing" },
      { zh: "Roland JP-8000 史诗超级锯齿波 (Supersaw)", en: "Roland JP-8000 Epic Supersaw Oscillator" },
      { zh: "Akai S1000 硬件数字采样器普及", en: "Akai S1000 Hardware Digital Sampler" },
      { zh: "数字音频工作站 (DAW) 与电脑音乐萌芽", en: "Early Computer Audio Workstations" },
    ],
    culturalTag: { zh: "英国狂欢连续体与万人出神赞歌", en: "UK Rave Continuum, Trance & Breakbeat" },
  },
  2000: {
    accentColor: "#a855f7",
    glowColor: "rgba(168, 85, 247, 0.35)",
    badgeBg: "rgba(168, 85, 247, 0.12)",
    badgeBorder: "rgba(168, 85, 247, 0.35)",
    gradient: "from-purple-950/25 via-[#12131a] to-[#0c0d12]",
    techMilestones: [
      { zh: "50Hz 纯正正弦次低音 (Physical Sub-Bass)", en: "50Hz Physical Sub-Bass Compression" },
      { zh: "FL Studio 与 Ableton Live 卧室制作革命", en: "FL Studio & Ableton Bedroom Production" },
      { zh: "失真锯齿电锯波 (Buzz-Saw Electro)", en: "Distorted Buzz-Saw Electro Waveforms" },
    ],
    culturalTag: { zh: "南伦敦重低音海啸与电锯俱乐部浪潮", en: "Dubstep Sub-Pressure & Grime Explosion" },
  },
  2010: {
    accentColor: "#f43f5e",
    glowColor: "rgba(244, 63, 94, 0.35)",
    badgeBg: "rgba(244, 63, 94, 0.12)",
    badgeBorder: "rgba(244, 63, 94, 0.35)",
    gradient: "from-rose-950/25 via-[#12131a] to-[#0c0d12]",
    techMilestones: [
      { zh: "Xfer Serum 波表合成器与绚丽明亮 LFO", en: "Xfer Serum Wavetable & Modulated LFOs" },
      { zh: "滑音 808 (Gliding 808) 颠覆全球钻头说唱", en: "Pitch-Bent Gliding 808 Basslines" },
      { zh: "极致侧链抽吸 (Aggressive Sidechain)", en: "Extreme Sidechain Pumping Aesthetics" },
    ],
    culturalTag: { zh: "未来贝斯、音乐节电音陷阱与钻头风暴", en: "Future Bass, EDM Trap & Drill Revolution" },
  },
  2020: {
    accentColor: "#14b8a6",
    glowColor: "rgba(20, 184, 166, 0.35)",
    badgeBg: "rgba(20, 184, 166, 0.12)",
    badgeBorder: "rgba(20, 184, 166, 0.35)",
    gradient: "from-teal-950/25 via-[#12131a] to-[#0c0d12]",
    techMilestones: [
      { zh: "155+ BPM 极速硬核 Techno 重构舞池", en: "155+ BPM Relentless Industrial Hard Techno" },
      { zh: "漂移放克 (Drift Phonk) 牛铃音色网络风暴", en: "Cowbell Phonk Internet Synthesis" },
      { zh: "全球跨界杂交与算法生成无界音乐", en: "Algorithmic Grooves & Global Hybrids" },
    ],
    culturalTag: { zh: "极速无界杂交与全球文艺复兴", en: "Speed, Hybrids & Endless Evolution" },
  },
};

export const VerticalTimelineView: React.FC<VerticalTimelineViewProps> = ({
  onSelectGenre,
  onOpenStudio,
  onOpenHelp,
}) => {
  const { t, language, isZh } = useLanguage();
  
  // Realtime audio audition state via shared hook (P2-14)
  const { playingGenreId, isPlaying, toggleAudition } = useGenreAudition();
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [activeStoryId, setActiveStoryId] = useState<string>(TIMELINE_STORIES[0].id);

  // Decoupled story elements ref to remove global document.getElementById (P2-13)
  const storyElementsRef = useRef<Record<string, HTMLElement | null>>({});

  // Scroll to decade story using element ref
  const scrollToStory = (storyId: string) => {
    setActiveStoryId(storyId);
    const element = storyElementsRef.current[storyId];
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // Precompute and memoize storyGenresMap per selected category (P2-13)
  const storyGenresMap = useMemo(() => {
    const map = new Map<string, Genre[]>();
    for (const story of TIMELINE_STORIES) {
      const genres = story.genre_ids
        .map((gid) => GENRES_MAP[gid])
        .filter((g): g is Genre => {
          if (!g) return false;
          if (selectedCategory !== "ALL" && g.category !== selectedCategory) return false;
          return true;
        });
      map.set(story.id, genres);
    }
    return map;
  }, [selectedCategory]);

  return (
    <div data-testid="vertical-timeline" className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-6 space-y-8">
      {/* Luxury Curator Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#161822] via-[#101217] to-[#0a0b0e] border border-white/[0.08] p-6 sm:p-8 shadow-2xl">
        {/* Ambient background light gradients */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/30 text-accent text-xs font-semibold tracking-wide shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>CENTURY SONIC REVOLUTION · 1900 — 2026</span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#f5f4ef] tracking-tight flex flex-wrap items-center gap-3">
              <span>{t("nav_timeline_v")}</span>
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-white/[0.06] text-[#b9b7b0] border border-white/[0.1]">
                11 纪元里程碑 · 159 经典曲风
              </span>
              {onOpenHelp && (
                <button
                  type="button"
                  data-testid="timeline-v-help-button"
                  onClick={onOpenHelp}
                  title={t("timeline_guide_btn")}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-xl border border-accent/40 bg-accent/10 text-accent font-semibold text-xs hover:bg-accent/20 transition-all"
                >
                  <BookOpen className="w-3.5 h-3.5 text-accent" />
                  <span>{t("timeline_guide_btn")}</span>
                </button>
              )}
            </h1>

            <p className="text-xs sm:text-sm text-[#8e93a0] max-w-2xl leading-relaxed">
              {t("timeline_summary_desc")}
            </p>
          </div>

          {/* Metric Stats Display */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <div className="px-4 py-2.5 rounded-2xl bg-[#13151f]/90 border border-white/[0.08] text-center shadow-lg">
              <div className="text-lg sm:text-xl font-mono font-extrabold text-accent">120+</div>
              <div className="text-[10px] text-[#8e93a0] uppercase tracking-wider font-semibold">
                {t("timeline_span")}
              </div>
            </div>
            <div className="px-4 py-2.5 rounded-2xl bg-[#13151f]/90 border border-white/[0.08] text-center shadow-lg">
              <div className="text-lg sm:text-xl font-mono font-extrabold text-cyan-400">14</div>
              <div className="text-[10px] text-[#8e93a0] uppercase tracking-wider font-semibold">
                {t("timeline_genealogies")}
              </div>
            </div>
            <div className="px-4 py-2.5 rounded-2xl bg-[#13151f]/90 border border-white/[0.08] text-center shadow-lg">
              <div className="text-lg sm:text-xl font-mono font-extrabold text-pink-400">159</div>
              <div className="text-[10px] text-[#8e93a0] uppercase tracking-wider font-semibold">
                {t("timeline_milestone_genres")}
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Decade Quick-Navigator Bar */}
        <div className="relative z-10 mt-6 pt-5 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none max-w-full">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#636875] mr-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{t("timeline_decade_quick")}</span>
            </span>
            {TIMELINE_STORIES.map((story) => {
              const aesthetic = ERA_AESTHETICS[story.decade] || ERA_AESTHETICS[1980];
              const isActive = activeStoryId === story.id;
              return (
                <button
                  key={story.id}
                  data-story-idx={story.id}
                  onClick={() => scrollToStory(story.id)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition-all shrink-0 border ${
                    isActive
                      ? "text-black shadow-lg scale-105"
                      : "bg-[#0c0d12]/90 text-[#9ca1ad] hover:text-[#f5f4ef] hover:border-white/20 border-white/[0.06]"
                  }`}
                  style={{
                    backgroundColor: isActive ? aesthetic.accentColor : undefined,
                    borderColor: isActive ? aesthetic.accentColor : undefined,
                    boxShadow: isActive ? `0 0 14px ${aesthetic.glowColor}` : undefined,
                  }}
                >
                  {story.year}
                </button>
              );
            })}
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2 bg-[#0c0d12] border border-white/[0.08] rounded-2xl px-3 py-1.5 shrink-0">
            <Filter className="w-3.5 h-3.5 text-[#636875]" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent text-xs font-semibold text-[#b9b7b0] focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-[#12131a]">
                {t("timeline_all_categories_genres")}
              </option>
              <option value="Electronic" className="bg-[#12131a]">Electronic 电子</option>
              <option value="Hip Hop" className="bg-[#12131a]">Hip Hop 嘻哈</option>
              <option value="Rock/Metal" className="bg-[#12131a]">Rock/Metal 摇滚金属</option>
              <option value="Jazz/Blues" className="bg-[#12131a]">Jazz/Blues 爵士蓝调</option>
              <option value="Pop/R&B" className="bg-[#12131a]">Pop/R&B 流行布鲁斯</option>
              <option value="Latin/World" className="bg-[#12131a]">Latin/World 拉丁世界</option>
            </select>
          </div>
        </div>
      </div>

      {/* Vertical Dual-Laser Spine & Epoch Hall */}
      <div className="relative ml-2 sm:ml-28 md:ml-36 pl-6 sm:pl-10 space-y-16">
        {/* Continuous Neon Laser Spine Line */}
        <div className="absolute left-0 sm:left-0 top-3 bottom-3 w-0.5 bg-gradient-to-b from-amber-500 via-cyan-400 via-purple-500 via-rose-500 to-teal-400 shadow-[0_0_12px_rgba(245,183,61,0.5)]" />

        {TIMELINE_STORIES.map((story, storyIdx) => {
          const aesthetic = ERA_AESTHETICS[story.decade] || ERA_AESTHETICS[1980];
          
          // Filtered genres for this story (memoized in storyGenresMap - P2-13)
          const storyGenres = storyGenresMap.get(story.id) || [];

          return (
            <div 
              key={story.id} 
              id={story.id}
              ref={(el) => {
                storyElementsRef.current[story.id] = el;
              }}
              className="relative group scroll-mt-28"
            >
              {/* Left Chronological Hub (Timeline Node) */}
              <div className="absolute -left-[31px] sm:-left-[47px] top-1.5 flex items-center justify-center">
                {/* Glowing Concentric Hub Ring */}
                <div 
                  className="w-5 h-5 rounded-full border-2 bg-[#0c0d12] flex items-center justify-center transition-all duration-300 group-hover:scale-125 shadow-lg"
                  style={{
                    borderColor: aesthetic.accentColor,
                    boxShadow: `0 0 16px ${aesthetic.glowColor}`,
                  }}
                >
                  <div 
                    className="w-2 h-2 rounded-full transition-colors"
                    style={{ backgroundColor: aesthetic.accentColor }}
                  />
                </div>
              </div>

              {/* Desktop Sticky Year Coordinates Badge */}
              <div className="sm:absolute sm:-left-44 sm:top-0 sm:w-32 sm:text-right mb-3 sm:mb-0">
                <div 
                  className="inline-block px-3 py-1 rounded-xl text-xs font-mono font-extrabold border shadow-md transition-all group-hover:scale-105"
                  style={{
                    color: aesthetic.accentColor,
                    backgroundColor: aesthetic.badgeBg,
                    borderColor: aesthetic.badgeBorder,
                    boxShadow: `0 0 10px ${aesthetic.glowColor}`,
                  }}
                >
                  {story.year}
                </div>
                <div className="text-[11px] text-[#636875] font-mono mt-1 hidden sm:block">
                  EPOCH {String(storyIdx + 1).padStart(2, "0")}
                </div>
              </div>

              {/* Documentary-Grade Story Card */}
              <div 
                className={`relative overflow-hidden rounded-3xl bg-gradient-to-b ${aesthetic.gradient} border border-white/[0.08] hover:border-white/[0.22] p-5 sm:p-7 shadow-2xl transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)]`}
                style={{
                  borderLeftColor: aesthetic.accentColor,
                  borderLeftWidth: 3,
                }}
              >
                {/* Subtle chromatic corner gradient glow (zero blur raster penalty - P2-13) */}
                <div 
                  className="absolute -top-24 -right-24 w-60 h-60 rounded-full pointer-events-none opacity-20"
                  style={{ 
                    background: `radial-gradient(circle, ${aesthetic.accentColor} 0%, transparent 70%)` 
                  }}
                />

                {/* Card Top Title & Cultural Movement Header */}
                <div className="flex flex-wrap items-start justify-between gap-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span 
                        className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border"
                        style={{
                          color: aesthetic.accentColor,
                          borderColor: aesthetic.badgeBorder,
                          backgroundColor: aesthetic.badgeBg,
                        }}
                      >
                        {aesthetic.culturalTag[language]}
                      </span>
                    </div>

                    <h2 className="text-xl sm:text-2xl font-extrabold text-[#f5f4ef] mt-2 tracking-wide leading-snug">
                      {story.title[language]}
                    </h2>
                  </div>

                  {/* Era Tag Pill */}
                  <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-white/[0.05] text-[#b9b7b0] border border-white/[0.1] shrink-0">
                    {story.decade}s DECADE
                  </span>
                </div>

                {/* Narrative Paragraph */}
                <p className="text-xs sm:text-sm text-[#b4b7c2] mt-3.5 leading-relaxed font-sans font-normal border-l-2 border-white/[0.12] pl-3.5 py-0.5">
                  {story.description[language]}
                </p>

                {/* Technological & Cultural Milestone Tags (时代技术与设备突破) */}
                <div className="mt-4 pt-3.5 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#7e8494] mb-2">
                    <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{t("timeline_tech_gear")}</span>
                  </div>
                  
                  <div className="flex flex-wrap gap-1.5">
                    {aesthetic.techMilestones.map((tech, tIdx) => (
                      <div 
                        key={tIdx}
                        className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-xl bg-[#0c0d12]/80 border border-white/[0.08] text-[#c7cbd6] font-mono shadow-sm"
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: aesthetic.accentColor }} />
                        <span>{tech[language]}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Milestone Genres in this Era (代表曲风网格与即时试听) */}
                <div className="mt-5 pt-4 border-t border-white/[0.08]">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#f5f4ef]">
                      <Disc className="w-3.5 h-3.5" style={{ color: aesthetic.accentColor }} />
                      <span>{t("timeline_epoch_genres")}</span>
                      <span className="text-[10px] font-mono text-[#7e8494]">
                        ({storyGenres.length})
                      </span>
                    </div>

                    <span className="text-[10px] text-[#7e8494] font-sans hidden sm:inline">
                      {t("timeline_audition_hint")}
                    </span>
                  </div>

                  {storyGenres.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {storyGenres.map((genre) => {
                        const isPlayingThis = playingGenreId === genre.id;

                        return (
                          <div
                            key={genre.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => onSelectGenre(genre)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onSelectGenre(genre);
                              }
                            }}
                            className={`group/card relative p-3 rounded-2xl transition-all duration-200 cursor-pointer flex flex-col justify-between border text-left outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                              isPlayingThis
                                ? "bg-[#181b26] border-accent shadow-[0_0_16px_rgba(245,183,61,0.35)] scale-[1.01]"
                                : "bg-[#0b0c11]/80 hover:bg-[#13151f] border-white/[0.06] hover:border-white/20 shadow-md"
                            }`}
                            aria-label={`${genre.name} (${genre.origin_year})`}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-1.5">
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-bold text-xs sm:text-sm text-[#f5f4ef] group-hover/card:text-accent transition-colors truncate">
                                    {genre.name}
                                  </h4>
                                  {genre.aliases[0] && isZh && (
                                    <div className="text-[10px] text-[#7e8494] truncate">
                                      {genre.aliases[0]}
                                    </div>
                                  )}
                                </div>

                                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/[0.05] text-[#b9b7b0] border border-white/[0.08] shrink-0">
                                  {genre.origin_year}
                                </span>
                              </div>

                              {/* BPM and Time Signature */}
                              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-[#8e93a0] font-mono">
                                <span className="px-1.5 py-0.5 rounded bg-[#161822] border border-white/[0.06] text-[#d6d4ce]">
                                  {genre.time_signature || "4/4"}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-[#161822] border border-white/[0.06] text-accent font-bold">
                                  {genre.bpm_range} BPM
                                </span>
                              </div>

                              {/* Key characteristics snippet */}
                              <p className="text-[10.5px] text-[#9ca1ad] line-clamp-2 mt-2 leading-relaxed font-sans">
                                {genre.key_characteristics[language] || genre.rhythm_features[language]}
                              </p>
                            </div>

                            {/* Action Buttons: Audition & Studio */}
                            <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center gap-1.5">
                              {/* Audio preview audition button */}
                              <button
                                type="button"
                                onClick={(e) => toggleAudition(genre, e)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-1 rounded-xl text-xs font-bold transition-all ${
                                  isPlayingThis
                                    ? "bg-accent text-black shadow-md"
                                    : "bg-[#161824] hover:bg-[#202334] text-[#d6d4ce] border border-white/[0.08]"
                                }`}
                                title={isPlayingThis ? t("timeline_stop_preview") : t("timeline_play_preview")}
                                aria-label={isPlayingThis ? t("timeline_stop_preview") : t("timeline_play_preview")}
                              >
                                {isPlayingThis ? (
                                  <>
                                    <Square className="w-3 h-3 fill-current text-black" />
                                    <span>{t("timeline_stop_preview")}</span>
                                    {/* Equalizer animation */}
                                    <div className="flex items-end gap-0.5 h-3 ml-1">
                                      <span className="w-0.5 h-3 bg-black animate-pulse" />
                                      <span className="w-0.5 h-1.5 bg-black animate-ping" />
                                      <span className="w-0.5 h-2.5 bg-black animate-pulse" />
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <Volume2 className="w-3 h-3 text-accent" />
                                    <span>{t("timeline_play_preview")}</span>
                                  </>
                                )}
                              </button>

                              {/* Open in Studio button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenStudio(genre);
                                }}
                                className="p-1 rounded-xl bg-[#161824] hover:bg-accent hover:text-black text-[#8e93a0] border border-white/[0.08] transition-colors shrink-0"
                                title={t("open_in_studio")}
                                aria-label={t("open_in_studio")}
                              >
                                <Sliders className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-xs text-[#636875]">
                      {t("timeline_no_genres_in_era")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
