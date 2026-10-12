import { useCallback, useRef, useState } from "react";
import { AudioEngine } from "../../../audio/AudioEngine";
import type { SequencerAction, SequencerState, StudioHistorySnapshot } from "../useSequencerStore";
import { triggerHaptic, HapticPatterns } from "../../../utils/haptics";
import { announcer } from "../../../platform/announcer";
import { useLanguage } from "../../../i18n/LanguageContext";
import { patternForSlot } from "../../../types/project";
import type { ClipSlot } from "../../../types/song";
import { playAudioLanes } from "../../../audio/audioLanePlayback";
import { appCatalogueRuntime } from "../../../data/sampleCatalogueRuntime";
import { sharedSamplerLoader } from "../../../audio/sharedSamplerLoader";
import {
  prepareSamplerLanes,
  standDownSamplerLanes,
  type SamplerLaneProgress,
} from "../../../audio/samplerLanePrepare";
import { reportSampledLaneProblems } from "../../../audio/sampledLanes";
import type { SampleAsset } from "../../../data/sampleCatalogue";
import { sharedSamplerLoaderBuilds } from "../../../audio/sharedSamplerLoader";
import {
  ledgerLanesOf,
  observingSamplerLoader,
  publishSamplerPlay,
  type SamplerLedgerAsset,
} from "../../../hooks/samplerPlayLedger";
import type { SequencerPattern } from "../../../types/genre";

/**
 * ⭐ **The recorded-lane half of this transport, handed in by the surface that owns the engine.**
 *
 * A lane whose `instrument` the palette maps (`walking_upright`, `piano_lead`, `guitar_lead`, …) is a **recording**, and
 * it takes two calls to hear it: `AudioEngine.prepareSampledLanes` stands its synthesiser down — and plays nothing — while
 * `createSamplerLanePlayback` places its notes from their own bytes. This transport did the first and never the second, so
 * on `/studio` a mapped lane was stood down from the synthesiser and then **sounded by nothing at all**: silent, with no
 * request made and nothing on screen. That is `src/hooks/useRecordedLanes.ts`'s own warning — *"Calling only the first is
 * **worse than the defect**: a lane that played the wrong instrument becomes a lane that plays nothing"* — measured rather
 * than read (`order: ["engine.play"]`, `loadNote` calls `0`, `scheduleSamplerSteps` calls `0`).
 *
 * `start` is `useRecordedLanes`'s `startRecordedLanes`, so the pairing exists once in the repository rather than a second
 * time here; `stop` is its `stopRecordedLanes`, because a recorded note is already on the audio clock and `engine.stop()`
 * cannot reach it.
 */
export interface TransportRecordedLanes {
  /** Sound this pattern's recorded lanes from their own bytes, once the transport is running. */
  start: (pattern: SequencerPattern) => void;
  /** Silence every voice the last `start` placed, and report how many that stopped. */
  stop: () => void;
}

export interface UseTransportControlsOptions {
  /**
   * The arrangement's song, as a **getter** so a re-render cannot hand the lanes a different object each time. Absent means the audio-lane path does nothing at all.
   */
  arrangementSong?: () => { clips: Record<string, { tracks?: unknown[] } | undefined>; sections: Array<{ id?: string; slot?: string; bars?: number }>; boundaries?: number[]; bpm: number } | null;
  engineRef: React.MutableRefObject<AudioEngine | null>;
  seqStateRef: React.MutableRefObject<SequencerState>;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDrumsOnly: React.Dispatch<React.SetStateAction<boolean>>;
  clearPlayhead: () => void;
  commit: (action: SequencerAction, recordHistory?: boolean) => void;
  undo: () => StudioHistorySnapshot | null;
  redo: () => StudioHistorySnapshot | null;
  isZh: boolean;
  showToast: (msg: string) => void;
  /**
   * Drop any piano-roll lane scope before the full arrangement starts.
   *
   * While a scope is set the scheduler skips every other track, so pressing Play with one left over
   * played only that lane — reported as "after writing a chord progression, playback in the
   * workspace only plays the chords". `AudioEngine.play()` clears the scope as well; this exists so
   * the roll's own preview state is released in the same breath, instead of its toggle staying lit
   * over a scope that no longer exists.
   */
  releasePreviewScope?: () => void;
  /**
   * ⭐ **The recordings this pattern's mapped lanes need, when the surface owns the scheduler that sounds them.**
   *
   * Absent — every caller but the studio today — this hook behaves exactly as it did: the target is handed to the engine
   * and `play()` is awaited. Present, a press resolves and decodes the recordings through the session's **shared** loader
   * (`sharedSamplerLoader`, keyed by `AudioContext`) *before* `engine.play()`, so a second press on the same genre is a
   * cache hit rather than 45 files fetched again.
   */
  recordedLanes?: TransportRecordedLanes;
}

