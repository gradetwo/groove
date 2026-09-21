/**
 * Resolve the active skin's painting palette for a kick visualiser.
 *
 * The kick canvases cannot read CSS variables (see `src/utils/canvasPalette.ts` for why), so each
 * visualiser calls this hook with the canvas it paints on and the literals it painted with *before*
 * a skin could reach a canvas. The role -> token map is shared by all three, because the roles are
 * the instrument's semantics rather than one file's convenience:
 *
 *   signal     the trace, the bar, the shockwave         --m-gold    #f5b73d (desktop amber)
 *   signalLow  the faint end of a magnitude ramp          --m-gold    rgb(180, 80, 20) (desktop bronze)
 *   peak       the blown-out end of a ramp / the flash    --m-ink     #ffffff (desktop white)
 *   grid       the graticule and neutral readouts         --m-ink-3   #ffffff (drawn at low alpha)
 *   warning    the grit threshold shockwave               --m-red     #ff5555
 *   ground     the surface the trace is painted on        --m-bg      the painter's own near-black
 *
 * Two of those mappings are worth the sentence:
 *
 *  - **`peak` is `--m-ink`, not `--m-gold-hi`.** The role is "the most prominent tone on this
 *    surface", which is white on the dark skins and ink on the light ones — the same flip every
 *    other piece of text on the screen makes. `--m-gold-hi` is the accent's *decorative* tone and is
 *    deliberately the lower-contrast value on the light skins, so a flash painted with it would dim
 *    during a hit instead of blooming.
 *  - **`signalLow` shares `--m-gold`.** The desktop's faint anchor is a fixed bronze shadow of its
 *    gold; a skin publishes no dim companion to its accent, and borrowing `--m-ink-3` would inject a
 *    second hue into what is a single-hue magnitude ramp. So the faint end takes the accent itself on
 *    a skin, and the existing alpha ramp does the dimming. Only the desktop fallback stays bronze.
 *
 * Resolution happens on mount, on a `data-skin` change and on a window resize — never per frame. The
 * rAF loops only read `palette.current`, so a skin switch mid-animation lands on the next frame
 * without a re-render and without a per-frame `getComputedStyle`.
 */
import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { resolveCanvasColor, type CanvasColor } from "../../utils/canvasPalette";

/** The painting roles a kick canvas resolves. */
export interface CanvasPalette {
  /** The signal itself: the trace, the waterfall bar, the shockwave ring. */
  signal: CanvasColor;
  /** The faint end of a magnitude ramp. */
  signalLow: CanvasColor;
  /** The blown-out, highest-energy tone: a shock flash, the hottest waterfall cells. */
  peak: CanvasColor;
  /** The graticule, band markers and plain technical readouts. */
  grid: CanvasColor;
  /** The threshold / warning tone (the sequencer's grit shockwave). */
  warning: CanvasColor;
  /** The surface the trace sits on. */
  ground: CanvasColor;
}

export type CanvasPaletteRole = keyof CanvasPalette;

/** The desktop literals a visualiser painted with before a skin could reach its canvas. */
export type CanvasPaletteFallbacks = Record<CanvasPaletteRole, string>;

/** role -> the custom property that carries it. Every skin defines all six on `.mobile-root`. */
const ROLE_TOKENS: Record<CanvasPaletteRole, string> = {
  signal: "--m-gold",
  signalLow: "--m-gold",
  peak: "--m-ink",
  grid: "--m-ink-3",
  warning: "--m-red",
  ground: "--m-bg",
};

const ROLES = Object.keys(ROLE_TOKENS) as CanvasPaletteRole[];

/**
 * The desktop palette as literals — exactly what these canvases painted with before a skin could
 * reach them, and also the per-token fallback when an active skin omits a variable.
 *
 * A visualiser spreads this and overrides only what is genuinely its own: its ground, and the
 * waterfall's bronze low anchor. Every value here matches the literal it replaced, which is what
 * keeps the desktop app pixel-identical.
 */
export const DESKTOP_CANVAS_FALLBACKS: CanvasPaletteFallbacks = {
  signal: "#f5b73d", // the amber trace / bar / shockwave
  signalLow: "#f5b73d", // the waterfall overrides this with its bronze low anchor
  peak: "#ffffff", // the white overdrive flash / incandescent top
  grid: "#ffffff", // the graticule and neutral read-outs, always drawn at a low alpha
  warning: "#ff5555", // the grit threshold shockwave
  ground: "#030407", // the waterfall's near-black; the oscilloscope overrides its own #040508
};

/** Resolve every role: the token when it parses, the caller's literal otherwise. */
function readPalette(
  styles: CSSStyleDeclaration | null,
  fallbacks: CanvasPaletteFallbacks
): CanvasPalette {
  const palette = {} as CanvasPalette;
  for (const role of ROLES) {
    const token = styles ? styles.getPropertyValue(ROLE_TOKENS[role]) : "";
    palette[role] = resolveCanvasColor(token, fallbacks[role]);
  }
  return palette;
}

/**
 * The palette, as a ref the rAF loop can read.
 *
 * `canvasRef` is the canvas the component already paints on: the hook finds the nearest
 * `.mobile-root` from it, exactly as `VinylCanvas` does, and with no such ancestor — the desktop app
 * — every role stays on its fallback, so the desktop is pixel-identical.
 */
export function useCanvasPalette(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  fallbacks: CanvasPaletteFallbacks
): MutableRefObject<CanvasPalette> {
  /** The fallback before the first effect: the desktop palette, overwritten on mount when a skin applies. */
  const paletteRef = useRef<CanvasPalette>(readPalette(null, fallbacks));
  /**
   * The fallbacks live in a ref so a call site that passes an object literal cannot tear the observer
   * down on every render — the sequencer re-renders on every step, four times a beat.
   */
  const fallbacksRef = useRef(fallbacks);
  fallbacksRef.current = fallbacks;

  useEffect(() => {
    const canvas = canvasRef.current;
    const resolve = () => {
      const module = canvas?.closest(".mobile-root") ?? null;
      paletteRef.current = readPalette(
        module ? window.getComputedStyle(module) : null,
        fallbacksRef.current
      );
    };
    resolve();

    /**
     * A skin switch writes `data-skin` on `<html>` (`main.tsx` applies the stored skin before the
     * first paint), and that attribute is the only signal a skin changed. Re-resolving there is the
     * whole reason this is an observer rather than a one-shot read; `resize` covers a rotation or a
     * window change that re-lays the canvas out under the same palette.
     */
    const skinObserver =
      typeof MutationObserver === "undefined" ? null : new MutationObserver(resolve);
    skinObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-skin"],
    });
    window.addEventListener("resize", resolve);

    return () => {
      skinObserver?.disconnect();
      window.removeEventListener("resize", resolve);
    };
  }, [canvasRef]);

  return paletteRef;
}
