import React from "react";
import { Genre, SequencerPattern } from "../../types/genre";
import { GrooveProject } from "../../types/project";
import { AudioEngine, DrumKitType, EffectsRackState } from "../../audio/AudioEngine";
import type { SequencerState } from "../../features/sequencer/useSequencerStore";
import type { SequencerAction } from "../../features/sequencer/useSequencerStore";
import type { PitchPickerState } from "../../features/sequencer/hooks/useTransportShortcuts";
import type { Language } from "../../i18n/LanguageContext";
import { clonePattern } from "../../features/sequencer/useSequencerStore";
import { EuclideanModal } from "./EuclideanModal";
import { PitchPickerModal } from "./PitchPickerModal";
import { ProjectHubModal } from "./ProjectHubModal";
import { DEMO_TRACKS_CONFIG } from "./trackConfig";

export interface SequencerModalsProps {
  pattern: SequencerPattern;
  seqState: SequencerState;
  isZh: boolean;
  language: Language;
  showToast: (msg: string) => void;
  commit: (action: SequencerAction, recordHistory?: boolean) => void;
  engineRef: React.MutableRefObject<AudioEngine | null>;

  isEuclideanOpen: boolean;
  setIsEuclideanOpen: React.Dispatch<React.SetStateAction<boolean>>;

  pitchPicker: PitchPickerState;
  setPitchPicker: React.Dispatch<React.SetStateAction<PitchPickerState>>;

  isProjectHubOpen: boolean;
  setIsProjectHubOpen: React.Dispatch<React.SetStateAction<boolean>>;
  currentGenre: Genre;
  bpm: number;
  swing: number;
  timeSignature: string;
  resolution: "1/8" | "1/16" | "1/32";
  stepCount: number;
  effectsRackState: EffectsRackState;
  drumKit: DrumKitType;
  handleLoadProject: (project: GrooveProject) => Promise<void>;
}

/**
 * A-02: the three overlays StudioView renders (Euclidean generator, pitch picker,
 * multi-project hub), extracted verbatim with their callbacks. ProjectHubModal is
 * always mounted (it owns its own visibility), exactly as before.
 */
export const SequencerModals: React.FC<SequencerModalsProps> = ({
  pattern,
  seqState,
  isZh,
  language,
  showToast,
  commit,
  engineRef,
  isEuclideanOpen,
  setIsEuclideanOpen,
  pitchPicker,
  setPitchPicker,
  isProjectHubOpen,
  setIsProjectHubOpen,
  currentGenre,
  bpm,
  swing,
  timeSignature,
  resolution,
  stepCount,
  effectsRackState,
  drumKit,
  handleLoadProject,
}) => {
  return (
    <>
      {/* Euclidean Modal */}
      {isEuclideanOpen && (
        <EuclideanModal
          isOpen={isEuclideanOpen}
          onClose={() => setIsEuclideanOpen(false)}
          tracks={pattern.tracks}
          tracksConfig={DEMO_TRACKS_CONFIG}
          initialTrackIdx={0}
          stepCount={stepCount}
          language={language}
          onApplyEuclidean={(targetTrackIdx, steps) => {
            const next = clonePattern(pattern);
            if (next.tracks[targetTrackIdx]) {
              next.tracks[targetTrackIdx].steps = [...steps];
            }
            commit({ type: "COMMIT_PATTERN", pattern: next });
            showToast(isZh ? "已生成欧几里得律动 ✓" : "Euclidean rhythm applied ✓");
          }}
        />
      )}

      {/* Pitch Picker Modal */}
      {pitchPicker.isOpen && (
        <PitchPickerModal
          isOpen={pitchPicker.isOpen}
          onClose={() => setPitchPicker((prev) => ({ ...prev, isOpen: false }))}
          trackName={pattern.tracks[pitchPicker.trackIdx]?.name || "Track"}
          trackColor={DEMO_TRACKS_CONFIG[pitchPicker.trackIdx % DEMO_TRACKS_CONFIG.length].color}
          stepIdx={pitchPicker.stepIdx}
          initialNote={pitchPicker.initialNote}
          language={language}
          currentScale={pattern.scale}
          trackPitches={pattern.tracks[pitchPicker.trackIdx]?.pitch}
          onQuantizeTrack={(quantizedPitches) => {
            commit({
              type: "BATCH_SET_PITCH",
              trackIdx: pitchPicker.trackIdx,
              pitches: quantizedPitches,
            });
            showToast(isZh ? "已将全轨音高对齐至当前调式 ✓" : "Track pitches quantized to scale ✓");
          }}
          onScaleChange={(newScale) => {
            commit({ type: "SET_SCALE", scale: newScale });
            showToast(isZh ? `已切换曲目调式: ${newScale} ✓` : `Scale set: ${newScale} ✓`);
          }}
          onSelectPitch={(stepIdx, midiNote) => {
            commit({ type: "SET_PITCH", trackIdx: pitchPicker.trackIdx, stepIdx, pitch: midiNote });
            showToast(isZh ? "音高已设定 ✓" : "Pitch set ✓");
          }}
          onPreviewNote={(midiNote) => {
            const tr = pattern.tracks[pitchPicker.trackIdx];
            if (engineRef.current && tr) {
              engineRef.current.triggerNote(pitchPicker.trackIdx, tr.name, 0.9, midiNote, 1);
            }
          }}
        />
      )}

      {/* Multi-Project Hub Modal (P7-02) */}
      <ProjectHubModal
        isOpen={isProjectHubOpen}
        onClose={() => setIsProjectHubOpen(false)}
        currentGenre={currentGenre}
        currentPatterns={{
          A: seqState.activeSlot === "A" ? pattern : seqState.patterns.A,
          B: seqState.activeSlot === "B" ? pattern : seqState.patterns.B,
        }}
        activeSlot={seqState.activeSlot}
        bpm={bpm}
        swing={swing}
        timeSignature={timeSignature}
        resolution={resolution}
        stepCount={stepCount}
        songMode={seqState.songMode}
        songChain={seqState.songChain}
        loopRange={seqState.loopRange}
        effectsRackState={effectsRackState}
        drumKit={drumKit}
        isMetronome={seqState.isMetronome}
        isCountIn={seqState.isCountIn}
        onLoadProject={handleLoadProject}
        onToast={showToast}
      />
    </>
  );
};
