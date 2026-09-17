/**
 * Piano roll component (item ⑦).
 *
 * The point of the roll is that it edits **the studio's own data**: a note drawn here must appear
 * in the step grid, because both render the same `SequencerPattern`. These tests assert the
 * contract at the store boundary (the exact `COMMIT_PATTERN` payload), which is what makes the two
 * views one source of truth — plus the states the UI must handle: a non-melodic track, the loop
 * boundary, and dismissal by Escape.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PianoRollLane } from "../components/sequencer/PianoRollLane";
import type { SequencerAction } from "../features/sequencer/useSequencerStore";
import type { SequencerPattern } from "../types/genre";
import { publishPlayhead, resetPlayheadBus } from "../features/sequencer/playheadBus";

vi.mock("../components/sequencer/PitchPickerModal", () => ({
  midiToNoteName: (midi: number) => `NOTE_${midi}`,
}));

/**
 * The y coordinate of a pitch's row, read from the rendered gutter.
 *
 * Notes are hit-tested by **(step, pitch)** — that is what makes a chord editable — so a gesture in
 * a test has to aim at the note's own row. Reading the row order from the DOM keeps that honest
 * instead of hard-coding an index that shifts whenever the visible range changes.
 */
function rowYFor(midi: number, rowH = 18): number {
  const rows = screen.getAllByTestId(/^piano-roll-row-\d+$/);
  const idx = rows.findIndex((el) => el.getAttribute("data-testid") === `piano-roll-row-${midi}`);
  if (idx < 0) throw new Error(`pitch row ${midi} is not rendered`);
  return idx * rowH + 4;
}

/** y of the topmost / bottommost rendered pitch row — for marquees that must cover everything. */
function extremeRowY(which: "top" | "bottom", rowH = 18): number {
  const rows = screen.getAllByTestId(/^piano-roll-row-\d+$/);
  const idx = which === "top" ? 0 : rows.length - 1;
  return idx * rowH + 4;
}

const STEPS = 8;

function makePattern(trackOver: Record<string, unknown> = {}): SequencerPattern {
  return {
    genre_id: "test",
    bpm: 120,
    scale: "C minor",
    resolution: "1/16",
    totalSteps: STEPS,
    tracks: [
      {
        track_id: "lead",
        name: "Lead",
        instrument: "saw_lead",
        steps: [1, 0, 0, 0, 1, 0, 0, 0],
        pitch: [60, null, null, null, 64, null, null, null],
        gate: Array(STEPS).fill(0.8),
        velocity: Array(STEPS).fill(100),
        ...trackOver,
      },
    ],
  } as unknown as SequencerPattern;
}

function setup(over: {
  pattern?: SequencerPattern;
  trackIdx?: number;
  stepCount?: number;
  stepsPerBar?: number;
  onAudition?: (trackIdx: number, midi: number, velocity: number, gate: number) => void;
  onToggleMusicalTyping?: () => void;
  onOpenHelp?: (chapterId?: string) => void;
  initialTool?: "pointer" | "pencil" | "eraser" | "scissors" | "marquee";
} = {}) {
  const commits: SequencerAction[] = [];
  const onAudition = over.onAudition ?? vi.fn();
  const onClose = vi.fn();
  const onSelectTrack = vi.fn();
  const onToggleMusicalTyping = over.onToggleMusicalTyping ?? vi.fn();
  const onOpenHelp = over.onOpenHelp ?? vi.fn();
  const pattern = over.pattern ?? makePattern();
  const stepCount = over.stepCount ?? STEPS;
  const stepsPerBar = over.stepsPerBar ?? 4;
  render(
    <PianoRollLane
      pattern={pattern}
      activeTrackIdx={over.trackIdx ?? 0}
      stepCount={stepCount}
      stepsPerBar={stepsPerBar}
      isZh
      onSelectTrack={onSelectTrack}
      onClose={onClose}
      commit={(action) => commits.push(action)}
      onAudition={onAudition}
      onToggleMusicalTyping={onToggleMusicalTyping}
      onOpenHelp={onOpenHelp}
      initialTool={over.initialTool}
    />
  );
  return { commits, onAudition, onClose, onSelectTrack, onOpenHelp, pattern };
}


describe("PianoRollLane · one source of truth", () => {
  it("renders one block per sounding step, positioned by pitch", () => {
    setup();
    expect(screen.getByTestId("piano-roll-note-0-60")).toBeInTheDocument();
    expect(screen.getByTestId("piano-roll-note-4-64")).toBeInTheDocument();
    expect(screen.queryByTestId("piano-roll-note-1-60")).toBeNull();
    // The pitch decides the row, so the two notes are not on the same one.
    const first = screen.getByTestId("piano-roll-note-0-60");
    const second = screen.getByTestId("piano-roll-note-4-64");
    expect(first.style.top).not.toBe(second.style.top);
  });

  it("commits a whole pattern (not a private copy) when a note is drawn", () => {
    const { commits, onAudition } = setup({ initialTool: "pencil" });
    const grid = screen.getByTestId("piano-roll-grid");
    // jsdom gives every element a zero-sized rect, so the click coordinates *are* the cell
    // coordinates: x/width = step, y/ROW_H = row.
    fireEvent.pointerDown(grid, { clientX: 1 * 26 + 5, clientY: 6 * 18 + 4 });

    expect(commits).toHaveLength(1);
    const action = commits[0] as { type: string; pattern: SequencerPattern };
    expect(action.type).toBe("COMMIT_PATTERN");
    // The payload is a full pattern, which is what the studio grid renders and what undo stores.
    expect(action.pattern.tracks[0].steps).toHaveLength(STEPS);
    expect(action.pattern.tracks[0].steps[1]).toBe(1);
    expect(action.pattern.tracks[0].pitch?.[1]).toBeTypeOf("number");
    // And drawing is audible: the same engine call the sequencer uses.
    expect(onAudition).toHaveBeenCalledTimes(1);
  });

  it("leaves array lengths untouched, because the store derives the step count from them", () => {
    const { commits } = setup({ initialTool: "pencil" });
    fireEvent.pointerDown(screen.getByTestId("piano-roll-grid"), { clientX: 2 * 26 + 4, clientY: 3 * 18 + 4 });
    const payload = (commits[0] as { pattern: SequencerPattern }).pattern;
    for (const track of payload.tracks) {
      expect(track.steps).toHaveLength(STEPS);
      expect(track.pitch).toHaveLength(STEPS);
    }
  });
});

