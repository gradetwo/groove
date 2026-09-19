import React, { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { SequencerPattern } from "../../types/genre";
import { DrumKitType, EffectsRackState } from "../../audio/AudioEngine";
import type { SequencerAction, SequencerState } from "../../features/sequencer/useSequencerStore";
import type { Language } from "../../i18n/LanguageContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { isDrumTrack } from "../../utils/trackUtils";
import { resolveChordTreatment } from "../../data/genreVoicing";
import { Ruler } from "./Ruler";
import { TrackRow } from "./TrackRow";
import { Toolbar, MobileEditMode } from "./Toolbar";
import { MobileTransportBar } from "./MobileTransportBar";
import { MobileStudioSheet, buildStudioSheetGroups } from "./MobileStudioSheet";
import { VelocityLane, type ParameterDimension } from "./VelocityLane";
import { PianoRollLane } from "./PianoRollLane";
import { MasterAnalyzerSuite } from "../analyzer/MasterAnalyzerSuite";
import { DEMO_TRACKS_CONFIG } from "./trackConfig";
import { APP_VERSION } from "../../version";

export interface SequencerPanelProps {
  pattern: SequencerPattern;
  seqState: SequencerState;
  isPlaying: boolean;
  viewedBar: number;
  barCount: number;
  stepsPerBar: number;
  groupSize: number;
  anySolo: boolean;
  velocityActiveTrackIdx: number;
  isSidebarCollapsed: boolean;
  isEditorMaximized: boolean;
  isVelocityLaneOpen: boolean;
  isAnalyzerOpen: boolean;
  language: Language;
  isZh: boolean;
  canUndo: boolean;
  canRedo: boolean;
  genreName: string;
  genreAccent: string;
  activeProjectName?: string;
  isDrumsOnly: boolean;
  isRecordArmed: boolean;
  drumKit: DrumKitType;
  effectsRackState: EffectsRackState;
  isExportingAudio: boolean;
  isKeyboardMode: boolean;
  midiDeviceCount: number;
  mobileEditMode: MobileEditMode;
  showAdvancedControls: boolean;
  isTouchDevice: boolean;
  isRulerDragging: boolean;
  matrixContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  playheadBeamRef: React.MutableRefObject<HTMLDivElement | null>;
  analyser: AnalyserNode | null;
  analyserL: AnalyserNode | null;
  analyserR: AnalyserNode | null;
  onOpenGenreMaker?: () => void;
  onChangeMobileEditMode: (mode: MobileEditMode) => void;
  onCloseAnalyzer: () => void;
  /** Feature #2: float the mixing console over the studio. */
  isConsoleOpen?: boolean;
  onToggleConsole?: () => void;

  // Toolbar / transport / export handlers
  onTogglePlay: () => void;
  onChangeBpm: (bpm: number) => void;
  onChangeSwing: (swing: number) => void;
  onChangeTimeSignature: (sig: string) => void;
  onChangeResolution: (res: "1/8" | "1/16" | "1/32") => void;
  onChangeStepCount: (count: number) => void;
  onChangeDrumKit: (kit: DrumKitType) => void;
  onToggleDrumsOnly: () => void;
  onToggleRecordArmed: () => void;
  onChangeEffectsRack: (partial: Partial<EffectsRackState>) => void;
  onSelectBar: (barIdx: number) => void;
  onToggleVelocityLane: () => void;
  onOpenEuclidean: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleMaximize: () => void;
  onToggleSidebar: () => void;
  onToggleAdvancedControls: () => void;
  onQuickAction: (
    action: "dup_bar1" | "humanize" | "clear_all" | "reset_preset" | "clear_saved" | "open_hub"
  ) => void;
  onExportMidi: () => void;
  onExportAls: () => Promise<void>;
  onExportGroove: () => void;
  onOpenProjectHub: () => void;
  onExportWav: () => Promise<void>;
  onExportStems: () => Promise<void>;
  onImportMidi: (file: File) => Promise<void>;
  onInspireMe: () => void;
  onToggleKeyboardMode: () => void;
  onShare: () => void;
  onAddSteps: (count: number) => void;
  onRemoveSteps: (count: number) => void;
  onScrollByPixels: (delta: number) => void;
  onSwitchSlot: (slot: "A" | "B") => void;
  onCopySlot: (from: "A" | "B", to: "A" | "B") => void;
  onToggleSongMode: () => void;
  onToggleBlindCompare: () => void;
  onToggleMetronome: () => void;
  onToggleCountIn: () => void;
  onToggleAnalyzer: () => void;
  onTapTempo: () => void;

  // Grid + ruler viewport
  handleGridPointerDown: (e: React.PointerEvent) => void;
  handleGridPointerMove: (e: React.PointerEvent) => void;
  handleGridPointerUp: (e: React.PointerEvent) => void;
  handleGridContextMenu: (e: React.MouseEvent) => void;
  handleSelectLoopRange: (rng: [number, number] | null) => void;
  handleRulerPointerDown: (e: React.PointerEvent) => void;
  handleRulerPointerMove: (e: React.PointerEvent) => void;
  handleRulerPointerUp: (e: React.PointerEvent) => void;

  // Track rows
  onAudition: (trackIdx: number, trackName: string) => void;
  onCycleLength: (trackIdx: number) => void;
  onToggleMute: (trackIdx: number) => void;
  onToggleSolo: (trackIdx: number) => void;
  onChangeTrackVolume: (trackIdx: number, vol: number) => void;
  onOpenVelocity: (trackIdx: number) => void;
  /** E-10: opens the per-track inspector (mix / insert chain / timbre). */
  onOpenInspector: (trackIdx: number) => void;
  /** P6: GS-1 voices for chords/lead, reflected from the engine's persisted setting. */
  gs1Enabled: boolean;
  onToggleGs1: () => void;
  /** v2.0.17: opens the audio settings panel (level / protection / latency / GS-1). */
  onOpenAudioSettings?: () => void;
  /**
   * Phone layout. When true the 64-button desktop toolbar is replaced by the compact transport
   * bar; the grid, track rows and lane drawers are the same components either way.
   */
  isPhone?: boolean;
  /**
   * A phone held sideways: the shape with 390 px of total height, where the two fixed bars cost
   * 29 % of the viewport. Forwarded to the mobile transport so it can drop bar navigation.
   */
  isShortLandscape?: boolean;
  /**
   * The phone's navigation bar, handed down so the studio can put it on the *same* bottom row as
   * the transport instead of stacking two full-width bars.
   *
   * On a 390 px-tall landscape viewport the two stacked bars cost 102 px — 26 % — while there is
   * 844 px of width doing nothing. Sharing one row gives the vertical space back without removing
   * a single control, which is why the bar is passed in rather than reimplemented here: `App` owns
   * navigation and this only decides where the row is put.
   */
  bottomBar?: React.ReactNode;
  /** Opens the phone sheet, which holds everything the compact bar leaves out. */
  onOpenMobileSheet?: () => void;
  /** Opens the Chords view — the phone's replacement for the piano roll. */
  onOpenChords?: () => void;
  /** Piano roll (item ⑦): a pitch-grid editor over the same pattern the step grid edits. */
  commit?: (action: SequencerAction) => void;
  isPianoRollOpen?: boolean;
  pianoRollTrackIdx?: number;
  onSelectPianoRollTrack?: (trackIdx: number) => void;
  onOpenPianoRoll?: (trackIdx: number) => void;
  onClosePianoRoll?: () => void;
  onTogglePianoRoll?: () => void;
  onAuditionRollNote?: (trackIdx: number, midi: number, velocity: number, gate: number) => void;
  /** Plays a complete voicing as one chord, so a chords track is not re-voiced per member. */
  onPreviewChord?: (trackIdx: number, notes: number[], velocity: number, durationSeconds?: number) => void;
  /** Isolated preview of one lane: returns whether the engine accepted the scope. */
  onStartRollPreview?: (trackIdx: number, fromStep: number, toStep: number) => boolean;
  onStopRollPreview?: () => void;
  isRollPreviewing?: boolean;
  onOpenHelp?: (chapterId?: string) => void;
  /** Which row the inspector currently shows, for selected-header styling. */
  inspectorTrackIdx?: number | null;
  onShiftTrack: (trackIdx: number, dir: -1 | 1) => void;
  onSmartFill: (trackIdx: number) => void;
  onClearTrack: (trackIdx: number) => void;
  onMoveTrackUp: (trackIdx: number) => void;
  onMoveTrackDown: (trackIdx: number) => void;
  onChangeTrackPan: (trackIdx: number, pan: number) => void;
  onChangeTrackSwing: (trackIdx: number, swing: number) => void;

  // Velocity drawer
  onSelectParameterDimension: (dim: ParameterDimension) => void;
  onSelectVelocityTrack: (idx: number) => void;
  onUpdateVelocity: (trackIdx: number, stepIdx: number, newVel: number) => void;
  onBatchUpdateVelocity: (trackIdx: number, newVelocities: number[]) => void;
  onUpdateProbability: (trackIdx: number, stepIdx: number, p: number) => void;
  onBatchUpdateProbability: (trackIdx: number, probs: number[]) => void;
  onUpdateRatchet: (trackIdx: number, stepIdx: number, r: number) => void;
  onBatchUpdateRatchet: (trackIdx: number, ratchets: number[]) => void;
  onUpdateGate: (trackIdx: number, stepIdx: number, g: number) => void;
  onBatchUpdateGate: (trackIdx: number, gates: number[]) => void;
  onCloseVelocityLane: () => void;
}

/**
 * A-02: the right-hand sequencer column — unified toolbar, master analyzer dock,
 * the 8-track step matrix with pointer delegation, the collapsible velocity
 * drawer and the bottom shortcut hint. JSX, classes, ARIA and handlers are moved
 * verbatim from `StudioView`; the container only supplies state + handler props.
 */
export const SequencerPanel: React.FC<SequencerPanelProps> = ({
  pattern,
  seqState,
  isPlaying,
  viewedBar,
  barCount,
  stepsPerBar,
  groupSize,
  anySolo,
  velocityActiveTrackIdx,
  isSidebarCollapsed,
  isEditorMaximized,
  isVelocityLaneOpen,
  isAnalyzerOpen,
  language,
  isZh,
  canUndo,
  canRedo,
  genreName,
  genreAccent,
  activeProjectName,
  isDrumsOnly,
  isRecordArmed,
  drumKit,
  effectsRackState,
  isExportingAudio,
  isKeyboardMode,
  midiDeviceCount,
  mobileEditMode,
  showAdvancedControls,
  isTouchDevice,
  isRulerDragging,
  matrixContainerRef,
  playheadBeamRef,
  analyser,
  analyserL,
  analyserR,
  onOpenGenreMaker,
  onChangeMobileEditMode,
  onCloseAnalyzer,
  isConsoleOpen,
  onToggleConsole,
  onTogglePlay,
  onChangeBpm,
  onChangeSwing,
  onChangeTimeSignature,
  onChangeResolution,
  onChangeStepCount,
  onChangeDrumKit,
  onToggleDrumsOnly,
  onToggleRecordArmed,
  onChangeEffectsRack,
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
  onOpenProjectHub,
  onExportWav,
  onExportStems,
  onImportMidi,
  onInspireMe,
  onToggleKeyboardMode,
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
  onToggleAnalyzer,
  onTapTempo,
  handleGridPointerDown,
  handleGridPointerMove,
  handleGridPointerUp,
  handleGridContextMenu,
  handleSelectLoopRange,
  handleRulerPointerDown,
  handleRulerPointerMove,
  handleRulerPointerUp,
  onAudition,
  onCycleLength,
  onToggleMute,
  onToggleSolo,
  onChangeTrackVolume,
  onOpenVelocity,
  onOpenInspector,
  gs1Enabled,
  onToggleGs1,
  onOpenAudioSettings,
  isPhone = false,
  isShortLandscape = false,
  bottomBar,
  onOpenMobileSheet,
  onOpenChords,
  commit,
  isPianoRollOpen = false,
  pianoRollTrackIdx = 0,
  onSelectPianoRollTrack,
  onOpenPianoRoll,
  onClosePianoRoll,
  onTogglePianoRoll,
  onAuditionRollNote,
  onPreviewChord,
  onStartRollPreview,
  onStopRollPreview,
  isRollPreviewing,
  onOpenHelp,
  inspectorTrackIdx = null,
  onShiftTrack,
  onSmartFill,
  onClearTrack,
  onMoveTrackUp,
  onMoveTrackDown,
  onChangeTrackPan,
  onChangeTrackSwing,
  onSelectParameterDimension,
  onSelectVelocityTrack,
  onUpdateVelocity,
  onBatchUpdateVelocity,
  onUpdateProbability,
  onBatchUpdateProbability,
  onUpdateRatchet,
  onBatchUpdateRatchet,
  onUpdateGate,
  onBatchUpdateGate,
  onCloseVelocityLane,
}) => {
  const { t } = useLanguage();

  /**
   * Phone sheet. Kept local to the panel rather than lifted to the view because every control it
   * exposes is already a prop of this component — lifting it would mean threading a dozen more
   * callbacks through `StudioView` just to reach the same handlers.
   */
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  /** Phone: the "why is there no piano roll here" explanation, opened from the sheet. */
  const [isPianoRollNoticeOpen, setIsPianoRollNoticeOpen] = useState(false);

  const [compactTracks, setCompactTracks] = useState<Record<number, boolean>>(() => {
    try {
      const raw = localStorage.getItem("groove_compact_tracks");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const allCompact = pattern.tracks.length > 0 && pattern.tracks.every((_, idx) => compactTracks[idx]);
  const handleToggleAllCompact = () => {
    const nextVal = !allCompact;
    const nextMap: Record<number, boolean> = {};
    pattern.tracks.forEach((_, idx) => {
      nextMap[idx] = nextVal;
    });
    setCompactTracks(nextMap);
    try {
      localStorage.setItem("groove_compact_tracks", JSON.stringify(nextMap));
    } catch {}
  };

  const handleToggleSingleTrackCompact = (trackIdx: number) => {
    setCompactTracks((prev) => {
      const next = { ...prev, [trackIdx]: !prev[trackIdx] };
      try {
        localStorage.setItem("groove_compact_tracks", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleSetChordDuration = useCallback(
    (trackIdx: number, gate: number) => {
      const track = pattern.tracks[trackIdx];
      if (!track) return;
      const len = track.steps?.length || seqState.stepCount;
      const currentGates =
        track.gate && track.gate.length >= len
          ? [...track.gate]
          : Array.from({ length: len }, (_, i) => track.gate?.[i] ?? 0.8);
      const updated = currentGates.map((g, i) => ((track.steps?.[i] ?? 0) > 0 ? gate : g));
      onBatchUpdateGate(trackIdx, updated);
    },
    [pattern.tracks, seqState.stepCount, onBatchUpdateGate]
  );

  /**
   * How this genre plays its chords, per chord track — the length the engine will actually use.
   *
   * Chord length is the one note length the *genre* decides rather than the step grid
   * (`stepDur × gate × CHORD_BASE_GATE × articulation.gateScale`, spanning 0.3× to 3.0×), so the
   * grid has to show it or every genre looks like the same one-cell note.
   */
  const chordArticulations = useMemo(() => {
    const map = new Map<number, { articulation: string; gateScale: number; label: string }>();
    pattern.tracks.forEach((track, idx) => {
      if (track.track_id !== "chords") return;
      const treatment = resolveChordTreatment(pattern.genre_id, track.instrument);
      map.set(idx, {
        articulation: treatment.articulation,
        gateScale: treatment.gateScale,
        label: t(`chord_articulation_${treatment.articulation}`),
      });
    });
    return map;
  }, [pattern.tracks, pattern.genre_id, t]);

  /**
   * The phone transport, as an element rather than a fixed position in the tree.
   *
   * It is rendered in one of two places: in the panel's own flow (portrait, and any layout with
   * room), or inside the shared bottom row below when the viewport is a short landscape one. The
   * element itself is identical either way — only the container differs — which is what keeps the
   * two layouts from drifting apart.
   */
  const transportBar = isPhone ? (
    <MobileTransportBar
      isPlaying={isPlaying}
      bpm={seqState.bpm}
      viewedBar={viewedBar}
      barCount={barCount}
      canUndo={canUndo}
      canRedo={canRedo}
      onTogglePlay={onTogglePlay}
      onPrevBar={() => onSelectBar(Math.max(0, viewedBar - 1))}
      onNextBar={() => onSelectBar(Math.min(barCount - 1, viewedBar + 1))}
      onUndo={onUndo}
      onRedo={onRedo}
      onOpenSheet={onOpenMobileSheet ?? (() => setIsMobileSheetOpen(true))}
      isShortLandscape={isShortLandscape}
    />
  ) : null;

  /**
   * One bottom row, two bars side by side.
   *
   * This is the whole point of the exercise: on a 390 px-tall landscape viewport the stacked bars
   * cost 102 px (26 % of the screen) while 844 px of width sat unused. Sharing a row returns the
   * transport's 49 px to the grid without deleting a control. The safe-area padding lives on the
   * row, not on the tab bar, so the home indicator cannot sit on top of the transport's right-hand
   * buttons.
   */
  const sharedBottomRow =
    isShortLandscape && bottomBar ? (
      <div
        data-testid="mobile-shared-bottom-row"
        data-bottom-chrome="fixed"
        /**
         * `z-30`, deliberately *not* the tab bar's `z-[70]`.
         *
         * The row contains the tab bar, but it must not inherit that layer. The track inspector is a
         * `z-50` sheet over a `z-40` scrim, and with the row at `z-70` the sheet's bottom 52 px sat
         * underneath it: an element-at-point probe in the overlap returned a transport button
         * instead of the panel, which is the same class of defect the inspector's `bottom` offset
         * exists for. The standalone tab bar can afford a high layer because nothing covers it; a
         * row that a sheet does cover cannot.
         */
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-line bg-panel/95 backdrop-blur-lg"
        style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom, 0px))" }}
      >
        {/*
          `min-w-0` lets the transport shrink instead of forcing the row wider than the viewport;
          `overflow-hidden` keeps its 44 px buttons inside the slot rather than bleeding over the
          tab bar's border.
        */}
        <div
          className="flex min-w-0 shrink-0 items-stretch overflow-hidden"
          style={{ width: "min(var(--mobile-transport-row-w), 55vw)" }}
        >
          {transportBar}
        </div>
        {/*
          `flex-1`, not `shrink-0`: the transport claims a fixed 320 px, and the navigation bar has
          to take the rest. With `shrink-0` it kept its own intrinsic width (197 px) and left 524 px
          of the row empty while the five tabs were 39 px wide targets.
        */}
        <div className="flex min-w-0 flex-1 items-stretch border-l border-line">{bottomBar}</div>
      </div>
    ) : null;

  return (
    <section
      className={
        isEditorMaximized
          ? "fixed inset-0 z-50 overflow-y-auto bg-bg p-2.5 sm:p-3.5 flex flex-col"
          : "bg-panel border border-line rounded-2xl p-3 sm:p-4 min-w-0 order-1 lg:order-2 shadow-2xl"
      }
      style={
        isEditorMaximized
          ? {
              paddingTop: "max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.375rem))",
              paddingBottom: "max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))",
              paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
              paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
            }
          : undefined
      }
    >
      {/*
        The transport moves into the shared bottom row when that row exists, so it is rendered here
        only in the layouts that do not have one.
      */}
      {isPhone ? (
        sharedBottomRow ? null : transportBar
      ) : (
      /* Sequencer Unified Toolbar */
      <Toolbar
        onOpenHelp={onOpenHelp}
        gs1Enabled={gs1Enabled}
        onToggleGs1={onToggleGs1}
        onOpenAudioSettings={onOpenAudioSettings}
        onTogglePianoRoll={onTogglePianoRoll}
        isPlaying={isPlaying}
        bpm={seqState.bpm}
        swing={seqState.swing}
        timeSignature={seqState.timeSignature}
        resolution={seqState.resolution}
        stepCount={seqState.stepCount}
        barCount={barCount}
        viewedBar={viewedBar}
        mobileEditMode={mobileEditMode}
        showAdvancedControls={showAdvancedControls}
        isVelocityLaneOpen={isVelocityLaneOpen}
        isSidebarCollapsed={isSidebarCollapsed}
        isEditorMaximized={isEditorMaximized}
        canUndo={canUndo}
        canRedo={canRedo}
        genreName={genreName}
        genreAccent={genreAccent}
        isZh={isZh}
        stepsPerBar={stepsPerBar}
        groupSize={groupSize}
        activeSlot={seqState.activeSlot}
        songMode={seqState.songMode}
        blindCompare={seqState.blindTestMode}
        isMetronome={seqState.isMetronome}
        isCountIn={seqState.isCountIn}
        drumKit={drumKit}
        onChangeDrumKit={onChangeDrumKit}
        isDrumsOnly={isDrumsOnly}
        onToggleDrumsOnly={onToggleDrumsOnly}
        isRecordArmed={isRecordArmed}
        onToggleRecordArmed={onToggleRecordArmed}
        effectsRackState={effectsRackState}
        onChangeEffectsRack={onChangeEffectsRack}
        onTogglePlay={onTogglePlay}
        onChangeBpm={onChangeBpm}
        onChangeSwing={onChangeSwing}
        onChangeTimeSignature={onChangeTimeSignature}
        onChangeResolution={onChangeResolution}
        onChangeStepCount={onChangeStepCount}
        onChangeMobileEditMode={onChangeMobileEditMode}
        onSelectBar={onSelectBar}
        onToggleVelocityLane={onToggleVelocityLane}
        onOpenEuclidean={onOpenEuclidean}
        onUndo={onUndo}
        onRedo={onRedo}
        onToggleMaximize={onToggleMaximize}
        onToggleSidebar={onToggleSidebar}
        onToggleAdvancedControls={onToggleAdvancedControls}
        onQuickAction={onQuickAction}
        onExportMidi={onExportMidi}
        onExportAls={onExportAls}
        onExportGroove={onExportGroove}
        activeProjectName={activeProjectName}
        onOpenProjectHub={onOpenProjectHub}
        onOpenGenreMaker={onOpenGenreMaker}
        onExportWav={onExportWav}
        onExportStems={onExportStems}
        isExportingAudio={isExportingAudio}
        onImportMidi={onImportMidi}
        onInspireMe={onInspireMe}
        isKeyboardMode={isKeyboardMode}
        onToggleKeyboardMode={onToggleKeyboardMode}
        midiDeviceCount={midiDeviceCount}
        onShare={onShare}
        onAddSteps={onAddSteps}
        onRemoveSteps={onRemoveSteps}
        onScrollByPixels={onScrollByPixels}
        onSwitchSlot={onSwitchSlot}
        onCopySlot={onCopySlot}
        onToggleSongMode={onToggleSongMode}
        onToggleBlindCompare={onToggleBlindCompare}
        onToggleMetronome={onToggleMetronome}
        onToggleCountIn={onToggleCountIn}
        isAnalyzerOpen={isAnalyzerOpen}
        onToggleAnalyzer={onToggleAnalyzer}
        isConsoleOpen={isConsoleOpen}
        onToggleConsole={onToggleConsole}
        onTapTempo={onTapTempo}
      />
      )}

      {/* Master Panoramic Analyzer Dock (P6-05) */}
      {isAnalyzerOpen && (
        <div className="w-full my-2">
          <MasterAnalyzerSuite
            analyser={analyser}
            analyserL={analyserL}
            analyserR={analyserR}
            isPlaying={isPlaying}
            onClose={onCloseAnalyzer}
          />
        </div>
      )}

      {/* 8 Tracks Sequencer Matrix (#tracks) with Event Delegation (P2-02, P2-05, P2-20) */}
      <div
        ref={matrixContainerRef}
        role="grid"
        aria-label={isZh ? "打击乐与合成器音序步进网格" : "Sequencer Step Matrix Grid"}
        onPointerDown={handleGridPointerDown}
        onPointerMove={handleGridPointerMove}
        onPointerUp={handleGridPointerUp}
        onPointerCancel={handleGridPointerUp}
        onContextMenu={handleGridContextMenu}
        className="w-full space-y-1 overflow-x-auto pb-3 relative custom-sequencer-scroll select-none overscroll-x-contain mt-2"
      >
        {/* Playhead Laser Overlay Beam (P2-03) */}
        <div ref={playheadBeamRef} className="playhead-laser-beam hidden" />

        {/* Track Controls Utility Bar (Compact Toggle) */}
        <div className="flex items-center justify-between px-1 mb-1 text-xs text-text-dim">
          <button
            type="button"
            onClick={handleToggleAllCompact}
            data-testid="toggle-all-tracks-compact"
            className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-line-subtle hover:border-accent/40 bg-panel2 hover:text-accent font-['JetBrains_Mono'] text-[10px] transition-colors cursor-pointer select-none"
            title={allCompact ? (isZh ? "全部展开音轨" : "Expand All Tracks") : (isZh ? "全部折叠音轨" : "Fold All Tracks")}
          >
            {allCompact ? <ChevronDown className="w-3 h-3 text-accent" /> : <ChevronUp className="w-3 h-3 text-accent" />}
            <span>{allCompact ? t("track_unfold_all") : t("track_fold_all")}</span>
          </button>
        </div>

        {/* Step Indicator Ruler Header */}
        <Ruler
          stepCount={seqState.stepCount}
          timeSignature={seqState.timeSignature}
          stepsPerBar={stepsPerBar}
          groupSize={groupSize}
          isRulerDragging={isRulerDragging}
          isZh={isZh}
          loopRange={seqState.loopRange}
          onSelectLoopRange={handleSelectLoopRange}
          onPointerDown={handleRulerPointerDown}
          onPointerMove={handleRulerPointerMove}
          onPointerUp={handleRulerPointerUp}
          barCount={barCount}
          viewedBar={viewedBar}
          onSelectBar={onSelectBar}
          onDuplicateBar1={barCount > 1 ? () => onQuickAction("dup_bar1") : undefined}
        />

        {/* Track Rows */}
        {pattern.tracks.map((track, trackIdx) => {
          const meta = DEMO_TRACKS_CONFIG[trackIdx % DEMO_TRACKS_CONFIG.length];
          const isSolo = Boolean(track.solo);
          const isMute = Boolean(track.mute);
          const isDrum = isDrumTrack(track, trackIdx);
          const isSilenced = isMute || (anySolo && !isSolo) || (isDrumsOnly && !isDrum);
          const isHatTrack = track.track_id === "hihat" || track.name.toLowerCase().includes("hat");

          return (
            <TrackRow
              key={track.track_id}
              track={track}
              trackIdx={trackIdx}
              meta={meta}
              isSolo={isSolo}
              isMute={isMute}
              isSilenced={isSilenced}
              isHatTrack={isHatTrack}
              stepCount={seqState.stepCount}
              stepsPerBar={stepsPerBar}
              groupSize={groupSize}
              isVelocityLaneOpen={isVelocityLaneOpen}
              isVelocityActiveTrack={velocityActiveTrackIdx === trackIdx}
              isZh={isZh}
              onAudition={onAudition}
              onCycleLength={onCycleLength}
              onToggleMute={onToggleMute}
              onToggleSolo={onToggleSolo}
              onChangeVolume={onChangeTrackVolume}
              onOpenVelocity={onOpenVelocity}
              onOpenInspector={onOpenInspector}
              onOpenPianoRoll={onOpenPianoRoll}
              isInspectorOpen={inspectorTrackIdx === trackIdx}
              chordArticulation={chordArticulations.get(trackIdx)}
              onShiftTrack={onShiftTrack}
              onSmartFill={onSmartFill}
              onClearTrack={onClearTrack}
              onMoveUp={onMoveTrackUp}
              onMoveDown={onMoveTrackDown}
              canMoveUp={trackIdx > 0}
              canMoveDown={trackIdx < pattern.tracks.length - 1}
              onChangePan={onChangeTrackPan}
              onChangeSwing={onChangeTrackSwing}
              isCompact={Boolean(compactTracks[trackIdx])}
              onToggleCompact={handleToggleSingleTrackCompact}
              onSetChordDuration={handleSetChordDuration}
            />
          );
        })}
      </div>

      {/* Collapsible Velocity Drawer */}
      {isVelocityLaneOpen && (
        <div className="mt-3 pt-3 border-t border-line-subtle">
          <VelocityLane
            tracks={pattern.tracks}
            activeTrackIdx={velocityActiveTrackIdx}
            dimension={seqState.parameterDimension}
            onSelectDimension={onSelectParameterDimension}
            onSelectTrack={onSelectVelocityTrack}
            onUpdateVelocity={onUpdateVelocity}
            onBatchUpdateVelocity={onBatchUpdateVelocity}
            onUpdateProbability={onUpdateProbability}
            onBatchUpdateProbability={onBatchUpdateProbability}
            onUpdateRatchet={onUpdateRatchet}
            onBatchUpdateRatchet={onBatchUpdateRatchet}
            onUpdateGate={onUpdateGate}
            onBatchUpdateGate={onBatchUpdateGate}
            onClose={onCloseVelocityLane}
            currentStep={-1}
            isPlaying={isPlaying}
            language={language}
            stepCount={seqState.stepCount}
            stepsPerBar={stepsPerBar}
            groupSize={groupSize}
            tracksConfig={DEMO_TRACKS_CONFIG}
          />
        </div>
      )}

      {/**
        * Phone: the piano roll is deliberately not offered, and says so.
        *
        * Measured on a 390×664 phone: the drawer is 1095 px tall and the note grid 2304 px wide,
        * with 55 buttons in its toolbar and `touch-action: none` on the grid — which is required,
        * because a one-finger drag has to paint notes rather than scroll, leaving no gesture to
        * pan with. The result is a surface where most of the grid is off-screen, the controls are
        * a wall, and the part you can reach cannot be navigated.
        *
        * That is not a tuning problem, so the honest answer is not to offer it here rather than to
        * ship a version that is present and unusable. Notes are still editable on the step grid
        * (tap to place, long-press for parameters), and progressions live in the Chords view.
        */}
      {isPhone && (isPianoRollOpen || isPianoRollNoticeOpen) && (
        <div
          data-testid="piano-roll-mobile-notice"
          className="mt-3 rounded-2xl border border-line bg-panel p-4"
        >
          <h3 className="text-[13px] font-bold text-text">{t("roll_mobile_unavailable_title")}</h3>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-text-sub">
            {t("roll_mobile_unavailable_body")}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setIsPianoRollNoticeOpen(false);
                onClosePianoRoll?.();
              }}
              data-testid="piano-roll-mobile-notice-close"
              className="h-11 flex-1 rounded-xl border border-line text-[12px] font-semibold text-text active:bg-panel2"
            >
              {t("mobile_more_close")}
            </button>
            {onOpenChords && (
              <button
                type="button"
                onClick={onOpenChords}
                data-testid="piano-roll-mobile-notice-chords"
                className="h-11 flex-1 rounded-xl border border-accent/60 bg-accent/15 text-[12px] font-semibold text-accent active:bg-accent/25"
              >
                {t("roll_mobile_unavailable_cta")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Piano roll drawer (item ⑦). Placed with the grid rather than in a portal so the note
          activity stays visually attached to the track it edits. Desktop only; see the notice
          above for why. */}
      {!isPhone && isPianoRollOpen && commit && onClosePianoRoll && onAuditionRollNote && (
        <div className="mt-3 pt-3 border-t border-line-subtle" data-testid="piano-roll-drawer">
          <PianoRollLane
            pattern={pattern}
            activeTrackIdx={pianoRollTrackIdx}
            stepCount={seqState.stepCount}
            stepsPerBar={stepsPerBar}
            isZh={isZh}
            isPlaying={isPlaying}
            currentStep={-1}
            onSelectTrack={onSelectPianoRollTrack ?? (() => {})}
            onClose={onClosePianoRoll}
            commit={commit}
            onAudition={onAuditionRollNote}
            onPreviewChord={onPreviewChord}
            onStartPreview={onStartRollPreview}
            onStopPreview={onStopRollPreview}
            isPreviewing={isRollPreviewing}
            onToggleMusicalTyping={onToggleKeyboardMode}
            onOpenHelp={onOpenHelp}
          />

        </div>
      )}

      {/* Bottom Hint Note */}
      <div className="mt-3.5 font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-[0.04em] leading-relaxed border-t border-line-subtle pt-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {isTouchDevice ? (
            isZh ? (
              <span>
                <strong className="text-accent font-bold">📱 触控/移动端操作：</strong>{" "}
                点按步进开/关 · 长按步进调出参数锁 (P-Locks) · 顶部步进工具栏切换重音/连音/音高模式
                · 点按轨道名试听音色 · 左右滑动浏览小节
              </span>
            ) : (
              <span>
                <strong className="text-accent font-bold">📱 Touch & Mobile:</strong> Tap step to
                toggle · Long-press for P-Locks · Switch Tool Mode ribbon for accent/ratchet/pitch ·
                Tap track name to audition · Swipe to scroll bars
              </span>
            )
          ) : isZh ? (
            <span>
              <strong className="text-accent font-bold">💡 桌面快捷操作：</strong> 空格键播放/停止 ·
              V 键力度抽屉 · E 键欧几里得 · Ctrl/Cmd+Z 撤销 · 左右拖拽直接涂抹步进 ·
              滚轮/标尺拖动水平平移
            </span>
          ) : (
            <span>
              <strong className="text-accent font-bold">💡 Desktop Shortcuts:</strong> Space to
              Play/Pause · V for Velocity · E for Euclidean · Ctrl/Cmd+Z Undo · Drag to paint steps
              · Wheel/ruler drag to pan
            </span>
          )}
        </div>
        <div className="text-text-dim text-[9.5px]">Groove v{APP_VERSION} · Pro DAW Studio Sequencer</div>
      </div>

      {isPhone && (
        <MobileStudioSheet
          open={isMobileSheetOpen}
          onClose={() => setIsMobileSheetOpen(false)}
          groups={buildStudioSheetGroups({
            isMetronome: seqState.isMetronome,
            isCountIn: seqState.isCountIn,
            isRecordArmed,
            isDrumsOnly,
            isSongMode: seqState.songMode,
            isBlindCompare: seqState.blindTestMode,
            drumKit,
            mobileEditMode,
            onToggleMetronome,
            onToggleCountIn,
            onToggleRecordArmed,
            onToggleDrumsOnly,
            onToggleSongMode,
            onToggleBlindCompare,
            onChangeDrumKit,
            onChangeMobileEditMode,
            onToggleVelocityLane,
            /**
             * The piano roll is deliberately absent on a phone (see the notice above the drawer).
             * Its sheet row became "note editing", which explains what to use instead — an
             * omitted feature should be visibly omitted and point somewhere, not vanish.
             */
            onShowNoteEditingHelp: () => setIsPianoRollNoticeOpen(true),
            onOpenEuclidean,
            onOpenProjectHub,
            onOpenExport: onExportWav,
            onQuickAction: () => onQuickAction("humanize"),
            onToggleConsole,
            onToggleAnalyzer,
            onOpenAudioSettings,
            /**
             * Bar navigation lives here only in the shape that dropped it from the transport.
             * Passing it in portrait too would render a second copy of two controls that are
             * already on screen, which is the opposite of what the phone shell is for.
             */
            barNav: isShortLandscape
              ? {
                  viewedBar,
                  barCount,
                  onPrev: () => onSelectBar(Math.max(0, viewedBar - 1)),
                  onNext: () => onSelectBar(Math.min(barCount - 1, viewedBar + 1)),
                }
              : undefined,
          })}
        />
      )}

      {/* The shared bottom row is fixed, so it is rendered outside the panel's own flow. */}
      {sharedBottomRow}
    </section>
  );
};
