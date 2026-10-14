/**
 * **The automation lane: one track's level curve, drawn as points a person can drag.**
 *
 * `docs/DAW_GAP_ARRANGEMENT.md` §8's fourth item is "先做『一条轨一个参数』的连续包络", and this is the surface half of it —
 * the model (`TrackV2.automation`), its reading (`data/automation.ts`), the compile expansion and the engine's per-step
 * scheduling all exist and shipped in v2.40.0. What was missing is the thing the sentence is about: a curve you can see
 * and move.
 *
 * ## The three decisions this file makes
 *
 * 1. **A gesture writes once, on release.** The points in flight live in this component's own state and the model is
 *    written through `onChange` when the pointer comes up — the same rule `ArrangementLaneV2` follows for a region drag,
 *    and for the same reason: the history stack underneath has no coalescing, so a command per pointer move would make
 *    one undo step one pixel.
 * 2. **The time axis is shared, not recomputed.** `pixelsPerBar` is the ruler's number, passed in, so a point cannot be
 *    drawn at one beat and dragged to another. Four beats to the bar is stated as a constant here rather than read from
 *    the metre, and that limit is named rather than hidden: a 3/4 or 5/4 section draws its curve against a four-beat bar
 *    until this lane learns the metre map, which is the same simplification `bars` already carries.
 * 3. **The whole curve is the unit of change**, because that is what `setTrackAutomation` stores. One drag can reorder
 *    points — dragging a point past its neighbour is a legal gesture — so a per-point command would have to describe an
 *    insertion at one end of the array and a removal at the other.
 *
 * Editing notes the piano roll already owns are not repeated here: this lane carries no note drawing, no selection and
 * no marquee.
 */
import { useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { AUTOMATION_RANGES, type AutomationParameter, type AutomationPoint } from "../../data/automation";

/** Beats to the bar, as the lane's own constant — see the file note about metre. */
const BEATS_PER_BAR = 4;

/** How close a press has to be to a point, in pixels, to grab it instead of adding one. */
const GRAB_RADIUS_PX = 14;

/** The lane's height, shared with the view: the header column reserves exactly this so the two stay in step. */
export const AUTOMATION_LANE_HEIGHT = 72;

/** The keyboard nudge is the parameter's own step (`AUTOMATION_RANGES`), so one press is a round number in its terms. */

export interface AutomationLaneV2Props {
  trackName: string;
  /**
   * ⭐ **Which field this lane automates**, because the vertical axis is the parameter's own range: a pan travels −1…1
   * and a send 0…1, and drawing either on the level's −60…+6 dB axis would put every point at one end.
   */
  parameter: AutomationParameter;
  /** The curve as stored, in beats and in the parameter's own unit. */
  points: readonly AutomationPoint[];
  /** The zoom, in pixels per bar — the ruler's own number. */
  pixelsPerBar: number;
  /** The points layout width, so the lane can be scrolled with the rest of the arrangement. */
  width: number;
  height?: number;
  /** Called once per gesture with the whole curve. */
  onChange: (points: AutomationPoint[]) => void;
  /** Shown when the lane is reachable from a test or a screen reader without the track's name to hand. */
  testId?: string;
}

export function AutomationLaneV2({
  trackName,
  parameter,
  points,
  pixelsPerBar,
  width,
  height = AUTOMATION_LANE_HEIGHT,
  onChange,
  testId = "arrangement-automation-lane",
}: AutomationLaneV2Props) {
  const { t } = useLanguage();
  /** The curve being dragged, or null when nothing is in flight — the model is not written until release. */
  const [dragging, setDragging] = useState<AutomationPoint[] | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);

  const shown = dragging ?? [...points];
  /** The range this lane's own parameter honours (see `AUTOMATION_RANGES`). */
  const { min: valueMin, max: valueMax, step: valueStep } = AUTOMATION_RANGES[parameter];

  const xOf = (atBeats: number): number => (atBeats / BEATS_PER_BAR) * pixelsPerBar;
  const valueOf = (y: number): number => {
    const ratio = 1 - Math.min(1, Math.max(0, y / height));
    return valueMin + ratio * (valueMax - valueMin);
  };
  const yOf = (value: number): number => {
    const ratio = (value - valueMin) / (valueMax - valueMin);
    return (1 - Math.min(1, Math.max(0, ratio))) * height;
  };

  /** Where a pointer is inside the lane, in beats and dB. */
  const readPointer = (event: { clientX: number; clientY: number }): { atBeats: number; value: number } => {
    const rect = laneRef.current?.getBoundingClientRect();
    const x = event.clientX - (rect?.left ?? 0);
    const y = event.clientY - (rect?.top ?? 0);
    return { atBeats: Math.max(0, (x / pixelsPerBar) * BEATS_PER_BAR), value: valueOf(y) };
  };

  const sorted = (next: AutomationPoint[]): AutomationPoint[] => [...next].sort((a, b) => a.atBeats - b.atBeats);

  const replacePoint = (index: number, next: AutomationPoint): AutomationPoint[] =>
    sorted(shown.map((point, i) => (i === index ? next : point)));

  const startDrag = (index: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(shown);
    dragIndex.current = index;
  };
  const dragIndex = useRef<number>(-1);

  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const index = dragIndex.current;
    if (index < 0) return;
    // `replacePoint` sorts, so a point dragged past its neighbour keeps its identity by *index in the sorted list*:
    // the gesture's own index is re-found by the beat it now holds, which is what stops a drag through a neighbour
    // from grabbing the other point.
    const moved = { ...shown[index]!, ...readPointer(event) };
    const next = replacePoint(index, moved);
    setDragging(next);
    dragIndex.current = next.indexOf(moved);
  };

  const endDrag = () => {
    if (dragIndex.current < 0) return;
    dragIndex.current = -1;
    if (dragging) onChange(dragging);
    setDragging(null);
  };

  const nudge = (index: number) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = valueStep * (event.shiftKey ? 5 : 1);
    const delta = event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0;
    if (delta === 0) return;
    event.preventDefault();
    const point = shown[index];
    if (!point) return;
    onChange(sorted(shown.map((candidate, i) => (i === index ? { ...candidate, value: candidate.value + delta } : candidate))));
  };

  /** A press on empty lane adds a point there — the gesture that makes an empty lane usable at all. */
  const addPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragIndex.current >= 0) return;
    onChange(sorted([...shown, readPointer(event)]));
  };

  return (
    <div
      ref={laneRef}
      data-testid={testId}
      role="group"
      aria-label={`${trackName} ${t("arrangement_automation_lane")}`}
      className="relative border-t border-[rgb(var(--d-line))] bg-black/20"
      style={{ width, height }}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={addPoint}
    >
      {/* The line between points, drawn once as one polyline: an element per segment would be one node per point. */}
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0" width={width} height={height}>
        <polyline
          data-testid={`${testId}-curve`}
          fill="none"
          stroke="rgb(var(--d-accent, 245 183 61))"
          strokeWidth="1.5"
          points={shown.map((point) => `${xOf(point.atBeats)},${yOf(point.value)}`).join(" ")}
        />
      </svg>
      {shown.map((point, index) => (
        <button
          key={`${index}-${point.atBeats}`}
          type="button"
          data-testid={`${testId}-point-${index}`}
          aria-label={`${trackName} ${point.value.toFixed(2)} ${parameter}`}
          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40 bg-[rgb(var(--d-accent,245_183_61))]"
          style={{ left: xOf(point.atBeats), top: yOf(point.value) }}
          onPointerDown={startDrag(index)}
          onKeyDown={nudge(index)}
        />
      ))}
    </div>
  );
}
