/**
 * **Sounding the recorded lanes of a plain pattern — the one entry point every engine-owning playback path shares.**
 *
 * ## The defect this exists to remove
 *
 * A genre whose lanes the palette maps (`sax_lead`, `walking_upright`, …) must sound those recordings. Two things are
 * needed for that, and they live on **different** paths:
 *
 *   1. `AudioEngine.prepareSampledLanes` tells the engine which lanes are recordings — and **all it does is stand the
 *      synthesiser down for them** (`AudioEngine.ts`, the `sampledLaneIndexes` guard in the step loop). It plays
 *      nothing;
 *   2. the bytes are sounded by a scheduler — `playAudioLanes` (the studio's transport) or `planSamplerSteps` +
 *      `scheduleSamplerSteps` (the arrangement player).
 *
 * The studio and the arrangement called both. The genre detail page's audition and the timeline's shuffle called
 * **neither**, so a mapped lane kept its built-in synthesiser and the owner could see the result in the network panel:
 * *"no SFZ requests at all"*. And the first repair — calling the stand-down alone — was **worse than the bug**: it turned
 * a lane that played the wrong instrument into a lane that played nothing.
 *
 * ## Why one entry point rather than a line in each view
 *
 * "Which lanes are recordings" is decided in exactly one place (`sampledAssetForLane`), and "what a lane's steps sound
 * like" in exactly one place (`planSamplerSteps`, which already reads genre lanes as well as v2 sampler tracks). What was
 * missing was the third piece — **owning the voices across a looping transport** — and writing that twice is how two
 * paths start to differ. So this module owns it once:
 *
 *   · **one pass on the audio clock** (`scheduleSamplerSteps` places every voice ahead of time);
 *   · ⭐ **re-planned on every loop wrap**, because the engine's own lanes wrap by themselves: without this the two
 *     halves of a looping bar diverge on the second pass, which was measured on the arrangement path first
 *     (`playerFromEngine.ts`). The wrap time comes from the transport's own callback — it schedules ahead, and only it
 *     knows when the new pass begins — with a timer as the fallback for an engine that reports no wrap;
 *   · **every voice silenced on stop**, and the loop handler with them, so a stopped lane cannot schedule a pass nobody
 *     will hear.
 *
 * ⭐ **And "once" is enforced, not asserted.** The arrangement player (`playerFromEngine.ts`) had a second copy of all
 * three of those bullets, and it was the older one: this module exists because the genre audition and the timeline's
 * shuffle were written without it. The player now **uses this controller** — its own plan, its own wrap handler and its
 * own `scheduled` list are gone — so the two cannot drift again. The player keeps the parts that are genuinely its own
 * (the transport's play/pause/stop, the catalogue, the audition keyboard) and hands this controller the three things it
 * needs to know that the controller cannot guess: the lanes it already resolved (`lanes`), the loader built from its own
 * decode/fetch seams (`loaderFor`), and the stand-down call (`speak`).
 *
 * ## What it deliberately does not do
 *
 * It does not choose which lanes are recordings: `sampledAssetForLane` does, and a lane with no palette row — or whose
 * asset this catalogue does not carry — is absent from the plan and keeps the synthesiser it has always had, which is the
 * owner's stated fallback. It does not swallow a failure either: `problems` is reported through `warn`, and the caller
 * can compose it into its own report.
 */
import { createSampleLoader, type SampleLoader } from "./sampleLoader";
import { browserSampleDecoder } from "./browserSampleGraph";
import { planSamplerSteps, scheduleSamplerSteps } from "./samplerSteps";
import type { SamplerVoice } from "./samplerVoice";
import { sampledAssetForLane } from "../data/sampledInstruments";
import { STEPS_PER_BEAT } from "../data/noteEvents";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { SequencerPattern, SequencerTrack } from "../types/genre";

/** How long a step lasts, from the tempo — the same arithmetic the engine's own grid uses. */
function stepSecondsFor(bpm: number | undefined): number {
  const tempo = bpm && bpm > 0 ? bpm : 120;
  return 60 / tempo / STEPS_PER_BEAT;
}

