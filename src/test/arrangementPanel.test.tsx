import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ARRANGEMENT_BAR_WIDTH,
  ARRANGEMENT_MIN_TARGET,
  ARRANGEMENT_MOVE_BAND_HEIGHT,
  ARRANGEMENT_REGION_HEIGHT,
  ARRANGEMENT_RESIZE_BAND_HEIGHT,
  ArrangementPanel,
  type ArrangementEdit,
} from "../components/arrangement/ArrangementPanel";
import { LanguageProvider } from "../i18n/LanguageContext";
import type { ClipSlot, Song, SongSection } from "../types/song";
import type { SequencerPattern } from "../types/genre";

/**
 * B3 — the arrangement view's DOM.
 *
 * The arithmetic is pinned in `songEdit.test.ts`; what is left for a browser-shaped test is that the panel *uses*
 * it: one region per playable section at the right bar, the empty clip is not drawn but is reported, a drag ends in
 * one coalescable edit, and every target a finger has to hit is at least 44 px. The last one is the plan's contract
 * with the iPad, so it is measured here as well as in `probe:arrangement`.
 */
const clip = (steps: number): SequencerPattern =>
  ({
    genre_id: "chicago-house",
    bpm: 124,
    swing: 0,
    scale: "C minor",
    totalSteps: steps,
    tracks: [
      {
        track_id: "kick",
        name: "Kick",
        instrument: "drum",
        steps: new Array(steps).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)),
        velocity: new Array(steps).fill(100),
        volume: 0.8,
        pan: 0,
        sendA: 0,
        sendB: 0,
      },
    ],
  }) as unknown as SequencerPattern;

const song = (sections: SongSection[], clips: Partial<Record<ClipSlot, SequencerPattern>>): Song => ({
  id: "song-1",
  name: "Test",
  genreId: "chicago-house",
  bpm: 124,
  swing: 0,
  resolution: "1/16",
  clips,
  sections,
  loopRange: null,
});

const threeBars = song(
  [
    { id: "s1", slot: "A", bars: 1, label: "intro" },
    { id: "s2", slot: "A", bars: 1 },
    { id: "s3", slot: "A", bars: 1 },
  ],
  { A: clip(16) }
);

