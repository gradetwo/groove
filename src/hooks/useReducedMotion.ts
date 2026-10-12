import { useState, useEffect, useCallback } from "react";

export type MotionPreference = "system" | "reduce" | "no-preference";

const STORAGE_KEY = "groove_reduced_motion";

export function getInitialMotionPreference(): MotionPreference {
  if (typeof window === "undefined") return "system";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "reduce" || saved === "no-preference" || saved === "system") {
      return saved;
    }
  } catch {
    // Ignore localStorage errors
  }
  return "system";
}

export function isMotionReduced(pref: MotionPreference): boolean {
  if (typeof window === "undefined") return false;
  if (pref === "reduce") return true;
  if (pref === "no-preference") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useReducedMotion() {
  const [preference, setPreferenceState] = useState<MotionPreference>(getInitialMotionPreference);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => isMotionReduced(getInitialMotionPreference()));

  const applyPreference = useCallback((pref: MotionPreference) => {
    const reduced = isMotionReduced(pref);
    setReducedMotion(reduced);
    if (typeof document !== "undefined") {
      if (reduced) {
        document.documentElement.classList.add("reduced-motion");
      } else {
        document.documentElement.classList.remove("reduced-motion");
      }
    }
  }, []);

  const setPreference = useCallback(
    (newPref: MotionPreference) => {
      setPreferenceState(newPref);
      try {
        localStorage.setItem(STORAGE_KEY, newPref);
      } catch {
        // Ignore
      }
      applyPreference(newPref);
    },
    [applyPreference]
  );

  useEffect(() => {
    applyPreference(preference);

    if (preference !== "system" || typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => {
      applyPreference("system");
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [preference, applyPreference]);

  return {
    preference,
    reducedMotion,
    setPreference,
  };
}
