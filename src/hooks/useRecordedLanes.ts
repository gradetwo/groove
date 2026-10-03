/**
 * **"This engine owns a transport; make its recorded lanes audible" — the wiring, in one place, for every view that
 * builds or borrows an engine.**
 *
 * ## The defect this exists to remove, and the one it exists to make impossible
 *
 * A lane whose instrument the palette maps (`sax_lead`, `walking_upright`, `punchy_kick`, …) is a **recording**, and two
 * separate things have to happen for it to be heard:
 *
 *   1. `AudioEngine.prepareSampledLanes` tells the engine which lanes are recordings, and **all it does is stand the
 *      synthesiser down** for them. It plays nothing;
 *   2. `createSamplerLanePlayback` places those lanes' notes from their own bytes, and keeps doing so across the
 *      transport's wraps.
 *
 * Calling only the first is **worse than the defect**: a lane that played the wrong instrument becomes a lane that plays
 * nothing. That pairing used to be written by hand at every entry point — `GenreDetailView`, `useAudioEngineInstance`,
 * `useGenreAudition` — and the surfaces that were written without it are exactly the ones the owner found silent (the
 * genre audition: *"no SFZ requests at all"*), then the custom-genre preview, the ear-training arena and the A/B
 * comparison. The genre page and the audition were repaired first and still call `createSamplerLanePlayback` through
 * this hook's own seam; these four now go through the hook itself.
 *
 * ## Why a hook rather than a line in each view
 *
 * The catalogue is loaded once per session (`appCatalogueRuntime` is single-flight) and the controller has to be held so
 * that a stop **and** a mode switch can silence it. Both are state with a lifetime, so both belong to a hook:
 *
 *   · `startRecordedLanes(pattern)` — stand the synthesiser down, then schedule, then keep the controller;
 *   · `stopRecordedLanes()` — silence every voice this started, and report how many.
 *
 * The engine is read through a **getter**, not passed by value, because two of the callers replace their engine
 * (`ChallengeView` builds a fresh one per question) and a captured reference would schedule into an engine nobody is
 * listening to. That is the same shape `useGenreAudition` uses, and the reason `playerFromEngine`'s own merge kept its
 * `engine` as the live object.
 *
 * The catalogue is *not* re-fetched per call: `catalogueRef` is the session's assets, and a view whose engine is
 * replaced only has to hand over the new one.
 */
import { useCallback, useEffect, useRef } from "react";
import { appCatalogueRuntime } from "../data/sampleCatalogueRuntime";
import {
  createSamplerLanePlayback,
  type SamplerLaneEngine,
  type SamplerLanePlayback,
} from "../audio/samplerLanePlayback";
import { reportSampledLaneProblems } from "../audio/sampledLanes";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { SequencerPattern } from "../types/genre";

/**
 * The engine surface this hook needs: the controller's own seam, plus the tempo the notes are placed at.
 *
 * ⭐ It is {@link SamplerLaneEngine} rather than a third hand-written shape, so a view that hands over a real
 * `AudioEngine`, the hook's own instance, or a criterion's double is describing the same object every other recorded-lane
 * path describes. `getBpm` is the one addition — the step length and the notes' onsets are both read from it, so a view
 * that has just called `setBpm` does not have to repeat the number here.
 */
export interface RecordedLaneEngine extends SamplerLaneEngine {
  getBpm: () => number;
}

export interface UseRecordedLanesResult {
  /**
   * Stand the synthesiser down for this pattern's recorded lanes and schedule them from their own bytes.
   *
   * Call it **after** `engine.setPattern(pattern)` — the stand-down set is cleared on every pattern change — and after
   * `engine.play()`, because the voices are placed on the engine's clock. Returns the controller, whose `sounding` is
   * what a criterion reads, or `null` when there is no engine yet.
   */
  startRecordedLanes: (pattern: SequencerPattern) => Promise<SamplerLanePlayback | null>;
  /** Silence whatever {@link startRecordedLanes} started, and how many voices that stopped. */
  stopRecordedLanes: () => number;
}

