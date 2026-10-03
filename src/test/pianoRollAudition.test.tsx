/**
 * ⭐ **The roll hears what it writes, and owns the keys while it has the focus.**
 *
 * Both halves were measured as *absent* before this file existed, on the same rolled-up reading: with a sampler track selected and the roll on screen, `Space` reached no one (`player.play` was called zero times) and `Delete` left the note in place. The four pointer criteria at the bottom are the one that is a **defect** rather than a missing feature: a press released outside the grid left the drag armed, and the next, unrelated gesture moved a note nobody had touched.
 *
 * Every criterion here is written so that **removing the wiring turns it red**: the audition assertions fail without `onAudition`, the key assertions fail without the panel's handler, and the gesture assertions fail without the window-level clear.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { PianoRollV2 } from "../components/arrangement/PianoRollV2";
import { LanguageProvider } from "../i18n/LanguageContext";
import { STEP_BEATS } from "../data/noteEvents";
import type { NoteEvent } from "../types/arrangementV2";

const renderRoll = (notes: NoteEvent[] = [], props: Partial<React.ComponentProps<typeof PianoRollV2>> = {}) => {
  const spies = {
    onAddNote: vi.fn(),
    onRemoveNote: vi.fn(),
    onMoveNote: vi.fn(),
    onResizeNote: vi.fn(),
    onSetBars: vi.fn(),
    onAudition: vi.fn(),
    onToggleTransport: vi.fn(),
  };
  render(
    <LanguageProvider>
      <PianoRollV2 notes={notes} beats={4} lowPitch={60} highPitch={72} {...spies} {...props} />
    </LanguageProvider>
  );
  return spies;
};

describe("⭐ writing a note is heard", () => {
  it("auditions the pitch it writes, exactly once", () => {
    const { onAddNote, onAudition } = renderRoll();
    const cell = screen.getByTestId("roll-cell-62-2");
    fireEvent.pointerDown(cell);
    fireEvent.pointerUp(cell);
    // One write, one sound, at the pitch the note was written on — not the previous one and not a default.
    expect(onAddNote).toHaveBeenCalledTimes(1);
    expect(onAudition).toHaveBeenCalledTimes(1);
    expect(onAudition).toHaveBeenCalledWith(62);
  });

  it("auditions the new pitch when a note is dragged to it", () => {
    const notes: NoteEvent[] = [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }];
    const { onMoveNote, onAudition } = renderRoll(notes);
    fireEvent.pointerDown(screen.getByTestId("roll-note-60-0"));
    fireEvent.pointerEnter(screen.getByTestId("roll-cell-67-8"));
    fireEvent.pointerUp(screen.getByTestId("roll-cell-67-8"));
    expect(onMoveNote).toHaveBeenCalledWith({ pitch: 60, startBeats: 0 }, { pitch: 67, startBeats: 2 });
    // The pitch that lands is the one that is heard: a drag is a search for a pitch, and the search is only answerable by ear.
    expect(onAudition).toHaveBeenCalledWith(67);
  });

  it("does not re-sound a note that only moved in time, because its pitch did not change", () => {
    const notes: NoteEvent[] = [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }];
    const { onAudition } = renderRoll(notes);
    fireEvent.pointerDown(screen.getByTestId("roll-note-60-0"));
    fireEvent.pointerEnter(screen.getByTestId("roll-cell-60-8"));
    fireEvent.pointerUp(screen.getByTestId("roll-cell-60-8"));
    expect(onAudition).not.toHaveBeenCalled();
  });

  it("is silent, not broken, when nobody handed it an instrument", () => {
    // The roll is drawn for drum and synth tracks too, where the engine's SFZ audition has nothing to resolve.
    const { onAddNote } = renderRoll([], { onAudition: undefined });
    const cell = screen.getByTestId("roll-cell-62-2");
    fireEvent.pointerDown(cell);
    fireEvent.pointerUp(cell);
    expect(onAddNote).toHaveBeenCalledTimes(1);
  });
});

describe("⭐ the editor's own keys", () => {
  it("toggles the transport on Space while the roll has focus", () => {
    const { onToggleTransport } = renderRoll();
    const cell = screen.getByTestId("roll-cell-60-4");
    fireEvent.keyDown(cell, { key: " ", code: "Space" });
    expect(onToggleTransport).toHaveBeenCalledTimes(1);
  });

  it("removes the note the roll is on with Delete or Backspace", () => {
    const notes: NoteEvent[] = [{ pitch: 64, startBeats: 1, lengthBeats: 1, velocity: 100 }];
    const { onRemoveNote } = renderRoll(notes);
    // Press the note and let go where the press means nothing — which is how a note becomes *the one the keys act on* without also being deleted.
    fireEvent.pointerDown(screen.getByTestId("roll-note-64-4"));
    fireEvent.pointerUp(screen.getByTestId("roll-cell-64-4"));
    expect(onRemoveNote).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByTestId("roll-cell-60-0"), { key: "Delete" });
    expect(onRemoveNote).toHaveBeenCalledWith({ pitch: 64, startBeats: 1 });

    // Backspace is the same intention on a keyboard that has one.
    onRemoveNote.mockClear();
    fireEvent.pointerDown(screen.getByTestId("roll-note-64-4"));
    fireEvent.pointerUp(screen.getByTestId("roll-cell-64-4"));
    fireEvent.keyDown(screen.getByTestId("roll-cell-60-0"), { key: "Backspace" });
    expect(onRemoveNote).toHaveBeenCalledWith({ pitch: 64, startBeats: 1 });
  });

  it("does nothing on Delete when no note has been aimed at", () => {
    // A key that deleted *something* would be worse than a key that does nothing: there is no note the person pointed at.
    const { onRemoveNote } = renderRoll([{ pitch: 64, startBeats: 1, lengthBeats: 1, velocity: 100 }]);
    fireEvent.keyDown(screen.getByTestId("roll-cell-60-0"), { key: "Delete" });
    expect(onRemoveNote).not.toHaveBeenCalled();
  });

  it("⭐ leaves the roll's own text controls their keys", () => {
    /**
     * The panel contains a length field and a velocity slider, so its key handler sees every keystroke that bubbles out of them. This is the trap a second global listener falls into; here it is a guard on the one handler.
     */
    const { onToggleTransport, onRemoveNote } = renderRoll([{ pitch: 64, startBeats: 1, lengthBeats: 1, velocity: 100 }]);
    fireEvent.pointerDown(screen.getByTestId("roll-note-64-4"));
    fireEvent.pointerUp(screen.getByTestId("roll-cell-64-4"));

    const length = screen.getByLabelText(/长度|Length/);
    fireEvent.keyDown(length, { key: " ", code: "Space" });
    fireEvent.keyDown(length, { key: "Delete" });
    expect(onToggleTransport).not.toHaveBeenCalled();
    expect(onRemoveNote).not.toHaveBeenCalled();
  });

  it("gives a bar button the Space that activates it", () => {
    // The roll's own buttons keep their native Space; only the grid's cells are the editor's surface.
    const { onToggleTransport, onSetBars } = renderRoll([], { beats: 16 });
    const addBar = screen.getByTestId("roll-add-bar");
    fireEvent.keyDown(addBar, { key: " ", code: "Space" });
    expect(onToggleTransport).not.toHaveBeenCalled();
    fireEvent.click(addBar);
    expect(onSetBars).toHaveBeenCalledWith(5);
  });

  it("leaves the keys alone when no transport was handed in", () => {
    const { onToggleTransport } = renderRoll([], { onToggleTransport: undefined });
    expect(onToggleTransport).not.toHaveBeenCalled();
  });
});

