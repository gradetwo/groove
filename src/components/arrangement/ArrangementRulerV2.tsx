/**
 * The ruler: bar numbers across the top, and the one the rest of the view is looking at.
 *
 * It is the thing both Logic screenshots have at the top of the arrangement, and it does two jobs here:
 *
 *   · **it says how long the arrangement is**, in the unit a musician counts in — the strips show one bar and no bar number anywhere would leave "which bar am I editing" unanswerable;
 *   · **it moves the view**, because clicking a bar is how a person changes which bar they are looking at. The selector buttons it replaces (‹ ›) could only step, which is the wrong shape for eight bars and unusable for sixty-four.
 *
 * **No playhead yet, and that is deliberate.** A playhead has to come from the thing that knows where playback is, and the audio-lane path schedules buffers on the audio context without reporting a position. Drawing a marker that moved on a timer would be a picture of a guess; when the lane planner reports its timing, the marker belongs here beside the bar
 * numbers.
 */
import { useLanguage } from "../../i18n/LanguageContext";

export interface ArrangementRulerV2Props {
  /** How long the arrangement is. */
  bars: number;
  /** Which bar the view is looking at, 0-based. */
  currentBar: number;
  /** Moving the view. Optional, so the ruler can be drawn as a picture of the arrangement's length. */
  onSelectBar?: (bar: number) => void;
}

export function ArrangementRulerV2({ bars, currentBar, onSelectBar }: ArrangementRulerV2Props) {
  const { t } = useLanguage();
  // A bar is a fixed and small slice of the ruler; they scroll together rather than wrap, because a ruler that wrapped would put bar 9 above bar 1.
  const width = 56;

  return (
    <div
      data-testid="arrangement-ruler"
      role="group"
      aria-label={t("ruler_label")}
      className="flex items-stretch overflow-x-auto pt-1"
      style={{ minWidth: bars * width }}
    >
      {Array.from({ length: bars }, (_, bar) => (
        <button
          key={bar}
          type="button"
          data-testid={`ruler-bar-${bar}`}
          data-current={bar === currentBar ? "true" : "false"}
          aria-label={t("ruler_bar", { bar: bar + 1 })}
          aria-pressed={bar === currentBar}
          onClick={() => onSelectBar?.(bar)}
          style={{ width }}
          className={`shrink-0 h-6 border-l border-[var(--d-border,rgba(255,255,255,0.15))] font-['JetBrains_Mono'] text-[10px] text-left pl-1 ${
            bar === currentBar ? "bg-[var(--d-accent)] text-black" : "text-text opacity-70"
          }`}
        >
          {bar + 1}
        </button>
      ))}
    </div>
  );
}
