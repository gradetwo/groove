import React, { useEffect, useRef } from "react";

/**
 * ⭐ **The clip audition's transport, mounted only while the pre-cut clip owns the sound.**
 *
 * The element *is* the state: mounting it in the click that chose the clip is what keeps the play inside the user's
 * gesture, and unmounting it pauses it, so "stop" and "switch to drums" cannot leave the MP3 sounding underneath the
 * engine. `onEnded` lets the surface drop its own playing state when the clip finishes rather than leaving a stop button
 * over silence.
 */
export function ClipAuditionAudio({ url, onEnded }: { url: string; onEnded?: () => void }): React.ReactElement {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    void audio.play().catch(() => undefined);
    return () => {
      audio.pause();
    };
  }, [url]);

  return <audio ref={ref} src={url} autoPlay onEnded={onEnded} data-testid="clip-audition-audio" />;
}
