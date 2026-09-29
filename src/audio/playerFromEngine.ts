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
}

export function createArrangementPlayer({ engine, loadCatalogue }: PlayerDependencies): ArrangementPlayer {
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
  };
}
