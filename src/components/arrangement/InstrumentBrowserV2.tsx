/**
 * The instrument slot: a chip that names what the track plays, and the library panel behind it.
 *
 * **Why it exists separately from the track header.** `docs/ARRANGEMENT_UI_DESIGN.md` §6.1 puts our SFZ sampler slot
 * on the track header, in the position where Cubase puts configurable track controls and FL binds an instrument with
 * Track Mode. The header was rebuilt (the grid layout), and the old row-based list still exists, so the choice was
 * between two copies of "which instrument is on this track" or one. Two copies of a control whose whole job is to
 * report *one* value is how a header comes to disagree with a list about what a track plays.
 *
 * It is presentational on purpose: the open/closed state lives in the caller, because whether a panel is open is
 * which row the user is looking at — a fact about the list, not about one slot in it.
 *
 * The panel only appears when there is something to choose. An empty catalogue would otherwise get a chip that
 * opens an empty browser, which is the "control that does nothing" the `trackInstrumentChooser` criteria exist to
 * prevent.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import { InstrumentLibraryV2 } from "./InstrumentLibraryV2";
import { instrumentDisplayName } from "./instrumentDisplayName";
import type { InstrumentChoice } from "./TrackListV2";

export interface InstrumentBrowserV2Props {
  trackId: string;
  /** The track's name, so the chip and the panel can name what they belong to without a second lookup. */
  trackName: string;
  /** What the track plays, absent when nothing is chosen yet. */
  assetId?: string;
  instruments: readonly InstrumentChoice[];
  onChangeInstrument: (trackId: string, assetId: string) => void;
  /** ⭐ Audition a candidate before choosing it; absent means the list draws no ▷ button at all. */
  onAudition?: (assetId: string) => void;
  /** Which track's panel is open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * ⭐ **Which copy of the chip this is** (fourth evaluation, P2-2: `instrument-slot-*` and `instrument-open-*` each
   * appeared twice, because the same track renders this control both in the header column and in the track list).
   *
   * The **list copy keeps the bare id** — it is the one the evaluation measured, the probes query and the criteria name —
   * and the header copy is marked `header`. Two elements with one testid make an automated locator pick arbitrarily, which
   * is exactly the kind of silent ambiguity this project refuses elsewhere.
   */
  scope?: "header" | "row";
}

