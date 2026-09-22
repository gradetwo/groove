import React, { useRef } from "react";
import { ChevronRight, X } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import type { DrumKitType } from "../../audio/DrumKitModels";
import type { MobileEditMode } from "./Toolbar";

/**
 * The phone's "everything else" sheet for the studio.
 *
 * The compact transport bar carries play, bar navigation, tempo and undo. Every other sequencer
 * control lives here rather than in the toolbar, because the honest answer to "does this belong
 * on a phone" is different for a metronome and a blind-A/B compare toggle — and the desktop
 * toolbar's answer was "all of them, always visible" on a 390 px screen.
 *
 * Each row states the shortcut it mirrors on a desktop, so the two surfaces stay learnable as one
 * app rather than two.
 */
export interface StudioSheetAction {
  id: string;
  labelKey: string;
  descKey?: string;
  /**
   * Interpolation values for `descKey`.
   *
   * Needed because a sheet row has to be able to show live state — "Bar 2 of 4" — and the
   * alternative was a second row type that renders arbitrary text, i.e. a hole in the sheet's
   * model for one case.
   */
  descParams?: Record<string, string | number>;
  /** Mirrors the desktop keyboard binding, shown as a hint. */
  shortcut?: string;
  /** A toggle row shows its current state instead of a chevron. */
  toggle?: { on: boolean; onToggle: () => void };
  /** A radio row shows which option is active. */
  selected?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
}

export interface StudioSheetGroup {
  titleKey: string;
  actions: StudioSheetAction[];
}

export interface MobileStudioSheetProps {
  open: boolean;
  onClose: () => void;
  groups: StudioSheetGroup[];
}