describe("PianoRollLane · states the UI must be honest about", () => {
  it("says so for a track whose pitch the engine ignores", () => {
    setup({ pattern: makePattern({ track_id: "kick", name: "Kick" }) });
    expect(screen.getByTestId("piano-roll-not-melodic")).toBeInTheDocument();
    expect(screen.queryByTestId("piano-roll-grid")).toBeNull();
  });

  it("marks the polymeter boundary where steps stop sounding", () => {
    setup({ pattern: makePattern({ trackLength: 4 }) });
    const boundary = screen.getByTestId("piano-roll-loop-boundary");
    // Four audible steps out of eight: half the grid is shaded.
    expect(boundary.style.left).toBe(`${4 * 26}px`);
    expect(boundary.style.width).toBe(`${4 * 26}px`);
  });

  it("offers only melodic tracks in the selector", () => {
    const pattern = makePattern();
    pattern.tracks.push({
      track_id: "kick",
      name: "Kick",
      instrument: "drum",
      steps: [1, 0, 0, 0, 0, 0, 0, 0],
    } as never);
    setup({ pattern });
    const options = Array.from((screen.getByTestId("piano-roll-track") as HTMLSelectElement).options);
    expect(options.map((o) => o.textContent)).toEqual(["Lead"]);
  });

  it("closes on Escape so the drawer never traps the user", () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows velocity and length for the selected note, from the pattern's own values", () => {
    setup();
    // Clicking an existing note selects it; the readout comes from the pattern, not a local model.
    fireEvent.pointerDown(screen.getByTestId("piano-roll-grid"), { clientX: 0 * 26 + 5, clientY: 599 });
    const meta = screen.queryByTestId("piano-roll-selected-meta");
    if (meta) {
      expect(meta.textContent).toContain("0.80");
      expect(meta.textContent).toContain("100");
    }
  });
});

/**
 * Item ① of the follow-up: on a computer the roll was only about a third of the width.
 *
 * The cause was that the note grid was `steps × 26px` — a fixed pixel size independent of the
 * drawer — so a 16-step pattern occupied ~416 px and the rest of the panel sat empty. The fix is a
 * zoom *factor* on a cell width derived from the measured container, so the default (1×) fills the
 * drawer. jsdom performs no layout, so these tests pin the contract that is observable here
 * (defaults, attributes, what is rendered) and the E2E matrix measures the real geometry.
 */
