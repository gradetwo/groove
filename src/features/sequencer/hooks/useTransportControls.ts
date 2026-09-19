import { useCallback, useRef } from "react";
import { AudioEngine } from "../../../audio/AudioEngine";
import type { SequencerAction, SequencerState, StudioHistorySnapshot } from "../useSequencerStore";
import { triggerHaptic, HapticPatterns } from "../../../utils/haptics";
import { announcer } from "../../../platform/announcer";
import { useLanguage } from "../../../i18n/LanguageContext";

export interface UseTransportControlsOptions {
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
  handleSwitchSlot: (slot: "A" | "B") => void;
  handleCopySlot: (from: "A" | "B", to: "A" | "B") => void;
  handleToggleSongMode: () => void;
  handleToggleBlindCompare: () => void;
  handleToggleMetronome: () => void;
  handleToggleCountIn: () => void;
}

/**
 * A-02: transport & playback-mode controls — play/stop, drums-only, undo/redo,
 * tap tempo, pattern-slot switching/copying, song mode, blind compare, metronome
 * and count-in. Moved verbatim from `StudioView` (including the tap-tempo ref).
 */
export function useTransportControls({
  engineRef,
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
    if (tapTimestampsRef.current.length >= 2) {
      const calculatedBpm = AudioEngine.calculateTapTempo(tapTimestampsRef.current);
      if (calculatedBpm >= 40 && calculatedBpm <= 240) {
        commit({ type: "SET_BPM", bpm: calculatedBpm });
        if (engineRef.current) {
          engineRef.current.setBpm(calculatedBpm);
        }
        showToast(`${t("transport_tap_bpm")}: ${calculatedBpm}`);
      }
    }
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
    if (!engine) return;
    triggerHaptic(HapticPatterns.playPause);
    if (isPlaying) {
      engine.stop();
      setIsPlaying(false);
      clearPlayhead();
      announcer.announce(t("transport_playback_stopped"));
      return;
    }

    // Asking for the arrangement releases any leftover lane scope before the transport starts.
    releasePreviewScope?.();
    try {
      await engine.play();
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
    if (prev && engineRef.current) {
      engineRef.current.setPattern(prev.pattern);
      engineRef.current.setBpm(prev.bpm);
      engineRef.current.setSwing(prev.swing / 100);
      engineRef.current.setTimeSignature(prev.timeSignature);
      engineRef.current.setResolution(prev.resolution);
      triggerHaptic(HapticPatterns.undoRedo);
      showToast(t("transport_undo_done"));
    }
  }, [undo, t, showToast]);

  const handleRedo = useCallback(() => {
    const next = redo();
    if (next && engineRef.current) {
      engineRef.current.setPattern(next.pattern);
      engineRef.current.setBpm(next.bpm);
      engineRef.current.setSwing(next.swing / 100);
      engineRef.current.setTimeSignature(next.timeSignature);
      engineRef.current.setResolution(next.resolution);
      triggerHaptic(HapticPatterns.undoRedo);
      showToast(t("transport_redo_done"));
    }
  }, [redo, t, showToast]);

  const handleSwitchSlot = useCallback(
    (slot: "A" | "B") => {
      commit({ type: "SWITCH_PATTERN_SLOT", slot });
      if (engineRef.current) engineRef.current.setPattern(seqStateRef.current.patterns[slot]);
    },
    [commit]
  );

  const handleCopySlot = useCallback(
    (from: "A" | "B", to: "A" | "B") => {
      commit({ type: "COPY_PATTERN_SLOT", from, to });
      showToast(t("transport_slot_copied", { from, to }));
    },
    [commit, t, showToast]
  );

  const handleToggleSongMode = useCallback(() => commit({ type: "TOGGLE_SONG_MODE" }), [commit]);

  const handleToggleBlindCompare = useCallback(
    () => commit({ type: "TOGGLE_BLIND_TEST" }),
    [commit]
  );

  const handleToggleMetronome = useCallback(() => {
    commit({ type: "SET_METRONOME", enabled: !seqStateRef.current.isMetronome });
  }, [commit]);

  const handleToggleCountIn = useCallback(() => {
    commit({ type: "SET_COUNT_IN", enabled: !seqStateRef.current.isCountIn });
  }, [commit]);

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
