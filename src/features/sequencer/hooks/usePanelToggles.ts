import { useCallback } from "react";

export interface UsePanelTogglesOptions {
  setIsSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setIsEditorMaximized: React.Dispatch<React.SetStateAction<boolean>>;
  setShowAdvancedControls: React.Dispatch<React.SetStateAction<boolean>>;
  setIsVelocityLaneOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsEuclideanOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsAnalyzerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsProjectHubOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Feature #2: the floating mixing console drawer. */
  setIsConsoleOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface UsePanelTogglesResult {
  handleCollapseSidebar: () => void;
  handleToggleSidebar: () => void;
  handleToggleVelocityLane: () => void;
  handleOpenEuclidean: () => void;
  handleToggleAnalyzer: () => void;
  handleOpenProjectHub: () => void;
  handleToggleMaximize: () => void;
  handleToggleAdvancedControls: () => void;
  handleToggleConsole: () => void;
}

/**
 * A-02: visibility toggles for the sequencer chrome — sidebar, maximize, advanced
 * controls and the velocity / Euclidean / analyzer / project-hub overlays. Moved
 * verbatim from `StudioView`; all outputs are stable identities for memoized leaves.
 */
export function usePanelToggles({
  setIsSidebarCollapsed,
  setIsEditorMaximized,
  setShowAdvancedControls,
  setIsVelocityLaneOpen,
  setIsEuclideanOpen,
  setIsAnalyzerOpen,
  setIsProjectHubOpen,
  setIsConsoleOpen,
}: UsePanelTogglesOptions): UsePanelTogglesResult {
  const handleCollapseSidebar = useCallback(() => setIsSidebarCollapsed(true), []);

  const handleToggleSidebar = useCallback(() => setIsSidebarCollapsed((prev) => !prev), []);

  const handleToggleVelocityLane = useCallback(() => setIsVelocityLaneOpen((prev) => !prev), []);

  const handleOpenEuclidean = useCallback(() => setIsEuclideanOpen(true), []);

  const handleToggleAnalyzer = useCallback(() => setIsAnalyzerOpen((prev) => !prev), []);

  const handleOpenProjectHub = useCallback(() => setIsProjectHubOpen(true), []);

  const handleToggleMaximize = useCallback(() => {
    setIsEditorMaximized((prev) => !prev);
    setShowAdvancedControls(false);
  }, []);

  const handleToggleAdvancedControls = useCallback(
    () => setShowAdvancedControls((prev) => !prev),
    []
  );

  const handleToggleConsole = useCallback(() => setIsConsoleOpen((prev) => !prev), []);

  return {
    handleCollapseSidebar,
    handleToggleSidebar,
    handleToggleVelocityLane,
    handleOpenEuclidean,
    handleToggleAnalyzer,
    handleOpenProjectHub,
    handleToggleMaximize,
    handleToggleAdvancedControls,
    handleToggleConsole,
  };
}
