import React, { useCallback, useState } from "react";
import { initIosAudioUnlock } from "../audio/iosAudioUnlock";
import { ensureOfflineGs1Capability } from "../audio/gs1/gs1OfflineCapability";
import { ensureGs1Capability } from "../audio/gs1/gs1Capability";

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
  const [open, setOpen] = useState(() => !audioGateCompleted());
  const [busy, setBusy] = useState(false);

  const start = useCallback(async () => {
    setBusy(true);
    try {
      if (onStart) {
        await onStart();
      } else {
        /**
         * Order matters, and only slightly: unlocking first means the live probe below runs against a context that is
         * actually running, which is the difference between a verdict and `unmeasured`.
         */
        const unlocker = initIosAudioUnlock();
        unlocker.unlock();
        try {
          await ensureGs1Capability();
        } catch {
          /* a probe that cannot run is not a reason to keep someone out of the app */
        }
        try {
          await ensureOfflineGs1Capability();
        } catch {
          /* same */
        }
      }
      try {
        localStorage.setItem(AUDIO_STARTED_KEY, "1");
      } catch {
        /* private mode: the gate simply shows again next time */
      }
    } catch (error) {
      /**
       * Swallowed on purpose, and it still closes the gate. A browser whose audio stack refuses to start is exactly
       * the situation this screen exists for; keeping someone out of the app because a probe threw would be worse
       * than the defect the probe is looking for. The reason goes to the console, where a report can pick it up.
       */
      // eslint-disable-next-line no-console
      console.warn("[audio-start] the gate could not finish its work:", error);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }, [onStart]);

  if (!open) return <>{children}</>;

  return (
    <>
      {children}
      <div
        data-testid="audio-start-gate"
        role="dialog"
        aria-label="开始"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2147483646,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          background: "rgba(8, 8, 12, 0.94)",
          color: "#f2f2f6",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: "0.08em", fontWeight: 600 }}>GROOVE</div>
        <p style={{ maxWidth: 380, fontSize: 14, lineHeight: 1.6, opacity: 0.78 }}>
          点击开始，浏览器才会允许播放声音。
          <br />
          <span style={{ opacity: 0.7 }}>Tap to start — browsers only allow audio after a tap.</span>
        </p>
        <button
          type="button"
          data-testid="audio-start-button"
          onClick={() => void start()}
          disabled={busy}
          style={{
            font: "inherit",
            fontSize: 16,
            padding: "12px 34px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.35)",
            background: busy ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.18)",
            color: "#f2f2f6",
            cursor: busy ? "default" : "pointer",
            minHeight: 44,
          }}
        >
          {busy ? "准备中…" : "开始"}
        </button>
      </div>
    </>
  );
}
