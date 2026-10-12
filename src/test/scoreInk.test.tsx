/**
 * **The score's ink is the skin's ink — and it changes when the skin does.**
 *
 * ## The bug this closes
 *
 * `ScoreV2` draws with VexFlow, whose `SVGContext` opens with `fill: 'black', stroke: 'black'`
 * (`node_modules/vexflow/build/esm/src/svgcontext.js`) and was never told otherwise. So the stave lines, the
 * clefs, the noteheads and the beams were **black on every skin** — and nothing in this repository could see
 * it, because the skin system is CSS and VexFlow writes **SVG presentation attributes**. Measured in Chromium
 * on the running app (`scripts/measure_score_ink.mjs`), on the ink the browser actually painted:
 *
 * | skin | ink | ground | contrast |
 * | --- | --- | --- | --- |
 * | `default` | `rgb(0, 0, 0)` | `rgb(10, 11, 13)` | **1.07:1** |
 * | `minimal` | `rgb(0, 0, 0)` | `rgb(250, 250, 250)` | 20.12:1 |
 * | `comic` | `rgb(0, 0, 0)` | `rgb(244, 233, 210)` | 17.43:1 |
 * | `soviet` | `rgb(0, 0, 0)` | `rgb(27, 30, 33)` | **1.25:1** |
 * | `sovietYears` | `rgb(0, 0, 0)` | `rgb(244, 241, 225)` | 18.52:1 |
 * | `pixel` | `rgb(0, 0, 0)` | `rgb(16, 18, 28)` | **1.13:1** |
 *
 * Three of the six skins were unreadable, and the three that "worked" only did so because they happen to be
 * light. That accident is the point: a hardcoded colour is a skin waiting to break, which is the failure mode
 * `scripts/check_skin_roles.mjs` exists for.
 *
 * ## What the criteria are, and why the numbers
 *
 * 1. **The roles are ones the skins define.** The `check:skin-roles` rule — a `--d-*` name no skin defines is
 *    a hardcoded colour wearing a token's clothes — applied to the two roles the score names, plus the two
 *    "nothing to check" conditions that keep this file honest.
 * 2. **Every skin clears the WCAG floor.** SC 1.4.3 Contrast (Minimum) says the visual presentation of text
 *    "has a contrast ratio of at least 4.5:1" (<https://www.w3.org/TR/WCAG21/#contrast-minimum>); SC 1.4.11
 *    Non-text Contrast says "Parts of graphics required to understand the content" need "at least 3:1"
 *    (<https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html>). A stave is both — it is drawn in
 *    a single ink, so the criterion holds it to the stricter text floor, 4.5:1.
 * 3. **The ink follows the skin.** This is the assertion that turns red when the drawing stops depending on
 *    the skin at all: the stave is rendered, the skin is switched through the real preference path
 *    (`saveSkin`, the same call the Settings picker makes), and the ink the renderer ended up with is read
 *    again. It has to be the *second* skin's ink, and it has to differ from the first's.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import React from "react";
import { SCORE_INK_FALLBACK, SCORE_INK_TOKEN, SCORE_PLATE_TOKEN, ScoreV2 } from "../components/arrangement/ScoreV2";
import { LanguageProvider } from "../i18n/LanguageContext";
import { saveSkin } from "../features/settings/skinPrefs";

const SRC = resolve(__dirname, "..");
const ROOT = resolve(SRC, "..");
const SCORE_SOURCE = readFileSync(join(SRC, "components", "arrangement", "ScoreV2.tsx"), "utf8");
const SKIN_CSS =
  readFileSync(join(SRC, "styles", "desktopTokens.css"), "utf8") +
  "\n" +
  readFileSync(join(SRC, "styles", "desktopSkins.css"), "utf8");

/** Every skin the app ships, in the order `src/data/skins.ts` lists them. */
const SKINS = ["default", "minimal", "comic", "soviet", "sovietYears", "pixel"] as const;

/* ---------------------------------------------------------------------------------------------
 * Resolving the roles out of the stylesheets — the same two helpers `rankColours.test.ts` uses
 * ------------------------------------------------------------------------------------------- */

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]: [number, number, number]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

