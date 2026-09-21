/**
 * The two sprites the record is made of, baked once each.
 *
 * Both are ports of functions in `player2.html` (`buildVinyl`, `buildLabel`) and they exist here for
 * one reason: they are expensive (hundreds of arcs, a dozen text runs) and completely static, so
 * drawing them per frame is what makes a canvas record stutter. The reference already knew this — it
 * bakes both into offscreen canvases — and this file keeps that shape, minus the globals.
 *
 * The noise in the vinyl is a deterministic LCG, not `Math.random()`: the reference seeds `rnd` from a
 * constant, and a texture that changed every load would shimmer between renders. Same seed, same
 * record.
 *
 * Nothing here reads React state or the DOM beyond `document.createElement("canvas")`, so it is also
 * the one part of the record a non-browser test can exercise (it simply returns `null` without a 2D
 * context, and the canvas does not draw the sprite).
 */
import {
  LABEL_BANDS,
  LABEL_BASS_RADIUS,
  LAYER_COLORS,
  LAYER_KEYS,
  LAYER_RADII,
  STEP_ANGLE,
  type LayerKey,
} from "./vinylMath";

/** The label's four artworks, straight from the reference: a real pressing's paper stock. */
export interface LabelArt {
  /** Paper. */
  bg: string;
  /** Ink for the type and the hi-hat band. */
  fg: string;
  /** The accent ink: the kick band, the bass dots, the outer ring. */
  ac: string;
  /** The centre graphic. */
  shape: "rings" | "rays" | "wave" | "grid";
}

export const LABEL_ART: readonly LabelArt[] = [
  { bg: "#E6D4AC", fg: "#43331D", ac: "#A96F27", shape: "rings" },
  { bg: "#D8E0E6", fg: "#28343E", ac: "#54788C", shape: "rays" },
  { bg: "#E9CCB2", fg: "#4A3020", ac: "#C26E3C", shape: "wave" },
  { bg: "#D8DBDE", fg: "#23262B", ac: "#77828C", shape: "grid" },
];

/** A baked sprite plus what the caller needs to place it. */
export interface BakedSprite {
  canvas: HTMLCanvasElement;
  /** Logical side length; the bitmap is `size * superSample` square. */
  size: number;
}

/**
 * The disc face: a radial sheen, ~1500 groove arcs (every groove with a wider "gap" every 34 px of
 * radius, plus a handful of scratches and dust specks), and the two edge rings.
 *
 * `radius` is the disc radius in CSS pixels. The sprite is baked at 2x and drawn back at 1x, which is
 * the only reason ~1500 arcs can be drawn once and still look sharp on a phone.
 *
 * The four instrument ring *guides* are baked in here as well — the reference strokes them per frame,
 * but they are concentric circles on a disc that rotates about its own centre, so a rotation cannot
 * move them: baking them costs nothing visually and removes four full-circle strokes from every frame.
 */
