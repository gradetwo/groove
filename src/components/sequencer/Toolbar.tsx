import React, { memo, useState, useRef, useEffect } from "react";
import {
  Activity,
  AudioLines,
  Bell,
  ChevronDown,
  Copy,
  Disc3,
  Download,
  Eye,
  EyeOff,
  FileAudio,
  FolderKanban,
  HelpCircle,
  Keyboard,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Music2,
  Package,
  PanelLeftOpen,
  Play,
  Redo2,
  Repeat,
  Share2,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  Upload,
  Wand2,
} from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { isControlVisible } from "./toolbarTiers";
import { DrumKitType, EffectsRackState } from "../../audio/AudioEngine";
import { CustomKickPreset, loadCustomKickPresets } from "../../audio/AnatomyKickEngine";
import { triggerHaptic, HapticPatterns, getHapticSettings, setHapticEnabled, setHapticIntensity } from "../../utils/haptics";

/* ------------------------------------------------------------------------- *
 * D-05: master-FX parameter mapping.
 *
 * The engine's cutoff range is 20 Hz – 20 kHz. A *linear* 20–20000 slider puts
 * every musically useful value (a bassline's 200 Hz low-pass, a hi-hat's 8 kHz)
 * inside the first few pixels, so the slider is mapped on a log scale: position
 * 0 = 20 Hz, position 100 = 20 kHz, each unit a constant ratio (1000^(1/100)).
 * Exported so the mapping can be unit-tested without rendering the toolbar.
 * ------------------------------------------------------------------------- */
export const FX_CUTOFF_MIN_HZ = 20;
export const FX_CUTOFF_MAX_HZ = 20000;
const FX_CUTOFF_RATIO = FX_CUTOFF_MAX_HZ / FX_CUTOFF_MIN_HZ;

export const FX_FILTER_TYPES = ["lowpass", "highpass", "bandpass"] as const;

/** Maps a cutoff in Hz onto the 0–100 log slider position. */
export function fxCutoffToSliderPosition(hz: number): number {
  const clamped = Math.min(FX_CUTOFF_MAX_HZ, Math.max(FX_CUTOFF_MIN_HZ, hz));
  return Math.round((Math.log(clamped / FX_CUTOFF_MIN_HZ) / Math.log(FX_CUTOFF_RATIO)) * 100);
}

/** Maps a 0–100 log slider position back onto a cutoff in Hz (integer Hz). */
export function fxSliderPositionToCutoff(position: number): number {
  const clamped = Math.min(100, Math.max(0, position));
  return Math.round(FX_CUTOFF_MIN_HZ * Math.pow(FX_CUTOFF_RATIO, clamped / 100));
}

/** Compact readout: `850 Hz` below 1 kHz, `16.0k` above. */
export function formatFxCutoff(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : `${Math.round(hz)}`;
}

export type MobileEditMode = "step" | "accent" | "ratchet" | "pitch" | "plocks";

