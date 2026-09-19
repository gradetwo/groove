/**
 * "Start playing as soon as the studio is up."
 *
 * The new-user guide used to be seven slides of feature list with its only action on the last one, so
 * a first-time visitor read seven screens before hearing anything (U2). Its first slide now offers a
 * single action — hear the current genre — which hands the studio a request it cannot honour at that
 * instant: the view is being mounted, and the engine instance is created by an effect inside it.
 *
 * So the request is a *consumed once* flag rather than a direct call: this hook waits for the engine
 * ref to hold something, fires the play once, and reports that it consumed the request so the host
 * can clear it. Everything about it is deliberately narrow — it does not own a pattern, a transport
 * or any audio state, which is what lets a phone surface or a lesson reuse it.
 *
 * `ready` is a **dependency**, not a ref read: the engine is created in a mount effect, and an effect
 * that reads `engineRef.current` looks like it waits and in fact fires against `null` and then never
 * runs again (no re-render is guaranteed). `useAudioEngineLifecycle` exposes `engineReady` for
 * exactly this, so the request is honoured on the render that follows the engine's creation.
 */
import { useEffect, useRef } from "react";

export interface UseInitialAutoPlayOptions {
  /** True while the host is holding an unconsumed "play as soon as you can" request. */
  requested: boolean;
  /** Whether the engine instance exists yet — see `useAudioEngineLifecycle`. */
  ready: boolean;
  /** What to run once — the transport's own toggle, so the honest blocked-audio path still applies. */
  play: () => void | Promise<void>;
  /** Clears the host's request. Called exactly once, after `play` has been invoked. */
  onConsumed: () => void;
}

export function useInitialAutoPlay({
  requested,
  ready,
  play,
  onConsumed,
}: UseInitialAutoPlayOptions): void {
  /** Guards "once" across re-renders, including the re-render `play()` itself causes. */
  const consumedRef = useRef(false);

  useEffect(() => {
    if (!requested) {
      // A later request — the user asked again — is a new request, not a spent one.
      consumedRef.current = false;
      return;
    }
    if (consumedRef.current || !ready) return;
    consumedRef.current = true;
    void play();
    onConsumed();
  }, [onConsumed, play, ready, requested]);
}
