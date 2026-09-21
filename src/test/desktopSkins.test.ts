/**
 * The desktop's six skins: generated, complete, and consistent with the phone.
 *
 * ## Why this file exists
 *
 * The phone has had six skins for a while; the desktop and the iPad (which renders the desktop UI) had one
 * palette, hardcoded in `tailwind.config.js` and in ~1 700 literal `bg-[#…]` values. The user asked for the
 * same six on those surfaces with "配色一致性" — one palette per skin across the whole app.
 *
 * That is easy to *claim* and easy to get wrong in three specific ways, so each has a test here:
 *
 *  1. **Drift.** The desktop palette is generated from the phone's own tokens; if someone edits the phone's
 *     sheet without regenerating, the two surfaces disagree. The first test runs the generator in `--check`
 *     mode.
 *  2. **Gaps.** A skin that forgets a token silently inherits the *default* one, which is exactly the
 *     half-skinned look this feature exists to prevent. The second test compares the token sets.
 *  3. **Literal escape.** Tailwind utilities now resolve through the tokens, but the source is full of
 *     `text-[#eae6dc]`-style literals that a class-compiled utility cannot reach. The sheet remaps them by
 *     *role*; the fourth test fails if a literal used in `src/` has no rule, because on a light skin an
 *     unmapped dark-grey literal is unreadable text — the failure mode is invisible until you switch skins.
 *
 * Readability of every skin's palette is checked next door, in `readabilityAudit.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");
const SKIN_CSS =
  readFileSync(join(ROOT, "src", "styles", "desktopTokens.css"), "utf8") +
  readFileSync(join(ROOT, "src", "styles", "desktopSkins.css"), "utf8");
const CONFIG = readFileSync(join(ROOT, "tailwind.config.js"), "utf8");
const SKIN_IDS = ["default", "minimal", "comic", "soviet", "sovietYears", "pixel"] as const;

/** `--d-x` → `r g b` for one skin. */
function tokens(skin: (typeof SKIN_IDS)[number]): Map<string, string> {
  const block =
    skin === "default"
      ? /:root\s*\{([^}]*)\}/.exec(SKIN_CSS)
      : new RegExp(`:root\\[data-skin="${skin}"\\]\\s*\\{([^}]*)\\}`).exec(SKIN_CSS);
  if (!block) throw new Error(`no token block for ${skin}`);
  const out = new Map<string, string>();
  for (const match of block[1].matchAll(/(--d-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(match[1], match[2].trim());
  return out;
}

/** Every `(prefix)-[#hex]` literal the source actually uses. */
function sourceLiterals(): Map<string, Set<string>> {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|test|__tests__/.test(entry.name)) walk(rel);
      } else if (/\.tsx?$/.test(entry.name)) files.push(rel);
    }
  };
  for (const dir of ["src/components", "src/views", "src/features", "src/ui"]) walk(dir);
  files.push("src/App.tsx");

  const found = new Map<string, Set<string>>();
  for (const file of files) {
    const text = readFileSync(join(ROOT, file), "utf8");
    const re =
      /(?:^|[\s"'])(bg|text|border|from|to|via|ring|shadow|fill|stroke|decoration|divide|outline|accent|caret)-\[(#[0-9a-fA-F]{3,8})\](?:\/(\d{1,3}))?/g;
    for (const match of text.matchAll(re)) {
      const key = (match[2] ?? "").toLowerCase();
      if (!key) continue;
      if (!found.has(key)) found.set(key, new Set());
      found.get(key)!.add(match[1] ?? "");
    }
  }
  return found;
}

describe("desktop skins · the generated sheet", () => {
  it("is up to date with the phone palettes it is derived from", () => {
    // `--check` regenerates in memory and compares, so an edit to a phone skin that is not carried over
    // fails here rather than shipping two surfaces with different colours.
    const output = execFileSync("node", ["scripts/desktop_skins.mjs", "--check"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(output).toContain("desktop skins up to date");
  });

  it("defines every token for every skin, and the same tokens for all six", () => {
    const reference = [...tokens("default").keys()].sort();
    expect(reference.length).toBeGreaterThan(20);
    for (const skin of SKIN_IDS) {
      const own = [...tokens(skin).keys()].sort();
      expect(own, `${skin} is missing tokens the others define`).toEqual(reference);
    }
  });

  it("keeps the default skin exactly as the app looked before skins existed", () => {
    // The one palette that must not move: `default` is what every existing screenshot and expectation was
    // taken against. These are the hexes that were in `tailwind.config.js` before this round.
    const d = tokens("default");
    expect(d.get("--d-bg")).toBe("10 11 13");
    expect(d.get("--d-panel")).toBe("18 19 23");
    expect(d.get("--d-panel2")).toBe("13 14 18");
    expect(d.get("--d-ink")).toBe("233 231 224");
    expect(d.get("--d-accent")).toBe("245 183 61");
    expect(d.get("--d-track-hat")).toBe("69 224 201");
    expect(d.get("--d-cat-electronic")).toBe("74 216 200");
  });

  it("has a rule for every literal the source uses, so no surface is left half-skinned", () => {
    const literals = sourceLiterals();
    expect(literals.size, "the scan should find the desktop's literals").toBeGreaterThan(100);
    const missing = [...literals.keys()].filter((hex) => !SKIN_CSS.includes(`[${hex}]`)).sort();
    expect(missing, "literals with no skin rule (they stay dark-theme colours on a light skin)").toEqual([]);
  });

  it("only ever points a rule at a token that exists", () => {
    const declared = new Set([...tokens("default").keys()]);
    const referenced = new Set(
      [...SKIN_CSS.matchAll(/rgb\(var\((--d-[a-z0-9-]+)\)/g)].map((m) => m[1])
    );
    expect(referenced.size).toBeGreaterThan(15);
    const unknown = [...referenced].filter((name) => !declared.has(name)).sort();
    expect(unknown).toEqual([]);
  });

  it("routes the Tailwind palette through the tokens instead of hexes", () => {
    // The mechanism that makes any of this possible: a compiled utility cannot change at runtime, so every
    // name has to resolve through a custom property.
    // Named entries that are plain strings, and the `DEFAULT` step of the scales (`text`, `accent`, `line`).
    for (const declaration of [
      "bg: 'rgb(var(--d-bg) / <alpha-value>)'",
      "panel: 'rgb(var(--d-panel) / <alpha-value>)'",
      "panel2: 'rgb(var(--d-panel2) / <alpha-value>)'",
      "surface: 'rgb(var(--d-surface) / <alpha-value>)'",
      "DEFAULT: 'rgb(var(--d-ink) / <alpha-value>)'",
      "DEFAULT: 'rgb(var(--d-accent) / <alpha-value>)'",
      "danger: 'rgb(var(--d-danger) / <alpha-value>)'",
      "kick: 'rgb(var(--d-track-kick) / <alpha-value>)'",
    ]) {
      expect(CONFIG, `tailwind.config.js should declare ${declaration}`).toContain(declaration);
    }
    // …and no name may still be a hex, which is what a skin cannot override.
    for (const stale of ["panel: '#", "panel2: '#", "bg: '#", "sub: '#", "dim: '#"]) {
      expect(CONFIG, `tailwind.config.js still hardcodes ${stale}`).not.toContain(stale);
    }
  });
});
