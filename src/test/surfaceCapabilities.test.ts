/**
 * The surface contract: the phone is a **subset**, and the phone shell must not reach past it.
 *
 * The product decision this pins: the phone gets its own UI and interaction layer (which the codebase already
 * separates as `src/mobile/**`) and a *subset* of the features — the multi-track arrangement surface, the
 * piano-roll inspector, the hardware console and multi-clip projects are iPad/PC only.
 *
 * The failure this prevents is not hypothetical: without a check, the next desktop feature is imported into the
 * phone shell by autocomplete, and the phone quietly becomes a second, unmaintained copy of the app. The rule is
 * one-directional and cheap to satisfy — the phone may import the shared model, logic and utilities, and not the
 * desktop-only module paths.
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

function filesUnder(dir: string): string[] {
  const absolute = path.join(ROOT, dir);
  if (!fs.existsSync(absolute)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(child));
    else if (/\.tsx?$/.test(entry.name)) out.push(child);
  }
  return out;
}

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

  it("never lets the phone shell reach a desktop-only module", () => {
    const phoneFiles = filesUnder("src/mobile");
    expect(phoneFiles.length, "the phone shell should still exist").toBeGreaterThan(0);
    const forbidden = desktopOnly().flatMap((id) => CAPABILITY_MODULES[id] ?? []);
    expect(forbidden.length, "at least one desktop-only capability should name its module").toBeGreaterThan(0);

    const leaks: string[] = [];
    for (const file of phoneFiles) {
      const source = fs.readFileSync(path.join(ROOT, file), "utf8");
      for (const modulePath of forbidden) {
        // Any import that resolves to the forbidden path — relative or aliased.
        const needle = modulePath.replace(/^src\//, "");
        if (new RegExp(`from\\s+["'][^"']*${needle}`).test(source) || source.includes(`"@/${needle}`)) {
          leaks.push(`${file} → ${modulePath}`);
        }
      }
    }
    expect(leaks, `the phone shell imports a desktop-only module:\n${leaks.join("\n")}`).toEqual([]);
  });

  it("keeps the shared model available to both surfaces", () => {
    // The song model is shared data, not a desktop feature: the phone may read it (and later, edit one clip of it).
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
