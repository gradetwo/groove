/**
 * ⭐ **The two halves at the view's own seam**: a note written in the roll is heard through the player the view was handed, and `Space`/`Delete` act on the transport and the note while the roll has the focus.
 *
 * The roll-level criteria (`pianoRollAudition.test.tsx`) judge what the roll *reports*; these judge that the view is on the other end. Both are needed, because "the roll calls `onAudition`" and "the engine is asked to sound the pitch" are two different claims and only the second one is the owner's complaint.
 *
 * **Measured before the wiring existed, on this exact harness**: with a sampler track selected and the roll on screen, writing a note called `audition` **zero** times, `Space` on a grid cell reached nobody (`play` zero calls), and `Delete` left the note in place.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { LanguageProvider } from "../i18n/LanguageContext";

const noCapture = () => new Promise<never>(() => undefined);

/** The engine seam as the view uses it, with each call observable. `transport` is absent, which is the "no live transport to follow" branch the view already handles. */
const playerStub = () => ({
  play: vi.fn(async () => ({ planned: 0 })),
  pause: vi.fn(() => 0),
  audition: vi.fn(async (_request: { assetId: string; midi: number; trackId?: string; gainDb?: number }) => ({ ok: true as const, ratio: 1, samplePath: "piano.wav" })),
  releaseNote: vi.fn((_request: { trackId?: string; midi: number }) => 1),
  stop: vi.fn(() => 0),
});

/** A project with a sampler track selected and the roll open — the state every criterion below is about. */
const openRoll = (player: ReturnType<typeof playerStub>) => {
  localStorage.setItem("groove_language", "en");
  render(
    <LanguageProvider>
      <ArrangementViewV2 songId="s" capture={noCapture} player={player as never} />
    </LanguageProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  fireEvent.click(screen.getAllByRole("button", { name: "+ Sampler" })[0]!);
  // The editor defaults to the roll, and a sampler track is the one with an instrument behind it.
  expect(screen.getByTestId("piano-roll-v2")).toBeDefined();
};

describe("⭐ a note written in the roll is sounded by the view", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("asks the player to audition the pitch that was written, one preview at a time", () => {
    const player = playerStub();
    openRoll(player);
    for (const step of [2, 6]) {
      const cell = screen.getByTestId(`roll-cell-62-${step}`);
      fireEvent.pointerDown(cell);
      fireEvent.pointerUp(cell);
    }

    expect(player.audition).toHaveBeenCalledTimes(2);
    const requests = player.audition.mock.calls.map((call) => call[0] as { midi: number; assetId: string; trackId: string });
    // The pitch is the one the cell was on, and the instrument is the selected track's own — not a default and not the previous track's.
    expect(requests.map((request) => request.midi)).toEqual([62, 62]);
    expect(requests[0]!.assetId).toBeTruthy();
    expect(requests[0]!.trackId).toBeTruthy();
    // And one preview at a time: the first note is released as the second is sounded rather than left ringing under it.
    expect(player.releaseNote).toHaveBeenCalledTimes(1);
  });

  it("starts the transport on Space and removes the note it wrote on Delete", async () => {
    const player = playerStub();
    openRoll(player);
    // The cell is where the pointer was, so it is where the focus is.
    const cell = screen.getByTestId("roll-cell-60-0");
    fireEvent.keyDown(cell, { key: " ", code: "Space" });
    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));

    fireEvent.pointerDown(cell);
    fireEvent.pointerUp(cell);
    expect(screen.getByTestId("roll-note-60-0")).toBeDefined();

    fireEvent.keyDown(cell, { key: "Delete" });
    // The edit went through the arrangement's own command path, so the note is gone from the model the roll is a reading of.
    expect(screen.queryByTestId("roll-note-60-0")).toBeNull();
  });

  it("⭐ writes the note's velocity onto the note, so the value is visible rather than only settable", () => {
    const player = playerStub();
    openRoll(player);
    const cell = screen.getByTestId("roll-cell-60-0");
    fireEvent.pointerDown(cell);
    fireEvent.pointerUp(cell);
    const note = screen.getByTestId("roll-note-60-0");
    /**
     * ⭐ The measurement this pins: the note element had `data-length` and **nothing about velocity**, so the value a
     * person had just chosen for the note they wrote was not on screen anywhere. The slider's own readout is the value
     * the note is given, so the two must agree; deleting `data-velocity` makes both of these comparisons fail.
     */
    const slider = screen.getByTestId("roll-velocity-value").textContent ?? "";
    expect(note.getAttribute("data-velocity")).toBe(slider);
    expect(Number(note.getAttribute("data-velocity"))).toBeGreaterThan(0);
  });

  it("⭐ does not take Space or Delete from a text field inside the roll", async () => {
    /**
     * This is the failure mode a second *global* listener produces, and it is checked here rather than argued: the length field is inside the panel, so the panel's handler sees the keystroke bubble out of it.
     */
    const player = playerStub();
    openRoll(player);
    const cell = screen.getByTestId("roll-cell-60-0");
    fireEvent.pointerDown(cell);
    fireEvent.pointerUp(cell);
    expect(screen.getByTestId("roll-note-60-0")).toBeDefined();

    const length = screen.getByLabelText(/长度|Length/);
    fireEvent.keyDown(length, { key: " ", code: "Space" });
    fireEvent.keyDown(length, { key: "Delete" });

    expect(player.play).not.toHaveBeenCalled();
    // The note the field's Delete must not reach is still there.
    expect(screen.getByTestId("roll-note-60-0")).toBeDefined();
  });
});
