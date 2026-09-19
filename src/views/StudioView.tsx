import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Keyboard, Play, Square } from "lucide-react";
import { Genre, SequencerPattern } from "../types/genre";
import { AudioEngine, DrumKitType, EffectsRackState } from "../audio/AudioEngine";
import { loadKeyboardFabPref } from "../features/sequencer/keyboardFabPref";
import { useLanguage } from "../i18n/LanguageContext";
import { useDeviceCapabilities } from "../hooks/useDeviceCapabilities";
import { useDensityPreference } from "../hooks/useDensityPreference";
import { usePanelVisibility } from "../features/sequencer/hooks/usePanelVisibility";
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
import { useInitialAutoPlay } from "../features/sequencer/hooks/useInitialAutoPlay";
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
import { useAuditionPreview } from "../features/sequencer/hooks/useAuditionPreview";
import { useEffectsRack } from "../features/sequencer/hooks/useEffectsRack";

// A-02: the track colour/name mapping moved to components/sequencer/trackConfig.
// Re-exported here so this module's public surface is unchanged.
export { DEMO_TRACKS_CONFIG } from "../components/sequencer/trackConfig";

interface StudioViewProps {
  selectedGenre?: Genre;
  onSelectGenre: (genre: Genre) => void;
  onViewDetail: (genre: Genre) => void;
  onAddToCompare?: (genre: Genre) => void;
  /**
   * Navigates to the Chords view. Used by the phone's "the piano roll is a desktop tool" notice,
   * which offers progressions as the alternative rather than leaving a dead end.
   */
  onOpenChords?: () => void;
  onAudioEngineReady?: (engine: AudioEngine) => (() => void) | void;
  /** Opens the global settings panel, which App owns (item ⑤). */
  onOpenSettings?: () => void;
  /**
   * The phone navigation bar, supplied by `App` so the studio can place it on the same bottom row
   * as the transport instead of stacking two full-width bars on a 390 px-tall viewport.
   *
   * `App` keeps ownership — it renders the element either way — and this only decides where the row
   * goes. See `PRODUCT_PLAN_v2.1.0.md` §G.5 and the recipe above §G.6.
   */
  mobileBottomBar?: React.ReactNode;
  onOpenGenreMaker?: () => void;
  onOpenHelp?: (chapterId?: string) => void;
  initialChords?: ChordDefinition[] | null;
  onClearInitialChords?: () => void;
  initialArpeggio?: { baked: BakedArpeggioResult; label?: string } | null;
  onClearInitialArpeggio?: () => void;
  initialMasterclassPattern?: { pattern: SequencerPattern; label?: string } | null;
  onClearInitialMasterclassPattern?: () => void;
  initialOpenPianoRollTrack?: number | string | null;
  /**
   * U2: the new-user guide's first slide offers one action — hear the current genre — and hands the
   * request over before this view mounts. See `useInitialAutoPlay`.
   */
  initialAutoPlay?: boolean;
  onClearInitialAutoPlay?: () => void;
  onClearInitialOpenPianoRollTrack?: () => void;
}

