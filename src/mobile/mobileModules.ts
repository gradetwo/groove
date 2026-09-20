/**
 * Phone-shell vocabulary (M-series, see PRODUCT_PLAN_v2.1.0.md §M).
 *
 * The phone UI is a separate information architecture from the desktop app: five modules at the
 * bottom, each a phone-shaped surface, instead of the desktop's thirteen destinations behind a
 * hamburger. The names are the user's: 首页 / 即兴 / 挑战 / 探索 / 更多.
 *
 * This module is deliberately framework-free and holds only the vocabulary — the same reason
 * `src/app/navigation.ts` exists: the router, the tab bar, the screens and the tests all need to name
 * a module, and none of them should have to import a component to do it.
 */

export type MobileModule = "home" | "jam" | "challenge" | "explore" | "more";

/**
 * The five modules, in tab order.
 *
 * Order is part of the design: 首页 first because browsing genres is what a phone is for, 更多 last
 * because "everything else" belongs at the end of a thumb sweep.
 */
export const MOBILE_MODULES: readonly MobileModule[] = ["home", "jam", "challenge", "explore", "more"];

/** i18n keys for each module's tab label. */
export const MOBILE_MODULE_LABEL_KEYS: Record<MobileModule, string> = {
  home: "mobile_module_home",
  jam: "mobile_module_jam",
  challenge: "mobile_module_challenge",
  explore: "mobile_module_explore",
  more: "mobile_module_more",
};

/**
 * What each module currently contains, for the placeholder card the not-yet-built modules show.
 *
 * Honest by construction: a module that is still being rebuilt says so, rather than rendering a
 * stripped-down desktop view and pretending it is the phone design.
 */
export const MOBILE_MODULE_PLAN_KEYS: Record<MobileModule, string> = {
  home: "mobile_module_home_plan",
  jam: "mobile_module_jam_plan",
  challenge: "mobile_module_challenge_plan",
  explore: "mobile_module_explore_plan",
  more: "mobile_module_more_plan",
};

/** Normalises anything that came from a URL into a real module id. */
export function normaliseMobileModule(value: string | null | undefined): MobileModule {
  return MOBILE_MODULES.includes(value as MobileModule) ? (value as MobileModule) : "home";
}

/**
 * Should this visit enter the phone shell?
 *
 * The phone redesign replaces the old phone IA in place, but the cutover is staged: the shell becomes
 * the phone's **default entry** while the old routes stay reachable, so an existing deep link (or the
 * desktop-oriented test matrix) still lands where it asked to. The rule is therefore: a phone, on a
 * bare root visit, enters the shell; anything with an explicit destination is left alone.
 *
 * Kept pure and exported because "which surface does this URL get" is exactly the kind of decision
 * that should not be discoverable only by rendering the whole application.
 */
export function shouldEnterPhoneShell(input: {
  /** Capability, not a width test: see `useDeviceCapabilities`. */
  isMobile: boolean;
  /** The route the router already resolved from the URL. */
  mobileRoute?: MobileModule;
  pathname: string;
  search: string;
}): boolean {
  if (!input.isMobile) return false;
  if (input.mobileRoute) return false;
  const path = input.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/") return false;
  const params = new URLSearchParams(input.search);
  // An explicit destination wins: `?tab=`, `?genre=`, `?groove=` and friends are all deep links.
  return !["tab", "genre", "groove", "m", "player"].some((key) => params.has(key));
}
