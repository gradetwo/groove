/**
 * The phone shell (M-series, `PRODUCT_PLAN_v2.1.0.md` §M).
 *
 * A separate surface from the desktop app: five modules at the bottom, each phone-shaped, sharing one
 * visual language (dark brown ground, one amber accent, monospace numerals). It is reached by its own
 * route (`/m/<module>`, see `src/app/router.tsx`), which is deliberate during the rebuild — the
 * existing phone UI keeps working and keeps being tested while the new one is built up module by
 * module. When every module here is real, the old phone shell is deleted and this becomes the phone
 * application.
 *
 * What this file owns: the frame (ground, gold glow, safe areas, scroll container) and the routing of
 * a module id to a screen. What it does not own: any audio authoring, any genre data.
 */
import React, { Suspense } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { MobileModuleTabBar } from "./MobileModuleTabBar";
import { MOBILE_MODULE_PLAN_KEYS, type MobileModule } from "./mobileModules";
import "./mobile.css";

const MobileHomeScreen = React.lazy(() =>
  import("./screens/MobileHomeScreen").then((m) => ({ default: m.MobileHomeScreen }))
);

export interface MobileAppProps {
  module: MobileModule;
  genreId?: string;
  onSelectModule: (module: MobileModule) => void;
  onOpenGenre?: (genreId: string) => void;
}

export function MobileApp({ module, onSelectModule, onOpenGenre }: MobileAppProps) {
  const { t } = useLanguage();

  return (
    <div className="mobile-root relative min-h-[100dvh] w-full" data-testid="mobile-shell" data-module={module}>
      {/* Scroll container: the bar is fixed, so the content reserves its height plus the safe area. */}
      <main
        className="relative z-10 mx-auto min-h-[100dvh] w-full max-w-[432px]"
        style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}
      >
        <header className="flex items-center justify-between px-4 pt-4 pb-1">
          <div className="flex items-baseline gap-2">
            <span className="m-mono text-[12px] font-bold tracking-[0.24em] text-[var(--m-gold)]">
              GROOVE
            </span>
            <span className="text-[10px] tracking-[0.1em] text-[var(--m-ink-2)]">
              {t("mobile_shell_title")}
            </span>
          </div>
        </header>

        <Suspense
          fallback={
            <div className="px-4 py-6 text-[12px] text-[var(--m-ink-3)]" data-testid="mobile-shell-loading">
              …
            </div>
          }
        >
          {module === "home" ? (
            <MobileHomeScreen onOpenGenre={onOpenGenre} />
          ) : (
            <ModulePlaceholder module={module} />
          )}
        </Suspense>
      </main>

      <MobileModuleTabBar active={module} onSelect={onSelectModule} />
    </div>
  );
}

/**
 * What a not-yet-rebuilt module shows.
 *
 * A placeholder is honest; a stripped-down desktop view would not be. The card names the module's
 * planned contents from the plan itself, so the screen tells the reader what is coming instead of
 * looking broken.
 */
function ModulePlaceholder({ module }: { module: MobileModule }) {
  const { t } = useLanguage();
  return (
    <section className="m-rise px-4 pt-2" data-testid={`mobile-module-${module}-placeholder`}>
      <h1 className="text-[22px] font-bold leading-none">{t(`mobile_module_${module}`)}</h1>
      <div className="mt-4 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] p-4">
        <p className="m-mono text-[10px] uppercase tracking-[0.24em] text-[var(--m-gold)]">
          {t("mobile_module_building")}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--m-ink-2)]">
          {t(MOBILE_MODULE_PLAN_KEYS[module])}
        </p>
      </div>
    </section>
  );
}
