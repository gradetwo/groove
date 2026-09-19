/**
 * A-03 regression proof: the step grid must actually *bail out* of re-rendering.
 *
 * Why the obvious assertion is not enough
 * ---------------------------------------
 * `React.memo` is easy to defeat and easy to mis-test:
 *
 * 1. React reuses host DOM nodes whenever a parent re-renders — memoized or not —
 *    so `before === after` is true even when `React.memo` was bypassed. A test that
 *    only compares DOM node identity passes at the old (broken) revision too.
 * 2. `React.Profiler.onRender` also fires for a subtree whose memoized child bailed
 *    out, so it cannot distinguish "re-rendered" from "skipped".
 *
 * Both were verified empirically while writing this file. To make the assertions
 * able to FAIL, each memoized component is instrumented with a render probe that
 * only ticks when its render *body* actually executes:
 *
 *   - `TrackRow` renders `<Sliders/>` unconditionally  -> mocked icon counts its runs.
 *   - `StepCell` calls `midiToNoteName()` for a lit melodic step -> spy counts its runs.
 *
 * The DOM-identity checks are kept as secondary assertions (they catch remounts,
 * which memo should never cause).
 */
import React from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => ({ sliders: 0 }));
const noteName = vi.hoisted(() => vi.fn((midi: number) => `NOTE_${midi}`));

// TrackRow imports exactly these icons from lucide-react.
vi.mock("lucide-react", () => ({
  Play: () => React.createElement("svg", { "data-testid": "probe-play" }),
  Sliders: () => {
    probe.sliders += 1;
    return React.createElement("svg", { "data-testid": "probe-sliders" });
  },
  SlidersHorizontal: () =>
    React.createElement("svg", { "data-testid": "probe-sliders-horizontal" }),
  Wand2: () => React.createElement("svg", { "data-testid": "probe-wand" }),
}));

// StepCell imports `midiToNoteName` from the pitch modal; it is called during render
// whenever a melodic step is lit, which makes it a perfect render probe.
vi.mock("../components/sequencer/PitchPickerModal", () => ({
  midiToNoteName: noteName,
}));

import { StepCell, type StepCellProps } from "../components/sequencer/StepCell";
import { TrackRow, type TrackMetaConfig } from "../components/sequencer/TrackRow";
import type { SequencerTrack } from "../types/genre";

const META: TrackMetaConfig = {
  id: "kick",
  name: "KICK",
  sub: { zh: "底鼓", en: "Kick" },
  color: "#ff5964",
};

const METAS: TrackMetaConfig[] = [
  META,
  { id: "snare", name: "SNARE", sub: { zh: "军鼓", en: "Snare" }, color: "#ffb65c" },
  { id: "hat", name: "HI-HAT", sub: { zh: "踩镲", en: "Hi-Hat" }, color: "#45e0c9" },
];

function makeTrack(overrides: Partial<SequencerTrack> = {}): SequencerTrack {
  return {
    track_id: "kick",
    name: "KICK",
    instrument: "synth",
    steps: [1, 0, 1, 0],
    velocity: [100, 96, 100, 100],
    volume: 0.8,
    pan: 0,
    ...overrides,
  };
}

const noop = () => {};

/** All TrackRow handlers are module-stable, exactly like the `useCallback`s in StudioView. */
const rowHandlers = {
  onAudition: noop,
  onCycleLength: noop,
  onToggleMute: noop,
  onToggleSolo: noop,
  onChangeVolume: noop,
  onOpenVelocity: noop,
  onOpenInspector: noop,
  onShiftTrack: noop,
  onSmartFill: noop,
  onClearTrack: noop,
  onMoveUp: noop,
  onMoveDown: noop,
  onChangePan: noop,
  onChangeSwing: noop,
};

function rowProps(track: SequencerTrack, trackIdx: number, meta: TrackMetaConfig = META) {
  return {
    track,
    trackIdx,
    meta,
    isSolo: false,
    isMute: false,
    isSilenced: false,
    isHatTrack: false,
    stepCount: 4,
    stepsPerBar: 4,
    groupSize: 4,
    isVelocityLaneOpen: false,
    isVelocityActiveTrack: false,
    isZh: false,
    canMoveUp: trackIdx > 0,
    canMoveDown: false,
    ...rowHandlers,
  };
}

const cellProps: StepCellProps = {
  trackIdx: 0,
  stepIdx: 3,
  stepVal: 1,
  velocity: 96,
  isAcc: false,
  isHatRound: false,
  isHatTriplet: false,
  ratchet: 1,
  prob: 100,
  isMelodic: true,
  midiNote: 60,
  gate: 0.8,
  isOutsideLoop: false,
  isPlayhead: false,
  isBarStart: false,
  isGroupStart: false,
  trackColor: "#ff5964",
};

