import React, { useState, useRef, useEffect, useCallback } from "react";
import { Genre } from "../types/genre";
import type { SequencerPattern } from "../types/genre";
import { AudioEngine } from "../audio/AudioEngine";
import { createVinylScrub, type VinylScrub } from "../audio/VinylScrub";
import { patternFromGenre } from "../data/genreMix";
import { announcer } from "../platform/announcer";

export interface GenreAuditionClock {
  /** The engine's current step. */
  step: number;
  /** Position inside that step, 0..1, interpolated between the engine's step callbacks. */
  fraction: number;
}

export interface UseGenreAuditionReturn {
  playingGenreId: string | null;
  isPlaying: (genreId: string) => boolean;
  toggleAudition: (genre: Genre, e?: React.MouseEvent) => Promise<void>;
  stopAudition: () => void;
  /**
   * Read the transport position without re-rendering.
   *
   * The phone player's canvas runs at 60 fps and must not push React state that often, so it reads
   * the clock through this accessor instead. `null` means "nothing playing right now".
   *
   * The step comes from the engine (`getCurrentStep`); the fraction is interpolated from the time
   * since that step was observed, because the engine reports step boundaries, not positions. That is
   * the same shape the reference implementation uses (`lastTick.s + f`) and keeps the record locked to
   * the audio rather than to a wall clock.
   */
  readClock: () => GenreAuditionClock | null;
  /**
   * Replace the pattern the engine is playing without restarting it.
   *
   * The phone's 即兴 module edits steps while the loop runs, which is the whole point of a step editor
   * with a playhead: the change has to be audible on the next bar, not after a stop/start. No-op when
   * no engine exists yet (nothing is playing, so the edit is already reflected in the caller's copy).
   */
  applyPattern: (pattern: SequencerPattern) => void;
  /** Live tempo/swing changes for the same reason. No-op before the engine exists. */
  setTempo: (bpm: number) => void;
  setSwingValue: (swing: number) => void;
  /**
   * The hand-on-the-record scratch, for the phone player's jog.
   *
   * `velocity` is the pointer's speed in pixels per millisecond; the voice maps it to a level and a
   * band (see `src/audio/VinylScrub.ts`). A no-op before the engine exists, which is also when there is
   * no context to build it on.
   */
  startVinylScrub: (velocity: number) => void;
  stopVinylScrub: () => void;
  /**
   * Play one track's voice once (a pad or a step tap) through its own mixed destination.
   * `instrument` overrides the track's declared model, for a pad that means a specific sound.
   */
  auditionTrack: (trackId: string, instrument?: string) => void;
}

/**
 * Shared hook to manage AudioEngine lifecycle for 1-click genre auditions.
 * Eliminates duplicated AudioEngine instantiation across Galaxy, HorizontalTimeline,
 * VerticalTimeline, Compare, and Challenge views.
 */
export function useGenreAudition(): UseGenreAuditionReturn {
  const [playingGenreId, setPlayingGenreId] = useState<string | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  /** When the engine last reported a step, for the sub-step interpolation. */
  const lastStepRef = useRef<{ step: number; at: number } | null>(null);

  // Clean up engine on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
        engineRef.current = null;
      }
      scrubRef.current?.dispose();
      scrubRef.current = null;
    };
  }, []);

  const stopAudition = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.stop();
    }
    setPlayingGenreId(null);
    announcer.announce("试听已停止 / Audition stopped");
  }, []);

  const toggleAudition = useCallback(
    async (genre: Genre, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
      }

      if (playingGenreId === genre.id) {
        stopAudition();
        return;
      }

      if (!engineRef.current) {
        engineRef.current = new AudioEngine({
          onStop: () => setPlayingGenreId(null),
        });
        engineRef.current.setOnStep((info) => {
          if (typeof info?.step === "number") {
            lastStepRef.current = { step: info.step, at: performance.now() };
          }
        });
      }

      const engine = engineRef.current;
      engine.stop();
      engine.setPattern(patternFromGenre(genre), true);
      setPlayingGenreId(genre.id);
      announcer.announce(`正在试听：${genre.name} / Auditioning: ${genre.name}`);
      await engine.play();
    },
    [playingGenreId, stopAudition]
  );

  const isPlaying = useCallback(
    (genreId: string) => playingGenreId === genreId,
    [playingGenreId]
  );

  const readClock = useCallback((): GenreAuditionClock | null => {
    const engine = engineRef.current;
    if (!engine) return null;
    const step = engine.getCurrentStep();
    const stepMs = Math.max(1, engine.getStepDuration() * 1000);
    const observed = lastStepRef.current;
    const fraction =
      observed && observed.step === step
        ? Math.min(1, Math.max(0, (performance.now() - observed.at) / stepMs))
        : 0;
    return { step, fraction };
  }, []);

  const applyPattern = useCallback((pattern: SequencerPattern) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setPattern(pattern, false);
  }, []);

  const setTempo = useCallback((bpm: number) => {
    engineRef.current?.setBpm(bpm);
  }, []);

  /**
   * The vinyl scratch, built on demand.
   *
   * Lazily, because it needs the engine's `AudioContext` and the engine is only created when something
   * is first auditioned — and remembered in a ref, because building it per event would create a noise
   * source per pointer move. `stopVinylScrub` releases it rather than tearing it down: a second scratch
   * should reuse the same voice.
   */
  const scrubRef = useRef<VinylScrub | null>(null);

  const startVinylScrub = useCallback((velocity: number) => {
    const target = engineRef.current?.getScrubTarget();
    if (!target) return;
    if (!scrubRef.current) {
      scrubRef.current = createVinylScrub(target.ctx, target.destination, { playing: true });
    }
    scrubRef.current?.setIntensity(velocity);
  }, []);

  const stopVinylScrub = useCallback(() => {
    scrubRef.current?.end();
  }, []);

  /**
   * One manual hit, for the 即兴 pads and step cells.
   *
   * No-op before the engine exists (nothing has been auditioned yet), which is also when there is no
   * context to play into — the caller still gets its visual feedback either way.
   */
  const auditionTrack = useCallback((trackId: string, instrument?: string) => {
    engineRef.current?.auditionTrack(trackId, 1, instrument);
  }, []);

  const setSwingValue = useCallback((swing: number) => {
    engineRef.current?.setSwing(swing);
  }, []);

  return {
    playingGenreId,
    isPlaying,
    toggleAudition,
    stopAudition,
    readClock,
    applyPattern,
    setTempo,
    setSwingValue,
    startVinylScrub,
    stopVinylScrub,
    auditionTrack,
  };
}
