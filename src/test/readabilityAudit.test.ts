/**
 * UI text must be readable: enough contrast against the surface it is on, and not shrunk below the
 * point where the toolbar's own labels can be read (U12).
 *
 * The audit that produced this gate found **66 distinct hard-coded text colours** in `src/`, of which
 * 10 sat below 3:1 and 8 more below the 4.5:1 WCAG AA floor for body text — measured against
 * `--panel #121317`, the surface nearly all of it is drawn on. Two were named in the plan
 * (`ChallengeView`'s placeholder at 2.23:1, the ruler's tick labels at 1.73:1); the rest were found
 * by measuring rather than by reading the plan, and 52 occurrences across 11 files moved onto the
 * `text-dim` token that already existed for that role.
 *
 * This test is deliberately a **scanner and not a screenshot**: it can see every colour in the source
 * at once, it runs in milliseconds, and it fails on the line that introduced the problem. What it
 * cannot see is a colour whose background comes from an ancestor — so those cases must be listed in
 * `ALLOWED` **with a reason**, the same explicit-decision style as `check_doc_refs.mjs`'s PROPOSED
 * map. An allowlist entry is a reviewable claim; a clever heuristic that guesses at backgrounds is
 * how a check quietly stops checking (G.15).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
// @ts-expect-error the Tailwind config is plain JS; there is no declaration file for it.
import tailwindConfig from "../../tailwind.config.js";

const SRC = resolve(__dirname, "..");

/** WCAG 2.1 relative luminance and contrast ratio. */
const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r / 255) + 0.7152 * channel(g / 255) + 0.0722 * channel(b / 255);
}

export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

const AA_NORMAL = 4.5;

/**
 * Where the palette comes from now.
 *
 * The desktop's colours are **skins** as of the six-theme round: `tailwind.config.js` names resolve through
 * `rgb(var(--d-…))`, and the values live in `src/styles/desktopSkins.css`, generated from the phone's own
 * tokens by `scripts/desktop_skins.mjs`. So this audit reads that sheet instead of the config — and it
 * checks **every skin**, not just the default one, because "readable" is a property of a palette and there
 * are now six of them. A skin that cannot be read is a bug in the skin, and this is the gate that says so.
 */
const SKIN_CSS =
  readFileSync(join(SRC, "styles", "desktopTokens.css"), "utf8") +
  readFileSync(join(SRC, "styles", "desktopSkins.css"), "utf8");
const SKIN_IDS = ["default", "minimal", "comic", "soviet", "sovietYears", "pixel"] as const;

/** `--d-panel` per skin, as `#rrggbb`. Channels in the sheet are space-separated (`18 19 23`). */
function skinTokens(skin: (typeof SKIN_IDS)[number]): Record<string, string> {
  const block =
    skin === "default"
      ? /:root\s*\{([^}]*)\}/.exec(SKIN_CSS)
      : new RegExp(`:root\\[data-skin="${skin}"\\]\\s*\\{([^}]*)\\}`).exec(SKIN_CSS);
  if (!block) throw new Error(`desktopSkins.css: no token block for ${skin}`);
  const tokens: Record<string, string> = {};
  for (const match of block[1].matchAll(/(--d-[a-z0-9-]+)\s*:\s*([0-9]+)\s+([0-9]+)\s+([0-9]+)\s*;/g)) {
    tokens[match[1]] = (
      "#" +
      [match[2], match[3], match[4]]
        .map((v) => Number(v).toString(16).padStart(2, "0"))
        .join("")
    );
  }
  return tokens;
}

/** The config's names, mapped to the variable each one now resolves through. */
const palette = tailwindConfig.theme.extend.colors as unknown as Record<string, unknown>;

function configValue(path: string): string | null {
  const parts = path.split(".");
  let node: unknown = palette;
  for (const part of parts) {
    if (typeof node !== "object" || node === null) return null;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === "object" && node !== null) {
    const fallback = (node as Record<string, unknown>).DEFAULT;
    return typeof fallback === "string" ? fallback : null;
  }
  return typeof node === "string" ? node : null;
}

const DEFAULT_TOKENS = skinTokens("default");

/**
 * `text-dim` → the default skin's `--d-ink-2` as a hex.
 *
 * The hop through the config (`rgb(var(--d-ink-2) / <alpha-value>)`) rather than a hand-written name map is
 * deliberate: rename a token in the config and this keeps working, whereas a second table here would rot.
 */
function resolveToken(name: string): string | null {
  const declared = configValue(name.replace(/-/g, "."));
  if (!declared) return null;
  const variable = /var\((--d-[a-z0-9-]+)\)/.exec(declared);
  if (variable) return DEFAULT_TOKENS[variable[1]] ?? null;
  return declared.startsWith("#") ? declared : null;
}

