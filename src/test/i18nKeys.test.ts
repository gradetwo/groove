import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DICTIONARY } from "../i18n/locales";

// ---------------------------------------------------------------------------
// Locating sources
// ---------------------------------------------------------------------------

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(TEST_DIR, "..");
const EXCLUDED_DIRS = new Set([path.resolve(SRC_DIR, "test")]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(fullPath)) continue;
      files.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Comment stripping (keeps string / template literal contents untouched)
// ---------------------------------------------------------------------------

type ScanState = "code" | "line-comment" | "block-comment" | "single" | "double" | "template";

/**
 * Returns the source with every `//` and `/* *\/` comment replaced by spaces of
 * the same shape, so byte offsets and line numbers stay meaningful while
 * commented-out `t("...")` calls no longer match. String and template literal
 * bodies are preserved verbatim.
 */
export function stripComments(source: string): string {
  let out = "";
  let i = 0;
  let state: ScanState = "code";

  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];

    switch (state) {
      case "code":
        if (char === "/" && next === "/") {
          state = "line-comment";
          out += "  ";
          i += 2;
          continue;
        }
        if (char === "/" && next === "*") {
          state = "block-comment";
          out += "  ";
          i += 2;
          continue;
        }
        if (char === "'") state = "single";
        else if (char === '"') state = "double";
        else if (char === "`") state = "template";
        out += char;
        i += 1;
        continue;

      case "line-comment":
        if (char === "\n") {
          state = "code";
          out += char;
        } else {
          out += " ";
        }
        i += 1;
        continue;

      case "block-comment":
        if (char === "*" && next === "/") {
          state = "code";
          out += "  ";
          i += 2;
          continue;
        }
        out += char === "\n" ? char : " ";
        i += 1;
        continue;

      default: {
        // Inside a string / template literal: keep everything as-is.
        if (char === "\\") {
          out += char + (next ?? "");
          i += 2;
          continue;
        }
        if (
          (state === "single" && char === "'") ||
          (state === "double" && char === '"') ||
          (state === "template" && char === "`")
        ) {
          state = "code";
        }
        out += char;
        i += 1;
        continue;
      }
    }
  }

  return out;
}

// `t("some.key")` or `t("some.key", { ... })`, only double-quoted literals.
const T_LITERAL_RE = /(?<![\w$.])t\(\s*"((?:[^"\\]|\\.)*)"\s*[,)]/g;

export function findTranslationKeys(code: string): string[] {
  const keys: string[] = [];
  for (const match of code.matchAll(T_LITERAL_RE)) {
    keys.push(match[1]);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const DICTIONARY_KEYS = new Set(Object.keys(DICTIONARY));

describe("i18n key completeness guard (U-03)", () => {
  it("finds every dictionary entry with non-empty en and zh strings", () => {
    const entries = Object.entries(DICTIONARY) as [string, { en: string; zh: string }][];
    expect(entries.length).toBeGreaterThan(0);

    const problems: string[] = [];
    for (const [key, value] of entries) {
      const en = typeof value?.en === "string" ? value.en.trim() : "";
      const zh = typeof value?.zh === "string" ? value.zh.trim() : "";
      if (!en) problems.push(`${key}: missing/empty "en"`);
      if (!zh) problems.push(`${key}: missing/empty "zh"`);
    }

    expect(problems, `Dictionary entries with empty translations:\n${problems.join("\n")}`).toEqual([]);
  });

  it("has no empty en/zh values via direct key lookup", () => {
    for (const key of DICTIONARY_KEYS) {
      const entry = (DICTIONARY as Record<string, { en?: string; zh?: string }>)[key];
      expect(entry?.en?.length, `${key}.en`).toBeGreaterThan(0);
      expect(entry?.zh?.length, `${key}.zh`).toBeGreaterThan(0);
    }
  });

  it("resolves every literal t(\"...\") usage found under src/ to a dictionary key", () => {
    const sourceFiles = collectSourceFiles(SRC_DIR).sort();
    expect(sourceFiles.length).toBeGreaterThan(0);

    const missing = new Map<string, string[]>(); // key -> file[:line]
    let literalUsages = 0;

    for (const file of sourceFiles) {
      const code = stripComments(fs.readFileSync(file, "utf8"));
      const relative = path.relative(SRC_DIR, file).split(path.sep).join("/");

      for (const key of findTranslationKeys(code)) {
        literalUsages += 1;
        if (!DICTIONARY_KEYS.has(key)) {
          const locations = missing.get(key) ?? [];
          locations.push(relative);
          missing.set(key, locations);
        }
      }
    }

    // Sanity check: the scanner must actually see usages, otherwise the guard
    // would silently pass on a broken regex.
    expect(literalUsages).toBeGreaterThan(0);

    const report = [...missing.entries()]
      .map(([key, files]) => `  "${key}" -> ${[...new Set(files)].join(", ")}`)
      .join("\n");
    expect(missing.size, `Missing i18n keys referenced by t("..."):\n${report}`).toBe(0);
  });

  it("strips comments without touching string literals", () => {
    expect(findTranslationKeys(stripComments('t("a") // t("b")'))).toEqual(["a"]);
    expect(findTranslationKeys(stripComments('/* t("b") */ t("a")'))).toEqual(["a"]);
    expect(findTranslationKeys(stripComments('const s = "t(\\"b\\")"; t("a")'))).toEqual(["a"]);
  });
});
