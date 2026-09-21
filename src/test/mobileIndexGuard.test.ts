/**
 * A-01 guard: the phone shell browses the **index**, and loads one category at a time.
 *
 * The regression this file exists to catch: `src/mobile/**` imported `ALL_GENRES` from
 * `src/data/genres`, whose barrel statically imports all fourteen category modules. On the desktop that
 * was invisible (its route resolves a genre through `loadGenre`, and the whole-library views are lazy),
 * but the cutover that made a bare `/` enter the phone shell on a touch device put it on the critical
 * path: the phone's first paint fetched every category chunk — 1061 KB over 4G, three `genre-*` chunks
 * inside the performance gate's 2.5 s window, and it failed.
 *
 * The rule, therefore, is a source rule rather than a measurement (the gate runs in a browser and only
 * counts what lands inside its window; this fails on the commit that reintroduces the import):
 *
 *   **No file under `src/mobile/` may name `ALL_GENRES`, or reference the eager `data/genres` barrel —
 *   statically or dynamically.**
 *
 * The phone reads `GENRE_INDEX` / `GENRE_INDEX_MAP` (metadata only) and calls `loadGenre(id)` for the
 * one full record a surface actually needs; see `src/mobile/mobileGenreData.ts`. Comments are stripped
 * before the scan, so a file may still *explain* the old failure.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../mobile");

/** Every `.ts`/`.tsx` file under `src/mobile/`, recursively. */
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Comments are not code.
 *
 * The shell's own docblocks name the offending module (to explain why it is forbidden), and a scanner
 * that tripped on that prose would make the explanation impossible to write.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("phone shell · the library is browsed by index", () => {
  const files = sourceFiles(MOBILE_DIR);

  it("guards a real tree (so a scan of nothing cannot pass silently)", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((file) => file.endsWith("MobileApp.tsx"))).toBe(true);
    expect(files.some((file) => file.endsWith("MobileHomeScreen.tsx"))).toBe(true);
  });

  it("never names ALL_GENRES or the eager data/genres barrel", () => {
    const offenders = files.filter((file) => {
      const code = stripComments(fs.readFileSync(file, "utf8"));
      return /\bALL_GENRES\b/.test(code) || /\bdata\/genres\b/.test(code);
    });

    expect(
      offenders.map((file) => path.relative(MOBILE_DIR, file)),
      "the phone browses GENRE_INDEX and loads one category chunk at a time via loadGenre"
    ).toEqual([]);
  });
});
