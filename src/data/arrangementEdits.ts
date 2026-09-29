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

/**
 * A new arrangement **with one track of the chosen kind** — because an empty list is a question and one track is a place to start.
 *
 * The owner asked for a new-project entry where a template may be chosen *or* blank, and even blank has a default track typed by that choice. The reason is concrete: the record button needs a track to point
 * at, and an empty list has none.
 */
export function createArrangement(songId: string, kind: TrackKindV2 = "instrument"): ArrangementV2 {
  return { songId, tracks: [{ id: freshId(kind), kind, name: DEFAULT_NAME[kind] }], sourceSlots: [] };
}

const DEFAULT_NAME: Record<TrackKindV2, string> = {
  drumkit: "Drums",
  instrument: "Instrument",
  sampler: "Sampler",
  fx: "FX",
  folder: "Folder",
};

/** The few common combinations, deliberately few: **a template list long enough to need choosing is the same as no templates.** */
export interface Template {
  id: string;
  name: string;
  kinds: Array<{ kind: TrackKindV2; name: string }>;
}

export const TEMPLATES: readonly Template[] = [
  { id: "drums-bass", name: "Drums + Bass", kinds: [{ kind: "drumkit", name: "Drums" }, { kind: "instrument", name: "Bass" }] },
  { id: "drums-bass-chords", name: "Drums + Bass + Chords", kinds: [{ kind: "drumkit", name: "Drums" }, { kind: "instrument", name: "Bass" }, { kind: "instrument", name: "Chords" }] },
  // ⭐ The template that can be heard: sampler tracks are the kind the whole real-instrument path exists for.
  { id: "samplers", name: "Samplers", kinds: [{ kind: "sampler", name: "Sampler 1" }, { kind: "sampler", name: "Sampler 2" }] },
];

/** An arrangement from a template — **never empty**: every template has at least one track, and so does the blank case. */
export function createArrangementFromTemplate(songId: string, templateId: string | undefined, blankKind: TrackKindV2 = "instrument"): ArrangementV2 {
  const template = TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!template) return createArrangement(songId, blankKind);
  return { songId, tracks: template.kinds.map(({ kind, name }) => ({ id: freshId(kind), kind, name })), sourceSlots: [] };
}

/**
 * Changing what a track **is** — which the owner asked for — and therefore deciding what happens to the fields that only made sense for the old kind.
 *
 * The rule is one sentence: **drop what belongs to the route or the sound source, keep what is content.** A `sample` describes which sample this track plays, which means nothing to a synth, so it must not
 * survive — a track carrying both would be the "shape permits it, semantics do not" state the model's criteria already guard against. But `takes` are **content, not identity** (the owner's own earlier
 * correction), so changing what a track is does not un-record what was played onto it, and the take choices travel with them.
 */
export function changeTrackKind(arrangement: ArrangementV2, trackId: string, kind: TrackKindV2): ArrangementV2 {
  return {
    ...arrangement,
    tracks: arrangement.tracks.map((track) => {
      if (track.id !== trackId) return track;
      const { sample: _dropped, ...rest } = track;
      return { ...rest, kind, ...(kind === "sampler" && track.sample ? { sample: track.sample } : {}) };
    }),
  };
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
