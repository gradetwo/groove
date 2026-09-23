/**
 * B3 — the arrangement view.
 *
 * One clip slot per region, bars across the top, the step sequencer keeps editing the clip a region points at.
 * Everything this component *decides* (where a region sits, what a drop at bar N means, what an arrow key does) is
 * arithmetic about the song and lives in `src/features/arrangement/songEdit.ts`, tested without a browser. What is
 * left here is the DOM: regions, a ruler, pointer capture and finger-sized targets.
 *
 * Two rules it inherits from the model layer rather than re-deriving:
 *
 *   * **it draws the timeline the renderer will play**, through `sectionRegions` — a section whose clip is empty is
 *     not drawn and does not shift the regions after it;
 *   * **it never edits `sections` itself**. Every gesture ends in `onChange`, and the host commits it as one undo
 *     entry (`SET_SECTIONS`), exactly like every other edit in the studio.
 *
 * Desktop/iPad only, by the surface contract (`surfaceCapabilities.ts`): the phone has no arrangement surface, and
 * nothing under `src/mobile/**` may import this module.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { resolveTimeline, type Song, type SongSection } from "../../types/song";
import {
  applyArrangementCommand,
  commandForKey,
  dropIndexForBar,
  moveSection,
  resizeSection,
  sectionRegions,
  setSectionLabel,
  toggleSectionMute,
  type ArrangementCommand,
  type SectionRegion,
} from "../../features/arrangement/songEdit";
import { ARRANGEMENT_FORMS, ARRANGEMENT_FORM_IDS, formBars, type ArrangementFormId } from "../../data/arrangementForm";

/**
 * The view's measurements, exported because the touch contract is a number.
 *
 * 44 px is the smallest reliable finger target, and it is the reason a bar column is wider than a step cell and the
 * resize affordance is a whole band rather than a 6 px grip. A probe measures these in the built app; keeping them
 * here means the probe and the component cannot disagree about what was promised.
 */
export const ARRANGEMENT_MIN_TARGET = 44;
/** Bar column width. Wider than the 44 px minimum so a bar number has room to sit in it. */
export const ARRANGEMENT_BAR_WIDTH = 48;
/** The band you grab to move a region. */
export const ARRANGEMENT_MOVE_BAND_HEIGHT = 56;
/**
 * The band you grab to repeat a region, along the bottom of the region.
 *
 * Why the bottom and not the right edge: a one-bar region is 48 px wide, so a 44 px-wide edge handle would leave
 * four pixels of "body" and the region could be resized but never moved — the two gestures would fight over the
 * same square. Stacking them keeps both targets at least 44 × 44 (the move band is a full bar wide and 56 tall, the
 * resize band a full bar wide and 44 tall) and makes the gesture unambiguous: the hand either grabs the block or
 * its bottom edge.
 */
export const ARRANGEMENT_RESIZE_BAND_HEIGHT = 44;
/** Region height: the two bands together. */
export const ARRANGEMENT_REGION_HEIGHT = ARRANGEMENT_MOVE_BAND_HEIGHT + ARRANGEMENT_RESIZE_BAND_HEIGHT;
/** Empty bars drawn past the end of the song, so a region can be dragged to the end without pixel precision. */
const TAIL_BARS = 2;

export interface ArrangementEdit {
  sections: SongSection[];
  /**
   * The gesture this edit belongs to.
   *
   * The host coalesces a *continuous* gesture into one undo entry, so a 200 px drag is one press of ⌘Z rather than
   * forty. The key is produced here because only the view knows whether an edit came from a drag or from a key.
   */
  gesture: string;
  /**
   * True while a pointer gesture is in flight.
   *
   * A drag emits an edit per pointer move and must coalesce; a key press or a button press is a discrete edit and
   * must not, or two quick deletions would collapse into one undo entry and the first one would become unreachable.
   */
  continuous: boolean;
}

export interface ArrangementPanelProps {
  song: Song;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (edit: ArrangementEdit) => void;
  onClose: () => void;
  /**
   * B5: replace the arrangement with a form. Optional, like every other host-provided action — a caller that has no
   * clip to generate from renders no generator rather than a button that does nothing.
   */
  onGenerate?: (form: ArrangementFormId) => void;
}