export function bakeVinyl(radius: number, superSample = 2): BakedSprite | null {
  const size = Math.ceil(radius * 2 + 4);
  const canvas = document.createElement("canvas");
  canvas.width = size * superSample;
  canvas.height = size * superSample;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.scale(superSample, superSample);
  g.translate(size / 2, size / 2);
  const r = radius;
  const tau = Math.PI * 2;

  // Deterministic noise: the reference's LCG (seed 7), so the texture is the same on every load.
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  const sheen = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
  sheen.addColorStop(0, "#262019");
  sheen.addColorStop(0.55, "#141210");
  sheen.addColorStop(0.85, "#0B0A09");
  sheen.addColorStop(1, "#060505");
  g.fillStyle = sheen;
  g.beginPath();
  g.arc(0, 0, r, 0, tau);
  g.fill();

  for (let groove = r * 0.44; groove < r - 2; groove += 1.05) {
    // The reference's "gap" is the wider, slightly brighter band where a track divides.
    const isGap = ((groove * 0.9) | 0) % 34 < 2;
    let alpha = 0.018 + Math.sin(groove * 0.7) * 0.006 + rnd() * 0.02;
    if (isGap) alpha += 0.055;
    if (rnd() < 0.05) alpha += 0.02;
    g.strokeStyle = `rgba(238,230,214,${alpha.toFixed(3)})`;
    g.lineWidth = isGap ? 1.6 : 0.7;
    g.beginPath();
    g.arc(0, 0, groove, 0, tau);
    g.stroke();
  }

  // Scratches: short arcs at random radii and angles.
  for (let i = 0; i < 46; i += 1) {
    const groove = r * (0.46 + rnd() * 0.5);
    const start = rnd() * tau;
    const length = 0.15 + rnd() * 0.7;
    g.strokeStyle = `rgba(240,235,220,${(0.012 + rnd() * 0.03).toFixed(3)})`;
    g.lineWidth = 0.6 + rnd() * 0.8;
    g.beginPath();
    g.arc(0, 0, groove, start, start + length);
    g.stroke();
  }

  // Dust.
  for (let i = 0; i < 90; i += 1) {
    const angle = rnd() * tau;
    const distance = r * Math.sqrt(rnd()) * 0.98;
    g.fillStyle = `rgba(240,235,220,${(0.02 + rnd() * 0.05).toFixed(3)})`;
    g.beginPath();
    g.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, 0.5 + rnd() * 0.9, 0, tau);
    g.fill();
  }

  g.strokeStyle = "rgba(0,0,0,0.5)";
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(0, 0, r - 2.4, 0, tau);
  g.stroke();
  g.strokeStyle = "rgba(255,246,225,0.10)";
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(0, 0, r - 1, 0, tau);
  g.stroke();
  g.strokeStyle = "rgba(238,230,214,0.05)";
  g.lineWidth = 6;
  g.beginPath();
  g.arc(0, 0, r * 0.455, 0, tau);
  g.stroke();

  // The sequencer's ring guides, in their baked place (see the function's header).
  for (const key of LAYER_KEYS) {
    g.strokeStyle = `rgba(${LAYER_COLORS[key].str},0.06)`;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, LAYER_RADII[key] * r, 0, tau);
    g.stroke();
  }

  return { canvas, size };
}

