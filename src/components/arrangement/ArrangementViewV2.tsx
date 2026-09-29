/**
 * The three blocks together, over one arrangement — the step where "the components exist" becomes "someone could use this".
 *
 * **It owns no rules.** Adding, removing, muting, folding, choosing takes and capturing are all pure functions with their own criteria; this file holds the arrangement value and calls them, so the interface cannot
 * drift from the model. That is the same discipline as each block, applied one level up: the only thing that lives here is *which* arrangement is on screen.
 *
 * Audio is deliberately **not** wired here yet. Playing a v2 arrangement means compiling it into the lanes the engine takes — `compileArrangementToSongInput` — and that step deserves its own criterion rather
 * than being smuggled in with the layout.
 */
import { useCallback, useMemo, useState } from "react";
import type { ArrangementV2, TrackKindV2 } from "../../types/arrangementV2";
import { addTrack, changeTrackKind, createArrangement, removeTrack, setCollapsed, setTrackFlag, selectTrackTake } from "../../data/arrangementEdits";
import type { CaptureOutcome } from "../../audio/captureTake";
import { TrackListV2 } from "./TrackListV2";
import { TakeSelectorV2 } from "./TakeSelectorV2";
import { RecordButtonV2 } from "./RecordButtonV2";

export interface ArrangementViewV2Props {
  songId: string;
  /** Starting a capture, injected so the view needs no microphone to be rendered — the same seam the capture itself uses. */
  capture: () => Promise<CaptureOutcome>;
  /** The bar the transport is on; the take selector marks what would be heard there. */
  bar?: number;
}

export function ArrangementViewV2({ songId, capture, bar = 0 }: ArrangementViewV2Props) {
  const [arrangement, setArrangement] = useState<ArrangementV2>(() => createArrangement(songId));
  const [selectedTrackId, setSelectedTrackId] = useState<string | undefined>(undefined);

  const onAddTrack = useCallback((kind: TrackKindV2, name: string) => {
    setArrangement((current) => {
      const next = addTrack(current, kind, name);
      // The new track becomes the selected one: a track you just created is the track you meant to act on.
      setSelectedTrackId(next.tracks[next.tracks.length - 1]?.id);
      return next;
    });
  }, []);

  const selected = useMemo(() => arrangement.tracks.find((track) => track.id === selectedTrackId), [arrangement, selectedTrackId]);

  return (
    <div data-testid="arrangement-view-v2">
      <TrackListV2
        arrangement={arrangement}
        onAddTrack={onAddTrack}
        onRemoveTrack={(trackId) => {
          setArrangement((current) => removeTrack(current, trackId));
          // A removed track must not stay selected: the take selector would then describe something that is gone.
          setSelectedTrackId((current) => (current === trackId ? undefined : current));
        }}
        onToggle={(trackId, flag, value) => setArrangement((current) => setTrackFlag(current, trackId, flag, value))}
        onToggleCollapse={(trackId, collapsed) => setArrangement((current) => setCollapsed(current, trackId, collapsed))}
        onChangeKind={(trackId, kind) => setArrangement((current) => changeTrackKind(current, trackId, kind))}
      />

      <div data-testid="arrangement-detail">
        {selected === undefined ? (
          // Said rather than left blank, so an empty panel reads as "nothing selected" instead of "something is broken".
          <p>Select a track to see its takes.</p>
        ) : (
          <>
            <RecordButtonV2 capture={capture} />
            <TakeSelectorV2 track={selected} bar={bar} onSelect={(takeId) => setArrangement((current) => selectTrackTake(current, selected.id, takeId))} />
          </>
        )}
      </div>

      {/* Selecting a track is by clicking its row's name; kept as a button so a keyboard can do it too. */}
      <ul data-testid="arrangement-track-picker">
        {arrangement.tracks.map((track) => (
          <li key={track.id}>
            <button type="button" onClick={() => setSelectedTrackId(track.id)} aria-pressed={track.id === selectedTrackId}>
              {track.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
