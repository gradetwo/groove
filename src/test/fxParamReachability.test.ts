import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * G-02 — master-FX parameter reachability guard (defect S-P1-4, "有壳无芯").
 *
 * The engine (`EffectorRack` + `AudioEngine.setMaster*`) and the React lifecycle
 * (`useAudioEngineLifecycle.ts`) already accept all seven editable FX fields:
 *
 *   filterCutoff / filterQ / filterType / saturationDrive / chorusMix / chorusRate / bitDepth
 *
 * Before v2.0.1 the whole `src/` tree contained exactly one *read* of each field
 * and **zero writes outside `src/audio/`**: the drawer rendered four on/off toggles
 * and nothing could ever change a cutoff, drive, mix or bit depth. The rack looked
 * usable and was not. This test is the executable statement of that defect: it goes
 * red until the UI genuinely writes every field, and stays green afterwards.
 *
 * What counts as a "write point"
 * -------------------------------
 * A field counts only when it appears as an **unquoted object-literal key (or
 * shorthand property) inside an argument object passed to an FX-state setter**:
 *
 *     onChangeEffectsRack({ filterCutoff: +e.target.value })
 *     setEffectsRackState((prev) => ({ ...prev, bitDepth: v }))   // (see NOTE)
 *
 * The match therefore cannot be satisfied by a passing mention:
 *   - a comment is stripped before scanning;
 *   - a quoted key / string literal (`title="filterCutoff"`, `"filterCutoff"`)
 *     is rejected by the negative look-behind on `'` / `"`;
 *   - a read (`effectsRackState.filterCutoff`) is not followed by `:`;
 *   - a type declaration is not inside a setter call (and `.ts` files are ignored).
 *
 * Only `.tsx` files are scanned, so a plumbing-only write in a `.ts` store is *not*
 * enough — the point of the guard is that a **component** can reach the parameter.
 * `src/audio/` (the DSP layer) and `src/test/` (this file and its string literals)
 * are excluded.
 *
 * NOTE: the setter name list is intentionally explicit rather than "any function
 * call", so renaming the prop is a deliberate, reviewable change.
 */

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(TEST_DIR, "..");

const EXCLUDED_DIRS = new Set([
  path.resolve(SRC_DIR, "audio"), // DSP layer: owns the defaults, not the UI
  path.resolve(SRC_DIR, "test"), // test files mention the names by design
]);

/** The seven editable `EffectsRackState` fields (src/audio/EffectsRack.ts). */
const FX_PARAM_FIELDS = [
  "filterCutoff",
  "filterQ",
  "filterType",
  "saturationDrive",
  "chorusMix",
  "chorusRate",
  "bitDepth",
] as const;

type FxParamField = (typeof FX_PARAM_FIELDS)[number];

/**
 * Call expressions that can actually change FX state. Each must be followed by an
 * object literal argument; the parameter name has to be a key of that object.
 */
const FX_SETTER_OBJECT_RE =
  /\b(?:onChangeEffectsRack|setEffectsRackState|setEffectsRack|updateEffectsRack|patchEffectsRack|commitEffectsRack|applyEffectsRack)\s*\(\s*\{([^}]*)\}/gs;

/** Collects every `.tsx` source file under `src/`, minus the excluded dirs. */
function collectTsxFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(full)) continue;
      files.push(...collectTsxFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Removes `//` and block comments while keeping string literals untouched, so a
 * commented-out example cannot satisfy the guard. Offsets are preserved so line
 * numbers stay truthful.
 */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  let state: "code" | "line" | "block" | "single" | "double" | "template" = "code";

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (state === "code") {
      if (ch === "/" && next === "/") {
        state = "line";
        out += "  ";
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        state = "block";
        out += "  ";
        i += 2;
        continue;
      }
      if (ch === "'") state = "single";
      else if (ch === '"') state = "double";
      else if (ch === "`") state = "template";
      out += ch;
      i += 1;
      continue;
    }

    if (state === "line") {
      if (ch === "\n") {
        state = "code";
        out += ch;
      } else out += " ";
      i += 1;
      continue;
    }

    if (state === "block") {
      if (ch === "*" && next === "/") {
        state = "code";
        out += "  ";
        i += 2;
        continue;
      }
      out += ch === "\n" ? ch : " ";
      i += 1;
      continue;
    }

    // Inside a string / template literal: copy verbatim (escape-aware).
    if (ch === "\\") {
      out += ch + (next ?? "");
      i += 2;
      continue;
    }
    if (
      (state === "single" && ch === "'") ||
      (state === "double" && ch === '"') ||
      (state === "template" && ch === "`")
    ) {
      state = "code";
    }
    out += ch;
    i += 1;
  }

  return out;
}

