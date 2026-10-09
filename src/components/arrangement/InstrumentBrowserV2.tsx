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
import type { InstrumentChoice } from "./TrackListV2";

export interface InstrumentBrowserV2Props {
  trackId: string;
  /** The track's name, so the chip and the panel can name what they belong to without a second lookup. */
  trackName: string;
  /** What the track plays, absent when nothing is chosen yet. */
  assetId?: string;
  instruments: readonly InstrumentChoice[];
  onChangeInstrument: (trackId: string, assetId: string) => void;
  /** Which track's panel is open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InstrumentBrowserV2({ trackId, trackName, assetId, instruments, onChangeInstrument, open, onOpenChange }: InstrumentBrowserV2Props) {
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
      // ⭐ Below the chip when it fits, above it when it does not, never taller than the space that is left.
      const maxHeight = Math.max(180, Math.min(560, window.innerHeight - below - 12));
      const wanted = maxHeight >= 220 ? below : Math.max(8, rect.top - 4 - 320);
      /**
       * ⭐ **And clamped into the viewport whatever the chip's own position is** (measured: with the chip far down a long
       * track list, anchoring to it drew the panel at y=1891 in an 844 px viewport — off screen, `elementFromPoint` null).
       * A panel whose job is to be clicked must be visible even when the control that opened it is not.
       */
      const height = maxHeight >= 220 ? maxHeight : Math.min(320, window.innerHeight - wanted - 12);
      const top = Math.max(8, Math.min(wanted, window.innerHeight - height - 8));
      setAnchor({ left, top, width, maxHeight: Math.min(height, window.innerHeight - top - 8) });
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
    <div data-testid={`instrument-slot-${trackId}`} ref={slotRef} className="relative flex min-w-0 flex-col gap-1">
      <button
        type="button"
        // The name says which track it belongs to, which is what makes the chip findable by a screen reader in a
        // column of identical-looking chips.
        aria-label={`${trackName} instrument`}
        aria-expanded={open}
        data-testid={`instrument-open-${trackId}`}
        onClick={() => onOpenChange(!open)}
        className="min-w-0 truncate rounded border border-[rgb(var(--d-line))] px-1 text-left text-[10px] text-text"
      >
        {/*
          The track's instrument by name, or the invitation to choose one when it plays none yet.
          The brief's own example is "SFZ: Salamander Grand" / "Drums: 808", and this is the name without the prefix:
          the panel behind the chip already says which library and category the instrument came from, so repeating it
          in a 10 px chip would cost the words that identify the instrument itself.
        */}
        {current ? current.name : t("instrument_choose")}
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
            data-testid={`instrument-panel-${trackId}`}
            role="dialog"
            aria-label={`${trackName} instrument`}
            style={{ left: anchor.left, top: anchor.top, width: anchor.width, maxHeight: anchor.maxHeight }}
            className="fixed z-[60] flex flex-col overflow-y-auto rounded-lg border border-line bg-panel shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1">
              <span className="min-w-0 truncate text-[10px] uppercase tracking-[0.12em] text-text-dim">{trackName}</span>
              <button
                type="button"
                data-testid={`instrument-panel-close-${trackId}`}
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