describe("B3 · the arrangement panel", () => {
  const onSelect = vi.fn();
  const onChange = vi.fn<(edit: ArrangementEdit) => void>();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderPanel = (overrides: Partial<React.ComponentProps<typeof ArrangementPanel>> = {}) =>
    render(
      <LanguageProvider>
        <ArrangementPanel
          song={threeBars}
          selectedId={null}
          onSelect={onSelect}
          onChange={onChange}
          onClose={onClose}
          {...overrides}
        />
      </LanguageProvider>
    );

  it("draws one region per playable section, at the bar the renderer plays it", () => {
    renderPanel({ song: song([{ id: "s1", slot: "A", bars: 2 }, { id: "s2", slot: "A", bars: 1 }], { A: clip(16) }) });
    const first = screen.getByTestId("arrangement-region-s1");
    const second = screen.getByTestId("arrangement-region-s2");
    expect(first.dataset.startBar).toBe("0");
    expect(first.dataset.bars).toBe("2");
    // The second region starts two bars along — the same number the ruler shows and the renderer walks.
    expect(second.dataset.startBar).toBe("2");
    expect(first.style.width).toBe(`${2 * ARRANGEMENT_BAR_WIDTH}px`);
    expect(second.style.left).toBe(`${2 * ARRANGEMENT_BAR_WIDTH}px`);
  });

  it("does not draw a region for a section whose clip is empty, and says why", () => {
    /**
     * `resolveTimeline` skips it, so drawing it would put a region on the ruler that never plays and shift the
     * regions after it by bars that do not exist. The panel shows the renderer's own words instead.
     */
    renderPanel({
      song: song(
        [
          { id: "s1", slot: "A", bars: 1 },
          { id: "s2", slot: "C", bars: 4 },
          { id: "s3", slot: "A", bars: 1 },
        ],
        { A: clip(16) }
      ),
    });
    expect(screen.queryByTestId("arrangement-region-s2")).toBeNull();
    expect(screen.getByTestId("arrangement-region-s3").dataset.startBar).toBe("1");
    expect(screen.getByTestId("arrangement-problems").textContent).toContain("C");
  });

  it("says so when there is nothing to arrange, instead of showing an empty ruler", () => {
    renderPanel({ song: song([{ id: "s1", slot: "C", bars: 1 }], { A: clip(16) }) });
    expect(screen.getByTestId("arrangement-empty")).toBeTruthy();
    expect(screen.queryByTestId("arrangement-lane")).toBeNull();
  });

  it("selects the region a press lands on", () => {
    renderPanel();
    fireEvent.pointerDown(screen.getByTestId("arrangement-region-s2"), { clientX: 60, pointerId: 1 });
    expect(onSelect).toHaveBeenCalledWith("s2");
  });

  it("moves the region when the body is dragged by a bar", () => {
    renderPanel();
    const region = screen.getByTestId("arrangement-region-s1");
    fireEvent.pointerDown(region, { clientX: 10, pointerId: 1 });
    fireEvent.pointerMove(region, { clientX: 10 + ARRANGEMENT_BAR_WIDTH, pointerId: 1 });
    fireEvent.pointerUp(region, { clientX: 10 + ARRANGEMENT_BAR_WIDTH, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const edit = onChange.mock.calls[0][0];
    expect(edit.sections.map((section) => section.id)).toEqual(["s2", "s1", "s3"]);
    // A drag is continuous: the host coalesces it into one undo entry.
    expect(edit.continuous).toBe(true);
    expect(edit.gesture).toBe("arrangement:move:s1");
  });

  it("repeats the region when its bottom band is dragged, and keeps the bar width honest", () => {
    renderPanel();
    const handle = screen.getByTestId("arrangement-resize-s1");
    fireEvent.pointerDown(handle, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 2 * ARRANGEMENT_BAR_WIDTH, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 2 * ARRANGEMENT_BAR_WIDTH, pointerId: 1 });
    const edit = onChange.mock.calls[0][0];
    expect(edit.sections[0].bars).toBe(3);
    expect(edit.gesture).toBe("arrangement:resize:s1");
  });

  it("ignores a drag that does not cross a bar", () => {
    // The threshold is half a bar (rounding to the nearest bar column), so a nudge under it is not an edit — which
    // is what keeps a tap from reordering the song.
    renderPanel();
    const region = screen.getByTestId("arrangement-region-s1");
    const nudge = ARRANGEMENT_BAR_WIDTH / 2 - 2;
    fireEvent.pointerDown(region, { clientX: 10, pointerId: 1 });
    fireEvent.pointerMove(region, { clientX: 10 + nudge, pointerId: 1 });
    fireEvent.pointerUp(region, { clientX: 10 + nudge, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("runs the arrow keys on the selected region", () => {
    renderPanel({ selectedId: "s2" });
    const region = screen.getByTestId("arrangement-region-s2");
    fireEvent.keyDown(region, { key: "ArrowLeft" });
    expect(onChange.mock.calls[0][0].sections.map((section) => section.id)).toEqual(["s2", "s1", "s3"]);
    // Shift turns the same arrows into a length change, which is the gesture a fill needs.
    fireEvent.keyDown(region, { key: "ArrowRight", shiftKey: true });
    expect(onChange.mock.calls[1][0].sections[1].bars).toBe(2);
    // …and a key press is a discrete edit, so two quick presses stay two undo entries.
    expect(onChange.mock.calls[1][0].continuous).toBe(false);
  });

  it("deletes with Delete and duplicates with Ctrl/Cmd+D", () => {
    renderPanel({ selectedId: "s1" });
    const region = screen.getByTestId("arrangement-region-s1");
    fireEvent.keyDown(region, { key: "Delete" });
    expect(onChange.mock.calls[0][0].sections.map((section) => section.id)).toEqual(["s2", "s3"]);
    fireEvent.keyDown(region, { key: "d", metaKey: true });
    expect(onChange.mock.calls[1][0].sections).toHaveLength(4);
  });

  it("moves the selection when a section is duplicated, so the copy is the thing being edited", () => {
    renderPanel({ selectedId: "s1" });
    fireEvent.click(screen.getByTestId("arrangement-duplicate"));
    const copy = onChange.mock.calls[0][0].sections[1].id;
    expect(copy).not.toBe("s1");
    expect(onSelect).toHaveBeenCalledWith(copy);
  });

  it("clears the selection on Escape first, and only closes on the second press", () => {
    const { unmount } = renderPanel({ selectedId: "s1" });
    fireEvent.keyDown(screen.getByTestId("arrangement-panel"), { key: "Escape" });
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(onClose).not.toHaveBeenCalled();
    unmount();
    renderPanel({ selectedId: null });
    fireEvent.keyDown(screen.getByTestId("arrangement-panel"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps every finger target at or above the 44 px contract", () => {
    /**
     * The plan's iPad requirement, as a measurement. The constants are the promise the probe repeats against the
     * built app; the styles below are the evidence that the component actually uses them rather than merely
     * declaring them.
     */
    expect(ARRANGEMENT_MIN_TARGET).toBeGreaterThanOrEqual(44);
    expect(ARRANGEMENT_BAR_WIDTH).toBeGreaterThanOrEqual(ARRANGEMENT_MIN_TARGET);
    expect(ARRANGEMENT_MOVE_BAND_HEIGHT).toBeGreaterThanOrEqual(ARRANGEMENT_MIN_TARGET);
    expect(ARRANGEMENT_RESIZE_BAND_HEIGHT).toBeGreaterThanOrEqual(ARRANGEMENT_MIN_TARGET);
    expect(ARRANGEMENT_REGION_HEIGHT).toBe(ARRANGEMENT_MOVE_BAND_HEIGHT + ARRANGEMENT_RESIZE_BAND_HEIGHT);

    renderPanel({ selectedId: "s1" });
    // Both bands are stacked across the whole region, so a one-bar region (48 px) is still a target for each
    // gesture in both dimensions — which a right-edge handle could not be.
    expect(screen.getByTestId("arrangement-resize-s1").style.height).toBe(`${ARRANGEMENT_RESIZE_BAND_HEIGHT}px`);
    expect(screen.getByTestId("arrangement-move-s1").style.height).toBe(`${ARRANGEMENT_MOVE_BAND_HEIGHT}px`);
    expect(screen.getByTestId("arrangement-region-s1").style.height).toBe(`${ARRANGEMENT_REGION_HEIGHT}px`);
    expect(screen.getByTestId("arrangement-region-s1").style.width).toBe(`${ARRANGEMENT_BAR_WIDTH}px`);
    expect(screen.getByTestId("arrangement-bar-0").style.width).toBe(`${ARRANGEMENT_BAR_WIDTH}px`);
    for (const id of ["arrangement-close", "arrangement-grow", "arrangement-shrink", "arrangement-duplicate", "arrangement-remove"]) {
      const el = screen.getByTestId(id);
      expect(el.style.minHeight, id).toBe(`${ARRANGEMENT_MIN_TARGET}px`);
      expect(el.style.minWidth, id).toBe(`${ARRANGEMENT_MIN_TARGET}px`);
    }
  });

  it("marks the selected region for assistive tech", () => {
    renderPanel({ selectedId: "s2" });
    expect(screen.getByTestId("arrangement-region-s2").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("arrangement-region-s1").getAttribute("aria-pressed")).toBe("false");
  });

  it("takes focus when it opens, so Escape works before anything is clicked", () => {
    renderPanel();
    expect(document.activeElement).toBe(screen.getByTestId("arrangement-panel"));
  });

  it("offers the B5 forms only when the host can generate one", () => {
    // A caller with no clip to generate from renders no generator, rather than three buttons that do nothing.
    renderPanel();
    expect(screen.queryByTestId("arrangement-form-club")).toBeNull();
  });

  it("hands the chosen form to the host, with the bar count it will produce", () => {
    const onGenerate = vi.fn();
    renderPanel({ onGenerate });
    const club = screen.getByTestId("arrangement-form-club");
    // The bar count is computed by the form table, not written in prose — see `ARRANGEMENT_FORMS`.
    expect(club.dataset.bars).toBe("40");
    fireEvent.click(club);
    expect(onGenerate).toHaveBeenCalledWith("club");
    fireEvent.click(screen.getByTestId("arrangement-form-loop"));
    expect(onGenerate).toHaveBeenCalledWith("loop");
  });

  it("keeps the generator's buttons at the 44 px contract too", () => {
    renderPanel({ onGenerate: vi.fn() });
    for (const form of ["loop", "club", "song"]) {
      const button = screen.getByTestId(`arrangement-form-${form}`);
      expect(button.style.minHeight, form).toBe(`${ARRANGEMENT_MIN_TARGET}px`);
      expect(button.style.minWidth, form).toBe(`${ARRANGEMENT_MIN_TARGET}px`);
    }
  });

  it("shows what a section does — a build and a fill are visible on the region", () => {
    /**
     * B5's whole point is that these stopped being invisible pattern hacks. A generated arrangement whose fill is
     * not on screen is one the user has to take on trust.
     */
    renderPanel({
      song: song(
        [
          { id: "s1", slot: "A", bars: 4, label: "build", overrides: { velocityRamp: [0.6, 1] } },
          {
            id: "s2",
            slot: "A",
            bars: 2,
            label: "break",
            overrides: { fill: { tracks: ["snare"], steps: [12, 13, 14, 15], velocity: 112 } },
          },
        ],
        { A: clip(16) }
      ),
    });
    expect(screen.getByTestId("arrangement-build-s1").textContent).toBe("↗");
    // The dictionary's own two renderings, so the assertion does not depend on which language the provider picked.
    expect(["fill", "加花"]).toContain(screen.getByTestId("arrangement-fill-s2").textContent);
    expect(screen.queryByTestId("arrangement-fill-s1")).toBeNull();
    expect(screen.queryByTestId("arrangement-build-s2")).toBeNull();
  });
});