export interface FxWriteHit {
  file: string; // path relative to src/, e.g. "components/sequencer/Toolbar.tsx"
  line: number;
  field: FxParamField;
  snippet: string;
}

/** True when `body` writes `field` with a value other than a self-read. */
function bodyWritesField(body: string, field: FxParamField): boolean {
  // Unquoted key: `field:` (reject `"field":` / `'field':` / `obj.field:`).
  const keyRe = new RegExp(`(?<![\\w$.'"])${field}\\s*:\\s*([^,}]*)`, "s");
  const key = keyRe.exec(body);
  if (key) {
    const value = key[1].trim();
    // A no-op re-assignment of the same field (`field: effectsRackState.field`)
    // is not a write point.
    const selfRead = new RegExp(`^(?:[A-Za-z_$][\\w$]*\\.)*${field}$`);
    return !selfRead.test(value);
  }
  // Shorthand property: `{ field }` / `{ field, ... }`.
  const shorthandRe = new RegExp(`(?<![\\w$.'"])${field}\\s*(?=[,}])`);
  return shorthandRe.test(body);
}

/** Scans the tree for genuine FX-state writes and groups them by field. */
export function findFxWrites(fields: readonly FxParamField[] = FX_PARAM_FIELDS) {
  const files = collectTsxFiles(SRC_DIR).sort();
  const hits: Record<string, FxWriteHit[]> = {};
  for (const field of fields) hits[field] = [];

  for (const file of files) {
    const code = stripComments(fs.readFileSync(file, "utf8"));
    const relative = path.relative(SRC_DIR, file).split(path.sep).join("/");

    for (const match of code.matchAll(FX_SETTER_OBJECT_RE)) {
      const body = match[1];
      const matchIndex = match.index ?? 0;
      const line = code.slice(0, matchIndex).split("\n").length;
      for (const field of fields) {
        if (!bodyWritesField(body, field)) continue;
        hits[field].push({
          file: relative,
          line,
          field,
          snippet: `{${body.trim().slice(0, 80)}}`,
        });
      }
    }
  }
  return { files, hits };
}

describe("FX param reachability (G-02 / S-P1-4)", () => {
  it("scanner sanity: the pre-existing on/off toggles are detected as writes", () => {
    // If this fails the regex/scanner is broken and the real assertion below would
    // pass vacuously. `filterEnabled` is the four-toggle rack that already shipped.
    const { hits } = findFxWrites(["filterEnabled" as unknown as FxParamField]);
    expect(
      hits.filterEnabled.length,
      "scanner found no write for filterEnabled — the guard is not actually scanning"
    ).toBeGreaterThan(0);
  });

  it("at least one .tsx component is scanned (tree is readable)", () => {
    const { files } = findFxWrites();
    expect(files.length).toBeGreaterThan(0);
  });

  it("every editable FX parameter has at least one write point in a .tsx component", () => {
    const { hits } = findFxWrites();

    const missing = FX_PARAM_FIELDS.filter((field) => hits[field].length === 0);
    const report = missing.map((field) => `  ${field}: 0 write points`).join("\n");
    expect(
      missing,
      `Master FX parameters that no .tsx component can change (S-P1-4 "shell with no core"):\n${report}`
    ).toEqual([]);
  });

  it("records where each parameter is written (diagnostics)", () => {
    const { hits } = findFxWrites();
    for (const field of FX_PARAM_FIELDS) {
      expect(hits[field].length, `${field} write points`).toBeGreaterThan(0);
    }
    // Documentation only: print the reachability map when the suite is verbose.
    // eslint-disable-next-line no-console
    console.info(
      "[fxParamReachability]",
      FX_PARAM_FIELDS.map((f) => `${f}=${hits[f][0].file}:${hits[f][0].line}`).join(" ")
    );
  });
});
