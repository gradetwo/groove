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
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { MobileApp } from "../mobile/MobileApp";
import { MOBILE_MODULES, shouldEnterPhoneShell, type MobileModule } from "../mobile/mobileModules";
import { ALL_GENRES } from "../data/genres";
import { TIMELINE_STORIES } from "../data/timeline_stories";

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

  it("opens a genre from its card and starts it playing in one gesture", async () => {
    /**
     * The library used to repeat one identical play button per row. The card is now the target: one
     * tap opens the page and the shell starts the genre, so there is no play control to look at (or to
     * be identical sixteen times).
     */
    const { onOpenGenre } = renderShell("home");
    await findHome();
    const genreId = rowIds()[0];
    expect(document.querySelector(`[data-testid="mobile-genre-play-${genreId}"]`)).toBeNull();

    fireEvent.click(screen.getByTestId(`mobile-genre-row-${genreId}`));
    expect(audition.toggle).toHaveBeenCalledTimes(1);
    expect(audition.toggle.mock.calls[0][0].id).toBe(genreId);
    expect(onOpenGenre).toHaveBeenCalledWith(genreId);
  });

  it("says so when a search matches nothing instead of showing an empty list", async () => {
    renderShell("home");
    await findHome();
    fireEvent.change(screen.getByTestId("mobile-home-search"), { target: { value: "zzzz-no-such-genre" } });
    expect(rowIds()).toHaveLength(0);
    expect(screen.getByTestId("mobile-home-empty")).toBeInTheDocument();
  });

  it("brings the century timeline back as a capped vertical rail, oldest era first", async () => {
    /**
     * 首页 had lost the vertical timeline the desktop view carries. It comes back from the same
     * `TIMELINE_STORIES` data, but as a spine rather than the desktop's era cards: a fixed-height,
     * vertically scrolling rail whose nodes run chronologically down the screen.
     */
    renderShell("home");
    await findHome();

    const rail = screen.getByTestId("mobile-home-timeline");
    // Fixed height plus vertical scrolling is the shape; a horizontal carousel would fail both.
    expect(rail.className).toMatch(/max-h-\[300px\]/);
    expect(rail.className).toMatch(/overflow-y-auto/);
    expect(rail.className).not.toMatch(/\bm-rail\b/);

    const nodes = TIMELINE_STORIES.map((_, index) =>
      screen.getByTestId(`mobile-home-timeline-node-${index}`)
    );
    expect(nodes).toHaveLength(TIMELINE_STORIES.length);
    nodes.forEach((node, index) => {
      // The nodes live inside the rail, in data order: index i is the i-th era, top to bottom.
      expect(rail.contains(node)).toBe(true);
      expect(node.textContent ?? "").toContain(TIMELINE_STORIES[index].year);
      const match = node.className.match(/min-h-\[(\d+)px\]/);
      expect(match, `timeline node ${index} must declare a min height`).not.toBeNull();
      expect(Number(match![1]), `timeline node ${index} touch height`).toBeGreaterThanOrEqual(44);
    });

    // The ends of the rail, so an accidental reverse or shuffle is caught rather than only a count.
    expect(nodes[0].textContent ?? "").toContain("1900s");
    expect(nodes[nodes.length - 1].textContent ?? "").toContain("2020s");
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

  it("carries no play control and no jam hand-off", async () => {
    renderShell("home", { genreId: "deep-house" });
    await screen.findByTestId("mobile-genre-detail", {}, { timeout: 5000 });
    // The shell started this genre on the way in; the bar at the bottom is the transport, and the
    // page itself has no controls beyond going back.
    expect(screen.queryByTestId("mobile-detail-audition")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile-detail-jam")).not.toBeInTheDocument();
    expect(screen.getByTestId("mobile-detail-back")).toBeInTheDocument();
  });

  it("reads like a lyrics page: no boxes around the facts, only back and the related links as controls", async () => {
    /**
     * 曲风详情页 was a wall of panels and pills. The art, title and facts survive, but the facts are
     * now plain label/value rows on the dark ground and the only interactive elements left are the
     * back arrow and the related-genre links.
     */
    renderShell("home", { genreId: "deep-house" });
    const detail = await screen.findByTestId("mobile-genre-detail", {}, { timeout: 5000 });

    expect(screen.getByTestId("mobile-detail-art")).toBeInTheDocument();
    const facts = screen.getByTestId("mobile-detail-facts");
    expect(facts.textContent ?? "").toMatch(/BPM|拍号|Time/);
    for (const row of [...facts.children]) {
      expect(row.className, "a fact row must not be a card").not.toMatch(/rounded|border|m-card/);
    }

    const related = [...document.querySelectorAll('[data-testid^="mobile-detail-related-"]')].filter(
      (node) => node.getAttribute("data-testid") !== "mobile-detail-related"
    );
    expect(related.length).toBeGreaterThan(0);
    for (const node of related) {
      expect(node.className, "a related genre must not be a pill").not.toMatch(/rounded|border|m-card/);
      const match = node.className.match(/min-h-\[(\d+)px\]/);
      expect(match, "a related genre link must still declare a min height").not.toBeNull();
      expect(Number(match![1]), "related genre touch target").toBeGreaterThanOrEqual(44);
    }

    // Nothing interactive on the page besides the way back and those links.
    const others = [...detail.querySelectorAll("button")].filter((node) => {
      const id = node.getAttribute("data-testid") ?? "";
      return id !== "mobile-detail-back" && !id.startsWith("mobile-detail-related-");
    });
    expect(others.map((node) => node.getAttribute("data-testid"))).toEqual([]);
  });

  it("returns to the previous screen when the page is tapped, but not when a link is", async () => {
    const { onCloseGenre, onOpenGenre } = renderShell("home", { genreId: "deep-house" });
    const detail = await screen.findByTestId("mobile-genre-detail", {}, { timeout: 5000 });

    // A tap on the page itself goes back…
    fireEvent.click(detail);
    expect(onCloseGenre).toHaveBeenCalledTimes(1);
    expect(onOpenGenre).not.toHaveBeenCalled();

    // …while a tap on a related genre is still that genre's link.
    onCloseGenre.mockClear();
    const related = [...document.querySelectorAll('[data-testid^="mobile-detail-related-"]')].find(
      (node) => node.getAttribute("data-testid") !== "mobile-detail-related"
    ) as HTMLElement | undefined;
    if (related) {
      fireEvent.click(related);
      expect(onCloseGenre).not.toHaveBeenCalled();
      expect(onOpenGenre).toHaveBeenCalledTimes(1);
    }
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

  it("keeps the track list collapsed until the list button opens it", async () => {
    renderShell("home", { genreId: "deep-house", mobilePlayer: true });
    await screen.findByTestId("mobile-player", {}, { timeout: 5000 });

    /**
     * The panel is *collapsed*, not unmounted.
     *
     * The reference slides its pull-down list open (`max-height: 0` → `280px`), and a list that is
     * removed from the DOM cannot animate — so "closed" is `aria-hidden` plus a zero max-height, which
     * is also what keeps the rows out of a screen reader's way while shut.
     */
    const closed = screen.getByTestId("mobile-player-drawer-panel");
    expect(closed.getAttribute("aria-hidden")).toBe("true");
    expect(closed.className).not.toContain("is-open");
    expect(screen.getByTestId("mobile-player-drawer-toggle").getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(screen.getByTestId("mobile-player-drawer-toggle"));
    const panel = screen.getByTestId("mobile-player-drawer-panel");
    expect(panel.className).toContain("is-open");
    expect(panel.getAttribute("aria-hidden")).toBe("false");
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

describe("phone player · the jog", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "zh");
    localStorage.removeItem("groove_mobile_play_mode");
    audition.toggle.mockReset();
    audition.stop.mockReset();
    audition.playingGenreId = null;
  });

  it("changes the tempo when the record is dragged, and reports it to the engine", async () => {
    const props = renderShell("home", { genreId: "deep-house", mobilePlayer: true });
    await screen.findByTestId("mobile-player", {}, { timeout: 5000 });
    // Deep House is 122 BPM; a 50px drag is +10 BPM at the reference's 0.2 BPM/px.
    expect(screen.getByTestId("mobile-player-bpm").textContent).toContain("122 BPM");
    const vinyl = screen.getByTestId("mobile-vinyl");

    fireEvent.pointerDown(vinyl, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(vinyl, { clientX: 150, pointerId: 1 });
    /**
     * The readout is the *damper's*, so it walks to the new tempo instead of snapping — the engine is
     * told immediately, the number follows within a few hundred milliseconds (that easing is the point:
     * it is what makes a jog sound and look like a motor).
     */
    await waitFor(() => expect(screen.getByTestId("mobile-player-bpm").textContent).toContain("132 BPM"));
    fireEvent.pointerUp(vinyl, { clientX: 150, pointerId: 1 });
    expect(props.onOpenGenre).not.toHaveBeenCalled();
  });

  it("clamps the jog to the engine's own range", async () => {
    renderShell("home", { genreId: "deep-house", mobilePlayer: true });
    await screen.findByTestId("mobile-player", {}, { timeout: 5000 });
    const vinyl = screen.getByTestId("mobile-vinyl");

    fireEvent.pointerDown(vinyl, { clientX: 0, pointerId: 1 });
    for (let i = 0; i < 10; i += 1) fireEvent.pointerMove(vinyl, { clientX: 500, pointerId: 1 });
    await waitFor(() => expect(screen.getByTestId("mobile-player-bpm").textContent).toContain("180 BPM"));
    fireEvent.pointerUp(vinyl, { clientX: 500, pointerId: 1 });

    // Each move's delta is measured against the previous point, so the drag steps left gradually.
    let x = 500;
    fireEvent.pointerDown(vinyl, { clientX: x, pointerId: 2 });
    for (let i = 0; i < 20; i += 1) {
      x -= 100;
      fireEvent.pointerMove(vinyl, { clientX: x, pointerId: 2 });
    }
    await waitFor(() => expect(screen.getByTestId("mobile-player-bpm").textContent).toContain("60 BPM"));
    fireEvent.pointerUp(vinyl, { clientX: x, pointerId: 2 });
  });

  it("also moves the tempo with the explicit ± buttons", async () => {
    renderShell("home", { genreId: "deep-house", mobilePlayer: true });
    await screen.findByTestId("mobile-player", {}, { timeout: 5000 });
    // One step per press, as in the reference — the coarse moves are the drag and the press-and-hold.
    fireEvent.click(screen.getByTestId("mobile-player-bpm-up"));
    await waitFor(() => expect(screen.getByTestId("mobile-player-bpm-value").textContent).toContain("123"));
    fireEvent.click(screen.getByTestId("mobile-player-bpm-down"));
    fireEvent.click(screen.getByTestId("mobile-player-bpm-down"));
    await waitFor(() => expect(screen.getByTestId("mobile-player-bpm-value").textContent).toContain("121"));
  });
});

describe("phone shell · full-screen surfaces own the screen", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "zh");
    audition.toggle.mockReset();
    audition.stop.mockReset();
    audition.playingGenreId = null;
  });

  it("hides the module bar on a genre's page, and keeps only the player bar there", async () => {
    audition.playingGenreId = "deep-house";
    renderShell("home", { genreId: "deep-house" });
    await screen.findByTestId("mobile-genre-detail", {}, { timeout: 5000 });

    expect(screen.queryByTestId("mobile-module-bar")).not.toBeInTheDocument();
    expect(screen.getByTestId("mobile-player-bar")).toBeInTheDocument();
  });

  it("hides both bars inside the full-screen player", async () => {
    audition.playingGenreId = "deep-house";
    renderShell("home", { genreId: "deep-house", mobilePlayer: true });
    await screen.findByTestId("mobile-player", {}, { timeout: 5000 });

    expect(screen.queryByTestId("mobile-module-bar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile-player-bar")).not.toBeInTheDocument();
  });

  it("keeps the module bar while browsing the library", async () => {
    renderShell("home");
    await findHome();
    expect(screen.getByTestId("mobile-module-bar")).toBeInTheDocument();
  });
});
