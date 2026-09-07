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
  const [playingMode, setPlayingMode] = useState<"drums" | "full">("full");
  const engineRef = useRef<AudioEngine | null>(null);

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, []);

  // Handle explicit playback per mode (Drums Only or Full Band)
  const handlePlayMode = (genre: Genre, mode: "drums" | "full") => {
    // If clicking same genre and same mode, stop it
    if (playingId === genre.id && playingMode === mode) {
      if (engineRef.current) {
        engineRef.current.stop();
      }
      setPlayingId(null);
      return;
    }

    // If already playing this genre but switching mode (e.g. from full to drums or vice versa)
    if (playingId === genre.id && engineRef.current) {
      setPlayingMode(mode);
      applyAudioMutes(engineRef.current, mode, genre);
      return;
    }

    // Otherwise start new playback for this genre & mode
    if (engineRef.current) {
      engineRef.current.destroy();
    }

    const engine = new AudioEngine({
      onStop: () => setPlayingId(null),
    });
    engine.setPattern(genre.sequencer_pattern);
    engine.setBpm(genre.default_bpm || 120);
    applyAudioMutes(engine, mode, genre);
    engine.play();
    engineRef.current = engine;
    setPlayingId(genre.id);
    setPlayingMode(mode);
  };

  const handleStopAudio = () => {
    if (engineRef.current) {
      engineRef.current.stop();
    }
    setPlayingId(null);
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

    const parseBpm = (range: string) => {
      const parts = range.split("-").map((s) => parseInt(s.trim()));
      return { min: parts[0] || 120, max: parts[1] || parts[0] || 120 };
    };
    const b1 = parseBpm(g1.bpm_range);
    const b2 = parseBpm(g2.bpm_range);
    const bpmOverlap = Math.max(b1.min, b2.min) <= Math.min(b1.max, b2.max);

    return {
      score: Math.round(radarSim),
      bpmOverlap,
      overlapMin: Math.max(b1.min, b2.min),
      overlapMax: Math.min(b1.max, b2.max),
    };
  }, [genres]);

  // SVG Radar Polygon coordinates & vertex generator
  const getRadarVertexList = (genre: Genre) => {
    const center = 110;
    const radius = 80;
    return RADAR_AXES.map((axis, idx) => {
      const angle = (Math.PI * 2 * idx) / RADAR_AXES.length - Math.PI / 2;
      const val = genre.radar_metrics ? genre.radar_metrics[axis.key] || 5 : 5;
      const r = (val / 10) * radius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      return { x, y, val, axis };
    });
  };

  const currentPlayingGenre = genres.find((g) => g.id === playingId);

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-4 space-y-6">
      {/* Top Header & Toolbar */}
      <div className="bg-[#121317] border border-[#23262d] rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <Columns className="w-5 h-5 text-[#f5b73d]" />
              <h2 className="text-xl font-black text-[#e9e7e0] tracking-wide">
                {t("compare_title")}
              </h2>
            </div>
            <p className="text-sm text-[#8b8f99] mt-1">
              {language === "zh" 
                ? "左右并排对比不同曲风的鼓组切分、和声架构与声学特性" 
                : "Side-by-side columnar comparison of drum syncopation, harmonic structure & radar DNA"}
            </p>
          </div>

          {/* Right Action Group: Add Genre & Active Count */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Add genre dropdown */}
            {genres.length < 4 && (
              <div className="relative">
                <button
                  onClick={() => setAddDropdownOpen(!addDropdownOpen)}
                  className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#1c1e24] hover:bg-[#252830] border border-[#2b2e38] text-[#e9e7e0] font-bold text-sm transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4 text-[#f5b73d]" />
                  <span>{t("compare_add")}</span>
                  <span className="ml-1 text-xs text-[#8b8f99] font-mono">({genres.length}/4)</span>
                </button>

                {addDropdownOpen && (
                  <div className="absolute right-0 top-12 z-40 w-72 bg-[#121317] border border-[#2b2e38] rounded-2xl shadow-2xl p-2 max-h-72 overflow-y-auto space-y-1 animate-slide-up">
                    <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#5a5e68]">
                      {language === "zh" ? "可添加曲风" : "Select Genre"}
                    </div>
                    {ALL_GENRES.filter((g) => !genres.some((sel) => sel.id === g.id)).map((g) => (
                      <button
                        key={g.id}
                        onClick={() => handleAddGenre(g)}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#1a1b20] text-sm text-[#e9e7e0] hover:text-[#f5b73d] flex items-center justify-between transition-colors"
                      >
                        <span className="font-semibold truncate">{g.name}</span>
                        <span className="text-xs text-[#8b8f99] ml-2 px-1.5 py-0.5 rounded bg-[#0d0e12]">
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
          <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 text-sm text-[#f5b73d] animate-fade-in">
            <div className="flex items-center space-x-3">
              <div className="flex items-end space-x-0.5 h-4">
                <span className="w-1 bg-[#f5b73d] rounded-full animate-pulse h-4" />
                <span className="w-1 bg-[#f5b73d] rounded-full animate-pulse h-2.5" style={{ animationDelay: "150ms" }} />
                <span className="w-1 bg-[#f5b73d] rounded-full animate-pulse h-3.5" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="font-bold text-[#e9e7e0]">
                {t("now_playing")}: <span className="text-[#f5b73d]">{currentPlayingGenre.name}</span>
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/20 text-[#f5b73d] font-bold border border-amber-500/40">
                {playingMode === "drums" ? t("drums_only") : t("full_band")}
              </span>
              <span className="text-xs text-[#8b8f99] hidden sm:inline">
                ({currentPlayingGenre.default_bpm} BPM · {currentPlayingGenre.time_signature})
              </span>
            </div>
            <button
              onClick={handleStopAudio}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-bold transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>{t("stop_audition")}</span>
            </button>
          </div>
        )}

        {/* Presets Quick Matchup Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#1f2229]">
          <span className="text-xs font-bold text-[#737887] uppercase tracking-wider flex items-center space-x-1 mr-1">
            <Sparkles className="w-3.5 h-3.5 text-[#f5b73d]" />
            <span>{t("compare_presets")}:</span>
          </span>
          {PRESET_MATCHUPS.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectPreset(preset.ids)}
              className="text-xs px-3 py-1.5 rounded-xl bg-[#0d0e12] hover:bg-[#1c1e24] border border-[#23262d] hover:border-[#383d4a] text-[#a4a9b5] hover:text-[#e9e7e0] font-semibold transition-colors"
            >
              {language === "zh" ? preset.labelZh : preset.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Analytics Bar: DNA Radar & Similarity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Radar Chart Overlay */}
        <div className="bg-[#121317] border border-[#23262d] rounded-2xl p-4 flex flex-col items-center justify-center relative shadow-lg">
          <h4 className="text-sm font-bold text-[#8b8f99] uppercase tracking-wider mb-2 flex items-center space-x-1.5 self-start">
            <Activity className="w-4 h-4 text-[#f5b73d]" />
            <span>{t("radar_chart")}</span>
          </h4>

          <div className="relative w-[220px] h-[220px]">
            <svg className="w-full h-full" viewBox="0 0 220 220">
              {/* Radar concentric web circles */}
              {[0.25, 0.5, 0.75, 1].map((scale, i) => (
                <circle
                  key={i}
                  cx="110"
                  cy="110"
                  r={80 * scale}
                  fill="none"
                  stroke="#23262d"
                  strokeDasharray={scale === 1 ? "none" : "2,3"}
                  strokeWidth="1"
                />
              ))}

              {/* Radial axis lines */}
              {RADAR_AXES.map((_, i) => {
                const angle = (Math.PI * 2 * i) / RADAR_AXES.length - Math.PI / 2;
                const x2 = 110 + 80 * Math.cos(angle);
                const y2 = 110 + 80 * Math.sin(angle);
                return (
                  <line
                    key={i}
                    x1="110"
                    y1="110"
                    x2={x2}
                    y2={y2}
                    stroke="#23262d"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Render Polygons and Vertex nodes for each active genre */}
              {genres.map((genre, idx) => {
                const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
                const vertices = getRadarVertexList(genre);
                const pointsStr = vertices.map((v) => `${v.x},${v.y}`).join(" ");
                return (
                  <g key={genre.id} className="transition-all duration-300">
                    <polygon
                      points={pointsStr}
                      fill={color.fill}
                      stroke={color.stroke}
                      strokeWidth="2.2"
                      className="transition-all duration-300 hover:opacity-95"
                    />
                    {vertices.map((v, vIdx) => (
                      <circle
                        key={vIdx}
                        cx={v.x}
                        cy={v.y}
                        r="3.2"
                        fill={color.stroke}
                        stroke="#0d0e12"
                        strokeWidth="1.5"
                        className="transition-all duration-300"
                      />
                    ))}
                  </g>
                );
              })}
            </svg>

            {/* Radar Label badges */}
            {RADAR_AXES.map((axis, i) => {
              const angle = (Math.PI * 2 * i) / RADAR_AXES.length - Math.PI / 2;
              const r = 98;
              const x = 110 + r * Math.cos(angle);
              const y = 110 + r * Math.sin(angle);
              return (
                <div
                  key={axis.key}
                  className="absolute text-[11px] font-bold text-[#8b8f99] transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ left: `${x}px`, top: `${y}px` }}
                >
                  {language === "zh" ? axis.labelZh : axis.labelEn}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
            {genres.map((g, idx) => {
              const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
              return (
                <div key={g.id} className="flex items-center space-x-1.5 text-xs font-semibold">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: color.stroke }}
                  />
                  <span className="text-[#e9e7e0]">{g.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* DNA Match Metrics */}
        <div className="lg:col-span-2 bg-[#121317] border border-[#23262d] rounded-2xl p-5 shadow-lg flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold uppercase tracking-wider text-[#8b8f99] flex items-center space-x-1.5">
                <Flame className="w-4 h-4 text-[#f5b73d]" />
                <span>{t("similarity_score")}</span>
              </span>
              <span className="text-2xl font-mono font-extrabold text-[#f5b73d]">
                {similarityInfo.score}%
              </span>
            </div>

            {/* Match score bar */}
            <div className="w-full bg-[#0d0e12] rounded-full h-2.5 overflow-hidden border border-[#23262d]">
              <div
                className="bg-gradient-to-r from-amber-500 via-[#f5b73d] to-emerald-400 h-full rounded-full transition-all duration-700"
                style={{ width: `${similarityInfo.score}%` }}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="bg-[#0d0e12] p-3.5 rounded-xl border border-[#23262d]">
                <span className="font-bold text-[#737887] uppercase tracking-wider text-xs flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5 text-[#f5b73d]" />
                  <span>{t("bpm_overlap")}</span>
                </span>
                <p className="text-[#e9e7e0] font-mono text-sm font-bold mt-1">
                  {similarityInfo.bpmOverlap ? `${similarityInfo.overlapMin} - ${similarityInfo.overlapMax} BPM` : "无直接重叠"}
                </p>
                <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-md mt-1 ${
                  similarityInfo.bpmOverlap ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
                }`}>
                  {similarityInfo.bpmOverlap 
                    ? (language === "zh" ? "适合现场混音无缝衔接" : "Seamless DJ Transition") 
                    : (language === "zh" ? "速度跳跃大，需降速/提速过渡" : "Wide BPM jump")}
                </span>
              </div>

              <div className="bg-[#0d0e12] p-3.5 rounded-xl border border-[#23262d]">
                <span className="font-bold text-[#737887] uppercase tracking-wider text-xs flex items-center space-x-1">
                  <Layers className="w-3.5 h-3.5 text-[#f5b73d]" />
                  <span>{language === "zh" ? "节奏律动骨架对比" : "Rhythm DNA Compatibility"}</span>
                </span>
                <p className="text-[#e9e7e0] font-bold text-sm mt-1">
                  {genres[0]?.time_signature} vs {genres[1]?.time_signature}
                </p>
                <span className="text-xs text-[#8b8f99] block mt-1">
                  {genres[0]?.time_signature === genres[1]?.time_signature
                    ? (language === "zh" ? "拍号一致，可对齐鼓机网格" : "Identical meter, compatible grids")
                    : (language === "zh" ? "复节拍差异，具有多拍对位特征" : "Polymetric contrast")}
                </span>
              </div>
            </div>
          </div>

          <div className="text-xs text-[#737887] mt-3 pt-3 border-t border-[#1a1c22] flex items-center space-x-1.5">
            <Info className="w-4 h-4 text-[#f5b73d] shrink-0" />
            <span>
              {language === "zh"
                ? "点击下方各曲风列中的【只播放鼓组】或【全部音轨】，即可即时孤立听辨底层律动或完整编曲。"
                : "Click [Drums Only] or [Full Tracks] in any column below to instantly audition isolated drums or the complete arrangement."}
            </span>
          </div>
        </div>
      </div>

      {/* Side-by-Side Columnar Comparison Matrix */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-[#e9e7e0] tracking-wide flex items-center space-x-2">
            <Columns className="w-4 h-4 text-[#f5b73d]" />
            <span>{language === "zh" ? "曲风多维并排对比矩阵" : "Multi-Dimensional Genre Comparison Matrix"}</span>
          </h3>
          <span className="text-xs text-[#8b8f99] font-mono">
            {genres.length} {language === "zh" ? "组并排对比中" : "Columns Active"}
          </span>
        </div>

        {/* Dynamic Column Grid: 2, 3, or 4 columns */}
        <div className={`grid gap-4 ${
          genres.length === 2 ? "grid-cols-1 md:grid-cols-2" :
          genres.length === 3 ? "grid-cols-1 md:grid-cols-3" :
          "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
        }`}>
          {genres.map((genre, idx) => {
            const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
            const isCurrentPlaying = playingId === genre.id;

            return (
              <div
                key={genre.id}
                className={`bg-[#121317] border-2 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-4 relative transition-all duration-200 ${
                  isCurrentPlaying ? "ring-2 ring-amber-400/40 shadow-amber-500/10" : ""
                }`}
                style={{ borderColor: isCurrentPlaying ? "#f5b73d" : color.stroke }}
              >
                {/* Column Header */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full border ${color.badge}`}>
                      {genre.category}
                    </span>
                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-[#8b8f99] font-mono">
                        #{idx + 1}
                      </span>
                      {genres.length > 2 && (
                        <button
                          onClick={() => handleRemoveGenre(genre.id)}
                          className="text-[#5a5e68] hover:text-[#e9e7e0] p-1 rounded-lg hover:bg-[#1f222a] transition-colors ml-1"
                          title="Remove from comparison"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-black text-[#e9e7e0] text-xl tracking-wide">
                      {genre.name}
                    </h3>
                    <p className="text-xs text-[#8b8f99] font-medium mt-1">
                      {genre.origin_year} · {genre.origin_place[language]}
                    </p>
                  </div>

                  {/* Dual Audition Action Buttons: Dedicated Drums Only & Full Band */}
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      {/* Audition Drums Only Button */}
                      <button
                        onClick={() => handlePlayMode(genre, "drums")}
                        className={`flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all border shadow-sm ${
                          isCurrentPlaying && playingMode === "drums"
                            ? "bg-[#f5b73d] text-black border-[#f5b73d] shadow-[0_0_15px_rgba(245,183,61,0.4)]"
                            : "bg-[#181a22] hover:bg-[#222530] text-[#e0ded8] border-[#2c303c] hover:border-[#f5b73d]/50"
                        }`}
                        title={language === "zh" ? "仅试听底鼓、军鼓、踩镲与打击乐" : "Audition drums & percussion only"}
                      >
                        {isCurrentPlaying && playingMode === "drums" ? (
                          <>
                            <Square className="w-3.5 h-3.5 fill-current" />
                            <span>{language === "zh" ? "停止鼓组" : "Stop Drums"}</span>
                            <div className="flex items-end gap-0.5 h-3 ml-1">
                              <span className="w-0.5 h-3 bg-black animate-pulse" />
                              <span className="w-0.5 h-1.5 bg-black animate-ping" />
                              <span className="w-0.5 h-3 bg-black animate-pulse" />
                            </div>
                          </>
                        ) : (
                          <>
                            <Disc3 className="w-3.5 h-3.5 text-[#f5b73d]" />
                            <span>{t("drums_only")}</span>
                          </>
                        )}
                      </button>

                      {/* Audition Full Band Button */}
                      <button
                        onClick={() => handlePlayMode(genre, "full")}
                        className={`flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all border shadow-sm ${
                          isCurrentPlaying && playingMode === "full"
                            ? "bg-[#f5b73d] text-black border-[#f5b73d] shadow-[0_0_15px_rgba(245,183,61,0.4)]"
                            : "bg-[#181a22] hover:bg-[#222530] text-[#e0ded8] border-[#2c303c] hover:border-[#f5b73d]/50"
                        }`}
                        title={language === "zh" ? "播放包含底鼓、贝斯、和声与合成器的完整配器" : "Audition full arrangement"}
                      >
                        {isCurrentPlaying && playingMode === "full" ? (
                          <>
                            <Square className="w-3.5 h-3.5 fill-current" />
                            <span>{language === "zh" ? "停止全轨" : "Stop Full"}</span>
                            <div className="flex items-end gap-0.5 h-3 ml-1">
                              <span className="w-0.5 h-3 bg-black animate-pulse" />
                              <span className="w-0.5 h-1.5 bg-black animate-ping" />
                              <span className="w-0.5 h-3 bg-black animate-pulse" />
                            </div>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-current text-[#f5b73d]" />
                            <span>{t("full_band")}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Quick navigation actions */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => onOpenStudio(genre)}
                        className="py-2 px-2.5 rounded-xl bg-[#0d0e12] hover:bg-[#1a1b20] border border-[#23262d] text-[#e9e7e0] hover:text-[#f5b73d] text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors"
                        title={t("open_in_studio")}
                      >
                        <Sliders className="w-3.5 h-3.5 text-[#f5b73d]" />
                        <span>{t("open_in_studio")}</span>
                      </button>
                      <button
                        onClick={() => onSelectGenre(genre)}
                        className="py-2 px-2.5 rounded-xl bg-[#0d0e12] hover:bg-[#1a1b20] border border-[#23262d] text-[#8b8f99] hover:text-[#e9e7e0] text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors"
                        title={t("view_detail")}
                      >
                        <span>{t("view_detail")}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Spec Block 1: 核心基础规格 (Core Specs) */}
                  <div className="p-4 rounded-2xl bg-[#0d0e12] border border-[#23262d] space-y-2.5">
                    <div className="text-xs font-black uppercase tracking-wider text-[#f5b73d] flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{t("core_specs")}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#1a1c22]">
                      <div>
                        <span className="text-xs text-[#737887] font-semibold block">{t("bpm")}</span>
                        <span className="font-mono font-bold text-sm text-[#f3f1ec] mt-0.5 block">{genre.bpm_range}</span>
                      </div>
                      <div>
                        <span className="text-xs text-[#737887] font-semibold block">{t("time_signature")}</span>
                        <span className="font-mono font-bold text-sm text-[#f3f1ec] mt-0.5 block">{genre.time_signature}</span>
                      </div>
                      <div>
                        <span className="text-xs text-[#737887] font-semibold block">{t("origin_place")}</span>
                        <span className="text-sm font-medium text-[#c4c7cf] truncate block mt-0.5">{genre.origin_place[language]}</span>
                      </div>
                      <div>
                        <span className="text-xs text-[#737887] font-semibold block">{t("scale")}</span>
                        <span className="font-mono text-sm font-medium text-[#c4c7cf] truncate block mt-0.5">
                          {genre.sequencer_pattern?.scale || "C Minor"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Spec Block 2: 律动与鼓组 DNA (Drum & Rhythm DNA) */}
                  <div className="p-4 rounded-2xl bg-[#0d0e12] border border-[#23262d] space-y-3">
                    <div className="text-xs font-black uppercase tracking-wider text-[#f5b73d] flex items-center space-x-1.5">
                      <Zap className="w-3.5 h-3.5" />
                      <span>{t("groove_dna")}</span>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-[#1a1c22]">
                      <div>
                        <span className="text-xs font-bold text-[#f5b73d] uppercase tracking-wide block">
                          {t("kick_placement")}
                        </span>
                        <p className="text-sm text-[#d4d1c9] leading-relaxed mt-1 font-sans">
                          {genre.drum_pattern.kick[language]}
                        </p>
                      </div>

                      <div>
                        <span className="text-xs font-bold text-amber-300 uppercase tracking-wide block">
                          {t("snare_placement")}
                        </span>
                        <p className="text-sm text-[#d4d1c9] leading-relaxed mt-1 font-sans">
                          {genre.drum_pattern.snare_clap[language]}
                        </p>
                      </div>

                      <div>
                        <span className="text-xs font-bold text-yellow-300 uppercase tracking-wide block">
                          {t("hihat_pattern")}
                        </span>
                        <p className="text-sm text-[#d4d1c9] leading-relaxed mt-1 font-sans">
                          {genre.drum_pattern.hihats[language]}
                        </p>
                      </div>

                      {genre.drum_pattern.percussion && (
                        <div>
                          <span className="text-xs font-bold text-amber-400 uppercase tracking-wide block">
                            {language === "zh" ? "打击乐加花" : "Percussion"}
                          </span>
                          <p className="text-sm text-[#d4d1c9] leading-relaxed mt-1 font-sans">
                            {genre.drum_pattern.percussion[language]}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Spec Block 3: 低频与和声架构 (Bass & Harmonics) */}
                  <div className="p-4 rounded-2xl bg-[#0d0e12] border border-[#23262d] space-y-3">
                    <div className="text-xs font-black uppercase tracking-wider text-[#f5b73d] flex items-center space-x-1.5">
                      <Music className="w-3.5 h-3.5" />
                      <span>{t("bass_harmony")}</span>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-[#1a1c22]">
                      <div>
                        <span className="text-xs font-bold text-[#f5b73d] uppercase tracking-wide block">
                          {t("bass_design")}
                        </span>
                        <p className="text-sm text-[#d4d1c9] leading-relaxed mt-1 font-sans">
                          {genre.bass_pattern[language]}
                        </p>
                      </div>

                      {genre.key_characteristics && (
                        <div>
                          <span className="text-xs font-bold text-amber-300 uppercase tracking-wide block">
                            {t("harmonic_rules")}
                          </span>
                          <p className="text-sm text-[#d4d1c9] leading-relaxed mt-1 font-sans">
                            {genre.key_characteristics[language]}
                          </p>
                        </div>
                      )}

                      {genre.production_tips && genre.production_tips[language] && genre.production_tips[language].length > 0 && (
                        <div>
                          <span className="text-xs font-bold text-yellow-300 uppercase tracking-wide block">
                            {t("sound_design_tips")}
                          </span>
                          <ul className="text-sm text-[#b8b5ad] list-disc list-inside space-y-1 mt-1 leading-relaxed">
                            {genre.production_tips[language].slice(0, 2).map((tip, tIdx) => (
                              <li key={tIdx} className="leading-snug">{tip}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Spec Block 4: 六维声学特性雷达指标 (Sonic Radar Breakdown) */}
                  <div className="p-4 rounded-2xl bg-[#0d0e12] border border-[#23262d] space-y-3">
                    <div className="text-xs font-black uppercase tracking-wider text-[#f5b73d] flex items-center space-x-1.5">
                      <Activity className="w-3.5 h-3.5" />
                      <span>{t("sonic_radar")}</span>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-[#1a1c22]">
                      {RADAR_AXES.map((axis) => {
                        const val = genre.radar_metrics ? genre.radar_metrics[axis.key] || 5 : 5;
                        return (
                          <div key={axis.key} className="space-y-1">
                            <div className="flex items-center justify-between text-xs sm:text-sm">
                              <span className="text-[#9ca3af] font-medium">
                                {language === "zh" ? axis.labelZh : axis.labelEn}
                              </span>
                              <span className="font-mono font-bold text-[#f3f1ec]">
                                {val}/10
                              </span>
                            </div>
                            <div className="w-full bg-[#181a20] rounded-full h-2 overflow-hidden border border-[#23262d]">
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
                    <div className="p-4 rounded-2xl bg-[#0d0e12] border border-[#23262d] space-y-2.5">
                      <div className="text-xs font-black uppercase tracking-wider text-[#f5b73d] flex items-center space-x-1.5">
                        <Disc3 className="w-3.5 h-3.5" />
                        <span>{t("milestones")}</span>
                      </div>
                      <div className="space-y-2 pt-2 border-t border-[#1a1c22]">
                        {genre.representative_tracks.slice(0, 3).map((track, trackIdx) => (
                          <div key={trackIdx} className="flex items-center justify-between text-xs sm:text-sm">
                            <div className="truncate mr-2">
                              <span className="text-[#f0ede6] font-semibold">{track.title}</span>
                              <span className="text-[#737887] ml-1.5">· {track.artist}</span>
                            </div>
                            {track.link ? (
                              <a
                                href={track.link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-[#f5b73d] hover:underline flex items-center space-x-1 flex-shrink-0 font-bold"
                              >
                                <span>{t("listen_link")}</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-xs text-[#737887] font-mono">{track.year}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
