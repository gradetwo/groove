/**
 * The takes of one track, with the one that plays at a bar marked — Logic's take list, drawn from criteria that already exist.
 *
 * It computes nothing: `takesInOrder` decides the order and `resolveTakeForBar` decides which is playing, both of which have their own criteria. A selector that re-derived either would be a second answer to a
 * question already answered, which is the shape this workstream has paid for seven times — and here the cost would be a list that disagrees with what is heard.
 *
 * **A missing take is shown as missing rather than hidden.** The bytes of a recording can be gone (the owner chose local-only storage), so a take whose reference the store no longer holds must still appear in the
 * list, marked, because a take that silently vanishes looks like the recording never happened.
 */
import type { TrackV2 } from "../../types/arrangementV2";
import { takesInOrder } from "../../data/takeComp";
import { resolveTakeForBar } from "../../data/takeComp";

export interface TakeSelectorV2Props {
  track: TrackV2;
  /** The bar the transport is on, so the list can mark what would be heard there. */
  bar: number;
  /** References the store still holds; `undefined` means "not asked", and a missing reference is shown as missing. */
  availableReferences?: readonly string[];
  onSelect: (takeId: string) => void;
}

export function TakeSelectorV2({ track, bar, availableReferences, onSelect }: TakeSelectorV2Props) {
  const takes = takesInOrder(track);
  const playing = resolveTakeForBar(track, bar);

  if (takes.length === 0) {
    // An empty list is a fact worth stating: a selector that rendered nothing would look broken rather than empty.
    return <div data-testid="take-selector-v2" className="text-sm text-text opacity-70">No takes recorded on this track yet.</div>;
  }

  return (
    <div data-testid="take-selector-v2" className="flex flex-wrap gap-2">
      {takes.map((take) => {
        const missing = availableReferences !== undefined && !availableReferences.includes(take.id);
        return (
          <button
            key={take.id}
            type="button"
            data-testid={`take-${take.id}`}
            className={`px-3 py-1 rounded border text-sm text-text ${playing?.id === take.id ? "border-[rgb(var(--d-accent))] bg-[rgb(var(--d-accent-soft))]" : "border-[rgb(var(--d-line))]"}`}
            aria-pressed={playing?.id === take.id}
            data-playing={playing?.id === take.id ? "true" : "false"}
            data-missing={missing ? "true" : "false"}
            onClick={() => onSelect(take.id)}
          >
            {take.label ?? take.id} {take.source === "midi" ? "(MIDI)" : "(audio)"} {missing ? "— bytes missing" : ""}
          </button>
        );
      })}
    </div>
  );
}
