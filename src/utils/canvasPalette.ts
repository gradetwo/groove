/**
 * Concrete colours for canvas painters.
 *
 * WHY THIS EXISTS
 * ---------------
 * A canvas is the one surface a stylesheet cannot reach. `ctx.fillStyle = "var(--m-gold)"` is not a
 * colour to the 2D context — it is an invalid value it silently ignores, leaving the *previous*
 * style in place — so a visualiser that wants to wear the active skin has to resolve the custom
 * property to a concrete colour itself and paint with that. `VinylCanvas` does exactly this for the
 * record's label; these helpers are the resolution half, factored out so the three kick canvases do
 * not each grow their own copy.
 *
 * They are pure on purpose, which is also why they live in `src/utils` (the util layer) rather than
 * next to their callers: no React, no DOM, no knowledge that `.mobile-root` or a skin exists. That
 * also makes the parsing and the fallback rule testable without a browser. Reading the skin is the
 * hook's job — `src/components/kick/useCanvasPalette.ts`.
 */

/** An sRGB colour with alpha, in the shape the 2D context wants: channels 0-255, alpha 0-1. */
export interface CanvasColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Parse a *concrete* CSS colour into its components, or `null` when it is not one.
 *
 * Accepted, because these are the forms a resolved custom property actually takes in this codebase:
 *   - `#rrggbb`, with or without the `#` (`VinylCanvas` reads `--m-gold` as a bare hex),
 *   - `rgb(r g b)`, the space-separated form the skin stylesheets use,
 *   - `rgb(r, g, b)` and `rgba(r, g, b, a)`, the comma forms the older literals use,
 *   - the space/slash alpha form (`rgb(r g b / a)`).
 *
 * Everything else returns `null` — deliberately, so the caller keeps its own hardcoded fallback
 * instead of painting `NaN`. That includes an unresolved `var(--m-gold)`, the empty string a
 * missing token yields, named colours, and 8-digit hex: a skin that supplies one of those keeps the
 * desktop colour rather than drawing nothing.
 */
export function parseCanvasColor(value: string | null | undefined): CanvasColor | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;

  // `#rrggbb` — the optional `#` is the `VinylCanvas` convention.
  const hex = /^#?([0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const packed = parseInt(hex[1], 16);
    return { r: (packed >> 16) & 255, g: (packed >> 8) & 255, b: packed & 255, a: 1 };
  }

  const fn = /^rgba?\(([^)]*)\)$/i.exec(text);
  if (!fn) return null;
  // Commas, whitespace and the modern `/` all separate the same four numbers.
  const parts = fn[1].replace(/\//g, " ").split(/[,\s]+/).filter(Boolean);
  if (parts.length !== 3 && parts.length !== 4) return null;

  const numbers = parts.map(Number);
  if (numbers.some((n) => !Number.isFinite(n))) return null;
  const [r, g, b, a = 1] = numbers;
  if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) return null;
  if (a < 0 || a > 1) return null;
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a };
}

/**
 * The `rgba(...)` string a stroke or fill wants.
 *
 * The alpha is an argument rather than baked into the colour because the painters here draw the
 * *same* role at several strengths — a graticule at 0.05, the same graticule flashing at 0.42 on a
 * hit — and re-parsing for each is pointless. Omitting it keeps the colour's own alpha.
 */
export function canvasRgba(color: CanvasColor, alpha: number = color.a): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

/**
 * Linear per-channel mix, `t = 0` giving `from` and `t = 1` giving `to`.
 *
 * Deliberately returns *unrounded* channels: the callers are ramps that used to be written as bare
 * arithmetic (`Math.floor(180 + t * 65)`), and rounding here and flooring there would move a pixel
 * on the desktop. The caller floors once, at the end, exactly as before.
 */
export function mixCanvasColors(from: CanvasColor, to: CanvasColor, t: number): CanvasColor {
  return {
    r: from.r + t * (to.r - from.r),
    g: from.g + t * (to.g - from.g),
    b: from.b + t * (to.b - from.b),
    a: from.a + t * (to.a - from.a),
  };
}

/**
 * The resolved token if it parses, otherwise the literal fallback — never `null`.
 *
 * This is the rule the whole re-skin rests on: a skin that is missing the token, or supplies a form
 * the parser does not know, gets the *desktop* colour it had before, not a hole. The fallbacks the
 * callers pass are literals defined in the same file as the painter, so the last resort is only
 * reachable if someone hands this a broken literal; black keeps the type honest without pretending
 * to be a skin colour.
 */
export function resolveCanvasColor(token: string | null | undefined, fallback: string): CanvasColor {
  return parseCanvasColor(token) ?? parseCanvasColor(fallback) ?? { r: 0, g: 0, b: 0, a: 1 };
}
