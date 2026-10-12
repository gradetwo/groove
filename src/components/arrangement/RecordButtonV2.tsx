/**
 * The button that starts a capture — and, more importantly, **the place a refusal becomes visible**.
 *
 * The recording path was built so that a failure is *reported* rather than thrown: `captureTake` returns a named refusal with a sentence a user can read, the classifier separates "this browser cannot record" from
 * "the browser would not give me a stream", and the probe in CI asserts both. That work is worth nothing if the interface drops the sentence on the floor — **a refusal that nothing displays is
 * indistinguishable from a button that does nothing**, which is exactly the failure mode those criteria exist to prevent.
 *
 * So this component's contract is `CaptureOutcome`: it renders the summary when there is one, and it never decides what a refusal means.
 */
import { useState } from "react";
import type { CaptureOutcome } from "../../audio/captureTake";
import type { PlannedTake } from "../../data/takePlanning";
import { useLanguage } from "../../i18n/LanguageContext";

export interface RecordButtonV2Props {
  /** Starting a capture. Injected, so this component can be tested without a microphone — the same seam the capture uses. */
  capture: () => Promise<CaptureOutcome>;
  /**
   * Receives what was recorded. Until this existed the button captured and dropped the result: the take never reached a track, so the take list stayed empty however often a person recorded.
   */
  onTake?: (planned: PlannedTake) => void;
  /**
   * Whether there is anywhere for a take to go.
   *
   * ⭐ **A disabled Record is the honest state when no track is selected.** The arrangement's toolbar carries this
   * button now, and a toolbar is above the selection rather than inside it — so without this, pressing Record with an
   * empty selection captured audio and dropped it, which is the exact failure the `onTake` callback above was
   * introduced to fix, reintroduced one layout higher.
   */
  disabled?: boolean;
}

export function RecordButtonV2({ capture, onTake, disabled = false }: RecordButtonV2Props) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const start = async () => {
    setBusy(true);
    setMessage(undefined);
    const outcome = await capture();
    setBusy(false);
    // ⭐ The refusal's own words. Rewriting them here would be a second answer to "why did this fail", and the first one is the one with criteria.
    if (!outcome.ok) {
      setMessage(outcome.summary);
      return;
    }
    // A refusal says so above; a success has to go somewhere, and the only place a take belongs is the track it was recorded on.
    onTake?.(outcome.planned);
  };

  return (
    <div data-testid="record-button-v2" className="flex items-center gap-3">
      <button
        type="button"
        // 44 px, like every other control in this toolbar: the arrangement is a touch surface on a phone, and a
        // record button is not the one control that may be smaller than a finger.
        className="h-11 shrink-0 rounded border border-[rgb(var(--d-line))] px-2 text-xs text-text disabled:opacity-50"
        onClick={start}
        disabled={busy || disabled}
      >
        {busy ? t("arrangement_recording") : t("arrangement_record")}
      </button>
      {message !== undefined && (
        <p role="status" data-testid="record-refusal" className="text-sm text-text opacity-80">
          {message}
        </p>
      )}
    </div>
  );
}
