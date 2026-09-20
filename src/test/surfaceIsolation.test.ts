/**
 * The surface-isolation criterion, kept honest (G.8 item 6).
 *
 * `scripts/check_isolation.mjs` is the real check: it copies `src`, deletes every surface directory
 * and runs `tsc`, so a feature that reaches into a view fails with a module-not-found error. That
 * takes a few seconds and a full TypeScript run, which is right for `verify` and wrong for the
 * feedback loop — and, more importantly, it can only be as complete as its list of surfaces.
 *
 * These three tests cover what the script cannot say about itself: that its list of surfaces still
 * matches the layer gate's definition of a surface (a new `src/screens` added to one and not the
 * other would leave the experiment quietly weaker), that it is actually wired into `verify`, and a
 * direct-import scan that fails in milliseconds with the offending line.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const isolation = read("scripts/check_isolation.mjs");
const layers = read("scripts/check_layers.mjs");
const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };

/** Every `.ts`/`.tsx` under a directory, tests excluded. */
function sourceFiles(relDir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(path.join(ROOT, relDir), { withFileTypes: true })) {
    const rel = path.posix.join(relDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test" || entry.name === "__mocks__") continue;
      sourceFiles(rel, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

describe("surface isolation · the gate covers what it claims to", () => {
  it("removes every directory the layer gate calls a surface", () => {
    // `const UI_DIR_PREFIXES = ["src/components", "src/views", "src/ui"];`
    const declared = /UI_DIR_PREFIXES\s*=\s*\[([^\]]+)\]/.exec(layers)?.[1] ?? "";
    const surfaces = [...declared.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(surfaces.length, "UI_DIR_PREFIXES not found in check_layers.mjs").toBeGreaterThan(0);

    const removed = /SURFACE_PATHS\s*=\s*\[([^\]]+)\]/.exec(isolation)?.[1] ?? "";
    for (const surface of surfaces) {
      expect(removed, `${surface} is a surface in check_layers but not in check_isolation`).toContain(
        surface
      );
    }
  });

  it("runs inside verify, so the criterion is checked on every release", () => {
    expect(pkg.scripts["check:isolation"]).toBe("node scripts/check_isolation.mjs");
    expect(pkg.scripts.verify).toContain("npm run check:isolation");
  });
});

describe("surface isolation · nothing below the surfaces imports one", () => {
  const SURFACE_DIRS = ["src/components", "src/views", "src/ui"];

  it("has no direct import from src/features or src/audio into a surface", () => {
    // The fast counterpart to the tsc experiment: it names the file and the specifier, which is what
    // somebody fixing it needs, and it runs in milliseconds.
    const offenders: string[] = [];
    for (const file of [...sourceFiles("src/features"), ...sourceFiles("src/audio")]) {
      const source = read(file);
      for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
        const specifier = match[1];
        if (!specifier.startsWith(".")) continue;
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
        if (SURFACE_DIRS.some((dir) => resolved === dir || resolved.startsWith(`${dir}/`))) {
          offenders.push(`${file} -> ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not fake the scanner: it catches a surface import when there is one", () => {
    // A scanner that never matches anything is not evidence. Feed it the shape it is looking for.
    const resolve = (file: string, specifier: string) =>
      path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    const sample = "src/features/sequencer/example.ts";
    expect(SURFACE_DIRS.some((d) => resolve(sample, "../../components/x").startsWith(d))).toBe(true);
    expect(SURFACE_DIRS.some((d) => resolve(sample, "../../utils/haptics").startsWith(d))).toBe(false);
  });
});
