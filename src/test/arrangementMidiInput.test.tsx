import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import React from "react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { addTrack, createArrangementFromTemplate } from "../data/arrangementEdits";
import { LanguageProvider } from "../i18n/LanguageContext";
import type { ArrangementV2 } from "../types/arrangementV2";
import type { AudioEngine } from "../audio/AudioEngine";

const noCapture = async () => ({ ok: false as const, refusal: "unsupported" as const, summary: "no capture here" });
const renderView = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

/**
 * ⭐ **A device event reaches the engine.**
 *
 * `useMidiInput` was extracted from `StudioView` and lost its only caller when that view was deleted, so the arrangement surface
 * accepted no external keyboard. These cases stand in for the device Web MIDI would hand over -- `navigator.requestMIDIAccess` is
 * the only seam the manager uses -- and check the note arrives at the engine's own `triggerNote`. Deleting the call in the view
 * turns the first case red, which is what makes this a criterion rather than a description.
 */
const fakeAccess = (name: string) => {
  const input: { name: string; onmidimessage: ((event: { data: Uint8Array }) => void) | null } = { name, onmidimessage: null };
  const inputs = new Map<string, unknown>([["port-1", input]]);
  return { input, access: { inputs, onstatechange: null } };
};

describe("external MIDI input", () => {
  afterEach(() => {
    delete (navigator as { requestMIDIAccess?: unknown }).requestMIDIAccess;
  });

  it("⭐ plays a note-on through to the engine, and names the device it found", async () => {
    const { input, access } = fakeAccess("Fake Keys 61");
    (navigator as { requestMIDIAccess?: unknown }).requestMIDIAccess = vi.fn(async () => access);
    const triggerNote = vi.fn();
    // ⭐ The view tells the engine about the click track and reads the master rack, so a fake engine has to answer those too: a
    // stand-in that only carries the method under test fails the moment the surface grows another wire.
    const engineRef = {
      current: {
        triggerNote,
        setMetronome: vi.fn(),
        setCountIn: vi.fn(),
        getMasterFxRack: () => undefined,
      } as unknown as AudioEngine,
    };
    // ⭐ A note with no track index is routed by pitch -- below 48 to the fifth track, 48 to 65 to the sixth -- so the arrangement
    // needs those tracks for the note to land anywhere. That routing is the hook's own, unchanged from the studio.
    let arrangement: ArrangementV2 = createArrangementFromTemplate("blank", "midi-probe");
    for (let i = 0; i < 7; i += 1) arrangement = addTrack(arrangement, "synth", `Extra ${i + 1}`);

    renderView(<ArrangementViewV2 songId="s" capture={noCapture} initialArrangement={arrangement} engineRef={engineRef} />);

    // ⭐ The manager binds the port asynchronously, so the listener is what says the wiring happened at all.
    await waitFor(() => expect(input.onmidimessage).toBeTruthy());

    // A note-on: 0x90 is the status, 60 the key, 100 the velocity -- the shape a keyboard sends.
    input.onmidimessage!({ data: new Uint8Array([0x90, 60, 100]) });

    expect(triggerNote).toHaveBeenCalled();
    const args = triggerNote.mock.calls.at(-1)!;
    expect(args[3]).toBe(60);
  });
});
