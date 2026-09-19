import React, { useState, useEffect } from "react";
import { announcer } from "../platform/announcer";
import type { AnnouncePriority } from "../platform/announcer";

/**
 * The announcement service now lives in `src/platform/announcer.ts`.
 *
 * It was defined here, which made `announcer` a presentation import: the transport and
 * genre-audition hooks reached into a `.tsx` file to publish an event. Re-exported so existing
 * importers keep working, but new code should import from the platform module — and the layering
 * gate will now reject a logic file that imports this one.
 */
export { announcer };
export type { AnnouncePriority };

/**
 * Global WAI-ARIA live region container for screen readers (P2-17)
 * Announces dynamic state changes like genre switching, audio playback, and quiz feedback.
 */
export const AriaLiveRegion: React.FC = () => {
  const [politeMessage, setPoliteMessage] = useState("");
  const [assertiveMessage, setAssertiveMessage] = useState("");

  useEffect(() => {
    announcer.setListener((msg, priority) => {
      if (priority === "assertive") {
        setAssertiveMessage("");
        requestAnimationFrame(() => setAssertiveMessage(msg));
      } else {
        setPoliteMessage("");
        requestAnimationFrame(() => setPoliteMessage(msg));
      }
    });
    return () => announcer.clearListener();
  }, []);

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="aria-live-polite"
      >
        {politeMessage}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        data-testid="aria-live-assertive"
      >
        {assertiveMessage}
      </div>
    </>
  );
};
