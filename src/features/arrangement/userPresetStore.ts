/**
 * ⭐ **The device's preset library, which no project owns.** (Owner decision, 2026-10-15: device-scoped, and exportable.)
 *
 * It was briefly `ArrangementV2.userPresets`, so a preset travelled inside the `.groove` file that used it. That reads well
 * until somebody works across several projects: a sound they shaped belongs to **them**, not to whichever project happened
 * to be open, and a project-scoped library means shaping it again in the next project. Device scope also matches what the
 * MCP's tools need — `save_gs1_preset` has no project in hand.
 *
 * Export is what carries a preset between people — a `gs1.1.…` share code, the format the synth itself accepts — so
 * device-scoping costs nothing: it only stops a sound from being silently re-made per project.
 *
 * ⚠️ **This is the browser half.** The MCP is a Node process and cannot reach IndexedDB, so it keeps its own file at
 * `~/.groove/user-presets.json`; the two are **two stores on one device**, not one shared store. That is a real limitation
 * and is stated rather than papered over: a preset saved from an agent does not appear in the browser until it is exported
 * and imported, and the same the other way. `docs/OPEN_WORK.md` records it.
 *
 * **All validation and id derivation live in `data/userPresets.ts`**, which is pure and already has criteria. This module
 * does storage and nothing else, so it cannot disagree with the protocol's tools about what a preset is.
 */
import { openProjectsDb, runStoreTx, GROOVE_PRESET_STORE_NAME } from "../../features/sequencer/projectDb";
import type { UserPreset } from "../../data/userPresets";

/** Every preset this device has saved, newest last. A storage failure is reported, never swallowed into an empty list. */
export async function loadUserPresets(): Promise<UserPreset[]> {
  const db = await openProjectsDb();
  const rows = await runStoreTx<UserPreset[]>(db, GROOVE_PRESET_STORE_NAME, "readonly", (store) => store.getAll());
  return rows.slice().sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}

/**
 * Write the whole list, which is how every operation in `data/userPresets.ts` is expressed (save, rename, delete and import
 * each produce a new list). One `put` per row plus the deletions, in a single transaction, so a failure cannot leave the
 * store half-updated — which for a list a person is editing is the difference between "that did not work" and "some of my
 * presets are gone".
 */
export async function writeUserPresets(presets: readonly UserPreset[]): Promise<void> {
  const db = await openProjectsDb();
  await new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(GROOVE_PRESET_STORE_NAME, "readwrite");
    } catch (error) {
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("the preset store transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("the preset store transaction was aborted"));
    const store = tx.objectStore(GROOVE_PRESET_STORE_NAME);
    // ⭐ `clear()` then write, rather than diffing: the list is small, and "the store holds exactly this" is a property a
    // diff is easy to get subtly wrong (a row missed leaves a preset that a person deleted and cannot see why).
    store.clear();
    for (const preset of presets) store.put(preset);
  });
}

/**
 * ⭐ **Read-modify-write against the live store, not against a list captured when the component rendered.**
 *
 * The UI hands the component a snapshot; if two edits overlap (a save while a delete is in flight) writing a snapshot back
 * would silently drop one of them. So each operation re-reads, applies the pure function from `data/userPresets.ts`, and
 * writes — the same shape `mcp/arrangement.ts` uses for arrangement edits, and for the same reason.
 */
export async function updateUserPresets(
  apply: (current: readonly UserPreset[]) => { presets: readonly UserPreset[] } | { problem: string }
): Promise<{ presets: UserPreset[]; problem?: string }> {
  const current = await loadUserPresets();
  const result = apply(current);
  if ("problem" in result) return { presets: current, problem: result.problem };
  await writeUserPresets(result.presets);
  return { presets: [...result.presets] };
}