interface DragState {
  id: string;
  mode: "move" | "resize";
  startX: number;
  /** The dragged region's left edge and length when the gesture began. */
  startBar: number;
  startBars: number;
}

export const ArrangementPanel: React.FC<ArrangementPanelProps> = ({
  song,
  selectedId,
  onSelect,
  onChange,
  onClose,
  onGenerate,
}) => {
  const { t, language } = useLanguage();
  const locale = language === "zh" ? "zh" : "en";
  /**
   * The label being typed, kept locally until it is committed.
   *
   * One commit per keystroke would be one undo entry per keystroke (the store records history per `onChange`), so the
   * draft lives here and `commitLabel` runs on Enter or blur — the same reason the fader drags elsewhere in the
   * studio are coalesced.
   */
  const [labelDraft, setLabelDraft] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  /**
   * Take focus when the view opens.
   *
   * Without it `aria-modal` is a claim the DOM does not back: Escape would not reach the panel until something
   * inside it was clicked, and on a keyboard-only PC the first Tab would wander the toolbar behind the overlay.
   */
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const regions = useMemo(() => sectionRegions(song), [song]);
  const timeline = useMemo(() => resolveTimeline(song), [song]);
  // The lane is at least the song plus room to drop after the last region, and at least a screen's worth of bars so
  // an empty arrangement still shows a ruler rather than a blank strip.
  const laneBars = Math.max(timeline.totalBars + TAIL_BARS, 8);
  const laneWidth = laneBars * ARRANGEMENT_BAR_WIDTH;

  const beginDrag = (event: React.PointerEvent, region: SectionRegion, mode: DragState["mode"]) => {
    event.stopPropagation();
    // Select first: the drag may end outside the region, and the selection is what the arrow keys then address.
    onSelect(region.section.id);
    dragRef.current = {
      id: region.section.id,
      mode,
      startX: event.clientX,
      startBar: region.startBar,
      startBars: region.bars,
    };
    const target = event.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer (a test) has no capture; the gesture still works through the bubbled moves.
    }
  };

  const continueDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const barsMoved = Math.round((event.clientX - drag.startX) / ARRANGEMENT_BAR_WIDTH);
    if (drag.mode === "resize") {
      const next = resizeSection(song, drag.id, drag.startBars + barsMoved);
      if (next !== song)
        onChange({ sections: next.sections, gesture: `arrangement:resize:${drag.id}`, continuous: true });
      return;
    }
    const next = moveSection(song, drag.id, dropIndexForBar(song, drag.startBar + barsMoved));
    if (next !== song) onChange({ sections: next.sections, gesture: `arrangement:move:${drag.id}`, continuous: true });
  };

  const endDrag = (event: React.PointerEvent) => {
    const target = event.currentTarget as HTMLElement;
    try {
      target.releasePointerCapture(event.pointerId);
    } catch {
      // See `beginDrag`: nothing to release for a synthetic pointer.
    }
    dragRef.current = null;
  };

  const runCommand = (id: string, command: ArrangementCommand) => {
    const next = applyArrangementCommand(song, id, command);
    if (next === song) return;
    onChange({ sections: next.sections, gesture: `arrangement:${command}`, continuous: false });
    if (command === "remove") onSelect(null);
    if (command === "duplicate") {
      // Select the copy: a duplicate the user then has to hunt for is a duplicate they will make twice.
      const at = next.sections.findIndex((section) => section.id === id);
      onSelect(next.sections[at + 1]?.id ?? id);
    }
  };

  const onRegionKeyDown = (event: React.KeyboardEvent, id: string) => {
    const command = commandForKey(event.key, event.shiftKey, event.metaKey || event.ctrlKey);
    if (!command) return;
    event.preventDefault();
    // The panel's Escape (clear the selection, then close) must not also see this key.
    event.stopPropagation();
    runCommand(id, command);
  };

  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    if (selectedId) onSelect(null);
    else onClose();
  };

  const selected = song.sections.find((section) => section.id === selectedId) ?? null;

  const commitLabel = (id: string, value: string) => {
    setLabelDraft(null);
    const next = setSectionLabel(song, id, value);
    if (next !== song) onChange({ sections: next.sections, gesture: "arrangement:label", continuous: false });
  };

  const toggleMute = (id: string, lane: string) => {
    const next = toggleSectionMute(song, id, lane);
    if (next !== song) onChange({ sections: next.sections, gesture: "arrangement:mute", continuous: false });
  };

  /** The lanes of the clip the selected section points at — what a mute can silence. */
  const selectedLanes = selected ? (song.clips?.[selected.slot]?.tracks ?? []) : [];
  const regionName = (region: SectionRegion) =>
    region.section.label ?? `${t("arrangement_section_word")} ${regions.indexOf(region) + 1}`;

  return (
    <div
      ref={panelRef}
      data-testid="arrangement-panel"
      role="dialog"
      aria-modal="true"
      aria-label={t("arrangement_title")}
      tabIndex={-1}
      onKeyDown={onPanelKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn focus:outline-none"
    >
      <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
        {/* Header */}
        <header className="flex items-center gap-2 border-b border-line px-3 py-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-['JetBrains_Mono'] text-sm font-bold text-text">
              {t("arrangement_title")}
            </h2>
            <p className="truncate text-[11px] text-text-dim">{t("arrangement_hint")}</p>
          </div>
          <button
            type="button"
            data-testid="arrangement-close"
            onClick={onClose}
            aria-label={t("arrangement_close")}
            title={t("arrangement_close")}
            style={{ minHeight: ARRANGEMENT_MIN_TARGET, minWidth: ARRANGEMENT_MIN_TARGET }}
            className="flex items-center justify-center rounded-lg border border-line bg-panel2 px-3 text-text-sub transition-colors hover:border-accent/50 hover:text-accent"
          >
            ✕
          </button>
        </header>

        {/* B5 — the generator. Three forms, one click each: "there is no fill, no build, no variation" is fixed
            before the user has to place a single region by hand. */}
        {onGenerate && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <span className="font-['JetBrains_Mono'] text-[11px] text-text-dim">{t("arrangement_generate")}</span>
            {ARRANGEMENT_FORM_IDS.map((form) => (
              <button
                key={form}
                type="button"
                data-testid={`arrangement-form-${form}`}
                data-bars={formBars(form)}
                onClick={() => onGenerate(form)}
                title={`${locale === "zh" ? ARRANGEMENT_FORMS[form].summary.zh : ARRANGEMENT_FORMS[form].summary.en} · ${formBars(form)}`}
                aria-label={t("arrangement_form_aria", {
                  name: locale === "zh" ? ARRANGEMENT_FORMS[form].label.zh : ARRANGEMENT_FORMS[form].label.en,
                  bars: formBars(form),
                })}
                style={{ minHeight: ARRANGEMENT_MIN_TARGET, minWidth: ARRANGEMENT_MIN_TARGET }}
                className="rounded-lg border border-line bg-panel2 px-3 text-xs text-text-sub transition-colors hover:border-accent/50 hover:text-accent"
              >
                {locale === "zh" ? ARRANGEMENT_FORMS[form].label.zh : ARRANGEMENT_FORMS[form].label.en}
              </button>
            ))}
          </div>
        )}

        {/* The half-finished song has to be visible: the renderer refuses it with these reasons. */}
        {timeline.problems.length > 0 && (
          <div
            data-testid="arrangement-problems"
            className="border-b border-danger/40 bg-danger/10 px-3 py-1.5 text-[11px] text-warning"
          >
            <span className="font-bold">{t("arrangement_problems")}</span> {timeline.problems.join("; ")}
          </div>
        )}

        {/* Ruler + lane, scrolled together so a bar number always sits above its own bar. */}
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {regions.length === 0 ? (
            <div data-testid="arrangement-empty" className="flex h-full items-center justify-center text-xs text-text-dim">
              {t("arrangement_empty")}
            </div>
          ) : (
            <div style={{ width: laneWidth }} className="select-none">
              <div data-testid="arrangement-ruler" className="flex" role="presentation">
                {Array.from({ length: laneBars }, (_, bar) => (
                  <div
                    key={bar}
                    data-testid={`arrangement-bar-${bar}`}
                    data-bar={bar}
                    style={{ width: ARRANGEMENT_BAR_WIDTH, minWidth: ARRANGEMENT_BAR_WIDTH }}
                    className={`h-6 border-l border-line px-1 font-['JetBrains_Mono'] text-[10px] leading-6 ${
                      bar % 4 === 0 ? "text-text-sub" : "text-text-dim"
                    }`}
                  >
                    {bar + 1}
                  </div>
                ))}
              </div>

              <div
                data-testid="arrangement-lane"
                className="relative mt-1 rounded border border-line bg-panel2/50"
                style={{ height: ARRANGEMENT_REGION_HEIGHT, width: laneWidth }}
                onPointerDown={() => onSelect(null)}
              >
                {regions.map((region) => {
                  const isSelected = region.section.id === selectedId;
                  return (
                    <div
                      key={region.section.id}
                      data-testid={`arrangement-region-${region.section.id}`}
                      data-start-bar={region.startBar}
                      data-bars={region.bars}
                      data-slot={region.section.slot}
                      data-selected={isSelected ? "true" : "false"}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={t("arrangement_region_aria", {
                        name: regionName(region),
                        slot: region.section.slot,
                        bars: region.bars,
                      })}
                      onPointerDown={(event) => beginDrag(event, region, "move")}
                      onPointerMove={continueDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onKeyDown={(event) => onRegionKeyDown(event, region.section.id)}
                      style={{
                        left: region.startBar * ARRANGEMENT_BAR_WIDTH,
                        width: region.bars * ARRANGEMENT_BAR_WIDTH,
                        height: ARRANGEMENT_REGION_HEIGHT,
                      }}
                      className={`absolute top-0 flex touch-none flex-col overflow-hidden rounded border ${
                        isSelected
                          ? "border-accent bg-accent/25 text-text"
                          : "border-line bg-panel text-text-sub hover:border-accent/50"
                      }`}
                    >
                      {/* The move band: the block itself. A full bar wide, 56 px tall — a real finger target. */}
                      <span
                        data-testid={`arrangement-move-${region.section.id}`}
                        style={{ height: ARRANGEMENT_MOVE_BAND_HEIGHT }}
                        className="flex min-h-0 flex-1 cursor-grab items-center gap-1 px-2"
                      >
                        <span className="truncate font-['JetBrains_Mono'] text-[11px] font-bold">
                          {regionName(region)}
                        </span>
                        <span className="shrink-0 rounded bg-black/30 px-1 font-['JetBrains_Mono'] text-[10px]">
                          {region.section.slot}
                        </span>
                        <span className="shrink-0 font-['JetBrains_Mono'] text-[10px] text-text-dim">
                          {region.bars}×
                        </span>
                        {/* B5: what the section does, not just what it holds. */}
                        {region.section.overrides?.velocityRamp && (
                          <span
                            data-testid={`arrangement-build-${region.section.id}`}
                            className="shrink-0 rounded bg-accent/20 px-1 font-['JetBrains_Mono'] text-[10px] text-accent"
                          >
                            ↗
                          </span>
                        )}
                        {region.section.overrides?.fill && (
                          <span
                            data-testid={`arrangement-fill-${region.section.id}`}
                            className="shrink-0 rounded bg-accent/20 px-1 font-['JetBrains_Mono'] text-[10px] text-accent"
                          >
                            {t("arrangement_fill_badge")}
                          </span>
                        )}
                      </span>
                      {/*
                        The resize band, along the bottom of the region. It is a real 44 px target and it is *stacked*
                        rather than laid over the right edge, so a one-bar region can still be dragged as well as
                        resized (see `ARRANGEMENT_RESIZE_BAND_HEIGHT`).
                      */}
                      <span
                        data-testid={`arrangement-resize-${region.section.id}`}
                        role="separator"
                        aria-label={t("arrangement_resize_aria", { name: regionName(region) })}
                        onPointerDown={(event) => beginDrag(event, region, "resize")}
                        onPointerMove={continueDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        style={{ height: ARRANGEMENT_RESIZE_BAND_HEIGHT }}
                        className="flex shrink-0 cursor-ew-resize touch-none items-center justify-center gap-0.5 border-t border-line/60 bg-black/20"
                      >
                        <span className="h-3 w-0.5 rounded bg-text-dim" />
                        <span className="h-3 w-0.5 rounded bg-text-dim" />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* B5 leftovers: what a section *is*, not just where it sits — its name and which lanes it silences. */}
        {selected && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
            <input
              data-testid="arrangement-label"
              value={labelDraft ?? selected.label ?? ""}
              onChange={(event) => setLabelDraft(event.target.value)}
              onBlur={(event) => commitLabel(selected.id, event.target.value)}
              onKeyDown={(event) => {
                // The panel's Escape clears the selection; while typing it should abandon the draft instead.
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setLabelDraft(null);
                }
                if (event.key === "Enter") commitLabel(selected.id, (event.target as HTMLInputElement).value);
              }}
              placeholder={t("arrangement_label_placeholder")}
              maxLength={32}
              style={{ minHeight: ARRANGEMENT_MIN_TARGET }}
              className="min-w-[10rem] rounded-lg border border-line bg-panel2 px-3 text-xs text-text focus:border-accent focus:outline-none"
            />
            {selectedLanes.map((lane) => {
              const laneId = lane.track_id;
              const muted = (selected.mute ?? []).includes(laneId);
              return (
                <button
                  key={laneId}
                  type="button"
                  data-testid={`arrangement-mute-${laneId}`}
                  aria-pressed={muted}
                  title={t("arrangement_mute_hint", { lane: laneId })}
                  onClick={() => toggleMute(selected.id, laneId)}
                  style={{ minHeight: ARRANGEMENT_MIN_TARGET, minWidth: ARRANGEMENT_MIN_TARGET }}
                  className={`rounded-lg border px-3 font-['JetBrains_Mono'] text-[11px] transition-colors ${
                    muted
                      ? "border-danger/60 bg-danger/20 text-warning"
                      : "border-line bg-panel2 text-text-sub hover:border-accent/50 hover:text-accent"
                  }`}
                >
                  {muted ? `${laneId} ✕` : laneId}
                </button>
              );
            })}
          </div>
        )}

        {/* Footer: the same edits the drag and the keyboard make, as buttons a finger can hit. */}
        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
          {selected ? (
            <span className="mr-auto font-['JetBrains_Mono'] text-[11px] text-text-dim">
              {t("arrangement_selected", { name: selected.label ?? selected.slot, bars: selected.bars })}
            </span>
          ) : (
            <span className="mr-auto text-[11px] text-text-dim">{t("arrangement_select_hint")}</span>
          )}
          <ArrangementButton
            testId="arrangement-shrink"
            label={t("arrangement_shrink")}
            disabled={!selected || selected.bars <= 1}
            onClick={() => selected && runCommand(selected.id, "shrink")}
          />
          <ArrangementButton
            testId="arrangement-grow"
            label={t("arrangement_grow")}
            disabled={!selected}
            onClick={() => selected && runCommand(selected.id, "grow")}
          />
          <ArrangementButton
            testId="arrangement-duplicate"
            label={t("arrangement_duplicate")}
            disabled={!selected}
            onClick={() => selected && runCommand(selected.id, "duplicate")}
          />
          <ArrangementButton
            testId="arrangement-remove"
            label={t("arrangement_remove")}
            disabled={!selected}
            onClick={() => selected && runCommand(selected.id, "remove")}
          />
        </footer>
      </div>
    </div>
  );
};

const ArrangementButton: React.FC<{
  testId: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}> = ({ testId, label, disabled, onClick }) => (
  <button
    type="button"
    data-testid={testId}
    disabled={disabled}
    onClick={onClick}
    style={{ minHeight: ARRANGEMENT_MIN_TARGET, minWidth: ARRANGEMENT_MIN_TARGET }}
    className="rounded-lg border border-line bg-panel2 px-3 text-xs text-text-sub transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
  >
    {label}
  </button>
);
