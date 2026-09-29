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
  /** ⭐ Changing what a track **is**. The rule for what happens to its type-specific fields lives in `changeTrackKind`, not here. */
  onChangeKind: (trackId: string, kind: TrackKindV2) => void;
  /**
   * The instruments a sampler track can play, from the catalogue the application actually loaded. Empty until that load finishes, and empty on a deployment whose manifest carries none — in which case the row shows no
   * chooser rather than an empty one.
   */
  instruments?: readonly InstrumentChoice[];
  onChangeInstrument?: (trackId: string, assetId: string) => void;
  /**
   * Turn one of a track's own steps on or off. Optional so the list can be rendered as a report of the arrangement, without an editing surface.
   */
  onToggleStep?: (trackId: string, index: number) => void;
}

export interface InstrumentChoice {
  assetId: string;
  name: string;
}

/** Depth from `parentId`, so what is drawn and what is grouped are the same fact. */
function depthOf(track: TrackV2, all: readonly TrackV2[], seen = new Set<string>()): number {
  if (!track.parentId || seen.has(track.id)) return 0;
  seen.add(track.id);
  const parent = all.find((candidate) => candidate.id === track.parentId);
  return parent ? 1 + depthOf(parent, all, seen) : 0;
}

const ADDABLE: TrackKindV2[] = ["sampler", "instrument", "drumkit", "fx", "folder"];

export function TrackListV2({ arrangement, onAddTrack, onRemoveTrack, onToggle, onToggleCollapse, onChangeKind, instruments = [], onChangeInstrument, onToggleStep }: TrackListV2Props) {
  // A folded folder hides its children from the list; folding is a display state and this is the only place it is read.
  const hidden = new Set<string>();
  for (const track of arrangement.tracks) {
    if (track.collapsed && track.kind === "folder") {
      for (const child of arrangement.tracks) if (child.parentId === track.id) hidden.add(child.id);
    }
  }

  return (
    <div data-testid="track-list-v2" className="flex flex-col gap-3 p-4">
      <div data-testid="track-list-add" className="flex flex-wrap gap-2">
        {ADDABLE.map((kind) => (
          <button key={kind} type="button" className="px-3 py-1 rounded border border-[var(--d-border,rgba(255,255,255,0.15))] text-sm text-text" onClick={() => onAddTrack(kind, kind)}>
            + {kind}
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-1">
        {arrangement.tracks
          .filter((track) => !hidden.has(track.id))
          .map((track) => (
            <li key={track.id} data-testid={`track-${track.id}`} data-depth={depthOf(track, arrangement.tracks)} className="flex items-center gap-2 px-2 py-1 rounded bg-[var(--d-surface,rgba(255,255,255,0.04))]" style={{ marginLeft: `${depthOf(track, arrangement.tracks) * 16}px` }}>
              <span className="min-w-32 text-text">{track.kind === "folder" ? "▸ " : ""}{track.name}</span>
              {/* ⭐ The kind is changeable, which the owner asked for: a track's type is a decision, not an identity. The component only reports the choice — what happens to the fields the old kind owned is `changeTrackKind`'s business. */}
              <select
                className="px-2 h-7 rounded text-xs bg-transparent border border-[var(--d-border,rgba(255,255,255,0.15))] text-text"
                aria-label={`${track.name} kind`}
                value={track.kind}
                onChange={(event) => onChangeKind(track.id, event.target.value as TrackKindV2)}
              >
                {ADDABLE.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
              {/*
                A sampler track plays a catalogue asset, so which one is a property of the track rather than a setting of the app. Shown only when the catalogue offers something and the track can sound — an empty chooser
                would be a control that does nothing.
              */}
              {track.kind === "sampler" && onChangeInstrument && instruments.length > 0 && (
                <select
                  className="px-2 h-7 rounded text-xs bg-transparent border border-[var(--d-border,rgba(255,255,255,0.15))] text-text max-w-52"
                  aria-label={`${track.name} instrument`}
                  value={track.sample?.assetId ?? ""}
                  onChange={(event) => onChangeInstrument(track.id, event.target.value)}
                >
                  {instruments.map((instrument) => (
                    <option key={instrument.assetId} value={instrument.assetId}>
                      {instrument.name}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" className={`w-7 h-7 rounded text-xs ${track.muted ? "bg-[var(--d-accent)] text-[var(--d-accent-ink)]" : "border border-[var(--d-border,rgba(255,255,255,0.15))] text-text"}`} aria-pressed={Boolean(track.muted)} onClick={() => onToggle(track.id, "muted", !track.muted)}>
                M
              </button>
              <button type="button" className={`w-7 h-7 rounded text-xs ${track.soloed ? "bg-[var(--d-accent)] text-[var(--d-accent-ink)]" : "border border-[var(--d-border,rgba(255,255,255,0.15))] text-text"}`} aria-pressed={Boolean(track.soloed)} onClick={() => onToggle(track.id, "soloed", !track.soloed)}>
                S
              </button>
              {track.kind === "folder" && (
                <button type="button" className="px-2 h-7 rounded text-xs border border-[var(--d-border,rgba(255,255,255,0.15))] text-text" aria-expanded={!track.collapsed} onClick={() => onToggleCollapse(track.id, !track.collapsed)}>
                  fold
                </button>
              )}
              {/*
                The track's content, which nothing showed before: a row carried a name, a kind, mute, solo and delete, so a new project was silent in the sense that nothing on screen accounted for what would be heard. Sixteen steps, because that
                is the shape the data holds, each one togglable so the pattern is the person's own rather than a default they cannot see.
              */}
              {onToggleStep && track.kind !== "fx" && track.kind !== "folder" && (
                <div className="flex items-center gap-px" role="group" aria-label={`${track.name} steps`}>
                  {(arrangement.notesByTrack?.[track.id] ?? []).map((value, index) => (
                    <button
                      key={index}
                      type="button"
                      aria-label={`${track.name} step ${index + 1}`}
                      aria-pressed={value > 0}
                      onClick={() => onToggleStep(track.id, index)}
                      className={`w-3.5 h-5 rounded-sm border border-[var(--d-border,rgba(255,255,255,0.15))] ${
                        value > 0 ? "bg-[var(--d-accent)]" : "bg-transparent opacity-40"
                      }`}
                    />
                  ))}
                </div>
              )}
              <button type="button" className="w-7 h-7 rounded text-xs text-text opacity-70" onClick={() => onRemoveTrack(track.id)}>
                ×
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}
