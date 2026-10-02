import { useCallback, useRef } from "react";
import { AudioEngine } from "../../../audio/AudioEngine";
import type { SequencerAction, SequencerState, StudioHistorySnapshot } from "../useSequencerStore";
import { triggerHaptic, HapticPatterns } from "../../../utils/haptics";
import { announcer } from "../../../platform/announcer";
import { useLanguage } from "../../../i18n/LanguageContext";
import { patternForSlot } from "../../../types/project";
import type { ClipSlot } from "../../../types/song";
import { playAudioLanes } from "../../../audio/audioLanePlayback";
import { appCatalogueRuntime } from "../../../data/sampleCatalogueRuntime";

export interface UseTransportControlsOptions {
  /**
   * The arrangement's song, as a **getter** so a re-render cannot hand the lanes a different object each time. Absent means the audio-lane path does nothing at all.
   */
  arrangementSong?: () => { clips: Record<string, { tracks?: unknown[] } | undefined>; sections: Array<{ id?: string; slot?: string; bars?: number }>; boundaries?: number[]; bpm: number } | null;
  engineRef: React.MutableRefObject<AudioEngine | null>;
  seqStateRef: React.MutableRefObject<SequencerState>;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDrumsOnly: React.Dispatch<React.SetStateAction<boolean>>;
  clearPlayhead: () => void;
  commit: (action: SequencerAction, recordHistory?: boolean) => void;
  undo: () => StudioHistorySnapshot | null;
  redo: () => StudioHistorySnapshot | null;
  isZh: boolean;
  showToast: (msg: string) => void;
  /**
   * Drop any piano-roll lane scope before the full arrangement starts.
   *
   * While a scope is set the scheduler skips every other track, so pressing Play with one left over
   * played only that lane — reported as "after writing a chord progression, playback in the
   * workspace only plays the chords". `AudioEngine.play()` clears the scope as well; this exists so
   * the roll's own preview state is released in the same breath, instead of its toggle staying lit
   * over a scope that no longer exists.
   */
  releasePreviewScope?: () => void;
}

export interface UseTransportControlsResult {
  handleTapTempo: () => void;
  handleToggleDrumsOnly: () => void;
  handleTogglePlay: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleSwitchSlot: (slot: ClipSlot) => void;
  handleCopySlot: (from: ClipSlot, to: ClipSlot) => void;
  handleToggleSongMode: () => void;
  handleToggleBlindCompare: () => void;
  handleToggleMetronome: () => void;
  handleToggleCountIn: () => void;
}

/**
 * A-02: transport & playback-mode controls — play/stop, drums-only, undo/redo,
 * tap tempo, pattern-slot switching/copying, song mode, blind compare, metronome
 * and count-in. Moved verbatim from `StudioView` (including the tap-tempo ref).
 *
 * U7: **a control that does nothing must say so.** Every handler here reports what it did (toast
 * plus an `announcer` event for screen readers), including the cases where the honest answer is
 * "nothing happened": an empty undo history, the first tap of a two-tap tempo reading, and a Play
 * press before the engine instance exists. "点了没反应" is indistinguishable from a broken button,
 * and that is the impression this file exists to prevent.
 */
