/**
 * 📲 **The install and update entries the platform offered and nothing showed.**
 *
 * `initPwa` has always captured the install prompt and watched for a waiting worker, and `pwa.ts` has always exposed
 * `subscribePwaStatus`, `promptInstallApp` and `applyUpdate` — but no component called them, so a user whose browser
 * could install the app had no button and an update waited until the tab was closed. The alignment table listed this
 * as "approved, not started"; the settings panel's About tab now carries the row.
 *
 * Reading this also found a fragility worth keeping fixed: `pwa.ts` called `window.matchMedia` at import time, so a
 * host without that API — jsdom in the unit tests — threw the moment anything imported the module and took a whole
 * settings criterion down with it. A missing API means "cannot know", which is false rather than a crash.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PANEL = "src/components/settings/SettingsModal.tsx";
const ROW = "src/components/settings/PwaInstallRow.tsx";
const PWA = "src/utils/pwa.ts";

describe("the web exposes install and update", () => {
  it("⭐ the row subscribes and offers both actions", () => {
    const row = readFileSync(ROW, "utf8");
    expect({
      subscribes: row.includes("subscribePwaStatus"),
      install: row.includes("promptInstallApp"),
      update: row.includes("applyUpdate"),
      rows: row.includes('data-testid="settings-about-install"') && row.includes('data-testid="settings-about-apply-update"'),
    }).toEqual({ subscribes: true, install: true, update: true, rows: true });
  });

  it("⭐ the settings panel actually renders that row", () => {
    const panel = readFileSync(PANEL, "utf8");
    expect({ imports: panel.includes('from "./PwaInstallRow"'), renders: panel.includes("<PwaInstallRow />") })
      .toEqual({ imports: true, renders: true });
  });

  it("⭐ accepts the platform's install prompt only when it can be honoured", () => {
    const pwa = readFileSync(PWA, "utf8");
    // No deferred prompt ⇒ false rather than a call that does nothing, which is the shape the button depends on.
    expect(pwa).toMatch(/if \(!deferredPrompt\) return false;/);
  });

  it("⭐ importing the module cannot throw on a host without matchMedia", () => {
    const pwa = readFileSync(PWA, "utf8");
    expect(pwa).toContain('typeof window.matchMedia === "function"');
  });

  it("⭐ still measures, so a renamed panel cannot pass quietly", () => {
    const panel = readFileSync(PANEL, "utf8");
    expect({ sizeable: panel.length > 10_000, exportsTabs: panel.includes("SettingsTabId") })
      .toEqual({ sizeable: true, exportsTabs: true });
  });
});
