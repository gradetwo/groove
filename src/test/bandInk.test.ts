import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FREQUENCY_BANDS } from "../utils/audioAnalysis";
import { darkenHex, readableBandColor, tokenLuminance } from "../utils/bandInk";

/**
 * ⭐ **A band's label is text** (evaluation finding S5).
 *
 * The band palette carries the vivid 500-level colours a dark panel wants, and the analyzer drew them as **text** — so
 * on the paper skins (`minimal`, `comic`, `sovietYears`) the evaluation measured 1.55:1–2.54:1, with the yellow
 * Low-Mids label essentially invisible on near-white. The rule is one hue, taken down when the panel is light, decided
 * from `--d-panel` rather than from a list of skin names.
 */
const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const contrast = (hex: string, panel: string) => {
  const rgb = /^#([0-9a-f]{6})$/i.exec(hex)!.slice(1)[0]!;
  const value = Number.parseInt(rgb, 16);
  const ink = 0.2126 * channel((value >> 16) & 255) + 0.7152 * channel((value >> 8) & 255) + 0.0722 * channel(value & 255);
  const [r, g, b] = panel.split(/\s+/).map(Number);
  const ground = 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
  const [light, dark] = ink > ground ? [ink, ground] : [ground, ink];
  return (light + 0.05) / (dark + 0.05);
};

describe("the analyzer's band ink", () => {
  it("⭐ clears the body-text floor on a light panel, and leaves the authored colour alone on a dark one", () => {
    const light = "250 250 250";
    const dark = "18 19 23";
    // Every band, not one: the report found some bands failing and others not, and a fix that only moved the yellow
    // would leave the emerald and cyan behind.
    for (const band of FREQUENCY_BANDS) {
      const onLight = readableBandColor(band.color, light);
      expect(contrast(onLight, light), `${band.nameEn} on a light panel`).toBeGreaterThanOrEqual(4.5);
      expect(readableBandColor(band.color, dark), `${band.nameEn} on a dark panel`).toBe(band.color);
    }
    // And an unreadable token (a test environment, a skin that declares none) changes nothing.
    expect(readableBandColor("#f59e0b", undefined)).toBe("#f59e0b");
    expect(tokenLuminance("not a colour")).toBeUndefined();
    expect(darkenHex("#f59e0b", 0.5)).toBe("#7b4f06");
  });

  it("⭐ the analyzer's label asks for that ink rather than using the fill colour as text", () => {
    const component = readFileSync(resolve(__dirname, "../components/analyzer/WaterfallSpectrogram.tsx"), "utf8");
    expect(component).toContain("readableBandColor(band.color, panelToken)");
    expect(component, "the fill colour must not be the label's colour").not.toMatch(/style=\{\{\s*color:\s*band\.color\s*\}\}/);
  });
});
