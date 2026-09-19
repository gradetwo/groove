import { useCallback } from "react";
import type { SequencerAction } from "../useSequencerStore";
import type { ParameterDimension } from "../stepParameters";

export interface UseVelocityLaneEditingOptions {
  commit: (action: SequencerAction, recordHistory?: boolean) => void;
  commitCoalesced: (action: SequencerAction, key: string) => void;
  setVelocityActiveTrackIdx: React.Dispatch<React.SetStateAction<number>>;
  setIsVelocityLaneOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface UseVelocityLaneEditingResult {
  handleSelectParameterDimension: (dim: ParameterDimension) => void;
  handleSelectVelocityTrack: (idx: number) => void;
  handleUpdateVelocity: (trackIdx: number, stepIdx: number, newVel: number) => void;
  handleBatchUpdateVelocity: (trackIdx: number, newVelocities: number[]) => void;
  handleUpdateProbability: (trackIdx: number, stepIdx: number, p: number) => void;
  handleBatchUpdateProbability: (trackIdx: number, probs: number[]) => void;
  handleUpdateRatchet: (trackIdx: number, stepIdx: number, r: number) => void;
  handleBatchUpdateRatchet: (trackIdx: number, ratchets: number[]) => void;
  handleUpdateGate: (trackIdx: number, stepIdx: number, g: number) => void;
  handleBatchUpdateGate: (trackIdx: number, gates: number[]) => void;
  handleCloseVelocityLane: () => void;
}

/**
 * A-02: the velocity/automation drawer (P3-xx) edit handlers. Every callback is
 * a thin, stable store dispatch, moved verbatim from `StudioView` so the
 * memoized `VelocityLane` keeps receiving the same prop identities.
 */
export function useVelocityLaneEditing({
  commit,
  commitCoalesced,
  setVelocityActiveTrackIdx,
  setIsVelocityLaneOpen,
}: UseVelocityLaneEditingOptions): UseVelocityLaneEditingResult {
  const handleSelectParameterDimension = useCallback(
    (dim: ParameterDimension) => commit({ type: "SET_PARAMETER_DIMENSION", dimension: dim }),
    [commit]
  );

  const handleSelectVelocityTrack = useCallback(
    (idx: number) => setVelocityActiveTrackIdx(idx),
    []
  );

  const handleUpdateVelocity = useCallback(
    (trackIdx: number, stepIdx: number, newVel: number) =>
      commitCoalesced(
        { type: "SET_VELOCITY", trackIdx, stepIdx, velocity: newVel },
        `velocity:${trackIdx}`
      ),
    [commitCoalesced]
  );

  const handleBatchUpdateVelocity = useCallback(
    (trackIdx: number, newVelocities: number[]) =>
      commit({ type: "BATCH_SET_VELOCITY", trackIdx, velocities: newVelocities }),
    [commit]
  );

  const handleUpdateProbability = useCallback(
    (trackIdx: number, stepIdx: number, p: number) =>
      commit({ type: "SET_PROBABILITY", trackIdx, stepIdx, probability: p }),
    [commit]
  );

  const handleBatchUpdateProbability = useCallback(
    (trackIdx: number, probs: number[]) =>
      commit({ type: "BATCH_SET_PROBABILITY", trackIdx, probabilities: probs }),
    [commit]
  );

  const handleUpdateRatchet = useCallback(
    (trackIdx: number, stepIdx: number, r: number) =>
      commit({ type: "SET_RATCHET", trackIdx, stepIdx, ratchet: r }),
    [commit]
  );

  const handleBatchUpdateRatchet = useCallback(
    (trackIdx: number, ratchets: number[]) =>
      commit({ type: "BATCH_SET_RATCHET", trackIdx, ratchets }),
    [commit]
  );

  const handleUpdateGate = useCallback(
    (trackIdx: number, stepIdx: number, g: number) =>
      commit({ type: "SET_GATE", trackIdx, stepIdx, gate: g }),
    [commit]
  );

  const handleBatchUpdateGate = useCallback(
    (trackIdx: number, gates: number[]) => commit({ type: "BATCH_SET_GATE", trackIdx, gates }),
    [commit]
  );

  const handleCloseVelocityLane = useCallback(() => setIsVelocityLaneOpen(false), []);

  return {
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
  };
}
