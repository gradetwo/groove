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
  audioContext: BaseAudioContext;
  musicDestination: AudioNode;
}

export interface PlayerDependencies {
  engine: EngineAudioTap;
  /** Loading the catalogue; in the application `appCatalogueRuntime.load`, in a criterion a promise that resolves or rejects. */
  loadCatalogue: () => Promise<{ assets: readonly SampleAsset[] }>;
}

export function createArrangementPlayer({ engine, loadCatalogue }: PlayerDependencies): ArrangementPlayer {
  return {
    async play(song) {
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