/** The steps in one pass of a pattern: its own statement, or the longest lane when it does not state one. */
function passStepCount(pattern: Pick<SequencerPattern, "totalSteps" | "tracks">): number {
  const stated = pattern.totalSteps;
  if (typeof stated === "number" && stated > 0) return stated;
  return Math.max(0, ...(pattern.tracks ?? []).map((track) => track.steps?.length ?? 0));
}

/**
 * The lanes of a pattern whose sound is a catalogue recording, in the shape {@link planSamplerSteps} takes.
 *
 * The lane's ordinal is **not** carried: `planSamplerSteps` numbers its own input positionally, and that number is what
 * the legato ledger groups by, so deriving a second identity for the same lane here would be the "two places, one
 * thing" failure this codebase keeps removing.
 */
export function samplerLanesOf(
  pattern: Pick<SequencerPattern, "tracks">
): { sourceTrackId: string; lane: SequencerTrack }[] {
  const lanes: { sourceTrackId: string; lane: SequencerTrack }[] = [];
  (pattern.tracks ?? []).forEach((track) => {
    if (!sampledAssetForLane(track)) return;
    lanes.push({ sourceTrackId: track.track_id ?? track.name ?? `lane-${lanes.length}`, lane: track });
  });
  return lanes;
}

/**
 * The recorded lanes that would actually be **heard** right now.
 *
 * ⭐ **The same rule the arrangement's sampler path uses** (`playArrangementV2.audible`), and it is needed here for the
 * same reason: the genre page's "Audition Drums Only" mutes the non-drum lanes on the engine, and a scheduler that
 * ignored that would play the bass and the piano over a mode whose whole promise is that they are silent. A soloed lane
 * anywhere makes every un-soloed lane inaudible, exactly as the engine's own dispatch does.
 *
 * A lane the engine does not know is **audible**, which is the safe default: the alternative would silence a recorded
 * lane because a different pattern happened to be loaded.
 */
export function audibleSamplerLanesOf(
  pattern: Pick<SequencerPattern, "tracks">,
  getTrackState: (index: number) => { mute?: boolean; solo?: boolean } | undefined,
  getTrackStates: () => readonly { mute?: boolean; solo?: boolean }[]
): { sourceTrackId: string; lane: SequencerTrack }[] {
  const states = getTrackStates();
  const anySolo = states.some((state) => state?.solo);
  const audible = (index: number): boolean => {
    const state = getTrackState(index) ?? states[index];
    if (state === undefined) return true;
    return !state.mute && !(anySolo && !state.solo);
  };
  const lanes: { sourceTrackId: string; lane: SequencerTrack }[] = [];
  (pattern.tracks ?? []).forEach((track, index) => {
    if (!sampledAssetForLane(track)) return;
    if (!audible(index)) return;
    lanes.push({ sourceTrackId: track.track_id ?? track.name ?? `lane-${lanes.length}`, lane: track });
  });
  return lanes;
}

/**
 * The engine surface this controller uses — narrower than `AudioEngine` so a criterion can drive it without a graph.
 *
 * ⭐ **It is also the shape a player is handed, because there are two of them.** `playerFromEngine.EngineAudioTap` is
 * this plus the arrangement's own transport surface (the observation callbacks, the tempo, the position), and it
 * **extends** this interface so a caller cannot find one half and miss the other: the merge of the two plan/wrap/stop
 * implementations is only honest if both are still describing the same engine.
 */
export interface SamplerLaneEngine {
  audioContext: BaseAudioContext | null;
  musicDestination?: AudioNode | null;
  /**
   * The lanes this engine has been told to stand its synthesiser down for — the other half of a recorded lane, and
   * **not this controller's business**: the caller decides which lanes are recordings and when the catalogue says so
   * (`speak` below is that call, handed in rather than invented here). It lives on the seam so the player can pass its
   * own, and it is optional for the same reason the rest of the surface is: an engine-shaped double that only plays is
   * not asked to answer a question it never claimed.
   */
  prepareSampledLanes?: (catalogue: readonly SampleAsset[]) => { stoodDown: number[]; problems: readonly string[] };
  /**
   * Fired with the time the new pass begins, which is the only thing that knows it: the transport schedules ahead.
   * Written by this controller while it is running and restored when it stops.
   */
  onLoopWrap?: (wrapTimeSeconds: number) => void;
  /**
   * The lane states, so a muted lane is not sounded by this path either. Optional: an engine-shaped double that only
   * plays is not asked to answer a question it never claimed, and every lane is treated as audible for it.
   */
  getTrackState?: (index: number) => { mute?: boolean; solo?: boolean } | undefined;
  getTrackStates?: () => readonly { mute?: boolean; solo?: boolean }[];
}

