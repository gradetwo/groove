/**
 * U8: what the studio's auto-save is doing, as a React-readable value.
 *
 * `projectStorage` writes the project 500 ms after every change and owns the status; this is only the
 * subscription. `useSyncExternalStore` rather than `useState` + an effect because the status lives
 * outside React and can change without a render (a debounce firing while the user reads the screen) —
 * the same arrangement as the dialog stack and the engine's readiness.
 */
import { useSyncExternalStore } from "react";
import {
  getSaveStatusSnapshot,
  subscribeSaveStatus,
  type SaveStatusSnapshot,
} from "../projectStorage";

export function useAutosaveStatus(): SaveStatusSnapshot {
  return useSyncExternalStore(subscribeSaveStatus, getSaveStatusSnapshot, getSaveStatusSnapshot);
}
