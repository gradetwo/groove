/**
 * A one-line playhead bus.
 *
 * The transport reports its step through the engine's `onStep` callback, and the studio
 * deliberately updates the playhead **through the DOM** rather than through React state: a step is
 * 1/16 of a beat, so re-rendering the studio per step is exactly the kind of main-thread work the
 * responsiveness fixes removed (`useAudioEngineLifecycle.movePlayhead`).
 *
 * The piano roll needs the same information (to draw its own playhead and to follow it), and it
 * must not reintroduce that re-render, so the step is published here and whoever wants it
 * subscribes. Subscribers move DOM nodes; nothing re-renders.
 */

export type PlayheadListener = (step: number) => void;

const listeners = new Set<PlayheadListener>();

/** Publishes the current step; `-1` means "the transport is not running". */
export function publishPlayhead(step: number): void {
  for (const listener of listeners) {
    try {
      listener(step);
    } catch {
      // A listener must never be able to stop the transport's step callback.
    }
  }
}

export function subscribePlayhead(listener: PlayheadListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper: drop every subscriber (module state outlives a test file otherwise). */
export function resetPlayheadBus(): void {
  listeners.clear();
}
