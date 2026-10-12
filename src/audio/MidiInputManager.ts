/**
 * Web MIDI API & Computer Keyboard / Pad Input Manager (P4-04)
 * Supports:
 * - External MIDI controller connection & hot-plugging
 * - Computer keyboard pad triggering (Keys 1-8 / ASDFGHJK) & musical keyboard typing
 * - Note-on / Note-off event dispatching with velocity
 */

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer?: string;
  state: "connected" | "disconnected";
}

export type NoteCallback = (note: number, velocity: number, trackIndex?: number) => void;
export type NoteOffCallback = (note: number, trackIndex?: number) => void;

// Musical keyboard mapping (C3 to C4)
export const KEY_TO_NOTE_MAP: Record<string, number> = {
  // Lower row piano keys
  z: 48, // C3
  s: 49, // C#3
  x: 50, // D3
  d: 51, // D#3
  c: 52, // E3
  v: 53, // F3
  g: 54, // F#3
  b: 55, // G3
  h: 56, // G#3
  n: 57, // A3
  j: 58, // A#3
  m: 59, // B3
  ",": 60, // C4
  l: 61, // C#4
  ".": 62, // D4
  ";": 63, // D#4
  "/": 64, // E4
};

// Track pad trigger keys (Keys 1-8 and A-K)
export const KEY_TO_TRACK_MAP: Record<string, number> = {
  "1": 0, // Kick
  "2": 1, // Snare
  "3": 2, // Hi-Hat
  "4": 3, // Percussion
  "5": 4, // Bass
  "6": 5, // Chords
  "7": 6, // Lead
  "8": 7, // FX
  a: 0,
  q: 1,
  w: 2,
  e: 3,
  r: 4,
  t: 5,
  y: 6,
  u: 7,
};

export class MidiInputManager {
  private midiAccess: any = null;
  private onNoteOnListeners: Set<NoteCallback> = new Set();
  private onNoteOffListeners: Set<NoteOffCallback> = new Set();
  private onDevicesChangedListeners: Set<(devices: MidiDevice[]) => void> = new Set();
  private connectedDevices: Map<string, MidiDevice> = new Map();
  private isListening = false;
  private keyState = new Set<string>();

  public isSupported(): boolean {
    return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
  }

  public async initMidi(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const access = await (navigator as any).requestMIDIAccess();
      this.midiAccess = access;

      this.updateDevices();

      access.onstatechange = (event: any) => {
        this.updateDevices();
        if (event.port.type === "input") {
          if (event.port.state === "connected") {
            this.bindInputPort(event.port);
          }
        }
      };

      for (const input of access.inputs.values()) {
        this.bindInputPort(input);
      }

      return true;
    } catch (err) {
      console.warn("Failed to initialize Web MIDI:", err);
      return false;
    }
  }

  private bindInputPort(input: any): void {
    input.onmidimessage = (event: any) => {
      this.handleMidiMessage(event.data);
    };
  }

  public handleMidiMessage(data: Uint8Array): void {
    if (!data || data.length < 2) return;
    const status = data[0];
    const msgType = status & 0xf0;
    const channel = status & 0x0f;
    const note = data[1];
    const velocity = data.length > 2 ? data[2] : 64;

    if (msgType === 0x90 && velocity > 0) {
      // Note On
      let trackIdx: number | undefined;
      if (channel === 9) {
        // General MIDI Drum mapping
        if (note === 35 || note === 36) trackIdx = 0;
        else if (note === 38 || note === 40) trackIdx = 1;
        else if (note === 42 || note === 44) trackIdx = 2;
        else trackIdx = 3;
      }
      this.triggerNoteOn(note, velocity, trackIdx);
    } else if (msgType === 0x80 || (msgType === 0x90 && velocity === 0)) {
      // Note Off
      this.triggerNoteOff(note);
    }
  }

  private updateDevices(): void {
    this.connectedDevices.clear();
    if (this.midiAccess) {
      for (const input of this.midiAccess.inputs.values()) {
        this.connectedDevices.set(input.id, {
          id: input.id,
          name: input.name || `MIDI Device ${input.id}`,
          manufacturer: input.manufacturer,
          state: input.state,
        });
      }
    }
    const list = Array.from(this.connectedDevices.values());
    this.onDevicesChangedListeners.forEach((fn) => fn(list));
  }

  public getDevices(): MidiDevice[] {
    return Array.from(this.connectedDevices.values());
  }

  public onNoteOn(fn: NoteCallback): () => void {
    this.onNoteOnListeners.add(fn);
    return () => this.onNoteOnListeners.delete(fn);
  }

  public onNoteOff(fn: NoteOffCallback): () => void {
    this.onNoteOffListeners.add(fn);
    return () => this.onNoteOffListeners.delete(fn);
  }

  public onDevicesChanged(fn: (devices: MidiDevice[]) => void): () => void {
    this.onDevicesChangedListeners.add(fn);
    return () => this.onDevicesChangedListeners.delete(fn);
  }

  private scaleFilter: ((note: number) => number) | null = null;

  public setScaleFilter(filter: ((note: number) => number) | null): void {
    this.scaleFilter = filter;
  }

  public triggerNoteOn(note: number, velocity: number, trackIndex?: number): void {
    const finalNote = this.scaleFilter && (trackIndex === undefined || trackIndex >= 4)
      ? this.scaleFilter(note)
      : note;
    this.onNoteOnListeners.forEach((fn) => (trackIndex !== undefined ? fn(finalNote, velocity, trackIndex) : fn(finalNote, velocity)));
  }

  public triggerNoteOff(note: number, trackIndex?: number): void {
    const finalNote = this.scaleFilter && (trackIndex === undefined || trackIndex >= 4)
      ? this.scaleFilter(note)
      : note;
    this.onNoteOffListeners.forEach((fn) => (trackIndex !== undefined ? fn(finalNote, trackIndex) : fn(finalNote)));
  }

  /**
   * Enables computer keyboard playing
   */
  public startKeyboardListener(selectedTrackIndex = 0): () => void {
    if (typeof window === "undefined" || this.isListening) {
      return () => {};
    }

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs or when modifier keys pressed
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (this.keyState.has(key)) return; // prevent key repeat
      this.keyState.add(key);

      // 1. Check direct track pad trigger (Keys 1-8)
      if (key in KEY_TO_TRACK_MAP) {
        const trackIdx = KEY_TO_TRACK_MAP[key];
        this.triggerNoteOn(60, 100, trackIdx);
        return;
      }

      // 2. Check musical typing note (Z-M row)
      if (key in KEY_TO_NOTE_MAP) {
        const midiNote = KEY_TO_NOTE_MAP[key];
        this.triggerNoteOn(midiNote, 100, selectedTrackIndex);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      this.keyState.delete(key);

      if (key in KEY_TO_NOTE_MAP) {
        const midiNote = KEY_TO_NOTE_MAP[key];
        this.triggerNoteOff(midiNote, selectedTrackIndex);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    this.isListening = true;

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      this.keyState.clear();
      this.isListening = false;
    };
  }
}

export const midiInputManager = new MidiInputManager();
