import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toolbar, type ToolbarProps } from "../components/sequencer/Toolbar";
import { DEFAULT_FX_STATE } from "../audio/EffectsRack";

const noop = () => {};

function makeToolbarProps(overrides: Partial<ToolbarProps> = {}): ToolbarProps {
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
    showAdvancedControls: false,
    isVelocityLaneOpen: false,
    isSidebarCollapsed: false,
    isEditorMaximized: false,
    canUndo: false,
    canRedo: false,
    genreName: "Deep House",
    genreAccent: "#00ffcc",
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

describe("Toolbar Advanced Controls Popover & Progressive Disclosure", () => {
  it("renders as an absolute floating popover without pushing layout when open", () => {
    const { container } = render(
      <Toolbar {...makeToolbarProps({ showAdvancedControls: true })} />
    );

    const popover = container.querySelector(".absolute.top-full");
    expect(popover).not.toBeNull();
    expect(popover?.className).toContain("z-40");
    expect(popover?.className).toContain("shadow-2xl");
  });

  it("closes advanced popover when clicking outside", () => {
    const handleToggle = vi.fn();
    render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <Toolbar
          {...makeToolbarProps({
            showAdvancedControls: true,
            onToggleAdvancedControls: handleToggle,
          })}
        />
      </div>
    );

    expect(handleToggle).not.toHaveBeenCalled();

    const outside = screen.getByTestId("outside-area");
    fireEvent.mouseDown(outside);

    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it("closes advanced popover when pressing Escape", () => {
    const handleToggle = vi.fn();
    render(
      <Toolbar
        {...makeToolbarProps({
          showAdvancedControls: true,
          onToggleAdvancedControls: handleToggle,
        })}
      />
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside the popover", () => {
    const handleToggle = vi.fn();
    render(
      <Toolbar
        {...makeToolbarProps({
          showAdvancedControls: true,
          onToggleAdvancedControls: handleToggle,
        })}
      />
    );

    const [firstSlider] = screen.getAllByRole("slider");
    fireEvent.mouseDown(firstSlider);

    expect(handleToggle).not.toHaveBeenCalled();
  });
});