const cell = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-track-idx="0"][data-step-idx="3"]');

beforeEach(() => {
  probe.sliders = 0;
  noteName.mockClear();
});

describe("TrackRow memoization (A-03)", () => {
  it("bails out when the parent re-renders with unchanged props", () => {
    const props = rowProps(makeTrack(), 0);
    const { container, rerender } = render(<TrackRow {...props} />);

    const before = Array.from(container.querySelectorAll<HTMLElement>("[data-step-idx]"));
    expect(before).toHaveLength(4);

    probe.sliders = 0;
    rerender(<TrackRow {...props} />);

    // PRIMARY: TrackRow's render body did not execute at all.
    expect(probe.sliders).toBe(0);
    // SECONDARY: no cell was remounted either.
    const after = Array.from(container.querySelectorAll<HTMLElement>("[data-step-idx]"));
    after.forEach((node, index) => expect(node).toBe(before[index]));
  });

  it("re-renders when a prop genuinely changes (memo comparison is not always-true)", () => {
    const props = rowProps(makeTrack(), 0);
    const { container, rerender } = render(<TrackRow {...props} />);

    const muteButton = () =>
      Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent?.trim() === "M"
      );
    expect(muteButton()).toHaveAttribute("aria-pressed", "false");

    probe.sliders = 0;
    rerender(<TrackRow {...props} isMute />);

    expect(probe.sliders).toBe(1);
    // The M button is the same host node (no remount) but its state flipped.
    expect(muteButton()).toHaveAttribute("aria-pressed", "true");
  });

  it("is defeated by fresh inline handlers — the exact bug StudioView had", () => {
    const props = rowProps(makeTrack(), 0);
    const { rerender } = render(<TrackRow {...props} />);

    probe.sliders = 0;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    rerender(<TrackRow {...props} onToggleMute={() => {}} />);

    // Confirms the probe is sensitive: one new callback identity -> one re-render.
    expect(probe.sliders).toBe(1);
  });

  it("re-renders only the edited row when one track's data changes", () => {
    const tracks = [
      makeTrack({ track_id: "kick", name: "KICK" }),
      makeTrack({ track_id: "snare", name: "SNARE" }),
      makeTrack({ track_id: "hihat", name: "HI-HAT" }),
    ];

    const Grid = ({ rows }: { rows: SequencerTrack[] }) => (
      <div role="grid">
        {rows.map((track, index) => (
          <TrackRow
            key={track.track_id}
            {...rowProps(track, index, METAS[index])}
            canMoveDown={index < rows.length - 1}
          />
        ))}
      </div>
    );

    const { rerender } = render(<Grid rows={tracks} />);
    probe.sliders = 0;

    // A store-dispatch-style edit: only row 0 gets a new track object.
    const edited = tracks.map((track, index) =>
      index === 0 ? makeTrack({ track_id: "kick", name: "KICK", steps: [0, 1, 0, 1] }) : track
    );
    rerender(<Grid rows={edited} />);

    // Exactly one row rendered; the two untouched rows bailed out.
    expect(probe.sliders).toBe(1);
  });
});

describe("StepCell memoization (A-03)", () => {
  it("bails out when re-rendered with unchanged props", () => {
    const { container, rerender } = render(<StepCell {...cellProps} />);

    expect(noteName).toHaveBeenCalledTimes(1);
    const before = cell(container);
    expect(before).not.toBeNull();

    noteName.mockClear();
    rerender(<StepCell {...cellProps} />);

    // PRIMARY: StepCell's render body did not execute.
    expect(noteName).not.toHaveBeenCalled();
    // SECONDARY: same DOM node, not a remount.
    expect(cell(container)).toBe(before);
  });

  it("re-renders and mounts fresh nodes when a prop genuinely changes", () => {
    const { container, rerender } = render(<StepCell {...cellProps} stepVal={0} />);
    const root = cell(container);
    expect(root?.querySelector("span")).toBeNull();

    noteName.mockClear();
    rerender(<StepCell {...cellProps} stepVal={1} />);

    // The render body ran for the new prop value...
    expect(noteName).toHaveBeenCalledTimes(1);
    const firstSpan = root?.querySelector("span");
    expect(firstSpan).not.toBeNull();

    // ...and after toggling off/on the highlight is a genuinely NEW node, which is
    // only possible if memo returned false for the changed prop.
    rerender(<StepCell {...cellProps} stepVal={0} />);
    rerender(<StepCell {...cellProps} stepVal={1} />);
    const secondSpan = cell(container)?.querySelector("span");
    expect(secondSpan).not.toBe(firstSpan);
    // The cell itself was reconciled in place (no key change, no remount).
    expect(cell(container)).toBe(root);
  });
});
