import React, { memo, useState, useRef, useEffect } from "react";
import {
  Play,
  Download,
  Share2,
  Sliders,
  PanelLeftOpen,
  Maximize2,
  Minimize2,
  Sparkles,
  Undo2,
  Redo2,
  SlidersHorizontal,
  ChevronDown,
  Bell,
  Eye,
  EyeOff,
  Repeat,
  Copy,
  Upload,
  Keyboard,
  FileAudio,
  Package,
  Loader2,
  Disc3,
  Activity,
  Layers,
  FolderKanban,
  Wand2,
  AudioLines,
} from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { DrumKitType, EffectsRackState } from "../../audio/AudioEngine";
import { CustomKickPreset, loadCustomKickPresets } from "../../audio/AnatomyKickEngine";
import { triggerHaptic, HapticPatterns, getHapticSettings, setHapticEnabled, setHapticIntensity } from "../../utils/haptics";

export type MobileEditMode = "step" | "accent" | "ratchet" | "pitch" | "plocks";

export interface ToolbarProps {
  isPlaying: boolean;
  bpm: number;
  swing: number;
  timeSignature: string;
  resolution: "1/8" | "1/16" | "1/32";
  stepCount: number;
  barCount: number;
  viewedBar: number;
  mobileEditMode: MobileEditMode;
  showAdvancedControls: boolean;
  isVelocityLaneOpen: boolean;
  isSidebarCollapsed: boolean;
  isEditorMaximized: boolean;
  canUndo: boolean;
  canRedo: boolean;
  genreName: string;
  genreAccent: string;
  isZh: boolean;
  stepsPerBar: number;
  groupSize: number;
  activeSlot?: "A" | "B";
  songMode?: boolean;
  blindCompare?: boolean;
  isMetronome?: boolean;
  isCountIn?: boolean;
  onTogglePlay: () => void;
  onChangeBpm: (bpm: number) => void;
  onChangeSwing: (swing: number) => void;
  onChangeTimeSignature: (sig: string) => void;
  onChangeResolution: (res: "1/8" | "1/16" | "1/32") => void;
  onChangeStepCount: (count: number) => void;
  onChangeMobileEditMode: (mode: MobileEditMode) => void;
  onSelectBar: (barIdx: number) => void;
  onToggleVelocityLane: () => void;
  onOpenEuclidean: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleMaximize: () => void;
  onToggleSidebar: () => void;
  onToggleAdvancedControls: () => void;
  onQuickAction: (action: "dup_bar1" | "humanize" | "clear_all" | "reset_preset" | "clear_saved" | "open_hub") => void;
  onExportMidi: () => void;
  onExportAls?: () => void;
  onExportGroove?: () => void;
  onExportWav?: () => void;
  onExportStems?: () => void;
  activeProjectName?: string;
  onOpenProjectHub?: () => void;
  onOpenGenreMaker?: () => void;
  isExportingAudio?: boolean;
  onImportMidi?: (file: File) => void;
  onInspireMe?: () => void;
  isKeyboardMode?: boolean;
  onToggleKeyboardMode?: () => void;
  midiDeviceCount?: number;
  onShare: () => void;
  onAddSteps: (count: number) => void;
  onRemoveSteps: (count: number) => void;
  onScrollByPixels: (delta: number) => void;
  onSwitchSlot?: (slot: "A" | "B") => void;
  onCopySlot?: (from: "A" | "B", to: "A" | "B") => void;
  onToggleSongMode?: () => void;
  onToggleBlindCompare?: () => void;
  onToggleMetronome?: () => void;
  onToggleCountIn?: () => void;
  onTapTempo?: () => void;
  drumKit?: DrumKitType;
  onChangeDrumKit?: (kit: DrumKitType) => void;
  isRecordArmed?: boolean;
  onToggleRecordArmed?: () => void;
  effectsRackState?: EffectsRackState;
  onChangeEffectsRack?: (state: Partial<EffectsRackState>) => void;
  isDrumsOnly?: boolean;
  onToggleDrumsOnly?: () => void;
  isAnalyzerOpen?: boolean;
  onToggleAnalyzer?: () => void;
  /** Feature #2: float the mixing console over the studio. */
  isConsoleOpen?: boolean;
  onToggleConsole?: () => void;
}

interface MeterControlsProps {
  timeSignature: string;
  resolution: "1/8" | "1/16" | "1/32";
  stepCount: number;
  barCount: number;
  mobileEditMode: MobileEditMode;
  onChangeTimeSignature: (sig: string) => void;
  onChangeResolution: (res: "1/8" | "1/16" | "1/32") => void;
  onChangeStepCount: (count: number) => void;
  onChangeMobileEditMode: (mode: MobileEditMode) => void;
}

/**
 * A-03: metre / resolution / length / tool-mode are low-frequency controls.
 * Keeping them in a memo component means a transport tick (isPlaying, bpm,
 * viewedBar) no longer re-renders this whole block.
 */
