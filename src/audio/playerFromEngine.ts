/**
 * Turning an engine into the player a v2 arrangement needs — the seam between "the application has an `AudioEngine`" and "a view can play an arrangement".
 *
 * The engine lives in the studio's world as a ref, while `/new` is a route outside it. Rather than reaching into that ref — which would tie a new project's lifetime to a view it was built to be independent of —
 * this takes the two things the player actually needs and nothing else: **a context and a destination**, which is exactly what `playAudioLanes` consumes.
 *
 * **A catalogue that fails to load is reported, not thrown.** `playAudioLanes` can still plan from the app's own catalogue, and a network failure while fetching the manifest must not become an exception in a
 * click handler — the interface would show nothing at all, which is the failure mode this workstream keeps removing.
 */
import { playAudioLanes } from "./audioLanePlayback";
import type { ArrangementPlayer } from "./playArrangementV2";
import type { SampleAsset } from "../data/sampleCatalogue";
import { browserSampleDecoder } from "./browserSampleGraph";
import { createSampleLoader, type SampleDecoder } from "./sampleLoader";
import { startSamplerNote, type SamplerVoice } from "./samplerVoice";

/** What an engine has to offer — the getters `AudioEngine` already exposes, named so a fake is honest rather than a reimplementation. */
export interface EngineAudioTap {
  /**
   * ⭐ **Nullable, because the engine exists before its audio does** — an `AudioEngine` can be constructed and not yet have a context, and the type error that revealed this was telling the truth rather than
   * being an inconvenience. `useTransportControls` already says why it matters: a press before the engine exists is indistinguishable from a broken button, so the state has to be sayable.
   */
  audioContext: BaseAudioContext | null;
  musicDestination: AudioNode | null;
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

  return {
    async play(song) {
      // ⭐ Nothing to play into yet. Reported as a zero plan rather than thrown, for the same reason the catalogue failure below is: a throw inside a click handler shows the user nothing at all.
      if (engine.audioContext === null || engine.musicDestination === null) {
        // eslint-disable-next-line no-console -- the same shape the transport uses when the engine is not ready
        console.warn("audio engine is not ready; nothing was played");
        return { planned: 0 };
      }

      let catalogue: readonly SampleAsset[] = [];
      try {
        catalogue = (await loadCatalogue()).assets;
      } catch (error) {
        // ⭐ Reported in the result rather than thrown: the engine can still plan, and a click handler that throws shows the user nothing.
        // eslint-disable-next-line no-console -- the same shape the transport uses when the catalogue is unavailable
        console.warn("catalogue unavailable; planning without it", error);
      }
      return playAudioLanes({
        song: song as never,
        context: engine.audioContext,
        destination: engine.musicDestination,
        catalogue: catalogue as never,
      });
    },
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
