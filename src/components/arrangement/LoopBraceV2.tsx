/**
 * The loop brace in the ruler — set, moved and resized **by pointer and by keyboard**.
 *
 * `docs/ARRANGEMENT_UI_DESIGN.md` §3 records the gesture from the manuals (Live: a loop switch, a brace in the
 * ruler, arrows to nudge and Ctrl+arrows to change length; Bitwig: drag the middle to move, drag either end to
 * resize) and adopts it. §7 then makes the keyboard half a requirement rather than a courtesy: **WCAG 2.5.7
 * (Dragging Movements)** asks for a single-pointer, non-dragging alternative to every drag, so a brace that could
 * only be dragged would be a criterion failure.
 *
 * That is why the arithmetic is in `data/arrangementLoop` and this file only decides *which* function a gesture
 * calls: an arrow key and a drag run the same two functions, so the alternative cannot quietly land somewhere else.
 *
 * The brace is positioned in **bar space** — `left = bar × pixelsPerBar` — not by a fraction of some container:
 * its job is to say which bars will repeat, and a rounded pixel would put the loop somewhere the model cannot
 * express.
 */
import { useRef } from "react";
import { applyLoopKey, loopLabel, resizeLoop, type LoopRange } from "../../data/arrangementLoop";
import { useLanguage } from "../../i18n/LanguageContext";

export interface LoopBraceV2Props {
  loop: LoopRange;
  /** The zoom, in pixels per bar. Shared with the ruler and the lanes. */
  pixelsPerBar: number;
  /** How many bars the arrangement has, which is where the brace's ends stop. */
  bars: number;
  /**
   * Move or resize it. **Absent means the brace is a report, not a control**: the handles then carry no handler and
   * `aria-disabled`, which is the same rule every other optional callback in this view follows — a caller with no
   * editing surface gets something that says so rather than a control that does nothing.
   */
  onChange?: (loop: LoopRange) => void;
}

/** How wide each end's hit area is, in pixels. 44 px is the touch minimum the whole surface is held to. */
const HANDLE_WIDTH = 44;

export function LoopBraceV2({ loop, pixelsPerBar, bars, onChange }: LoopBraceV2Props) {
  const { t } = useLanguage();
  /**
   * The gesture in progress, or nothing.
   *
   * A ref rather than state because a drag produces a change on every pointer move: storing it in state would
   * re-register a listener per move and, with React 18's batching, can drop the move that ended the gesture.
   */
  const drag = useRef<{ part: "start" | "end"; x: number; from: LoopRange } | undefined>(undefined);

  const onKeyDown = (part: "rock" | "start" | "end") => (event: React.KeyboardEvent<HTMLElement>) => {
    const next = applyLoopKey(loop, part, event.key, event.shiftKey, bars);
    // `undefined` means the key is not ours, and the event must be left alone: swallowing Up/Down here would break
    // scrolling for anyone whose focus landed on the brace.
    if (next === undefined) return;
    event.preventDefault();
    onChange?.(next);
  };

  const startDrag = (part: "start" | "end") => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (onChange === undefined) return;
    drag.current = { part, x: event.clientX, from: loop };
    // Capture keeps the gesture alive when the pointer leaves the 44 px handle, which is what makes a long drag
    // possible at all.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const onMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current) return;
    // Bars, rounded: the model is in bars, and a loop at bar 2.5 is not something the ruler can show.
    const deltaBars = Math.round((event.clientX - current.x) / pixelsPerBar);
    if (deltaBars === 0) return;
    onChange?.(resizeLoop(current.from, current.part, deltaBars, bars));
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    drag.current = undefined;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const x = (bar: number) => bar * pixelsPerBar;
  const width = Math.max(0, (loop[1] - loop[0]) * pixelsPerBar);
  const handleProps = (part: "start" | "end") => ({
    onPointerDown: startDrag(part),
    onPointerMove: onMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onKeyDown: onKeyDown(part),
    "data-testid": `loop-brace-${part}`,
    // A brace with no `onChange` is a report: the handlers are present but the state is announced as disabled, so
    // assistive tech is told what the visual affordance already implies.
    "aria-disabled": onChange === undefined ? true : undefined,
    style: { left: x(part === "start" ? loop[0] : loop[1]) - HANDLE_WIDTH / 2, width: HANDLE_WIDTH, touchAction: "none" as const },
  });

  return (
    <div data-testid="loop-brace" data-loop-start={loop[0]} data-loop-end={loop[1]} className="absolute inset-y-0 left-0">
      {/* The span itself. `pointer-events-none` on purpose: it is a picture of which bars repeat, and the handles
          below are the targets. A movable middle (Bitwig's model) is reachable from the keyboard rock instead. */}
      <span
        aria-hidden="true"
        data-testid="loop-brace-span"
        className="pointer-events-none absolute top-0 h-1.5 rounded-sm border-x-2 border-t-2 border-[var(--d-accent)]"
        style={{ left: x(loop[0]), width }}
      />
      <button
        type="button"
        {...handleProps("start")}
        aria-label={t("loop_start_label", { from: loop[0] + 1, to: loop[1] })}
        className="absolute top-0 z-20 flex h-11 items-center justify-start"
      >
        <span aria-hidden="true" className="h-3 w-0.5 bg-[var(--d-accent)]" />
      </button>
      <button
        type="button"
        {...handleProps("end")}
        aria-label={t("loop_end_label", { from: loop[0] + 1, to: loop[1] })}
        className="absolute top-0 z-20 flex h-11 items-center justify-end"
      >
        <span aria-hidden="true" className="h-3 w-0.5 bg-[var(--d-accent)]" />
      </button>
      {/*
        The keyboard's way to **move** the whole brace. A drag of the middle is the mouse's version (Bitwig), and a
        drag needs an equivalent that is not a drag (2.5.7) — so the middle is a real control here rather than a
        picture, and it moves the span by whole bars with the arrows.

        It is transparent rather than invisible, and it takes pointer events: a control the user cannot pick up with
        the pointer would be a keyboard-only affordance, and Bitwig's "drag the middle to move it" is the half of the
        convention the brief explicitly adopts.
      */}
      <button
        type="button"
        data-testid="loop-brace-move"
        aria-label={t("loop_move_label", { from: loop[0] + 1, to: loop[1] })}
        onKeyDown={onKeyDown("rock")}
        className="absolute z-10 h-3 opacity-0"
        style={{ left: x(loop[0]) + HANDLE_WIDTH / 2, width: Math.max(0, width - HANDLE_WIDTH) }}
      />
      {/* The value, readable rather than inferred from two thin lines: "bars 3–6" is what the arrows changed. It is
          positioned at the brace rather than at the corner of the ruler, where the snap value's own readout lives. */}
      <span
        data-testid="loop-brace-value"
        className="absolute top-6 whitespace-nowrap font-['JetBrains_Mono'] text-[10px] text-[var(--d-accent)]"
        style={{ left: x(loop[0]) }}
      >
        {loopLabel(loop)}
      </span>
    </div>
  );
}
