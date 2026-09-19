/**
 * The onboarding's first slide gets a single action: hear the current genre (U2).
 *
 * The request arrives before the engine instance exists — the studio is being mounted — so the hook
 * waits for `ready`, fires exactly once, and reports consumption. Three things can go wrong and are
 * pinned here:
 *
 *  1. the engine is not ready yet and the effect never runs again, so the request is silently lost.
 *     (Reading `engineRef.current` inside an effect does exactly that: it fires against `null` and
 *     no re-render is guaranteed. Hence the explicit `ready` dependency.)
 *  2. it fires twice, because `play()` changes state and re-renders the host;
 *  3. a *second* request (the user asks again later) is swallowed by the spent flag.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useInitialAutoPlay } from "../features/sequencer/hooks/useInitialAutoPlay";

const REQUESTED = { requested: true } as const;

describe("useInitialAutoPlay", () => {
  it("plays once the engine is ready, and reports that it consumed the request", () => {
    const play = vi.fn();
    const onConsumed = vi.fn();

    renderHook(() => useInitialAutoPlay({ ...REQUESTED, ready: true, play, onConsumed }));

    expect(play).toHaveBeenCalledTimes(1);
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  it("waits for readiness instead of losing the request", () => {
    const play = vi.fn();
    const onConsumed = vi.fn();

    const { rerender } = renderHook(
      ({ ready }: { ready: boolean }) =>
        useInitialAutoPlay({ ...REQUESTED, ready, play, onConsumed }),
      // First render: the engine is still being created, exactly as on a fresh mount.
      { initialProps: { ready: false } }
    );
    expect(play).not.toHaveBeenCalled();

    // The engine's effect sets `engineReady`, which re-renders the host with ready: true.
    rerender({ ready: true });

    expect(play).toHaveBeenCalledTimes(1);
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  it("does not play again when the host re-renders after the request was consumed", () => {
    const play = vi.fn();
    const onConsumed = vi.fn();

    const { rerender } = renderHook(
      ({ tick }: { tick: number }) => {
        // A changing dep stands in for `play()`'s own state update (isPlaying) re-rendering the host.
        void tick;
        return useInitialAutoPlay({ ...REQUESTED, ready: true, play, onConsumed });
      },
      { initialProps: { tick: 0 } }
    );
    rerender({ tick: 1 });
    rerender({ tick: 2 });

    expect(play).toHaveBeenCalledTimes(1);
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  it("does nothing while no request is pending", () => {
    const play = vi.fn();
    const onConsumed = vi.fn();

    renderHook(() => useInitialAutoPlay({ requested: false, ready: true, play, onConsumed }));

    expect(play).not.toHaveBeenCalled();
    expect(onConsumed).not.toHaveBeenCalled();
  });

  it("honours a second request after the first was consumed", () => {
    const play = vi.fn();
    const onConsumed = vi.fn();

    const { rerender } = renderHook(
      ({ requested }: { requested: boolean }) =>
        useInitialAutoPlay({ requested, ready: true, play, onConsumed }),
      { initialProps: { requested: true } }
    );
    expect(play).toHaveBeenCalledTimes(1);

    // The host clears its flag, then the user asks again from the guide.
    rerender({ requested: false });
    rerender({ requested: true });

    expect(play).toHaveBeenCalledTimes(2);
    expect(onConsumed).toHaveBeenCalledTimes(2);
  });
});
