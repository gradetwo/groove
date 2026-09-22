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
import {
  MobileTransportBar,
  TRANSPORT_LAYOUT,
  TRANSPORT_BAR_HEIGHT_PX,
  MIN_SUPPORTED_PHONE_WIDTH_PX,
  tempoReadoutBudgetPx,
} from "../components/sequencer/MobileTransportBar";
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
      mobileEditMode: "step",
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

/**
 * The bar has to fit the narrowest phone it supports.
 *
 * This is arithmetic rather than a snapshot because the failure mode is silent: the first version
 * used a 56 px play button, a `gap-1.5` and a 52 px bar label, which put the "more" button at
 * x=385 on a 390 px viewport. Nothing looked broken in a desktop browser and every unit test
 * passed — the button was simply off-screen, so the only route to the controls the bar omits was
 * unreachable. The budget makes that a failing sum.
 */
describe("MobileTransportBar fits the narrowest supported phone", () => {
  it("leaves room for the tempo readout at 360 px", () => {
    const budget = tempoReadoutBudgetPx(MIN_SUPPORTED_PHONE_WIDTH_PX);
    // A readout needs to show three digits plus "BPM"; anything under ~56 px truncates.
    expect(budget).toBeGreaterThanOrEqual(56);
  });

  it("declares a layout whose widths match the classes actually applied", () => {
    const { container } = renderBar();
    const buttons = Array.from(container.querySelectorAll("button"));
    const play = container.querySelector("[data-testid='mobile-transport-play']")!;
    // Every fixed-width element must carry the width the budget assumes, or the arithmetic and
    // the DOM can drift apart while both look individually reasonable.
    expect(play.className).toMatch(/w-11/);
    expect(play.className).toMatch(/shrink-0/);
    const arrows = [
      container.querySelector("[data-testid='mobile-transport-prev-bar']")!,
      container.querySelector("[data-testid='mobile-transport-next-bar']")!,
    ];
    for (const a of arrows) expect(a.className).toMatch(/w-8/);
    const label = container.querySelector("[data-testid='mobile-transport-bar-label']")!;
    expect(label.className).toMatch(/w-11/);
    // The three right-hand buttons are the shared 44 px button class.
    for (const id of ["mobile-transport-undo", "mobile-transport-redo", "mobile-transport-more"]) {
      const el = container.querySelector(`[data-testid='${id}']`)!;
      expect(el.className).toMatch(/min-w-\[44px\]/);
    }
    expect(buttons.length).toBe(TRANSPORT_LAYOUT.itemCount);
  });

  it("does not overflow when the tempo readout is at its widest", () => {
    const viewport = MIN_SUPPORTED_PHONE_WIDTH_PX;
    const used =
      TRANSPORT_LAYOUT.paddingPx +
      TRANSPORT_LAYOUT.playWidthPx +
      TRANSPORT_LAYOUT.barNavWidthPx +
      TRANSPORT_LAYOUT.fixedRightWidthPx +
      TRANSPORT_LAYOUT.gapPx * (TRANSPORT_LAYOUT.itemCount - 1) +
      tempoReadoutBudgetPx(viewport);
    expect(used).toBeLessThanOrEqual(viewport);
  });
});

/**
 * Regression: a tap on a row must never be read as a dismiss gesture.
 *
 * The sheet originally ran the drag-to-dismiss check on the whole container with no guard: any
 * pointerup more than 60 px below its pointerdown closed the sheet — including the pointerup that
 * ends an ordinary tap on a row whenever the click lands a little low. On touch that is "tapping
 * the bottom row closes the sheet instead of choosing it", and it is how the E2E matrix saw the
 * row disappear mid-click.
 */
