import { useCallback } from "react";
import { Genre, SequencerPattern } from "../../../types/genre";
import { AudioEngine } from "../../../audio/AudioEngine";
import { clonePattern } from "../useSequencerStore";
import type { SequencerAction } from "../useSequencerStore";
import { importMidiToPattern } from "../../../audio/MidiImporter";
import { generateVariation } from "../../../audio/InspireMe";
import { clearSavedProject } from "../projectStorage";
import { useLanguage } from "../../../i18n/LanguageContext";

/**
 * Turns anything that can be thrown into a user-safe string. Interpolating an
 * `undefined` would leave the literal `{error}` placeholder on screen, because
 * `formatMessage` deliberately preserves unknown placeholders.
 */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export interface UsePatternActionsOptions {
  patternRef: React.MutableRefObject<SequencerPattern>;
  stepsPerBar: number;
  stepCount: number;
  resolution: "1/8" | "1/16" | "1/32";
  bpm: number;
  currentGenre: Genre;
  engineRef: React.MutableRefObject<AudioEngine | null>;
  commit: (action: SequencerAction, recordHistory?: boolean) => void;
  setIsProjectHubOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isZh: boolean;
  showToast: (msg: string) => void;
}

export interface UsePatternActionsResult {
  handleQuickAction: (
    action: "dup_bar1" | "humanize" | "clear_all" | "reset_preset" | "clear_saved" | "open_hub"
  ) => void;
  handleImportMidi: (file: File) => Promise<void>;
  handleInspireMe: () => void;
  handleAudition: (trackIdx: number, trackName: string) => void;
  handleCycleTrackLength: (trackIdx: number) => void;
}

/**
 * A-02: whole-pattern actions — the toolbar quick actions, MIDI import, Inspire
 * Me variation, per-track audition and the track-length cycler. Moved verbatim
 * from `StudioView`.
 */
