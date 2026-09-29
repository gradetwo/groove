/**
 * The first block of the Logic-ward arrangement: a list of tracks that can be added, removed, muted, soloed and folded.
 *
 * **It is thin on purpose.** Everything it does is a pure function that already has criteria — `addTrack`, `removeTrack`, `setTrackFlag`, `setTrackParent`, `setCollapsed` — so this file's only job is to turn
 * clicks into those calls and rows into markup. A component that grows its own rules is where a UI and its model start disagreeing, and a song that is muted on screen but not in the engine is the kind of bug
 * that gets reported against the audio system.
 *
 * The one thing it does add is **indentation for grouped tracks**, computed from `parentId` rather than stored, so a track's visual depth cannot drift from its grouping.
 */
import type { ArrangementV2, TrackKindV2, TrackV2 } from "../../types/arrangementV2";

export interface TrackListV2Props {
  arrangement: ArrangementV2;
  onAddTrack: (kind: TrackKindV2, name: string) => void;
  onRemoveTrack: (trackId: string) => void;
  onToggle: (trackId: string, flag: "muted" | "soloed", value: boolean) => void;
  onToggleCollapse: (trackId: string, collapsed: boolean) => void;
}

/** Depth from `parentId`, so what is drawn and what is grouped are the same fact. */
function depthOf(track: TrackV2, all: readonly TrackV2[], seen = new Set<string>()): number {
  if (!track.parentId || seen.has(track.id)) return 0;
  seen.add(track.id);
  const parent = all.find((candidate) => candidate.id === track.parentId);
  return parent ? 1 + depthOf(parent, all, seen) : 0;
}

const ADDABLE: TrackKindV2[] = ["sampler", "instrument", "drumkit", "fx", "folder"];

export function TrackListV2({ arrangement, onAddTrack, onRemoveTrack, onToggle, onToggleCollapse }: TrackListV2Props) {
  // A folded folder hides its children from the list; folding is a display state and this is the only place it is read.
  const hidden = new Set<string>();
  for (const track of arrangement.tracks) {
    if (track.collapsed && track.kind === "folder") {
      for (const child of arrangement.tracks) if (child.parentId === track.id) hidden.add(child.id);
    }
  }

  return (
    <div data-testid="track-list-v2">
      <div data-testid="track-list-add">
        {ADDABLE.map((kind) => (
          <button key={kind} type="button" onClick={() => onAddTrack(kind, kind)}>
            + {kind}
          </button>
        ))}
      </div>
      <ul>
        {arrangement.tracks
          .filter((track) => !hidden.has(track.id))
          .map((track) => (
            <li key={track.id} data-testid={`track-${track.id}`} data-depth={depthOf(track, arrangement.tracks)}>
              <span>{track.kind === "folder" ? "▸ " : ""}{track.name}</span>
              <button type="button" aria-pressed={Boolean(track.muted)} onClick={() => onToggle(track.id, "muted", !track.muted)}>
                M
              </button>
              <button type="button" aria-pressed={Boolean(track.soloed)} onClick={() => onToggle(track.id, "soloed", !track.soloed)}>
                S
              </button>
              {track.kind === "folder" && (
                <button type="button" aria-expanded={!track.collapsed} onClick={() => onToggleCollapse(track.id, !track.collapsed)}>
                  fold
                </button>
              )}
              <button type="button" onClick={() => onRemoveTrack(track.id)}>
                ×
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}
