/**
 * The ruler: bar numbers, and which bar the view is on.
 *
 * Both jobs are worth a criterion because both were missing before it existed: nothing in the arrangement said how long it was in bars, and the only way to change which bar the strips showed was a pair of buttons that stepped one at a time.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ArrangementRulerV2 } from "../components/arrangement/ArrangementRulerV2";
import { LanguageProvider } from "../i18n/LanguageContext";

const renderRuler = (props: Partial<React.ComponentProps<typeof ArrangementRulerV2>> = {}) => {
  const onSelectBar = vi.fn();
  render(
    <LanguageProvider>
      <ArrangementRulerV2 bars={4} currentBar={0} onSelectBar={onSelectBar} {...props} />
    </LanguageProvider>
  );
  return { onSelectBar };
};

describe("the arrangement ruler", () => {
  it("draws one numbered bar per bar of the arrangement", () => {
    renderRuler({ bars: 4 });
    // Numbered from one, because that is what a musician counts from — not from zero, which is what the model stores.
    expect(screen.getByTestId("ruler-bar-0").textContent).toBe("1");
    expect(screen.getByTestId("ruler-bar-3").textContent).toBe("4");
    expect(screen.queryByTestId("ruler-bar-4")).toBeNull();
  });

  it("marks the bar the view is on, and only that one", () => {
    renderRuler({ bars: 3, currentBar: 1 });
    expect(screen.getByTestId("ruler-bar-1").dataset.current).toBe("true");
    expect(screen.getByTestId("ruler-bar-0").dataset.current).toBe("false");
    // `aria-pressed` as well as the colour, so the state is readable without seeing it.
    expect(screen.getByTestId("ruler-bar-1").getAttribute("aria-pressed")).toBe("true");
  });

  it("moves the view when a bar is clicked, which is what the stepping buttons could not do in one press", () => {
    const { onSelectBar } = renderRuler({ bars: 8 });
    fireEvent.click(screen.getByTestId("ruler-bar-5"));
    expect(onSelectBar).toHaveBeenCalledWith(5);
  });

  it("can be drawn as a picture of the arrangement's length, with nothing to click", () => {
    // The same rule as every other optional callback in this view: a ruler with no arrangement behind it still says how long the arrangement is.
    renderRuler({ bars: 2, onSelectBar: undefined });
    expect(screen.getByTestId("arrangement-ruler")).toBeDefined();
    fireEvent.click(screen.getByTestId("ruler-bar-1"));
    expect(screen.getByTestId("ruler-bar-1")).toBeDefined();
  });

  it("grows with the arrangement rather than being a fixed width", () => {
    // Eight bars and sixty-four bars have to look different, or the ruler says nothing about length.
    renderRuler({ bars: 16 });
    expect(screen.getAllByTestId(/^ruler-bar-\d+$/)).toHaveLength(16);
  });
});
