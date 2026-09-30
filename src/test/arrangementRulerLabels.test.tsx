/**
 * Ruler labels that change with zoom, and the snap value the ruler shows.
 *
 * `docs/ARRANGEMENT_UI_DESIGN.md` §3 records what the DAWs do, from their own manuals: Bitwig's ruler unit goes
 * `BAR` → `BAR.BEAT` → `BAR.BEAT.TICK` with zoom, and Live shows **the grid spacing in the ruler's top-right
 * corner** so a person can see what they are snapping to instead of inferring it from where things land. The brief
 * adopts both, so both are checked here.
 *
 * The formatter is checked **as a function**, because the threshold is arithmetic and its edge is where it is easy
 * to be off by one; the ruler component is checked separately, because a correct formatter that no component calls
 * is a feature nobody has. The two together are what the criterion asks for: the same fact read two ways.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ArrangementRulerV2, BAR_BEAT_LABEL_PX_PER_BAR, rulerLabelFor } from "../components/arrangement/ArrangementRulerV2";
import { LanguageProvider } from "../i18n/LanguageContext";

describe("the ruler label formatter", () => {
  it("says just the bar below the documented threshold", () => {
    expect(rulerLabelFor(0, 24)).toBe("1");
    expect(rulerLabelFor(7, 95)).toBe("8");
  });

  it("switches to bar.beat at the threshold the design doc names", () => {
    /**
     * 96 px per bar is the brief's number. The boundary is asserted on both sides because "≥96" and ">96" look
     * identical in a screenshot and differ for every zoom that lands exactly on the value.
     */
    expect(BAR_BEAT_LABEL_PX_PER_BAR).toBe(96);
    expect(rulerLabelFor(0, 96)).toBe("1.1");
    expect(rulerLabelFor(0, 95.9)).toBe("1");
    expect(rulerLabelFor(3, 96)).toBe("4.1");
  });

  it("subdivides only as far as the zoom can show", () => {
    /**
     * The brief stops at `bar.beat`: it explicitly does **not** adopt Bitwig's third level. Subdividing into ticks
     * would mean legible labels only above ~384 px per bar, and the ruler also has to show eight bars at once.
     */
    expect(rulerLabelFor(1, 128)).toBe("2.1");
    // 128 px per bar is 32 px per beat, so a beat mark is still readable; the formatter never emits a tick.
    expect(rulerLabelFor(1, 400)).toMatch(/^\d+\.\d+$/);
  });

  it("numbers from one, because that is what a musician counts from", () => {
    // Zero is the model's business; a ruler numbered from zero is a debug view.
    expect(rulerLabelFor(0, 96)).not.toBe("0.1");
  });
});

const renderRuler = (props: Partial<React.ComponentProps<typeof ArrangementRulerV2>> = {}) =>
  render(
    <LanguageProvider>
      <ArrangementRulerV2 bars={4} currentBar={0} {...props} />
    </LanguageProvider>
  );

describe("the ruler shows the label the zoom asks for", () => {
  it("draws bar numbers at a low zoom and bar.beat at 96 px or more", () => {
    const { unmount } = renderRuler({ pixelsPerBar: 48 });
    expect(screen.getByTestId("ruler-bar-0").textContent).toBe("1");
    unmount();

    renderRuler({ pixelsPerBar: 96 });
    expect(screen.getByTestId("ruler-bar-0").textContent).toBe("1.1");
    expect(screen.getByTestId("ruler-bar-2").textContent).toBe("3.1");
  });

  it("keeps the bar number as the accessible name, so zoom never renames the ruler", () => {
    /**
     * The visible label changes with zoom; the name a screen reader hears must not, or "go to bar 3" would be
     * unfindable at high zoom and ambiguous at low zoom.
     */
    renderRuler({ pixelsPerBar: 96 });
    expect(screen.getByTestId("ruler-bar-2").getAttribute("aria-label")).toMatch(/3/);
    expect(screen.getByTestId("ruler-bar-2").getAttribute("aria-label")).not.toMatch(/3\.1/);
  });

  it("sizes each bar column from the zoom, so the ruler and the lanes stay aligned", () => {
    // This is the other half of the alignment criterion: the ruler's columns and the lane's pixels-per-bar are one
    // number, or bar 5 sits above the wrong place.
    renderRuler({ pixelsPerBar: 128 });
    expect(screen.getByTestId("ruler-bar-0").style.width).toBe("128px");
  });

  it("still moves the view when a bar is clicked, at any zoom", () => {
    const onSelectBar = vi.fn();
    renderRuler({ pixelsPerBar: 96, onSelectBar });
    fireEvent.click(screen.getByTestId("ruler-bar-3"));
    expect(onSelectBar).toHaveBeenCalledWith(3);
  });

  it("shows the snap value as text, because a toggle's state is not a value", () => {
    /**
     * The owner's complaint this answers was "I cannot see what I am snapping to". A grid control that only showed
     * on/off would leave the same question, so the label carries the musical value — and it is text, not a tooltip.
     */
    renderRuler({ pixelsPerBar: 96, snapLabel: "1/16" });
    // The id is the ruler's own: the toolbar shows the same value, and two elements with one test id would make every
    // query for it ambiguous.
    expect(screen.getByTestId("arrangement-ruler-snap-value").textContent).toContain("1/16");
  });
});
