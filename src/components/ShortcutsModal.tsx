import React from "react";
import { Modal } from "../ui/Modal";
import { useLanguage } from "../i18n/LanguageContext";
import { Keyboard, Navigation, Music, HelpCircle, BookOpen } from "lucide-react";

/**
 * ⭐ **Where the modal is being read from, because the list it prints is not equally true everywhere.**
 *
 * `?` is a global key and this modal is mounted above every route, but the keys under
 * "Studio Sequencer Shortcuts" are handled by `useTransportShortcuts`, which **only `StudioView` mounts** —
 * on `/new` there is no listener at all and no undo history for it to walk. The owner opened `?` on `/new`
 * and read "Undo pattern change Ctrl+Z" for a route that has no undo: a shortcut reference is a promise, and
 * this one was being made outside the view that keeps it.
 *
 * The industry answer is the one taken here: Ableton Live's own `?` opens the **Info View**, which the manual
 * describes as "context-sensitive help", and its keyboard-shortcut reference is sectioned by the view the keys
 * belong to (Clip View Sample Editor, Session View, Arrangement View …); Logic's manual separates **global**
 * key commands — those that "work regardless of which window is active" — from the window-specific remainder.
 * So the global rows stay everywhere, and the sequencer rows are shown only where the sequencer is.
 *
 * **The default is the honest side of the trade.** A caller that does not say where the modal is read from gets
 * `"global"`: it under-promises instead of advertising a key that may do nothing.
 */
export type ShortcutScope = "studio" | "global";

export interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenHelp?: () => void;
  /** `"studio"` only where the sequencer's own key listener is mounted — see `ShortcutScope`. */
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
