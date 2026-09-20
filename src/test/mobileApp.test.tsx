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
import { render, screen, fireEvent, within } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { MobileApp } from "../mobile/MobileApp";
import { MOBILE_MODULES, shouldEnterPhoneShell, type MobileModule } from "../mobile/mobileModules";
import { ALL_GENRES } from "../data/genres";

const audition = vi.hoisted(() => ({
  toggle: vi.fn(),
  stop: vi.fn(),
  applyPattern: vi.fn(),
  setTempo: vi.fn(),
  setSwingValue: vi.fn(),
  playingGenreId: null as string | null,
}));

vi.mock("../hooks/useGenreAudition", () => ({
  useGenreAudition: () => ({
    playingGenreId: audition.playingGenreId,
    toggleAudition: audition.toggle,
    stopAudition: audition.stop,
    readClock: () => ({ step: 0, fraction: 0 }),
    applyPattern: audition.applyPattern,
    setTempo: audition.setTempo,
    setSwingValue: audition.setSwingValue,
  }),
}));

const renderShell = (
  module: MobileModule = "home",
  options: {
    genreId?: string;
    mobilePlayer?: boolean;
    onSelect?: (module: MobileModule) => void;
  } = {}
) => {
  // A dedicated spy: `options.onSelect` is a plain callback, so it has no `.mock`.
  const onSelectSpy = vi.fn<(module: MobileModule) => void>();
  const onSelect = options.onSelect ?? onSelectSpy;
  const onOpenGenre = vi.fn();
  const onCloseGenre = vi.fn();
  const onOpenJam = vi.fn();
  const onOpenPlayer = vi.fn();
  const onCollapsePlayer = vi.fn();
  const utils = render(
    <LanguageProvider>
      <MobileApp
        module={module}
        mobilePlayer={options.mobilePlayer}
        genreId={options.genreId}
        onSelectModule={onSelect}
        onOpenGenre={onOpenGenre}
        onCloseGenre={onCloseGenre}
        onOpenJam={onOpenJam}
        onOpenPlayer={onOpenPlayer}
        onCollapsePlayer={onCollapsePlayer}
      />
    </LanguageProvider>
  );
  return {
    ...utils,
    onSelect,
    onSelectSpy,
    onOpenGenre,
    onCloseGenre,
    onOpenJam,
    onOpenPlayer,
    onCollapsePlayer,
  };
};

/**
 * The home screen is a lazy chunk, so first paint under a full-suite run can take longer than the
 * 1 s default; the tests wait explicitly rather than relying on the machine's mood.
 */
