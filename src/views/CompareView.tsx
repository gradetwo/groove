import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Columns, 
  Plus, 
  X, 
  Play, 
  Pause, 
  Square, 
  Sliders, 
  ExternalLink, 
  Sparkles, 
  Activity, 
  ArrowRightLeft,
  Music,
  CheckCircle,
  Volume2,
  Disc3,
  Flame,
  Radio,
  Clock,
  Layers,
  Zap,
  Info
} from "lucide-react";
import { Genre, GenreRadarMetrics, SequencerTrack } from "../types/genre";
import { ALL_GENRES, GENRES_MAP } from "../data/genres";
import { AudioEngine } from "../audio/AudioEngine";
import { useLanguage } from "../i18n/LanguageContext";

interface CompareViewProps {
  initialGenres?: Genre[];
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
}

const COMPARE_COLORS = [
  { stroke: "#f5b73d", fill: "rgba(245, 183, 61, 0.22)", text: "text-[#f5b73d]", badge: "bg-amber-500/20 border-amber-500/40 text-amber-300", bar: "bg-[#f5b73d]", border: "border-[#f5b73d]" },
  { stroke: "#6366f1", fill: "rgba(99, 102, 241, 0.22)", text: "text-indigo-400", badge: "bg-indigo-500/20 border-indigo-500/40 text-indigo-300", bar: "bg-indigo-500", border: "border-indigo-500" },
  { stroke: "#ec4899", fill: "rgba(236, 72, 153, 0.22)", text: "text-pink-400", badge: "bg-pink-500/20 border-pink-500/40 text-pink-300", bar: "bg-pink-500", border: "border-pink-500" },
  { stroke: "#06b6d4", fill: "rgba(6, 182, 212, 0.22)", text: "text-cyan-400", badge: "bg-cyan-500/20 border-cyan-500/40 text-cyan-300", bar: "bg-cyan-500", border: "border-cyan-500" },
];

const RADAR_AXES: Array<{ key: keyof GenreRadarMetrics; labelEn: string; labelZh: string }> = [
  { key: "groove", labelEn: "Groove", labelZh: "律动感" },
  { key: "brightness", labelEn: "Brightness", labelZh: "明亮度" },
  { key: "harmonicComplexity", labelEn: "Harmonics", labelZh: "和声复杂" },
  { key: "rhythmDensity", labelEn: "Density", labelZh: "节奏密度" },
  { key: "bassEnergy", labelEn: "Bass Energy", labelZh: "低频能量" },
  { key: "melodicFocus", labelEn: "Melody", labelZh: "旋律性" },
];

const DRUM_TRACK_IDS = new Set(["kick", "snare", "hihat", "percussion"]);

const isDrumTrack = (track: SequencerTrack, index: number): boolean => {
  if (track.track_id && DRUM_TRACK_IDS.has(track.track_id)) return true;
  const id = `${track.track_id || ""} ${track.name || ""} ${track.instrument || ""}`.toLowerCase();
  const drumKeywords = ["kick", "snare", "clap", "hat", "hihat", "perc", "tom", "rim", "shaker", "cymbal", "ride", "crash", "conga", "bongo"];
  if (drumKeywords.some((k) => id.includes(k))) return true;
  const nonDrumKeywords = ["bass", "sub", "chord", "lead", "synth", "pad", "arp", "organ", "piano", "fx", "vocal"];
  if (nonDrumKeywords.some((k) => id.includes(k))) return false;
  return index < 4;
};

const applyAudioMutes = (engine: AudioEngine, mode: "drums" | "full", genre: Genre) => {
  const tracks = genre.sequencer_pattern?.tracks || [];
  tracks.forEach((track, idx) => {
    const isDrum = isDrumTrack(track, idx);
    const shouldMute = mode === "drums" ? !isDrum : false;
    engine.setTrackState(idx, { mute: shouldMute });
  });
};

