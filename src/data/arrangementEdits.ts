/**
 * Adding, removing and regrouping tracks — the edits a Logic-like interface is made of, as pure functions.
 *
 * **Identities are stable and generated here**, not derived from position. An index-as-id is the classic version of this mistake: deleting the second of five tracks silently renames three others, and every
 * reference to them — an automation lane, a selection, a solo state — follows the wrong track. So ids come from a counter and are never reused within an arrangement.
 *
 * Every function returns a **new arrangement**, because a track list is state that an interface re-renders from; mutating in place is how a UI ends up showing something the model does not say.
 */
import type { ArrangementV2, TrackKindV2, TrackV2 } from "../types/arrangementV2";

let nextId = 1;

/** Test/reset seam: ids only have to be unique **within** an arrangement, and a deterministic first id keeps criteria readable. */
export function resetTrackIdsForTests(): void {
  nextId = 1;
}

function freshId(kind: TrackKindV2): string {
  return `${kind}-${nextId++}`;
}

export function createArrangement(songId: string): ArrangementV2 {
  return { songId, tracks: [], sourceSlots: [] };
}

export function addTrack(arrangement: ArrangementV2, kind: TrackKindV2, name: string, extra: Partial<TrackV2> = {}): ArrangementV2 {
  return { ...arrangement, tracks: [...arrangement.tracks, { id: freshId(kind), kind, name, ...extra }] };
}

/**
 * Remove a track **and anything grouped under it**.
 *
 * A folder's children left behind would be orphans: they would still be in the model, still be compiled into lanes, and no longer be reachable from the interface — audible tracks that nothing on screen
 * accounts for.
 */
export function removeTrack(arrangement: ArrangementV2, trackId: string): ArrangementV2 {
  const doomed = new Set([trackId]);
  // Repeated passes, because a folder may contain a folder; the set grows until it stops growing.
  for (let changed = true; changed; ) {
    changed = false;
    for (const track of arrangement.tracks) {
      if (track.parentId && doomed.has(track.parentId) && !doomed.has(track.id)) {
        doomed.add(track.id);
        changed = true;
      }
    }
  }
  return { ...arrangement, tracks: arrangement.tracks.filter((track) => !doomed.has(track.id)) };
}

/** Move a track into a folder, or out of one with `parentId: undefined`. Refuses a folder into itself, which would make the tree unrenderable. */
export function setTrackParent(arrangement: ArrangementV2, trackId: string, parentId: string | undefined): ArrangementV2 {
  if (parentId === trackId) return arrangement;
  return { ...arrangement, tracks: arrangement.tracks.map((track) => (track.id === trackId ? { ...track, parentId } : track)) };
}
