import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GENRE_INDEX_MAP } from "../data/index/loader";

/**
 * Guards the bug class behind the v1.16.3 fix: two CompareView presets hardcoded
 * genre ids that do not exist (`cyberpunk-midtempo`, `nu-disco`), so clicking them
 * silently did nothing. Runtime lookups of an unknown id return `undefined` and the
 * failure is invisible to both the user and the type checker.
 *
 * This scans the production sources for literal genre-id references and asserts they
 * all resolve. Only string literals used in clearly genre-related positions are
 * checked, so unrelated kebab-case tokens (CSS classes, kick-preset ids, …) do not
 * cause noise.
 */

const SRC_ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set(["data", "test", "i18n", "types"]);

/** Kebab-case tokens that look like genre ids but are deliberately something else. */
const NON_GENRE_ID_ALLOWLIST = new Set([
  "berlin-orphic", // kick preset id (SomaticControls)
  "genre-card",
  "font-semibold",
  "text-accent",
  "border-line",
  "bg-panel",
  "touch-hit-44",
  "touch-target-44",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      walk(path.join(dir, entry.name), out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

interface Reference {
  file: string;
  line: number;
  id: string;
  context: string;
}

/** `FOO_MAP["some-id"]` / `GENRES_MAP[id]` style lookups. */
function findIndexLookups(source: string, file: string): Reference[] {
  const refs: Reference[] = [];
  const lines = source.split("\n");
  const pattern = /\b(GENRES?_MAP|GENRE_INDEX_MAP)\s*\[\s*["']([^"']+)["']\s*\]/g;
  lines.forEach((line, idx) => {
    for (const match of line.matchAll(pattern)) {
      refs.push({ file, line: idx + 1, id: match[2], context: line.trim() });
    }
  });
  return refs;
}

/** Arrays that are unambiguously lists of genre ids: `ids: [...]` and `*GenreIds = [...]`. */
function findGenreIdArrays(source: string, file: string): Reference[] {
  const refs: Reference[] = [];
  const lines = source.split("\n");
  const starts = /(?:^|\s)(?:ids\s*:|[A-Za-z]*[Gg]enre[A-Za-z]*Ids\s*=|[A-Za-z]*demoHeadIds\s*=)\s*\[/;

  for (let i = 0; i < lines.length; i++) {
    if (!starts.test(lines[i])) continue;
    // Collect until the closing bracket of this array.
    let depth = 0;
    const collected: string[] = [];
    for (let j = i; j < Math.min(lines.length, i + 40); j++) {
      const line = lines[j];
      depth += (line.match(/\[/g) || []).length;
      depth -= (line.match(/\]/g) || []).length;
      collected.push(line);
      if (depth <= 0) break;
    }
    const block = collected.join("\n");
    for (const match of block.matchAll(/["']([a-z0-9]+(?:-[a-z0-9]+){1,3})["']/g)) {
      refs.push({ file, line: i + 1, id: match[1], context: block.replace(/\s+/g, " ").slice(0, 160) });
    }
  }
  return refs;
}

describe("every hardcoded genre id reference resolves", () => {
  const files = walk(SRC_ROOT);

  it("finds the sources to scan", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("GENRES_MAP / GENRE_INDEX_MAP lookups never use an unknown id", () => {
    const broken: string[] = [];
    for (const file of files) {
      const rel = path.relative(SRC_ROOT, file);
      for (const ref of findIndexLookups(fs.readFileSync(file, "utf8"), rel)) {
        if (!GENRE_INDEX_MAP[ref.id]) {
          broken.push(`${ref.file}:${ref.line} -> "${ref.id}"`);
        }
      }
    }
    expect(broken, `unknown genre ids in map lookups:\n${broken.join("\n")}`).toEqual([]);
  });

  it("genre-id arrays (presets, demo heads, …) never contain an unknown id", () => {
    const suspicious: string[] = [];
    for (const file of files) {
      const rel = path.relative(SRC_ROOT, file);
      for (const ref of findGenreIdArrays(fs.readFileSync(file, "utf8"), rel)) {
        if (NON_GENRE_ID_ALLOWLIST.has(ref.id)) continue;
        if (GENRE_INDEX_MAP[ref.id]) continue;
        // Only report tokens that could plausibly be a genre id: at least two
        // segments and not a known utility class suffix.
        if (!/^[a-z0-9]+-[a-z0-9-]+$/.test(ref.id)) continue;
        suspicious.push(`${ref.file}:${ref.line} -> "${ref.id}" | ${ref.context}`);
      }
    }
    expect(suspicious, `hardcoded genre-id lists referencing unknown ids:\n${suspicious.join("\n")}`).toEqual([]);
  });

  it("the allowlist only contains ids that truly are not genres", () => {
    const accidental = [...NON_GENRE_ID_ALLOWLIST].filter((id) => GENRE_INDEX_MAP[id]);
    // If one of these ever becomes a real genre id, the allowlist is stale and the
    // check above would silently stop protecting it.
    expect(accidental, `allowlisted ids that ARE genres: ${accidental.join(", ")}`).toEqual([]);
  });
});
