import { useCallback, useEffect, useRef, useState } from "react";
import { SequencerPattern } from "../../../types/genre";
import { AudioEngine, DrumKitType, EffectsRackState } from "../../../audio/AudioEngine";
import type { QuantizedStepResult } from "../../../audio/AudioEngine";
import type { SequencerAction, SequencerState } from "../useSequencerStore";
import { midiInputManager } from "../../../audio/MidiInputManager";
import { triggerHaptic, HapticPatterns } from "../../../utils/haptics";
import { parseScaleString, quantizePitchToScale } from "../../../utils/scaleTheory";
import { publishPlayhead } from "../playheadBus";
import { installProbeHooks, uninstallProbeHooks } from "../../../platform/probeHooks";
import { patternForExport } from "../../../data/songFlatten";
import { editorPositionFor } from "../../../data/songFlatten";
import { loadLayoutPrefs, type LayoutPrefs } from "../layoutPrefs";

/** Whether this session has an arrangement to play: song mode on, and sections to walk. */
function isSongMode(state: SequencerState): boolean {
  return Boolean(state.songMode && state.sections?.length);
}

/**
 * The pattern the transport should be handed (B7's one answer).
 *
 * `patternForExport` decides what an exporter writes — the flattened arrangement in song mode, the loop otherwise — and
 * playback asking the same function is the whole point: before this, an arrangement could be exported, measured by every
 * gate in the repository, and never heard.
 */
export function playingPattern(state: SequencerState, current: SequencerPattern): SequencerPattern {
  if (!isSongMode(state)) return current;
  return patternForExport({
    songMode: true,
    activeSlot: state.activeSlot,
    patterns: state.patterns,
    current,
    sections: state.sections ?? [],
    genreId: state.currentGenre?.id ?? "",
    bpm: state.bpm ?? 120,
    swing: state.swing ?? 0,
    resolution: state.resolution ?? "1/16",
    loopRange: state.loopRange,
  }).pattern;
}

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
        /**
         * The transport may be playing the arrangement (B7), in which case `step` counts through the whole song and
         * the grid shows one pass of one clip. `editorPositionFor` maps it back — and returns null (or
         * `matchesEditor: false`) when the pass plays a clip the grid is not showing, which is a state the beam has
         * nothing useful to say about.
         */
        const state = seqStateRef.current;
        const songMode = Boolean(state.songMode && state.sections?.length);
        const position = songMode
          ? editorPositionFor(
              {
                songMode: true,
                activeSlot: state.activeSlot,
                patterns: state.patterns,
                current: pattern,
                sections: state.sections ?? [],
                genreId: state.currentGenre?.id ?? "",
                bpm,
                swing,
                resolution,
                loopRange: state.loopRange,
              },
              step
            )
          : null;
        if (songMode) {
          if (position?.matchesEditor) updatePlayhead(position.localStep);
          else clearPlayhead();
          // The piano roll draws the clip being edited, so it follows the same mapped step.
          publishPlayhead(position?.matchesEditor ? position.localStep : -1);
        } else {
          updatePlayhead(step);
          // The piano roll follows the same step through the DOM-only bus (no re-render per step).
          publishPlayhead(step);
        }
        /**
         * Song mode's A↔B alternation (P3-02) — kept **only** for a session with no arrangement.
         *
         * Before B1 there was no timeline, so "song mode" meant "swap the two slots on every wrap"; that is now a
         * second, contradictory answer to the same question, and with the console feeding the engine the *flattened
         * arrangement* it would be a feedback loop: the swap commits to the store, the console recomputes the song
         * and sets the flattened pattern again, and the slots alternate underneath it. A song with sections plays its
         * sections; a session that never made one keeps the old behaviour, byte for byte.
         */
        if (
          seqStateRef.current.songMode &&
          !(seqStateRef.current.sections?.length) &&
          lastStepRef.current > step &&
          step === 0
        ) {
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
    /**
     * What the transport **plays** — the arrangement in song mode, the loop otherwise (B7).
     *
     * This lives here rather than in the console panel, which is where it was first written and where the live-arrangement
     * probe found the gap: the console is only mounted when the user opens it, so the studio's own transport played the
     * loop while the arrangement panel was right there on screen. `patternForExport` is the exporters' own decision, so
     * what plays and what a file contains are the same answer.
     */
    engine.setPattern(playingPattern(seqStateRef.current, pattern));
    engine.setBpm(bpm);
    engine.setSwing(swing / 100);
    engine.setTimeSignature(timeSignature);
    engine.setResolution(resolution);
    engine.setLoopRange(isSongMode(seqStateRef.current) ? null : seqState.loopRange);
    engine.setMetronome(seqState.isMetronome);
    engine.setCountIn(seqState.isCountIn);
    engine.setDrumKit(drumKit);
    engine.setDrumsOnly(isDrumsOnly);
    engine.setRecordArmed(isRecordArmed);

    // P5-05: Real-time Live Recording Callback
    engine.getLiveRecorder().setOnQuantizedStep(handleQuantizedStep);

    /** Set when the probe hook installed, so the teardown removes exactly what it added. */
    let cleanupProbe: (() => void) | undefined;

    /**
     * The measurement seam for the audible checks (`?probe=1` only — see `installProbeHooks`).
     *
     * Installed here because this is where the engine and the sequencer's own read/commit pair are both in scope, and
     * torn down with the engine so a probe can never reach a destroyed transport.
     */
    const probeInstalled = installProbeHooks({
      engine,
      readState: () => seqStateRef.current,
      commit: (action, recordHistory) => commit(action, recordHistory),
    });
    if (probeInstalled) {
      cleanupProbe = uninstallProbeHooks;
    }
    const cleanup = onAudioEngineReady ? onAudioEngineReady(engine) : undefined;

    return () => {
      cleanup?.();
      cleanupProbe?.();
      engine.destroy();
      engineRef.current = null;
      setEngineReady(false);
    };
  }, []);

  // Sync Loop Range, Metronome & Count-In to AudioEngine (P3-07)
  useEffect(() => {
    if (engineRef.current) {
      // A song is played **through**: the loop range belongs to the pattern being edited, and looping a bar inside a
      // forty-bar arrangement is the same silence in a different shape (B7).
      engineRef.current.setLoopRange(isSongMode(seqStateRef.current) ? null : seqState.loopRange);
    }
  }, [seqState.loopRange, seqState.songMode, seqState.sections]);

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

  /**
   * Sync engine when sequencer state changes — with the **arrangement**, when there is one (B7).
   *
   * The dependencies are the whole answer, not just `pattern`: song mode turning on, a section added or resized, and
   * the clip being edited all change what the transport should play.
   */
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setPattern(playingPattern(seqStateRef.current, pattern));
    }
  }, [pattern, seqState.songMode, seqState.sections, seqState.activeSlot, seqState.patterns]);

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
