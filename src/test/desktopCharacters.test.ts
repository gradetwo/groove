/**
 * The desktop skins' *character* sheets — the contract each one has to keep.
 *
 * `desktopSkins.css` (generated) gives every skin the phone's **palette**. That is not the same as the
 * phone's *look*: the comic skin is newsprint and Ben-Day dots, the pixel skin is stepped frames and
 * scanlines, the Soviet-year skin is a constructivist poster with diagonal cuts. Those are type, edges and
 * texture — a palette cannot express them, so each skin has a `src/styles/skin-<id>.css` for the character.
 *
 * Five files hand-written by five different passes is exactly how a skin system rots, so this gate holds
 * them to the same rules the phone's skins live by, and adds the one rule that makes a *desktop* character
 * sheet safe:
 *
 *  1. **Scoped.** Every rule is under `:root[data-skin="<id>"]` — a character rule that leaks applies to
 *     every other skin, which is the failure nobody notices until they switch themes.
 *  2. **Token-only colour.** No new hexes. A character pass that invents a colour breaks the promise the
 *     palette layer exists to keep ("the same palette on both surfaces"), and the five skins would drift
 *     apart from their phone twins. Inline `data:` URLs are allowed (a texture drawn in CSS), external ones
 *     are not — a skin must not fetch anything.
 *  3. **No `!important`,** no `@font-face`/`@import`, and no geometry that a phone-sized layout depends on
 *     (`width`/`height`/`padding`/`margin`/`gap`/`display`/`order`/`visibility`) — the desktop's layout is
 *     measured by the toolbar density gate and the E2E matrix, and "a skin changed the box" is a bug in
 *     those gates' eyes for very good reason. `border-width`, `border-radius`, `box-shadow`, `filter`,
 *     `transform`, `outline` and pseudo-element `content` are the character pass's tools.
 *  4. **Every skin has one,** and the skin loader names it, or the character silently does nothing. The
 *     sheets are *lazy* on purpose (only one is ever in use, and keeping all five in the entry bundle cost
 *     6 KB of gzip on the initial route), so "is it imported" means "is it in the loader's registry".
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");
const CHARACTER_SKINS = ["minimal", "comic", "soviet", "sovietYears", "pixel"] as const;
const LOADER = readFileSync(join(ROOT, "src", "hooks", "useSkin.ts"), "utf8");
const PALETTE =
  readFileSync(join(ROOT, "src", "styles", "desktopTokens.css"), "utf8") +
  readFileSync(join(ROOT, "src", "styles", "desktopSkins.css"), "utf8");

const sheet = (skin: string) => readFileSync(join(ROOT, "src", "styles", `skin-${skin}.css`), "utf8");
const code = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Selector lists, split on their commas at bracket depth (a `:is(a, b)` is one selector). */
function rules(css: string): Array<{ selector: string; body: string }> {
  return [...code(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    body: m[2],
  }));
}

describe("desktop skin characters", () => {
  it("exists and is imported for every skin that has one", () => {
    for (const skin of CHARACTER_SKINS) {
      const file = join(ROOT, "src", "styles", `skin-${skin}.css`);
      expect(existsSync(file), `missing src/styles/skin-${skin}.css`).toBe(true);
      expect(LOADER, `useSkin.ts should load skin-${skin}.css with its skin`).toContain(`../styles/skin-${skin}.css`);
    }
  });

  it("scopes every rule to its own skin", () => {
    for (const skin of CHARACTER_SKINS) {
      const scoped = rules(sheet(skin)).filter((rule) => rule.selector.length > 0);
      expect(scoped.length, `skin-${skin}.css has no rules yet`).toBeGreaterThan(0);
      for (const rule of scoped) {
        for (const selector of rule.selector.split(/,(?![^(]*\))/)) {
          if (!selector.trim()) continue;
          expect(
            selector.includes(`[data-skin="${skin}"]`),
            `skin-${skin}.css: "${selector.trim()}" is not scoped to its own skin`
          ).toBe(true);
          /**
           * …and not scoped to the *phone* by accident. Both surfaces live under the same `<html
           * data-skin>`, so a rule without a surface is a rule that also restyles the phone shell —
           * whose own sheets were tuned rule by rule. `[data-surface="desktop"]` is what keeps a
           * desktop character from touching it.
           */
          expect(
            selector.includes('[data-surface="desktop"]'),
            `skin-${skin}.css: "${selector.trim()}" would also apply inside the phone shell`
          ).toBe(true);
        }
      }
    }
  });

  it("never invents a colour: the palette belongs to the generated sheet", () => {
    for (const skin of CHARACTER_SKINS) {
      const withoutDataUrls = code(sheet(skin)).replace(/url\("data:[^"]*"\)/g, "url(DATA)");
      const hexes = [...withoutDataUrls.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
      // A few structural blacks and whites are allowed through a token; a literal is not.
      expect(
        hexes.filter((hex) => !/^#(000|000000|fff|ffffff)$/i.test(hex)),
        `skin-${skin}.css: hardcoded colour(s) ${hexes.join(", ")} — use a --d-* token`
      ).toEqual([]);
      expect(withoutDataUrls, `skin-${skin}.css: no external url()`).not.toMatch(/url\((?!["']?data:)/);
      expect(withoutDataUrls, `skin-${skin}.css: @font-face`).not.toContain("@font-face");
      expect(withoutDataUrls, `skin-${skin}.css: @import`).not.toContain("@import");
      expect(code(sheet(skin)), `skin-${skin}.css: !important`).not.toContain("!important");
    }
  });

  it("touches character, not layout", () => {
    const GEOMETRY = /(?:^|[\s;{])(width|height|padding|margin|gap|display|order|visibility)(-[a-z-]+)?\s*:/;
    for (const skin of CHARACTER_SKINS) {
      const match = GEOMETRY.exec(code(sheet(skin)));
      expect(
        match?.[0] ?? "",
        `skin-${skin}.css changes layout (${match?.[0]?.trim()}) — the toolbar density gate and the E2E matrix measure the desktop's boxes`
      ).toBe("");
    }
  });

  it("references only tokens the palette actually declares", () => {
    const declared = new Set([...PALETTE.matchAll(/(--d-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    for (const skin of CHARACTER_SKINS) {
      const used = new Set([...code(sheet(skin)).matchAll(/var\((--d-[a-z0-9-]+)/g)].map((m) => m[1]));
      const unknown = [...used].filter((name) => !declared.has(name));
      expect(unknown, `skin-${skin}.css references undeclared token(s)`).toEqual([]);
    }
  });
});
