/**
 * The lane area: one region per track, with a non-editable miniature of the track's own notes inside it.
 *
 * **The boundary this file exists to hold** is the one `docs/ARRANGEMENT_UI_DESIGN.md` §4 calls the real design
 * question. Every DAW in the survey edits *regions* in the arrangement, not bare notes: Live's manual is explicit
 * that a clip's waveform or MIDI display can be clicked but not dragged — only the clip bar is a handle — and
 * editing happens in the Clip View. The brief adopts that boundary and rejects its opposite (§5: "editing region
 * contents in the lane"), so:
 *
 * - **the region block is the handle** — it takes focus, it is selectable, and it is what a drag or a key press acts on;
 * - **the miniature is not interactive at all.** It is `aria-hidden` and carries no handler: there is no pointer or
 *   keyboard path from a drawn note to a model change, here or anywhere downstream of it. Writing notes is the
 *   piano roll's job, and it already has the whole arrangement to write in.
 *
 * ⭐ **The handle now moves and resizes**, which is the second half of the same sentence in §4 — *"区域条是拖动/选择/
 * 切分的把手，缩略图不是"*. The gesture is **portable, not invented**: the Studio editor's `ArrangementPanel` has had a
 * bar-quantised move/resize drag since B3, and the arithmetic it uses
 * (`Math.round((event.clientX - startX) / pixelsPerBar)`) now lives in `features/arrangement/regionEdit.ts` where both
 * the pointer and the arrow keys call it. What is left here is the DOM: which element was grabbed, pointer capture,
 * and the range in flight while the finger is down.
 *
 * **A gesture is not an edit until it ends.** The range being dragged lives in this component (`preview`) and the
 * model is written **once**, on pointer up, through the caller's `onRegionChange` — because the undo stack underneath
 * (`data/arrangementHistory.ts`) has no coalescing, and a command per pointer move would make one undo step one pixel
 * of one drag.
 *
 * The lane's pixels-per-bar is the **same number** the ruler is laid out with, passed in rather than recomputed:
 * two sources for "how wide is a bar" is exactly how a ruler ends up labelling one place while a region is drawn at
 * another. The drag reads it for the same reason.
 */
import { useRef, useState } from "react";
import { deriveArrangementRegions, regionBars, type ArrangementRegion } from "../../data/arrangementLanes";
import {
  applyRegionCommand,
  dragRegion,
  regionCommandForKey,
  regionStepBars,
  type RegionPart,
} from "../../features/arrangement/regionEdit";
import { useLanguage } from "../../i18n/LanguageContext";
import type { ArrangementV2, TrackRegion } from "../../types/arrangementV2";

/**
 * How wide the right-edge resize handle is, in pixels.
 *
 * 24 px is WCAG 2.5.8's minimum target, and it is the width at which a region is still *moveable*: the handle sits
 * inside the block, so the body keeps everything to its left. Drag the whole block to move, grab this band to change
 * the length — the two gestures the ported editor has, on the edge this surface has room for.
 *
 * The Studio editor stacks a 44 px band under a 56 px body instead, and its comment says why (a one-bar region is one
 * `ARRANGEMENT_BAR_WIDTH` wide, so a 44 px edge handle would leave four pixels of body). That shape needs a
 * hundred-pixel region in a lane of its own; a track row here is 84 px (`--arr-track-h` minus the region's inset), so
 * the stacked bands do not fit and the keyboard alternative below (WCAG 2.5.7) is what carries the narrow case.
 */
const REGION_RESIZE_HANDLE_WIDTH = 24;

