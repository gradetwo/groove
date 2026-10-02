/**
 * The ruler: bar numbers that subdivide as you zoom in, the snap value, and the one bar the rest of the view is looking at.
 *
 * Draw it beside the lane area, never above the track headers — `docs/ARRANGEMENT_UI_DESIGN.md` §1 records that
 * REAPER, Bitwig, Cubase and Live all put the ruler over the lanes only, and §8 item 2 makes "header column has no
 * ruler" the premise of the alignment the whole grid rests on.
 *
 * **The label changes with zoom** (§3): below `BAR_BEAT_LABEL_PX_PER_BAR` a tick says `3`, above it `3.1`. This is
 * Bitwig's documented behaviour, and the brief adopts it because at 24 px per bar `3.1` does not fit while at 128 px
 * per bar `3` throws away the information the zoom just paid for. The brief deliberately stops short of Bitwig's
 * third level (`BAR.BEAT.TICK`): a tick label is only legible above roughly 384 px per bar, and the ruler also has
 * to show eight bars at once.
 *
 * **The snap value is drawn, not implied** (§3, §8 item 6). Live puts the grid spacing in the ruler's top-right
 * corner; a toggle that says only "on" leaves "on what?" unanswered, which is the question the owner actually asked.
 * It is rendered here as text so it can be read rather than hovered.
 */
import { useLanguage } from "../../i18n/LanguageContext";

/**
 * The zoom at which the ruler starts naming beats as well as bars, in pixels per bar.
 *
 * Exported because a criterion asserts the switch happens **at** this number rather than near it: "≥ 96" and "> 96"
 * look the same in a screenshot and differ for every zoom that lands exactly here. 96 px per bar is 24 px per beat,
 * which is the width at which a one-character beat number stops colliding with its neighbour.
 */
export const BAR_BEAT_LABEL_PX_PER_BAR = 96;

/**
 * The default zoom, in pixels per bar.
 *
 * Deliberately **below** `BAR_BEAT_LABEL_PX_PER_BAR`, so a fresh arrangement reads as plain bar numbers and the
 * subdivision is something the user gets by zooming in. 64 px per bar is 16 px per beat — wide enough for the
 * sixteenth grid to be visible, narrow enough that a 1440 px window shows most of a sixteen-bar arrangement beside
 * the 240 px header column.
 */
export const DEFAULT_PX_PER_BAR = 64;

/**
 * The visible label for a bar at a given zoom.
 *
 * A pure function rather than inline markup because the threshold is arithmetic with an edge, and because the same
 * question — "what does the ruler say at this zoom" — is worth asking without a DOM.
 */
export function rulerLabelFor(bar: number, pixelsPerBar: number): string {
  const number = bar + 1;
  return pixelsPerBar >= BAR_BEAT_LABEL_PX_PER_BAR ? `${number}.1` : String(number);
}

/** How far the zoom may go, in pixels per bar — the two ends the toolbar's −/+ stop at. */
export const MIN_PX_PER_BAR = 24;
export const MAX_PX_PER_BAR = 256;

export interface ArrangementRulerV2Props {
  /** How long the arrangement is. */
  bars: number;
  /** Which bar the view is looking at, 0-based. */
  currentBar: number;
  /** Moving the view. Optional, so the ruler can be drawn as a picture of the arrangement's length. */
  onSelectBar?: (bar: number) => void;
  /**
   * The zoom, in pixels per bar. **The same number the lanes are laid out with**, because a ruler whose columns and
   * a lane whose gridlines came from two values would put bar 5 above the wrong beat — the misalignment this view
   * has already had once.
   */
  pixelsPerBar?: number;
  /** The current snap value, drawn in the ruler's corner as text (Live's own placement). Absent means "say nothing". */
  snapLabel?: string;
}

export function ArrangementRulerV2({ bars, currentBar, onSelectBar, pixelsPerBar = DEFAULT_PX_PER_BAR, snapLabel }: ArrangementRulerV2Props) {
  const { t } = useLanguage();
  // Bars scroll together rather than wrap, because a ruler that wrapped would put bar 9 above bar 1.
  const width = pixelsPerBar;

  return (
    <div data-testid="arrangement-ruler-row" className="relative flex items-stretch">
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
            // The name stays the bar number at every zoom: "go to bar 3" must not become "go to bar 3.1" when the
            // user presses +, and the visible label is the zoom's business rather than the destination's.
            aria-label={t("ruler_bar", { bar: bar + 1 })}
            aria-pressed={bar === currentBar}
            onClick={() => onSelectBar?.(bar)}
            style={{ width }}
            className={`shrink-0 h-6 border-l border-[rgb(var(--d-line))] font-['JetBrains_Mono'] text-[10px] text-left pl-1 ${
              bar === currentBar ? "bg-[rgb(var(--d-accent))] text-black" : "text-text opacity-70"
            }`}
          >
            {rulerLabelFor(bar, width)}
          </button>
        ))}
      </div>
      {/* Live's own placement: the grid spacing in the ruler's top-right corner. The id is the ruler's own, so the
          toolbar's value and this one can be asked for separately. */}
      {snapLabel !== undefined && (
        <span
          data-testid="arrangement-ruler-snap-value"
          className="pointer-events-none sticky right-1 ml-auto shrink-0 self-start rounded px-1 font-['JetBrains_Mono'] text-[10px] text-text opacity-80"
          /**
           * ⭐ **A dark literal under a token, which is a dark surface whenever the fallback is the value.**
           *
           * This chip floats over the ruler, so it needs a plate of its own; it read
           * `var(--d-surface, rgba(0,0,0,0.5))`, and a fallback is only a fallback while the token is defined —
           * every skin defines `--d-surface`, so the alpha was either dead weight or, the day a skin dropped the
           * token, half-transparent black on paper. It now names the plate directly, and the triple is wrapped in
           * `rgb()` because a palette triple is not a colour: `arrangementColours.test.ts` is the guard, and the
           * unwrapped form is a declaration the browser silently drops.
           */
          style={{ backgroundColor: "rgb(var(--d-panel2))" }}
        >
          {snapLabel}
        </span>
      )}
    </div>
  );
}
