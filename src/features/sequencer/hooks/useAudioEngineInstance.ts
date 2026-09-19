/**
 * Owns one `AudioEngine` for the lifetime of a component, callbacks included.
 *
 * Five views each wrote the same three-line dance by hand — construct with callbacks, assign to a
 * ref, destroy in the effect's cleanup — and three of them had to keep that effect's dependency list
 * carefully stable, because `onStep` could only be set in the constructor. A callback that captured
 * changing state therefore forced a full teardown and rebuild, which drops every scheduled voice and
 * re-allocates the audio graph mid-session.
 *
 * This hook removes the dance and the trap:
 *
 *  - **One engine per mount**, created eagerly and destroyed on unmount. No view writes `new
 *    AudioEngine` or `destroy()` again.
 *  - **Callbacks are kept current, not captured.** `onStep` / `onPlay` / `onStop` are read through a
 *    ref and refreshed by an effect, so a caller may pass inline closures over fresh state without
 *    the engine being rebuilt. (This is why `AudioEngine.setOnStep` now exists alongside `setOnPlay`
 *    and `setOnStop`.)
 *  - **The ref stays in sync**, so imperative callers — transport buttons, preview scopes, the
 *    inspector's gain-reduction meter — keep working exactly as before.
 *
 * Deliberately not a general sequencer: it does not own a pattern, a transport, or any state. That is
 * `useAudioEngineLifecycle`, which is this plus the studio's wiring. This one is the primitive that a
 * simpler surface (an audition, a preview, a game view) or a future surface can use directly.
 *
 * The callbacks are optional and individually settable: a view that only cares about `onStop` passes
 * only that, and the engine's other callbacks stay undefined rather than being filled with no-ops
 * that would make a missing handler indistinguishable from a present one.
 */
import { useEffect, useRef } from "react";
import { AudioEngine } from "../../../audio/AudioEngine";
import type { StepCallbackInfo } from "../../../audio/AudioEngine";

export interface AudioEngineCallbacks {
  onStep?: (info: StepCallbackInfo) => void;
  onPlay?: () => void;
  onStop?: () => void;
  /** Per-step track activity, used by meters. */
  onTrackTrigger?: (trackIndices: number[]) => void;
  /** Steps the scheduler had to skip after a stall. */
  onDroppedSteps?: (count: number) => void;
}

export interface UseAudioEngineInstanceResult {
  /** The live engine. Never null after mount, but typed nullable because a ref can outlive a render. */
  engineRef: React.MutableRefObject<AudioEngine | null>;
  /** Throws rather than returning null, for the common "I know it exists by now" call site. */
  getEngine: () => AudioEngine;
}

export function useAudioEngineInstance(callbacks: AudioEngineCallbacks = {}): UseAudioEngineInstanceResult {
  const engineRef = useRef<AudioEngine | null>(null);

  /**
   * The callbacks are held in a ref and read through it, so changing them never recreates the engine.
   * Written on every render (not in an effect) so that a callback invoked *during* the same commit —
   * `onStop` firing from a synchronous `stop()` in an effect — already sees the current closure.
   */
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    const engine = new AudioEngine({
      onStep: (info) => callbacksRef.current.onStep?.(info),
      onPlay: () => callbacksRef.current.onPlay?.(),
      onStop: () => callbacksRef.current.onStop?.(),
      onTrackTrigger: (tracks) => callbacksRef.current.onTrackTrigger?.(tracks),
      onDroppedSteps: (count) => callbacksRef.current.onDroppedSteps?.(count),
    });
    engineRef.current = engine;

    return () => {
      // Stop before destroying: `destroy()` tears down the graph, and a still-running transport would
      // otherwise be relying on the teardown to silence it — which leaks a scheduled tail on some
      // browsers when the context is closed mid-note.
      engine.stop();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  /**
   * Re-published every render so that a caller which reads `engineRef.current` imperatively always
   * has the instance, and so a test can assert the engine exists without reaching into React state.
   */
  const getEngine = () => {
    const engine = engineRef.current;
    if (!engine) {
      throw new Error(
        "useAudioEngineInstance: the engine is not available yet (read it inside an effect or after mount)"
      );
    }
    return engine;
  };

  return { engineRef, getEngine };
}
