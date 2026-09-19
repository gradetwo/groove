/**
 * The master effects rack: local UI state that is also part of the undo history.
 *
 * This is not a plain `useState`, and the reason is a class of bug worth stating once:
 *
 *  - **Every consumer takes a React setter**, so the rack has to keep its value in React state to keep
 *    those call sites unchanged and to re-render the controls.
 *  - **The rack must also be in the undo store**, because it lives inside the pattern. Before this
 *    existed, Ctrl+Z restored the notes while leaving an FX change in place — a half-undo, which is
 *    worse than no undo at all because it looks like it worked.
 *
 * Two hazards are handled here rather than at the call site:
 *
 *  1. **Committing from inside a state updater is a side effect React may run twice** (StrictMode
 *     double-invokes updaters), which would push two history entries for one change. The next value is
 *     therefore computed from a ref, not inside the updater.
 *  2. **History can move underneath the UI.** When a restore (unmistakably) puts a different rack in the
 *     store, the local state has to follow it — otherwise the panel shows the old rack and the next
 *     edit commits from the wrong base.
 *
 * Coalesced on one key per change, so dragging a slider is one history entry rather than one per frame.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { EffectsRackState } from "../../../audio/AudioEngine";
import { DEFAULT_FX_STATE } from "../../../audio/EffectsRack";
import type { SequencerAction } from "../useSequencerStore";

export interface UseEffectsRackOptions {
  /** The rack as the store currently holds it, which is what a history restore changes. */
  storedRack: EffectsRackState | undefined;
  /** Coalescing commit, so a drag is one undo step. */
  commitCoalesced: (action: SequencerAction, key: string) => void;
}

export interface UseEffectsRackResult {
  effectsRackState: EffectsRackState;
  setEffectsRackState: React.Dispatch<React.SetStateAction<EffectsRackState>>;
  /** The current rack, for callers that must read it without re-rendering. */
  effectsRackRef: React.MutableRefObject<EffectsRackState>;
}

export function useEffectsRack({
  storedRack,
  commitCoalesced,
}: UseEffectsRackOptions): UseEffectsRackResult {
  const [effectsRackState, setEffectsRackStateLocal] =
    useState<EffectsRackState>(DEFAULT_FX_STATE);

  const effectsRackRef = useRef(effectsRackState);
  effectsRackRef.current = effectsRackState;

  const setEffectsRackState = useCallback<React.Dispatch<React.SetStateAction<EffectsRackState>>>(
    (action) => {
      const prev = effectsRackRef.current;
      const next = typeof action === "function" ? action(prev) : action;
      // Set the ref first: the commit below is what history records, and a second call in the same
      // tick must compute from the value this one produced.
      effectsRackRef.current = next;
      setEffectsRackStateLocal(next);
      // One key, so dragging a slider is one history entry rather than one per frame.
      commitCoalesced({ type: "SET_EFFECTS_RACK", effectsRack: next }, "fx");
    },
    [commitCoalesced]
  );

  // ...and when history restores a rack, the UI follows it.
  useEffect(() => {
    if (storedRack && storedRack !== effectsRackRef.current) {
      effectsRackRef.current = storedRack;
      setEffectsRackStateLocal(storedRack);
    }
  }, [storedRack]);

  return { effectsRackState, setEffectsRackState, effectsRackRef };
}
