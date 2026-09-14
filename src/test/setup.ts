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

// Running cleanup twice is a no-op, so this is safe even when Testing Library's
// own auto-registration is active.
afterEach(() => {
  cleanup();
});
