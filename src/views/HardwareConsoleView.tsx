import React, { useEffect, useState } from "react";
import { Genre } from "../types/genre";
import { AudioEngine } from "../audio/AudioEngine";
import { useSequencerStore } from "../features/sequencer/useSequencerStore";
import { getDefaultDrumKitForGenre } from "../utils/trackUtils";
import { ConsolePanel } from "../components/console/ConsolePanel";
import { installProbeHooks, uninstallProbeHooks } from "../platform/probeHooks";

interface HardwareConsoleViewProps {
  selectedGenre?: Genre;
  onOpenStudio?: (genre: { id: string }) => void;
  onOpenHelp?: () => void;
}

/**
 * N-01 / P8-02 — standalone `/console` route.
 *
 * This route owns the engine and the store (it is the only thing mounted for the
 * desk), then hands both to the shared presentational `ConsolePanel`. The floated
 * console inside `StudioView` renders the very same panel with the studio's engine
 * and store instead — one audio graph, one pattern state, two entry points.
 */
export const HardwareConsoleView: React.FC<HardwareConsoleViewProps> = ({
  selectedGenre: initialGenre,
  onOpenStudio,
  onOpenHelp,
}) => {
  const startingGenre = initialGenre as Genre;
  const store = useSequencerStore(startingGenre);
  const [engine, setEngine] = useState<AudioEngine | null>(null);

  // StrictMode-safe creation: the effect owns one engine and destroys it on unmount.
  useEffect(() => {
    const created = new AudioEngine();
    setEngine(created);
    return () => {
      created.destroy();
      setEngine(null);
    };
  }, []);

  /**
   * ⭐ **The measurement seam on the console route, with the store this route actually owns.**
   *
   * `?probe=1` used to reach `readState`/`commit` only through the studio route; that route now renders the **arrangement**
   * (`NewProjectView`: "This route renders the arrangement **instead of** the studio"), which installs the engine and no
   * store — so `scripts/probe_arrangement_playback.mjs` lost its surface while the feature it verifies (sections and song
   * mode) stayed alive **here**. This view is the one that owns both the engine and `useSequencerStore`, so this is where
   * the seam belongs. `installProbeHooks` returns false unless the page was loaded with `?probe=1`, which is the property
   * `src/test/probeHooks.test.ts` holds.
   */
  useEffect(() => {
    if (!engine) return;
    const installed = installProbeHooks({
      engine,
      readState: () => store.state,
      commit: (action) => store.commit(action as never),
    });
    return () => {
      if (installed) uninstallProbeHooks();
    };
  }, [engine, store]);

  // The engine only exists after the mount effect; render an inert shell for that
  // first frame instead of constructing a second engine to fill it.
  if (!engine) {
    return <div data-testid="hardware-console-pending" className="min-h-[40vh]" aria-hidden="true" />;
  }

  return (
    <ConsolePanel
      engine={engine}
      store={store}
      drumKit={getDefaultDrumKitForGenre(store.state.currentGenre)}
      onOpenStudio={
        onOpenStudio ? () => onOpenStudio({ id: store.state.currentGenre.id }) : undefined
      }
      onOpenHelp={onOpenHelp}
    />
  );
};
