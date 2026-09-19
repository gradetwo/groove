/**
 * Vitest global setup (E-13).
 *
 * Why this file exists:
 * - `@testing-library/jest-dom` was installed but never imported, so all of its
 *   matchers (`toBeInTheDocument`, `toHaveTextContent`, ...) were unavailable and
 *   component tests silently fell back to truthiness assertions.
 * - React trees were previously left mounted between cases; registering an
 *   explicit `cleanup()` makes teardown deterministic instead of relying on
 *   Testing Library's global auto-cleanup detection.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { installWebStorage } from "./webStorage";

/**
 * D-01: guarantee Web Storage exists before any test runs.
 *
 * On Node v26.8.2 the jsdom environment's `localStorage` never lands on `globalThis` (newer
 * Node exposes its own, and Vitest only installs jsdom globals for keys that are absent), so
 * 167 storage-backed tests died on `localStorage.clear()`. Installing it explicitly makes the
 * full suite mean the same thing on every host Node version.
 */
installWebStorage();

// Running cleanup twice is a no-op, so this is safe even when Testing Library's
// own auto-registration is active.
afterEach(() => {
  cleanup();
});
