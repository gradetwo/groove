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
 * - **how soon a save follows an edit** (there is no fixed delay any more, and the measurement that removed it);
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
 * ⭐ **Why there is no fixed delay between an edit and its write.** The first version of this hook waited
 * `AUTOSAVE_DEBOUNCE_MS = 600` and relied on `pagehide` to flush whatever was still pending. A real browser measured
 * that claim **false**: `pagehide` and `visibilitychange` both fired and the flush was called, and **no IndexedDB
 * `put` was ever issued** — the flush had to `await openProjectsDb()` (two asynchronous round trips), and a dying
 * document never gets another task. The tempo typed 100 ms before the reload was on neither the screen nor the disk
 * afterwards. Caching the connection and starting the transaction in the caller's own task made the `put` appear, and
 * the transaction still aborted, because Chromium tears in-flight IndexedDB transactions down with the document. The
 * only position that survives is therefore **the write is done before the page can die**, not started as it does.
 *
 * What that costs is bounded rather than scheduled: one write is in flight at a time, and a change arriving while one
 * is in flight replaces the waiting slot instead of queueing another. A drag writes at the speed of IndexedDB commits
 * and its intermediate positions coalesce — which is what the debounce was for — but a single edit is durable as soon
 * as it is made, with no window left for a refresh to outrun.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArrangementV2 } from "../../types/arrangementV2";
import type { GrooveProject } from "../../types/project";
import {
  deleteArrangementProject,
  getAllArrangementProjects,
  getArrangementProject,
  getLastArrangementProject,
  isArrangementProjectId,
  saveArrangementProject,
  setSavedArrangementProject,
} from "../sequencer/projectDb";
import type { ArrangementProjectRecord } from "../sequencer/projectDb";

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

/**
 * ⭐ **The arrangement projects that exist, from the one surface that lists projects at all.**
 *
 * The gap this closes was measured, not guessed: `getAllArrangementProjects` had **zero callers outside its own
 * module**, so an arrangement could be created and then never found again — the Project Hub read the studio's object
 * store and honestly reported "0 saved projects" while an arrangement sat in the store next to it. The list belongs
 * here, beside `isStudioEditor`, because "what projects exist" is a question about this application rather than about
 * the database.
 */
export function listArrangementProjects(): Promise<ArrangementProjectRecord[]> {
  return getAllArrangementProjects();
}

/**
 * ⭐ **One named arrangement project, or `null` when there is none by that id** — the read behind "open *this* project"
 * from the Hub.
 *
 * It is deliberately **not** `getLastArrangementProject`: opening project B while project A is the last one opened is
 * exactly the case the Hub exists for. A refusal is not swallowed — a record this build cannot read throws naming the
 * field, and the route reports it the same way it reports one it could not restore on boot.
 */
export function openArrangementProject(id: string): Promise<ArrangementProjectRecord | null> {
  return getArrangementProject(id);
}

/**
 * **Renames one stored arrangement.** The write goes through `saveArrangementProject` so the record keeps its id,
 * creation time and — the half a naive "write the whole record back" would lose — its place in the same write queue as
 * the route's autosave.
 *
 * ⭐ `repoint: false`, and that is the point: renaming a project in a **list** must not make the studio reopen an
 * arrangement the user never opened. A rename is not an open.
 */
export async function renameArrangementProject(id: string, name: string): Promise<ArrangementProjectRecord> {
  const existing = await getArrangementProject(id);
  if (existing === null) {
    throw new Error(`No arrangement project with id "${id}" is stored`);
  }
  return saveArrangementProject({
    id: existing.id,
    name,
    arrangement: existing.arrangement,
    createdAt: existing.createdAt,
    repoint: false,
  });
}

/** **Removes one stored arrangement** — the pointer included, when it was the one that named it. */
export function removeArrangementProject(id: string): Promise<void> {
  return deleteArrangementProject(id);
}

