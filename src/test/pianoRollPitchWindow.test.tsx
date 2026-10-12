import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { PianoRollV2 } from "../components/arrangement/PianoRollV2";
import { LanguageProvider } from "../i18n/LanguageContext";

/**
 * ⭐ **A note that exists is drawn** (third evaluation, F08).
 *
 * The evaluation wrote a bass part at MIDI 28–43 and could not see or edit it: the roll's window is `48–84` by default
 * and was taken literally, so notes that were in the arrangement and audible had no row to sit on. Nothing was wrong
 * with the notes, which is what made it hard to believe. The window is a *view*, so it now widens to include every pitch
 * the music uses — and the compact default is kept for an empty roll, which is what the window was for.
 */
const roll = (notes: Array<{ pitch: number; startBeats: number; lengthBeats: number; velocity: number }>) =>
  render(
    <LanguageProvider>
      <PianoRollV2 notes={notes} onAddNote={() => {}} onRemoveNote={() => {}} onMoveNote={() => {}} onResizeNote={() => {}} beats={16} />
    </LanguageProvider>
  );

describe("the roll's pitch window", () => {
  it("⭐ draws a bass line that sits below the default window", () => {
    const visible = roll([{ pitch: 30, startBeats: 0, lengthBeats: 1, velocity: 90 }]);
    expect(visible.container.querySelector('[data-testid="roll-note-30-0"]'), "the note has a row to sit on").toBeTruthy();
    expect(visible.container.querySelector('[data-testid="roll-cell-30-0"]'), "and the row is editable").toBeTruthy();
    visible.unmount();
  });

  it("⭐ and keeps the compact window when there is nothing to show", () => {
    const empty = roll([]);
    expect(empty.container.querySelector('[data-testid="roll-cell-48-0"]')).toBeTruthy();
    expect(empty.container.querySelector('[data-testid="roll-cell-30-0"]'), "no note, no extra rows").toBeNull();
    empty.unmount();
  });
});