/** One recorded lane: the bytes, and the track a failure can name. The shape `planSamplerSteps` takes. */
export interface SamplerLane {
  sourceTrackId: string;
  lane: SequencerTrack;
}

/** What one `play` is asked for beyond the tempo — the arrangement player's resume position. */
export interface SamplerLanePlayRequest {
  /**
   * ⭐ **Resume at this step instead of at the top**, for a transport that was paused and continued: the engine's own
   * lanes pick up where its `pause()` left them, and these lanes are placed outside it, so without this the two halves
   * of one looping arrangement would disagree about where the pass is. Passed straight through to
   * `scheduleSamplerSteps.fromStep`, where the arithmetic lives.
   */
  fromStep?: number;
}

export interface SamplerLanePlayback {
  /**
   * Place the first pass and keep the lane whole across the transport's wraps.
   *
   * Returns a promise for the **first pass's** scheduling, so a caller that wants to know a note was resolved can await
   * it; the wrap handler is installed synchronously, before that promise settles, so a wrap that arrives early is not
   * missed.
   */
  play(bpm: number, request?: SamplerLanePlayRequest): Promise<void>;
  /** Silence everything this controller started, and stop it planning further passes. Returns how many voices it stopped. */
  stop(): number;
  /** How many voices this controller still owns — what a criterion reads to see that a stop really stopped them. */
  readonly sounding: number;
}

export interface SamplerLanePlaybackOptions {
  engine: SamplerLaneEngine;
  /** The pattern to sound. Held rather than re-taken, so a wrap re-plans the pass that is playing. */
  pattern: SequencerPattern;
  /** The catalogue the lanes were resolved against, so the loader reads the same assets the resolver did. */
  catalogue: readonly SampleAsset[];
  /** The pattern's tempo, which is both the step length and the number every note's onset is placed from. */
  bpm: number;
  /**
   * ⭐ **The lanes to sound, when the caller has already picked them.**
   *
   * Omitted — the genre audition, the custom-genre preview — the controller asks the **one resolver**
   * (`sampledAssetForLane`) for the pattern's recorded lanes and filters them by the engine's mute state. That is the
   * common case: a whole pattern, auditioned.
   *
   * Handed in — the arrangement player — the lanes were chosen by `playArrangementV2`, which also applied
   * `deriveTrackStates`' audibility rule to a compiled arrangement the engine's own track states do not describe
   * (the sampler trains are index-aligned with the compiled lanes, and asking the engine would answer about a
   * different pattern). Sounding the caller's own list is therefore not a second mapping: it is the same list the
   * arrangement already resolved, and re-deriving it here would be the second copy this module exists to prevent.
   */
  lanes?: readonly SamplerLane[];
  /**
   * ⭐ **Build the loader from the catalogue, lazily and once.**
   *
   * A caller with its own decode/fetch seams and a loader it wants shared across passes passes this; a caller with
   * neither passes `loader`. The factory is called at most once per `play`, before the first pass is scheduled, and the
   * loader it returns is reused by every wrap — a loader that went out of scope with the first pass is exactly how a
   * looping lane goes silent on the second.
   */
  loaderFor?: (catalogue: readonly SampleAsset[], context: BaseAudioContext) => SampleLoader;
  /** Injected by a criterion so a note is judged without fetching or decoding. */
  loader?: SampleLoader;
  /**
   * ⭐ **The stand-down, handed in rather than assumed.**
   *
   * `AudioEngine.prepareSampledLanes` is the caller's step: it must run *after* the engine has been given the pattern
   * (because `setPattern` clears the stand-down set on purpose), and the catalogue it is called with is the catalogue
   * the caller loaded. The controller calls `speak` with the assets its loader is about to read, on the first pass and
   * **before** any note is scheduled — so the window in which a lane could be doubled, or silenced by only one half,
   * does not exist. A controller with no `speak` is the genre audition, which has already done it.
   */
  speak?: (catalogue: readonly SampleAsset[]) => void;
  /**
   * The first pass's schedule problems, in the caller's own report shape.
   *
   * ⭐ It exists because the arrangement's `play` answers a click handler with a `problem` sentence, while the hook
   * reports through `console.warn`: one controller, two honest ways to say a note did not resolve. Only the **first**
   * pass is reported — a problem on pass seven must not change what the press was answered with.
   */
  onFirstPassProblems?: (problems: readonly string[]) => void;
  /** Reported rather than thrown: this runs from a click handler, and a throw there shows the user nothing. */
  warn?: (message: string) => void;
}

