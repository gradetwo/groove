/**
 * The phone transport bar: five controls where the desktop toolbar has sixty-four.
 *
 * The claim being protected is the *control count*. The desktop toolbar measured 395 px — 47 % of
 * a 390×844 viewport — before a single step was visible, and that is a control-set problem rather
 * than a styling one. These tests make "someone added another button" a failing test instead of a
 * quiet regression, and they pin the behaviours that are easy to get wrong (bar-navigation bounds,
 * that the tempo readout does not pretend to be an editor).
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { MobileTransportBar } from "../components/sequencer/MobileTransportBar";
import { MobileStudioSheet, buildStudioSheetGroups } from "../components/sequencer/MobileStudioSheet";

const baseProps = {
  isPlaying: false,
  bpm: 124,
  viewedBar: 0,
  barCount: 4,
  canUndo: true,
  canRedo: false,
  onTogglePlay: () => {},
  onPrevBar: () => {},
  onNextBar: () => {},
  onUndo: () => {},
  onRedo: () => {},
  onOpenSheet: () => {},
};

const renderBar = (overrides: Partial<typeof baseProps> = {}) =>
  render(
    <LanguageProvider>
      <MobileTransportBar {...baseProps} {...overrides} />
    </LanguageProvider>
  );

describe("MobileTransportBar", () => {
  it("keeps the control count small enough to leave the grid room", () => {
    const { container } = renderBar();
    // Six interactive elements: play, prev, next, tempo, undo, redo, more — with bar navigation
    // counting as one composite. The assertion is on the rendered buttons, not on a list someone
    // could edit without touching the UI.
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeLessThanOrEqual(7);
    // The desktop toolbar renders 64 buttons plus 18 form controls in the same space.
    expect(buttons.length).toBeLessThan(64);
  });

  it("gives every control at least a 44px touch target", () => {
    const { container } = renderBar();
    for (const button of Array.from(container.querySelectorAll("button"))) {
      const cls = button.className;
      // `h-11` = 44px exactly; the play button is wider still.
      expect(cls, `"${button.getAttribute("data-testid")}" height`).toMatch(/h-11/);
    }
  });

  it("toggles playback and reports its state to assistive tech", () => {
    const onTogglePlay = vi.fn();
    const { rerender } = renderBar({ onTogglePlay });
    const play = screen.getByTestId("mobile-transport-play");
    expect(play).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(play);
    expect(onTogglePlay).toHaveBeenCalledTimes(1);

    rerender(
      <LanguageProvider>
        <MobileTransportBar {...baseProps} isPlaying onTogglePlay={onTogglePlay} />
      </LanguageProvider>
    );
    expect(screen.getByTestId("mobile-transport-play")).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the bar position as human-readable 1-based numbers", () => {
    renderBar({ viewedBar: 1, barCount: 4 });
    expect(screen.getByTestId("mobile-transport-bar-label")).toHaveTextContent("2/4");
  });

  it("disables bar navigation at the ends instead of wrapping silently", () => {
    const onPrevBar = vi.fn();
    const onNextBar = vi.fn();
    const { rerender } = renderBar({ viewedBar: 0, onPrevBar, onNextBar });
    expect(screen.getByTestId("mobile-transport-prev-bar")).toBeDisabled();
    expect(screen.getByTestId("mobile-transport-next-bar")).not.toBeDisabled();

    rerender(
      <LanguageProvider>
        <MobileTransportBar {...baseProps} viewedBar={3} onPrevBar={onPrevBar} onNextBar={onNextBar} />
      </LanguageProvider>
    );
    expect(screen.getByTestId("mobile-transport-prev-bar")).not.toBeDisabled();
    expect(screen.getByTestId("mobile-transport-next-bar")).toBeDisabled();
  });

  it("disables undo and redo when there is nothing to undo or redo", () => {
    renderBar({ canUndo: false, canRedo: false });
    expect(screen.getByTestId("mobile-transport-undo")).toBeDisabled();
    expect(screen.getByTestId("mobile-transport-redo")).toBeDisabled();
  });

  it("shows tempo as a readout that opens the sheet rather than an inline stepper", () => {
    // A phone number-stepper for BPM is worse than a slider in the sheet, so the bar shows the
    // value and defers editing. One fewer control, no loss of capability.
    const onOpenSheet = vi.fn();
    renderBar({ onOpenSheet });
    const tempo = screen.getByTestId("mobile-transport-tempo");
    expect(tempo).toHaveTextContent("124");
    fireEvent.click(tempo);
    expect(onOpenSheet).toHaveBeenCalledTimes(1);
  });

  it("provides a route to every control the bar leaves out", () => {
    const onOpenSheet = vi.fn();
    renderBar({ onOpenSheet });
    fireEvent.click(screen.getByTestId("mobile-transport-more"));
    expect(onOpenSheet).toHaveBeenCalledTimes(1);
  });

  it("does not render any text input, which would raise the OS keyboard over the grid", () => {
    const { container } = renderBar();
    expect(container.querySelectorAll("input, select, textarea")).toHaveLength(0);
  });
});

describe("MobileStudioSheet", () => {
  const noop = () => {};
  const buildGroups = (over: Record<string, unknown> = {}) =>
    buildStudioSheetGroups({
      isMetronome: false,
      isCountIn: false,
      isRecordArmed: false,
      isDrumsOnly: false,
      isSongMode: false,
      isBlindCompare: false,
      drumKit: "909",
      mobileEditMode: "paint",
      onToggleMetronome: noop,
      onToggleCountIn: noop,
      onToggleRecordArmed: noop,
      onToggleDrumsOnly: noop,
      onToggleSongMode: noop,
      onToggleBlindCompare: noop,
      onChangeDrumKit: noop,
      onChangeMobileEditMode: noop,
      onToggleVelocityLane: noop,
      onOpenEuclidean: noop,
      onOpenProjectHub: noop,
      onOpenExport: noop,
      onToggleAnalyzer: noop,
      ...over,
    });

  it("routes every sequencer control the transport bar omits", () => {
    const ids = buildGroups()
      .flatMap((g) => g.actions)
      .map((a) => a.id);
    for (const id of ["metronome", "count-in", "record", "drums-only", "song-mode", "blind-compare", "velocity-lane", "euclidean", "project-hub", "export"]) {
      expect(ids, `${id} must remain reachable on a phone`).toContain(id);
    }
  });

  it("renders toggle rows with their real state and keeps the sheet open when they change", () => {
    const onToggleMetronome = vi.fn();
    const onClose = vi.fn();
    render(
      <LanguageProvider>
        <MobileStudioSheet
          open
          onClose={onClose}
          groups={buildGroups({ isMetronome: true, onToggleMetronome })}
        />
      </LanguageProvider>
    );
    const row = screen.getByTestId("mobile-studio-action-metronome");
    expect(row).toHaveAttribute("aria-pressed", "true");
    fireEvent.pointerUp(row);
    expect(onToggleMetronome).toHaveBeenCalledTimes(1);
    // Flicking two toggles should not require re-opening the sheet between them.
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes after a row that navigates away", () => {
    const onOpenProjectHub = vi.fn();
    const onClose = vi.fn();
    render(
      <LanguageProvider>
        <MobileStudioSheet open onClose={onClose} groups={buildGroups({ onOpenProjectHub })} />
      </LanguageProvider>
    );
    fireEvent.pointerUp(screen.getByTestId("mobile-studio-action-project-hub"));
    expect(onOpenProjectHub).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("marks the current drum kit instead of presenting four independent switches", () => {
    render(
      <LanguageProvider>
        <MobileStudioSheet open onClose={noop} groups={buildGroups({ drumKit: "808" })} />
      </LanguageProvider>
    );
    expect(screen.getByTestId("mobile-studio-action-drum-kit-808")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("mobile-studio-action-drum-kit-909")).toHaveAttribute("aria-checked", "false");
  });

  it("omits rows for capabilities the host did not provide", () => {
    // `onToggleConsole` and `onTogglePianoRoll` are optional; a row that does nothing is worse than
    // no row, so they must not appear when the host cannot service them.
    const ids = buildGroups().flatMap((g) => g.actions).map((a) => a.id);
    expect(ids).not.toContain("console");
    expect(ids).not.toContain("piano-roll");
  });

  it("is absent while closed", () => {
    render(
      <LanguageProvider>
        <MobileStudioSheet open={false} onClose={noop} groups={buildGroups()} />
      </LanguageProvider>
    );
    expect(screen.queryByTestId("mobile-studio-sheet")).toBeNull();
  });
});
