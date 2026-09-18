import { useEffect, useState } from "react";

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
  /** The user asked the OS for less motion. Read here so JS motion can honour it too. */
  prefersReducedMotion: boolean;
}

/** Phone breakpoint. Matches the 640 px `sm:` boundary the Tailwind config already uses. */
export const PHONE_MAX_WIDTH_PX = 639;

/** Landscape phone: wider than the phone breakpoint but too short for the desktop chrome. */
export const PHONE_MAX_HEIGHT_PX = 480;

const QUERY_TOUCH = "(pointer: coarse)";
const QUERY_PHONE_WIDTH = `(max-width: ${PHONE_MAX_WIDTH_PX}px)`;
const QUERY_SHORT = `(max-height: ${PHONE_MAX_HEIGHT_PX}px)`;
const QUERY_LANDSCAPE = "(orientation: landscape)";
const QUERY_REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

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
