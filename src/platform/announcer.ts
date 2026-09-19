/**
 * Screen-reader announcements, as a service any layer may publish to.
 *
 * This was a class inside `src/ui/AriaLiveRegion.tsx`. That made it a **presentation** import: the
 * transport and genre-audition hooks called `announcer.announce(...)` and therefore depended on a
 * `.tsx` file, which is exactly the coupling the layering gate exists to prevent — a logic hook
 * could not be reused by another surface without dragging a React component with it.
 *
 * The dependency was always the wrong way round. Announcing state is an *event*, not a view: the
 * logic layer publishes it, and whichever view is mounted decides how to show it. So the service
 * lives here — importable by logic, UI and platform alike — and `AriaLiveRegion` is simply the
 * component that subscribes.
 *
 * Deliberately framework-free: no React, no DOM. It holds one listener and forwards to it, which is
 * what lets it sit below the UI layer without dragging anything with it.
 */

export type AnnouncePriority = "polite" | "assertive";

type Listener = (message: string, priority: AnnouncePriority) => void;

class AnnouncerService {
  private listener: Listener | null = null;

  setListener(fn: Listener) {
    this.listener = fn;
  }

  clearListener() {
    this.listener = null;
  }

  /**
   * Publishes a message. A no-op when nothing is listening, which is the honest behaviour: an
   * announcement with no live region mounted is simply not heard, and must never throw in the
   * middle of a state transition.
   */
  announce(message: string, priority: AnnouncePriority = "polite") {
    if (this.listener) this.listener(message, priority);
  }
}

export const announcer = new AnnouncerService();
