import { useCallback, useEffect, useState } from "react";
import { Genre } from "../../../types/genre";
import { GrooveProject } from "../../../types/project";
import { AudioEngine, DrumKitType, EffectsRackState } from "../../../audio/AudioEngine";
import { loadGenre } from "../../../data/index/loader";
import { getActiveProjectId, getProject, migrateLegacyLocalStorage, setSavedArrangementProject } from "../projectDb";
import { isStudioEditor } from "../../arrangement/arrangementStore";
import type { SequencerAction } from "../useSequencerStore";

export interface UseProjectHubOptions {
  commit: (action: SequencerAction, recordHistory?: boolean) => void;
  currentGenre: Genre;
  setDrumKit: React.Dispatch<React.SetStateAction<DrumKitType>>;
  setEffectsRackState: React.Dispatch<React.SetStateAction<EffectsRackState>>;
  engineRef: React.MutableRefObject<AudioEngine | null>;
}

export interface UseProjectHubResult {
  activeProject: GrooveProject | null;
  setActiveProject: React.Dispatch<React.SetStateAction<GrooveProject | null>>;
  handleLoadProject: (project: GrooveProject) => Promise<void>;
}

/**
 * A-02: multi-project hub state (P7-02) — the boot-time active-project restore
 * and the project loader, extracted verbatim from `StudioView`.
 */
export function useProjectHub({
  commit,
  currentGenre,
  setDrumKit,
  setEffectsRackState,
  engineRef,
}: UseProjectHubOptions): UseProjectHubResult {
  const [activeProject, setActiveProject] = useState<GrooveProject | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        await migrateLegacyLocalStorage();
        const activeId = getActiveProjectId();
        /**
         * ⭐ **The studio only restores its own records.**
         *
         * A v2 arrangement project also points at itself through an "active project" id, and it has no `patterns` — so
         * a boot restore that asked only "is there an active id?" would load one into the step editor and start a
         * studio session with nothing in it. `isStudioEditor` answers before the load, so this change cannot reach the
         * studio's behaviour at all: for every studio project the answer is true and the lines below are the lines that
         * were always here.
         */
        if (activeId && isStudioEditor(activeId)) {
          const proj = await getProject(activeId);
          if (proj && isMounted) {
            setActiveProject(proj);
          }
        }
      } catch (e) {
        console.warn("[StudioView] Failed to initialize active project:", e);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLoadProject = useCallback(
    async (project: GrooveProject) => {
      setActiveProject(project);
      // A-01: the project stores a genre id, so resolve it on demand.
      const genre = (await loadGenre(project.genreId)) || currentGenre;
      commit({
        type: "LOAD_PROJECT",
        genre,
        patterns: project.patterns,
        activeSlot: project.activeSlot,
        bpm: project.bpm,
        swing: project.swing,
        timeSignature: project.timeSignature,
        resolution: project.resolution,
        stepCount: project.stepCount,
        songMode: project.songMode,
        // B1: the arrangement rides with the project in both directions (load, and the scratch snapshot that
        // makes a reload restore *this* project). A project saved before it migrates from the chain in the reducer.
        sections: project.sections,
        songChain: project.songChain,
        loopRange: project.loopRange,
        isMetronome: project.isMetronome,
        isCountIn: project.isCountIn,
      });

      if (project.drumKit) {
        setDrumKit(project.drumKit);
      }
      if (project.effectsRack) {
        setEffectsRackState(project.effectsRack);
      }

      if (engineRef.current) {
        const activePat = project.activeSlot === "B" ? project.patterns.B : project.patterns.A;
        engineRef.current.setPattern(activePat);
      }

      // ⭐ **A reload must restore this project.** The older store re-seeded a scratch snapshot keyed by project id; the
      // arrangement store keeps only a pointer to the active project, and writing it here is the same promise.
      setSavedArrangementProject({ id: project.id, name: project.name });
    },
    [commit, currentGenre]
  );

  return { activeProject, setActiveProject, handleLoadProject };
}
