import { useCallback, useState } from "react";
import { Genre, SequencerPattern } from "../../../types/genre";
import { GrooveProject } from "../../../types/project";
import { DrumKitType, EffectsRackState } from "../../../audio/AudioEngine";
import { downloadMidiFile } from "../../../audio/MidiExporter";
import { downloadAbletonProject } from "../../../audio/AbletonExporter";
import { getShareUrlResult } from "../../../audio/SequencerUrlShare";
import { exportMasterWav, exportStemsZip, triggerWavDownload } from "../../../audio/WavExporter";
import { exportProjectToGrooveFile } from "../projectDb";
import type { SequencerState } from "../useSequencerStore";

export interface UseExportActionsOptions {
  patternRef: React.MutableRefObject<SequencerPattern>;
  seqStateRef: React.MutableRefObject<SequencerState>;
  bpm: number;
  swing: number;
  timeSignature: string;
  resolution: "1/8" | "1/16" | "1/32";
  stepCount: number;
  currentGenre: Genre;
  activeProject: GrooveProject | null;
  effectsRackState: EffectsRackState;
  drumKit: DrumKitType;
  isZh: boolean;
  showToast: (msg: string) => void;
}

export interface UseExportActionsResult {
  isExportingAudio: boolean;
  handleExportMidi: () => void;
  handleExportAls: () => Promise<void>;
  handleExportGroove: () => void;
  handleExportWav: () => Promise<void>;
  handleExportStems: () => Promise<void>;
  handleShare: () => void;
}

/**
 * A-02: every action that turns the live pattern into a downloadable artifact
 * (MIDI / ALS / .groove / WAV / stems / share URL), moved verbatim from
 * `StudioView`. Toast text and error handling are unchanged.
 */
