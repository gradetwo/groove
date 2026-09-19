import { useEffect } from "react";
import { SequencerPattern } from "../../../types/genre";
import { AudioEngine } from "../../../audio/AudioEngine";
import { ChordDefinition } from "../../../utils/chordTheory";
import { BakedArpeggioResult } from "../../../utils/arpeggiatorTheory";
import type { SequencerAction } from "../useSequencerStore";

export interface UseInitialPatternLoadOptions {
  initialChords?: ChordDefinition[] | null;
  onClearInitialChords?: () => void;
  initialArpeggio?: { baked: BakedArpeggioResult; label?: string } | null;
  onClearInitialArpeggio?: () => void;
  initialMasterclassPattern?: { pattern: SequencerPattern; label?: string } | null;
  onClearInitialMasterclassPattern?: () => void;
  isZh: boolean;
  showToast: (msg: string) => void;
  commit: (action: SequencerAction, recordHistory?: boolean) => void;
  engineRef: React.MutableRefObject<AudioEngine | null>;
  patternRef: React.MutableRefObject<SequencerPattern>;
}

/**
 * A-02: the three "pattern handed over from another view" effects (chords,
 * arpeggio, masterclass). They stay in this order: the commits land in the same
 * reducer queue, so reordering them would change which one wins on mount.
 */
export function useInitialPatternLoad({
  initialChords,
  onClearInitialChords,
  initialArpeggio,
  onClearInitialArpeggio,
  initialMasterclassPattern,
  onClearInitialMasterclassPattern,
  isZh,
  showToast,
  commit,
  engineRef,
  patternRef,
}: UseInitialPatternLoadOptions): void {
  // Handle chords transferred from ChordProgressionsView
  useEffect(() => {
    if (!initialChords || initialChords.length === 0) return;
    commit({ type: "LOAD_CHORDS", chords: initialChords });
    if (engineRef.current) {
      engineRef.current.setPattern(patternRef.current);
    }
    showToast(
      isZh
        ? `已成功载入 ${initialChords.length} 个和弦到和弦轨道 ✓`
        : `Loaded ${initialChords.length} chords into track ✓`
    );
    if (onClearInitialChords) {
      onClearInitialChords();
    }
  }, [initialChords, isZh, onClearInitialChords, showToast, commit]);

  // Handle arpeggios transferred from ChordProgressionsView (P6-03)
  useEffect(() => {
    if (!initialArpeggio || !initialArpeggio.baked) return;
    commit({ type: "LOAD_ARPEGGIATED_SEQUENCE", baked: initialArpeggio.baked });
    if (engineRef.current) {
      engineRef.current.setPattern(patternRef.current);
    }
    const trackName =
      initialArpeggio.baked.targetTrackId === "lead"
        ? isZh
          ? "Lead 领奏"
          : "Lead"
        : isZh
        ? "Chords 和弦"
        : "Chords";
    showToast(
      isZh
        ? `已将 ${initialArpeggio.label || "琶音旋律"} 烘焙至 ${trackName} 轨 ✓`
        : `Baked ${initialArpeggio.label || "arpeggio"} to ${trackName} track ✓`
    );
    if (onClearInitialArpeggio) {
      onClearInitialArpeggio();
    }
  }, [initialArpeggio, isZh, onClearInitialArpeggio, showToast, commit]);

  // Handle rhythm masterclass pattern transferred from MasterclassView (P6-01)
  useEffect(() => {
    if (!initialMasterclassPattern || !initialMasterclassPattern.pattern) return;
    commit({
      type: "LOAD_MASTERCLASS_PATTERN",
      pattern: initialMasterclassPattern.pattern,
      bpm: initialMasterclassPattern.pattern.bpm,
      timeSignature: initialMasterclassPattern.pattern.timeSignature,
    });
    if (engineRef.current) {
      engineRef.current.setPattern(initialMasterclassPattern.pattern);
      if (initialMasterclassPattern.pattern.bpm) {
        engineRef.current.setBpm(initialMasterclassPattern.pattern.bpm);
      }
    }
    showToast(
      isZh
        ? `已成功载入「${initialMasterclassPattern.label || "律动工作坊节奏"}」至 Studio！✓`
        : `Baked "${initialMasterclassPattern.label || "Masterclass Pattern"}" into Studio! ✓`
    );
    if (onClearInitialMasterclassPattern) {
      onClearInitialMasterclassPattern();
    }
  }, [initialMasterclassPattern, isZh, onClearInitialMasterclassPattern, showToast, commit]);
}
