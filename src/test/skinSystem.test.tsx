/**
 * The skin system.
 *
 * Two halves: the *plumbing* (catalogue, preference, the `data-skin` attribute) which is ordinary
 * behaviour and is tested like behaviour, and the *palette sources themselves*, which are hand
 * written and therefore need a gate of their own — a skin that forgets to define `--m-ink`, or that
 * reaches for `!important`, or that leaks an unscoped rule, is a bug that no rendering test on this
 * machine would catch.
 *
 * The palette sources are the only place in the repo with hand-written skin selectors, so the
 * checklist they are held to (scoped, token-complete, no `!important`, no external assets) is asserted
 * rather than trusted to review. The phone's own `SkinPicker` used to be exercised here; it is cut
 * with the phone shell, and the desktop's picker lives in `SettingsModal` (`settings-skin-<id>`).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { DICTIONARY } from "../i18n/locales";
import { SKINS, DEFAULT_SKIN } from "../data/skins";
import {
  SKIN_STORAGE_KEY,
  SKIN_CHANGED_EVENT,
  loadSkin,
  saveSkin,
  normaliseSkin,
} from "../features/settings/skinPrefs";
import { applyStoredSkin, useSkin, SKIN_ATTRIBUTE } from "../hooks/useSkin";

/** The skins that ship a palette source. `default` is the base look in the desktop tokens, so it has none. */
const STYLED_SKINS = ["minimal", "comic", "soviet", "sovietYears", "pixel"] as const;

/**
 * Where a styled skin's palette is written.
 *
 * These files are **sources, not stylesheets**: nothing imports them, and `scripts/desktop_skins.mjs`
 * reads them to derive the desktop's `--d-*` palette. They lived in `src/mobile/skins/` until the
 * phone shell was cut (`docs/OPEN_WORK.md` §十三) — the desktop is their only consumer now, so the
 * palette moved to `src/styles/skinPalettes/` rather than going with the shell.
 */
const SKIN_CSS_DIR = path.join(process.cwd(), "src", "styles", "skinPalettes");

/** Every skin must define these, or large parts of the shell keep the previous skin's colours. */
const REQUIRED_TOKENS = [
  "--m-bg",
  "--m-card",
  "--m-card-2",
  "--m-line",
  "--m-line-2",
  "--m-ink",
  "--m-ink-2",
  "--m-ink-3",
  "--m-on-gold",
  "--m-gold",
  "--m-gold-hi",
  "--m-gold-rgb",
];

describe("skin catalogue", () => {
  it("ships the skins the user asked for, default first", () => {
    expect(SKINS.map((skin) => skin.id)).toEqual([
      "default",
      "minimal",
      "comic",
      "soviet",
      "sovietYears",
      "pixel",
    ]);
    expect(DEFAULT_SKIN).toBe("default");
  });

  it("gives every skin its own preview, so the picker can tell them apart before applying one", () => {
    const previews = SKINS.map((skin) => `${skin.preview.ground}|${skin.preview.ink}|${skin.preview.accent}`);
    expect(new Set(previews).size).toBe(SKINS.length);
    // Ground and accent must differ from each other *within* a skin too, or the swatch is one flat block.
    for (const skin of SKINS) {
      expect(skin.preview.accent).not.toBe(skin.preview.ground);
    }
  });

  it("names and describes every skin in both languages", () => {
    // The keys are looked up through a variable, so the i18n literal scanner cannot see them: this is
    // the only thing that would catch a typo in `nameKey`.
    for (const skin of SKINS) {
      for (const key of [skin.nameKey, skin.blurbKey]) {
        const entry = (DICTIONARY as Record<string, { en?: string; zh?: string }>)[key];
        expect(entry, `missing dictionary entry ${key}`).toBeTruthy();
        expect(entry.en ?? "", `${key}.en`).not.toBe("");
        expect(entry.zh ?? "", `${key}.zh`).not.toBe("");
      }
    }
  });
});

