import { APP_VERSION } from "../../version";

/**
 * ⭐ **The web side's debug bundle: the same shape as the server's, collected on demand and downloaded as one file.**
 *
 * The collection is a **whitelist** and it takes the two things it cannot reach as **optional arguments** rather than
 * guessing at them: the caller passes an arrangement summary and the audio context's state if it has them, and whatever is
 * missing is named in `omissions` with the reason. That keeps this a pure function a criterion can call, and keeps a gap a
 * stated fact rather than a silence.
 */
export interface WebDebugBundleInput {
  arrangement?: { tracks?: number; bars?: number; notes?: number };
  audioContext?: { sampleRate?: number; state?: string };
  note?: string;
}

export interface WebDebugBundle {
  collectedAt: string;
  appVersion: string;
  runtime: Record<string, unknown>;
  viewport: Record<string, number>;
  timings: Record<string, number | undefined>;
  arrangement?: WebDebugBundleInput["arrangement"];
  audioContext?: WebDebugBundleInput["audioContext"];
  note?: string;
  manifest: Array<{ section: string; what: string; why: string }>;
  omissions: string[];
}

const MANIFEST = [
  { section: "collectedAt", what: "when this bundle was written", why: "a reading is only meaningful with its time" },
  { section: "appVersion", what: "the application version", why: "behaviour changes between versions" },
  { section: "runtime", what: "the user agent, platform and language", why: "many failures are browser-specific" },
  { section: "viewport", what: "the window size and pixel ratio", why: "layout faults depend on both" },
  { section: "timings", what: "how long the page took to reach its milestones", why: "a slow start is compared against a number, not an impression" },
  { section: "arrangement", what: "counts for the work in progress, when the caller can read them", why: "a count locates a fault without carrying any of the music" },
  { section: "audioContext", what: "the sample rate and state, when the caller can read them", why: "a silent page is often a suspended context" },
  { section: "note", what: "the reporter's own words, when given", why: "what the person saw is the one thing no instrument records" },
];

export function collectWebDebugBundle(input: WebDebugBundleInput = {}): WebDebugBundle {
  const omissions: string[] = [];
  if (!input.arrangement) {
    omissions.push("arrangement counts: the caller did not pass them, so the work in progress is not described here");
  }
  if (!input.audioContext) {
    omissions.push("audio context: the caller did not pass its state, so a suspended context cannot be ruled out from this file");
  }
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const perf = typeof performance === "undefined" ? undefined : performance;
  return {
    collectedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    runtime: {
      userAgent: nav?.userAgent ?? "unavailable",
      platform: nav?.platform ?? "unavailable",
      language: nav?.language ?? "unavailable",
      online: nav?.onLine ?? "unavailable",
    },
    viewport: {
      width: typeof window === "undefined" ? 0 : window.innerWidth,
      height: typeof window === "undefined" ? 0 : window.innerHeight,
      devicePixelRatio: typeof window === "undefined" ? 0 : window.devicePixelRatio,
    },
    timings: {
      timeOriginMs: perf?.timeOrigin,
      nowMs: perf?.now(),
      domContentLoadedMs: perf?.getEntriesByName?.("DOMContentLoaded")?.[0]?.startTime,
      loadMs: perf?.getEntriesByName?.("load")?.[0]?.startTime,
    },
    ...(input.arrangement ? { arrangement: input.arrangement } : {}),
    ...(input.audioContext ? { audioContext: input.audioContext } : {}),
    ...(input.note ? { note: input.note } : {}),
    manifest: MANIFEST,
    omissions,
  };
}

/**
 * ⭐ **One file, downloaded, named the same way the server names its bundle**, so the two can sit side by side in a report.
 */
export function downloadJsonFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function webDebugBundleFileName(at: string): string {
  return `groove-debug-${at.replace(/[:.]/g, "-")}.json`;
}
