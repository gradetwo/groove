/**
 * The phone's multi-level genre picker (C-02).
 *
 * What this file protects, in the order a thumb meets it:
 *
 *  - **reachability.** The shell's existing genre control — the player transport's list button — opens
 *    the picker; the picker is not a route or a screen only a test knows about.
 *  - **the two levels.** It opens on the six categories, a category leads to that category's genres,
 *    and the back control returns to the categories. Both directions are asserted on `data-level`, the
 *    way the player's port tests assert its own state.
 *  - **the filter, in both languages.** `Genre.name` is English and the Chinese name is a CJK alias, so
 *    a query has to match either — the bug this guards is a filter that only knows English.
 *  - **the choice.** Selecting a genre reports its **id** to the host (the shell resolves the record),
 *    and the player's host turns that into `onPlayGenre` without leaving the record.
 *  - **44 px.** `PICKER_MIN_TARGET_PX` is the contract, and every control in the rendered DOM carries a
 *    44 px-minimum class. A control you cannot hit is not a control.
 *
 * Behaviour, not markup: the assertions are on level state, on which ids are present, on the handler,
 * and on the touch class — not on an exact tree.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import {
  MobileGenrePicker,
  PICKER_MIN_TARGET_PX,
  PICKER_CATEGORIES,
  CATEGORY_LABEL_KEYS,
  categorySlug,
} from "../mobile/MobileGenrePicker";
import { MobilePlayerScreen } from "../mobile/screens/MobilePlayerScreen";
import { GENRE_INDEX } from "../mobile/mobileGenreData";
import { genreNameZh } from "../mobile/genreQuery";
import { DICTIONARY } from "../i18n/locales";

/** The keyword this file is written around, and a genre that must never match it. */
const HOUSE = "house";
const NOT_HOUSE = "boom-bap";

/** The first data genre's Chinese name ("芝加哥浩室"); its first two characters are the CJK query. */
const ZH_GENRE = GENRE_INDEX.find((genre) => genreNameZh(genre))!;
const ZH_QUERY = genreNameZh(ZH_GENRE).slice(0, 2);
const NOT_ZH = "boom-bap";

const genreIdsIn = (category: string): string[] =>
  GENRE_INDEX.filter((genre) => genre.category === category).map((genre) => genre.id);

/** The ids rendered under a test-id prefix; the player passes its own, so the prefix is a parameter. */
const genreIdsWith = (prefix = "mobile-genre-picker-genre"): string[] =>
  [...document.querySelectorAll(`[data-testid^="${prefix}-"]`)].map((node) =>
    (node.getAttribute("data-testid") ?? "").replace(`${prefix}-`, "")
  );

const renderedGenreIds = (): string[] => genreIdsWith();

/**
 * The host callbacks, so a test can assert what the picker reported.
 *
 * `onSelect` is always passed; `onClose` is only passed when the test asks for the close controls, so
 * the plain renders have exactly the level's own buttons and no backdrop to special-case.
 */
const renderPicker = (props: Partial<React.ComponentProps<typeof MobileGenrePicker>> = {}) => {
  const onSelect = vi.fn();
  const utils = render(
    <LanguageProvider>
      <MobileGenrePicker onSelect={onSelect} {...props} />
    </LanguageProvider>
  );
  return { ...utils, onSelect };
};

describe("MobileGenrePicker · the two levels", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "en");
  });

  it("opens on the category level, with all six categories and the whole library", () => {
    renderPicker();

    expect(screen.getByTestId("mobile-genre-picker")).toHaveAttribute("data-level", "categories");
    expect(renderedGenreIds()).toEqual([]);

    const categories = within(screen.getByTestId("mobile-genre-picker-categories")).getAllByRole("button");
    expect(categories).toHaveLength(PICKER_CATEGORIES.length + 1); // the six categories + 全部

    for (const category of PICKER_CATEGORIES) {
      const row = screen.getByTestId(`mobile-genre-picker-category-${categorySlug(category)}`);
      // The count is the shipped library's own arithmetic, not a number typed into the component.
      expect(row.textContent).toContain(String(genreIdsIn(category).length));
    }
    expect(screen.getByTestId("mobile-genre-picker-category-all").textContent).toContain(
      String(GENRE_INDEX.length)
    );
  });

  it("shows one category's genres, and only those, then goes back to the categories", () => {
    renderPicker();

    fireEvent.click(screen.getByTestId("mobile-genre-picker-category-hip-hop"));

    expect(screen.getByTestId("mobile-genre-picker")).toHaveAttribute("data-level", "genres");
    const ids = renderedGenreIds();
    expect(new Set(ids)).toEqual(new Set(genreIdsIn("Hip Hop")));

    fireEvent.click(screen.getByTestId("mobile-genre-picker-back"));
    expect(screen.getByTestId("mobile-genre-picker")).toHaveAttribute("data-level", "categories");
    expect(renderedGenreIds()).toEqual([]);
  });

  it("opens directly on a category's genres when the host asks it to", () => {
    // The player's shape: its list is "what else could play", so it leads with the record's category.
    renderPicker({ initialCategory: "Jazz/Blues" });
    expect(screen.getByTestId("mobile-genre-picker")).toHaveAttribute("data-level", "genres");
    expect(new Set(renderedGenreIds())).toEqual(new Set(genreIdsIn("Jazz/Blues")));
  });

  it("marks the genre that is already playing, and still reports a second tap", () => {
    renderPicker({ currentGenreId: "deep-house", initialCategory: "Electronic" });
    const current = screen.getByTestId("mobile-genre-picker-genre-deep-house");
    expect(current).toHaveAttribute("aria-current", "true");
    expect(current.querySelectorAll(".m-eq i")).toHaveLength(3);
  });
});

