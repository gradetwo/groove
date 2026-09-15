import React, { useState, useEffect, useRef, useMemo } from "react";
import { Columns, Plus, X, Play, Pause, Square, Minus, Sliders, ExternalLink, Sparkles, Activity, ArrowRightLeft, Music, CheckCircle, Volume2, Disc3, Flame, Radio, Clock, Layers, Zap, Info, Mic2, Users, Loader2, GitBranch } from "lucide-react";
import { Genre, GenreRadarMetrics, SequencerTrack, SequencerPattern } from "../types/genre";
import { ALL_GENRES, GENRES_MAP } from "../data/genres";
import { AudioEngine } from "../audio/AudioEngine";
import { patternFromGenre, getGenreLoudnessTrimDb } from "../data/genreMix";
import { getBpmOverlap } from "../utils/bpm";
import { useLanguage } from "../i18n/LanguageContext";
import { EmptyState } from "../ui/EmptyState";
import { getLineage } from "../data/lineage";
import { toast } from "../ui/Toast";
import { announcer } from "../ui/AriaLiveRegion";
import { ErrorState } from "../ui/ErrorState";
import { Skeleton } from "../ui/Skeleton";

interface CompareViewProps {
  initialGenres?: Genre[];
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
}

export type SyncPlaybackMode = "both" | "solo_a" | "solo_b" | "drums_only";

