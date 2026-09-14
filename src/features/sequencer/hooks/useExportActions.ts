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
  showToast,
}: UseExportActionsOptions): UseExportActionsResult {
  const { t } = useLanguage();
  const [isExportingAudio, setIsExportingAudio] = useState(false);

  const handleExportMidi = useCallback(() => {
    downloadMidiFile(
      { pattern: patternRef.current, bpm, genreName: currentGenre.name },
      currentGenre.name
    );
    showToast(
      t("export_midi_done", { name: currentGenre.name })
    );
  }, [bpm, currentGenre.name, t, showToast]);

  const handleExportAls = useCallback(async () => {
    try {
      showToast(
        t("export_als_generating")
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
        t("export_als_done", { filename: result.filename })
      );
    } catch (err: any) {
      showToast(
        t("export_als_failed", { error: describeError(err) })
      );
    }
  }, [bpm, currentGenre.name, t, showToast]);

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
      t("export_groove_done", { name: projToExport.name })
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
    t,
  ]);

  const handleExportWav = useCallback(async () => {
    try {
      setIsExportingAudio(true);
      showToast(t("export_wav_rendering"));
      const result = await exportMasterWav(patternRef.current, currentGenre.id, {
        bpm,
        swing,
        drumKit,
      });
      triggerWavDownload(result.blob, result.filename);
      showToast(
        t("export_wav_done", { filename: result.filename })
      );
    } catch (err: any) {
      showToast(
        t("export_wav_failed", { error: describeError(err) })
      );
    } finally {
      setIsExportingAudio(false);
    }
  }, [currentGenre.id, bpm, swing, drumKit, t, showToast]);

  const handleExportStems = useCallback(async () => {
    try {
      setIsExportingAudio(true);
      showToast(
        t("export_stems_rendering")
      );
      const result = await exportStemsZip(patternRef.current, currentGenre.id, {
        bpm,
        swing,
        drumKit,
      });
      triggerWavDownload(result.blob, result.filename);
      showToast(
        t("export_stems_done", { filename: result.filename })
      );
    } catch (err: any) {
      showToast(
        t("export_stems_failed", { error: describeError(err) })
      );
    } finally {
      setIsExportingAudio(false);
    }
  }, [currentGenre.id, bpm, swing, drumKit, t, showToast]);

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
          ? t("export_share_too_large")
          : t("export_share_encode_failed")
      );
      return;
    }
    navigator.clipboard.writeText(result.url);
    showToast(
      result.degraded
        ? t("export_share_copied_degraded")
        : t("export_share_copied")
    );
  }, [currentGenre.id, bpm, swing, timeSignature, resolution, stepCount, t, showToast]);

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
