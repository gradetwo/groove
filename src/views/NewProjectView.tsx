import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "../audio/AudioEngine";
import { getActiveAudioEngine, setActiveAudioEngine } from "../audio/activeEngine";
import { createArrangementPlayer } from "../audio/playerFromEngine";
import { appCatalogueRuntime } from "../data/sampleCatalogueRuntime";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { instrumentChoicesFromAssets } from "../components/arrangement/CatalogueRecordingPicker";
import type { InstrumentChoice } from "../components/arrangement/TrackListV2";
import { useAudioEngineInstance } from "../features/sequencer/hooks/useAudioEngineInstance";
import { useArrangementV2Project } from "../features/arrangement/arrangementStore";
import type { CaptureOutcome } from "../audio/captureTake";

export interface NewProjectViewProps {
  capture: () => Promise<CaptureOutcome>;
  /**
   * ⭐ **What the top bar should call this project**, reported by the view that actually owns the name.
   *
   * A prop rather than a context or a router field, for the reason `HeaderProps.onNewProject` records: the header is
   * rendered outside the router's provider in every criterion that addresses it, and a context it cannot see takes
   * those criteria down. The name travels the same way the route choice does — the caller passes the capability down.
   */
  onProjectNameChange?: (name: string | undefined) => void;
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

export function NewProjectView({ capture, onProjectNameChange }: NewProjectViewProps) {
  const engine = useNewProjectEngine();
  const [instruments, setInstruments] = useState<InstrumentChoice[]>([]);
  /**
   * ⭐ **The stored project** — the whole persistence story for this route: it is read once, here, and every change the
   * arrangement reports is written back through it. `project === null` means "nothing saved yet", which is exactly the
   * condition Logic's chooser exists for.
   */
  const store = useArrangementV2Project();
  /**
   * ⭐ **The name is kept in a ref as well as in state, and the effect reads the ref.**
   *
   * `onProjectNameChange` is optional and a caller may pass a fresh closure on every render; depending on the prop
   * would then re-run the effect on every render of this route. Depending on the *name* alone is what the effect is
   * actually about.
   */
  const notifyName = useRef(onProjectNameChange);
  notifyName.current = onProjectNameChange;
  const projectName = store.project?.name;
  useLayoutEffect(() => {
    // `undefined` before anything is stored, so the top bar says nothing rather than "Untitled" over an empty route.
    notifyName.current?.(projectName);
  }, [projectName]);
  useEffect(
    () => () => {
      /**
       * ⭐ **Leaving the route clears the name**, because the bar names the project that is *open* and this one no longer
       * is. Without it, going back to the studio would leave the arrangement's name above a project that is not it —
       * which is a smaller version of the very defect this change is about.
       */
      notifyName.current?.(undefined);
    },
    []
  );

  /**
   * The instruments the catalogue actually holds, read from the same load the player uses. An instrument is an asset with an SFZ — the catalogue's own definition rather than a name that happens to look like one — and the list is
   * allowed to stay empty: a deployment whose manifest carries no instrument then offers no chooser instead of an empty one.
   *
   * ⭐ **The mapping itself lives in `CatalogueRecordingPicker`, beside the studio's chooser**, because the genre
   * route grew the same one and two copies of "what an instrument is" would be the "two places, one thing" failure
   * this codebase keeps removing. It is one function, called by both routes.
   */
  useEffect(() => {
    let cancelled = false;
    void appCatalogueRuntime
      .load()
      .then(({ assets }) => {
        if (cancelled) return;
        setInstruments(instrumentChoicesFromAssets(assets));
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

  /**
   * ⭐ **Nothing is drawn until the stored project has been read.**
   *
   * The read is asynchronous, and rendering the arrangement before it resolves would draw the chooser for one frame —
   * over work that is about to arrive. A refresh that flashes "New Project" and then shows the arrangement is the same
   * defect as a refresh that loses it, only quieter. The engine and the catalogue are still loading behind this, so the
   * wait is not added to the critical path.
   */
  if (store.loading) return null;

  return (
    <ArrangementViewV2
      songId="new"
      player={player}
      capture={capture}
      instruments={instruments}
      {...(store.project === null ? {} : { initialArrangement: store.project.arrangement })}
      {...(store.loadProblem === null ? {} : { loadProblem: store.loadProblem })}
      /**
       * ⭐ **The chooser's Create names the project and stores it before the arrangement is drawn.** The panel decided
       * the name, so the name is what is stored; what the arrangement is made of stays the panel's other two answers.
       */
      onCreateProject={(name, arrangement) => {
        store.create(name, arrangement);
        // Immediate, not on the store's next render: the top bar must name the project on the click that made it.
        notifyName.current?.(name.trim() || undefined);
      }}
      onArrangementChange={store.report}
    />
  );
}
