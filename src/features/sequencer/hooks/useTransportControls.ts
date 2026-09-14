import { useCallback, useRef } from "react";
import { AudioEngine } from "../../../audio/AudioEngine";
import type { SequencerAction, SequencerState, StudioHistorySnapshot } from "../useSequencerStore";
import { triggerHaptic, HapticPatterns } from "../../../utils/haptics";
import { announcer } from "../../../ui";
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

  // Transport toggle play
  const handleTogglePlay = useCallback(() => {
    if (!engineRef.current) return;
    triggerHaptic(HapticPatterns.playPause);
    if (isPlaying) {
      engineRef.current.stop();
      setIsPlaying(false);
      clearPlayhead();
      announcer.announce(t("transport_playback_stopped"));
    } else {
      engineRef.current.play();
      setIsPlaying(true);
      announcer.announce(t("transport_playback_started"));
    }
  }, [isPlaying, clearPlayhead, t]);

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