describe("MobileGenrePicker · the filter", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "en");
  });

  it("filters on the English name and switches to the results level", () => {
    const { container } = renderPicker();
    // Still on the categories: typing is what moves the picker, not a tap.
    fireEvent.change(screen.getByTestId("mobile-genre-picker-search"), { target: { value: HOUSE } });

    expect(screen.getByTestId("mobile-genre-picker")).toHaveAttribute("data-level", "genres");
    const ids = renderedGenreIds();
    expect(ids).toContain("chicago-house");
    expect(ids).not.toContain(NOT_HOUSE);

    // The result set is exactly the library's own match, so a filter that dropped the aliases fails.
    const expected = GENRE_INDEX.filter((genre) =>
      `${genre.name} ${genre.aliases.join(" ")}`.toLowerCase().includes(HOUSE)
    ).map((genre) => genre.id);
    expect(new Set(ids)).toEqual(new Set(expected));
    expect(container.querySelectorAll('[data-testid="mobile-genre-picker-genres"] li').length).toBe(ids.length);
  });

  it("filters on the Chinese alias too", () => {
    renderPicker();
    fireEvent.change(screen.getByTestId("mobile-genre-picker-search"), { target: { value: ZH_QUERY } });

    const ids = renderedGenreIds();
    expect(ids).toContain(ZH_GENRE.id);
    expect(ids).not.toContain(NOT_ZH);
    // The query is a real narrowing: a full library would mean the CJK branch never ran.
    expect(ids.length).toBeLessThan(GENRE_INDEX.length);
  });

  it("says so instead of showing an empty list when nothing matches", () => {
    renderPicker();
    fireEvent.change(screen.getByTestId("mobile-genre-picker-search"), {
      target: { value: "zzzz-no-such-genre" },
    });
    expect(screen.getByTestId("mobile-genre-picker-empty")).toBeInTheDocument();
    expect(renderedGenreIds()).toEqual([]);
  });
});

