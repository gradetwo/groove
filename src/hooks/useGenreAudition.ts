import React, { useState, useRef, useEffect, useCallback } from "react";
import { Genre } from "../types/genre";
import type { SequencerPattern } from "../types/genre";
import { AudioEngine } from "../audio/AudioEngine";
import { setActiveAudioEngine } from "../audio/activeEngine";
import { debugModeForcedByUrl, isDebugModeEnabled } from "../platform/debugMode";
import { installProbeHooks, uninstallProbeHooks } from "../platform/probeHooks";
import { createVinylScrub, type VinylScrub } from "../audio/VinylScrub";
import { patternFromGenre } from "../data/genreMix";
import { appCatalogueRuntime } from "../data/sampleCatalogueRuntime";
import { createSamplerLanePlayback, type SamplerLanePlayback } from "../audio/samplerLanePlayback";
import { prepareSamplerLanes, standDownSamplerLanes, type SamplerLaneProgress } from "../audio/samplerLanePrepare";
import { sharedSamplerLoader } from "../audio/sharedSamplerLoader";
import { reportSampledLaneProblems } from "../audio/sampledLanes";
import type { SampleAsset } from "../data/sampleCatalogue";
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
  /**
   * ⭐ **"The recordings this audition needs are still downloading" — `null` when nothing is being fetched.**
   *
   * `{loaded,total}` with `total` known before the first request: the determinate shape a progress display needs, and the state a surface must
   * show instead of claiming to be playing. A press that could not get its recordings **does not start the transport** and announces why, so
   * this never sits at `loaded: 0` forever on a failure — see `src/audio/samplerLanePrepare.ts`.
   */
  samplerPreparation: SamplerLaneProgress | null;
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
  /** The audition function, in a ref so the probe surface — built once, with the engine — always calls the current one. */
  const toggleAuditionRef = useRef<((genre: Genre) => Promise<void>) | null>(null);
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

  /**
   * ⭐ **The recorded lanes this audition is sounding.**
   *
   * A genre whose lanes the palette maps (`sax_lead`, `walking_upright`, …) is a set of **recordings**, and before this
   * the shuffle played their built-in synthesisers while requesting no SFZ and no WAV at all — the owner's report,
   * visible in the network panel. The stand-down on its own was not the answer: it silences the synthesiser and plays
   * nothing, because the bytes come from a scheduler of their own (`src/audio/samplerLanePlayback.ts`). The reference is
   * held so a stop can silence voices that are already on the audio clock, which `engine.stop()` cannot reach.
   */
  const samplerLanesRef = useRef<SamplerLanePlayback | null>(null);

  /**
   * ⭐ **The visible wait between the press and the transport.**
   *
   * Raised while `prepareSamplerLanes` is fetching this pass's recordings, and `null` when there is nothing to wait for. A surface that
   * rendered "auditioning" during this window would be a control that lies: nothing has been scheduled and the recorded lanes are stood down.
   */
  const [samplerPreparation, setSamplerPreparation] = useState<SamplerLaneProgress | null>(null);

  /**
   * The catalogue this session resolved, so a lane can be resolved against it without a second fetch.
   *
   * `appCatalogueRuntime` is single-flight per session, so loading it here costs one request that any other path in the
   * app would have made anyway — and `undefined` means "not answered yet", where every mapped lane keeps the
   * synthesiser, which is the owner's stated fallback rather than a failure.
   */
  const catalogueRef = useRef<readonly SampleAsset[] | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void appCatalogueRuntime
      .load()
      .then(({ assets }) => {
        if (!cancelled) catalogueRef.current = assets;
      })
      .catch((error: unknown) => {
        // eslint-disable-next-line no-console -- a catalogue that cannot be read leaves every recorded lane on its synthesiser, and that must not be silent
        console.warn("[sampled-instrument] the sample catalogue could not be loaded, so recorded lanes keep their synthesised voices", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Clean up engine on unmount
  useEffect(() => {
    return () => {
      cleanupProbeRef.current?.();
      cleanupProbeRef.current = null;
      cleanupDiagRef.current?.();
      cleanupDiagRef.current = null;
      // The sampler voices are placed on the audio clock, so they are stopped by name before the engine goes.
      samplerLanesRef.current?.stop();
      samplerLanesRef.current = null;
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
    samplerLanesRef.current?.stop();
    samplerLanesRef.current = null;
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
        if (
          installProbeHooks({
            engine: engineRef.current,
            auditionById: async (genreId: string) => {
              const { ALL_GENRES } = await import("../data/genres");
              const genre = ALL_GENRES.find((entry) => entry.id === genreId);
              if (genre) await toggleAuditionRef.current?.(genre);
            },
          })
        ) {
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
       * ⭐ **The recorded lanes are sounded from their own bytes, not from the built-in synthesiser.**
       *
       * Two things have to happen and both are done here, in this order:
       *
       *   1. `prepareSampledLanes` stands the synthesiser down for exactly the lanes whose asset the catalogue really
       *      serves — a lane with no palette row, or whose recording this mirror does not carry, keeps the synthesiser
       *      it has always had, and is *named* rather than left silent (`reportSampledLaneProblems`);
       *   2. the scheduler places those lanes' notes on the engine's clock, and re-plans them on every loop wrap, so a
       *      looping track does not fall silent on the second pass.
       *
       * It must come **after** `setPattern`: that call clears the stand-down set on purpose, so a resolve done first
       * would be discarded. And it is deliberately **not awaited** before `play()` — the catalogue fetch and the decode
       * happen behind a button that must not wait on the network, and the transport start is the gesture the browser's
       * audio policy is watching.
       */
      const tempo = genre.default_bpm ?? 120;
      const previousLanes = samplerLanesRef.current;
      const catalogueNow = catalogueRef.current ?? [];
      /**
       * ⭐ **The session's shared loader, so the wait and the sound are the same download.**
       *
       * `prepareSamplerLanes` fills this loader's caches and the controller below sounds through it — see
       * `src/audio/sharedSamplerLoader.ts`. Without the sharing, "prepare then play" would fetch everything twice.
       *
       * `?? null` because a criterion's engine double is engine-shaped rather than complete: `audioContext` can be absent, and an absent
       * context means "there is no graph to place a voice on", which is exactly the `null` case — and a `WeakMap` cannot be keyed by
       * `undefined`, so a missing field must not be handed to the loader's cache.
       */
      const context: BaseAudioContext | null = engine.audioContext ?? null;
      const loader = context === null ? null : sharedSamplerLoader(context, catalogueNow);
      const playback = createSamplerLanePlayback({
        engine,
        pattern,
        catalogue: catalogueNow,
        bpm: tempo,
        ...(loader === null ? {} : { loader }),
        warn: (message) => {
          // eslint-disable-next-line no-console -- the same prefix and shape `useTransportControls` reports lane problems with
          console.warn(message);
        },
      });
      samplerLanesRef.current = playback;
      /**
       * **Asked for rather than assumed**, the same way `useAudioEngineInstance` and `playerFromEngine` ask it: a
       * criterion's partial engine double is engine-shaped and must not be handed a method it never claimed.
       */
      const capable = engine as AudioEngine & {
        prepareSampledLanes?: (catalogue: readonly SampleAsset[]) => { stoodDown: number[]; problems: readonly string[] };
      };
      if (typeof capable.prepareSampledLanes === "function") {
        reportSampledLaneProblems(capable.prepareSampledLanes(catalogueNow).problems);
      }
      /**
       * ⭐ **Ready first, then the transport — the order that decides whether the recorded lanes are heard at all.**
       *
       * `scheduleSamplerSteps` awaits a fetch and a decode per note, and the engine's own lanes start on `play()`. Starting the transport first
       * therefore opens the pass with the recorded lanes silent and, worse, places every onset whose time has passed as an immediate burst.
       * Warming the recordings through the loader the controller will use makes the placement that follows a cache hit, so the notes land on
       * the grid instead of after it.
       *
       * ⚠️ **Nothing waits on a failure and nothing is swallowed**: if nothing could be prepared while the engine had stood something down, the
       * audition does NOT start and the sentences are reported; a partial failure reports the missing lanes and plays the rest.
       */
      let refusedToStart = false;
      if (loader !== null) {
        const warm = standDownSamplerLanes(pattern, catalogueNow);
        setSamplerPreparation(null);
        const preparation = await prepareSamplerLanes({
          pattern,
          catalogue: catalogueNow,
          loader,
          bpm: tempo,
          lanes: warm,
          onProgress: (progress) => setSamplerPreparation(progress.total > 0 ? progress : null),
        });
        setSamplerPreparation(null);
        if (preparation.problems.length > 0) reportSampledLaneProblems(preparation.problems);
        refusedToStart = !preparation.ready && !preparation.empty;
      }
      if (refusedToStart) {
        announcer.announce("音源未能就绪，试听未开始 / The recordings could not be loaded, so the audition did not start");
        return;
      }
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
      // The previous genre's voices are silenced only once the new pass owns the lane, so a skip does not gap.
      previousLanes?.stop();
      await playback.play(tempo);
    },
    [playingGenreId, stopAudition, metronome]
  );
  toggleAuditionRef.current = toggleAudition;

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
    samplerPreparation,
  };
}
