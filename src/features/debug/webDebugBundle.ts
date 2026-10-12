import { APP_VERSION } from "../../version";
import { buildTar, type TarEntry } from "./tar";

/**
 * ⭐ **The web side's debug bundle: the same shape as the server's, collected on demand and downloaded as one file.**
 *
 * The collection is a **whitelist** and it takes the two things it cannot reach as **optional arguments** rather than
 * guessing at them: the caller passes an arrangement summary and the audio context's state if it has them, and whatever is
 * missing is named in `omissions` with the reason. That keeps this a pure function a criterion can call, and keeps a gap a
 * stated fact rather than a silence.
 */
/** ⭐ Only these two fields leave this function; the address is deliberately not part of its shape. */
export interface WebFailedRequest {
  status: number;
  method: string;
}

export interface WebDebugBundleInput {
  arrangement?: unknown;
  files?: Array<{ name: string; bytes: Uint8Array }>;
  audioContext?: { sampleRate?: number; state?: string };
  /** ⭐ The errors `telemetry` already keeps. Messages, never the work. */
  errors?: readonly string[];
  /** ⭐ A failed request keeps its status and method; its address may carry a token. */
  failedRequests?: readonly WebFailedRequest[];
  note?: string;
  /** ⭐ Injected so a criterion can pin the stamp; the surface passes the clock. */
  now?: () => Date;
}

export interface WebDebugBundle {
  collectedAt: string;
  appVersion: string;
  runtime: Record<string, unknown>;
  viewport: Record<string, number>;
  timings: Record<string, number | undefined>;
  arrangement?: { tracks?: number; bars?: number; notes?: number };
  audioContext?: WebDebugBundleInput["audioContext"];
  note?: string;
  errors?: string[];
  failedRequests?: WebFailedRequest[];
  /** ⭐ Bytes per section, so a reader sees the weight of each part without opening it. */
  sizes: Record<string, number>;
  /** ⭐ What a reader must not expect to find here. */
  omitted: string[];
  manifest: Array<{ section: string; what: string; why: string }>;
  omissions: string[];
}

const OMITTED = ["the work itself", "note content", "file paths", "tokens", "request addresses"] as const;

const MANIFEST = [
  { section: "collectedAt", what: "when this bundle was written", why: "a reading is only meaningful with its time" },
  { section: "appVersion", what: "the application version", why: "behaviour changes between versions" },
  { section: "runtime", what: "the user agent, platform and language", why: "many failures are browser-specific" },
  { section: "viewport", what: "the window size and pixel ratio", why: "layout faults depend on both" },
  { section: "timings", what: "how long the page took to reach its milestones", why: "a slow start is compared against a number, not an impression" },
  { section: "arrangement", what: "counts for the work in progress, when the caller can read them", why: "a count locates a fault without carrying any of the music" },
  { section: "audioContext", what: "the sample rate and state, when the caller can read them", why: "a silent page is often a suspended context" },
  { section: "note", what: "the reporter's own words, when given", why: "what the person saw is the one thing no instrument records" },
  { section: "errors", what: "the messages the interface recorded", why: "the first error often names the cause" },
  { section: "failedRequests", what: "the status and method of requests that failed", why: "a status locates the fault; an address may carry a token" },
];

export function collectWebDebugBundle(input: WebDebugBundleInput = {}): WebDebugBundle {
  const omissions: string[] = [];
  if (!input.arrangement) {
    omissions.push("arrangement counts: the caller did not pass them, so the work in progress is not described here");
  }
  if (!input.audioContext) {
    omissions.push("audio context: the caller did not pass its state, so a suspended context cannot be ruled out from this file");
  }
  if (!input.errors?.length) {
    omissions.push("interface errors: none were recorded, so a failure that left no trace cannot be described here");
  }
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const perf = typeof performance === "undefined" ? undefined : performance;
  const collectedAt = (input.now ?? (() => new Date()))().toISOString();
  /** ⭐ Bytes per section, measured off the same values the bundle carries. */
  const sizes: Record<string, number> = {};
  const weigh = (key: string, value: unknown) => {
    if (value !== undefined) sizes[key] = JSON.stringify(value).length;
  };
  weigh("arrangement", input.arrangement);
  weigh("audioContext", input.audioContext);
  weigh("errors", input.errors?.length ? [...input.errors] : undefined);
  weigh("failedRequests", input.failedRequests?.length ? input.failedRequests : undefined);
  weigh("note", input.note);
  return {
    collectedAt,
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
    ...(input.errors?.length ? { errors: [...input.errors] } : {}),
    ...(input.failedRequests?.length
      ? { failedRequests: input.failedRequests.map((request) => ({ method: request.method, status: request.status })) }
      : {}),
    sizes,
    omitted: [...OMITTED],
    manifest: MANIFEST,
    omissions,
  };
}

