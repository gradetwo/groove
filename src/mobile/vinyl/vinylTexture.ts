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
  g.font = `700 ${45 * scale}px "Space Grotesk", sans-serif`;
  g.fillText(spec.title.slice(0, 12), radius, 152 * scale);
  letterSpacing(`${5 * scale}px`);
  g.font = `500 ${21 * scale}px "Space Grotesk", "PingFang SC", sans-serif`;
  g.globalAlpha = 0.72;
  g.fillText(spec.subtitle.split(" ·")[0].slice(0, 14), radius, 186 * scale);
  g.globalAlpha = 1;
  letterSpacing(`${4 * scale}px`);
  g.font = `500 ${15 * scale}px "JetBrains Mono", monospace`;
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
  return [spec.title, spec.subtitle, spec.footer, spec.art.shape, spec.accent, lanes].join("~");
}

/** The instrument colours as `r,g,b` strings, for the ring strokes and the label wash. */
export const LAYER_RGB_STRINGS: Record<LayerKey, string> = {
  kick: LAYER_COLORS.kick.str,
  snare: LAYER_COLORS.snare.str,
  hat: LAYER_COLORS.hat.str,
  bass: LAYER_COLORS.bass.str,
};
