import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrackRows } from "../features/arrangement/TrackRows";
import type { Song } from "../types/song";

/**
 * The view over `trackRows` — asserted on what it makes visible, not on how it looks.
 *
 * The component is thin by design: the arithmetic lives in `songEdit`, and its own tests hold the row model. So this test holds the three things a
 * view is responsible for: one row per lane, one cell per section, and the **override marker** — the capability that has been in the model and
 * invisible in the UI since it landed.
 */
const clip = (tracks: Array<{ id: string; name: string }>) => ({
  genre_id: "custom",
  bpm: 120,
  scale: "C major",
  totalSteps: 16,
  tracks: tracks.map(({ id, name }) => ({
    track_id: id,
    name,
    instrument: "synth",
    steps: Array.from({ length: 16 }, (_, index) => (index === 0 ? 1 : 0)),
    velocity: new Array(16).fill(100),
  })),
});

const song = (): Song =>
  ({
    id: "s",
    name: "rows",
    genreId: "custom",
    bpm: 120,
    clips: { A: clip([{ id: "kick", name: "Kick" }, { id: "lead", name: "Lead" }]), B: clip([{ id: "kick", name: "Kick" }, { id: "lead", name: "Lead" }]) },
    sections: [
      { id: "s1", slot: "A", bars: 2, label: "verse" },
      { id: "s2", slot: "A", bars: 2, label: "chorus", slots: { lead: "B" }, mute: ["kick"] },
    ],
  }) as unknown as Song;

describe("TrackRows", () => {
  it("draws one row per lane and one cell per section", () => {
    render(<TrackRows song={song()} />);
    expect(screen.getAllByTestId("track-row")).toHaveLength(2);
    expect(screen.getAllByTestId("stage-header")).toHaveLength(2);
    for (const row of screen.getAllByTestId("track-row")) {
      expect(row.querySelectorAll('[data-testid="track-cell"]')).toHaveLength(2);
    }
  });

  it("marks the lane that plays its own clip, which nothing on screen has ever shown", () => {
    render(<TrackRows song={song()} />);
    const lead = screen.getAllByTestId("track-row").find((row) => row.getAttribute("data-track") === "lead")!;
    const cells = lead.querySelectorAll('[data-testid="track-cell"]');
    expect(cells[0]!.getAttribute("data-slot")).toBe("A");
    expect(cells[0]!.getAttribute("data-override")).toBe("false");
    expect(cells[1]!.getAttribute("data-slot")).toBe("B");
    expect(cells[1]!.getAttribute("data-override")).toBe("true");
  });

  it("shows a muted lane as muted, and says so in the data rather than only in the styling", () => {
    render(<TrackRows song={song()} />);
    const kick = screen.getAllByTestId("track-row").find((row) => row.getAttribute("data-track") === "kick")!;
    const cells = kick.querySelectorAll('[data-testid="track-cell"]');
    expect(cells[0]!.getAttribute("data-muted")).toBe("false");
    expect(cells[1]!.getAttribute("data-muted")).toBe("true");
  });

  it("says so plainly when there is nothing to lay out, instead of drawing an empty grid", () => {
    render(<TrackRows song={{ ...song(), sections: [] } as unknown as Song} />);
    expect(screen.getByTestId("track-rows").getAttribute("data-empty")).toBe("true");
  });
});

describe("TrackRows with an edit host", () => {
  it("offers a control per cell only when the host can accept one, and reports the intent rather than editing", async () => {
    const seen: Array<[string, string, string | null]> = [];
    render(<TrackRows song={song()} onSetLaneSlot={(sectionId, trackId, slot) => seen.push([sectionId, trackId, slot])} />);
    const selects = screen.getAllByTestId("track-cell-select");
    // One per cell: two lanes, two sections.
    expect(selects).toHaveLength(4);
    (selects[1] as HTMLSelectElement).value = "C";
    selects[1]!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(seen).toEqual([["s2", "kick", "C"]]); // row-major: index 1 is the first row's second cell
  });

  it("stays read-only without a host, which is what keeps its other tests meaning what they meant", () => {
    render(<TrackRows song={song()} />);
    expect(screen.queryAllByTestId("track-cell-select")).toHaveLength(0);
  });
});
