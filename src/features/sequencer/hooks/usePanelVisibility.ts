/**
 * Panel visibility and layout state, as a hook any surface may mount.
 *
 * These seven booleans were 40-odd lines of `useState` plus a persistence effect inside
 * `StudioView` — a 1255-line view that is about to have three sibling implementations. State that
 * describes *which panels are open* is not a view's private business: every surface needs the same
 * seven, the same defaults and the same persistence, and a new surface should not have to copy the
 * effect (or, worse for the user, forget to and lose their layout on refresh).
 *
 * Extracted verbatim: same defaults (read once from storage, never re-read, so a stale or failing
 * read cannot fight the user's clicks), same persisted set, same guarantee that the three live-
 * performance flags are *not* persisted — see `layoutPrefs`' note on D-06; silently re-arming the
 * recorder on the next visit would be a surprise, possibly a destructive one.
 *
 * Deliberately UI-free: this returns values and setters, and knows nothing about how a surface
 * renders a panel. A surface may ignore any of them (a phone shell has no sidebar to collapse)
 * without that being a change here.
 */
import { useEffect, useState } from "react";
import { loadLayoutPrefs, saveLayoutPrefs } from "../layoutPrefs";

export interface PanelVisibilityState {
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  isEditorMaximized: boolean;
  setIsEditorMaximized: React.Dispatch<React.SetStateAction<boolean>>;
  isVelocityLaneOpen: boolean;
  setIsVelocityLaneOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Which track the velocity drawer is editing. Not persisted: it is a cursor, not a layout. */
  velocityActiveTrackIdx: number;
  setVelocityActiveTrackIdx: React.Dispatch<React.SetStateAction<number>>;
  isPianoRollOpen: boolean;
  setIsPianoRollOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Which track the piano roll is editing. Not persisted, same reasoning as the velocity cursor. */
  pianoRollTrackIdx: number;
  setPianoRollTrackIdx: React.Dispatch<React.SetStateAction<number>>;
  isEuclideanOpen: boolean;
  setIsEuclideanOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isAnalyzerOpen: boolean;
  setIsAnalyzerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showAdvancedControls: boolean;
  setShowAdvancedControls: React.Dispatch<React.SetStateAction<boolean>>;
  autoFollowPlayhead: boolean;
  setAutoFollowPlayhead: React.Dispatch<React.SetStateAction<boolean>>;
}

export function usePanelVisibility(): PanelVisibilityState {
  /**
   * Read **once** on mount. Re-reading on every render would let a stale or failing storage read
   * overwrite what the user just clicked — the original code's comment called this out explicitly,
   * and it is the reason this is `useState(() => …)` rather than `useState(loadLayoutPrefs()…)`.
   */
  const [bootPrefs] = useState(() => loadLayoutPrefs());

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(bootPrefs.isSidebarCollapsed);
  const [isEditorMaximized, setIsEditorMaximized] = useState<boolean>(bootPrefs.isEditorMaximized);
  const [isVelocityLaneOpen, setIsVelocityLaneOpen] = useState(bootPrefs.isVelocityLaneOpen);
  const [velocityActiveTrackIdx, setVelocityActiveTrackIdx] = useState(0);
  const [isPianoRollOpen, setIsPianoRollOpen] = useState(bootPrefs.isPianoRollOpen);
  const [pianoRollTrackIdx, setPianoRollTrackIdx] = useState(0);
  const [isEuclideanOpen, setIsEuclideanOpen] = useState(false);
  const [isAnalyzerOpen, setIsAnalyzerOpen] = useState(bootPrefs.isAnalyzerOpen);
  const [showAdvancedControls, setShowAdvancedControls] = useState(bootPrefs.showAdvancedControls);
  const [autoFollowPlayhead, setAutoFollowPlayhead] = useState<boolean>(bootPrefs.autoFollowPlayhead);

  useEffect(() => {
    saveLayoutPrefs({
      isSidebarCollapsed,
      isEditorMaximized,
      isVelocityLaneOpen,
      isAnalyzerOpen,
      isPianoRollOpen,
      showAdvancedControls,
      autoFollowPlayhead,
    });
  }, [
    isSidebarCollapsed,
    isEditorMaximized,
    isVelocityLaneOpen,
    isAnalyzerOpen,
    isPianoRollOpen,
    showAdvancedControls,
    autoFollowPlayhead,
  ]);

  return {
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    isEditorMaximized,
    setIsEditorMaximized,
    isVelocityLaneOpen,
    setIsVelocityLaneOpen,
    velocityActiveTrackIdx,
    setVelocityActiveTrackIdx,
    isPianoRollOpen,
    setIsPianoRollOpen,
    pianoRollTrackIdx,
    setPianoRollTrackIdx,
    isEuclideanOpen,
    setIsEuclideanOpen,
    isAnalyzerOpen,
    setIsAnalyzerOpen,
    showAdvancedControls,
    setShowAdvancedControls,
    autoFollowPlayhead,
    setAutoFollowPlayhead,
  };
}
