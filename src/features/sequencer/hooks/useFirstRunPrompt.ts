/**
 * U1: the studio's first screen offers **one** action, once.
 *
 * The screen is a dense editor with a pattern already loaded. A first-time visitor gets the guide;
 * everyone else — the returning user, the one who dismissed it — gets a grid and no idea which control
 * to reach for. This hook decides whether a single slim prompt ("press play, then light up a cell") is
 * on screen, and retires it permanently the moment it has done its job.
 *
 * Retired by *any* of: pressing its Play button, starting playback some other way (the space bar, the
 * transport, a lesson), or dismissing it. The last one is a deliberate choice: a hint that comes back
 * after being dismissed is worse than no hint.
 */
import { useCallback, useEffect, useState } from "react";
import { hasStartedPlayback, markPlaybackStarted } from "../firstRun";

export interface UseFirstRunPromptOptions {
  /** The transport's own flag, so playing by any route retires the prompt. */
  isPlaying: boolean;
}

export interface UseFirstRunPromptResult {
  /** True only until the visitor has started playback once (or dismissed the prompt). */
  visible: boolean;
  /** Records that it was used, from the prompt's own Play button. */
  started: () => void;
  /** Records that the visitor does not want it. */
  dismiss: () => void;
}

export function useFirstRunPrompt({ isPlaying }: UseFirstRunPromptOptions): UseFirstRunPromptResult {
  const [visible, setVisible] = useState(() => !hasStartedPlayback());

  const retire = useCallback(() => {
    markPlaybackStarted();
    setVisible(false);
  }, []);

  useEffect(() => {
    // Playback started by another route: the prompt has nothing left to say.
    if (isPlaying && visible) retire();
  }, [isPlaying, retire, visible]);

  return { visible, started: retire, dismiss: retire };
}
