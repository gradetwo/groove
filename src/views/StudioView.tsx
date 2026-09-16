import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Genre, SequencerPattern } from "../types/genre";
import { AudioEngine, DrumKitType, EffectsRackState } from "../audio/AudioEngine";
import { DEFAULT_FX_STATE } from "../audio/EffectsRack";
import { loadLayoutPrefs, saveLayoutPrefs } from "../features/sequencer/layoutPrefs";
import { useLanguage } from "../i18n/LanguageContext";
import { MobileEditMode } from "../components/sequencer/Toolbar";
import { ToastBanner } from "../components/sequencer/ToastBanner";
import { StepContextMenu } from "../components/sequencer/StepContextMenu";
import { SequencerPanel } from "../components/sequencer/SequencerPanel";
import { SequencerModals } from "../components/sequencer/SequencerModals";
import { useGs1Setting } from "../features/sequencer/useGs1Setting";
import { useUnsavedGuard } from "../features/sequencer/hooks/useUnsavedGuard";
import { isPatternDirty } from "../features/sequencer/unsavedGuard";
import { UnsavedChangesDialog } from "../components/sequencer/UnsavedChangesDialog";
import { saveProject } from "../features/sequencer/projectDb";
import { GenreRail } from "../components/sequencer/GenreRail";
import { InfoDossier } from "../components/sequencer/InfoDossier";
import { ConsoleOverlay } from "../components/console/ConsoleOverlay";
import { TrackInspector } from "../components/console/TrackInspector";
import { MusicalTypingModal } from "../components/sequencer/MusicalTypingModal";
import { INSTRUMENT_PRESET_ALIASES } from "../audio/instrumentPresets";
import { bypassTrackInsert } from "../data/trackInsert";
import { resolveTrackInsertForGenre } from "../data/genreInsert";
import type { MixTrackId } from "../data/genreMix";
import { useSequencerStore } from "../features/sequencer/useSequencerStore";
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
import { followReorderedRow } from "../features/sequencer/inspectorFollow";
import { useVelocityLaneEditing } from "../features/sequencer/hooks/useVelocityLaneEditing";
import { useTransportControls } from "../features/sequencer/hooks/useTransportControls";
import { useToolbarControls } from "../features/sequencer/hooks/useToolbarControls";
import { usePanelToggles } from "../features/sequencer/hooks/usePanelToggles";
import { ChordDefinition } from "../utils/chordTheory";
import { BakedArpeggioResult } from "../utils/arpeggiatorTheory";
import { calculateGroupSize, calculateStepsPerBar } from "../utils/meter";
import { getDefaultDrumKitForGenre } from "../utils/trackUtils";

// A-02: the track colour/name mapping moved to components/sequencer/trackConfig.
// Re-exported here so this module's public surface is unchanged.
export { DEMO_TRACKS_CONFIG } from "../components/sequencer/trackConfig";

interface StudioViewProps {
  selectedGenre?: Genre;
  onSelectGenre: (genre: Genre) => void;
  onViewDetail: (genre: Genre) => void;
  onAddToCompare?: (genre: Genre) => void;
  onAudioEngineReady?: (engine: AudioEngine) => (() => void) | void;
  /** Opens the global settings panel, which App owns (item ⑤). */
  onOpenSettings?: () => void;
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
  onOpenSettings,
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

