/**
 * 更多 (the more module, M7).
 *
 * The one screen that owns "everything else": settings, the changelog, the manual, the language
 * switch, search and the version. It is a list of six rows and no controls of its own — the phone's
 * answer to the desktop's thirteen destinations plus its modal set, which is exactly the trade the
 * brief asks for ("绝不密密麻麻堆砌按钮").
 *
 * The rows open the panels the app already has (`SettingsModal`, `UpdatesModal`, the help centre,
 * global search) rather than reimplementing them: those panels are already responsive, and a second
 * copy is the kind of drift that makes a phone and a desktop disagree about what a setting means.
 */
import React from "react";
import {
  BookOpen,
  ChevronRight,
  Languages,
  Search,
  Settings,
  Sparkles,
  Info,
} from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { APP_VERSION } from "../../version";

export interface MobileMoreScreenProps {
  onOpenSettings: () => void;
  onOpenUpdates: () => void;
  onOpenHelp: () => void;
  onOpenSearch: () => void;
}

export function MobileMoreScreen({
  onOpenSettings,
  onOpenUpdates,
  onOpenHelp,
  onOpenSearch,
}: MobileMoreScreenProps) {
  const { t, language, toggleLanguage } = useLanguage();

  const rows: Array<{
    id: string;
    label: string;
    hint?: string;
    icon: React.ReactNode;
    onClick: () => void;
  }> = [
    { id: "settings", label: t("mobile_more_settings"), icon: <Settings className="h-4 w-4" />, onClick: onOpenSettings },
    { id: "updates", label: t("mobile_more_updates"), icon: <Sparkles className="h-4 w-4" />, onClick: onOpenUpdates },
    { id: "help", label: t("mobile_more_help"), icon: <BookOpen className="h-4 w-4" />, onClick: onOpenHelp },
    { id: "search", label: t("mobile_more_search"), icon: <Search className="h-4 w-4" />, onClick: onOpenSearch },
    {
      id: "language",
      label: t("mobile_more_language"),
      // The row states what it will switch *to*, which is the only unambiguous wording for a toggle.
      hint: language === "zh" ? "English" : "中文",
      icon: <Languages className="h-4 w-4" />,
      onClick: toggleLanguage,
    },
  ];

  return (
    <section className="m-rise px-4 pt-2" data-testid="mobile-more">
      <h1 className="text-[22px] font-bold leading-none">{t("mobile_module_more")}</h1>

      <ul className="mt-3 flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              data-testid={`mobile-more-${row.id}`}
              onClick={row.onClick}
              className="m-press flex min-h-[54px] w-full items-center gap-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] px-3.5 text-left"
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-[var(--m-line-2)] text-[var(--m-gold)]">
                {row.icon}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px]">{row.label}</span>
              {row.hint && (
                <span className="m-mono flex-none text-[10px] text-[var(--m-ink-3)]">{row.hint}</span>
              )}
              <ChevronRight className="h-4 w-4 flex-none text-[var(--m-ink-3)]" />
            </button>
          </li>
        ))}
      </ul>

      <div
        className="mt-3 flex items-center gap-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] px-3.5 py-3"
        data-testid="mobile-more-about"
      >
        <Info className="h-4 w-4 flex-none text-[var(--m-ink-3)]" />
        <div className="min-w-0">
          <p className="truncate text-[12px] text-[var(--m-ink-2)]">{t("mobile_more_about")}</p>
          <p className="m-mono mt-0.5 text-[10px] text-[var(--m-ink-3)]" data-testid="mobile-more-version">
            v{APP_VERSION}
          </p>
        </div>
      </div>
    </section>
  );
}
