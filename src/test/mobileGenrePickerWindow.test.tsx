import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { MobileGenrePicker, PICKER_FIRST_CHUNK } from "../mobile/MobileGenrePicker";
import { GENRE_INDEX } from "../mobile/mobileGenreData";
import { LanguageProvider } from "../i18n/LanguageContext";

/**
 * ⭐ **The picker's genre level is windowed, like the home screen's library.**
 *
 * The audit that prompted this measured the full picker at **159 rows / 160 buttons and ~1 765 DOM nodes** in one
 * paint: the whole library, matched against the stylesheet before the first frame — the same long task
 * `MobileHomeScreen` removed from the phone's first screen (see `FIRST_CHUNK` there). The picker was the only phone
 * list still rendering its full result set.
 *
 * What this pins is the **shape**, not a wall-clock reading: the initial row count is capped at `PICKER_FIRST_CHUNK`
 * no matter how large the filtered library is, the rest arrive in idle passes, and every existing behaviour — the
 * full-count readout, the empty state, selection, the current row, back and close — still works on the windowed list.
 * A jank reading is a probe (`scripts/probe_import_playback_jank.mjs` says why); the node cap is the gate.
 */
const renderPicker = (props: Partial<React.ComponentProps<typeof MobileGenrePicker>> = {}) =>
  render(
    <LanguageProvider>
      <MobileGenrePicker open initialCategory="all" onSelect={() => {}} {...props} />
    </LanguageProvider>
  );

const rows = (container: HTMLElement): number =>
  container.querySelectorAll('[data-testid^="mobile-genre-picker-genre-"]').length;

describe("the genre picker's DOM budget", () => {
  // The idle passes are timers; the fake clock makes "initially" mean exactly the first paint and nothing later.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("⭐ renders one chunk of rows initially, not all 159 of the library", () => {
    // The data size this is measured at, so the cap cannot be read as a coincidence of a small library.
    expect(GENRE_INDEX.length).toBe(159);
    const { container } = renderPicker();

    const initial = rows(container);
    expect(initial, `first paint rendered ${initial} genre rows`).toBeLessThanOrEqual(PICKER_FIRST_CHUNK);
    expect(initial).toBe(PICKER_FIRST_CHUNK);
    // The generic picker's own row ids, not the player's prefixed ones.
    expect(screen.getByTestId(`mobile-genre-picker-genre-${GENRE_INDEX[0]!.id}`)).toBeTruthy();
    // …and the row past the window is not in the DOM yet.
    expect(container.querySelector(`[data-testid="mobile-genre-picker-genre-${GENRE_INDEX[GENRE_INDEX.length - 1]!.id}"]`)).toBeNull();
  });

  it("⭐ keeps the count and the rows the same as before the window", () => {
    const { container } = renderPicker();
    // The readout reads the filtered library, not the window: still all 159.
    expect(screen.getByTestId("mobile-genre-picker-count").textContent).toContain(String(GENRE_INDEX.length));
    // The rows drawn are the head of that library, in order, still numbered from 01.
    const first = screen.getByTestId(`mobile-genre-picker-genre-${GENRE_INDEX[0]!.id}`);
    expect(first.textContent).toContain("01");
    expect(rows(container)).toBe(PICKER_FIRST_CHUNK);
    // Every drawn row is a real genre button; the list plus the back control are the only buttons.
    expect(container.querySelectorAll("button").length).toBe(PICKER_FIRST_CHUNK + 1);
  });

  it("⭐ fills the rest in idle passes, doubling until the library is complete", () => {
    const { container } = renderPicker();
    expect(rows(container)).toBe(PICKER_FIRST_CHUNK);

    for (const expected of [PICKER_FIRST_CHUNK * 2, PICKER_FIRST_CHUNK * 4, GENRE_INDEX.length]) {
      act(() => {
        vi.advanceTimersByTime(32);
      });
      expect(rows(container)).toBe(expected);
    }
    // Nothing is left out: the last row of the library is reachable.
    expect(screen.getByTestId(`mobile-genre-picker-genre-${GENRE_INDEX[GENRE_INDEX.length - 1]!.id}`)).toBeTruthy();
  });

  it("⭐ a new search restarts the window instead of holding a stale row count", () => {
    const { container } = renderPicker();
    act(() => {
      vi.advanceTimersByTime(32);
    });
    act(() => {
      vi.advanceTimersByTime(32);
    });
    expect(rows(container)).toBeGreaterThan(PICKER_FIRST_CHUNK);

    fireEvent.change(screen.getByTestId("mobile-genre-picker-search"), { target: { value: "house" } });
    expect(rows(container)).toBeLessThanOrEqual(PICKER_FIRST_CHUNK);
  });

  it("⭐ an empty result still says so, and a choice still reports", () => {
    const onSelect = vi.fn();
    const { container } = renderPicker({ onSelect });
    fireEvent.change(screen.getByTestId("mobile-genre-picker-search"), {
      target: { value: "no-such-genre-zzz" },
    });
    expect(rows(container)).toBe(0);
    expect(screen.getByTestId("mobile-genre-picker-empty")).toBeTruthy();

    fireEvent.change(screen.getByTestId("mobile-genre-picker-search"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId(`mobile-genre-picker-genre-${GENRE_INDEX[0]!.id}`));
    expect(onSelect).toHaveBeenLastCalledWith(GENRE_INDEX[0]!.id);
  });

  it("⭐ the current row is still marked, behind the window too", () => {
    const first = GENRE_INDEX[0]!.id;
    renderPicker({ currentGenreId: first });
    expect(screen.getByTestId(`mobile-genre-picker-genre-${first}`).getAttribute("aria-current")).toBe("true");
  });

  it("⭐ back and close still work on the windowed level", () => {
    const onClose = vi.fn();
    const { container } = renderPicker({ onClose });
    fireEvent.click(screen.getByTestId("mobile-genre-picker-back"));
    expect(screen.getByTestId("mobile-genre-picker-categories")).toBeTruthy();
    expect(container.querySelector('[data-testid="mobile-genre-picker-genres"]')).toBeNull();
    expect(rows(container)).toBe(0);
    fireEvent.click(screen.getByTestId("mobile-genre-picker-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