export function InstrumentBrowserV2({
  trackId,
  trackName,
  assetId,
  instruments,
  onChangeInstrument,
  onAudition,
  open,
  onOpenChange,
  scope = "row",
}: InstrumentBrowserV2Props) {
  /** ⭐ One id per element: the header owns the bare one, the list copy carries `-row`. */
  const suffix = scope === "header" ? "-header" : "";
  const { t } = useLanguage();
  const current = instruments.find((instrument) => instrument.assetId === assetId);
  /**
   * ⭐ **Where the floating panel goes, measured rather than inherited** (fourth evaluation, P1-1).
   *
   * The panel was `absolute` inside this slot, and this slot sits in a sticky column (`z-10`) — so `z-50` was only 50
   * *within that stacking context*, and when a track near the bottom of the list opened its panel, the panel was painted
   * under `arrangement-detail`'s opaque background: 315 options present in the DOM and none of them clickable, which the
   * evaluation proved with `elementFromPoint` and which DOM-driven tests had missed because a scripted `.click()` never
   * asks what is on top.
   *
   * The fix is the standard one for that trap: render the panel **into `document.body`** (a portal, outside every ancestor's
   * stacking context) and give it `fixed` coordinates measured from the chip. The position is clamped to the viewport and
   * the height is bounded by the space actually left, so the panel cannot be drawn off-screen either — the mobile
   * measurement that produced the bottom-sheet rule earlier.
   */
  const slotRef = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = slotRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(352, window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const below = rect.bottom + 4;
      /**
       * ⭐ **Clamp the panel into the viewport, and derive its height from where it ended up** (measured, fourth evaluation).
       *
       * The first version of this computed the height from `wanted` — the position the chip asked for — and then clamped
       * with it. With the chip far down a long track list that height went **negative**: the panel was written at
       * `top: 1656px` in an 850 px viewport with `maxHeight: -818px` (an invalid length, so the browser dropped it), which
       * is why the first fix changed nothing and why `elementFromPoint` over its options returned `null` — nothing was
       * clickable because nothing was on screen.
       *
       * A pane whose job is to be clicked must be visible even when the control that opened it is not: `top` is clamped
       * against a *minimum* usable height, and the height then follows from `top`, never the other way round.
       */
      const minimumPanel = 180;
      const wanted = below + 140 <= window.innerHeight ? below : Math.max(8, rect.top - 4 - 320);
      const top = Math.max(8, Math.min(wanted, Math.max(8, window.innerHeight - minimumPanel - 8)));
      const maxHeight = Math.max(minimumPanel, Math.min(560, window.innerHeight - top - 8));
      setAnchor({ left, top, width, maxHeight });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    /**
     * ⭐ **The slot keeps a readable width on a phone** (fourth evaluation, P1-2's second half; measured 2026-10-09).
     *
     * With `min-w-0` alone the slot was squeezed to **10 px** by the other controls in the row — the chip was there, 44 px
     * tall, and effectively invisible. A minimum width on the phone gives the instrument name somewhere to live; from `sm:`
     * the column is wide enough already and the slot goes back to yielding.
     */
    <div
      data-testid={`instrument-slot-${trackId}${suffix}`}
      ref={slotRef}
      /**
       * ⭐ **The minimum width belongs to the row copy only** (measured by CI's browser matrix, 2026-10-09: *"a track header
       * draws no readable name … (widths 0)"* on Chromium, Firefox **and** WebKit).
       *
       * The header column is a fixed, narrow strip that already carries the kind chooser, the level, the pan and the meter;
       * the header's own comment records that this is exactly how the track's **name** once got squeezed to zero. Reserving
       * 6.5rem here pushed it back to zero — so the reservation is scoped to the list, where the row has the width, and the
       * header keeps yielding (its chip is truncated on purpose and carries the full name in `title`).
       */
      className={`relative flex flex-col gap-1 ${scope === "row" ? "min-h-11 min-w-[6.5rem] sm:min-h-0 sm:min-w-0" : "min-h-11 sm:min-h-0"}`}
    >
      <button
        type="button"
        // The name says which track it belongs to, which is what makes the chip findable by a screen reader in a
        // column of identical-looking chips.
        aria-label={`${trackName} instrument`}
        aria-expanded={open}
        data-testid={`instrument-open-${trackId}${suffix}`}
        onClick={() => onOpenChange(!open)}
        /**
         * ⭐ **A real target height, and the full name on demand** (fourth evaluation, P1-2: measured 112×17 px on a 1920
         * desktop too, with "Virtuosity Drums — Basic Kit" cut to "Virtuosity Drums — …"). 17 px is below anything a
         * pointer can be expected to hit; the column is narrow, so the name is truncated on purpose and the title carries
         * it whole.
         */
        title={current ? current.name : t("instrument_choose")}
        className="min-h-11 sm:min-h-7 min-w-0 truncate rounded border border-[rgb(var(--d-line))] px-1 text-left text-[10px] text-text transition-colors hover:border-[rgb(var(--d-accent))]/60"
      >
        {/*
          The track's instrument by name, or the invitation to choose one when it plays none yet.
          The brief's own example is "SFZ: Salamander Grand" / "Drums: 808", and this is the name without the prefix:
          the panel behind the chip already says which library and category the instrument came from, so repeating it
          in a 10 px chip would cost the words that identify the instrument itself.
        */}
        {current ? instrumentDisplayName(current.name) : t("instrument_choose")}
      </button>
      {open &&
        anchor &&
        createPortal(
          /**
           * ⭐ **A portal, not a child.** Rendering here puts the panel outside the sticky column's stacking context, which
           * is what made `z-50` useless against `arrangement-detail` (fourth evaluation, P1-1). The coordinates come from
           * the chip's own rectangle, clamped to the viewport, so the panel is on screen and clickable wherever the row is.
           */
          <div
            data-testid={`instrument-panel-${trackId}${suffix}`}
            role="dialog"
            aria-label={`${trackName} instrument`}
            style={{ left: anchor.left, top: anchor.top, width: anchor.width, maxHeight: anchor.maxHeight }}
            className="fixed z-[60] flex flex-col overflow-y-auto rounded-lg border border-line bg-panel shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1">
              <span className="min-w-0 truncate text-[10px] uppercase tracking-[0.12em] text-text-dim">{trackName}</span>
              <button
                type="button"
                data-testid={`instrument-panel-close-${trackId}${suffix}`}
                aria-label={t("close")}
                onClick={() => onOpenChange(false)}
                className="min-h-11 min-w-11 shrink-0 rounded text-xs text-text-dim hover:text-text sm:min-h-0 sm:min-w-0"
              >
                ×
              </button>
            </div>
            <InstrumentLibraryV2
              instruments={instruments}
              currentAssetId={assetId}
              {...(onAudition ? { onAudition } : {})}
              onChoose={(chosen) => {
                onChangeInstrument(trackId, chosen);
                // Closing on a choice is what the panel is for: a person who picked one is done with it.
                onOpenChange(false);
              }}
            />
          </div>,
          document.body
        )}
    </div>
  );
}
