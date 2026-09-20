/**
 * 更多 (the more module, M7).
 *
 * Five rows that open panels the app already owns, plus the language toggle and the version. The
 * contract worth pinning is that each row calls *its* opener (a mis-wired row silently opens the wrong
 * panel), that the language row states what it will switch to, and that the version is shown.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { MobileMoreScreen } from "../mobile/screens/MobileMoreScreen";
import { APP_VERSION } from "../version";

const renderMore = () => {
  const spies = {
    onOpenSettings: vi.fn(),
    onOpenUpdates: vi.fn(),
    onOpenHelp: vi.fn(),
    onOpenSearch: vi.fn(),
  };
  const utils = render(
    <LanguageProvider>
      <MobileMoreScreen {...spies} />
    </LanguageProvider>
  );
  return { ...utils, spies };
};

describe("more module", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "zh");
  });

  it("lists the five destinations the phone keeps here", () => {
    renderMore();
    for (const id of ["settings", "updates", "help", "search", "language"]) {
      expect(screen.getByTestId(`mobile-more-${id}`)).toBeInTheDocument();
    }
    // Every row is a real touch target, not a 24px text link.
    for (const id of ["settings", "updates", "help", "search", "language"]) {
      const className = screen.getByTestId(`mobile-more-${id}`).className;
      const match = className.match(/min-h-\[(\d+)px\]/);
      expect(match, `${id} must declare a min height`).not.toBeNull();
      expect(Number(match![1])).toBeGreaterThanOrEqual(44);
    }
  });

  it("opens the panel each row names, and only that one", () => {
    const { spies } = renderMore();
    const wiring: Array<[string, keyof typeof spies]> = [
      ["settings", "onOpenSettings"],
      ["updates", "onOpenUpdates"],
      ["help", "onOpenHelp"],
      ["search", "onOpenSearch"],
    ];
    for (const [rowId, opener] of wiring) {
      fireEvent.click(screen.getByTestId(`mobile-more-${rowId}`));
      expect(spies[opener], `${rowId} must call ${opener}`).toHaveBeenCalledTimes(1);
      for (const [otherRow, otherOpener] of wiring) {
        if (otherOpener !== opener) {
          expect(spies[otherOpener], `${rowId} must not call ${otherOpener}`).not.toHaveBeenCalled();
        }
      }
      vi.clearAllMocks();
    }
  });

  it("states the language it will switch to, and switches it", () => {
    renderMore();
    const row = screen.getByTestId("mobile-more-language");
    // While the UI is Chinese the row offers English, which is the only unambiguous wording.
    expect(row.textContent ?? "").toContain("English");

    fireEvent.click(row);
    expect(localStorage.getItem("groove_language")).toBe("en");
    expect(screen.getByTestId("mobile-more-language").textContent ?? "").toContain("中文");
  });

  it("shows the version, taken from the single source", () => {
    renderMore();
    expect(screen.getByTestId("mobile-more-version").textContent).toBe(`v${APP_VERSION}`);
  });
});
