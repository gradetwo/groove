/**
 * Adding, removing and regrouping tracks — the edits a Logic-like interface is made of, as pure functions.
 *
 * **Identities are stable and generated here**, not derived from position. An index-as-id is the classic version of this mistake: deleting the second of five tracks silently renames three others, and every
 * reference to them — an automation lane, a selection, a solo state — follows the wrong track. So ids come from a counter and are never reused within an arrangement.
 *
 * Every function returns a **new arrangement**, because a track list is state that an interface re-renders from; mutating in place is how a UI ends up showing something the model does not say.
 */
import type { ArrangementV2, TakeRegion, TrackKindV2, TrackV2 } from "../types/arrangementV2";

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

/**
 * The rest of what a track header does: mute, solo, rename, and folding a folder.
 *
 * All of them are `map` over the track list, and the reason to write them here rather than inline in a component is the same reason the others are here: they are the states a song can be in, and a song
 * that is soloed in the model but not in the mixer — or folded in one view and not another — is a contradiction nobody can debug from the screen.
 *
 * **Folding is a display state and nothing else.** `setCollapsed` deliberately touches only `collapsed`, and there is a criterion for it, because a fold that silenced its children would be blamed on the
 * audio engine rather than on this function.
 */
export function setTrackFlag(arrangement: ArrangementV2, trackId: string, flag: "muted" | "soloed", value: boolean): ArrangementV2 {
  return { ...arrangement, tracks: arrangement.tracks.map((track) => (track.id === trackId ? { ...track, [flag]: value } : track)) };
}

export function renameTrack(arrangement: ArrangementV2, trackId: string, name: string): ArrangementV2 {
  // An empty name would leave a nameless row that nothing can be said about; the caller's own name is kept instead.
  const trimmed = name.trim();
  if (!trimmed) return arrangement;
  return { ...arrangement, tracks: arrangement.tracks.map((track) => (track.id === trackId ? { ...track, name: trimmed } : track)) };
}

export function setCollapsed(arrangement: ArrangementV2, trackId: string, collapsed: boolean): ArrangementV2 {
  return { ...arrangement, tracks: arrangement.tracks.map((track) => (track.id === trackId ? { ...track, collapsed } : track)) };
}

/**
 * Choosing takes — the whole-track choice and the per-range one the owner described ("recorded several times, and playback is one you chose, or one flattened from several").
 *
 * Both are the same model used at different granularity, and two properties matter more than the writes:
 *
 *   * **a region never overlaps another.** Choosing a take for a range splits any region it crosses rather than layering on top, because `resolveTakeForBar` reads the first match — overlapping regions
 *     would make the audible result depend on array order, which is exactly the kind of invisible coupling that turns "it plays the wrong take" into an unreproducible report;
 *   * **choosing a take that does not exist is refused**, not stored. A `selectedTakeId` naming nothing resolves to `undefined` and would silence the track while looking configured.
 */
export function selectTrackTake(arrangement: ArrangementV2, trackId: string, takeId: string | undefined): ArrangementV2 {
  return {
    ...arrangement,
    tracks: arrangement.tracks.map((track) => {
      if (track.id !== trackId) return track;
      // Refused rather than stored: a selection naming a take that is gone would resolve to nothing and silence the track while appearing configured.
      if (takeId !== undefined && !(track.takes ?? []).some((take) => take.id === takeId)) return track;
      return takeId === undefined ? { ...track, selectedTakeId: undefined } : { ...track, selectedTakeId: takeId };
    }),
  };
}

export function assignTakeToRange(arrangement: ArrangementV2, trackId: string, startBar: number, endBar: number, takeId: string): ArrangementV2 {
  return {
    ...arrangement,
    tracks: arrangement.tracks.map((track) => {
      if (track.id !== trackId) return track;
      if (endBar <= startBar) return track;
      if (!(track.takes ?? []).some((take) => take.id === takeId)) return track;

      // ⭐ Split every region the new one crosses, so regions stay disjoint: an overlap would make the heard take depend on array order.
      const kept: TakeRegion[] = [];
      for (const region of track.takeRegions ?? []) {
        if (region.endBar <= startBar || region.startBar >= endBar) {
          kept.push(region);
          continue;
        }
        if (region.startBar < startBar) kept.push({ ...region, endBar: startBar });
        if (region.endBar > endBar) kept.push({ ...region, startBar: endBar });
      }
      kept.push({ startBar, endBar, takeId });
      // Sorted by start so the stored order matches the musical order, which keeps a saved arrangement readable and a diff meaningful.
      kept.sort((a, b) => a.startBar - b.startBar);
      return { ...track, takeRegions: kept };
    }),
  };
}
