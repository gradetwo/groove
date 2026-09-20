import React, { useState, useRef, useEffect, useCallback } from "react";
import { Genre } from "../types/genre";
import { AudioEngine } from "../audio/AudioEngine";
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

  return {
    playingGenreId,
    isPlaying,
    toggleAudition,
    stopAudition,
    readClock,
  };
}
