/**
 * **The phone shell's boundary** — this file used to assert that the shell was *cut*.
 *
 * ## Why it reads differently now
 *
 * On 2026-10-10 the owner reversed that decision and asked for the shell back on a `/m` sub-path, so the half of this
 * criterion that said "the shell is gone" is no longer true **by design** — and a criterion that still said it would fight
 * the port instead of protecting anything. The *intent* behind the original file is kept, because it was good: a surface
 * that comes back must not leak into the surface it was separated from. So the two halves are now:
 *
 *   1. **the shell is back** — its core files exist, and nothing outside it may import it except the entry that mounts it
 *      (`src/App.tsx`, which renders `MobileApp` only when the route says so). A desktop component that reaches into
 *      `src/mobile/**` is the leak this guards against, and it is red;
 *   2. **the platform it ran on is untouched** — the iOS silent-switch unlock, device classification, haptics. These are
 *      phone-*browser* fixes, not shell code, and removing them would break real users on a real device.
 *
 * The filename still says "cut" because the file's history is part of the record; the checklist that ordered the original
 * cut had already been wrong twice about its own scope, which is why the boundary is asserted from the outside either way.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The shell's core: the tree, the chrome that mounts with it, and the phone locale it needs. */
const SHELL = [
  "src/mobile/MobileApp.tsx",
  "src/mobile/mobile.css",
  "src/mobile/MobileClipPlayer.tsx",
  "src/i18n/locales/mobile.ts",
  "src/components/MobileTabBar.tsx",
  "src/components/MobileMoreSheet.tsx",
];

/** ⭐ The one file allowed to reach into the shell: the entry that mounts it for the `/m` route. */
const ENTRY = "src/App.tsx";

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("the phone shell's boundary", () => {
  it("⭐ is back, at the paths the port restored", () => {
    for (const relative of SHELL) {
      expect(fs.existsSync(path.join(ROOT, relative)), `${relative} is back`).toBe(true);
    }
  });

  it("⭐ and is imported only by its own entry, never by a desktop surface", () => {
    /**
     * Comments are stripped first, on purpose: several files *explain* the shell and name `src/mobile/**` while doing so,
     * and a criterion that forbade the word would forbid the record. An `import` — static, side-effect or dynamic — is the
     * thing that would drag the shell into a surface it does not belong to, so all three forms are matched.
     */
    const SHELL_IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*["'][^"']*\/mobile\//;
    const leaks: string[] = [];
    for (const file of sourceFiles(path.join(ROOT, "src"))) {
      const relative = path.relative(ROOT, file);
      if (relative.startsWith("src/mobile/") || relative === ENTRY) continue;
      const source = fs
        .readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "");
      if (SHELL_IMPORT.test(source)) leaks.push(relative);
    }
    expect(leaks, `these files import the phone shell, and only ${ENTRY} may:\n${leaks.join("\n")}`).toEqual([]);
  });

  it("keeps the platform the shell ran on", () => {
    for (const [relative, why] of KEPT) {
      expect(fs.existsSync(path.join(ROOT, relative)), `${relative} — ${why}`).toBe(true);
    }
  });
});

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