export const MobileStudioSheet: React.FC<MobileStudioSheetProps> = ({ open, onClose, groups }) => {
  const { t } = useLanguage();
  /** Y where a handle drag began; the gesture is scoped to the handle (see its comment). */
  const dragStartYRef = useRef<number | null>(null);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-end" data-testid="mobile-studio-sheet">
      <button
        type="button"
        aria-label={t("mobile_more_close")}
        data-testid="mobile-studio-sheet-backdrop"
        onClick={onClose}
        onPointerUp={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("mobile_studio_sheet_title")}
        className="relative z-10 max-h-[80dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl border-t border-line bg-panel pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-2xl"
      >
        {/*
          The drag-to-dismiss gesture is scoped to this handle, not to the whole sheet.
          
          It used to be on the container with no guard, so *any* pointerup more than 60 px below
          its pointerdown closed the sheet — including the pointerup that ends a normal tap on a
          row, whenever a real click lands a little low. On touch that reads as "tapping the
          bottom row closes the sheet instead of choosing it", and the E2E matrix reproduced it as
          the row vanishing mid-click. A handle is also the honest affordance: it is what tells a
          user the sheet can be dragged at all.
        */}
        <div
          data-testid="mobile-studio-sheet-handle"
          onPointerDown={(e) => {
            dragStartYRef.current = e.clientY;
          }}
          onPointerUp={(e) => {
            const start = dragStartYRef.current;
            dragStartYRef.current = null;
            if (start !== null && e.clientY - start > 60) onClose();
          }}
          className="flex touch-none justify-center pt-2.5 pb-1"
        >
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-line" />
        </div>
        <div className="flex items-center justify-between px-5 pb-2">
          <h2 className="text-sm font-bold text-text">{t("mobile_studio_sheet_title")}</h2>
          <button
            type="button"
            onClick={onClose}
            onPointerUp={onClose}
            aria-label={t("mobile_more_close")}
            data-testid="mobile-studio-sheet-close"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-text-sub"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {groups.map((group) => (
          <section key={group.titleKey} className="px-3 pb-2">
            <h3 className="px-2 pb-1 pt-2 font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-[0.12em] text-text-dim">
              {t(group.titleKey)}
            </h3>
            <ul>
              {group.actions.map((action) => (
                <li key={action.id}>
                  <button
                    type="button"
                    data-testid={`mobile-studio-action-${action.id}`}
                    aria-pressed={action.toggle ? action.toggle.on : undefined}
                    aria-checked={action.selected}
                    disabled={action.disabled}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      if (action.disabled) return;
                      if (action.toggle) {
                        // A toggle stays open: a user flicking metronome on and count-in off
                        // should not have to re-open the sheet between the two.
                        action.toggle.onToggle();
                        return;
                      }
                      action.onSelect?.();
                      onClose();
                    }}
                    className="flex min-h-[56px] w-full items-center gap-3 rounded-xl px-2 text-left transition-colors active:bg-panel2 disabled:opacity-40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-text">
                        {t(action.labelKey)}
                      </span>
                      {action.descKey && (
                        <span className="block truncate text-[11px] leading-tight text-text-dim">
                          {t(action.descKey, action.descParams)}
                        </span>
                      )}
                    </span>
                    {action.toggle ? (
                      <span
                        aria-hidden="true"
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                          action.toggle.on ? "bg-accent" : "bg-line"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-bg transition-all ${
                            action.toggle.on ? "left-[22px]" : "left-0.5"
                          }`}
                        />
                      </span>
                    ) : (
                      <>
                        {action.selected && (
                          <span
                            aria-hidden="true"
                            className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent"
                          />
                        )}
                        {action.shortcut && (
                          <span className="shrink-0 font-['JetBrains_Mono'] text-[9px] text-text-dim">
                            {action.shortcut}
                          </span>
                        )}
                        <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-text-dim" />
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
};

/** Builds the studio sheet's groups from the panel's own callbacks. */
export function buildStudioSheetGroups(input: {
  isMetronome: boolean;
  isCountIn: boolean;
  isRecordArmed: boolean;
  isDrumsOnly: boolean;
  isSongMode: boolean;
  isBlindCompare: boolean;
  drumKit: DrumKitType;
  mobileEditMode: MobileEditMode;
  onToggleMetronome: () => void;
  onToggleCountIn: () => void;
  onToggleRecordArmed: () => void;
  onToggleDrumsOnly: () => void;
  onToggleSongMode: () => void;
  onToggleBlindCompare: () => void;
  onChangeDrumKit: (kit: DrumKitType) => void;
  onChangeMobileEditMode: (mode: MobileEditMode) => void;
  onToggleVelocityLane: () => void;
  /**
   * Opens the phone's note-editing help. The piano roll itself is not offered on a phone, so this
   * is what its entry point became: an explanation plus a route to the Chords view, rather than a
   * button that opens a surface too large to navigate.
   */
  onShowNoteEditingHelp?: () => void;
  onOpenEuclidean: () => void;
  onOpenProjectHub: () => void;
  onOpenExport: () => void;
  /** MP3 is a second row rather than a menu: on a phone the sheet *is* the menu. */
  onOpenExportMp3?: () => void;
  onQuickAction?: () => void;
  onToggleConsole?: () => void;
  onToggleAnalyzer: () => void;
  onOpenAudioSettings?: () => void;
  /**
   * Bar navigation, for the shapes where the transport bar does not carry it.
   *
   * A landscape phone drops the transport's ◀ 1/4 ▶ cluster because the two fixed bars cost 29 %
   * of its 390 px of height (`PRODUCT_PLAN_v2.1.0.md` §G.5). Dropping it from the *transport* is
   * only acceptable if it appears somewhere, so these rows are how the capability is kept: the same
   * two controls, one tap deeper, with the current position in each row's description. Omitted
   * entirely in portrait, where the transport shows them and a second copy would be a duplicate
   * rather than a fallback.
   */
  barNav?: {
    viewedBar: number;
    barCount: number;
    onPrev: () => void;
    onNext: () => void;
  };
}): StudioSheetGroup[] {
  const drumKits: DrumKitType[] = ["808", "909", "acoustic", "cyber"];
  const barNavGroup: StudioSheetGroup[] = input.barNav
    ? [
        {
          titleKey: "mobile_sheet_bar_nav",
          actions: [
            {
              id: "prev-bar",
              labelKey: "toolbar_bar_prev",
              descKey: "mobile_sheet_bar_position",
              descParams: {
                current: Math.min(input.barNav.viewedBar + 1, Math.max(1, input.barNav.barCount)),
                total: Math.max(1, input.barNav.barCount),
              },
              disabled: input.barNav.viewedBar <= 0,
              onSelect: input.barNav.onPrev,
            },
            {
              id: "next-bar",
              labelKey: "toolbar_bar_next",
              descKey: "mobile_sheet_bar_position",
              descParams: {
                current: Math.min(input.barNav.viewedBar + 1, Math.max(1, input.barNav.barCount)),
                total: Math.max(1, input.barNav.barCount),
              },
              disabled: input.barNav.viewedBar >= input.barNav.barCount - 1,
              onSelect: input.barNav.onNext,
            },
          ],
        },
      ]
    : [];
  return [
    ...barNavGroup,
    {
      titleKey: "mobile_sheet_playback",
      actions: [
        { id: "metronome", labelKey: "toolbar_metronome_label", shortcut: "K", toggle: { on: input.isMetronome, onToggle: input.onToggleMetronome } },
        { id: "count-in", labelKey: "toolbar_count_in_title", toggle: { on: input.isCountIn, onToggle: input.onToggleCountIn } },
        { id: "record", labelKey: "toolbar_record_title", toggle: { on: input.isRecordArmed, onToggle: input.onToggleRecordArmed } },
        { id: "drums-only", labelKey: "toolbar_drums_only_label", shortcut: "D", toggle: { on: input.isDrumsOnly, onToggle: input.onToggleDrumsOnly } },
        { id: "song-mode", labelKey: "toolbar_song_mode_title", toggle: { on: input.isSongMode, onToggle: input.onToggleSongMode } },
        { id: "blind-compare", labelKey: "toolbar_blind_label", toggle: { on: input.isBlindCompare, onToggle: input.onToggleBlindCompare } },
      ],
    },
    {
      titleKey: "mobile_sheet_edit",
      actions: [
        // The kit selector is a radio, not a switch: tapping a kit chooses it and closes, and the
        // row shows which one is current rather than an on/off state.
        ...drumKits.map((kit) => ({
          id: `drum-kit-${kit}`,
          labelKey: "toolbar_drum_kit_label",
          
          onSelect: () => input.onChangeDrumKit(kit),
          selected: input.drumKit === kit,
        })),
        {
          id: "velocity-lane",
          labelKey: "toolbar_velocity_label",
          shortcut: "V",
          toggle: { on: true, onToggle: input.onToggleVelocityLane },
        },
        ...(input.onShowNoteEditingHelp
          ? [
              {
                id: "note-editing",
                labelKey: "mobile_note_editing_label",
                descKey: "mobile_note_editing_desc",
                onSelect: input.onShowNoteEditingHelp,
              },
            ]
          : []),
        { id: "euclidean", labelKey: "toolbar_euclid_label", shortcut: "E", onSelect: input.onOpenEuclidean },
      ],
    },
    {
      titleKey: "mobile_sheet_project",
      actions: [
        { id: "project-hub", labelKey: "toolbar_project_hub_title", onSelect: input.onOpenProjectHub },
        { id: "export", labelKey: "toolbar_export_wav", onSelect: input.onOpenExport },
        ...(input.onOpenExportMp3
          ? [{ id: "export-mp3", labelKey: "toolbar_export_mp3", onSelect: input.onOpenExportMp3 }]
          : []),
        ...(input.onQuickAction ? [{ id: "inspire", labelKey: "toolbar_inspire_label", onSelect: input.onQuickAction }] : []),
      ],
    },
    {
      titleKey: "mobile_sheet_view",
      actions: [
        ...(input.onToggleConsole
          ? [{ id: "console", labelKey: "nav_console", onSelect: input.onToggleConsole }]
          : []),
        { id: "analyzer", labelKey: "nav_analyzer", onSelect: input.onToggleAnalyzer },
        ...(input.onOpenAudioSettings
          ? [{ id: "audio-settings", labelKey: "settings_open", onSelect: input.onOpenAudioSettings }]
          : []),
      ],
    },
  ];
}
