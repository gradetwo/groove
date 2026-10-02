/**
 * The v2 arrangement as a **stored project** — the hook the new-project route keeps its work in, and the reads the
 * rest of the app needs to tell an arrangement project from a studio one.
 *
 * The storage itself is `projectDb`'s (one IndexedDB channel, one degradation report — see the long note at the top of
 * that file's arrangement section). What belongs here is everything that is *about this application* rather than about
 * the database:
 *
 * - **the answer the studio's boot restore needs** (`isStudioEditor`), because "is this my record?" is a question
 *   about the edit surface;
 * - **how long a save may lag an edit** (`AUTOSAVE_DEBOUNCE_MS`) and the reason there is a lag at all;
 * - **the rule that a name is written even when the arrangement has not changed** — otherwise a rename would only
 *   reach storage the next time a note moved.
 *
 * ⭐ **What decides whether a save happens, per `docs/OPEN_WORK.md` §28.** Four products were read (Logic Pro, Ableton
 * Live, Studio One, Cubase): every one of them **names a new project through an explicit Save**, and every auto-save
 * or recovery mechanism they have is written *after* that first save — because the thing being saved is a file the
 * user must choose a home for. This application's storage is not a file: IndexedDB is the project folder and `.groove`
 * is the export. So the choice made here is: **the project is named up front, and then saved automatically, including
 * while it is new.** What is deliberately copied from the industry is the naming, not the manual save.
 *
 * ⭐ **Why a debounce rather than a write per keystroke.** The edits that arrive fastest are the ones that matter
 * least: dragging a note across the piano roll produces a `moveTrackNote` per pointer move. Writing each one would put
 * a transaction between the pointer and the paint for no gain, because the *content* is what has to survive, and the
 * content is the same at the end of the drag. `AUTOSAVE_DEBOUNCE_MS` is short enough that a person cannot finish an
 * action and refresh faster than it, and `pagehide` flushes whatever is still pending.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArrangementV2 } from "../../types/arrangementV2";
import type { GrooveProject } from "../../types/project";
import { getLastArrangementProject, isArrangementProjectId, saveArrangementProject } from "../sequencer/projectDb";

/**
 * How long an edit may sit unwritten. **Short, and it is not a save interval**: it exists to collapse the burst of
 * changes one gesture makes, not to schedule saves.
 */
export const AUTOSAVE_DEBOUNCE_MS = 600;

/**
 * ⭐ **The studio must never restore an arrangement into its own surface.**
 *
 * Both kinds of project live in the same IndexedDB database and both point at themselves through the same kind of
 * "active project" key, so the studio's boot restore — which asks only *"is there an active project id?"* — would
 * otherwise be handed an `ArrangementProjectRecord`, read `patterns` off it, find none, and start a studio session
 * with nothing in it. That is precisely the "don't break the studio" constraint: the fix is one question asked before
 * the load, not a change to how the studio loads.
 *
 * It is false for a studio project, for `null`, and for **any id it cannot account for** — a pointer at a project that
 * was removed reads as "not mine", so a stale arrangement pointer cannot blank the studio either.
 */
export function isStudioEditor(id: string | null): boolean {
  return !isArrangementProjectId(id);
}

/**
 * ⭐ **The same guard as a check on records rather than ids**, for the boot restore that already has the project in
 * hand. It reads `patterns.A`, so it is the type-level fact — absent means this is not a `GrooveProject`.
 */
export function isStudioProject(project: GrooveProject | null | undefined): project is GrooveProject {
  return project !== null && project !== undefined && typeof project === "object" && project.patterns !== undefined && project.patterns.A !== undefined;
}

export interface ArrangementProjectState {
  id: string;
  name: string;
  arrangement: ArrangementV2;
}

export interface UseArrangementV2ProjectResult {
  /** The stored project, or `null` when there is none — which is also what makes the route show its chooser. */
  project: ArrangementProjectState | null;
  /** ⭐ True until the stored project has been read, so a page refresh cannot draw a chooser over work that is about to arrive. */
  loading: boolean;
  /**
   * ⭐ **The chooser's Create**: a project exists as soon as it has a name.
   *
   * It writes immediately rather than on the debounce, because there is nothing to wait for — a person who creates a
   * project and closes the tab has still created it — and because this is the one moment the *name* is decided.
   */
  create: (name: string, arrangement: ArrangementV2) => void;
  /**
   * ⭐ **What the arrangement view calls when the arrangement changes**, including its first render.
   *
   * The write is debounced, and there is no separate "save" verb on purpose: a verb would have to be called from
   * somewhere, and "somewhere" is what gets forgotten. One report per change cannot be skipped by a surface that
   * forgot to call it.
   */
  report: (arrangement: ArrangementV2) => void;
  /**
   * ⭐ **A rename is a save even though no note moved**, and it is written immediately rather than on the debounce: the
   * name is what the top bar is showing, and a rename whose write is cancelled by a refresh is the same defect as a
   * name that was never written at all.
   */
  rename: (name: string) => void;
  /** Why a stored project could not be read, when it could not — shown rather than swallowed. */
  loadProblem: string | null;
}