const MeterControls = memo<MeterControlsProps>(function MeterControls({
  timeSignature,
  resolution,
  stepCount,
  barCount,
  mobileEditMode,
  onChangeTimeSignature,
  onChangeResolution,
  onChangeStepCount,
  onChangeMobileEditMode,
}) {
  const { t } = useLanguage();

  return (
    <>
      {/* Meter Select Dropdown */}
      <div className="flex items-center h-8 bg-panel2 hover:bg-[#14151a] border border-line hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
        <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-1 select-none">
          {t("toolbar_meter_label")}
        </span>
        <select
          value={timeSignature}
          onChange={(e) => onChangeTimeSignature(e.target.value)}
          className="bg-transparent text-text font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
          aria-label={t("toolbar_meter_aria")}
        >
          <option value="4/4" className="bg-panel text-text">4/4 {t("toolbar_meter_44")}</option>
          <option value="2/4" className="bg-panel text-text">2/4 {t("toolbar_meter_24")}</option>
          <option value="3/4" className="bg-panel text-text">3/4 {t("toolbar_meter_34")}</option>
          <option value="2/2" className="bg-panel text-text">2/2 {t("toolbar_meter_22")}</option>
          <option value="6/8" className="bg-panel text-text">6/8 {t("toolbar_meter_68")}</option>
          <option value="3/8" className="bg-panel text-text">3/8 {t("toolbar_meter_38")}</option>
          <option value="9/8" className="bg-panel text-text">9/8 {t("toolbar_meter_98")}</option>
          <option value="12/8" className="bg-panel text-text">12/8 {t("toolbar_meter_128")}</option>
          <option value="5/4" className="bg-panel text-text">5/4 {t("toolbar_meter_54")}</option>
          <option value="7/8" className="bg-panel text-text">7/8 {t("toolbar_meter_78")}</option>
        </select>
      </div>

      {/* Quantize Resolution Select Dropdown */}
      <div className="flex items-center h-8 bg-panel2 hover:bg-[#14151a] border border-line hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
        <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-1 select-none">
          {t("toolbar_grid_label")}
        </span>
        <select
          value={resolution}
          onChange={(e) => onChangeResolution(e.target.value as "1/8" | "1/16" | "1/32")}
          className="bg-transparent text-text font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
          aria-label={t("toolbar_grid_aria")}
        >
          <option value="1/16" className="bg-panel text-text">1/16 {t("toolbar_grid_116")}</option>
          <option value="1/8" className="bg-panel text-text">1/8 {t("toolbar_grid_18")}</option>
          <option value="1/32" className="bg-panel text-text">1/32 {t("toolbar_grid_132")}</option>
        </select>
      </div>

      {/* Step Length Select Dropdown */}
      <div className="flex items-center h-8 bg-panel2 hover:bg-[#14151a] border border-line hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
        <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-1 select-none">
          {t("toolbar_length_label")}
        </span>
        <select
          value={stepCount}
          onChange={(e) => onChangeStepCount(Number(e.target.value))}
          className="bg-transparent text-text font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
          aria-label={t("toolbar_length_aria")}
        >
          <option value={16} className="bg-panel text-text">16 {t("toolbar_steps_1_bar")}</option>
          <option value={32} className="bg-panel text-text">32 {t("toolbar_steps_2_bars")}</option>
          <option value={48} className="bg-panel text-text">48 {t("toolbar_steps_3_bars")}</option>
          <option value={64} className="bg-panel text-text">64 {t("toolbar_steps_4_bars")}</option>
          {![16, 32, 48, 64].includes(stepCount) && (
            <option value={stepCount} className="bg-panel text-text">
              {stepCount} {t("toolbar_steps_n_bars", { count: barCount })}
            </option>
          )}
        </select>
      </div>

      {/* Tool Mode Select Dropdown */}
      <div
        className="flex items-center h-8 bg-panel2 hover:bg-[#14151a] border border-line hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0"
        title={
          mobileEditMode === "step"
            ? (t("toolbar_tool_step_tip"))
            : mobileEditMode === "accent"
            ? (t("toolbar_tool_accent_tip"))
            : mobileEditMode === "ratchet"
            ? (t("toolbar_tool_ratchet_tip"))
            : mobileEditMode === "pitch"
            ? (t("toolbar_tool_pitch_tip"))
            : (t("toolbar_tool_plocks_tip"))
        }
      >
        <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-1 select-none">
          {t("toolbar_tool_label")}
        </span>
        <select
          value={mobileEditMode}
          onChange={(e) => onChangeMobileEditMode(e.target.value as MobileEditMode)}
          className="bg-transparent text-text font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
          aria-label={t("toolbar_tool_aria")}
        >
          <option value="step" className="bg-panel text-text">● {t("toolbar_tool_step")}</option>
          <option value="accent" className="bg-panel text-text">▲ {t("toolbar_tool_accent")}</option>
          <option value="ratchet" className="bg-panel text-text">⫸ {t("toolbar_tool_ratchet")}</option>
          <option value="pitch" className="bg-panel text-text">♩ {t("toolbar_tool_pitch")}</option>
          <option value="plocks" className="bg-panel text-text">⚙ {t("toolbar_tool_plocks")}</option>
        </select>
      </div>
    </>
  );
});

interface PatternSlotControlsProps {
  activeSlot: "A" | "B";
  songMode: boolean;
  blindCompare: boolean;
  onSwitchSlot?: (slot: "A" | "B") => void;
  onCopySlot?: (from: "A" | "B", to: "A" | "B") => void;
  onToggleSongMode?: () => void;
  onToggleBlindCompare?: () => void;
}

/**
 * A-03: pattern slots / song mode / blind compare only change on an explicit
 * user action, so they are sharded out of the transport re-render path.
 */