export interface ToolbarProps {
  isPlaying: boolean;
  /**
   * P6: whether GS-1 voices `chords`/`lead`.
   *
   * Owned by the studio (the engine holds it, persisted with the other audio settings); the
   * toolbar only reflects it and asks for a change, like every other control here.
   */
  /** Optional, like the console toggle: the control renders only when a handler is given. */
  gs1Enabled?: boolean;
  onToggleGs1?: () => void;
  /**
   * Opens the audio settings panel (master level / hearing protection / latency
   * compensation / GS-1). Optional so the toolbar still renders in isolation.
   */
  onOpenAudioSettings?: () => void;
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
  isPianoRollOpen?: boolean;
  /** Piano roll toggle (item ⑦). Optional so an unwired toolbar still renders. */
  onTogglePianoRoll?: () => void;
  onOpenEuclidean: () => void;
  /**
   * Opens the help centre at the sequencer's chapter (U5). Optional, like the console toggle: the
   * entry renders only when the host can actually open help.
   */
  onOpenHelp?: (chapterId?: string) => void;
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
          data-toolbar-id="meter" data-toolbar-tier="2"
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
          data-toolbar-id="grid" data-toolbar-tier="2"
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
          data-toolbar-id="length" data-toolbar-tier="2"
          value={stepCount}
          onChange={(e) => onChangeStepCount(Number(e.target.value))}
          className="bg-transparent text-text font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
          aria-label={t("toolbar_length_aria")}
        >
          <option value={16} className="bg-panel text-text">16 {t("toolbar_steps_1_bar")}</option>
          <option value={32} className="bg-panel text-text">32 {t("toolbar_steps_2_bars")}</option>
          <option value={48} className="bg-panel text-text">48 {t("toolbar_steps_3_bars")}</option>
          <option value={64} className="bg-panel text-text">64 {t("toolbar_steps_4_bars")}</option>
          <option value={128} className="bg-panel text-text">128 {t("toolbar_steps_8_bars")}</option>
          {![16, 32, 48, 64, 128].includes(stepCount) && (
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
          data-toolbar-id="tool-mode" data-toolbar-tier="2"
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
  /** Advanced density: song mode and blind compare are Tier 2 and Tier 3 (see `toolbarTiers`). */
  showAdvancedControls: boolean;
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
  showAdvancedControls,
}) {
  const { t } = useLanguage();
  const shows = (id: string) => isControlVisible(id, showAdvancedControls);

  return (
    <>
      {/* Pattern Slots Switcher (P3-02) */}
      {onSwitchSlot && (
        <div className="flex items-center bg-panel2 border border-line rounded-lg p-0.5 shrink-0">
          <button
            data-toolbar-id="pattern-slot" data-toolbar-tier="1"
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
            data-toolbar-id="pattern-slot" data-toolbar-tier="1"
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
              data-toolbar-id="pattern-slot" data-toolbar-tier="1"
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
      {onToggleSongMode && shows("song-mode") && (
        <button
          data-toolbar-id="song-mode" data-toolbar-tier="2"
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
      {onToggleBlindCompare && shows("blind-compare") && (
        <button
          data-toolbar-id="blind-compare" data-toolbar-tier="3"
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
        data-toolbar-id="export"
        data-toolbar-tier="1"
        onClick={() => setExportOpen((prev) => !prev)}
        disabled={isExportingAudio}
        className="h-8 px-2 sm:px-2.5 flex items-center gap-1 text-xs text-text-sub hover:text-text hover:border-[#3a3e48] border border-line rounded-lg transition-colors bg-panel2 shrink-0 font-['JetBrains_Mono'] disabled:opacity-50"
        /* Its own label: `export` is the key for "MIDI" in this app, so the menu was titled after one of its
           five items. */
        title={t("toolbar_export_menu")}
        aria-label={t("toolbar_export_menu")}
        aria-haspopup="true"
        aria-expanded={exportOpen}
      >
        {isExportingAudio ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
        ) : (
          <Download className="w-3.5 h-3.5" />
        )}
        {/* The word, from tablet width up: an unlabelled icon among twenty is not a discoverable action. */}
        <span className="hidden sm:inline">{t("toolbar_export_menu")}</span>
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
  gs1Enabled = true,
  onToggleGs1,
  onOpenAudioSettings,
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
  isPianoRollOpen,
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
  onTogglePianoRoll,
  onOpenEuclidean,
  onOpenHelp,
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

  // D-05: the drawer's secondary FX parameters (filter Q, chorus rate) stay collapsed
  // by default so the four primary effect parameters fit the one-line drawer.
  const [showFxAdvanced, setShowFxAdvanced] = useState(false);
  const advancedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showAdvancedControls) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[role='dialog'], [data-testid='track-inspector'], .fixed.inset-0")) {
        return;
      }
      /**
       * A control the toolbar itself renders must not dismiss the density.
       *
       * Two problems, one rule. Controls that are only on screen *because* the density is on mostly
       * live outside this panel — the transport group, the groove selects, the roll and console
       * toggles, the whole project group — and treating their press as an outside click made them
       * unclickable: the mousedown closed the density, the control unmounted, and the click event
       * landed on nothing, so the control looked dead until it was pressed twice. (The release
       * matrix caught that as "the piano roll never opens".)
       *
       * The same rule also stops Tier 1 controls from closing it, which is what makes the density
       * predictable: it opens and closes only on its own control, on Escape, or on a press that is
       * genuinely outside the toolbar. A disclosure that snapped shut every time the user touched
       * the toolbar would be the thing that feels broken.
       *
       * The selector is the stamp every control carries (`toolbarTiers.ts`), so this comes from the
       * table that decided visibility rather than from a second list that could drift from it.
       */
      if (target.closest("[data-toolbar-id], [data-toolbar-tier]")) return;
      if (
        advancedRef.current &&
        !advancedRef.current.contains(target) &&
        !target.closest("[data-testid='toolbar-advanced-toggle']")
      ) {
        onToggleAdvancedControls();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.querySelector("[role='dialog'], [data-testid='track-inspector'], [data-testid^='settings-tab-'], .fixed.inset-0")) {
          return;
        }
        onToggleAdvancedControls();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showAdvancedControls, onToggleAdvancedControls]);

  useEffect(() => {
    const handleUpdate = () => {
      setCustomKicks(loadCustomKickPresets());
    };
    window.addEventListener("groove_kick_presets_changed", handleUpdate);
    return () => window.removeEventListener("groove_kick_presets_changed", handleUpdate);
  }, []);

  /**
   * Which controls are shown, decided by the tier table and nothing else.
   *
   * G.10 measured this toolbar at 36-38 always-visible controls and 215 px (24 % of a 1440x900
   * viewport) against a Tier 1 design of 12. The table already recorded every control's frequency;
   * this is the line that makes it load-bearing.
   */
  const shows = (id: string) => isControlVisible(id, showAdvancedControls);

  const [isToolbarFolded, setIsToolbarFolded] = useState(() => {
    try {
      return localStorage.getItem("groove_toolbar_folded") === "true";
    } catch {
      return false;
    }
  });
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  const toggleToolbarFolded = () => {
    setIsToolbarFolded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("groove_toolbar_folded", String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMoreMenuOpen]);

  /**
   * The transport, as its own sticky strip (G.47).
   *
   * The page scrolls — the studio panel is taller than most viewports — and the transport used to
   * scroll away with it: measured at 1440×900, scrolled to the bottom, the group sat at `top −247`
   * and its centre hit-tested as nothing. A phone fixes its transport to the bottom for the same
   * reason; on PC/iPad the header is the one bar that always stays, so the transport parks directly
   * underneath it.
   *
   * Two details are load-bearing:
   *
   *   - `top` is `var(--app-header-h)`, the header's own height (`src/index.css`), because a sticky
   *     element has to be told how much of the viewport top is already spoken for. Too small and the
   *     strip parks *behind* the header, where nothing can click it; the E2E matrix asserts the
   *     rendered header still measures the token and that the strip is hit-testable at the bottom of
   *     the page.
   *   - the strip is rendered as a *sibling* of the toolbar (the fragment below), not inside it. A
   *     sticky element can only move inside its parent's box, and the toolbar is one 116 px row:
   *     inside it the strip had 63 px of travel and scrolled away anyway. Its parent is now the
   *     panel section, which is as tall as the whole panel.
   *
   * Only the transport moves here: the edit, view and project groups keep scrolling with the page,
   * so the permanently occupied band stays one row (~52 px) rather than a whole toolbar.
   */
  const transportStrip = (
    <div
      data-testid="toolbar-transport-strip"
      className="sticky top-[var(--app-header-h)] z-30 -mx-3 sm:-mx-4 px-3 sm:px-4 py-1 bg-panel/95 backdrop-blur-md border-b border-line-subtle"
    >
      <div className="flex items-center gap-2 min-w-0 max-w-full">
          {/* Group 1: 播放控制组 (Playback & Transport Group) */}
          <div
            data-testid="toolbar-group-transport"
            className="flex items-center overflow-x-auto scrollbar-none gap-1 sm:gap-1.5 p-0.5 sm:p-1 rounded-xl bg-[#11131a]/85 border border-[#272b38] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.4)] max-w-full"
          >
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
                  data-toolbar-id="sidebar-toggle" data-toolbar-tier="1"
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
              data-toolbar-id="play" data-toolbar-tier="1"
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

            {/* BPM Input + Micro-nudges */}
            <div className="flex items-center h-8 bg-panel2 border border-line rounded-lg px-1 text-xs shrink-0">
              <button
                data-toolbar-id="bpm" data-toolbar-tier="1"
                type="button"
                onClick={() => onChangeBpm(Math.max(40, bpm - 1))}
                className="w-4 h-6 flex items-center justify-center text-text-dim hover:text-accent font-['JetBrains_Mono'] text-xs rounded hover:bg-white/5 active:scale-90 select-none"
                title="−1 BPM"
                aria-label="Decrease BPM"
              >
                −
              </button>
              <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider select-none px-0.5">BPM</span>
              <input
                data-toolbar-id="bpm" data-toolbar-tier="1"
                type="number"
                min="40"
                max="240"
                value={bpm}
                onChange={(e) => onChangeBpm(Math.max(40, Math.min(240, Number(e.target.value) || 120)))}
                className="w-9 bg-transparent text-text font-['JetBrains_Mono'] text-xs font-bold text-center focus:outline-none focus:text-accent"
                title={t("toolbar_bpm_title")}
              />
              <button
                data-toolbar-id="bpm" data-toolbar-tier="1"
                type="button"
                onClick={() => onChangeBpm(Math.min(240, bpm + 1))}
                className="w-4 h-6 flex items-center justify-center text-text-dim hover:text-accent font-['JetBrains_Mono'] text-xs rounded hover:bg-white/5 active:scale-90 select-none"
                title="+1 BPM"
                aria-label="Increase BPM"
              >
                +
              </button>
            </div>

            {/* Tap Tempo Button (P3-07) */}
            {onTapTempo && shows("tap-tempo") && (
              <button
                data-toolbar-id="tap-tempo" data-toolbar-tier="2"
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
            {onToggleMetronome && shows("metronome") && (
              <button
                data-toolbar-id="metronome" data-toolbar-tier="2"
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
            {onToggleCountIn && shows("count-in") && (
              <button
                data-toolbar-id="count-in" data-toolbar-tier="2"
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
            {onToggleRecordArmed && shows("record-arm") && (
              <button
                data-toolbar-id="record-arm" data-toolbar-tier="2"
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
            {onChangeDrumKit && shows("drum-kit") && (
              <div className="flex items-center h-8 bg-panel2 hover:bg-[#14151a] border border-line hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
                <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-1 select-none hidden sm:inline">
                  {t("toolbar_drum_kit_label")}
                </span>
                <select
                  data-toolbar-id="drum-kit" data-toolbar-tier="2"
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
            {onToggleDrumsOnly && shows("drums-only") && (
              <button
                data-toolbar-id="drums-only" data-toolbar-tier="2"
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

            <PatternSlotControls
              activeSlot={activeSlot}
              songMode={songMode}
              blindCompare={blindCompare}
              onSwitchSlot={onSwitchSlot}
              onCopySlot={onCopySlot}
              onToggleSongMode={onToggleSongMode}
              onToggleBlindCompare={onToggleBlindCompare}
              showAdvancedControls={showAdvancedControls}
            />

            {/* Compact Fold Toggle (Item 8) */}
            <button
              data-toolbar-id="fold-toggle" data-toolbar-tier="1"
              type="button"
              onClick={toggleToolbarFolded}
              data-testid="toolbar-fold-toggle"
              className={`h-8 px-2 sm:px-2.5 rounded-lg border flex items-center gap-1 text-xs transition-colors shrink-0 font-['JetBrains_Mono'] ${
                isToolbarFolded
                  ? "bg-accent/20 border-accent text-accent font-bold shadow-[0_0_8px_rgba(245,183,61,0.2)]"
                  : "bg-panel2 border-line hover:border-[#3a3e48] text-text-sub hover:text-text"
              }`}
              title={isToolbarFolded ? t("toolbar_fold_expand") : t("toolbar_fold_compact")}
              aria-pressed={isToolbarFolded}
              aria-label={isToolbarFolded ? t("toolbar_fold_expand") : t("toolbar_fold_compact")}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {isToolbarFolded ? t("toolbar_fold_expand") : t("toolbar_fold_compact")}
              </span>
            </button>

            {/* Collapsible Advanced Settings (always reachable on all viewports) */}
            <button
              data-toolbar-id="more" data-toolbar-tier="1"
              type="button"
              onClick={onToggleAdvancedControls}
              data-testid="toolbar-advanced-toggle"
              className={`h-8 px-2 sm:px-2.5 flex items-center gap-1 text-xs border rounded-lg transition-colors shrink-0 ${
                showAdvancedControls
                  ? "bg-[#1f232b] text-accent border-accent/50"
                  : "bg-panel2 text-text-sub hover:text-text border-line hover:border-[#3a3e48]"
              }`}
              title={t("toolbar_advanced_title")}
              aria-label={t("toolbar_advanced_title")}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden xl:inline font-['JetBrains_Mono']">
                {t("toolbar_advanced_label")}
              </span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedControls ? "rotate-180" : ""}`} />
            </button>

            {/* More Menu Popover Trigger (Item 8: visible when folded or on small viewports) */}
            <div className="relative shrink-0" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                data-testid="toolbar-more-menu-btn"
                className={`h-8 px-2 sm:px-2.5 rounded-lg border flex items-center gap-1 text-xs transition-colors shrink-0 font-['JetBrains_Mono'] ${
                  isMoreMenuOpen
                    ? "bg-accent/20 border-accent text-accent font-bold"
                    : "bg-panel2 border-line hover:border-[#3a3e48] text-text-sub hover:text-text"
                } ${isToolbarFolded ? "flex" : "flex md:hidden"}`}
                title={t("toolbar_more_tools")}
                aria-expanded={isMoreMenuOpen}
                aria-haspopup="true"
              >
                <MoreHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">{t("toolbar_more_tools")}</span>
              </button>

              {isMoreMenuOpen && (
                <div
                  data-testid="toolbar-more-menu"
                  className="absolute left-0 sm:right-0 sm:left-auto top-full mt-1.5 w-72 p-2.5 bg-[#0f1118] border border-line-strong rounded-xl shadow-[0_16px_36px_rgba(0,0,0,0.95)] z-50 text-xs font-['JetBrains_Mono'] flex flex-col gap-2.5 max-h-[80vh] overflow-y-auto"
                >
                  {/* Section 1: 编辑操作 */}
                  <div className="flex flex-col gap-1 pb-2 border-b border-line/40">
                    <span className="text-[10px] uppercase font-bold text-text-dim tracking-wider">
                      {t("toolbar_group_edit_label")}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => { onUndo(); setIsMoreMenuOpen(false); }}
                        disabled={!canUndo}
                        className="h-7 px-2 rounded bg-panel2 border border-line text-text-sub hover:text-text disabled:opacity-40 flex items-center gap-1 text-[11px]"
                      >
                        <Undo2 className="w-3 h-3" /> {t("toolbar_undo_title")}
                      </button>
                      <button
                        type="button"
                        onClick={() => { onRedo(); setIsMoreMenuOpen(false); }}
                        disabled={!canRedo}
                        className="h-7 px-2 rounded bg-panel2 border border-line text-text-sub hover:text-text disabled:opacity-40 flex items-center gap-1 text-[11px]"
                      >
                        <Redo2 className="w-3 h-3" /> {t("toolbar_redo_title")}
                      </button>
                      <button
                        type="button"
                        onClick={() => { onOpenEuclidean(); setIsMoreMenuOpen(false); }}
                        className="h-7 px-2 rounded bg-panel2 border border-line text-text-sub hover:text-accent flex items-center gap-1 text-[11px]"
                      >
                        <Sparkles className="w-3 h-3 text-accent" /> {t("toolbar_euclid_label")}
                      </button>
                    </div>
                  </div>

                  {/* Section 2: 视图切换 */}
                  <div className="flex flex-col gap-1 pb-2 border-b border-line/40">
                    <span className="text-[10px] uppercase font-bold text-text-dim tracking-wider">
                      {t("toolbar_group_views_label")}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {onTogglePianoRoll && (
                        <button
                          type="button"
                          onClick={() => { onTogglePianoRoll(); setIsMoreMenuOpen(false); }}
                          className={`h-7 px-2 rounded border flex items-center gap-1 text-[11px] ${isPianoRollOpen ? "bg-accent/20 border-accent text-accent" : "bg-panel2 border-line text-text-sub"}`}
                        >
                          <Music2 className="w-3 h-3" /> {t("roll_toggle")}
                        </button>
                      )}
                      {onToggleConsole && (
                        <button
                          type="button"
                          onClick={() => { onToggleConsole(); setIsMoreMenuOpen(false); }}
                          className={`h-7 px-2 rounded border flex items-center gap-1 text-[11px] ${isConsoleOpen ? "bg-accent/20 border-accent text-accent" : "bg-panel2 border-line text-text-sub"}`}
                        >
                          <AudioLines className="w-3 h-3 text-accent" /> {t("console_float_toggle")}
                        </button>
                      )}
                      {onToggleKeyboardMode && (
                        <button
                          type="button"
                          onClick={() => { onToggleKeyboardMode(); setIsMoreMenuOpen(false); }}
                          className={`h-7 px-2 rounded border flex items-center gap-1 text-[11px] ${isKeyboardMode ? "bg-accent/20 border-accent text-accent" : "bg-panel2 border-line text-text-sub"}`}
                        >
                          <Keyboard className="w-3 h-3" /> {t("toolbar_keyboard_label")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { onToggleVelocityLane(); setIsMoreMenuOpen(false); }}
                        className={`h-7 px-2 rounded border flex items-center gap-1 text-[11px] ${isVelocityLaneOpen ? "bg-[#45e0c9]/20 border-[#45e0c9] text-[#45e0c9]" : "bg-panel2 border-line text-text-sub"}`}
                      >
                        <Sliders className="w-3 h-3 text-[#45e0c9]" /> {t("toolbar_velocity_label")}
                      </button>
                      {onToggleAnalyzer && (
                        <button
                          type="button"
                          onClick={() => { onToggleAnalyzer(); setIsMoreMenuOpen(false); }}
                          className={`h-7 px-2 rounded border flex items-center gap-1 text-[11px] ${isAnalyzerOpen ? "bg-accent/20 border-accent text-accent" : "bg-panel2 border-line text-text-sub"}`}
                        >
                          <Activity className="w-3 h-3 text-accent" /> {t("toolbar_analyzer_label")}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Section 4: 帮助 (U5) — the sequencer had no way into the help centre. */}
                  {onOpenHelp && (
                    <div className="flex flex-col gap-1 pb-2 border-b border-line/40">
                      <span className="text-[10px] uppercase font-bold text-text-dim tracking-wider">
                        {t("toolbar_group_help_label")}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          data-toolbar-id="sequencer-help"
                          data-testid="toolbar-help"
                          onClick={() => { onOpenHelp("sequencer"); setIsMoreMenuOpen(false); }}
                          className="h-7 px-2 rounded bg-panel2 border border-line text-text-sub hover:text-accent flex items-center gap-1 text-[11px]"
                        >
                          <HelpCircle className="w-3 h-3 text-accent" /> {t("toolbar_help_title")}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Section 3: 工程管理 */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold text-text-dim tracking-wider">
                      {t("toolbar_group_project_label")}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {onOpenProjectHub && (
                        <button
                          type="button"
                          onClick={() => { onOpenProjectHub(); setIsMoreMenuOpen(false); }}
                          className="h-7 px-2 rounded bg-panel2 border border-line text-text-sub hover:text-accent flex items-center gap-1 text-[11px]"
                        >
                          <FolderKanban className="w-3 h-3 text-accent" /> {t("toolbar_project_hub_title")}
                        </button>
                      )}
                      {onInspireMe && (
                        <button
                          type="button"
                          onClick={() => { onInspireMe(); setIsMoreMenuOpen(false); }}
                          className="h-7 px-2 rounded bg-panel2 border border-accent/40 text-accent flex items-center gap-1 text-[11px]"
                        >
                          <Sparkles className="w-3 h-3 text-accent" /> {t("toolbar_inspire_label")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { onShare(); setIsMoreMenuOpen(false); }}
                        className="h-7 px-2 rounded bg-panel2 border border-line text-text-sub hover:text-accent flex items-center gap-1 text-[11px]"
                      >
                        <Share2 className="w-3 h-3" /> {t("share_groove")}
                      </button>
                      <button
                        type="button"
                        onClick={() => { onToggleAdvancedControls(); setIsMoreMenuOpen(false); }}
                        className="h-7 px-2 rounded bg-panel2 border border-line text-text-sub hover:text-accent flex items-center gap-1 text-[11px]"
                      >
                        <SlidersHorizontal className="w-3 h-3" /> {t("toolbar_advanced_label")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
      </div>
    </div>
  );

  return (
    <>
      {transportStrip}
    <div data-testid="studio-toolbar" className="flex flex-col gap-1.5 min-w-0 w-full relative">
      {/* Top Toolbar Header (Item 8: 4 logical group pills with 8-12px spacing and responsive fold) */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2 sm:gap-2.5 pb-2 mb-1.5 border-b border-line-subtle select-none min-w-0">
        {/* Left Section: Transport Group & Edit Group */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 min-w-0 max-w-full">

          {/* Group 2: 编辑操作组 (Edit Operations Group) */}
          {!isToolbarFolded && (
            <div
              data-testid="toolbar-group-edit"
              className="flex items-center overflow-x-auto scrollbar-none gap-1 p-0.5 sm:p-1 rounded-xl bg-[#11131a]/85 border border-[#272b38] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.4)] max-w-full"
            >
              {shows("meter") && (
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
              )}

              {/* Undo & Redo */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  data-toolbar-id="undo" data-toolbar-tier="1"
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  className={`h-8 w-8 flex items-center justify-center rounded-lg border text-xs transition-colors ${
                    canUndo
                      ? "bg-panel2 text-text border-line hover:border-accent hover:text-accent cursor-pointer"
                      : "bg-bg text-text-dim border-[#181a20] cursor-not-allowed opacity-40"
                  }`}
                  title={t("toolbar_undo_title")}
                  aria-label={t("toolbar_undo_title")}
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  data-toolbar-id="redo" data-toolbar-tier="1"
                  type="button"
                  onClick={onRedo}
                  disabled={!canRedo}
                  className={`h-8 w-8 flex items-center justify-center rounded-lg border text-xs transition-colors ${
                    canRedo
                      ? "bg-panel2 text-text border-line hover:border-accent hover:text-accent cursor-pointer"
                      : "bg-bg text-text-dim border-[#181a20] cursor-not-allowed opacity-40"
                  }`}
                  title={t("toolbar_redo_title")}
                  aria-label={t("toolbar_redo_title")}
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quick Tools Dropdown */}
              {shows("quick-tools") && (
                <div className="flex items-center h-8 bg-panel2 hover:bg-[#14151a] border border-line hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
                <select
                  data-toolbar-id="quick-tools" data-toolbar-tier="3"
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
              )}
            </div>
          )}
        </div>

        {/* Right Section: View Switchers & Project Management */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 ml-auto min-w-0 max-w-full">
          {/* Group 3: 视图切换组 (View Switchers Group) */}
          {!isToolbarFolded && (
            <div
              data-testid="toolbar-group-views"
              className="flex items-center overflow-x-auto scrollbar-none gap-1 p-0.5 sm:p-1 rounded-xl bg-[#11131a]/85 border border-[#272b38] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.4)] max-w-full"
            >
              {/* Bar Navigation Select (shown when barCount > 1) */}
              {barCount > 1 && (
                <div className="flex items-center h-8 bg-panel2 hover:bg-[#14151a] border border-line hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
                  <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-1 select-none">
                    {t("toolbar_bar_label")}
                  </span>
                  <select
                    data-toolbar-id="bar-nav" data-toolbar-tier="1"
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
                data-toolbar-id="velocity-lane" data-toolbar-tier="1"
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

              {/* Piano Roll Toggle (item ⑦) */}
              {onTogglePianoRoll && shows("piano-roll-toggle") && (
                <button
                  data-toolbar-id="piano-roll-toggle" data-toolbar-tier="2"
                  onClick={onTogglePianoRoll}
                  data-testid="toolbar-piano-roll-toggle"
                  aria-pressed={isPianoRollOpen ?? false}
                  className={`h-8 flex items-center gap-1 px-2 sm:px-2.5 rounded-lg text-xs transition-colors border shrink-0 ${
                    isPianoRollOpen
                      ? "bg-accent/20 border-accent text-accent font-bold"
                      : "bg-panel2 border-line hover:border-[#3a3e48] text-text-sub hover:text-text"
                  }`}
                  title={t("roll_toggle_title")}
                >
                  <Music2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline font-['JetBrains_Mono']">{t("roll_toggle")}</span>
                </button>
              )}

              {/* Euclidean Rhythm Generator */}
              <button
                data-toolbar-id="euclid" data-toolbar-tier="1"
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
                  data-toolbar-id="analyzer" data-toolbar-tier="1"
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
              {onToggleConsole && shows("console") && (
                <button
                  data-toolbar-id="console" data-toolbar-tier="2"
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

              {/* Fullscreen Maximize / Minimize Toggle */}
              <button
                data-toolbar-id="maximize" data-toolbar-tier="1"
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
            </div>
          )}

          {/* Group 4: 工程管理组 (Project Management & I/O Group) — Tier 2/3: project context,
              exports and niche modes, so the group arrives with the advanced density. */}
          {!isToolbarFolded && shows("project-hub") && (
            <div
              data-testid="toolbar-group-project"
              className="flex items-center overflow-x-auto scrollbar-none gap-1 p-0.5 sm:p-1 rounded-xl bg-[#11131a]/85 border border-[#272b38] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.4)] max-w-full"
            >
              {/* Inspire Me controlled generative groove variation (P4-06) */}
              {onInspireMe && (
                <button
                  data-toolbar-id="inspire" data-toolbar-tier="2"
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
                    data-toolbar-id="import-midi" data-toolbar-tier="3"
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
                  data-toolbar-id="keyboard-mode" data-toolbar-tier="2"
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
                  data-toolbar-id="project-hub" data-toolbar-tier="2"
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
                  data-toolbar-id="genre-maker" data-toolbar-tier="3"
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

            </div>
          )}

            {/*
              Export has its own guard, and that is the fix for the report that started this.

              The menu used to sit *inside* the `project-hub` block, and `project-hub` is a Tier-2 control:
              so the only way to reach WAV export was to first turn on "advanced controls" — and on a phone
              or iPad the block is not rendered at all (`isToolbarFolded`), which is why there was no export
              entry on those surfaces. `export` is Tier 1 now, so this guard is normally true; the point of
              writing it out is that export's visibility stops being a side effect of an unrelated control.
            */}
            {shows("export") && (
              <ExportMenu
                isExportingAudio={isExportingAudio}
                onExportMidi={onExportMidi}
                onExportAls={onExportAls}
                onExportGroove={onExportGroove}
                onExportWav={onExportWav}
                onExportStems={onExportStems}
              />
            )}
        </div>
      </div>

      {/* Collapsible Advanced Settings Popover/Overlay */}
      {showAdvancedControls && (
        <div
          ref={advancedRef}
          className="absolute top-full left-0 right-0 z-40 flex items-center justify-between gap-3 p-2 bg-[#0a0b0e]/95 backdrop-blur-md border border-line shadow-2xl rounded-xl mt-1 text-xs select-none transition-all shrink-0 overflow-x-auto whitespace-nowrap scrollbar-none min-w-0 animate-in fade-in slide-in-from-top-1 duration-150"
        >
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

          {/* Master DSP Effects Rack Controls (P5-04 / D-05) */}
          {effectsRackState && onChangeEffectsRack && (
            <div className="flex items-center gap-1.5 bg-panel px-2 py-1 rounded-lg border border-line-subtle">
              <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-0.5 whitespace-nowrap">
                {t("toolbar_fx_label")}
              </span>

              {/* Filter: bypass + log cutoff + type */}
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
              <div className="flex items-center gap-1">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={fxCutoffToSliderPosition(effectsRackState.filterCutoff)}
                  onChange={(e) =>
                    onChangeEffectsRack({ filterCutoff: fxSliderPositionToCutoff(+e.target.value) })
                  }
                  className="w-16 sm:w-20 accent-accent cursor-pointer"
                  aria-label={t("toolbar_fx_filter_cutoff")}
                  aria-valuetext={`${effectsRackState.filterCutoff} Hz`}
                  title={t("toolbar_fx_filter_cutoff")}
                  data-fx-param="filterCutoff"
                />
                <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tabular-nums w-9 text-right">
                  {formatFxCutoff(effectsRackState.filterCutoff)}
                </span>
                <select
                  value={effectsRackState.filterType}
                  onChange={(e) =>
                    onChangeEffectsRack({ filterType: e.target.value as BiquadFilterType })
                  }
                  className="bg-transparent text-text font-['JetBrains_Mono'] text-[10px] focus:outline-none cursor-pointer"
                  aria-label={t("toolbar_fx_filter_type")}
                  title={t("toolbar_fx_filter_type")}
                  data-fx-param="filterType"
                >
                  {FX_FILTER_TYPES.map((type) => (
                    <option key={type} value={type} className="bg-panel text-text">
                      {type === "lowpass" ? "LP" : type === "highpass" ? "HP" : "BP"}
                    </option>
                  ))}
                </select>
              </div>
              {showFxAdvanced && (
                <div className="flex items-center gap-1">
                  <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim">Q</span>
                  <input
                    type="range"
                    min={0.5}
                    max={15}
                    step={0.1}
                    value={effectsRackState.filterQ}
                    onChange={(e) => onChangeEffectsRack({ filterQ: +e.target.value })}
                    className="w-14 sm:w-16 accent-accent cursor-pointer"
                    aria-label={t("toolbar_fx_filter_q")}
                    aria-valuetext={effectsRackState.filterQ.toFixed(1)}
                    title={t("toolbar_fx_filter_q")}
                    data-fx-param="filterQ"
                  />
                  <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tabular-nums w-6 text-right">
                    {effectsRackState.filterQ.toFixed(1)}
                  </span>
                </div>
              )}

              {/* Saturation: bypass + drive */}
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
              <div className="flex items-center gap-1">
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={0.1}
                  value={effectsRackState.saturationDrive}
                  onChange={(e) => onChangeEffectsRack({ saturationDrive: +e.target.value })}
                  className="w-14 sm:w-16 accent-amber-400 cursor-pointer"
                  aria-label={t("toolbar_fx_saturation_drive")}
                  aria-valuetext={`${effectsRackState.saturationDrive.toFixed(1)}x`}
                  title={t("toolbar_fx_saturation_drive")}
                  data-fx-param="saturationDrive"
                />
                <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tabular-nums w-7 text-right">
                  {effectsRackState.saturationDrive.toFixed(1)}x
                </span>
              </div>

              {/* Chorus: bypass + mix (+ rate in the advanced row) */}
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
              <div className="flex items-center gap-1">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={effectsRackState.chorusMix}
                  onChange={(e) => onChangeEffectsRack({ chorusMix: +e.target.value })}
                  className="w-14 sm:w-16 accent-cyan-400 cursor-pointer"
                  aria-label={t("toolbar_fx_chorus_mix")}
                  aria-valuetext={`${Math.round(effectsRackState.chorusMix * 100)}%`}
                  title={t("toolbar_fx_chorus_mix")}
                  data-fx-param="chorusMix"
                />
                <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tabular-nums w-8 text-right">
                  {Math.round(effectsRackState.chorusMix * 100)}%
                </span>
              </div>
              {showFxAdvanced && (
                <div className="flex items-center gap-1">
                  <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim">RATE</span>
                  <input
                    type="range"
                    min={0.2}
                    max={5}
                    step={0.1}
                    value={effectsRackState.chorusRate}
                    onChange={(e) => onChangeEffectsRack({ chorusRate: +e.target.value })}
                    className="w-14 sm:w-16 accent-cyan-400 cursor-pointer"
                    aria-label={t("toolbar_fx_chorus_rate")}
                    aria-valuetext={`${effectsRackState.chorusRate.toFixed(1)} Hz`}
                    title={t("toolbar_fx_chorus_rate")}
                    data-fx-param="chorusRate"
                  />
                  <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tabular-nums w-10 text-right">
                    {effectsRackState.chorusRate.toFixed(1)}Hz
                  </span>
                </div>
              )}

              {/* Bitcrusher: bypass + bit depth */}
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
              <div className="flex items-center gap-1">
                <input
                  type="range"
                  min={4}
                  max={16}
                  step={1}
                  value={effectsRackState.bitDepth}
                  onChange={(e) => onChangeEffectsRack({ bitDepth: +e.target.value })}
                  className="w-14 sm:w-16 accent-fuchsia-400 cursor-pointer"
                  aria-label={t("toolbar_fx_bit_depth")}
                  aria-valuetext={`${effectsRackState.bitDepth} bit`}
                  title={t("toolbar_fx_bit_depth")}
                  data-fx-param="bitDepth"
                />
                <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tabular-nums w-9 text-right">
                  {effectsRackState.bitDepth}bit
                </span>
              </div>

              {/* D-05 secondary row: filterQ / chorusRate live behind this toggle */}
              <button
                type="button"
                onClick={() => setShowFxAdvanced((v) => !v)}
                aria-expanded={showFxAdvanced}
                aria-label={t("toolbar_fx_advanced")}
                title={t("toolbar_fx_advanced")}
                className={`h-6 px-1.5 rounded text-[10px] font-['JetBrains_Mono'] border transition-colors ${
                  showFxAdvanced
                    ? "bg-accent/20 border-accent text-accent font-bold"
                    : "bg-[#17181c] border-line text-text-sub hover:text-text"
                }`}
              >
                ADV
              </button>
            </div>
          )}

          {/* Audio settings entry point. Opens the panel that holds the engine-level,
              non-per-track settings: GS-1 voices, master level, hearing protection and
              latency compensation. The GS-1 quick toggle below stays for one-click access. */}
          {onOpenAudioSettings && (
            <button
              type="button"
              onClick={onOpenAudioSettings}
              data-testid="studio-audio-settings-open"
              aria-label={t("audio_settings_open")}
              title={t("audio_settings_open")}
              className="flex items-center gap-1.5 bg-panel px-2 py-1 rounded-lg border border-line-subtle text-text-sub hover:text-text transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="font-['JetBrains_Mono'] text-[10px] tracking-wider uppercase whitespace-nowrap">
                {t("audio_settings_open")}
              </span>
            </button>
          )}

          {/* GS-1 voices for chords/lead (P6). Beside the haptics switch on purpose: both are
              "how should the audio engine behave" settings, not per-track controls. */}
          {onToggleGs1 && (
          <div className="flex items-center gap-1.5 bg-panel px-2 py-1 rounded-lg border border-line-subtle">
            <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-0.5 whitespace-nowrap">
              {t("toolbar_gs1_label")}
            </span>
            <button
              type="button"
              onClick={onToggleGs1}
              data-testid="studio-gs1-toggle"
              aria-pressed={gs1Enabled}
              className={`h-6 px-2 rounded text-[10px] font-['JetBrains_Mono'] border transition-colors ${
                gs1Enabled
                  ? "bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold"
                  : "bg-[#17181c] border-line text-text-sub hover:text-text"
              }`}
              title={t("toolbar_gs1_title")}
            >
              {gs1Enabled ? "ON" : "OFF"}
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
    </>
  );
});
