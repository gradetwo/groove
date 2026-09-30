/**
 * The piano roll: writing notes where they sit in time and pitch.
 *
 * The keyboard beside it plays; this writes. Each criterion is a thing the owner named — "我能虚拟 midi 键盘输入和钢琴卷帘输入" — checked as a behaviour rather than as a grid of divs.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { PianoRollV2, noteName } from "../components/arrangement/PianoRollV2";
import { LanguageProvider } from "../i18n/LanguageContext";
import { STEP_BEATS } from "../data/noteEvents";

const renderRoll = (props: Partial<React.ComponentProps<typeof PianoRollV2>> = {}) => {
  // All four spies, because a gesture's meaning is often the spy it did **not** call.
  const spies = { onAddNote: vi.fn(), onRemoveNote: vi.fn(), onMoveNote: vi.fn(), onResizeNote: vi.fn() };
  render(
    <LanguageProvider>
      <PianoRollV2 notes={[]} beats={4} lowPitch={60} highPitch={72} {...spies} {...props} />
    </LanguageProvider>
  );
  return spies;
};

describe("the piano roll", () => {
  it("writes a note where it was clicked, with the length and velocity on the controls", () => {
    const { onAddNote } = renderRoll();
    // Step 2 of beat 1, on middle C: the position is the cell, and the length and velocity come from the controls rather than from the click.
    fireEvent.change(screen.getByLabelText(/长度|Length/), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/力度|Velocity/), { target: { value: "80" } });
    // Press and release in one cell: the gesture is a pointer gesture because a drag's destination is read from the cell the pointer reaches.
    const cell = screen.getByTestId("roll-cell-60-2");
    fireEvent.pointerDown(cell);
    fireEvent.pointerUp(cell);
    expect(onAddNote).toHaveBeenCalledWith({ pitch: 60, startBeats: 2 * STEP_BEATS, lengthBeats: 2, velocity: 80 });
  });

  it("removes a note that is pressed and released in place, rather than writing a second one in the same cell", () => {
    const notes = [{ pitch: 64, startBeats: 1, lengthBeats: 1, velocity: 100 }];
    const { onAddNote, onRemoveNote, onMoveNote } = renderRoll({ notes });
    // A beat is four steps, so a note starting at beat 1 is at step 4.
    const note = screen.getByTestId("roll-note-64-4");
    fireEvent.pointerDown(note);
    fireEvent.pointerUp(note);
    expect(onRemoveNote).toHaveBeenCalledWith({ pitch: 64, startBeats: 1 });
    expect(onAddNote).not.toHaveBeenCalled();
    // A press that did not move is a delete, not a move of zero distance.
    expect(onMoveNote).not.toHaveBeenCalled();
  });

  it("draws a note over the grid without moving the grid, so one beat is the same x on every row", () => {
    /**
     * The first version widened the cell the note started in, which pushed the rest of that row to the right — so the same beat landed at a different x per row and the roll stopped being a grid. The note is a positioned layer now.
     */
    renderRoll({ notes: [{ pitch: 67, startBeats: 2, lengthBeats: 3, velocity: 100 }] });
    const note = screen.getByTestId("roll-note-67-8");
    // Three beats is twelve sixteenth-steps at twelve pixels each — the width is the note's length, so a long note looks long and a short one looks short.
    expect(note.style.width).toBe("144px");
    expect(note.style.left).toBe("96px");
    expect(note.dataset.note).toBe("true");
    // The cells themselves stay one step wide and stay put, which is what keeps the rows aligned.
    expect(screen.getByTestId("roll-cell-67-8").style.width).toBe("12px");
    expect(screen.getByTestId("roll-cell-67-15").style.width).toBe("12px");
  });

  it("draws a short note narrower than a long one, so the width is an account of the length", () => {
    renderRoll({ notes: [{ pitch: 67, startBeats: 0, lengthBeats: 1, velocity: 100 }] });
    // One beat is four sixteenth-steps: a third of the three-beat note's width.
    expect(screen.getByTestId("roll-note-67-0").style.width).toBe("48px");
  });

  it("moves a note when it is dragged to another cell, in time and pitch", () => {
    const notes = [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }];
    const onMoveNote = vi.fn();
    const { onRemoveNote } = renderRoll({ notes, onMoveNote });
    fireEvent.pointerDown(screen.getByTestId("roll-note-60-0"));
    // Two beats later and a fifth up: the destination is read from the cell the pointer reaches, and the release may land on that cell rather than back on the note.
    fireEvent.pointerEnter(screen.getByTestId("roll-cell-65-8"));
    fireEvent.pointerUp(screen.getByTestId("roll-cell-65-8"));
    expect(onMoveNote).toHaveBeenCalledWith({ pitch: 60, startBeats: 0 }, { pitch: 65, startBeats: 2 });
    expect(onRemoveNote).not.toHaveBeenCalled();
  });

  it("changes a note's length when its edge is dragged, and not its position", () => {
    const notes = [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }];
    const onResizeNote = vi.fn();
    const onMoveNote = vi.fn();
    const { onRemoveNote } = renderRoll({ notes, onResizeNote, onMoveNote });
    const handle = screen.getByTestId("roll-resize-60-0");
    fireEvent.pointerDown(handle);
    // Drag the right edge to step 12 — three beats in — so the note is held for three beats; the handle itself ends the gesture, because it is what was grabbed.
    fireEvent.pointerEnter(screen.getByTestId("roll-cell-60-12"));
    fireEvent.pointerUp(handle);
    expect(onResizeNote).toHaveBeenCalledWith(notes[0], 3);
    // The body's own gesture did not fire: the handle stops the event, because the intention is length rather than position.
    expect(onMoveNote).not.toHaveBeenCalled();
    expect(onRemoveNote).not.toHaveBeenCalled();
  });

  it("ignores an edge drag that would make the note zero-length", () => {
    // A note shorter than a step is invisible, and a drag that ends where it started is a click rather than a resize.
    const notes = [{ pitch: 60, startBeats: 1, lengthBeats: 2, velocity: 100 }];
    const onResizeNote = vi.fn();
    renderRoll({ notes, onResizeNote });
    fireEvent.pointerDown(screen.getByTestId("roll-resize-60-4"));
    fireEvent.pointerUp(screen.getByTestId("roll-resize-60-4"));
    expect(onResizeNote).not.toHaveBeenCalled();
  });

  it("names its pitches, so a row can be read without counting semitones", () => {
    expect(noteName(60)).toBe("C4");
    expect(noteName(61)).toBe("C#4");
    expect(noteName(48)).toBe("C3");
    renderRoll();
    expect(screen.getByTestId("roll-cell-60-0").getAttribute("aria-label")).toMatch(/C4/);
  });

  it("labels what a press will do, because the cell and the note are the only affordances", () => {
    // Adding and removing share one control, so the accessible name has to say which one this cell means.
    renderRoll({ notes: [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }] });
    // The note carries the remove label; the empty cell beside it carries the write label.
    expect(screen.getByTestId("roll-note-60-0").getAttribute("aria-label")).toMatch(/删除|Remove/);
    expect(screen.getByTestId("roll-cell-60-1").getAttribute("aria-label")).toMatch(/写|Add/);
  });
});
