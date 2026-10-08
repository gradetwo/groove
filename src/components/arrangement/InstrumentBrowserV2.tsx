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

  return (
    <div data-testid={`instrument-slot-${trackId}`} className="relative flex min-w-0 flex-col gap-1">
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
      {open && (
        /**
         * ⭐ **The chooser floats, so the row that opened it cannot squeeze it** (reported from a screenshot: the panel
         * was cramped and its labels overlapped the arrangement).
         *
         * It used to render in the track row's own flow, inside a column whose height is pinned to `--arr-track-h`, so the
         * panel was both too small for its three columns and pushed against everything around it. Taking it out of flow
         * with `absolute` costs the row nothing — which also keeps the header/lane row-height contract the release matrix
         * asserts — and buys the panel a surface of its own, a real width, and its own scroll area.
         *
         * The close control is separate from the chip because on a phone the chip can be scrolled out from under the panel.
         */
        <div
          data-testid={`instrument-panel-${trackId}`}
          role="dialog"
          aria-label={`${trackName} instrument`}
          /**
           * ⭐ **A bottom sheet on a phone, an anchored panel from `sm:`** (measured 2026-10-09).
           *
           * Released as `absolute left-0 top-full` alone, the panel opened at y=985 in a 844 px-tall phone viewport — it
           * was *below the fold*, which is exactly the "inconvenient to operate" the screenshot was about. A phone has no
           * room for a panel that hangs off a row somewhere down a scrolled column, so the mobile-first default is the
           * standard bottom sheet, and the desktop keeps the anchored panel. The measurements after the change are in
           * `scratch/probe-chooser-layer.mjs` (phone: inside the viewport; desktop: 352×287 at the slot; both: row height
           * unchanged at 96 px, opaque surface, `overflow-y: auto`).
           */
          className="fixed inset-x-2 bottom-2 z-50 flex max-h-[70vh] flex-col overflow-y-auto rounded-lg border border-line bg-panel shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-1 sm:max-h-[60vh] sm:w-[min(22rem,86vw)]"
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
        </div>
      )}
    </div>
  );
}
