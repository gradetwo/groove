import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { ExploreListView, EXPLORE_FIRST_CHUNK } from "../views/ExploreListView";
import { ALL_GENRES } from "../data/genres";
import { LanguageProvider } from "../i18n/LanguageContext";

/**
 * ⭐ **The Explore list draws a window of cards, the way the phone's two lists do.**
 *
 * Before the window, the list rendered **every** group at once: measured on 2026-10-12 (box load average 2.7) as
 * **159 `[role=listitem]` cards and 6,495 DOM nodes** in one jsdom mount, median **800 ms** over six fresh mounts
 * (917.6 / 800.0 / 638.9 / 512.5 / 971.3 / 468.3). The phone had already answered the same shape twice —
 * `MobileHomeScreen` and the PR-merged `MobileGenrePicker` — so this is that window: the first 24 cards, the rest in
 * idle passes (24 → 48 → 96 → 159). After it: **24 cards, 1,095 nodes, median 138–151 ms** over the same six-mount
 * harness, and the grown steady state is still all 159 cards / 6,495 nodes — the window moves *when* the nodes are
 * built, it does not drop any.
 *
 * What this pins is the **shape**, not a wall-clock reading: the initial card and node counts do not follow the size of
 * the filtered list, the group headers still describe the whole list, the keyboard cursor can still reach a card past
 * the window, and a filter change starts the window over. The wall-clock numbers above are an indicator from a loaded
 * box; the node caps are the gate, because they mean the same thing on every machine.
 */
const renderList = (props: Partial<React.ComponentProps<typeof ExploreListView>> = {}) =>
  render(
    <LanguageProvider>
      <ExploreListView onSelectGenre={() => {}} onOpenStudio={() => {}} {...props} />
    </LanguageProvider>
  );

/** The card nodes, counted the way the audit counted them. */
const cards = (container: HTMLElement): number => container.querySelectorAll('[role="listitem"]').length;

/** The cover test-ids are one per rendered genre, so this is the set of genres actually drawn. */
const coverIds = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('[data-testid^="explore-cover-"]')].map((el) => el.getAttribute("data-testid") ?? "");

describe("the Explore list's DOM budget", () => {
  // The idle passes are timers; the fake clock makes "initially" mean exactly the first paint and nothing later.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("⭐ renders one chunk of cards initially, not all 159", () => {
    // The data size this is measured at, so the cap cannot be read as a coincidence of a small library.
    expect(ALL_GENRES.length).toBe(159);
    const { container } = renderList();

    const initial = cards(container);
    expect(initial, `first paint rendered ${initial} cards`).toBeLessThanOrEqual(EXPLORE_FIRST_CHUNK);
    expect(initial).toBe(EXPLORE_FIRST_CHUNK);
    // Measured before the window: 6,495 nodes. The whole-tree count is the machine-independent reading, so the cap is
    // set well above the windowed 1,095 and well below the un-windowed 6,495.
    const nodes = container.querySelectorAll("*").length;
    expect(nodes, `first paint rendered ${nodes} DOM nodes`).toBeLessThan(2_500);
  });

  it("⭐ keeps the group headers describing the full 159", () => {
    renderList();
    const byCategory = new Map<string, number>();
    for (const genre of ALL_GENRES) byCategory.set(genre.category, (byCategory.get(genre.category) ?? 0) + 1);

    let counted = 0;
    for (const [category, count] of byCategory) {
      const badge = screen.getByTestId(`explore-group-count-${category}`);
      // The header reads the group's whole size even though the window draws only part of it.
      expect(badge.textContent, `${category} header`).toBe(String(count));
      counted += Number(badge.textContent);
    }
    expect(counted).toBe(ALL_GENRES.length);
    // …and the rows really are windowed at the same moment the counts are not.
    expect(cards(document.body)).toBe(EXPLORE_FIRST_CHUNK);
  });

  it("⭐ keyboard navigation reaches a card past the window and it then renders", () => {
    const { container } = renderList();
    const initialIds = coverIds(container);
    expect(initialIds.length).toBe(EXPLORE_FIRST_CHUNK);

    // The cursor starts at index 0, so EXPLORE_FIRST_CHUNK presses move it to the first card the window left out.
    const region = container.firstElementChild as HTMLElement;
    for (let i = 0; i < EXPLORE_FIRST_CHUNK; i += 1) {
      fireEvent.keyDown(region, { key: "ArrowDown" });
    }

    const added = coverIds(container).filter((id) => !initialIds.includes(id));
    // The window grows by exactly the focused card — no more — and that card is the one wearing the ring.
    expect(added.length, "the focused card did not join the window").toBe(1);
    expect(cards(container)).toBe(EXPLORE_FIRST_CHUNK + 1);
    const focused = container.querySelector('[role="listitem"].ring-2');
    expect(focused, "no card carries the focus ring").toBeTruthy();
    expect(focused!.querySelector('[data-testid^="explore-cover-"]')!.getAttribute("data-testid")).toBe(added[0]);
  });

  it("⭐ a filter change restarts the window instead of holding a stale card count", () => {
    const { container } = renderList();
    act(() => {
      vi.advanceTimersByTime(32);
    });
    act(() => {
      vi.advanceTimersByTime(32);
    });
    expect(cards(container)).toBe(EXPLORE_FIRST_CHUNK * 4);

    // "e" matches 127 of the 159 genres — more than a chunk — so a window that survived the change would show 96 rows.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "e" } });
    expect(cards(container)).toBe(EXPLORE_FIRST_CHUNK);
  });

  it("⭐ the idle passes finish the list, so nothing is left out", () => {
    const { container } = renderList();
    expect(cards(container)).toBe(EXPLORE_FIRST_CHUNK);

    for (const expected of [EXPLORE_FIRST_CHUNK * 2, EXPLORE_FIRST_CHUNK * 4, ALL_GENRES.length]) {
      act(() => {
        vi.advanceTimersByTime(32);
      });
      expect(cards(container)).toBe(expected);
    }
    // Every genre of the library is drawn, not just the head that was drawn first.
    expect(new Set(coverIds(container)).size).toBe(ALL_GENRES.length);
  });
});
