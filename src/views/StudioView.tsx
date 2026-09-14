import React, { useState, useRef, useMemo } from "react";
import { Check } from "lucide-react";
import { Genre, SequencerPattern } from "../types/genre";
import { AudioEngine, DrumKitType, EffectsRackState } from "../audio/AudioEngine";
import { DEFAULT_FX_STATE } from "../audio/EffectsRack";
import { useLanguage } from "../i18n/LanguageContext";
import { VelocityLane } from "../components/sequencer/VelocityLane";
import { EuclideanModal } from "../components/sequencer/EuclideanModal";
import { PitchPickerModal } from "../components/sequencer/PitchPickerModal";
import { Ruler } from "../components/sequencer/Ruler";
import { TrackRow } from "../components/sequencer/TrackRow";
import { Toolbar, MobileEditMode } from "../components/sequencer/Toolbar";
import { GenreRail } from "../components/sequencer/GenreRail";
import { InfoDossier } from "../components/sequencer/InfoDossier";
import { MasterAnalyzerSuite } from "../components/analyzer/MasterAnalyzerSuite";
import { ProjectHubModal } from "../components/sequencer/ProjectHubModal";
import { useSequencerStore, clonePattern } from "../features/sequencer/useSequencerStore";
import { useToast } from "../features/sequencer/hooks/useToast";
import { useGenreSwitching } from "../features/sequencer/hooks/useGenreSwitching";
import { useUrlShareLoad } from "../features/sequencer/hooks/useUrlShareLoad";
import { useLiveRecordingBridge } from "../features/sequencer/hooks/useLiveRecordingBridge";
import { useAudioEngineLifecycle } from "../features/sequencer/hooks/useAudioEngineLifecycle";
import {
  useTransportShortcuts,
  type PitchPickerState,
  type StepContextMenuState,
} from "../features/sequencer/hooks/useTransportShortcuts";
import { useExportActions } from "../features/sequencer/hooks/useExportActions";
import { useProjectHub } from "../features/sequencer/hooks/useProjectHub";
import { useMidiInput } from "../features/sequencer/hooks/useMidiInput";
import { useInitialPatternLoad } from "../features/sequencer/hooks/useInitialPatternLoad";
import { useMatrixScroll } from "../features/sequencer/hooks/useMatrixScroll";
import { useGridInteraction } from "../features/sequencer/hooks/useGridInteraction";
import { usePatternActions } from "../features/sequencer/hooks/usePatternActions";
import { useTrackControls } from "../features/sequencer/hooks/useTrackControls";
import { useVelocityLaneEditing } from "../features/sequencer/hooks/useVelocityLaneEditing";
import { useTransportControls } from "../features/sequencer/hooks/useTransportControls";
import { useToolbarControls } from "../features/sequencer/hooks/useToolbarControls";
import { usePanelToggles } from "../features/sequencer/hooks/usePanelToggles";
import { ChordDefinition } from "../utils/chordTheory";
import { BakedArpeggioResult } from "../utils/arpeggiatorTheory";
import { calculateGroupSize, calculateStepsPerBar } from "../utils/meter";
import { isDrumTrack, getDefaultDrumKitForGenre } from "../utils/trackUtils";

// Color mappings matching demo design
export const DEMO_TRACKS_CONFIG = [
  { id: "kick", name: "KICK", sub: { zh: "底鼓", en: "Kick" }, color: "#ff5964" },
  { id: "snare", name: "SNARE", sub: { zh: "军鼓/拍手", en: "Snare/Clap" }, color: "#ffb65c" },
  { id: "hat", name: "HI-HAT", sub: { zh: "踩镲", en: "Hi-Hat" }, color: "#45e0c9" },
  { id: "perc", name: "PERC", sub: { zh: "打击乐", en: "Percussion" }, color: "#c8e06a" },
  { id: "bass", name: "808 BASS", sub: { zh: "贝斯", en: "Bass" }, color: "#ff8a5c" },
  { id: "chord", name: "CHORD", sub: { zh: "和弦", en: "Chords" }, color: "#f06ec4" },
  { id: "lead", name: "LEAD", sub: { zh: "主音", en: "Lead" }, color: "#7ee787" },
  { id: "fx", name: "FX", sub: { zh: "效果", en: "FX" }, color: "#9aa5ce" },
];

