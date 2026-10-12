/**
 * Which take plays at a given bar — the comp, as **one deterministic answer** rather than a rendering decision made somewhere in a view.
 *
 * The owner described Logic's behaviour: record a section several times, then play **one version the user chose**, or a version assembled from several takes. That assembly is only meaningful if the same
 * arrangement always produces the same performance, so it is resolved here, purely, and the precedence is stated rather than implied:
 *
 *   1. **a region covering the bar** — the most specific choice wins, because choosing a take for exactly this section is a stronger statement than choosing one for the track;
 *   2. otherwise the track's **selected take**;
 *   3. otherwise **nothing**, which is a real answer: a track may have takes recorded and none chosen, and a caller has to be able to tell that apart from a take.
 *
 * A region naming a take that no longer exists resolves to the selected take rather than to nothing: a deleted take should degrade to the track's own choice, not silently silence a section.
 */
import type { Take, TrackV2 } from "../types/arrangementV2";

export function resolveTakeForBar(track: Pick<TrackV2, "takes" | "selectedTakeId" | "takeRegions">, bar: number): Take | undefined {
  const takes = track.takes ?? [];
  const byId = (id: string | undefined) => takes.find((take) => take.id === id);

  // ⭐ Most specific first: a region is a statement about this bar, the selection is a statement about the track.
  for (const region of track.takeRegions ?? []) {
    if (bar >= region.startBar && bar < region.endBar) {
      const chosen = byId(region.takeId);
      if (chosen) return chosen;
      break;
    }
  }

  return byId(track.selectedTakeId);
}

/** The takes in recording order — a view should not have to know that `recordedAt` is what orders them. */
export function takesInOrder(track: Pick<TrackV2, "takes">): Take[] {
  return [...(track.takes ?? [])].sort((a, b) => a.recordedAt - b.recordedAt);
}
