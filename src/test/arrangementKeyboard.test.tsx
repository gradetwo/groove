/**
 * The keyboard that plays an arrangement's sampler tracks.
 *
 * The behaviour worth pinning is not "it renders keys": it is that **a press sounds and a release stops**, that the computer keyboard is the same instrument as the on-screen one, that key auto-repeat does not stack voices, and that typing a track name does not play
 * notes. The last two are the ways a keyboard implementation goes wrong in a way a person blames on the sampler.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ArrangementKeyboardV2 } from "../components/arrangement/ArrangementKeyboardV2";
import { LanguageProvider } from "../i18n/LanguageContext";

const renderKeyboard = (props: Partial<React.ComponentProps<typeof ArrangementKeyboardV2>> = {}) => {
  const onNoteOn = vi.fn();
  const onNoteOff = vi.fn();
  render(
    <LanguageProvider>
      <ArrangementKeyboardV2 onNoteOn={onNoteOn} onNoteOff={onNoteOff} {...props} />
    </LanguageProvider>
  );
  return { onNoteOn, onNoteOff };
};

describe("the arrangement keyboard", () => {
  it("sounds middle C on a click and stops it on release", () => {
    const { onNoteOn, onNoteOff } = renderKeyboard();
    const c = screen.getByTestId("arrangement-key-60");
    fireEvent.pointerDown(c);
    expect(onNoteOn).toHaveBeenCalledWith(60, 100);
    fireEvent.pointerUp(c);
    expect(onNoteOff).toHaveBeenCalledWith(60);
  });

  it("plays the same notes from the computer keyboard", () => {
    // `a` is the layout's first white key, so the wire from a key press to a note is the thing being checked.
    const { onNoteOn, onNoteOff } = renderKeyboard();
    fireEvent.keyDown(window, { key: "a" });
    expect(onNoteOn).toHaveBeenCalledWith(60, 100);
    fireEvent.keyUp(window, { key: "a" });
    expect(onNoteOff).toHaveBeenCalledWith(60);
  });

  it("starts one voice per key, however often the key repeats", () => {
    // Auto-repeat sends `keydown` many times a second while a key is held; a naive handler would start a voice for each and the note would pile up.
    const { onNoteOn } = renderKeyboard();
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(window, { key: "a", repeat: true });
    fireEvent.keyDown(window, { key: "a", repeat: true });
    expect(onNoteOn).toHaveBeenCalledTimes(1);
  });

  it("does not play notes while a text field has focus", () => {
    // Typing a track name must not sound a chord: the handler is on the window, so it has to look at what has focus.
    const { onNoteOn } = renderKeyboard();
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "a" });
    expect(onNoteOn).not.toHaveBeenCalled();
    input.remove();
  });

  it("carries the velocity the slider shows, so the drum kit's layers are reachable", () => {
    // The kit's regions are layered at 31/63/95/127; a keyboard stuck at one velocity would only ever sound one layer.
    const { onNoteOn } = renderKeyboard();
    fireEvent.change(screen.getByLabelText(/力度|Velocity/), { target: { value: "31" } });
    fireEvent.pointerDown(screen.getByTestId("arrangement-key-60"));
    expect(onNoteOn).toHaveBeenCalledWith(60, 31);
  });

  it("starts from the base note it is given", () => {
    const { onNoteOn } = renderKeyboard({ baseMidi: 48 });
    fireEvent.pointerDown(screen.getByTestId("arrangement-key-48"));
    expect(onNoteOn).toHaveBeenCalledWith(48, 100);
  });
});
