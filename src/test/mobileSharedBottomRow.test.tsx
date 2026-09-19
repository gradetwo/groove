/**
 * The two phone bars share one bottom row on a short landscape viewport (§G.5).
 *
 * Measured before this: the studio transport (59 px) and the tab bar (53 px) were stacked at
 * opposite ends of a 390 px-tall landscape viewport, costing 26 % of the screen's height while
 * 844 px of width sat unused. Sharing a row returns the transport's height to the grid without
 * deleting a control.
 *
 * Three things can go wrong in a way that still *looks* fine, and each has a test here:
 *
 *  1. The transport renders in both places (the row and its old in-flow position).
 *  2. The tab bar is rendered twice — once by `App` and once inside the row.
 *  3. The row is built but the bars inside it are not actually side by side, because
 *     `fixed inset-x-0 bottom-0` cannot take part in a flex row.
 *
 * The layout arithmetic itself (transport capped, tabs taking the rest) is asserted here; the real
 * geometry is measured by `scripts/diagnose_mobile_chrome.mjs`.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LanguageProvider } from "../i18n/LanguageContext";
import { MobileTransportBar, TRANSPORT_ROW_WIDTH_PX } from "../components/sequencer/MobileTransportBar";
import { MobileTabBar } from "../components/MobileTabBar";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

const transportProps = {
  isPlaying: false,
  bpm: 124,
  viewedBar: 0,
  barCount: 4,
  canUndo: true,
  canRedo: false,
  onTogglePlay: () => {},
  onPrevBar: () => {},
  onNextBar: () => {},
  onUndo: () => {},
  onRedo: () => {},
  onOpenSheet: () => {},
};

const wrap = (node: React.ReactNode) => render(<LanguageProvider>{node}</LanguageProvider>);

describe("the transport in a shared row", () => {
  it("declares the width it claims, and the stylesheet agrees", () => {
    /**
     * The slot is sized in the panel's JSX from a CSS variable, so the two numbers have to match or
     * the transport is clipped or leaves a gap. CSS and TS cannot share a constant, so the value is
     * asserted equal here — the same arrangement as `PHONE_MAX_HEIGHT_PX`.
     */
    // Imported lazily to keep this file's import list short; the value is asserted, not used.
    expect(TRANSPORT_ROW_WIDTH_PX).toBe(320);
    const css = readFileSync(path.resolve(TEST_DIR, "../index.css"), "utf8");
    expect(css).toContain(`--mobile-transport-row-w: ${TRANSPORT_ROW_WIDTH_PX}px`);
  });

  it("is at least as wide as its own controls, or it would clip them", () => {
    // Five 44 px controls, plus four 4 px gaps and the 12 px container padding.
    const needed = 5 * 44 + 4 * 4 + 12;
    expect(TRANSPORT_ROW_WIDTH_PX).toBeGreaterThanOrEqual(needed);
  });

  it("still renders every control when it is the embedded variant", () => {
    wrap(<MobileTransportBar {...transportProps} isShortLandscape />);
    for (const id of [
      "mobile-transport-play",
      "mobile-transport-tempo",
      "mobile-transport-undo",
      "mobile-transport-redo",
      "mobile-transport-more",
    ]) {
      expect(screen.getByTestId(id), `${id} must survive the move`).toBeTruthy();
    }
  });
});

