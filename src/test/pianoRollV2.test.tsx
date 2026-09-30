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
  const onAddNote = vi.fn();
  const onRemoveNote = vi.fn();
  render(
    <LanguageProvider>
      <PianoRollV2 notes={[]} onAddNote={onAddNote} onRemoveNote={onRemoveNote} beats={4} lowPitch={60} highPitch={72} {...props} />
    </LanguageProvider>
  );
  return { onAddNote, onRemoveNote };
};

describe("the piano roll", () => {
  it("writes a note where it was clicked, with the length and velocity on the controls", () => {
    const { onAddNote } = renderRoll();
    // Step 2 of beat 1, on middle C: the position is the cell, and the length and velocity come from the controls rather than from the click.
    fireEvent.change(screen.getByLabelText(/长度|Length/), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/力度|Velocity/), { target: { value: "80" } });
    fireEvent.click(screen.getByTestId("roll-cell-60-2"));
    expect(onAddNote).toHaveBeenCalledWith({ pitch: 60, startBeats: 2 * STEP_BEATS, lengthBeats: 2, velocity: 80 });
  });

  it("removes a note by clicking it, rather than writing a second one in the same cell", () => {
    const notes = [{ pitch: 64, startBeats: 1, lengthBeats: 1, velocity: 100 }];
    const { onAddNote, onRemoveNote } = renderRoll({ notes });
    // A beat is four steps, so a note starting at beat 1 is at step 4.
    fireEvent.click(screen.getByTestId("roll-cell-64-4"));
    expect(onRemoveNote).toHaveBeenCalledWith({ pitch: 64, startBeats: 1 });
    expect(onAddNote).not.toHaveBeenCalled();
  });

  it("draws an existing note at its own cell, with its length as the width", () => {
    renderRoll({ notes: [{ pitch: 67, startBeats: 2, lengthBeats: 3, velocity: 100 }] });
    const cell = screen.getByTestId("roll-cell-67-8");
    expect(cell.dataset.note).toBe("true");
    // Three beats is twelve sixteenth-steps at twelve pixels each — the width is the note's length, so a long note looks long and a short one looks short.
    expect(cell.style.width).toBe("144px");
    // And an empty cell in the same row says it is empty, which is what makes the drawing readable to a criterion as well as to an eye.
    expect(screen.getByTestId("roll-cell-67-9").dataset.note).toBe("false");
  });

  it("draws a short note narrower than a long one, so the width is an account of the length", () => {
    renderRoll({ notes: [{ pitch: 67, startBeats: 0, lengthBeats: 1, velocity: 100 }] });
    // One beat is four sixteenth-steps: a third of the three-beat note's width.
    expect(screen.getByTestId("roll-cell-67-0").style.width).toBe("48px");
  });

  it("names its pitches, so a row can be read without counting semitones", () => {
    expect(noteName(60)).toBe("C4");
    expect(noteName(61)).toBe("C#4");
    expect(noteName(48)).toBe("C3");
    renderRoll();
    expect(screen.getByTestId("roll-cell-60-0").getAttribute("aria-label")).toMatch(/C4/);
  });

  it("labels what a click will do, because the cell is the only affordance", () => {
    // Adding and removing share one control, so the accessible name has to say which one this cell means.
    renderRoll({ notes: [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }] });
    expect(screen.getByTestId("roll-cell-60-0").getAttribute("aria-label")).toMatch(/删除|Remove/);
    expect(screen.getByTestId("roll-cell-60-1").getAttribute("aria-label")).toMatch(/写|Add/);
  });
});
