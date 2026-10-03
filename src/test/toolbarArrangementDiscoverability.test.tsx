/**
 * The arrangement entry is reachable without "advanced controls".
 *
 * ## The report
 *
 * A fresh install's studio toolbar did not contain the arrangement control **in the DOM at all**: `arrangement` was a
 * Tier-2 row, so `shows("arrangement")` was false until the user guessed that an unlabelled "advanced controls" icon
 * existed, and no text on the page said "arrangement" either. `document.body.innerText` matched `/arrangement|编排/`
 * → **false** (probe8, fresh context).
 *
 * This is the *same class* of defect as `toolbarExportDiscoverability.test.tsx` records for WAV export — a Tier-2
 * control whose only route was that toggle — so it is guarded the same way: the Toolbar is mounted with
 * `showAdvancedControls: false`, the default state of a fresh install, and the entry is required to be present,
 * labelled, and wired.
 *
 * ## Why a mount rather than the tier table alone
 *
 * A table can be right while the JSX puts the control behind a guard the user cannot see (that is exactly what
 * `toolbarExportDiscoverability`'s third case exists for). The table half is asserted too, because the *reason* the
 * entry is on screen has to be a declared one — take `showByDefault` off the row and this file goes red, which is the
 * mutation the criterion exists to catch.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import React from "react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { Toolbar } from "../components/sequencer/Toolbar";
import { ALL_TIER_ITEMS, isControlVisible, validateTiers } from "../components/sequencer/toolbarTiers";

/**
 * The minimum `Toolbar` needs to render its control row — written out in full rather than cast, by the convention
 * `toolbarExportDiscoverability.test.tsx` records: a cast would hide the next required prop.
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

describe("arrangement discoverability", () => {
  it("renders the arrangement entry with advanced controls off", () => {
    renderToolbar({ onOpenArrangement: vi.fn() });
    const trigger = document.querySelector('[data-toolbar-id="arrangement"]');
    expect(trigger, "the arrangement entry must exist without the advanced-controls toggle").not.toBeNull();
    // Its frequency judgement is unchanged — it is still a Tier 2 control. What changed is that the table now says it
    // is *on* the default surface, so the attribute still tells the truth about frequency.
    expect(trigger?.getAttribute("data-toolbar-tier")).toBe("2");
  });

  it("labels it as the arrangement view, not as an unlabelled icon", () => {
    renderToolbar({ onOpenArrangement: vi.fn() });
    const trigger = document.querySelector('[data-testid="toolbar-arrangement-toggle"]');
    const label = trigger?.getAttribute("aria-label") ?? "";
    expect(label.length).toBeGreaterThan(0);
    expect(label, "the entry must name the arrangement view").toMatch(/arrangement|编排/i);
  });

  it("actually calls the open handler when it is clicked", () => {
    // The wiring half: a control that renders and does nothing is the defect `toolbarExportDiscoverability` found in
    // `onExportMp3`, so the handler is asserted to be the one the click reaches.
    const onOpenArrangement = vi.fn();
    renderToolbar({ onOpenArrangement });
    fireEvent.click(document.querySelector('[data-toolbar-id="arrangement"]') as HTMLElement);
    expect(onOpenArrangement).toHaveBeenCalledTimes(1);
  });

  it("is not rendered when the host cannot open the arrangement at all", () => {
    /**
     * The host decides the surface — `StudioView` passes the handler on the desktop/iPad shell only. Absent handler,
     * absent control: a button that cannot act is worse than no button, and this pins that the new default visibility
     * did not turn the optional prop into a required one.
     */
    renderToolbar();
    expect(document.querySelector('[data-toolbar-id="arrangement"]')).toBeNull();
  });

  it("declares the Tier 1 surface that keeps it on screen, and the table still validates", () => {
    const row = ALL_TIER_ITEMS.find((item) => item.id === "arrangement");
    expect(row, "the arrangement row must stay in the tier table").toBeDefined();
    expect(row?.reachableVia).toBe("more");
    expect(isControlVisible("arrangement", false)).toBe(true);
    expect(validateTiers(ALL_TIER_ITEMS)).toEqual([]);
  });
});
