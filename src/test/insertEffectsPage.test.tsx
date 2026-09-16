/**
 * Effects page redesign (item ①).
 *
 * The page is now a signal chain — one slot per processor in the order the DSP wires them — with
 * the selected stage's editor below it, and three curves that are computed from the live
 * parameters rather than drawn from a picture. These tests pin the parts that make that true:
 *
 *   - the strip lists the real stages in DSP order and its power dots toggle the real parameters;
 *   - selecting a stage shows that editor and hides the others **without unmounting** them (so a
 *     slider keeps its position and the existing per-parameter contracts survive);
 *   - the curves exist and are driven by the parameters (change a gain, the path changes);
 *   - the gain-reduction meter reads the running compressor through the getter it is handed.
 */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { TrackInspector } from "../components/console/TrackInspector";
import { resolveTrackInsert, type TrackInsertParams } from "../data/trackInsert";
import type { MixTrackId } from "../data/genreMix";

vi.mock("../components/sequencer/PitchPickerModal", () => ({
  midiToNoteName: (midi: number) => `NOTE_${midi}`,
}));

const baseInsert = (patch: Partial<TrackInsertParams> = {}): TrackInsertParams => ({
  ...resolveTrackInsert("chords"),
  ...patch,
});

function setup(over: Partial<React.ComponentProps<typeof TrackInspector>> = {}) {
  const onChangeInsert = vi.fn();
  const handlers = {
    onClose: vi.fn(),
    onMuteToggle: vi.fn(),
    onSoloToggle: vi.fn(),
    onChangeInsert,
    onResetInsert: vi.fn(),
    onBypassInsert: vi.fn(),
  };
  render(
    <TrackInspector
      role={"chords" as MixTrackId}
      trackName="Chords"
      instrument="warm_pad"
      instrumentOptions={["warm_pad", "rhodes_ep"]}
      onInstrumentChange={vi.fn()}
      volume={0.8}
      pan={0}
      sendA={0}
      sendB={0}
      muted={false}
      soloed={false}
      onVolumeChange={vi.fn()}
      onPanChange={vi.fn()}
      onSendAChange={vi.fn()}
      onSendBChange={vi.fn()}
      insert={baseInsert()}
      {...handlers}
      {...over}
    />
  );
  return handlers;
}

/** The effects tab has to be selected before its stage panels mean anything. */
const openEffects = () => fireEvent.click(screen.getByTestId("track-inspector-tab-effects"));

beforeEach(() => {
  localStorage.clear();
});

describe("effects page · the signal chain strip", () => {
  it("lists the four processors in the order the DSP wires them", () => {
    setup();
    openEffects();
    const ids = ["hpf", "eq", "comp", "drive"];
    for (const id of ids) expect(screen.getByTestId(`insert-flow-${id}`)).toBeInTheDocument();
    // Order is not cosmetic: it is the serial order of the insert chain, so assert the DOM order
    // of the slots rather than their (localized) labels.
    const strip = screen.getByTestId("insert-flow-strip");
    const domOrder = [...strip.querySelectorAll("[data-testid^='insert-flow-']")]
      .map((el) => el.getAttribute("data-testid"))
      .filter((id) => id && !id.endsWith("-toggle"));
    expect(domOrder).toEqual([
      "insert-flow-hpf",
      "insert-flow-eq",
      "insert-flow-comp",
      "insert-flow-drive",
    ]);
  });

  it("puts each stage's live values in the strip", () => {
    setup({ insert: baseInsert({ hpfEnabled: true, hpfHz: 120, compThresholdDb: -18, compRatio: 4 }) });
    openEffects();
    expect(screen.getByTestId("insert-flow-hpf").textContent).toContain("120");
    expect(screen.getByTestId("insert-flow-comp").textContent).toContain("4.0:1");
  });

  it("toggles the real parameters from the power dots", () => {
    const chordsDefault = resolveTrackInsert("chords");
    const { onChangeInsert } = setup({
      insert: baseInsert({
        hpfEnabled: false,
        driveEnabled: false,
        low: { ...chordsDefault.low, enabled: false },
        mid: { ...chordsDefault.mid, enabled: false },
        high: { ...chordsDefault.high, enabled: false },
      }),
    });
    openEffects();

    fireEvent.click(screen.getByTestId("insert-flow-hpf-toggle"));
    expect(onChangeInsert).toHaveBeenCalledWith({ hpfEnabled: true });

    fireEvent.click(screen.getByTestId("insert-flow-drive-toggle"));
    expect(onChangeInsert).toHaveBeenCalledWith({ driveEnabled: true });

    // The EQ dot switches the three bands together (the per-band switches stay in the editor).
    fireEvent.click(screen.getByTestId("insert-flow-eq-toggle"));
    const patch = onChangeInsert.mock.calls.at(-1)?.[0] as Partial<TrackInsertParams>;
    expect(patch.low?.enabled).toBe(true);
    expect(patch.mid?.enabled).toBe(true);
    expect(patch.high?.enabled).toBe(true);
  });

  it("shows one stage's editor at a time without unmounting the others", () => {
    setup();
    openEffects();

    // The EQ is the default stage.
    expect((screen.getByTestId("insert-stage-panel-mid") as HTMLElement).hidden).toBe(false);
    expect((screen.getByTestId("insert-stage-panel-comp") as HTMLElement).hidden).toBe(true);

    fireEvent.click(screen.getByTestId("insert-flow-comp"));
    expect((screen.getByTestId("insert-stage-panel-comp") as HTMLElement).hidden).toBe(false);
    expect((screen.getByTestId("insert-stage-panel-mid") as HTMLElement).hidden).toBe(true);
    // Still mounted, so its controls keep their state and their contracts.
    expect(screen.getByTestId("track-inspector-comp-threshold")).toBeInTheDocument();
    expect(screen.getByTestId("track-inspector-mid-hz")).toBeInTheDocument();
  });
});

