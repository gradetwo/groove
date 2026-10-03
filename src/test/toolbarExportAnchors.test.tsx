/**
 * Every item in the workbench's export menu carries its own stable anchor.
 *
 * ## The report (found by reconnaissance, fixed here)
 *
 * The menu has six items, and only two of them had a `data-testid`: `export-wav` and `export-mp3`. **MIDI,
 * Ableton Set, .groove and Stems did not** — so the only way to click one of them from a harness was by its
 * **visible label**, which is i18n text. A probe written that way breaks when the language or the wording
 * changes, and the failure reads as "the control is missing" rather than "the control was renamed". The
 * arrangement menu (`ArrangementFileEntriesV2.tsx`) already anchors the same six items
 * (`arrangement-export-midi` … `arrangement-export-stems`); this file holds the workbench menu to the same
 * standard, reusing the style the two existing ids set: `export-<format>`, lower-case and hyphenated.
 *
 * ## What is asserted, and why both halves
 *
 * *The anchor half* is a render assertion, not a source grep: an id sitting in the JSX that the component never
 * renders is not an anchor, and only a mount can tell the difference. The menu is opened the way a user opens
 * it — by clicking the trigger.
 *
 * *The wiring half* clicks each anchored item and requires **that item's own** handler to run exactly once.
 * This is the defect `toolbarExportDiscoverability.test.tsx` records: `onExportMp3` was declared on
 * `ToolbarProps`, destructured inside `ExportMenu` and passed down — but `Toolbar` itself never destructured
 * it, so the item rendered, the menu opened and `undefined?.()` did nothing. An id-only assertion would have
 * passed through all of that.
 *
 * Each item is clicked in its own render, because choosing an item closes the menu (unchanged behaviour, and
 * the reason the trigger is clicked again between items below).
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { Toolbar } from "../components/sequencer/Toolbar";

/**
 * The minimum `Toolbar` needs to render its control row.
 *
 * Written out in full rather than cast, for the reason `toolbarExportDiscoverability.test.tsx` gives: the props
 * are the contract, and an `as unknown as ToolbarProps` hides the next required prop (which is how the first
 * version of that file passed under vitest and failed `tsc`).
 */
function renderToolbar(overrides: Record<string, unknown> = {}) {
  const noop = vi.fn();
  const props = {
    isPlaying: false,
    bpm: 124,
    swing: 0,
    timeSignature: "4/4",
    resolution: "1/16" as const,
    stepCount: 16,
    barCount: 1,
    viewedBar: 0,
    mobileEditMode: "step" as const,
    showAdvancedControls: false,
    isVelocityLaneOpen: false,
    isSidebarCollapsed: false,
    isEditorMaximized: false,
    canUndo: false,
    canRedo: false,
    genreName: "Chicago House",
    genreAccent: "#4ad8c8",
    isZh: true,
    stepsPerBar: 4,
    groupSize: 4,
    onTogglePlay: noop,
    onChangeBpm: noop,
    onChangeSwing: noop,
    onChangeTimeSignature: noop,
    onChangeResolution: noop,
    onChangeStepCount: noop,
    onChangeMobileEditMode: noop,
    onSelectBar: noop,
    onToggleVelocityLane: noop,
    onOpenEuclidean: noop,
    onUndo: noop,
    onRedo: noop,
    onToggleMaximize: noop,
    onToggleSidebar: noop,
    onToggleAdvancedControls: noop,
    onQuickAction: noop,
    onExportMidi: noop,
    onShare: noop,
    onAddSteps: noop,
    onRemoveSteps: noop,
    onScrollByPixels: noop,
    ...overrides,
  };
  return render(
    <LanguageProvider>
      <Toolbar {...(props as unknown as React.ComponentProps<typeof Toolbar>)} />
    </LanguageProvider>
  );
}

/** The six items of the workbench export menu, in the order the menu renders them. */
const EXPORT_ITEMS = ["export-midi", "export-als", "export-groove", "export-wav", "export-mp3", "export-stems"];

/** The four this change anchored, each with the prop its click must reach. */
const NEWLY_ANCHORED: Array<{ id: string; prop: string; hint: string }> = [
  { id: "export-midi", prop: "onExportMidi", hint: ".mid" },
  { id: "export-als", prop: "onExportAls", hint: ".als" },
  { id: "export-groove", prop: "onExportGroove", hint: ".groove" },
  { id: "export-stems", prop: "onExportStems", hint: "stems .zip" },
];

function openMenu() {
  const trigger = document.querySelector('[data-toolbar-id="export"]');
  expect(trigger, "the export trigger must render").not.toBeNull();
  fireEvent.click(trigger as HTMLElement);
}

describe("the workbench export menu's anchors", () => {
  it("gives all six items an anchor, and never two items the same one", () => {
    renderToolbar();
    openMenu();

    for (const id of EXPORT_ITEMS) {
      const item = screen.getByTestId(id);
      expect(item.tagName, `${id} should be the clickable control itself`).toBe("BUTTON");
      // One element, not a duplicated id that `getByTestId` would have thrown on — the assertion is explicit so
      // the message says what broke.
      expect(screen.getAllByTestId(id), `${id} is not unique`).toHaveLength(1);
    }
  });

  it("keeps the anchors in the style `export-wav` and `export-mp3` established", () => {
    // The two pre-existing ids are lower-case, hyphenated and format-first (`export-<format>`). New anchors that
    // invent a second style are how a harness ends up with two selectors for one menu.
    for (const id of EXPORT_ITEMS) {
      expect(id, `${id} departs from the export-<format> style`).toMatch(/^export-[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("runs each newly anchored item's own action when that item is clicked", () => {
    for (const item of NEWLY_ANCHORED) {
      // A fresh render per item: choosing an item closes the menu, and a stale handler from a previous mount
      // would make a later `toHaveBeenCalledTimes(1)` meaningless.
      const handler = vi.fn();
      const { unmount } = renderToolbar({ [item.prop]: handler });

      openMenu();
      fireEvent.click(screen.getByTestId(item.id));

      expect(handler, `clicking ${item.id} (${item.hint}) did not run ${item.prop}`).toHaveBeenCalledTimes(1);
      // The click closes the menu, as it did before the anchors were added — the attribute changed, the
      // behaviour did not.
      expect(screen.queryByTestId(item.id), `${item.id} stayed mounted after its click`).toBeNull();
      unmount();
    }
  });

  it("does not let one item's click run another item's action", () => {
    /**
     * The anchors are adjacent and textually near-identical, so a copy-paste that moves one id up or down a
     * button is a real hazard. Every handler is spied at once and only the clicked item's may fire.
     */
    const handlers: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const item of NEWLY_ANCHORED) handlers[item.prop] = vi.fn();
    renderToolbar(handlers);

    openMenu();
    fireEvent.click(screen.getByTestId("export-stems"));

    for (const item of NEWLY_ANCHORED) {
      expect(handlers[item.prop], `${item.prop} should not have run`).toHaveBeenCalledTimes(
        item.id === "export-stems" ? 1 : 0
      );
    }
  });
});