interface StudioViewProps {
  selectedGenre?: Genre;
  onSelectGenre: (genre: Genre) => void;
  onViewDetail: (genre: Genre) => void;
  onAddToCompare?: (genre: Genre) => void;
  onAudioEngineReady?: (engine: AudioEngine) => (() => void) | void;
  onOpenGenreMaker?: () => void;
  initialChords?: ChordDefinition[] | null;
  onClearInitialChords?: () => void;
  initialArpeggio?: { baked: BakedArpeggioResult; label?: string } | null;
  onClearInitialArpeggio?: () => void;
  initialMasterclassPattern?: { pattern: SequencerPattern; label?: string } | null;
  onClearInitialMasterclassPattern?: () => void;
}

export const StudioView: React.FC<StudioViewProps> = ({
  selectedGenre: initialGenre,
  onSelectGenre,
  onViewDetail,
  onAddToCompare,
  onAudioEngineReady,
  onOpenGenreMaker,
  initialChords,
  onClearInitialChords,
  initialArpeggio,
  onClearInitialArpeggio,
  initialMasterclassPattern,
  onClearInitialMasterclassPattern,
}) => {
  const { t, language, isZh } = useLanguage();

  // A-01: App only mounts StudioView once it has resolved a genre via `loadGenre`,
  // so there is no need to statically pull the whole genre database as a fallback.
  const startingGenre = initialGenre as Genre;

  // Central Sequencer Store (P2-04)
  const {
    state: seqState,
    dispatch,
    commit,
    undo,
    redo,
    canUndo,
    canRedo,
    invalidateRedo,
    commitCoalesced,
  } = useSequencerStore(startingGenre);

  const {
    currentGenre,
    pattern,
    bpm,
    swing,
    timeSignature,
    resolution,
    stepCount,
  } = seqState;

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [viewedBar, setViewedBar] = useState<number>(0);

  // Sidebar collapse & Maximize states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isEditorMaximized, setIsEditorMaximized] = useState<boolean>(false);

  // Sequencer matrix scroll container ref & playhead beam ref (P2-03)
  const matrixContainerRef = useRef<HTMLDivElement | null>(null);
  const playheadBeamRef = useRef<HTMLDivElement | null>(null);
  const lastActiveRulerStepRef = useRef<HTMLElement | null>(null);

  // Pro Sequencer Extensions: Velocity Lane, Euclidean Generator, Pitch Picker & P-Locks
  const [isVelocityLaneOpen, setIsVelocityLaneOpen] = useState(false);
  const [velocityActiveTrackIdx, setVelocityActiveTrackIdx] = useState(0);
  const [isEuclideanOpen, setIsEuclideanOpen] = useState(false);
  const [isAnalyzerOpen, setIsAnalyzerOpen] = useState(false);
  const [pitchPicker, setPitchPicker] = useState<PitchPickerState>({
    isOpen: false,
    trackIdx: 0,
    stepIdx: 0,
    initialNote: null,
  });

  const [stepContextMenu, setStepContextMenu] = useState<StepContextMenuState | null>(null);

  // Mobile / Tablet dedicated mobile tools (touch detection lives in useGridInteraction)
  const [mobileEditMode, setMobileEditMode] = useState<MobileEditMode>("step");
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);

  // Phase 4 States (P4-01 ~ P4-04 & P4-06)
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);

  // Phase 5 States (P5-01 ~ P5-05)
  const [drumKit, setDrumKit] = useState<DrumKitType>(() => getDefaultDrumKitForGenre(currentGenre));
  const [isDrumsOnly, setIsDrumsOnly] = useState<boolean>(false);
  const [isRecordArmed, setIsRecordArmed] = useState<boolean>(false);
  const [effectsRackState, setEffectsRackState] = useState<EffectsRackState>(DEFAULT_FX_STATE);

  // Multi-Project Hub State (P7-02)
  const [isProjectHubOpen, setIsProjectHubOpen] = useState(false);

  // AudioEngine ref
  const engineRef = useRef<AudioEngine | null>(null);
  const patternRef = useRef(pattern);
  patternRef.current = pattern;
  const seqStateRef = useRef(seqState);
  seqStateRef.current = seqState;

  // Toast notification (state + timer live in useToast)
  const { toastMessage, showToast } = useToast();

  // Multi-project hub: active project restore + loader (A-02)
  const { activeProject, handleLoadProject } = useProjectHub({
    commit,
    currentGenre,
    setDrumKit,
    setEffectsRackState,
    engineRef,
  });

  // Web MIDI devices + keyboard performance listener (A-02)
  const { midiDevices } = useMidiInput({
    pattern,
    engineRef,
    isZh,
    showToast,
    isKeyboardMode,
  });

  // P5-05 live-recording bridge + AudioEngine lifecycle (A-02)
  const { handleQuantizedStep } = useLiveRecordingBridge({ invalidateRedo, dispatch });
  const { clearPlayhead } = useAudioEngineLifecycle({
    engineRef,
    matrixContainerRef,
    playheadBeamRef,
    lastActiveRulerStepRef,
    pattern,
    bpm,
    swing,
    timeSignature,
    resolution,
    seqState,
    seqStateRef,
    drumKit,
    isDrumsOnly,
    isRecordArmed,
    effectsRackState,
    onAudioEngineReady,
    commit,
    setIsPlaying,
    handleQuantizedStep,
  });

  // Genre rail: categories, chip list, accent colour, on-demand switch & dice (A-02)
  const {
    activeCategoryFilter,
    setActiveCategoryFilter,
    categories,
    railGenres,
    genreAccent,
    handleDiceRandom,
    handleSelectGenreFromRail,
    getGenreAccent,
    getGenreChipTag,
  } = useGenreSwitching({
    currentGenre,
    initialGenre,
    onSelectGenre,
    engineRef,
    isPlaying,
    setIsPlaying,
    isDrumsOnly,
    setDrumKit,
    clearPlayhead,
    commit,
  });

  // Export / share actions: MIDI, ALS, .groove, WAV, stems, share URL (A-02)
  const {
    isExportingAudio,
    handleExportMidi,
    handleExportAls,
    handleExportGroove,
    handleExportWav,
    handleExportStems,
    handleShare,
  } = useExportActions({
    patternRef,
    seqStateRef,
    bpm,
    swing,
    timeSignature,
    resolution,
    stepCount,
    currentGenre,
    activeProject,
    effectsRackState,
    drumKit,
    isZh,
    showToast,
  });

  // Transport & playback modes: play, drums-only, undo/redo, tap, song, slots (A-02)
  const {
    handleTapTempo,
    handleToggleDrumsOnly,
    handleTogglePlay,
    handleUndo,
    handleRedo,
    handleSwitchSlot,
    handleCopySlot,
    handleToggleSongMode,
    handleToggleBlindCompare,
    handleToggleMetronome,
    handleToggleCountIn,
  } = useTransportControls({
    engineRef,
    seqStateRef,
    isPlaying,
    setIsPlaying,
    setIsDrumsOnly,
    clearPlayhead,
    commit,
    undo,
    redo,
    isZh,
    showToast,
  });

  // Patterns handed over from other views (chords / arpeggio / masterclass) (A-02)
  useInitialPatternLoad({
    initialChords,
    onClearInitialChords,
    initialArpeggio,
    onClearInitialArpeggio,
    initialMasterclassPattern,
    onClearInitialMasterclassPattern,
    isZh,
    showToast,
    commit,
    engineRef,
    patternRef,
  });

  // Boot-time `?groove=` / `?genre=` load (A-02)
  useUrlShareLoad({ commit, engineRef, currentGenre, showToast });

  // Global transport/grid shortcuts (A-02)
  useTransportShortcuts({
    isProjectHubOpen,
    stepContextMenu,
    setStepContextMenu,
    isPitchPickerOpen: pitchPicker.isOpen,
    setPitchPicker,
    isEuclideanOpen,
    setIsEuclideanOpen,
    isVelocityLaneOpen,
    setIsVelocityLaneOpen,
    isAnalyzerOpen,
    setIsAnalyzerOpen,
    isEditorMaximized,
    setIsEditorMaximized,
    setIsProjectHubOpen,
    onTogglePlay: handleTogglePlay,
    onToggleDrumsOnly: handleToggleDrumsOnly,
    onUndo: handleUndo,
    onRedo: handleRedo,
  });

  // Math for Bars & Steps (pure helpers live in ../utils/meter)
  const groupSize = useMemo(() => calculateGroupSize(resolution), [resolution]);

  const stepsPerBar = useMemo(
    () => calculateStepsPerBar(timeSignature, resolution),
    [timeSignature, resolution]
  );

  const barCount = Math.max(1, Math.ceil(stepCount / stepsPerBar));

  // Matrix viewport: Shift+wheel, ruler drag, loop range, bar/pixel scroll (A-02)
  const {
    isRulerDragging,
    handleRulerPointerDown,
    handleRulerPointerMove,
    handleRulerPointerUp,
    handleSelectLoopRange,
    scrollToBar,
    scrollByPixels,
  } = useMatrixScroll({ matrixContainerRef, stepsPerBar, setViewedBar, commit });

  // Grid input layer: drag-paint, long-press P-Locks, mobile tap modes (A-02)
  const {
    isTouchDevice,
    handleGridPointerDown,
    handleGridPointerMove,
    handleGridPointerUp,
    handleGridContextMenu,
  } = useGridInteraction({
    pattern,
    patternRef,
    commit,
    engineRef,
    mobileEditMode,
    setStepContextMenu,
    setPitchPicker,
  });

  // Pattern-level actions: quick actions, MIDI import, Inspire Me, audition (A-02)
  const {
    handleQuickAction,
    handleImportMidi,
    handleInspireMe,
    handleAudition,
    handleCycleTrackLength,
  } = usePatternActions({
    patternRef,
    stepsPerBar,
    stepCount,
    resolution,
    bpm,
    currentGenre,
    engineRef,
    commit,
    setIsProjectHubOpen,
    isZh,
    showToast,
  });

  // Per-track mixer/edit handlers for the memoized TrackRow (A-02)
  const {
    handleToggleTrackMute,
    handleToggleTrackSolo,
    handleChangeTrackVolume,
    handleChangeTrackPan,
    handleChangeTrackSwing,
    handleOpenVelocityLane,
    handleShiftTrack,
    handleSmartFillTrack,
    handleClearTrack,
    handleMoveTrackUp,
    handleMoveTrackDown,
  } = useTrackControls({
    patternRef,
    engineRef,
    commit,
    setVelocityActiveTrackIdx,
    setIsVelocityLaneOpen,
  });

  // A-03: Toolbar is memoized, so every prop it receives needs a stable identity.
  // These low-frequency controls are grouped in their own hook so a transport tick
  // (isPlaying / bpm / viewedBar) cannot invalidate the Toolbar memo through them.
  const {
    handleChangeDrumKit,
    handleToggleRecordArmed,
    handleChangeEffectsRack,
    handleChangeBpm,
    handleChangeSwing,
    handleChangeTimeSignature,
    handleChangeResolution,
    handleChangeStepCount,
    handleAddSteps,
    handleRemoveSteps,
    handleToggleKeyboardMode,
  } = useToolbarControls({
    setDrumKit,
    setEffectsRackState,
    isRecordArmed,
    setIsRecordArmed,
    isKeyboardMode,
    setIsKeyboardMode,
    commit,
    commitCoalesced,
    stepCount,
    groupSize,
    isZh,
    showToast,
  });

  // Panel/overlay visibility toggles (A-02)
  const {
    handleCollapseSidebar,
    handleToggleSidebar,
    handleToggleVelocityLane,
    handleOpenEuclidean,
    handleToggleAnalyzer,
    handleOpenProjectHub,
    handleToggleMaximize,
    handleToggleAdvancedControls,
  } = usePanelToggles({
    setIsSidebarCollapsed,
    setIsEditorMaximized,
    setShowAdvancedControls,
    setIsVelocityLaneOpen,
    setIsEuclideanOpen,
    setIsAnalyzerOpen,
    setIsProjectHubOpen,
  });

  // Velocity / probability / ratchet / gate drawer handlers (A-02)
  const {
    handleSelectParameterDimension,
    handleSelectVelocityTrack,
    handleUpdateVelocity,
    handleBatchUpdateVelocity,
    handleUpdateProbability,
    handleBatchUpdateProbability,
    handleUpdateRatchet,
    handleBatchUpdateRatchet,
    handleUpdateGate,
    handleBatchUpdateGate,
    handleCloseVelocityLane,
  } = useVelocityLaneEditing({
    commit,
    commitCoalesced,
    setVelocityActiveTrackIdx,
    setIsVelocityLaneOpen,
  });

  const anySolo = useMemo(() => pattern.tracks.some((t) => t.solo), [pattern.tracks]);

  return (
    <div className="w-full text-text" style={{ ["--g" as any]: genreAccent }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50 bg-[#1a1c22] border border-line text-text px-4 py-2.5 rounded-lg text-xs font-mono shadow-[0_8px_30px_rgba(0,0,0,0.6)] flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-accent" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Genre Rail Wrapper (.rail-wrap) */}
      <GenreRail
        currentGenreId={currentGenre.id}
        activeCategoryFilter={activeCategoryFilter}
        categories={categories}
        railGenres={railGenres}
        genreAccent={genreAccent}
        isZh={isZh}
        onSelectCategory={setActiveCategoryFilter}
        onSelectGenre={handleSelectGenreFromRail}
        onRandomGenre={handleDiceRandom}
        getGenreAccent={getGenreAccent}
        getGenreChipTag={getGenreChipTag}
      />

      {/* Main Two-Column Layout (main: 352px 1fr) */}
      <main
        className={`grid ${
          isSidebarCollapsed || isEditorMaximized ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-[352px_1fr]"
        } gap-5 px-3 sm:px-7 py-3 pb-16 safe-pb items-start`}
      >
        {/* Left Column: Info Dossier (.info) */}
        {!isSidebarCollapsed && !isEditorMaximized && (
          <InfoDossier
            genre={currentGenre}
            scale={pattern.scale}
            timeSignature={timeSignature}
            isZh={isZh}
            language={language}
            onClose={handleCollapseSidebar}
            onViewDetail={onViewDetail}
            onAddToCompare={onAddToCompare}
          />
        )}

        {/* Right Column: The Sequencer (.seq) */}
        <section
          className={
            isEditorMaximized
              ? "fixed inset-0 z-50 overflow-y-auto bg-bg p-2.5 sm:p-3.5 flex flex-col"
              : "bg-panel border border-line rounded-2xl p-3 sm:p-4 min-w-0 order-1 lg:order-2 shadow-2xl"
          }
          style={isEditorMaximized ? {
            paddingTop: "max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.375rem))",
            paddingBottom: "max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))",
            paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
            paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
          } : undefined}
        >
          {/* Sequencer Unified Toolbar */}
          <Toolbar
            isPlaying={isPlaying}
            bpm={bpm}
            swing={swing}
            timeSignature={timeSignature}
            resolution={resolution}
            stepCount={stepCount}
            barCount={barCount}
            viewedBar={viewedBar}
            mobileEditMode={mobileEditMode}
            showAdvancedControls={showAdvancedControls}
            isVelocityLaneOpen={isVelocityLaneOpen}
            isSidebarCollapsed={isSidebarCollapsed}
            isEditorMaximized={isEditorMaximized}
            canUndo={canUndo}
            canRedo={canRedo}
            genreName={currentGenre.name}
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
            onChangeDrumKit={handleChangeDrumKit}
            isDrumsOnly={isDrumsOnly}
            onToggleDrumsOnly={handleToggleDrumsOnly}
            isRecordArmed={isRecordArmed}
            onToggleRecordArmed={handleToggleRecordArmed}
            effectsRackState={effectsRackState}
            onChangeEffectsRack={handleChangeEffectsRack}
            onTogglePlay={handleTogglePlay}
            onChangeBpm={handleChangeBpm}
            onChangeSwing={handleChangeSwing}
            onChangeTimeSignature={handleChangeTimeSignature}
            onChangeResolution={handleChangeResolution}
            onChangeStepCount={handleChangeStepCount}
            onChangeMobileEditMode={setMobileEditMode}
            onSelectBar={scrollToBar}
            onToggleVelocityLane={handleToggleVelocityLane}
            onOpenEuclidean={handleOpenEuclidean}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onToggleMaximize={handleToggleMaximize}
            onToggleSidebar={handleToggleSidebar}
            onToggleAdvancedControls={handleToggleAdvancedControls}
            onQuickAction={handleQuickAction}
            onExportMidi={handleExportMidi}
            onExportAls={handleExportAls}
            onExportGroove={handleExportGroove}
            activeProjectName={activeProject?.name}
            onOpenProjectHub={handleOpenProjectHub}
            onOpenGenreMaker={onOpenGenreMaker}
            onExportWav={handleExportWav}
            onExportStems={handleExportStems}
            isExportingAudio={isExportingAudio}
            onImportMidi={handleImportMidi}
            onInspireMe={handleInspireMe}
            isKeyboardMode={isKeyboardMode}
            onToggleKeyboardMode={handleToggleKeyboardMode}
            midiDeviceCount={midiDevices.length}
            onShare={handleShare}
            onAddSteps={handleAddSteps}
            onRemoveSteps={handleRemoveSteps}
            onScrollByPixels={scrollByPixels}
            onSwitchSlot={handleSwitchSlot}
            onCopySlot={handleCopySlot}
            onToggleSongMode={handleToggleSongMode}
            onToggleBlindCompare={handleToggleBlindCompare}
            onToggleMetronome={handleToggleMetronome}
            onToggleCountIn={handleToggleCountIn}
            isAnalyzerOpen={isAnalyzerOpen}
            onToggleAnalyzer={handleToggleAnalyzer}
            onTapTempo={handleTapTempo}
          />

          {/* Master Panoramic Analyzer Dock (P6-05) */}
          {isAnalyzerOpen && (
            <div className="w-full my-2">
              <MasterAnalyzerSuite
                analyser={engineRef.current?.getMasterAnalyser() || null}
                analyserL={engineRef.current?.getStereoAnalysers().left || null}
                analyserR={engineRef.current?.getStereoAnalysers().right || null}
                isPlaying={isPlaying}
                onClose={() => setIsAnalyzerOpen(false)}
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

            {/* Step Indicator Ruler Header */}
            <Ruler
              stepCount={stepCount}
              timeSignature={timeSignature}
              stepsPerBar={stepsPerBar}
              groupSize={groupSize}
              isRulerDragging={isRulerDragging}
              isZh={isZh}
              loopRange={seqState.loopRange}
              onSelectLoopRange={handleSelectLoopRange}
              onPointerDown={handleRulerPointerDown}
              onPointerMove={handleRulerPointerMove}
              onPointerUp={handleRulerPointerUp}
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
                  stepCount={stepCount}
                  stepsPerBar={stepsPerBar}
                  groupSize={groupSize}
                  isVelocityLaneOpen={isVelocityLaneOpen}
                  isVelocityActiveTrack={velocityActiveTrackIdx === trackIdx}
                  isZh={isZh}
                  onAudition={handleAudition}
                  onCycleLength={handleCycleTrackLength}
                  onToggleMute={handleToggleTrackMute}
                  onToggleSolo={handleToggleTrackSolo}
                  onChangeVolume={handleChangeTrackVolume}
                  onOpenVelocity={handleOpenVelocityLane}
                  onShiftTrack={handleShiftTrack}
                  onSmartFill={handleSmartFillTrack}
                  onClearTrack={handleClearTrack}
                  onMoveUp={handleMoveTrackUp}
                  onMoveDown={handleMoveTrackDown}
                  canMoveUp={trackIdx > 0}
                  canMoveDown={trackIdx < pattern.tracks.length - 1}
                  onChangePan={handleChangeTrackPan}
                  onChangeSwing={handleChangeTrackSwing}
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
                onSelectDimension={handleSelectParameterDimension}
                onSelectTrack={handleSelectVelocityTrack}
                onUpdateVelocity={handleUpdateVelocity}
                onBatchUpdateVelocity={handleBatchUpdateVelocity}
                onUpdateProbability={handleUpdateProbability}
                onBatchUpdateProbability={handleBatchUpdateProbability}
                onUpdateRatchet={handleUpdateRatchet}
                onBatchUpdateRatchet={handleBatchUpdateRatchet}
                onUpdateGate={handleUpdateGate}
                onBatchUpdateGate={handleBatchUpdateGate}
                onClose={handleCloseVelocityLane}
                currentStep={-1}
                isPlaying={isPlaying}
                language={language}
                stepCount={stepCount}
                stepsPerBar={stepsPerBar}
                groupSize={groupSize}
                tracksConfig={DEMO_TRACKS_CONFIG}
              />
            </div>
          )}

          {/* Bottom Hint Note */}
          <div className="mt-3.5 font-['JetBrains_Mono'] text-[10px] text-text-dim tracking-[0.04em] leading-relaxed border-t border-line-subtle pt-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {isTouchDevice ? (
                isZh ? (
                  <span>
                    <strong className="text-accent font-bold">📱 触控/移动端操作：</strong> 点按步进开/关 · 长按步进调出参数锁 (P-Locks) · 顶部步进工具栏切换重音/连音/音高模式 · 点按轨道名试听音色 · 左右滑动浏览小节
                  </span>
                ) : (
                  <span>
                    <strong className="text-accent font-bold">📱 Touch & Mobile:</strong> Tap step to toggle · Long-press for P-Locks · Switch Tool Mode ribbon for accent/ratchet/pitch · Tap track name to audition · Swipe to scroll bars
                  </span>
                )
              ) : (
                isZh ? (
                  <span>
                    <strong className="text-accent font-bold">💡 桌面快捷操作：</strong> 空格键播放/停止 · V 键力度抽屉 · E 键欧几里得 · Ctrl/Cmd+Z 撤销 · 左右拖拽直接涂抹步进 · 滚轮/标尺拖动水平平移
                  </span>
                ) : (
                  <span>
                    <strong className="text-accent font-bold">💡 Desktop Shortcuts:</strong> Space to Play/Pause · V for Velocity · E for Euclidean · Ctrl/Cmd+Z Undo · Drag to paint steps · Wheel/ruler drag to pan
                  </span>
                )
              )}
            </div>
            <div className="text-text-dim text-[9.5px]">
              Groove v1.7.0 · FL Studio Pattern Engine
            </div>
          </div>
        </section>
      </main>

      {/* Euclidean Modal */}
      {isEuclideanOpen && (
        <EuclideanModal
          isOpen={isEuclideanOpen}
          onClose={() => setIsEuclideanOpen(false)}
          tracks={pattern.tracks}
          tracksConfig={DEMO_TRACKS_CONFIG}
          initialTrackIdx={0}
          stepCount={stepCount}
          language={language}
          onApplyEuclidean={(targetTrackIdx, steps) => {
            const next = clonePattern(pattern);
            if (next.tracks[targetTrackIdx]) {
              next.tracks[targetTrackIdx].steps = [...steps];
            }
            commit({ type: "COMMIT_PATTERN", pattern: next });
            showToast(isZh ? "已生成欧几里得律动 ✓" : "Euclidean rhythm applied ✓");
          }}
        />
      )}

      {/* Pitch Picker Modal */}
      {pitchPicker.isOpen && (
        <PitchPickerModal
          isOpen={pitchPicker.isOpen}
          onClose={() => setPitchPicker((prev) => ({ ...prev, isOpen: false }))}
          trackName={pattern.tracks[pitchPicker.trackIdx]?.name || "Track"}
          trackColor={DEMO_TRACKS_CONFIG[pitchPicker.trackIdx % DEMO_TRACKS_CONFIG.length].color}
          stepIdx={pitchPicker.stepIdx}
          initialNote={pitchPicker.initialNote}
          language={language}
          currentScale={pattern.scale}
          trackPitches={pattern.tracks[pitchPicker.trackIdx]?.pitch}
          onQuantizeTrack={(quantizedPitches) => {
            commit({
              type: "BATCH_SET_PITCH",
              trackIdx: pitchPicker.trackIdx,
              pitches: quantizedPitches,
            });
            showToast(isZh ? "已将全轨音高对齐至当前调式 ✓" : "Track pitches quantized to scale ✓");
          }}
          onScaleChange={(newScale) => {
            commit({ type: "SET_SCALE", scale: newScale });
            showToast(isZh ? `已切换曲目调式: ${newScale} ✓` : `Scale set: ${newScale} ✓`);
          }}
          onSelectPitch={(stepIdx, midiNote) => {
            commit({ type: "SET_PITCH", trackIdx: pitchPicker.trackIdx, stepIdx, pitch: midiNote });
            showToast(isZh ? "音高已设定 ✓" : "Pitch set ✓");
          }}
          onPreviewNote={(midiNote) => {
            const tr = pattern.tracks[pitchPicker.trackIdx];
            if (engineRef.current && tr) {
              engineRef.current.triggerNote(pitchPicker.trackIdx, tr.name, 0.9, midiNote, 1);
            }
          }}
        />
      )}

      {/* Multi-Project Hub Modal (P7-02) */}
      <ProjectHubModal
        isOpen={isProjectHubOpen}
        onClose={() => setIsProjectHubOpen(false)}
        currentGenre={currentGenre}
        currentPatterns={{
          A: seqState.activeSlot === "A" ? pattern : seqState.patterns.A,
          B: seqState.activeSlot === "B" ? pattern : seqState.patterns.B,
        }}
        activeSlot={seqState.activeSlot}
        bpm={bpm}
        swing={swing}
        timeSignature={timeSignature}
        resolution={resolution}
        stepCount={stepCount}
        songMode={seqState.songMode}
        songChain={seqState.songChain}
        loopRange={seqState.loopRange}
        effectsRackState={effectsRackState}
        drumKit={drumKit}
        isMetronome={seqState.isMetronome}
        isCountIn={seqState.isCountIn}
        onLoadProject={handleLoadProject}
        onToast={showToast}
      />

      {/* Step Context Menu (P-Locks) */}
      {stepContextMenu && (
        <div
          className="fixed z-50 bg-[#15171d] border border-line rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] p-3 text-xs w-60 animate-fade-in"
          style={{
            left: Math.min(window.innerWidth - 250, Math.max(10, stepContextMenu.x)),
            top: Math.min(window.innerHeight - 280, Math.max(10, stepContextMenu.y)),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-['JetBrains_Mono'] text-[10px] text-accent font-bold pb-2 border-b border-line flex items-center justify-between">
            <span>
              {isZh ? "参数锁 (P-LOCKS)" : "PARAM LOCKS"} - T{stepContextMenu.trackIdx + 1}:S{stepContextMenu.stepIdx + 1}
            </span>
            <button
              onClick={() => setStepContextMenu(null)}
              className="text-text-dim hover:text-text px-1"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2.5 mt-2.5">
            {/* Ratchet Subdivisions */}
            <div className="flex items-center justify-between">
              <span className="text-text-dim">{isZh ? "连音滚奏" : "Ratchet"}:</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((r) => {
                  const cur = pattern.tracks[stepContextMenu.trackIdx]?.ratchet?.[stepContextMenu.stepIdx] || 1;
                  return (
                    <button
                      key={r}
                      onClick={() => {
                        commit({
                          type: "SET_RATCHET",
                          trackIdx: stepContextMenu.trackIdx,
                          stepIdx: stepContextMenu.stepIdx,
                          ratchet: r,
                        });
                        setStepContextMenu(null);
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                        cur === r ? "bg-accent text-black font-bold border-accent" : "bg-panel2 border-line text-text"
                      }`}
                    >
                      {r}x
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Trigger Probability */}
            <div className="flex items-center justify-between">
              <span className="text-text-dim">{isZh ? "触发概率" : "Prob"}:</span>
              <div className="flex gap-1">
                {[100, 75, 50, 25].map((p) => {
                  const cur = pattern.tracks[stepContextMenu.trackIdx]?.probability?.[stepContextMenu.stepIdx] ?? 100;
                  return (
                    <button
                      key={p}
                      onClick={() => {
                        commit({
                          type: "SET_PROBABILITY",
                          trackIdx: stepContextMenu.trackIdx,
                          stepIdx: stepContextMenu.stepIdx,
                          probability: p,
                        });
                        setStepContextMenu(null);
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                        cur === p ? "bg-accent text-black font-bold border-accent" : "bg-panel2 border-line text-text"
                      }`}
                    >
                      {p}%
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pitch Selection for Melodic Tracks */}
            <div className="pt-2 border-t border-line flex items-center justify-between">
              <span className="text-text-dim">{isZh ? "独立音高" : "Pitch"}:</span>
              <button
                onClick={() => {
                  const tr = pattern.tracks[stepContextMenu.trackIdx];
                  setPitchPicker({
                    isOpen: true,
                    trackIdx: stepContextMenu.trackIdx,
                    stepIdx: stepContextMenu.stepIdx,
                    initialNote: tr?.pitch?.[stepContextMenu.stepIdx] ?? 60,
                  });
                  setStepContextMenu(null);
                }}
                className="px-2 py-1 rounded bg-panel2 hover:bg-line border border-line text-accent font-mono text-[10px]"
              >
                {isZh ? "打开音高键盘 ♩" : "Open Keyboard ♩"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
