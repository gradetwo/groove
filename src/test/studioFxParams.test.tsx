import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  Toolbar,
  fxCutoffToSliderPosition,
  fxSliderPositionToCutoff,
  formatFxCutoff,
  FX_CUTOFF_MIN_HZ,
  FX_CUTOFF_MAX_HZ,
  type ToolbarProps,
} from "../components/sequencer/Toolbar";
import { DEFAULT_FX_STATE } from "../audio/EffectsRack";

/**
 * D-05 — the master FX rack's parameters are reachable from the UI.
 *
 * `fxParamReachability.test.ts` (G-02) proves a *write point exists* in a `.tsx`
 * file by scanning source. This file proves the stronger, behavioural claim: the
 * rendered drawer actually emits an `onChangeEffectsRack` partial carrying each of
 * the seven fields when the control moves. Together they cover "the rack has a
 * core" both statically and at runtime.
 */

const noop = () => {};

function baseProps(overrides: Partial<ToolbarProps> = {}): ToolbarProps {
  return {
    isPlaying: false,
    bpm: 128,
    swing: 0,
    timeSignature: "4/4",
    resolution: "1/16",
    stepCount: 16,
    barCount: 1,
    viewedBar: 0,
    mobileEditMode: "step",
    showAdvancedControls: true,
    isVelocityLaneOpen: false,
    isSidebarCollapsed: false,
    isEditorMaximized: false,
    canUndo: false,
    canRedo: false,
    genreName: "Chicago House",
    genreAccent: "#888888",
    isZh: false,
    stepsPerBar: 16,
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
    effectsRackState: { ...DEFAULT_FX_STATE },
    onChangeEffectsRack: vi.fn(),
    ...overrides,
  };
}

function renderToolbar(overrides: Partial<ToolbarProps> = {}) {
  const onChangeEffectsRack = vi.fn();
  const view = render(
    <Toolbar {...baseProps({ onChangeEffectsRack, ...overrides })} />
  );
  const control = (param: string) =>
    view.container.querySelector<HTMLElement>(`[data-fx-param="${param}"]`);
  return { ...view, onChangeEffectsRack, control };
}

describe("Toolbar master FX parameters (D-05)", () => {
  it("renders the four primary parameter controls plus the filter-type select", () => {
    const { control } = renderToolbar();
    expect(control("filterCutoff")).not.toBeNull();
    expect(control("filterType")).not.toBeNull();
    expect(control("saturationDrive")).not.toBeNull();
    expect(control("chorusMix")).not.toBeNull();
    expect(control("bitDepth")).not.toBeNull();
  });

  it("keeps filterQ and chorusRate in the collapsed secondary area until ADV is opened", () => {
    const { control } = renderToolbar();
    expect(control("filterQ")).toBeNull();
    expect(control("chorusRate")).toBeNull();

    fireEvent.click(screen.getByText("ADV"));

    expect(control("filterQ")).not.toBeNull();
    expect(control("chorusRate")).not.toBeNull();
  });

  it("emits filterCutoff as Hz through the log-mapped slider", () => {
    const { control, onChangeEffectsRack } = renderToolbar();
    const slider = control("filterCutoff") as HTMLInputElement;
    // Slider position 50 is the geometric midpoint of 20 Hz – 20 kHz → 632 Hz.
    fireEvent.change(slider, { target: { value: "50" } });
    expect(onChangeEffectsRack).toHaveBeenCalledWith({ filterCutoff: 632 });
  });

  it("emits filterType from the select", () => {
    const { control, onChangeEffectsRack } = renderToolbar();
    const select = control("filterType") as HTMLSelectElement;
    expect(select.value).toBe(DEFAULT_FX_STATE.filterType);
    fireEvent.change(select, { target: { value: "highpass" } });
    expect(onChangeEffectsRack).toHaveBeenCalledWith({ filterType: "highpass" });
  });

  it("emits saturationDrive, chorusMix and bitDepth", () => {
    const { control, onChangeEffectsRack } = renderToolbar();
    fireEvent.change(control("saturationDrive")!, { target: { value: "4.5" } });
    expect(onChangeEffectsRack).toHaveBeenCalledWith({ saturationDrive: 4.5 });
    fireEvent.change(control("chorusMix")!, { target: { value: "0.8" } });
    expect(onChangeEffectsRack).toHaveBeenCalledWith({ chorusMix: 0.8 });
    fireEvent.change(control("bitDepth")!, { target: { value: "8" } });
    expect(onChangeEffectsRack).toHaveBeenCalledWith({ bitDepth: 8 });
  });

  it("emits filterQ and chorusRate only after the secondary row is opened", () => {
    const { control, onChangeEffectsRack } = renderToolbar();
    fireEvent.click(screen.getByText("ADV"));
    fireEvent.change(control("filterQ")!, { target: { value: "7.5" } });
    expect(onChangeEffectsRack).toHaveBeenCalledWith({ filterQ: 7.5 });
    fireEvent.change(control("chorusRate")!, { target: { value: "2.4" } });
    expect(onChangeEffectsRack).toHaveBeenCalledWith({ chorusRate: 2.4 });
  });

  it("labels every parameter control for screen readers", () => {
    const { control } = renderToolbar();
    fireEvent.click(screen.getByText("ADV"));
    for (const param of [
      "filterCutoff",
      "filterQ",
      "filterType",
      "saturationDrive",
      "chorusMix",
      "chorusRate",
      "bitDepth",
    ]) {
      const el = control(param)!;
      const label = el.getAttribute("aria-label");
      expect(label, `${param} aria-label`).toBeTruthy();
      expect(label!.length).toBeGreaterThan(0);
    }
  });

  it("shows the current values as readouts", () => {
    renderToolbar();
    // Defaults: 16 kHz cutoff, 1.5x drive, 35% mix, 12-bit.
    expect(screen.getByText("16.0k")).toBeTruthy();
    expect(screen.getByText("1.5x")).toBeTruthy();
    expect(screen.getByText("35%")).toBeTruthy();
    expect(screen.getByText("12bit")).toBeTruthy();
  });
});

