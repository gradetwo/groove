import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Wand2,
  Sparkles,
  Play,
  Square,
  Sliders,
  Share2,
  Download,
  Copy,
  Check,
  Plus,
  Trash2,
  Copy as DuplicateIcon,
  RefreshCw,
  FolderOpen,
  X,
  ExternalLink,
  ChevronDown,
  Info,
  Layers,
  Music,
  Clock,
  ArrowRight,
  BookOpen,
} from "lucide-react";
import { CustomGenre, RADAR_KEYS_ORDER } from "../types/customGenre";
import { Genre, GenreCategory, GenreRadarMetrics, SequencerTrack } from "../types/genre";
import { GENRE_INDEX } from "../data/index/genresIndex";
import { invalidateGenreCache, loadGenre } from "../data/index/loader";
import { useCustomGenres } from "../features/customGenre/useCustomGenres";
import { encodeGenreToSharePayload, decodeSharePayloadToGenre } from "../features/customGenre/customGenreCodec";
import { renderGenrePoster } from "../features/customGenre/posterGenerator";
import { RadarChart } from "../ui/RadarChart";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { patternFromGenre } from "../data/genreMix";
import { useLanguage } from "../i18n/LanguageContext";
import { useDeviceCapabilities } from "../hooks/useDeviceCapabilities";
import { toast } from "../ui/Toast";
import { useAudioEngineInstance } from "../features/sequencer/hooks/useAudioEngineInstance";

interface CustomGenreMakerViewProps {
  initialSharePayload?: string;
  initialForkId?: string;
  onOpenStudio: (genre: Genre) => void;
  onSelectGenre?: (genre: { id: string }) => void;
  onOpenHelp?: () => void;
}

const CATEGORIES: GenreCategory[] = [
  "Electronic",
  "Rock/Metal",
  "Hip Hop",
  "Jazz/Blues",
  "Pop/R&B",
  "Latin/World",
];

const COMMON_SCALES = [
  "C Minor",
  "C Major",
  "A Minor",
  "D Dorian",
  "F Lydian",
  "G Mixolydian",
  "E Phrygian",
  "C Blues",
  "C Harmonic Minor",
];

const TIME_SIGNATURES = ["4/4", "3/4", "6/8", "7/8", "5/4"];

const TRACK_THEMES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  kick: { label: "Kick (底鼓)", color: "text-amber-400", bg: "bg-amber-500", border: "border-amber-400" },
  snare: { label: "Snare (军鼓/掌声)", color: "text-cyan-400", bg: "bg-cyan-400", border: "border-cyan-300" },
  hihat: { label: "Hi-Hat (闭镲)", color: "text-yellow-400", bg: "bg-yellow-400", border: "border-yellow-300" },
  percussion: { label: "Percussion (打击乐)", color: "text-emerald-400", bg: "bg-emerald-400", border: "border-emerald-300" },
  bass: { label: "Bass (贝斯行进)", color: "text-purple-400", bg: "bg-purple-500", border: "border-purple-400" },
  chords: { label: "Chords (和弦铺底)", color: "text-indigo-400", bg: "bg-indigo-500", border: "border-indigo-400" },
  lead: { label: "Lead (主奏乐器)", color: "text-pink-400", bg: "bg-pink-500", border: "border-pink-400" },
  fx: { label: "FX (效果氛围)", color: "text-sky-400", bg: "bg-sky-400", border: "border-sky-300" },
};