export interface ArrangementLaneV2Props {
  arrangement: ArrangementV2;
  /** The zoom, in pixels per bar. Shared with the ruler. */
  pixelsPerBar: number;
  /** Which track's region is the current one, if any. */
  selectedTrackId?: string;
  onSelectTrack?: (trackId: string) => void;
  /**
   * The snap grid, in bars, or `undefined` when snapping is off.
   *
   * Passed in rather than read from the toolbar because the value is the **caller's** decision (the toolbar's snap
   * value and its toggle), and because a lane that read it itself would be a second consumer of state the view owns.
   * `undefined` is not "no grid value" — it is "no grid", which is what the toggle and the bypass modifier both mean.
   */
  snapBars?: number;
  /**
   * A finished gesture, and the only way this component changes anything.
   *
   * **Absent means the region is a report rather than a control** — the handlers are then not attached at all, which is
   * the same rule every other optional callback in this view follows (see `LoopBraceV2`). Called **once per gesture**,
   * only when the range actually changed, so a press that moved nothing is not an edit and does not enter the undo
   * stack.
   */
  onRegionChange?: (trackId: string, before: TrackRegion, after: TrackRegion) => void;
}

function Region({
  region,
  pixelsPerBar,
  arrangementBars,
  snapBars,
  label,
  resizeLabel,
  emptyLabel,
  isCurrent,
  onSelect,
  onRange,
}: {
  region: ArrangementRegion;
  pixelsPerBar: number;
  arrangementBars: number;
  snapBars: number | undefined;
  label: string;
  resizeLabel: string;
  emptyLabel: string;
  isCurrent: boolean;
  onSelect?: () => void;
  onRange?: (before: TrackRegion, after: TrackRegion) => void;
}) {
  /**
   * The range on screen: the model's, or the one the finger is dragging.
   *
   * A ref as well as state because the gesture's end reads the **latest** range, and the state exists because the
   * region has to follow the pointer while it is down. The same split `LoopBraceV2` documents, for the same reason.
   */
  const [preview, setPreview] = useState<TrackRegion | null>(null);
  const gesture = useRef<{ part: RegionPart; startX: number; from: TrackRegion; latest: TrackRegion } | null>(null);
  const shown: TrackRegion = preview ?? { startBar: region.startBar, endBar: region.endBar };
  const bars = shown.endBar - shown.startBar;

  const begin = (part: RegionPart) => (event: React.PointerEvent) => {
    if (onRange === undefined) return;
    // The resize band is inside the block, so the body's gesture must not also start: one press is one intention.
    event.stopPropagation();
    // Select first, the same order `ArrangementPanel.beginDrag` uses: the drag may end outside the region.
    onSelect?.();
    const from: TrackRegion = { startBar: region.startBar, endBar: region.endBar };
    gesture.current = { part, startX: event.clientX, from, latest: from };
    try {
      // Capture keeps the gesture alive when the pointer leaves the block, which is what makes a long drag possible.
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    } catch {
      // A synthetic pointer (a test) has no capture; the gesture still works through the bubbled moves.
    }
  };

  const onDragMove = (event: React.PointerEvent) => {
    const current = gesture.current;
    if (current === null || onRange === undefined) return;
    /**
     * ⭐ **Alt releases this one gesture from the grid**, without touching the toggle: Live's own arrangement modifier
     * (`Alt` bypasses the grid; `Ctrl/Cmd+Alt+Shift` bypasses it for clip contents) and FL's (`Holding the Alt key
     * temporarily sets snap to 'none'`), which `docs/ARRANGEMENT_UI_DESIGN.md` §3 already adopts as "吸附开关 + 绕过键".
     * Read per move rather than latched at the press, so letting go re-snaps what is still being dragged.
     */
    const next = dragRegion(
      current.from,
      current.part,
      event.clientX - current.startX,
      pixelsPerBar,
      event.altKey ? undefined : snapBars,
      arrangementBars
    );
    current.latest = next;
    setPreview(next);
  };

  const endDrag = (event: React.PointerEvent) => {
    const current = gesture.current;
    gesture.current = null;
    setPreview(null);
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    } catch {
      // See `begin`: nothing to release for a synthetic pointer.
    }
    if (current === null || onRange === undefined) return;
    // One call per gesture — and none when the region landed where it started, so a press is not an edit either.
    if (current.latest.startBar === current.from.startBar && current.latest.endBar === current.from.endBar) return;
    onRange(current.from, current.latest);
  };

  const onRegionKeyDown = (event: React.KeyboardEvent) => {
    if (onRange === undefined) return;
    const command = regionCommandForKey(event.key, event.shiftKey);
    // `null` means the key is not ours, and the event is left alone — swallowing Tab or an arrow that scrolls the
    // grid would break the surface around the region.
    if (command === null) return;
    /**
     * ⭐ **The WCAG 2.5.7 alternative, in the one place the pointer also reaches.** §7 makes a non-dragging path
     * mandatory for every drag, and the ported binding is the Studio editor's own `commandForKey`: arrows nudge,
     * Shift+arrows change the length — the same `regionAfter` the drag calls, so the two cannot land apart.
     */
    event.preventDefault();
    const next = applyRegionCommand(shown, command, regionStepBars(snapBars), arrangementBars);
    if (next.startBar === shown.startBar && next.endBar === shown.endBar) return;
    onRange(shown, next);
  };

  return (
    /**
     * ⭐ **The row starts at the lane's left edge, because that edge is bar 0.**
     *
     * The row used to begin with an in-flow `MUTE` button plus `px-2`, which pushed every region 36 px right of the
     * lane's own bar grid — and so right of the ruler above it and of the playhead that crosses it. The header already
     * carries mute (and, on a phone, the M/S/R disclosure), so the lane is the music again; the measurement that
     * caught it is in the ledger and the browser matrix now asserts the alignment.
     */
    <div className="flex items-center" style={{ height: "var(--arr-track-h, 96px)" }}>
      <button
        type="button"
        data-testid={`arrangement-region-${region.trackId}`}
        data-start-bar={shown.startBar}
        data-end-bar={shown.endBar}
        data-bars={bars}
        aria-label={label}
        // `aria-current` rather than `aria-pressed`: the region is one of a set of regions, and which one is current
        // is the same fact the track header shows. A pressed state would make it a toggle, which it is not.
        aria-current={isCurrent ? "true" : undefined}
        onClick={onSelect}
        onPointerDown={begin("move")}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onRegionKeyDown}
        /*
          The region is the handle: focusable for the keyboard, and `relative` so its miniature and gridlines sit
          inside it. `overflow-hidden` is what makes the miniature's clamping read as clamping rather than as a note
          drawn over the next lane. `touch-none` only when the block can actually be dragged: a report must not stop
          the lane from scrolling under a finger.
        */
        className={`relative shrink-0 overflow-hidden rounded border border-[rgb(var(--d-line))] bg-[var(--d-surface,rgba(255,255,255,0.04))] text-left ${
          onRange === undefined ? "" : "cursor-grab touch-none"
        }`}
        /*
          The region fills its lane row rather than carrying a height of its own. The lane row is `--arr-track-h`,
          which is also the header's height — that equality is what keeps headers and lanes in step, and a literal
          here would break it the first time the row height changed.
        */
        style={{ width: bars * pixelsPerBar, height: "calc(var(--arr-track-h, 96px) - 12px)" }}
      >
        {/* Bar boundaries, so the region can be read against the ruler. One node per bar and no more: a gridline
            per sixteenth would be sixteen times the DOM for a line the zoom can already imply. */}
        {Array.from({ length: Math.max(0, Math.ceil(bars) - 1) }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className="absolute top-0 h-full border-l border-[rgb(var(--d-line))]"
            style={{ left: (index + 1) * pixelsPerBar }}
          />
        ))}
        {/* The miniature: drawn above the gridlines, and not reachable by pointer or keyboard. */}
        <span aria-hidden="true" data-testid={`arrangement-miniature-${region.trackId}`} className="pointer-events-none absolute inset-x-0 bottom-0.5 top-0.5">
          {region.miniatures.map((miniature, index) => (
            <span
              key={`${miniature.pitch}-${index}`}
              data-miniature="note"
              data-pitch={miniature.pitch}
              className="absolute top-0 h-full rounded-[1px]"
              style={{
                left: `${miniature.x * 100}%`,
                width: `${Math.max(0.4, miniature.width * 100)}%`,
                background: "rgb(var(--d-accent))",
                opacity: miniature.alpha,
              }}
            />
          ))}
        </span>
        {/* Said in words rather than implied by an empty box: "no notes" is a state, an empty lane is a question. */}
        {region.miniatures.length === 0 && <span className="absolute bottom-0.5 left-1 text-[9px] text-text opacity-60">{emptyLabel}</span>}
        {/*
          The resize handle, on the right edge inside the block — the ported editor's second gesture, on the edge this
          surface has room for (see `REGION_RESIZE_HANDLE_WIDTH`). A `separator` rather than a second button, exactly
          as `ArrangementPanel`'s resize band is: a button inside a button is not a thing the DOM has.

          Its test id is the **Studio editor's own** (`arrangement-resize-<id>`), not `arrangement-region-…`: that
          prefix is the region block's, and every criterion in `arrangementGrid.test.tsx` reads it as "one node per
          track". A second node under that prefix would have quietly changed what those criteria count.
        */}
        <span
          data-testid={`arrangement-resize-${region.trackId}`}
          role="separator"
          aria-label={resizeLabel}
          // A lane with no editing surface announces the handle as disabled, the same way the loop brace's handles do.
          aria-disabled={onRange === undefined ? true : undefined}
          onPointerDown={begin("resize")}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ width: REGION_RESIZE_HANDLE_WIDTH }}
          className={`absolute inset-y-0 right-0 ${onRange === undefined ? "" : "cursor-col-resize touch-none"}`}
        />
      </button>
    </div>
  );
}

