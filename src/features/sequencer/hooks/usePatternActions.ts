import { useCallback } from "react";
import { Genre, SequencerPattern } from "../../../types/genre";
import { AudioEngine } from "../../../audio/AudioEngine";
import { clonePattern } from "../useSequencerStore";
import type { SequencerAction } from "../useSequencerStore";
import { importMidiToPattern } from "../../../audio/MidiImporter";
import { generateVariation } from "../../../audio/InspireMe";
import { clearSavedProject } from "../projectStorage";

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
  isZh,
  showToast,
}: UsePatternActionsOptions): UsePatternActionsResult {
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
        showToast(isZh ? "已复制小节 1 至后续小节 ✓" : "Duplicated Bar 1 to all bars ✓");
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
        showToast(isZh ? "已应用人性化力度微调 ✨" : "Humanized velocity ✓");
      } else if (action === "clear_all") {
        const next = clonePattern(patternRef.current);
        next.tracks.forEach((t) => {
          t.steps = Array(t.steps.length).fill(0);
        });
        commit({ type: "COMMIT_PATTERN", pattern: next });
        showToast(isZh ? "已清空全部轨道步进 ✕" : "Cleared all steps ✕");
      } else if (action === "reset_preset") {
        commit({ type: "SET_GENRE", genre: currentGenre });
        showToast(isZh ? "已恢复默认预设 🔄" : "Preset reset 🔄");
      } else if (action === "clear_saved") {
        clearSavedProject();
        commit({ type: "SET_GENRE", genre: currentGenre });
        showToast(
          isZh ? "已清除本地工程缓存并重置预设 🧹" : "Cleared local project cache & reset 🧹"
        );
      }
    },
    [stepsPerBar, commit, showToast, isZh, currentGenre]
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
          isZh
            ? `已成功导入 MIDI: 识别到 ${result.notesFound} 个音符 ✓`
            : `Imported MIDI: parsed ${result.notesFound} notes ✓`
        );
      } catch (err: any) {
        showToast(
          isZh
            ? `MIDI 导入失败: ${err?.message || err}`
            : `MIDI import failed: ${err?.message || err}`
        );
      }
    },
    [resolution, stepCount, bpm, commit, isZh, showToast]
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
      isZh ? "✨ 已应用 Inspire Me 受控灵感变异！" : "✨ Applied Inspire Me groove variation!"
    );
  }, [commit, isZh, showToast]);

  const handleAudition = useCallback((trackIdx: number, trackName: string) => {
    engineRef.current?.triggerNote(trackIdx, trackName, 0.9, 0, 1);
  }, []);

  const handleCycleTrackLength = useCallback(
    (trackIdx: number) => {
      const tracks = patternRef.current.tracks;
      const cur = tracks[trackIdx]?.trackLength || stepCount;
      const opts = [12, 14, 16, 24, 32].filter((n) => n <= stepCount);
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
