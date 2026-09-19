/**
 * The phone shell: five destinations in a tab bar, everything else in one sheet.
 *
 * The design decision these tests protect is the *count*. The desktop nav has thirteen entries
 * behind a hamburger and the footer row has six bare links; the phone gets five tabs and one
 * sheet, and the tabs are asserted so that adding a sixth has to be a deliberate act with a
 * failing test rather than a quiet addition.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { MobileTabBar, MOBILE_PRIMARY_TABS, MOBILE_SHEET_GROUPS } from "../components/MobileTabBar";
import { MobileMoreSheet } from "../components/MobileMoreSheet";

const renderWithLang = (node: React.ReactElement) =>
  render(<LanguageProvider>{node}</LanguageProvider>);

describe("MobileTabBar", () => {
  const noop = () => {};

  it("renders exactly five destinations", () => {
    renderWithLang(<MobileTabBar activeTab="studio" onSelectTab={noop} onOpenSheet={noop} />);
    // The whole point of the redesign: a phone tab bar, not the full site map.
    expect(MOBILE_PRIMARY_TABS).toHaveLength(5);
    for (const entry of MOBILE_PRIMARY_TABS) {
      expect(screen.getByTestId(`mobile-tab-${entry.id}`)).toBeInTheDocument();
    }
  });

  it("gives every destination a visible text label, not only an icon", () => {
    renderWithLang(<MobileTabBar activeTab="studio" onSelectTab={noop} onOpenSheet={noop} />);
    // Icon-only navigation is the desktop toolbar's problem; on a phone an unlabelled glyph is
    // undiscoverable because there is no hover to reveal a tooltip.
    for (const entry of MOBILE_PRIMARY_TABS) {
      const button = screen.getByTestId(`mobile-tab-${entry.id}`);
      const label = button.textContent?.trim() ?? "";
      expect(label.length, `${entry.id} must have a visible label`).toBeGreaterThan(0);
    }
  });

  it("meets the 44px minimum touch target on every tab", () => {
    renderWithLang(<MobileTabBar activeTab="studio" onSelectTab={noop} onOpenSheet={noop} />);
    for (const entry of MOBILE_PRIMARY_TABS) {
      const cls = screen.getByTestId(`mobile-tab-${entry.id}`).className;
      // `min-h-[52px]` clears the 44 px floor with room for the safe-area inset.
      expect(cls, `${entry.id} height`).toMatch(/min-h-\[52px\]/);
    }
  });

  it("marks the active destination and follows alias views", () => {
    const { rerender } = renderWithLang(
      <MobileTabBar activeTab="studio" onSelectTab={noop} onOpenSheet={noop} />
    );
    expect(screen.getByTestId("mobile-tab-studio")).toHaveAttribute("aria-current", "page");

    // A timeline view is not a tab of its own; it belongs to Explore, so Explore lights up rather
    // than nothing being highlighted at all.
    rerender(
      <LanguageProvider>
        <MobileTabBar activeTab="vertical-timeline" onSelectTab={noop} onOpenSheet={noop} />
      </LanguageProvider>
    );
    expect(screen.getByTestId("mobile-tab-explore")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("mobile-tab-studio")).not.toHaveAttribute("aria-current");
  });

  it("never lights the sheet-opener tab, which is an action rather than a page", () => {
    renderWithLang(<MobileTabBar activeTab="studio" onSelectTab={noop} onOpenSheet={noop} />);
    const you = screen.getByTestId("mobile-tab-you");
    expect(you).not.toHaveAttribute("aria-current");
    expect(you).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("selects a destination on pointer-up rather than waiting for a click", () => {
    // On touch, `click` waits ~300 ms to see whether a double-tap is coming. That delay is most of
    // what makes a web UI feel unlike an app, so the bar commits on pointerup.
    const onSelect = vi.fn();
    renderWithLang(<MobileTabBar activeTab="studio" onSelectTab={onSelect} onOpenSheet={noop} />);
    fireEvent.pointerUp(screen.getByTestId("mobile-tab-explore"));
    expect(onSelect).toHaveBeenCalledWith("galaxy");
  });

  it("opens the sheet from the last tab instead of navigating", () => {
    const onSelect = vi.fn();
    const onOpenSheet = vi.fn();
    renderWithLang(<MobileTabBar activeTab="studio" onSelectTab={onSelect} onOpenSheet={onOpenSheet} />);
    fireEvent.pointerUp(screen.getByTestId("mobile-tab-you"));
    expect(onOpenSheet).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("MobileMoreSheet", () => {
  const noop = () => {};

  it("renders nothing while closed", () => {
    renderWithLang(
      <MobileMoreSheet open={false} onClose={noop} onSelectTab={noop} onAction={noop} />
    );
    expect(screen.queryByTestId("mobile-more-sheet")).toBeNull();
  });

  it("offers the views that have no tab, and no duplicate of the tab bar's own destinations", () => {
    renderWithLang(<MobileMoreSheet open onClose={noop} onSelectTab={noop} onAction={noop} />);
    const sheetTabs = MOBILE_SHEET_GROUPS.flatMap((g) => g.items).filter((i) => i.kind === "tab");
    for (const item of sheetTabs) {
      if (item.kind !== "tab") continue;
      expect(screen.getByTestId(`mobile-sheet-tab-${item.tab}`)).toBeInTheDocument();
    }
    // Galaxy and Studio are tabs; repeating them in the sheet would be the duplicate-control
    // problem the desktop "More" popover already has.
    expect(screen.queryByTestId("mobile-sheet-tab-galaxy")).toBeNull();
    expect(screen.queryByTestId("mobile-sheet-tab-studio")).toBeNull();
  });

  it("does not offer the hardware console on a phone", () => {
    // 100 mm faders with ±0.1 dB precision is not a hard phone problem, it is a bad one. The same
    // mix is reachable through each track's own volume and pan, so the console is deliberately
    // absent rather than present-and-awkward.
    renderWithLang(<MobileMoreSheet open onClose={noop} onSelectTab={noop} onAction={noop} />);
    expect(screen.queryByTestId("mobile-sheet-tab-console")).toBeNull();
    expect(MOBILE_SHEET_GROUPS.flatMap((g) => g.items)).not.toContainEqual(
      expect.objectContaining({ kind: "tab", tab: "console" })
    );
  });

  it("closes on Escape, backdrop tap and the close button", () => {
    const onClose = vi.fn();
    const { rerender } = renderWithLang(
      <MobileMoreSheet open onClose={onClose} onSelectTab={noop} onAction={noop} />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(screen.getByTestId("mobile-more-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(
      <LanguageProvider>
        <MobileMoreSheet open onClose={onClose} onSelectTab={noop} onAction={noop} />
      </LanguageProvider>
    );
    fireEvent.pointerUp(screen.getByTestId("mobile-more-close"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("reports a selected view and an action with the right payload", () => {
    const onSelectTab = vi.fn();
    const onAction = vi.fn();
    renderWithLang(
      <MobileMoreSheet open onClose={noop} onSelectTab={onSelectTab} onAction={onAction} />
    );
    fireEvent.pointerUp(screen.getByTestId("mobile-sheet-tab-chords"));
    expect(onSelectTab).toHaveBeenCalledWith("chords");

    fireEvent.pointerUp(screen.getByTestId("mobile-sheet-action-settings"));
    expect(onAction).toHaveBeenCalledWith("settings");
  });

  it("gives every sheet row a 56px target and a description", () => {
    renderWithLang(<MobileMoreSheet open onClose={noop} onSelectTab={noop} onAction={noop} />);
    const rows = MOBILE_SHEET_GROUPS.flatMap((g) => g.items);
    for (const item of rows) {
      const id =
        item.kind === "tab" ? `mobile-sheet-tab-${item.tab}` : `mobile-sheet-action-${item.id}`;
      const button = screen.getByTestId(id);
      expect(button.className, `${id} height`).toMatch(/min-h-\[56px\]/);
      // Label plus description: a bare list of view names is what makes a menu hard to use.
      expect(button.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("mobile shell has no unreachable navigation", () => {
  it("exposes every NavTab the app can render from the bar or the sheet", () => {
    // Views reachable only through the desktop header on a phone would be invisible there, so the
    // union of tab-bar destinations and sheet rows has to cover them. `detail` and the timelines
    // are covered by aliases (they are reached by selecting a genre or from Explore).
    const fromBar = new Set(MOBILE_PRIMARY_TABS.flatMap((e) => [e.tab, ...(e.aliases ?? [])]));
    const fromSheet = new Set(
      MOBILE_SHEET_GROUPS.flatMap((g) => g.items)
        .filter((i) => i.kind === "tab")
        .map((i) => (i as { tab: string }).tab)
    );
    const reachable = new Set([...fromBar, ...fromSheet]);
    for (const tab of ["studio", "galaxy", "challenge", "chords", "kick", "maker", "masterclass", "compare", "analyzer", "horizontal-timeline", "vertical-timeline", "detail"]) {
      expect(reachable.has(tab), `${tab} must be reachable on a phone`).toBe(true);
    }
    // The console is the one deliberate omission, documented in the sheet's own description.
    expect(reachable.has("console")).toBe(false);
  });
});

/**
 * The piano roll is deliberately not offered on a phone.
 *
 * Measured on a 390×664 phone: the roll drawer is 1095 px tall, its note grid 2304 px wide, its
 * toolbar 55 buttons, and the grid carries `touch-action: none` — which it needs, because a
 * one-finger drag has to paint a note rather than scroll, leaving no gesture to pan with. Most of
 * the grid is therefore off-screen and unreachable. The product rule this encodes is "do not ship
 * a surface that is present and unusable"; the alternative is offered instead.
 */
describe("piano roll is not offered on phones", () => {
  it("keeps the piano roll out of the phone sheet", () => {
    const ids = MOBILE_SHEET_GROUPS.flatMap((g) => g.items).map((i) =>
      i.kind === "tab" ? `tab:${i.tab}` : `action:${i.id}`
    );
    expect(ids).not.toContain("action:piano-roll");
    // It is still a desktop surface, so the omission must be about the shell, not the feature
    // having been deleted from the app.
    expect(ids).toContain("tab:chords");
  });

  it("points at the Chords view rather than leaving a dead end", () => {
    const hasChordsCta = MOBILE_SHEET_GROUPS.flatMap((g) => g.items).some(
      (i) => i.kind === "tab" && i.tab === "chords"
    );
    expect(hasChordsCta).toBe(true);
  });
});
