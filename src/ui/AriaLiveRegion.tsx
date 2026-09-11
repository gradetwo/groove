import React, { useState, useEffect } from "react";

export type AnnouncePriority = "polite" | "assertive";

class AnnouncerService {
  private listener: ((message: string, priority: AnnouncePriority) => void) | null = null;

  setListener(fn: (message: string, priority: AnnouncePriority) => void) {
    this.listener = fn;
  }

  clearListener() {
    this.listener = null;
  }

  announce(message: string, priority: AnnouncePriority = "polite") {
    if (this.listener) {
      this.listener(message, priority);
    }
  }
}

export const announcer = new AnnouncerService();

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
