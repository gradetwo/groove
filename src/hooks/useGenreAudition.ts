import React, { useState, useRef, useEffect, useCallback } from "react";
import { Genre } from "../types/genre";
import type { SequencerPattern } from "../types/genre";
import { AudioEngine } from "../audio/AudioEngine";
import { setActiveAudioEngine } from "../audio/activeEngine";
import { debugModeForcedByUrl, isDebugModeEnabled } from "../platform/debugMode";
import { installProbeHooks, uninstallProbeHooks } from "../platform/probeHooks";
import { createVinylScrub, type VinylScrub } from "../audio/VinylScrub";
import { patternFromGenre } from "../data/genreMix";
import { arrangementSections, type ArrangementFormId } from "../data/arrangementForm";
import { flattenSong, sessionSong } from "../data/songFlatten";
import { announcer } from "../platform/announcer";

export interface GenreAuditionClock {
  /** The engine's current step. */
  step: number;
  /** Position inside that step, 0..1, interpolated between the engine's step callbacks. */
  fraction: number;
}

export interface UseGenreAuditionReturn {
  playingGenreId: string | null;
  isPlaying: (genreId: string) => boolean;
  toggleAudition: (genre: Genre, e?: React.MouseEvent) => Promise<void>;
  stopAudition: () => void;
  /**
   * Read the transport position without re-rendering.
   *
   * The phone player's canvas runs at 60 fps and must not push React state that often, so it reads
   * the clock through this accessor instead. `null` means "nothing playing right now".
   *
   * The step comes from the engine (`getCurrentStep`); the fraction is interpolated from the time
   * since that step was observed, because the engine reports step boundaries, not positions. That is
   * the same shape the reference implementation uses (`lastTick.s + f`) and keeps the record locked to
   * the audio rather than to a wall clock.
   */
  readClock: () => GenreAuditionClock | null;
  /**
   * Replace the pattern the engine is playing without restarting it.
   *
   * The phone's 即兴 module edits steps while the loop runs, which is the whole point of a step editor
   * with a playhead: the change has to be audible on the next bar, not after a stop/start. No-op when
   * no engine exists yet (nothing is playing, so the edit is already reflected in the caller's copy).
   */
  applyPattern: (pattern: SequencerPattern) => void;
  /** Live tempo/swing changes for the same reason. No-op before the engine exists. */
  setTempo: (bpm: number) => void;
  setSwingValue: (swing: number) => void;
  /**
   * The hand-on-the-record scratch, for the phone player's jog.
   *
   * `velocity` is the pointer's speed in pixels per millisecond; the voice maps it to a level and a
   * band (see `src/audio/VinylScrub.ts`). A no-op before the engine exists, which is also when there is
   * no context to build it on.
   */
  startVinylScrub: (velocity: number) => void;
  stopVinylScrub: () => void;
  /** The engine's current BPM, or `null` when no engine exists. See the implementation. */
  readTempo: () => number | null;
  /**
   * Play one track's voice once (a pad or a step tap) through its own mixed destination.
   * `instrument` overrides the track's declared model, for a pad that means a specific sound.
   */
  auditionTrack: (trackId: string, instrument?: string) => void;
  /**
   * Click on every beat while the transport runs.
   *
   * The engine has had `setMetronome` since the sequencer work; the phone's jam module is the first surface
   * that asks for it, so the hook carries it rather than every caller reaching for the engine.
   */
  setMetronome: (enabled: boolean) => void;
  /** The metronome flag (false before an engine exists). */
  readMetronome: () => boolean;
}

/**
 * Shared hook to manage AudioEngine lifecycle for 1-click genre auditions.
 * Eliminates duplicated AudioEngine instantiation across Galaxy, HorizontalTimeline,
 * VerticalTimeline, Compare, and Challenge views.
 */