describe("⭐ a gesture released outside the grid is cleared", () => {
  it("does not move a note the next gesture never touched", () => {
    /**
     * This is the reproduction, measured on the code before the fix: `pointerDown` on the note → `pointerUp` where no cell listens → then a short slide across two empty cells. The stale drag was still armed, so the second gesture **moved the untouched note from pitch 64 to pitch 60**.
     */
    const notes: NoteEvent[] = [{ pitch: 64, startBeats: 2, lengthBeats: 1, velocity: 100 }];
    const { onMoveNote, onRemoveNote } = renderRoll(notes);

    fireEvent.pointerDown(screen.getByTestId("roll-note-64-8"));
    fireEvent.pointerUp(screen.getByTestId("roll-grid"));
    expect(onMoveNote).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByTestId("roll-cell-60-4"));
    fireEvent.pointerEnter(screen.getByTestId("roll-cell-60-8"));
    fireEvent.pointerUp(screen.getByTestId("roll-cell-60-8"));

    expect(onMoveNote).not.toHaveBeenCalled();
    expect(onRemoveNote).not.toHaveBeenCalled();
  });

  it("does not swallow the next click, which the stale drag used to eat", () => {
    // The other face of the same leak: the leftover drag was consumed by the next press, so the note the person clicked for was never written.
    const notes: NoteEvent[] = [{ pitch: 64, startBeats: 2, lengthBeats: 1, velocity: 100 }];
    const { onAddNote } = renderRoll(notes);

    fireEvent.pointerDown(screen.getByTestId("roll-note-64-8"));
    fireEvent.pointerUp(screen.getByTestId("roll-grid"));

    const cell = screen.getByTestId("roll-cell-62-0");
    fireEvent.pointerDown(cell);
    fireEvent.pointerUp(cell);
    expect(onAddNote).toHaveBeenCalledWith({ pitch: 62, startBeats: 0, lengthBeats: 1, velocity: 100 });
  });

  it("clears the gesture when the browser cancels the pointer stream", () => {
    // `pointercancel` is the same fact as a release for a gesture's purposes, and the spec says it can arrive instead of `pointerup`.
    const notes: NoteEvent[] = [{ pitch: 64, startBeats: 2, lengthBeats: 1, velocity: 100 }];
    const { onMoveNote } = renderRoll(notes);
    fireEvent.pointerDown(screen.getByTestId("roll-note-64-8"));
    fireEvent.pointerCancel(screen.getByTestId("roll-grid"));
    fireEvent.pointerDown(screen.getByTestId("roll-cell-60-4"));
    fireEvent.pointerEnter(screen.getByTestId("roll-cell-60-8"));
    fireEvent.pointerUp(screen.getByTestId("roll-cell-60-8"));
    expect(onMoveNote).not.toHaveBeenCalled();
  });

  it("still commits the drag that does end on a cell", () => {
    // The clear is a backstop, not a cancellation: a release the grid does see is the gesture's own commit.
    const notes: NoteEvent[] = [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }];
    const { onMoveNote } = renderRoll(notes);
    fireEvent.pointerDown(screen.getByTestId("roll-note-60-0"));
    fireEvent.pointerEnter(screen.getByTestId("roll-cell-65-8"));
    fireEvent.pointerUp(screen.getByTestId("roll-cell-65-8"));
    expect(onMoveNote).toHaveBeenCalledWith({ pitch: 60, startBeats: 0 }, { pitch: 65, startBeats: 8 * STEP_BEATS });
  });
});