describe("skin preference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to the default skin and repairs anything unrecognised", () => {
    expect(loadSkin()).toBe("default");
    expect(normaliseSkin("comic")).toBe("comic");
    expect(normaliseSkin("windows-95")).toBe("default");
    expect(normaliseSkin(null)).toBe("default");
    localStorage.setItem(SKIN_STORAGE_KEY, "soviet");
    expect(loadSkin()).toBe("soviet");
  });

  it("persists the choice and announces it, so every subscriber can re-read it", () => {
    const heard = vi.fn();
    window.addEventListener(SKIN_CHANGED_EVENT, heard);
    saveSkin("pixel");
    expect(localStorage.getItem(SKIN_STORAGE_KEY)).toBe("pixel");
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener(SKIN_CHANGED_EVENT, heard);
    // An unknown id is normalised before it is stored, never written through.
    saveSkin("nope" as never);
    expect(localStorage.getItem(SKIN_STORAGE_KEY)).toBe("default");
  });

  it("survives storage being unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("private mode");
    });
    expect(loadSkin()).toBe("default");
    spy.mockRestore();
  });

  it("applies the stored skin before the first render", () => {
    // `main.tsx` calls this before React mounts: without it the first frame is the default skin.
    localStorage.setItem(SKIN_STORAGE_KEY, "comic");
    const root = document.createElement("div");
    expect(applyStoredSkin(root)).toBe("comic");
    expect(root.getAttribute(SKIN_ATTRIBUTE)).toBe("comic");
  });
});

describe("skin preference · the hook", () => {
  /** The earlier cases leave a skin in storage and on `<html>`; this one asserts the default. */
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute(SKIN_ATTRIBUTE);
  });

  it("exposes the control through the hook without a second source of truth", () => {
    const seen: string[] = [];
    const Probe = () => {
      const { skin } = useSkin();
      seen.push(skin);
      return null;
    };
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>
    );
    expect(seen.at(-1)).toBe("default");
  });
});