function toRgb(value: string): [number, number, number] | null {
  const text = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const full = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(text);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  // The generator writes palette triples as bare, space-separated channels.
  const triple = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(text);
  return triple ? [Number(triple[1]), Number(triple[2]), Number(triple[3])] : null;
}

/** `--d-x` as `<skin>`'s palette defines it, or `null` when that skin does not. */
function skinToken(skin: string, token: string): [number, number, number] | null {
  const block =
    skin === "default"
      ? /:root\s*\{([^}]*)\}/.exec(SKIN_CSS)
      : new RegExp(`:root\\[data-skin="${skin}"\\]\\s*\\{([^}]*)\\}`).exec(SKIN_CSS);
  if (!block) return null;
  const value = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(block[1]);
  return value ? toRgb(value[1]) : null;
}

/** The exact string `ScoreV2` hands the renderer for a skin: `canvasRgba(resolveCanvasColor(…), 1)`. */
function expectedInk(skin: string): string {
  const rgb = skinToken(skin, SCORE_INK_TOKEN);
  if (!rgb) throw new Error(`${skin} does not define ${SCORE_INK_TOKEN}`);
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 1)`;
}

/* ---------------------------------------------------------------------------------------------
 * The renderer, rigged so the criterion can read back the ink the drawing ended up in
 * --------------------------------------------------------------------------------------------- */

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * VexFlow's `SVGContext` writes `fill: 'black', stroke: 'black'` onto the `<svg>` it creates, and every
 * group and shape below inherits them (a group only re-declares an attribute that *differs* from its
 * parent's — `SVGContext.applyAttributes`). So the mock creates the same element **already black**, and a
 * component that does not override it fails these criteria rather than passing on a tidy blank canvas.
 */
vi.mock("vexflow/core", () => {
  class Renderer {
    static Backends = { SVG: 1 };
    constructor(element: HTMLElement) {
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("fill", "black");
      svg.setAttribute("stroke", "black");
      element.appendChild(svg);
    }
    resize() {}
    getContext() {
      return {};
    }
  }
  class Stave {
    addClef() {
      return this;
    }
    addTimeSignature() {
      return this;
    }
    setEndBarType() {
      return this;
    }
    setContext() {
      return this;
    }
    draw() {
      return this;
    }
  }
  class StaveNote {
    constructor() {}
    getDuration() {
      return "q";
    }
    isRest() {
      return false;
    }
  }
  class Voice {
    addTickables() {
      return this;
    }
    setStrict() {
      return this;
    }
    draw() {
      return this;
    }
  }
  class Formatter {
    joinVoices() {
      return this;
    }
    format() {
      return this;
    }
  }
  return {
    Renderer,
    Stave,
    StaveNote,
    Voice,
    Formatter,
    Beam: { generateBeams: () => [] },
    Dot: { buildAndAttach: () => [] },
    Barline: { type: { END: 1 } },
    Font: { HOST_URL: "", load: () => Promise.resolve() },
  };
});

/** The ink the drawing ended up in: what the renderer's own `<svg>` carries, which every shape inherits. */
const paintedInk = (): { fill: string | null; stroke: string | null } => {
  const svg = document.querySelector("[data-testid='score-canvas'] svg");
  return { fill: svg?.getAttribute("fill") ?? null, stroke: svg?.getAttribute("stroke") ?? null };
};

const note = { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 };

const renderScore = () =>
  render(
    <LanguageProvider>
      <ScoreV2 notes={[note]} bars={1} width={400} />
    </LanguageProvider>
  );

beforeAll(() => {
  // The app's own sheets, so `getComputedStyle` answers with the skin the attribute names — which is what a
  // painter that reads a role at draw time is depending on.
  const style = document.createElement("style");
  style.textContent = SKIN_CSS;
  document.head.appendChild(style);
});

beforeEach(() => {
  cleanupSkin();
});

/** Back to the default skin between cases, the way a fresh page starts. */
function cleanupSkin() {
  try {
    window.localStorage.setItem("groove_skin_v1", "default");
  } catch {
    /* storage may be unavailable; the default skin needs no stored value anyway */
  }
  document.documentElement.setAttribute("data-skin", "default");
}

describe("the score's ink comes from the skin", () => {
  it("names roles every skin defines, and a plate the stylesheet wraps in rgb()", () => {
    // The `check:skin-roles` rule: a `--d-*` token no skin defines is a hardcoded colour with a token's name.
    for (const skin of SKINS) {
      expect(skinToken(skin, SCORE_INK_TOKEN), `${skin} defines ${SCORE_INK_TOKEN}`).not.toBeNull();
      expect(skinToken(skin, SCORE_PLATE_TOKEN), `${skin} defines ${SCORE_PLATE_TOKEN}`).not.toBeNull();
    }
    /**
     * And the plate reaches the DOM as a colour. A palette triple is not one — `arrangementColours.test.ts`
     * is that guard for this directory — so the class has to carry the `rgb()` wrapper, and it has to be
     * written out literally because Tailwind generates a utility by reading the source text.
     */
    expect(SCORE_SOURCE).toContain(`bg-[rgb(var(${SCORE_PLATE_TOKEN}))]`);
    // Nothing to check would pass forever: the file really is the one being scanned.
    expect(SCORE_SOURCE).toContain("export function ScoreV2");
  });

  it("clears the WCAG floor on every skin, and its fallback is a colour the default skin uses", () => {
    /**
     * The assertion that would have caught the original bug the way `rankColours.test.ts` caught the silver
     * tier: measured, per skin, on the pair the component actually names. WCAG 2.1 SC 1.4.3 asks text for
     * 4.5:1 and SC 1.4.11 asks graphics for 3:1; a stave is drawn in one ink, so the stricter floor is used.
     */
    const failures: string[] = [];
    for (const skin of SKINS) {
      const ink = skinToken(skin, SCORE_INK_TOKEN);
      const plate = skinToken(skin, SCORE_PLATE_TOKEN);
      if (!ink || !plate) {
        failures.push(`${skin}: ${!ink ? SCORE_INK_TOKEN : SCORE_PLATE_TOKEN} missing`);
        continue;
      }
      const ratio = contrast(ink, plate);
      if (ratio < 4.5) failures.push(`${skin}: ${SCORE_INK_TOKEN} on ${SCORE_PLATE_TOKEN} = ${ratio.toFixed(2)}:1`);
    }
    expect(failures, "the stave's ink does not clear 4.5:1 (WCAG 1.4.3) on: " + failures.join(", ")).toEqual([]);

    /**
     * The last resort is the default skin's own ink, not a colour of its own choosing. Without this, replacing
     * `SCORE_INK_FALLBACK` with `#000` restores the defect for any skin that omits the role — and re-hardcodes
     * black in the one place a reader would not look for it.
     */
    expect(toRgb(SCORE_INK_FALLBACK), "the fallback parses as a colour").toEqual(skinToken("default", SCORE_INK_TOKEN));
  });

  it(
    "hands the renderer the skin's ink, and the next skin's after a switch",
    async () => {
      renderScore();
      /**
       * Both attributes, because the stave is drawn with strokes (`fill="none"` paths) and the noteheads with
       * fills, and the drawing is asynchronous twice over — the VexFlow import and the font. The generous
       * timeout is for a loaded machine running jsdom, not for the app: in Chromium the whole redraw is one
       * frame, and `scripts/measure_score_ink.mjs` measures that.
       */
      await waitFor(() => expect(paintedInk().fill).toBe(expectedInk("default")), { timeout: 15000 });
      expect(paintedInk().stroke).toBe(expectedInk("default"));

      // The real preference path: the call the Settings picker makes, which publishes the change event
      // `useSkin` listens for and applies `data-skin` — and, with it, this component's redraw.
      await act(async () => {
        saveSkin("minimal");
      });

      await waitFor(() => expect(paintedInk().fill).toBe(expectedInk("minimal")), { timeout: 15000 });
      expect(paintedInk().stroke).toBe(expectedInk("minimal"));
      // The whole claim, spelled out: the drawing is not merely *a* colour, it is the next skin's.
      expect(paintedInk().fill).not.toBe(expectedInk("default"));
      expect(document.documentElement.getAttribute("data-skin")).toBe("minimal");
    },
    30000
  );
});
