/**
 * The first block of the Logic-ward arrangement: a list of tracks that can be added, removed, muted, soloed and folded.
 *
 * **It is thin on purpose.** Everything it does is a pure function that already has criteria — `addTrack`, `removeTrack`, `setTrackFlag`, `setTrackParent`, `setCollapsed` — so this file's only job is to turn
 * clicks into those calls and rows into markup. A component that grows its own rules is where a UI and its model start disagreeing, and a song that is muted on screen but not in the engine is the kind of bug
 * that gets reported against the audio system.
 *
 * The one thing it does add is **indentation for grouped tracks**, computed from `parentId` rather than stored, so a track's visual depth cannot drift from its grouping.
 */
import { useState } from "react";
import { stepsFromNotes, stepCountFor } from "../../data/noteEvents";
import { InstrumentBrowserV2 } from "./InstrumentBrowserV2";
import { useLanguage } from "../../i18n/LanguageContext";
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
  /**
   * Which bar the step strips show, 0-based. **One bar at a time**, because an eight-bar arrangement is 128 squares: at fourteen pixels each that is a row eighteen hundred pixels wide, which is a scroll bar rather than a grid. The roll is where the whole thing is
   * visible and editable; the strip keeps the job it is good at, which is a pattern at a glance.
   */
  bar?: number;
  /** A track's level in dB and its place in the stereo field, both inline — Logic's track header has both for a reason: they are what a person reaches for while listening. */
  onChangeGain?: (trackId: string, gainDb: number) => void;
  onChangePan?: (trackId: string, pan: number) => void;
}

/**
 * How many squares to draw for a track.
 *
 * Sixteen — one bar of sixteenths — unless the track already has notes past that, in which case the grid grows to hold them rather than hiding them: a note written in bar two must be visible, and a fixed sixteen would drop it silently.
 */

export interface InstrumentChoice {
  assetId: string;
  name: string;
  /**
   * Which library it came from. Kept as well as the category because they answer different questions — "everything from this download" and "every bass I have" — and the library is what a missing category falls back to.
   */
  library?: string;
  /** What kind of instrument it is, declared in the manifest and surfaced by the catalogue. The library browser's left column is built from these. */
  category?: string;
  /** The second level, for a category whose list is still long. The library browser shows it as a third column only when it actually divides the category. */
  subcategory?: string;
}

/** The library a catalogue id belongs to: `entry` for a single-instrument one, `entry:program` for a member of a multi-instrument library. */
/**
 * The instruments grouped for rendering: one entry per library, in the order the caller gave them, or a single unlabelled group when the caller does not say which library each came from. `undefined` as the label is what the renderer uses to
 * decide between `<optgroup>` and a plain list.
 */
