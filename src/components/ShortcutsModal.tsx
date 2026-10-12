import React from "react";
import { Modal } from "../ui/Modal";
import { useLanguage } from "../i18n/LanguageContext";
import { Keyboard, Navigation, Music, BookOpen } from "lucide-react";

/**
 * ⭐ **Where the modal is being read from, because the list it prints is not equally true everywhere.**
 *
 * `?` is a global key and this modal is mounted above every route, but each surface's keys are handled by a listener
 * that surface mounts: `useTransportShortcuts` only by `StudioView`, and the arrangement's undo/redo listener only by
 * `ArrangementViewV2`, which only `/new` renders. A shortcut printed on a route whose listener is not mounted is a
 * promise that route cannot keep — and the owner read exactly that on `/new`: "Undo pattern change Ctrl+Z" on a page
 * that had no undo at all.
 *
 * The industry answer is the one taken here: Ableton Live's own `?` opens the **Info View**, which the manual
 * describes as "context-sensitive help", and its keyboard-shortcut reference is sectioned by the view the keys belong
 * to (Clip View Sample Editor, Session View, Arrangement View …); Logic's manual separates **global** key commands —
 * those that "work regardless of which window is active" — from the window-specific remainder. So the global rows stay
 * everywhere, and each surface's own rows are shown only where that surface is.
 *
 * ⭐ **The arrangement is the second surface, and its rows exist because the route now keeps them.** Ctrl+Z was
 * previously hidden on `/new` *because it truly did nothing there* — that was the honest half of a missing feature, not
 * the fix. The fix is the other half: `ArrangementViewV2` has a history and a key listener now, so the arrangement's
 * section prints them. **The invariant is unchanged and is the point of this file**: everything printed here is
 * available where it is printed.
 *
 * **The default is the honest side of the trade.** A caller that does not say where the modal is read from gets
 * `"global"`: it under-promises instead of advertising a key that may do nothing.
 */
export type ShortcutScope = "studio" | "arrangement" | "global";

export interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenHelp?: () => void;
  /** Which surface's keys this reading of the modal may promise — see `ShortcutScope`. */
  scope?: ShortcutScope;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose, onOpenHelp, scope = "global" }) => {
  const { t, isZh } = useLanguage();
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const modKey = isMac ? "⌘" : "Ctrl";

  const navigationShortcuts = [
    { keys: ["g", "s"], desc: t("shortcut_nav_studio") },
    { keys: ["g", "c"], desc: t("shortcut_nav_chords") },
    { keys: ["g", "g"], desc: t("shortcut_nav_galaxy") },
    { keys: ["g", "t"], desc: t("shortcut_nav_timeline") },
    { keys: ["g", "v"], desc: t("shortcut_nav_story") },
    { keys: ["g", "m"], desc: t("shortcut_nav_compare") },
    { keys: ["g", "q"], desc: t("shortcut_nav_challenge") },
    { keys: ["g", "r"], desc: t("shortcut_nav_masterclasses") },
    { keys: ["g", "z"], desc: t("shortcut_nav_analyzer") },
    { keys: ["g", "k"], desc: t("shortcut_nav_kick") },
    { keys: [modKey, "K"], desc: t("shortcut_nav_search") },
    { keys: ["?"], desc: t("shortcut_nav_panel") },
    { keys: ["Esc"], desc: t("shortcut_nav_close") },
  ];

  const studioShortcuts = [
    { keys: ["Space"], desc: t("shortcut_studio_play_pause") },
    { keys: ["D"], desc: t("shortcut_studio_drums_only") },
    { keys: ["O"], desc: t("shortcut_studio_scope") },
    { keys: [modKey, "Z"], desc: t("shortcut_studio_undo") },
    { keys: [modKey, isMac ? "⇧Z" : "Y"], desc: t("shortcut_studio_redo") },
    { keys: ["↑", "↓", "←", "→"], desc: t("shortcut_studio_grid_navigate") },
    { keys: ["Enter", "Space"], desc: t("shortcut_studio_toggle_step") },
    { keys: ["Home", "End"], desc: t("shortcut_studio_jump_edges") },
    { keys: ["V"], desc: t("shortcut_studio_velocity") },
    { keys: ["E"], desc: t("shortcut_studio_euclidean") },
    { keys: [isMac ? "⌥" : "Alt", "K"], desc: t("shortcut_studio_musical_typing") },
  ];

  /**
   * ⭐ **The arrangement's own keys, and only the ones it really binds.**
   *
   * `ArrangementViewV2` binds `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` and `Ctrl/Cmd+Y` — and nothing else, so nothing else is
   * listed. **Three rows, not an inventory**: the roll and the lane are edited by pointer, not by a key, and printing a
   * key that no listener answers is the exact defect this scope mechanism exists to prevent.
   *
   * ⚠️ **Both redo spellings are printed, unlike the studio's `isMac ? "⇧Z" : "Y"` ternary, and the difference is
   * real rather than a second convention.** The studio's listener reads `isMac ? metaKey : ctrlKey`, so on Windows and
   * Linux it genuinely does not answer `Ctrl+Shift+Z` and the ternary is the accurate spelling *there*. The
   * arrangement's listener accepts either modifier and both aliases on every platform, so printing both here is what
   * is true here — the invariant is unchanged, only its spelling is allowed to differ per surface.
   */
  const arrangementShortcuts = [
    { keys: [modKey, "Z"], desc: t("shortcut_arrangement_undo") },
    { keys: [modKey, "⇧Z"], desc: t("shortcut_arrangement_redo") },
    { keys: [modKey, "Y"], desc: t("shortcut_arrangement_redo_alias") },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("shortcut_modal_title")}
      className="max-w-2xl"
    >
      <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1">
        {/* Navigation Section */}
        <div>
          <div className="flex items-center gap-2 text-accent text-xs font-bold uppercase tracking-wider mb-3">
            <Navigation className="w-4 h-4" />
            <span>{t("shortcut_section_navigation")}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {navigationShortcuts.map((sc, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 rounded-xl bg-panel2 border border-line-subtle"
              >
                <span className="text-xs text-text-sub font-medium">{sc.desc}</span>
                <div className="flex items-center gap-1">
                  {sc.keys.map((k, kIdx) => (
                    <kbd
                      key={kIdx}
                      className="px-2 py-0.5 min-w-[22px] text-center text-xs font-mono font-bold bg-[#1d2028] text-text border border-line rounded shadow-sm"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Studio Sequencer Section — only where that listener is mounted (see `ShortcutScope`). */}
        <div>
          <div className="flex items-center gap-2 text-[#45e0c9] text-xs font-bold uppercase tracking-wider mb-3">
            <Music className="w-4 h-4" />
            <span>{t("shortcut_section_studio")}</span>
          </div>
          {scope === "studio" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {studioShortcuts.map((sc, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-panel2 border border-line-subtle"
                >
                  <span className="text-xs text-text-sub font-medium">{sc.desc}</span>
                  <div className="flex items-center gap-1">
                    {sc.keys.map((k, kIdx) => (
                      <kbd
                        key={kIdx}
                        className="px-2 py-0.5 min-w-[22px] text-center text-xs font-mono font-bold bg-[#1d2028] text-text border border-line rounded shadow-sm"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /**
             * Said rather than left blank: a section that silently loses half its rows reads as a bug, and a
             * person who saw the sequencer keys here yesterday deserves the sentence that tells them where the
             * keys went. It names no key it cannot keep.
             */
            <p data-testid="shortcut-studio-scope-note" className="text-xs text-text-sub">
              {t("shortcut_studio_scope_note")}
            </p>
          )}
        </div>

        {/**
         * ⭐ **The arrangement's section — where `/new` is, and the row that used to be missing on purpose.**
         *
         * This is the other half of the `scope` rule rather than an exception to it. The rule has always been "print
         * only what the current surface keeps"; hiding Ctrl+Z on `/new` was correct while the arrangement had no
         * history, and it stops being correct the moment one exists — leaving it hidden would be the same defect
         * inverted, a reference that stays silent about a key that now works.
         */}
        <div>
          <div className="flex items-center gap-2 text-accent text-xs font-bold uppercase tracking-wider mb-3">
            <Keyboard className="w-4 h-4" />
            <span>{t("shortcut_section_arrangement")}</span>
          </div>
          {scope === "arrangement" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {arrangementShortcuts.map((sc, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-panel2 border border-line-subtle"
                >
                  <span className="text-xs text-text-sub font-medium">{sc.desc}</span>
                  <div className="flex items-center gap-1">
                    {sc.keys.map((k, kIdx) => (
                      <kbd
                        key={kIdx}
                        className="px-2 py-0.5 min-w-[22px] text-center text-xs font-mono font-bold bg-[#1d2028] text-text border border-line rounded shadow-sm"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /** The same "said rather than left blank" rule the studio's section follows, and it names no key it cannot keep. */
            <p data-testid="shortcut-arrangement-scope-note" className="text-xs text-text-sub">
              {t("shortcut_arrangement_scope_note")}
            </p>
          )}
        </div>

        {/* Link to Full Manual & Tutorials */}
        {onOpenHelp && (
          <div className="pt-3 border-t border-line/60 flex items-center justify-between">
            <span className="text-xs text-text-sub">
              {isZh ? "需要完整的声学实验与编曲教学？" : "Need complete DAW & acoustic tutorials?"}
            </span>
            <button
              onClick={() => {
                onClose();
                onOpenHelp();
              }}
              className="text-xs text-accent hover:underline flex items-center gap-1 font-semibold"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{t("help_mobile_entry_label")}</span>
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};
