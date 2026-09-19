import { useEffect } from "react";

export interface StepContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  trackIdx: number;
  stepIdx: number;
}

export interface PitchPickerState {
  isOpen: boolean;
  trackIdx: number;
  stepIdx: number;
  initialNote: number | null;
}

export interface UseTransportShortcutsOptions {
  isProjectHubOpen: boolean;
  stepContextMenu: StepContextMenuState | null;
  setStepContextMenu: React.Dispatch<React.SetStateAction<StepContextMenuState | null>>;
  isPitchPickerOpen: boolean;
  setPitchPicker: React.Dispatch<React.SetStateAction<PitchPickerState>>;
  isEuclideanOpen: boolean;
  setIsEuclideanOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isVelocityLaneOpen: boolean;
  setIsVelocityLaneOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isAnalyzerOpen: boolean;
  setIsAnalyzerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isEditorMaximized: boolean;
  setIsEditorMaximized: React.Dispatch<React.SetStateAction<boolean>>;
  setIsProjectHubOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Floating mixing console (调音台): Esc closes it before any other overlay. */
  isConsoleOpen?: boolean;
  setIsConsoleOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  onTogglePlay: () => void;
  onToggleDrumsOnly: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleKeyboardMode?: () => void;
}

/**
 * A-02: the global transport/grid keyboard shortcuts (Space, Esc, P, D, V, E, O,
 * Ctrl/Cmd+Z/Y) plus the click-away that dismisses the step context menu. Moved
 * verbatim from the window-listener effect in `StudioView`.
 */
export function useTransportShortcuts({
  isProjectHubOpen,
  stepContextMenu,
  setStepContextMenu,
  isPitchPickerOpen,
  setPitchPicker,
  isEuclideanOpen,
  setIsEuclideanOpen,
  isVelocityLaneOpen,
  setIsVelocityLaneOpen,
  isAnalyzerOpen,
  setIsAnalyzerOpen,
  isEditorMaximized,
  setIsEditorMaximized,
  setIsProjectHubOpen,
  isConsoleOpen = false,
  setIsConsoleOpen,
  onTogglePlay,
  onToggleDrumsOnly,
  onUndo,
  onRedo,
  onToggleKeyboardMode,
}: UseTransportShortcutsOptions): void {
  // Keyboard shortcuts (Space, Esc, V, E, Undo/Redo)
  useEffect(() => {
    // A focused control swallows transport keys only when it is a text-entry
    // control: text/number/search inputs, textarea, select or contentEditable.
    // A focused range slider must NOT permanently kill transport shortcuts (U-09).
    const isTextEntryTarget = (el: HTMLElement | null): boolean => {
      if (!el) return false;
      if (el.isContentEditable) return true;
      const editableHost = el.closest<HTMLElement>("[contenteditable]");
      if (editableHost && editableHost.isContentEditable) return true;
      const control = el.closest<HTMLElement>("input, textarea, select");
      if (!control) return false;
      if (control.tagName === "TEXTAREA" || control.tagName === "SELECT") return true;
      const type = (control as HTMLInputElement).type?.toLowerCase() || "text";
      return type !== "range";
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Respect handlers that already consumed the event (U-09)
      if (e.defaultPrevented) {
        return;
      }

      // Transport/grid shortcuts must not fire behind an open modal dialog (U-09)
      if (
        typeof document !== "undefined" &&
        document.querySelector('[role="dialog"][aria-modal="true"]') !== null
      ) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (isTextEntryTarget(target)) {
        return;
      }

      if (e.code === "Space") {
        if (target && (target.tagName === "BUTTON" || Boolean(target.closest("button")))) {
          return;
        }
        e.preventDefault();
        onTogglePlay();
      } else if (e.key === "Escape") {
        if (isConsoleOpen && setIsConsoleOpen) {
          // The floating console is the topmost surface; Esc dismisses it first.
          e.preventDefault();
          setIsConsoleOpen(false);
        } else if (isProjectHubOpen) {
          setIsProjectHubOpen(false);
        } else if (stepContextMenu) {
          setStepContextMenu(null);
        } else if (isPitchPickerOpen) {
          setPitchPicker((prev) => ({ ...prev, isOpen: false }));
        } else if (isEuclideanOpen) {
          setIsEuclideanOpen(false);
        } else if (isVelocityLaneOpen) {
          setIsVelocityLaneOpen(false);
        } else if (isAnalyzerOpen) {
          setIsAnalyzerOpen(false);
        } else if (isEditorMaximized) {
          e.preventDefault();
          setIsEditorMaximized(false);
        }
      } else if ((e.key === "p" || e.key === "P") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setIsProjectHubOpen((prev) => !prev);
      } else if ((e.key === "d" || e.key === "D") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onToggleDrumsOnly();
      } else if ((e.key === "v" || e.key === "V") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsVelocityLaneOpen((prev) => !prev);
      } else if ((e.key === "e" || e.key === "E") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsEuclideanOpen(true);
      } else if ((e.key === "o" || e.key === "O") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsAnalyzerOpen((prev) => !prev);
      } else if (
        (e.key === "c" || e.key === "C") &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        setIsConsoleOpen
      ) {
        // Feature #2: C floats / dismisses the mixing console over the studio.
        e.preventDefault();
        setIsConsoleOpen((prev) => !prev);
      } else if (
        e.altKey &&
        (e.code === "KeyK" || (e as any).keyCode === 75) &&
        onToggleKeyboardMode
      ) {
        // Musical Typing HUD toggle (Option+K / Alt+K)
        e.preventDefault();
        onToggleKeyboardMode();
      } else {
        const isMac =
          typeof navigator !== "undefined" && /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
        const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

        if (isCmdOrCtrl && (e.key === "z" || e.key === "Z")) {
          e.preventDefault();
          if (e.shiftKey) {
            onRedo();
          } else {
            onUndo();
          }
        } else if (isCmdOrCtrl && (e.key === "y" || e.key === "Y")) {
          e.preventDefault();
          onRedo();
        }
      }
    };

    const handleGlobalClick = () => {
      if (stepContextMenu) {
        setStepContextMenu(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("click", handleGlobalClick);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("click", handleGlobalClick);
    };
  }, [
    isProjectHubOpen,
    stepContextMenu,
    isPitchPickerOpen,
    isEuclideanOpen,
    isVelocityLaneOpen,
    isAnalyzerOpen,
    isEditorMaximized,
    isConsoleOpen,
    setIsConsoleOpen,
    onTogglePlay,
    onToggleDrumsOnly,
    onUndo,
    onRedo,
    onToggleKeyboardMode,
  ]);
}
