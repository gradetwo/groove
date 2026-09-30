/**
 * Turning an engine into the player a v2 arrangement needs — the seam between "the application has an `AudioEngine`" and "a view can play an arrangement".
 *
 * The engine lives in the studio's world as a ref, while `/new` is a route outside it. Rather than reaching into that ref — which would tie a new project's lifetime to a view it was built to be independent of —
 * this takes the things the player actually needs and nothing else: **a context and a destination** for the audition and the sampler steps, and **the engine's own transport** for the notes.
 *
 * **The transport is here because the first version of this seam could not play a note.** It exposed only `audioContext` and `musicDestination`, so `play` went to `playAudioLanes`, which starts one sample per
 * lane per bar and only for a lane whose `track_id` is `"audio"` — a drumkit or instrument lane compiled with four steps on produced zero events and play was silent. The engine's sequencer (`setPattern` +
 * `play`, which is how the studio plays a real pattern) was not reachable at all. Widening the seam is the whole fix; the player's job is then to hand it a pattern.
 *
 * **A catalogue that fails to load is reported, not thrown.** The sampler lane needs it to resolve an instrument; a lane with no instrument is a stated refusal rather than an exception in a click handler,
 * which would show the user nothing at all.
 */
import type { ArrangementPlayer } from "./playArrangementV2";
import type { SampleAsset } from "../data/sampleCatalogue";
import { browserSampleDecoder } from "./browserSampleGraph";
import { createSampleLoader, type SampleDecoder } from "./sampleLoader";
import { startSamplerNote, type SamplerVoice } from "./samplerVoice";
import { planSamplerSteps, scheduleSamplerSteps } from "./samplerSteps";
import type { AudioEngine } from "./AudioEngine";
import type { SequencerPattern } from "../types/genre";

/**
 * What an engine has to offer — the getters `AudioEngine` already exposes, named so a fake is honest rather than a reimplementation.
 *
 * `setPattern`/`play`/`stop`/`setBpm` are **optional**, because an engine-shaped object without them still supports the audition, and a caller that hands one over should hear why the transport half does not
 * work rather than see a `TypeError`. The signatures are `AudioEngine`'s own, so the two cannot drift.
 */
export interface EngineAudioTap {
  /**
   * ⭐ **Nullable, because the engine exists before its audio does** — an `AudioEngine` can be constructed and not yet have a context, and the type error that revealed this was telling the truth rather than
   * being an inconvenience. `useTransportControls` already says why it matters: a press before the engine exists is indistinguishable from a broken button, so the state has to be sayable.
   */
  audioContext: BaseAudioContext | null;
  musicDestination: AudioNode | null;
  /** The pattern the sequencer plays. Absent means "this engine cannot play notes", which `play` reports rather than assumes. */
  setPattern?: (pattern: SequencerPattern, resetStates?: boolean) => void;
  play?: AudioEngine["play"];
  stop?: AudioEngine["stop"];
  /** The arrangement's tempo, so a note's beat is the length the arrangement says rather than the studio's last. */
  setBpm?: AudioEngine["setBpm"];
}

export interface PlayerDependencies {
  engine: EngineAudioTap;
  /** Loading the catalogue; in the application `appCatalogueRuntime.load`, in a criterion a promise that resolves or rejects. */
  loadCatalogue: () => Promise<{ assets: readonly SampleAsset[] }>;
  /**
   * The two I/O seams `createSampleLoader` already takes, injected here for the same reason it takes them: an audition is a network fetch and a decode, and a criterion that had to provide both would be judging the browser rather than the pitch.
   */
  decode?: SampleDecoder;
  fetchSfzText?: (url: string) => Promise<string>;
}

