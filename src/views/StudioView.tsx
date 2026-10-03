import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Keyboard, Play, Square } from "lucide-react";
import { Genre, SequencerPattern } from "../types/genre";
import { AudioEngine, EffectsRackState } from "../audio/AudioEngine";
import {
  useInspectorCursor,
  useKeyboardPerformance,
  usePlaybackSettings,
} from "../features/sequencer/hooks/useStudioSession";
import { useLanguage } from "../i18n/LanguageContext";
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
import { ArrangementPanel, type ArrangementEdit } from "../components/arrangement/ArrangementPanel";
import { sessionSong } from "../data/songFlatten";
import { arrangementSections, type ArrangementFormId } from "../data/arrangementForm";
import { TrackInspector } from "../components/console/TrackInspector";
import {
  CatalogueRecordingPicker,
  instrumentChoicesFromAssets,
} from "../components/arrangement/CatalogueRecordingPicker";
import type { InstrumentChoice } from "../components/arrangement/TrackListV2";
import type { SampleAsset } from "../data/sampleCatalogue";
import { appCatalogueRuntime } from "../data/sampleCatalogueRuntime";
import {
  describeCatalogueStatus,
  describeRuntimeStatus,
  type CatalogueStatus,
} from "../data/sampleCatalogueStatus";
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
import { useFirstRunPrompt } from "../features/sequencer/hooks/useFirstRunPrompt";
import { useAutosaveStatus } from "../features/sequencer/hooks/useAutosaveStatus";
import { SaveIndicator } from "../components/sequencer/SaveIndicator";
import { FirstRunPrompt } from "../components/onboarding/FirstRunPrompt";
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
import { useAuditionPreview } from "../features/sequencer/hooks/useAuditionPreview";
import { useEffectsRack } from "../features/sequencer/hooks/useEffectsRack";
import { useRecordedLanes } from "../hooks/useRecordedLanes";
import { sharedSamplerLoader } from "../audio/sharedSamplerLoader";
import { SamplerLaneStatus } from "../components/sequencer/SamplerLaneStatus";

/**
 * ⭐ **The session's shared loader, as `useRecordedLanes` wants it** — one factory at module scope rather than an inline
 * arrow, so the option's identity is stable and the scheduler it builds is the *same object* `prepareSamplerLanes` warmed
 * (`sharedSamplerLoader` is keyed by `AudioContext` **and** by the catalogue array, and both call sites pass
 * `appCatalogueRuntime`'s own array). Same shape as `GenreDetailView.tsx`'s, deliberately: one spelling of the sharing.
 */