export interface UseArrangementV2ProjectResult {
  /** The stored project, or `null` when there is none — which is also what makes the route show its chooser. */
  project: ArrangementProjectState | null;
  /** ⭐ True until the stored project has been read, so a page refresh cannot draw a chooser over work that is about to arrive. */
  loading: boolean;
  /**
   * ⭐ **The chooser's Create**: a project exists as soon as it has a name.
   *
   * It writes immediately, because there is nothing to wait for — a person who creates a project and closes the tab
   * has still created it — and because this is the one moment the *name* is decided.
   */
  create: (name: string, arrangement: ArrangementV2) => void;
  /**
   * ⭐ **What the arrangement view calls when the arrangement changes**, including its first render.
   *
   * The write starts as the report arrives — there is no delay left to outrun — and there is no separate "save" verb
   * on purpose: a verb would have to be called from somewhere, and "somewhere" is what gets forgotten. One report per
   * change cannot be skipped by a surface that forgot to call it.
   */
  report: (arrangement: ArrangementV2) => void;
  /**
   * ⭐ **A rename is a save even though no note moved**, and it goes through the same immediate write as an edit: the
   * name is what the top bar is showing, and a rename whose write is cancelled by a refresh is the same defect as a
   * name that was never written at all.
   */
  rename: (name: string) => void;
  /** Why a stored project could not be read, when it could not — shown rather than swallowed. */
  loadProblem: string | null;
}

/**
 * **Which stored project the route should open.**
 *
 * ⭐ **Absent means "the last one I had open", and present means "this one, named by the address bar".** Without the
 * second form the Project Hub can list an arrangement and still not be able to open anything but the most recent one —
 * the gap that made a saved arrangement effectively unfindable.
 */
export interface UseArrangementV2ProjectOptions {
  /** The id from the route (`/new?project=<id>`), or `undefined` for the usual "reopen what I had". */
  projectId?: string;
  /**
   * ⭐ **Whether to move the "last open" pointer when the named project is read.**
   *
   * True for the route — arriving at `/new?project=<id>` *is* opening it, and the top bar must name it on the next
   * refresh too. It exists as an option rather than always-on because the Hub renders a list of arrangements, and a
   * list must not re-point the app at a row it merely drew. `saveArrangementProject` writes the pointer synchronously,
   * which is why the caller that wants it asks for it explicitly.
   */
  repoint?: boolean;
}

/**
 * The new-project route's project state.
 *
 * It starts by **reading what is stored** — that read is the refresh: with no project id it is
 * `getLastArrangementProject()` (the arrangement that was last open), and with one it is that exact project. `null`
 * means there is nothing to draw, and the route shows its chooser.
 *
 * ⚠️ **A refusal is not a crash.** A stored record this build cannot read (a track kind that no longer exists, a field
 * of the wrong type) makes the read throw *naming the field*, and this hook catches it, leaves the project `null`, and
 * reports it. So the route opens its chooser with an explanation instead of either losing the work in silence or
 * drawing an arrangement with no tracks in it.
 */
