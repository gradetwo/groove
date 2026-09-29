import React, { useEffect, useMemo, useState } from "react";
import { AudioEngine } from "../audio/AudioEngine";
import { getActiveAudioEngine, setActiveAudioEngine } from "../audio/activeEngine";
import { createArrangementPlayer } from "../audio/playerFromEngine";
import { appCatalogueRuntime } from "../data/sampleCatalogueRuntime";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { libraryOfAsset, type InstrumentChoice } from "../components/arrangement/TrackListV2";
import { useAudioEngineInstance } from "../features/sequencer/hooks/useAudioEngineInstance";
import type { CaptureOutcome } from "../audio/captureTake";

export interface NewProjectViewProps {
  capture: () => Promise<CaptureOutcome>;
}

/**
 * The new-project route, with its own audio engine.
 *
 * This route renders the arrangement **instead of** the studio, and the engine used to be created only inside studio interfaces (`useAudioEngineLifecycle`, called from `StudioView` and `ConsolePanel`). So on this route nothing
 * ever constructed one, the player prop stayed undefined, and the button honestly reported "audio engine not connected yet" — an interface that could not make a sound.
 *
 * The studio's lifecycle is not the right thing to reuse here: its `onStep` callback drives the studio playhead out of sequencer state, and this route has no sequencer — playback is driven by `createArrangementPlayer`.
 * What this route needs is only a live engine, registered where the entry gate can reach it.
 *
 * Registration matters because the gate sits above the app and starts audio inside its own tap. Two consequences, both handled here: the engine registers on mount so the gate can prime it, and it primes itself on mount
 * because by the time this route renders the gate has usually already been tapped — and a tap that happened earlier cannot reach an engine created later. That was the shape of a bug this project already recorded: the
 * context was created lazily on first play, so at gate time there was nothing registered to resume, and the first playback after the gate still reported audio as blocked until a second tap.
 */
/**
 * A live engine for a route that has no sequencer, registered where the entry gate can reach it.
 *
 * Exported so the properties that matter can be judged without rendering the arrangement: that it registers, that it primes, that it clears the slot only when the slot is still its own, and that the engine is released on
 * unmount.
 */
export function useNewProjectEngine(): AudioEngine | null {
  const { engineRef } = useAudioEngineInstance();
  const [engine, setEngine] = useState<AudioEngine | null>(null);

  useEffect(() => {
    const instance = engineRef.current;
    if (!instance) return;
    setActiveAudioEngine(instance);
    instance.primeAudioContext();
    setEngine(instance);
    return () => {
      // Only clear the slot if it is still ours. Leaving this route must not unregister an engine that replaced it, and the studio may register its own in the same commit.
      if (getActiveAudioEngine() === instance) setActiveAudioEngine(null);
      setEngine(null);
    };
  }, [engineRef]);

  return engine;
}

export function NewProjectView({ capture }: NewProjectViewProps) {
  const engine = useNewProjectEngine();
  const [instruments, setInstruments] = useState<InstrumentChoice[]>([]);

  /**
   * The instruments the catalogue actually holds, read from the same load the player uses. An instrument is an asset with an SFZ — the catalogue's own definition rather than a name that happens to look like one — and the list is
   * allowed to stay empty: a deployment whose manifest carries no instrument then offers no chooser instead of an empty one.
   */
  useEffect(() => {
    let cancelled = false;
    void appCatalogueRuntime
      .load()
      .then(({ assets }) => {
        if (cancelled) return;
        setInstruments(
          assets
            .filter((asset) => asset.sfz)
            // The library comes from the id rather than from a second lookup: a multi-instrument library names its programs `entry:program`, and the entry is the library.
            .map((asset) => ({ assetId: asset.assetId, name: asset.name, library: libraryOfAsset(asset.assetId) }))
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const player = useMemo(
    () => (engine ? createArrangementPlayer({ engine, loadCatalogue: () => appCatalogueRuntime.load() }) : undefined),
    [engine]
  );

  return <ArrangementViewV2 songId="new" player={player} capture={capture} instruments={instruments} />;
}