export function groupInstruments(
  instruments: readonly InstrumentChoice[]
): Array<[string | undefined, InstrumentChoice[]]> {
  const labelled = instruments.some((instrument) => instrument.library !== undefined);
  if (!labelled) return [[undefined, [...instruments]]];
  const groups = new Map<string, InstrumentChoice[]>();
  for (const instrument of instruments) {
    const library = instrument.library ?? "other";
    if (!groups.has(library)) groups.set(library, []);
    groups.get(library)!.push(instrument);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function libraryOfAsset(assetId: string): string {
  const separator = assetId.indexOf(":");
  return separator === -1 ? assetId : assetId.slice(0, separator);
}

/** Depth from `parentId`, so what is drawn and what is grouped are the same fact. */
function depthOf(track: TrackV2, all: readonly TrackV2[], seen = new Set<string>()): number {
  if (!track.parentId || seen.has(track.id)) return 0;
  seen.add(track.id);
  const parent = all.find((candidate) => candidate.id === track.parentId);
  return parent ? 1 + depthOf(parent, all, seen) : 0;
}

const ADDABLE: TrackKindV2[] = ["sampler", "instrument", "drumkit", "fx", "folder"];

export function TrackListV2({ arrangement, onAddTrack, onRemoveTrack, onToggle, onToggleCollapse, onChangeKind, instruments = [], onChangeInstrument, onToggleStep, bar = 0, onChangeGain, onChangePan }: TrackListV2Props) {
  const { t } = useLanguage();
  // Which row's library panel is open. One at a time: two panels open would make the list jump as each one changes its height.
  const [openLibraryFor, setOpenLibraryFor] = useState<string | undefined>(undefined);
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
          <button key={kind} type="button" className="px-3 py-1 rounded border border-[rgb(var(--d-line))] text-sm text-text" onClick={() => onAddTrack(kind, kind)}>
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
                className="px-2 h-7 rounded text-xs bg-transparent border border-[rgb(var(--d-line))] text-text"
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
              {/*
                **The instrument slot, shared with the new track header.** It is one component because "which
                instrument is on this track" is one value: the chip that reports it and the library behind it were
                duplicated when the grid layout arrived, and two copies of a control is how a header and a list come
                to disagree about what a track plays.
              */}
              {track.kind === "sampler" && onChangeInstrument && instruments.length > 0 && (
                <InstrumentBrowserV2
                  trackId={track.id}
                  trackName={track.name}
                  {...(track.sample?.assetId ? { assetId: track.sample.assetId } : {})}
                  instruments={instruments}
                  onChangeInstrument={onChangeInstrument}
                  open={openLibraryFor === track.id}
                  onOpenChange={(open) => setOpenLibraryFor(open ? track.id : undefined)}
                />
              )}
              {/*
                **Level and pan, in the row.** The owner's reference is Logic's track header, which carries a volume slider and a pan knob beside mute and solo — because a person adjusting a mix is looking at the track, not at a mixer they have to open. The values are
                the model's own: dB with 0 at unity, and pan −1…1.
              */}
              {onChangeGain && (
                <input
                  type="range"
                  min={-60}
                  max={12}
                  step={0.5}
                  value={track.gainDb ?? 0}
                  aria-label={`${track.name} level`}
                  data-testid={`track-gain-${track.id}`}
                  onChange={(event) => onChangeGain(track.id, Number(event.target.value))}
                  className="w-20 accent-[rgb(var(--d-accent))]"
                />
              )}
              {/*
                **The number shows whether or not the slider does.** The callbacks are optional so the list can be rendered as a report of the arrangement rather than as an editor — and a report that hid every level would be reporting the wrong thing.
              */}
              <span data-testid={`track-gain-value-${track.id}`} className="w-12 text-right font-['JetBrains_Mono'] text-[10px] text-text opacity-70">
                {(track.gainDb ?? 0).toFixed(1)} dB
              </span>
              {onChangePan && (
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={track.pan ?? 0}
                  aria-label={`${track.name} pan`}
                  data-testid={`track-pan-${track.id}`}
                  onChange={(event) => onChangePan(track.id, Number(event.target.value))}
                  className="w-16 accent-[rgb(var(--d-accent))]"
                />
              )}
              <button type="button" className={`w-7 h-7 rounded text-xs ${track.muted ? "bg-[rgb(var(--d-accent))] text-[rgb(var(--d-accent-ink))]" : "border border-[rgb(var(--d-line))] text-text"}`} aria-pressed={Boolean(track.muted)} onClick={() => onToggle(track.id, "muted", !track.muted)}>
                M
              </button>
              <button type="button" className={`w-7 h-7 rounded text-xs ${track.soloed ? "bg-[rgb(var(--d-accent))] text-[rgb(var(--d-accent-ink))]" : "border border-[rgb(var(--d-line))] text-text"}`} aria-pressed={Boolean(track.soloed)} onClick={() => onToggle(track.id, "soloed", !track.soloed)}>
                S
              </button>
              {track.kind === "folder" && (
                <button type="button" className="px-2 h-7 rounded text-xs border border-[rgb(var(--d-line))] text-text" aria-expanded={!track.collapsed} onClick={() => onToggleCollapse(track.id, !track.collapsed)}>
                  fold
                </button>
              )}
              {/*
                The track's content, which nothing showed before: a row carried a name, a kind, mute, solo and delete, so a new project was silent in the sense that nothing on screen accounted for what would be heard. Sixteen steps, because that
                is the shape the data holds, each one togglable so the pattern is the person's own rather than a default they cannot see.
              */}
              {onToggleStep && track.kind !== "fx" && track.kind !== "folder" && (
                <div className="flex items-center gap-px" role="group" aria-label={`${track.name} steps`}>
                  {/*
                    **The grid is derived from the notes, not stored beside them.** `stepsFromNotes` is the same conversion the compile uses, so the squares a person sees and the triggers the engine fires cannot disagree — which is exactly what two
                    parallel representations of one performance would eventually do.
                  */}
                  {stepsFromNotes(arrangement.notesByTrack?.[track.id] ?? [], stepCountFor(arrangement.notesByTrack?.[track.id] ?? [], arrangement.bars)).steps
                    // The bar's own sixteen squares, taken from the arrangement-length view so the two cannot disagree about where a note sits.
                    .slice(bar * 16, bar * 16 + 16).map((value, index) => (
                    <button
                      key={index}
                      type="button"
                      aria-label={`${track.name} bar ${bar + 1} step ${index + 1}`}
                      aria-pressed={value > 0}
                      onClick={() => onToggleStep(track.id, index + bar * 16)}
                      className={`w-3.5 h-5 rounded-sm border border-[rgb(var(--d-line))] ${
                        value > 0 ? "bg-[rgb(var(--d-accent))]" : "bg-transparent opacity-40"
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