describe("filter cutoff log mapping (D-05)", () => {
  it("maps the documented endpoints exactly", () => {
    expect(fxCutoffToSliderPosition(FX_CUTOFF_MIN_HZ)).toBe(0);
    expect(fxCutoffToSliderPosition(FX_CUTOFF_MAX_HZ)).toBe(100);
    expect(fxSliderPositionToCutoff(0)).toBe(FX_CUTOFF_MIN_HZ);
    expect(fxSliderPositionToCutoff(100)).toBe(FX_CUTOFF_MAX_HZ);
  });

  it("puts the geometric midpoint (632 Hz) at slider centre — proof the scale is not linear", () => {
    expect(fxSliderPositionToCutoff(50)).toBe(632);
    expect(fxCutoffToSliderPosition(632)).toBe(50);
    // 1 kHz sits at ~57%, not near the bottom as it would on a linear scale.
    expect(fxCutoffToSliderPosition(1000)).toBe(57);
    // A linear 20–20000 slider would put 1 kHz at ~4.9, i.e. the first 5% of travel.
    expect(((1000 - FX_CUTOFF_MIN_HZ) / (FX_CUTOFF_MAX_HZ - FX_CUTOFF_MIN_HZ)) * 100).toBeLessThan(6);
  });

  it("is strictly monotonic across the whole travel", () => {
    let previous = 0;
    for (let pos = 0; pos <= 100; pos += 1) {
      const hz = fxSliderPositionToCutoff(pos);
      expect(hz).toBeGreaterThan(previous);
      previous = hz;
    }
  });

  it("round-trips position -> Hz -> position within one step", () => {
    for (let pos = 0; pos <= 100; pos += 1) {
      expect(Math.abs(fxCutoffToSliderPosition(fxSliderPositionToCutoff(pos)) - pos)).toBeLessThanOrEqual(1);
    }
  });

  it("clamps out-of-range input instead of producing NaN or negative Hz", () => {
    expect(fxSliderPositionToCutoff(-50)).toBe(FX_CUTOFF_MIN_HZ);
    expect(fxSliderPositionToCutoff(500)).toBe(FX_CUTOFF_MAX_HZ);
    expect(fxCutoffToSliderPosition(1)).toBe(0);
    expect(fxCutoffToSliderPosition(1e9)).toBe(100);
  });

  it("formats the readout in Hz below 1 kHz and kHz above", () => {
    expect(formatFxCutoff(420)).toBe("420");
    expect(formatFxCutoff(1000)).toBe("1.0k");
    expect(formatFxCutoff(16000)).toBe("16.0k");
  });
});
