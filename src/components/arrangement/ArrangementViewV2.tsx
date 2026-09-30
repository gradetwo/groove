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
import { addTake, addTrack, changeTrackKind, setTrackGain, setTrackPan, setTrackSample, toggleStep, createArrangementFromTemplate, removeTrack, setCollapsed, setTrackFlag, selectTrackTake } from "../../data/arrangementEdits";
import type { CaptureOutcome } from "../../audio/captureTake";
import { TrackListV2, type InstrumentChoice } from "./TrackListV2";
import { TakeSelectorV2 } from "./TakeSelectorV2";
import { RecordButtonV2 } from "./RecordButtonV2";
import { ArrangementKeyboardV2 } from "./ArrangementKeyboardV2";
import { useLanguage } from "../../i18n/LanguageContext";
import { NewProjectPanelV2 } from "./NewProjectPanelV2";
import { playArrangementV2, type ArrangementPlayer } from "../../audio/playArrangementV2";

export interface ArrangementViewV2Props {
  songId: string;
  /** Starting a capture, injected so the view needs no microphone to be rendered — the same seam the capture itself uses. */
  capture: () => Promise<CaptureOutcome>;
  /** The bar the transport is on; the take selector marks what would be heard there. */
  bar?: number;
  /**
   * ⭐ The engine, injected — `playAudioLanes` with the app's context and destination in the application, a fake in a criterion.
   *
   * Optional on purpose: the view can be rendered and judged **before** the engine is wired, so the interface work and the audio wiring are not one indivisible change. When it is absent the play button says so
   * rather than pretending to play.
   */
  player?: ArrangementPlayer;
  /**
   * The instruments a sampler track may play, injected like `player` and `capture` — the view needs no catalogue to be rendered or judged, and the application decides where the list comes from.
   */
  instruments?: readonly InstrumentChoice[];
}

