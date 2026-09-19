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
  onPlay: () => void;
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
export const FirstRunPrompt: React.FC<FirstRunPromptProps> = ({ visible, onPlay, onDismiss }) => {
  const { t } = useLanguage();

  // See the `visible` prop's note: returning null here is what keeps the sibling below mounted.
  if (!visible) return null;

  return (
    <div
      data-testid="first-run-prompt"
      role="note"
      className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl border border-accent/30 bg-accent/10 text-xs text-text"
    >
      <span className="flex-1 min-w-0">{t("first_run_prompt_text")}</span>
      <button
        type="button"
        onClick={onPlay}
        data-testid="first-run-prompt-play"
        className="flex items-center gap-1 px-3 py-1 rounded-lg bg-accent text-black font-bold text-xs hover:bg-accent/90 transition-colors shrink-0"
      >
        <Play className="w-3 h-3" />
        <span>{t("first_run_prompt_play")}</span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        data-testid="first-run-prompt-dismiss"
        aria-label={t("first_run_prompt_dismiss")}
        title={t("first_run_prompt_dismiss")}
        className="p-1 rounded-lg text-text-dim hover:text-text hover:bg-white/10 transition-colors shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
