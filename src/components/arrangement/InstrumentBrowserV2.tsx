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
    <div data-testid={`instrument-slot-${trackId}`} className="flex min-w-0 flex-col gap-1">
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
        <InstrumentLibraryV2
          instruments={instruments}
          currentAssetId={assetId}
          onChoose={(chosen) => {
            onChangeInstrument(trackId, chosen);
            // Closing on a choice is what the panel is for: a person who picked one is done with it.
            onOpenChange(false);
          }}
        />
      )}
    </div>
  );
}
