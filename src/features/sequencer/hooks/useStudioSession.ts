import { useCallback, useEffect, useState } from "react";
import type { DrumKitType } from "../../../audio/AudioEngine";
import { getDefaultDrumKitForGenre } from "../../../utils/trackUtils";
import { loadKeyboardFabPref, FAB_PREF_CHANGED_EVENT } from "../keyboardFabPref";
import { followReorderedRow } from "../inspectorFollow";

/**
 * The studio's live performance state, out of the view (G.8 item 6).
 *
 * These three values were `useState` calls inside `StudioView`, which meant every *other* surface
 * that wants a transport had to re-implement them (or reach into the view). They are not layout — the
 * comment they used to sit under is explicit that they must not be restored on the next visit:
 * silently re-arming the recorder or re-entering drum-only mode is worse than forgetting.
 *
 * The genre's own kit is where `drumKit` *starts*. Following a genre *change* belongs to
 * `useGenreSwitching`, which owns that transition (it also tells the engine); this hook only owns the
 * value, so the rule lives in one place instead of two.
 */
export interface UsePlaybackSettingsOptions {
  /** The genre the studio opened on — its default kit is the starting kit. */
  genre: Parameters<typeof getDefaultDrumKitForGenre>[0];
}

export interface UsePlaybackSettingsResult {
  drumKit: DrumKitType;
  setDrumKit: React.Dispatch<React.SetStateAction<DrumKitType>>;
  isDrumsOnly: boolean;
  setIsDrumsOnly: React.Dispatch<React.SetStateAction<boolean>>;
  isRecordArmed: boolean;
  setIsRecordArmed: React.Dispatch<React.SetStateAction<boolean>>;
}

export function usePlaybackSettings({
  genre,
}: UsePlaybackSettingsOptions): UsePlaybackSettingsResult {
  const [drumKit, setDrumKit] = useState<DrumKitType>(() => getDefaultDrumKitForGenre(genre));
  const [isDrumsOnly, setIsDrumsOnly] = useState(false);
  const [isRecordArmed, setIsRecordArmed] = useState(false);
  return { drumKit, setDrumKit, isDrumsOnly, setIsDrumsOnly, isRecordArmed, setIsRecordArmed };
}

/**
 * The on-screen keyboard's two pieces of state: whether the performance keyboard is open, and whether
 * its floating button is offered at all.
 *
 * The button's preference is stored (`keyboardFabPref`), so this hook also owns keeping the value in
 * sync when it changes somewhere else — the settings panel writes it in the same tab (custom event)
 * and another tab writes it in another (storage event). Both used to be handled by an effect inside
 * `StudioView`.
 */
export interface UseKeyboardPerformanceResult {
  isKeyboardMode: boolean;
  setIsKeyboardMode: React.Dispatch<React.SetStateAction<boolean>>;
  showKeyboardFab: boolean;
  setShowKeyboardFab: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useKeyboardPerformance(): UseKeyboardPerformanceResult {
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);
  const [showKeyboardFab, setShowKeyboardFab] = useState<boolean>(() => loadKeyboardFabPref());

  useEffect(() => {
    const handleFabSync = () => setShowKeyboardFab(loadKeyboardFabPref());
    window.addEventListener(FAB_PREF_CHANGED_EVENT, handleFabSync);
    window.addEventListener("storage", handleFabSync);
    return () => {
      window.removeEventListener(FAB_PREF_CHANGED_EVENT, handleFabSync);
      window.removeEventListener("storage", handleFabSync);
    };
  }, []);

  return { isKeyboardMode, setIsKeyboardMode, showKeyboardFab, setShowKeyboardFab };
}

/**
 * Which track's inspector is open, and keeping it on the same *track* across row reorders.
 *
 * The remap rule itself is `inspectorFollow.followReorderedRow` (pure, and already tested); what
 * lives here is the state plus the one way it may change without the user clicking a header. It was a
 * `useState` + `useCallback` pair inside `StudioView`, i.e. behaviour the next surface would have had
 * to copy.
 */
export interface UseInspectorCursorResult {
  inspectorTrackIdx: number | null;
  setInspectorTrackIdx: React.Dispatch<React.SetStateAction<number | null>>;
  /** Call after a reorder: the open inspector must follow its track, not the row index. */
  moveInspectorWithRow: (fromIndex: number, toIndex: number) => void;
}

export function useInspectorCursor(): UseInspectorCursorResult {
  const [inspectorTrackIdx, setInspectorTrackIdx] = useState<number | null>(null);

  const moveInspectorWithRow = useCallback((fromIndex: number, toIndex: number) => {
    setInspectorTrackIdx((current) => followReorderedRow(current, fromIndex, toIndex));
  }, []);

  return { inspectorTrackIdx, setInspectorTrackIdx, moveInspectorWithRow };
}
