import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { InstrumentLibraryV2 } from "../components/arrangement/InstrumentLibraryV2";
import { LanguageProvider } from "../i18n/LanguageContext";
import type { InstrumentChoice } from "../components/arrangement/TrackListV2";

const renderPanel = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

const CATEGORIES = ["Strings", "Brass", "Woodwinds"] as const;

const makeInstruments = (count: number): InstrumentChoice[] =>
  Array.from({ length: count }, (_, i) => ({
    assetId: `inst-${i}`,
    name: `Test Instrument ${i}`,
    category: CATEGORIES[i % CATEGORIES.length],
    library: "test-lib",
  }));

const optionCount = (container: HTMLElement): number =>
  container.querySelectorAll('[data-testid^="instrument-option-"]').length;

const searchInput = (container: HTMLElement): HTMLInputElement => {
  const input = container.querySelector('input[type="search"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("search box not found");
  return input;
};

/**
 * ⭐ **The instrument list is windowed.** The catalogue holds hundreds of instruments and each row carries an
 * audition button plus a coverage read, so rendering every match at once was a heavy DOM. These cases pin the
 * windowing contract: only one page of rows is drawn under a large catalogue, the person grows the window on
 * demand, and search / category / choice / audition behave exactly as before — the rows are the same rows, there
 * are just never hundreds of them at once.
 */
describe("InstrumentLibraryV2 windowing", () => {
  it("⭐ renders one page of rows, not the whole catalogue, under a large list", () => {
    const { container } = renderPanel(
      <InstrumentLibraryV2 instruments={makeInstruments(500)} onChoose={() => {}} />
    );
    expect(optionCount(container)).toBe(60);
    const more = screen.getByTestId("instrument-show-more");
    expect(more.textContent).toContain("60");
    expect(more.textContent).toContain("500");
  });

  it("⭐ grows the window by a page when the person asks for more", () => {
    const { container } = renderPanel(
      <InstrumentLibraryV2 instruments={makeInstruments(500)} onChoose={() => {}} />
    );
    fireEvent.click(screen.getByTestId("instrument-show-more"));
    expect(optionCount(container)).toBe(120);
    fireEvent.click(screen.getByTestId("instrument-show-more"));
    expect(optionCount(container)).toBe(180);
  });

  it("⭐ stops offering more once every match is on the page", () => {
    const { container } = renderPanel(
      <InstrumentLibraryV2 instruments={makeInstruments(40)} onChoose={() => {}} />
    );
    expect(optionCount(container)).toBe(40);
    expect(screen.queryByTestId("instrument-show-more")).toBeNull();
  });

  it("⭐ a new search restarts the window instead of holding a stale count", () => {
    const instruments: InstrumentChoice[] = [
      ...makeInstruments(500),
      { assetId: "zephyr-oboe", name: "Zephyr Oboe", category: "Woodwinds", library: "test-lib" },
    ];
    const { container } = renderPanel(
      <InstrumentLibraryV2 instruments={instruments} onChoose={() => {}} />
    );
    fireEvent.click(screen.getByTestId("instrument-show-more"));
    expect(optionCount(container)).toBe(120);
    fireEvent.change(searchInput(container), { target: { value: "Zephyr" } });
    expect(optionCount(container)).toBe(1);
    expect(screen.getByTestId("instrument-option-zephyr-oboe")).toBeTruthy();
    expect(screen.queryByTestId("instrument-show-more")).toBeNull();
  });

  it("⭐ the current instrument is always in the window, even past the fold", () => {
    const { container } = renderPanel(
      <InstrumentLibraryV2
        instruments={makeInstruments(500)}
        currentAssetId="inst-300"
        onChoose={() => {}}
      />
    );
    const current = screen.getByTestId("instrument-option-inst-300");
    expect(current).toBeTruthy();
    expect(current.getAttribute("aria-pressed")).toBe("true");
    // The window grew just far enough to include it.
    expect(optionCount(container)).toBe(301);
  });

  it("⭐ choosing a row still reports the choice", () => {
    const onChoose = vi.fn();
    renderPanel(<InstrumentLibraryV2 instruments={makeInstruments(500)} onChoose={onChoose} />);
    fireEvent.click(screen.getByTestId("instrument-option-inst-7"));
    expect(onChoose).toHaveBeenLastCalledWith("inst-7");
  });

  it("⭐ audition still sounds the instrument and names it in the receipt", () => {
    const onAudition = vi.fn();
    const { container } = renderPanel(
      <InstrumentLibraryV2
        instruments={makeInstruments(500)}
        onChoose={() => {}}
        onAudition={onAudition}
      />
    );
    fireEvent.click(screen.getByTestId("instrument-audition-inst-3"));
    expect(onAudition).toHaveBeenLastCalledWith("inst-3");
    expect(screen.getByTestId("instrument-audition-receipt").textContent).toContain(
      "Test Instrument 3"
    );
    // The audition button only exists because the caller passed a player: no rows are harmed by the window.
    expect(container.querySelectorAll('[data-testid^="instrument-audition-inst-"]').length).toBe(60);
  });

  it("⭐ a category filter narrows the matches and stays windowed", () => {
    const { container } = renderPanel(
      <InstrumentLibraryV2 instruments={makeInstruments(500)} onChoose={() => {}} />
    );
    fireEvent.click(screen.getByTestId("instrument-category-Strings"));
    // 500 instruments across 3 categories: 167 Strings, still more than one page.
    expect(optionCount(container)).toBe(60);
    expect(screen.getByTestId("instrument-show-more")).toBeTruthy();
    // Every row on the page is actually a string.
    for (const row of container.querySelectorAll('[data-testid^="instrument-option-"]')) {
      const id = row.getAttribute("data-testid")!.replace("instrument-option-", "");
      expect(Number(id.replace("inst-", "")) % 3).toBe(0);
    }
  });

  it("⭐ an empty result still says so instead of rendering a blank list", () => {
    const { container } = renderPanel(
      <InstrumentLibraryV2 instruments={makeInstruments(500)} onChoose={() => {}} />
    );
    fireEvent.change(searchInput(container), { target: { value: "no-such-instrument-zzz" } });
    expect(optionCount(container)).toBe(0);
    expect(screen.queryByTestId("instrument-show-more")).toBeNull();
    expect(container.textContent).toContain("no-such-instrument-zzz");
  });
});
