/**
 * The skin system.
 *
 * Two halves: the *plumbing* (catalogue, preference, the `data-skin` attribute, the picker) which is
 * ordinary behaviour and is tested like behaviour, and the *stylesheets themselves*, which are hand
 * written and therefore need a gate of their own — a skin that forgets to define `--m-ink`, or that
 * reaches for `!important`, or that leaks unscoped rules into the default look, is a bug that no
 * rendering test on this machine would catch.
 *
 * The skin CSS files are the only place in the repo with hand-written selectors over the shell, so the
 * checklist they are held to (scoped, token-complete, no `!important`, no external assets) is asserted
 * rather than trusted to review.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, screen, fireEvent, act } from "@testing-library/react";
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
import { SkinPicker } from "../mobile/SkinPicker";

/** The skins that ship a stylesheet. `default` is the base look in `mobile.css`, so it has none. */
const STYLED_SKINS = ["comic", "soviet", "pixel"] as const;
const SKIN_CSS_DIR = path.join(process.cwd(), "src", "mobile", "skins");

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
  it("ships the four skins the user asked for, default first", () => {
    expect(SKINS.map((skin) => skin.id)).toEqual(["default", "comic", "soviet", "pixel"]);
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

describe("skin picker", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute(SKIN_ATTRIBUTE);
  });

  const renderPicker = () =>
    render(
      <LanguageProvider>
        <SkinPicker />
      </LanguageProvider>
    );

  it("offers every skin as one radio group, with the active one checked", () => {
    localStorage.setItem(SKIN_STORAGE_KEY, "soviet");
    renderPicker();

    expect(screen.getByTestId("mobile-skin-list").getAttribute("role")).toBe("radiogroup");
    const options = SKINS.map((skin) => screen.getByTestId(`mobile-skin-${skin.id}`));
    expect(options).toHaveLength(SKINS.length);
    for (const option of options) expect(option.getAttribute("role")).toBe("radio");
    expect(screen.getByTestId("mobile-skin-soviet").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("mobile-skin-comic").getAttribute("aria-checked")).toBe("false");
  });

  it("switches the skin on tap: the attribute, the storage and the checked state all follow", () => {
    renderPicker();
    expect(document.documentElement.getAttribute(SKIN_ATTRIBUTE)).toBe("default");

    fireEvent.click(screen.getByTestId("mobile-skin-pixel"));

    expect(document.documentElement.getAttribute(SKIN_ATTRIBUTE)).toBe("pixel");
    expect(localStorage.getItem(SKIN_STORAGE_KEY)).toBe("pixel");
    expect(screen.getByTestId("mobile-skin-pixel").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("mobile-skin-default").getAttribute("aria-checked")).toBe("false");
  });

  it("follows a change made elsewhere, because the preference is an event and not local state", () => {
    renderPicker();
    act(() => {
      saveSkin("comic");
    });
    expect(screen.getByTestId("mobile-skin-comic").getAttribute("aria-checked")).toBe("true");
    expect(document.documentElement.getAttribute(SKIN_ATTRIBUTE)).toBe("comic");
  });

  it("keeps every option a real touch target", () => {
    renderPicker();
    for (const skin of SKINS) {
      const option = screen.getByTestId(`mobile-skin-${skin.id}`);
      // jsdom does no layout, so the class is what can be checked: 72px is the shell's row height.
      expect(option.className).toContain("min-h-[72px]");
    }
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

  it("ships one stylesheet per styled skin, all imported by the phone shell", () => {
    const shell = fs.readFileSync(path.join(process.cwd(), "src", "mobile", "MobileApp.tsx"), "utf8");
    for (const id of STYLED_SKINS) {
      expect(fs.existsSync(path.join(SKIN_CSS_DIR, `${id}.css`)), `${id}.css`).toBe(true);
      expect(shell).toContain(`skins/${id}.css`);
    }
  });

  it("scopes every rule to its own data-skin, so no skin can leak into another", () => {
    for (const id of STYLED_SKINS) {
      const css = read(id);
      // Attribute selector on the root, plus the shell: the only scope the app ever applies.
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

  it("defines the whole shell token set and five distinct module accents", () => {
    for (const id of STYLED_SKINS) {
      const css = read(id);
      const missing = REQUIRED_TOKENS.filter((token) => !new RegExp(`${token}\\s*:`).test(css));
      expect(missing, `${id} does not define ${missing.join(", ")}`).toEqual([]);
      /**
       * 首页 is the base accent (the first `--m-gold` in the file); only the four themed modules need a
       * block of their own. Asserting the *values* are five distinct ones is the check that matters —
       * a skin where two modules share an accent has stopped saying where you are.
       */
      for (const module of ["jam", "challenge", "explore", "more"]) {
        expect(css, `${id} has no ${module} accent`).toContain(`[data-module="${module}"]`);
      }
      const accents = [...code(css).matchAll(/--m-gold:\s*([^;]+);/g)].map((match) => match[1].trim().toLowerCase());
      expect(accents.length, `${id} sets --m-gold too rarely`).toBeGreaterThanOrEqual(5);
      expect(new Set(accents).size, `${id} reuses a module accent: ${accents.join(", ")}`).toBeGreaterThanOrEqual(5);
      // A skin that sets the accent but not its rgb triple leaves every glow rule on the old colour.
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

  /**
   * The reused desktop views (探索's 和弦走向 / 底鼓设计 / 律动解构) are the one place with a *second*
   * hand-written override sheet. It is held to the same gate as the skins — because it is the same
   * kind of file, aimed at the one subtree the skins deliberately withdraw from — plus three checks
   * of its own: it must import after the skins, it must name the desktop-legacy wrapper in every
   * selector, and it must put a surface under each of the three sub-pages.
   */
  it("ships the legacy-view override sheet, imported after the three skins", () => {
    const file = path.join(SKIN_CSS_DIR, "legacySkin.css");
    expect(fs.existsSync(file), "legacySkin.css").toBe(true);
    const shell = fs.readFileSync(path.join(process.cwd(), "src", "mobile", "MobileApp.tsx"), "utf8");
    const pixel = shell.indexOf("skins/pixel.css");
    const legacy = shell.indexOf("skins/legacySkin.css");
    expect(legacy, "legacySkin.css is not imported by the phone shell").toBeGreaterThan(-1);
    // A later import wins an equal-specificity argument, which is what undoes comic.css's opt-out.
    expect(legacy, "legacySkin.css must import after the skin sheets").toBeGreaterThan(pixel);
  });

  it("scopes every legacy-view rule to a skin and the desktop-legacy wrapper", () => {
    const withoutComments = code(read("legacySkin"));
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
    expect(preludes.length, "legacySkin.css has no rules").toBeGreaterThan(0);
    for (const prelude of preludes) {
      if (!prelude || prelude.startsWith("@")) continue;
      for (const selector of splitSelectors(prelude)) {
        expect(selector, `unscoped legacy selector "${selector}"`).toContain(":root[data-skin=");
        expect(selector, `legacy selector escapes the phone shell: "${selector}"`).toContain(".mobile-root");
        expect(selector, `legacy selector is not inside [data-legacy]: "${selector}"`).toContain(
          '[data-legacy="desktop"]'
        );
      }
    }
  });

  it("gives every styled skin and every 探索 sub-page a surface of its own", () => {
    const withoutComments = code(read("legacySkin"));
    const blocks = [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    for (const id of STYLED_SKINS) {
      const scoped = blocks.filter(([, selector]) => selector.includes(`:root[data-skin="${id}"]`));
      expect(scoped.length, `legacySkin.css has no override for ${id}`).toBeGreaterThan(0);
      expect(
        scoped.some(([, , body]) => /background-color\s*:/.test(body)),
        `${id} restyles no surface`
      ).toBe(true);
    }
    for (const view of ["chords", "kick", "groove"]) {
      const testId = `mobile-explore-${view}-legacy`;
      const owner = blocks.find(
        ([, selector, body]) =>
          selector.includes(`[data-testid="${testId}"]`) && /background-color\s*:/.test(body)
      );
      expect(owner, `${testId} keeps the desktop ground`).toBeTruthy();
    }
  });

  it("maps the desktop palette onto skin tokens rather than new hexes", () => {
    const css = read("legacySkin");
    // The two desktop accent literals the views are built around must be addressed...
    expect(css).toContain("#4ad8c8");
    expect(css).toContain("#f5b73d");
    // ...and resolved through the active skin's own tokens, so one rule serves all three.
    for (const token of ["--m-bg", "--m-card", "--m-line", "--m-ink", "--m-gold", "--m-teal"]) {
      expect(css, `legacySkin.css does not use ${token}`).toContain(`var(${token})`);
    }
  });

  it("keeps the legacy-view sheet inside the shell's rules", () => {
    const withoutComments = code(read("legacySkin"));
    expect(withoutComments, "legacySkin.css: !important").not.toContain("!important");
    expect(withoutComments, "legacySkin.css: url()").not.toMatch(/url\(/);
    expect(withoutComments, "legacySkin.css: @font-face").not.toContain("@font-face");
    expect(withoutComments, "legacySkin.css: @import").not.toContain("@import");
    const GEOMETRY = /(?:^|[\s;{])(width|height|padding|margin|gap|display|order|visibility)(-[a-z-]+)?\s*:/;
    const geometry = withoutComments.match(GEOMETRY);
    expect(geometry?.[0] ?? "", "legacySkin.css changes geometry").toBe("");
    const blocks = [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    for (const [, selector, body] of blocks) {
      if (!/position\s*:\s*(absolute|fixed)/.test(body)) continue;
      expect(body, `legacySkin.css: ${selector.trim()} is positioned but not click-through`).toMatch(
        /pointer-events\s*:\s*none/
      );
    }
  });

  /**
   * The four panels behind 更多 are the *second* subtree with an override sheet of its own, and it
   * is the one place the palette cannot be inherited: the panels are siblings of `.mobile-root`, and
   * custom properties only travel down a tree. So this sheet is held to the skins' checklist plus
   * two checks of its own — it has to restate the token block it maps onto, and it has to name the
   * desktop literals it replaces (`#0d0f16` and friends) rather than leaving them dark.
   */
  const PANEL_SHEET = path.join(SKIN_CSS_DIR, "panelSkin.css");
  const readPanels = () => fs.readFileSync(PANEL_SHEET, "utf8");

  /** The same depth-agnostic prelude scan the skin cases run: comments already stripped. */
  const panelPreludes = (withoutComments: string): string[] => {
    const out: string[] = [];
    let buffer = "";
    for (const char of withoutComments) {
      if (char === "{") {
        out.push(buffer.trim());
        buffer = "";
      } else if (char === "}") {
        buffer = "";
      } else {
        buffer += char;
      }
    }
    return out;
  };

  it("ships the panel sheet, imported by App where the m-panels scope wrapper is", () => {
    expect(fs.existsSync(PANEL_SHEET), "panelSkin.css").toBe(true);
    const app = fs.readFileSync(path.join(process.cwd(), "src", "App.tsx"), "utf8");
    // The import lives with the other `./mobile/…` imports; the wrapper lives in App's phone branch.
    expect(app, "panelSkin.css is not imported by App").toContain('import "./mobile/skins/panelSkin.css";');
    expect(app, "the panel scope wrapper is gone").toContain('className="m-panels"');
  });

  it("scopes every panel rule to a styled skin and the phone's panel wrapper", () => {
    const withoutComments = code(readPanels());
    const found = panelPreludes(withoutComments);
    expect(found.length, "panelSkin.css has no rules").toBeGreaterThan(0);
    for (const prelude of found) {
      if (!prelude || prelude.startsWith("@")) continue;
      for (const selector of splitSelectors(prelude)) {
        expect(selector, `unscoped panel selector "${selector}"`).toMatch(
          /:root\[data-skin="(comic|soviet|pixel)"\]/
        );
        // `.m-panels` is rendered only in App's phone branch, so the sheet can never touch a dialog
        // the desktop opened — and the default skin matches none of these selectors.
        expect(selector, `panel selector escapes the phone's scope: "${selector}"`).toContain(".m-panels");
        expect(selector, `panel selector reaches a fourth skin: "${selector}"`).not.toMatch(
          /data-skin="(default|windows-95)"/
        );
      }
    }
  });

  it("restates the palette and styles all three skins, so a panel never falls back to desktop dark", () => {
    const withoutComments = code(readPanels());
    const blocks = [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    for (const id of STYLED_SKINS) {
      /**
       * The tokens live on `.mobile-root`, a *sibling* of `.m-panels`, so the sheet has to publish
       * the active skin's block on the scope element itself before any `var()` can resolve.
       */
      const own = blocks.find(([, selector]) => selector.trim() === `:root[data-skin="${id}"] .m-panels`);
      expect(own, `${id} has no token block on .m-panels`).toBeTruthy();
      for (const token of [...REQUIRED_TOKENS, "--m-font-display", "--m-font-mono"]) {
        expect(own?.[2] ?? "", `${id} does not restate ${token}`).toContain(`${token}:`);
      }
      const scoped = blocks.filter(([, selector]) => selector.includes(`:root[data-skin="${id}"]`));
      expect(scoped.length, `panelSkin.css has no override for ${id}`).toBeGreaterThan(0);
      expect(
        scoped.some(([, , body]) => /background-color\s*:/.test(body)),
        `${id} restyles no panel surface`
      ).toBe(true);
      expect(scoped.some(([, , body]) => /[^-]color\s*:/.test(body)), `${id} re-inks no text`).toBe(true);
      // A native control that keeps the desktop's dark scheme is the bug `color-scheme` prevents.
      expect(own?.[2] ?? "", `${id} leaves color-scheme to the desktop`).toContain("color-scheme:");
    }
  });

  it("maps the panels' desktop literals onto skin tokens instead of leaving them", () => {
    const css = readPanels();
    // The changelog's well, the help centre's frame, rail and article pane, the settings/search wells.
    for (const literal of [
      "#0d0f16",
      "#0a0b10",
      "#090a0f",
      "#0d0f17",
      "#0b0c13",
      "#0e0f14",
      "#0b0e19",
      "#f5b73d",
      "#45e0c9",
      "#a78bfa",
      "#f59e0b",
      "#8e92a0",
      "#b9b7b0",
      "#0a0b0d",
      "#1f222b",
      "#2d313d",
    ]) {
      expect(css, `panelSkin.css never addresses ${literal}`).toContain(literal);
    }
    // ...and resolves them through the active skin's tokens, so one rule serves all three skins.
    for (const token of [
      "--m-bg",
      "--m-card",
      "--m-card-2",
      "--m-line",
      "--m-line-2",
      "--m-ink",
      "--m-ink-2",
      "--m-ink-3",
      "--m-gold",
      "--m-gold-hi",
      "--m-on-gold",
      "--m-teal",
      "--m-red",
      "--m-green",
      "--m-violet",
      "--m-font-display",
      "--m-font-mono",
    ]) {
      expect(css, `panelSkin.css does not use var(${token})`).toContain(`var(${token})`);
    }
    // The deeper grounds are enumerated; the panel/raised levels are grouped, as legacySkin does.
    expect(css).toContain('[class*="bg-[#1"]');
    expect(css).toContain('[class*="bg-[#2"]');
    // Nothing is painted in the desktop's own surface or accent hex after the mapping.
    const withoutComments = code(css);
    expect(withoutComments).not.toMatch(/background-color:\s*#(0d0f16|0a0b10|12141a|f5b73d)\b/i);
  });

  it("keeps the panel sheet inside the shell's rules and keeps scrolling untouched", () => {
    const withoutComments = code(readPanels());
    expect(withoutComments, "panelSkin.css: !important").not.toContain("!important");
    const externalUrls = [...withoutComments.matchAll(/url\(\s*["']?([^"')]+)/g)]
      .map((match) => match[1].trim())
      .filter((target) => !target.startsWith("data:") && !target.startsWith("#"));
    expect(externalUrls, "panelSkin.css loads an external asset").toEqual([]);
    expect(withoutComments, "panelSkin.css: @font-face").not.toContain("@font-face");
    expect(withoutComments, "panelSkin.css: @import").not.toContain("@import");
    const GEOMETRY = /(?:^|[\s;{])(width|height|padding|margin|gap|display|order|visibility)(-[a-z-]+)?\s*:/;
    expect(withoutComments.match(GEOMETRY)?.[0] ?? "", "panelSkin.css changes geometry").toBe("");
    // The panels scroll in regions the components own: a skin that set `overflow` could freeze the
    // 193-entry changelog or the help article pane.
    expect(withoutComments, "panelSkin.css touches overflow").not.toMatch(/overflow(-[xy])?\s*:/);
    const blocks = [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    expect(blocks.length, "panelSkin.css has no readable rules").toBeGreaterThan(0);
    for (const [, selector, body] of blocks) {
      if (!/position\s*:\s*(absolute|fixed)/.test(body)) continue;
      expect(body, `panelSkin.css: ${selector.trim()} is positioned but not click-through`).toMatch(
        /pointer-events\s*:\s*none/
      );
    }
  });
});
