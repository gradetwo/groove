import React from "react";
import { Music2, Compass, GraduationCap, SlidersHorizontal, User } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import type { NavTab } from "./Header";

/**
 * Phone navigation: five destinations in a thumb-reachable bottom bar, plus one sheet.
 *
 * Why this exists instead of the desktop nav: on a phone the whole header navigation is inside a
 * hamburger, which buries every primary destination behind a tap and gives no sense of "where am
 * I". The footer link row that was meant to cover phones is a row of bare text links — it does
 * not read as navigation, it omits Chords and Kick, and it sits at the bottom of a long scrolling
 * document, so it is effectively unreachable.
 *
 * Five is the count that fits a 390 px width with a readable 11 px label over a 44 px target.
 * Everything else lives in one sheet, grouped by intent. "Not everything gets a tab" is the point:
 * a tab bar with eleven entries is the same failure as a toolbar with thirty buttons.
 */

export interface MobileTabEntry {
  kind: "tab";
  id: string;
  tab: NavTab;
  icon: React.ReactNode;
  labelKey: string;
  /** Views this destination also represents, so the active state follows the route. */
  aliases?: NavTab[];
}

/**
 * A sheet row that is not a view: it opens a panel over the current screen. Keeping these in the
 * same union as views is what lets the sheet render one list without special-casing.
 */
export interface MobileSheetAction {
  kind: "action";
  id: "search" | "settings" | "help" | "updates";
  labelKey: string;
  descKey: string;
}

export interface MobileSheetTab {
  kind: "tab";
  tab: NavTab;
  labelKey: string;
  descKey: string;
}

export const MOBILE_PRIMARY_TABS: readonly MobileTabEntry[] = [
  { kind: "tab", id: "studio", tab: "studio", icon: <Music2 className="h-5 w-5" />, labelKey: "nav_studio" },
  {
    kind: "tab",
    id: "explore",
    tab: "galaxy",
    icon: <Compass className="h-5 w-5" />,
    labelKey: "nav_explore",
    aliases: ["galaxy", "horizontal-timeline", "vertical-timeline", "detail"],
  },
  {
    kind: "tab",
    id: "learn",
    tab: "challenge",
    icon: <GraduationCap className="h-5 w-5" />,
    labelKey: "nav_learn",
    aliases: ["challenge", "masterclass"],
  },
  {
    kind: "tab",
    id: "tools",
    tab: "chords",
    icon: <SlidersHorizontal className="h-5 w-5" />,
    labelKey: "nav_tools",
    aliases: ["chords", "kick", "analyzer", "compare", "maker"],
  },
  { kind: "tab", id: "you", tab: "studio", icon: <User className="h-5 w-5" />, labelKey: "nav_you" },
] as const;

/**
 * Sheet contents, grouped by intent rather than listed flat.
 *
 * Views that are deliberately **not offered on a phone** are named in the description rather than
 * silently missing, because "it is gone" and "it was left out on purpose" look identical to a
 * user otherwise. The hardware console is the clearest case: 100 mm faders with ±0.1 dB
 * precision on a 390 px screen is not a hard problem, it is a bad one — the same mix is reachable
 * through each track's own volume and pan, which is why the phone drops the console and keeps the
 * controls.
 */
export const MOBILE_SHEET_GROUPS: ReadonlyArray<{
  titleKey: string;
  items: ReadonlyArray<MobileSheetTab | MobileSheetAction>;
}> = [
  {
    titleKey: "mobile_more_create",
    items: [
      { kind: "tab", tab: "chords", labelKey: "nav_chords", descKey: "nav_chords_desc" },
      { kind: "tab", tab: "kick", labelKey: "nav_kick", descKey: "nav_kick_desc" },
      { kind: "tab", tab: "maker", labelKey: "nav_maker", descKey: "nav_maker_desc" },
    ],
  },
  {
    titleKey: "mobile_more_learn",
    items: [
      { kind: "tab", tab: "challenge", labelKey: "nav_challenge", descKey: "nav_challenge_desc" },
      { kind: "tab", tab: "masterclass", labelKey: "nav_masterclass", descKey: "nav_masterclass_desc" },
    ],
  },
  {
    titleKey: "mobile_more_explore",
    items: [
      { kind: "tab", tab: "horizontal-timeline", labelKey: "nav_timeline_h", descKey: "nav_timeline_h_desc" },
      { kind: "tab", tab: "vertical-timeline", labelKey: "nav_timeline_v", descKey: "nav_timeline_v_desc" },
      { kind: "tab", tab: "compare", labelKey: "nav_compare", descKey: "nav_compare_desc" },
      { kind: "tab", tab: "analyzer", labelKey: "nav_analyzer", descKey: "nav_analyzer_desc" },
    ],
  },
  {
    titleKey: "mobile_more_you",
    items: [
      { kind: "action", id: "search", labelKey: "search_placeholder", descKey: "mobile_action_search_desc" },
      { kind: "action", id: "settings", labelKey: "settings_open", descKey: "mobile_action_settings_desc" },
      { kind: "action", id: "help", labelKey: "help_manual_title", descKey: "mobile_action_help_desc" },
      { kind: "action", id: "updates", labelKey: "header_updates_btn", descKey: "mobile_action_updates_desc" },
    ],
  },
] as const;