const PatternSlotControls = memo<PatternSlotControlsProps>(function PatternSlotControls({
  activeSlot,
  songMode,
  blindCompare,
  onSwitchSlot,
  onCopySlot,
  onToggleSongMode,
  onToggleBlindCompare,
}) {
  const { t } = useLanguage();

  return (
    <>
      {/* Pattern Slots Switcher (P3-02) */}
      {onSwitchSlot && (
        <div className="flex items-center bg-panel2 border border-line rounded-lg p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onSwitchSlot("A")}
            className={`h-7 px-2 rounded font-['JetBrains_Mono'] text-xs font-bold transition-all ${
              activeSlot === "A"
                ? "bg-accent text-[#0a0b0d] shadow-sm"
                : "text-text-sub hover:text-text"
            }`}
            title={t("toolbar_pattern_a_title")}
          >
            {blindCompare ? "?1" : "PTN A"}
          </button>
          <button
            type="button"
            onClick={() => onSwitchSlot("B")}
            className={`h-7 px-2 rounded font-['JetBrains_Mono'] text-xs font-bold transition-all ${
              activeSlot === "B"
                ? "bg-accent text-[#0a0b0d] shadow-sm"
                : "text-text-sub hover:text-text"
            }`}
            title={t("toolbar_pattern_b_title")}
          >
            {blindCompare ? "?2" : "PTN B"}
          </button>
          {onCopySlot && (
            <button
              type="button"
              onClick={() => onCopySlot(activeSlot === "A" ? "A" : "B", activeSlot === "A" ? "B" : "A")}
              className="h-7 px-1.5 text-text-sub hover:text-accent transition-colors ml-0.5"
              title={
                activeSlot === "A" ? t("toolbar_copy_a_to_b") : t("toolbar_copy_b_to_a")
              }
              aria-label="Copy pattern slot"
            >
              <Copy className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Song Mode Toggle (P3-02) */}
      {onToggleSongMode && (
        <button
          type="button"
          onClick={onToggleSongMode}
          className={`h-8 px-2 rounded-lg border flex items-center gap-1 text-xs transition-colors shrink-0 ${
            songMode
              ? "bg-[#a855f7]/20 border-[#a855f7] text-[#c084fc] font-bold shadow-[0_0_8px_rgba(168,85,247,0.3)]"
              : "bg-panel2 border-line hover:border-[#3a3e48] text-text-sub hover:text-text"
          }`}
          title={t("toolbar_song_mode_title")}
          aria-label="Song Mode"
        >
          <Repeat className="w-3.5 h-3.5" />
          <span className="hidden sm:inline font-['JetBrains_Mono']">SONG</span>
        </button>
      )}

      {/* Blind Compare Toggle (P3-02) */}
      {onToggleBlindCompare && (
        <button
          type="button"
          onClick={onToggleBlindCompare}
          className={`h-8 px-2 rounded-lg border flex items-center gap-1 text-xs transition-colors shrink-0 ${
            blindCompare
              ? "bg-[#ec4899]/20 border-[#ec4899] text-[#f472b6] font-bold shadow-[0_0_8px_rgba(236,72,153,0.3)]"
              : "bg-panel2 border-line hover:border-[#3a3e48] text-text-sub hover:text-text"
          }`}
          title={t("toolbar_blind_title")}
          aria-label="Blind Test Mode"
        >
          {blindCompare ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span className="hidden md:inline font-['JetBrains_Mono']">{t("toolbar_blind_label")}</span>
        </button>
      )}
    </>
  );
});

interface ExportMenuProps {
  isExportingAudio?: boolean;
  onExportMidi: () => void;
  onExportAls?: () => void;
  onExportGroove?: () => void;
  onExportWav?: () => void;
  onExportStems?: () => void;
}

/**
 * A-03: the export dropdown carries its own open state and outside-click listener,
 * so it is fully isolated from every other toolbar concern. Only a change to
 * `isExportingAudio` or to the export callbacks can re-render it.
 */
const ExportMenu = memo<ExportMenuProps>(function ExportMenu({
  isExportingAudio = false,
  onExportMidi,
  onExportAls,
  onExportGroove,
  onExportWav,
  onExportStems,
}) {
  const { t } = useLanguage();
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    window.addEventListener("pointerdown", handleClickOutside);
    return () => window.removeEventListener("pointerdown", handleClickOutside);
  }, [exportOpen]);

  return (
    <div className="relative shrink-0" ref={exportMenuRef}>
      <button
        onClick={() => setExportOpen((prev) => !prev)}
        disabled={isExportingAudio}
        className="h-8 px-2 sm:px-2.5 flex items-center gap-1 text-xs text-text-sub hover:text-text hover:border-[#3a3e48] border border-line rounded-lg transition-colors bg-panel2 shrink-0 font-['JetBrains_Mono'] disabled:opacity-50"
        title={t("export")}
        aria-haspopup="true"
        aria-expanded={exportOpen}
      >
        {isExportingAudio ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
        ) : (
          <Download className="w-3.5 h-3.5" />
        )}
        <span className="hidden lg:inline">{t("export")}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${exportOpen ? "rotate-180" : ""}`} />
      </button>

      {exportOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-52 py-1 bg-[#0f1118] border border-line-strong rounded-xl shadow-[0_16px_36px_rgba(0,0,0,0.9)] z-50 text-xs font-['JetBrains_Mono'] divide-y divide-line/40">
          <div className="p-1 space-y-0.5">
            <button
              onClick={() => {
                onExportMidi();
                setExportOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-left rounded-lg text-text-sub hover:text-text hover:bg-[#1a1d26] transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-accent shrink-0" />
              <div className="flex flex-col">
                <span className="font-medium text-text">{t("toolbar_export_midi")}</span>
                <span className="text-[10px] text-text-dim">.mid (8 轨完整伴奏)</span>
              </div>
            </button>

            <button
              onClick={() => {
                onExportAls?.();
                setExportOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-left rounded-lg text-text-sub hover:text-text hover:bg-[#1a1d26] transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-[#fbbf24] shrink-0" />
              <div className="flex flex-col">
                <span className="font-medium text-text">{t("toolbar_export_als")}</span>
                <span className="text-[10px] text-text-dim">.als (8 轨独立 MIDI Clip)</span>
              </div>
            </button>

            <button
              onClick={() => {
                onExportGroove?.();
                setExportOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-left rounded-lg text-text-sub hover:text-text hover:bg-[#1a1d26] transition-colors"
            >
              <FolderKanban className="w-3.5 h-3.5 text-accent shrink-0" />
              <div className="flex flex-col">
                <span className="font-medium text-text">{t("toolbar_export_groove")}</span>
                <span className="text-[10px] text-text-dim">.groove (离线全工程数据)</span>
              </div>
            </button>
          </div>

          <div className="p-1 space-y-0.5">
            <button
              onClick={() => {
                onExportWav?.();
                setExportOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-left rounded-lg text-text-sub hover:text-text hover:bg-[#1a1d26] transition-colors"
            >
              <FileAudio className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
              <div className="flex flex-col">
                <span className="font-medium text-text">{t("toolbar_export_wav")}</span>
                <span className="text-[10px] text-text-dim">16-bit 44.1kHz PCM (.wav)</span>
              </div>
            </button>

            <button
              onClick={() => {
                onExportStems?.();
                setExportOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-left rounded-lg text-text-sub hover:text-text hover:bg-[#1a1d26] transition-colors"
            >
              <Package className="w-3.5 h-3.5 text-[#a78bfa] shrink-0" />
              <div className="flex flex-col">
                <span className="font-medium text-text">{t("toolbar_export_stems")}</span>
                <span className="text-[10px] text-text-dim">8 轨独立 WAV 打包 (.zip)</span>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export const Toolbar = memo<ToolbarProps>(function Toolbar({
  isPlaying,
  bpm,
  swing,
  timeSignature,
  resolution,
  stepCount,
  barCount,
  viewedBar,
  mobileEditMode,
  showAdvancedControls,
  isVelocityLaneOpen,
  isSidebarCollapsed,
  isEditorMaximized,
  canUndo,
  canRedo,
  genreName,
  isZh,
  stepsPerBar,
  groupSize,
  activeSlot = "A",
  songMode = false,
  blindCompare = false,
  isMetronome = false,
  isCountIn = false,
  drumKit = "808",
  onChangeDrumKit,
  isDrumsOnly = false,
  onToggleDrumsOnly,
  isAnalyzerOpen = false,
  onToggleAnalyzer,
  isConsoleOpen = false,
  onToggleConsole,
  isRecordArmed = false,
  onToggleRecordArmed,
  effectsRackState,
  onChangeEffectsRack,
  onTogglePlay,
  onChangeBpm,
  onChangeSwing,
  onChangeTimeSignature,
  onChangeResolution,
  onChangeStepCount,
  onChangeMobileEditMode,
  onSelectBar,
  onToggleVelocityLane,
  onOpenEuclidean,
  onUndo,
  onRedo,
  onToggleMaximize,
  onToggleSidebar,
  onToggleAdvancedControls,
  onQuickAction,
  onExportMidi,
  onExportAls,
  onExportGroove,
  onExportWav,
  onExportStems,
  activeProjectName,
  onOpenProjectHub,
  onOpenGenreMaker,
  isExportingAudio = false,
  onImportMidi,
  onInspireMe,
  isKeyboardMode = false,
  onToggleKeyboardMode,
  midiDeviceCount = 0,
  onShare,
  onAddSteps,
  onRemoveSteps,
  onScrollByPixels,
  onSwitchSlot,
  onCopySlot,
  onToggleSongMode,
  onToggleBlindCompare,
  onToggleMetronome,
  onToggleCountIn,
  onTapTempo,
}) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [customKicks, setCustomKicks] = useState<CustomKickPreset[]>(() => loadCustomKickPresets());

  // P8-01: Haptic feedback toggle & intensity state
  const [hapticOn, setHapticOn] = useState(() => getHapticSettings().enabled);
  const [hapticLevel, setHapticLevel] = useState(() => getHapticSettings().intensity);

  useEffect(() => {
    const handleUpdate = () => {
      setCustomKicks(loadCustomKickPresets());
    };
    window.addEventListener("groove_kick_presets_changed", handleUpdate);
    return () => window.removeEventListener("groove_kick_presets_changed", handleUpdate);
  }, []);

  return (
    <div className="flex flex-col gap-2 min-w-0 w-full">
      {/* Top Toolbar Header (P2-23: flex-wrap in landscape ensures all controls stay visible without horizontal scroll pushing) */}
      <div className="w-full flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 pb-2.5 mb-2 border-b border-line-subtle select-none shrink-0 landscape-compact-bar min-w-0">
        {/* Left Section: Transport, Genre Tag & Metre */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Maximize/Sidebar indicator badge */}
          {isEditorMaximized ? (
            <div className="flex items-center gap-1.5 h-8 px-2 sm:px-2.5 bg-[#14151a] border border-line rounded-lg shrink-0">
              <span
                className="w-2 h-2 rounded-full shadow-[0_0_8px_var(--g)] shrink-0"
                style={{ backgroundColor: "var(--g)" }}
              />
              <span className="font-['Space_Grotesk'] font-bold text-xs text-text truncate max-w-[100px] sm:max-w-[150px]">
                {genreName}
              </span>
            </div>
          ) : (
            isSidebarCollapsed && (
              <button
                onClick={onToggleSidebar}
                className="flex items-center gap-1.5 h-8 px-2.5 text-xs text-text-sub hover:text-accent border border-line rounded-lg transition-colors bg-panel2 shrink-0"
                title={t("toolbar_dossier_expand_title")}
              >
                <PanelLeftOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("toolbar_dossier_short")}</span>
              </button>
            )
          )}

          {/* Play / Pause Button */}
          <button
            onClick={onTogglePlay}
            className={`h-8 px-2.5 sm:px-3 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all hover:brightness-110 shrink-0 ${
              isPlaying
                ? "bg-[#ff5964] text-white shadow-[0_0_12px_rgba(255,89,100,0.35)] animate-pulse-play"
                : "bg-accent text-[#0a0b0d] shadow-[0_0_12px_rgba(245,183,61,0.25)]"
            }`}
            aria-label="Play / Pause"
            title={isPlaying ? "Space: Pause" : "Space: Play"}
          >
            {isPlaying ? (
              <div className="w-2.5 h-2.5 rounded-xs bg-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
            <span className="font-['JetBrains_Mono'] text-xs">
              {isPlaying ? (t("toolbar_pause")) : (t("toolbar_play"))}
            </span>
          </button>

          {/* BPM Input */}
          <div className="flex items-center gap-1 h-8 bg-panel2 border border-line px-2 rounded-lg shrink-0">
            <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider select-none">BPM</span>
            <input
              type="number"
              min="40"
              max="240"
              value={bpm}
              onChange={(e) => onChangeBpm(Math.max(40, Math.min(240, Number(e.target.value) || 120)))}
              className="w-10 bg-transparent text-text font-['JetBrains_Mono'] text-xs font-bold text-center focus:outline-none focus:text-accent"
              title={t("toolbar_bpm_title")}
            />
          </div>

          {/* Tap Tempo Button (P3-07) */}
          {onTapTempo && (
            <button
              type="button"
              onClick={onTapTempo}
              className="h-8 px-2 bg-panel2 hover:bg-[#14151a] border border-line hover:border-accent rounded-lg text-xs font-['JetBrains_Mono'] text-text-sub hover:text-accent transition-colors shrink-0 active:scale-95"
              title={t("toolbar_tap_tempo_title")}
              aria-label="Tap Tempo"
            >
              TAP
            </button>
          )}

          {/* Metronome Toggle (P3-07) */}
          {onToggleMetronome && (
            <button
              type="button"
              onClick={onToggleMetronome}
              className={`h-8 px-2 rounded-lg border flex items-center gap-1 text-xs transition-colors shrink-0 ${
                isMetronome
                  ? "bg-accent/20 border-accent text-accent font-bold shadow-[0_0_8px_rgba(245,183,61,0.25)]"
                  : "bg-panel2 border-line hover:border-[#3a3e48] text-text-sub hover:text-text"
              }`}
              title={t("toolbar_metronome_title")}
              aria-label={t("toolbar_metronome_aria")}
            >
              <Bell className="w-3.5 h-3.5" />
              <span className="hidden xl:inline font-['JetBrains_Mono']">{t("toolbar_metronome_label")}</span>
            </button>
          )}

          {/* Count-In Toggle (P3-07) */}
          {onToggleCountIn && (
            <button
              type="button"
              onClick={onToggleCountIn}
              className={`h-8 px-2 rounded-lg border flex items-center gap-1 text-xs transition-colors shrink-0 ${
                isCountIn
                  ? "bg-[#45e0c9]/20 border-[#45e0c9] text-[#45e0c9] font-bold shadow-[0_0_8px_rgba(69,224,201,0.25)]"
                  : "bg-panel2 border-line hover:border-[#3a3e48] text-text-sub hover:text-text"
              }`}
              title={t("toolbar_count_in_title")}
              aria-label={t("toolbar_count_in_aria")}
            >
              <span className="font-['JetBrains_Mono'] font-bold text-[10px]">1-4</span>
            </button>
          )}

          {/* Live Recording Toggle (P5-05) */}
          {onToggleRecordArmed && (
            <button
              type="button"
              onClick={onToggleRecordArmed}
              className={`h-8 px-2.5 rounded-lg border flex items-center gap-1.5 text-xs font-['JetBrains_Mono'] transition-colors shrink-0 ${
                isRecordArmed
                  ? "bg-red-500/25 border-red-500 text-red-400 font-bold shadow-[0_0_10px_rgba(239,68,68,0.35)]"
                  : "bg-panel2 border-line hover:border-[#3a3e48] text-text-sub hover:text-text"
              }`}
              title={t("toolbar_record_title")}
              aria-label="Live Recording"
            >
              <div className={`w-2 h-2 rounded-full ${isRecordArmed ? "bg-red-500 animate-ping" : "bg-red-500/70"}`} />
              <span>REC</span>
            </button>
          )}

          {/* Drum Kit Model Selector (P5-02) */}
          {onChangeDrumKit && (
            <div className="flex items-center h-8 bg-panel2 hover:bg-[#14151a] border border-line hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
              <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-1 select-none hidden sm:inline">
                {t("toolbar_drum_kit_label")}
              </span>
              <select
                value={drumKit}
                onChange={(e) => onChangeDrumKit(e.target.value as DrumKitType)}
                className="bg-transparent text-text font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
                aria-label={t("toolbar_drum_kit_aria")}
              >
                <optgroup label={t("toolbar_drum_kit_hardware_group")}>
                  <option value="808" className="bg-panel text-text">TR-808 (Analog)</option>
                  <option value="909" className="bg-panel text-text">TR-909 (Punch)</option>
                  <option value="acoustic" className="bg-panel text-text">Acoustic (Warm)</option>
                  <option value="cyber" className="bg-panel text-text">Cyber (Wave)</option>
                </optgroup>
                <optgroup label={t("toolbar_drum_kit_kick_group")}>
                  <option value="kick:berlin-orphic" className="bg-panel text-text">
                    {t("toolbar_kick_berlin_orphic")}
                  </option>
                  <option value="kick:detroit-mechanical" className="bg-panel text-text">
                    {t("toolbar_kick_detroit_mechanical")}
                  </option>
                  <option value="kick:somatic-808-gravity" className="bg-panel text-text">
                    {t("toolbar_kick_visceral_808")}
                  </option>
                  <option value="kick:industrial-revolt" className="bg-panel text-text">
                    {t("toolbar_kick_industrial_revolt")}
                  </option>
                  <option value="kick:acoustic-beater-skin" className="bg-panel text-text">
                    {t("toolbar_kick_acoustic_skin")}
                  </option>
                  <option value="kick:neural-click-clock" className="bg-panel text-text">
                    {t("toolbar_kick_neural_click")}
                  </option>
                </optgroup>
                {customKicks.length > 0 && (
                  <optgroup label={t("toolbar_kick_custom_group")}>
                    {customKicks.map((k) => (
                      <option key={k.id} value={`kick:${k.id}`} className="bg-panel text-text">
                        {t("toolbar_kick_custom_option", { name: k.name })}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}

          {/* Drums Only Toggle */}
          {onToggleDrumsOnly && (
            <button
              type="button"
              onClick={onToggleDrumsOnly}
              className={`h-8 px-2.5 rounded-lg border flex items-center gap-1.5 text-xs font-['JetBrains_Mono'] transition-all shrink-0 active:scale-95 ${
                isDrumsOnly
                  ? "bg-accent/25 border-accent text-accent font-bold shadow-[0_0_10px_rgba(245,183,61,0.35)]"
                  : "bg-panel2 border-line hover:border-[#3a3e48] text-text-sub hover:text-text"
              }`}
              title={
                t("toolbar_drums_only_title", { state: isDrumsOnly ? t("toolbar_state_on") : t("toolbar_state_off") })
              }
              aria-label={t("toolbar_drums_only_aria")}
              aria-pressed={isDrumsOnly}
            >
              <Disc3 className={`w-3.5 h-3.5 ${isDrumsOnly ? "text-accent animate-spin-slow" : "text-text-dim"}`} />
              <span className="font-semibold">{t("toolbar_drums_only_label")}</span>
              {isDrumsOnly && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
            </button>
          )}

          <MeterControls
            timeSignature={timeSignature}
            resolution={resolution}
            stepCount={stepCount}
            barCount={barCount}
            mobileEditMode={mobileEditMode}
            onChangeTimeSignature={onChangeTimeSignature}
            onChangeResolution={onChangeResolution}
            onChangeStepCount={onChangeStepCount}
            onChangeMobileEditMode={onChangeMobileEditMode}
          />

          <PatternSlotControls
            activeSlot={activeSlot}
            songMode={songMode}
            blindCompare={blindCompare}
            onSwitchSlot={onSwitchSlot}
            onCopySlot={onCopySlot}
            onToggleSongMode={onToggleSongMode}
            onToggleBlindCompare={onToggleBlindCompare}
          />

        </div>

        {/* Right Section: Bar Navigation & Pro Operations */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 ml-auto">
          {/* Bar Navigation Select (shown when barCount > 1) */}
          {barCount > 1 && (
            <div className="flex items-center h-8 bg-panel2 hover:bg-[#14151a] border border-line hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
              <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-1 select-none">
                {t("toolbar_bar_label")}
              </span>
              <select
                value={viewedBar}
                onChange={(e) => onSelectBar(Number(e.target.value))}
                className="bg-transparent text-text font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
                aria-label={t("toolbar_bar_aria")}
              >
                {Array.from({ length: barCount }, (_, bIdx) => {
                  const startStep = bIdx * stepsPerBar + 1;
                  const endStep = Math.min(stepCount, (bIdx + 1) * stepsPerBar);
                  return (
                    <option key={bIdx} value={bIdx} className="bg-panel text-text">
                      Bar {bIdx + 1} ({startStep}-{endStep})
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Velocity Lane Toggle */}
          <button
            onClick={onToggleVelocityLane}
            className={`h-8 flex items-center gap-1 px-2 sm:px-2.5 rounded-lg text-xs transition-colors border shrink-0 ${
              isVelocityLaneOpen
                ? "bg-[#45e0c9]/20 border-[#45e0c9] text-[#45e0c9] font-bold shadow-[0_0_8px_rgba(69,224,201,0.25)]"
                : "bg-panel2 border-line hover:border-[#3a3e48] text-text-sub hover:text-text"
            }`}
            title={t("toolbar_velocity_title")}
          >
            <Sliders className="w-3.5 h-3.5 text-[#45e0c9]" />
            <span className="hidden sm:inline font-['JetBrains_Mono']">{t("toolbar_velocity_label")}</span>
          </button>

          {/* Euclidean Rhythm Generator */}
          <button
            onClick={onOpenEuclidean}
            className="h-8 flex items-center gap-1 px-2 sm:px-2.5 bg-panel2 border border-line hover:border-accent/60 rounded-lg text-xs text-text-sub hover:text-accent transition-colors shrink-0"
            title={t("toolbar_euclid_title")}
          >
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span className="hidden sm:inline font-['JetBrains_Mono']">{t("toolbar_euclid_label")}</span>
          </button>

          {/* Master Panoramic Analyzer Toggle (P6-05) */}
          {onToggleAnalyzer && (
            <button
              type="button"
              onClick={onToggleAnalyzer}
              className={`h-8 flex items-center gap-1 px-2 sm:px-2.5 rounded-lg text-xs transition-colors border shrink-0 ${
                isAnalyzerOpen
                  ? "bg-accent/20 border-accent text-accent font-bold shadow-[0_0_8px_rgba(245,183,61,0.3)]"
                  : "bg-panel2 border-line hover:border-[#3a3e48] text-text-sub hover:text-text"
              }`}
              title={t("toolbar_analyzer_title")}
              aria-label="Toggle Master Analyzer"
            >
              <Activity className="w-3.5 h-3.5 text-accent" />
              <span className="hidden sm:inline font-['JetBrains_Mono']">{t("toolbar_analyzer_label")}</span>
            </button>
          )}

          {/* Floating Mixing Console Toggle (feature #2) */}
          {onToggleConsole && (
            <button
              type="button"
              onClick={onToggleConsole}
              aria-pressed={isConsoleOpen}
              aria-label={t("console_float_toggle")}
              data-testid="studio-console-toggle"
              className={`h-8 flex items-center gap-1 px-2 sm:px-2.5 rounded-lg text-xs transition-colors border shrink-0 ${
                isConsoleOpen
                  ? "bg-accent/20 border-accent text-accent font-bold shadow-[0_0_8px_rgba(245,183,61,0.3)]"
                  : "bg-panel2 border-line hover:border-[#3a3e48] text-text-sub hover:text-text"
              }`}
              title={t("console_float_toggle_title")}
            >
              <AudioLines className="w-3.5 h-3.5 text-accent" />
              <span className="hidden sm:inline font-['JetBrains_Mono']">
                {t("console_float_toggle")}
              </span>
            </button>
          )}

          {/* Undo & Redo */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={`h-8 w-8 flex items-center justify-center rounded-lg border text-xs transition-colors ${
                canUndo
                  ? "bg-panel2 text-text border-line hover:border-accent hover:text-accent cursor-pointer"
                  : "bg-bg text-[#4a4e58] border-[#181a20] cursor-not-allowed opacity-40"
              }`}
              title={t("toolbar_undo_title")}
              aria-label={t("toolbar_undo_title")}
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className={`h-8 w-8 flex items-center justify-center rounded-lg border text-xs transition-colors ${
                canRedo
                  ? "bg-panel2 text-text border-line hover:border-accent hover:text-accent cursor-pointer"
                  : "bg-bg text-[#4a4e58] border-[#181a20] cursor-not-allowed opacity-40"
              }`}
              title={t("toolbar_redo_title")}
              aria-label={t("toolbar_redo_title")}
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Fullscreen Maximize / Minimize Toggle */}
          <button
            onClick={onToggleMaximize}
            className={`h-8 px-2 sm:px-2.5 flex items-center gap-1 text-xs border rounded-lg transition-colors shrink-0 ${
              isEditorMaximized
                ? "bg-[#17181c] hover:bg-line border-[#2b2e38] text-text shadow-sm"
                : "bg-panel2 border-line hover:border-accent text-text-sub hover:text-accent"
            }`}
            title={
              isEditorMaximized
                ? (t("toolbar_fullscreen_exit_title"))
                : (t("toolbar_fullscreen_enter_title"))
            }
          >
            {isEditorMaximized ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-accent" />
                <span className="hidden sm:inline font-['JetBrains_Mono']">
                  {t("toolbar_fullscreen_exit_label")}
                </span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-accent" />
                <span className="hidden sm:inline font-['JetBrains_Mono']">
                  {t("toolbar_fullscreen_enter_label")}
                </span>
              </>
            )}
          </button>

          {/* Quick Tools Dropdown */}
          <div className="flex items-center h-8 bg-panel2 hover:bg-[#14151a] border border-line hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
            <select
              value=""
              onChange={(e) => onQuickAction(e.target.value as any)}
              className="bg-transparent text-text-sub hover:text-text font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
              aria-label={t("toolbar_quick_actions_aria")}
            >
              <option value="" disabled className="bg-panel text-text-sub">
                ⚡ {t("toolbar_quick_tools_placeholder")}
              </option>
              <option value="open_hub" className="bg-panel text-accent font-bold">
                📁 {t("toolbar_quick_project_hub")}
              </option>
              <option value="dup_bar1" className="bg-panel text-text">
                📋 {t("toolbar_quick_duplicate_bar1")}
              </option>
              <option value="humanize" className="bg-panel text-text">
                ✨ {t("toolbar_quick_humanize")}
              </option>
              <option value="clear_all" className="bg-panel text-[#ff5964]">
                🗑️ {t("toolbar_quick_clear_all")}
              </option>
              <option value="reset_preset" className="bg-panel text-text">
                🔄 {t("toolbar_quick_reset_preset")}
              </option>
              <option value="clear_saved" className="bg-panel text-[#f87171]">
                🧹 {t("toolbar_quick_clear_saved")}
              </option>
            </select>
          </div>

          {/* Inspire Me controlled generative groove variation (P4-06) */}
          {onInspireMe && (
            <button
              onClick={onInspireMe}
              className="h-8 px-2 sm:px-2.5 flex items-center gap-1 text-xs text-accent hover:bg-accent/15 border border-accent/40 rounded-lg transition-colors bg-panel2 shrink-0 font-['JetBrains_Mono']"
              title={t("toolbar_inspire_title")}
            >
              <Sparkles className="w-3.5 h-3.5 text-accent animate-pulse" />
              <span className="hidden xl:inline">{t("toolbar_inspire_label")}</span>
            </button>
          )}

          {/* Import MIDI (P4-03) */}
          {onImportMidi && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mid,.midi"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onImportMidi(file);
                  }
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="h-8 px-2 sm:px-2.5 flex items-center gap-1 text-xs text-text-sub hover:text-text hover:border-[#3a3e48] border border-line rounded-lg transition-colors bg-panel2 shrink-0 font-['JetBrains_Mono']"
                title={t("toolbar_import_midi_title")}
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">{t("toolbar_import_label")}</span>
              </button>
            </>
          )}

          {/* Live Keyboard / Web MIDI Input (P4-04) */}
          {onToggleKeyboardMode && (
            <button
              onClick={onToggleKeyboardMode}
              className={`h-8 px-2 sm:px-2.5 flex items-center gap-1 text-xs border rounded-lg transition-colors shrink-0 font-['JetBrains_Mono'] ${
                isKeyboardMode
                  ? "bg-accent/20 text-accent border-accent/60 shadow-[0_0_12px_rgba(255,100,50,0.2)]"
                  : "bg-panel2 text-text-sub hover:text-text border-line hover:border-[#3a3e48]"
              }`}
              title={
                t("toolbar_keyboard_play_title", { devices: midiDeviceCount > 0 ? t("toolbar_keyboard_devices", { count: midiDeviceCount }) : "" })
              }
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span className="hidden 2xl:inline">{t("toolbar_keyboard_label")}</span>
              {midiDeviceCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" title="MIDI Connected" />
              )}
            </button>
          )}

          {/* Multi-Project Hub Button (P7-02) */}
          {onOpenProjectHub && (
            <button
              type="button"
              onClick={onOpenProjectHub}
              className="h-8 px-2 sm:px-2.5 flex items-center gap-1.5 text-xs text-text-sub hover:text-accent hover:border-accent border border-line rounded-lg transition-colors bg-panel2 shrink-0 font-['JetBrains_Mono']"
              title={t("toolbar_project_hub_title")}
              aria-label={t("toolbar_project_hub_aria")}
            >
              <FolderKanban className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="hidden lg:inline max-w-[90px] xl:max-w-[120px] truncate text-text font-medium">
                {activeProjectName || (t("toolbar_projects_fallback"))}
              </span>
            </button>
          )}

          {/* Custom Genre Maker Button (P7-03) */}
          {onOpenGenreMaker && (
            <button
              type="button"
              onClick={onOpenGenreMaker}
              className="h-8 px-2 sm:px-2.5 flex items-center gap-1.5 text-xs text-text-sub hover:text-accent hover:border-accent border border-line rounded-lg transition-colors bg-panel2 shrink-0 font-['JetBrains_Mono']"
              title={t("toolbar_genre_maker_title")}
              aria-label={t("toolbar_genre_maker_aria")}
            >
              <Wand2 className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="hidden xl:inline text-text font-medium">
                {t("toolbar_genre_maker_label")}
              </span>
            </button>
          )}

          <ExportMenu
            isExportingAudio={isExportingAudio}
            onExportMidi={onExportMidi}
            onExportAls={onExportAls}
            onExportGroove={onExportGroove}
            onExportWav={onExportWav}
            onExportStems={onExportStems}
          />

          {/* Share Groove */}
          {!isEditorMaximized && (
            <button
              type="button"
              onClick={onShare}
              className="h-8 px-2 sm:px-2.5 flex items-center gap-1 text-xs text-text-sub hover:text-accent hover:border-accent border border-line rounded-lg transition-colors bg-panel2 shrink-0"
              title={t("share_groove")}
              aria-label={t("share_groove")}
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Collapsible Advanced Settings */}
          <button
            onClick={onToggleAdvancedControls}
            className={`h-8 px-2 sm:px-2.5 flex items-center gap-1 text-xs border rounded-lg transition-colors shrink-0 ${
              showAdvancedControls
                ? "bg-[#1f232b] text-accent border-accent/50"
                : "bg-panel2 text-text-sub hover:text-text border-line hover:border-[#3a3e48]"
            }`}
            title={t("toolbar_advanced_title")}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden xl:inline font-['JetBrains_Mono']">
              {t("toolbar_advanced_label")}
            </span>
            {swing > 0 && !showAdvancedControls && (
              <span className="text-[10px] text-accent font-['JetBrains_Mono'] hidden sm:inline">
                {swing}%
              </span>
            )}
            <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedControls ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* Collapsible Advanced Settings Bar (Drawer) */}
      {showAdvancedControls && (
        <div className="flex items-center justify-between gap-3 p-2 bg-[#0a0b0e] border border-line rounded-xl mb-2 text-xs select-none transition-all shrink-0 overflow-x-auto whitespace-nowrap scrollbar-none min-w-0">
          {/* Swing Slider Knob */}
          <div className="flex items-center gap-2 bg-panel px-2.5 py-1 rounded-lg border border-line-subtle">
            <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase whitespace-nowrap">
              {t("swing")}: <b className="text-text font-normal">{swing}%</b>
            </span>
            <input
              type="range"
              min="0"
              max="75"
              value={swing}
              onChange={(e) => onChangeSwing(+e.target.value)}
              className="w-20 sm:w-28 accent-accent cursor-pointer"
            />
          </div>

          {/* Fine-grained Step adjustments */}
          <div className="flex items-center gap-1 bg-panel px-2 py-1 rounded-lg border border-line-subtle">
            <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim mr-1 hidden sm:inline whitespace-nowrap">
              {t("toolbar_fine_steps_label")}
            </span>
            <button
              onClick={() => onRemoveSteps(groupSize)}
              className="h-6 px-1.5 flex items-center justify-center rounded bg-[#17181c] hover:bg-line text-text-sub hover:text-text border border-line font-['JetBrains_Mono'] text-[10px]"
              title={t("toolbar_remove_steps", { count: groupSize })}
            >
              -{groupSize}
            </button>
            <button
              onClick={() => onAddSteps(groupSize)}
              className="h-6 px-1.5 flex items-center justify-center rounded bg-[#17181c] hover:bg-line text-text-sub hover:text-text border border-line font-['JetBrains_Mono'] text-[10px]"
              title={t("toolbar_add_steps", { count: groupSize })}
            >
              +{groupSize}
            </button>
            <button
              onClick={() => onAddSteps(stepsPerBar)}
              className="h-6 px-1.5 flex items-center justify-center rounded bg-[#17181c] hover:bg-line text-accent border border-line font-['JetBrains_Mono'] text-[10px]"
              title={t("toolbar_add_1_bar", { count: stepsPerBar })}
            >
              +1 Bar
            </button>
            <button
              onClick={() => onAddSteps(stepsPerBar * 2)}
              className="h-6 px-1.5 flex items-center justify-center rounded bg-[#17181c] hover:bg-line text-accent border border-line font-['JetBrains_Mono'] text-[10px] hidden md:inline-flex"
              title={t("toolbar_add_2_bars", { count: stepsPerBar * 2 })}
            >
              +2 Bars
            </button>
          </div>

          {/* Master DSP Effects Rack Controls (P5-04) */}
          {effectsRackState && onChangeEffectsRack && (
            <div className="flex items-center gap-1.5 bg-panel px-2 py-1 rounded-lg border border-line-subtle">
              <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-0.5 whitespace-nowrap">
                {t("toolbar_fx_label")}
              </span>

              {/* Filter */}
              <button
                type="button"
                onClick={() => onChangeEffectsRack({ filterEnabled: !effectsRackState.filterEnabled })}
                className={`h-6 px-2 rounded text-[10px] font-['JetBrains_Mono'] border transition-colors ${
                  effectsRackState.filterEnabled
                    ? "bg-accent/20 border-accent text-accent font-bold"
                    : "bg-[#17181c] border-line text-text-sub hover:text-text"
                }`}
                title={t("toolbar_fx_filter")}
              >
                FLT
              </button>

              {/* Saturation */}
              <button
                type="button"
                onClick={() => onChangeEffectsRack({ saturationEnabled: !effectsRackState.saturationEnabled })}
                className={`h-6 px-2 rounded text-[10px] font-['JetBrains_Mono'] border transition-colors ${
                  effectsRackState.saturationEnabled
                    ? "bg-amber-500/20 border-amber-500 text-amber-400 font-bold"
                    : "bg-[#17181c] border-line text-text-sub hover:text-text"
                }`}
                title={t("toolbar_fx_saturation")}
              >
                DRIVE
              </button>

              {/* Chorus */}
              <button
                type="button"
                onClick={() => onChangeEffectsRack({ chorusEnabled: !effectsRackState.chorusEnabled })}
                className={`h-6 px-2 rounded text-[10px] font-['JetBrains_Mono'] border transition-colors ${
                  effectsRackState.chorusEnabled
                    ? "bg-cyan-500/20 border-cyan-500 text-cyan-400 font-bold"
                    : "bg-[#17181c] border-line text-text-sub hover:text-text"
                }`}
                title={t("toolbar_fx_chorus")}
              >
                CHORUS
              </button>

              {/* Bitcrusher */}
              <button
                type="button"
                onClick={() => onChangeEffectsRack({ bitcrusherEnabled: !effectsRackState.bitcrusherEnabled })}
                className={`h-6 px-2 rounded text-[10px] font-['JetBrains_Mono'] border transition-colors ${
                  effectsRackState.bitcrusherEnabled
                    ? "bg-fuchsia-500/20 border-fuchsia-500 text-fuchsia-400 font-bold"
                    : "bg-[#17181c] border-line text-text-sub hover:text-text"
                }`}
                title={t("toolbar_fx_bitcrusher")}
              >
                LO-FI
              </button>
            </div>
          )}

          {/* Haptic Feedback Control (P8-01) */}
          <div className="flex items-center gap-1.5 bg-panel px-2 py-1 rounded-lg border border-line-subtle">
            <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-0.5 whitespace-nowrap">
              {t("toolbar_haptic_label")}
            </span>
            <button
              type="button"
              onClick={() => {
                const next = !hapticOn;
                setHapticEnabled(next);
                setHapticOn(next);
                if (next) triggerHaptic(HapticPatterns.tap);
              }}
              className={`h-6 px-2 rounded text-[10px] font-['JetBrains_Mono'] border transition-colors ${
                hapticOn
                  ? "bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold"
                  : "bg-[#17181c] border-line text-text-sub hover:text-text"
              }`}
              title={t("toolbar_haptic_title")}
            >
              {hapticOn ? "ON" : "OFF"}
            </button>
            {hapticOn && (
              <input
                type="range"
                min="10"
                max="100"
                value={Math.round(hapticLevel * 100)}
                onChange={(e) => {
                  const v = +e.target.value / 100;
                  setHapticIntensity(v);
                  setHapticLevel(v);
                  triggerHaptic(HapticPatterns.slider);
                }}
                className="w-14 sm:w-20 accent-emerald-400 cursor-pointer"
                title={t("toolbar_haptic_intensity", { value: Math.round(hapticLevel * 100) })}
              />
            )}
          </div>

          {/* Pan Navigation */}
          <div className="flex items-center gap-1.5 ml-auto text-text-dim">
            <span className="hidden lg:inline font-['JetBrains_Mono'] text-[10px] whitespace-nowrap">
              {t("toolbar_pan_hint")}
            </span>
            <button
              onClick={() => onScrollByPixels(-240)}
              className="w-6 h-6 rounded bg-panel border border-line hover:border-accent text-text-sub hover:text-accent flex items-center justify-center text-xs transition-colors"
              title={t("toolbar_scroll_left")}
            >
              ◀
            </button>
            <button
              onClick={() => onScrollByPixels(240)}
              className="w-6 h-6 rounded bg-panel border border-line hover:border-accent text-text-sub hover:text-accent flex items-center justify-center text-xs transition-colors"
              title={t("toolbar_scroll_right")}
            >
              ▶
            </button>
            <button
              onClick={onToggleAdvancedControls}
              className="ml-2 text-[10px] text-text-sub hover:text-text font-['JetBrains_Mono'] px-1.5 py-0.5 rounded bg-[#17181c] border border-line"
              title={t("toolbar_drawer_close")}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