export function usePatternActions({
  patternRef,
  stepsPerBar,
  stepCount,
  resolution,
  bpm,
  currentGenre,
  engineRef,
  commit,
  setIsProjectHubOpen,
  showToast,
}: UsePatternActionsOptions): UsePatternActionsResult {
  const { t } = useLanguage();
  // Quick actions
  const handleQuickAction = useCallback(
    (
      action: "dup_bar1" | "humanize" | "clear_all" | "reset_preset" | "clear_saved" | "open_hub"
    ) => {
      if (action === "open_hub") {
        setIsProjectHubOpen(true);
        return;
      }
      if (action === "dup_bar1") {
        const next = clonePattern(patternRef.current);
        next.tracks.forEach((t) => {
          const bar1Steps = t.steps.slice(0, stepsPerBar);
          const bar1Vel = t.velocity?.slice(0, stepsPerBar) || Array(stepsPerBar).fill(100);
          for (let i = stepsPerBar; i < t.steps.length; i++) {
            t.steps[i] = bar1Steps[i % stepsPerBar];
            if (t.velocity) t.velocity[i] = bar1Vel[i % stepsPerBar];
          }
        });
        commit({ type: "COMMIT_PATTERN", pattern: next });
        showToast(t("pattern_dup_bar1_done"));
      } else if (action === "humanize") {
        const next = clonePattern(patternRef.current);
        next.tracks.forEach((t) => {
          if (!t.velocity) t.velocity = Array(t.steps.length).fill(100);
          t.velocity = t.velocity.map((v, i) => {
            if (t.steps[i] === 0) return v;
            const delta = Math.floor((Math.random() - 0.5) * 24);
            return Math.max(40, Math.min(127, v + delta));
          });
        });
        commit({ type: "COMMIT_PATTERN", pattern: next });
        showToast(t("pattern_humanize_done"));
      } else if (action === "clear_all") {
        const next = clonePattern(patternRef.current);
        next.tracks.forEach((t) => {
          t.steps = Array(t.steps.length).fill(0);
        });
        commit({ type: "COMMIT_PATTERN", pattern: next });
        showToast(t("pattern_clear_all_done"));
      } else if (action === "reset_preset") {
        commit({ type: "SET_GENRE", genre: currentGenre });
        showToast(t("pattern_reset_done"));
      } else if (action === "clear_saved") {
        clearSavedProject();
        commit({ type: "SET_GENRE", genre: currentGenre });
        showToast(
          t("pattern_clear_saved_done")
        );
      }
    },
    [stepsPerBar, commit, showToast, t, currentGenre]
  );

  const handleImportMidi = useCallback(
    async (file: File) => {
      try {
        const buffer = await file.arrayBuffer();
        const result = importMidiToPattern(buffer, {
          quantization: resolution,
          totalSteps: stepCount,
        });
        commit({ type: "COMMIT_PATTERN", pattern: result.pattern });
        if (result.bpm && result.bpm !== bpm) {
          commit({ type: "SET_BPM", bpm: result.bpm });
        }
        if (engineRef.current) {
          engineRef.current.setPattern(result.pattern);
          if (result.bpm) engineRef.current.setBpm(result.bpm);
        }
        showToast(
          t("pattern_import_done", { count: result.notesFound })
        );
      } catch (err: any) {
        showToast(
          t("pattern_import_failed", { error: describeError(err) })
        );
      }
    },
    [resolution, stepCount, bpm, commit, t, showToast]
  );

  const handleInspireMe = useCallback(() => {
    const mutated = generateVariation(patternRef.current, {
      intensity: "medium",
      preserveKick: true,
      mutateMelodic: true,
      mutatePercussion: true,
      addRatchets: true,
    });
    commit({ type: "COMMIT_PATTERN", pattern: mutated });
    if (engineRef.current) {
      engineRef.current.setPattern(mutated);
    }
    showToast(
      t("pattern_inspire_done")
    );
  }, [commit, t, showToast]);

  const handleAudition = useCallback((trackIdx: number, trackName: string) => {
    const track = patternRef.current.tracks[trackIdx];
    const activeIdx = track?.steps?.findIndex((s) => s > 0) ?? -1;
    const defaultPitch =
      trackIdx === 4 || track?.track_id === "bass" || trackName.toLowerCase().includes("bass")
        ? 48
        : trackIdx === 5 || track?.track_id === "chords" || trackName.toLowerCase().includes("chord") || trackName.toLowerCase().includes("pad")
        ? 60
        : trackIdx === 6 || track?.track_id === "lead" || trackName.toLowerCase().includes("lead")
        ? 72
        : 0;
    const pitch = activeIdx >= 0 && track?.pitch?.[activeIdx] && track.pitch[activeIdx]! > 0
      ? track.pitch[activeIdx]!
      : defaultPitch;
    const stepVal = activeIdx >= 0 && track?.steps?.[activeIdx] ? track.steps[activeIdx] : 1;
    const gateVal = activeIdx >= 0 && track?.gate?.[activeIdx] ? track.gate[activeIdx] : 0.8;
    engineRef.current?.triggerNote(trackIdx, trackName, 0.9, pitch, stepVal, gateVal, activeIdx);
  }, [patternRef]);

  const handleCycleTrackLength = useCallback(
    (trackIdx: number) => {
      const tracks = patternRef.current.tracks;
      const cur = tracks[trackIdx]?.trackLength || stepCount;
      const baseOpts = [12, 14, 16, 24, 32, 48, 64, stepCount];
      const opts = [...new Set(baseOpts.filter((n) => n <= stepCount))].sort((a, b) => a - b);
      let nextLen = opts[(opts.indexOf(cur) + 1) % opts.length] || stepCount;
      commit({ type: "SET_TRACK_LENGTH", trackIdx, length: nextLen });
    },
    [stepCount, commit]
  );

  return {
    handleQuickAction,
    handleImportMidi,
    handleInspireMe,
    handleAudition,
    handleCycleTrackLength,
  };
}
