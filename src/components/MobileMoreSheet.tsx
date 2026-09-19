import React, { useEffect, useRef } from "react";
import { ChevronRight, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { MOBILE_SHEET_GROUPS, type MobileSheetAction } from "./MobileTabBar";
import type { NavTab } from "./Header";

export interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
  onSelectTab: (tab: NavTab) => void;
  onAction: (action: MobileSheetAction["id"]) => void;
}

/**
 * The one sheet behind the phone's fifth tab: every view that does not deserve a permanent tab.
 *
 * Built as a bottom sheet rather than a full-screen menu because a native app presents secondary
 * navigation this way — it keeps the current context visible at the top, it is reachable with a
 * thumb, and dismissing it is a short downward drag rather than hunting a close button. Rows are
 * 56 px so a row is a comfortable target even with a label and a description.
 *
 * Dismissal is deliberately generous (backdrop tap, the X, Escape, or a downward drag) because on
 * a phone the commonest failure of a sheet is that people cannot work out how to get rid of it.
 */
export const MobileMoreSheet: React.FC<MobileMoreSheetProps> = ({
  open,
  onClose,
  onSelectTab,
  onAction,
}) => {
  const { t } = useLanguage();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragStartYRef = useRef<number | null>(null);

  // Escape closes, matching every other overlay in the app.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Focus the sheet so a keyboard/switch user lands inside it rather than behind the backdrop.
  useEffect(() => {
    if (open) sheetRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end" data-testid="mobile-more-sheet">
      {/* Backdrop: a tap anywhere outside the sheet dismisses it. */}
      <button
        type="button"
        aria-label={t("mobile_more_close")}
        data-testid="mobile-more-backdrop"
        onClick={onClose}
        onPointerUp={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("mobile_more_title")}
        tabIndex={-1}
        className="relative z-10 max-h-[82dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl border-t border-line bg-panel pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-2xl outline-none"
        onPointerDown={(e) => {
          dragStartYRef.current = e.clientY;
        }}
        onPointerUp={(e) => {
          const start = dragStartYRef.current;
          dragStartYRef.current = null;
          // A deliberate downward drag from the grab handle area closes the sheet.
          if (start !== null && e.clientY - start > 60) onClose();
        }}
      >
        {/* Grab handle: the affordance that says "this sheet can be dragged away". */}
        <div className="flex justify-center pt-2.5 pb-1">
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-line" />
        </div>

        <div className="flex items-center justify-between px-5 pb-2">
          <h2 className="text-sm font-bold text-text">{t("mobile_more_title")}</h2>
          <button
            type="button"
            onClick={onClose}
            onPointerUp={onClose}
            aria-label={t("mobile_more_close")}
            data-testid="mobile-more-close"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-text-sub"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {MOBILE_SHEET_GROUPS.map((group) => (
          <section key={group.titleKey} className="px-3 pb-2">
            <h3 className="px-2 pb-1 pt-2 font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-[0.12em] text-text-dim">
              {t(group.titleKey)}
            </h3>
            <ul>
              {group.items.map((item) => (
                <li key={item.kind === "tab" ? `tab-${item.tab}` : `action-${item.id}`}>
                  <button
                    type="button"
                    data-testid={
                      item.kind === "tab" ? `mobile-sheet-tab-${item.tab}` : `mobile-sheet-action-${item.id}`
                    }
                    onPointerUp={(e) => {
                      e.preventDefault();
                      if (item.kind === "tab") onSelectTab(item.tab);
                      else onAction(item.id);
                    }}
                    className="flex min-h-[56px] w-full items-center gap-3 rounded-xl px-2 text-left transition-colors active:bg-panel2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-text">
                        {t(item.labelKey)}
                      </span>
                      <span className="block truncate text-[11px] leading-tight text-text-dim">
                        {t(item.descKey)}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-text-dim" />
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
