import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "../audio/AudioEngine";
import { getActiveAudioEngine, setActiveAudioEngine } from "../audio/activeEngine";
import { createArrangementPlayer } from "../audio/playerFromEngine";
import { appCatalogueRuntime } from "../data/sampleCatalogueRuntime";
import { useLanguage } from "../i18n/LanguageContext";
import { catalogueNoticeFor, describeRuntimeStatus } from "../data/sampleCatalogueStatus";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { instrumentChoicesFromAssets } from "../components/arrangement/CatalogueRecordingPicker";
import type { InstrumentChoice } from "../components/arrangement/TrackListV2";
import { useAudioEngineInstance } from "../features/sequencer/hooks/useAudioEngineInstance";
import { useArrangementV2Project } from "../features/arrangement/arrangementStore";
import { installProbeHooks, uninstallProbeHooks } from "../platform/probeHooks";
import type { CaptureOutcome } from "../audio/captureTake";

export interface NewProjectViewProps {
  /** ⭐ **Start playing once the engine exists**, when the onboarding asked for it: consumed by the arrangement view. */
  initialAutoPlay?: boolean;
  /** ⭐ Retire that request once it has been honoured, so a later mount does not start playing again. */
  onClearInitialAutoPlay?: () => void;
  capture: () => Promise<CaptureOutcome>;
  /**
   * ⭐ **The arrangement project this route was asked to open, when the URL named one.**
   *
   * Absent is the route's original meaning — "reopen the arrangement I last had" — and present is what the Project Hub
   * needs: a saved arrangement that a person picked out of a list. It arrives as a prop rather than from `useRouter`
   * because this view is rendered by `App`, which is where the route lives; a second reader of the same route is how
   * two surfaces come to disagree about which project is open.
   */
  arrangementId?: string;
  /** ⭐ The help opener from `App`, handed on to the arrangement surface. */
  onOpenHelp?: (chapterId?: string) => void;
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
export function useNewProjectEngine(): { engine: AudioEngine | null; engineRef: React.MutableRefObject<AudioEngine | null> } {
  const { engineRef } = useAudioEngineInstance();
  const [engine, setEngine] = useState<AudioEngine | null>(null);

  useEffect(() => {
    const instance = engineRef.current;
    if (!instance) return;
    setActiveAudioEngine(instance);
    instance.primeAudioContext();
    setEngine(instance);
    /**
     * ⭐ **The measurement seam, on this route too — `?probe=1` only, and nothing at all otherwise.**
     *
     * The seam was installed by the studio's lifecycle and by the genre audition, and this route has neither: it builds
     * its engine through `useAudioEngineInstance`, which installs nothing. So a probe on `/new` could reach no engine —
     * `getSchedulerHealth()` was unreadable there, and a reading that should have been "the scheduler dropped N steps"
     * came out as `0 - 0` from two `undefined`s. The jank report this exists for *is* this route (import a MIDI, press
     * play), so the reading has to be available where the symptom is.
     *
     * It exposes exactly what a measurement needs and cannot guess — the engine — and it is torn down with the engine, so
     * a probe can never reach a destroyed transport. There is no sequencer store on this route, so `readState`/`commit`
     * are honestly absent rather than faked.
     */
    const probeInstalled = installProbeHooks({ engine: instance });
    return () => {
      if (probeInstalled) uninstallProbeHooks();
      // Only clear the slot if it is still ours. Leaving this route must not unregister an engine that replaced it, and the studio may register its own in the same commit.
      if (getActiveAudioEngine() === instance) setActiveAudioEngine(null);
      setEngine(null);
    };
  }, [engineRef]);

  /**
   * ⭐ **Both the engine and its ref**, because the MIDI input hook needs the ref: a device event arrives later than the render
   * that subscribed, and reading `engineRef.current` at that moment is the difference between playing a note and playing the
   * engine that existed when the listener was attached.
   */
  return { engine, engineRef };
}

export function NewProjectView({ capture, onProjectNameChange, arrangementId, initialAutoPlay, onClearInitialAutoPlay , onOpenHelp}: NewProjectViewProps) {
  const { engine, engineRef } = useNewProjectEngine();
  const { t } = useLanguage();
  const [instruments, setInstruments] = useState<InstrumentChoice[]>([]);
  /**
   * ⭐ **The stored project** — the whole persistence story for this route: it is read once, here, and every change the
   * arrangement reports is written back through it. `project === null` means "nothing saved yet", which is exactly the
   * condition Logic's chooser exists for.
   *
   * ⭐ **`arrangementId` is the difference between "reopen" and "open this one".** The Hub lists arrangements, so a row
   * has to be able to say which project it means; without it the list could only ever reopen the most recent one,
   * which is the state the survey measured as "no way to open a saved arrangement".
   */
  const store = useArrangementV2Project(
    arrangementId === undefined ? {} : { projectId: arrangementId, repoint: true }
  );
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
  /**
   * ⭐ **The catalogue's state is said here too, not swallowed** (third evaluation, F10).
   *
   * This route read `{ assets }` and dropped everything else on the floor: `load()` never rejects — it records what went
   * wrong in `problems` and answers with whatever it could resolve — so the `.catch` here could not run, and a manifest
   * that 404'd, answered HTML instead of JSON, or yielded nothing resolvable looked exactly like the shipped
   * "no mirror configured" state: an empty instrument list with no explanation. The evaluation's F10 is that silence,
   * and `describeCatalogueStatus` already exists to break it into the five phases that send a composer to different
   * actions — the studio's chooser uses it, this route did not.
   */
  const [catalogueNotice, setCatalogueNotice] = useState<{ summary: string; detail: string[] } | null>(null);
  const loadCatalogue = useCallback(() => {
    return appCatalogueRuntime.load().then(({ assets }) => {
      setInstruments(instrumentChoicesFromAssets(assets));
      // ⭐ Which phases deserve a sentence is one decision, in `sampleCatalogueStatus`, shared with the studio's chooser.
      setCatalogueNotice(catalogueNoticeFor(describeRuntimeStatus(appCatalogueRuntime)));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadCatalogue().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loadCatalogue]);

  const player = useMemo(
    () => (engine ? createArrangementPlayer({ engine, loadCatalogue: () => appCatalogueRuntime.load() }) : undefined),
    [engine]
  );

  /**
   * ⭐ **The route is what joins the arrangement's loop brace to the engine's transport.**
   *
   * The brace is stored in bars and the engine's `setLoopRange` takes steps; the conversion belongs to the view that
   * draws the ruler (`features/arrangement/loopSteps.ts`), and this route supplies the one thing the view cannot have
   * — the live `AudioEngine`. It is a **bound call rather than the method itself**: `AudioEngine.setLoopRange` reads
   * `this.loopRange`, so a method handed over unbound would throw on the first brace move, which is exactly the class
   * of breakage a prop named `setTransportLoopRange` is easy to introduce.
   *
   * `undefined` while the engine is still being constructed rather than a no-op: the view's own prop being absent is
   * how it says "no transport to loop", and an empty function would claim one that does nothing.
   */
  const setTransportLoopRange = useCallback(
    (range: [number, number] | null) => engine?.setLoopRange(range),
    [engine]
  );

  /**
   * ⭐ **The same seam for the other half of the ruler: where the transport actually is.**
   *
   * A ruler click is a **seek**, and the engine is the only thing that owns a position — so the view is handed
   * `AudioEngine.seek` the way it is handed `setLoopRange`: in the engine's own unit (**steps**, converted by the view
   * that draws the bars) and bound for the same reason (`seek` reads `this.currentStep` and `this.totalSteps`).
   *
   * Absent while the engine is still being constructed, so the view's "there is no transport to move" is the prop's
   * absence rather than an empty function claiming one.
   */
  const seekTransport = useCallback((step: number) => engine?.seek(step), [engine]);

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
    <>
      {/**
        * ⭐ **The reason, where the instruments would be** (finding F10), with the failing address from `problems` and a
        * retry that calls the same load — the runtime reports failures rather than caching them, precisely so a retry can
        * work. It disappears as soon as the catalogue is readable.
        */}
      {catalogueNotice && (
        <div
          data-testid="catalogue-notice"
          className="mx-3 mt-3 rounded-lg border border-line bg-panel2/60 px-3 py-2 text-xs text-text-sub"
        >
          <div className="flex items-center justify-between gap-3">
            <span>{catalogueNotice.summary}</span>
            <button
              type="button"
              data-testid="catalogue-retry"
              className="shrink-0 rounded border border-line px-2 py-1 text-[11px] text-text"
              onClick={() => {
                setCatalogueNotice(null);
                void loadCatalogue().catch(() => undefined);
              }}
            >
              {t("catalogue_retry")}
            </button>
          </div>
          {catalogueNotice.detail.map((line) => (
            <div key={line} className="mt-1 font-['JetBrains_Mono'] text-[10px] text-text-dim">
              {line}
            </div>
          ))}
        </div>
      )}
      <ArrangementViewV2
      songId="new"
      player={player}
      engineRef={engineRef}
          onOpenHelp={onOpenHelp}
      // ⭐ The onboarding's auto-play request travels the same way the route choice does: the caller passes the capability down.
      {...(initialAutoPlay === undefined ? {} : { initialAutoPlay })}
      {...(onClearInitialAutoPlay === undefined ? {} : { onClearInitialAutoPlay })}
      capture={capture}
      instruments={instruments}
      {...(engine === null ? {} : { setTransportLoopRange, seekTransport })}
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
    </>
  );
}