  // Central Sequencer Store (P2-04). The whole store object is kept so the floated
  // mixing console can subscribe to this exact instance instead of creating its own.
  const store = useSequencerStore(startingGenre);
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
  } = store;

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

  // Feature #2: the mixing console floats over the studio, sharing this engine + store.
  const [isConsoleOpen, setIsConsoleOpen] = useState<boolean>(false);

  // D-01/D-02: layout preferences are read **once** on mount (never on every render, so
  // a stale or failing storage read cannot fight the user's clicks) and written back
  // whenever one of them changes. Before this, all five were `useState(false)` with no
  // persistence at all, so every refresh made the user re-collapse the sidebar and
  // re-open the velocity lane.
  const [bootLayoutPrefs] = useState(() => loadLayoutPrefs());

  // Sidebar collapse & Maximize states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(
    bootLayoutPrefs.isSidebarCollapsed
  );
  const [isEditorMaximized, setIsEditorMaximized] = useState<boolean>(
    bootLayoutPrefs.isEditorMaximized
  );

  // Sequencer matrix scroll container ref & playhead beam ref (P2-03)
  const matrixContainerRef = useRef<HTMLDivElement | null>(null);
  const playheadBeamRef = useRef<HTMLDivElement | null>(null);
  const lastActiveRulerStepRef = useRef<HTMLElement | null>(null);

  // Pro Sequencer Extensions: Velocity Lane, Euclidean Generator, Pitch Picker & P-Locks
  const [isVelocityLaneOpen, setIsVelocityLaneOpen] = useState(bootLayoutPrefs.isVelocityLaneOpen);
  const [velocityActiveTrackIdx, setVelocityActiveTrackIdx] = useState(0);
  // Piano roll (item ⑦): edits the same pattern data as the step grid, one melodic track at a time.
  const [isPianoRollOpen, setIsPianoRollOpen] = useState(bootLayoutPrefs.isPianoRollOpen);
  const [pianoRollTrackIdx, setPianoRollTrackIdx] = useState(0);
  const [isEuclideanOpen, setIsEuclideanOpen] = useState(false);
  const [isAnalyzerOpen, setIsAnalyzerOpen] = useState(bootLayoutPrefs.isAnalyzerOpen);
  const [pitchPicker, setPitchPicker] = useState<PitchPickerState>({
    isOpen: false,
    trackIdx: 0,
    stepIdx: 0,
    initialNote: null,
  });

  const [stepContextMenu, setStepContextMenu] = useState<StepContextMenuState | null>(null);

  // Mobile / Tablet dedicated mobile tools (touch detection lives in useGridInteraction)
  const [mobileEditMode, setMobileEditMode] = useState<MobileEditMode>("step");
  const [showAdvancedControls, setShowAdvancedControls] = useState(
    bootLayoutPrefs.showAdvancedControls
  );

  // Phase 4 States (P4-01 ~ P4-04 & P4-06)
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);

  // Phase 5 States (P5-01 ~ P5-05)
  const [drumKit, setDrumKit] = useState<DrumKitType>(() => getDefaultDrumKitForGenre(currentGenre));
  const [isDrumsOnly, setIsDrumsOnly] = useState<boolean>(false);
  const [isRecordArmed, setIsRecordArmed] = useState<boolean>(false);
  const [effectsRackState, setEffectsRackStateLocal] = useState<EffectsRackState>(DEFAULT_FX_STATE);

  /**
   * D-03: FX changes participate in the undo stack.
   *
   * The local state stays the UI's source of truth — every consumer already takes a React
   * setter — and each change is mirrored into the store so Ctrl+Z rolls the rack back
   * together with the notes. Before this, undo restored the pattern while leaving an FX
   * change in place: a half-undo, which is worse than none.
   *
   * The next value is computed from a ref rather than inside a state updater, because
   * committing from inside an updater is a side effect React may run twice in StrictMode.
   */
  const effectsRackRef = useRef(effectsRackState);
  effectsRackRef.current = effectsRackState;
  const setEffectsRackState = useCallback<React.Dispatch<React.SetStateAction<EffectsRackState>>>(
    (action) => {
      const prev = effectsRackRef.current;
      const next = typeof action === "function" ? action(prev) : action;
      effectsRackRef.current = next;
      setEffectsRackStateLocal(next);
      // Coalesced under one key, so dragging a slider is one history entry rather than
      // one per frame.
      commitCoalesced({ type: "SET_EFFECTS_RACK", effectsRack: next }, "fx");
    },
    [commitCoalesced]
  );

  // ...and when history restores a rack, the UI follows it.
  const storedEffectsRack = seqState.effectsRack;
  useEffect(() => {
    if (storedEffectsRack && storedEffectsRack !== effectsRackRef.current) {
      effectsRackRef.current = storedEffectsRack;
      setEffectsRackStateLocal(storedEffectsRack);
    }
  }, [storedEffectsRack]);

  // Multi-Project Hub State (P7-02)
  const [isProjectHubOpen, setIsProjectHubOpen] = useState(false);

  /**
   * E-10: which track's inspector is open, or null.
   *
   * The Logic-style affordance the user asked for: clicking a track header (or its sliders
   * button) opens that one track's full configuration — timbre, mix and insert chain —
   * instead of sending the user to a separate mixer view.
   */
  const [inspectorTrackIdx, setInspectorTrackIdx] = useState<number | null>(null);

  /**
   * Keep the inspector pointed at the same *track* when rows are reordered.
   *
   * The inspector is addressed by row index, but `REORDER_TRACKS` swaps two rows, so
   * without this the panel would silently start editing the neighbouring track after a
   * move-up/move-down. `moveInspectorWithRow` is defined here (it only needs the setter);
   * the two wrappers that also call the reorder handlers live below `useTrackControls`.
   */
  const moveInspectorWithRow = useCallback((idx: number, toIndex: number) => {
    setInspectorTrackIdx((current) => followReorderedRow(current, idx, toIndex));
  }, []);

  /**
   * D-02: persist the five layout toggles whenever one changes.
   *
   * `isDrumsOnly`, `isKeyboardMode` and `isRecordArmed` are deliberately absent — they
   * describe live performance state, not layout, and silently restoring them would
   * re-arm the recorder or re-enter drum-only mode on the next visit (D-06).
   */
  useEffect(() => {
    saveLayoutPrefs({
      isSidebarCollapsed,
      isEditorMaximized,
      isVelocityLaneOpen,
      isAnalyzerOpen,
      isPianoRollOpen,
      showAdvancedControls,
    });
  }, [
    isSidebarCollapsed,
    isEditorMaximized,
    isVelocityLaneOpen,
    isAnalyzerOpen,
    isPianoRollOpen,
    showAdvancedControls,
  ]);

  // AudioEngine ref
  const engineRef = useRef<AudioEngine | null>(null);

  /**
   * GS-1 ("new architecture voices") switch.
   *
   * The engine owns and persists the value, the schedulers read it from module state, and three
   * surfaces display it (this toolbar chip, the settings panel's audio tab, the About tab). The
   * shared `useGs1Setting` hook subscribes to that module state, so whichever surface flips it,
   * they all re-render together — and writes still go through the engine so persistence and the
   * host teardown happen.
   */
  const [gs1Enabled, setGs1Enabled] = useGs1Setting(engineRef.current);
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

  /**
   * "Discard your changes?" (item ⑧).
   *
   * `SET_GENRE` replaces both pattern slots with the new genre's defaults, so switching genre —
   * like loading a project, generating a variation or importing a MIDI file — destroys edits with
   * no undo. Those are the actions routed through this guard; switching pattern *slots* is not,
   * because both slots are kept.
   *
   * Detection is stateless (`isPatternDirty` regenerates the genre default and compares), so no
   * mutating action can forget to mark the studio dirty.
   */
  const guard = useUnsavedGuard({
    // The hook re-reads these options on every render, so plain values are always current —
    // no refs needed, and therefore no way for a stale closure to hide an edit.
    isDirty: () => isPatternDirty({ A: seqState.patterns.A, B: seqState.patterns.B }, currentGenre),
    onSave: async () => {
      if (!activeProject) {
        // Nowhere to save yet: send the user to the hub to name one, and do NOT run the
        // destructive action — losing the edits to a failed save would be the worst outcome.
        setIsProjectHubOpen(true);
        return false;
      }
      try {
        await saveProject({
          ...activeProject,
          genreId: currentGenre.id,
          genreName: currentGenre.name || currentGenre.id,
          bpm: seqState.bpm,
          swing: seqState.swing,
          timeSignature: seqState.timeSignature,
          resolution: seqState.resolution,
          stepCount: seqState.stepCount,
          patterns: { A: seqState.patterns.A, B: seqState.patterns.B },
          activeSlot: seqState.activeSlot,
          songMode: seqState.songMode,
          songChain: seqState.songChain,
          loopRange: seqState.loopRange,
          effectsRack: { ...effectsRackState },
          drumKit,
          isMetronome: seqState.isMetronome,
          isCountIn: seqState.isCountIn,
          updatedAt: Date.now(),
        });
        showToast(t("unsaved_saved"));
        return true;
      } catch (err) {
        showToast(t("unsaved_save_failed", { error: String((err as Error)?.message ?? err) }));
        return false;
      }
    },
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
    setEffectsRackState,
    clearPlayhead,
    commit,
    // Item ⑧: the hook asks before any genre switch destroys unsaved edits — including the
    // navigation path (Explore / search / random genre), which used to discard them silently.
    requestGenreGuard: (genre, run) =>
      guard.request(t("unsaved_action_genre", { name: genre.name || genre.id }), run),
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
    isConsoleOpen,
    setIsConsoleOpen,
    onTogglePlay: handleTogglePlay,
    onToggleDrumsOnly: handleToggleDrumsOnly,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onToggleKeyboardMode: () => setIsKeyboardMode((prev) => !prev),
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

  // E-10: the reorder handlers the JSX actually receives, with the inspector index remapped
  // so an open panel keeps editing the track the user opened it for.
  const handleMoveTrackUpWithInspector = useCallback(
    (idx: number) => {
      moveInspectorWithRow(idx, Math.max(0, idx - 1));
      handleMoveTrackUp(idx);
    },
    [handleMoveTrackUp, moveInspectorWithRow]
  );

  const handleMoveTrackDownWithInspector = useCallback(
    (idx: number) => {
      // Clamp exactly like the reorder handler: a no-op move must not leave the inspector
      // pointing past the last row.
      const toIndex = Math.min(patternRef.current.tracks.length - 1, idx + 1);
      moveInspectorWithRow(idx, toIndex);
      handleMoveTrackDown(idx);
    },
    [handleMoveTrackDown, moveInspectorWithRow, patternRef]
  );

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
    handleToggleConsole,
  } = usePanelToggles({
    setIsSidebarCollapsed,
    setIsEditorMaximized,
    setShowAdvancedControls,
    setIsVelocityLaneOpen,
    setIsEuclideanOpen,
    setIsAnalyzerOpen,
    setIsProjectHubOpen,
    setIsConsoleOpen,
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

  /**
   * Open the roll for a track.
   *
   * Only melodic roles have a meaningful pitch, so a request for any other track is redirected to
   * the first editable one — the alternative is a grid of notes that the engine ignores.
   */
  const handleOpenPianoRoll = useCallback(
    (trackIdx?: number) => {
      if (typeof trackIdx === "number" && trackIdx >= 0 && trackIdx < patternRef.current.tracks.length) {
        setPianoRollTrackIdx(trackIdx);
      } else {
        const editableIdx = patternRef.current.tracks.findIndex((tr) =>
          tr.track_id === "bass" || tr.track_id === "chords" || tr.track_id === "lead"
        );
        setPianoRollTrackIdx(editableIdx === -1 ? 0 : editableIdx);
      }
      setIsPianoRollOpen(true);
    },
    []
  );

  const handleTogglePianoRoll = useCallback(() => {
    // Opening from the toolbar targets a melodic track rather than whatever index happens to be
    // current: a roll over the kick track would show an empty grid the engine ignores.
    //
    // The target is resolved *outside* the state updater on purpose. Doing it inside (`setOpen(o
    // => { if (!o) handleOpenPianoRoll(...); ... })`) is a side effect during the render phase:
    // React may run the updater twice and the nested update gets dropped, which is exactly how the
    // roll failed to open on some devices while working on others.
    if (isPianoRollOpen) {
      setIsPianoRollOpen(false);
      return;
    }
    handleOpenPianoRoll(pianoRollTrackIdx);
    setIsPianoRollOpen(true);
  }, [isPianoRollOpen, handleOpenPianoRoll, pianoRollTrackIdx]);

  const handleClosePianoRoll = useCallback(() => setIsPianoRollOpen(false), []);

  /** Live compressor gain reduction for the effects page's meter (polled by that component). */
  const handleReadGainReduction = useCallback(
    // No track selected (panel closed) reads as 0 dB of reduction, which is what the meter shows.
    () => (inspectorTrackIdx === null ? 0 : engineRef.current?.getTrackCompressorReductionDb(inspectorTrackIdx) ?? 0),
    [inspectorTrackIdx]
  );

  /**
   * Audition one note through the track's own instrument, so drawing is audible and the roll
   * previews exactly what the sequencer will play (same engine call, same voice routing).
   */
  const handleAuditionRollNote = useCallback(
    (trackIdx: number, midi: number, velocity: number, gate: number) => {
      const track = patternRef.current.tracks[trackIdx];
      if (!track) return;
      engineRef.current?.triggerNote(trackIdx, track.name, velocity / 127, midi, 1, gate);
    },
    []
  );

  const anySolo = useMemo(() => pattern.tracks.some((t) => t.solo), [pattern.tracks]);

  return (
    <div className="w-full text-text" style={{ ["--g" as any]: genreAccent }}>
      <ToastBanner message={toastMessage} />

      {/* Genre Rail Wrapper (.rail-wrap) */}
      <GenreRail
        currentGenreId={currentGenre.id}
        activeCategoryFilter={activeCategoryFilter}
        categories={categories}
        railGenres={railGenres}
        genreAccent={genreAccent}
        isZh={isZh}
        onSelectCategory={setActiveCategoryFilter}
        // The unsaved-changes question is asked inside `switchGenre` (useGenreSwitching), so it
        // covers the rail, the dice button and navigation in one place.
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
        <SequencerPanel
          pattern={pattern}
          seqState={seqState}
          isPlaying={isPlaying}
          viewedBar={viewedBar}
          barCount={barCount}
          stepsPerBar={stepsPerBar}
          groupSize={groupSize}
          anySolo={anySolo}
          velocityActiveTrackIdx={velocityActiveTrackIdx}
          isSidebarCollapsed={isSidebarCollapsed}
          isEditorMaximized={isEditorMaximized}
          isVelocityLaneOpen={isVelocityLaneOpen}
          isAnalyzerOpen={isAnalyzerOpen}
          commit={commit}
          isPianoRollOpen={isPianoRollOpen}
          pianoRollTrackIdx={pianoRollTrackIdx}
          onSelectPianoRollTrack={setPianoRollTrackIdx}
          onOpenPianoRoll={handleOpenPianoRoll}
          onClosePianoRoll={handleClosePianoRoll}
          onTogglePianoRoll={handleTogglePianoRoll}
          onAuditionRollNote={handleAuditionRollNote}
          language={language}
          isZh={isZh}
          canUndo={canUndo}
          canRedo={canRedo}
          genreName={currentGenre.name}
          genreAccent={genreAccent}
          activeProjectName={activeProject?.name}
          isDrumsOnly={isDrumsOnly}
          isRecordArmed={isRecordArmed}
          drumKit={drumKit}
          effectsRackState={effectsRackState}
          isExportingAudio={isExportingAudio}
          isKeyboardMode={isKeyboardMode}
          midiDeviceCount={midiDevices.length}
          mobileEditMode={mobileEditMode}
          showAdvancedControls={showAdvancedControls}
          isTouchDevice={isTouchDevice}
          isRulerDragging={isRulerDragging}
          matrixContainerRef={matrixContainerRef}
          playheadBeamRef={playheadBeamRef}
          analyser={engineRef.current?.getMasterAnalyser() || null}
          analyserL={engineRef.current?.getStereoAnalysers().left || null}
          analyserR={engineRef.current?.getStereoAnalysers().right || null}
          onOpenGenreMaker={onOpenGenreMaker}
          onChangeMobileEditMode={setMobileEditMode}
          onCloseAnalyzer={() => setIsAnalyzerOpen(false)}
          isConsoleOpen={isConsoleOpen}
          onToggleConsole={handleToggleConsole}
          onTogglePlay={handleTogglePlay}
          onChangeBpm={handleChangeBpm}
          onChangeSwing={handleChangeSwing}
          onChangeTimeSignature={handleChangeTimeSignature}
          onChangeResolution={handleChangeResolution}
          onChangeStepCount={handleChangeStepCount}
          onChangeDrumKit={handleChangeDrumKit}
          onToggleDrumsOnly={handleToggleDrumsOnly}
          onToggleRecordArmed={handleToggleRecordArmed}
          onChangeEffectsRack={handleChangeEffectsRack}
          onSelectBar={scrollToBar}
          onToggleVelocityLane={handleToggleVelocityLane}
          onOpenEuclidean={handleOpenEuclidean}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onToggleMaximize={handleToggleMaximize}
          onToggleSidebar={handleToggleSidebar}
          onToggleAdvancedControls={handleToggleAdvancedControls}
          onQuickAction={(action) =>
            // "reset preset" / "clear saved" reload the genre default, discarding edits; the other
            // quick actions edit in place and are undoable, so they are not gated.
            action === "reset_preset" || action === "clear_saved"
              ? guard.request(t("unsaved_action_genre", { name: currentGenre.name || currentGenre.id }), () =>
                  handleQuickAction(action)
                )
              : handleQuickAction(action)
          }
          onExportMidi={handleExportMidi}
          onExportAls={handleExportAls}
          onExportGroove={handleExportGroove}
          onOpenProjectHub={handleOpenProjectHub}
          onExportWav={handleExportWav}
          onExportStems={handleExportStems}
          onImportMidi={async (file) => {
            guard.request(t("unsaved_action_import", { name: file?.name ?? "MIDI" }), () =>
              handleImportMidi(file)
            );
          }}
          onInspireMe={() => guard.request(t("unsaved_action_inspire"), () => handleInspireMe())}
          onToggleKeyboardMode={handleToggleKeyboardMode}
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
          onToggleAnalyzer={handleToggleAnalyzer}
          onTapTempo={handleTapTempo}
          handleGridPointerDown={handleGridPointerDown}
          handleGridPointerMove={handleGridPointerMove}
          handleGridPointerUp={handleGridPointerUp}
          handleGridContextMenu={handleGridContextMenu}
          handleSelectLoopRange={handleSelectLoopRange}
          handleRulerPointerDown={handleRulerPointerDown}
          handleRulerPointerMove={handleRulerPointerMove}
          handleRulerPointerUp={handleRulerPointerUp}
          onAudition={handleAudition}
          onCycleLength={handleCycleTrackLength}
          onToggleMute={handleToggleTrackMute}
          onToggleSolo={handleToggleTrackSolo}
          onChangeTrackVolume={handleChangeTrackVolume}
          onOpenVelocity={handleOpenVelocityLane}
          onOpenInspector={setInspectorTrackIdx}
          inspectorTrackIdx={inspectorTrackIdx}
          // P6: the engine owns and persists it; the hook keeps every surface in sync.
          gs1Enabled={gs1Enabled}
          onToggleGs1={() => setGs1Enabled(!gs1Enabled)}
          onOpenAudioSettings={onOpenSettings}
          onShiftTrack={handleShiftTrack}
          onSmartFill={handleSmartFillTrack}
          onClearTrack={handleClearTrack}
          onMoveTrackUp={handleMoveTrackUpWithInspector}
          onMoveTrackDown={handleMoveTrackDownWithInspector}
          onChangeTrackPan={handleChangeTrackPan}
          onChangeTrackSwing={handleChangeTrackSwing}
          onSelectParameterDimension={handleSelectParameterDimension}
          onSelectVelocityTrack={handleSelectVelocityTrack}
          onUpdateVelocity={handleUpdateVelocity}
          onBatchUpdateVelocity={handleBatchUpdateVelocity}
          onUpdateProbability={handleUpdateProbability}
          onBatchUpdateProbability={handleBatchUpdateProbability}
          onUpdateRatchet={handleUpdateRatchet}
          onBatchUpdateRatchet={handleBatchUpdateRatchet}
          onUpdateGate={handleUpdateGate}
          onBatchUpdateGate={handleBatchUpdateGate}
          onCloseVelocityLane={handleCloseVelocityLane}
        />
      </main>

      <SequencerModals
        pattern={pattern}
        seqState={seqState}
        isZh={isZh}
        language={language}
        showToast={showToast}
        commit={commit}
        engineRef={engineRef}
        isEuclideanOpen={isEuclideanOpen}
        setIsEuclideanOpen={setIsEuclideanOpen}
        pitchPicker={pitchPicker}
        setPitchPicker={setPitchPicker}
        isProjectHubOpen={isProjectHubOpen}
        setIsProjectHubOpen={setIsProjectHubOpen}
        currentGenre={currentGenre}
        bpm={bpm}
        swing={swing}
        timeSignature={timeSignature}
        resolution={resolution}
        stepCount={stepCount}
        effectsRackState={effectsRackState}
        drumKit={drumKit}
        handleLoadProject={async (project) => {
          guard.request(t("unsaved_action_project", { name: project.name }), () => handleLoadProject(project));
        }}
      />

      {/* Piano roll (item ⑦) opens for the track whose header was clicked; the drawer itself is
          rendered by SequencerPanel so it sits with the grid it mirrors. */}

      {/* Unsaved-changes guard (item ⑧): shown when a destructive action is waiting on an answer. */}
      <UnsavedChangesDialog
        isOpen={guard.pending !== null}
        actionLabel={guard.pending?.label ?? ""}
        saveHint={activeProject ? undefined : t("unsaved_save_no_project_hint")}
        onDecide={guard.decide}
      />

      {/* Step Context Menu (P-Locks) */}
      {stepContextMenu && (
        <StepContextMenu
          state={stepContextMenu}
          pattern={pattern}
          commit={commit}
          onClose={() => setStepContextMenu(null)}
          onOpenPitchPicker={setPitchPicker}
          isZh={isZh}
        />
      )}

      {/* Feature #2: the mixing console floats over the studio with the SAME engine
          and store — it never constructs either. Closed => renders nothing. */}
      {inspectorTrackIdx !== null && pattern.tracks[inspectorTrackIdx] && (
        <TrackInspector
          onOpenPianoRoll={() => handleOpenPianoRoll(inspectorTrackIdx)}
          // Item ①: the effects page draws curves from the real context rate and meters the
          // compressor the strip is actually running.
          sampleRate={engineRef.current?.getAudioContext()?.sampleRate ?? 48000}
          isPlaying={isPlaying}
          getGainReductionDb={handleReadGainReduction}
          role={(pattern.tracks[inspectorTrackIdx].track_id || "chords") as MixTrackId}
          trackName={pattern.tracks[inspectorTrackIdx].name}
          instrument={pattern.tracks[inspectorTrackIdx].instrument}
          // The snake_case names the genre data uses; the alias table is the one place
          // that maps them to presets, so it is also the honest source for the picker.
          instrumentOptions={Object.keys(INSTRUMENT_PRESET_ALIASES)}
          onInstrumentChange={(instrument) =>
            commit({ type: "SET_TRACK_INSTRUMENT", trackIdx: inspectorTrackIdx, instrument })
          }
          volume={pattern.tracks[inspectorTrackIdx].volume ?? 0.8}
          pan={pattern.tracks[inspectorTrackIdx].pan ?? 0}
          sendA={pattern.tracks[inspectorTrackIdx].sendA ?? 0}
          sendB={pattern.tracks[inspectorTrackIdx].sendB ?? 0}
          muted={Boolean(pattern.tracks[inspectorTrackIdx].mute)}
          soloed={Boolean(pattern.tracks[inspectorTrackIdx].solo)}
          onVolumeChange={(v) => handleChangeTrackVolume(inspectorTrackIdx, v)}
          onPanChange={(v) => handleChangeTrackPan(inspectorTrackIdx, v)}
          // Coalesced under the track index, so dragging a send is one history entry.
          onSendAChange={(v) =>
            commitCoalesced(
              { type: "SET_TRACK_SENDS", trackIdx: inspectorTrackIdx, sendA: v },
              `sends:${inspectorTrackIdx}`
            )
          }
          onSendBChange={(v) =>
            commitCoalesced(
              { type: "SET_TRACK_SENDS", trackIdx: inspectorTrackIdx, sendB: v },
              `sends:${inspectorTrackIdx}`
            )
          }
          onMuteToggle={() => handleToggleTrackMute(inspectorTrackIdx)}
          onSoloToggle={() => handleToggleTrackSolo(inspectorTrackIdx)}
          insert={
            pattern.tracks[inspectorTrackIdx].insert ??
            resolveTrackInsertForGenre(
              pattern.tracks[inspectorTrackIdx].track_id,
              pattern.genre_id
            )
          }
          // Coalesced per track: a knob drag is one undo step, not one per frame.
          onChangeInsert={(patch) =>
            commitCoalesced(
              { type: "SET_TRACK_INSERT", trackIdx: inspectorTrackIdx, patch },
              `insert:${inspectorTrackIdx}`
            )
          }
          onResetInsert={() =>
            commit({
              type: "REPLACE_TRACK_INSERT",
              trackIdx: inspectorTrackIdx,
              insert: resolveTrackInsertForGenre(
                pattern.tracks[inspectorTrackIdx].track_id,
                pattern.genre_id
              ),
            })
          }
          onBypassInsert={() =>
            commit({
              type: "REPLACE_TRACK_INSERT",
              trackIdx: inspectorTrackIdx,
              insert: bypassTrackInsert(),
            })
          }
          onClose={() => setInspectorTrackIdx(null)}
        />
      )}

      <ConsoleOverlay
        isOpen={isConsoleOpen}
        engine={engineRef.current}
        store={store}
        drumKit={drumKit}
        isPlaying={isPlaying}
        onToggleTransport={handleTogglePlay}
        onClose={() => setIsConsoleOpen(false)}
      />

      <MusicalTypingModal
        isOpen={isKeyboardMode}
        onClose={() => setIsKeyboardMode(false)}
        pattern={pattern}
        activeTrackIdx={pianoRollTrackIdx}
        onSelectTrack={setPianoRollTrackIdx}
        onAudition={handleAuditionRollNote}
        isZh={isZh}
      />
    </div>
  );
};