const PRESET_MATCHUPS = [
  { labelZh: "House 对决 Techno", labelEn: "House vs Techno", ids: ["chicago-house", "detroit-techno"] },
  { labelZh: "Boom Bap 对决 Trap", labelEn: "Boom Bap vs Trap", ids: ["boom-bap", "edm-trap"] },
  { labelZh: "Liquid DnB 对决 Jungle", labelEn: "Liquid DnB vs Jungle", ids: ["liquid-dnb", "jungle"] },
  { labelZh: "Synthwave 对决 Cyberpunk", labelEn: "Synthwave vs Cyberpunk", ids: ["synthwave", "cyberpunk-midtempo"] },
  { labelZh: "Nu-Disco 对决 Funk", labelEn: "Nu-Disco vs Funk", ids: ["nu-disco", "funk"] },
];

export const CompareView: React.FC<CompareViewProps> = ({
  initialGenres,
  onSelectGenre,
  onOpenStudio,
}) => {
  const { t, language } = useLanguage();

  // Compare pool: 2 to 4 genres
  const [genres, setGenres] = useState<Genre[]>(() => {
    if (initialGenres && initialGenres.length >= 2) {
      return initialGenres.slice(0, 4);
    }
    return [
      GENRES_MAP["chicago-house"] || ALL_GENRES[0],
      GENRES_MAP["detroit-techno"] || ALL_GENRES[1],
    ];
  });

  useEffect(() => {
    if (initialGenres && initialGenres.length >= 2) {
      setGenres(initialGenres.slice(0, 4));
    }
  }, [initialGenres]);

  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  // Audio audition mode: "drums" (鼓组) | "full" (全部音轨)
  const [playMode, setPlayMode] = useState<"drums" | "full">("full");
  const engineRef = useRef<AudioEngine | null>(null);

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
      }
    };
  }, []);

  const handleTogglePlay = (genre: Genre) => {
    if (playingId === genre.id) {
      if (engineRef.current) {
        engineRef.current.stop();
      }
      setPlayingId(null);
      return;
    }

    if (engineRef.current) {
      engineRef.current.destroy();
    }

    const engine = new AudioEngine({
      onStop: () => setPlayingId(null),
    });
    engine.setPattern(genre.sequencer_pattern);
    engine.setBpm(genre.default_bpm || 120);
    applyAudioMutes(engine, playMode, genre);
    engine.play();
    engineRef.current = engine;
    setPlayingId(genre.id);
  };

  const handleStopAudio = () => {
    if (engineRef.current) {
      engineRef.current.stop();
    }
    setPlayingId(null);
  };

  const handleModeChange = (mode: "drums" | "full") => {
    setPlayMode(mode);
    if (engineRef.current && playingId) {
      const currentGenre = genres.find((g) => g.id === playingId);
      if (currentGenre) {
        applyAudioMutes(engineRef.current, mode, currentGenre);
      }
    }
  };

  const handleRemoveGenre = (id: string) => {
    if (genres.length <= 2) return;
    if (playingId === id && engineRef.current) {
      engineRef.current.stop();
      setPlayingId(null);
    }
    setGenres((prev) => prev.filter((g) => g.id !== id));
  };

  const handleAddGenre = (genre: Genre) => {
    if (genres.length >= 4 || genres.some((g) => g.id === genre.id)) return;
    setGenres((prev) => [...prev, genre]);
    setAddDropdownOpen(false);
  };

  const handleSelectPreset = (ids: string[]) => {
    const selected = ids.map((id) => GENRES_MAP[id]).filter(Boolean) as Genre[];
    if (selected.length >= 2) {
      if (engineRef.current) {
        engineRef.current.stop();
        setPlayingId(null);
      }
      setGenres(selected);
    }
  };

  // Calculate similarity between genre 0 and genre 1
  const similarityInfo = useMemo(() => {
    if (genres.length < 2) return { score: 100, bpmOverlap: true };
    const g1 = genres[0];
    const g2 = genres[1];

    let sumSq = 0;
    RADAR_AXES.forEach((axis) => {
      const v1 = g1.radar_metrics ? g1.radar_metrics[axis.key] || 5 : 5;
      const v2 = g2.radar_metrics ? g2.radar_metrics[axis.key] || 5 : 5;
      sumSq += Math.pow((v1 - v2) / 10, 2);
    });
    const radarDist = Math.sqrt(sumSq / RADAR_AXES.length);
    const radarSim = Math.max(0, 1 - radarDist) * 100;

    const p1 = g1.bpm_range.split("-").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    const p2 = g2.bpm_range.split("-").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    const min1 = p1[0] || g1.default_bpm;
    const max1 = p1[1] || min1;
    const min2 = p2[0] || g2.default_bpm;
    const max2 = p2[1] || min2;

    const overlap = Math.max(0, Math.min(max1, max2) - Math.max(min1, min2));
    const hasOverlap = overlap > 0 || Math.abs(g1.default_bpm - g2.default_bpm) <= 6;
    const bpmSim = hasOverlap ? 90 : Math.max(20, 100 - Math.abs(g1.default_bpm - g2.default_bpm) * 1.5);

    const categorySim = g1.category === g2.category ? 95 : 50;

    const score = Math.round(radarSim * 0.5 + bpmSim * 0.3 + categorySim * 0.2);
    return { score, bpmOverlap: hasOverlap };
  }, [genres]);

  // Radar chart coordinates
  const radarPoints = (genre: Genre, radius = 90, center = 110) => {
    const coords: string[] = [];
    RADAR_AXES.forEach((axis, idx) => {
      const angle = (idx / RADAR_AXES.length) * Math.PI * 2 - Math.PI / 2;
      const val = genre.radar_metrics ? genre.radar_metrics[axis.key] || 5 : 5;
      const r = (val / 10) * radius;
      const x = center + Math.cos(angle) * r;
      const y = center + Math.sin(angle) * r;
      coords.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    });
    return coords.join(" ");
  };

  const currentPlayingGenre = genres.find((g) => g.id === playingId);

  // Column layout grid class based on count
  const columnGridClass = useMemo(() => {
    if (genres.length === 2) return "grid-cols-1 md:grid-cols-2";
    if (genres.length === 3) return "grid-cols-1 md:grid-cols-3";
    return "grid-cols-1 md:grid-cols-2 xl:grid-cols-4";
  }, [genres.length]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Top Controls & Audio Audition Mode Toolbar */}
      <div className="bg-[#121317] border border-[#23262d] p-5 rounded-3xl shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Columns className="w-4 h-4 text-[#f5b73d]" />
              </div>
              <h2 className="text-xl font-black text-[#e9e7e0] tracking-wide">
                {t("compare_title")}
              </h2>
            </div>
            <p className="text-xs text-[#8b8f99] mt-1">
              {language === "zh"
                ? "左右多列横向比对，深度剖析速度律动、打击乐特征与声学雷达"
                : "Side-by-side columnar comparison across tempo, drum patterns, and sonic radar"}
            </p>
          </div>

          {/* Right Action Group: Mode Switcher & Add Genre */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Audition Mode Selector (鼓组 / 全轨) */}
            <div className="flex items-center bg-[#0a0b0d] p-1 rounded-2xl border border-[#23262d] shadow-inner">
              <span className="text-[11px] font-bold text-[#8b8f99] px-2.5 flex items-center space-x-1">
                <Radio className="w-3 h-3 text-[#f5b73d]" />
                <span>{language === "zh" ? "试听模式:" : "Audition:"}</span>
              </span>
              <button
                onClick={() => handleModeChange("drums")}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  playMode === "drums"
                    ? "bg-[#f5b73d] text-[#0a0b0d] shadow-md shadow-amber-500/20"
                    : "text-[#8b8f99] hover:text-[#e9e7e0] hover:bg-[#1a1b20]"
                }`}
                title={language === "zh" ? "实时静音贝斯与和声音轨，仅保留底鼓、军鼓、镲片与打击乐" : "Mute harmonic tracks, isolate kick, snare, hats & percussion"}
              >
                <span>🥁</span>
                <span>{t("drums_only")}</span>
              </button>
              <button
                onClick={() => handleModeChange("full")}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  playMode === "full"
                    ? "bg-[#f5b73d] text-[#0a0b0d] shadow-md shadow-amber-500/20"
                    : "text-[#8b8f99] hover:text-[#e9e7e0] hover:bg-[#1a1b20]"
                }`}
                title={language === "zh" ? "播放包含底鼓、军鼓、贝斯、和声与合成器的全部音轨" : "Play complete arrangement with bass, chords, leads and drums"}
              >
                <span>🎵</span>
                <span>{t("full_band")}</span>
              </button>
            </div>

            {/* Add genre dropdown */}
            {genres.length < 4 && (
              <div className="relative">
                <button
                  onClick={() => setAddDropdownOpen(!addDropdownOpen)}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-[#1c1e24] hover:bg-[#252830] border border-[#2b2e38] text-[#e9e7e0] font-bold text-xs transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5 text-[#f5b73d]" />
                  <span>{t("compare_add")}</span>
                  <span className="ml-1 text-[10px] text-[#8b8f99] font-mono">({genres.length}/4)</span>
                </button>

                {addDropdownOpen && (
                  <div className="absolute right-0 top-12 z-40 w-72 bg-[#121317] border border-[#2b2e38] rounded-2xl shadow-2xl p-2 max-h-72 overflow-y-auto space-y-1 animate-slide-up">
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#5a5e68]">
                      {language === "zh" ? "可添加曲风" : "Select Genre"}
                    </div>
                    {ALL_GENRES.filter((g) => !genres.some((sel) => sel.id === g.id)).map((g) => (
                      <button
                        key={g.id}
                        onClick={() => handleAddGenre(g)}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#1a1b20] text-xs text-[#e9e7e0] hover:text-[#f5b73d] flex items-center justify-between transition-colors"
                      >
                        <span className="font-semibold truncate">{g.name}</span>
                        <span className="text-[10px] text-[#8b8f99] ml-2 px-1.5 py-0.5 rounded bg-[#0d0e12]">
                          {g.category}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Live Audition Indicator Bar when music is playing */}
        {currentPlayingGenre && (
          <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-2.5 text-xs text-[#f5b73d] animate-fade-in">
            <div className="flex items-center space-x-3">
              <div className="flex items-end space-x-0.5 h-3.5">
                <span className="w-1 bg-[#f5b73d] rounded-full animate-pulse h-3.5" />
                <span className="w-1 bg-[#f5b73d] rounded-full animate-pulse h-2" style={{ animationDelay: "150ms" }} />
                <span className="w-1 bg-[#f5b73d] rounded-full animate-pulse h-3" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="font-bold text-[#e9e7e0]">
                {t("now_playing")}: <span className="text-[#f5b73d]">{currentPlayingGenre.name}</span>
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-[#f5b73d] font-semibold border border-amber-500/30">
                {playMode === "drums" ? `🥁 ${t("drums_only")}` : `🎵 ${t("full_band")}`}
              </span>
              <span className="text-[11px] text-[#8b8f99] hidden sm:inline">
                ({currentPlayingGenre.default_bpm} BPM · {currentPlayingGenre.time_signature})
              </span>
            </div>
            <button
              onClick={handleStopAudio}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-bold transition-colors"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>{t("stop_audition")}</span>
            </button>
          </div>
        )}

        {/* Preset Matchups Pill Row */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#1f222a]">
          <span className="text-[11px] font-bold text-[#5a5e68] uppercase tracking-wider flex items-center space-x-1 mr-1">
            <Sparkles className="w-3 h-3 text-[#f5b73d]" />
            <span>{t("compare_presets")}:</span>
          </span>
          {PRESET_MATCHUPS.filter(p => GENRES_MAP[p.ids[0]] && GENRES_MAP[p.ids[1]]).map((preset) => (
            <button
              key={preset.labelEn}
              onClick={() => handleSelectPreset(preset.ids)}
              className="text-[11px] px-2.5 py-1 rounded-xl bg-[#0d0e12] hover:bg-[#1c1e24] border border-[#23262d] hover:border-[#383d4a] text-[#8b8f99] hover:text-[#e9e7e0] font-medium transition-colors"
            >
              {language === "zh" ? preset.labelZh : preset.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* Radar Chart & DNA Similarity Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-[#121317] border border-[#23262d] rounded-3xl p-6 shadow-xl">
        {/* Radar SVG */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center">
          <h4 className="text-xs font-bold text-[#8b8f99] uppercase tracking-wider mb-2 flex items-center space-x-1.5">
            <Activity className="w-3.5 h-3.5 text-[#f5b73d]" />
            <span>{t("radar_chart")}</span>
          </h4>
          <svg width="240" height="240" className="overflow-visible my-2">
            {/* Background concentric webs */}
            {[0.25, 0.5, 0.75, 1.0].map((level, i) => (
              <polygon
                key={i}
                points={RADAR_AXES.map((_, idx) => {
                  const angle = (idx / RADAR_AXES.length) * Math.PI * 2 - Math.PI / 2;
                  const x = 120 + Math.cos(angle) * (90 * level);
                  const y = 120 + Math.sin(angle) * (90 * level);
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(" ")}
                fill="none"
                stroke="#27272a"
                strokeWidth="1"
              />
            ))}

            {/* Radar spoke lines */}
            {RADAR_AXES.map((axis, idx) => {
              const angle = (idx / RADAR_AXES.length) * Math.PI * 2 - Math.PI / 2;
              const x2 = 120 + Math.cos(angle) * 95;
              const y2 = 120 + Math.sin(angle) * 95;
              const labelX = 120 + Math.cos(angle) * 116;
              const labelY = 120 + Math.sin(angle) * 116;

              return (
                <g key={axis.key}>
                  <line x1="120" y1="120" x2={x2} y2={y2} stroke="#3f3f46" strokeWidth="1" />
                  <text
                    x={labelX}
                    y={labelY}
                    fill="#a1a1aa"
                    fontSize="10"
                    fontWeight="600"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {language === "zh" ? axis.labelZh : axis.labelEn}
                  </text>
                </g>
              );
            })}

            {/* Polygons for each genre */}
            {genres.map((genre, idx) => {
              const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
              const points = radarPoints(genre, 90, 120);

              return (
                <polygon
                  key={genre.id}
                  points={points}
                  fill={color.fill}
                  stroke={color.stroke}
                  strokeWidth="2.5"
                  className="transition-all duration-300"
                />
              );
            })}
          </svg>

          {/* Radar Legend */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
            {genres.map((g, idx) => {
              const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
              return (
                <div key={g.id} className="flex items-center space-x-1.5 text-xs">
                  <span className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: color.stroke }} />
                  <span className="font-bold text-[#e9e7e0]">{g.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* DNA Match Bar & Key Insights */}
        <div className="lg:col-span-7 flex flex-col justify-center space-y-5 lg:border-l lg:border-[#23262d] lg:pl-8">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8b8f99] flex items-center space-x-1.5">
                <Flame className="w-3.5 h-3.5 text-[#f5b73d]" />
                <span>
                  {t("similarity_score")} ({genres[0].name} vs {genres[1].name})
                </span>
              </span>
              <span className="text-xl font-mono font-extrabold text-[#f5b73d]">
                {similarityInfo.score}%
              </span>
            </div>
            <div className="w-full bg-[#0d0e12] rounded-full h-3 border border-[#23262d] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 via-indigo-500 to-pink-500 rounded-full transition-all duration-500"
                style={{ width: `${similarityInfo.score}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-4 rounded-2xl bg-[#0d0e12] border border-[#23262d] space-y-1.5">
              <span className="font-bold text-[#5a5e68] uppercase tracking-wider text-[10px] flex items-center space-x-1">
                <Clock className="w-3 h-3 text-[#f5b73d]" />
                <span>{t("bpm_overlap")}</span>
              </span>
              <p className="text-[#e9e7e0] font-mono text-sm font-bold">
                {genres[0].bpm_range} vs {genres[1].bpm_range}
              </p>
              <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                similarityInfo.bpmOverlap 
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" 
                  : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
              }`}>
                {similarityInfo.bpmOverlap 
                  ? (language === "zh" ? "速度兼容 · 极佳混音过渡空间" : "Compatible Mixing Window")
                  : (language === "zh" ? "速度跳跃 · 鲜明舞蹈节奏对比" : "Distinct Dance Tempos")}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0d0e12] border border-[#23262d] space-y-1.5">
              <span className="font-bold text-[#5a5e68] uppercase tracking-wider text-[10px] flex items-center space-x-1">
                <Layers className="w-3 h-3 text-[#f5b73d]" />
                <span>{language === "zh" ? "家族谱系关联" : "Category Kinship"}</span>
              </span>
              <p className="text-[#e9e7e0] font-bold text-sm">
                {genres[0].category} & {genres[1].category}
              </p>
              <span className="text-[11px] text-[#8b8f99] block">
                {genres[0].category === genres[1].category
                  ? (language === "zh" ? "同谱系演化，音色与律动共享基因" : "Same Family Lineage")
                  : (language === "zh" ? "跨流派对比，节奏架构与音色互补" : "Cross-Genre Contrast")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Side-by-Side Columnar Comparison (左右列式比对) */}
      <div className="overflow-x-auto pb-4">
        <div className={`grid ${columnGridClass} gap-5 min-w-[320px]`}>
          {genres.map((genre, idx) => {
            const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
            const isCurrentPlaying = playingId === genre.id;

            return (
              <div
                key={genre.id}
                className="bg-[#121317] border border-[#23262d] rounded-3xl p-5 shadow-xl flex flex-col justify-between relative hover:border-[#383d4a] transition-all"
                style={{ borderTop: `4px solid ${color.stroke}` }}
              >
                {/* Column Top Header */}
                <div className="space-y-4">
                  {/* Category Pill & Remove button */}
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${color.badge}`}>
                      {genre.category}
                    </span>
                    <div className="flex items-center space-x-1">
                      <span className="text-[11px] text-[#8b8f99] font-mono">
                        {genre.origin_year}
                      </span>
                      {genres.length > 2 && (
                        <button
                          onClick={() => handleRemoveGenre(genre.id)}
                          className="text-[#5a5e68] hover:text-[#e9e7e0] p-1 rounded-lg hover:bg-[#1f222a] transition-colors ml-1"
                          title="Remove from comparison"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Genre Title & Aliases */}
                  <div>
                    <h3 className="font-black text-[#e9e7e0] text-xl tracking-wide">
                      {genre.name}
                    </h3>
                    {genre.aliases.length > 0 && (
                      <p className="text-xs text-[#8b8f99] font-medium mt-0.5">
                        {genre.aliases[0]}
                      </p>
                    )}
                  </div>

                  {/* Audition Button (Drums Only or Full Band) */}
                  <div className="space-y-2">
                    <button
                      onClick={() => handleTogglePlay(genre)}
                      className={`w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-2xl font-black text-xs transition-all shadow-md ${
                        isCurrentPlaying
                          ? "bg-[#f5b73d] text-[#0a0b0d] ring-2 ring-amber-400/50 shadow-amber-500/30"
                          : "bg-[#1c1e24] hover:bg-[#252830] text-[#e9e7e0] border border-[#2b2e38] hover:border-amber-500/40"
                      }`}
                    >
                      {isCurrentPlaying ? (
                        <>
                          <div className="flex items-end space-x-0.5 h-3 mr-1">
                            <span className="w-1 bg-[#0a0b0d] rounded-full animate-pulse h-3" />
                            <span className="w-1 bg-[#0a0b0d] rounded-full animate-pulse h-1.5" style={{ animationDelay: "150ms" }} />
                            <span className="w-1 bg-[#0a0b0d] rounded-full animate-pulse h-2.5" style={{ animationDelay: "300ms" }} />
                          </div>
                          <Pause className="w-3.5 h-3.5 fill-current" />
                          <span>
                            {language === "zh"
                              ? `暂停播放 (${playMode === "drums" ? "鼓组" : "全轨"})`
                              : `Pause (${playMode === "drums" ? "Drums" : "Full"})`}
                          </span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current text-[#f5b73d]" />
                          <span>
                            {language === "zh"
                              ? `试听律动 (${playMode === "drums" ? "只播放鼓组" : "全部音轨"})`
                              : `Audition (${playMode === "drums" ? "Drums Only" : "Full Band"})`}
                          </span>
                        </>
                      )}
                    </button>

                    {/* Quick navigation actions */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => onOpenStudio(genre)}
                        className="py-1.5 px-2 rounded-xl bg-[#0d0e12] hover:bg-[#1a1b20] border border-[#23262d] text-[#e9e7e0] hover:text-[#f5b73d] text-[11px] font-bold flex items-center justify-center space-x-1 transition-colors"
                        title={t("open_in_studio")}
                      >
                        <Sliders className="w-3 h-3 text-[#f5b73d]" />
                        <span>{t("open_in_studio")}</span>
                      </button>
                      <button
                        onClick={() => onSelectGenre(genre)}
                        className="py-1.5 px-2 rounded-xl bg-[#0d0e12] hover:bg-[#1a1b20] border border-[#23262d] text-[#8b8f99] hover:text-[#e9e7e0] text-[11px] font-bold flex items-center justify-center space-x-1 transition-colors"
                        title={t("view_detail")}
                      >
                        <span>{t("view_detail")}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Spec Block 1: 核心基础规格 (Core Specs) */}
                  <div className="p-3.5 rounded-2xl bg-[#0d0e12] border border-[#23262d] space-y-2 text-xs">
                    <div className="text-[10px] font-black uppercase tracking-wider text-[#f5b73d] flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>{t("core_specs")}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#1a1c22]">
                      <div>
                        <span className="text-[10px] text-[#5a5e68] block">{t("bpm")}</span>
                        <span className="font-mono font-bold text-[#e9e7e0]">{genre.bpm_range}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#5a5e68] block">{t("time_signature")}</span>
                        <span className="font-mono font-bold text-[#e9e7e0]">{genre.time_signature}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#5a5e68] block">{t("origin_place")}</span>
                        <span className="text-[#b9b7b0] truncate block">{genre.origin_place[language]}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#5a5e68] block">{t("scale")}</span>
                        <span className="font-mono text-[#b9b7b0] truncate block">
                          {genre.sequencer_pattern?.scale || "C Minor"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Spec Block 2: 律动与鼓组 DNA (Drum & Rhythm DNA) */}
                  <div className="p-3.5 rounded-2xl bg-[#0d0e12] border border-[#23262d] space-y-2.5 text-xs">
                    <div className="text-[10px] font-black uppercase tracking-wider text-[#f5b73d] flex items-center space-x-1">
                      <Zap className="w-3 h-3" />
                      <span>{t("groove_dna")}</span>
                    </div>

                    <div className="space-y-2 pt-1 border-t border-[#1a1c22]">
                      <div>
                        <span className="text-[10px] font-bold text-[#5a5e68] uppercase block">
                          🎯 {t("kick_placement")}
                        </span>
                        <p className="text-[#b9b7b0] text-[11px] leading-relaxed mt-0.5">
                          {genre.drum_pattern.kick[language]}
                        </p>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-[#5a5e68] uppercase block">
                          💥 {t("snare_placement")}
                        </span>
                        <p className="text-[#b9b7b0] text-[11px] leading-relaxed mt-0.5">
                          {genre.drum_pattern.snare_clap[language]}
                        </p>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-[#5a5e68] uppercase block">
                          ⚡ {t("hihat_pattern")}
                        </span>
                        <p className="text-[#b9b7b0] text-[11px] leading-relaxed mt-0.5">
                          {genre.drum_pattern.hihats[language]}
                        </p>
                      </div>

                      {genre.drum_pattern.percussion && (
                        <div>
                          <span className="text-[10px] font-bold text-[#5a5e68] uppercase block">
                            🥁 {language === "zh" ? "打击乐加花" : "Percussion"}
                          </span>
                          <p className="text-[#b9b7b0] text-[11px] leading-relaxed mt-0.5">
                            {genre.drum_pattern.percussion[language]}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Spec Block 3: 低频与和声架构 (Bass & Harmonics) */}
                  <div className="p-3.5 rounded-2xl bg-[#0d0e12] border border-[#23262d] space-y-2 text-xs">
                    <div className="text-[10px] font-black uppercase tracking-wider text-[#f5b73d] flex items-center space-x-1">
                      <Music className="w-3 h-3" />
                      <span>{t("bass_harmony")}</span>
                    </div>

                    <div className="space-y-2 pt-1 border-t border-[#1a1c22]">
                      <div>
                        <span className="text-[10px] font-bold text-[#5a5e68] uppercase block">
                          🎸 {t("bass_design")}
                        </span>
                        <p className="text-[#b9b7b0] text-[11px] leading-relaxed mt-0.5">
                          {genre.bass_pattern[language]}
                        </p>
                      </div>

                      {genre.key_characteristics && (
                        <div>
                          <span className="text-[10px] font-bold text-[#5a5e68] uppercase block">
                            🎹 {t("harmonic_rules")}
                          </span>
                          <p className="text-[#b9b7b0] text-[11px] leading-relaxed mt-0.5">
                            {genre.key_characteristics[language]}
                          </p>
                        </div>
                      )}

                      {genre.production_tips && genre.production_tips[language] && genre.production_tips[language].length > 0 && (
                        <div>
                          <span className="text-[10px] font-bold text-[#5a5e68] uppercase block">
                            💡 {t("sound_design_tips")}
                          </span>
                          <ul className="text-[#8b8f99] text-[11px] list-disc list-inside space-y-0.5 mt-0.5">
                            {genre.production_tips[language].slice(0, 2).map((tip, tIdx) => (
                              <li key={tIdx} className="truncate">{tip}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Spec Block 4: 六维声学特性雷达指标 (Sonic Radar Breakdown) */}
                  <div className="p-3.5 rounded-2xl bg-[#0d0e12] border border-[#23262d] space-y-2 text-xs">
                    <div className="text-[10px] font-black uppercase tracking-wider text-[#f5b73d] flex items-center space-x-1">
                      <Activity className="w-3 h-3" />
                      <span>{t("sonic_radar")}</span>
                    </div>

                    <div className="space-y-1.5 pt-1 border-t border-[#1a1c22]">
                      {RADAR_AXES.map((axis) => {
                        const val = genre.radar_metrics ? genre.radar_metrics[axis.key] || 5 : 5;
                        return (
                          <div key={axis.key} className="space-y-0.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-[#8b8f99] font-medium">
                                {language === "zh" ? axis.labelZh : axis.labelEn}
                              </span>
                              <span className="font-mono font-bold text-[#e9e7e0]">
                                {val}/10
                              </span>
                            </div>
                            <div className="w-full bg-[#181a20] rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full ${color.bar} rounded-full transition-all duration-500`}
                                style={{ width: `${(val / 10) * 100}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Spec Block 5: 经典代表作 (Milestones) */}
                  {genre.representative_tracks && genre.representative_tracks.length > 0 && (
                    <div className="p-3.5 rounded-2xl bg-[#0d0e12] border border-[#23262d] space-y-2 text-xs">
                      <div className="text-[10px] font-black uppercase tracking-wider text-[#f5b73d] flex items-center space-x-1">
                        <Disc3 className="w-3 h-3" />
                        <span>{t("milestones")}</span>
                      </div>
                      <div className="space-y-1.5 pt-1 border-t border-[#1a1c22]">
                        {genre.representative_tracks.slice(0, 3).map((track, trackIdx) => (
                          <div key={trackIdx} className="flex items-center justify-between text-[11px]">
                            <div className="truncate mr-2">
                              <span className="text-[#e9e7e0] font-semibold">{track.title}</span>
                              <span className="text-[#5a5e68] ml-1">· {track.artist}</span>
                            </div>
                            {track.link ? (
                              <a
                                href={track.link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-[#f5b73d] hover:underline flex items-center space-x-0.5 flex-shrink-0"
                              >
                                <span>{t("listen_link")}</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            ) : (
                              <span className="text-[10px] text-[#5a5e68] font-mono">{track.year}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Action */}
                <div className="pt-4 mt-4 border-t border-[#23262d]">
                  <button
                    onClick={() => onOpenStudio(genre)}
                    className="w-full py-2.5 rounded-2xl bg-[#f5b73d] hover:brightness-110 text-[#0a0b0d] text-xs font-black flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-amber-500/20"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>{language === "zh" ? "在工作台打开并在音序器中编辑" : "Open & Edit in Studio"}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

