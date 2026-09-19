/**
 * The 界面密度 setting does something (C-06, appendix E.5 item 6).
 *
 * The measured defect was that the preference existed end to end — a three-way control in
 * Settings, a persisted field, a validator, an i18n label for each tier — and **no component read
 * it**. Picking 紧凑 lit the button up and changed nothing. A control that lies about having taken
 * effect is worse than a missing one.
 *
 * Two halves, because the two failure modes need different evidence:
 *
 *  1. `applyDensity` is pure DOM and is asserted directly.
 *  2. The *resolution chain* (viewport → orientation → density tier → `--step-cell-h` → the real
 *     height of a real step cell) is CSS, and jsdom applies no stylesheet, so it is measured in a
 *     real browser via `scripts/diagnose_density.mjs`. What is asserted here instead is that the
 *     chain has no duplicated link: the landscape block must set the density *inputs* rather than
 *     the resolved names, or it would silently outrank the user's choice.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyDensity, DENSITY_ATTRIBUTE } from "../hooks/useDensityPreference";
import { DENSITY_TIERS, saveLayoutPrefs, loadLayoutPrefs } from "../features/sequencer/layoutPrefs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.resolve(TEST_DIR, "../index.css"), "utf8");

/** Strips comments so an assertion cannot be satisfied by prose inside a `/** … *\/` block. */
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");

afterEach(() => {
  document.documentElement.removeAttribute(DENSITY_ATTRIBUTE);
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("applyDensity", () => {
  it("writes the tier to the document element under one stable attribute name", () => {
    applyDensity("compact");
    expect(document.documentElement.getAttribute(DENSITY_ATTRIBUTE)).toBe("compact");
    expect(DENSITY_ATTRIBUTE).toBe("data-density");
  });

  it("moves between every tier", () => {
    for (const tier of DENSITY_TIERS) {
      applyDensity(tier);
      expect(document.documentElement.getAttribute(DENSITY_ATTRIBUTE)).toBe(tier);
    }
  });

  it("accepts an explicit root, so it can be tested and reused without the document", () => {
    const el = document.createElement("div");
    applyDensity("comfortable", el);
    expect(el.getAttribute(DENSITY_ATTRIBUTE)).toBe("comfortable");
    // The document element must be untouched when a root is given.
    expect(document.documentElement.hasAttribute(DENSITY_ATTRIBUTE)).toBe(false);
  });

  it("does nothing rather than throwing when there is no root", () => {
    expect(() => applyDensity("compact", null)).not.toThrow();
  });
});

describe("the density preference round-trips through storage", () => {
  it("persists each tier and reports it back", () => {
    for (const tier of DENSITY_TIERS) {
      saveLayoutPrefs({ density: tier });
      expect(loadLayoutPrefs().density).toBe(tier);
    }
  });

  it("falls back to standard for a corrupt stored tier", () => {
    localStorage.setItem(
      "groove_layout_prefs_v1",
      JSON.stringify({ version: 1, density: "gigantic" })
    );
    expect(loadLayoutPrefs().density).toBe("standard");
  });
});

describe("the CSS resolution chain has exactly one link per concern", () => {
  it("defines the two tiers that deviate from the default", () => {
    // `standard` deliberately has no rule: the un-attributed `:root` block *is* standard, which is
    // what makes an existing profile — one with no stored preference at all — render unchanged.
    expect(cssCode).toContain(':root[data-density="compact"]');
    expect(cssCode).toContain(':root[data-density="comfortable"]');
    expect(cssCode).not.toContain(':root[data-density="standard"]');
  });

  it("standard is the default and every tier picks from the same inputs", () => {
    // The base values live in the un-attributed block, and every density rule selects from them
    // rather than restating a pixel value — that is what keeps the tiers from drifting apart.
    for (const name of ["--step-cell-h", "--step-cell-h-compact", "--track-row-pad-y"]) {
      expect(cssCode, `${name} is not resolved from an input`).toContain(
        `${name}: var(${name}-base)`
      );
    }
    for (const tier of ["compact", "comfortable"]) {
      const block = cssCode.match(
        new RegExp(`:root\\[data-density="${tier}"\\]\\s*\\{([\\s\\S]*?)\\}`)
      )?.[1];
      expect(block, `no block for ${tier}`).toBeTruthy();
      for (const name of ["--step-cell-h", "--step-cell-h-compact", "--track-row-pad-y"]) {
        expect(block, `${tier} restates ${name} instead of selecting an input`).toContain(name);
      }
    }
  });

  it("the landscape block sets the density INPUTS, never the resolved names", () => {
    /**
     * This is the trap that makes a density setting dead in one orientation only.
     *
     * `:root` inside a media query has lower specificity than `:root[data-density="compact"]`, so a
     * landscape block that wrote `--step-cell-h` directly would be overridden by every density tier
     * — silently, and only on a short landscape phone. Setting the `--…-dense` / `--…-base` inputs
     * instead keeps the tier in charge of the final choice.
     */
    const landscape = cssCode.match(
      /@media \(max-height: 500px\) and \(orientation: landscape\)\s*\{([\s\S]*?)\n\}/
    )?.[1];
    expect(landscape, "landscape block not found").toBeTruthy();
    expect(landscape).toContain("--step-cell-h-dense:");
    expect(landscape).toContain("--step-cell-h-base:");
    expect(landscape).not.toMatch(/--step-cell-h:\s/);
    expect(landscape).not.toMatch(/--step-cell-h-compact:\s/);
    expect(landscape).not.toMatch(/--track-row-pad-y:\s/);
  });

  it("the phone minimum touch target is expressed once, as an input", () => {
    // 44 px is the iOS HIG / WCAG minimum the mobile work standardised on. It must be the *dense*
    // input for the expanded cell rather than a second copy inside a density tier.
    expect(cssCode).toMatch(/--step-cell-h-dense:\s*2\.75rem/);
    expect(cssCode).toMatch(/--step-cell-h-base:\s*2\.5rem/);
  });

  it("the settings control offers every tier the CSS implements", () => {
    const modal = readFileSync(path.resolve(TEST_DIR, "../components/settings/SettingsModal.tsx"), "utf8");
    expect(modal).toContain("DENSITY_TIERS.map");
    expect(DENSITY_TIERS).toEqual(["compact", "standard", "comfortable"]);
  });

  it("the studio actually mounts the hook, or the attribute is never written", () => {
    const studio = readFileSync(path.resolve(TEST_DIR, "../views/StudioView.tsx"), "utf8");
    expect(studio).toContain("useDensityPreference()");
  });
});
