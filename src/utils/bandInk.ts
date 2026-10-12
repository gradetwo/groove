/**
 * ⭐ **A band's colour is a fill; a band's *label* is text.**
 *
 * The evaluation measured the analyzer's frequency labels at 1.55:1–2.54:1 on the paper skins: `FREQUENCY_BANDS` carries
 * the vivid 500-level colours a dark panel wants, and the list drew them as **text** on whatever panel the skin
 * provided — so on `minimal`, `comic` and `sovietYears` the label was a bright yellow on near-white.
 *
 * The fix keeps one hue and asks the skin's own panel how to draw it: dark panel ⇒ the colour as authored (the panels
 * these were chosen for), light panel ⇒ the same hue taken down to a readable ink. The panel comes from `--d-panel`
 * rather than from a list of skin names, so a new light skin is answered without editing this file — a list is the
 * thing that drifts.
 */
const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance of a `"230 199 102"`-style token value; `undefined` when the value is not three numbers. */
export function tokenLuminance(token: string | undefined): number | undefined {
  const parts = (token ?? "").trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  if (parts.length < 3) return undefined;
  return 0.2126 * channel(parts[0]!) + 0.7152 * channel(parts[1]!) + 0.0722 * channel(parts[2]!);
}

const parseHex = (hex: string): [number, number, number] | undefined => {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return undefined;
  const value = Number.parseInt(match[1]!, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/** ⭐ Darken a hex colour towards black, keeping its hue: `factor` 1 leaves it alone, 0 makes it black. */
export function darkenHex(hex: string, factor: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const scale = Math.max(0, Math.min(1, factor));
  return `#${rgb.map((c) => Math.round(c * scale).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * ⭐ **The ink for a band's label on this skin.** A light panel takes the hue down until it clears the body-text floor
 * against that panel; a dark panel keeps the authored colour, which is what it was chosen for.
 */
export function readableBandColor(hex: string, panelToken: string | undefined): string {
  const luminance = tokenLuminance(panelToken);
  if (luminance === undefined || luminance <= 0.5) return hex;
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  // The panel's own luminance in the WCAG ratio, as the number the darkened ink has to beat (4.5:1 for body text).
  const target = (luminance + 0.05) / 4.5 - 0.05;
  let factor = 1;
  let best = hex;
  for (let step = 0; step < 20; step += 1) {
    factor -= 0.05;
    if (factor <= 0) break;
    const candidate = rgb.map((c) => c * factor);
    const inkLuminance = 0.2126 * channel(candidate[0]!) + 0.7152 * channel(candidate[1]!) + 0.0722 * channel(candidate[2]!);
    best = darkenHex(hex, factor);
    if (inkLuminance <= target) break;
  }
  return best;
}