describe("effects page · curves are computed from the parameters", () => {
  it("draws the EQ response and changes it when a band changes", () => {
    const flat = baseInsert({
      hpfEnabled: false,
      low: { ...resolveTrackInsert("chords").low, enabled: false },
      mid: { ...resolveTrackInsert("chords").mid, enabled: false },
      high: { ...resolveTrackInsert("chords").high, enabled: false },
    });
    const { unmount } = render(
      <TrackInspector
        role={"chords" as MixTrackId}
        trackName="Chords"
        instrument="warm_pad"
        instrumentOptions={["warm_pad"]}
        onInstrumentChange={vi.fn()}
        volume={0.8}
        pan={0}
        sendA={0}
        sendB={0}
        muted={false}
        soloed={false}
        onVolumeChange={vi.fn()}
        onPanChange={vi.fn()}
        onSendAChange={vi.fn()}
        onSendBChange={vi.fn()}
        insert={flat}
        onClose={vi.fn()}
        onMuteToggle={vi.fn()}
        onSoloToggle={vi.fn()}
        onChangeInsert={vi.fn()}
        onResetInsert={vi.fn()}
        onBypassInsert={vi.fn()}
      />
    );
    const flatPath = screen.getByTestId("insert-eq-curve-path").getAttribute("d");
    expect(flatPath).toBeTruthy();
    unmount();

    setup({
      insert: baseInsert({
        hpfEnabled: false,
        mid: { ...resolveTrackInsert("chords").mid, enabled: true, hz: 1000, gainDb: 12, q: 1 },
      }),
    });
    openEffects();
    const boostedPath = screen.getByTestId("insert-eq-curve-path").getAttribute("d");
    expect(boostedPath).toBeTruthy();
    // A +12 dB peaking band must draw a different curve than a flat chain.
    expect(boostedPath).not.toBe(flatPath);
  });

  it("marks the enabled bands with handles and the disabled ones as inactive", () => {
    setup({
      insert: baseInsert({
        hpfEnabled: true,
        low: { ...resolveTrackInsert("chords").low, enabled: false },
      }),
    });
    openEffects();
    // The EQ block's curve draws all four handles; the HPF stage has its own instance, whose
    // testids carry the `-hpf` suffix so the two never collide.
    expect(screen.getByTestId("insert-eq-handle-hpf")).toBeInTheDocument();
    expect(screen.getByTestId("insert-eq-handle-hpf-hpf")).toBeInTheDocument();
    const lowHandle = screen.getByTestId("insert-eq-handle-low");
    // A disabled band's handle is drawn dimmed; the honest signal is the stroke colour.
    expect(lowHandle.innerHTML).toContain("#3a3f49");
  });

  it("draws the compressor transfer curve and the drive curve", () => {
    setup();
    openEffects();
    fireEvent.click(screen.getByTestId("insert-flow-comp"));
    expect(screen.getByTestId("insert-comp-curve-path").getAttribute("d")).toBeTruthy();
    expect(screen.getByTestId("insert-comp-threshold-line")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("insert-flow-drive"));
    expect(screen.getByTestId("insert-drive-curve-path").getAttribute("d")).toBeTruthy();
  });

  it("meters the gain reduction it is handed, through a getter", async () => {
    const getGainReductionDb = vi.fn(() => -12);
    setup({ getGainReductionDb, isPlaying: true });
    openEffects();
    fireEvent.click(screen.getByTestId("insert-flow-comp"));

    // The meter polls on requestAnimationFrame; a couple of frames is enough in jsdom.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });

    expect(getGainReductionDb).toHaveBeenCalled();
    const bar = screen.getByTestId("insert-comp-gr-bar");
    // −12 dB is half of the meter's 24 dB span.
    expect(Number(bar.getAttribute("data-reduction-db"))).toBeCloseTo(-12, 1);
    expect(bar.style.width).toBe("50%");
    expect(screen.getByTestId("insert-comp-gr-value").textContent).toContain("-12.0");
  });

  it("reads 0 dB when nothing is compressing, rather than inventing movement", async () => {
    setup({ getGainReductionDb: () => 0, isPlaying: true });
    openEffects();
    fireEvent.click(screen.getByTestId("insert-flow-comp"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    expect(screen.getByTestId("insert-comp-gr-bar").style.width).toBe("0%");
    expect(screen.getByTestId("insert-comp-gr-value").textContent).toContain("0.0");
  });
});