const sharedLoaderFor = (catalogue: readonly SampleAsset[], context: BaseAudioContext) =>
  sharedSamplerLoader(context, catalogue);

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
  onOpenHelp?: (chapterId?: string) => void;
  /**
   * ⭐ **The studio's own "open an arrangement", for the Hub's arrangement rows.**
   *
   * The path the toolbar already uses (`handleOpenArrangement` below) opens the *studio's* song panel, which is a
   * different surface from a saved v2 arrangement project. A project picked out of the hub must reach the project's own
   * route, so it travels up to `App` — the only place that can route — instead of being answered with the wrong panel.
   */
  onOpenArrangementProject?: (id: string) => void;
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
  onAudioEngineReady,
  onOpenGenreMaker,
  onOpenSettings,
  onOpenHelp,
  onOpenArrangementProject,
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

  /**
   * Live performance state (keyboard mode, the FAB preference, drums-only, record-arm) and the
   * inspector cursor. All of it used to be `useState` in this file, which meant another surface
   * wanting a transport had to copy the behaviour rather than import it — see
   * `features/sequencer/hooks/useStudioSession.ts` for what each hook owns and why.
   */
  const { isKeyboardMode, setIsKeyboardMode, showKeyboardFab } = useKeyboardPerformance();
  const { drumKit, setDrumKit, isDrumsOnly, setIsDrumsOnly, isRecordArmed, setIsRecordArmed } =
    usePlaybackSettings({ genre: currentGenre });

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
   * B3: the arrangement view is open, and which of its regions is selected.
   *
   * Both live here rather than in the panel because the selection is what the *keyboard* addresses and the panel
   * remounts on every edit (its props are the song). The panel stays a pure function of (`song`, `selectedId`).
   */
  const [isArrangementOpen, setIsArrangementOpen] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  /**
   * The session as the arrangement view draws it.
   *
   * Built by `sessionSong`, the same function `patternForExport` flattens — so the timeline on screen and the file
   * an export writes are the same song by construction, not by two similar-looking literals that drift apart.
   */
  const arrangementSong = useMemo(
    () =>
      sessionSong({
        songMode: Boolean(seqState.songMode),
        activeSlot: seqState.activeSlot,
        patterns: seqState.patterns,
        current: pattern,
        sections: seqState.sections ?? [],
        genreId: currentGenre.id,
        bpm,
        swing,
        resolution,
        loopRange: seqState.loopRange,
      }),
    [
      seqState.songMode,
      seqState.activeSlot,
      seqState.patterns,
      seqState.sections,
      seqState.loopRange,
      pattern,
      currentGenre.id,
      bpm,
      swing,
      resolution,
    ]
  );

  /**
   * Apply one arrangement edit.
   *
   * A drag produces one edit per pointer move, so it is coalesced into a single undo entry; a key or a button is a
   * discrete edit and gets its own — otherwise two quick deletions would collapse and the first would be unreachable
   * from the undo stack.
   */
  const handleArrangementEdit = useCallback(
    (edit: ArrangementEdit) => {
      const action = { type: "SET_SECTIONS" as const, sections: edit.sections };
      if (edit.continuous) commitCoalesced(action, edit.gesture);
      else commit(action);
    },
    [commit, commitCoalesced]
  );

  /** Opening always starts with nothing selected: a stale selection from the last visit would be a surprise edit. */
  const handleOpenArrangement = useCallback(() => {
    setSelectedSectionId(null);
    setIsArrangementOpen(true);
  }, []);

  /**
   * B5 — replace the arrangement with a form.
   *
   * The generator is handed the pattern **being edited** (not the saved slot: the clip the sections point at is
   * whichever one the export will flatten), so "where does the fill land" and "how long is a pass" come from the
   * same object the user is looking at.
   *
   * Generating switches song mode on when it is off, deliberately: an arrangement you cannot hear is a puzzle, and
   * `songMode` is what makes the transport, the exports and the WAV bounce follow the timeline instead of one loop.
   */
  const handleGenerateArrangement = useCallback(
    (form: ArrangementFormId) => {
      const sections = arrangementSections({
        songId: "session",
        form,
        tracks: pattern.tracks ?? [],
        stepsPerPass: pattern.totalSteps || pattern.tracks?.[0]?.steps?.length || 0,
      });
      commit({ type: "SET_SECTIONS", sections });
      if (!seqState.songMode) commit({ type: "TOGGLE_SONG_MODE" });
      setSelectedSectionId(null);
    },
    [commit, pattern, seqState.songMode]
  );

  /**
   * E-10: which track's inspector is open, or null.
   *
   * The Logic-style affordance the user asked for: clicking a track header (or its sliders
   * button) opens that one track's full configuration — timbre, mix and insert chain —
   * instead of sending the user to a separate mixer view.
   */
  /**
   * Which track's inspector is open, and the remap that keeps it on the same track across row
   * reorders (the rule is `inspectorFollow.followReorderedRow`; the state lives in the hook so the
   * next surface does not have to copy either).
   */
  const { inspectorTrackIdx, setInspectorTrackIdx, moveInspectorWithRow } = useInspectorCursor();

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
    exportProgress,
    cancelExport,
    handleExportMidi,
    handleExportAls,
    handleExportGroove,
    handleExportWav,
    handleExportMp3,
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

  /**
   * ⭐ **The half `/studio` was missing: something that sounds a mapped lane from its own bytes.**
   *
   * `useTransportControls` hands the engine `prepareSampledLanes`, which stands a recorded lane's synthesiser **down** —
   * and plays nothing. Measured on this route with `delta-blues` loaded, before this: `order: ["engine.play"]`,
   * `loadNote` calls **0**, `scheduleSamplerSteps` calls **0**, so every mapped lane was stood down and silent and no
   * sample was ever requested. `useRecordedLanes` is the repository's one pairing of the two halves (stand down **and**
   * schedule), and it already serves the custom-genre preview, the ear-training arena and the A/B comparison; the studio
   * was simply never wired to it.
   *
   * The loader factory is the shared one, so the bytes `useTransportControls` warms before the press are the bytes this
   * sounds after it — `src/audio/sharedSamplerLoader.ts` carries the measurement (45 files, fetched once per play).
   */
  const { startRecordedLanes, stopRecordedLanes } = useRecordedLanes(() => engineRef.current, {
    loaderFor: sharedLoaderFor,
  });

  // Transport & playback modes: play, drums-only, undo/redo, tap, song, slots (A-02)
  const {
    handleTapTempo,
    handleToggleDrumsOnly,
    handleTogglePlay,
    handleStop,
    canStop,
    handleUndo,
    handleRedo,
    handleSwitchSlot,
    handleCopySlot,
    handleToggleSongMode,
    handleToggleBlindCompare,
    handleToggleMetronome,
    handleToggleCountIn,
    samplerPreparation,
    samplerProblems,
    transportPreparation,
  } = useTransportControls({
    engineRef,
    /**
     * The arrangement's song, handed to the audio lanes **as a getter** so a re-render cannot hand them a different object each time.
     *
     * This is the whole of the wiring: `arrangementSong` already existed here (it is what the arrangement view draws), and the transport already knows when playback starts. Nothing else
     * has to learn about samples, and the engine keeps knowing only patterns.
     */
    arrangementSong: () => arrangementSong,
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
    /**
     * ⭐ **Ready, then start** — the transport will not run until the recordings this pattern needs are in memory, and the
     * wait is drawn below. Both halves come from `useRecordedLanes`, so the studio sounds a recorded lane exactly the way
     * the four views that already do describe it.
     */
    recordedLanes: {
      start: (pattern) => void startRecordedLanes(pattern),
      stop: stopRecordedLanes,
    },
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

  /**
   * U1: one action on the first screen, retired for good once playback has happened once.
   *
   * Desktop and tablet only: the phone layout is being redesigned separately, and this strip is not
   * something to hand that work as a constraint.
   */
  const firstRunPrompt = useFirstRunPrompt({ isPlaying });

  /**
   * U8: the auto-save used to be invisible. This is the studio's answer to "is my work safe?" —
   * `saving` while a change waits on the debounce, `saved` once it has landed, `failed` if storage
   * refused it. Desktop and tablet only, like the first-run hint: the phone layout is being
   * redesigned and this component takes one line to mount wherever that layout wants it.
   */
  const autosave = useAutosaveStatus();

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

  /**
   * ⭐ **The catalogue recordings this session can offer a genre lane** — the list the studio never had.
   *
   * `/new` has loaded the runtime since its chooser existed; the genre route's timbre picker goes by instrument
   * *name*, so a lane could only reach a recording when `src/data/sampledInstruments.ts` happened to have a row for
   * its name. The runtime is the same one the transport already uses to stand recorded lanes down
   * (`useTransportControls`), so this adds one consumer to a fetch that is single-flight and per session — not a
   * second catalogue.
   *
   * The **status travels with the list** because an empty list has four different causes and only one of them is
   * "there is nothing to play" — `describeRuntimeStatus` is the module that tells them apart, and it was written for
   * a UI to import. Without it, this surface would have nothing to say when the mirror is not configured, which is
   * the shipped default.
   */
  const [catalogueInstruments, setCatalogueInstruments] = useState<InstrumentChoice[]>([]);
  /**
   * ⭐ **The catalogue's assets, kept beside the choices**, because a key-coverage reading needs an instrument's program
   * address and an `InstrumentChoice` is only a name and an id. The same `load()` that feeds the list feeds this, so
   * the address book and the list cannot describe two different catalogues.
   */
  const [catalogueAssets, setCatalogueAssets] = useState<readonly SampleAsset[]>([]);
  const [catalogueStatus, setCatalogueStatus] = useState<CatalogueStatus>(() =>
    // Before any load has been asked for: "loading" when there is a mirror to ask, and the runtime's own words when
    // there is not (calling it "loading" forever would be a promise nothing is working on).
    appCatalogueRuntime.configured
      ? describeCatalogueStatus({ configured: true, loading: true, ready: false, problems: [], assetCount: 0 })
      : describeRuntimeStatus(appCatalogueRuntime)
  );
  useEffect(() => {
    if (!appCatalogueRuntime.configured) return;
    let cancelled = false;
    void appCatalogueRuntime
      .load()
      .then(({ assets }) => {
        if (cancelled) return;
        setCatalogueInstruments(instrumentChoicesFromAssets(assets));
        setCatalogueAssets(assets);
        setCatalogueStatus(describeRuntimeStatus(appCatalogueRuntime));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const anySolo = useMemo(() => pattern.tracks.some((t) => t.solo), [pattern.tracks]);

  return (
    <div className="w-full text-text" /**
       * The genre accent, twice.
       *
       * `--g` is the *shape* colour (a bar, a chip's border, a waveform) and stays whatever the genre says.
       * `--g-ink` is the same hue mixed toward the surface ink so it can be *read*: a genre's accent is chosen
       * to glow on the studio's dark plate, and on a light skin the title, the era line and the progression
       * were mint-on-white at 1.6:1.
       */
      style={{
        ["--g" as any]: genreAccent,
        ["--g-ink" as any]: `color-mix(in srgb, ${genreAccent} 38%, var(--d-ink))`,
      }}>
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

        {/* Right Column: The Sequencer (.seq) — one grid item, so the first-run hint above the grid
            cannot displace it into a second row.

            The `order` classes belong *here*, on the grid item, not on the `section` inside it.
            `InfoDossier` is `order-2 lg:order-1` and this wrapper used to carry no order at all, so
            at `lg` the dossier sorted first and took the `352px` track while the editor — the thing
            the app is for — was squeezed into it (measured at 1440×900: sequencer 352 px, dossier
            1012 px, three step cells per track). `SequencerPanel`'s own `order-1 lg:order-2` did not
            help: it is a child of *this* wrapper, which is the grid item. */}
        <div className="min-w-0 flex flex-col order-1 lg:order-2">
          {/* Unconditional on purpose: a conditional sibling here would change the panel's position
              when the hint hides, which remounts the whole sequencer (see `FirstRunPrompt`). */}
          <FirstRunPrompt
            visible={firstRunPrompt.visible}
            onPlay={() => {
              firstRunPrompt.started();
              void handleTogglePlay();
            }}
            onDismiss={firstRunPrompt.dismiss}
          />
          {/* Unconditional, like the hint above it: a conditional sibling here would remount the
              sequencer panel. The indicator takes a `visible` prop for its own visibility. */}
          <SaveIndicator visible status={autosave} />
          {/* ⭐ "正在获取音源" — the wait between the press and the transport, and the reasons a lane will not sound.
              Unconditional for the same reason as the two elements above it: `SamplerLaneStatus` decides its own
              visibility from the state it is handed, so the sequencer below is never remounted by a download starting
              or finishing. */}
          <SamplerLaneStatus progress={samplerPreparation} problems={samplerProblems} />
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
          exportProgress={exportProgress}
          cancelExport={cancelExport}
          transportPreparation={transportPreparation}
          samplerPreparation={samplerPreparation}
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
          onStop={handleStop}
          canStop={canStop}
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
          onExportMp3={handleExportMp3}
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
          onOpenArrangement={handleOpenArrangement}
          isArrangementOpen={isArrangementOpen}
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
        </div>
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
        {...(onOpenArrangementProject === undefined ? {} : { onOpenArrangementProject })}
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
        <>
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
        {/**
          ⭐ **The catalogue recordings, for the lane the inspector is open on.**
          *
          * The inspector's own timbre picker chooses an instrument **name**, and a name reaches a recording only
          * through a hand-written row in `src/data/sampledInstruments.ts` — 22 of the 61 names the genre data writes.
          * This is the other half, and it is deliberately a separate surface rather than a second list inside that
          * picker: a name decides which *family* of sound a lane is (and is what the written table, `resolveGs1Patch`
          * and every genre's own timbre resolve), while this decides **which recording** that sound is played from.
          * Folding the two into one list would make "saw_lead" and "Steel drum, no crossfades" look like alternatives
          * of the same kind, and the first is a synthesised voice by definition.
          *
          * It renders nothing at all for a lane whose role the engine would not honour a recording on (a drum role,
          * `fx`), and it states the reason rather than drawing an empty browser when the mirror is not configured —
          * both rules live in the component, where they can be judged without the studio.
          */}
        <CatalogueRecordingPicker
          trackName={pattern.tracks[inspectorTrackIdx].name}
          role={pattern.tracks[inspectorTrackIdx].track_id}
          {...(pattern.tracks[inspectorTrackIdx].sample?.assetId
            ? { assetId: pattern.tracks[inspectorTrackIdx].sample.assetId }
            : {})}
          instruments={catalogueInstruments}
          status={catalogueStatus}
          // The address book a coverage reading needs, and the lane whose written notes are measured against it. Both
          // come from the same inspector track this panel already names, so the report cannot describe another lane.
          assets={catalogueAssets}
          lane={pattern.tracks[inspectorTrackIdx]}
          // One command, one undo entry: the lane's own recording, which `sampledAssetForLane` reads first.
          onChoose={(assetId) => commit({ type: "SET_TRACK_SAMPLE", trackIdx: inspectorTrackIdx, assetId })}
        />
        </>
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

      {/* B3: the arrangement view. The panel reads the same `sections` the renderer and the exporters use. */}
      {isArrangementOpen && (
        <ArrangementPanel
          song={arrangementSong}
          selectedId={selectedSectionId}
          onSelect={setSelectedSectionId}
          onChange={handleArrangementEdit}
          onGenerate={handleGenerateArrangement}
          onClose={() => setIsArrangementOpen(false)}
        />
      )}

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
