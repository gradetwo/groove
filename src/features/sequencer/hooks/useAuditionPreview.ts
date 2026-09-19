/**
 * Auditioning: single notes, whole voicings, and isolated lane playback.
 *
 * These handlers lived in `StudioView` and are ordinary audio behaviour — they call the engine and
 * read the current pattern, and none of them knows how a control looks. A second or third surface
 * would have had to copy them, and the three of them encode decisions that are easy to get subtly
 * wrong:
 *
 *  - **A `chords` track needs the voicing, not one note.** The single-note path hands the engine a
 *    pitch and the engine voices whatever it is given, so auditioning four members note-by-note
 *    produced twelve voices. `previewChord` passes the finished voicing instead.
 *  - **An isolated preview must not mix with the running arrangement.** The full transport playing
 *    underneath the preview doubles every note of the previewed lane, so starting a preview yields
 *    the transport rather than layering on it.
 *  - **Stopping a preview must only stop what the preview started.** If the user was already playing,
 *    leaving the preview must not stop their transport.
 *  - **The scope must not outlive the surface.** A preview scope left on the engine after the surface
 *    unmounts would constrain the *next* play to a lane that is no longer on screen, which is why
 *    there is an unmount effect here rather than in the view.
 *
 * Kept UI-free apart from `isRollPreviewing`, which is returned as state because a control has to
 * reflect it. The hook never renders anything.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioEngine } from "../../../audio/AudioEngine";
import type { SequencerPattern } from "../../../types/genre";

export interface UseAuditionPreviewOptions {
  engineRef: React.MutableRefObject<AudioEngine | null>;
  /** Read through a ref: the handlers must not be re-created on every pattern edit. */
  patternRef: React.MutableRefObject<SequencerPattern>;
  /** Mirrors the transport's playing flag, so the surface's button follows a preview. */
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  /** Hides the playhead when the preview stops the transport. */
  clearPlayhead: () => void;
  /** Auditions a whole track, used by the inspector's ▶ button. */
  handleAudition: (trackIdx: number, trackName: string) => void;
  /**
   * Which track the inspector is showing, or null when it is closed.
   *
   * An argument rather than a parameter of `handleAuditionInspectorTrack` on purpose: the call site
   * passes a nullary callback, so taking the index as a parameter would silently audition nothing.
   * The identity changing when this changes is correct — it is what keeps the inspector's memoization
   * keyed to the track it is showing.
   */
  inspectorTrackIdx: number | null;
}

export interface UseAuditionPreviewResult {
  /**
   * Release a leftover lane scope without stopping playback.
   *
   * The transport calls this the moment the user asks for the full arrangement, so a scope left over
   * from an earlier preview cannot silently narrow the next play to one track.
   */
  releasePreviewScope: () => void;
  /** One note through the track's own instrument — the same call the step grid makes. */
  handleAuditionRollNote: (
    trackIdx: number,
    midi: number,
    velocity: number,
    gate: number
  ) => void;
  /** A finished voicing as one chord. Required for a `chords` track. */
  handlePreviewChord: (
    trackIdx: number,
    notes: number[],
    velocity: number,
    durationSeconds?: number
  ) => void;
  /** Auditions whichever track the inspector is currently showing. Nullary, as the call site expects. */
  handleAuditionInspectorTrack: () => void;
  /** Starts isolated playback of one lane's step range. Returns whether the engine accepted it. */
  handleStartRollPreview: (trackIdx: number, fromStep: number, toStep: number) => boolean;
  /** Stops isolated playback, leaving a transport the user started running. */
  handleStopRollPreview: () => void;
  /** Whether a lane preview is currently running, so a control can reflect it. */
  isRollPreviewing: boolean;
}

export function useAuditionPreview({
  engineRef,
  patternRef,
  setIsPlaying,
  clearPlayhead,
  handleAudition,
  inspectorTrackIdx,
}: UseAuditionPreviewOptions): UseAuditionPreviewResult {
  const handleAuditionRollNote = useCallback(
    (trackIdx: number, midi: number, velocity: number, gate: number) => {
      const track = patternRef.current.tracks[trackIdx];
      if (!track) return;
      engineRef.current?.triggerNote(trackIdx, track.name, velocity / 127, midi, 1, gate);
    },
    [engineRef, patternRef]
  );

  const handlePreviewChord = useCallback(
    (trackIdx: number, notes: number[], velocity: number, durationSeconds?: number) => {
      const track = patternRef.current.tracks[trackIdx];
      if (!track) return;
      engineRef.current?.previewChord(trackIdx, track.name, notes, velocity / 127, durationSeconds);
    },
    [engineRef, patternRef]
  );

  const handleAuditionInspectorTrack = useCallback(() => {
    if (inspectorTrackIdx === null) return;
    handleAudition(inspectorTrackIdx, patternRef.current.tracks[inspectorTrackIdx]?.name ?? "");
  }, [handleAudition, inspectorTrackIdx, patternRef]);

  const [isRollPreviewing, setIsRollPreviewing] = useState(false);
  /**
   * Read inside `handleStopRollPreview` without making it depend on the state, so the callback
   * identity stays stable for the controls that receive it.
   */
  const isRollPreviewingRef = useRef(false);
  isRollPreviewingRef.current = isRollPreviewing;

  /**
   * Drops the scope and the roll's preview state, **without touching the transport**.
   *
   * Split out because the transport needs exactly this half: pressing Play on the arrangement has to
   * release a leftover lane scope (see `play()`'s comment) while obviously not stopping the playback
   * it is in the middle of starting. `handleStopRollPreview` is this plus the transport teardown.
   */
  const releasePreviewScope = useCallback(() => {
    engineRef.current?.setPreviewScope(null);
    setIsRollPreviewing(false);
  }, [engineRef]);

  const handleStartRollPreview = useCallback(
    (trackIdx: number, fromStep: number, toStep: number): boolean => {
      const engine = engineRef.current;
      if (!engine) return false;
      // A running arrangement would play underneath the preview and double every note of the
      // previewed lane, so the full transport yields to the preview rather than mixing with it.
      if (engine.getIsPlaying()) {
        engine.stop();
        setIsPlaying(false);
        clearPlayhead();
      }
      // `playScoped`, not `setPreviewScope` + `play`: `play()` clears a leftover scope (that is the
      // fix for "the workspace only plays the chords"), so the two-step form would drop this one.
      const accepted = engine.playScoped({ trackIdx, fromStep, toStep });
      if (accepted) {
        setIsRollPreviewing(true);
      }
      return accepted;
    },
    [clearPlayhead, engineRef, setIsPlaying]
  );

  const handleStopRollPreview = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    releasePreviewScope();
    // Only stop the transport if the preview is what started it.
    if (isRollPreviewingRef.current) {
      engine.stop();
      setIsPlaying(false);
      clearPlayhead();
    }
  }, [clearPlayhead, engineRef, releasePreviewScope, setIsPlaying]);

  // Leaving the surface unmounts the roll; the scope must not survive it and constrain the next play.
  useEffect(() => {
    return () => {
      engineRef.current?.setPreviewScope(null);
    };
  }, [engineRef]);

  return {
    handleAuditionRollNote,
    handlePreviewChord,
    handleAuditionInspectorTrack,
    handleStartRollPreview,
    handleStopRollPreview,
    /** For the transport: release a leftover scope without stopping playback. */
    releasePreviewScope,
    isRollPreviewing,
  };
}