/**
 * ⭐ **What the Play button is doing between the press and the transport.**
 *
 * `preparing` and `failed` are the two states this hook used to keep to itself, which is the whole
 * defect: pressing Play on `/studio` started a 3.2–13.3 second wait during which the button still
 * read 「播放」, Stop was greyed out, and `getIsPlaying()` was false — no visible state at all, on a
 * control the owner had already accepted as "ready, then start". `failed` is a **retryable** state
 * rather than an ending: the same button is the way to try again, and the button says so.
 */
export type TransportPreparationPhase = "idle" | "preparing" | "failed";

export interface UseTransportControlsResult {
  handleTapTempo: () => void;
  handleToggleDrumsOnly: () => void;
  handleTogglePlay: () => void;
  /**
   * Return the transport to the top — the control that a real Pause made necessary (see `handleStop`).
   *
   * `canStop` is the fact its disabled state reports, so the button is never a live control that does nothing.
   */
  handleStop: () => void;
  canStop: boolean;
  handleUndo: () => void;
  handleRedo: () => void;
  handleSwitchSlot: (slot: ClipSlot) => void;
  handleCopySlot: (from: ClipSlot, to: ClipSlot) => void;
  handleToggleSongMode: () => void;
  handleToggleBlindCompare: () => void;
  handleToggleMetronome: () => void;
  handleToggleCountIn: () => void;
  /**
   * ⭐ **The wait between the press and the transport**, so a surface can say "正在获取音源" instead of starting a bar whose
   * recorded lanes are stood down. `null` whenever there is nothing to wait for, including `total: 0`.
   */
  samplerPreparation: SamplerLaneProgress | null;
  /**
   * ⭐ **Whether a press is being waited on, and whether the last one failed.**
   *
   * The button draws this so the wait is visible from the press rather than from the first
   * `onProgress` callback — which is one manifest round trip later
   * (`appCatalogueRuntime.load()` is awaited before `prepareSamplerLanes` ever runs). `failed` is
   * returned to `idle` by the next press, which is what makes the same button a retry.
   */
  transportPreparation: TransportPreparationPhase;
  /**
   * One sentence per recorded lane this session's catalogue could not serve, in `reportSampledLaneProblems`' own
   * `[sampled-instrument] …` shape — the same sentences the genre page and the engine-owning hooks render. Never silent:
   * a mirror that is not configured makes every mapped lane a synthesiser, and this is where that is said.
   */
  samplerProblems: string[];
}

/**
 * A-02: transport & playback-mode controls — play/stop, drums-only, undo/redo,
 * tap tempo, pattern-slot switching/copying, song mode, blind compare, metronome
 * and count-in. Moved verbatim from `StudioView` (including the tap-tempo ref).
 *
 * U7: **a control that does nothing must say so.** Every handler here reports what it did (toast
 * plus an `announcer` event for screen readers), including the cases where the honest answer is
 * "nothing happened": an empty undo history, the first tap of a two-tap tempo reading, and a Play
 * press before the engine instance exists. "点了没反应" is indistinguishable from a broken button,
 * and that is the impression this file exists to prevent.
 */
