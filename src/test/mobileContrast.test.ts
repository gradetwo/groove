import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐ **The phone's colours are legible on the phone** (owner's second criterion, 2026-10-10: "44px 触控与对比度"). The 44 px
 * half already lives in `mobileTouchTargets.test.ts` — and was measured in a browser too: at 390×844 and 360×640 the shell
 * draws **269 interactive elements and none of them is under 44 px tall**. This is the other half, and it is arithmetic
 * rather than opinion: WCAG relative luminance, then a ratio.
 */
const luminance = (hex: string): number => {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const channels = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
};
const ratio = (a: string, b: string): number => {
  const [bright, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (bright! + 0.05) / (dark! + 0.05);
};
const palette = (path: string): Record<string, string> => {
  const css = readFileSync(resolve(__dirname, "..", path), "utf8");
  const found: Record<string, string> = {};
  for (const match of css.matchAll(/--m-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g)) found[match[1]!] = match[2]!;
  return found;
};

/** ⭐ The pairs a person actually reads: body text on the two surfaces, and the label on the accent button. */
const REQUIRED: Array<[string, string, number, string]> = [
  ["ink", "bg", 4.5, "body text on the page"],
  ["ink", "card", 4.5, "body text on a card"],
  ["on-gold", "gold", 4.5, "the label on the shell's accent button"],
];

describe("the phone palette's contrast", () => {
  const base = palette("mobile/mobile.css");

  it("⭐ the base palette carries the colours the pairs need", () => {
    for (const [text, background] of REQUIRED) {
      expect(base[text], `--m-${text} exists`).toBeTruthy();
      expect(base[background], `--m-${background} exists`).toBeTruthy();
    }
  });

  for (const [text, background, floor, why] of REQUIRED) {
    it(`⭐ ${why}: --m-${text} on --m-${background} is at least ${floor}:1`, () => {
      const measured = ratio(base[text]!, base[background]!);
      expect(measured, `measured ${measured.toFixed(2)}:1`).toBeGreaterThanOrEqual(floor);
    });
  }

  /**
   * ⭐ **Every skin, not just the base.** Each sheet overrides the palette (measured: `soviet.css` sets its own `--m-bg`,
   * `--m-card`, `--m-ink`, `--m-on-gold`), and a skin that ships an illegible pair is the whole reason this criterion exists —
   * checking only `mobile.css` would let six of the seven off.
   */
  it("⭐ every skin's own palette keeps the same pairs legible", () => {
    const sheets = readdirSync(resolve(__dirname, "../mobile/skins")).filter((name) => name.endsWith(".css"));
    expect(sheets.length, "the phone ships skins").toBeGreaterThan(4);
    for (const sheet of sheets) {
      const merged = { ...base, ...palette(`mobile/skins/${sheet}`) };
      for (const [text, background, floor, why] of REQUIRED) {
        if (!merged[text] || !merged[background]) continue;
        const measured = ratio(merged[text], merged[background]);
        console.log(`${sheet}: --m-${text} on --m-${background} = ${measured.toFixed(2)}:1 (${why})`);
        expect(measured, `${sheet}: ${why} measured ${measured.toFixed(2)}:1`).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it("⭐ and the accent colours are legible enough to be read as text", () => {
    // Reported rather than asserted at body-text level: these are used for labels and status words, where WCAG's floor for
    // large/UI text is 3:1. Printing the numbers keeps the reading honest instead of hiding it behind one threshold.
    for (const accent of ["teal", "red", "green", "violet", "warning", "gold", "ink-2", "ink-3"]) {
      if (!base[accent]) continue;
      const onBg = ratio(base[accent]!, base["bg"]!);
      console.log(`contrast --m-${accent} on --m-bg: ${onBg.toFixed(2)}:1`);
      expect(onBg, `--m-${accent} on the page`).toBeGreaterThanOrEqual(3);
    }
  });
});
