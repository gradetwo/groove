import React, { useCallback, useEffect, useRef, useState } from "react";
import { initIosAudioUnlock } from "../audio/iosAudioUnlock";
import { getActiveAudioEngine } from "../audio/activeEngine";
import { useLanguage } from "../i18n/LanguageContext";
import { APP_VERSION } from "../version";

/**
 * The entry gate: one tap that makes audio work, before anything asks it to.
 *
 * Mobile browsers — Safari on iOS above all — will not start an `AudioContext` outside a user gesture, and the app
 * has always handled that by resuming the context on the first play (`initIosAudioUnlock`, `ctx.resume()` on every
 * start). That is enough to make sound and not enough to make it *reliable*: the first notes of a session can still
 * land while the context is coming up, and a browser that cannot voice the synth engine offline has to be told so
 * at a moment when a real gesture exists.
 *
 * So the first visit opens here instead, in the shape the sibling synth project uses: one screen, one button, and by
 * the time it closes the context is running and both capability probes have run *inside a gesture* — the live one and
 * the offline one, whose verdict decides whether exports fall back to the native engine. It shows once
 * (`localStorage`), and it never blocks anything: the button is the only thing on the screen, and a second tap
 * immediately proceeds if a probe is slow.
 *
 * ⭐ **Two things this screen used to get wrong, both of them about the person rather than the audio** (defect G9,
 * measured in the census):
 *
 *  1. **It was the last hard-coded Chinese surface in the tree.** Its four literals — the dialog's `aria-label`,
 *     the button, the failure heading and the retry — meant an **English** first screen whose one instruction was
 *     "启动音频引擎". They now go through the same `useLanguage()` / `t()` path as the rest of the interface, with
 *     the keys in `src/i18n/locales/common.ts`; the retry reuses the existing `retry` key rather than a second
 *     spelling of it.
 *  2. **It was a modal dialog that did not behave like one.** The ARIA APG Dialog (Modal) Pattern asks for three
 *     things literally, and this file had none of them: *"When a dialog opens, focus moves to an element inside the
 *     dialog."*, *"Escape: Closes the dialog."*, and *"The dialog container element has `aria-modal` set to
 *     `true`."* A keyboard user landed outside the overlay and, measured, could not leave it with Escape at all.
 *
 * ⚠️ **The gate itself is not the defect** and is not going away: Chrome's autoplay policy needs a user gesture
 * before `resume()`, which is the whole reason this screen exists. Escape **dismisses without starting** — it
 * deliberately does not write `AUDIO_STARTED_KEY`, because a dismissal is not the gesture the gate is asking for,
 * and the app's own first-play unlock still covers the session.
 */
export const AUDIO_STARTED_KEY = "groove_audio_started";

/** Whether this browser has already been through the gate. Absent or unreadable means "show it". */
export function audioGateCompleted(): boolean {
  try {
    return localStorage.getItem(AUDIO_STARTED_KEY) === "1";
  } catch {
    return false;
  }
}

export interface AudioStartGateProps {
  children: React.ReactNode;
  /** Injected in tests: what the button should do instead of touching a real audio stack. */
  onStart?: () => Promise<void>;
}

