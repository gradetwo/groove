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
import type { SamplerLanePlayback } from "../../../audio/samplerLanePlayback";
import { useRecordedLanes } from "../../../hooks/useRecordedLanes";
import type { SequencerPattern } from "../../../types/genre";

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
  /**
   * ⭐ **Sound this pattern's recorded lanes, and keep them sounding across the transport's wraps.**
   *
   * Call it after `engine.setPattern(pattern)` — the stand-down clears on every pattern change — and after
   * `engine.play()`, because the voices are placed on the engine's clock.
   *
   * ## Why an engine this hook built never made a sound out of an SFZ before
   *
   * A lane whose instrument the palette maps is a **recording**, and two separate things have to happen for it to be
   * heard: `prepareSampledLanes` stands its synthesiser down, and a scheduler places its notes from their own bytes.
   * The studio's transport and the arrangement player each did both; the screens this hook serves — the genre detail
   * page's audition, the custom-genre maker's preview — did **neither**, so a bebop chart with `sax_lead` and
   * `walking_upright` on it played two synthesisers and requested **not one** SFZ or WAV. The owner found it by
   * watching the network panel. Calling only the stand-down would have been worse than the bug: a lane that played the
   * wrong instrument would have played nothing. Hence one call that does both, from one place
   * (`src/audio/samplerLanePlayback.ts`).
   *
   * Returns the controller so a caller can stop it; `sounding` on it is what a criterion reads.
   */
  startRecordedLanes: (pattern: SequencerPattern) => Promise<SamplerLanePlayback | null>;
  /** Silence whatever {@link startRecordedLanes} started, and how many voices that stopped. */
  stopRecordedLanes: () => number;
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
   * ⭐ **The recorded lanes are the shared seam's business, not this hook's.**
   *
   * This hook used to own the catalogue ref, the controller ref and the stand-down call — the same three things
   * `src/hooks/useRecordedLanes.ts` owns, and the same three the genre audition and the custom-genre preview need. It
   * reads its engine through a ref, so it hands the seam a getter and nothing else; the seam is what stops the voices
   * on unmount (`createSamplerLanePlayback` records them, and `useRecordedLanes` stops them by name), so the teardown
   * above only has the engine's own transport left to silence.
   */
  const { startRecordedLanes, stopRecordedLanes } = useRecordedLanes(() => engineRef.current);

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

  return { engineRef, getEngine, startRecordedLanes, stopRecordedLanes };
}