export function useExportActions({
  patternRef,
  seqStateRef,
  bpm,
  swing,
  timeSignature,
  resolution,
  stepCount,
  currentGenre,
  activeProject,
  effectsRackState,
  drumKit,
  isZh,
  showToast,
}: UseExportActionsOptions): UseExportActionsResult {
  const [isExportingAudio, setIsExportingAudio] = useState(false);

  const handleExportMidi = useCallback(() => {
    downloadMidiFile(
      { pattern: patternRef.current, bpm, genreName: currentGenre.name },
      currentGenre.name
    );
    showToast(
      isZh ? `已导出 MIDI: ${currentGenre.name}.mid ✓` : `Exported ${currentGenre.name}.mid ✓`
    );
  }, [bpm, currentGenre.name, isZh, showToast]);

  const handleExportAls = useCallback(async () => {
    try {
      showToast(
        isZh ? "正在生成 Ableton Live (.als) 工程包..." : "Generating Ableton Live (.als) set..."
      );
      const result = await downloadAbletonProject(
        {
          bpm,
          pattern: patternRef.current,
          genreName: currentGenre.name,
          scaleName: patternRef.current.scale,
        },
        `${currentGenre.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_Groove`
      );
      showToast(
        isZh
          ? `已导出 Ableton Live 工程: ${result.filename} ✓ (可直接在 Live 10/11/12 中打开)`
          : `Exported Ableton Live Set: ${result.filename} ✓ (Compatible with Live 10/11/12)`
      );
    } catch (err: any) {
      showToast(
        isZh
          ? `Ableton 工程导出失败: ${err?.message || err}`
          : `Ableton export failed: ${err?.message || err}`
      );
    }
  }, [bpm, currentGenre.name, isZh, showToast]);

  const handleExportGroove = useCallback(() => {
    const projToExport: GrooveProject = activeProject
      ? {
          ...activeProject,
          genreId: currentGenre.id,
          genreName: currentGenre.name,
          bpm,
          swing,
          timeSignature,
          resolution,
          stepCount,
          patterns: {
            A:
              seqStateRef.current.activeSlot === "A"
                ? patternRef.current
                : seqStateRef.current.patterns.A,
            B:
              seqStateRef.current.activeSlot === "B"
                ? patternRef.current
                : seqStateRef.current.patterns.B,
          },
          activeSlot: seqStateRef.current.activeSlot,
          songMode: seqStateRef.current.songMode,
          songChain: seqStateRef.current.songChain,
          loopRange: seqStateRef.current.loopRange,
          effectsRack: effectsRackState,
          drumKit,
          isMetronome: seqStateRef.current.isMetronome,
          isCountIn: seqStateRef.current.isCountIn,
          updatedAt: Date.now(),
        }
      : {
          id: `proj_${Date.now()}`,
          name: `${currentGenre.name} Session`,
          genreId: currentGenre.id,
          genreName: currentGenre.name,
          bpm,
          swing,
          timeSignature,
          resolution,
          stepCount,
          patterns: {
            A:
              seqStateRef.current.activeSlot === "A"
                ? patternRef.current
                : seqStateRef.current.patterns.A,
            B:
              seqStateRef.current.activeSlot === "B"
                ? patternRef.current
                : seqStateRef.current.patterns.B,
          },
          activeSlot: seqStateRef.current.activeSlot,
          songMode: seqStateRef.current.songMode,
          songChain: seqStateRef.current.songChain,
          loopRange: seqStateRef.current.loopRange,
          effectsRack: effectsRackState,
          drumKit,
          isMetronome: seqStateRef.current.isMetronome,
          isCountIn: seqStateRef.current.isCountIn,
          tags: [currentGenre.name, "Exported"],
          isFavorite: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

    exportProjectToGrooveFile(projToExport);
    showToast(
      isZh
        ? `已导出 .groove 工程包: ${projToExport.name} ✓`
        : `Exported .groove: ${projToExport.name} ✓`
    );
  }, [
    activeProject,
    currentGenre,
    bpm,
    swing,
    timeSignature,
    resolution,
    stepCount,
    effectsRackState,
    drumKit,
    showToast,
    isZh,
  ]);

  const handleExportWav = useCallback(async () => {
    try {
      setIsExportingAudio(true);
      showToast(isZh ? "正在离线高质量渲染 WAV 母带..." : "Rendering offline WAV master...");
      const result = await exportMasterWav(patternRef.current, currentGenre.id, {
        bpm,
        swing,
        drumKit,
      });
      triggerWavDownload(result.blob, result.filename);
      showToast(
        isZh
          ? `母带 WAV 导出完成: ${result.filename} ✓`
          : `Exported Master WAV: ${result.filename} ✓`
      );
    } catch (err: any) {
      showToast(
        isZh ? `WAV 导出失败: ${err?.message || err}` : `WAV export failed: ${err?.message || err}`
      );
    } finally {
      setIsExportingAudio(false);
    }
  }, [currentGenre.id, bpm, swing, drumKit, isZh, showToast]);

  const handleExportStems = useCallback(async () => {
    try {
      setIsExportingAudio(true);
      showToast(
        isZh
          ? "正在逐轨离线渲染 8 轨 Stems 并打包 ZIP..."
          : "Rendering 8 stems and packaging ZIP..."
      );
      const result = await exportStemsZip(patternRef.current, currentGenre.id, {
        bpm,
        swing,
        drumKit,
      });
      triggerWavDownload(result.blob, result.filename);
      showToast(
        isZh ? `分轨打包导出完成: ${result.filename} ✓` : `Exported Stems ZIP: ${result.filename} ✓`
      );
    } catch (err: any) {
      showToast(
        isZh
          ? `分轨导出失败: ${err?.message || err}`
          : `Stems export failed: ${err?.message || err}`
      );
    } finally {
      setIsExportingAudio(false);
    }
  }, [currentGenre.id, bpm, swing, drumKit, isZh, showToast]);

  const handleShare = useCallback(() => {
    const result = getShareUrlResult({
      genreId: currentGenre.id,
      bpm,
      swing,
      scale: patternRef.current.scale,
      timeSignature,
      resolution,
      totalSteps: stepCount,
      tracks: patternRef.current.tracks.map((t) => ({
        track_id: t.track_id,
        name: t.name,
        instrument: t.instrument || "synth",
        steps: t.steps,
        velocity: t.velocity,
        pitch: t.pitch,
        mute: t.mute,
        solo: t.solo,
        volume: t.volume,
      })),
    });
    if (!result.url) {
      showToast(
        result.reason === "too-large"
          ? isZh
            ? "工程过大，无法装入分享链接；请改用 .groove 工程包导出"
            : "Pattern is too large for a share link — export a .groove package instead"
          : isZh
            ? "分享失败：当前音序器内容无法编码"
            : "Share failed: this pattern cannot be encoded"
      );
      return;
    }
    navigator.clipboard.writeText(result.url);
    showToast(
      result.degraded
        ? isZh
          ? "链接已复制（内容较大，已省略音高/门限等细节）🔗"
          : "Link copied (too large — pitch/gate detail omitted) 🔗"
        : isZh
          ? "链接已复制到剪贴板 🔗"
          : "Share URL copied to clipboard 🔗"
    );
  }, [currentGenre.id, bpm, swing, timeSignature, resolution, stepCount, isZh, showToast]);

  return {
    isExportingAudio,
    handleExportMidi,
    handleExportAls,
    handleExportGroove,
    handleExportWav,
    handleExportStems,
    handleShare,
  };
}
