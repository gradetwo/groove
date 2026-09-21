/**
 * The challenge screens' colours are **roles**, and every skin can answer them.
 *
 * ## The bug this closes
 *
 * `challengeAlgorithm` used to carry literal metals — `#cd7f32` bronze, `#c0c0c0` silver — and the rank label
 * rendered them with an inline style. An inline hex beats every stylesheet, so after the six-skin round that
 * label was the one piece of text still in the default theme, and on the Soviet-years paper the silver read at
 * **1.6:1**. The same pattern (a colour decided in JavaScript) is the failure mode the skin system cannot see.
 *
 * It is fixed by keeping the decision in the data layer (a role name) and the colour in each surface's tokens
 * (`src/utils/rankColours.ts`). This file is the gate that keeps it that way *and* that keeps the roles
 * readable: it resolves every role's token, for every skin of both surfaces, straight out of the stylesheets —
 * so the day someone adds a seventh metal, or a sixth skin forgets a token, this fails instead of a label
 * quietly disappearing on one theme.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { RANK_TIERS, type TierColourRole } from "../utils/challengeAlgorithm";
import { COLOUR_TOKENS, outcomeColour, tierColour } from "../utils/rankColours";

const ROOT = resolve(__dirname, "..", "..");
const DESKTOP_TOKENS =
  readFileSync(join(ROOT, "src", "styles", "desktopTokens.css"), "utf8") +
  readFileSync(join(ROOT, "src", "styles", "desktopSkins.css"), "utf8");

/* ---------------------------------------------------------------------------------------------
 * Resolving colours out of the stylesheets
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

/** `#rgb`, `#rrggbb`, `rgb(r g b)` and `rgb(r, g, b)` all appear in the sheets. */
function toRgb(value: string): [number, number, number] | null {
  const text = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const full = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(text);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

/** `--d-x` from the desktop sheets, per skin. */
function desktopToken(skin: string, token: string): [number, number, number] | null {
  const block =
    skin === "default"
      ? /:root\s*\{([^}]*)\}/.exec(DESKTOP_TOKENS)
      : new RegExp(`:root\\[data-skin="${skin}"\\]\\s*\\{([^}]*)\\}`).exec(DESKTOP_TOKENS);
  if (!block) return null;
  const value = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(block[1]);
  if (!value) return null;
  // Space-separated channels are what the generator writes.
  const channels = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(value[1]);
  return channels ? [Number(channels[1]), Number(channels[2]), Number(channels[3])] : toRgb(value[1]);
}

/** `--m-x` from the phone: the base shell sheet, or one skin's own block. */
function phoneToken(skin: string, token: string): [number, number, number] | null {
  const file =
    skin === "default"
      ? join(ROOT, "src", "mobile", "mobile.css")
      : join(ROOT, "src", "mobile", "skins", `${skin}.css`);
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const wanted =
    skin === "default"
      ? new RegExp(`${token}\\s*:\\s*([^;]+);`)
      : new RegExp(`:root\\[data-skin="${skin}"\\]\\s*\\.mobile-root\\s*\\{([^}]*)\\}`);
  const block = skin === "default" ? css : wanted.exec(css);
  if (!block) return null;
  const body = skin === "default" ? css : block[1];
  const value = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(body);
  return value ? toRgb(value[1]) : null;
}

const DESKTOP_SKINS = ["default", "minimal", "comic", "soviet", "sovietYears", "pixel"];
const PHONE_SKINS = ["minimal", "comic", "soviet", "sovietYears", "pixel"];

describe("challenge colours are roles, not hexes", () => {
  it("gives every tier a role from the closed set, and no tier a literal colour", () => {
    const roles = new Set<TierColourRole>(["warning", "neutral", "accent", "teal", "violet", "danger"]);
    expect(RANK_TIERS.length).toBeGreaterThanOrEqual(6);
    for (const tier of RANK_TIERS) {
      expect(roles.has(tier.colourRole), `${tier.id} has role ${tier.colourRole}`).toBe(true);
      // The type no longer carries a colour at all; a stray hex would be unreachable from every skin.
      expect(tier).not.toHaveProperty("color");
      expect(tier).not.toHaveProperty("borderColor");
    }
    expect(new Set(RANK_TIERS.map((t) => t.colourRole)).size).toBe(6);
  });

  it("answers every role with a variable on both surfaces", () => {
    for (const tier of RANK_TIERS) {
      expect(tierColour(tier.colourRole, "phone")).toMatch(/^var\(--m-[a-z0-9-]+\)$/);
      expect(tierColour(tier.colourRole, "desktop")).toMatch(/^var\(--d-[a-z0-9-]+\)$/);
    }
    expect(outcomeColour("right", "phone")).toBe("var(--m-green)");
    expect(outcomeColour("wrong", "phone")).toBe("var(--m-red)");
    expect(outcomeColour("right", "desktop")).toBe("var(--d-success)");
    expect(outcomeColour("wrong", "desktop")).toBe("var(--d-danger)");
  });

  it("names tokens that both stylesheets actually define", () => {
    for (const surface of ["phone", "desktop"] as const) {
      const unknown = COLOUR_TOKENS[surface].filter((token) => {
        if (surface === "desktop") return !DESKTOP_TOKENS.includes(`${token}:`);
        return !PHONE_SKINS.every((skin) => phoneToken(skin, token) !== null);
      });
      expect(unknown, `${surface} roles name tokens no stylesheet defines`).toEqual([]);
    }
  });

  it("keeps every role readable on every skin of both surfaces", () => {
    /**
     * The assertion that would have caught the original bug: on the Soviet-years paper the silver tier was
     * 1.6:1. Every role has to clear the body-text floor on the surface it is drawn on, for every skin.
     */
    const failures: string[] = [];
    for (const skin of DESKTOP_SKINS) {
      const panel = desktopToken(skin, "--d-panel");
      if (!panel) {
        failures.push(`${skin}: no --d-panel`);
        continue;
      }
      for (const role of new Set(RANK_TIERS.map((t) => t.colourRole))) {
        const token = tierColour(role, "desktop").slice(4, -1);
        const colour = desktopToken(skin, token);
        if (!colour) {
          failures.push(`${skin}: ${role} → ${token} missing`);
          continue;
        }
        const ratio = contrast(colour, panel);
        if (ratio < 4.5) failures.push(`${skin}: ${role} (${token}) on panel = ${ratio.toFixed(2)}:1`);
      }
    }
    for (const skin of PHONE_SKINS) {
      const panel = phoneToken(skin, "--m-card");
      if (!panel) {
        failures.push(`${skin} (phone): no --m-card`);
        continue;
      }
      for (const role of new Set(RANK_TIERS.map((t) => t.colourRole))) {
        const token = tierColour(role, "phone").slice(4, -1);
        const colour = phoneToken(skin, token);
        if (!colour) {
          failures.push(`${skin} (phone): ${role} → ${token} missing`);
          continue;
        }
        const ratio = contrast(colour, panel);
        if (ratio < 4.5) failures.push(`${skin} (phone): ${role} (${token}) on card = ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });
});
