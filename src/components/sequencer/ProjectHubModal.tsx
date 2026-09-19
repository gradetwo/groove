import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  X,
  Plus,
  Save,
  Upload,
  Download,
  Copy,
  Trash2,
  Edit3,
  Star,
  Search,
  Check,
  FolderKanban,
  FileDown,
  AlertCircle,
  Tag,
  ArrowUpDown,
  Sparkles,
  QrCode,
} from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import QRCode from "qrcode";
import { getShareUrlResult, toSharedTrack } from "../../audio/SequencerUrlShare";
import { GrooveProject, ProjectSortField, ProjectSortOrder } from "../../types/project";
import { Genre, SequencerPattern } from "../../types/genre";
import { EffectsRackState, DrumKitType } from "../../audio/AudioEngine";
import {
  getAllProjects,
  saveProject,
  deleteProject,
  duplicateProject,
  renameProject,
  toggleProjectFavorite,
  updateProjectTags,
  createBlankProject,
  exportProjectToGrooveFile,
  importGrooveFile,
  getActiveProjectId,
  setActiveProjectId,
  migrateLegacyLocalStorage,
} from "../../features/sequencer/projectDb";

export interface ProjectHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentGenre: Genre;
  currentPatterns: { A: SequencerPattern; B: SequencerPattern };
  activeSlot: "A" | "B";
  bpm: number;
  swing: number;
  timeSignature: string;
  resolution: "1/8" | "1/16" | "1/32";
  stepCount: number;
  songMode: boolean;
  songChain: ("A" | "B")[];
  loopRange: [number, number] | null;
  effectsRackState: EffectsRackState;
  drumKit: DrumKitType;
  isMetronome: boolean;
  isCountIn: boolean;
  onLoadProject: (project: GrooveProject) => void;
  onToast: (msg: string) => void;
}

