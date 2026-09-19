/**
 * The phone header is a title bar (P-phone).
 *
 * Measured on the built app at iPhone 14 / 390×664 with `scripts/measure_phone_surface.mjs`: the
 * header carried nine controls, seven of them 24–36 px — under the 44 px a thumb needs, and a
 * second navigation menu on top of the tab bar's own. Everything it offered is reachable on a phone
 * through bigger targets: search/settings/help/updates are rows in the tab bar's "More" sheet, the
 * language switch is inside Settings, the tour opens from the Help centre, a random genre is the
 * Explore view's own button, and that same sheet lists every tab the header dropdown listed.
 *
 * These tests pin the decision from both sides: the phone gets one control, and the desktop still
 * gets all of them (a test that only checked "absent on phone" would pass just as well if the
 * controls had been deleted outright).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Header } from "../components/Header";
import { LanguageProvider } from "../i18n/LanguageContext";

/** Mutable capabilities: `vi.mock` is hoisted, so the factory reads this box at render time. */
const caps = vi.hoisted(() => ({
  current: {
    isTouch: false,
    isPhone: false,
    isMobile: false,
    isLandscape: false,
    isShortLandscape: false,
    prefersReducedMotion: false,
  },
}));
vi.mock("../hooks/useDeviceCapabilities", () => ({
  useDeviceCapabilities: () => caps.current,
}));

beforeEach(() => {
  localStorage.setItem("groove_language", "zh");
  caps.current = { ...caps.current, isMobile: false };
});

function renderHeader(onOpenMore?: () => void) {
  return render(
    <LanguageProvider>
      <Header
        currentTab="studio"
        onSelectTab={vi.fn()}
        onOpenSearch={vi.fn()}
        onRandomGenre={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenUpdates={vi.fn()}
        onOpenShortcuts={vi.fn()}
        onOpenHelp={vi.fn()}
        onOpenOnboarding={vi.fn()}
        onOpenMore={onOpenMore}
      />
    </LanguageProvider>
  );
}

/** Every app-level control the header shows when there is room for it. */
const DESKTOP_ONLY = [
  "header-language-switch",
  "header-settings-open",
  "header-version-button",
  "header-help-button",
  "header-onboarding-button",
];

describe("Header · the phone surface", () => {
  it("keeps two controls — the brand and one way into the sections sheet — and drops the wall", () => {
    caps.current = { ...caps.current, isMobile: true, isTouch: true, isPhone: true };
    const onOpenMore = vi.fn();
    const { container } = renderHeader(onOpenMore);

    const brand = screen.getByLabelText("GROOVE LAB Home");
    expect(brand).toBeInTheDocument();
    /**
     * Two controls, not nine: the count is the point of the change.
     *
     * Scoped to everything outside `nav`, because that row is `hidden md:flex` — a desktop
     * navigation that jsdom still has in the tree since it applies no CSS. What matters on a phone
     * is that nothing *else* in the header competes, and the real pixel check is
     * `scripts/measure_phone_surface.mjs`, which reads the shipped layout in a browser.
     */
    const outsideNav = Array.from(container.querySelectorAll("button")).filter(
      (button) => !button.closest("nav")
    );
    expect(outsideNav).toHaveLength(2);
    expect(outsideNav[0]).toBe(brand);

    // The second one is the sections sheet, at the 44 px the phone needs — the sheet's tab-bar
    // opener is covered by the keyboard FAB in portrait (measured), so this is the reliable way in.
    const more = screen.getByTestId("header-more");
    expect(outsideNav[1]).toBe(more);
    expect(more.className).toContain("h-11");
    expect(more.className).toContain("w-11");
    fireEvent.click(more);
    expect(onOpenMore).toHaveBeenCalledTimes(1);

    // Both phone controls must clear the minimum on their own.
    expect(brand.className).toContain("min-h-11");
  });

  it("offers nothing whose function the sections sheet already has", () => {
    caps.current = { ...caps.current, isMobile: true, isTouch: true, isPhone: true };
    renderHeader(vi.fn());

    for (const testid of DESKTOP_ONLY) {
      expect(screen.queryByTestId(testid), `${testid} should not be in the phone header`).toBeNull();
    }
    // …including the header's own drawer: the tab bar's More sheet lists every entry it had.
    expect(screen.queryByLabelText("Open menu")).toBeNull();
    expect(screen.queryByLabelText("Close menu")).toBeNull();
    expect(screen.queryByTestId("mobile-help-button")).toBeNull();
  });

  it("still renders all of them when there is room", () => {
    renderHeader(vi.fn());
    for (const testid of DESKTOP_ONLY) {
      expect(screen.getByTestId(testid), `${testid} should be in the desktop header`).toBeInTheDocument();
    }
    // The drawer stays for a narrow desktop window, where the `md:flex` navigation is hidden.
    expect(screen.getByLabelText("Open menu")).toBeInTheDocument();
  });
});
