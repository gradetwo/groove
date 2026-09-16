import { useCallback, useEffect, useRef } from "react";
import { SequencerPattern } from "../../../types/genre";
import { AudioEngine, DrumKitType, EffectsRackState } from "../../../audio/AudioEngine";
import type { QuantizedStepResult } from "../../../audio/AudioEngine";
import type { SequencerAction, SequencerState } from "../useSequencerStore";
import { midiInputManager } from "../../../audio/MidiInputManager";
import { triggerHaptic, HapticPatterns } from "../../../utils/haptics";
import { parseScaleString, quantizePitchToScale } from "../../../utils/scaleTheory";
import { publishPlayhead } from "../playheadBus";

export interface UseAudioEngineLifecycleOptions {
  engineRef: React.MutableRefObject<AudioEngine | null>;
  /** Scroll container that hosts the step grid; used for playhead/meter lookups. */
  matrixContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  playheadBeamRef: React.MutableRefObject<HTMLDivElement | null>;
  lastActiveRulerStepRef: React.MutableRefObject<HTMLElement | null>;
  pattern: SequencerPattern;
  bpm: number;
  swing: number;
  timeSignature: string;
  resolution: "1/8" | "1/16" | "1/32";
  seqState: SequencerState;
  seqStateRef: React.MutableRefObject<SequencerState>;
  drumKit: DrumKitType;
  isDrumsOnly: boolean;
  isRecordArmed: boolean;
  effectsRackState: EffectsRackState;
  onAudioEngineReady?: (engine: AudioEngine) => (() => void) | void;
  commit: (action: SequencerAction, recordHistory?: boolean) => void;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  /** P5-05 callback registered on the engine's live recorder. */
  handleQuantizedStep: (rec: QuantizedStepResult) => void;
}

export interface UseAudioEngineLifecycleResult {
  /** Moves the playhead laser beam + ruler highlight to `step` without re-rendering. */
  updatePlayhead: (step: number) => void;
  /** Hides the playhead and resets the last-step tracker. */
  clearPlayhead: () => void;
}

/**
 * A-02: every effect that creates, configures or tears down the `AudioEngine`
 * instance, plus the DOM-decoupled playhead/peak-meter helpers it drives
 * (P2-03). Extracted verbatim from `StudioView`.
 */