/** F-07: storage errors are now surfaced to the user instead of being swallowed. */
function storageErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const ProjectHubModal: React.FC<ProjectHubModalProps> = ({
  isOpen,
  onClose,
  currentGenre,
  currentPatterns,
  activeSlot,
  bpm,
  swing,
  timeSignature,
  resolution,
  stepCount,
  songMode,
  songChain,
  loopRange,
  effectsRackState,
  drumKit,
  isMetronome,
  isCountIn,
  onLoadProject,
  onToast,
}) => {
  const { t, isZh } = useLanguage();
  const [projects, setProjects] = useState<GrooveProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [sortField, setSortField] = useState<ProjectSortField>("updatedAt");
  const [sortOrder, setSortOrder] = useState<ProjectSortOrder>("desc");
  const [activeId, setActiveId] = useState<string | null>(getActiveProjectId);

  // Sub-dialogs state
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsTitle, setSaveAsTitle] = useState("");
  const [renameTarget, setRenameTarget] = useState<GrooveProject | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<GrooveProject | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  // N-05: share a project as a deep link + QR (encoded through the sequencer share codec).
  const [shareTarget, setShareTarget] = useState<GrooveProject | null>(null);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [shareDegraded, setShareDegraded] = useState(false);
  const [shareQr, setShareQr] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reloadProjects = useCallback(async () => {
    try {
      setLoading(true);
      await migrateLegacyLocalStorage();
      const list = await getAllProjects(sortField, sortOrder);
      setProjects(list);
      setActiveId(getActiveProjectId());
    } catch (err) {
      console.error("[ProjectHubModal] Error loading projects:", err);
    } finally {
      setLoading(false);
    }
  }, [sortField, sortOrder]);

  useEffect(() => {
    if (isOpen) {
      reloadProjects();
    }
  }, [isOpen, reloadProjects]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (deleteTarget) setDeleteTarget(null);
        else if (renameTarget) setRenameTarget(null);
        else if (saveAsOpen) setSaveAsOpen(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, deleteTarget, renameTarget, saveAsOpen, onClose]);

  // Gather unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    projects.forEach((p) => {
      if (Array.isArray(p.tags)) {
        p.tags.forEach((tag) => set.add(tag));
      }
    });
    return Array.from(set);
  }, [projects]);

  // Filter projects by query and tag
  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((p) => {
      // Tag filter
      if (selectedTag === "favorites" && !p.isFavorite) return false;
      if (selectedTag !== "all" && selectedTag !== "favorites" && (!p.tags || !p.tags.includes(selectedTag))) {
        return false;
      }

      // Search query filter
      if (!q) return true;
      const titleMatch = (p.name || "").toLowerCase().includes(q);
      const genreMatch = (p.genreName || "").toLowerCase().includes(q);
      const tagMatch = p.tags?.some((t) => t.toLowerCase().includes(q));
      return titleMatch || genreMatch || tagMatch;
    });
  }, [projects, searchQuery, selectedTag]);

  // Create new blank project
  const handleCreateNew = async () => {
    const newProj = createBlankProject(currentGenre, undefined, drumKit);
    try {
      await saveProject(newProj);
    } catch (err) {
      onToast(t("project_hub_create_failed", { error: storageErrorMessage(err) }));
      return;
    }
    setActiveProjectId(newProj.id);
    setActiveId(newProj.id);
    onLoadProject(newProj);
    await reloadProjects();
    onToast(t("project_hub_created", { name: newProj.name }));
    onClose();
  };

  // Save current studio session as new project
  const handleSaveCurrentAs = async () => {
    const name = saveAsTitle.trim() || `${currentGenre.name} Session`;
    const newProj = createBlankProject(currentGenre, name, drumKit);
    newProj.bpm = bpm;
    newProj.swing = swing;
    newProj.timeSignature = timeSignature;
    newProj.resolution = resolution;
    newProj.stepCount = stepCount;
    newProj.patterns = {
      A: currentPatterns.A,
      B: currentPatterns.B,
    };
    newProj.activeSlot = activeSlot;
    newProj.songMode = songMode;
    newProj.songChain = songChain;
    newProj.loopRange = loopRange;
    newProj.effectsRack = { ...effectsRackState };
    newProj.isMetronome = isMetronome;
    newProj.isCountIn = isCountIn;
    newProj.tags = [currentGenre.name, "Custom"];

    try {
      await saveProject(newProj);
    } catch (err) {
      onToast(t("project_hub_save_as_failed", { error: storageErrorMessage(err) }));
      return;
    }
    setActiveProjectId(newProj.id);
    setActiveId(newProj.id);
    setSaveAsOpen(false);
    setSaveAsTitle("");
    await reloadProjects();
    onToast(t("project_hub_saved_as", { name: newProj.name }));
  };

  // Load project
  const handleLoad = async (project: GrooveProject) => {
    setActiveProjectId(project.id);
    setActiveId(project.id);
    onLoadProject(project);
    onToast(t("project_hub_loaded", { name: project.name }));
    onClose();
  };

  // Duplicate project
  const handleDuplicate = async (project: GrooveProject) => {
    try {
      const copy = await duplicateProject(project.id);
      await reloadProjects();
      onToast(t("project_hub_duplicated", { name: copy.name }));
    } catch (err) {
      onToast(t("project_hub_duplicate_failed", { error: storageErrorMessage(err) }));
    }
  };

  // Toggle favorite
  const handleToggleFavorite = async (project: GrooveProject) => {
    try {
      await toggleProjectFavorite(project.id);
      await reloadProjects();
    } catch (err) {
      onToast(t("project_hub_favorite_failed", { error: storageErrorMessage(err) }));
    }
  };

  // Confirm rename
  const handleConfirmRename = async () => {
    if (!renameTarget) return;
    const title = renameTitle.trim();
    if (title && title !== renameTarget.name) {
      try {
        await renameProject(renameTarget.id, title);
        onToast(t("project_hub_renamed", { name: title }));
        await reloadProjects();
      } catch (err) {
        onToast(t("project_hub_rename_failed", { error: storageErrorMessage(err) }));
        return;
      }
    }
    setRenameTarget(null);
    setRenameTitle("");
  };

  // Confirm delete
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const name = deleteTarget.name;
    try {
      await deleteProject(deleteTarget.id);
    } catch (err) {
      onToast(t("project_hub_delete_failed", { error: storageErrorMessage(err) }));
      return;
    }
    setDeleteTarget(null);
    await reloadProjects();
    onToast(t("project_hub_deleted", { name: name }));
  };

  /**
   * N-05: builds a deep link for a project and renders it as a QR code so it can be
   * opened on a phone by scanning. The payload goes through the sequencer share codec,
   * which caps URL size — when a project is too large we say so instead of producing a
   * link the decoder would refuse.
   */
  const handleShare = useCallback(
    async (project: GrooveProject) => {
      setShareTarget(project);
      setShareUrl("");
      setShareQr("");
      setShareDegraded(false);

      const pattern = project.activeSlot === "B" ? project.patterns.B : project.patterns.A;
      const result = getShareUrlResult({
        genreId: project.genreId,
        bpm: project.bpm,
        swing: project.swing,
        scale: pattern.scale,
        timeSignature: project.timeSignature,
        resolution: project.resolution,
        totalSteps: project.stepCount,
        tracks: pattern.tracks.map(toSharedTrack),
      });

      setShareUrl(result.url);
      setShareDegraded(result.degraded);
      if (!result.url) return;

      try {
        const dataUrl = await QRCode.toDataURL(result.url, {
          errorCorrectionLevel: "L",
          margin: 1,
          width: 240,
          color: { dark: "#0a0b0d", light: "#e9e7e0" },
        });
        setShareQr(dataUrl);
      } catch {
        // QR is a convenience; the copyable link below still works.
        setShareQr("");
      }
    },
    []
  );

  // Export .groove file
  const handleExport = (project: GrooveProject) => {
    exportProjectToGrooveFile(project);
    onToast(t("project_hub_exported", { name: project.name }));
  };

  // File import
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importGrooveFile(file);
      await reloadProjects();
      onToast(t("project_hub_imported", { name: imported.name }));
    } catch (err: any) {
      onToast(t("project_hub_import_failed", { reason: err?.message || t("project_hub_import_invalid_file") }));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    try {
      const imported = await importGrooveFile(file);
      await reloadProjects();
      onToast(t("project_hub_imported", { name: imported.name }));
    } catch (err: any) {
      onToast(t("project_hub_import_failed", { reason: err?.message || t("project_hub_import_invalid_file") }));
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-hub-title"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 bg-[#0d1117]/90 border-4 border-dashed border-accent flex flex-col items-center justify-center pointer-events-none">
          <Upload className="w-16 h-16 text-accent animate-bounce mb-3" />
          <p className="text-xl font-bold text-text font-['JetBrains_Mono']">
            {t("project_hub_drop_hint")}
          </p>
        </div>
      )}

      {/* Main Modal Container */}
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-[#0c0d12] border border-line-strong rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden text-text">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-line/60 bg-[#11131a]/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent/20 to-[#38bdf8]/20 border border-accent/40 flex items-center justify-center text-accent shrink-0 shadow-[0_0_15px_rgba(69,224,201,0.2)]">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="project-hub-title" className="text-base sm:text-lg font-bold font-['JetBrains_Mono'] text-text tracking-wide">
                  {t("project_hub_title")}
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-accent/15 border border-accent/40 text-accent">
                  IndexedDB Core
                </span>
              </div>
              <p className="text-xs text-text-dim mt-0.5 hidden sm:block">
                {t("project_hub_sub")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 text-text-sub hover:text-text hover:bg-line rounded-lg transition-colors"
              title="Close (Esc)"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Project Actions Bar */}
        <div className="p-3 sm:p-4 bg-[#0e1017] border-b border-line/40 flex flex-wrap items-center justify-between gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px] sm:max-w-xs">
            <Search className="w-4 h-4 text-text-dim absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("project_search_placeholder")}
              className="w-full bg-[#141722] border border-line text-xs font-['JetBrains_Mono'] text-text rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-accent transition-colors placeholder:text-text-dim/60"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim hover:text-text text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* New Blank Project */}
            <button
              onClick={handleCreateNew}
              className="h-8 sm:h-9 px-3 rounded-xl bg-accent hover:bg-accent/90 text-black font-bold text-xs font-['JetBrains_Mono'] flex items-center gap-1.5 shadow-[0_0_12px_rgba(69,224,201,0.3)] transition-all shrink-0"
              title={t("project_new")}
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>{t("project_new")}</span>
            </button>

            {/* Save As New Project */}
            <button
              onClick={() => {
                setSaveAsTitle(`${currentGenre.name} Session`);
                setSaveAsOpen(true);
              }}
              className="h-8 sm:h-9 px-3 rounded-xl bg-[#1a1e2a] hover:bg-[#232838] border border-line-strong text-text font-medium text-xs font-['JetBrains_Mono'] flex items-center gap-1.5 transition-colors shrink-0"
              title={t("project_save_as")}
            >
              <Save className="w-3.5 h-3.5 text-accent" />
              <span>{t("project_save_as")}</span>
            </button>

            {/* Import .groove */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-8 sm:h-9 px-3 rounded-xl bg-[#1a1e2a] hover:bg-[#232838] border border-line-strong text-text-sub hover:text-text text-xs font-['JetBrains_Mono'] flex items-center gap-1.5 transition-colors shrink-0"
              title={t("project_import_groove")}
            >
              <Upload className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span className="hidden sm:inline">{t("project_import_groove")}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".groove,.json"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {/* Sort Selector */}
            <div className="flex items-center h-8 sm:h-9 bg-[#141722] border border-line rounded-xl px-2 text-xs text-text-sub font-['JetBrains_Mono']">
              <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 text-text-dim" />
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as ProjectSortField)}
                className="bg-transparent text-text focus:outline-none cursor-pointer text-xs"
                aria-label="Sort projects"
              >
                <option value="updatedAt" className="bg-panel text-text">{t("project_sort_updated")}</option>
                <option value="name" className="bg-panel text-text">{t("project_sort_name")}</option>
                <option value="bpm" className="bg-panel text-text">{t("project_sort_bpm")}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tag Filter Pills */}
        <div className="px-4 sm:px-6 py-2.5 bg-[#090a0f] border-b border-line/30 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none text-xs">
          <span className="text-[10px] text-text-dim font-['JetBrains_Mono'] uppercase tracking-wider mr-1">
            {t("project_hub_filter_label")}
          </span>
          <button
            onClick={() => setSelectedTag("all")}
            className={`px-2.5 py-1 rounded-lg font-['JetBrains_Mono'] text-xs transition-colors ${
              selectedTag === "all"
                ? "bg-accent text-black font-bold"
                : "bg-panel2 text-text-sub hover:text-text border border-line"
            }`}
          >
            {t("project_filter_all")}
          </button>
          <button
            onClick={() => setSelectedTag("favorites")}
            className={`px-2.5 py-1 rounded-lg font-['JetBrains_Mono'] text-xs flex items-center gap-1 transition-colors ${
              selectedTag === "favorites"
                ? "bg-[#fbbf24] text-black font-bold"
                : "bg-panel2 text-text-sub hover:text-[#fbbf24] border border-line"
            }`}
          >
            <Star className="w-3 h-3 fill-current" />
            <span>{t("project_filter_favorites")}</span>
          </button>

          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-2.5 py-1 rounded-lg font-['JetBrains_Mono'] text-xs transition-colors ${
                selectedTag === tag
                  ? "bg-[#38bdf8] text-black font-bold"
                  : "bg-panel2 text-text-sub hover:text-text border border-line"
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>

        {/* Projects Cards Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#08090d]">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-text-dim">
              <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              <span className="text-xs font-['JetBrains_Mono']">
                {t("project_hub_loading")}
              </span>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-line/60 rounded-2xl bg-[#0e1017]/40">
              <FolderKanban className="w-12 h-12 text-text-dim/40 mb-3" />
              <h3 className="text-sm font-bold text-text font-['JetBrains_Mono']">
                {t("project_empty")}
              </h3>
              <p className="text-xs text-text-dim max-w-md mt-1 mb-4">
                {t("project_empty_desc")}
              </p>
              <button
                onClick={handleCreateNew}
                className="px-4 py-2 rounded-xl bg-accent text-black font-bold text-xs font-['JetBrains_Mono'] hover:bg-accent/90"
              >
                {t("project_new")}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredProjects.map((project) => {
                const isActive = project.id === activeId;
                const formattedDate = new Date(project.updatedAt).toLocaleString(isZh ? "zh-CN" : "en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div
                    key={project.id}
                    className={`group relative rounded-xl p-4 border transition-all flex flex-col justify-between ${
                      isActive
                        ? "bg-[#11161d] border-accent/80 shadow-[0_0_20px_rgba(69,224,201,0.15)]"
                        : "bg-[#10121a] hover:bg-[#141722] border-line/80 hover:border-line-strong"
                    }`}
                  >
                    {/* Top Row: Title, Favorite Star, Active Badge */}
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4
                              className="text-sm font-bold font-['JetBrains_Mono'] text-text truncate group-hover:text-accent transition-colors"
                              title={project.name}
                            >
                              {project.name}
                            </h4>
                            <button
                              onClick={() => {
                                setRenameTarget(project);
                                setRenameTitle(project.name);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-text-dim hover:text-text rounded transition-opacity"
                              title={t("project_rename")}
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="text-[10px] font-medium font-['JetBrains_Mono'] px-2 py-0.5 rounded-md bg-[#191e2b] text-[#38bdf8] border border-[#38bdf8]/30">
                              {project.genreName}
                            </span>
                            {isActive && (
                              <span className="text-[9px] font-bold font-['JetBrains_Mono'] px-1.5 py-0.5 rounded bg-accent text-black uppercase tracking-wider flex items-center gap-1 shadow-[0_0_8px_rgba(69,224,201,0.4)]">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                                {t("project_active_badge")}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Favorite Star Toggle */}
                        <button
                          onClick={() => handleToggleFavorite(project)}
                          className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                            project.isFavorite
                              ? "text-[#fbbf24] hover:text-[#fbbf24]/80"
                              : "text-text-dim hover:text-text hover:bg-line/40"
                          }`}
                          title={project.isFavorite ? "Remove favorite" : "Mark as favorite"}
                        >
                          <Star className={`w-4 h-4 ${project.isFavorite ? "fill-current" : ""}`} />
                        </button>
                      </div>

                      {/* Middle Row: Metrics / Snapshot Details */}
                      <div className="grid grid-cols-3 gap-1.5 py-2.5 my-2 border-y border-line/40 text-[10px] font-['JetBrains_Mono'] text-text-sub">
                        <div className="bg-[#151824]/60 px-2 py-1 rounded-md">
                          <span className="text-text-dim block text-[9px] uppercase">BPM</span>
                          <span className="font-bold text-text">{project.bpm}</span>
                        </div>
                        <div className="bg-[#151824]/60 px-2 py-1 rounded-md">
                          <span className="text-text-dim block text-[9px] uppercase">{t("project_hub_steps_label")}</span>
                          <span className="font-bold text-text">{project.stepCount} ({project.timeSignature})</span>
                        </div>
                        <div className="bg-[#151824]/60 px-2 py-1 rounded-md">
                          <span className="text-text-dim block text-[9px] uppercase">{t("project_hub_kit_label")}</span>
                          <span className="font-bold text-accent uppercase">{project.drumKit || "808"}</span>
                        </div>
                      </div>

                      {/* Tags row */}
                      {project.tags && project.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {project.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] font-['JetBrains_Mono'] px-1.5 py-0.5 rounded bg-line/40 text-text-dim"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bottom Row: Timestamp and Action Buttons */}
                    <div>
                      <div className="text-[10px] font-['JetBrains_Mono'] text-text-dim mb-2.5 flex items-center justify-between">
                        <span>{formattedDate}</span>
                        {project.snapshotSummary && (
                          <span className="text-text-dim/80">
                            {project.snapshotSummary.activeSteps} {t("project_hub_hits")}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 pt-2 border-t border-line/30">
                        {/* Primary Load Button */}
                        <button
                          onClick={() => handleLoad(project)}
                          className={`flex-1 h-7 rounded-lg text-xs font-bold font-['JetBrains_Mono'] flex items-center justify-center gap-1 transition-all ${
                            isActive
                              ? "bg-accent/15 text-accent border border-accent/40"
                              : "bg-accent hover:bg-accent/90 text-black shadow-[0_0_10px_rgba(69,224,201,0.2)]"
                          }`}
                        >
                          {isActive ? (
                            <>
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>{t("project_hub_in_use")}</span>
                            </>
                          ) : (
                            <span>{t("project_load")}</span>
                          )}
                        </button>

                        {/* Duplicate */}
                        <button
                          onClick={() => handleDuplicate(project)}
                          className="h-7 w-7 rounded-lg bg-panel2 hover:bg-line border border-line text-text-sub hover:text-text flex items-center justify-center transition-colors"
                          title={t("project_duplicate")}
                        >
                          <Copy className="w-3 h-3" />
                        </button>

                        {/* Share link + QR (N-05) */}
                        <button
                          onClick={() => void handleShare(project)}
                          className="h-7 w-7 rounded-lg bg-panel2 hover:bg-line border border-line text-text-sub hover:text-accent flex items-center justify-center transition-colors"
                          title={t("project_hub_share")}
                        >
                          <QrCode className="w-3 h-3" />
                        </button>

                        {/* Export .groove */}
                        <button
                          onClick={() => handleExport(project)}
                          className="h-7 w-7 rounded-lg bg-panel2 hover:bg-line border border-line text-text-sub hover:text-accent flex items-center justify-center transition-colors"
                          title={t("project_export_groove")}
                        >
                          <Download className="w-3 h-3" />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => setDeleteTarget(project)}
                          className="h-7 w-7 rounded-lg bg-panel2 hover:bg-[#2a1315] border border-line hover:border-[#ff5964]/40 text-text-sub hover:text-[#ff5964] flex items-center justify-center transition-colors"
                          title={t("project_delete")}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-2.5 bg-[#0a0c12] border-t border-line/40 flex items-center justify-between text-xs text-text-dim font-['JetBrains_Mono']">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span>
              {t("project_hub_storage_hint", { count: projects.length })}
            </span>
          </div>

          <div className="hidden sm:block text-[11px] text-text-dim/80">
            {t("project_hub_esc_hint")}
          </div>
        </div>
      </div>

      {/* Sub-Dialog: Save As New Project */}
      {saveAsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-[#121520] border border-line-strong rounded-2xl p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold font-['JetBrains_Mono'] text-text">
              {t("project_save_as_modal_title")}
            </h3>
            <input
              type="text"
              value={saveAsTitle}
              onChange={(e) => setSaveAsTitle(e.target.value)}
              placeholder={t("project_save_as_input_placeholder")}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveCurrentAs();
                if (e.key === "Escape") setSaveAsOpen(false);
              }}
              className="w-full bg-[#181d2a] border border-line text-sm font-['JetBrains_Mono'] text-text rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-accent"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSaveAsOpen(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-['JetBrains_Mono'] text-text-sub hover:text-text hover:bg-line"
              >
                {t("project_hub_cancel")}
              </button>
              <button
                onClick={handleSaveCurrentAs}
                className="px-4 py-1.5 rounded-lg text-xs font-bold font-['JetBrains_Mono'] bg-accent text-black hover:bg-accent/90"
              >
                {t("project_hub_confirm_save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Dialog: Rename Project */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-[#121520] border border-line-strong rounded-2xl p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold font-['JetBrains_Mono'] text-text">
              {t("project_rename_modal_title")}
            </h3>
            <input
              type="text"
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirmRename();
                if (e.key === "Escape") setRenameTarget(null);
              }}
              className="w-full bg-[#181d2a] border border-line text-sm font-['JetBrains_Mono'] text-text rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-accent"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRenameTarget(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-['JetBrains_Mono'] text-text-sub hover:text-text hover:bg-line"
              >
                {t("project_hub_cancel")}
              </button>
              <button
                onClick={handleConfirmRename}
                className="px-4 py-1.5 rounded-lg text-xs font-bold font-['JetBrains_Mono'] bg-accent text-black hover:bg-accent/90"
              >
                {t("project_hub_confirm_rename")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Dialog: Delete Confirmation */}
      {shareTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-[#12141a] border border-line rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-accent">
              <QrCode className="w-5 h-5 shrink-0" />
              <h3 className="text-base font-bold font-['JetBrains_Mono'] text-text">
                {t("project_hub_share")}
              </h3>
            </div>
            <p className="text-xs font-['JetBrains_Mono'] text-text-sub leading-relaxed">
              {shareTarget.name}
            </p>

            {shareUrl ? (
              <>
                {shareQr && (
                  <img
                    src={shareQr}
                    alt={t("project_hub_share_qr_alt")}
                    className="mx-auto h-48 w-48 rounded-xl border border-line bg-[#e9e7e0] p-1"
                  />
                )}
                <input
                  readOnly
                  value={shareUrl}
                  aria-label={t("project_hub_share_link")}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-lg border border-line bg-panel2 px-3 py-2 font-['JetBrains_Mono'] text-[10px] text-text-sub"
                />
                {shareDegraded && (
                  <p className="text-[10px] font-['JetBrains_Mono'] text-amber-400">
                    {t("project_hub_share_degraded")}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShareTarget(null)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-['JetBrains_Mono'] text-text-sub hover:text-text hover:bg-line"
                  >
                    {t("project_hub_close")}
                  </button>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(shareUrl);
                      onToast(isZh ? "链接已复制 ✓" : "Link copied ✓");
                    }}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold font-['JetBrains_Mono'] bg-accent text-black hover:bg-accent/90"
                  >
                    {t("project_hub_copy_link")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs font-['JetBrains_Mono'] text-amber-400 leading-relaxed">
                  {t("project_hub_share_too_large")}
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShareTarget(null)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-['JetBrains_Mono'] text-text-sub hover:text-text hover:bg-line"
                  >
                    {t("project_hub_close")}
                  </button>
                  <button
                    onClick={() => {
                      const target = shareTarget;
                      setShareTarget(null);
                      if (target) handleExport(target);
                    }}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold font-['JetBrains_Mono'] bg-accent text-black hover:bg-accent/90"
                  >
                    {t("project_export_groove")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-[#141014] border border-[#ff5964]/40 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-[#ff5964]">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="text-base font-bold font-['JetBrains_Mono'] text-text">
                {t("project_delete")}
              </h3>
            </div>
            <p className="text-xs font-['JetBrains_Mono'] text-text-sub leading-relaxed">
              {t("project_hub_delete_confirm", { name: deleteTarget.name })}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-['JetBrains_Mono'] text-text-sub hover:text-text hover:bg-line"
              >
                {t("project_hub_cancel")}
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 rounded-lg text-xs font-bold font-['JetBrains_Mono'] bg-[#ff5964] text-black hover:bg-[#ff5964]/90"
              >
                {t("project_hub_confirm_delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
