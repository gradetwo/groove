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

export interface RecordButtonV2Props {
  /** Starting a capture. Injected, so this component can be tested without a microphone — the same seam the capture uses. */
  capture: () => Promise<CaptureOutcome>;
}

export function RecordButtonV2({ capture }: RecordButtonV2Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const start = async () => {
    setBusy(true);
    setMessage(undefined);
    const outcome = await capture();
    setBusy(false);
    // ⭐ The refusal's own words. Rewriting them here would be a second answer to "why did this fail", and the first one is the one with criteria.
    if (!outcome.ok) setMessage(outcome.summary);
  };

  return (
    <div data-testid="record-button-v2">
      <button type="button" onClick={start} disabled={busy}>
        {busy ? "Recording…" : "Record"}
      </button>
      {message !== undefined && (
        <p role="status" data-testid="record-refusal">
          {message}
        </p>
      )}
    </div>
  );
}