export function useTransportControls({
  engineRef,
  arrangementSong,
  seqStateRef,
  isPlaying,
  setIsPlaying,
  setIsDrumsOnly,
  clearPlayhead,
  commit,
  undo,
  redo,
  showToast,
  releasePreviewScope,
}: UseTransportControlsOptions): UseTransportControlsResult {
  const { t } = useLanguage();
  // Tap tempo calculator (P3-07)
  const tapTimestampsRef = useRef<number[]>([]);
  const handleTapTempo = useCallback(() => {
    const now = performance.now();
    tapTimestampsRef.current = tapTimestampsRef.current.filter((t) => now - t < 2500);
    tapTimestampsRef.current.push(now);

    /**
     * U7: the first tap used to say nothing at all. Tap tempo needs two taps, so a user who tapped
     * once could not tell "waiting for a second tap" from "this button is broken" — and the second
     * reading is the one people act on.
     */
    if (tapTimestampsRef.current.length < 2) {
      const first = t("transport_tap_first");
      showToast(first);
      announcer.announce(first);
      return;
    }

    // `calculateTapTempo` clamps into 40-240 and returns 120 for a degenerate interval, so there is
    // no out-of-range case left to report here (the old check could never be false).
    const calculatedBpm = AudioEngine.calculateTapTempo(tapTimestampsRef.current);
    commit({ type: "SET_BPM", bpm: calculatedBpm });
    if (engineRef.current) {
      engineRef.current.setBpm(calculatedBpm);
    }
    const message = `${t("transport_tap_bpm")}: ${calculatedBpm}`;
    showToast(message);
    announcer.announce(message);
  }, [commit, t, showToast]);

  // Toggle Drums-Only mode
  const handleToggleDrumsOnly = useCallback(() => {
    setIsDrumsOnly((prev) => {
      const next = !prev;
      if (engineRef.current) {
        engineRef.current.setDrumsOnly(next);
      }
      showToast(
        next
          ? t("transport_drums_only_on")
          : t("transport_full_band_on")
      );
      announcer.announce(
        next
          ? t("transport_announce_drums_only_on")
          : t("transport_announce_drums_only_off")
      );
      return next;
    });
  }, [t, showToast]);

  /**
   * Transport toggle play.
   *
   * `play()` is async and its `ctx.resume()` can reject or simply leave the context suspended
   * (the iOS silent switch, a browser that wants a fresh gesture). The old code called it without
   * awaiting and then set `isPlaying` unconditionally, so on those devices the transport lit up,
   * the playhead ran and no sound came out — and the rejection was unhandled, so nothing reported
   * it either. The UI was asserting success it could not observe.
   *
   * Now playback is only reported as started when it actually is, and a blocked context says so.
   */
  const handleTogglePlay = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) {
      /**
       * U7: this used to return in silence, so the first Play press — before the engine instance
       * exists — looked like a dead button. Say what is actually happening.
       */
      showToast(t("transport_engine_not_ready"));
      announcer.announce(t("transport_announce_engine_not_ready"));
      return;
    }
    triggerHaptic(HapticPatterns.playPause);
    if (isPlaying) {
      /**
       * ⭐ **This is a pause, and it has to behave like one.**
       *
       * The button is painted with the word Pause (`Toolbar.tsx` swaps `toolbar_play`/`toolbar_pause` on the same
       * `isPlaying` flag) and this branch used to call `engine.stop()` and `clearPlayhead()` — so the label promised
       * a pause and the transport returned to bar one. The owner reported exactly that: "it becomes Pause while
       * playing, but pressing Pause is a stop and the playhead goes back to the top."
       *
       * `pause()` keeps the step, so the next Play continues from here (`AudioEngine.play` consumes the position
       * `pause` preserved). The playhead is deliberately **not** cleared: it is the picture of the position that was
       * just kept, and clearing it would be the same rewind drawn somewhere else.
       */
      engine.pause();
      setIsPlaying(false);
      announcer.announce(t("transport_playback_paused"));
      return;
    }

    // Asking for the arrangement releases any leftover lane scope before the transport starts.
    releasePreviewScope?.();
    try {
      /**
       * ⭐ **The engine is told which lanes it must not voice, before it is asked to play.**
       *
       * A genre lane whose `instrument` the written table maps (`piano_lead`, `walking_upright`, `strings_lead`, …) is a
       * **recording**, and the engine's own sequencer would otherwise play the built-in preset underneath it — the piano
       * doubled by a pad. `prepareSampledLanes` is the one call that decides it, and the decision needs the catalogue:
       * a lane whose recording this session cannot serve keeps the synthesiser (the owner's stated fallback) and is
       * named in the returned problems.
       *
       * Called with **whatever the runtime already holds** and again when the load resolves below, so a session that has
       * played once — or that loaded the catalogue for any other reason — stands every recorded lane down *before* the
       * first step. On a cold first play the stand-down lands one catalogue fetch late, which is stated rather than
       * hidden: the alternative is making the play button wait on a network round trip before it starts.
       */
      const alreadyLoaded = appCatalogueRuntime.assets;
      if (alreadyLoaded.length > 0) engine.prepareSampledLanes(alreadyLoaded);
      await engine.play();

      /**
       * Audio lanes, started **beside** the transport rather than inside the engine.
       *
       * The engine knows only patterns — a song is an app-layer object — so the caller that owns the arrangement is the one that can hand the lanes their song, their context and the same
       * mixing destination the engine uses for everything else. Guarded three ways so this cannot alter existing behaviour: no `arrangementSong` (the default), no resolved song, or no live
       * context all mean nothing happens.
       *
       * **And it never blocks playback**: the promise is swallowed, exactly as the engine swallows its own GS1 probe, because a lane that cannot load must not stop the rest of the song from
       * playing. Problems are reported on the console rather than as a toast, since this path runs at transport start where a modal interruption would be worse than a log line.
       */
      const song = arrangementSong?.();
      const context = engine.audioContext;
      const destination = engine.musicDestination;
      if (song && context && destination) {
        /**
         * **The catalogue has to be fetched before the lanes can resolve anything.**
         *
         * The previous commit passed no catalogue, so the path fell back to the shipped empty one and would have stayed silent **even with a mirror configured** — the wiring was inert for a
         * reason that had nothing to do with the missing credentials. Loaded here, at playback start, rather than at app start: it is one fetch per session thanks to the runtime's own
         * single-flight, and a session that never plays an audio lane never pays for it.
         */
        void appCatalogueRuntime
          .load()
          .then(({ assets }) => {
            /**
             * ⭐ **The stand-down lands here on a cold first play**, once the catalogue has actually answered — and this is
             * also where a lane whose recording this mirror does not serve is named, so "a synthesiser, and here is what to
             * do about it" reaches the console instead of being silent.
             */
            const prepared = engine.prepareSampledLanes(assets);
            for (const problem of prepared.problems) console.warn(`[sampled-instrument] ${problem}`);
            return playAudioLanes({ song: song as never, context, destination, catalogue: assets });
          })
          .then((result) => {
            for (const problem of result.problems) console.warn(`[audio-lane] ${problem}`);
          })
          .catch((error: unknown) => console.warn(`[audio-lane] ${error instanceof Error ? error.message : String(error)}`));
      }
    } catch (error) {
      // A rejected resume is a real failure worth reporting, not a reason to claim playback.
      console.warn("[transport] playback could not start", error);
    }

    if (engine.isAudioBlocked()) {
      /**
       * Schedulers are running but the output is silent. Stopping is the honest state: leaving it
       * "playing" would advance the playhead over a track nobody can hear, and the user would
       * judge the app by the silence.
       */
      engine.stop();
      setIsPlaying(false);
      clearPlayhead();
      showToast(t("transport_audio_blocked"));
      announcer.announce(t("transport_audio_blocked_announce"));
      return;
    }

    setIsPlaying(true);
    announcer.announce(t("transport_playback_started"));
  }, [isPlaying, clearPlayhead, engineRef, showToast, t, releasePreviewScope]);

  const handleUndo = useCallback(() => {
    const prev = undo();
    // U7: an empty history and a broken button looked identical from the outside.
    if (!prev) {
      const empty = t("transport_nothing_to_undo");
      showToast(empty);
      announcer.announce(empty);
      return;
    }
    // The store is already rolled back; syncing the engine is best-effort and must not silence the
    // confirmation when the engine happens not to be ready yet.
    const engine = engineRef.current;
    if (engine) {
      engine.setPattern(prev.pattern);
      engine.setBpm(prev.bpm);
      engine.setSwing(prev.swing / 100);
      engine.setTimeSignature(prev.timeSignature);
      engine.setResolution(prev.resolution);
    }
    triggerHaptic(HapticPatterns.undoRedo);
    const done = t("transport_undo_done");
    showToast(done);
    announcer.announce(done);
  }, [undo, t, showToast]);

  const handleRedo = useCallback(() => {
    const next = redo();
    if (!next) {
      const empty = t("transport_nothing_to_redo");
      showToast(empty);
      announcer.announce(empty);
      return;
    }
    const engine = engineRef.current;
    if (engine) {
      engine.setPattern(next.pattern);
      engine.setBpm(next.bpm);
      engine.setSwing(next.swing / 100);
      engine.setTimeSignature(next.timeSignature);
      engine.setResolution(next.resolution);
    }
    triggerHaptic(HapticPatterns.undoRedo);
    const done = t("transport_redo_done");
    showToast(done);
    announcer.announce(done);
  }, [redo, t, showToast]);

  const handleSwitchSlot = useCallback(
    (slot: ClipSlot) => {
      commit({ type: "SWITCH_PATTERN_SLOT", slot });
      // A slot the project does not hold is not a pattern to hand the engine; the transport keeps what it has.
      const slotPattern = patternForSlot(seqStateRef.current, slot);
      if (slotPattern && engineRef.current) engineRef.current.setPattern(slotPattern);
    },
    [commit]
  );

  const handleCopySlot = useCallback(
    (from: ClipSlot, to: ClipSlot) => {
      commit({ type: "COPY_PATTERN_SLOT", from, to });
      showToast(t("transport_slot_copied", { from, to }));
    },
    [commit, t, showToast]
  );

  /**
   * U7: a mode toggle that changes state without a word is the "I clicked and nothing happened"
   * case — four of them used to be exactly that. Every toggle now says (and announces) the state it
   * just moved to, which is also what a screen reader needs to hear.
   */
  const reportMode = useCallback(
    (enabled: boolean, onKey: string, offKey: string) => {
      const message = t(enabled ? onKey : offKey);
      showToast(message);
      announcer.announce(message);
    },
    [showToast, t]
  );

  const handleToggleSongMode = useCallback(() => {
    const enabled = !seqStateRef.current.songMode;
    commit({ type: "TOGGLE_SONG_MODE" });
    reportMode(enabled, "transport_mode_song_on", "transport_mode_song_off");
  }, [commit, reportMode]);

  const handleToggleBlindCompare = useCallback(() => {
    const enabled = !seqStateRef.current.blindTestMode;
    commit({ type: "TOGGLE_BLIND_TEST" });
    reportMode(enabled, "transport_mode_blind_on", "transport_mode_blind_off");
  }, [commit, reportMode]);

  const handleToggleMetronome = useCallback(() => {
    const enabled = !seqStateRef.current.isMetronome;
    commit({ type: "SET_METRONOME", enabled });
    reportMode(enabled, "transport_mode_metronome_on", "transport_mode_metronome_off");
  }, [commit, reportMode]);

  const handleToggleCountIn = useCallback(() => {
    const enabled = !seqStateRef.current.isCountIn;
    commit({ type: "SET_COUNT_IN", enabled });
    reportMode(enabled, "transport_mode_count_in_on", "transport_mode_count_in_off");
  }, [commit, reportMode]);

  return {
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
  };
}
