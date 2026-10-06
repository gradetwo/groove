import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toolbar, type ToolbarProps } from "../components/sequencer/Toolbar";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  /**
   * U5: the sequencer is the only screen without a help entry, and it is the one that needs it most.
   *
   * The entry lives in the More menu because help is a session-edge affordance — the density work
   * (G.10) got the default surface down to 16 controls and this must not spend that back.
   */
  it("offers help for the sequencer screen from the More menu", () => {
    const onOpenHelp = vi.fn();
    render(<Toolbar {...makeToolbarProps({ onOpenHelp })} />);

    fireEvent.click(screen.getByTestId("toolbar-more-menu-btn"));
    const help = screen.getByTestId("toolbar-help");
    fireEvent.click(help);
    expect(onOpenHelp).toHaveBeenCalledWith("sequencer");
    // The menu closes behind it, like every other entry in that popover.
    expect(screen.queryByTestId("toolbar-more-menu")).toBeNull();
  });

  it("renders no help entry when the host cannot open help", () => {
    // Optional, like the console toggle: an entry that opens nothing would be worse than none.
    render(<Toolbar {...makeToolbarProps()} />);
    fireEvent.click(screen.getByTestId("toolbar-more-menu-btn"));
    expect(screen.queryByTestId("toolbar-help")).toBeNull();
  });

  it("is reachable from the panel, which is what StudioView hands the help opener to", () => {
    // Wiring, not behaviour: the entry above is covered behaviourally, and a correct entry wired to
    // nothing looks identical to no entry at all.
    const panel = readFileSync(resolve(__dirname, "../components/sequencer/SequencerPanel.tsx"), "utf8");
    expect(panel).toContain("onOpenHelp={onOpenHelp}");
    /**
     * ⭐ **The arrangement view renders its own toolbar, so it calls the opener rather than handing it to a child.** The shared
     * `Toolbar` took `onOpenHelp` as a prop; this surface draws its own controls, which is why the entry lives here as a call and a
     * testid instead. What the case pins is unchanged: a correct entry that reaches nothing looks like no entry at all.
     */
    const view = readFileSync(resolve(__dirname, "../components/arrangement/ArrangementViewV2.tsx"), "utf8");
    expect(view).toContain('data-testid="toolbar-help"');
    expect(view).toContain('onOpenHelp("sequencer")');
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

/**
 * The density is not a modal: pressing a control it revealed must act, not dismiss.
 *
 * This is the interaction the release matrix caught, and it is worth a unit test because the
 * failure is invisible to every other kind of check. Most Tier 2/3 controls live *outside* the
 * advanced panel (the transport group, the groove selects, the roll and console toggles, the project
 * group). Each one carries `data-toolbar-tier`, and the panel's mousedown handler used to treat that
 * click as an outside click: the density closed, the control unmounted, and the click landed on
 * nothing — so the control looked dead until the user pressed it twice.
 */
describe("controls revealed by the advanced density stay clickable", () => {
  it("does not dismiss the density when a Tier 2 control outside the panel is pressed", () => {
    const onToggleAdvancedControls = vi.fn();
    const onTogglePianoRoll = vi.fn();
    render(
      <Toolbar
        {...makeToolbarProps({
          showAdvancedControls: true,
          onToggleAdvancedControls,
          onTogglePianoRoll,
        })}
      />
    );

    // The roll toggle is Tier 2 and lives in the views group, outside the advanced panel.
    const roll = screen.getByTestId("toolbar-piano-roll-toggle");
    expect(roll).toHaveAttribute("data-toolbar-tier", "2");
    fireEvent.mouseDown(roll);
    expect(onToggleAdvancedControls).not.toHaveBeenCalled();

    fireEvent.click(roll);
    expect(onTogglePianoRoll).toHaveBeenCalledTimes(1);
  });

  it("does not dismiss when a Tier 1 control outside the panel is pressed", () => {
    /**
     * The same mechanism applies to Tier 1 controls that sit outside the panel, and there is no
     * reason to treat them differently: clicking Undo while the density is open should undo, not
     * close the density. Only a press that is genuinely *outside the toolbar* dismisses it.
     */
    const onToggleAdvancedControls = vi.fn();
    render(
      <Toolbar
        {...makeToolbarProps({ showAdvancedControls: true, onToggleAdvancedControls })}
      />
    );
    const playButton = document.querySelector("[data-toolbar-id='play']");
    expect(playButton).not.toBeNull();
    fireEvent.mouseDown(playButton!);
    expect(onToggleAdvancedControls).not.toHaveBeenCalled();
  });

  it("still dismisses on a press that is outside the toolbar entirely", () => {
    // The dismissal has to keep working, or the panel becomes impossible to close without Escape.
    const onToggleAdvancedControls = vi.fn();
    render(
      <Toolbar
        {...makeToolbarProps({ showAdvancedControls: true, onToggleAdvancedControls })}
      />
    );
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    fireEvent.mouseDown(outside);
    expect(onToggleAdvancedControls).toHaveBeenCalledTimes(1);
    outside.remove();
  });
});

/**
 * ⭐ **The studio's Stop, which only exists because Pause became a real pause.**
 *
 * The button is asserted in the three registers the owner reads a control in — the word, the accessible name, and
 * whether it is pressable — because the defect this whole round is about was exactly a label and a behaviour disagreeing.
 * Its `disabled` state is the one U7 fact: a Stop that would do nothing must not be a live control.
 */
describe("the studio toolbar's Stop control", () => {
  it("renders beside the transport toggle, named STOP, and is disabled while it would do nothing", () => {
    const onStop = vi.fn();
    render(<Toolbar {...makeToolbarProps({ onStop, canStop: false })} />);

    const stop = document.querySelector('[data-toolbar-id="stop"]') as HTMLButtonElement;
    expect(stop).not.toBeNull();
    /**
     * The word and the accessible name, asserted against **each other** rather than against a literal: this suite
     * renders under whichever language the provider defaults to, and the claim that matters is that what a person reads
     * and what a screen reader announces are the same control.
     */
    expect(["STOP", "停止"]).toContain(stop.textContent);
    expect(stop.getAttribute("aria-label")).toBe(stop.textContent);
    expect(stop.disabled).toBe(true);
    fireEvent.click(stop);
    expect(onStop).not.toHaveBeenCalled();
  });

  it("is pressable exactly while a stop would return the transport somewhere", () => {
    const onStop = vi.fn();
    render(<Toolbar {...makeToolbarProps({ onStop, canStop: true })} />);

    const stop = document.querySelector('[data-toolbar-id="stop"]') as HTMLButtonElement;
    expect(stop.disabled).toBe(false);
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("is not rendered at all when the host gives no handler, so it cannot be a dead button", () => {
    render(<Toolbar {...makeToolbarProps()} />);
    expect(document.querySelector('[data-toolbar-id="stop"]')).toBeNull();
  });
});
