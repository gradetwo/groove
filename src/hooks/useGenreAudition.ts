import React, { useState, useRef, useEffect, useCallback } from "react";
import { Genre } from "../types/genre";
import { AudioEngine } from "../audio/AudioEngine";
import { patternFromGenre } from "../data/genreMix";
import { announcer } from "../platform/announcer";

export interface UseGenreAuditionReturn {
  playingGenreId: string | null;
  isPlaying: (genreId: string) => boolean;
  toggleAudition: (genre: Genre, e?: React.MouseEvent) => Promise<void>;
  stopAudition: () => void;
}

/**
 * Shared hook to manage AudioEngine lifecycle for 1-click genre auditions.
 * Eliminates duplicated AudioEngine instantiation across Galaxy, HorizontalTimeline,
 * VerticalTimeline, Compare, and Challenge views.
 */
export function useGenreAudition(): UseGenreAuditionReturn {
  const [playingGenreId, setPlayingGenreId] = useState<string | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);

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

  return {
    playingGenreId,
    isPlaying,
    toggleAudition,
    stopAudition,
  };
}
