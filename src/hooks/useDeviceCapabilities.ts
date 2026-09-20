import { useEffect, useState } from "react";
import { PHONE_MAX_HEIGHT_PX, PHONE_MAX_WIDTH_PX } from "../platform/layoutTokens";

/**
 * One source of truth for "what kind of device is this".
 *
 * The app has been responding to viewport width in a dozen places and to touch in a couple of
 * others, which is how a layout ends up in a state nobody designed: a 390 px window on a desktop
 * gets phone styling, and a tablet in landscape gets the desktop editor on a touchscreen. Mobile
 * behaviour here is a *capability* decision (there is a finger, the screen is small, the browser
 * has native gestures we cannot override), so it is read once, from the platform, and shared.
 *
 * Deliberately not detected: "is this an iPhone". User-agent sniffing is the thing that makes a
 * browser-specific branch rot the moment a new device ships; `pointer: coarse` plus a width
 * breakpoint describes the constraint instead of the product.
 */
export interface DeviceCapabilities {
  /** Primary input is a finger. Also true for a touchscreen laptop, which still needs big targets. */
  isTouch: boolean;
  /** A phone-sized viewport — the layout where the desktop editor is replaced rather than shrunk. */
  isPhone: boolean;
  /** Coarse pointer AND a small viewport: the population the phone UI is actually for. */
  isMobile: boolean;
  /** Viewport is currently in landscape (phones rotate; the layout has to follow). */
  isLandscape: boolean;
  /**
   * A phone held sideways: the shape with the least vertical room and therefore the one that can
   * least afford two stacked bars.
   *
   * Separate from `isPhone` on purpose. `isPhone` is also true in portrait, where the two bars cost
   * 17 % of the viewport; here they cost 29 %, so the landscape shell has to make a different
   * trade rather than inherit the portrait one.
   */
  isShortLandscape: boolean;
  /** The user asked the OS for less motion. Read here so JS motion can honour it too. */
  prefersReducedMotion: boolean;
}

/**
 * The phone boundaries live in `src/platform/layoutTokens.ts`, because the stylesheet needs the same
 * numbers (a media query cannot read a custom property) and `scripts/layout_tokens.mjs` writes them
 * into `src/index.css`. Imported here for the queries below and re-exported, so a surface still asks
 * the hook "what kind of device is this?" rather than reaching into the tokens itself.
 */
export { PHONE_MAX_HEIGHT_PX, PHONE_MAX_WIDTH_PX };

const QUERY_TOUCH = "(pointer: coarse)";
const QUERY_PHONE_WIDTH = `(max-width: ${PHONE_MAX_WIDTH_PX}px)`;
const QUERY_SHORT = `(max-height: ${PHONE_MAX_HEIGHT_PX}px)`;
const QUERY_LANDSCAPE = "(orientation: landscape)";
const QUERY_REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * The queries this hook listens to, exported so a test can assert they are *built from* the tokens
 * rather than typed out again. The cross-language half — that `src/index.css` uses the same numbers —
 * belongs to `scripts/layout_tokens.mjs` and `check:layout`.
 */
export const DEVICE_QUERIES = {
  touch: QUERY_TOUCH,
  phoneWidth: QUERY_PHONE_WIDTH,
  short: QUERY_SHORT,
  landscape: QUERY_LANDSCAPE,
  reducedMotion: QUERY_REDUCED_MOTION,
} as const;

/**
 * Pure classification, so the decision is testable without a browser.
 *
 * A landscape phone is wider than 639 px, so width alone would call it a tablet and hand it the
 * desktop sequencer — which is exactly the case where the toolbar eats the screen. Height is
 * therefore part of the phone test.
 */
export function classifyDevice(input: {
  touch: boolean;
  phoneWidth: boolean;
  shortViewport: boolean;
  landscape: boolean;
  reducedMotion: boolean;
}): DeviceCapabilities {
  const isPhone = input.phoneWidth || (input.touch && input.landscape && input.shortViewport);
  return {
    isTouch: input.touch,
    isPhone,
    isMobile: input.touch && isPhone,
    isLandscape: input.landscape,
    isShortLandscape: input.landscape && input.shortViewport,
    prefersReducedMotion: input.reducedMotion,
  };
}

function readCapabilities(): DeviceCapabilities {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    // Server/SSR and the jsdom default: the desktop layout is the safe assumption because it is
    // the superset — nothing is hidden, so nothing is unreachable.
    return classifyDevice({
      touch: false,
      phoneWidth: false,
      shortViewport: false,
      landscape: false,
      reducedMotion: false,
    });
  }
  const matches = (query: string) => window.matchMedia(query).matches;
  return classifyDevice({
    // `hover: none` alongside `pointer: coarse` excludes a hybrid laptop whose coarse pointer is
    // reported opportunistically while a mouse is the actual input.
    touch: matches(QUERY_TOUCH) || matches("(hover: none)"),
    phoneWidth: matches(QUERY_PHONE_WIDTH),
    shortViewport: matches(QUERY_SHORT),
    landscape: matches(QUERY_LANDSCAPE),
    reducedMotion: matches(QUERY_REDUCED_MOTION),
  });
}

/**
 * Live device capabilities. Re-reads on rotate/resize, because a phone changes category when it
 * turns over and the layout has to follow without a reload.
 */
export function useDeviceCapabilities(): DeviceCapabilities {
  const [caps, setCaps] = useState<DeviceCapabilities>(() => readCapabilities());

  useEffect(() => {
    /**
     * `matchMedia` is optional, and not only in theory: jsdom does not implement it, and suites
     * that stub `window` wholesale (rather than spreading the real one) drop it entirely. A hook
     * that throws on a runtime API it merely *prefers* would take the whole view down, so the
     * effect degrades to a `resize`-only listener rather than assuming the richer API exists.
     */
    if (typeof window.matchMedia !== "function") {
      const update = () => setCaps(readCapabilities());
      window.addEventListener("resize", update);
      window.addEventListener("orientationchange", update);
      return () => {
        window.removeEventListener("resize", update);
        window.removeEventListener("orientationchange", update);
      };
    }
    const queries = [
      QUERY_TOUCH,
      "(hover: none)",
      QUERY_PHONE_WIDTH,
      QUERY_SHORT,
      QUERY_LANDSCAPE,
      QUERY_REDUCED_MOTION,
    ].map((q) => window.matchMedia(q));
    const update = () => setCaps(readCapabilities());
    // `matchMedia` change events are the reliable signal for orientation and breakpoints; the
    // resize listener is a belt-and-braces for browsers that do not fire them for a rotation.
    queries.forEach((q) => q.addEventListener?.("change", update));
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    update();
    return () => {
      queries.forEach((q) => q.removeEventListener?.("change", update));
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return caps;
}
