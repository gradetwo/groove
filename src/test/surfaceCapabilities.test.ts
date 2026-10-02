/**
 * The surface declaration: one table, held to its own rules, plus the module map that names what implements each
 * capability.
 *
 * The decision it recorded — **the phone shell was a subset with its own UI** — is retired: the shell is cut
 * (`docs/OPEN_WORK.md` §十三) and a phone browser now renders the `desktop` UI, so there is no second surface
 * left to leak into. What survives here is the *table's* consistency (every declared capability names a real
 * surface, every withheld one gives a reason) and the link between a capability and its module.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAPABILITIES,
  CAPABILITY_MODULES,
  SURFACES,
  capabilitiesFor,
  desktopOnly,
  hasCapability,
  type SurfaceId,
} from "../platform/surfaceCapabilities";

// Two levels up: this file is `src/test/…`, and the paths below are repo-relative (`src/…`).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("surface capabilities", () => {
  it("declares every capability for at least one surface", () => {
    for (const entry of CAPABILITIES) {
      expect(entry.surfaces.length, `${entry.id} is declared for no surface`).toBeGreaterThan(0);
      expect(entry.label.length, entry.id).toBeGreaterThan(10);
      for (const surface of entry.surfaces) expect(SURFACES).toContain(surface);
    }
  });

  it("explains every desktop-only capability", () => {
    // A capability the phone does not have needs a reason: "no reason" is how a restriction becomes an accident.
    for (const entry of CAPABILITIES.filter((row) => !row.surfaces.includes("phone"))) {
      expect(entry.reason, `${entry.id} is desktop-only with no reason`).toBeTruthy();
      expect((entry.reason ?? "").length).toBeGreaterThan(20);
    }
  });

  it("keeps the phone a subset, not a fork", () => {
    // Every phone capability must also exist on the desktop: a phone-only feature would be a fork by definition.
    for (const id of capabilitiesFor("phone")) {
      expect(hasCapability("desktop", id), `${id} exists on the phone but not on the desktop`).toBe(true);
    }
    expect(capabilitiesFor("phone").length).toBeLessThan(capabilitiesFor("desktop").length);
  });

  it("lists the desktop-only set explicitly", () => {
    // Fails when someone adds a desktop-only capability without deciding about the phone.
    expect(desktopOnly().sort()).toEqual(
      [
        "arrangement",
        "arrangement-export",
        "hardware-console",
        "piano-roll",
        "project-hub-multitrack",
      ].sort()
    );
  });

  it("names a real module for the capabilities that have one", () => {
    /**
     * The leak check this replaces (`nothing under src/mobile/** may import a desktop-only module`) has no
     * subject left: the shell is cut, so there is no phone tree to scan and no forbidden import to catch. What is
     * still checkable — and worth checking, because the map is the only link between a capability and the code
     * that implements it — is that every entry names a path that exists.
     */
    const entries = Object.entries(CAPABILITY_MODULES);
    expect(entries.length, "at least one capability should name its module").toBeGreaterThan(0);
    for (const [id, modules] of entries) {
      expect(CAPABILITIES.some((row) => row.id === id), `${id} is not a declared capability`).toBe(true);
      for (const modulePath of modules ?? []) {
        // The map stores a module prefix without its extension (`src/components/console`, `…/ArrangementPanel`),
        // so a directory, a `.ts` and a `.tsx` are all a match.
        const candidates = [modulePath, `${modulePath}.ts`, `${modulePath}.tsx`];
        expect(
          candidates.some((candidate) => fs.existsSync(path.join(ROOT, candidate))),
          `${id} names a missing module: ${modulePath}`
        ).toBe(true);
      }
    }
  });

  it("keeps the shared model free of a surface", () => {
    // The song model is shared data, not a surface feature.
    for (const file of ["src/types/song.ts", "src/platform/surfaceCapabilities.ts"]) {
      expect(fs.existsSync(path.join(ROOT, file)), file).toBe(true);
    }
    const songSource = fs.readFileSync(path.join(ROOT, "src/types/song.ts"), "utf8");
    expect(songSource, "the song model must not import a surface").not.toMatch(/from\s+["'][^"']*(components|views|mobile)\//);
  });

  it("answers capability questions for each surface", () => {
    expect(hasCapability("phone", "step-sequencer")).toBe(true);
    expect(hasCapability("phone", "arrangement")).toBe(false);
    expect(hasCapability("desktop", "arrangement")).toBe(true);
    const asMap = (surface: SurfaceId) => Object.fromEntries(capabilitiesFor(surface).map((id) => [id, true]));
    expect(asMap("phone")["arrangement"]).toBeUndefined();
  });
});
