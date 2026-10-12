/**
 * The arrangement's undo/redo, as the view uses it.
 *
 * The stack itself is `src/data/arrangementHistory.ts` — pure, testable without React — and this file is only the
 * binding: **flags that re-render** and a `commit` that routes an edit through the stack instead of straight into
 * state.
 *
 * ⭐ **`canUndo`/`canRedo` are React state, and that is not a detail.** The studio's own history records the same
 * lesson in `useSequencerStore.ts:1196`: they were read straight off refs during render, so the toolbar's `disabled`
 * never updated and the button looked broken while it was in fact available. A ref is the right place for the stack
 * (nothing renders from its contents) and the wrong place for the two booleans (the buttons render from exactly them).
 *
 * ⭐ **`commit` reads a ref rather than the render closure.** Two edits in one tick — a drag that reports a move and a
 * length, a handler that commits twice — would otherwise both compute from the arrangement as it was at the last
 * render, and the second would silently discard the first. The ref always points at the newest value, and `commit`
 * writes it back itself so the next commit in the same tick sees it.
 *
 * ⚠️ **Nothing here writes the arrangement directly.** Every path goes through the `setArrangement` the caller owns, so
 * the view keeps exactly one writer of its own state — and the persistence effect that watches that state therefore sees
 * an undo exactly as it sees any other edit. See the header of `arrangementHistory.ts` for why that is the industry's
 * arrangement too.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { ArrangementV2 } from "../../types/arrangementV2";
import {
  EMPTY_ARRANGEMENT_HISTORY,
  canRedo as canRedoHistory,
  canUndo as canUndoHistory,
  nextRedoAction,
  nextUndoAction,
  recordCommand,
  redoArrangement,
  undoArrangement,
  type ArrangementCommand,
  type ArrangementHistory,
} from "../../data/arrangementHistory";

export interface UseArrangementHistoryResult {
  /** Apply an edit **and remember it**. The one way a change should reach the arrangement. */
  commit: (command: ArrangementCommand) => void;
  /** Walk one action back. `false` means there was nothing to undo — an answer, not a failure. */
  undo: () => boolean;
  /** Walk one action forward again. `false` means there was nothing to redo. */
  redo: () => boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** The `action` id on top of each stack, for the toolbar's readout. */
  undoAction: string | undefined;
  redoAction: string | undefined;
}

export function useArrangementHistory(
  arrangement: ArrangementV2,
  setArrangement: (arrangement: ArrangementV2) => void
): UseArrangementHistoryResult {
  const historyRef = useRef<ArrangementHistory>(EMPTY_ARRANGEMENT_HISTORY);
  /**
   * The live value. Written on every render **and** by `commit`/`undo`/`redo`, so it is never behind the arrangement
   * this hook is handed — the reason is in this file's header.
   */
  const arrangementRef = useRef(arrangement);
  arrangementRef.current = arrangement;

  const [flags, setFlags] = useState<{ canUndo: boolean; canRedo: boolean; undoAction?: string; redoAction?: string }>({
    canUndo: false,
    canRedo: false,
  });

  const sync = useCallback(() => {
    const history = historyRef.current;
    const next = {
      canUndo: canUndoHistory(history),
      canRedo: canRedoHistory(history),
      undoAction: nextUndoAction(history),
      redoAction: nextRedoAction(history),
    };
    // Compared field by field so a commit that changed nothing observable (an edit on a track that is not there) does not re-render the surface.
    setFlags((current) =>
      current.canUndo === next.canUndo &&
      current.canRedo === next.canRedo &&
      current.undoAction === next.undoAction &&
      current.redoAction === next.redoAction
        ? current
        : next
    );
  }, []);

  const apply = useCallback(
    (next: ArrangementV2) => {
      arrangementRef.current = next;
      setArrangement(next);
    },
    [setArrangement]
  );

  const commit = useCallback(
    (command: ArrangementCommand) => {
      historyRef.current = recordCommand(historyRef.current, command);
      sync();
      apply(command.redo(arrangementRef.current));
    },
    [apply, sync]
  );

  const undo = useCallback(() => {
    const step = undoArrangement(historyRef.current, arrangementRef.current);
    if (step === null) return false;
    historyRef.current = step.history;
    sync();
    apply(step.arrangement);
    return true;
  }, [apply, sync]);

  const redo = useCallback(() => {
    const step = redoArrangement(historyRef.current, arrangementRef.current);
    if (step === null) return false;
    historyRef.current = step.history;
    sync();
    apply(step.arrangement);
    return true;
  }, [apply, sync]);

  return useMemo(
    () => ({
      commit,
      undo,
      redo,
      canUndo: flags.canUndo,
      canRedo: flags.canRedo,
      undoAction: flags.undoAction,
      redoAction: flags.redoAction,
    }),
    [commit, undo, redo, flags]
  );
}
