import { useCallback, useEffect, useRef, useState } from "react";
import { triggerHaptic, HapticPatterns } from "../../../utils/haptics";
import type { SequencerAction } from "../useSequencerStore";

export interface UseMatrixScrollOptions {
  matrixContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  stepsPerBar: number;
  setViewedBar: React.Dispatch<React.SetStateAction<number>>;
  commit: (action: SequencerAction, recordHistory?: boolean) => void;
}

export interface UseMatrixScrollResult {
  isRulerDragging: boolean;
  handleRulerPointerDown: (e: React.PointerEvent) => void;
  handleRulerPointerMove: (e: React.PointerEvent) => void;
  handleRulerPointerUp: (e: React.PointerEvent) => void;
  handleSelectLoopRange: (rng: [number, number] | null) => void;
  scrollToBar: (bIdx: number) => void;
  scrollByPixels: (delta: number) => void;
}

/**
 * A-02: horizontal navigation of the step matrix — Shift+wheel pan, ruler
 * drag-to-scroll, loop-range selection and bar/pixel scrolling. Extracted
 * verbatim from `StudioView`, including the drag refs it owns.
 */
export function useMatrixScroll({
  matrixContainerRef,
  stepsPerBar,
  setViewedBar,
  commit,
}: UseMatrixScrollOptions): UseMatrixScrollResult {
  const [isRulerDragging, setIsRulerDragging] = useState(false);
  const rulerDragStartXRef = useRef(0);
  const rulerDragScrollLeftRef = useRef(0);

  // Mouse wheel listener: horizontal scrolling on Shift+Wheel
  useEffect(() => {
    const el = matrixContainerRef.current;
    if (!el) return;

    /**
     * The step grid pans horizontally on Shift+wheel, and only there.
     *
     * Two guards, both about leaving vertical scrolling alone:
     *
     *  - **Axis direction.** A horizontal-dominant gesture pans the grid without needing Shift, which
     *    is what a trackpad two-finger swipe actually produces; a vertical-dominant one is left to the
     *    browser so the page keeps scrolling. Intercepting on `deltaY !== 0` alone is how a grid
     *    swallows the page's vertical scroll.
     *  - **Only when there is somewhere to go.** `preventDefault` on a grid that is already fully
     *    scrolled just eats the gesture.
     */
    const handleWheel = (e: WheelEvent) => {
      const canPan = el.scrollWidth > el.clientWidth;
      if (!canPan) return;

      const horizontalDominant = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      // Shift+wheel is the conventional vertical-wheel-to-horizontal-scroll mapping.
      const wantsHorizontal = e.shiftKey && e.deltaY !== 0;
      if (!horizontalDominant && !wantsHorizontal) return;

      e.preventDefault();
      el.scrollLeft += horizontalDominant ? e.deltaX : e.deltaY;
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // Ruler horizontal drag-to-scroll handler
  const handleRulerPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    setIsRulerDragging(true);
    rulerDragStartXRef.current = e.clientX;
    if (matrixContainerRef.current) {
      rulerDragScrollLeftRef.current = matrixContainerRef.current.scrollLeft;
    }
    triggerHaptic(HapticPatterns.slider);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
  }, []);

  const handleRulerPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isRulerDragging || !matrixContainerRef.current) return;
      const dx = e.clientX - rulerDragStartXRef.current;
      matrixContainerRef.current.scrollLeft = rulerDragScrollLeftRef.current - dx;
    },
    [isRulerDragging]
  );

  const handleRulerPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isRulerDragging) return;
      setIsRulerDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignored
      }
    },
    [isRulerDragging]
  );

  const handleSelectLoopRange = useCallback(
    (rng: [number, number] | null) => commit({ type: "SET_LOOP_RANGE", range: rng }),
    [commit]
  );

  const scrollToBar = useCallback(
    (bIdx: number) => {
      setViewedBar(bIdx);
      if (matrixContainerRef.current) {
        const targetStep = bIdx * stepsPerBar;
        const targetCell = matrixContainerRef.current.querySelector<HTMLElement>(
          `[data-ruler-step-idx="${targetStep}"]`
        );
        if (targetCell) {
          matrixContainerRef.current.scrollTo({
            left: Math.max(0, targetCell.offsetLeft),
            behavior: "smooth",
          });
        }
      }
    },
    [stepsPerBar]
  );

  const scrollByPixels = useCallback((delta: number) => {
    if (matrixContainerRef.current) {
      matrixContainerRef.current.scrollBy({ left: delta, behavior: "smooth" });
    }
  }, []);

  return {
    isRulerDragging,
    handleRulerPointerDown,
    handleRulerPointerMove,
    handleRulerPointerUp,
    handleSelectLoopRange,
    scrollToBar,
    scrollByPixels,
  };
}