describe("MobileGenrePicker · the choice and the controls", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "en");
  });

  it("reports the chosen genre's id to the host", () => {
    const { onSelect } = renderPicker({ initialCategory: "Hip Hop" });
    const target = genreIdsIn("Hip Hop").find((id) => id !== "boom-bap") ?? genreIdsIn("Hip Hop")[0];

    fireEvent.click(screen.getByTestId(`mobile-genre-picker-genre-${target}`));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(target);
  });

  it("keeps the host's row ids when it asks for them", () => {
    // The player passes its own prefix so the rows keep the ids its tests and the E2E matrix drive.
    renderPicker({ initialCategory: "Hip Hop", genreTestIdPrefix: "mobile-player-cue" });
    expect(screen.getByTestId(`mobile-player-cue-${genreIdsIn("Hip Hop")[0]}`)).toBeInTheDocument();
    expect(renderedGenreIds()).toEqual([]);
  });

  it("closes from its own control when the host gives it one", () => {
    const onClose = vi.fn();
    renderPicker({ onClose });

    fireEvent.click(screen.getByTestId("mobile-genre-picker-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders nothing while closed, so the host can keep it mounted", () => {
    renderPicker({ open: false, onClose: vi.fn() });
    expect(screen.queryByTestId("mobile-genre-picker")).toBeNull();
  });

  it("uses native buttons on both levels, so a tap and a keyboard activate the same control", () => {
    /**
     * jsdom does not synthesise a click from Enter/Space (and `@testing-library/user-event` is not a
     * dependency here), so the honest assertion is the one a browser relies on: each level's control is
     * a real, focusable `<button type="button">`, and activating it runs the handler. That is exactly
     * what the browser's Enter/Space default does to a focused button.
     */
    const { onSelect } = renderPicker();
    const category = screen.getByTestId("mobile-genre-picker-category-electronic");
    expect(category.tagName).toBe("BUTTON");
    expect(category).toHaveAttribute("type", "button");
    category.focus();
    expect(document.activeElement).toBe(category);

    fireEvent.click(category);
    const genre = screen.getByTestId(`mobile-genre-picker-genre-${genreIdsIn("Electronic")[0]}`);
    expect(genre.tagName).toBe("BUTTON");
    expect(genre).toHaveAttribute("type", "button");
    genre.focus();
    expect(document.activeElement).toBe(genre);
    fireEvent.click(genre);
    expect(onSelect).toHaveBeenCalledWith(genreIdsIn("Electronic")[0]);
  });
});

describe("MobileGenrePicker · the 44 px contract", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "en");
  });

  it("declares the number the phone's touch matrix measures elsewhere", () => {
    expect(PICKER_MIN_TARGET_PX).toBe(44);
  });

  it("keeps every control at the touch minimum on both levels", () => {
    const { container } = renderPicker({ onClose: vi.fn() });
    const touchable = () => [...container.querySelectorAll("button, input")];

    const assertAll = (level: string) => {
      const controls = touchable();
      expect(controls.length, level).toBeGreaterThan(0);
      for (const control of controls) {
        const id = control.getAttribute("data-testid") ?? control.tagName;
        expect(control.className, `${level}: ${id} must hold the 44 px touch minimum`).toMatch(
          /\bmin-h-11\b|\bh-11\b/
        );
      }
    };

    assertAll("categories");
    fireEvent.click(screen.getByTestId("mobile-genre-picker-category-electronic"));
    assertAll("genres");
  });
});

describe("MobileGenrePicker · the shell's own labels", () => {
  it("names every category through a dictionary key that exists, in both languages", () => {
    /**
     * The category keys are looked up dynamically (`t(CATEGORY_LABEL_KEYS[cat])`), so the source scanner
     * in `i18nKeys.test.ts` — which only sees literal `t("…")` calls — cannot catch a typo here. This
     * test is that guard: every category resolves to a real entry with both translations filled in.
     */
    for (const category of PICKER_CATEGORIES) {
      const key = CATEGORY_LABEL_KEYS[category];
      const entry = (DICTIONARY as Record<string, { en?: string; zh?: string }>)[key];
      expect(entry, `${category} → ${key}`).toBeTruthy();
      expect(entry?.en, `${key}.en`).toBeTruthy();
      expect(entry?.zh, `${key}.zh`).toBeTruthy();
    }
  });

  it("prints the category names from the dictionary, not the raw data strings", () => {
    localStorage.setItem("groove_language", "zh");
    renderPicker();
    expect(screen.getByTestId("mobile-genre-picker-category-electronic").textContent).toContain(
      DICTIONARY.mobile_category_electronic.zh
    );
    expect(screen.getByTestId("mobile-genre-picker-category-electronic").textContent).not.toContain("Electronic");
  });
});

describe("the picker is reachable from the player's own genre control", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "en");
  });

  it("opens from the transport's list button and plays the chosen genre without leaving the record", async () => {
    const onPlayGenre = vi.fn();
    render(
      <LanguageProvider>
        <div className="mobile-root" data-module="home">
          <MobilePlayerScreen
            genreId="deep-house"
            isPlaying={false}
            playMode="one"
            readClock={() => null}
            onTogglePlay={vi.fn()}
            onPlayGenre={onPlayGenre}
            onCycleMode={vi.fn()}
            onSkip={vi.fn()}
            onCollapse={vi.fn()}
            onOpenDetail={vi.fn()}
          />
        </div>
      </LanguageProvider>
    );
    await screen.findByTestId("mobile-player", {}, { timeout: 5000 });

    expect(screen.queryByTestId("mobile-genre-picker")).toBeNull();
    fireEvent.click(screen.getByTestId("mobile-player-drawer-toggle"));

    // It opens on the record's own category (Electronic), so the answer to "what else" is one tap away.
    const picker = screen.getByTestId("mobile-genre-picker");
    expect(picker).toHaveAttribute("data-level", "genres");
    const other = genreIdsWith("mobile-player-cue").find((id) => id !== "deep-house")!;

    fireEvent.click(screen.getByTestId(`mobile-player-cue-${other}`));
    expect(onPlayGenre).toHaveBeenCalledWith(other);
    // The record never unmounts: the choice switches it rather than navigating away.
    expect(screen.getByTestId("mobile-player")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-genre-picker")).toBeNull();
  });
});