describe("skin stylesheets", () => {
  const read = (id: string) => fs.readFileSync(path.join(SKIN_CSS_DIR, `${id}.css`), "utf8");
  /** Comments are stripped before every check: these files explain themselves in prose. */
  const code = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

  /**
   * Split a selector list on its commas.
   *
   * Not `split(",")`: these skins target Tailwind's arbitrary-value classes, and a selector like
   * `[class~="bg-[linear-gradient(180deg,var(--m-card-2),var(--m-card))]"]` contains commas *inside* an
   * attribute value. Splitting naively reports fragments of a correctly scoped selector as unscoped
   * rules, which is a false alarm about the one thing this gate exists to catch.
   */
  const splitSelectors = (prelude: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let buffer = "";
    for (const char of prelude) {
      if (quote) {
        buffer += char;
        if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        buffer += char;
        continue;
      }
      if (char === "[" || char === "(") depth += 1;
      if (char === "]" || char === ")") depth = Math.max(0, depth - 1);
      if (char === "," && depth === 0) {
        out.push(buffer.trim());
        buffer = "";
        continue;
      }
      buffer += char;
    }
    if (buffer.trim()) out.push(buffer.trim());
    return out.filter(Boolean);
  };

  it("ships one palette source per styled skin, and the generator derives the desktop from it", () => {
    /**
     * Both directions, because the failure this guards is a *silent* one: a palette source nobody
     * reads is dead data, and a desktop skin whose source drifted is two different colours with the
     * same name. The generated sheet names the file each skin came from, so the link is asserted
     * rather than assumed.
     */
    const generated = fs.readFileSync(
      path.join(process.cwd(), "src", "styles", "desktopSkins.css"),
      "utf8"
    );
    for (const id of STYLED_SKINS) {
      expect(fs.existsSync(path.join(SKIN_CSS_DIR, `${id}.css`)), `${id}.css`).toBe(true);
      expect(generated, `${id} was not derived from its palette source`).toContain(
        `derived from \`src/styles/skinPalettes/${id}.css\``
      );
    }
  });

  it("scopes every rule to its own data-skin, so no skin can leak into another", () => {
    for (const id of STYLED_SKINS) {
      const css = read(id);
      // Attribute selector on the root: the only scope the app ever applies.
      expect(css, `${id} is not scoped`).toContain(`:root[data-skin="${id}"]`);
      /**
       * Every selector in the file must carry the scope, including ones nested inside an at-rule.
       *
       * The preludes are collected with a tiny depth-agnostic scanner: everything before a `{` is a
       * selector list, everything after it is a declaration block whose contents are dropped at the
       * closing brace. Comments are stripped first, because these files explain their own selectors in
       * prose ("the plate is `.m-player`, not `.m-stage`, because…") and that prose is not a rule.
       */
      const withoutComments = code(css);
      const preludes: string[] = [];
      let buffer = "";
      for (const char of withoutComments) {
        if (char === "{") {
          preludes.push(buffer.trim());
          buffer = "";
        } else if (char === "}") {
          buffer = "";
        } else {
          buffer += char;
        }
      }
      expect(preludes.length, `${id} has no rules`).toBeGreaterThan(0);
      for (const prelude of preludes) {
        if (!prelude || prelude.startsWith("@")) continue;
        for (const selector of splitSelectors(prelude)) {
          expect(selector, `${id}: unscoped selector "${selector}"`).toContain(`:root[data-skin="${id}"]`);
        }
      }
    }
  });

  it("defines the whole token set a skin needs", () => {
    for (const id of STYLED_SKINS) {
      const css = read(id);
      const missing = REQUIRED_TOKENS.filter((token) => !new RegExp(`${token}\\s*:`).test(css));
      expect(missing, `${id} does not define ${missing.join(", ")}`).toEqual([]);
      /**
       * The four per-module accents (`[data-module="jam"]`, `challenge`, `explore`, `more`) are gone
       * with the phone shell: nothing renders `data-module` any more, so a skin no longer has a base
       * accent plus four module ones to keep distinct. What survives is the base accent and its rgb
       * triple — and the triple still has to be a triple.
       */
      const rgb = css.match(/--m-gold-rgb:\s*([^;]+);/)?.[1]?.trim() ?? "";
      expect(rgb.split(/\s+/).length, `${id}: --m-gold-rgb must be "R G B"`).toBe(3);
      for (const channel of rgb.split(/\s+/)) {
        expect(Number.isFinite(Number(channel)), `${id}: --m-gold-rgb channel "${channel}"`).toBe(true);
      }
    }
  });

  it("plays by the shell's rules: no !important, no external assets, no font faces", () => {
    for (const id of STYLED_SKINS) {
      // Every one of these files *states* that it avoids these constructs, so the check has to read the
      // rules and not the prose around them.
      const withoutComments = code(read(id));
      expect(withoutComments, `${id}: !important`).not.toContain("!important");
      /**
       * No *external* assets. An inline `url("data:image/svg+xml;…")` is self-contained (the Soviet skin
       * draws its star, ribbon and gear that way), so the rule is about the network, not about `url(`.
       */
      const externalUrls = [...withoutComments.matchAll(/url\(\s*["']?([^"')]+)/g)]
        .map((match) => match[1].trim())
        .filter((target) => !target.startsWith("data:") && !target.startsWith("#"));
      expect(externalUrls, `${id} loads an external asset`).toEqual([]);
      expect(withoutComments, `${id}: @font-face`).not.toContain("@font-face");
      expect(withoutComments, `${id}: @import`).not.toContain("@import");
      /**
       * Geometry is off limits: it would break the 44px touch-target gate and the measured layouts.
       *
       * Matched with a boundary, not a substring: `border-width` and `min-width: 0` are paint and
       * flex-shrink guards and are exactly what a skin *should* touch, while a bare `width` or
       * `padding` is the thing that moves controls around.
       */
      const GEOMETRY = /(?:^|[\s;{])(width|height|padding|margin|gap|display|order|visibility)(-[a-z-]+)?\s*:/;
      const geometry = withoutComments.match(GEOMETRY);
      expect(geometry?.[0] ?? "", `${id} changes geometry`).toBe("");

      /**
       * …but a skin *may* position a decorative layer, and then it has to be click-through.
       *
       * The Soviet skin's star, ribbon and plate ornaments are absolutely positioned inside a panel;
       * that is a legitimate way to draw a symbol, and the thing that makes it safe is not the absence of
       * `position` but the presence of `pointer-events: none` — a decorative overlay that could swallow a
       * tap is the actual defect. So the rule is the pair, checked per declaration block.
       */
      const blocks = [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
      expect(blocks.length, `${id} has no readable rules`).toBeGreaterThan(0);
      for (const [, selector, body] of blocks) {
        if (!/position\s*:\s*(absolute|fixed)/.test(body)) continue;
        expect(body, `${id}: ${selector.trim()} is positioned but not click-through`).toMatch(
          /pointer-events\s*:\s*none/
        );
      }
    }
  });

  it("uses the display faces the app loads, and falls back for CJK", () => {
    const expected: Record<string, string> = {
      comic: '"Bangers"',
      soviet: '"Russo One"',
      pixel: '"Press Start 2P"',
    };
    const html = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
    for (const [id, family] of Object.entries(expected)) {
      expect(read(id), `${id} does not use ${family}`).toContain(family);
      // The font has to be requested, or the skin silently falls back on a real device.
      expect(html, `${family} is not in the font link`).toContain(family.replace(/"/g, "").replace(/ /g, "+"));
    }
  });
});
