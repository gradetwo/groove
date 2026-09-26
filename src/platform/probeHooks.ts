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
  /**
   * The current sequencer state, read at call time (a snapshot would go stale immediately).
   *
   * Optional because the **phone shell** has no sequencer store: it builds its own audition engine and installs this seam
   * for the resource probes, which need the engine and nothing else. A probe that needs the state checks for these first.
   */
  readState?: () => SequencerState;
  /** The store's own commit, so a probe can turn song mode on without clicking a button by its label. */
  commit?: (action: SequencerAction, recordHistory?: boolean) => void;
  /**
   * Start (or stop) one genre's audition, by id — the phone shell's own path.
   *
   * The audition soak needs to switch genres a few dozen times, and driving that through the DOM turned out to be three
   * rounds of finding the right button on the right screen. This is the same call the row button makes, so the resource
   * behaviour under test is identical and the probe stops depending on markup.
   */
  auditionById?: (genreId: string) => Promise<void> | void;
}

/** Whether this page asked to be probed. Split out so the test can pass a search string instead of a window. */
export function probeRequested(search: string): boolean {
  try {
    return new URLSearchParams(search).get("probe") === "1";
  } catch {
    return false;
  }
}

/**
 * What the page asked for **at load**, remembered.
 *
 * A shell that navigates rewrites the query string — the phone's own routing took `?probe=1` to `/m/home` and then to
 * `/m/home?genre=…` — so by the time an engine exists and calls `installProbeHooks`, the flag that asked for the seam is
 * gone. The page *did* ask, though, and that fact does not change, so it is recorded once at module load and used from then
 * on. `installProbeHooks` keeps its explicit-`search` parameter for tests.
 */
/**
 * Read **lazily**, and only once.
 *
 * The first version captured this at module load, which is exactly the wrong moment: every module in the entry graph is
 * evaluated **before** the body of `main.tsx` runs, so the launch search it records was still undefined and the flag came out
 * false. The CI voice sweep caught it — `page.waitForFunction(() => Boolean(window.__grooveProbe))` timed out on
 * `?tab=studio&probe=1`, because the seam that answers that question was never installed.
 *
 * Read on first *use* instead, which is after the app has started: by then `main.tsx` has recorded the launch search, and
 * before any navigation it still matches `location.search`. Memoised so a later navigation cannot change the answer.
 */
let requestedAtLoad: boolean | null = null;

function requestedAtLoadNow(): boolean {
  if (requestedAtLoad !== null) return requestedAtLoad;
  if (typeof window === "undefined") return false;
  requestedAtLoad = probeRequested(
    (window as unknown as { __grooveLaunchSearch?: string }).__grooveLaunchSearch ?? window.location.search
  );
  return requestedAtLoad;
}

/**
 * Whether this page asked for the **event capture** (`?capture=1`).
 *
 * A URL flag rather than a global the tool sets afterwards: this app already answers `?probe=1` and `?diag=1` from
 * `location.search`, and a probe that has to reach into the page to set a flag first has silently failed three times in this
 * work (the flag never arrived and every reading of it was `undefined`). `location.search` cannot fail to arrive.
 */
export function captureRequested(search: string): boolean {
  try {
    return new URLSearchParams(search).get("capture") === "1";
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
  search: string | undefined = undefined
): boolean {
  if (typeof window === "undefined") return false;
  // No explicit search means "did this page ask to be probed", which is a property of the load, not of the current URL.
  if (search === undefined ? !requestedAtLoadNow() : !probeRequested(search)) return false;
  /**
   * **Merge** rather than replace, because more than one shell can install this.
   *
   * The desktop studio installs the seam with its engine and the phone shell installs it with its own; whichever runs second
   * used to overwrite the first, which is how a surface that had `auditionById` ended up without it (the soak's first run
   * against the seam reported exactly that). A probe asking for `engine` and a probe asking for `auditionById` are not in
   * conflict.
   */
  window.__grooveProbe = { ...(window.__grooveProbe ?? {}), ...surface } as GrooveProbeSurface;
  return true;
}

/** Remove it again — used by the engine's teardown so a destroyed engine is never reachable. */
export function uninstallProbeHooks(): void {
  if (typeof window === "undefined") return;
  delete window.__grooveProbe;
}