const PANEL = resolveToken("panel")!;

/**
 * Occurrences whose background is not in the same class string.
 *
 * Rare and structural: the piano roll's white-key label takes its background from the *sibling*
 * branch of the same ternary (the key's own light gradient), which no line-local scan can see.
 */
const ALLOWED: Array<{ file: string; colour: string; reason: string }> = [
  {
    file: "src/components/sequencer/PianoRollLane.tsx",
    colour: "#1a1d29",
    reason:
      "the white-key pitch label: the light key gradient it sits on is declared by the parent button's ternary, and the label's own class string only names the ink.",
  },
];

/**
 * Every `text-[#hex]` in the source, with the backgrounds its own class literal declares.
 *
 * Two things this has to get right, both learned from getting them wrong first:
 *
 *  - **The class literal, not the line.** A `className` template literal spans lines (the ternary
 *    forms put `bg-accent` on one line and `text-[#0a0b0d]` on the next), so a line-local scan
 *    reported dark-on-accent knockout text as dark-on-panel.
 *  - **The declared background, including a gradient.** A gradient has several stops and the text
 *    must be readable against *all* of them, so the ratio is the worst one. An opacity suffix
 *    (`bg-[#4ad8c8]/20`) is composited over the panel rather than treated as the raw colour — the
 *    difference between "invisible text" and a perfectly readable tinted chip.
 */
const QUOTES = ['"', "'", "`"];

export function classLiteralAround(source: string, at: number): string {
  let start = 0;
  for (let i = at; i >= 0; i--) {
    if (QUOTES.includes(source[i])) {
      start = i + 1;
      break;
    }
  }
  let end = source.length;
  for (let i = at; i < source.length; i++) {
    if (QUOTES.includes(source[i])) {
      end = i;
      break;
    }
  }
  return source.slice(start, end);
}

/** `#hex` at `alpha` over `base`, as the browser would paint it. */
export function composite(
  hex: string,
  alpha: number,
  base: [number, number, number]
): [number, number, number] {
  const fg = hexToRgb(hex);
  return fg.map((c, i) => Math.round(c * alpha + base[i] * (1 - alpha))) as [
    number,
    number,
    number,
  ];
}

/** Tailwind writes opacity three ways: `/20`, `/[0.06]`, `/[6%]`. Bare integers are percents. */
function alphaAfter(cls: string, end: number): number {
  const match = cls.slice(end).match(/^\/(?:\[(\d*\.?\d+)(%?)\]|(\d+))/);
  if (!match) return 1;
  if (match[3]) return Number(match[3]) / 100;
  if (match[2]) return Number(match[1]) / 100;
  const value = Number(match[1]);
  return value < 1 ? value : value / 100;
}

/** Every background a class literal declares: hex, hex-with-opacity, or palette token.
 *
 *  A background is kept together with the variant it is gated on (`hover:bg-accent` → `hover:`),
 *  because a variant's surface only exists while that variant is active: `group-hover:bg-accent`
 *  paired with `group-hover:text-[#0a0b0d]` is a correct knockout, while treating the pair as
 *  "dark text on the resting panel2" would report it as an invisible label.
 */
export function backgroundsIn(
  literal: string,
  panel: [number, number, number],
  textPrefix = ""
): string[] {
  const solids: Array<{ prefix: string; colour: string }> = [];
  const hex = (rgb: [number, number, number]) =>
    `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

  for (const cls of literal.split(/\s+/)) {
    const matches = cls.matchAll(
      /(?:bg|from|via|to)-(?:\[(#[0-9a-fA-F]{3,6})\]|(white|black)|(panel2|panel|bg|accent)\b)/g
    );
    for (const match of matches) {
      const prefix = cls.slice(0, match.index ?? 0);
      const alpha = alphaAfter(cls, (match.index ?? 0) + match[0].length);
      if (match[1]) {
        solids.push({
          prefix,
          colour: hex(alpha < 1 ? composite(match[1], alpha, panel) : hexToRgb(match[1])),
        });
        continue;
      }
      // `bg-white/[0.06]` is translucent white over whatever is behind it — without this the scan
      // reads the panel underneath and misses a tint that lifts the surface by two stops.
      if (match[2]) {
        const base = match[2] === "white" ? "#ffffff" : "#000000";
        solids.push({
          prefix,
          colour: hex(alpha < 1 ? composite(base, alpha, panel) : hexToRgb(base)),
        });
        continue;
      }
      const colour = resolveToken(match[3]);
      if (colour) solids.push({ prefix, colour });
    }
  }

  if (textPrefix) {
    // A variant-gated ink answers to the same variant's surface; if the literal names no such
    // surface, the pairing is checked against every background, because a colour that changes
    // state without a matching background change is usually a mistake.
    const same = solids.filter((s) => s.prefix === textPrefix);
    return (same.length ? same : solids).map((s) => s.colour);
  }
  const resting = solids.filter((s) => s.prefix === "");
  return (resting.length ? resting : solids).map((s) => s.colour);
}

export function scanSource(
  source: string,
  file: string
): Array<{ file: string; line: number; colour: string; backgrounds: string[] }> {
  const out: Array<{ file: string; line: number; colour: string; backgrounds: string[] }> = [];
  const panel = hexToRgb(PANEL);
  for (const match of source.matchAll(/text-\[(#[0-9a-fA-F]{3,6})\]/g)) {
    const at = match.index ?? 0;
    const literal = classLiteralAround(source, at);
    // `group-hover:text-[#0a0b0d]` → `group-hover:`; the ink and the surface must share it.
    const cls = literal.split(/\s+/).find((c) => c.includes(match[0])) ?? "";
    out.push({
      file,
      line: source.slice(0, at).split("\n").length,
      colour: match[1],
      backgrounds: backgroundsIn(literal, panel, cls.slice(0, cls.indexOf(match[0]))),
    });
  }
  return out;
}

