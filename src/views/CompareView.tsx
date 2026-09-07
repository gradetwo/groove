import React, { useState, useEffect, useRef } from "react";
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
  CheckCircle
} from "lucide-react";
import { Genre, GenreRadarMetrics } from "../types/genre";
import { ALL_GENRES, GENRES_MAP } from "../data/genres";
import { AudioEngine } from "../audio/AudioEngine";
import { useLanguage } from "../i18n/LanguageContext";

interface CompareViewProps {
  initialGenres?: Genre[];
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
}

const COMPARE_COLORS = [
  { stroke: "#6366f1", fill: "rgba(99, 102, 241, 0.25)", text: "text-[#f5b73d]", badge: "bg-indigo-500/20 border-indigo-500/40" },
  { stroke: "#ec4899", fill: "rgba(236, 72, 153, 0.25)", text: "text-pink-400", badge: "bg-pink-500/20 border-pink-500/40" },
  { stroke: "#06b6d4", fill: "rgba(6, 182, 212, 0.25)", text: "text-cyan-400", badge: "bg-cyan-500/20 border-cyan-500/40" },
  { stroke: "#f59e0b", fill: "rgba(245, 158, 11, 0.25)", text: "text-amber-400", badge: "bg-amber-500/20 border-amber-500/40" },
];