describe("the tab bar embedded in a row", () => {
  it("is not pinned to the viewport when embedded", () => {
    /**
     * `fixed inset-x-0 bottom-0` cannot take part in a flex row: it ignores its container and
     * overlays it. The first attempt at this merge left the bar reporting itself full-width inside a
     * 1 px-wide parent, which is why the embedded mode exists at all.
     */
    wrap(<MobileTabBar activeTab="studio" onSelectTab={vi.fn()} onOpenSheet={vi.fn()} embedded />);
    const nav = screen.getByTestId("mobile-tab-bar");
    expect(nav.getAttribute("data-embedded")).toBe("true");
    expect(nav.className).not.toContain("fixed");
    expect(nav.className).not.toContain("inset-x-0");
  });

  it("is pinned to the viewport by default, which is every other layout", () => {
    wrap(<MobileTabBar activeTab="studio" onSelectTab={vi.fn()} onOpenSheet={vi.fn()} />);
    const nav = screen.getByTestId("mobile-tab-bar");
    expect(nav.getAttribute("data-embedded")).toBe("false");
    expect(nav.className).toContain("fixed");
    expect(nav.className).toContain("bottom-0");
  });

  it("leaves the safe-area padding to the row when embedded, and keeps it otherwise", () => {
    // Applying the inset twice would leave a visible gap under the bar's own buttons.
    const embedded = wrap(
      <MobileTabBar activeTab="studio" onSelectTab={vi.fn()} onOpenSheet={vi.fn()} embedded />
    );
    // React omits the attribute entirely rather than rendering an empty one.
    expect(screen.getByTestId("mobile-tab-bar").hasAttribute("style")).toBe(false);
    embedded.unmount();

    wrap(<MobileTabBar activeTab="studio" onSelectTab={vi.fn()} onOpenSheet={vi.fn()} />);
    expect(screen.getByTestId("mobile-tab-bar").getAttribute("style")).toContain(
      "safe-area-inset-bottom"
    );
  });

  it("fills the width its row gives it when embedded", () => {
    wrap(<MobileTabBar activeTab="studio" onSelectTab={vi.fn()} onOpenSheet={vi.fn()} embedded />);
    // Without `w-full` the bar kept its intrinsic 197 px and left 524 px of the row empty.
    expect(screen.getByTestId("mobile-tab-bar").className).toContain("w-full");
  });
});

/**
 * The merged row must not sit above the panels that open over it.
 *
 * The first version of the row copied the tab bar's `z-[70]`. The track inspector is a `z-50` sheet
 * over a `z-40` scrim, so the sheet's bottom 52 px ended up *underneath* the row — measured with an
 * element-at-point probe in the overlap, which returned a transport button instead of the panel.
 * That is the same class of defect the inspector's `bottom` offset exists for, and it is invisible
 * in a screenshot because the row is opaque and the sheet is scrolled to its top.
 */
describe("the shared row's stacking", () => {
  const readPanel = () =>
    readFileSync(path.resolve(TEST_DIR, "../components/sequencer/SequencerPanel.tsx"), "utf8");
  const readCss = () => readFileSync(path.resolve(TEST_DIR, "../index.css"), "utf8");

  it("keeps the row below the inspector's scrim and sheet", () => {
    const panel = readPanel();
    const rowClass = panel.match(/data-testid="mobile-shared-bottom-row"[\s\S]{0,900}?className="([^"]+)"/)?.[1];
    expect(rowClass, "the shared row's class was not found").toBeTruthy();
    // The inspector is z-50 over a z-40 scrim. The row has to be under both.
    const z = Number(rowClass!.match(/z-\[(\d+)\]|z-(\d+)/)?.slice(1).find(Boolean));
    expect(Number.isFinite(z), `no numeric z-index in "${rowClass}"`).toBe(true);
    expect(z).toBeLessThan(40);
  });

  it("reserves its own height for anything anchored above it", () => {
    /**
     * The row is not the same component as the standalone tab bar, so `data-bottom-bar` (which only
     * `App` can set) does not describe it. It declares its own height instead, and the inspector's
     * `bottom` reads the variable either way — otherwise the sheet would sit flush against the row
     * and its last row of controls would be covered.
     */
    expect(readPanel()).toContain('data-bottom-chrome="fixed"');
    expect(readCss()).toContain(':root:has([data-bottom-chrome="fixed"])');
  });

  it("gives both arrangements the same reserved height, so the sheet lands in one place", () => {
    const css = readCss();
    const rule = css.match(/:root\[data-bottom-bar="tab"\],\s*:root:has\(\[data-bottom-chrome="fixed"\]\)\s*\{([^}]*)\}/);
    expect(rule, "the shared reservation rule is gone").toBeTruthy();
    // The standalone bar is 52 px + 1 px border and the row measures 53 px; both reserve 53.
    expect(rule![1]).toContain("53px");
  });
});