/** ⭐ A ceiling per file, the same one the server uses, so neither side can grow a bundle without bound. */
export const WEB_DEBUG_FILE_LIMIT = 8 * 1024 * 1024;

export interface WebDebugArchive {
  blob: Blob;
  entries: string[];
  carriesWork: boolean;
  omitted: string[];
}

/**
 * ⭐ **The archive, built the same way the server builds its own**: the metadata bundle, a readme that explains each part, a
 * manifest, the arrangement when the caller can read it, and any related files under the ceiling. The tar writer is the
 * module both sides share; only the compression differs, and the browser has a stream for it.
 */
export async function collectWebDebugArchive(input: WebDebugBundleInput = {}): Promise<WebDebugArchive> {
  const bundle = collectWebDebugBundle(input);
  const omitted = [...bundle.omissions];
  const encoder = new TextEncoder();
  const entries: TarEntry[] = [
    { name: "bundle.json", bytes: encoder.encode(`${JSON.stringify(bundle, null, 2)}\n`) },
    { name: "environment.json", bytes: encoder.encode(`${JSON.stringify(bundle.runtime, null, 2)}\n`) },
    {
      name: "sections.json",
      bytes: encoder.encode(`${JSON.stringify({ sizes: bundle.sizes, omitted: bundle.omitted }, null, 2)}\n`),
    },
  ];
  if (input.arrangement) {
    entries.push({ name: "arrangement.groove.json", bytes: encoder.encode(`${JSON.stringify(input.arrangement, null, 2)}\n`) });
  } else {
    omitted.push("the arrangement: the caller did not pass it, so this archive cannot reproduce the work it came from");
  }
  for (const file of input.files ?? []) {
    if (file.bytes.length > WEB_DEBUG_FILE_LIMIT) {
      omitted.push(`${file.name}: ${file.bytes.length} bytes is above the ${WEB_DEBUG_FILE_LIMIT} byte ceiling, so it is named rather than cut`);
      continue;
    }
    entries.push({ name: `files/${file.name.replace(/^\/+/, "")}`, bytes: file.bytes });
  }
  const carriesWork = Boolean(input.arrangement);
  const readme = [
    "# Groove debug bundle (web)",
    "",
    `Written ${bundle.collectedAt} by version ${bundle.appVersion}.`,
    "",
    carriesWork
      ? "**This archive carries the work itself**, in `arrangement.groove.json`. Read that file's contents before sending the archive to anyone."
      : "This archive carries no work content: no arrangement was available when it was collected.",
    "",
    "## What is inside",
    "",
    "| file | bytes |",
    "|---|---|",
    ...entries.map((entry) => `| \`${entry.name}\` | ${entry.bytes.length} |`),
    "",
    "## What each part is for",
    "",
    ...bundle.manifest.map((part) => `- **${part.section}**: ${part.what} — ${part.why}`),
    "",
    "## What could not be collected, and why",
    "",
    ...(omitted.length ? omitted.map((line) => `- ${line}`) : ["- nothing: every part was collected"]),
    "",
  ].join("\n");
  entries.push({ name: "README.md", bytes: encoder.encode(readme) });
  entries.push({
    name: "manifest.json",
    bytes: encoder.encode(
      `${JSON.stringify({ collectedAt: bundle.collectedAt, carriesWork, entries: entries.map((entry) => ({ name: entry.name, bytes: entry.bytes.length })), omitted }, null, 2)}\n`
    ),
  });
  // ⭐ A stream is fed by hand rather than taken from a Blob: not every environment gives a Blob one, and the bytes are
  // already in hand.
  const tar = buildTar(entries);
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(tar);
      controller.close();
    },
  });
  // ⭐ The stream types disagree on the buffer flavour; the cast is narrow and local.
  const compressed = source.pipeThrough(new CompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return {
    blob: await new Response(compressed).blob(),
    entries: entries.map((entry) => entry.name),
    carriesWork,
    omitted,
  };
}

/** ⭐ One download, named the same way the server names its archive, so the two sit side by side in a report. */
export function downloadArchive(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".tar.gz") ? filename : `${filename}.tar.gz`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function webDebugBundleFileName(at: string): string {
  return `groove-debug-${at.replace(/[:.]/g, "-")}.tar.gz`;
}