/**
 * Create the controller for one engine and one pattern.
 *
 * ⚠️ **`prepareSampledLanes` is deliberately not called here.** That is the caller's step, and it must run *after* the
 * engine has been given the pattern (`setPattern` clears the stand-down set on purpose), whereas this controller may be
 * created before either. Keeping the two apart is what makes "the lane was silenced" and "the lane was sounded"
 * separately observable — the distinction whose loss made the first repair worse than the defect.
 */
export function createSamplerLanePlayback({
  engine,
  pattern,
  catalogue,
  bpm,
  lanes: givenLanes,
  loaderFor,
  loader,
  speak,
  onFirstPassProblems,
  warn,
}: SamplerLanePlaybackOptions): SamplerLanePlayback {
  /**
   * ⚠️ **Called *on* the engine, not detached from it.** `AudioEngine.getTrackState` reads `this.trackStates`, so a
   * destructured reference throws `Cannot read properties of undefined (reading 'trackStates')` — and that failure is
   * invisible from the outside: the recorded lane simply never sounds, which is the very symptom this module exists to
   * remove. Measured in a browser on the genre page before it was fixed.
   *
   * A caller that already chose its lanes is **believed**, for the reason {@link SamplerLanePlaybackOptions.lanes}
   * states: asking the engine about a compiled arrangement's lanes would answer about a different pattern.
   */
  const lanes =
    givenLanes ??
    (typeof engine.getTrackState === "function" && typeof engine.getTrackStates === "function"
      ? audibleSamplerLanesOf(
          pattern,
          (index) => engine.getTrackState!.call(engine, index),
          () => engine.getTrackStates!.call(engine)
        )
      : samplerLanesOf(pattern));
  const events = planSamplerSteps(lanes, { bpm });

  /** The voices placed so far, drained by `stop`. A voice already on the audio clock cannot be un-scheduled. */
  let voices: SamplerVoice[] = [];
  /** Bumped by every `play` and every `stop`, so a late resolution from a previous run cannot revive it. */
  let generation = 0;
  let tail: ReturnType<typeof setTimeout> | null = null;
  let active = false;
  /** Whatever owned `onLoopWrap` before this controller, so it is restored rather than lost. */
  const previousLoopWrap = engine.onLoopWrap;
  /**
   * ⭐ **One loader for the whole run, built on the first pass.**
   *
   * The loader carries the decode cache and the expanded-program cache, so building a fresh one per pass would
   * re-download and re-parse the instrument on every wrap — the regression `playerFromEngine`'s criterion records
   * ("`loadNote` always asks for the text" stopped being true when the loader started caching). A caller that injected
   * a `loader` keeps it; otherwise the factory is called once, here.
   */
  let runLoader: SampleLoader | null = loader ?? null;
  /** The steps of a resumed pass are skipped; this is the caller's request, held for the wraps that follow. */
  let fromStep: number | undefined;
  /**
   * ⭐ **The stand-down runs once per `play`, before the first note is placed, and it is not optional decoration.**
   *
   * It is the half that silences the built-in synthesiser for a recorded lane. Reported through `warn` rather than
   * swallowed, because "this lane keeps its synthesiser" is only the owner's stated fallback when someone has been told
   * it is happening; the caller's own `onFirstPassProblems` carries the schedule half.
   */
  let spokeThisRun = false;

  const clearTail = () => {
    if (tail !== null) {
      clearTimeout(tail);
      tail = null;
    }
  };

  const handleWrap = (wrapTimeSeconds: number): void => {
    previousLoopWrap?.(wrapTimeSeconds);
    if (!active) return;
    /**
     * A later pass that cannot be planned must not become an unhandled rejection, and must not re-report: pass one's
     * report is what the caller was answered with, and a problem on pass seven is not a reason to change what it said.
     */
    void place(wrapTimeSeconds).catch(() => undefined);
  };

  /** Place one pass, starting it at `startSeconds` (or now), and keep the voices it returns. */
  const place = async (startSeconds?: number): Promise<void> => {
    if (events.length === 0) return;
    const context = engine.audioContext;
    const destination = engine.musicDestination ?? null;
    if (context === null || destination === null) return;
    if (!spokeThisRun) {
      spokeThisRun = true;
      speak?.(catalogue);
    }
    if (runLoader === null) {
      runLoader = loaderFor ? loaderFor(catalogue, context) : createSampleLoader(browserSampleDecoder(context), catalogue);
    }
    const mine = generation;
    const report = await scheduleSamplerSteps(events, {
      context,
      destination,
      loader: runLoader,
      bpm,
      ...(startSeconds === undefined ? {} : { startSeconds }),
      ...(fromStep === undefined ? {} : { fromStep }),
    });
    for (const problem of report.problems) warn?.(`[sampled-instrument] ${problem}`);
    if (mine === generation) onFirstPassProblems?.(report.problems);
    // A stop or a fresh play that happened while this pass was resolving owns the lane now, not this pass.
    if (mine !== generation) {
      for (const voice of report.voices) {
        try {
          voice.stop();
        } catch {
          /* a voice that never started is not an error */
        }
      }
      return;
    }
    voices.push(...report.voices);
  };

  return {
    async play(bpmFromCaller: number, request: SamplerLanePlayRequest = {}): Promise<void> {
      // A pattern with no recorded lane is the normal case: this controller does nothing to it and says nothing.
      if (events.length === 0) return;
      if (engine.audioContext === null || (engine.musicDestination ?? null) === null) {
        warn?.("[sampled-instrument] recorded lanes were not sounded: the audio engine is not ready");
        return;
      }
      active = true;
      generation += 1;
      spokeThisRun = false;
      fromStep = request.fromStep && request.fromStep > 0 ? request.fromStep : undefined;
      clearTail();
      /**
       * ⭐ **The wrap handler is installed before the first pass is awaited**, because the first pass is a network
       * fetch and a decode: a transport that wrapped while it resolved would otherwise have no handler yet and the
       * lane would fall silent on the second pass.
       */
      engine.onLoopWrap = handleWrap;
      await place();
      if (!active) return;
      /**
       * The timer is the **fallback**, for an engine that reports no wrap (`onLoopWrap` is optional on the seam, and a
       * double may not implement it). A real `AudioEngine` fires the callback; both paths plan one pass each time.
       *
       * ⭐ **A resumed pass is shorter by the steps it skipped.** The engine's own lanes continue from the held step,
       * so the fallback must re-plan at the point that pass ends rather than one whole pattern later — otherwise a
       * paused-then-resumed arrangement would place its second pass in the wrong bar.
       */
      clearTail();
      const tempo = bpmFromCaller && bpmFromCaller > 0 ? bpmFromCaller : bpm;
      const remainingSteps = Math.max(0, passStepCount(pattern) - (fromStep ?? 0));
      const pass = remainingSteps * stepSecondsFor(tempo);
      tail = setTimeout(() => {
        if (!active) return;
        fromStep = undefined;
        void place((engine.audioContext?.currentTime ?? 0) + pass).catch(() => undefined);
      }, Math.max(0, pass) * 1000);
    },

    stop(): number {
      active = false;
      generation += 1;
      clearTail();
      // Only if it is still ours: a caller that replaced the handler while we ran must keep its own.
      if (engine.onLoopWrap === handleWrap) engine.onLoopWrap = previousLoopWrap;
      // Drained first: `stop` is a voice's own method, so nothing in this loop can re-enter the list it is walking.
      const started = voices;
      voices = [];
      for (const voice of started) {
        try {
          voice.stop();
        } catch {
          // A voice that has already ended is not an error: stopping twice must not throw over the lane beside it.
        }
      }
      return started.length;
    },

    get sounding(): number {
      return voices.length;
    },
  };
}