/** Every `text-[Npx]` below `floor`, as `line  class`; the detector the toolbar test runs on. */
export function smallTypeIn(source: string, floor = 10): string[] {
  const out: string[] = [];
  source.split("\n").forEach((text, index) => {
    for (const match of text.matchAll(/text-\[(\d*\.?\d+)px\]/g)) {
      if (Number(match[1]) < floor) out.push(`${index + 1}  text-[${match[1]}px]`);
    }
  });
  return out;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !full.includes("/test/")) out.push(full);
  }
  return out;
}

describe("contrast · the palette", () => {
  it("keeps every text token readable on both surfaces of every skin", () => {
    /**
     * Six palettes, and every one of them has to be readable on its own grounds. This is the gate that
     * makes a new skin safe: it is easy to write a theme that looks striking in a screenshot and leaves the
     * 11 px labels at 3:1.
     */
    for (const skin of SKIN_IDS) {
      const tokens = skinTokens(skin);
      const text = { text: tokens["--d-ink"], "text.sub": tokens["--d-ink-3"], "text.dim": tokens["--d-ink-2"] };
      for (const surface of ["--d-panel", "--d-bg"] as const) {
        const bg = hexToRgb(tokens[surface]);
        for (const [name, colour] of Object.entries(text)) {
          const ratio = contrast(hexToRgb(colour), bg);
          expect(ratio, `${skin}: ${name} (${colour}) on ${surface} (${tokens[surface]})`).toBeGreaterThanOrEqual(
            AA_NORMAL
          );
        }
      }
      // The accent is used for text too (section titles, active tabs), so it is held to the same floor.
      for (const surface of ["--d-panel", "--d-bg"] as const) {
        const ratio = contrast(hexToRgb(tokens["--d-accent"]), hexToRgb(tokens[surface]));
        expect(ratio, `${skin}: accent (${tokens["--d-accent"]}) on ${surface}`).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    }
  });
});

describe("contrast · hard-coded text colours", () => {
  it("is readable on the surface the class string declares, or on the panel", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file);
      for (const hit of scanSource(readFileSync(file, "utf8"), `src/${rel}`)) {
        const backgrounds = hit.backgrounds.length ? hit.backgrounds : [PANEL];
        const worst = Math.min(
          ...backgrounds.map((bg) => contrast(hexToRgb(hit.colour), hexToRgb(bg)))
        );
        if (worst >= AA_NORMAL) continue;
        const excused = ALLOWED.some((a) => a.file === hit.file && a.colour === hit.colour);
        if (excused) continue;
        offenders.push(
          `${hit.file}:${hit.line}  ${hit.colour} on ${backgrounds.join("/")} = ${worst.toFixed(2)}:1`
        );
      }
    }

    expect(offenders, `hard-coded text below ${AA_NORMAL}:1:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("type · the toolbar's own labels", () => {
  /**
   * U12's second half. The plan measured 44 toolbar controls at ≤10px; `measure_toolbar_density.mjs`
   * counts *controls*, not pixels, so this half of the row is invisible to every other gate. After
   * the toolbar rebuild the smallest label is 10px, and this is what keeps it there.
   *
   * Below 10px is not banned across the app: the ruler's `BAR n` sub-label and the step cells'
   * velocity figures are micro-labels whose size is what lets them fit a 28px minimum cell (at 9px a
   * six-character `BAR 12` is 32px wide and overflows it). Their readability is the contrast audit's
   * job, and that audit covers them.
   */
  it("keeps every control-surface label at 10px or larger", () => {
    const offenders: string[] = [];
    for (const rel of ["components/sequencer/Toolbar.tsx", "components/sequencer/toolbarTiers.ts"]) {
      const source = readFileSync(join(SRC, rel), "utf8");
      for (const hit of smallTypeIn(source)) offenders.push(`src/${rel}:${hit}`);
    }
    expect(offenders, `toolbar type below 10px:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("contrast · the scanner itself", () => {
  it("measures a known pair, so the numbers above mean something", () => {
    // Black on white is 21:1; the accent's knockout text against the accent is ~11:1.
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
    expect(contrast(hexToRgb("#0a0b0d"), hexToRgb("#f5b73d"))).toBeGreaterThan(8);
    // …and the pair this whole round was about is genuinely below the floor.
    expect(contrast(hexToRgb("#4a4e58"), hexToRgb(PANEL))).toBeLessThan(AA_NORMAL);
  });

  it("would notice a colour that no longer meets the floor", () => {
    const hits = scanSource('<span className="text-[#3a3e48]">x</span>', "src/example.tsx");
    expect(hits).toHaveLength(1);
    expect(contrast(hexToRgb(hits[0].colour), hexToRgb(PANEL))).toBeLessThan(AA_NORMAL);

    // A declared dark-on-light pairing resolves to the declared background instead of the panel.
    const onLight = scanSource(
      '<span className="bg-[#f4f6fa] text-[#1a1d29]">x</span>',
      "src/example.tsx"
    );
    expect(onLight[0].backgrounds).toEqual(["#f4f6fa"]);
    expect(contrast(hexToRgb(onLight[0].colour), hexToRgb("#f4f6fa"))).toBeGreaterThan(AA_NORMAL);

    // An opacity suffix is composited, not taken raw: 20% of a bright colour over the panel stays dark.
    const tinted = scanSource(
      '<span className="bg-[#4ad8c8]/20 text-[#4ad8c8]">x</span>',
      "src/example.tsx"
    );
    expect(tinted[0].backgrounds[0]).not.toBe("#4ad8c8");
    expect(contrast(hexToRgb(tinted[0].colour), hexToRgb(tinted[0].backgrounds[0]))).toBeGreaterThan(
      AA_NORMAL
    );

    // A gradient is checked against its worst stop, not its first.
    const gradient = scanSource(
      '<span className="from-[#cad0dd] via-[#e2e6f0] to-[#f4f6fa] text-[#1a1d29]">x</span>',
      "src/example.tsx"
    );
    expect(gradient[0].backgrounds).toHaveLength(3);
    expect(Math.min(...gradient[0].backgrounds.map((bg) => contrast(hexToRgb(gradient[0].colour), hexToRgb(bg))))).toBeGreaterThan(AA_NORMAL);

    // A variant-gated ink answers to its own variant's surface, not to the resting one: this is the
    // `group-hover:bg-accent` knockout that a naive scan reads as dark-on-panel2.
    const hover = scanSource(
      '<span className="bg-panel2 group-hover:bg-accent group-hover:text-[#0a0b0d]">x</span>',
      "src/example.tsx"
    );
    expect(hover[0].backgrounds).toEqual([resolveToken("accent")]);
    expect(contrast(hexToRgb(hover[0].colour), hexToRgb(hover[0].backgrounds[0]))).toBeGreaterThan(
      AA_NORMAL
    );

    // The accent scale's bare name resolves to its DEFAULT step, which is what `bg-accent` paints.
    expect(resolveToken("accent")).toBe("#f5b73d");
    expect(PANEL).toBe("#121317");

    // A translucent white chip is a surface too: this is the timeline's icon button, whose resting
    // ink passed all along and was only ever reported because the 6% lift was invisible here.
    const chip = scanSource(
      '<span className="bg-white/[0.06] text-[#8e93a0] hover:bg-accent hover:text-black">x</span>',
      "src/example.tsx"
    );
    expect(chip[0].backgrounds).toEqual(["#202125"]);
    expect(contrast(hexToRgb(chip[0].colour), hexToRgb("#202125"))).toBeGreaterThan(AA_NORMAL);

    // The type floor's detector fires on the size that used to be in the toolbar, and only on it.
    expect(smallTypeIn('<i className="text-[9px]">x</i>')).toEqual(["1  text-[9px]"]);
    expect(smallTypeIn('<i className="text-[10px]">x</i>')).toEqual([]);
    expect(smallTypeIn('<i className="text-[7.5px]">x</i>')).toEqual(["1  text-[7.5px]"]);
  });
});
