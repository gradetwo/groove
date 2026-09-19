import { useCallback } from "react";
import type { QuantizedStepResult } from "../../../audio/AudioEngine";
import { triggerHaptic, HapticPatterns } from "../../../utils/haptics";
import type { SequencerAction } from "../useSequencerStore";

export interface UseLiveRecordingBridgeOptions {
  /** F-04: any write that bypasses `commit` must drop the pending redo snapshot. */
  invalidateRedo: () => void;
  dispatch: (action: SequencerAction) => void;
}

export interface UseLiveRecordingBridgeResult {
  /** Callback handed to `engine.getLiveRecorder().setOnQuantizedStep(...)`. */
  handleQuantizedStep: (rec: QuantizedStepResult) => void;
}

/**
 * A-02: P5-05 real-time live recording callback, extracted verbatim from the
 * AudioEngine init effect in `StudioView`. The engine only registers this once at
 * construction, so the callback is stable for the lifetime of the engine.
 */
export function useLiveRecordingBridge({
  invalidateRedo,
  dispatch,
}: UseLiveRecordingBridgeOptions): UseLiveRecordingBridgeResult {
  const handleQuantizedStep = useCallback(
    (rec: QuantizedStepResult) => {
      // F-04: recording writes straight through `dispatch`, so any pending redo
      // snapshot now describes a pattern the user can no longer get back to.
      invalidateRedo();
      dispatch({
        type: "SET_STEP",
        trackIdx: rec.trackIdx,
        stepIdx: rec.stepIdx,
        value: rec.stepVal,
      });
      if (rec.velocity !== undefined) {
        dispatch({
          type: "SET_VELOCITY",
          trackIdx: rec.trackIdx,
          stepIdx: rec.stepIdx,
          velocity: Math.round(rec.velocity * 127),
        });
      }
      if (rec.pitch > 0) {
        dispatch({
          type: "SET_PITCH",
          trackIdx: rec.trackIdx,
          stepIdx: rec.stepIdx,
          pitch: rec.pitch,
        });
      }
      triggerHaptic(HapticPatterns.accent);
    },
    [invalidateRedo, dispatch]
  );

  return { handleQuantizedStep };
}