export function ArrangementLaneV2({ arrangement, pixelsPerBar, selectedTrackId, onSelectTrack, snapBars, onRegionChange }: ArrangementLaneV2Props) {
  const { t } = useLanguage();
  // Folded folders hide their children's lanes, the same display state `TrackListV2` reads — folding must never
  // change what is heard, and a hidden lane is not a muted track.
  const hidden = new Set<string>();
  for (const track of arrangement.tracks) {
    if (track.collapsed && track.kind === "folder") {
      for (const child of arrangement.tracks) if (child.parentId === track.id) hidden.add(child.id);
    }
  }
  const regions = deriveArrangementRegions(arrangement).filter((region) => !hidden.has(region.trackId));
  const nameOf = new Map(arrangement.tracks.map((track) => [track.id, track.name]));
  // The arrangement's own length, which is the bound every gesture clamps to. Read here rather than passed in as a
  // second number: `regionBars` is the one place "how long is this arrangement" is answered.
  const arrangementBars = regionBars(arrangement);

  return (
    <div data-testid="arrangement-lane" role="group" aria-label={t("lanes_label")} className="flex flex-col">
      {regions.map((region) => {
        const name = nameOf.get(region.trackId) ?? region.trackId;
        const bars = region.endBar - region.startBar;
        return (
          <Region
            key={region.trackId}
            region={region}
            pixelsPerBar={pixelsPerBar}
            arrangementBars={arrangementBars}
            snapBars={snapBars}
            label={t("region_label", { name, from: region.startBar + 1, to: region.endBar })}
            resizeLabel={t("region_resize_label", { name })}
            emptyLabel={t("region_empty")}
            isCurrent={region.trackId === selectedTrackId}
            {...(onSelectTrack ? { onSelect: () => onSelectTrack(region.trackId) } : {})}
            {...(onRegionChange ? { onRange: (before: TrackRegion, after: TrackRegion) => onRegionChange(region.trackId, before, after) } : {})}
          />
        );
      })}
    </div>
  );
}