/**
 * `onPatternEnd` fires once per completed pass of the pattern.
 *
 * The phone's play-mode button (单曲循环 → 大曲风内循环 → 全部随机) governs *what plays next*, and until now
 * nothing told the shell that a pass had finished — so every mode behaved like "repeat one", which is what the
 * phone reported. The engine loops the pattern by design, so the pass boundary is the moment its step counter
 * wraps; detecting it here keeps the decision in one place and works for every surface that auditions.
 *
 * **A wrap is not "the step went backwards"**, which is how this was written first and why the phone reported
 * 随机播放会连续切歌 — shuffle switching tracks one after another instead of waiting for a pass to finish.
 * `setPattern` starts the new pattern at step 0, so every *swap* looked like a wrap: the shell advanced to the
 * next genre, that swap looked like another wrap, and the queue ran away a genre per step. A real wrap needs the
 * pattern's own length — the previous step has to be its last one — and the observed step has to be cleared when
 * a pattern is loaded, so a swap cannot be mistaken for one.
 */
export interface UseGenreAuditionOptions {
  onPatternEnd?: (genreId: string) => void;
  /**
   * Play the genre as a **song** (an arrangement) instead of one pass of its loop.
   *
   * Measured 2026-09-24: a genre's own pattern is 32–128 steps, which at 120 BPM is a **4–16 second** pass — so
   * "wait for the track to finish" had nothing to wait for, and the phone's play modes read as continuous switching
   * even once the pass-end detection was correct. A form is 40 bars: about **80 seconds** for an eight-bar genre,
   * and it is the same arrangement the exporters write and the studio plays (B2/B7), so the phone hears what the
   * file contains rather than a shorter, different thing.
   *
   * `false` (the default) keeps the loop, which is what the browse surfaces want: an audition of "what is this
   * genre like" should not make a visitor wait a minute and a half to hear the next one.
   */
  arrangement?: ArrangementFormId | false;
}

