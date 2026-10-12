import React from "react";
import { Play, X } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

export interface FirstRunPromptProps {
  /**
   * Whether to show the hint.
   *
   * Deliberately a prop rather than a condition at the call site: React matches children by position,
   * so `{visible && <FirstRunPrompt/>}` sitting **before** the sequencer panel makes the panel change
   * position the moment the prompt hides — React then unmounts the old panel and mounts a new one.
   * Pressing play would remount the entire grid. Rendering this component unconditionally and letting
   * it return `null` keeps the panel's identity intact. (The E2E matrix caught exactly that, as
   * `elementHandle.click: Element is not attached to the DOM`.)
   */
  visible: boolean;
  /** Starts the transport — the one action this strip exists to point at. */
  /** The visitor does not want the hint. */
  onDismiss: () => void;
}

/**
 * U1: one instruction and one button, on the first screen.
 *
 * Deliberately a single slim line rather than a panel: the complaint behind U1 is that the first
 * impression is a control surface with no starting point, and answering that with more furniture
 * would repeat the mistake. `useFirstRunPrompt` decides whether it is shown at all, and retires it
 * for good once playback has happened once.
 */
export const FirstRunPrompt: React.FC<FirstRunPromptProps> = ({ visible, onDismiss }) => {
  const { t } = useLanguage();

  // See the `visible` prop's note: returning null here is what keeps the sibling below mounted.
  if (!visible) return null;

  return (
    <div
      data-testid="first-run-prompt"
      role="note"
      /**
   * ⭐ **The hint yields width rather than forcing a row apart** (reported from a fresh profile: the Import/Export buttons
   * dropped to a line of their own).
   *
   * ⚠️ **This alone could not fix it, and the measurement is why**: the toolbar is `flex flex-wrap`, and a wrapping row
   * wraps *before* it shrinks, so a shrinkable item inside the row never gets the chance to yield. The fix that worked was
   * structural — the hint now renders as its own row above the toolbar (see `ArrangementViewV2`) — and it took the toolbar
   * from five rows at 1469 CSS px back to four, with the file group beside FX and ZOOM again. This class stays because a
   * hint that cannot be truncated is still the wrong shape for a toolbar; its criterion pins the property, not the fix.
   */
  className="flex min-w-0 shrink items-center gap-2 mb-2 px-3 py-2 rounded-xl border border-accent/30 bg-accent/10 text-xs text-text"
    >
      {/**
        * ⭐ **One action, and it is the transport's** (fifth evaluation, P3: "Listen 與 Play 重複" — two controls doing the
        * same thing an inch apart). The hint's sentence points at Play, Play is right below it, and the hook retires the
        * hint the moment playback starts — so the duplicate button added nothing but a second way to be confused.
        */}
      <span className="flex-1 min-w-0 truncate">{t("first_run_prompt_text")}</span>
      <button
        type="button"
        onClick={onDismiss}
        data-testid="first-run-prompt-dismiss"
        aria-label={t("first_run_prompt_dismiss")}
        title={t("first_run_prompt_dismiss")}
        className="flex min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 items-center justify-center rounded-lg text-text-dim hover:text-text hover:bg-white/10 transition-colors shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