export function useRecordedLanes(getEngine: () => RecordedLaneEngine | null): UseRecordedLanesResult {
  /** The catalogue this session resolved, kept so a lane set later is resolved against it without a second fetch. */
  const catalogueRef = useRef<readonly SampleAsset[] | null>(null);
  /** The recorded lanes currently scheduled, so a stop can silence them and a second start can replace them. */
  const lanesRef = useRef<SamplerLanePlayback | null>(null);

  /**
   * The catalogue is fetched whether or not anything is playing: it is one request per session (`appCatalogueRuntime` is
   * single-flight), and a route that only auditions should not have to play a pass of synthesiser first. A failure is
   * reported and not cached by the runtime, so the next mount tries again — and it must never stop the view's own
   * playback, which is why nothing here throws or blocks.
   */
  useEffect(() => {
    let cancelled = false;
    void appCatalogueRuntime
      .load()
      .then(({ assets }) => {
        if (cancelled) return;
        catalogueRef.current = assets;
      })
      .catch((error: unknown) => {
        // eslint-disable-next-line no-console -- a catalogue that cannot be read leaves every recorded lane on its synthesiser, and that must not be silent
        console.warn(
          "[sampled-instrument] the sample catalogue could not be loaded, so recorded lanes keep their synthesised voices",
          error
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stopRecordedLanes = useCallback((): number => {
    const stopped = lanesRef.current?.stop() ?? 0;
    lanesRef.current = null;
    return stopped;
  }, []);

  /**
   * The voices are on the audio clock, which the engine's `destroy()` does not reach — so a view that unmounts while
   * something is sounding stops it by name here rather than relying on the teardown. The cleanup returns nothing: React
   * wants a destructor, not a count.
   */
  useEffect(
    () => () => {
      stopRecordedLanes();
    },
    [stopRecordedLanes]
  );

  const startRecordedLanes = useCallback(
    async (pattern: SequencerPattern): Promise<SamplerLanePlayback | null> => {
      const engine = getEngine();
      if (!engine) return null;
      const catalogue = catalogueRef.current ?? [];
      /**
       * ⭐ **The stand-down and the scheduler, in that order, and neither is optional.**
       *
       * `prepareSampledLanes` is called with whatever the catalogue holds: it stands the synthesiser down for exactly the
       * lanes whose asset is **really there**, and hands back a sentence for every mapped lane this mirror cannot serve —
       * which `reportSampledLaneProblems` makes visible instead of leaving the fallback silent. A catalogue that has not
       * answered yet is not an error: the lane keeps its synthesiser, which is the owner's stated fallback for "the
       * recording is not there".
       *
       * The scheduler then places those lanes from their own bytes. `AudioEngine.prepareSampledLanes` is the only engine
       * class in the app and every double is engine-shaped, but a criterion may hand over a partial one, so the call is
       * asked for rather than assumed — the same discipline `useGenreAudition` states. A missing stand-down is a
       * **louder** fallback, never a silent one: the sentence for every unserved lane is reported here.
       */
      const prepared = engine.prepareSampledLanes?.(catalogue);
      if (prepared) reportSampledLaneProblems(prepared.problems);
      stopRecordedLanes();
      const playback = createSamplerLanePlayback({
        engine,
        pattern,
        catalogue,
        bpm: engine.getBpm(),
        /**
         * **Deliberately not a second `reportSampledLaneProblems`.** The controller asks this on the first pass, before
         * any note is placed, so an engine whose stand-down has not run yet (a catalogue that answered between the two
         * calls above) still never doubles a lane. Reporting it twice would print every unserved-lane sentence twice,
         * which is how a report stops being read.
         */
        speak: (assets) => {
          engine.prepareSampledLanes?.(assets);
        },
        warn: (message) => {
          // eslint-disable-next-line no-console -- the same prefix and shape `useTransportControls` reports lane problems with
          console.warn(message);
        },
      });
      lanesRef.current = playback;
      await playback.play(engine.getBpm());
      /**
       * ⭐ **A start that was replaced while it resolved must not own the lane.**
       *
       * `play()` is a fetch and a decode, so a fast second press — a genre skip, a mode switch — can land while the
       * first pass is still resolving. The later call has already taken `lanesRef`; this one silences its own voices and
       * leaves the reference alone, so the lane that is heard is the one the user asked for last.
       */
      if (lanesRef.current !== playback) {
        playback.stop();
        return playback;
      }
      return playback;
    },
    [getEngine, stopRecordedLanes]
  );

  return { startRecordedLanes, stopRecordedLanes };
}
