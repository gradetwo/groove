/**
 * The lane area: one region per track, with a non-editable miniature of the track's own notes inside it.
 *
 * **The boundary this file exists to hold** is the one `docs/ARRANGEMENT_UI_DESIGN.md` §4 calls the real design
 * question. Every DAW in the survey edits *regions* in the arrangement, not bare notes: Live's manual is explicit
 * that a clip's waveform or MIDI display can be clicked but not dragged — only the clip bar is a handle — and
 * editing happens in the Clip View. The brief adopts that boundary and rejects its opposite (§5: "editing region
 * contents in the lane"), so:
 *
 * - **the region block is the handle** — it takes focus, it is selectable, and it is what a drag or a key press acts on;
 * - **the miniature is not interactive at all.** It is `aria-hidden` and carries no handler: there is no pointer or
 *   keyboard path from a drawn note to a model change, here or anywhere downstream of it. Writing notes is the
 *   piano roll's job, and it already has the whole arrangement to write in.
 *
 * The lane's pixels-per-bar is the **same number** the ruler is laid out with, passed in rather than recomputed:
 * two sources for "how wide is a bar" is exactly how a ruler ends up labelling one place while a region is drawn at
 * another.
 */
import { deriveArrangementRegions, type ArrangementRegion } from "../../data/arrangementLanes";
import { useLanguage } from "../../i18n/LanguageContext";
import type { ArrangementV2 } from "../../types/arrangementV2";

export interface ArrangementLaneV2Props {
  arrangement: ArrangementV2;
  /** The zoom, in pixels per bar. Shared with the ruler. */
  pixelsPerBar: number;
  /** Which track's region is the current one, if any. */
  selectedTrackId?: string;
  onSelectTrack?: (trackId: string) => void;
}

function Region({
  region,
  pixelsPerBar,
  label,
  emptyLabel,
  isCurrent,
  onSelect,
}: {
  region: ArrangementRegion;
  pixelsPerBar: number;
  label: string;
  emptyLabel: string;
  isCurrent: boolean;
  onSelect?: () => void;
}) {
  const bars = region.endBar - region.startBar;
  return (
    <div className="flex items-center px-2" style={{ height: "var(--arr-track-h)" }}>
      <button
        type="button"
        data-testid={`arrangement-region-${region.trackId}`}
        data-start-bar={region.startBar}
        data-bars={bars}
        aria-label={label}
        // `aria-current` rather than `aria-pressed`: the region is one of a set of regions, and which one is current
        // is the same fact the track header shows. A pressed state would make it a toggle, which it is not.
        aria-current={isCurrent ? "true" : undefined}
        onClick={onSelect}
        /*
          The region is the handle: focusable for the keyboard, and `relative` so its miniature and gridlines sit
          inside it. `overflow-hidden` is what makes the miniature's clamping read as clamping rather than as a note
          drawn over the next lane.
        */
        className="relative shrink-0 overflow-hidden rounded border border-[var(--d-line)] bg-[var(--d-surface,rgba(255,255,255,0.04))] text-left"
        /*
          The region fills its lane row rather than carrying a height of its own. The lane row is `--arr-track-h`,
          which is also the header's height — that equality is what keeps headers and lanes in step, and a literal
          here would break it the first time the row height changed.
        */
        style={{ width: bars * pixelsPerBar, height: "calc(var(--arr-track-h) - 12px)" }}
      >
        {/* Bar boundaries, so the region can be read against the ruler. One node per bar and no more: a gridline
            per sixteenth would be sixteen times the DOM for a line the zoom can already imply. */}
        {Array.from({ length: Math.max(0, bars - 1) }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className="absolute top-0 h-full border-l border-[var(--d-line)]"
            style={{ left: (index + 1) * pixelsPerBar }}
          />
        ))}
        {/* The miniature: drawn above the gridlines, and not reachable by pointer or keyboard. */}
        <span aria-hidden="true" data-testid={`arrangement-miniature-${region.trackId}`} className="pointer-events-none absolute inset-x-0 bottom-0.5 top-0.5">
          {region.miniatures.map((miniature, index) => (
            <span
              key={`${miniature.pitch}-${index}`}
              data-miniature="note"
              data-pitch={miniature.pitch}
              className="absolute top-0 h-full rounded-[1px]"
              style={{
                left: `${miniature.x * 100}%`,
                width: `${Math.max(0.4, miniature.width * 100)}%`,
                background: "var(--d-accent)",
                opacity: miniature.alpha,
              }}
            />
          ))}
        </span>
        {/* Said in words rather than implied by an empty box: "no notes" is a state, an empty lane is a question. */}
        {region.miniatures.length === 0 && <span className="absolute bottom-0.5 left-1 text-[9px] text-text opacity-60">{emptyLabel}</span>}
      </button>
    </div>
  );
}

export function ArrangementLaneV2({ arrangement, pixelsPerBar, selectedTrackId, onSelectTrack }: ArrangementLaneV2Props) {
  const { t } = useLanguage();
  // Folded folders hide their children's lanes, the same display state `TrackListV2` reads — folding must never
  // change what is heard, and a hidden lane is not a muted track.
  const hidden = new Set<string>();
  for (const track of arrangement.tracks) {
    if (track.collapsed && track.kind === "folder") {
      for (const child of arrangement.tracks) if (child.parentId === track.id) hidden.add(child.id);
    }
  }
  const regions = deriveArrangementRegions(arrangement).filter((region) => !hidden.has(region.trackId));
  const nameOf = new Map(arrangement.tracks.map((track) => [track.id, track.name]));

  return (
    <div data-testid="arrangement-lane" role="group" aria-label={t("lanes_label")} className="flex flex-col">
      {regions.map((region) => {
        const name = nameOf.get(region.trackId) ?? region.trackId;
        const bars = region.endBar - region.startBar;
        return (
          <Region
            key={region.trackId}
            region={region}
            pixelsPerBar={pixelsPerBar}
            label={t("region_label", { name, bars })}
            emptyLabel={t("region_empty")}
            isCurrent={region.trackId === selectedTrackId}
            {...(onSelectTrack ? { onSelect: () => onSelectTrack(region.trackId) } : {})}
          />
        );
      })}
    </div>
  );
}