describe("MobileStudioSheet drag gesture is scoped to the handle", () => {
  const noop = () => {};

  it("does not close when a pointerup on a row is far below its pointerdown", () => {
    const onClose = vi.fn();
    const onToggleMetronome = vi.fn();
    render(
      <LanguageProvider>
        <MobileStudioSheet
          open
          onClose={onClose}
          groups={buildStudioSheetGroupsForTest({ onToggleMetronome })}
        />
      </LanguageProvider>
    );
    const row = screen.getByTestId("mobile-studio-action-metronome");
    fireEvent.pointerDown(row, { clientY: 100 });
    fireEvent.pointerUp(row, { clientY: 300 });
    // The toggle still fires and the sheet stays: the gesture belongs to the handle, not the row.
    expect(onToggleMetronome).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when the handle itself is dragged down", () => {
    const onClose = vi.fn();
    render(
      <LanguageProvider>
        <MobileStudioSheet open onClose={onClose} groups={buildStudioSheetGroupsForTest({})} />
      </LanguageProvider>
    );
    const handle = screen.getByTestId("mobile-studio-sheet-handle");
    fireEvent.pointerDown(handle, { clientY: 100 });
    fireEvent.pointerUp(handle, { clientY: 300 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when the handle is tapped without dragging", () => {
    const onClose = vi.fn();
    render(
      <LanguageProvider>
        <MobileStudioSheet open onClose={onClose} groups={buildStudioSheetGroupsForTest({})} />
      </LanguageProvider>
    );
    const handle = screen.getByTestId("mobile-studio-sheet-handle");
    fireEvent.pointerDown(handle, { clientY: 100 });
    fireEvent.pointerUp(handle, { clientY: 110 });
    expect(onClose).not.toHaveBeenCalled();
  });
});

/** Minimal group builder for the gesture tests, kept separate from the full builder above. */
function buildStudioSheetGroupsForTest(over: { onToggleMetronome?: () => void }) {
  return [
    {
      titleKey: "mobile_sheet_playback",
      actions: [
        {
          id: "metronome",
          labelKey: "toolbar_metronome_label",
          toggle: { on: false, onToggle: over.onToggleMetronome ?? (() => {}) },
        },
      ],
    },
  ];
}

/**
 * Landscape is a different trade, and it is a measurement rather than a preference.
 *
 * The two fixed bars cost 112 px in both orientations: 17 % of a 664 px portrait viewport but
 * **29 %** of a 390 px landscape one (`PRODUCT_PLAN_v2.1.0.md` §G.5). So landscape is where the
 * working area is actually lost, and it is also where the 88 px of bar navigation stops earning
 * its place — a landscape phone shows 24+ step columns at once, so most patterns fit without
 * horizontal scrolling and reaching bar 2 is a pan rather than 64 steps of dragging.
 *
 * These assertions are on the rendered DOM and on the budget arithmetic, not on the class strings
 * alone: the point is that the *short* layout is genuinely narrower and shorter, and that it still
 * holds every control at the 44 px touch minimum.
 */
describe("the phone's export rows", () => {
  /**
   * The phone has no export *menu*: the sheet is the menu, so both formats are rows.
   *
   * This is asserted at the model level because the desktop leg cannot see the phone's sheet and the phone's
   * transport button is not reachable on every route — and because the failure mode is silent: a row whose
   * handler is missing renders and does nothing at all, exactly like the desktop bug that started this
   * (`onExportMp3` declared but never destructured), which typecheck cannot catch on an optional prop.
   */
  const build = (over: Record<string, unknown> = {}) => {
    const noop = () => {};
    return buildStudioSheetGroups({
      isMetronome: false,
      isCountIn: false,
      isRecordArmed: false,
      isDrumsOnly: false,
      isSongMode: false,
      isBlindCompare: false,
      drumKit: "909",
      mobileEditMode: "step",
      onToggleMetronome: noop,
      onToggleCountIn: noop,
      onToggleRecordArmed: noop,
      onToggleDrumsOnly: noop,
      onToggleSongMode: noop,
      onToggleBlindCompare: noop,
      ...over,
    } as Parameters<typeof buildStudioSheetGroups>[0]);
  };
  const ids = (over: Record<string, unknown> = {}) =>
    build(over)
      .flatMap((group) => group.actions)
      .map((action) => action.id);

  it("offers WAV and, when the handler exists, MP3", () => {
    const withMp3 = ids({ onOpenExport: () => {}, onOpenExportMp3: () => {} });
    expect(withMp3).toContain("export");
    expect(withMp3).toContain("export-mp3");
  });

  it("does not offer a row it cannot wire", () => {
    // A row with no handler is a dead control on a touch surface, where there is no tooltip to explain it.
    expect(ids({ onOpenExport: () => {} })).not.toContain("export-mp3");
  });

  it("routes each row to its own action", () => {
    const wav = vi.fn();
    const mp3 = vi.fn();
    const actions = build({ onOpenExport: wav, onOpenExportMp3: mp3 }).flatMap((group) => group.actions);
    actions.find((action) => action.id === "export")?.onSelect?.();
    actions.find((action) => action.id === "export-mp3")?.onSelect?.();
    expect(wav).toHaveBeenCalledTimes(1);
    expect(mp3).toHaveBeenCalledTimes(1);
  });
});

describe("MobileTransportBar in a short landscape viewport", () => {
  const renderLandscape = (overrides: Partial<typeof baseProps> = {}) =>
    render(
      <LanguageProvider>
        <MobileTransportBar {...baseProps} {...overrides} isShortLandscape />
      </LanguageProvider>
    );

  it("drops bar navigation, and with it two of the seven items", () => {
    const { container } = renderLandscape();
    expect(container.querySelector("[data-testid='mobile-transport-prev-bar']")).toBeNull();
    expect(container.querySelector("[data-testid='mobile-transport-next-bar']")).toBeNull();
    expect(container.querySelector("[data-testid='mobile-transport-bar-label']")).toBeNull();
    // The controls that must survive regardless: play, tempo, undo, redo, more.
    for (const id of [
      "mobile-transport-play",
      "mobile-transport-tempo",
      "mobile-transport-undo",
      "mobile-transport-redo",
      "mobile-transport-more",
    ]) {
      expect(container.querySelector(`[data-testid='${id}']`), `${id} must stay`).not.toBeNull();
    }
  });

  it("advertises which layout it is rendering, so the difference is observable", () => {
    const landscape = renderLandscape();
    expect(
      landscape.container.querySelector("[data-testid='mobile-transport-bar']")!.getAttribute("data-layout")
    ).toBe("landscape");
    const portrait = render(
      <LanguageProvider>
        <MobileTransportBar {...baseProps} />
      </LanguageProvider>
    );
    expect(
      portrait.container.querySelector("[data-testid='mobile-transport-bar']")!.getAttribute("data-layout")
    ).toBe("portrait");
  });

  it("is wider than the portrait layout, despite fewer controls", () => {
    // Fewer items and a smaller fixed width, so the flexible readout gets more room rather than
    // less — which is the whole reason the bar can afford to drop navigation here.
    expect(tempoReadoutBudgetPx(MIN_SUPPORTED_PHONE_WIDTH_PX, true)).toBeGreaterThan(
      tempoReadoutBudgetPx(MIN_SUPPORTED_PHONE_WIDTH_PX, false)
    );
  });

  it("still leaves room for a three-digit readout at 360 px", () => {
    expect(tempoReadoutBudgetPx(MIN_SUPPORTED_PHONE_WIDTH_PX, true)).toBeGreaterThanOrEqual(56);
  });

  it("keeps every control at the 44 px touch minimum, which is the trade it refuses to make", () => {
    const { container } = renderLandscape();
    for (const button of Array.from(container.querySelectorAll("button"))) {
      // The savings come from the padding and from dropping a control, never from a smaller target.
      expect(button.className).toMatch(/h-11/);
    }
  });

  it("uses tighter vertical padding than portrait, and declares both heights", () => {
    const landscape = renderLandscape();
    const portrait = render(
      <LanguageProvider>
        <MobileTransportBar {...baseProps} />
      </LanguageProvider>
    );
    const cls = (c: HTMLElement) => c.querySelector("[data-testid='mobile-transport-bar']")!.className;
    expect(cls(landscape.container)).toMatch(/py-0\.5/);
    expect(cls(portrait.container)).toMatch(/py-1\.5/);
    // The heights are a contract the browser measurement is checked against, so they must be
    // ordered the way the classes are.
    expect(TRANSPORT_BAR_HEIGHT_PX.landscape).toBeLessThan(TRANSPORT_BAR_HEIGHT_PX.portrait);
  });

  it("does not overflow at 360 px in either layout", () => {
    const viewport = MIN_SUPPORTED_PHONE_WIDTH_PX;
    for (const landscape of [false, true]) {
      const fixed = landscape
        ? TRANSPORT_LAYOUT.paddingPx +
          TRANSPORT_LAYOUT.playWidthPx +
          TRANSPORT_LAYOUT.landscapeFixedRightWidthPx +
          TRANSPORT_LAYOUT.gapPx * (TRANSPORT_LAYOUT.landscapeItemCount - 1)
        : TRANSPORT_LAYOUT.paddingPx +
          TRANSPORT_LAYOUT.playWidthPx +
          TRANSPORT_LAYOUT.barNavWidthPx +
          TRANSPORT_LAYOUT.fixedRightWidthPx +
          TRANSPORT_LAYOUT.gapPx * (TRANSPORT_LAYOUT.itemCount - 1);
      const used = fixed + tempoReadoutBudgetPx(viewport, landscape);
      expect(used, `landscape=${landscape}`).toBeLessThanOrEqual(viewport);
    }
  });
});

/**
 * Landscape keeps bar navigation by moving it, not by deleting it.
 *
 * Dropping the ◀ 1/4 ▶ cluster from the transport is only acceptable if the capability survives
 * somewhere. The sheet is that somewhere, and "reachable" is asserted through the same row model
 * the rest of the sheet uses — including that the position is legible and the bounds behave.
 */
describe("bar navigation moves into the sheet when the transport drops it", () => {
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
      mobileEditMode: "step",
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

  const actionsFor = (groups: ReturnType<typeof buildGroups>) =>
    groups.flatMap((g) => g.actions);

  it("omits the rows entirely when the transport already shows them", () => {
    // Portrait. A second copy on screen is a duplicate, not a fallback.
    const ids = actionsFor(buildGroups()).map((a) => a.id);
    expect(ids).not.toContain("prev-bar");
    expect(ids).not.toContain("next-bar");
  });

  it("adds both directions when the transport cannot carry them", () => {
    const ids = actionsFor(
      buildGroups({ barNav: { viewedBar: 0, barCount: 4, onPrev: noop, onNext: noop } })
    ).map((a) => a.id);
    expect(ids).toContain("prev-bar");
    expect(ids).toContain("next-bar");
  });

  it("names the current position, so the user knows where they are", () => {
    const groups = buildGroups({
      barNav: { viewedBar: 1, barCount: 4, onPrev: noop, onNext: noop },
    });
    const prev = actionsFor(groups).find((a) => a.id === "prev-bar")!;
    // 0-based internally, 1-based in the UI: "Bar 2 of 4".
    expect(prev.descKey).toBe("mobile_sheet_bar_position");
    expect(prev.descParams).toMatchObject({ current: 2, total: 4 });
  });

  it("disables the direction that would leave the pattern", () => {
    const atStart = actionsFor(
      buildGroups({ barNav: { viewedBar: 0, barCount: 4, onPrev: noop, onNext: noop } })
    );
    expect(atStart.find((a) => a.id === "prev-bar")!.disabled).toBe(true);
    expect(atStart.find((a) => a.id === "next-bar")!.disabled).toBe(false);

    const atEnd = actionsFor(
      buildGroups({ barNav: { viewedBar: 3, barCount: 4, onPrev: noop, onNext: noop } })
    );
    expect(atEnd.find((a) => a.id === "prev-bar")!.disabled).toBe(false);
    expect(atEnd.find((a) => a.id === "next-bar")!.disabled).toBe(true);
  });

  it("does not offer a direction that does not exist on a one-bar pattern", () => {
    const only = actionsFor(
      buildGroups({ barNav: { viewedBar: 0, barCount: 1, onPrev: noop, onNext: noop } })
    );
    expect(only.find((a) => a.id === "prev-bar")!.disabled).toBe(true);
    expect(only.find((a) => a.id === "next-bar")!.disabled).toBe(true);
  });

  it("calls the handler the row is for, and only that one", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const groups = buildGroups({ barNav: { viewedBar: 1, barCount: 4, onPrev, onNext } });
    const actions = actionsFor(groups);
    actions.find((a) => a.id === "prev-bar")!.onSelect?.();
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
    actions.find((a) => a.id === "next-bar")!.onSelect?.();
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("renders the position text through the real row, not just the model", () => {
    render(
      <LanguageProvider>
        <MobileStudioSheet
          open
          onClose={noop}
          groups={buildGroups({
            barNav: { viewedBar: 2, barCount: 5, onPrev: noop, onNext: noop },
          })}
        />
      </LanguageProvider>
    );
    const row = screen.getByTestId("mobile-studio-action-next-bar");
    // The interpolation has to reach the DOM, or the row says "Bar {current} of {total}".
    expect(row.textContent).toContain("3");
    expect(row.textContent).toContain("5");
    expect(row.textContent).not.toContain("{current}");
  });
});
