/**
 * The phone version is cut — and this file is what makes that a *criterion* rather than a fact about one commit.
 *
 * ## Why it exists
 *
 * The cut removed a whole surface: `src/mobile/**`, the phone chrome (`MobileTabBar`, `MobileMoreSheet`,
 * `MobileTransportBar`, `MobileStudioSheet`), the Header's phone variant, the `/m/<module>` route space and 13
 * criteria. A deletion that nothing tests for is indistinguishable from an accident the next person will
 * "helpfully" undo — and the checklist that ordered the cut had already been wrong twice about its own scope
 * (it listed the phone chrome as "keep" while listing its imports as "remove", and it missed that the desktop
 * skins are *generated from* the phone's palette sheets).
 *
 * So this file asserts the two halves of the boundary from the outside:
 *
 *   1. **the shell is gone** — the paths, and any import of them from live source;
 *   2. **the platform it ran on is not** — the iOS silent-switch unlock, device classification, haptics, the
 *      safe-area padding. These are phone-*browser* fixes, not shell code, and removing them would break real
 *      users on a real device.
 *
 * ## The boundary, stated once
 *
 * *Shell* is code whose only reason to exist is rendering the phone's own UI: delete it and a phone browser
 * gets the desktop UI, which is the owner's decision (`docs/OPEN_WORK.md` §十三, preserved on
 * `mobile-preserved`). *Platform* is code that exists because phones **are** devices: a silent switch, a
 * touchscreen, a notch. The first goes; the second stays.
 *
 * ## Reverse test (run by hand, on the commit that cut it)
 *
 * Recreating `src/mobile/MobileApp.tsx` with a one-line `export {}` turns the first case red, which is the
 * evidence that this criterion has discriminating power. A criterion that cannot fail proves nothing.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Every path the cut removed. The tree, the chrome, the phone locale and that locale's criteria. */
const REMOVED = [
  "src/mobile",
  "src/components/MobileTabBar.tsx",
  "src/components/MobileMoreSheet.tsx",
  "src/components/sequencer/MobileTransportBar.tsx",
  "src/components/sequencer/MobileStudioSheet.tsx",
  "src/i18n/locales/mobile.ts",
  "src/test/mobileApp.test.tsx",
  "src/test/mobileShell.test.tsx",
  "src/test/mobileTransportBar.test.tsx",
  "src/test/mobileSharedBottomRow.test.tsx",
  "src/test/mobileBottomControlBar.test.tsx",
  "src/test/mobileChallenge.test.tsx",
  "src/test/mobileExplore.test.tsx",
  "src/test/mobileGenrePicker.test.tsx",
  "src/test/mobileIndexGuard.test.ts",
  "src/test/mobileJam.test.tsx",
  "src/test/mobileMore.test.tsx",
  "src/test/mobilePlayerPort.test.tsx",
  "src/test/headerPhoneSurface.test.tsx",
];

/** The platform the shell ran on, and the one-line reason each one must survive the cut. */
const KEPT: ReadonlyArray<readonly [string, string]> = [
  [
    "src/test/iosAudioUnlock.test.ts",
    "the iOS Safari silent-switch unlock: a phone *browser* fix, so cutting it makes real users silently unable to hear anything",
  ],
  [
    "src/hooks/useDeviceCapabilities.ts",
    "touch / phone / short-landscape classification, which the desktop layout and the gesture guards read",
  ],
  ["src/utils/haptics.ts", "the Vibration API wrapper the touch affordances use"],
];

/** Every `.ts`/`.tsx` under a directory, recursively. */
function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("the phone version is cut", () => {
  it("leaves none of the shell in the tree", () => {
    for (const relative of REMOVED) {
      expect(fs.existsSync(path.join(ROOT, relative)), `${relative} is back`).toBe(false);
    }
  });

  it("leaves no import of the shell in live source", () => {
    /**
     * Comments are stripped first, on purpose: several files *explain* the cut and name `src/mobile/**` while
     * doing so, and a criterion that forbade the word would forbid the record. An `import` — static, side-effect
     * or dynamic — is the thing that would bring the shell back, so all three forms are matched:
     * `from "…/mobile/…"`, `import "…/mobile/…"` and `import("…/mobile/…")`.
     *
     * (The side-effect form is the one an earlier version of this check missed. It was found by running the
     * reverse test with exactly that shape, which is why the reverse test is not optional.)
     */
    const SHELL_IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*["'][^"']*\/mobile\//;
    const leaks: string[] = [];
    for (const file of sourceFiles(path.join(ROOT, "src"))) {
      const source = fs
        .readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "");
      if (SHELL_IMPORT.test(source)) leaks.push(path.relative(ROOT, file));
    }
    expect(leaks, `these files import the cut phone shell:\n${leaks.join("\n")}`).toEqual([]);
  });

  it("keeps the platform the shell ran on", () => {
    for (const [relative, why] of KEPT) {
      expect(fs.existsSync(path.join(ROOT, relative)), `${relative} — ${why}`).toBe(true);
    }
  });

  it("keeps the palette sources the desktop skins are generated from", () => {
    // The one piece of `src/mobile/` that was *not* phone-only: `desktop_skins.mjs` reads these to derive
    // every `--d-*` token, so they moved to a shared home instead of being deleted.
    for (const skin of ["minimal", "comic", "soviet", "sovietYears", "pixel"]) {
      expect(
        fs.existsSync(path.join(ROOT, "src", "styles", "skinPalettes", `${skin}.css`)),
        `${skin} palette source is missing`
      ).toBe(true);
    }
  });
});
