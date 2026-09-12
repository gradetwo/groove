import { useEffect, useRef, useState } from "react";
import { NavTab } from "../components/Header";
import { announcer } from "../ui/AriaLiveRegion";

export interface UseAppShortcutsOptions {
  onNavigateTab: (tab: NavTab) => void;
  isZh: boolean;
}

export function useAppShortcuts({ onNavigateTab, isZh }: UseAppShortcutsOptions) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const pendingGRef = useRef(false);
  const gTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when inside input / textarea / select or contentEditable
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      // Ignore if modifier keys like Ctrl/Meta/Alt are held
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // 1. '?' key (Shift + / or ?) -> Open shortcuts modal
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      // 2. 'g' key prefix for navigation
      if (!pendingGRef.current && e.key.toLowerCase() === "g") {
        pendingGRef.current = true;
        if (gTimerRef.current) clearTimeout(gTimerRef.current);
        gTimerRef.current = setTimeout(() => {
          pendingGRef.current = false;
        }, 1500);
        return;
      }

      // 3. Follow-up key after 'g'
      if (pendingGRef.current) {
        pendingGRef.current = false;
        if (gTimerRef.current) clearTimeout(gTimerRef.current);

        const key = e.key.toLowerCase();
        let targetTab: NavTab | null = null;
        let tabNameZh = "";
        let tabNameEn = "";

        switch (key) {
          case "s":
            targetTab = "studio";
            tabNameZh = "音序工作台";
            tabNameEn = "Studio";
            break;
          case "c":
            targetTab = "chords";
            tabNameZh = "和弦走向";
            tabNameEn = "Chords";
            break;
          case "g":
            targetTab = "galaxy";
            tabNameZh = "律动星系";
            tabNameEn = "Galaxy";
            break;
          case "t":
          case "h":
            targetTab = "horizontal-timeline";
            tabNameZh = "水平时间线";
            tabNameEn = "Timeline";
            break;
          case "v":
            targetTab = "vertical-timeline";
            tabNameZh = "垂直时间轴";
            tabNameEn = "Story";
            break;
          case "m":
          case "p":
            targetTab = "compare";
            tabNameZh = "曲风对比";
            tabNameEn = "Compare";
            break;
          case "q":
          case "a":
            targetTab = "challenge";
            tabNameZh = "听音挑战";
            tabNameEn = "Challenge";
            break;
          case "k":
            targetTab = "kick";
            tabNameZh = "底鼓设计";
            tabNameEn = "Kick Design";
            break;
          default:
            break;
        }

        if (targetTab) {
          e.preventDefault();
          onNavigateTab(targetTab);
          announcer.announce(
            isZh ? `已跳转至：${tabNameZh}` : `Navigated to: ${tabNameEn}`
          );
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (gTimerRef.current) clearTimeout(gTimerRef.current);
    };
  }, [onNavigateTab, isZh]);

  return {
    shortcutsOpen,
    setShortcutsOpen,
  };
}