export function useGenreAudition(options: UseGenreAuditionOptions = {}): UseGenreAuditionReturn {
  const arrangementForm = options.arrangement ?? false;
  const arrangementFormRef = useRef<ArrangementFormId | false>(arrangementForm);
  arrangementFormRef.current = arrangementForm;
  const [playingGenreId, setPlayingGenreId] = useState<string | null>(null);
  /**
   * The metronome is engine state, so it survives a pattern swap; the flag is mirrored here too so a surface
   * can render the toggle before any engine exists (nothing is playing, so it is remembered for the first play).
   */
  const [metronome, setMetronomeFlag] = useState(false);
  const engineRef = useRef<AudioEngine | null>(null);
  /** When the engine last reported a step, for the sub-step interpolation. */
  const lastStepRef = useRef<{ step: number; at: number } | null>(null);
  /** Read through a ref so the engine's callback never closes over a stale mode/queue. */
  const onPatternEndRef = useRef<UseGenreAuditionOptions["onPatternEnd"]>(options.onPatternEnd);
  onPatternEndRef.current = options.onPatternEnd;
  const playingGenreIdRef = useRef<string | null>(null);
  playingGenreIdRef.current = playingGenreId;
  /** The last step the engine reported, so a wrap can be seen. */
  const observedStepRef = useRef<number | null>(null);
  /**
   * The last step the pattern currently loaded can report (`totalSteps - 1`).
   *
   * Without it, "the step went backwards" is the only available test, and a pattern swap satisfies it. Set from
   * the pattern the hook hands the engine, and reset together with `observedStepRef` on every (re)start.
   */
  const lastStepOfPatternRef = useRef<number | null>(null);

  // Clean up engine on unmount
  useEffect(() => {
    return () => {
      cleanupProbeRef.current?.();
      cleanupProbeRef.current = null;
      cleanupDiagRef.current?.();
      cleanupDiagRef.current = null;
      if (engineRef.current) {
        engineRef.current.stop();
        setActiveAudioEngine(null);
        engineRef.current = null;
      }
      scrubRef.current?.dispose();
      scrubRef.current = null;
    };
  }, []);

  const stopAudition = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.stop();
    }
    setPlayingGenreId(null);
    announcer.announce("试听已停止 / Audition stopped");
  }, []);

  const toggleAudition = useCallback(
    async (genre: Genre, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
      }

      if (playingGenreId === genre.id) {
        stopAudition();
        return;
      }

      if (!engineRef.current) {
        engineRef.current = new AudioEngine({
          onStop: () => setPlayingGenreId(null),
        });
        /**
         * The phone shell's engine is the **active** one, and it carries the diagnostic panel.
         *
         * Both of those were desktop-only until now: only `useAudioEngineLifecycle` (the studio view) registered an engine
         * or installed the panel, so on the phone the start gate's `primeAudioContext` had nothing to prime and the debug
         * switch turned on a panel that no code path ever built — which is exactly what the owner reported.
         */
        setActiveAudioEngine(engineRef.current);
        /**
         * The measurement seam, for the same reason the desktop studio has one.
         *
         * The phone shell builds its own engine, so without this the probes that drive `?probe=1` have nothing to hold on a
         * phone — which is what stopped the audition soak from being able to read the engine's own load numbers.
         */
        if (installProbeHooks({ engine: engineRef.current })) {
          cleanupProbeRef.current = uninstallProbeHooks;
        }
        if (isDebugModeEnabled() || debugModeForcedByUrl()) {
          void import("../platform/diagnostics").then((mod) => {
            // The panel is a diagnostic, never a reason to fail a playback path.
            cleanupDiagRef.current = mod.installDiagnostics(engineRef.current!);
          });
        }
        engineRef.current.setOnStep((info) => {
          if (typeof info?.step === "number") {
            const previous = observedStepRef.current;
            observedStepRef.current = info.step;
            lastStepRef.current = { step: info.step, at: performance.now() };
            /**
             * A pass ended. Deferred with a microtask because this runs *inside* the engine's scheduler: the
             * handler replaces the pattern (and may stop the transport), and re-entering the scheduler from its
             * own step callback is how a transport wedges.
             */
            /**
             * A pass ended: the counter came back to the top of *this* pattern.
             *
             * `previous >= last - 1` rather than `=== last`, with one step of slack for a dropped report under
             * load — the engine's step callback is driven by a queue with a visual lead, and missing an advance is
             * worse than tolerating a near-miss. The reset on load is what keeps that slack from becoming a
             * cascade: a freshly loaded pattern has no previous step to compare against.
             */
            const last = lastStepOfPatternRef.current;
            if (last !== null && previous !== null && info.step === 0 && previous >= last - 1) {
              const id = playingGenreIdRef.current;
              const handler = onPatternEndRef.current;
              if (id && handler) queueMicrotask(() => handler(id));
            }
          }
        });
      }

      const engine = engineRef.current;
      engine.stop();
      // A freshly built engine has to be told again: the metronome is engine state, not pattern state.
      engine.setMetronome(metronome);
      /**
       * The loop, or the genre's song. `flattenSong` runs the same arrangement model the renderer does, so what the
       * phone plays and what an export contains cannot drift (`patternForExport` is the export-side twin of this).
       */
      const loop = patternFromGenre(genre);
      const form = arrangementFormRef.current;
      const pattern = form
        ? flattenSong(
            sessionSong({
              songMode: true,
              activeSlot: "A",
              patterns: { A: loop, B: loop },
              current: loop,
              sections: arrangementSections({
                songId: genre.id,
                form,
                tracks: loop.tracks,
                stepsPerPass: loop.totalSteps || Math.max(0, ...loop.tracks.map((t) => t.steps.length)),
              }),
              genreId: genre.id,
              bpm: genre.default_bpm ?? 120,
              swing: 0,
              resolution: "1/16",
              loopRange: null,
            })
          ).pattern
        : loop;
      engine.setPattern(pattern, true);
      /**
       * The pattern's own length, and a cleared observation, so the first step of *this* pattern is never read as
       * the end of the previous one — see the note on `onPatternEnd`.
       */
      const steps = pattern.totalSteps || Math.max(0, ...pattern.tracks.map((track) => track.steps.length));
      lastStepOfPatternRef.current = steps > 0 ? steps - 1 : null;
      observedStepRef.current = null;
      setPlayingGenreId(genre.id);
      announcer.announce(`正在试听：${genre.name} / Auditioning: ${genre.name}`);
      await engine.play();
    },
    [playingGenreId, stopAudition, metronome]
  );

  const isPlaying = useCallback(
    (genreId: string) => playingGenreId === genreId,
    [playingGenreId]
  );

  const readClock = useCallback((): GenreAuditionClock | null => {
    const engine = engineRef.current;
    if (!engine) return null;
    const step = engine.getCurrentStep();
    const stepMs = Math.max(1, engine.getStepDuration() * 1000);
    const observed = lastStepRef.current;
    const fraction =
      observed && observed.step === step
        ? Math.min(1, Math.max(0, (performance.now() - observed.at) / stepMs))
        : 0;
    return { step, fraction };
  }, []);

  const applyPattern = useCallback((pattern: SequencerPattern) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setPattern(pattern, false);
  }, []);

  const setMetronome = useCallback((enabled: boolean) => {
    setMetronomeFlag(enabled);
    engineRef.current?.setMetronome(enabled);
  }, []);
  const readMetronome = useCallback(() => engineRef.current?.getMetronome() ?? metronome, [metronome]);

  const setTempo = useCallback((bpm: number) => {
    engineRef.current?.setBpm(bpm);
  }, []);

  /**
   * The tempo the engine is *actually* at.
   *
   * The shell used to display a genre's declared `default_bpm` — a constant from the data — next to a
   * transport that may have been jogged, or may be playing a different genre after a skip, so the number
   * and the music disagreed by exactly the amount the user had changed. Nothing but the engine knows the
   * truth, so the bar and the player read it here.
   *
   * `null` means "nothing playing", which the callers treat as "show the genre's own default".
   */
  const readTempo = useCallback((): number | null => {
    return engineRef.current?.getBpm() ?? null;
  }, []);

  /**
   * The vinyl scratch, built on demand.
   *
   * Lazily, because it needs the engine's `AudioContext` and the engine is only created when something
   * is first auditioned — and remembered in a ref, because building it per event would create a noise
   * source per pointer move. `stopVinylScrub` releases it rather than tearing it down: a second scratch
   * should reuse the same voice.
   */
  const scrubRef = useRef<VinylScrub | null>(null);
  /** The diagnostics panel's teardown, when the debug switch asked for one. */
  const cleanupDiagRef = useRef<(() => void) | null>(null);
  /** The probe hook's teardown, when the page asked to be probed. */
  const cleanupProbeRef = useRef<(() => void) | null>(null);

  const startVinylScrub = useCallback((velocity: number) => {
    const target = engineRef.current?.getScrubTarget();
    if (!target) return;
    if (!scrubRef.current) {
      scrubRef.current = createVinylScrub(target.ctx, target.destination, { playing: true });
    }
    scrubRef.current?.setIntensity(velocity);
  }, []);

  const stopVinylScrub = useCallback(() => {
    scrubRef.current?.end();
  }, []);

  /**
   * One manual hit, for the 即兴 pads and step cells.
   *
   * No-op before the engine exists (nothing has been auditioned yet), which is also when there is no
   * context to play into — the caller still gets its visual feedback either way.
   */
  const auditionTrack = useCallback((trackId: string, instrument?: string) => {
    engineRef.current?.auditionTrack(trackId, 1, instrument);
  }, []);

  const setSwingValue = useCallback((swing: number) => {
    engineRef.current?.setSwing(swing);
  }, []);

  return {
    playingGenreId,
    isPlaying,
    toggleAudition,
    stopAudition,
    readClock,
    applyPattern,
    setTempo,
    setSwingValue,
    startVinylScrub,
    stopVinylScrub,
    auditionTrack,
    readTempo,
    setMetronome,
    readMetronome,
  };
}
