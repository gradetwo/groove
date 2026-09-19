import { useCallback, useRef, useState } from "react";
import {
  loadUnsavedPromptPrefs,
  saveUnsavedPromptPrefs,
  type UnsavedPromptPrefs,
} from "../unsavedGuard";
import type { UnsavedDecision } from "../unsavedDecision";

/**
 * Gate destructive actions behind the "unsaved changes" question (item ⑧).
 *
 * `request(...)` runs the action immediately when there is nothing to lose (or the user has said
 * "don't ask again"); otherwise it parks the action and the caller renders the dialog. The parked
 * action is a closure rather than a serialisable descriptor, so the guard stays generic: the
 * caller decides which actions are destructive, and each one keeps its own arguments.
 *
 * The suppression preference is re-read on every request, so unticking the box in another tab (or
 * clearing storage) takes effect without a reload.
 */
export interface UnsavedGuard {
  /** The parked action, or null when no question is pending. */
  pending: { label: string; run: () => void | Promise<void> } | null;
  /** Ask (or proceed) before destroying unsaved work. */
  request: (label: string, run: () => void | Promise<void>) => void;
  /** Answer the dialog. */
  decide: (decision: UnsavedDecision, dontAskAgain: boolean) => Promise<void>;
  /** Current suppression preference, for a caller that wants to display it. */
  prefs: () => UnsavedPromptPrefs;
}

export function useUnsavedGuard(options: {
  /** True when the studio holds edits that would be lost. */
  isDirty: () => boolean;
  /**
   * Persist the current work. Resolves `false` when saving failed or was cancelled, in which case
   * the destructive action is abandoned and the edits stay — never the other way round.
   */
  onSave: () => Promise<boolean>;
}): UnsavedGuard {
  const [pending, setPending] = useState<UnsavedGuard["pending"]>(null);
  // The callbacks are read through refs so `request`/`decide` keep stable identities: they are
  // handed to memoized children (the genre rail, the toolbar) and must not churn on every edit.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const request = useCallback<UnsavedGuard["request"]>((label, run) => {
    const dirty = optionsRef.current.isDirty();
    const suppressed = loadUnsavedPromptPrefs().suppress;
    if (!dirty || suppressed) {
      void run();
      return;
    }
    setPending({ label, run });
  }, []);

  const decide = useCallback<UnsavedGuard["decide"]>(async (decision, dontAskAgain) => {
    if (dontAskAgain) saveUnsavedPromptPrefs({ version: 1, suppress: true });
    const action = pending;
    setPending(null);
    if (!action || decision === "cancel") return;
    if (decision === "save") {
      const saved = await optionsRef.current.onSave();
      if (!saved) return;
    }
    await action.run();
  }, [pending]);

  const prefs = useCallback(() => loadUnsavedPromptPrefs(), []);

  return { pending, request, decide, prefs };
}
