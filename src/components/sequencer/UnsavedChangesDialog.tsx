import React, { useState } from "react";
import { Modal } from "../../ui/Modal";
import { useLanguage } from "../../i18n/LanguageContext";
import { AlertTriangle, Save, Trash2, X } from "lucide-react";

/**
 * "Discard your changes?" (item ⑧).
 *
 * The user asked for the Logic-style prompt: when an action would destroy unsaved work, offer
 * discard / save / cancel, plus a "don't ask again" that sticks. `cancel` is listed last and
 * rendered neutrally on purpose — the safe choice should never be the one a hurried tap hits by
 * accident, and on a phone this dialog is thumb-height.
 */
/**
 * The decision union lives in `src/features/sequencer/unsavedDecision.ts`; re-exported so existing
 * importers keep working. Imported as well as re-exported, because this component's props use it.
 */
import type { UnsavedDecision } from "../../features/sequencer/unsavedDecision";
export type { UnsavedDecision };

export interface UnsavedChangesDialogProps {
  isOpen: boolean;
  /** Localized name of the thing that is about to happen ("切换到 House", "载入工程 …"). */
  actionLabel: string;
  /**
   * Shown under the buttons when saving is not possible yet (no active project): the save button
   * then opens the project hub so the user can name one. Saving must never be a dead end.
   */
  saveHint?: string;
  onDecide: (decision: UnsavedDecision, dontAskAgain: boolean) => void;
}

export const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({
  isOpen,
  actionLabel,
  saveHint,
  onDecide,
}) => {
  const { t } = useLanguage();
  const [dontAskAgain, setDontAskAgain] = useState(false);

  return (
    <Modal isOpen={isOpen} onClose={() => onDecide("cancel", dontAskAgain)} className="max-w-md">
      <div className="space-y-4" data-testid="unsaved-changes-dialog">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 rounded-full bg-amber-500/15 p-2 text-amber-400">
            <AlertTriangle className="w-4 h-4" />
          </span>
          <div className="space-y-1">
            <div className="text-sm font-bold text-text">{t("unsaved_title")}</div>
            <div className="text-xs text-text-sub leading-relaxed" data-testid="unsaved-message">
              {t("unsaved_message", { action: actionLabel })}
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-[11px] text-text-sub cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
            data-testid="unsaved-dont-ask"
            className="accent-[var(--color-accent,#f59e0b)]"
          />
          <span>{t("unsaved_dont_ask")}</span>
        </label>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={() => onDecide("cancel", dontAskAgain)}
            data-testid="unsaved-cancel"
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-line bg-[#1d2028] text-text-sub hover:text-text transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            {t("unsaved_cancel")}
          </button>
          <button
            type="button"
            onClick={() => onDecide("discard", dontAskAgain)}
            data-testid="unsaved-discard"
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t("unsaved_discard")}
          </button>
          <button
            type="button"
            onClick={() => onDecide("save", dontAskAgain)}
            data-testid="unsaved-save"
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-accent bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {t("unsaved_save")}
          </button>
        </div>

        {saveHint && (
          <div className="text-[11px] text-text-dim leading-relaxed" data-testid="unsaved-save-hint">
            {saveHint}
          </div>
        )}
      </div>
    </Modal>
  );
};