export const StudioView: React.FC<StudioViewProps> = ({
  selectedGenre: initialGenre,
  onSelectGenre,
  onViewDetail,
  onAddToCompare,
  onOpenChords,
  onAudioEngineReady,
  onOpenGenreMaker,
  onOpenSettings,
  mobileBottomBar,
  onOpenHelp,
  initialChords,
  onClearInitialChords,
  initialArpeggio,
  onClearInitialArpeggio,
  initialMasterclassPattern,
  onClearInitialMasterclassPattern,
  initialOpenPianoRollTrack,
  onClearInitialOpenPianoRollTrack,
  initialAutoPlay,
  onClearInitialAutoPlay,
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

  /**
   * D-01/D-02 — panel visibility, its defaults and its persistence.
   *
   * Extracted to `usePanelVisibility` so a surface does not have to copy the read-once discipline
   * and the persist effect (or, worse for the user, forget to and lose their layout on refresh).
   * The hook returns the same names, so the rest of this view is unchanged.
   */
  const {
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    isEditorMaximized,
    setIsEditorMaximized,
    isVelocityLaneOpen,
    setIsVelocityLaneOpen,
    velocityActiveTrackIdx,
    setVelocityActiveTrackIdx,
    isPianoRollOpen,
    setIsPianoRollOpen,
    pianoRollTrackIdx,
    setPianoRollTrackIdx,
    isEuclideanOpen,
    setIsEuclideanOpen,
    isAnalyzerOpen,
    setIsAnalyzerOpen,
    showAdvancedControls,
    setShowAdvancedControls,
    autoFollowPlayhead,
    setAutoFollowPlayhead,
  } = usePanelVisibility();

  // Sequencer matrix scroll container ref & playhead beam ref (P2-03)
  const matrixContainerRef = useRef<HTMLDivElement | null>(null);
  const playheadBeamRef = useRef<HTMLDivElement | null>(null);
  const lastActiveRulerStepRef = useRef<HTMLElement | null>(null);
  const [pitchPicker, setPitchPicker] = useState<PitchPickerState>({
    isOpen: false,
    trackIdx: 0,
    stepIdx: 0,
    initialNote: null,
  });

  const [stepContextMenu, setStepContextMenu] = useState<StepContextMenuState | null>(null);

  // Mobile / Tablet dedicated mobile tools (touch detection lives in useGridInteraction)
  const [mobileEditMode, setMobileEditMode] = useState<MobileEditMode>("step");
  /**
   * C-06: the 界面密度 preference is applied as `data-density` on `<html>`, which is what the
   * geometry custom properties in `index.css` select on. Without this the setting was stored,
   * shown as pressed in Settings, and changed nothing.
   */
  useDensityPreference();

  // Phase 4 States (P4-01 ~ P4-04 & P4-06)
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);
  const [showKeyboardFab, setShowKeyboardFab] = useState<boolean>(() => loadKeyboardFabPref());

  useEffect(() => {
    const handleFabSync = () => {
      setShowKeyboardFab(loadKeyboardFabPref());
    };
    window.addEventListener("groove_fab_pref_changed", handleFabSync);
    window.addEventListener("storage", handleFabSync);
    return () => {
      window.removeEventListener("groove_fab_pref_changed", handleFabSync);
      window.removeEventListener("storage", handleFabSync);
    };
  }, []);

  // Phase 5 States (P5-01 ~ P5-05)
  const [drumKit, setDrumKit] = useState<DrumKitType>(() => getDefaultDrumKitForGenre(currentGenre));
  const [isDrumsOnly, setIsDrumsOnly] = useState<boolean>(false);
  const [isRecordArmed, setIsRecordArmed] = useState<boolean>(false);

  /**
   * D-03 — the master FX rack is local UI state *and* part of the undo history.
   *
   * Extracted to `useEffectsRack`: it is not a plain `useState`, because every consumer takes a
   * React setter while the rack must also live in the pattern so Ctrl+Z rolls it back with the
   * notes. The two hazards — committing inside a state updater (which StrictMode double-runs) and
   * history restoring a rack underneath the UI — are handled in one place instead of at each call
   * site. See the hook for the full reasoning.
   */
  const { effectsRackState, setEffectsRackState, effectsRackRef } = useEffectsRack({
    storedRack: seqState.effectsRack,
    commitCoalesced,
  });

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
  const { clearPlayhead, engineReady } = useAudioEngineLifecycle({
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
    autoFollowPlayhead,
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

  /**
   * The roll's lane scope is owned by `useAuditionPreview`, which this view creates further down
   * (it needs `handleAudition`, itself produced below the transport). The transport is created
   * first and still has to release that scope when the arrangement starts, so the call is bound
   * late through a ref.
   *
   * `AudioEngine.play()` already clears the scope — that is what stops a full play scheduling one
   * lane — but the roll's `isRollPreviewing` state would stay true and leave its toggle lit over a
   * scope that no longer exists. The wrapper has a stable identity because
   * `useTransportControls` keeps it in a `useCallback` dependency list.
   */
  const releasePreviewScopeRef = useRef<(() => void) | null>(null);
  const releasePreviewScope = useCallback(() => releasePreviewScopeRef.current?.(), []);

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
    releasePreviewScope,
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

  /**
   * U2: consume a pending "play as soon as you can" request from the new-user guide's first slide.
   * Mounted here because this is where the engine and the transport both exist.
   */
  useInitialAutoPlay({
    requested: Boolean(initialAutoPlay),
    ready: engineReady,
    play: handleTogglePlay,
    onConsumed: () => onClearInitialAutoPlay?.(),
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

  /**
   * Phone layout switch. Capability-based rather than a width test, so a landscape phone gets the
   * compact transport instead of the desktop toolbar on a 390 px-tall screen.
   */
  const { isMobile: isPhone, isShortLandscape } = useDeviceCapabilities();

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

  // Auto-open piano roll on handed-over track request (e.g. from chord workbench)
  useEffect(() => {
    if (initialOpenPianoRollTrack !== null && initialOpenPianoRollTrack !== undefined) {
      if (typeof initialOpenPianoRollTrack === "string") {
        const targetIdx = patternRef.current.tracks.findIndex(
          (t) => t.track_id === initialOpenPianoRollTrack
        );
        handleOpenPianoRoll(targetIdx === -1 ? undefined : targetIdx);
      } else {
        handleOpenPianoRoll(initialOpenPianoRollTrack);
      }
      setIsPianoRollOpen(true);
      if (onClearInitialOpenPianoRollTrack) {
        onClearInitialOpenPianoRollTrack();
      }
    }
  }, [initialOpenPianoRollTrack, handleOpenPianoRoll, onClearInitialOpenPianoRollTrack]);

  const handleTogglePianoRoll = useCallback(() => {
    // Opening from the toolbar targets a melodic track rather than whatever index happens to be
    // current: a roll over the kick track would show an empty grid the engine ignores.
    if (isPianoRollOpen) {
      setIsPianoRollOpen(false);
      return;
    }
    const currentTrack = patternRef.current.tracks[pianoRollTrackIdx];
    const isCurrentMelodic = currentTrack && (currentTrack.track_id === "bass" || currentTrack.track_id === "chords" || currentTrack.track_id === "lead");
    if (!isCurrentMelodic) {
      const editableIdx = patternRef.current.tracks.findIndex((tr) =>
        tr.track_id === "bass" || tr.track_id === "chords" || tr.track_id === "lead"
      );
      handleOpenPianoRoll(editableIdx === -1 ? 0 : editableIdx);
    } else {
      handleOpenPianoRoll(pianoRollTrackIdx);
    }
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
   * Auditioning — single notes, whole voicings and isolated lane playback.
   *
   * Extracted to `useAuditionPreview`: it is audio behaviour (it calls the engine and reads the
   * current pattern) and none of it knows how a control looks, so a second surface should not have to
   * copy the four decisions it encodes — the voicing-vs-note rule for a chords track, yielding the
   * transport to an isolated preview, only stopping what the preview started, and clearing the scope
   * on unmount so it cannot constrain the next play.
   */
  const {
    handleAuditionRollNote,
    handlePreviewChord,
    handleAuditionInspectorTrack,
    handleStartRollPreview,
    handleStopRollPreview,
    releasePreviewScope: releaseAuditionPreviewScope,
    isRollPreviewing,
  } = useAuditionPreview({
    engineRef,
    patternRef,
    setIsPlaying,
    clearPlayhead,
    handleAudition,
    inspectorTrackIdx,
  });

  // Bind the late wire the transport reads (see `releasePreviewScopeRef` above).
  useEffect(() => {
    releasePreviewScopeRef.current = releaseAuditionPreviewScope;
  }, [releaseAuditionPreviewScope]);

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
        } gap-5 px-3 sm:px-7 py-3 pb-6 safe-pb items-start`}
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
          isPhone={isPhone}
          isShortLandscape={isShortLandscape}
          bottomBar={mobileBottomBar}
          onOpenChords={onOpenChords}
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
          onPreviewChord={handlePreviewChord}
          onStartRollPreview={handleStartRollPreview}
          onStopRollPreview={handleStopRollPreview}
          isRollPreviewing={isRollPreviewing}
          onOpenHelp={onOpenHelp}
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
          // The header's ▶ audition button is desktop-only now (it did not fit the 142 px
          // phone column), so the inspector is the phone's route to it.
          onAudition={handleAuditionInspectorTrack}
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

      {/**
        * Floating keyboard button — phones only.
        *
        * On a phone the toolbar is replaced by the compact transport bar, so the floating button is
        * the only always-visible route to the keyboard and it earns its place. On a desktop it sat
        * on top of the sequencer in the bottom-right corner while the keyboard was already one tap
        * away in the toolbar (and on ⌥K), so it was pure occlusion.
        */}
      {showKeyboardFab && !isKeyboardMode && (
        <button
          type="button"
          onClick={() => setIsKeyboardMode(true)}
          title={isZh ? "打开虚拟键盘 (⌥K)" : "Open Virtual Keyboard (⌥K)"}
          aria-label={isZh ? "打开虚拟键盘" : "Open Virtual Keyboard"}
          data-testid="virtual-keyboard-fab"
          className="fixed bottom-5 right-4 sm:hidden z-[9990] flex h-12 w-12 items-center justify-center rounded-full bg-accent text-black shadow-[0_8px_24px_rgba(245,183,61,0.45),0_2px_8px_rgba(0,0,0,0.5)] transition-all duration-200 active:scale-95 pointer-events-auto border-2 border-white/20"
          style={{ zIndex: 9990 }}
        >
          <Keyboard className="h-6 w-6 stroke-[2.2]" />
        </button>
      )}
    </div>
  );
};