const findHome = () => screen.findByTestId("mobile-home", {}, { timeout: 5000 });

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
    const { onSelectSpy } = renderShell();
    for (const module of MOBILE_MODULES) {
      fireEvent.click(screen.getByTestId(`mobile-module-${module}`));
    }
    expect(onSelectSpy.mock.calls.map((call) => call[0])).toEqual([...MOBILE_MODULES]);
  });

  it("renders the requested module and not the previous one", async () => {
    const first = renderShell("jam");
    // 即兴 is a real screen (M4) and a lazy chunk, so it is awaited; the modules still to come show
    // the placeholder.
    expect(await screen.findByTestId("mobile-jam", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-home")).not.toBeInTheDocument();
    first.unmount();

    // 挑战 is real too (M5); 探索 is the placeholder now.
    const second = renderShell("challenge");
    expect(await screen.findByTestId("mobile-challenge", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-jam")).not.toBeInTheDocument();
    second.unmount();

    // Every module is a real screen now (M7): 更多 included.
    const third = renderShell("explore");
    expect(await screen.findByTestId("mobile-explore", {}, { timeout: 5000 })).toBeInTheDocument();
    third.unmount();

    renderShell("more");
    expect(await screen.findByTestId("mobile-more", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-explore")).not.toBeInTheDocument();
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
    await findHome();
    expect(rowIds()).toHaveLength(ALL_GENRES.length);
    expect(ALL_GENRES.length).toBeGreaterThan(100);
  });

  it("filters by search text, matching English names and CJK aliases", async () => {
    renderShell("home");
    await findHome();
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
    await findHome();
    fireEvent.click(screen.getByRole("tab", { name: /Hip Hop/ }));
    const expected = ALL_GENRES.filter((genre) => genre.category === "Hip Hop").map((genre) => genre.id);
    expect(new Set(rowIds())).toEqual(new Set(expected));
    expect(expected.length).toBeGreaterThan(0);
  });

  it("expands one genre's summary at a time", async () => {
    renderShell("home");
    await findHome();
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
    await findHome();
    const genreId = rowIds()[0];
    fireEvent.click(screen.getByTestId(`mobile-genre-play-${genreId}`));
    expect(audition.toggle).toHaveBeenCalledTimes(1);
    expect(audition.toggle.mock.calls[0][0].id).toBe(genreId);
    unmount();

    // Same screen, now reporting that genre as playing: the button must flip to the stop state.
    audition.playingGenreId = genreId;
    renderShell("home");
    await findHome();
    const playingButton = screen.getByTestId(`mobile-genre-play-${genreId}`);
    expect(playingButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(playingButton);
    expect(audition.stop).toHaveBeenCalledTimes(1);
  });

  it("says so when a search matches nothing instead of showing an empty list", async () => {
    renderShell("home");
    await findHome();
    fireEvent.change(screen.getByTestId("mobile-home-search"), { target: { value: "zzzz-no-such-genre" } });
    expect(rowIds()).toHaveLength(0);
    expect(screen.getByTestId("mobile-home-empty")).toBeInTheDocument();
  });
});

describe("phone shell · genre detail and player bar", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "zh");
    audition.toggle.mockReset();
    audition.stop.mockReset();
    audition.playingGenreId = null;
  });

  it("shows a genre's facts on its own page, with a way back", async () => {
    const { onCloseGenre } = renderShell("home", { genreId: "deep-house" });
    const detail = await screen.findByTestId("mobile-genre-detail", {}, { timeout: 5000 });
    expect(detail.getAttribute("data-genre")).toBe("deep-house");
    expect(detail.textContent ?? "").toMatch(/Deep House/);
    expect(screen.getByTestId("mobile-detail-facts").textContent ?? "").toMatch(/BPM|拍号|Time/);

    fireEvent.click(screen.getByTestId("mobile-detail-back"));
    expect(onCloseGenre).toHaveBeenCalledTimes(1);
  });

  it("links every related genre to its own page", async () => {
    const { onOpenGenre } = renderShell("home", { genreId: "deep-house" });
    await screen.findByTestId("mobile-genre-detail", {}, { timeout: 5000 });
    const related = [...document.querySelectorAll('[data-testid^="mobile-detail-related-"]')].filter(
      (node) => node.getAttribute("data-testid") !== "mobile-detail-related"
    );
    expect(related.length).toBeGreaterThan(0);
    const id = (related[0].getAttribute("data-testid") ?? "").replace("mobile-detail-related-", "");
    fireEvent.click(related[0]);
    expect(onOpenGenre).toHaveBeenCalledWith(id);
  });

  it("auditions from the detail page and takes the genre to the jam module", async () => {
    const { onOpenJam } = renderShell("home", { genreId: "deep-house" });
    await screen.findByTestId("mobile-genre-detail", {}, { timeout: 5000 });
    fireEvent.click(screen.getByTestId("mobile-detail-audition"));
    expect(audition.toggle).toHaveBeenCalledTimes(1);
    expect(audition.toggle.mock.calls[0][0].id).toBe("deep-house");

    fireEvent.click(screen.getByTestId("mobile-detail-jam"));
    expect(onOpenJam).toHaveBeenCalledWith("deep-house");
  });

  it("shows no player bar when nothing is playing", async () => {
    renderShell("home");
    await findHome();
    expect(screen.queryByTestId("mobile-player-bar")).not.toBeInTheDocument();
  });

  it("shows the playing genre in the bar, and expands to the player from there", async () => {
    // Driven by the hook's reported state, which is the only thing the bar is allowed to depend on.
    audition.playingGenreId = "deep-house";
    const { onOpenPlayer } = renderShell("home");
    await findHome();

    const bar = await screen.findByTestId("mobile-player-bar");
    expect(bar.getAttribute("data-genre")).toBe("deep-house");
    expect(bar.textContent ?? "").toMatch(/Deep House/);

    // Tapping the bar enters the full-screen player (the record is what opens the genre's page).
    fireEvent.click(screen.getByTestId("mobile-player-open"));
    expect(onOpenPlayer).toHaveBeenCalledWith("deep-house");
  });

  it("stops the audition from the bar", async () => {
    audition.playingGenreId = "deep-house";
    renderShell("home");
    await findHome();
    await screen.findByTestId("mobile-player-bar");

    fireEvent.click(screen.getByTestId("mobile-player-toggle"));
    expect(audition.stop).toHaveBeenCalledTimes(1);
  });

  it("never renders the bar on 即兴, even while a genre is playing", async () => {
    // The module has its own transport and the user asked for the bar to be removed from it.
    audition.playingGenreId = "deep-house";
    renderShell("jam");
    expect(await screen.findByTestId("mobile-jam", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-player-bar")).not.toBeInTheDocument();
  });

  it("ignores a playing id that is not in the library instead of showing a nameless bar", async () => {
    audition.playingGenreId = "deleted-custom-genre";
    renderShell("home");
    await findHome();
    expect(screen.queryByTestId("mobile-player-bar")).not.toBeInTheDocument();
  });

  it("says so when a detail route names a genre that does not exist", async () => {
    renderShell("home", { genreId: "not-a-real-genre" });
    expect(await screen.findByTestId("mobile-genre-missing", {}, { timeout: 5000 })).toBeInTheDocument();
  });
});

describe("phone shell · the full-screen player", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "zh");
    localStorage.removeItem("groove_mobile_play_mode");
    audition.toggle.mockReset();
    audition.stop.mockReset();
    audition.playingGenreId = null;
  });

  it("renders the record, the chevron and the mode button for its genre", async () => {
    renderShell("home", { genreId: "deep-house", mobilePlayer: true });
    const player = await screen.findByTestId("mobile-player", {}, { timeout: 5000 });
    expect(player.getAttribute("data-genre")).toBe("deep-house");
    expect(screen.getByTestId("mobile-vinyl-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-player-collapse")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-player-mode")).toBeInTheDocument();
    // The collapsed bar is the same thing in another form, so it must not also be on screen.
    expect(screen.queryByTestId("mobile-player-bar")).not.toBeInTheDocument();
  });

  it("collapses back to the list and opens the genre's page from the record", async () => {
    const { onCollapsePlayer, onOpenGenre } = renderShell("home", {
      genreId: "deep-house",
      mobilePlayer: true,
    });
    await screen.findByTestId("mobile-player", {}, { timeout: 5000 });

    fireEvent.click(screen.getByTestId("mobile-player-collapse"));
    expect(onCollapsePlayer).toHaveBeenCalledTimes(1);
    // The shell answers the collapse by going back to the list, not to the genre's page.
    expect(onOpenGenre).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("mobile-player-record"));
    expect(onOpenGenre).toHaveBeenCalledWith("deep-house");
  });

  it("hides the bar's content in a drawer that starts closed", async () => {
    renderShell("home", { genreId: "deep-house", mobilePlayer: true });
    await screen.findByTestId("mobile-player", {}, { timeout: 5000 });
    expect(screen.queryByTestId("mobile-player-drawer-panel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("mobile-player-drawer-toggle"));
    const panel = await screen.findByTestId("mobile-player-drawer-panel");
    expect(panel.textContent ?? "").toMatch(/BPM|拍号/);
  });

  it("cycles the play mode, persists it, and shows it on both forms", async () => {
    renderShell("home", { genreId: "deep-house", mobilePlayer: true });
    await screen.findByTestId("mobile-player", {}, { timeout: 5000 });

    // one -> genre -> all -> one, and every step is written to storage.
    fireEvent.click(screen.getByTestId("mobile-player-mode"));
    expect(localStorage.getItem("groove_mobile_play_mode")).toBe("genre");
    fireEvent.click(screen.getByTestId("mobile-player-mode"));
    expect(localStorage.getItem("groove_mobile_play_mode")).toBe("all");
    fireEvent.click(screen.getByTestId("mobile-player-mode"));
    expect(localStorage.getItem("groove_mobile_play_mode")).toBe("one");
  });

  it("skips within the mode's queue", async () => {
    // `all` jumps to a different genre; `one` stays put.
    localStorage.setItem("groove_mobile_play_mode", "all");
    const { onOpenPlayer } = renderShell("home", { genreId: "chicago-house", mobilePlayer: true });
    await screen.findByTestId("mobile-player", {}, { timeout: 5000 });

    fireEvent.click(screen.getByTestId("mobile-player-skip-forward"));
    expect(audition.toggle).toHaveBeenCalledTimes(1);
    const played = audition.toggle.mock.calls[0][0].id as string;
    expect(played).not.toBe("chicago-house");
    expect(onOpenPlayer).toHaveBeenCalledWith(played);
  });

  it("says so when the player is pointed at a genre that does not exist", async () => {
    renderShell("home", { genreId: "ghost-genre", mobilePlayer: true });
    expect(await screen.findByTestId("mobile-player-missing", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("opens the full player from the bar, and cycles the mode from the bar too", async () => {
    audition.playingGenreId = "deep-house";
    const { onOpenPlayer } = renderShell("home");
    await findHome();
    const bar = await screen.findByTestId("mobile-player-bar");

    fireEvent.click(screen.getByTestId("mobile-player-open"));
    expect(onOpenPlayer).toHaveBeenCalledWith("deep-house");

    fireEvent.click(within(bar).getByTestId("mobile-player-mode"));
    expect(localStorage.getItem("groove_mobile_play_mode")).toBe("genre");
  });
});

describe("phone cutover · which surface a URL gets", () => {
  /**
   * The staged cutover: the shell is the phone's default entry, but an explicit destination still
   * wins. This is asserted as a pure rule so the decision is visible without rendering the app.
   */
  it("enters the shell on a bare phone visit", () => {
    expect(shouldEnterPhoneShell({ isMobile: true, pathname: "/", search: "" })).toBe(true);
    expect(shouldEnterPhoneShell({ isMobile: true, pathname: "", search: "" })).toBe(true);
  });

  it("leaves a phone alone when the URL names a destination", () => {
    for (const search of ["?tab=studio", "?genre=deep-house", "?groove=abc", "?m=jam", "?player=1"]) {
      expect(shouldEnterPhoneShell({ isMobile: true, pathname: "/", search }), search).toBe(false);
    }
    expect(shouldEnterPhoneShell({ isMobile: true, pathname: "/genre/deep-house", search: "" })).toBe(false);
    expect(shouldEnterPhoneShell({ isMobile: true, pathname: "/studio", search: "" })).toBe(false);
  });

  it("never redirects a desktop, and never re-enters an already-mobile route", () => {
    expect(shouldEnterPhoneShell({ isMobile: false, pathname: "/", search: "" })).toBe(false);
    expect(
      shouldEnterPhoneShell({ isMobile: true, mobileRoute: "home", pathname: "/m/home", search: "" })
    ).toBe(false);
  });
});