export function useAudioEngineLifecycle({
  engineRef,
  matrixContainerRef,
  playheadBeamRef,
  lastActiveRulerStepRef,
  pattern,
  bpm,
  swing,
  timeSignature,
  resolution,
  seqState,
  seqStateRef,
  drumKit,
  isDrumsOnly,
  isRecordArmed,
  effectsRackState,
  onAudioEngineReady,
  commit,
  setIsPlaying,
  handleQuantizedStep,
}: UseAudioEngineLifecycleOptions): UseAudioEngineLifecycleResult {
  const lastStepRef = useRef(-1);

  // Decoupled Playhead & Peak Meter logic (P2-03)
  const updatePlayhead = useCallback((step: number) => {
    const container = matrixContainerRef.current;
    if (!container) return;

    const rulerCell = container.querySelector<HTMLElement>(`[data-ruler-step-idx="${step}"]`);
    if (rulerCell) {
      if (lastActiveRulerStepRef.current && lastActiveRulerStepRef.current !== rulerCell) {
        lastActiveRulerStepRef.current.classList.remove("playhead-active");
      }
      rulerCell.classList.add("playhead-active");
      lastActiveRulerStepRef.current = rulerCell;

      if (playheadBeamRef.current) {
        const cRect = container.getBoundingClientRect();
        const rRect = rulerCell.getBoundingClientRect();
        // Calculate true offset relative to matrixContainer scroll coordinate space
        const left = rRect.left - cRect.left - container.clientLeft + container.scrollLeft;
        const width = rRect.width;

        playheadBeamRef.current.style.transform = `translate3d(${left}px, 0, 0)`;
        playheadBeamRef.current.style.width = `${width}px`;
        playheadBeamRef.current.style.display = "block";
      }
    }
  }, []);

  const clearPlayhead = useCallback(() => {
    // Tell the DOM-only subscribers (the piano roll) that the transport stopped.
    publishPlayhead(-1);
    if (lastActiveRulerStepRef.current) {
      lastActiveRulerStepRef.current.classList.remove("playhead-active");
      lastActiveRulerStepRef.current = null;
    }
    if (playheadBeamRef.current) {
      playheadBeamRef.current.style.display = "none";
      playheadBeamRef.current.style.transition = "none";
    }
    lastStepRef.current = -1;
  }, []);

  const triggerTrackMeters = useCallback((trackIndices: number[]) => {
    const container = matrixContainerRef.current;
    if (!container) return;
    trackIndices.forEach((idx) => {
      const meter = container.querySelector<HTMLElement>(`[data-meter-track="${idx}"]`);
      if (meter) {
        meter.classList.add("is-flashing");
        setTimeout(() => {
          meter.classList.remove("is-flashing");
        }, 140);
      }
    });
  }, []);

  // Initialize AudioEngine (StrictMode safe, decoupled playhead & peak meter - P2-03 / P2-04)
  useEffect(() => {
    const engine = new AudioEngine({
      onStep: ({ step }) => {
        updatePlayhead(step);
        // The piano roll follows the same step through the DOM-only bus (no re-render per step).
        publishPlayhead(step);
        // P8-01: Haptic downbeat pulse during playback
        const sig = seqStateRef.current.timeSignature;
        const res = seqStateRef.current.resolution;
        const denom = parseInt(sig.split("/")[1]) || 4;
        const beatsPerBar = parseInt(sig.split("/")[0]) || 4;
        const stepsPerWhole = res === "1/32" ? 32 : res === "1/8" ? 8 : 16;
        const spb = Math.max(1, Math.round(stepsPerWhole / denom));
        const stepsPerBeat = Math.max(1, Math.round(spb / beatsPerBar));
        if (step % spb === 0) {
          triggerHaptic(HapticPatterns.heavyThud);
        } else if (stepsPerBeat > 1 && step % stepsPerBeat === 0) {
          triggerHaptic(HapticPatterns.metronomeClick);
        }
        // Song Mode auto-transition between pattern slots on loop wrap-around (P3-02)
        if (seqStateRef.current.songMode && lastStepRef.current > step && step === 0) {
          const nextSlot = seqStateRef.current.activeSlot === "A" ? "B" : "A";
          commit({ type: "SWITCH_PATTERN_SLOT", slot: nextSlot });
          engine.setPattern(seqStateRef.current.patterns[nextSlot]);
        }
        lastStepRef.current = step;
      },
      onTrackTrigger: (trackIndices) => {
        triggerTrackMeters(trackIndices);
      },
      onStop: () => {
        clearPlayhead();
        setIsPlaying(false);
      },
    });
    engineRef.current = engine;
    engine.setPattern(pattern);
    engine.setBpm(bpm);
    engine.setSwing(swing / 100);
    engine.setTimeSignature(timeSignature);
    engine.setResolution(resolution);
    engine.setLoopRange(seqState.loopRange);
    engine.setMetronome(seqState.isMetronome);
    engine.setCountIn(seqState.isCountIn);
    engine.setDrumKit(drumKit);
    engine.setDrumsOnly(isDrumsOnly);
    engine.setRecordArmed(isRecordArmed);

    // P5-05: Real-time Live Recording Callback
    engine.getLiveRecorder().setOnQuantizedStep(handleQuantizedStep);

    const cleanup = onAudioEngineReady ? onAudioEngineReady(engine) : undefined;

    return () => {
      cleanup?.();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Sync Loop Range, Metronome & Count-In to AudioEngine (P3-07)
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setLoopRange(seqState.loopRange);
    }
  }, [seqState.loopRange]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setMetronome(seqState.isMetronome);
    }
  }, [seqState.isMetronome]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setCountIn(seqState.isCountIn);
    }
  }, [seqState.isCountIn]);

  // Sync Drum Kit Model to AudioEngine (P5-02)
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setDrumKit(drumKit);
    }
  }, [drumKit]);

  // Sync Drums-Only Mode to AudioEngine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setDrumsOnly(isDrumsOnly);
    }
  }, [isDrumsOnly]);

  // Sync Live Recording Arm state to AudioEngine (P5-05)
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setRecordArmed(isRecordArmed);
    }
  }, [isRecordArmed]);

  // Sync Active Scale Filter to Midi & Keyboard Input (P6-02)
  useEffect(() => {
    if (!pattern.scale) {
      midiInputManager.setScaleFilter(null);
      return;
    }
    const { root, scaleId } = parseScaleString(pattern.scale);
    if (scaleId === "chromatic") {
      midiInputManager.setScaleFilter(null);
    } else {
      midiInputManager.setScaleFilter((note) => quantizePitchToScale(note, root, scaleId));
    }
    return () => {
      midiInputManager.setScaleFilter(null);
    };
  }, [pattern.scale]);

  // Sync Master DSP Effects Rack to AudioEngine (P5-04)
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setMasterFilter(
        effectsRackState.filterEnabled,
        effectsRackState.filterCutoff,
        effectsRackState.filterQ,
        effectsRackState.filterType
      );
      engineRef.current.setMasterSaturation(
        effectsRackState.saturationEnabled,
        effectsRackState.saturationDrive
      );
      engineRef.current.setMasterChorus(
        effectsRackState.chorusEnabled,
        effectsRackState.chorusMix,
        effectsRackState.chorusRate
      );
      engineRef.current.setMasterBitcrusher(
        effectsRackState.bitcrusherEnabled,
        effectsRackState.bitDepth
      );
    }
  }, [effectsRackState]);

  // Sync engine when sequencer state changes
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setPattern(pattern);
    }
  }, [pattern]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setBpm(bpm);
    }
  }, [bpm]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setSwing(swing / 100);
    }
  }, [swing]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setTimeSignature(timeSignature);
    }
  }, [timeSignature]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setResolution(resolution);
    }
  }, [resolution]);

  return { updatePlayhead, clearPlayhead };
}