const RADAR_AXES: Array<{ key: keyof GenreRadarMetrics; labelEn: string; labelZh: string }> = [
  { key: "groove", labelEn: "Groove", labelZh: "律动感" },
  { key: "brightness", labelEn: "Brightness", labelZh: "明亮度" },
  { key: "harmonicComplexity", labelEn: "Harmonics", labelZh: "和声复杂" },
  { key: "rhythmDensity", labelEn: "Density", labelZh: "节奏密度" },
  { key: "bassEnergy", labelEn: "Bass Energy", labelZh: "低频能量" },
  { key: "melodicFocus", labelEn: "Melody", labelZh: "旋律性" },
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
      GENRES_MAP["berlin-techno"] || ALL_GENRES[1],
    ];
  });

  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
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
    engine.play();
    engineRef.current = engine;
    setPlayingId(genre.id);
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

  // Calculate similarity between genre 0 and genre 1
  const similarityInfo = React.useMemo(() => {
    if (genres.length < 2) return { score: 100, bpmOverlap: true };
    const g1 = genres[0];
    const g2 = genres[1];

    // Radar distance
    let sumSq = 0;
    RADAR_AXES.forEach((axis) => {
      const v1 = g1.radar_metrics ? g1.radar_metrics[axis.key] || 5 : 5;
      const v2 = g2.radar_metrics ? g2.radar_metrics[axis.key] || 5 : 5;
      sumSq += Math.pow((v1 - v2) / 10, 2);
    });
    const radarDist = Math.sqrt(sumSq / RADAR_AXES.length);
    const radarSim = Math.max(0, 1 - radarDist) * 100;

    // BPM overlap
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

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#121317] border border-[#23262d] p-5 rounded-3xl shadow-xl">
        <div>
          <div className="flex items-center space-x-2">
            <Columns className="w-5 h-5 text-[#f5b73d]" />
            <h2 className="text-xl font-bold text-[#e9e7e0] tracking-wide">
              {t("compare_title")}
            </h2>
          </div>
          <p className="text-xs text-[#8b8f99] mt-1">
            Compare 2 to 4 music genres across tempo, rhythm, sound design, and acoustic radar
          </p>
        </div>

        {/* Add genre dropdown */}
        {genres.length < 4 && (
          <div className="relative">
            <button
              onClick={() => setAddDropdownOpen(!addDropdownOpen)}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#f5b73d] hover:brightness-110 text-[#0a0b0d] text-[#e9e7e0] font-semibold text-xs transition-colors shadow-lg shadow-indigo-600/30"
            >
              <Plus className="w-4 h-4" />
              <span>{t("compare_add")}</span>
            </button>

            {addDropdownOpen && (
              <div className="absolute right-0 top-12 z-30 w-64 bg-[#121317] border border-[#23262d] rounded-2xl shadow-2xl p-2 max-h-72 overflow-y-auto space-y-1 animate-slide-up">
                {ALL_GENRES.filter((g) => !genres.some((sel) => sel.id === g.id)).map((g) => (
                  <button
                    key={g.id}
                    onClick={() => handleAddGenre(g)}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-800 text-xs text-[#e9e7e0] hover:text-[#e9e7e0] flex items-center justify-between"
                  >
                    <span className="font-semibold truncate">{g.name}</span>
                    <span className="text-[10px] text-[#5a5e68] ml-2">{g.category}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Radar Chart & DNA Similarity Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-[#121317] border border-[#23262d] rounded-3xl p-6 shadow-xl">
        {/* Radar SVG */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center">
          <h4 className="text-xs font-bold text-[#8b8f99] uppercase tracking-wider mb-2">
            {t("radar_chart")}
          </h4>
          <svg width="240" height="240" className="overflow-visible">
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
              const labelX = 120 + Math.cos(angle) * 115;
              const labelY = 120 + Math.sin(angle) * 115;

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
                  strokeWidth="2"
                  className="transition-all duration-300"
                />
              );
            })}
          </svg>

          {/* Radar Legend */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
            {genres.map((g, idx) => {
              const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
              return (
                <div key={g.id} className="flex items-center space-x-1.5 text-xs">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color.stroke }} />
                  <span className="font-semibold text-[#b9b7b0]">{g.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* DNA Match Bar & Key Insights */}
        <div className="lg:col-span-7 flex flex-col justify-center space-y-5 lg:border-l lg:border-[#23262d] lg:pl-8">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8b8f99]">
                {t("similarity_score")} ({genres[0].name} vs {genres[1].name})
              </span>
              <span className="text-lg font-mono font-extrabold text-[#f5b73d]">
                {similarityInfo.score}%
              </span>
            </div>
            <div className="w-full bg-[#0d0e12] rounded-full h-3 border border-[#23262d] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full transition-all duration-500"
                style={{ width: `${similarityInfo.score}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-[#0d0e12] border border-[#23262d] space-y-1">
              <span className="font-bold text-[#5a5e68] uppercase tracking-wider text-[10px]">
                {t("bpm_overlap")}
              </span>
              <p className="text-[#e9e7e0]">
                {genres[0].bpm_range} BPM vs {genres[1].bpm_range} BPM
              </p>
              <span className={`text-[11px] font-semibold ${similarityInfo.bpmOverlap ? "text-emerald-400" : "text-amber-400"}`}>
                {similarityInfo.bpmOverlap ? "Compatible Mixing Window" : "Distinct Dance Tempos"}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#0d0e12] border border-[#23262d] space-y-1">
              <span className="font-bold text-[#5a5e68] uppercase tracking-wider text-[10px]">
                Category Kinship
              </span>
              <p className="text-[#e9e7e0]">
                {genres[0].category} & {genres[1].category}
              </p>
              <span className="text-[11px] text-[#8b8f99]">
                {genres[0].category === genres[1].category ? "Same Family Lineage" : "Cross-Genre Contrast"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Side-by-Side Spec Columns */}
      <div className={`grid grid-cols-1 md:grid-cols-${genres.length} gap-4`}>
        {genres.map((genre, idx) => {
          const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
          const isCurrentPlaying = playingId === genre.id;

          return (
            <div
              key={genre.id}
              className="bg-[#121317] border border-[#23262d] rounded-3xl p-5 shadow-xl space-y-5 relative"
            >
              {/* Remove button */}
              {genres.length > 2 && (
                <button
                  onClick={() => handleRemoveGenre(genre.id)}
                  className="absolute top-4 right-4 text-[#5a5e68] hover:text-[#e9e7e0] p-1 rounded-lg hover:bg-neutral-800 transition-colors"
                  title="Remove from comparison"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Genre Header */}
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${color.badge} ${color.text}`}>
                  {genre.category}
                </span>
                <h3 className="font-extrabold text-[#e9e7e0] text-lg sm:text-xl mt-2 tracking-wide">
                  {genre.name}
                </h3>
                {genre.aliases.length > 0 && (
                  <p className="text-xs text-[#8b8f99] mt-0.5">
                    {genre.aliases[0]}
                  </p>
                )}
              </div>

              {/* Audio Audition & Studio Action */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleTogglePlay(genre)}
                  className={`flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl font-bold text-xs transition-colors shadow-md ${
                    isCurrentPlaying
                      ? "bg-[#f5b73d] hover:brightness-110 text-[#0a0b0d]"
                      : "bg-neutral-800 hover:bg-neutral-700 text-[#e9e7e0] hover:text-[#e9e7e0] border border-neutral-700"
                  }`}
                >
                  {isCurrentPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>{isCurrentPlaying ? t("pause") : "Audition Groove"}</span>
                </button>

                <button
                  onClick={() => onOpenStudio(genre)}
                  className="p-2 rounded-xl bg-[#f5b73d] hover:brightness-110 text-[#0a0b0d] text-[#e9e7e0] transition-colors"
                  title={t("open_in_studio")}
                >
                  <Sliders className="w-4 h-4" />
                </button>
              </div>

              {/* Attributes List */}
              <div className="space-y-3 text-xs border-t border-[#23262d] pt-4">
                <div>
                  <span className="text-[#5a5e68] block mb-0.5 uppercase tracking-wider text-[10px] font-bold">
                    Origin & Era
                  </span>
                  <p className="text-[#e9e7e0]">
                    {genre.origin_year} ({genre.origin_place[language]})
                  </p>
                </div>

                <div>
                  <span className="text-[#5a5e68] block mb-0.5 uppercase tracking-wider text-[10px] font-bold">
                    BPM & Time
                  </span>
                  <p className="text-[#e9e7e0] font-mono">
                    {genre.bpm_range} BPM • {genre.time_signature}
                  </p>
                </div>

                <div>
                  <span className="text-[#5a5e68] block mb-0.5 uppercase tracking-wider text-[10px] font-bold">
                    {t("kick_placement")}
                  </span>
                  <p className="text-[#b9b7b0] leading-relaxed">
                    {genre.drum_pattern.kick[language]}
                  </p>
                </div>

                <div>
                  <span className="text-[#5a5e68] block mb-0.5 uppercase tracking-wider text-[10px] font-bold">
                    {t("snare_placement")}
                  </span>
                  <p className="text-[#b9b7b0] leading-relaxed">
                    {genre.drum_pattern.snare_clap[language]}
                  </p>
                </div>

                <div>
                  <span className="text-[#5a5e68] block mb-0.5 uppercase tracking-wider text-[10px] font-bold">
                    {t("bass_design")}
                  </span>
                  <p className="text-[#b9b7b0] leading-relaxed">
                    {genre.bass_pattern[language]}
                  </p>
                </div>
              </div>

              {/* View detail button */}
              <button
                onClick={() => onSelectGenre(genre)}
                className="w-full py-2 rounded-xl bg-[#0d0e12] hover:bg-neutral-800 text-[#8b8f99] hover:text-[#e9e7e0] text-xs font-semibold border border-[#23262d] flex items-center justify-center space-x-1 transition-colors"
              >
                <span>{t("view_detail")}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