export const CustomGenreMakerView: React.FC<CustomGenreMakerViewProps> = ({
  initialSharePayload,
  initialForkId,
  onOpenStudio,
  onOpenHelp,
}) => {
  const { t, isZh } = useLanguage();
  /** Phone surface: measured at 390×664 this view had eight controls under the minimum — the
   *  fork select at 140×18, Fork at 43×24, and the whole header row at 34 px. */
  const { isMobile } = useDeviceCapabilities();
  const {
    customGenres,
    isLoading: isDbLoading,
    saveCustomGenre,
    deleteCustomGenre,
    duplicateCustomGenre,
    createBlankCustomGenre,
    forkGenre,
  } = useCustomGenres();

  // Active genre being edited
  const [activeGenre, setActiveGenre] = useState<CustomGenre | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Audition playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  /**
   * The preview engine, owned by `useAudioEngineInstance`.
   *
   * This view used to build the engine inside an effect and destroy it in that effect's cleanup,
   * which is the same three lines every other view wrote by hand. The hook owns the lifecycle now —
   * one engine per mount, `stop()` then `destroy()` on unmount — and keeps the callbacks current
   * without rebuilding the engine, so the closures over `setCurrentStep` / `setIsPlaying` can change
   * freely.
   */
  const { engineRef } = useAudioEngineInstance({
    onStep: ({ step }) => setCurrentStep(step),
    onStop: () => {
      setIsPlaying(false);
      setCurrentStep(0);
    },
  });

  // Poster & Share Modal
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const posterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPosterRendering, setIsPosterRendering] = useState(false);

  // Shared payload import prompt
  const [pendingImportGenre, setPendingImportGenre] = useState<CustomGenre | null>(null);

  // Pending destructive action awaiting confirmation via the in-app dialog
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; notify: boolean } | null>(null);

  // Selected fork genre id for the dropdown
  const [selectedForkBaseId, setSelectedForkBaseId] = useState<string>("chicago-house");

  // Load shared payload if present in URL
  useEffect(() => {
    if (initialSharePayload) {
      decodeSharePayloadToGenre(initialSharePayload).then((decoded) => {
        if (decoded) {
          setPendingImportGenre(decoded);
        }
      });
    }
  }, [initialSharePayload]);

  // Load forked base if requested in URL
  useEffect(() => {
    if (initialForkId && !activeGenre) {
      loadGenre(initialForkId).then((base) => {
        if (base) {
          forkGenre(base).then((forked) => {
            setActiveGenre(forked);
          });
        }
      });
    }
  }, [initialForkId, activeGenre, forkGenre, saveCustomGenre]);

  // Initialize active genre on first load from existing DB or create blank
  useEffect(() => {
    if (!isDbLoading && !activeGenre && !initialForkId && !initialSharePayload) {
      if (customGenres.length > 0) {
        setActiveGenre(customGenres[0]);
      } else {
        createBlankCustomGenre("My First Custom Genre").then((blank) => {
          setActiveGenre(blank);
        });
      }
    }
  }, [isDbLoading, activeGenre, customGenres, initialForkId, initialSharePayload, createBlankCustomGenre]);

  // Sync engine pattern when activeGenre pattern or bpm changes
  useEffect(() => {
    if (engineRef.current && activeGenre) {
      engineRef.current.setPattern(patternFromGenre(activeGenre));
      engineRef.current.setBpm(activeGenre.default_bpm);
    }
  }, [activeGenre?.sequencer_pattern, activeGenre?.default_bpm]);

  const handleTogglePlay = () => {
    if (!engineRef.current || !activeGenre) return;
    if (isPlaying) {
      engineRef.current.stop();
      setIsPlaying(false);
      setCurrentStep(0);
    } else {
      engineRef.current.setPattern(patternFromGenre(activeGenre));
      engineRef.current.setBpm(activeGenre.default_bpm);
      engineRef.current.play();
      setIsPlaying(true);
    }
  };

  // Field update helpers
  const updateGenreField = useCallback(<K extends keyof CustomGenre>(key: K, value: CustomGenre[K]) => {
    setActiveGenre((prev) => {
      if (!prev) return null;
      return { ...prev, [key]: value };
    });
    setIsDirty(true);
  }, []);

  const updateRadarMetric = useCallback((key: keyof GenreRadarMetrics, value: number) => {
    setActiveGenre((prev) => {
      if (!prev) return null;
      const radar = { ...prev.radar_metrics, [key]: value };
      return { ...prev, radar_metrics: radar };
    });
    setIsDirty(true);
  }, []);

  const toggleStep = useCallback((trackIdx: number, stepIdx: number) => {
    setActiveGenre((prev) => {
      if (!prev) return null;
      const pattern = JSON.parse(JSON.stringify(prev.sequencer_pattern));
      const track = pattern.tracks[trackIdx];
      if (!track) return prev;

      const currentVal = track.steps[stepIdx] || 0;
      track.steps[stepIdx] = currentVal > 0 ? 0 : 1;

      // Update velocity
      if (!track.velocity) track.velocity = new Array(track.steps.length).fill(0);
      track.velocity[stepIdx] = track.steps[stepIdx] > 0 ? 120 : 0;

      return {
        ...prev,
        sequencer_pattern: pattern,
      };
    });
    setIsDirty(true);
  }, []);

  // Save changes to IndexedDB
  const handleSave = async () => {
    if (!activeGenre) return;
    setIsSaving(true);
    try {
      await saveCustomGenre(activeGenre);
      /**
       * The loader caches genre records for the life of the page, and a custom genre is the one
       * category that can change while the app runs. Without this, reopening a genre the user just
       * edited renders the pre-edit object — their change looks unsaved.
       */
      invalidateGenreCache(activeGenre.id);
      setIsDirty(false);
      toast.success(t("maker_saved_success"));
    } catch (err) {
      console.error("Failed to save custom genre:", err);
      toast.error(t("maker_save_failed"));
    } finally {
      setIsSaving(false);
    }
  };

  // Fork button handler
  const handleForkBase = async () => {
    const base = await loadGenre(selectedForkBaseId);
    if (base) {
      const forked = await forkGenre(base);
      setActiveGenre(forked);
      setIsDirty(false);
      toast.success(t("maker_fork_success", { name: base.name }));
    }
  };

  // Create new blank handler
  const handleCreateBlank = async () => {
    const blank = await createBlankCustomGenre(
      t("maker_default_name", { n: customGenres.length + 1 })
    );
    setActiveGenre(blank);
    setIsDirty(false);
    toast.success(t("maker_blank_created"));
  };

  // Duplicate active handler
  const handleDuplicate = async () => {
    if (!activeGenre) return;
    const copy = await duplicateCustomGenre(activeGenre.id);
    if (copy) {
      setActiveGenre(copy);
      setIsDirty(false);
      toast.success(t("maker_duplicate_success", { name: copy.name }));
    }
  };

  // Delete active handler
  const handleDelete = () => {
    if (!activeGenre) return;
    setDeleteTarget({ id: activeGenre.id, notify: true });
  };

  // Perform the deletion once the user confirms the in-app dialog
  const handleConfirmDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;

    await deleteCustomGenre(target.id);
    if (target.notify) {
      toast.success(t("maker_deleted"));
    }

    if (target.notify || target.id === activeGenre?.id) {
      const remaining = customGenres.filter((g) => g.id !== target.id);
      if (remaining.length > 0) {
        setActiveGenre(remaining[0]);
      } else {
        handleCreateBlank();
      }
    }
  };

  // Open Poster & Share Modal
  const handleOpenShareModal = async () => {
    if (!activeGenre) return;
    // Auto-save first
    await saveCustomGenre(activeGenre);
    setIsDirty(false);

    // Generate share URL
    const payload = await encodeGenreToSharePayload(activeGenre);
    const origin = typeof window !== "undefined" ? window.location.origin : "https://groove.wangda.today";
    const fullUrl = `${origin}/#/maker?share=${payload}`;
    setShareUrl(fullUrl);
    setShareModalOpen(true);
    setCopied(false);

    // Render poster
    setIsPosterRendering(true);
    setTimeout(async () => {
      if (posterCanvasRef.current) {
        await renderGenrePoster(posterCanvasRef.current, {
          genre: activeGenre,
          shareUrl: fullUrl,
          isZh,
        });
        setIsPosterRendering(false);
      }
    }, 100);
  };

  const handleCopyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success(t("maker_share_url_copied"));
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(t("maker_copy_failed"));
    }
  };

  const handleDownloadPoster = () => {
    if (!posterCanvasRef.current || !activeGenre) return;
    const slug = activeGenre.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const link = document.createElement("a");
    link.download = `groove-${slug}-poster.png`;
    link.href = posterCanvasRef.current.toDataURL("image/png");
    link.click();
    toast.success(t("maker_poster_started"));
  };

  // Confirm pending import
  const handleConfirmImport = async () => {
    if (!pendingImportGenre) return;
    await saveCustomGenre(pendingImportGenre);
    setActiveGenre(pendingImportGenre);
    setPendingImportGenre(null);
    toast.success(t("maker_import_success", { name: pendingImportGenre.name }));
  };

  if (!activeGenre) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center text-text-sub flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-2 border-accent/40 border-t-accent rounded-full animate-spin mb-4" />
        <p className="font-mono text-xs uppercase tracking-widest">{t("maker_saving")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Header & Workshop Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-panel border border-line rounded-3xl p-6 shadow-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-accent/15 text-accent border border-accent/30 shadow-[0_0_15px_rgba(245,183,61,0.2)]">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-text tracking-wide">
                  {t("maker_title")}
                </h1>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-accent/20 text-accent border border-accent/40 uppercase">
                  P7-03 V1.15.3
                </span>
                {isDirty && (
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                    ● {t("maker_unsaved")}
                  </span>
                )}
              </div>
              <p className="text-xs text-text-sub mt-0.5">
                {t("maker_subtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Fork Selector */}
          <div className="flex items-center gap-1.5 bg-panel2 border border-line rounded-xl px-2.5 py-1.5 text-xs">
            <span className="text-text-dim text-[11px] font-mono hidden sm:inline">
              {t("maker_fork_from")}:
            </span>
            <select
              value={selectedForkBaseId}
              onChange={(e) => setSelectedForkBaseId(e.target.value)}
              className={`bg-transparent text-text font-medium text-xs focus:outline-none max-w-[140px] cursor-pointer ${isMobile ? "min-h-11" : ""}`}
            >
              {GENRE_INDEX.map((g) => (
                <option key={g.id} value={g.id} className="bg-[#12141c] text-text">
                  {g.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleForkBase}
              className={`px-2 py-1 rounded-lg bg-accent/20 hover:bg-accent text-accent hover:text-black text-xs font-bold transition-colors ${isMobile ? "min-h-11 min-w-11" : ""}`}
              title={t("fork_in_maker")}
            >
              {t("maker_fork_action")}
            </button>
          </div>

          {/* New Blank Button */}
          <button
            onClick={handleCreateBlank}
            className={`flex items-center gap-1 px-3 py-2 rounded-xl bg-panel2 hover:bg-neutral-800 text-text font-medium text-xs border border-line transition-colors ${isMobile ? "min-h-11" : ""}`}
            title={t("maker_new_blank")}
          >
            <Plus className="w-3.5 h-3.5 text-accent" />
            <span>{t("maker_new_blank")}</span>
          </button>

          {/* Save to Local DB */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-md ${isMobile ? "min-h-11" : ""} ${
              isDirty
                ? "bg-accent text-black shadow-[0_0_15px_rgba(245,183,61,0.4)] ring-2 ring-amber-400"
                : "bg-panel2 hover:bg-neutral-800 text-text border border-line"
            }`}
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>{t("maker_saving")}</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>{isDirty ? t("maker_save_local") : t("maker_saved")}</span>
              </>
            )}
          </button>

          {/* Poster & Share */}
          <button
            onClick={handleOpenShareModal}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 font-bold text-xs border border-indigo-500/40 transition-all hover:scale-105 ${isMobile ? "min-h-11" : ""}`}
            title={t("maker_share_poster")}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{t("maker_share_poster")}</span>
          </button>

          {/* Guide Button */}
          {onOpenHelp && (
            <button
              type="button"
              data-testid="maker-help-button"
              onClick={onOpenHelp}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-accent/15 hover:bg-accent/25 text-accent font-bold text-xs border border-accent/40 transition-all ${isMobile ? "min-h-11" : ""}`}
              title={t("maker_guide_btn")}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{t("maker_guide_btn")}</span>
            </button>
          )}

          {/* Open in Studio */}
          <button
            onClick={() => onOpenStudio(activeGenre)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-bold text-xs border border-emerald-500/40 transition-all ${isMobile ? "min-h-11" : ""}`}
            title={t("maker_open_studio")}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{t("maker_open_studio")}</span>
          </button>
        </div>
      </div>

      {/* Main Studio Grid: Left Column (Identity + Radar) & Right Column (Pattern Editor + Saved List) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Metadata & 6-Axis Radar (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Section 1: Identity & Meta */}
          <div className="bg-panel border border-line rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
            <h2 className="text-sm font-bold text-text uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <span>{t("maker_sec_identity")}</span>
            </h2>

            {/* Name & Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-mono text-text-sub block mb-1">
                  {t("maker_name_label")}
                </label>
                <input
                  type="text"
                  value={activeGenre.name}
                  onChange={(e) => updateGenreField("name", e.target.value)}
                  className={`w-full bg-panel2 border border-line rounded-xl px-3 py-2 text-sm text-text font-bold focus:outline-none focus:border-accent ${isMobile ? "min-h-11" : ""}`}
                  placeholder="e.g. Cyber Gqom 2026"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-text-sub block mb-1">
                  {t("maker_category_label")}
                </label>
                <select
                  value={activeGenre.category}
                  onChange={(e) => updateGenreField("category", e.target.value as GenreCategory)}
                  className={`w-full bg-panel2 border border-line rounded-xl px-3 py-2 text-sm text-text font-medium focus:outline-none focus:border-accent cursor-pointer ${isMobile ? "min-h-11" : ""}`}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat} className="bg-[#12141c]">
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Author & BPM */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-mono text-text-sub block mb-1">
                  {t("maker_author_label")}
                </label>
                <input
                  type="text"
                  value={activeGenre.authorName || ""}
                  onChange={(e) => updateGenreField("authorName", e.target.value)}
                  className={`w-full bg-panel2 border border-line rounded-xl px-3 py-2 text-xs text-text font-medium focus:outline-none focus:border-accent ${isMobile ? "min-h-11" : ""}`}
                  placeholder="e.g. DJ Producer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-mono text-text-sub">
                    {t("maker_bpm_label")}
                  </label>
                  <span className="text-xs font-mono font-bold text-accent">
                    {activeGenre.default_bpm} BPM
                  </span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="240"
                  step="1"
                  value={activeGenre.default_bpm}
                  onChange={(e) => {
                    const bpm = parseInt(e.target.value, 10);
                    updateGenreField("default_bpm", bpm);
                    updateGenreField("bpm_range", `${bpm - 4}-${bpm + 4}`);
                  }}
                  className="w-full accent-accent cursor-pointer"
                />
              </div>
            </div>

            {/* Scale & Time Signature */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-mono text-text-sub block mb-1">
                  {t("maker_scale_label")}
                </label>
                <select
                  value={activeGenre.sequencer_pattern?.scale || "C Minor"}
                  onChange={(e) => {
                    const pat = { ...activeGenre.sequencer_pattern, scale: e.target.value };
                    updateGenreField("sequencer_pattern", pat);
                  }}
                  className={`w-full bg-panel2 border border-line rounded-xl px-3 py-2 text-xs text-text font-medium focus:outline-none focus:border-accent cursor-pointer ${isMobile ? "min-h-11" : ""}`}
                >
                  {COMMON_SCALES.map((scale) => (
                    <option key={scale} value={scale} className="bg-[#12141c]">
                      {scale}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-mono text-text-sub block mb-1">
                  {t("maker_time_signature")}
                </label>
                <select
                  value={activeGenre.time_signature}
                  onChange={(e) => updateGenreField("time_signature", e.target.value)}
                  className={`w-full bg-panel2 border border-line rounded-xl px-3 py-2 text-xs text-text font-medium focus:outline-none focus:border-accent cursor-pointer ${isMobile ? "min-h-11" : ""}`}
                >
                  {TIME_SIGNATURES.map((ts) => (
                    <option key={ts} value={ts} className="bg-[#12141c]">
                      {ts}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Cultural Context Description */}
            <div>
              <label className="text-[11px] font-mono text-text-sub block mb-1">
                {t("maker_context_label")}
              </label>
              <textarea
                rows={2}
                value={isZh ? (activeGenre.cultural_context?.zh || "") : (activeGenre.cultural_context?.en || "")}
                onChange={(e) => {
                  const val = e.target.value;
                  const cur = activeGenre.cultural_context || { en: "", zh: "" };
                  updateGenreField("cultural_context", {
                    ...cur,
                    [isZh ? "zh" : "en"]: val,
                    ...(isZh ? { en: cur.en || val } : { zh: cur.zh || val }),
                  });
                }}
                className="w-full bg-panel2 border border-line rounded-xl p-2.5 text-xs text-text leading-relaxed focus:outline-none focus:border-accent resize-none"
                placeholder="Describe cultural roots, aesthetic philosophy, or sonic textures..."
              />
            </div>

            {/* Representative Artists */}
            <div>
              <label className="text-[11px] font-mono text-text-sub block mb-1">
                {t("maker_artists_label")}
              </label>
              <input
                type="text"
                value={(activeGenre.representative_artists || []).join(", ")}
                onChange={(e) => {
                  const arr = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                  updateGenreField("representative_artists", arr);
                }}
                className={`w-full bg-panel2 border border-line rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-accent ${isMobile ? "min-h-11" : ""}`}
                placeholder="e.g. Burial, Four Tet, Sophie"
              />
            </div>
          </div>

          {/* Section 2: 6-Axis Acoustic Radar */}
          <div className="bg-panel border border-line rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
            <h2 className="text-sm font-bold text-text uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent" />
              <span>{t("maker_sec_radar")}</span>
            </h2>

            {/* Radar Preview */}
            <div className="flex justify-center py-2">
              <RadarChart
                metrics={activeGenre.radar_metrics}
                size={220}
                aria-label="Custom Genre Acoustic Radar Chart"
              />
            </div>

            {/* 6 Sliders */}
            <div className="space-y-3 pt-2 border-t border-line">
              {RADAR_KEYS_ORDER.map((key) => {
                const val = activeGenre.radar_metrics[key] || 5;
                const labelKey = `maker_radar_${key}` as any;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-text-sub">{t(labelKey)}</span>
                      <span className="text-accent font-bold">{val} / 10</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="1"
                      value={val}
                      onChange={(e) => updateRadarMetric(key, parseInt(e.target.value, 10))}
                      className="w-full accent-accent cursor-pointer"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: 8-Track Seed Pattern Editor & Library (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Section 3: 8-Track Seed Pattern Grid */}
          <div className="bg-panel border border-line rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line pb-4">
              <div>
                <h2 className="text-sm font-bold text-text uppercase tracking-wider flex items-center gap-2">
                  <Music className="w-4 h-4 text-accent" />
                  <span>{t("maker_sec_pattern")}</span>
                </h2>
                <p className="text-xs text-text-sub mt-0.5">
                  {t("maker_sec_pattern_desc")}
                </p>
              </div>

              {/* Play / Stop Audition Button */}
              <button
                onClick={handleTogglePlay}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs transition-all shadow-md ${
                  isPlaying
                    ? "bg-accent text-black ring-2 ring-amber-400 shadow-[0_0_15px_rgba(245,183,61,0.5)]"
                    : "bg-panel2 hover:bg-neutral-800 text-text border border-line"
                }`}
              >
                {isPlaying ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>{t("maker_pattern_stop")}</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current text-accent" />
                    <span>{t("maker_pattern_audition")}</span>
                  </>
                )}
              </button>
            </div>

            {/* Pattern Matrix: 8 tracks x 16 steps */}
            <div className="space-y-2 overflow-x-auto pb-2">
              {(activeGenre.sequencer_pattern?.tracks || []).map((track, tIdx) => {
                const theme = TRACK_THEMES[track.track_id] || {
                  label: track.name,
                  color: "text-text",
                  bg: "bg-accent",
                  border: "border-accent",
                };
                const steps = track.steps || [];

                return (
                  <div key={track.track_id} className="flex items-center gap-2 min-w-[560px]">
                    {/* Track Title */}
                    <div className="w-32 shrink-0 truncate text-right pr-2">
                      <span className={`text-xs font-mono font-bold ${theme.color}`}>
                        {track.name}
                      </span>
                    </div>

                    {/* 16 Step Buttons */}
                    <div className="flex-1 grid grid-cols-16 gap-1">
                      {Array.from({ length: 16 }).map((_, sIdx) => {
                        const isActive = (steps[sIdx] || 0) > 0;
                        const isBeatStart = sIdx % 4 === 0;
                        const isCurrentPlaying = isPlaying && currentStep === sIdx;

                        return (
                          <button
                            key={sIdx}
                            onClick={() => toggleStep(tIdx, sIdx)}
                            className={`h-8 rounded-lg transition-all border ${
                              isActive
                                ? `${theme.bg} text-black font-bold shadow-sm ${theme.border} scale-[1.02]`
                                : isBeatStart
                                ? "bg-[#181a24] border-[#2c3040] hover:border-text-sub"
                                : "bg-[#12131a] border-[#222533] hover:border-text-dim"
                            } ${
                              isCurrentPlaying ? "ring-2 ring-white scale-110 z-10 brightness-125" : ""
                            }`}
                            title={`Step ${sIdx + 1} (${track.name})`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 4: My Custom Genres Library */}
          <div className="bg-panel border border-line rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-sm font-bold text-text uppercase tracking-wider flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-accent" />
                <span>{t("maker_my_genres", { count: customGenres.length })}</span>
              </h2>

              <button
                onClick={handleDuplicate}
                className="flex items-center gap-1 text-xs text-text-sub hover:text-accent font-medium px-2.5 py-1 rounded-lg bg-panel2 border border-line transition-colors"
                title={t("maker_duplicate")}
              >
                <DuplicateIcon className="w-3.5 h-3.5" />
                <span>{t("maker_duplicate")}</span>
              </button>
            </div>

            {customGenres.length === 0 ? (
              <p className="text-xs text-text-sub py-4 text-center">
                {t("maker_no_custom_genres")}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                {customGenres.map((genre) => {
                  const isCurrent = genre.id === activeGenre.id;

                  return (
                    <div
                      key={genre.id}
                      onClick={() => {
                        if (genre.id !== activeGenre.id) {
                          setActiveGenre(genre);
                          setIsDirty(false);
                        }
                      }}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                        isCurrent
                          ? "bg-accent/10 border-accent/60 shadow-[0_0_15px_rgba(245,183,61,0.15)] ring-1 ring-accent/30"
                          : "bg-panel2 border-line hover:border-line-strong hover:bg-neutral-850"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-bold text-xs text-text truncate">
                              {genre.name}
                            </h3>
                            {isCurrent && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-accent text-black font-extrabold uppercase">
                                {t("maker_active_badge")}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-text-dim mt-0.5 truncate">
                            {genre.category} • {genre.default_bpm} BPM • {genre.time_signature}
                          </p>
                        </div>

                        {/* Delete button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({ id: genre.id, notify: false });
                          }}
                          className="p-1 rounded-lg text-text-dim hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title={t("maker_delete")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-text-dim pt-1 border-t border-line/60">
                        <span>{genre.forkedFromName ? `${t("maker_forked_from")}: ${genre.forkedFromName}` : (t("maker_original"))}</span>
                        <span>{new Date(genre.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Share & Poster Modal */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-4xl bg-[#0e1017] border border-line rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-accent/20 text-accent">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-text">
                    {t("maker_share_modal_title")}
                  </h3>
                  <p className="text-xs text-text-sub">
                    {activeGenre.name} · {activeGenre.default_bpm} BPM · {activeGenre.category}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShareModalOpen(false)}
                className="p-2 rounded-xl text-text-sub hover:text-text hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Share Link Box */}
            <div className="bg-panel2 border border-line rounded-2xl p-4 space-y-2">
              <span className="text-xs font-mono font-bold text-accent uppercase tracking-wider block">
                {t("maker_share_url_copy")}
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-black/40 border border-line rounded-xl px-3 py-2 text-xs font-mono text-[#b9b7b0] select-all focus:outline-none"
                />
                <button
                  onClick={handleCopyShareUrl}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs transition-all ${
                    copied
                      ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20"
                      : "bg-accent hover:bg-amber-400 text-black shadow-md shadow-amber-500/20"
                  }`}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? t("maker_share_url_copied") : t("maker_share_url_copy")}</span>
                </button>
              </div>
            </div>

            {/* Poster Canvas Preview */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-text-sub uppercase tracking-wider">
                  {isPosterRendering ? t("maker_generating_poster") : (t("maker_poster_preview"))}
                </span>
                <button
                  onClick={handleDownloadPoster}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-text font-bold text-xs transition-all shadow-lg shadow-indigo-600/30"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t("maker_download_poster")}</span>
                </button>
              </div>

              {/* Canvas Container with smooth scaling */}
              <div className="flex justify-center bg-black/50 p-4 rounded-2xl border border-line overflow-hidden">
                <canvas
                  ref={posterCanvasRef}
                  role="img"
                  aria-label={t("genre_maker_poster_label")}
                  className="max-h-[500px] w-auto rounded-xl shadow-2xl border border-line"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending External Shared Genre Import Prompt */}
      {pendingImportGenre && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md bg-[#10121a] border border-line rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-accent/20 text-accent border border-accent/40">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-base text-text">
                  {t("maker_import_title")}
                </h3>
                <p className="text-xs text-text-sub">
                  {t("maker_import_desc")}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-panel2 border border-line space-y-1.5">
              <h4 className="font-extrabold text-sm text-accent">
                {pendingImportGenre.name}
              </h4>
              <p className="text-xs text-text-dim">
                {pendingImportGenre.category} • {pendingImportGenre.default_bpm} BPM • {pendingImportGenre.time_signature}
              </p>
              {pendingImportGenre.authorName && (
                <p className="text-[11px] text-text-sub">
                  {t("maker_author")}: {pendingImportGenre.authorName}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setPendingImportGenre(null)}
                className="px-4 py-2 rounded-xl text-text-sub hover:text-text hover:bg-panel2 font-medium text-xs transition-colors"
              >
                {t("maker_import_cancel")}
              </button>
              <button
                onClick={handleConfirmImport}
                className="px-5 py-2 rounded-xl bg-accent hover:bg-amber-400 text-black font-bold text-xs transition-colors shadow-lg shadow-accent/20"
              >
                {t("maker_import_confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Destructive-action confirmation dialog (no native confirm prompt) */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title={t("maker_delete")}
        description={t("maker_delete_confirm")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        tone="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