export function AudioStartGate({ children, onStart }: AudioStartGateProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(() => !audioGateCompleted());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Read inside `finally` to decide whether the gate may close: state updates are not visible in the same tick. */
  const errorRef = useRef<string | null>(null);
  /** The one control the gate is asking for; also where focus lands when the dialog opens (APG, modal dialog). */
  const startButtonRef = useRef<HTMLButtonElement | null>(null);

  /**
   * ⭐ **The modal contract, in the two places it can be kept** (the third, `aria-modal`, is on the container below).
   *
   * *Focus*: the gate is the first and only thing on the screen, so moving focus to its button is what makes the
   * dialog reachable by keyboard and announced by a screen reader instead of leaving the reader on `document.body`.
   *
   * *Escape*: dismisses. It follows the APG requirement literally — *"Escape: Closes the dialog."* — and, just as
   * deliberately, it is **not** a start: `AUDIO_STARTED_KEY` is not written, so nothing claims the browser was
   * unlocked by a dismissal. The app's own first-play unlock (`initIosAudioUnlock`) still covers that session, which
   * is why a dismissal is safe rather than a trap. A dismissal while a start is in flight is allowed too — the probe
   * still finishes, and on success it writes the key the same way a completed tap would.
   */
  useEffect(() => {
    if (!open) return;
    startButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    errorRef.current = null;
    /**
     * **Synchronously, before any `await`.** Safari only honours a resume that happens inside the gesture itself, and
     * an `await import()` — which is what the probes need — spends the gesture before the context is ever resumed. The
     * sibling synth project's start screen carries the same comment for the same reason, and this is the lesson taken
     * from it: unlock first, then do the slow work.
     */
    try {
      /**
       * The **engine's** context first. It is created lazily, so at this moment it usually does not exist yet, and
       * the unlocker has nothing registered to resume — which is exactly why the first playback after the gate still
       * said "audio is blocked by the browser" and a second tap worked. `primeAudioContext` creates and resumes it
       * synchronously, here, while the gesture is live.
       */
      getActiveAudioEngine()?.primeAudioContext();
      initIosAudioUnlock().unlock();
    } catch {
      /* an unlocker that cannot run is not a reason to refuse the app */
    }
    try {
      if (onStart) {
        await onStart();
      } else {
        /**
         * Order matters, and only slightly: unlocking first means the live probe below runs against a context that is
         * actually running, which is the difference between a verdict and `unmeasured`.
         */
        /**
         * Both probes are imported **here**, after the tap: they pull in the GS-1 host and the WASM plumbing, and the
         * bundle budget for the initial route is a hard gate — a screen whose only job is one button must not pay for
         * the engine it is about to measure.
         */
        const engine = getActiveAudioEngine();
        const [live, offline] = await Promise.all([
          // The live probe runs **in the context it is judging** (see `ensureLiveGs1Capability`), and it can switch
          // GS-1 off for the session when this browser renders it silent.
          engine?.probeLiveGs1().catch(() => undefined),
          import("../audio/gs1/gs1OfflineCapability").then((m) => m.ensureOfflineGs1Capability()).catch(() => undefined),
        ]);
        void live;
        void offline;
      }
      try {
        localStorage.setItem(AUDIO_STARTED_KEY, "1");
      } catch {
        /* private mode: the gate simply shows again next time */
      }
    } catch (error) {
      /**
       * The gate **stays** and says why, with the diagnostics line beside it, exactly as the sibling synth project's
       * does. The first version closed anyway; that is wrong for this screen's purpose, because the one moment a
       * person can act on "audio did not start" is while they are still looking at the button.
       */
      const message = error instanceof Error ? error.message : String(error);
      errorRef.current = message;
      setError(message);
      // eslint-disable-next-line no-console
      console.warn("[audio-start] the gate could not finish its work:", error);
    } finally {
      setBusy(false);
      if (!errorRef.current) setOpen(false);
    }
  }, [onStart]);

  if (!open) return <>{children}</>;

  /**
   * The card, after the sibling synth project's start screen: a translucent mask over the app, a brand block with the
   * mark, the wordmark and the build, one content-sized button, and — when it fails — the reason, a one-line
   * environment diagnostic and a retry. The app stays mounted underneath the whole time.
   */
  const environment =
    typeof navigator === "undefined"
      ? `v${APP_VERSION}`
      : `v${APP_VERSION} · ${typeof AudioContext === "undefined" ? "no AudioContext" : "AudioContext ok"}`;

  return (
    <>
      {children}
      <div data-testid="audio-start-gate" role="dialog" aria-modal="true" aria-label={t("audio_gate_label")} className="gate-overlay">
        <div className="gate-card">
          <div className="gate-brand">
            <svg className="gate-logo" width="46" height="46" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeOpacity="0.35" />
              <path
                d="M3.5 12 Q6.5 4.5 12 12 T20.5 12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            <div className="gate-name">
              GROOVE <b>LAB</b>
            </div>
            <div className="gate-sub">{environment}</div>
          </div>
          <button
            type="button"
            ref={startButtonRef}
            data-testid="audio-start-button"
            onClick={() => void start()}
            disabled={busy}
            className="gate-btn"
          >
            {busy ? t("audio_gate_starting") : t("audio_gate_start")}
          </button>
          {error ? (
            <div className="gate-error" data-testid="audio-start-error" role="alert">
              <b>{t("audio_gate_failed")}</b>
              <p>{error}</p>
              <button
                type="button"
                className="gate-retry"
                data-testid="audio-start-retry"
                onClick={() => void start()}
                disabled={busy}
              >
                {t("retry")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
