import { useCallback, useEffect, useRef, useState } from "react";
import { SequencerPattern } from "../../../types/genre";
import { AudioEngine, DrumKitType, EffectsRackState } from "../../../audio/AudioEngine";
import type { QuantizedStepResult } from "../../../audio/AudioEngine";
import type { SequencerAction, SequencerState } from "../useSequencerStore";
import { midiInputManager } from "../../../audio/MidiInputManager";
import { triggerHaptic, HapticPatterns } from "../../../utils/haptics";
import { parseScaleString, quantizePitchToScale } from "../../../utils/scaleTheory";
import { publishPlayhead } from "../playheadBus";
import { loadLayoutPrefs, type LayoutPrefs } from "../layoutPrefs";

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
  autoFollowPlayhead?: boolean;
}

export interface UseAudioEngineLifecycleResult {
  /** Moves the playhead laser beam + ruler highlight to `step` without re-rendering. */
  updatePlayhead: (step: number) => void;
  /** Hides the playhead and resets the last-step tracker. */
  clearPlayhead: () => void;
  /**
   * Whether the engine instance exists yet.
   *
   * The engine is created in a mount effect, so on the first render the ref is still empty and no
   * re-render is guaranteed afterwards. Anything that has to act "as soon as the studio can make a
   * sound" — the new-user guide's single action, a lesson, a phone surface — needs a dependency it
   * can re-run on, and this is it. Reading `engineRef.current` in an effect instead looks like it
   * works and silently never fires.
   */
  engineReady: boolean;
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
  autoFollowPlayhead,
}: UseAudioEngineLifecycleOptions): UseAudioEngineLifecycleResult {
  /** Flips once the engine exists, so consumers can depend on readiness (see the interface). */
  const [engineReady, setEngineReady] = useState(false);

  const lastStepRef = useRef(-1);
  const autoFollowPlayheadRef = useRef<boolean>(
    autoFollowPlayhead ?? loadLayoutPrefs().autoFollowPlayhead ?? true
  );

  useEffect(() => {
    if (typeof autoFollowPlayhead === "boolean") {
      autoFollowPlayheadRef.current = autoFollowPlayhead;
    }
  }, [autoFollowPlayhead]);

  useEffect(() => {
    const onPrefsChanged = (e: Event) => {
      const detail = (e as CustomEvent<LayoutPrefs>).detail;
      if (detail && typeof detail.autoFollowPlayhead === "boolean") {
        autoFollowPlayheadRef.current = detail.autoFollowPlayhead;
      }
    };
    window.addEventListener("groove_layout_prefs_changed", onPrefsChanged);
    return () => window.removeEventListener("groove_layout_prefs_changed", onPrefsChanged);
  }, []);

  // Cached geometry and DOM elements for zero-layout-thrashing playhead updates (P2-03)
  const stepPositionsCacheRef = useRef<Map<number, { left: number; width: number }>>(new Map());
  const rulerCellsCacheRef = useRef<Map<number, HTMLElement>>(new Map());
  const trackMetersCacheRef = useRef<Map<number, HTMLElement>>(new Map());
  const meterTimersRef = useRef<Map<number, any>>(new Map());

  // Batch measure step offsets to avoid getBoundingClientRect() during rapid transport playback
  const refreshStepCache = useCallback(() => {
    const container = matrixContainerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const cells = container.querySelectorAll<HTMLElement>("[data-ruler-step-idx]");
    const posMap = new Map<number, { left: number; width: number }>();
    const cellMap = new Map<number, HTMLElement>();
    cells.forEach((cell) => {
      const idx = Number(cell.getAttribute("data-ruler-step-idx"));
      if (!isNaN(idx)) {
        const rRect = cell.getBoundingClientRect();
        const left = rRect.left - cRect.left - container.clientLeft + container.scrollLeft;
        posMap.set(idx, { left, width: rRect.width });
        cellMap.set(idx, cell);
      }
    });
    stepPositionsCacheRef.current = posMap;
    rulerCellsCacheRef.current = cellMap;

    const metersMap = new Map<number, HTMLElement>();
    const meters = container.querySelectorAll<HTMLElement>("[data-meter-track]");
    meters.forEach((m) => {
      const idx = Number(m.getAttribute("data-meter-track"));
      if (!isNaN(idx)) {
        metersMap.set(idx, m);
      }
    });
    trackMetersCacheRef.current = metersMap;
  }, [matrixContainerRef]);

  // Invalidate position caches on step count changes or window resize
  useEffect(() => {
    stepPositionsCacheRef.current.clear();
    rulerCellsCacheRef.current.clear();
    trackMetersCacheRef.current.clear();
    const onResize = () => {
      stepPositionsCacheRef.current.clear();
      rulerCellsCacheRef.current.clear();
      trackMetersCacheRef.current.clear();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [seqState.stepCount]);

  // Decoupled Playhead & Peak Meter logic (P2-03)
  const updatePlayhead = useCallback((step: number) => {
    if (stepPositionsCacheRef.current.size === 0) {
      refreshStepCache();
    }

    let rulerCell = rulerCellsCacheRef.current.get(step);
    if (!rulerCell && matrixContainerRef.current) {
      rulerCell = matrixContainerRef.current.querySelector<HTMLElement>(`[data-ruler-step-idx="${step}"]`) || undefined;
      if (rulerCell) rulerCellsCacheRef.current.set(step, rulerCell);
    }

    if (rulerCell) {
      if (lastActiveRulerStepRef.current && lastActiveRulerStepRef.current !== rulerCell) {
        lastActiveRulerStepRef.current.classList.remove("playhead-active");
      }
      rulerCell.classList.add("playhead-active");
      lastActiveRulerStepRef.current = rulerCell;
    }

    if (playheadBeamRef.current) {
      const pos = stepPositionsCacheRef.current.get(step);
      if (pos) {
        playheadBeamRef.current.style.transform = `translate3d(${pos.left}px, 0, 0)`;
        playheadBeamRef.current.style.width = `${pos.width}px`;
        playheadBeamRef.current.style.display = "block";

        if (autoFollowPlayheadRef.current && matrixContainerRef.current) {
          const container = matrixContainerRef.current;
          if (container.scrollWidth > container.clientWidth) {
            /**
             * Only the loop wrap-around animates.
             *
             * Nudging the viewport every step used `behavior: "smooth"`, which starts a fresh
             * animation on each of the ~8 steps per second. Each new call cancels the running
             * animation mid-flight, so the scroller was permanently animating and never
             * settled — a continuous main-thread cost behind the "playback stutters" report,
             * for a movement that is only a few pixels. Stepping is a jump; the jump back to
             * the top of the loop is the one move worth showing.
             */
            if (step === 0 && lastStepRef.current > 0) {
              if (container.scrollLeft > 0) {
                container.scrollTo({ left: 0, behavior: "smooth" });
              }
            } else if (pos.left + pos.width > container.scrollLeft + container.clientWidth - 24) {
              const target = Math.min(container.scrollWidth - container.clientWidth, Math.max(0, pos.left - 48));
              container.scrollLeft = target;
            } else if (pos.left < container.scrollLeft) {
              container.scrollLeft = Math.max(0, pos.left - 48);
            }
          }
        }
      }
    }
  }, [refreshStepCache, matrixContainerRef]);

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
    meterTimersRef.current.forEach((t) => clearTimeout(t));
    meterTimersRef.current.clear();
    lastStepRef.current = -1;
  }, []);

  const triggerTrackMeters = useCallback((trackIndices: number[]) => {
    trackIndices.forEach((idx) => {
      let meter = trackMetersCacheRef.current.get(idx);
      if (!meter && matrixContainerRef.current) {
        meter = matrixContainerRef.current.querySelector<HTMLElement>(`[data-meter-track="${idx}"]`) || undefined;
        if (meter) trackMetersCacheRef.current.set(idx, meter);
      }
      if (meter) {
        meter.classList.add("is-flashing");
        if (meterTimersRef.current.has(idx)) {
          clearTimeout(meterTimersRef.current.get(idx));
        }
        const timer = setTimeout(() => {
          meter?.classList.remove("is-flashing");
          meterTimersRef.current.delete(idx);
        }, 120);
        meterTimersRef.current.set(idx, timer);
      }
    });
  }, [matrixContainerRef]);

  // Initialize AudioEngine (StrictMode safe, decoupled playhead & peak meter - P2-03 / P2-04)
  useEffect(() => {
    const engine = new AudioEngine({
      onStep: ({ step }) => {
        updatePlayhead(step);
        // The piano roll follows the same step through the DOM-only bus (no re-render per step).
        publishPlayhead(step);
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
      onPlay: () => {
        setIsPlaying(true);
      },
      onStop: () => {
        clearPlayhead();
        setIsPlaying(false);
      },
    });
    engineRef.current = engine;
    setEngineReady(true);
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
      setEngineReady(false);
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

  return { updatePlayhead, clearPlayhead, engineReady };
}