const COMPARE_COLORS = [
  { stroke: "#f5b73d", fill: "rgba(245, 183, 61, 0.22)", text: "text-accent", badge: "bg-amber-500/20 border-amber-500/40 text-amber-300", bar: "bg-accent", border: "border-accent" },
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

export const PRESET_MATCHUPS = [
  { labelZh: "House 对决 Techno", labelEn: "House vs Techno", ids: ["chicago-house", "detroit-techno"] },
  { labelZh: "Boom Bap 对决 Trap", labelEn: "Boom Bap vs Trap", ids: ["boom-bap", "edm-trap"] },
  { labelZh: "Liquid DnB 对决 Jungle", labelEn: "Liquid DnB vs Jungle", ids: ["liquid-dnb", "jungle"] },
  { labelZh: "Synthwave 对决 Industrial Techno", labelEn: "Synthwave vs Industrial Techno", ids: ["synthwave", "industrial-techno"] },
  { labelZh: "Nu-Disco 对决 Funk", labelEn: "Nu-Disco vs Funk", ids: ["nu-disco-house", "funk"] },
];

export const CompareView: React.FC<CompareViewProps> = ({
  initialGenres,
  onSelectGenre,
  onOpenStudio,
}) => {
  const { t, language, isZh } = useLanguage();

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

  // Initial genre-catalog resolution drives the loading / empty / error states (U-08)
  const [genresLoadState, setGenresLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  // Engine start-up guards: block re-entrant clicks before `engine.play()` resolves (U-08)
  const [startingAuditionKey, setStartingAuditionKey] = useState<string | null>(null);
  const [isSyncStarting, setIsSyncStarting] = useState(false);

  // Resolve the initial comparison pool. The catalog is bundled today, but the
  // resolution stays async so the view can render honest loading / error states.
  useEffect(() => {
    let cancelled = false;
    setGenresLoadState("loading");
    Promise.resolve()
      .then(() => {
        if (!Array.isArray(ALL_GENRES) || ALL_GENRES.length === 0) {
          throw new Error("genre catalog unavailable");
        }
        if (!cancelled) setGenresLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setGenresLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // A/B Synchronous Comparative Playback State (PRD 5.7.2.3)
  const [isSyncPlaying, setIsSyncPlaying] = useState(false);
  const [syncMode, setSyncMode] = useState<SyncPlaybackMode>("both");
  const [syncStep, setSyncStep] = useState(0);
  const [syncBpm, setSyncBpm] = useState<number>(() => {
    if (initialGenres && initialGenres.length >= 2) {
      return Math.round(((initialGenres[0].default_bpm || 120) + (initialGenres[1].default_bpm || 120)) / 2);
    }
    return 120;
  });
  const syncEngineRef = useRef<AudioEngine | null>(null);

  // Update default sync BPM when genre pair changes
  useEffect(() => {
    if (genres.length >= 2) {
      const avg = Math.round(((genres[0].default_bpm || 120) + (genres[1].default_bpm || 120)) / 2);
      setSyncBpm(avg);
    }
  }, [genres]);

  // Stop all audio on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
      if (syncEngineRef.current) {
        syncEngineRef.current.destroy();
        syncEngineRef.current = null;
      }
    };
  }, []);

  const handleStopAudio = () => {
    if (engineRef.current) {
      engineRef.current.stop();
    }
    if (syncEngineRef.current) {
      syncEngineRef.current.stop();
    }
    setPlayingId(null);
    setIsSyncPlaying(false);
  };

  // Per-column solo and mute states for synchronous comparison playback (P3-12)
  const [columnMutes, setColumnMutes] = useState<boolean[]>([false, false, false, false]);
  const [columnSolos, setColumnSolos] = useState<boolean[]>([false, false, false, false]);
  const [showRadarDataTable, setShowRadarDataTable] = useState<boolean>(false);

  // Helper to mute/unmute channels across all active comparison columns
  /**
   * True when a compared column is inaudible under the current routing matrix.
   * Used both for the track mutes and for the loudness trim, so the two can never
   * disagree about which genres are actually being heard.
   */
  const isColumnSilenced = (
    mode: SyncPlaybackMode,
    gIdx: number,
    activeGenres: Genre[],
    mutes: boolean[],
    solos: boolean[]
  ) => {
    const hasAnySolo = solos.some((s, idx) => s && idx < activeGenres.length);
    if (mode === "solo_a" && gIdx !== 0) return true;
    if (mode === "solo_b" && gIdx !== 1) return true;
    return Boolean(mutes[gIdx]) || (hasAnySolo && !solos[gIdx]);
  };

  const applySyncMutesToEngine = (
    engine: AudioEngine,
    mode: SyncPlaybackMode,
    activeGenres: Genre[],
    mutes: boolean[],
    solos: boolean[]
  ) => {
    let globalTrackIdx = 0;

    activeGenres.forEach((g, gIdx) => {
      const isColumnSilencedNow = isColumnSilenced(mode, gIdx, activeGenres, mutes, solos);

      const tracks = g.sequencer_pattern?.tracks || [];
      tracks.forEach((t, tIdx) => {
        const isDrum = isDrumTrack(t, tIdx);
        let trackMute = isColumnSilencedNow;
        if (mode === "drums_only" && !isDrum) {
          trackMute = true;
        }
        engine.setTrackState(globalTrackIdx, { mute: trackMute, solo: false });
        globalTrackIdx++;
      });
    });

    // Loudness follows the *audible* set, not the composite's average. Isolating one
    // column (solo A/B, a per-column solo, or muting the others) must play that
    // genre at its own measured trim, otherwise the A/B comparison this view exists
    // for is off by up to ~5 dB exactly when the user isolates a side.
    // `drums_only` keeps the audible mean: a drum-only balance genuinely differs from
    // the full arrangement it was trimmed against (documented residual).
    const audibleTrims = activeGenres
      .filter((_, gIdx) => !isColumnSilenced(mode, gIdx, activeGenres, mutes, solos))
      .map((g) => getGenreLoudnessTrimDb(g.id));
    engine.setLoudnessTrimDb(
      audibleTrims.length > 0
        ? audibleTrims.reduce((sum, trim) => sum + trim, 0) / audibleTrims.length
        : 0
    );
  };

  // Start synchronized playback across all active comparison columns (P3-12)
  const handleStartSyncPlayback = async (overrideBpm?: number) => {
    if (genres.length < 2) return;
    // Re-entrancy guard: never start a second engine while one is still starting (U-08)
    if (isSyncStarting || startingAuditionKey) return;
    handleStopAudio();
    setIsSyncStarting(true);

    try {
      const bpmToUse = overrideBpm || syncBpm;
      let maxLen = 16;
      const mergedTracks: SequencerTrack[] = [];

      genres.forEach((g, gIdx) => {
        // Each member contributes its own arranged mix, so the merged arrangement is
        // not 8 x N identical channel strips; the A/B balance is then level-matched
        // by the composite trim below.
        const tracks = patternFromGenre(g).tracks;
        const tag = String.fromCharCode(65 + gIdx); // A, B, C, D
        tracks.forEach((t) => {
          maxLen = Math.max(maxLen, t.steps?.length || 16);
          mergedTracks.push({
            ...t,
            name: `[${tag}] ${t.name}`,
            track_id: t.track_id || t.name.toLowerCase(),
          });
        });
      });

      const compositePattern: SequencerPattern = {
        genre_id: `sync_${genres.map((g) => g.id).join("_")}`,
        bpm: bpmToUse,
        scale: genres[0].sequencer_pattern?.scale || "C Minor",
        totalSteps: maxLen,
        tracks: mergedTracks,
      };

      let engine = syncEngineRef.current;
      if (!engine) {
        engine = new AudioEngine({
          onStep: ({ step }) => setSyncStep(step),
          onStop: () => {
            setIsSyncPlaying(false);
          },
        });
        syncEngineRef.current = engine;
      } else {
        engine.stop();
      }

      engine.setPattern(compositePattern, true);
      // The composite carries a synthetic `sync_*` genre id, so the engine cannot
      // derive a trim for it. `applySyncMutesToEngine` (called below) then sets the
      // master trim from the genres that are actually audible — the mean of the
      // members in full-mix mode, a single member's own trim when one is soloed.
      engine.setBpm(bpmToUse);
      engine.setTotalSteps(maxLen);

      applySyncMutesToEngine(engine, syncMode, genres, columnMutes, columnSolos);

      await engine.play();
      setIsSyncPlaying(true);
      setPlayingId(null);
    } finally {
      setIsSyncStarting(false);
    }
  };

  const handleToggleColumnMute = (colIdx: number) => {
    setColumnMutes((prev) => {
      const next = [...prev];
      next[colIdx] = !next[colIdx];
      if (syncEngineRef.current && isSyncPlaying) {
        applySyncMutesToEngine(syncEngineRef.current, syncMode, genres, next, columnSolos);
      }
      return next;
    });
  };

  const handleToggleColumnSolo = (colIdx: number) => {
    setColumnSolos((prev) => {
      const next = [...prev];
      next[colIdx] = !next[colIdx];
      if (syncEngineRef.current && isSyncPlaying) {
        applySyncMutesToEngine(syncEngineRef.current, syncMode, genres, columnMutes, next);
      }
      return next;
    });
  };

  const handleSetSyncMode = (newMode: SyncPlaybackMode) => {
    setSyncMode(newMode);
    if (syncEngineRef.current && isSyncPlaying) {
      applySyncMutesToEngine(syncEngineRef.current, newMode, genres, columnMutes, columnSolos);
    }
  };

  const handleSetSyncBpm = (val: number) => {
    const clamped = Math.max(40, Math.min(240, val));
    setSyncBpm(clamped);
    if (syncEngineRef.current) {
      syncEngineRef.current.setBpm(clamped);
    }
  };

  // Handle explicit playback per mode (Drums Only or Full Band)
  const handlePlayMode = async (genre: Genre, mode: "drums" | "full") => {
    // Re-entrancy guard: ignore clicks while any engine is still starting (U-08)
    if (startingAuditionKey || isSyncStarting) return;

    if (isSyncPlaying) {
      handleStopAudio();
    }

    // If clicking same genre and same mode, stop it
    if (playingId === genre.id && playingMode === mode) {
      if (engineRef.current) {
        engineRef.current.stop();
      }
      setPlayingId(null);
      return;
    }

    // If already playing this genre but switching mode
    if (playingId === genre.id && engineRef.current) {
      setPlayingMode(mode);
      applyAudioMutes(engineRef.current, mode, genre);
      return;
    }

    // Otherwise start new playback for this genre & mode
    setStartingAuditionKey(`${genre.id}:${mode}`);
    try {
      let engine = engineRef.current;
      if (!engine) {
        engine = new AudioEngine({
          onStop: () => setPlayingId(null),
        });
        engineRef.current = engine;
      } else {
        engine.stop();
      }

      // Clear any explicit override left by a previous sync composite on a shared
      // engine, then let `setPattern` match this genre's own measured trim.
      engine.setLoudnessTrimDb(null);
      engine.setPattern(patternFromGenre(genre), true);
      engine.setBpm(genre.default_bpm || 120);
      applyAudioMutes(engine, mode, genre);
      await engine.play();
      setPlayingId(genre.id);
      setPlayingMode(mode);
    } finally {
      setStartingAuditionKey(null);
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

  // N-06: same-origin teaching aid. Derived from the relation graph for whichever
  // genre is currently first in the comparison.
  const lineage = useMemo(() => getLineage(genres[0]?.id ?? ""), [genres]);

  const handleSelectPreset = (ids: string[]) => {
    const resolved = ids.map((id) => ({ id, genre: GENRES_MAP[id] }));
    const selected = resolved.map((r) => r.genre).filter(Boolean) as Genre[];

    if (selected.length < 2) {
      // A preset pointing at an unknown genre id used to be a completely silent
      // no-op ("the button does nothing"). Never swallow it again.
      const missing = resolved.filter((r) => !r.genre).map((r) => r.id);
      const message = isZh
        ? `预设数据缺失，无法载入：${missing.join("、")}`
        : `Preset cannot be loaded, unknown genre id: ${missing.join(", ")}`;
      console.error("[CompareView] preset genre ids not found:", missing);
      announcer.announce(message);
      toast.error(message);
      return;
    }

    if (engineRef.current) {
      engineRef.current.stop();
      setPlayingId(null);
    }
    setGenres(selected);
  };

  // Pairwise Similarity Matrix calculation & overall cohort consistency (P3-13)
  const similarityData = useMemo(() => {
    if (genres.length < 2) {
      return {
        matrix: [[100]],
        pairs: [],
        overallScore: 100,
        affinityLevel: "high" as const,
        primaryPair: { score: 100, bpmOverlap: true, overlapMin: 120, overlapMax: 120, radarSim: 100, bpmSim: 100, categoryAffinity: 100 },
      };
    }

    const n = genres.length;
    const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(100));
    const pairs: Array<{
      idxA: number;
      idxB: number;
      genreA: Genre;
      genreB: Genre;
      score: number;
      radarSim: number;
      bpmSim: number;
      categoryAffinity: number;
      bpmOverlap: boolean;
      overlapMin: number;
      overlapMax: number;
    }> = [];

    let totalScore = 0;
    let pairCount = 0;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const g1 = genres[i];
        const g2 = genres[j];

        // 1. Radar distance
        let sumSq = 0;
        RADAR_AXES.forEach((axis) => {
          const v1 = g1.radar_metrics ? g1.radar_metrics[axis.key] || 5 : 5;
          const v2 = g2.radar_metrics ? g2.radar_metrics[axis.key] || 5 : 5;
          sumSq += Math.pow((v1 - v2) / 10, 2);
        });
        const radarDist = Math.sqrt(sumSq / RADAR_AXES.length);
        const radarSim = Math.max(0, 1 - radarDist) * 100;

        // 2. BPM overlap
        const { overlaps, min, max } = getBpmOverlap(g1.bpm_range, g2.bpm_range);
        let bpmSim = 50;
        if (overlaps) {
          const overlapSpan = max - min;
          bpmSim = Math.min(100, 60 + overlapSpan * 2);
        } else {
          const avg1 = g1.default_bpm || 120;
          const avg2 = g2.default_bpm || 120;
          const diff = Math.abs(avg1 - avg2);
          bpmSim = Math.max(0, 50 - diff);
        }

        // 3. Category affinity
        const catAffinity = g1.category === g2.category ? 100 : 40;

        // Composite formula: 50% Radar + 25% BPM + 25% Category
        const composite = Math.round(0.5 * radarSim + 0.25 * bpmSim + 0.25 * catAffinity);
        matrix[i][j] = composite;
        matrix[j][i] = composite;

        pairs.push({
          idxA: i,
          idxB: j,
          genreA: g1,
          genreB: g2,
          score: composite,
          radarSim: Math.round(radarSim),
          bpmSim: Math.round(bpmSim),
          categoryAffinity: catAffinity,
          bpmOverlap: overlaps,
          overlapMin: min,
          overlapMax: max,
        });

        totalScore += composite;
        pairCount++;
      }
    }

    const overallScore = pairCount > 0 ? Math.round(totalScore / pairCount) : 100;
    const affinityLevel =
      overallScore >= 75 ? ("high" as const) : overallScore >= 50 ? ("medium" as const) : ("diverse" as const);
    const primaryPair = pairs[0] || {
      score: 100,
      bpmOverlap: true,
      overlapMin: 120,
      overlapMax: 120,
      radarSim: 100,
      bpmSim: 100,
      categoryAffinity: 100,
    };

    return { matrix, pairs, overallScore, affinityLevel, primaryPair };
  }, [genres]);

  const similarityInfo = similarityData.primaryPair;

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

  // Loading state while the initial genre catalog resolves (U-08)
  if (genresLoadState === "loading") {
    return (
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-4 space-y-4" aria-busy="true">
        <p className="flex items-center gap-2 text-sm text-text-sub">
          <Loader2 className="w-4 h-4 animate-spin text-accent shrink-0" />
          <span>{t("compare_loading")}</span>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton variant="card" aria-label={t("compare_loading")} />
          <Skeleton variant="card" aria-label={t("compare_loading")} />
        </div>
      </div>
    );
  }

  // Error state when the genre catalog could not be resolved (U-08)
  if (genresLoadState === "error") {
    return (
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-4">
        <ErrorState
          title={t("compare_load_error_title")}
          description={t("compare_load_error_desc")}
          retryLabel={t("retry")}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      </div>
    );
  }

  // Empty state when there is nothing to compare (U-08)
  if (genres.length === 0) {
    return (
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-4">
        <EmptyState
          icon={<Columns className="w-6 h-6" />}
          title={t("compare_empty_title")}
          description={t("compare_empty_desc")}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-4 space-y-6">
      {/* Top Header & Toolbar */}
      <div className="bg-panel border border-line rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <Columns className="w-5 h-5 text-accent" />
              <h2 className="text-xl font-black text-text tracking-wide">
                {t("compare_title")}
              </h2>
            </div>
            <p className="text-sm text-text-sub mt-1">
              {t("compare_subtitle")}
            </p>
          </div>

          {/* Right Action Group: Add Genre & Active Count */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Synchronized A/B Playback Trigger Button */}
            {genres.length >= 2 && (
              <button
                onClick={() => {
                  if (isSyncPlaying) {
                    handleStopAudio();
                  } else {
                    handleStartSyncPlayback();
                  }
                }}
                disabled={isSyncStarting || startingAuditionKey !== null}
                aria-busy={isSyncStarting}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${
                  isSyncPlaying
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_12px_rgba(245,183,61,0.25)]"
                    : "bg-[#1c1e24] hover:bg-[#252830] border-[#2b2e38] hover:border-amber-500/40 text-accent"
                }`}
                title={t("compare_sync_title")}
              >
                {isSyncStarting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-accent shrink-0" />
                    <span className="truncate max-w-[120px] whitespace-nowrap">{t("compare_starting")}</span>
                  </>
                ) : isSyncPlaying ? (
                  <>
                    <Square className="w-4 h-4 fill-current text-amber-300 shrink-0" />
                    <span className="truncate max-w-[120px] whitespace-nowrap">{t("sync_stop")}</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4 text-accent shrink-0" />
                    <span className="truncate max-w-[120px] whitespace-nowrap">{t("sync_play")}</span>
                  </>
                )}
              </button>
            )}

            {/* Add genre dropdown */}
            {genres.length < 4 && (
              <div className="relative">
                <button
                  onClick={() => setAddDropdownOpen(!addDropdownOpen)}
                  className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#1c1e24] hover:bg-[#252830] border border-[#2b2e38] text-text font-bold text-sm transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4 text-accent shrink-0" />
                  <span className="truncate max-w-[120px] whitespace-nowrap">{t("compare_add")}</span>
                  <span className="ml-1 text-xs text-text-sub font-mono shrink-0">({genres.length}/4)</span>
                </button>

                {addDropdownOpen && (
                  <div className="absolute right-0 top-12 z-40 w-72 bg-panel border border-[#2b2e38] rounded-2xl shadow-2xl p-2 max-h-72 overflow-y-auto space-y-1 animate-slide-up">
                    <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-text-dim">
                      {t("compare_select_genre")}
                    </div>
                    {ALL_GENRES.filter((g) => !genres.some((sel) => sel.id === g.id)).map((g) => (
                      <button
                        key={g.id}
                        onClick={() => handleAddGenre(g)}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#1a1b20] text-sm text-text hover:text-accent flex items-center justify-between transition-colors"
                      >
                        <span className="font-semibold truncate">{g.name}</span>
                        <span className="text-xs text-text-sub ml-2 px-1.5 py-0.5 rounded bg-panel2">
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

        {/* Synchronized Playback Deck (PRD 5.7.2.3) */}
        {isSyncPlaying && genres.length >= 2 && (
          <div className="bg-[#15161c] border-2 border-amber-500/40 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 animate-fade-in">
            {/* Top Row: Title, active badges & Stop Button */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232630] pb-3">
              <div className="flex items-center space-x-3">
                <div className="flex items-end space-x-0.5 h-5">
                  <span className="w-1 bg-accent rounded-full animate-pulse h-5" />
                  <span className="w-1 bg-indigo-400 rounded-full animate-pulse h-3" style={{ animationDelay: "150ms" }} />
                  <span className="w-1 bg-accent rounded-full animate-pulse h-4" style={{ animationDelay: "300ms" }} />
                  <span className="w-1 bg-indigo-400 rounded-full animate-pulse h-2.5" style={{ animationDelay: "450ms" }} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="text-sm sm:text-base font-black text-text tracking-wide">
                      {t("compare_sync_audition")}
                    </h4>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold">
                      LIVE
                    </span>
                  </div>
                  <p className="text-xs text-text-sub mt-0.5">
                    <span className="text-accent font-semibold">[A] {genres[0].name}</span>
                    <span className="mx-1.5 text-zinc-600">⟷</span>
                    <span className="text-indigo-400 font-semibold">[B] {genres[1].name}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={handleStopAudio}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-xs font-bold transition-all shrink-0"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span className="truncate max-w-[80px] whitespace-nowrap">{t("sync_stop")}</span>
              </button>
            </div>

            {/* Middle Row: Channel Routing + Synchronized BPM */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              {/* Channel Routing Mode Buttons */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-[#737887] uppercase tracking-wider block">
                  {t("compare_channel_routing")}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <button
                    onClick={() => handleSetSyncMode("both")}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all text-center truncate ${
                      syncMode === "both"
                        ? "bg-amber-500 text-black border-amber-500 shadow-md font-black"
                        : "bg-panel2 text-[#9ca3af] border-line hover:text-text hover:bg-[#1a1c24]"
                    }`}
                  >
                    {t("sync_mix")}
                  </button>

                  <button
                    onClick={() => handleSetSyncMode("solo_a")}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all text-center truncate ${
                      syncMode === "solo_a"
                        ? "bg-accent text-black border-accent shadow-md font-black"
                        : "bg-panel2 text-[#9ca3af] border-line hover:text-text hover:bg-[#1a1c24]"
                    }`}
                  >
                    {t("sync_solo_a")}
                  </button>

                  <button
                    onClick={() => handleSetSyncMode("solo_b")}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all text-center truncate ${
                      syncMode === "solo_b"
                        ? "bg-indigo-500 text-white border-indigo-500 shadow-md font-black"
                        : "bg-panel2 text-[#9ca3af] border-line hover:text-text hover:bg-[#1a1c24]"
                    }`}
                  >
                    {t("sync_solo_b")}
                  </button>

                  <button
                    onClick={() => handleSetSyncMode("drums_only")}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all text-center truncate ${
                      syncMode === "drums_only"
                        ? "bg-emerald-500 text-black border-emerald-500 shadow-md font-black"
                        : "bg-panel2 text-[#9ca3af] border-line hover:text-text hover:bg-[#1a1c24]"
                    }`}
                  >
                    {t("sync_drums_only")}
                  </button>
                </div>
              </div>

              {/* Synchronized Tempo (BPM) Adjustment */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#737887] uppercase tracking-wider">
                    {t("compare_sync_tempo")}
                  </span>
                  <span className="font-mono text-xs font-bold text-accent">
                    {syncBpm} BPM
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleSetSyncBpm(syncBpm - 2)}
                    className="p-1.5 rounded-lg bg-panel2 hover:bg-[#1f2229] border border-line text-[#c4c7cf] hover:text-white transition-colors shrink-0"
                    title="-2 BPM"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="range"
                    min={60}
                    max={180}
                    value={syncBpm}
                    onChange={(e) => handleSetSyncBpm(Number(e.target.value))}
                    className="flex-1 accent-amber-400 cursor-pointer h-1.5 bg-panel2 rounded-lg"
                  />
                  <button
                    onClick={() => handleSetSyncBpm(syncBpm + 2)}
                    className="p-1.5 rounded-lg bg-panel2 hover:bg-[#1f2229] border border-line text-[#c4c7cf] hover:text-white transition-colors shrink-0"
                    title="+2 BPM"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* Tempo snap chips */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <button
                    onClick={() => handleSetSyncBpm(genres[0].default_bpm || 120)}
                    className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-panel2 hover:bg-[#1c1e24] border border-line text-[#a4a9b5] hover:text-white"
                  >
                    A: {genres[0].default_bpm}
                  </button>
                  <button
                    onClick={() => handleSetSyncBpm(genres[1].default_bpm || 120)}
                    className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-panel2 hover:bg-[#1c1e24] border border-line text-[#a4a9b5] hover:text-white"
                  >
                    B: {genres[1].default_bpm}
                  </button>
                  <button
                    onClick={() => handleSetSyncBpm(Math.round(((genres[0].default_bpm || 120) + (genres[1].default_bpm || 120)) / 2))}
                    className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-panel2 hover:bg-[#1c1e24] border border-line text-accent hover:text-white"
                  >
                    {t("compare_avg_tempo")}: {Math.round(((genres[0].default_bpm || 120) + (genres[1].default_bpm || 120)) / 2)}
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Row: 16-Step LED Sequence Tracker */}
            <div className="pt-2 border-t border-[#1f222a] space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-[#737887]">
                <span className="uppercase tracking-wider font-mono font-bold">
                  {t("compare_16_phase")}
                </span>
                <span className="font-mono text-amber-400 font-bold">
                  STEP {(syncStep % 16) + 1}/16
                </span>
              </div>
              <div className="flex gap-1 w-full">
                {Array.from({ length: 16 }).map((_, sIdx) => {
                  const isActive = (syncStep % 16) === sIdx;
                  const isBeat = sIdx % 4 === 0;
                  return (
                    <div
                      key={sIdx}
                      className={`flex-1 h-2 rounded-sm transition-all duration-75 ${
                        isActive
                          ? "bg-amber-400 shadow-[0_0_8px_rgba(245,183,61,0.9)] scale-y-125"
                          : isBeat
                          ? "bg-[#282c37]"
                          : "bg-[#181a20]"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Live Audition Indicator Bar when music is playing */}
        {currentPlayingGenre && (
          <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 text-sm text-accent animate-fade-in">
            <div className="flex items-center space-x-3">
              <div className="flex items-end space-x-0.5 h-4">
                <span className="w-1 bg-accent rounded-full animate-pulse h-4" />
                <span className="w-1 bg-accent rounded-full animate-pulse h-2.5" style={{ animationDelay: "150ms" }} />
                <span className="w-1 bg-accent rounded-full animate-pulse h-3.5" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="font-bold text-text">
                {t("now_playing")}: <span className="text-accent">{currentPlayingGenre.name}</span>
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/20 text-accent font-bold border border-amber-500/40">
                {playingMode === "drums" ? t("drums_only") : t("full_band")}
              </span>
              <span className="text-xs text-text-sub hidden sm:inline">
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
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span>{t("compare_presets")}:</span>
          </span>
          {PRESET_MATCHUPS.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectPreset(preset.ids)}
              className="text-xs px-3 py-1.5 rounded-xl bg-panel2 hover:bg-[#1c1e24] border border-line hover:border-[#383d4a] text-[#a4a9b5] hover:text-text font-semibold transition-colors"
            >
              {isZh ? preset.labelZh : preset.labelEn}
            </button>
          ))}
        </div>

        {/* Same-origin (lineage) comparison — N-06 */}
        {(lineage.ancestors.length > 0 || lineage.descendants.length > 0 || lineage.related.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#1f2229]">
            <span className="text-xs font-bold text-[#737887] uppercase tracking-wider flex items-center space-x-1 mr-1">
              <GitBranch className="w-3.5 h-3.5 text-accent" />
              <span>{t("compare_lineage")}:</span>
            </span>
            {[
              { key: "ancestors" as const, labelKey: "compare_lineage_ancestors", items: lineage.ancestors },
              { key: "descendants" as const, labelKey: "compare_lineage_descendants", items: lineage.descendants },
              { key: "related" as const, labelKey: "compare_lineage_related", items: lineage.related },
            ].flatMap((group) =>
              group.items.slice(0, 4).map((sibling) => {
                const siblingGenre = GENRES_MAP[sibling.id];
                if (!siblingGenre) return null;
                const alreadyCompared = genres.some((g) => g.id === sibling.id);
                return (
                  <button
                    key={`${group.key}-${sibling.id}`}
                    onClick={() => handleAddGenre(siblingGenre)}
                    disabled={alreadyCompared || genres.length >= 4}
                    title={`${t(group.labelKey)}: ${siblingGenre.name}`}
                    className={`text-xs px-3 py-1.5 rounded-xl border transition-colors ${
                      alreadyCompared
                        ? "border-line bg-panel2 text-text-dim cursor-default"
                        : "border-line bg-panel2 hover:border-accent/50 hover:text-accent text-[#a4a9b5]"
                    } disabled:opacity-60`}
                  >
                    <span className="font-mono text-[10px] text-text-dim mr-1">{t(group.labelKey)}</span>
                    {siblingGenre.name}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Overview Analytics Bar: DNA Radar & Similarity Matrix (P3-13) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Radar Chart Overlay (Col 1-5 on LG) */}
        <div className="lg:col-span-5 bg-panel border border-line rounded-2xl p-4 flex flex-col items-center justify-between relative shadow-lg">
          <div className="w-full flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-text-sub uppercase tracking-wider flex items-center space-x-1.5">
              <Activity className="w-4 h-4 text-accent" />
              <span>{t("radar_chart")}</span>
            </h4>
            <button
              type="button"
              onClick={() => setShowRadarDataTable((prev) => !prev)}
              className="text-[11px] font-mono px-2 py-0.5 rounded bg-panel2 border border-line hover:border-accent/60 text-text-sub hover:text-text transition-colors"
              title={t("compare_radar_table")}
            >
              {showRadarDataTable ? (isZh ? "返回图表" : "Chart") : (isZh ? "数值表" : "Table")}
            </button>
          </div>

          {!showRadarDataTable ? (
            <div className="relative w-[220px] h-[220px]">
              <svg
                className="w-full h-full"
                viewBox="0 0 220 220"
                role="img"
                aria-label={t("radar_chart")}
              >
                <title>{genres.map((g) => g.name).join(" vs ")}</title>
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
                    className="absolute text-[11px] font-bold text-text-sub transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${x}px`, top: `${y}px` }}
                  >
                    {isZh ? axis.labelZh : axis.labelEn}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="w-full overflow-x-auto my-2">
              <table className="w-full text-[11px] text-left border border-line rounded-lg overflow-hidden">
                <thead className="bg-[#14151a] text-text-dim border-b border-line">
                  <tr>
                    <th className="p-1.5 font-mono">{isZh ? "指标" : "Axis"}</th>
                    {genres.map((g, idx) => (
                      <th key={g.id} className="p-1.5 font-bold truncate max-w-[80px]">
                        [{String.fromCharCode(65 + idx)}] {g.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {RADAR_AXES.map((axis) => (
                    <tr key={axis.key} className="hover:bg-panel2">
                      <td className="p-1.5 font-medium text-text-sub">
                        {isZh ? axis.labelZh : axis.labelEn}
                      </td>
                      {genres.map((g) => {
                        const val = g.radar_metrics ? g.radar_metrics[axis.key] || 5 : 5;
                        return (
                          <td key={g.id} className="p-1.5 font-mono font-bold text-accent">
                            {val}/10
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-3 pt-2 border-t border-line-subtle w-full">
            {genres.map((g, idx) => {
              const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
              return (
                <div key={g.id} className="flex items-center space-x-1.5 text-xs font-semibold">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: color.stroke }}
                  />
                  <span className="text-text">
                    [{String.fromCharCode(65 + idx)}] {g.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pairwise Similarity Matrix & Cohort Consistency (Col 6-12 on LG) */}
        <div className="lg:col-span-7 bg-panel border border-line rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between space-y-3">
          <div className="space-y-3">
            {/* Header with Consistency & Affinity Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle pb-2.5">
              <div className="flex items-center space-x-2">
                <Flame className="w-4 h-4 text-accent" />
                <span className="text-sm font-bold uppercase tracking-wider text-text-sub">
                  {t("compare_cohort_consistency")}
                </span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                    similarityData.affinityLevel === "high"
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : similarityData.affinityLevel === "medium"
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                      : "bg-rose-500/15 border-rose-500/40 text-rose-300"
                  }`}
                >
                  {similarityData.affinityLevel === "high"
                    ? t("compare_high_affinity")
                    : similarityData.affinityLevel === "medium"
                    ? t("compare_moderate_overlap")
                    : t("compare_diverse_cohort")}
                </span>
              </div>
              <span className="text-2xl font-mono font-extrabold text-accent">
                {similarityData.overallScore}%
              </span>
            </div>

            {/* Overall Consistency Bar */}
            <div className="w-full bg-panel2 rounded-full h-2 overflow-hidden border border-line">
              <div
                className="bg-gradient-to-r from-amber-500 via-[#f5b73d] to-emerald-400 h-full rounded-full transition-all duration-700"
                style={{ width: `${similarityData.overallScore}%` }}
              />
            </div>

            {/* Pairwise Matrix Grid (P3-13) */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs text-[#737887]">
                <span className="font-bold uppercase tracking-wider">
                  {t("compare_similarity_matrix")} ({genres.length}×{genres.length})
                </span>
                <span className="text-[11px] font-mono">
                  {genres.length > 2 ? (isZh ? "全列两两交叉" : "Pairwise Matrix") : "A ⟷ B"}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-center border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="p-1.5 bg-[#121319] text-[#717684] font-mono border border-line rounded-tl-lg">
                        #
                      </th>
                      {genres.map((g, j) => (
                        <th
                          key={g.id}
                          className="p-1.5 bg-[#121319] font-bold border border-line truncate max-w-[100px]"
                          style={{ color: COMPARE_COLORS[j % COMPARE_COLORS.length].stroke }}
                        >
                          [{String.fromCharCode(65 + j)}] {g.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {genres.map((gRow, rIdx) => (
                      <tr key={gRow.id}>
                        <th
                          className="p-1.5 bg-[#121319] font-bold border border-line text-left truncate max-w-[100px]"
                          style={{ color: COMPARE_COLORS[rIdx % COMPARE_COLORS.length].stroke }}
                        >
                          [{String.fromCharCode(65 + rIdx)}] {gRow.name}
                        </th>
                        {genres.map((gCol, cIdx) => {
                          const score = similarityData.matrix[rIdx][cIdx];
                          const isDiag = rIdx === cIdx;
                          return (
                            <td
                              key={gCol.id}
                              className={`p-2 border border-line font-mono font-bold transition-colors ${
                                isDiag
                                  ? "bg-[#181a22] text-[#8e93a0]"
                                  : score >= 75
                                  ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                                  : score >= 50
                                  ? "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                                  : "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                              }`}
                              title={
                                isDiag
                                  ? `${gRow.name} (100%)`
                                  : `${gRow.name} ⟷ ${gCol.name}: ${score}%`
                              }
                            >
                              {score}%
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Primary Pair BPM & Meter Overlap Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div className="bg-panel2 p-2.5 rounded-xl border border-line">
                <span className="font-bold text-[#737887] uppercase tracking-wider text-[11px] flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5 text-accent" />
                  <span>{t("bpm_overlap")}</span>
                </span>
                <p className="text-text font-mono text-xs font-bold mt-0.5">
                  {similarityInfo.bpmOverlap
                    ? `${similarityInfo.overlapMin} - ${similarityInfo.overlapMax} BPM`
                    : (isZh ? "无直接重叠" : "No overlap")}
                </p>
                <span
                  className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded mt-1 ${
                    similarityInfo.bpmOverlap
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-red-500/15 text-red-300"
                  }`}
                >
                  {similarityInfo.bpmOverlap
                    ? t("compare_seamless_transition")
                    : t("compare_wide_jump")}
                </span>
              </div>

              <div className="bg-panel2 p-2.5 rounded-xl border border-line">
                <span className="font-bold text-[#737887] uppercase tracking-wider text-[11px] flex items-center space-x-1">
                  <Layers className="w-3.5 h-3.5 text-accent" />
                  <span>{t("compare_dna_compat")}</span>
                </span>
                <p className="text-text font-bold text-xs mt-0.5">
                  {genres[0]?.time_signature} vs {genres[1]?.time_signature}
                </p>
                <span className="text-[10px] text-text-sub block mt-1">
                  {genres[0]?.time_signature === genres[1]?.time_signature
                    ? t("compare_identical_meter")
                    : t("compare_polymetric")}
                </span>
              </div>
            </div>
          </div>

          {/* Algorithm Methodology Footnote Card (P3-13 explicit methodology) */}
          <div className="p-2 rounded-xl bg-[#0e0f14] border border-line-subtle text-[11px] text-[#8e93a0] flex items-start space-x-2">
            <Info className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
            <div className="leading-snug">
              <span className="font-bold text-text-sub mr-1">
                {isZh ? "算法口径说明" : "Methodology"}:
              </span>
              <span>{t("compare_methodology")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Side-by-Side Columnar Comparison Matrix */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-text tracking-wide flex items-center space-x-2">
            <Columns className="w-4 h-4 text-accent" />
            <span>{t("compare_matrix_title")}</span>
          </h3>
          <span className="text-xs text-text-sub font-mono">
            {t("compare_columns_active", { count: genres.length })}
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
                className={`bg-panel border-2 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-4 relative transition-all duration-200 ${
                  isCurrentPlaying ? "ring-2 ring-amber-400/40 shadow-amber-500/10" : ""
                }`}
                style={{ borderColor: isCurrentPlaying ? "#f5b73d" : color.stroke }}
              >
                {/* Column Header */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full border ${color.badge}`}>
                        {genre.category}
                      </span>
                      {/* Column Solo & Mute (P3-12) */}
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleToggleColumnSolo(idx)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                            columnSolos[idx]
                              ? "bg-amber-400 text-black border-amber-400 font-black shadow-sm"
                              : "bg-[#181a20] text-text-sub border-line hover:text-amber-300"
                          }`}
                          title={t("compare_solo_column")}
                          aria-label={`${t("compare_solo_column")} ${genre.name}`}
                        >
                          S
                        </button>
                        <button
                          onClick={() => handleToggleColumnMute(idx)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                            columnMutes[idx]
                              ? "bg-rose-500 text-white border-rose-500 font-black shadow-sm"
                              : "bg-[#181a20] text-text-sub border-line hover:text-rose-400"
                          }`}
                          title={t("compare_mute_column")}
                          aria-label={`${t("compare_mute_column")} ${genre.name}`}
                        >
                          M
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-text-sub font-mono">
                        #{idx + 1}
                      </span>
                      {genres.length > 2 && (
                        <button
                          onClick={() => handleRemoveGenre(genre.id)}
                          className="text-text-dim hover:text-text p-1 rounded-lg hover:bg-[#1f222a] transition-colors ml-1"
                          title="Remove from comparison"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-black text-text text-xl tracking-wide">
                      {genre.name}
                    </h3>
                    <p className="text-xs text-text-sub font-medium mt-1">
                      {genre.origin_year} · {genre.origin_place[language]}
                    </p>
                  </div>

                  {/* Sync Audition Status Badge */}
                  {isSyncPlaying && (
                    <div className="pt-0.5">
                      {idx === 0 && (
                        <div className={`flex items-center space-x-2 px-2.5 py-1 rounded-xl text-xs font-bold border transition-colors ${
                          syncMode === "solo_b"
                            ? "bg-zinc-800/60 border-zinc-700 text-zinc-400"
                            : syncMode === "drums_only"
                            ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                            : "bg-amber-500/20 border-amber-500/40 text-amber-300"
                        }`}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: syncMode === "solo_b" ? "#71717a" : "#f5b73d" }} />
                          <span className="truncate max-w-[180px] whitespace-nowrap">
                            {syncMode === "solo_b"
                              ? t("compare_sync_muted_solo_b")
                              : syncMode === "drums_only"
                              ? t("compare_sync_drums")
                              : t("compare_sync_active_a")}
                          </span>
                        </div>
                      )}
                      {idx === 1 && (
                        <div className={`flex items-center space-x-2 px-2.5 py-1 rounded-xl text-xs font-bold border transition-colors ${
                          syncMode === "solo_a"
                            ? "bg-zinc-800/60 border-zinc-700 text-zinc-400"
                            : syncMode === "drums_only"
                            ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300"
                            : "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                        }`}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: syncMode === "solo_a" ? "#71717a" : "#818cf8" }} />
                          <span className="truncate max-w-[180px] whitespace-nowrap">
                            {syncMode === "solo_a"
                              ? t("compare_sync_muted_solo_a")
                              : syncMode === "drums_only"
                              ? t("compare_sync_drums")
                              : t("compare_sync_active_b")}
                          </span>
                        </div>
                      )}
                      {idx >= 2 && (
                        <div className="flex items-center space-x-2 px-2.5 py-1 rounded-xl text-xs font-bold border bg-zinc-800/40 border-zinc-700 text-zinc-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                          <span className="truncate max-w-[180px] whitespace-nowrap">
                            {t("compare_not_in_sync")}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dual Audition Action Buttons: Dedicated Drums Only & Full Band */}
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      {/* Audition Drums Only Button */}
                      <button
                        onClick={() => handlePlayMode(genre, "drums")}
                        disabled={startingAuditionKey !== null || isSyncStarting}
                        aria-busy={startingAuditionKey === `${genre.id}:drums`}
                        className={`flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all border shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                          isCurrentPlaying && playingMode === "drums"
                            ? "bg-accent text-black border-accent shadow-[0_0_15px_rgba(245,183,61,0.4)]"
                            : "bg-[#181a22] hover:bg-[#222530] text-[#e0ded8] border-[#2c303c] hover:border-accent/50"
                        }`}
                        title={t("compare_audition_drums_title")}
                      >
                        {startingAuditionKey === `${genre.id}:drums` ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                            <span>{t("compare_starting")}</span>
                          </>
                        ) : isCurrentPlaying && playingMode === "drums" ? (
                          <>
                            <Square className="w-3.5 h-3.5 fill-current" />
                            <span>{t("compare_stop_drums")}</span>
                            <div className="flex items-end gap-0.5 h-3 ml-1">
                              <span className="w-0.5 h-3 bg-black animate-pulse" />
                              <span className="w-0.5 h-1.5 bg-black animate-ping" />
                              <span className="w-0.5 h-3 bg-black animate-pulse" />
                            </div>
                          </>
                        ) : (
                          <>
                            <Disc3 className="w-3.5 h-3.5 text-accent" />
                            <span>{t("drums_only")}</span>
                          </>
                        )}
                      </button>

                      {/* Audition Full Band Button */}
                      <button
                        onClick={() => handlePlayMode(genre, "full")}
                        disabled={startingAuditionKey !== null || isSyncStarting}
                        aria-busy={startingAuditionKey === `${genre.id}:full`}
                        className={`flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all border shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                          isCurrentPlaying && playingMode === "full"
                            ? "bg-accent text-black border-accent shadow-[0_0_15px_rgba(245,183,61,0.4)]"
                            : "bg-[#181a22] hover:bg-[#222530] text-[#e0ded8] border-[#2c303c] hover:border-accent/50"
                        }`}
                        title={t("compare_audition_full_title")}
                      >
                        {startingAuditionKey === `${genre.id}:full` ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                            <span>{t("compare_starting")}</span>
                          </>
                        ) : isCurrentPlaying && playingMode === "full" ? (
                          <>
                            <Square className="w-3.5 h-3.5 fill-current" />
                            <span>{t("compare_stop_full")}</span>
                            <div className="flex items-end gap-0.5 h-3 ml-1">
                              <span className="w-0.5 h-3 bg-black animate-pulse" />
                              <span className="w-0.5 h-1.5 bg-black animate-ping" />
                              <span className="w-0.5 h-3 bg-black animate-pulse" />
                            </div>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-current text-accent" />
                            <span>{t("full_band")}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Quick navigation actions */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => onOpenStudio(genre)}
                        className="py-2 px-2.5 rounded-xl bg-panel2 hover:bg-[#1a1b20] border border-line text-text hover:text-accent text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors"
                        title={t("open_in_studio")}
                      >
                        <Sliders className="w-3.5 h-3.5 text-accent" />
                        <span>{t("open_in_studio")}</span>
                      </button>
                      <button
                        onClick={() => onSelectGenre(genre)}
                        className="py-2 px-2.5 rounded-xl bg-panel2 hover:bg-[#1a1b20] border border-line text-text-sub hover:text-text text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors"
                        title={t("view_detail")}
                      >
                        <span>{t("view_detail")}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Spec Block 1: 核心基础规格 (Core Specs) */}
                  <div className="p-4 rounded-2xl bg-panel2 border border-line space-y-2.5">
                    <div className="text-xs font-black uppercase tracking-wider text-accent flex items-center space-x-1.5">
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
                  <div className="p-4 rounded-2xl bg-panel2 border border-line space-y-3">
                    <div className="text-xs font-black uppercase tracking-wider text-accent flex items-center space-x-1.5">
                      <Zap className="w-3.5 h-3.5" />
                      <span>{t("groove_dna")}</span>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-[#1a1c22]">
                      <div>
                        <span className="text-xs font-bold text-accent uppercase tracking-wide block">
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
                            {t("detail_percussion")}
                          </span>
                          <p className="text-sm text-[#d4d1c9] leading-relaxed mt-1 font-sans">
                            {genre.drum_pattern.percussion[language]}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Spec Block 3: 低频与和声架构 (Bass & Harmonics) */}
                  <div className="p-4 rounded-2xl bg-panel2 border border-line space-y-3">
                    <div className="text-xs font-black uppercase tracking-wider text-accent flex items-center space-x-1.5">
                      <Music className="w-3.5 h-3.5" />
                      <span>{t("bass_harmony")}</span>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-[#1a1c22]">
                      <div>
                        <span className="text-xs font-bold text-accent uppercase tracking-wide block">
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

                  {/* Spec Block: 典型配器与音色设计 (Instrumentation & Sound Design) */}
                  {((genre.instrumentation && genre.instrumentation.length > 0) || genre.sound_design) && (
                    <div className="p-4 rounded-2xl bg-panel2 border border-line space-y-3">
                      <div className="text-xs font-black uppercase tracking-wider text-accent flex items-center space-x-1.5">
                        <Mic2 className="w-3.5 h-3.5" />
                        <span>{t("compare_instrumentation")}</span>
                      </div>
                      <div className="space-y-2.5 pt-2 border-t border-[#1a1c22]">
                        {genre.instrumentation && genre.instrumentation.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {genre.instrumentation.map((inst, iIdx) => (
                              <span
                                key={iIdx}
                                className="px-2 py-0.5 bg-[#14151b] border border-[#2b2e3a] rounded-md text-[11px] font-medium text-[#d0d3dc]"
                              >
                                {inst}
                              </span>
                            ))}
                          </div>
                        )}
                        {genre.sound_design && (
                          <p className="text-sm text-[#b8b5ad] leading-relaxed font-sans">
                            {genre.sound_design[language]}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Spec Block: 典型曲式架构与和声转位 (Structure & Chord Inversions) */}
                  {((genre.structure && genre.structure.length > 0) || genre.chord_inversions) && (
                    <div className="p-4 rounded-2xl bg-panel2 border border-line space-y-3">
                      <div className="text-xs font-black uppercase tracking-wider text-accent flex items-center space-x-1.5">
                        <Layers className="w-3.5 h-3.5" />
                        <span>{t("compare_structure_harmony")}</span>
                      </div>
                      <div className="space-y-2.5 pt-2 border-t border-[#1a1c22]">
                        {genre.structure && genre.structure.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 text-[11px] font-mono text-[#c7cbd6]">
                            {genre.structure.map((sec, sIdx) => (
                              <React.Fragment key={sIdx}>
                                <span className="px-2 py-0.5 bg-[#16171f] border border-[#2c2f3d] rounded text-accent font-bold">
                                  {sec}
                                </span>
                                {sIdx < genre.structure.length - 1 && (
                                  <span className="text-[#626775]">→</span>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                        {genre.chord_inversions && (
                          <p className="text-sm text-[#b8b5ad] leading-relaxed font-sans">
                            {genre.chord_inversions[language]}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Spec Block 4: 六维声学特性雷达指标 (Sonic Radar Breakdown) */}
                  <div className="p-4 rounded-2xl bg-panel2 border border-line space-y-3">
                    <div className="text-xs font-black uppercase tracking-wider text-accent flex items-center space-x-1.5">
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
                                {isZh ? axis.labelZh : axis.labelEn}
                              </span>
                              <span className="font-mono font-bold text-[#f3f1ec]">
                                {val}/10
                              </span>
                            </div>
                            <div className="w-full bg-[#181a20] rounded-full h-2 overflow-hidden border border-line">
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
                    <div className="p-4 rounded-2xl bg-panel2 border border-line space-y-2.5">
                      <div className="text-xs font-black uppercase tracking-wider text-accent flex items-center space-x-1.5">
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
                                className="text-xs text-accent hover:underline flex items-center space-x-1 flex-shrink-0 font-bold"
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

                  {/* Spec Block: 代表艺术家 (Representative Artists) */}
                  {genre.representative_artists && genre.representative_artists.length > 0 && (
                    <div className="p-4 rounded-2xl bg-panel2 border border-line space-y-2.5">
                      <div className="text-xs font-black uppercase tracking-wider text-accent flex items-center space-x-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>{t("compare_artists")}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#1a1c22]">
                        {genre.representative_artists.map((artist, aIdx) => (
                          <span
                            key={aIdx}
                            className="px-2.5 py-1 bg-[#151720] border border-[#2b2e3a] rounded-lg text-xs font-medium text-[#e2e0d8]"
                          >
                            {artist}
                          </span>
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
