/**
 * The phone shell (M1): five modules, one visual language, and a home screen that is actually usable.
 *
 * What this file protects:
 *  - the **module set and order** — the user's wording (首页 / 即兴 / 挑战 / 探索 / 更多) and nothing
 *    else; adding a sixth has to be a deliberate act with a failing test rather than a quiet addition,
 *    which is the same rule the previous phone tab bar was held to;
 *  - the **touch target** — 56 px tall tabs, because a phone bar whose targets are 24 px produces the
 *    mis-taps the whole redesign exists to remove;
 *  - the **home screen's real behaviour** — search, category filtering, one-at-a-time expansion, and
 *    auditioning through the engine hook (mocked here: the hook is not what this file tests, and
 *    jsdom has no audio).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { MobileApp } from "../mobile/MobileApp";
import { MOBILE_MODULES, type MobileModule } from "../mobile/mobileModules";
import { ALL_GENRES } from "../data/genres";

const audition = vi.hoisted(() => ({
  toggle: vi.fn(),
  stop: vi.fn(),
  playingGenreId: null as string | null,
}));

vi.mock("../hooks/useGenreAudition", () => ({
  useGenreAudition: () => ({
    playingGenreId: audition.playingGenreId,
    toggleAudition: audition.toggle,
    stopAudition: audition.stop,
  }),
}));

const renderShell = (module: MobileModule = "home", onSelect = vi.fn()) => {
  const utils = render(
    <LanguageProvider>
      <MobileApp module={module} onSelectModule={onSelect} />
    </LanguageProvider>
  );
  return { ...utils, onSelect };
};

const rowIds = (): string[] =>
  [...document.querySelectorAll('[data-testid^="mobile-genre-row-"]')].map((node) =>
    (node.getAttribute("data-testid") ?? "").replace("mobile-genre-row-", "")
  );

describe("phone shell · five modules", () => {
  beforeEach(() => {
    // The provider reads localStorage, so pin the language instead of asserting against whatever
    // jsdom's navigator happens to report.
    localStorage.setItem("groove_language", "zh");
    audition.toggle.mockReset();
    audition.stop.mockReset();
    audition.playingGenreId = null;
  });

  it("declares exactly the five agreed modules, in order", () => {
    expect(MOBILE_MODULES).toEqual(["home", "jam", "challenge", "explore", "more"]);
  });

  it("renders one tab per module, in that order, each with a visible label", () => {
    renderShell();
    const tabs = [...document.querySelectorAll("[data-testid^='mobile-module-']")].filter((node) =>
      /^mobile-module-(home|jam|challenge|explore|more)$/.test(node.getAttribute("data-testid") ?? "")
    );
    expect(tabs.map((node) => node.getAttribute("data-testid"))).toEqual(
      MOBILE_MODULES.map((module) => `mobile-module-${module}`)
    );
    // zh is the provider's default; an icon-only bar would fail here on purpose.
    expect(tabs.map((node) => node.textContent?.trim())).toEqual(["首页", "即兴", "挑战", "探索", "更多"]);
  });

  it("gives every tab at least a 44px touch target", () => {
    renderShell();
    for (const module of MOBILE_MODULES) {
      const className = screen.getByTestId(`mobile-module-${module}`).className;
      const match = className.match(/min-h-\[(\d+)px\]/);
      expect(match, `${module} must declare a min height`).not.toBeNull();
      expect(Number(match![1]), `${module} touch target`).toBeGreaterThanOrEqual(44);
    }
  });

  it("marks the active module and only the active module", () => {
    renderShell("explore");
    for (const module of MOBILE_MODULES) {
      const tab = screen.getByTestId(`mobile-module-${module}`);
      if (module === "explore") expect(tab).toHaveAttribute("aria-current", "page");
      else expect(tab).not.toHaveAttribute("aria-current");
    }
  });

  it("reports the tapped module and does not decide the route itself", () => {
    const { onSelect } = renderShell();
    for (const module of MOBILE_MODULES) {
      fireEvent.click(screen.getByTestId(`mobile-module-${module}`));
    }
    expect(onSelect.mock.calls.map((call) => call[0])).toEqual([...MOBILE_MODULES]);
  });

  it("renders the requested module and not the previous one", () => {
    renderShell("jam");
    expect(screen.getByTestId("mobile-module-jam-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-home")).not.toBeInTheDocument();
    // The placeholder must say what is coming rather than look broken.
    expect(screen.getByTestId("mobile-module-jam-placeholder").textContent ?? "").toMatch(/速度条|tempo/i);
  });
});

describe("phone shell · home screen", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "zh");
    audition.toggle.mockReset();
    audition.stop.mockReset();
    audition.playingGenreId = null;
  });

  it("lists the whole library by default", async () => {
    renderShell("home");
    await screen.findByTestId("mobile-home");
    expect(rowIds()).toHaveLength(ALL_GENRES.length);
    expect(ALL_GENRES.length).toBeGreaterThan(100);
  });

  it("filters by search text, matching English names and CJK aliases", async () => {
    renderShell("home");
    await screen.findByTestId("mobile-home");
    fireEvent.change(screen.getByTestId("mobile-home-search"), { target: { value: "house" } });
    const filtered = rowIds();
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(ALL_GENRES.length);
    const expected = ALL_GENRES.filter(
      (genre) =>
        genre.name.toLowerCase().includes("house") ||
        (genre.aliases ?? []).some((alias) => alias.toLowerCase().includes("house"))
    ).map((genre) => genre.id);
    expect(new Set(filtered)).toEqual(new Set(expected));
  });

  it("filters by category chip", async () => {
    renderShell("home");
    await screen.findByTestId("mobile-home");
    fireEvent.click(screen.getByRole("tab", { name: /Hip Hop/ }));
    const expected = ALL_GENRES.filter((genre) => genre.category === "Hip Hop").map((genre) => genre.id);
    expect(new Set(rowIds())).toEqual(new Set(expected));
    expect(expected.length).toBeGreaterThan(0);
  });

  it("expands one genre's summary at a time", async () => {
    renderShell("home");
    await screen.findByTestId("mobile-home");
    const [first, second] = rowIds();
    fireEvent.click(screen.getByTestId(`mobile-genre-row-${first}`));
    expect(screen.getByTestId(`mobile-genre-summary-${first}`)).toBeInTheDocument();
    expect(screen.getByTestId(`mobile-genre-row-${first}`)).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByTestId(`mobile-genre-row-${second}`));
    expect(screen.queryByTestId(`mobile-genre-summary-${first}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`mobile-genre-summary-${second}`)).toBeInTheDocument();
  });

  it("auditions through the engine hook and shows the playing genre", async () => {
    const { unmount } = renderShell("home");
    await screen.findByTestId("mobile-home");
    const genreId = rowIds()[0];
    fireEvent.click(screen.getByTestId(`mobile-genre-play-${genreId}`));
    expect(audition.toggle).toHaveBeenCalledTimes(1);
    expect(audition.toggle.mock.calls[0][0].id).toBe(genreId);
    unmount();

    // Same screen, now reporting that genre as playing: the button must flip to the stop state.
    audition.playingGenreId = genreId;
    renderShell("home");
    await screen.findByTestId("mobile-home");
    const playingButton = screen.getByTestId(`mobile-genre-play-${genreId}`);
    expect(playingButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(playingButton);
    expect(audition.stop).toHaveBeenCalledTimes(1);
  });

  it("says so when a search matches nothing instead of showing an empty list", async () => {
    renderShell("home");
    await screen.findByTestId("mobile-home");
    fireEvent.change(screen.getByTestId("mobile-home-search"), { target: { value: "zzzz-no-such-genre" } });
    expect(rowIds()).toHaveLength(0);
    expect(screen.getByTestId("mobile-home-empty")).toBeInTheDocument();
  });
});