export function useTransportControls({
  engineRef,
  arrangementSong,
  seqStateRef,
  isPlaying,
  setIsPlaying,
  setIsDrumsOnly,
  clearPlayhead,
  commit,
  undo,
  redo,
  showToast,
  releasePreviewScope,
  recordedLanes,
}: UseTransportControlsOptions): UseTransportControlsResult {
  const { t } = useLanguage();
  /**
   * ⭐ **The visible wait, and the reasons a lane will not sound.**
   *
   * State rather than a ref because both have to *change a render*: the press that raises "正在获取音源" must repaint the
   * page, and the sentence that replaces it must be readable when the download failed. `null` means "nothing to wait
   * for", which is the ordinary case for a pattern with no mapped lane.
   */
  const [samplerPreparation, setSamplerPreparation] = useState<SamplerLaneProgress | null>(null);
  const [samplerProblems, setSamplerProblems] = useState<string[]>([]);
  /**
   * ⭐ **The wait the press itself raises** — see {@link TransportPreparationPhase}.
   *
   * State rather than a ref for the same reason `samplerPreparation` is: the frame after the press
   * has to *repaint*, and that repaint is the entire feature.
   */
  const [transportPreparation, setTransportPreparation] = useState<TransportPreparationPhase>("idle");
  /**
   * ⭐ **Which press owns the wait, so a second one is a restart rather than a race.**
   *
   * Two presses currently start two `prepareRecordings` calls and the *first* one to resolve calls
   * `engine.play()` — so a user who pressed again while stuck could get a transport started by the
   * run they had given up on. Every press takes a ticket; a run whose ticket is stale checks out at
   * its next checkpoint and starts nothing.
   */
  const preparationTicketRef = useRef(0);
  /**
   * Read through a ref, like `useRecordedLanes` reads its own `loaderFor`: every call site writes an inline arrow, and a
   * fresh identity here would re-create `handleTogglePlay` on every render for no behavioural reason.
   */
  const recordedLanesRef = useRef(recordedLanes);
  recordedLanesRef.current = recordedLanes;
  /**
   * ⭐ **Whether the Stop control would do anything**, so it can be disabled rather than be a live button that does
   * nothing (U7).
   *
   * It is state rather than a render-time read of `engineRef` because the fact has to *change a render*: the engine is
   * the truth, but a ref mutation does not repaint, and pressing Pause or Stop is exactly when this answer flips. It is
   * refreshed from the engine after every transport action rather than tracked here, so it cannot drift from the
   * transport it describes.
   */
  const [canStop, setCanStop] = useState(false);
  const refreshCanStop = useCallback(() => {
    setCanStop(engineRef.current?.canReturnToStart() ?? false);
  }, [engineRef]);
  // Tap tempo calculator (P3-07)
  const tapTimestampsRef = useRef<number[]>([]);
  const handleTapTempo = useCallback(() => {
    const now = performance.now();
    tapTimestampsRef.current = tapTimestampsRef.current.filter((t) => now - t < 2500);
    tapTimestampsRef.current.push(now);

    /**
     * U7: the first tap used to say nothing at all. Tap tempo needs two taps, so a user who tapped
     * once could not tell "waiting for a second tap" from "this button is broken" — and the second
     * reading is the one people act on.
     */
    if (tapTimestampsRef.current.length < 2) {
      const first = t("transport_tap_first");
      showToast(first);
      announcer.announce(first);
      return;
    }

    // `calculateTapTempo` clamps into 40-240 and returns 120 for a degenerate interval, so there is
    // no out-of-range case left to report here (the old check could never be false).
    const calculatedBpm = AudioEngine.calculateTapTempo(tapTimestampsRef.current);
    commit({ type: "SET_BPM", bpm: calculatedBpm });
    if (engineRef.current) {
      engineRef.current.setBpm(calculatedBpm);
    }
    const message = `${t("transport_tap_bpm")}: ${calculatedBpm}`;
    showToast(message);
    announcer.announce(message);
  }, [commit, t, showToast]);

  // Toggle Drums-Only mode
  const handleToggleDrumsOnly = useCallback(() => {
    setIsDrumsOnly((prev) => {
      const next = !prev;
      if (engineRef.current) {
        engineRef.current.setDrumsOnly(next);
      }
      showToast(
        next
          ? t("transport_drums_only_on")
          : t("transport_full_band_on")
      );
      announcer.announce(
        next
          ? t("transport_announce_drums_only_on")
          : t("transport_announce_drums_only_off")
      );
      return next;
    });
  }, [t, showToast]);

  /**
   * ⭐ **Ready, then start** — the recordings this pass needs are resolved and decoded *before* the transport runs.
   *
   * ## The defect this removes, measured
   *
   * The engine's dispatch skips a lane in `sampledLaneIndexes` (`AudioEngine.prepareSampledLanes` fills it from
   * `sampledStandDownIndexes`), and this transport filled it while **nothing** placed those lanes' notes: a `grep` for
   * `prepareSamplerLanes` in this file was empty, and pressing Play on `/studio` with `delta-blues` loaded produced
   * `order: ["engine.play"]`, `loadNote` calls **0**, `scheduleSamplerSteps` calls **0**. So the mapped lanes were stood
   * down and silent, and no sample was requested at all — the owner's "点播放，没看到哪里会提示下载音源", with a worse
   * half he could not see.
   *
   * ## Why the order is prepare → play → schedule
   *
   * `scheduleSamplerSteps` awaits a fetch and a decode per note, so a transport that started first would open the bar
   * with exactly those lanes missing and then start every onset whose time had already passed **at once** — the compressed
   * burst `src/audio/samplerLanePrepare.ts` describes as "先静音后补". This is the order `GenreDetailView.handlePlayMode`
   * already uses and the owner has accepted on that page; it is copied rather than re-derived.
   *
   * ## Why the loader is the shared one
   *
   * `sharedSamplerLoader(context, catalogue)` is keyed by `AudioContext` and by the catalogue **array**, and
   * `useRecordedLanes` resolves its own loader through the same factory — so the warm-up below and the scheduler that
   * follows arrive at one loader and the second press is a cache hit. A loader built here and another built there would
   * be `samplerLanePrepare.test.ts`'s measured red: the whole warm-up paid a second time.
   *
   * ## What it does on failure
   *
   * Resolves to `false` only when there was something to prepare and **nothing** could be prepared, so the transport does
   * not start and the sentences go on screen; a partial failure starts the pass with the missing lanes named. Neither
   * branch is silent, and nothing waits on a request that has already failed (`prepareSamplerLanes` resolves rather than
   * rejects).
   */
  const prepareRecordings = useCallback(
    async (engine: AudioEngine, pattern: SequencerPattern): Promise<boolean> => {
      setSamplerPreparation(null);
      setSamplerProblems([]);

      /**
       * The catalogue is fetched (once per session, `appCatalogueRuntime` is single-flight) rather than read from
       * `appCatalogueRuntime.assets`, because on a cold first press that array is still empty — and an empty catalogue is
       * the one answer that would make the wait silently disappear. A catalogue that cannot be read at all is a *reason*
       * for every mapped lane keeping its synthesiser, so it travels with the stand-down's own sentences.
       */
      let assets: readonly SampleAsset[] = [];
      let catalogueFailure: string | undefined;
      try {
        assets = (await appCatalogueRuntime.load()).assets;
      } catch (error) {
        catalogueFailure = `the sample catalogue could not be loaded, so recorded lanes keep their synthesised voices (${
          error instanceof Error ? error.message : String(error)
        })`;
      }

      /**
       * ⭐ **The engine is told which lanes are recordings before it is asked to play**, so the only window in which a
       * lane could be doubled is the engine's own scheduling lead rather than a whole pass. Asked for rather than assumed,
       * the same way `useRecordedLanes` and `useGenreAudition` ask it: a criterion's engine double is engine-shaped and
       * must not be handed a method it never claimed.
       */
      const stoodDown =
        typeof engine.prepareSampledLanes === "function"
          ? engine.prepareSampledLanes(assets)
          : { stoodDown: [], problems: [] as string[] };
      const reasons = [...(catalogueFailure === undefined ? [] : [catalogueFailure]), ...stoodDown.problems];

      const context: BaseAudioContext | null = engine.audioContext ?? null;
      /**
       * ⭐ **Exactly the lanes the stand-down will silence** — `sampledStandDownIndexes`, reached through
       * `standDownSamplerLanes`. A lane this catalogue does not serve keeps its synthesiser and is heard however slow the
       * network is, so waiting for it would be waiting for nothing; with no catalogue at all this list is empty and
       * nothing is fetched.
       */
      const lanes = standDownSamplerLanes(pattern, assets);
      /**
       * ⭐ **What the `?diag=1` panel will show about this press**, written before the fetch so a play that fails is still
       * described. `writtenNotesOf`-equivalent reads (`stepPitches`/`stepVelocity`) are the model's own, so a drum lane's
       * "no pitch at all" is the same fact `planSamplerSteps` reads.
       */
      const ledgerLanes = ledgerLanesOf(pattern, assets);

      if (context === null || lanes.length === 0) {
        const noGraph = context === null && lanes.length > 0
          ? ["the engine has no audio context, so no recording could be prepared"]
          : [];
        const reported = reportSampledLaneProblems([...reasons, ...noGraph]);
        setSamplerProblems(reported);
        publishSamplerPlay({
          entry: "/studio",
          ...(pattern.genre_id === undefined ? {} : { genre: pattern.genre_id }),
          at: new Date().toISOString(),
          lanes: ledgerLanes,
          laneCount: pattern.tracks?.length ?? 0,
          assets: [],
          progress: null,
          ready: lanes.length === 0,
          empty: lanes.length === 0,
          problems: reported,
          loaderBuilds: sharedSamplerLoaderBuilds(),
          decodes: 0,
        });
        return true;
      }

      const loader = sharedSamplerLoader(context, assets);
      const decodesBefore = loader.decodes();
      /**
       * ⭐ **The loader is observed through a thin delegate rather than replaced.**
       *
       * The panel needs "which asset, which note, resolved or refused" — `prepareSamplerLanes` answers only `loaded/total`
       * in aggregate. A second loader would be a second download and a different cache; this delegates every call to the
       * session's shared one and records the outcome, so the observation cannot change what the play does. The scheduler
       * that follows gets the *unwrapped* loader, so its notes are the same cache entries the wait just filled.
       */
      const observed = new Map<string, SamplerLedgerAsset>();
      const observingLoader = observingSamplerLoader(loader, assets, observed);

      const preparation = await prepareSamplerLanes({
        pattern,
        catalogue: assets,
        loader: observingLoader,
        bpm: engine.getBpm(),
        lanes,
        /**
         * `total: 0` is the ordinary case for a lane that writes no pitch — every drum lane, whose notes the engine's own
         * table voices — and an indicator raised for it would be a progress display for work that never happened. It is
         * also the measured `edm-trap` answer: two mapped lanes, zero notes to fetch.
         */
        onProgress: (progress) => setSamplerPreparation(progress.total > 0 ? progress : null),
      });
      setSamplerPreparation(null);
      const reported = reportSampledLaneProblems([...reasons, ...preparation.problems]);
      setSamplerProblems(reported);
      publishSamplerPlay({
        entry: "/studio",
        ...(pattern.genre_id === undefined ? {} : { genre: pattern.genre_id }),
        at: new Date().toISOString(),
        lanes: ledgerLanes,
        laneCount: pattern.tracks?.length ?? 0,
        assets: [...observed.values()],
        progress: preparation.total > 0 ? { loaded: preparation.loaded, total: preparation.total } : null,
        ready: preparation.ready,
        empty: preparation.empty,
        problems: reported,
        loaderBuilds: sharedSamplerLoaderBuilds(),
        decodes: loader.decodes() - decodesBefore,
      });
      return preparation.ready || preparation.empty;
    },
    []
  );

  /**
   * Transport toggle play.
   *
   * `play()` is async and its `ctx.resume()` can reject or simply leave the context suspended
   * (the iOS silent switch, a browser that wants a fresh gesture). The old code called it without
   * awaiting and then set `isPlaying` unconditionally, so on those devices the transport lit up,
   * the playhead ran and no sound came out — and the rejection was unhandled, so nothing reported
   * it either. The UI was asserting success it could not observe.
   *
   * Now playback is only reported as started when it actually is, and a blocked context says so.
   */
  const handleTogglePlay = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) {
      /**
       * U7: this used to return in silence, so the first Play press — before the engine instance
       * exists — looked like a dead button. Say what is actually happening.
       */
      showToast(t("transport_engine_not_ready"));
      announcer.announce(t("transport_announce_engine_not_ready"));
      return;
    }
    triggerHaptic(HapticPatterns.playPause);
    if (isPlaying) {
      /**
       * ⭐ **This is a pause, and it has to behave like one.**
       *
       * The button is painted with the word Pause (`Toolbar.tsx` swaps `toolbar_play`/`toolbar_pause` on the same
       * `isPlaying` flag) and this branch used to call `engine.stop()` and `clearPlayhead()` — so the label promised
       * a pause and the transport returned to bar one. The owner reported exactly that: "it becomes Pause while
       * playing, but pressing Pause is a stop and the playhead goes back to the top."
       *
       * `pause()` keeps the step, so the next Play continues from here (`AudioEngine.play` consumes the position
       * `pause` preserved). The playhead is deliberately **not** cleared: it is the picture of the position that was
       * just kept, and clearing it would be the same rewind drawn somewhere else.
       */
      engine.pause();
      /**
       * ⭐ **The sampler half is silenced by name, because the transport cannot reach it.** A recorded note is already on
       * the audio clock and `engine.pause()` releases only the engine's own voices, so without this a "Pause" would leave
       * the piano and the bass playing over a playhead that has stopped — the label promising one thing and the sound
       * doing another.
       */
      recordedLanesRef.current?.stop();
      setIsPlaying(false);
      refreshCanStop();
      announcer.announce(t("transport_playback_paused"));
      return;
    }

    // Asking for the arrangement releases any leftover lane scope before the transport starts.
    releasePreviewScope?.();

    /**
     * ⭐ **The recordings are ready before the transport is.**
     *
     * The pattern is the store's own active slot — `patternForSlot`, the same read `handleSwitchSlot` uses — so what is
     * warmed is by construction the pattern the engine will play. A press whose recordings could not be prepared does not
     * start a transport at all: it reports why, which is the difference between a slow start and a silent one.
     */
    const pattern = patternForSlot(seqStateRef.current, seqStateRef.current.activeSlot);
    /**
     * ⭐ **The press takes a ticket, and the ticket is raised before the first `await`.**
     *
     * `setTransportPreparation("preparing")` here rather than inside `prepareRecordings` is the whole
     * difference between "the button says 准备中 the frame you press it" and "the button says nothing
     * for one manifest round trip" — measured on the live build at load 16.6: the first visible wait
     * state arrived **3 204 ms** after the click, and `clickToRunning` was **12 524 ms**. React
     * flushes this update when the handler yields at the `await` below, i.e. before the next paint,
     * so the state is on screen for the entire wait it describes.
     */
    const ticket = preparationTicketRef.current + 1;
    preparationTicketRef.current = ticket;
    if (recordedLanesRef.current !== undefined && pattern !== undefined) {
      setTransportPreparation("preparing");
      announcer.announce(t("transport_preparing_announce"));
      const canStart = await prepareRecordings(engine, pattern);
      /**
       * A later press owns the wait now, so this run starts nothing. That is what makes "press again"
       * a **retry** rather than a second transport: the abandoned run cannot call `engine.play()`.
       */
      if (preparationTicketRef.current !== ticket) return;
      if (!canStart) {
        /**
         * ⭐ **A failure is a state with a way out, not silence.**
         *
         * The reasons are already on the page (`sampler-problems`, raised by `prepareRecordings`); what
         * was missing is that the *button* says what happened and that pressing it again is a retry.
         */
        setTransportPreparation("failed");
        setIsPlaying(false);
        refreshCanStop();
        showToast(t("transport_preparation_failed"));
        announcer.announce(t("transport_preparation_failed"));
        return;
      }
    }

    try {
      /**
       * ⭐ **The engine is told which lanes it must not voice, before it is asked to play.**
       *
       * A genre lane whose `instrument` the written table maps (`piano_lead`, `walking_upright`, `strings_lead`, …) is a
       * **recording**, and the engine's own sequencer would otherwise play the built-in preset underneath it — the piano
       * doubled by a pad. `prepareSampledLanes` is the one call that decides it, and the decision needs the catalogue:
       * a lane whose recording this session cannot serve keeps the synthesiser (the owner's stated fallback) and is
       * named in the returned problems.
       *
       * Called with **whatever the runtime already holds** and again when the load resolves below, so a session that has
       * played once — or that loaded the catalogue for any other reason — stands every recorded lane down *before* the
       * first step. On a cold first play the stand-down lands one catalogue fetch late, which is stated rather than
       * hidden: the alternative is making the play button wait on a network round trip before it starts.
       *
       * ⭐ **Skipped when a recorded-lane scheduler was handed in**, because `prepareRecordings` already made exactly this
       * call — with the catalogue it awaited rather than with whatever happened to be in hand — and a second call would
       * only re-derive the same set. A surface with no scheduler keeps this line unchanged, which is what keeps this
       * change invisible to every other caller of this hook.
       */
      if (recordedLanesRef.current === undefined) {
        const alreadyLoaded = appCatalogueRuntime.assets;
        if (alreadyLoaded.length > 0) engine.prepareSampledLanes(alreadyLoaded);
      }
      await engine.play();

      /**
       * ⭐ **The wait ends the moment there is a transport to wait for, and only for the press that owns it.**
       *
       * A stale run leaves the state alone: the press that replaced it is still waiting, and clearing
       * the wait from an abandoned run would be the button going quiet in the middle of the thing it
       * is describing.
       */
      if (preparationTicketRef.current === ticket) setTransportPreparation("idle");

      /**
       * ⭐ **The recorded lanes are placed once the transport is running, from the bytes the wait above already fetched.**
       *
       * This is the half that was missing: `prepareSampledLanes` stands the synthesiser down and plays nothing, so
       * without this call a mapped lane on `/studio` is silent. The order — transport, then lanes — is
       * `useRecordedLanes`'s and the genre page's: the notes are placed on the clock `play()` has just started, and the
       * warm loader makes that placement a cache hit rather than a download, so an onset lands where its step says.
       */
      if (recordedLanesRef.current !== undefined && pattern !== undefined) {
        recordedLanesRef.current.start(pattern);
      }

      /**
       * Audio lanes, started **beside** the transport rather than inside the engine.
       *
       * The engine knows only patterns — a song is an app-layer object — so the caller that owns the arrangement is the one that can hand the lanes their song, their context and the same
       * mixing destination the engine uses for everything else. Guarded three ways so this cannot alter existing behaviour: no `arrangementSong` (the default), no resolved song, or no live
       * context all mean nothing happens.
       *
       * **And it never blocks playback**: the promise is swallowed, exactly as the engine swallows its own GS1 probe, because a lane that cannot load must not stop the rest of the song from
       * playing. Problems are reported on the console rather than as a toast, since this path runs at transport start where a modal interruption would be worse than a log line.
       */
      const song = arrangementSong?.();
      const context = engine.audioContext;
      const destination = engine.musicDestination;
      if (song && context && destination) {
        /**
         * **The catalogue has to be fetched before the lanes can resolve anything.**
         *
         * The previous commit passed no catalogue, so the path fell back to the shipped empty one and would have stayed silent **even with a mirror configured** — the wiring was inert for a
         * reason that had nothing to do with the missing credentials. Loaded here, at playback start, rather than at app start: it is one fetch per session thanks to the runtime's own
         * single-flight, and a session that never plays an audio lane never pays for it.
         */
        void appCatalogueRuntime
          .load()
          .then(({ assets }) => {
            /**
             * ⭐ **The stand-down lands here on a cold first play**, once the catalogue has actually answered — and this is
             * also where a lane whose recording this mirror does not serve is named, so "a synthesiser, and here is what to
             * do about it" reaches the console instead of being silent.
             */
            const prepared = engine.prepareSampledLanes(assets);
            for (const problem of prepared.problems) console.warn(`[sampled-instrument] ${problem}`);
            return playAudioLanes({ song: song as never, context, destination, catalogue: assets });
          })
          .then((result) => {
            for (const problem of result.problems) console.warn(`[audio-lane] ${problem}`);
          })
          .catch((error: unknown) => console.warn(`[audio-lane] ${error instanceof Error ? error.message : String(error)}`));
      }
    } catch (error) {
      // A rejected resume is a real failure worth reporting, not a reason to claim playback.
      console.warn("[transport] playback could not start", error);
      // And the button stops claiming to wait: a wait that will never end is the state this change exists to remove.
      if (preparationTicketRef.current === ticket) setTransportPreparation("idle");
    }

    if (engine.isAudioBlocked()) {
      /**
       * Schedulers are running but the output is silent. Stopping is the honest state: leaving it
       * "playing" would advance the playhead over a track nobody can hear, and the user would
       * judge the app by the silence.
       */
      engine.stop();
      /**
       * The sampler half as well, for the same reason the Pause branch stops it: its voices are on the audio clock, and
       * an "audio is blocked" notice over a still-sounding recorded lane would be a second claim the app cannot observe.
       */
      recordedLanesRef.current?.stop();
      setIsPlaying(false);
      clearPlayhead();
      refreshCanStop();
      showToast(t("transport_audio_blocked"));
      announcer.announce(t("transport_audio_blocked_announce"));
      return;
    }

    setIsPlaying(true);
    refreshCanStop();
    announcer.announce(t("transport_playback_started"));
  }, [isPlaying, clearPlayhead, engineRef, refreshCanStop, showToast, t, releasePreviewScope, prepareRecordings]);

  /**
   * ⭐ **Stop: the one control that returns to the top, added because a real Pause removed the only way back.**
   *
   * The Pause button used to *be* a stop, so the transport could be rewound from it — by accident, under a label that
   * promised something else. Once Pause really paused, the studio had no control that returned to bar one at all, and
   * an action that disappears is worse than a button that is missing: the toolbar's Play/Pause is a toggle, so there
   * was no second press that could do it. This is that action, beside the toggle and shaped like the arrangement's own
   * Stop, and it is disabled unless it would do something (`canReturnToStart`).
   *
   * The keyboard is deliberately **not** extended: Space stays Play/Pause, which is the toggle the plan binds it to.
   */
  const handleStop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    triggerHaptic(HapticPatterns.playPause);
    engine.stop();
    // The recorded voices again: `engine.stop()` reaches the engine's own schedule and not a note already placed.
    recordedLanesRef.current?.stop();
    setIsPlaying(false);
    clearPlayhead();
    refreshCanStop();
    announcer.announce(t("transport_playback_stopped"));
  }, [clearPlayhead, engineRef, refreshCanStop, t]);

  const handleUndo = useCallback(() => {
    const prev = undo();
    // U7: an empty history and a broken button looked identical from the outside.
    if (!prev) {
      const empty = t("transport_nothing_to_undo");
      showToast(empty);
      announcer.announce(empty);
      return;
    }
    // The store is already rolled back; syncing the engine is best-effort and must not silence the
    // confirmation when the engine happens not to be ready yet.
    const engine = engineRef.current;
    if (engine) {
      engine.setPattern(prev.pattern);
      engine.setBpm(prev.bpm);
      engine.setSwing(prev.swing / 100);
      engine.setTimeSignature(prev.timeSignature);
      engine.setResolution(prev.resolution);
    }
    triggerHaptic(HapticPatterns.undoRedo);
    const done = t("transport_undo_done");
    showToast(done);
    announcer.announce(done);
  }, [undo, t, showToast]);

  const handleRedo = useCallback(() => {
    const next = redo();
    if (!next) {
      const empty = t("transport_nothing_to_redo");
      showToast(empty);
      announcer.announce(empty);
      return;
    }
    const engine = engineRef.current;
    if (engine) {
      engine.setPattern(next.pattern);
      engine.setBpm(next.bpm);
      engine.setSwing(next.swing / 100);
      engine.setTimeSignature(next.timeSignature);
      engine.setResolution(next.resolution);
    }
    triggerHaptic(HapticPatterns.undoRedo);
    const done = t("transport_redo_done");
    showToast(done);
    announcer.announce(done);
  }, [redo, t, showToast]);

  const handleSwitchSlot = useCallback(
    (slot: ClipSlot) => {
      commit({ type: "SWITCH_PATTERN_SLOT", slot });
      // A slot the project does not hold is not a pattern to hand the engine; the transport keeps what it has.
      const slotPattern = patternForSlot(seqStateRef.current, slot);
      if (slotPattern && engineRef.current) engineRef.current.setPattern(slotPattern);
    },
    [commit]
  );

  const handleCopySlot = useCallback(
    (from: ClipSlot, to: ClipSlot) => {
      commit({ type: "COPY_PATTERN_SLOT", from, to });
      showToast(t("transport_slot_copied", { from, to }));
    },
    [commit, t, showToast]
  );

  /**
   * U7: a mode toggle that changes state without a word is the "I clicked and nothing happened"
   * case — four of them used to be exactly that. Every toggle now says (and announces) the state it
   * just moved to, which is also what a screen reader needs to hear.
   */
  const reportMode = useCallback(
    (enabled: boolean, onKey: string, offKey: string) => {
      const message = t(enabled ? onKey : offKey);
      showToast(message);
      announcer.announce(message);
    },
    [showToast, t]
  );

  const handleToggleSongMode = useCallback(() => {
    const enabled = !seqStateRef.current.songMode;
    commit({ type: "TOGGLE_SONG_MODE" });
    reportMode(enabled, "transport_mode_song_on", "transport_mode_song_off");
  }, [commit, reportMode]);

  const handleToggleBlindCompare = useCallback(() => {
    const enabled = !seqStateRef.current.blindTestMode;
    commit({ type: "TOGGLE_BLIND_TEST" });
    reportMode(enabled, "transport_mode_blind_on", "transport_mode_blind_off");
  }, [commit, reportMode]);

  const handleToggleMetronome = useCallback(() => {
    const enabled = !seqStateRef.current.isMetronome;
    commit({ type: "SET_METRONOME", enabled });
    reportMode(enabled, "transport_mode_metronome_on", "transport_mode_metronome_off");
  }, [commit, reportMode]);

  const handleToggleCountIn = useCallback(() => {
    const enabled = !seqStateRef.current.isCountIn;
    commit({ type: "SET_COUNT_IN", enabled });
    reportMode(enabled, "transport_mode_count_in_on", "transport_mode_count_in_off");
  }, [commit, reportMode]);

  return {
    handleTapTempo,
    handleToggleDrumsOnly,
    handleTogglePlay,
    handleStop,
    canStop,
    handleUndo,
    handleRedo,
    handleSwitchSlot,
    handleCopySlot,
    handleToggleSongMode,
    handleToggleBlindCompare,
    handleToggleMetronome,
    handleToggleCountIn,
    samplerPreparation,
    samplerProblems,
    transportPreparation,
  };
}
