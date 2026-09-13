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
} from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { DrumKitType, EffectsRackState } from "../../audio/AudioEngine";
import { CustomKickPreset, loadCustomKickPresets } from "../../audio/AnatomyKickEngine";

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
  onQuickAction: (action: "dup_bar1" | "humanize" | "clear_all" | "reset_preset" | "clear_saved") => void;
  onExportMidi: () => void;
  onExportAls?: () => void;
  onExportWav?: () => void;
  onExportStems?: () => void;
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
}

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
  onExportWav,
  onExportStems,
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
  const [exportOpen, setExportOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  const [customKicks, setCustomKicks] = useState<CustomKickPreset[]>(() => loadCustomKickPresets());

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
                title={isZh ? "展开风格档案" : "Expand dossier"}
              >
                <PanelLeftOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isZh ? "风格" : "Info"}</span>
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
              {isPlaying ? (isZh ? "暂停" : "PAUSE") : (isZh ? "播放" : "PLAY")}
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
              title={isZh ? "节奏速度 (40-240 BPM)" : "Tempo (40-240 BPM)"}
            />
          </div>

          {/* Tap Tempo Button (P3-07) */}
          {onTapTempo && (
            <button
              type="button"
              onClick={onTapTempo}
              className="h-8 px-2 bg-panel2 hover:bg-[#14151a] border border-line hover:border-accent rounded-lg text-xs font-['JetBrains_Mono'] text-text-sub hover:text-accent transition-colors shrink-0 active:scale-95"
              title={isZh ? "点击测速 (连续点击2次以上计算 BPM)" : "Tap Tempo (Tap ≥2 times to calculate BPM)"}
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
              title={isZh ? "节拍器开关" : "Toggle Metronome"}
              aria-label={isZh ? "节拍器" : "Metronome"}
            >
              <Bell className="w-3.5 h-3.5" />
              <span className="hidden xl:inline font-['JetBrains_Mono']">{isZh ? "节拍" : "METRO"}</span>
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
              title={isZh ? "4拍预备拍开关 (播放开始前倒数 1-2-3-4)" : "Toggle 4-Beat Count-In"}
              aria-label={isZh ? "预备拍" : "Count-In"}
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
              title={isZh ? "实时录制模式开关 (录制打击垫/键盘触发)" : "Toggle Live Recording (Record triggers into grid)"}
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
                {isZh ? "鼓机" : "KIT"}
              </span>
              <select
                value={drumKit}
                onChange={(e) => onChangeDrumKit(e.target.value as DrumKitType)}
                className="bg-transparent text-text font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
                aria-label={isZh ? "选择硬件鼓机模型与底鼓设计" : "Select Drum Machine & Kick Design"}
              >
                <optgroup label={isZh ? "经典硬件鼓机" : "Hardware Kits"}>
                  <option value="808" className="bg-panel text-text">TR-808 (Analog)</option>
                  <option value="909" className="bg-panel text-text">TR-909 (Punch)</option>
                  <option value="acoustic" className="bg-panel text-text">Acoustic (Warm)</option>
                  <option value="cyber" className="bg-panel text-text">Cyber (Wave)</option>
                </optgroup>
                <optgroup label={isZh ? "底鼓设计官方预设" : "Kick Design Presets"}>
                  <option value="kick:berlin-orphic" className="bg-panel text-text">
                    {isZh ? "底鼓: 柏林奥菲斯巨柱" : "Kick: Berlin Orphic"}
                  </option>
                  <option value="kick:detroit-mechanical" className="bg-panel text-text">
                    {isZh ? "底鼓: 底特律机械脉冲" : "Kick: Detroit Mechanical"}
                  </option>
                  <option value="kick:somatic-808-gravity" className="bg-panel text-text">
                    {isZh ? "底鼓: 躯体 808 内脏引力" : "Kick: Visceral 808"}
                  </option>
                  <option value="kick:industrial-revolt" className="bg-panel text-text">
                    {isZh ? "底鼓: 工业阶级抵抗" : "Kick: Industrial Revolt"}
                  </option>
                  <option value="kick:acoustic-beater-skin" className="bg-panel text-text">
                    {isZh ? "底鼓: 真皮鼓锤敲击" : "Kick: Acoustic Skin"}
                  </option>
                  <option value="kick:neural-click-clock" className="bg-panel text-text">
                    {isZh ? "底鼓: 神经时钟微瞬态" : "Kick: Neural Click"}
                  </option>
                </optgroup>
                {customKicks.length > 0 && (
                  <optgroup label={isZh ? "自定义底鼓预设" : "Custom Kick Presets"}>
                    {customKicks.map((k) => (
                      <option key={k.id} value={`kick:${k.id}`} className="bg-panel text-text">
                        {isZh ? `自定义: ${k.name}` : `Custom: ${k.name}`}
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
                isZh
                  ? `只听鼓组轨道 (快捷键 D · 当前: ${isDrumsOnly ? "已开启" : "已关闭"})`
                  : `Drums Only (Key: D · Current: ${isDrumsOnly ? "ON" : "OFF"})`
              }
              aria-label={isZh ? "只听鼓组模式" : "Drums Only Mode"}
              aria-pressed={isDrumsOnly}
            >
              <Disc3 className={`w-3.5 h-3.5 ${isDrumsOnly ? "text-accent animate-spin-slow" : "text-text-dim"}`} />
              <span className="font-semibold">{isZh ? "只听鼓组" : "DRUMS"}</span>
              {isDrumsOnly && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
            </button>
          )}

          {/* Meter Select Dropdown */}
          <div className="flex items-center h-8 bg-panel2 hover:bg-[#14151a] border border-line hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
            <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-1 select-none">
              {isZh ? "拍号" : "METER"}
            </span>
            <select
              value={timeSignature}
              onChange={(e) => onChangeTimeSignature(e.target.value)}
              className="bg-transparent text-text font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
              aria-label={isZh ? "选择拍号" : "Select time signature"}
            >
              <option value="4/4" className="bg-panel text-text">4/4 {isZh ? "(四四拍 · 4格)" : "(Common)"}</option>
              <option value="2/4" className="bg-panel text-text">2/4 {isZh ? "(二四拍 · 2格)" : "(March)"}</option>
              <option value="3/4" className="bg-panel text-text">3/4 {isZh ? "(三四拍 · 3格)" : "(Waltz)"}</option>
              <option value="2/2" className="bg-panel text-text">2/2 {isZh ? "(二二拍 · 2格)" : "(Cut Time)"}</option>
              <option value="6/8" className="bg-panel text-text">6/8 {isZh ? "(六八拍 · 3格)" : "(Compound)"}</option>
              <option value="3/8" className="bg-panel text-text">3/8 {isZh ? "(三八拍 · 3格)" : "(Single)"}</option>
              <option value="9/8" className="bg-panel text-text">9/8 {isZh ? "(九八拍 · 3格)" : "(Triple)"}</option>
              <option value="12/8" className="bg-panel text-text">12/8 {isZh ? "(十二八 · 3格)" : "(Shuffle)"}</option>
              <option value="5/4" className="bg-panel text-text">5/4 {isZh ? "(五四拍 · 5格)" : "(Take Five)"}</option>
              <option value="7/8" className="bg-panel text-text">7/8 {isZh ? "(七八拍 · 7格)" : "(Balkan)"}</option>
            </select>
          </div>

          {/* Quantize Resolution Select Dropdown */}
          <div className="flex items-center h-8 bg-panel2 hover:bg-[#14151a] border border-line hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
            <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-1 select-none">
              {isZh ? "精度" : "GRID"}
            </span>
            <select
              value={resolution}
              onChange={(e) => onChangeResolution(e.target.value as "1/8" | "1/16" | "1/32")}
              className="bg-transparent text-text font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
              aria-label={isZh ? "选择量化精度" : "Select quantization resolution"}
            >
              <option value="1/16" className="bg-panel text-text">1/16 {isZh ? "(标准)" : "(Default)"}</option>
              <option value="1/8" className="bg-panel text-text">1/8 {isZh ? "(半速)" : "(Half)"}</option>
              <option value="1/32" className="bg-panel text-text">1/32 {isZh ? "(双速)" : "(Double)"}</option>
            </select>
          </div>

          {/* Step Length Select Dropdown */}
          <div className="flex items-center h-8 bg-panel2 hover:bg-[#14151a] border border-line hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
            <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-1 select-none">
              {isZh ? "长度" : "LEN"}
            </span>
            <select
              value={stepCount}
              onChange={(e) => onChangeStepCount(Number(e.target.value))}
              className="bg-transparent text-text font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
              aria-label={isZh ? "选择步长与小节" : "Select step length"}
            >
              <option value={16} className="bg-panel text-text">16 {isZh ? "步 (1小节)" : "Steps (1 Bar)"}</option>
              <option value={32} className="bg-panel text-text">32 {isZh ? "步 (2小节)" : "Steps (2 Bars)"}</option>
              <option value={48} className="bg-panel text-text">48 {isZh ? "步 (3小节)" : "Steps (3 Bars)"}</option>
              <option value={64} className="bg-panel text-text">64 {isZh ? "步 (4小节)" : "Steps (4 Bars)"}</option>
              {![16, 32, 48, 64].includes(stepCount) && (
                <option value={stepCount} className="bg-panel text-text">
                  {stepCount} {isZh ? `步 (${barCount}小节)` : `Steps (${barCount} Bars)`}
                </option>
              )}
            </select>
          </div>

          {/* Tool Mode Select Dropdown */}
          <div
            className="flex items-center h-8 bg-panel2 hover:bg-[#14151a] border border-line hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0"
            title={
              mobileEditMode === "step"
                ? (isZh ? "普通步进：点按开关音符，长按打开参数锁" : "Step Note: Tap to toggle, long press for P-Locks")
                : mobileEditMode === "accent"
                ? (isZh ? "重音模式：点按步进切换最大重音 (Vel 127)" : "Accent: Tap to toggle max accent velocity")
                : mobileEditMode === "ratchet"
                ? (isZh ? "连音滚奏：点按步进循环细分 (1x-4x)" : "Ratchet: Tap to cycle ratchets")
                : mobileEditMode === "pitch"
                ? (isZh ? "音高选择：点按旋律步进选取音高" : "Pitch: Tap to pick pitch")
                : (isZh ? "参数锁：点按步进调出参数锁面板" : "P-Locks: Tap to open parameters menu")
            }
          >
            <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-1 select-none">
              {isZh ? "工具" : "TOOL"}
            </span>
            <select
              value={mobileEditMode}
              onChange={(e) => onChangeMobileEditMode(e.target.value as MobileEditMode)}
              className="bg-transparent text-text font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
              aria-label={isZh ? "选择步进编辑工具" : "Select step edit mode"}
            >
              <option value="step" className="bg-panel text-text">● {isZh ? "普通步进" : "Step Note"}</option>
              <option value="accent" className="bg-panel text-text">▲ {isZh ? "重音 (Vel 127)" : "Accent"}</option>
              <option value="ratchet" className="bg-panel text-text">⫸ {isZh ? "连音滚奏" : "Ratchet"}</option>
              <option value="pitch" className="bg-panel text-text">♩ {isZh ? "音高选择" : "Pitch Picker"}</option>
              <option value="plocks" className="bg-panel text-text">⚙ {isZh ? "参数锁" : "P-Locks"}</option>
            </select>
          </div>

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
                title={isZh ? "切换至 Pattern A" : "Switch to Pattern A"}
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
                title={isZh ? "切换至 Pattern B" : "Switch to Pattern B"}
              >
                {blindCompare ? "?2" : "PTN B"}
              </button>
              {onCopySlot && (
                <button
                  type="button"
                  onClick={() => onCopySlot(activeSlot === "A" ? "A" : "B", activeSlot === "A" ? "B" : "A")}
                  className="h-7 px-1.5 text-text-sub hover:text-accent transition-colors ml-0.5"
                  title={
                    isZh
                      ? activeSlot === "A"
                        ? "复制 A 到 B"
                        : "复制 B 到 A"
                      : activeSlot === "A"
                      ? "Copy A to B"
                      : "Copy B to A"
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
              title={isZh ? "Song Mode：A/B 链式循环连续播放" : "Song Mode: Chain A and B patterns"}
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
              title={isZh ? "A/B 盲听对比评估模式" : "A/B Blind Listening Comparison Mode"}
              aria-label="Blind Test Mode"
            >
              {blindCompare ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span className="hidden md:inline font-['JetBrains_Mono']">{isZh ? "盲听" : "BLIND"}</span>
            </button>
          )}
        </div>

        {/* Right Section: Bar Navigation & Pro Operations */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 ml-auto">
          {/* Bar Navigation Select (shown when barCount > 1) */}
          {barCount > 1 && (
            <div className="flex items-center h-8 bg-panel2 hover:bg-[#14151a] border border-line hover:border-[#3a3e48] rounded-lg px-2 text-xs transition-colors shrink-0">
              <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-1 select-none">
                {isZh ? "小节" : "BAR"}
              </span>
              <select
                value={viewedBar}
                onChange={(e) => onSelectBar(Number(e.target.value))}
                className="bg-transparent text-text font-['JetBrains_Mono'] text-xs font-semibold focus:outline-none cursor-pointer"
                aria-label={isZh ? "跳转到小节" : "Jump to bar"}
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
            title={isZh ? "力度编辑抽屉 (快捷键 V)" : "Toggle velocity drawer (Key: V)"}
          >
            <Sliders className="w-3.5 h-3.5 text-[#45e0c9]" />
            <span className="hidden sm:inline font-['JetBrains_Mono']">{isZh ? "力度" : "VEL"}</span>
          </button>

          {/* Euclidean Rhythm Generator */}
          <button
            onClick={onOpenEuclidean}
            className="h-8 flex items-center gap-1 px-2 sm:px-2.5 bg-panel2 border border-line hover:border-accent/60 rounded-lg text-xs text-text-sub hover:text-accent transition-colors shrink-0"
            title={isZh ? "欧几里得律动生成器 (快捷键 E)" : "Euclidean rhythm generator (Key: E)"}
          >
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span className="hidden sm:inline font-['JetBrains_Mono']">{isZh ? "欧几里得" : "EUCLID"}</span>
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
              title={isZh ? "全景声谱与李萨如图示波器 (快捷键 O)" : "Panoramic Spectrogram & Lissajous Phase Scope (Key: O)"}
              aria-label="Toggle Master Analyzer"
            >
              <Activity className="w-3.5 h-3.5 text-accent" />
              <span className="hidden sm:inline font-['JetBrains_Mono']">{isZh ? "示波器" : "SCOPE"}</span>
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
              title={isZh ? "撤销 (Ctrl+Z)" : "Undo (Ctrl+Z)"}
              aria-label={isZh ? "撤销 (Ctrl+Z)" : "Undo (Ctrl+Z)"}
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
              title={isZh ? "重做 (Ctrl+Shift+Z)" : "Redo (Ctrl+Shift+Z)"}
              aria-label={isZh ? "重做 (Ctrl+Shift+Z)" : "Redo (Ctrl+Shift+Z)"}
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
                ? (isZh ? "退出全屏 (Esc)" : "Exit Fullscreen (Esc)")
                : (isZh ? "全屏沉浸模式 (Esc 退出)" : "Fullscreen (Esc to exit)")
            }
          >
            {isEditorMaximized ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-accent" />
                <span className="hidden sm:inline font-['JetBrains_Mono']">
                  {isZh ? "退出" : "Exit"}
                </span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-accent" />
                <span className="hidden sm:inline font-['JetBrains_Mono']">
                  {isZh ? "全屏" : "Full"}
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
              aria-label={isZh ? "快捷操作" : "Quick actions"}
            >
              <option value="" disabled className="bg-panel text-text-sub">
                ⚡ {isZh ? "操作..." : "Tools..."}
              </option>
              <option value="dup_bar1" className="bg-panel text-text">
                📋 {isZh ? "复制小节1至整段" : "Duplicate Bar 1"}
              </option>
              <option value="humanize" className="bg-panel text-text">
                ✨ {isZh ? "人性化力度抖动" : "Humanize Velocity"}
              </option>
              <option value="clear_all" className="bg-panel text-[#ff5964]">
                🗑️ {isZh ? "清空全部步进" : "Clear All Steps"}
              </option>
              <option value="reset_preset" className="bg-panel text-text">
                🔄 {isZh ? "恢复默认预设" : "Reset Preset"}
              </option>
              <option value="clear_saved" className="bg-panel text-[#f87171]">
                🧹 {isZh ? "清除本地工程缓存" : "Clear Saved Project"}
              </option>
            </select>
          </div>

          {/* Inspire Me controlled generative groove variation (P4-06) */}
          {onInspireMe && (
            <button
              onClick={onInspireMe}
              className="h-8 px-2 sm:px-2.5 flex items-center gap-1 text-xs text-accent hover:bg-accent/15 border border-accent/40 rounded-lg transition-colors bg-panel2 shrink-0 font-['JetBrains_Mono']"
              title={isZh ? "受控灵感变异 (Inspire Me - 保留底鼓骨架，变奏踩镲/打击乐/低音)" : "Inspire Me controlled variation"}
            >
              <Sparkles className="w-3.5 h-3.5 text-accent animate-pulse" />
              <span className="hidden xl:inline">{isZh ? "灵感变异" : "Inspire"}</span>
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
                title={isZh ? "导入标准 MIDI 文件 (.mid)" : "Import MIDI file (.mid)"}
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">{isZh ? "导入" : "Import"}</span>
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
                isZh
                  ? `电脑键盘演奏 (1-8轨 / Z-M键)${midiDeviceCount > 0 ? ` · 已连接 ${midiDeviceCount} 台 MIDI 设备` : ""}`
                  : `Computer keyboard play (1-8 tracks / Z-M keys)${midiDeviceCount > 0 ? ` · ${midiDeviceCount} MIDI device(s) connected` : ""}`
              }
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span className="hidden 2xl:inline">{isZh ? "演奏" : "Play"}</span>
              {midiDeviceCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" title="MIDI Connected" />
              )}
            </button>
          )}

          {/* Export Menu Dropdown (P4-01 & P4-02: MIDI, Master WAV, and Stems ZIP) */}
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
                      <span className="font-medium text-text">{isZh ? "导出 MIDI 文件" : "Export MIDI"}</span>
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
                      <span className="font-medium text-text">{isZh ? "导出 Ableton 工程" : "Export Ableton Set"}</span>
                      <span className="text-[10px] text-text-dim">.als (8 轨独立 MIDI Clip)</span>
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
                      <span className="font-medium text-text">{isZh ? "导出母带 WAV" : "Export Master WAV"}</span>
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
                      <span className="font-medium text-text">{isZh ? "导出分轨 Stems 打包" : "Export Stems Pack"}</span>
                      <span className="text-[10px] text-text-dim">8 轨独立 WAV 打包 (.zip)</span>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

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
            title={isZh ? "展开/收起高级设置 (摇摆度、步进微调、平移)" : "Toggle advanced settings"}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden xl:inline font-['JetBrains_Mono']">
              {isZh ? "高级" : "More"}
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
              {isZh ? "步数微调:" : "FINE STEPS:"}
            </span>
            <button
              onClick={() => onRemoveSteps(groupSize)}
              className="h-6 px-1.5 flex items-center justify-center rounded bg-[#17181c] hover:bg-line text-text-sub hover:text-text border border-line font-['JetBrains_Mono'] text-[10px]"
              title={isZh ? `删减 ${groupSize} 步 (1组)` : `Remove ${groupSize} steps`}
            >
              -{groupSize}
            </button>
            <button
              onClick={() => onAddSteps(groupSize)}
              className="h-6 px-1.5 flex items-center justify-center rounded bg-[#17181c] hover:bg-line text-text-sub hover:text-text border border-line font-['JetBrains_Mono'] text-[10px]"
              title={isZh ? `添加 ${groupSize} 步 (1组)` : `Add ${groupSize} steps`}
            >
              +{groupSize}
            </button>
            <button
              onClick={() => onAddSteps(stepsPerBar)}
              className="h-6 px-1.5 flex items-center justify-center rounded bg-[#17181c] hover:bg-line text-accent border border-line font-['JetBrains_Mono'] text-[10px]"
              title={isZh ? `添加 1 小节 (+${stepsPerBar} 步)` : `Add 1 Bar (+${stepsPerBar} steps)`}
            >
              +1 Bar
            </button>
            <button
              onClick={() => onAddSteps(stepsPerBar * 2)}
              className="h-6 px-1.5 flex items-center justify-center rounded bg-[#17181c] hover:bg-line text-accent border border-line font-['JetBrains_Mono'] text-[10px] hidden md:inline-flex"
              title={isZh ? `添加 2 小节 (+${stepsPerBar * 2} 步)` : `Add 2 Bars (+${stepsPerBar * 2} steps)`}
            >
              +2 Bars
            </button>
          </div>

          {/* Master DSP Effects Rack Controls (P5-04) */}
          {effectsRackState && onChangeEffectsRack && (
            <div className="flex items-center gap-1.5 bg-panel px-2 py-1 rounded-lg border border-line-subtle">
              <span className="font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-wider uppercase mr-0.5 whitespace-nowrap">
                {isZh ? "母带DSP:" : "FX:"}
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
                title={isZh ? "高阶谐振滤波器" : "Resonant Filter"}
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
                title={isZh ? "磁带饱和温暖感 (Tanh Soft Clip)" : "Tape Saturation"}
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
                title={isZh ? "立体声合唱空间化" : "Stereo Chorus"}
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
                title={isZh ? "低比特数字失真 (Bitcrusher)" : "Lo-Fi Bitcrusher"}
              >
                LO-FI
              </button>
            </div>
          )}

          {/* Pan Navigation */}
          <div className="flex items-center gap-1.5 ml-auto text-text-dim">
            <span className="hidden lg:inline font-['JetBrains_Mono'] text-[10px] whitespace-nowrap">
              {isZh ? "滚轮/标尺拖拽可平移" : "Wheel/drag to pan"}
            </span>
            <button
              onClick={() => onScrollByPixels(-240)}
              className="w-6 h-6 rounded bg-panel border border-line hover:border-accent text-text-sub hover:text-accent flex items-center justify-center text-xs transition-colors"
              title={isZh ? "向左滚动" : "Scroll left"}
            >
              ◀
            </button>
            <button
              onClick={() => onScrollByPixels(240)}
              className="w-6 h-6 rounded bg-panel border border-line hover:border-accent text-text-sub hover:text-accent flex items-center justify-center text-xs transition-colors"
              title={isZh ? "向右滚动" : "Scroll right"}
            >
              ▶
            </button>
            <button
              onClick={onToggleAdvancedControls}
              className="ml-2 text-[10px] text-text-sub hover:text-text font-['JetBrains_Mono'] px-1.5 py-0.5 rounded bg-[#17181c] border border-line"
              title={isZh ? "收起设置抽屉" : "Close"}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
