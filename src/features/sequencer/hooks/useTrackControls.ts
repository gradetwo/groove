import { useCallback } from "react";
import { SequencerPattern } from "../../../types/genre";
import { AudioEngine } from "../../../audio/AudioEngine";
import type { SequencerAction } from "../useSequencerStore";

export interface UseTrackControlsOptions {
  patternRef: React.MutableRefObject<SequencerPattern>;
  engineRef: React.MutableRefObject<AudioEngine | null>;
  commit: (action: SequencerAction, recordHistory?: boolean) => void;
  setVelocityActiveTrackIdx: React.Dispatch<React.SetStateAction<number>>;
  setIsVelocityLaneOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface UseTrackControlsResult {
  handleToggleTrackMute: (idx: number) => void;
  handleToggleTrackSolo: (idx: number) => void;
  handleChangeTrackVolume: (idx: number, vol: number) => void;
  handleChangeTrackPan: (idx: number, pan: number) => void;
  handleChangeTrackSwing: (idx: number, trackSwing: number) => void;
  handleOpenVelocityLane: (idx: number) => void;
  handleShiftTrack: (idx: number, dir: -1 | 1) => void;
  handleSmartFillTrack: (idx: number) => void;
  handleClearTrack: (idx: number) => void;
  handleMoveTrackUp: (idx: number) => void;
  handleMoveTrackDown: (idx: number) => void;
}

/**
 * A-02: the per-track mixer/编辑 handlers handed to the memoized `TrackRow`.
 *
 * A-03: `TrackRow` is memoized, so every handler it receives must keep a stable
 * identity across unrelated StudioView re-renders. Each handler takes the track
 * index from its caller (instead of being an inline arrow in the JSX) and reads
 * live pattern data through `patternRef`, so toggling one step no longer changes
 * the callback identity of every other row. Moved verbatim from `StudioView`.
 */
export function useTrackControls({
  patternRef,
  engineRef,
  commit,
  setVelocityActiveTrackIdx,
  setIsVelocityLaneOpen,
}: UseTrackControlsOptions): UseTrackControlsResult {
  const handleToggleTrackMute = useCallback(
    (idx: number) => {
      const nextMute = !patternRef.current.tracks[idx]?.mute;
      commit({ type: "TOGGLE_MUTE", trackIdx: idx });
      if (engineRef.current) {
        engineRef.current.setTrackState(idx, { mute: nextMute });
      }
    },
    [commit]
  );

  const handleToggleTrackSolo = useCallback(
    (idx: number) => {
      const nextSolo = !patternRef.current.tracks[idx]?.solo;
      commit({ type: "TOGGLE_SOLO", trackIdx: idx });
      if (engineRef.current) {
        engineRef.current.setTrackState(idx, { solo: nextSolo });
      }
    },
    [commit]
  );

  const handleChangeTrackVolume = useCallback(
    (idx: number, vol: number) => {
      commit({ type: "SET_VOLUME", trackIdx: idx, volume: vol });
      if (engineRef.current) {
        engineRef.current.setTrackState(idx, { volume: vol });
      }
    },
    [commit]
  );

  const handleChangeTrackPan = useCallback(
    (idx: number, pan: number) => {
      commit({ type: "SET_TRACK_PAN", trackIdx: idx, pan });
      if (engineRef.current) engineRef.current.setTrackState(idx, { pan });
    },
    [commit]
  );

  const handleChangeTrackSwing = useCallback(
    (idx: number, trackSwing: number) => {
      commit({ type: "SET_TRACK_SWING", trackIdx: idx, swing: trackSwing });
    },
    [commit]
  );

  const handleOpenVelocityLane = useCallback((idx: number) => {
    setVelocityActiveTrackIdx(idx);
    setIsVelocityLaneOpen(true);
  }, []);

  const handleShiftTrack = useCallback(
    (idx: number, dir: -1 | 1) => commit({ type: "SHIFT_TRACK", trackIdx: idx, direction: dir }),
    [commit]
  );

  const handleSmartFillTrack = useCallback(
    (idx: number) => commit({ type: "SMART_FILL_TRACK", trackIdx: idx }),
    [commit]
  );

  const handleClearTrack = useCallback(
    (idx: number) => commit({ type: "CLEAR_TRACK", trackIdx: idx }),
    [commit]
  );

  const handleMoveTrackUp = useCallback(
    (idx: number) =>
      commit({ type: "REORDER_TRACKS", fromIndex: idx, toIndex: Math.max(0, idx - 1) }),
    [commit]
  );

  const handleMoveTrackDown = useCallback(
    (idx: number) =>
      commit({
        type: "REORDER_TRACKS",
        fromIndex: idx,
        toIndex: Math.min(patternRef.current.tracks.length - 1, idx + 1),
      }),
    [commit]
  );

  return {
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
  };
}