export function useArrangementV2Project(options: UseArrangementV2ProjectOptions = {}): UseArrangementV2ProjectResult {
  const { projectId, repoint = true } = options;
  const [project, setProject] = useState<ArrangementProjectState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  /**
   * ⭐ **The project also lives in a ref, and the writes read the ref.**
   *
   * A write that is waiting behind another one reads its arguments when that one settles, not when the change was
   * made. If it read `project` from the closure it would write what the project was when the note moved — the same
   * arrangement, but possibly the name from before a rename, which is a quieter version of the defect this whole
   * change is about. The ref is updated synchronously by every path that changes the project.
   */
  const projectRef = useRef<ArrangementProjectState | null>(null);
  /** True while a write is on its way to storage; a change arriving then replaces `queuedWriteRef` instead. */
  const writeInFlightRef = useRef(false);
  /** The one change waiting for the in-flight write to settle — the newest, so the intermediate ones coalesce. */
  const queuedWriteRef = useRef<ArrangementProjectState | null>(null);

  projectRef.current = project;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        /**
         * ⭐ **Two reads, one shape.** The route without an id reopens what was last open (unchanged, including its
         * preference for the pointer); the route *with* an id reads that exact project, because a named project is a
         * decision the address bar already made.
         */
        const stored = projectId === undefined ? await getLastArrangementProject() : await openArrangementProject(projectId);
        if (cancelled) return;
        if (stored !== null) {
          setProject({ id: stored.id, name: stored.name, arrangement: stored.arrangement });
          /**
           * ⭐ Arriving at a named project **is** opening it: the pointer is moved here rather than at boot, so a
           * refresh and the top bar both follow the project the user actually opened. Only the pointer is written —
           * the record is already stored, and rewriting a whole arrangement to say "this is the open one" would put a
           * quota-checked write on the path that merely opens a project.
           */
          if (projectId !== undefined && repoint) {
            setSavedArrangementProject({ id: stored.id, name: stored.name });
          }
        }
      } catch (err) {
        if (!cancelled) setLoadProblem(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, repoint]);

  /**
   * ⭐ **One write, and everything that wants the arrangement stored goes through it.** `pagehide`, the unmount, a
   * rename and every edit would otherwise be four near-copies of "write the current arrangement", and the copies would
   * disagree the first time one of them was corrected.
   *
   * ⭐ **It starts now, and there is no timer.** The delay this function used to schedule is the defect this file's
   * header records: a page can be gone before a timer fires, and an IndexedDB transaction merely *started* as the
   * document dies is aborted with it (measured — the earlier attempt issued the `put` and still lost it). What keeps
   * an immediate write from becoming one transaction per pointer move is the one-slot queue: while a write is in
   * flight, a newer change replaces the waiting slot rather than adding to it, and the slot is written when the
   * in-flight write settles. A drag therefore coalesces exactly as the debounce made it, but the newest value is never
   * *scheduled* — it is only ever waiting on a write that has already begun.
   *
   * The pointer (`{id, name}` in localStorage) is written by `saveArrangementProject` itself, synchronously, which is
   * what lets the top bar name the project on the frame it is created rather than one transaction later.
   */
  const write = useCallback((target: ArrangementProjectState, fresh = false) => {
    const start = (state: ArrangementProjectState, isFresh: boolean) => {
      writeInFlightRef.current = true;
      void saveArrangementProject({
        ...(state.id === "" ? {} : { id: state.id }),
        ...(isFresh ? { fresh: true } : {}),
        name: state.name,
        arrangement: state.arrangement,
      })
        .then((record) => {
          // The id the store gave it, so the next save updates this project rather than starting another one.
          setProject((current) => (current === null || current.id === record.id ? current : { ...current, id: record.id }));
        })
        .catch((err: unknown) => {
          // Reported rather than swallowed: a save that did not happen must not look like one that did.
          console.warn("[arrangementStore] The arrangement could not be saved:", err);
        })
        .finally(() => {
          writeInFlightRef.current = false;
          const queued = queuedWriteRef.current;
          queuedWriteRef.current = null;
          /**
           * ⭐ **A queued write reads the project as it is now, not as it was when the change was made.** A write that
           * closed over the value it was queued with can store the older arrangement when two changes arrive inside
           * one commit — the same class of defect the write queue in `projectDb` records, and the one a real browser
           * run measured as "two added tracks on screen, one track in storage". Reading the newest value here makes
           * the last write the newest by construction.
           */
          const latest = projectRef.current;
          if (queued !== null && latest !== null) start(latest, false);
        });
    };
    if (writeInFlightRef.current) {
      queuedWriteRef.current = target;
      return;
    }
    start(target, fresh);
  }, []);

  const writeRef = useRef(write);
  writeRef.current = write;

  useEffect(() => {
    /**
     * ⭐ **The last chance to hand over a change that has not been written yet — a net, not the mechanism.**
     *
     * The write-through above puts every edit on its way at the moment it is made. This exists for the change still
     * waiting behind an in-flight write when the page goes away, and for the surface that unmounts without the page
     * (leaving the route), where the same cheap write is also correct.
     *
     * ⚠️ **It cannot be relied on, and the measurement says so.** `pagehide` fires and the flush runs, and a write
     * issued only here is aborted with the document if it had not been made earlier — which is exactly why the write
     * is no longer scheduled. Both events are listened for because they are not the same event: `pagehide` is a
     * navigation, and `visibilitychange` → hidden is a tab switch, a phone lock or a backgrounded browser.
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
      /**
       * ⭐ **The name goes into the arrangement, not only beside it** (third evaluation, F09).
       *
       * The project's name lived in this state and nowhere else: the evaluation named a project "潮汐与星尘 · Web 五分钟",
       * exported the `.groove`, imported it through MCP and exported again — every note and bar matched, and the title was
       * gone, because a package carries the arrangement and the arrangement said nothing about what it was called. Stamping
       * it here means one write, and every reader of the arrangement (the package, the MCP surface, the default audio
       * filename) has it.
       */
      const created: ArrangementProjectState = { id: "", name: trimmed, arrangement: { ...arrangement, name: trimmed } };
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
    /**
     * ⭐ **The write is asked for in this task, not scheduled for a later one.** `write` reads the newest project when
     * it starts and holds a burst to one write in flight, so "no timer" costs a coalesced write rather than one
     * transaction per move — and there is no window left in which a refresh can beat the write.
     */
    writeRef.current(next);
  }, []);

  const rename = useCallback(
    (name: string) => {
      const current = projectRef.current;
      if (current === null) return;
      const next: ArrangementProjectState = { ...current, name, arrangement: { ...current.arrangement, name } };
      projectRef.current = next;
      setProject(next);
      write(next);
    },
    [write]
  );

  return { project, loading, create, report, rename, loadProblem };
}
