import { describe, it, expect, vi } from "vitest";
import { MidiInputManager, KEY_TO_NOTE_MAP, KEY_TO_TRACK_MAP } from "../audio/MidiInputManager";

describe("Web MIDI & Keyboard Manager (P4-04)", () => {
  it("handles MIDI Note On and routes drum channels correctly", () => {
    const mgr = new MidiInputManager();
    const noteOnSpy = vi.fn();
    mgr.onNoteOn(noteOnSpy);

    // Channel 10 (0x99 in 0-indexed hex), Note 36 (Kick), Velocity 110
    mgr.handleMidiMessage(new Uint8Array([0x99, 36, 110]));
    expect(noteOnSpy).toHaveBeenCalledWith(36, 110, 0); // mapped to track 0

    // Channel 10, Note 38 (Snare)
    mgr.handleMidiMessage(new Uint8Array([0x99, 38, 90]));
    expect(noteOnSpy).toHaveBeenCalledWith(38, 90, 1); // mapped to track 1

    // Channel 1 (0x90), Note 60 (Middle C)
    mgr.handleMidiMessage(new Uint8Array([0x90, 60, 80]));
    expect(noteOnSpy).toHaveBeenCalledWith(60, 80);
  });

  it("handles MIDI Note Off and velocity 0 as Note Off", () => {
    const mgr = new MidiInputManager();
    const noteOffSpy = vi.fn();
    mgr.onNoteOff(noteOffSpy);

    // Standard note off
    mgr.handleMidiMessage(new Uint8Array([0x80, 60, 0]));
    expect(noteOffSpy).toHaveBeenCalledWith(60);

    // Note on with velocity 0
    mgr.handleMidiMessage(new Uint8Array([0x90, 64, 0]));
    expect(noteOffSpy).toHaveBeenCalledWith(64);
  });

  it("provides correct mappings for keyboard typing and pads", () => {
    expect(KEY_TO_TRACK_MAP["1"]).toBe(0);
    expect(KEY_TO_TRACK_MAP["2"]).toBe(1);
    expect(KEY_TO_NOTE_MAP["z"]).toBe(48); // C3
    expect(KEY_TO_NOTE_MAP["s"]).toBe(49); // C#3
    expect(KEY_TO_NOTE_MAP[","]).toBe(60); // C4
  });
});
