/**
 * Phone module tab bar: five destinations, always visible, never a sheet.
 *
 * The desktop app hides thirteen destinations behind a hamburger; a phone cannot afford that, so the
 * five modules live in a fixed bottom bar where a thumb already is. Five is the measured ceiling for a
 * 390 px width with an 11 px label over a 44 px target — the same conclusion the previous phone shell
 * reached, which is why this one keeps the count and changes only the destinations.
 *
 * Accessibility: real `<button>`s in a `<nav aria-label>`, the active one carrying `aria-current`, and
 * every tab carrying a visible text label (an icon-only bar is undiscoverable on a device with no
 * hover).
 */
import React from "react";
import { Compass, Home, MoreHorizontal, SlidersHorizontal, Swords } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import {
  MOBILE_MODULES,
  MOBILE_MODULE_LABEL_KEYS,
  type MobileModule,
} from "./mobileModules";

const ICONS: Record<MobileModule, React.ReactNode> = {
  home: <Home className="h-5 w-5" aria-hidden="true" />,
  jam: <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />,
  challenge: <Swords className="h-5 w-5" aria-hidden="true" />,
  explore: <Compass className="h-5 w-5" aria-hidden="true" />,
  more: <MoreHorizontal className="h-5 w-5" aria-hidden="true" />,
};

export interface MobileModuleTabBarProps {
  active: MobileModule;
  onSelect: (module: MobileModule) => void;
}

export function MobileModuleTabBar({ active, onSelect }: MobileModuleTabBarProps) {
  const { t } = useLanguage();
  return (
    <nav
      aria-label={t("mobile_nav_label")}
      data-testid="mobile-module-bar"
      className="m-mono fixed bottom-0 left-1/2 z-30 flex w-full max-w-[432px] -translate-x-1/2 border-t border-[var(--m-line)] bg-[rgba(14,12,8,0.9)] backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {MOBILE_MODULES.map((module) => {
        const isActive = module === active;
        return (
          <button
            key={module}
            type="button"
            data-testid={`mobile-module-${module}`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelect(module)}
            className={`m-press relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 pt-2.5 pb-2 text-[11px] leading-none ${
              isActive ? "text-[var(--m-gold)]" : "text-[var(--m-ink-3)]"
            }`}
          >
            {/* Active underline, above the icon (reference: 2px bar at 28% insets). */}
            <span
              aria-hidden="true"
              className={`absolute -top-px left-[28%] right-[28%] h-0.5 rounded-full ${
                isActive ? "bg-[var(--m-gold)]" : "bg-transparent"
              }`}
            />
            {ICONS[module]}
            <span>{t(MOBILE_MODULE_LABEL_KEYS[module])}</span>
          </button>
        );
      })}
    </nav>
  );
}