export function createArrangementPlayer({ engine, loadCatalogue, decode, fetchSfzText }: PlayerDependencies): ArrangementPlayer {
  /**
   * The voices a preview has started, so a key release can stop them and a fast player cannot leave a pile of sources running. Bounded: a keyboard cannot press more keys at once than a person has fingers, but a stuck key or a repeated `keydown` with
   * `event.repeat` ignored is exactly how an unbounded list happens.
   */
  const voices = new Map<number, SamplerVoice[]>();
  const MAX_VOICES_PER_NOTE = 8;
  /**
   * The sampler steps `play` scheduled, separately from `voices`, because a transport stop is not a key release: it silences everything the arrangement started, whereas `releaseNote` names one key.
   */
  const scheduled: SamplerVoice[] = [];

  const audition = async ({ assetId, midi, trackId, gainDb }: { assetId: string; midi: number; trackId?: string; gainDb?: number }) => {
    if (engine.audioContext === null || engine.musicDestination === null) {
      // Reported rather than thrown, the same way `play` reports a missing engine: a key press that throws is worse than one that is silent for a stated reason.
      return { ok: false as const, reason: "audio engine is not ready" };
    }
    const { assets } = await loadCatalogue();
    const loader = createSampleLoader(
      decode ?? browserSampleDecoder(engine.audioContext),
      assets,
      // The default fetches; a criterion passes its own so the note resolution is what is judged.
      fetchSfzText
    );
    try {
      const note = await loader.loadNote(assetId, midi);
      const voice = startSamplerNote({
        context: engine.audioContext,
        destination: engine.musicDestination,
        buffer: note.buffer,
        ratio: note.ratio,
        ...(gainDb === undefined ? {} : { gainDb }),
      });
      const key = keyFor(trackId, midi);
      const list = voices.get(key) ?? [];
      list.push(voice);
      voices.set(key, list.slice(-MAX_VOICES_PER_NOTE));
      return { ok: true as const, ratio: note.ratio, samplePath: note.samplePath };
    } catch (error) {
      // A refusal from the loader is a result here too: the key press is answered with why, and the instrument's own gaps are named rather than turned into silence.
      return { ok: false as const, reason: error instanceof Error ? error.message : String(error) };
    }
  };

  /**
   * Stop every voice `play` started, and report how many.
   *
   * Also called at the top of `play`, so pressing play twice replaces the arrangement rather than layering it — the same discipline `AudioEngine.play` shows by returning early when it is already playing.
   */
  const stopScheduled = (): number => {
    // Drained first: `stop` is a voice's own method, so nothing in this loop can re-enter the list it is walking.
    const started = scheduled.splice(0);
    for (const voice of started) voice.stop();
    return started.length;
  };

  return {
    async play({ pattern, samplerLanes, bpm }) {
      // ⭐ Nothing to play into yet, or nothing that can sequence. Reported rather than thrown, because a throw inside a click handler shows the user nothing at all.
      if (engine.audioContext === null || engine.musicDestination === null) {
        // eslint-disable-next-line no-console -- the same shape the transport uses when the engine is not ready
        console.warn("audio engine is not ready; nothing was played");
        return { planned: 0, reason: "audio engine is not ready" };
      }
      if (!engine.setPattern || !engine.play) {
        // The audition half of this seam needs neither, so a caller can hand over an engine-shaped object without a transport. Saying so is better than the `TypeError` that would otherwise reach the click handler.
        // eslint-disable-next-line no-console -- the same shape the transport uses when the engine is not ready
        console.warn("audio engine has no transport; the arrangement was not played");
        return { planned: 0, reason: "audio engine has no transport" };
      }

      /**
       * The tempo first, then the pattern: `setPattern` derives nothing about tempo unless it is asked to reset state, and the arrangement's own `bpm` is the length of a beat that every step time is computed from.
       */
      engine.setBpm?.(bpm);
      engine.setPattern(pattern);

      /**
       * Nothing from a previous play survives this one: a scheduled note cannot be unscheduled once it is on the audio clock, so pressing play again silences the old arrangement rather than layering the
       * two. Done **before** the catalogue is awaited, so a second press has already taken effect by the time the first press's load resolves.
       */
      stopScheduled();

      /**
       * **The transport starts before the samples are resolved.** `AudioEngine.play` marks the first step a fixed lead ahead of `currentTime`, and every sampler note is placed from `currentTime` afterwards —
       * so starting first is what puts the two on one grid. Starting after would offset the whole sampler lane by however long the catalogue took to answer, which is the kind of skew that sounds like a
       * performance problem rather than a scheduling one.
       */
      await engine.play();

      /**
       * The sampler lanes' notes are **not** what the engine was just handed. Its sequencer voices a step by `track_id` and has no SFZ loader, so a sampler step is resolved here through the same loader the
       * audition uses, per step, and started on the audio clock. A lane whose instrument cannot be resolved is reported in the result rather than left as silence with no explanation.
       */
      let problem: string | undefined;
      const samplerSteps = planSamplerSteps(samplerLanes);
      if (samplerSteps.length > 0) {
        let assets: readonly SampleAsset[] = [];
        try {
          assets = (await loadCatalogue()).assets;
        } catch (error) {
          // The engine can still play the lanes that need no catalogue; the sampler steps are what cannot, and that is the reported reason.
          problem = `sampler notes were not resolved: catalogue unavailable (${error instanceof Error ? error.message : String(error)})`;
          // eslint-disable-next-line no-console -- the same shape the transport uses when the catalogue is unavailable
          console.warn("catalogue unavailable; the arrangement's sampler steps are silent", error);
        }
        if (assets.length > 0) {
          const sampler = createSampleLoader(decode ?? browserSampleDecoder(engine.audioContext), assets, fetchSfzText);
          const report = await scheduleSamplerSteps(samplerSteps, {
            context: engine.audioContext,
            destination: engine.musicDestination,
            loader: sampler,
            bpm,
          });
          scheduled.push(...report.voices);
          /**
           * **Assigned, not appended**: the catalogue warning above was about a load that has now succeeded, and leaving it beside a schedule that worked would report a failure that is no longer true. A
           * resolution that did fail still reports itself, because `report.problems` is what replaces it.
           */
          problem = report.problems.length > 0 ? report.problems.join("; ") : undefined;
        }
      }

      // What was planned is the steps the engine was handed: the pattern is the arrangement, and zero is the honest answer when every lane is empty.
      const planned = pattern.tracks.reduce((total, lane) => total + lane.steps.filter((value) => value !== 0).length, 0);
      return problem === undefined ? { planned } : { planned, problem };
    },
    stop: stopScheduled,
    audition,
    releaseNote({ trackId, midi }) {
      const key = keyFor(trackId, midi);
      const list = voices.get(key);
      if (!list) return 0;
      voices.delete(key);
      for (const voice of list) voice.stop();
      return list.length;
    },
  };
}

/**
 * A voice is keyed by **track and note**, which is what a key release names. Without the track, two sampler tracks playing the same note would stop each other — and with only the note, a piano's sustain would be cut by the next track's key press.
 */
function keyFor(trackId: string | undefined, midi: number): number {
  // A caller that does not name a track still gets its own key space: a keyboard preview on "the selected track" should not collide with one on another.
  const track = trackId ?? "";
  let hash = midi;
  for (let index = 0; index < track.length; index += 1) hash = (hash * 31 + track.charCodeAt(index)) % 2 ** 31;
  return hash;
}