/**
 * The new-project route's project state.
 *
 * It starts by **reading what is stored** — that read is the refresh: `getLastArrangementProject()` returns the
 * arrangement that was last open, or `null` on a first visit, and the route shows its chooser only in the second case.
 *
 * ⚠️ **A refusal is not a crash.** A stored record this build cannot read (a track kind that no longer exists, a field
 * of the wrong type) makes `getLastArrangementProject` throw *naming the field*, and this hook catches it, leaves the
 * project `null`, and reports it. So the route opens its chooser with an explanation instead of either losing the work
 * in silence or drawing an arrangement with no tracks in it.
 */
export function useArrangementV2Project(): UseArrangementV2ProjectResult {
  const [project, setProject] = useState<ArrangementProjectState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  /**
   * ⭐ **The project also lives in a ref, and the writes read the ref.**
   *
   * A debounced write reads its arguments when it *fires*, not when it was scheduled. If it read `project` from the
   * closure it would write what the project was when the note moved — the same arrangement, but possibly the name from
   * before a rename, which is a quieter version of the defect this whole change is about. The ref is updated
   * synchronously by every path that changes the project.
   */
  const projectRef = useRef<ArrangementProjectState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  projectRef.current = project;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await getLastArrangementProject();
        if (cancelled) return;
        if (stored !== null) setProject({ id: stored.id, name: stored.name, arrangement: stored.arrangement });
      } catch (err) {
        if (!cancelled) setLoadProblem(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * ⭐ **One write, and everything that wants the arrangement stored goes through it.** The debounce, `pagehide`, the
   * unmount and a rename would otherwise be four near-copies of "write the current arrangement", and the copies would
   * disagree the first time one of them was corrected.
   *
   * The pointer (`{id, name}` in localStorage) is written by `saveArrangementProject` itself, synchronously, which is
   * what lets the top bar name the project on the frame it is created rather than one transaction later.
   */
  const write = useCallback((target: ArrangementProjectState, fresh = false) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void saveArrangementProject({
      ...(target.id === "" ? {} : { id: target.id }),
      ...(fresh ? { fresh: true } : {}),
      name: target.name,
      arrangement: target.arrangement,
    })
      .then((record) => {
        // The id the store gave it, so the next save updates this project rather than starting another one.
        setProject((current) => (current === null || current.id === record.id ? current : { ...current, id: record.id }));
      })
      .catch((err: unknown) => {
        // Reported rather than swallowed: a save that did not happen must not look like one that did.
        console.warn("[arrangementStore] The arrangement could not be saved:", err);
      });
  }, []);

  const writeRef = useRef(write);
  writeRef.current = write;

  useEffect(() => {
    /**
     * ⭐ A page being hidden is the last moment a write can be started at all; without this, a refresh inside the
     * debounce window would lose the gesture that had just been made. Leaving the route is the same page and the same
     * cheap write, so it flushes too.
     *
     * ⚠️ **Both events, because they are not the same event.** `pagehide` is what a navigation fires; `visibilitychange`
     * → hidden is what a tab switch, a phone lock or a backgrounded browser fires. A listener for one of them is a
     * write that happens on the desktop and not on the device, and the measured case that found this was a real reload
     * in a headless browser, where `pagehide` alone did not fire.
     */
    const flush = () => {
      const current = projectRef.current;
      if (current === null) return;
      writeRef.current(current);
    };
    const onHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, []);

  const create = useCallback(
    (name: string, arrangement: ArrangementV2) => {
      const trimmed = name.trim() || "Untitled Project";
      const created: ArrangementProjectState = { id: "", name: trimmed, arrangement };
      // ⭐ Written through the same path as every other change, and set in state first so the view can render the
      // arrangement in the same commit the click arrives in.
      projectRef.current = created;
      setProject(created);
      // ⭐ `fresh`: a brand-new project takes a new id rather than the pointer's, which is what makes "New" new.
      write(created, true);
    },
    [write]
  );

  const report = useCallback((arrangement: ArrangementV2) => {
    const current = projectRef.current;
    if (current === null) return;
    /**
     * ⭐ **The first report of a project that was loaded has to write its id back over any other pointer**, and the
     * first report of a project created a moment ago has an empty id until its write resolves — which is why the state
     * is only changed when the arrangement is genuinely a different object. `report` is called from an effect on every
     * render, so an unconditional `setProject` here would be a render loop.
     */
    if (current.arrangement === arrangement) return;
    const next: ArrangementProjectState = { ...current, arrangement };
    projectRef.current = next;
    setProject(next);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      writeRef.current(next);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, []);

  const rename = useCallback(
    (name: string) => {
      const current = projectRef.current;
      if (current === null) return;
      const next: ArrangementProjectState = { ...current, name };
      projectRef.current = next;
      setProject(next);
      write(next);
    },
    [write]
  );

  return { project, loading, create, report, rename, loadProblem };
}