export function ArrangementViewV2({ songId, capture, bar = 0, player, instruments }: ArrangementViewV2Props) {
  const { t } = useLanguage();
  /**
   * ⭐ **A new project starts by choosing what it is** — which is Logic's `Choose a Project`, and the owner's "there is no good new-project entry". `undefined` means the choice has not been made, and the panel is
   * what the route shows until it is; only then is there an arrangement to edit.
   */
  /**
   * ⭐ **`choosing`, not an optional arrangement** — and the difference is not stylistic. An `ArrangementV2 | undefined` cannot be narrowed inside the hooks, so every callback would need a guard whose absence is a
   * runtime bug rather than a type error. A separate flag keeps the arrangement always valid, so "no arrangement yet" is a thing the component *says* rather than a thing it must remember to check.
   */
  const [choosing, setChoosing] = useState(true);
  const [arrangement, setArrangement] = useState<ArrangementV2>(() => createArrangementFromTemplate(songId, undefined, "instrument"));
  const [selectedTrackId, setSelectedTrackId] = useState<string | undefined>(undefined);
  /** What the last play reported — **zero is shown, not hidden**: "nothing was planned" is a fact a user should see rather than a silent no-op. */
  const [played, setPlayed] = useState<number | undefined>(undefined);

  const onAddTrack = useCallback((kind: TrackKindV2, name: string) => {
    setArrangement((current) => {
      const next = addTrack(current, kind, name);
      // The new track becomes the selected one: a track you just created is the track you meant to act on.
      setSelectedTrackId(next.tracks[next.tracks.length - 1]?.id);
      return next;
    });
  }, []);

  const selected = useMemo(() => arrangement.tracks.find((track) => track.id === selectedTrackId), [arrangement, selectedTrackId]);

  // ⭐ The early return sits **after every hook**, because a conditional hook changes their order: the first version of this had it above `useCallback` and produced six type errors, whose real content was a React bug.
  if (choosing) {
    return (
      <NewProjectPanelV2
        onCreate={(templateId, blankKind) => {
          // ⭐ The panel reports the choice; **what an arrangement is made of** is `createArrangementFromTemplate`'s business, including the default track a blank project still gets.
          setArrangement(createArrangementFromTemplate(songId, templateId, blankKind));
          setSelectedTrackId(undefined);
          setChoosing(false);
        }}
      />
    );
  }

  return (
    <div data-testid="arrangement-view-v2" className="flex flex-col gap-4 p-4 text-text">
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
        instruments={instruments}
        onChangeInstrument={(trackId, assetId) => setArrangement((current) => setTrackSample(current, trackId, assetId))}
        onToggleStep={(trackId, index) => setArrangement((current) => toggleStep(current, trackId, index))}
        onChangeGain={(trackId, gainDb) => setArrangement((current) => setTrackGain(current, trackId, gainDb))}
        onChangePan={(trackId, pan) => setArrangement((current) => setTrackPan(current, trackId, pan))}
      />

      <div data-testid="arrangement-transport" className="flex items-center gap-2">
        <button
          type="button"
          disabled={player === undefined}
          onClick={async () => {
            if (player === undefined) return;
            // ⭐ The compiled arrangement, with the notes a v1 pattern would carry — an empty map means "a track with nothing on it", which is silence rather than an error.
            // ⭐ The arrangement's own notes, not an empty map: they are content and they live with the tracks.
            const result = await playArrangementV2(arrangement, arrangement.notesByTrack ?? {}, player);
            setPlayed(result.planned);
          }}
        >
          Play
        </button>
        {/* ⭐ Said rather than clicked into nothing: without an engine the button is disabled and this explains why. */}
        {player === undefined && <span> (audio engine not connected yet)</span>}
        {played !== undefined && <span data-testid="arrangement-played"> planned {played} lane event(s)</span>}
      </div>

      <div data-testid="arrangement-detail" className="flex flex-col gap-2 p-3 rounded border border-[var(--d-border,rgba(255,255,255,0.15))] bg-[var(--d-surface,rgba(255,255,255,0.04))]">
        {selected === undefined ? (
          // Said rather than left blank, so an empty panel reads as "nothing selected" instead of "something is broken".
          <p>Select a track to see its takes.</p>
        ) : (
          <>
            <RecordButtonV2 capture={capture} onTake={(planned) => setArrangement((current) => addTake(current, selected.id, planned))} />
            <TakeSelectorV2 track={selected} bar={bar} onSelect={(takeId) => setArrangement((current) => selectTrackTake(current, selected.id, takeId))} />
            {/**
              * **The keyboard, where the instrument is.** A sampler track is the one that plays a real instrument, so it is the one that can be auditioned; a drum or effect track is told why rather than given keys that would do nothing.
              *
              * Pressing a key resolves that instrument's note through the SFZ path and sounds it at the note's rate — the `audition` half of the player, which is what makes a mirrored library testable by hand.
              */}
            {selected.kind === "sampler" && selected.sample ? (
              <ArrangementKeyboardV2
                onNoteOn={(midi, velocity) => {
                  void player?.audition?.({ assetId: selected.sample!.assetId, midi, trackId: selected.id, gainDb: selected.gainDb });
                }}
                onNoteOff={(midi) => {
                  player?.releaseNote?.({ midi, trackId: selected.id });
                }}
              />
            ) : (
              <p className="text-xs text-text opacity-70">{t(selected.kind === "sampler" ? "keyboard_needs_instrument" : "keyboard_needs_sampler")}</p>
            )}
          </>
        )}
      </div>

      {/* Selecting a track is by clicking its row's name; kept as a button so a keyboard can do it too. */}
      <ul data-testid="arrangement-track-picker" className="flex flex-wrap gap-2">
        {arrangement.tracks.map((track) => (
          <li key={track.id}>
            <button type="button" className="px-2 py-1 rounded text-xs border border-[var(--d-border,rgba(255,255,255,0.15))] text-text" onClick={() => setSelectedTrackId(track.id)} aria-pressed={track.id === selectedTrackId}>
              {track.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
