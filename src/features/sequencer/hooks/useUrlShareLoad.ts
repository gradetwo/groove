import { useEffect } from "react";
import { Genre, SequencerPattern } from "../../../types/genre";
import { loadGenre } from "../../../data/index/loader";
import { AudioEngine } from "../../../audio/AudioEngine";
import { decodeSharedSequencer } from "../../../audio/SequencerUrlShare";
import type { SequencerAction } from "../useSequencerStore";

export interface UseUrlShareLoadOptions {
  commit: (action: SequencerAction, recordHistory?: boolean) => void;
  engineRef: React.MutableRefObject<AudioEngine | null>;
  /** Fallback genre when the shared `genreId` cannot be resolved. */
  currentGenre: Genre;
  showToast: (msg: string) => void;
}

/**
 * A-02: the `?groove=` / `?genre=` boot effect, extracted verbatim from
 * `StudioView`. It runs once on mount and therefore intentionally keeps an empty
 * dependency list, closing over the first render's inputs exactly as before.
 */
export function useUrlShareLoad({
  commit,
  engineRef,
  currentGenre,
  showToast,
}: UseUrlShareLoadOptions): void {
  // Handle URL share params
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const sharedCode = urlParams.get("groove");
    const genreParam = urlParams.get("genre");

    if (sharedCode) {
      const decoded = decodeSharedSequencer(sharedCode);
      if (decoded) {
        // A-01: resolve the shared genre on demand instead of from a static map.
        let cancelled = false;
        void loadGenre(decoded.genreId).then((loaded) => {
          if (cancelled) return;
          const found = loaded || currentGenre;
          const newPattern: SequencerPattern = {
            genre_id: decoded.genreId,
            bpm: decoded.bpm,
            scale: decoded.scale || "C minor",
            swing: decoded.swing,
            timeSignature: decoded.timeSignature || "4/4",
            resolution: (decoded.resolution as any) || "1/16",
            totalSteps: decoded.totalSteps || decoded.tracks[0]?.steps?.length || 16,
            tracks: decoded.tracks.map((t) => ({
              track_id: t.track_id as any,
              name: t.name,
              instrument: t.instrument,
              steps: t.steps,
              velocity: t.velocity,
              pitch: t.pitch,
              // F-09: the decoder has always returned these; the view used to drop
              // them, so a shared pattern silently lost its gate/ratchet/probability,
              // per-track length, pan, swing and sends.
              gate: t.gate,
              ratchet: t.ratchet,
              probability: t.probability,
              trackLength: t.trackLength,
              mute: t.mute,
              solo: t.solo,
              volume: t.volume,
              pan: t.pan,
              swing: t.swing,
              sendA: t.sendA,
              sendB: t.sendB,
            })),
          };
          commit({ type: "SET_GENRE", genre: found });
          commit({ type: "COMMIT_PATTERN", pattern: newPattern });
          commit({ type: "SET_BPM", bpm: decoded.bpm });
          commit({ type: "SET_SWING", swing: decoded.swing });
          if (decoded.timeSignature)
            commit({ type: "SET_TIME_SIGNATURE", timeSignature: decoded.timeSignature });
          if (decoded.resolution)
            commit({ type: "SET_RESOLUTION", resolution: decoded.resolution as any });

          if (engineRef.current) {
            engineRef.current.setPattern(newPattern, true);
            engineRef.current.setBpm(decoded.bpm);
            engineRef.current.setSwing(decoded.swing / 100);
            if (decoded.timeSignature) engineRef.current.setTimeSignature(decoded.timeSignature);
            if (decoded.resolution) engineRef.current.setResolution(decoded.resolution as any);
          }
          showToast("Shared Pattern Loaded");
        });
        return () => {
          cancelled = true;
        };
      }
      return;
    }

    if (genreParam) {
      let cancelled = false;
      void loadGenre(genreParam).then((loaded) => {
        if (!cancelled && loaded) commit({ type: "SET_GENRE", genre: loaded });
      });
      return () => {
        cancelled = true;
      };
    }
  }, []);
}
