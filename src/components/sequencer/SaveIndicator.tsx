import React from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import type { SaveStatusSnapshot } from "../../features/sequencer/projectStorage";

export interface SaveIndicatorProps {
  /**
   * Whether the host wants it on screen.
   *
   * A prop rather than a condition at the call site, for the reason `FirstRunPrompt` documents:
   * React matches children by position, so a conditional sibling in front of the sequencer panel
   * remounts the panel the moment the condition flips.
   */
  visible: boolean;
  status: SaveStatusSnapshot;
}

/**
 * U8: the studio now says whether the work is safe.
 *
 * The project is auto-saved 500 ms after every change and the studio never mentioned it, while the
 * genre maker has shown an "unsaved" badge all along — so there was no way to tell a saved project
 * from one living only in memory (or from one whose storage was full and refusing writes).
 *
 * `role="status"` and `aria-live="polite"` on purpose: the reassurance is worth nothing to a screen
 * reader if it is only pixels. The three states say what is true — waiting on the debounce, written,
 * or refused — and the title carries the exact time of the last write.
 */
export const SaveIndicator: React.FC<SaveIndicatorProps> = ({ visible, status }) => {
  const { t } = useLanguage();

  if (!visible || status.status === "idle") return null;

  const time = status.savedAt
    ? new Date(status.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const label =
    status.status === "saved"
      ? t("save_indicator_saved")
      : status.status === "failed"
        ? t("save_indicator_failed")
        : t("save_indicator_saving");

  const tone =
    status.status === "saved"
      ? "text-text-dim border-line/60"
      : status.status === "failed"
        ? "text-amber-300 border-amber-500/50 bg-amber-500/10"
        : "text-text-sub border-line/60";

  return (
    <div className="flex justify-end mb-1">
    <div
      data-testid="save-indicator"
      data-save-status={status.status}
      role="status"
      aria-live="polite"
      title={
        status.status === "saved" && time
          ? t("save_indicator_saved_at", { time })
          : t("save_indicator_local_only")
      }
      className={`flex items-center gap-1 text-[10px] font-['JetBrains_Mono'] px-2 py-0.5 rounded-md border ${tone}`}
    >
      {status.status === "saved" && <Check className="w-3 h-3" />}
      {status.status === "saving" && <Loader2 className="w-3 h-3 animate-spin" />}
      {status.status === "failed" && <TriangleAlert className="w-3 h-3" />}
      <span>{label}</span>
    </div>
    </div>
  );
};
