import { useCallback, useState } from "react";
import { Genre, SequencerPattern } from "../../../types/genre";
import { GrooveProject } from "../../../types/project";
import { DrumKitType, EffectsRackState } from "../../../audio/AudioEngine";
import { downloadMidiFile } from "../../../audio/MidiExporter";
import { downloadAbletonProject } from "../../../audio/AbletonExporter";
import { getShareUrlResult, toSharedTrack } from "../../../audio/SequencerUrlShare";
import {
  EXPORT_MEMORY_WARN_BYTES,
  estimateExportMemoryBytes,
  exportMasterWav,
  exportStemsZip,
  triggerWavDownload,
} from "../../../audio/WavExporter";
import { getActiveAudioEngine } from "../../../audio/activeEngine";
import { exportMasterMp3 } from "../../../audio/Mp3Exporter";
import { exportProjectToGrooveFile } from "../projectDb";
import type { SequencerState } from "../useSequencerStore";
import { patternForExport } from "../../../data/songFlatten";
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
  handleExportMp3: () => Promise<void>;
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

  /**
   * B4 — the one place that decides what an exporter writes.
   *
   * In song mode every exporter (WAV, MP3, MIDI, `.als`) writes the *arrangement*; in loop mode they write the
   * pattern being edited. Putting the decision here is what stops the four of them disagreeing about the length of
   * the same session, which is the failure this replaced.
   */
  const exportPattern = useCallback(() => {
    const state = seqStateRef.current;
    const decision = patternForExport({
      songMode: Boolean(state.songMode),
      activeSlot: state.activeSlot,
      patterns: state.patterns,
      current: patternRef.current,
      sections: state.sections ?? [],
      genreId: currentGenre.id,
      bpm,
      swing,
      resolution,
      loopRange: state.loopRange,
    });
    if (decision.problems.length) {
      // Say what was dropped: a silent half-arrangement is worse than a visible one.
      showToast(t("export_arrangement_partial", { detail: decision.problems.slice(0, 3).join("; ") }));
    }
    return decision.pattern;
  }, [bpm, currentGenre.id, resolution, showToast, swing, t]);

  const handleExportMidi = useCallback(() => {
    downloadMidiFile(
      { pattern: exportPattern(), bpm, genreName: currentGenre.name },
      currentGenre.name
    );
    showToast(
      t("export_midi_done", { name: currentGenre.name })
    );
  }, [bpm, currentGenre.name, exportPattern, t, showToast]);

  const handleExportAls = useCallback(async () => {
    try {
      showToast(
        t("export_als_generating")
      );
      const result = await downloadAbletonProject(
        {
          bpm,
          pattern: exportPattern(),
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
  }, [bpm, currentGenre.name, exportPattern, t, showToast]);

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
      /**
       * B2: in song mode the bounce is the *arrangement*, not the loop.
       *
       * `renderSongOffline` flattens the sections through the same renderer, so this is the only difference between
       * the two paths: which pattern the offline engine is handed. Outside song mode nothing changes, and a song
       * whose sections all point at empty clips refuses with a reason instead of emitting a silent file.
       */
      const result = await exportMasterWav(exportPattern(), currentGenre.id, {
        bpm,
        swing,
        drumKit,
      });
      triggerWavDownload(result.blob, result.filename);
      /**
       * Report a degraded master rather than a clean one.
       *
       * Two independent degradations, both silent before this round: the true-peak limiter falling
       * back to a `DynamicsCompressor` (2.36 dB louder overall, 4.83 dB off in one band), and a GS-1
       * voice failing to load so its track is voiced by the built-in synth instead (0.71-3.66 dB off,
       * measured). The file is handed over either way — it is valid — but the user is told, because
       * the alternative is a file that quietly is not the thing they auditioned.
       */
      if (result.gs1HostFailures > 0) {
        showToast(
          t("export_wav_degraded_gs1", {
            filename: result.filename,
            count: result.gs1HostFailures,
          })
        );
      } else {
        showToast(
          result.limiterKind === "fallback"
            ? t("export_wav_degraded_limiter", { filename: result.filename })
            : t("export_wav_done", { filename: result.filename })
        );
      }
    } catch (err: any) {
      showToast(
        t("export_wav_failed", { error: describeError(err) })
      );
    } finally {
      setIsExportingAudio(false);
    }
  }, [currentGenre.id, bpm, swing, drumKit, t, showToast]);

  /**
   * The same master as the WAV, encoded to MP3.
   *
   * The render is shared (`renderPatternOffline`), so the two files are the same performance; only the codec
   * differs. The encoder is fetched on this click and never before — see `Mp3Exporter`, which is also why this
   * handler is the only thing in the app that touches it.
   */
  const handleExportMp3 = useCallback(async () => {
    try {
      setIsExportingAudio(true);
      showToast(t("export_mp3_rendering"));
      const result = await exportMasterMp3(exportPattern(), currentGenre.id, {
        bpm,
        swing,
        drumKit,
      });
      triggerWavDownload(result.blob, result.filename);
      if (result.gs1HostFailures > 0) {
        showToast(
          t("export_wav_degraded_gs1", {
            filename: result.filename,
            count: result.gs1HostFailures,
          })
        );
      } else {
        showToast(
          result.limiterKind === "fallback"
            ? t("export_wav_degraded_limiter", { filename: result.filename })
            : t("export_mp3_done", { filename: result.filename, kbps: result.bitrateKbps })
        );
      }
    } catch (err: any) {
      showToast(t("export_mp3_failed", { error: describeError(err) }));
    } finally {
      setIsExportingAudio(false);
    }
  }, [currentGenre.id, bpm, swing, drumKit, exportPattern, t, showToast]);

  const handleExportStems = useCallback(async () => {
    try {
      setIsExportingAudio(true);
      /**
       * Say the size **before** rendering, because WebKit does not raise an error when it runs out of memory — it
       * restarts the page, which is the crash the owner reported after exporting stems in Safari. The estimate is
       * arithmetic over what the render holds (one live buffer plus every encoded stem), not a guess.
       */
      const seconds = (stepCount / 4) * (60 / Math.max(1, bpm));
      const estimate = estimateExportMemoryBytes({
        seconds,
        sampleRate: 44100,
        tracks: patternRef.current.tracks.length,
        stems: true,
      });
      if (estimate.peak > EXPORT_MEMORY_WARN_BYTES) {
        showToast(t("export_stems_memory_warning", { megabytes: String(estimate.megabytes) }));
      }
      showToast(
        t("export_stems_rendering")
      );
      /**
       * The **live** mixer state, passed explicitly.
       *
       * Without it the exporter derives mute/solo/volume/pan from the pattern, which is right for a pattern that carries
       * them — and it is how a user's S/A state can disagree with what they exported. The engine owns the states the app
       * is actually playing through, so the export asks it rather than re-deriving.
       */
      const liveStates = getActiveAudioEngine()?.getTrackStates();
      const result = await exportStemsZip(patternRef.current, currentGenre.id, {
        bpm,
        swing,
        drumKit,
        ...(liveStates && liveStates.length === patternRef.current.tracks.length
          ? { trackStates: liveStates }
          : {}),
      });
      triggerWavDownload(result.blob, result.filename);
      // Same honesty rule as the master export: a stem whose GS-1 voice did not load is a valid
      // file that is not what was auditioned, so it is reported rather than passed off as clean.
      showToast(
        result.gs1HostFailures > 0
          ? t("export_wav_degraded_gs1", {
              filename: result.filename,
              count: result.gs1HostFailures,
            })
          : t("export_stems_done", { filename: result.filename })
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
      tracks: patternRef.current.tracks.map(toSharedTrack),
      // B1: the link carries the arrangement, so opening it reproduces the song and not only the clip.
      sections: seqStateRef.current.sections,
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
    handleExportMp3,
    handleExportStems,
    handleShare,
  };
}