function centerGraphic(g: CanvasRenderingContext2D, art: LabelArt, cx: number, cy: number): void {
  const tau = Math.PI * 2;
  g.strokeStyle = art.fg;
  g.fillStyle = art.fg;
  g.lineCap = "round";
  if (art.shape === "rings") {
    for (const [radius, width, alpha] of [
      [24, 5, 0.9],
      [42, 4, 0.65],
      [58, 3, 0.45],
    ] as const) {
      g.lineWidth = width;
      g.globalAlpha = alpha;
      g.beginPath();
      g.arc(cx, cy, radius, 0, tau);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  if (art.shape === "rays") {
    g.lineWidth = 4.5;
    g.globalAlpha = 0.8;
    for (let k = 0; k < 12; k += 1) {
      const angle = (k * Math.PI) / 6;
      g.beginPath();
      g.moveTo(cx + Math.cos(angle) * 16, cy + Math.sin(angle) * 16);
      g.lineTo(cx + Math.cos(angle) * 56, cy + Math.sin(angle) * 56);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  if (art.shape === "wave") {
    g.lineWidth = 4.5;
    g.globalAlpha = 0.85;
    for (const [phase, amplitude] of [
      [0, 14],
      [1.2, 9],
    ] as const) {
      g.beginPath();
      for (let x = -58; x <= 58; x += 4) {
        const y = cy + (phase ? 24 : 0) + Math.sin(x / 9 + phase) * amplitude * (1 - Math.abs(x) / 72);
        if (x === -58) g.moveTo(cx + x, y);
        else g.lineTo(cx + x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  if (art.shape === "grid") {
    for (let i = -1; i <= 1; i += 1) {
      for (let j = -1; j <= 1; j += 1) {
        g.beginPath();
        g.arc(cx + i * 28, cy + j * 28, i === 0 && j === 0 ? 7 : 4.5, 0, tau);
        g.fill();
      }
    }
  }
}

export interface LabelSpec {
  title: string;
  subtitle: string;
  /** The mono line under the artwork ("GROOVE REC · 33 1/3 RPM"). */
  footer: string;
  /** The four lanes, `[kick, snare, hat, bass]`, as the record draws them. */
  lanes: readonly (readonly boolean[])[];
  art: LabelArt;
  /** The module accent, used for the kick band, the bass dots and the centre ring. */
  accent: string;
  /**
   * The type faces, from the skin's `--m-font-display` / `--m-font-mono`.
   *
   * Canvas text cannot inherit anything from CSS, so the record would otherwise print every skin's label
   * in Space Grotesk — the 8-bit skin included. `VinylCanvas` resolves the two variables on the skinned
   * root and hands them in, exactly as it does for the accent.
   */
  displayFont: string;
  monoFont: string;
}

/**
 * The centre label: paper, a ring of 16 ticks per instrument (the same pattern the disc face shows,
 * printed instead of lit), the name, and the spindle hole.
 *
 * The reference draws the label at its disc size and lets the caller scale it; this bakes at 512 px
 * regardless, which is more than a phone label can resolve and keeps the cache key simple.
 */
export function bakeLabel(spec: LabelSpec, size = 512): BakedSprite | null {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const tau = Math.PI * 2;
  const radius = size / 2;
  const scale = radius / 256;

  g.fillStyle = spec.art.bg;
  g.beginPath();
  g.arc(radius, radius, radius, 0, tau);
  g.fill();
  g.strokeStyle = spec.accent;
  g.lineWidth = 3 * scale;
  g.globalAlpha = 0.9;
  g.beginPath();
  g.arc(radius, radius, radius - 12 * scale, 0, tau);
  g.stroke();
  g.globalAlpha = 1;

  const band = (from: number, to: number, width: number, key: LayerKey, colour: string, alpha: number) => {
    const lane = spec.lanes[LAYER_KEYS.indexOf(key)] ?? [];
    g.strokeStyle = colour;
    g.lineWidth = width * scale;
    g.globalAlpha = alpha;
    g.lineCap = "round";
    for (let step = 0; step < 16; step += 1) {
      if (!lane[step]) continue;
      const angle = -Math.PI / 2 - step * STEP_ANGLE;
      g.beginPath();
      g.moveTo(radius + Math.cos(angle) * from * scale, radius + Math.sin(angle) * from * scale);
      g.lineTo(radius + Math.cos(angle) * to * scale, radius + Math.sin(angle) * to * scale);
      g.stroke();
    }
    g.globalAlpha = 1;
  };
  // Track ticks are grouped by a dash whose key is not in the map above, so they are drawn first, then
  // the three bands — the reference's order, which is also back-to-front.
  g.setLineDash([]);
  band(LABEL_BANDS[0].from, LABEL_BANDS[0].to, LABEL_BANDS[0].width, "hat", spec.art.fg, 0.5);
  band(LABEL_BANDS[1].from, LABEL_BANDS[1].to, LABEL_BANDS[1].width, "kick", spec.accent, 0.95);
  band(LABEL_BANDS[2].from, LABEL_BANDS[2].to, LABEL_BANDS[2].width, "snare", spec.art.fg, 0.85);

  const bass = spec.lanes[LAYER_KEYS.indexOf("bass")] ?? [];
  g.fillStyle = spec.accent;
  for (let step = 0; step < 16; step += 1) {
    if (!bass[step]) continue;
    const angle = -Math.PI / 2 - step * STEP_ANGLE;
    g.beginPath();
    g.arc(
      radius + Math.cos(angle) * LABEL_BASS_RADIUS * radius,
      radius + Math.sin(angle) * LABEL_BASS_RADIUS * radius,
      4.5 * scale,
      0,
      tau
    );
    g.fill();
  }

  g.fillStyle = spec.art.fg;
  g.textAlign = "center";
  const letterSpacing = (value: string) => {
    // `letterSpacing` is Chromium/WebKit-only in canvas; the reference wraps it in try/catch for the
    // same reason, and the label still reads without it.
    try {
      (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value;
    } catch {
      /* older engines simply ignore the tighter tracking */
    }
  };
  letterSpacing(`${7 * scale}px`);
  g.font = `700 ${45 * scale}px ${spec.displayFont}`;
  g.fillText(spec.title.slice(0, 12), radius, 152 * scale);
  letterSpacing(`${5 * scale}px`);
  g.font = `500 ${21 * scale}px ${spec.displayFont}`;
  g.globalAlpha = 0.72;
  g.fillText(spec.subtitle.split(" ·")[0].slice(0, 14), radius, 186 * scale);
  g.globalAlpha = 1;
  letterSpacing(`${4 * scale}px`);
  g.font = `500 ${15 * scale}px ${spec.monoFont}`;
  g.globalAlpha = 0.55;
  g.fillText(spec.footer, radius, 392 * scale);
  g.globalAlpha = 1;
  letterSpacing("0px");

  centerGraphic(g, spec.art, radius, radius);

  g.strokeStyle = spec.accent;
  g.lineWidth = 2.5 * scale;
  g.globalAlpha = 0.9;
  g.beginPath();
  g.arc(radius, radius, 21 * scale, 0, tau);
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = "#12100C";
  g.beginPath();
  g.arc(radius, radius, 9.5 * scale, 0, tau);
  g.fill();

  return { canvas, size };
}

/** Stable cache key for a label: everything that changes the artwork, and nothing that does not. */
export function labelCacheKey(spec: LabelSpec): string {
  const lanes = spec.lanes.map((lane) => lane.map((on) => (on ? "1" : "0")).join("")).join("|");
  // The faces belong in the key: switching skin has to re-bake the label, not reuse the old one.
  return [
    spec.title,
    spec.subtitle,
    spec.footer,
    spec.art.shape,
    spec.accent,
    spec.displayFont,
    spec.monoFont,
    lanes,
  ].join("~");
}

/** The instrument colours as `r,g,b` strings, for the ring strokes and the label wash. */
export const LAYER_RGB_STRINGS: Record<LayerKey, string> = {
  kick: LAYER_COLORS.kick.str,
  snare: LAYER_COLORS.snare.str,
  hat: LAYER_COLORS.hat.str,
  bass: LAYER_COLORS.bass.str,
};

/* ------------------------------------------------------------------- the per-frame pieces */

/** A concrete colour, as the 2D context needs it (`var()` is silently ignored). */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * The tint quantum, in 0..255 channel units.
 *
 * Every glow on the record is tinted with the current mix of the instrument colours, and that mix eases
 * every frame (`mixGlow`). Re-baking a sprite per frame would trade a gradient fill for a gradient fill;
 * re-baking it when a channel has moved by more than this is both invisible — 4/255 at an alpha below
 * 0.2 is well under one 8-bit step of what lands on screen — and rare: the mix settles in well under a
 * second and then stops moving entirely.
 */
export const TINT_QUANTUM = 4;

/** The cache key for a tinted sprite: the colour bucketed to `TINT_QUANTUM`. */
export function tintKey(colour: Rgb): string {
  return `${Math.round(colour.r / TINT_QUANTUM)},${Math.round(colour.g / TINT_QUANTUM)},${Math.round(colour.b / TINT_QUANTUM)}`;
}

/** One stop of a baked radial glow: position 0..1 along the radius, and the alpha there. */
export interface GlowStop {
  at: number;
  alpha: number;
}

/** One circle of a radial gradient, in logical sprite coordinates (the sprite's centre is 0,0). */
export interface GlowCircle {
  x?: number;
  y?: number;
  radius?: number;
}

export interface GlowSpec {
  /** The sprite's logical radius: it is drawn as a `2 * radius` square about its centre. */
  radius: number;
  colour: Rgb;
  stops: readonly GlowStop[];
  /**
   * The gradient's inner circle — the reference's wash and bloom both start away from their centre,
   * which is what keeps a bright core from sitting in the middle of the glow.
   */
  inner?: GlowCircle;
  /** The gradient's outer circle, if it is not simply the sprite's centre at `radius`. */
  outer?: GlowCircle;
  /** Bake at `1 / downscale` of the logical size: a soft glow has no detail to lose. */
  downscale?: number;
  /** Supersample the bake, for the glows small enough that their edge is visible. */
  superSample?: number;
  /**
   * Mask the result to a disc of this radius about the sprite's centre.
   *
   * The label wash is the reason: the reference fills a gradient over the label's *square* and clips it
   * to the label's circle, so a baked gradient without the mask would spill over the disc.
   */
  clipRadius?: number;
}

/**
 * Bake a radial glow: the colour and the profile at bake time, the *intensity* per frame through
 * `globalAlpha`.
 *
 * Splitting it that way is what makes the pulsing affordable. The reference rebuilds a radial gradient
 * every frame for the centre bloom, the label wash and the needle flash, and a gradient fill is one of
 * the more expensive things to ask a software rasteriser for — it evaluates the ramp per pixel. A baked
 * sprite is a texture fetch, and the per-frame part (alpha) is free.
 */
export function bakeGlow(spec: GlowSpec): BakedSprite | null {
  const size = Math.max(2, Math.ceil(spec.radius * 2));
  const downscale = Math.max(1, spec.downscale ?? 1);
  const superSample = Math.max(1, spec.superSample ?? 1);
  const pixels = Math.max(1, Math.round((size / downscale) * superSample));
  const canvas = document.createElement("canvas");
  canvas.width = pixels;
  canvas.height = pixels;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const tau = Math.PI * 2;
  g.scale(pixels / size, pixels / size);
  const half = size / 2;
  g.translate(half, half);

  const colour = `rgba(${Math.round(spec.colour.r)},${Math.round(spec.colour.g)},${Math.round(spec.colour.b)}`;
  const inner = spec.inner ?? {};
  const outer = spec.outer ?? {};
  const gradient = g.createRadialGradient(
    inner.x ?? 0,
    inner.y ?? 0,
    inner.radius ?? 0,
    outer.x ?? 0,
    outer.y ?? 0,
    outer.radius ?? spec.radius
  );
  for (const stop of spec.stops) gradient.addColorStop(stop.at, `${colour},${stop.alpha})`);
  g.fillStyle = gradient;
  // Filling the whole box is safe for every glow here: the ramp reaches alpha 0 before the box's
  // corners, and the box is what the caller scales the sprite to.
  g.fillRect(-half, -half, size, size);
  if (spec.clipRadius) {
    g.globalCompositeOperation = "destination-in";
    g.beginPath();
    g.arc(0, 0, spec.clipRadius, 0, tau);
    g.fill();
    g.globalCompositeOperation = "source-over";
  }
  return { canvas, size };
}

/**
 * A flat disc: the sequencer dots, the pip where a step is off, and the white core of an impulse.
 *
 * The reference fills one `arc` per dot per lane — 64 path rasterisations a frame — where a baked dot is
 * a six-pixel blit whose alpha the caller supplies.
 */
export function bakeDisc(radius: number, colour: Rgb, superSample = 2): BakedSprite | null {
  // The logical size stays exact rather than rounded up, because the caller draws the sprite at `size`:
  // a rounded-up box draws a *bigger* dot than the reference's `arc`, and a 1.5 px pip where the
  // reference has 1.2 px is a visibly brighter speck — its alpha is only 0.07.
  const size = Math.max(2, radius * 2);
  const pixels = Math.max(1, Math.round(size * superSample));
  const canvas = document.createElement("canvas");
  canvas.width = pixels;
  canvas.height = pixels;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.scale(pixels / size, pixels / size);
  g.fillStyle = `rgb(${Math.round(colour.r)},${Math.round(colour.g)},${Math.round(colour.b)})`;
  g.beginPath();
  g.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
  g.fill();
  return { canvas, size };
}

/**
 * The fixed sheen: the highlight that makes the disc read as a physical object.
 *
 * Unlike everything else on the record it neither rotates nor changes colour — only its intensity rides
 * the breath — so it is baked once per size and blitted with `globalAlpha`, which also removes a
 * `createLinearGradient` from every frame. The stops are the reference's, with their alphas made
 * relative to the intensity the caller supplies.
 */
export function bakeSheen(radius: number): BakedSprite | null {
  const size = Math.max(2, Math.ceil(radius * 2));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  if (!g) return null;
  // The reference's line runs from the disc's top-left to a little past three o'clock.
  const sheen = g.createLinearGradient(0, 0, radius * 1.3, radius * 1.55);
  sheen.addColorStop(0, "rgba(255,246,225,0)");
  sheen.addColorStop(0.2, "rgba(255,246,225,1)");
  sheen.addColorStop(0.36, "rgba(255,255,255,0)");
  sheen.addColorStop(0.68, "rgba(255,255,255,0)");
  sheen.addColorStop(0.85, "rgba(255,246,225,0.7)");
  sheen.addColorStop(1, "rgba(255,246,225,0)");
  g.fillStyle = sheen;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = "destination-in";
  g.beginPath();
  g.arc(radius, radius, radius, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = "source-over";
  return { canvas, size };
}