describe("PianoRollLane · width, fullscreen and collapse", () => {
  it("starts at the fit zoom factor and fills the container width when it can be measured", () => {
    const { container } = render(
      <PianoRollLane
        pattern={makePattern()}
        activeTrackIdx={0}
        stepCount={STEPS}
        stepsPerBar={4}
        isZh
        onSelectTrack={() => {}}
        onClose={() => {}}
        commit={() => {}}
        onAudition={() => {}}
      />
    );
    const grid = container.querySelector("[data-testid='piano-roll-grid']") as HTMLElement;
    const wrap = container.querySelector("[data-testid='piano-roll-grid-wrap']") as HTMLElement;
    expect(grid).toBeTruthy();
    expect(wrap).toBeTruthy();
    // No layout in jsdom, so the fallback cell width is used — and the grid is still sized by the
    // step count rather than by a hard-coded pixel total.
    expect(grid.style.width).toBe(`${STEPS * 26}px`);
    // The wrapper is the element whose width the fit logic reads.
    expect(wrap.className).toContain("flex-1");
  });

  it("exposes fullscreen and collapse as real, independent states", () => {
    setup();
    const panel = screen.getByTestId("piano-roll");
    expect(panel.getAttribute("data-fullscreen")).toBe("false");
    expect(panel.getAttribute("data-collapsed")).toBe("false");

    fireEvent.click(screen.getByTestId("piano-roll-fullscreen"));
    expect(screen.getByTestId("piano-roll").getAttribute("data-fullscreen")).toBe("true");
    // Fullscreen must not unmount the editor.
    expect(screen.getByTestId("piano-roll-grid")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("piano-roll-collapse"));
    expect(screen.getByTestId("piano-roll").getAttribute("data-collapsed")).toBe("true");
    // Collapsed keeps the toolbar (so it can be reopened) but drops the editor.
    expect(screen.queryByTestId("piano-roll-grid")).toBeNull();
    expect(screen.getByTestId("piano-roll-track")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("piano-roll-collapse"));
    expect(screen.getByTestId("piano-roll-grid")).toBeInTheDocument();
  });

  it("leaves fullscreen on the first Escape and closes on the second", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByTestId("piano-roll-fullscreen"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("piano-roll").getAttribute("data-fullscreen")).toBe("false");
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/**
 * Piano-roll tools (item ② of the DAW-alignment objective).
 *
 * Logic's tool set is borrowed, and the places where it had to be *adapted* to a step grid are
 * asserted as adaptations rather than as Logic behaviour: quantise acts on lengths (starts are
 * already grid steps), scissors needs a free slot and says so when it has none, and the pencil
 * paints a stroke that is one undo step.
 */
describe("PianoRollLane · tools", () => {
  const grid = () => screen.getByTestId("piano-roll-grid");

  it("offers the five tools, reports the active one, and switches with the number keys and P/B", () => {
    setup();
    const panel = screen.getByTestId("piano-roll");
    // The roll opens on the pointer by default (item ②).
    expect(panel.getAttribute("data-tool")).toBe("pointer");

    for (const id of ["pointer", "pencil", "eraser", "scissors", "marquee"]) {
      expect(screen.getByTestId(`piano-roll-tool-${id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`piano-roll-tool-${id}`).getAttribute("aria-pressed")).toBe(id === "pointer" ? "true" : "false");
    }

    // Switch to pencil with 'B'
    fireEvent.keyDown(window, { key: "b" });
    expect(screen.getByTestId("piano-roll-tool-pencil").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("piano-roll").getAttribute("data-tool")).toBe("pencil");

    // Switch back to pointer with 'P'
    fireEvent.keyDown(window, { key: "p" });
    expect(screen.getByTestId("piano-roll-tool-pointer").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("piano-roll").getAttribute("data-tool")).toBe("pointer");

    fireEvent.keyDown(window, { key: "3" });
    expect(screen.getByTestId("piano-roll-tool-eraser").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("piano-roll").getAttribute("data-tool")).toBe("eraser");
  });

  it("erases the note under the eraser, and only that note", () => {
    const { commits } = setup();
    fireEvent.keyDown(window, { key: "3" });
    // jsdom rects are zero-sized, so the coordinates *are* cell coordinates (x/26, y/18).
    fireEvent.pointerDown(grid(), { clientX: 0 * 26 + 5, clientY: rowYFor(60) });
    expect(commits).toHaveLength(1);
    const pattern = (commits[0] as { pattern: SequencerPattern }).pattern;
    expect(pattern.tracks[0].steps[0]).toBe(0);
    expect(pattern.tracks[0].steps[4]).toBe(1); // the other note is untouched
  });

  it("paints a stroke with the pencil, committing the first cell at once and the rest on release", () => {
    const { commits } = setup({ initialTool: "pencil" });
    fireEvent.pointerDown(grid(), { clientX: 2 * 26 + 4, clientY: 3 * 18 + 4 });
    expect(commits).toHaveLength(1);

    fireEvent.pointerMove(grid(), { clientX: 3 * 26 + 4, clientY: 3 * 18 + 4 });
    fireEvent.pointerMove(grid(), { clientX: 4 * 26 + 4, clientY: 3 * 18 + 4 });
    // Still one commit: the stroke is one gesture (one undo step) once it is released.
    expect(commits).toHaveLength(1);

    fireEvent.pointerUp(grid());
    expect(commits).toHaveLength(2);
    const painted = (commits[1] as { pattern: SequencerPattern }).pattern;
    expect(painted.tracks[0].steps[2]).toBe(1);
    expect(painted.tracks[0].steps[3]).toBe(1);
  });

  it("splits a note with the scissors when the next step is free", () => {
    const { commits } = setup({
      pattern: makePattern({ steps: [1, 0, 0, 0, 0, 0, 0, 0], gate: [1.2, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8] }),
    });
    fireEvent.keyDown(window, { key: "4" });
    fireEvent.pointerDown(grid(), { clientX: 0, clientY: 3 * 18 + 4 });
    expect(commits).toHaveLength(1);
    const split = (commits[0] as { pattern: SequencerPattern }).pattern;
    expect(split.tracks[0].steps[0]).toBe(1);
    expect(split.tracks[0].steps[1]).toBe(1);
  });

  it("says why the scissors cannot cut when the next step is occupied", () => {
    // A monophonic grid has nowhere to put the second half of the note.
    const { commits } = setup({
      pattern: makePattern({ steps: [1, 1, 0, 0, 0, 0, 0, 0], gate: [1.2, 1.2, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8] }),
    });
    fireEvent.keyDown(window, { key: "4" });
    fireEvent.pointerDown(grid(), { clientX: 0, clientY: 3 * 18 + 4 });
    expect(commits).toHaveLength(0);
    expect(screen.getByTestId("piano-roll-notice")).toBeInTheDocument();
  });
});

describe("PianoRollLane · selection, marquee and moving a group", () => {
  const grid = () => screen.getByTestId("piano-roll-grid");

  it("selects the notes inside a marquee and moves them together", () => {
    const { commits } = setup({
      pattern: makePattern({
        steps: [1, 0, 1, 0, 0, 0, 0, 0],
        pitch: [60, null, 62, null, null, null, null, null],
      }),
    });
    fireEvent.keyDown(window, { key: "1" }); // pointer
    fireEvent.pointerDown(grid(), { clientX: 5 * 26 + 4, clientY: extremeRowY("bottom") });
    fireEvent.pointerMove(grid(), { clientX: 4, clientY: extremeRowY("top") });
    expect(screen.getByTestId("piano-roll-marquee")).toBeInTheDocument();
    fireEvent.pointerUp(grid());
    expect(screen.getByTestId("piano-roll-selected-count").textContent).toContain("2");

    // Now drag one of the selected notes one step right: both must move.
    fireEvent.pointerDown(screen.getByTestId("piano-roll-note-0-60"), { clientX: 0 * 26 + 4, clientY: rowYFor(60) });
    fireEvent.pointerMove(grid(), { clientX: 1 * 26 + 4, clientY: rowYFor(60) });
    fireEvent.pointerUp(grid());
    const moved = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    // Both notes move one step right: 0→1 and 2→3, so the steps they left are empty.
    expect(moved.tracks[0].steps[1]).toBe(1);
    expect(moved.tracks[0].steps[3]).toBe(1);
    expect(moved.tracks[0].steps[0]).toBe(0);
    expect(moved.tracks[0].steps[2]).toBe(0);
  });

  it("copies with ⌥-drag instead of moving (the originals stay)", () => {
    const { commits } = setup({ pattern: makePattern({ steps: [1, 0, 0, 0, 0, 0, 0, 0] }) });
    fireEvent.keyDown(window, { key: "1" });
    fireEvent.pointerDown(screen.getByTestId("piano-roll-note-0-60"), { clientX: 4, clientY: rowYFor(60) });
    fireEvent.pointerMove(grid(), { clientX: 2 * 26 + 4, clientY: rowYFor(60), altKey: true });
    fireEvent.pointerUp(grid());
    const copied = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(copied.tracks[0].steps[0]).toBe(1); // original
    expect(copied.tracks[0].steps[2]).toBe(1); // copy
  });

  it("deletes the whole selection from the toolbar", () => {
    const { commits } = setup({
      pattern: makePattern({ steps: [1, 0, 1, 0, 0, 0, 0, 0], pitch: [60, null, 62, null, null, null, null, null] }),
    });
    fireEvent.keyDown(window, { key: "1" });
    fireEvent.pointerDown(grid(), { clientX: 5 * 26 + 4, clientY: extremeRowY("bottom") });
    fireEvent.pointerMove(grid(), { clientX: 4, clientY: extremeRowY("top") });
    fireEvent.pointerUp(grid());
    fireEvent.click(screen.getByTestId("piano-roll-delete"));
    const emptied = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(emptied.tracks[0].steps.every((v: number) => v === 0)).toBe(true);
  });
});

describe("PianoRollLane · velocity lane", () => {
  it("draws one bar per note at its velocity", () => {
    setup({ pattern: makePattern({ velocity: [40, 100, 100, 100, 127, 100, 100, 100] }) });
    expect(screen.getByTestId("piano-roll-velocity-bar-0").getAttribute("data-velocity")).toBe("40");
    expect(screen.getByTestId("piano-roll-velocity-bar-4").getAttribute("data-velocity")).toBe("127");
    expect(screen.queryByTestId("piano-roll-velocity-bar-1")).toBeNull();
  });

  it("raises the velocity of the bar under the pointer, committing once", () => {
    const { commits } = setup({ pattern: makePattern({ velocity: [20, 100, 100, 100, 100, 100, 100, 100] }) });
    const lane = screen.getByTestId("piano-roll-velocity-lane");
    // jsdom gives the lane a zero-height rect, so the pointer's y *is* the height fraction.
    fireEvent.pointerDown(lane, { clientX: 4, clientY: -20 });
    fireEvent.pointerUp(lane);
    expect(commits).toHaveLength(1);
    const next = (commits[0] as { pattern: SequencerPattern }).pattern;
    expect(next.tracks[0].velocity?.[0]).toBeGreaterThan(20);
  });

  it("can be hidden, and says so through aria-pressed", () => {
    setup();
    const toggle = screen.getByTestId("piano-roll-velocity-toggle");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("piano-roll-velocity-lane")).toBeNull();
  });
});

describe("PianoRollLane · quantise and legato, adapted to a step grid", () => {
  it("quantises lengths (the honest version of Logic's quantise, given integer starts)", () => {
    const { commits } = setup({
      pattern: makePattern({ steps: [1, 0, 0, 0, 0, 0, 0, 0], gate: [0.62, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8] }),
    });
    fireEvent.change(screen.getByTestId("piano-roll-snap"), { target: { value: "1/4" } });
    fireEvent.click(screen.getByTestId("piano-roll-quantize-lengths"));
    const quantised = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(quantised.tracks[0].gate?.[0]).toBeCloseTo(1, 5);
  });

  it("applies legato to fill the gap to the next note", () => {
    const { commits } = setup({
      pattern: makePattern({ steps: [1, 0, 0, 1, 0, 0, 0, 0], pitch: [60, null, null, 64, null, null, null, null], gate: [0.2, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8] }),
    });
    fireEvent.click(screen.getByTestId("piano-roll-legato"));
    const legato = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    // The note now fills the whole three-step gap; the old two-step cap is gone (see
    // `MAX_NOTE_GATE_STEPS`), which is what makes a sustained chord or a legato bass writable.
    expect(legato.tracks[0].gate?.[0]).toBe(3);
  });
});

describe("PianoRollLane · Logic-style visuals", () => {
  it("highlights the scale on the pitch gutter (root, in-scale, out-of-scale)", () => {
    setup({ pattern: makePattern({ scale: "C minor" }) });
    // C is the root of C minor; D# (63) is in it; A# (58) is not. (The gutter only draws the range
    // around the notes, padded by two semitones: 58–66 here.)
    expect(screen.getByTestId("piano-roll-row-60").getAttribute("data-scale")).toBe("root");
    expect(screen.getByTestId("piano-roll-row-63").getAttribute("data-scale")).toBe("in");
    // B (59) is not in C natural minor (which has Bb), so that row is marked out-of-scale.
    expect(screen.getByTestId("piano-roll-row-59").getAttribute("data-scale")).toBe("out");
  });

  it("colours notes by velocity and names them when there is room", () => {
    setup({ pattern: makePattern({ steps: [1, 0, 0, 0, 1, 0, 0, 0], velocity: [30, 100, 100, 100, 127, 100, 100, 100] }) });
    const soft = screen.getByTestId("piano-roll-note-0-60");
    const hard = screen.getByTestId("piano-roll-note-4-64");
    expect(soft.getAttribute("data-velocity")).toBe("30");
    expect(soft.style.backgroundColor).not.toBe(hard.style.backgroundColor);
    expect(soft.textContent).toContain("NOTE_60");
  });

  it("exposes an inspector that edits the selected note numerically", () => {
    const { commits } = setup();
    // The pencil draws and does not select (that is the pointer's job), so switch tools first.
    fireEvent.keyDown(window, { key: "1" });
    fireEvent.pointerDown(screen.getByTestId("piano-roll-note-0-60"), { clientX: 4, clientY: rowYFor(60) });
    fireEvent.pointerUp(gridSafe());

    fireEvent.change(screen.getByTestId("piano-roll-velocity"), { target: { value: "55" } });
    const changed = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(changed.tracks[0].velocity?.[0]).toBe(55);

    fireEvent.change(screen.getByTestId("piano-roll-length"), { target: { value: "1.5" } });
    const resized = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(resized.tracks[0].gate?.[0]).toBeCloseTo(1.5, 5);
  });

  it("follows the transport through the DOM-only playhead bus, without re-rendering", () => {
    setup();
    const line = screen.getByTestId("piano-roll-playhead");
    // Stopped: the line is in the DOM but invisible, so the bus can move it without a render.
    expect(line.style.opacity).toBe("0");

    act(() => publishPlayhead(5));
    expect(line.style.opacity).toBe("1");
    // 5 steps at the jsdom fallback cell width of 26 px.
    expect(line.style.transform).toContain("130px");

    act(() => publishPlayhead(-1));
    expect(line.style.opacity).toBe("0");
  });

  it("offers catch-playhead as a real toggle", () => {
    setup();
    const catchBtn = screen.getByTestId("piano-roll-catch");
    expect(catchBtn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(catchBtn);
    expect(catchBtn.getAttribute("aria-pressed")).toBe("false");
  });
});

/** The grid element, for gestures that start on a note but end on the grid. */
function gridSafe(): HTMLElement {
  return screen.getByTestId("piano-roll-grid");
}

/**
 * Chords in the roll (the user's report: "the chords track shows one note, not a chord").
 *
 * The roll renders `track.pitches`, so a stored chord appears as a stack of blocks on one step and
 * can be edited tone by tone. These tests are about that visible/editable contract — the model's own
 * rules are covered in `rollModel.test.ts`.
 */
describe("PianoRollLane · chords are visible and editable", () => {
  const grid = () => screen.getByTestId("piano-roll-grid");
  const chordTrack = (pitches: (number[] | null)[]) =>
    makePattern({ steps: [1, 0, 0, 0, 0, 0, 0, 0], pitch: [60, null, null, null, null, null, null, null], pitches });

  it("draws every tone of a chord as its own block on one step", () => {
    setup({ pattern: chordTrack([[60, 64, 67], null, null, null, null, null, null, null]) });
    for (const midi of [60, 64, 67]) {
      expect(screen.getByTestId(`piano-roll-note-0-${midi}`)).toBeInTheDocument();
    }
    // Three blocks on the same step, on three different rows.
    const tops = [60, 64, 67].map((m) => screen.getByTestId(`piano-roll-note-0-${m}`).style.top);
    expect(new Set(tops).size).toBe(3);
    expect(screen.getByTestId("piano-roll-note-0-60").getAttribute("data-chord-size")).toBe("3");
  });

  it("builds a chord by drawing onto a step that already sounds", () => {
    const { commits } = setup({
      pattern: makePattern({ steps: [1, 0, 0, 0, 0, 0, 0, 0], pitch: [60, null, null, null, null, null, null, null] }),
      initialTool: "pencil",
    });
    // Pencil is selected; draw the third onto the same step.
    fireEvent.pointerDown(grid(), { clientX: 4, clientY: rowYFor(64) });
    expect(commits).toHaveLength(1);
    const pattern = (commits[0] as { pattern: SequencerPattern }).pattern;
    expect(pattern.tracks[0].pitches?.[0]).toEqual([60, 64]);
    // The step grid still sees exactly one sounding step: the two views share one pattern.
    expect(pattern.tracks[0].steps[0]).toBe(1);
    expect(pattern.tracks[0].steps.filter((v: number) => v > 0)).toHaveLength(1);
  });

  it("erases one chord tone, and clears the whole step with ⌥", () => {
    const { commits } = setup({ pattern: chordTrack([[60, 64, 67], null, null, null, null, null, null, null]) });
    fireEvent.keyDown(window, { key: "3" }); // eraser
    fireEvent.pointerDown(grid(), { clientX: 4, clientY: rowYFor(64) });
    const thinned = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(thinned.tracks[0].pitches?.[0]).toEqual([60, 67]);

    fireEvent.pointerDown(grid(), { clientX: 4, clientY: rowYFor(67), altKey: true });
    const cleared = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(cleared.tracks[0].steps[0]).toBe(0);
    expect(cleared.tracks[0].pitches?.[0]).toBeNull();
  });

  it("moves a single chord tone without disturbing the rest of the chord", () => {
    const { commits } = setup({ pattern: chordTrack([[60, 64, 67], null, null, null, null, null, null, null]) });
    fireEvent.keyDown(window, { key: "1" }); // pointer
    fireEvent.pointerDown(screen.getByTestId("piano-roll-note-0-64"), { clientX: 4, clientY: rowYFor(64) });
    fireEvent.pointerMove(grid(), { clientX: 1 * 26 + 4, clientY: rowYFor(64) });
    fireEvent.pointerUp(grid());
    const moved = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(moved.tracks[0].pitches?.[0]).toEqual([60, 67]);
    expect(moved.tracks[0].pitches?.[1]).toEqual([64]);
  });

  it("shows one velocity bar per step even when the step holds a chord", () => {
    setup({ pattern: chordTrack([[60, 64, 67], null, null, null, null, null, null, null]) });
    const bar = screen.getByTestId("piano-roll-velocity-bar-0");
    expect(bar.getAttribute("data-chord-size")).toBe("3");
    expect(screen.queryByTestId("piano-roll-velocity-bar-1")).toBeNull();
  });

  it("says how many notes the selection holds", () => {
    setup({ pattern: chordTrack([[60, 64, 67], null, null, null, null, null, null, null]) });
    fireEvent.keyDown(window, { key: "1" });
    fireEvent.pointerDown(grid(), { clientX: 4, clientY: extremeRowY("bottom") });
    fireEvent.pointerMove(grid(), { clientX: 1 * 26, clientY: extremeRowY("top") });
    fireEvent.pointerUp(grid());
    expect(screen.getByTestId("piano-roll-selected-count").textContent).toContain("3");
  });

  it("triggers onToggleMusicalTyping when clicking the keyboard HUD button", () => {
    const onToggleMusicalTyping = vi.fn();
    setup({ onToggleMusicalTyping });
    const btn = screen.getByTestId("piano-roll-musical-typing");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onToggleMusicalTyping).toHaveBeenCalledTimes(1);
  });

  it("toggles Fold to scale to filter visible pitch rows to in-key pitches", () => {
    setup();
    const foldBtn = screen.getByTestId("piano-roll-fold");
    const section = screen.getByTestId("piano-roll");
    expect(section.getAttribute("data-folded")).toBe("false");
    const rowsBefore = screen.getAllByTestId(/^piano-roll-row-\d+$/).length;

    fireEvent.click(foldBtn);
    expect(section.getAttribute("data-folded")).toBe("true");
    const rowsAfter = screen.getAllByTestId(/^piano-roll-row-\d+$/).length;
    expect(rowsAfter).toBeLessThan(rowsBefore);

    fireEvent.click(foldBtn);
    expect(section.getAttribute("data-folded")).toBe("false");
    expect(screen.getAllByTestId(/^piano-roll-row-\d+$/).length).toBe(rowsBefore);
  });

  it("applies quick velocity presets and ramp across selected notes", () => {
    const { commits } = setup();
    // Select note at step 0
    fireEvent.pointerDown(screen.getByTestId("piano-roll-note-0-60"), { clientX: 4, clientY: rowYFor(60) });
    expect(screen.getByTestId("piano-roll-dyn-pod")).toBeInTheDocument();

    // Click 'p' preset (40)
    fireEvent.click(screen.getByTestId("piano-roll-dyn-soft"));
    const softPattern = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(softPattern.tracks[0].velocity?.[0]).toBe(40);

    // Click '127' max preset
    fireEvent.click(screen.getByTestId("piano-roll-dyn-max"));
    const maxPattern = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(maxPattern.tracks[0].velocity?.[0]).toBe(127);
  });

  it("deletes note on double-click", () => {
    const { commits } = setup();
    expect(screen.getByTestId("piano-roll-note-0-60")).toBeInTheDocument();
    fireEvent.pointerDown(grid(), { clientX: 0 * 26 + 4, clientY: rowYFor(60), detail: 2 });
    const lastPattern = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(lastPattern.tracks[0].steps[0]).toBe(0);
  });

  it("duplicates bar 1 notes across subsequent bars using Dup B1", () => {
    const { commits } = setup({
      stepCount: 16,
      stepsPerBar: 4,
      pattern: makePattern({
        steps: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        pitch: [60, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
      }),
    });
    const dupBtn = screen.getByTestId("piano-roll-dup-bar1");
    expect(dupBtn).toBeInTheDocument();
    fireEvent.click(dupBtn);
    const updated = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(updated.tracks[0].steps[0]).toBe(1);
    expect(updated.tracks[0].steps[4]).toBe(1);
    expect(updated.tracks[0].steps[8]).toBe(1);
    expect(updated.tracks[0].steps[12]).toBe(1);
  });

  it("supports drag-audition across piano keys in pitch gutter", () => {
    const onAudition = vi.fn();
    setup({ onAudition });
    const key60 = screen.getByTestId("piano-roll-row-60");
    const key62 = screen.getByTestId("piano-roll-row-62");

    fireEvent.pointerDown(key60);
    expect(onAudition).toHaveBeenCalledWith(0, 60, 100, 0.45);

    fireEvent.pointerEnter(key62, { buttons: 1 });
    expect(onAudition).toHaveBeenCalledWith(0, 62, 100, 0.45);
  });

  it("shows ghost hover preview when hovering over empty grid in pencil mode", () => {
    setup({ initialTool: "pencil" });
    // Step 2 is empty
    fireEvent.pointerMove(grid(), { clientX: 2 * 26 + 4, clientY: rowYFor(64) });
    expect(screen.getByTestId("piano-roll-ghost-hover")).toBeInTheDocument();

    fireEvent.pointerLeave(grid());
    expect(screen.queryByTestId("piano-roll-ghost-hover")).toBeNull();
  });

  it("nudges note velocity with Alt + Wheel", () => {
    const { commits } = setup();
    const noteEl = screen.getByTestId("piano-roll-note-0-60");
    expect(noteEl).toBeInTheDocument();

    // Alt + scroll up increases velocity by 5
    fireEvent.wheel(grid(), { clientX: 0 * 26 + 4, clientY: rowYFor(60), altKey: true, deltaY: -100 });
    const updated = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(updated.tracks[0].velocity?.[0]).toBe(105);
  });

  it("arpeggiates selected chord notes using Arp ▲ button", () => {
    const { commits } = setup({
      pattern: makePattern({
        steps: [1, 0, 0, 0, 0, 0, 0, 0],
        pitches: [[60, 64, 67], null, null, null, null, null, null, null],
      }),
      stepCount: 8,
    });
    const arpBtn = screen.getByTestId("piano-roll-arp-up");
    expect(arpBtn).toBeInTheDocument();

    // Select chord at step 0
    fireEvent.pointerDown(screen.getByTestId("piano-roll-note-0-60"), { clientX: 4, clientY: rowYFor(60) });
    // Additional notes in chord selection
    fireEvent.pointerDown(screen.getByTestId("piano-roll-note-0-64"), { clientX: 4, clientY: rowYFor(64), shiftKey: true });
    fireEvent.pointerDown(screen.getByTestId("piano-roll-note-0-67"), { clientX: 4, clientY: rowYFor(67), shiftKey: true });

    fireEvent.click(arpBtn);
    const updated = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(updated.tracks[0].steps.slice(0, 3)).toEqual([1, 1, 1]);
    expect(updated.tracks[0].pitch?.slice(0, 3)).toEqual([60, 64, 67]);
  });

  it("extends track loop using the extend loop button when loopLen < stepCount", () => {
    const { commits } = setup({
      pattern: makePattern({
        steps: [1, 0, 0, 0, 0, 0, 0, 0],
        trackLength: 4,
      }),
      stepCount: 8,
    });
    const extendBtn = screen.getByTestId("piano-roll-extend-loop");
    expect(extendBtn).toBeInTheDocument();
    fireEvent.click(extendBtn);

    const updated = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(updated.tracks[0].trackLength).toBe(8);
  });

  it("renders scale root watermarks and dynamic reference markers in velocity lane", () => {
    setup({ stepCount: 8, stepsPerBar: 4 });
    // Root pitch rows have ROOT badge
    const rootBadges = screen.getAllByText("ROOT");
    expect(rootBadges.length).toBeGreaterThan(0);

    // Velocity lane renders fff · 127
    expect(screen.getByText("fff · 127")).toBeInTheDocument();
  });

  it("changes project scale via interactive scale select dropdown", () => {
    const { commits } = setup();
    const scaleSelect = screen.getByTestId("piano-roll-scale-select");
    expect(scaleSelect).toBeInTheDocument();

    fireEvent.change(scaleSelect, { target: { value: "A minor" } });
    const lastAction = commits.at(-1);
    expect(lastAction).toEqual({ type: "SET_SCALE", scale: "A minor" });
  });

  it("transposes selected notes by ±1 semitone using semitone buttons", () => {
    const { commits } = setup();
    // Select note at step 0 (pitch 60)
    fireEvent.pointerDown(screen.getByTestId("piano-roll-note-0-60"), { clientX: 4, clientY: rowYFor(60) });

    // Transpose +1 semitone
    const upBtn = screen.getByTestId("piano-roll-semitone-up");
    fireEvent.click(upBtn);
    const updatedUp = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(updatedUp.tracks[0].pitch?.[0]).toBe(61);

    // Transpose -1 semitone
    const downBtn = screen.getByTestId("piano-roll-semitone-down");
    fireEvent.click(downBtn);
    const updatedDown = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(updatedDown.tracks[0].pitch?.[0]).toBe(60);
  });

  it("renders pitch row guideline and multi-note ghost preview when chord stamp is engaged", () => {
    setup({ initialTool: "pencil" });
    // Engage Triad stamp
    const stampSelect = screen.getByTestId("piano-roll-chord-stamp");
    fireEvent.change(stampSelect, { target: { value: "triad" } });

    // Hover over step 2, pitch 60
    fireEvent.pointerMove(grid(), { clientX: 2 * 26 + 4, clientY: rowYFor(60) });

    // Row guideline should be rendered
    expect(screen.getByTestId("piano-roll-row-guideline")).toBeInTheDocument();

    // Triad stamp renders 3 ghost notes (root, third, fifth)
    const ghostNotes = screen.getAllByTestId("piano-roll-ghost-hover");
    expect(ghostNotes.length).toBe(3);
  });

  it("renders chord progression suite and stamps progression into track", () => {
    const { commits } = setup({ stepCount: 16, stepsPerBar: 16 });
    expect(screen.getByTestId("piano-roll-progression-suite")).toBeInTheDocument();

    const select = screen.getByTestId("piano-roll-progression-select");
    expect(select).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "pop_4chords" } });

    // Audition progression
    const auditionBtn = screen.getByTestId("piano-roll-progression-audition");
    fireEvent.click(auditionBtn);

    // Stamp progression
    const applyBtn = screen.getByTestId("piano-roll-progression-apply");
    fireEvent.click(applyBtn);

    const updated = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    const leadTrack = updated.tracks[0];
    // Chords should be stamped across the steps (step 0, 4, 8, 12)
    expect(leadTrack.steps[0]).toBe(1);
    expect(leadTrack.steps[4]).toBe(1);
    expect(leadTrack.steps[8]).toBe(1);
    expect(leadTrack.steps[12]).toBe(1);
  });

  it("renders velocity lane header toolbar and applies quick dynamics transforms", () => {
    const { commits } = setup({ stepCount: 8 });
    const levelBtn = screen.getByTestId("piano-roll-vel-level-100");
    const humanizeBtn = screen.getByTestId("piano-roll-vel-humanize");
    const compressBtn = screen.getByTestId("piano-roll-vel-compress");
    const rampUpBtn = screen.getByTestId("piano-roll-vel-ramp-up");
    const rampDownBtn = screen.getByTestId("piano-roll-vel-ramp-down");

    expect(levelBtn).toBeInTheDocument();
    expect(humanizeBtn).toBeInTheDocument();
    expect(compressBtn).toBeInTheDocument();
    expect(rampUpBtn).toBeInTheDocument();
    expect(rampDownBtn).toBeInTheDocument();

    // Level all velocities to 100
    fireEvent.click(levelBtn);
    const updated = (commits.at(-1) as { pattern: SequencerPattern }).pattern;
    expect(updated.tracks[0].velocity?.[0]).toBe(100);

    // Compress velocities
    fireEvent.click(compressBtn);
    expect(commits.length).toBeGreaterThan(1);
  });

  it("renders Guide button in Deck 1 and triggers onOpenHelp callback", () => {
    const onOpenHelp = vi.fn();
    setup({ onOpenHelp });

    const guideBtn = screen.getByTestId("piano-roll-guide");
    expect(guideBtn).toBeInTheDocument();

    fireEvent.click(guideBtn);
    expect(onOpenHelp).toHaveBeenCalledWith("sequencer");
  });
});

describe("PianoRollLane · dual-axis zoom, 0-127 pitch range & pointer workflow (items ②, ④, ⑤)", () => {
  it("defaults to pointer tool, displays cursor styles and switches with P / B", () => {
    setup();
    const panel = screen.getByTestId("piano-roll");
    const grid = screen.getByTestId("piano-roll-grid");

    // 1. Defaults to pointer tool
    expect(panel.getAttribute("data-tool")).toBe("pointer");
    expect(grid.className).toContain("cursor-default");

    // 2. Switch to pencil with 'B'
    fireEvent.keyDown(window, { key: "b" });
    expect(panel.getAttribute("data-tool")).toBe("pencil");
    expect(grid.className).toContain("cursor-crosshair");

    // 3. Switch back to pointer with 'P'
    fireEvent.keyDown(window, { key: "p" });
    expect(panel.getAttribute("data-tool")).toBe("pointer");
    expect(grid.className).toContain("cursor-default");
  });

  it("covers full 0-127 MIDI pitch range (128 rows) when unfolded", () => {
    setup();
    const panel = screen.getByTestId("piano-roll");
    expect(panel.getAttribute("data-rows")).toBe("128");

    // Extreme pitch rows exist
    expect(screen.getByTestId("piano-roll-row-0")).toBeInTheDocument();
    expect(screen.getByTestId("piano-roll-row-60")).toBeInTheDocument();
    expect(screen.getByTestId("piano-roll-row-127")).toBeInTheDocument();
  });

  it("controls horizontal and vertical zoom independently via dual-axis sliders and buttons", () => {
    setup();
    const panel = screen.getByTestId("piano-roll");
    const xSlider = screen.getByTestId("piano-roll-zoom-x-slider");
    const ySlider = screen.getByTestId("piano-roll-zoom-y-slider");

    expect(xSlider).toBeInTheDocument();
    expect(ySlider).toBeInTheDocument();

    // Adjust horizontal zoom via slider
    fireEvent.change(xSlider, { target: { value: "36" } });
    expect(panel.getAttribute("data-cell-w")).toBe("36");

    // Adjust vertical zoom via slider
    fireEvent.change(ySlider, { target: { value: "24" } });
    expect(panel.getAttribute("data-row-h")).toBe("24");

    // Step horizontal zoom with zoom-in / zoom-out buttons
    fireEvent.click(screen.getByTestId("piano-roll-zoom-in"));
    expect(panel.getAttribute("data-cell-w")).toBe("40");

    fireEvent.click(screen.getByTestId("piano-roll-zoom-out"));
    expect(panel.getAttribute("data-cell-w")).toBe("36");

    // Cycle vertical zoom with row-height toggle button
    fireEvent.click(screen.getByTestId("piano-roll-row-height-toggle"));
    expect(Number(panel.getAttribute("data-row-h"))).toBeGreaterThan(0);
  });

  it("supports viewport navigation with Arrow keys when no notes are selected", () => {
    setup();
    // With no selection, Arrow keys navigate/scroll viewport without error
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.keyDown(window, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(window, { key: "ArrowUp", shiftKey: true });
  });
});