export interface MobileTabBarProps {
  /** The view currently displayed, used to light the matching tab. */
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  /** Tapping "You" opens the sheet, whose last group is the app actions. */
  onOpenSheet: () => void;
  /**
   * Render in flow instead of pinned to the viewport.
   *
   * A short landscape phone puts this bar on the *same* bottom row as the transport
   * (`PRODUCT_PLAN_v2.1.0.md` §G.5), and `fixed inset-x-0 bottom-0` cannot take part in a flex row —
   * it ignores its container and overlays it, which is exactly what the first attempt at the merge
   * did: the bar reported itself full-width inside a 1 px-wide parent. Embedded, the bar takes the
   * width its row gives it, and the caller owns the fixed positioning and the safe-area padding.
   */
  embedded?: boolean;
}

export const MobileTabBar: React.FC<MobileTabBarProps> = ({
  activeTab,
  onSelectTab,
  onOpenSheet,
  embedded = false,
}) => {
  const { t } = useLanguage();

  const isActive = (entry: MobileTabEntry): boolean => {
    // "You" is an action, not a page: it is never the current destination.
    if (entry.id === "you") return false;
    if (entry.tab === activeTab) return true;
    return Boolean(entry.aliases?.includes(activeTab));
  };

  return (
    <nav
      data-testid="mobile-tab-bar"
      data-embedded={embedded ? "true" : "false"}
      aria-label={t("mobile_nav_label")}
      className={
        embedded
          ? "h-full w-full border-l border-line bg-panel/95 backdrop-blur-lg"
          : "fixed inset-x-0 bottom-0 z-[70] border-t border-line bg-panel/95 backdrop-blur-lg"
      }
      /**
       * The caller owns the row's safe-area padding when embedded; applying it twice would leave a
       * gap under the bar's own buttons.
       *
       * Wrapped in `max()` rather than written as a bare `env(...)`: React's style serialiser drops
       * an entire declaration whose value it cannot parse, and a bare `env()` is parsed as one by
       * jsdom — so the attribute vanished and a test that asserted the inset was present failed for
       * a reason that looked like a missing prop. `max()` also matches how the rest of the codebase
       * writes an inset with a fallback.
       */
      style={embedded ? undefined : { paddingBottom: "max(0px, env(safe-area-inset-bottom, 0px))" }}
    >
      <ul className="flex h-full items-stretch justify-around">
        {MOBILE_PRIMARY_TABS.map((entry) => {
          const active = isActive(entry);
          const isSheetOpener = entry.id === "you";
          return (
            <li key={entry.id} className="flex-1">
              <button
                type="button"
                onPointerUp={(e) => {
                  /**
                   * `onPointerUp`, not `onClick`: on touch, `click` waits ~300 ms to see whether a
                   * double-tap is coming. That delay is most of what makes a web UI feel unlike an
                   * app, and the wait is unnecessary here because double-tap zoom is already
                   * disabled at the stylesheet level.
                   */
                  e.preventDefault();
                  if (isSheetOpener) {
                    onOpenSheet();
                    return;
                  }
                  onSelectTab(entry.tab);
                }}
                data-testid={`mobile-tab-${entry.id}`}
                aria-current={active ? "page" : undefined}
                aria-haspopup={isSheetOpener ? "dialog" : undefined}
                className={`relative flex min-h-[52px] w-full flex-col items-center justify-center gap-0.5 px-1 pt-1.5 pb-1 transition-colors ${
                  active ? "text-accent" : "text-text-dim"
                }`}
              >
                <span className="relative">{entry.icon}</span>
                <span className="text-[10px] font-semibold leading-none">{t(entry.labelKey)}</span>
                {active && (
                  <span aria-hidden="true" className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
