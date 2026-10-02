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
import { VelocityLane, type ParameterDimension } from "./VelocityLane";
import { PianoRollLane } from "./PianoRollLane";
import { MasterAnalyzerSuite } from "../analyzer/MasterAnalyzerSuite";
import { DEMO_TRACKS_CONFIG } from "./trackConfig";
import { APP_VERSION } from "../../version";
import type { ClipSlot } from "../../types/song";

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
  onExportMp3: () => Promise<void>;
  onExportStems: () => Promise<void>;
  onImportMidi: (file: File) => Promise<void>;
  onInspireMe: () => void;
  onToggleKeyboardMode: () => void;
  onShare: () => void;
  onAddSteps: (count: number) => void;
  onRemoveSteps: (count: number) => void;
  onScrollByPixels: (delta: number) => void;
  onSwitchSlot: (slot: ClipSlot) => void;
  onCopySlot: (from: ClipSlot, to: ClipSlot) => void;
  onToggleSongMode: () => void;
  onToggleBlindCompare: () => void;
  /**
   * B3: opens the arrangement view. Optional so the phone shell (and any caller with no arrangement surface)
   * simply never renders the entry, instead of the toolbar asking what kind of device it is on.
   */
  onOpenArrangement?: () => void;
  isArrangementOpen?: boolean;
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
  onExportMp3,
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
  onOpenArrangement,
  isArrangementOpen = false,
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
      {/* Sequencer Unified Toolbar */}
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
        onExportMp3={onExportMp3}
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
        onOpenArrangement={onOpenArrangement}
        isArrangementOpen={isArrangementOpen}
        onToggleBlindCompare={onToggleBlindCompare}
        onToggleMetronome={onToggleMetronome}
        onToggleCountIn={onToggleCountIn}
        isAnalyzerOpen={isAnalyzerOpen}
        onToggleAnalyzer={onToggleAnalyzer}
        isConsoleOpen={isConsoleOpen}
        onToggleConsole={onToggleConsole}
        onTapTempo={onTapTempo}
      />

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

      {/* Piano roll drawer (item ⑦). Placed with the grid rather than in a portal so the note
          activity stays visually attached to the track it edits. */}
      {isPianoRollOpen && commit && onClosePianoRoll && onAuditionRollNote && (
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
    </section>
  );
};
