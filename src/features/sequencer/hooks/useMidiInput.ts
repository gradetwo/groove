import { useEffect, useState } from "react";
import { SequencerPattern } from "../../../types/genre";
import { AudioEngine } from "../../../audio/AudioEngine";
import { midiInputManager, MidiDevice } from "../../../audio/MidiInputManager";

export interface UseMidiInputOptions {
  pattern: SequencerPattern;
  engineRef: React.MutableRefObject<AudioEngine | null>;
  isZh: boolean;
  showToast: (msg: string) => void;
  isKeyboardMode: boolean;
}

export interface UseMidiInputResult {
  /** Web MIDI devices currently known to `midiInputManager`. */
  midiDevices: MidiDevice[];
}

/**
 * A-02: Web MIDI device tracking + note-on preview (P4-04) and the computer
 * keyboard performance listener, extracted verbatim from `StudioView`.
 */
export function useMidiInput({
  pattern,
  engineRef,
  isZh,
  showToast,
  isKeyboardMode,
}: UseMidiInputOptions): UseMidiInputResult {
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);

  // Web MIDI & Keyboard Play (P4-04)
  useEffect(() => {
    midiInputManager.initMidi().then(() => {
      setMidiDevices(midiInputManager.getDevices());
    });

    const unsubDevices = midiInputManager.onDevicesChanged((devices) => {
      setMidiDevices(devices);
      if (devices.length > 0) {
        showToast(
          isZh
            ? `🎹 检测到 MIDI 设备: ${devices[0].name}`
            : `🎹 MIDI device connected: ${devices[0].name}`
        );
      }
    });

    const unsubNoteOn = (note: number, velocity: number, trackIdx?: number) => {
      let targetIdx = trackIdx !== undefined ? trackIdx : 0;
      if (trackIdx === undefined) {
        if (note < 48) targetIdx = 4;
        else if (note <= 65) targetIdx = 5;
        else targetIdx = 6;
      }
      const tr = pattern.tracks[targetIdx];
      if (engineRef.current && tr) {
        const normalizedVel = (velocity / 127) * (tr.volume || 0.8);
        engineRef.current.triggerNote(targetIdx, tr.name, normalizedVel, note, 1);
      }
    };

    const unsub = midiInputManager.onNoteOn(unsubNoteOn);

    return () => {
      unsubDevices();
      unsub();
    };
  }, [pattern.tracks, isZh, showToast]);

  // Computer keyboard performance is handled by MusicalTypingModal when isKeyboardMode is active,
  // which provides visual key feedback, octave shift, velocity control, scale-aware chord voicing,
  // and direct track routing without conflicting global listeners.

  return { midiDevices };
}
