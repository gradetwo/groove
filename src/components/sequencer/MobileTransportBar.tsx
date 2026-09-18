import React from "react";
import { Play, Square, Undo2, Redo2, ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

/**
 * The phone transport: five controls, fixed height, thumb-reachable.
 *
 * The desktop toolbar is 1889 lines with 64 buttons and four group rows — on a 390×844 phone it
 * measured 395 px, 47 % of the viewport, before a single step was visible (the number is the
 * project's own, from `STUDIO_REFACTOR_PLAN_v2.0.0.md`). Shrinking that is not a matter of
 * responsive classes: the control set itself is wrong for the device.
 *
 * So the phone gets the four things a beat needs while it is being programmed — play, tempo,
 * bar navigation, undo — plus one entry to everything else. Deliberately absent, with where each
 * one went instead:
 *
 *   - pattern slots A/B, song mode, blind compare, metronome, count-in, record arm, drum kit,
 *     drums-only, meter/resolution/step-length selects, tool mode, FX rack, export, project hub,
 *     Inspire Me, keyboard mode, transpose, share → the sheet behind the "⋯" button, which is the
 *     same sheet the tab bar opens.
 *   - swing, per-track length, probability, ratchet → the velocity lane drawer, where they are
 *     already editable per step with a larger gesture area than a toolbar button would give.
 *   - the sidebar toggle, maximize, analyzer, velocity-lane and Euclidean toggles → the view
 *     manages its own layout on a phone, so those are settings rather than transport.
 *
 * Tempo is shown, not editable, because a phone number-style stepper for BPM is worse than the
 * sheet's slider; tapping it opens the sheet. That is a deliberate trade: one fewer control, no
 * loss of capability.
 */
export interface MobileTransportBarProps {
  isPlaying: boolean;
  bpm: number;
  viewedBar: number;
  barCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onTogglePlay: () => void;
  onPrevBar: () => void;
  onNextBar: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenSheet: () => void;
}

/** 44 px minimum on every control; see the mobile a11y notes in `PRODUCT_PLAN_v2.1.0.md` §4. */
const BTN =
  "flex h-11 min-w-[44px] items-center justify-center rounded-xl border border-line text-text transition-colors active:bg-panel2 disabled:opacity-35";

/**
 * Horizontal budget, in px, for the smallest phone the UI supports (360 px wide: a 2019-era
 * Android, still the narrowest viewport in common use).
 *
 * These are the widths actually applied below, named so a layout regression is arithmetic rather
 * than a visual surprise. The first version of this bar used a 56 px play button, a 10 px gap and
 * a 52 px bar label, which put the "more" button at x=385 on a 390 px viewport — off-screen, so
 * every control the bar omits became unreachable. The E2E matrix caught it; this budget is how it
 * stays caught, since a sum that exceeds the viewport is visible in a test rather than in a
 * screenshot.
 */
export const TRANSPORT_LAYOUT = {
  /** Container padding: `px-1.5` on both sides. */
  paddingPx: 12,
  /** `gap-1` between the seven items. */
  gapPx: 4,
  itemCount: 7,
  playWidthPx: 44,
  barNavWidthPx: 88, // two 32 px arrow buttons + a 44 px label (at 11 px type)
  fixedRightWidthPx: 132, // undo + redo + more, each 44 px
} as const;

/** Narrowest viewport the phone shell is designed for. */
export const MIN_SUPPORTED_PHONE_WIDTH_PX = 360;

/** Width the flex tempo readout can occupy on that viewport, or a negative number if it cannot fit. */
export function tempoReadoutBudgetPx(viewportWidth = MIN_SUPPORTED_PHONE_WIDTH_PX): number {
  const { paddingPx, gapPx, itemCount, playWidthPx, barNavWidthPx, fixedRightWidthPx } = TRANSPORT_LAYOUT;
  const fixed = paddingPx + playWidthPx + barNavWidthPx + fixedRightWidthPx;
  const gaps = gapPx * (itemCount - 1);
  return viewportWidth - fixed - gaps;
}

export const MobileTransportBar: React.FC<MobileTransportBarProps> = ({
  isPlaying,
  bpm,
  viewedBar,
  barCount,
  canUndo,
  canRedo,
  onTogglePlay,
  onPrevBar,
  onNextBar,
  onUndo,
  onRedo,
  onOpenSheet,
}) => {
  const { t } = useLanguage();

  return (
    <div
      data-testid="mobile-transport-bar"
      role="toolbar"
      aria-label={t("mobile_transport_label")}
      className="flex w-full items-center gap-1 border-b border-line bg-panel/80 px-1.5 py-1.5 backdrop-blur"
    >
      {/*
        Widths are budgeted, not left to content: 8 px container padding + 44 play + 4 gap +
        88 bar nav + 4 + flex tempo + 4 + 3×44 buttons must fit 360 px of usable width on the
        narrowest phone in common use. An earlier version used a 56 px play button, a 10 px bar
        label and `gap-1.5`, which pushed the "more" button to x=385 on a 390 px viewport — i.e.
        off-screen, so the entry to every control the bar omits was unreachable.
      */}
      <button
        type="button"
        data-testid="mobile-transport-play"
        aria-label={isPlaying ? t("toolbar_pause") : t("toolbar_play")}
        aria-pressed={isPlaying}
        onClick={onTogglePlay}
        className={`${BTN} w-11 shrink-0 ${
          isPlaying ? "border-accent bg-accent/20 text-accent" : "border-accent/60 text-accent"
        }`}
      >
        {isPlaying ? <Square className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
      </button>

      {/*
        Bar navigation is how a phone moves around a pattern longer than one bar, and it is the
        only way to reach bar 2+ without horizontal scrolling 64 steps — so it earns its space
        even though the desktop toolbar hides it until a pattern has more than one bar.
      */}
      <div className="flex shrink-0 items-center rounded-xl border border-line">
        <button
          type="button"
          data-testid="mobile-transport-prev-bar"
          aria-label={t("toolbar_bar_prev")}
          onClick={onPrevBar}
          disabled={viewedBar <= 0}
          className="flex h-11 w-8 items-center justify-center text-text disabled:opacity-35"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span
          data-testid="mobile-transport-bar-label"
          className="w-11 text-center font-['JetBrains_Mono'] text-[11px] font-bold text-text-sub"
        >
          {Math.min(viewedBar + 1, Math.max(1, barCount))}/{Math.max(1, barCount)}
        </span>
        <button
          type="button"
          data-testid="mobile-transport-next-bar"
          aria-label={t("toolbar_bar_next")}
          onClick={onNextBar}
          disabled={viewedBar >= barCount - 1}
          className="flex h-11 w-8 items-center justify-center text-text disabled:opacity-35"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Tempo is a readout that opens the sheet, not a stepper: see the header comment. */}
      <button
        type="button"
        data-testid="mobile-transport-tempo"
        aria-label={t("toolbar_bpm_title")}
        onClick={onOpenSheet}
        className={`${BTN} min-w-0 flex-1 px-1 font-['JetBrains_Mono'] text-[12px] font-bold`}
      >
        {bpm}
        <span className="ml-1 text-[9px] font-semibold text-text-dim">BPM</span>
      </button>

      <button
        type="button"
        data-testid="mobile-transport-undo"
        aria-label={t("toolbar_undo_title")}
        onClick={onUndo}
        disabled={!canUndo}
        className={BTN}
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        data-testid="mobile-transport-redo"
        aria-label={t("toolbar_redo_title")}
        onClick={onRedo}
        disabled={!canRedo}
        className={BTN}
      >
        <Redo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        data-testid="mobile-transport-more"
        aria-label={t("toolbar_advanced_label")}
        aria-haspopup="dialog"
        onClick={onOpenSheet}
        className={BTN}
      >
        <Settings2 className="h-4 w-4" />
      </button>
    </div>
  );
};
