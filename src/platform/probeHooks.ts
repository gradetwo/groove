/**
 * The deliberate test hook the audible checks need, and nothing more.
 *
 * B7's claim — "the transport plays the arrangement" — was verified structurally (the console feeds the engine the
 * flattened song, the playhead maps passes) and could not be verified **audibly**, because the engine is created
 * inside the app and nothing exposes it: a probe driving the built app has no analyser to sample. The plan recorded
 * that honestly rather than claiming the check.
 *
 * This is the seam. It exists only when the URL asks for it (`?probe=1`), it exposes exactly what a measurement needs
 * — the engine, a read of the sequencer state, and `commit` — and it is asserted by a test to *not* exist without the
 * flag, because a hook that leaks into normal use is a hook nobody can reason about.
 */
import type { AudioEngine } from "../audio/AudioEngine";
import type { SequencerAction, SequencerState } from "../features/sequencer/useSequencerStore";

export interface GrooveProbeSurface {
  engine: AudioEngine;
  /** The current sequencer state, read at call time (a snapshot would go stale immediately). */
  readState: () => SequencerState;
  /** The store's own commit, so a probe can turn song mode on without clicking a button by its label. */
  commit: (action: SequencerAction, recordHistory?: boolean) => void;
}

/** Whether this page asked to be probed. Split out so the test can pass a search string instead of a window. */
export function probeRequested(search: string): boolean {
  try {
    return new URLSearchParams(search).get("probe") === "1";
  } catch {
    return false;
  }
}

declare global {
  interface Window {
    __grooveProbe?: GrooveProbeSurface;
  }
}

/**
 * Expose the surface when `?probe=1`, and otherwise do nothing at all.
 *
 * Returns whether it installed, so a caller (or a test) can tell the two cases apart without reading the global.
 */
export function installProbeHooks(
  surface: GrooveProbeSurface,
  search: string = typeof window === "undefined" ? "" : window.location.search
): boolean {
  if (typeof window === "undefined" || !probeRequested(search)) return false;
  window.__grooveProbe = surface;
  return true;
}

/** Remove it again — used by the engine's teardown so a destroyed engine is never reachable. */
export function uninstallProbeHooks(): void {
  if (typeof window === "undefined") return;
  delete window.__grooveProbe;
}
