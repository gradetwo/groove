/**
 * ⭐ **The debug bundle a browser can make, collected from a whitelist and nothing else.**
 *
 * The server half writes one compressed archive beside its output; a browser cannot do that, so this half writes one
 * self-describing object and the surface downloads it as a single file. What matters is the same in both halves: the bundle
 * names what it carries, says the version and the moment, and **states what it left out** — a reader who cannot see the work
 * itself has to be told that is a choice rather than an accident.
 *
 * ⚠️ **The whitelist is the argument type.** Nothing here accepts notes, file paths, tokens or request URLs: a failed request
 * arrives with its status and its method, and the address is dropped at the door rather than filtered later.
 */
export interface WebFailedRequest {
  /** Only these two fields leave this function; the address is deliberately not part of its shape. */
  status: number;
  method: string;
}

export interface WebDebugBundleInput {
  appVersion: string;
  userAgent: string;
  /** Counts only: how much music is open, never what it says. */
  arrangement?: { trackCount: number; bars?: number; noteCount: number };
  errors?: readonly string[];
  failedRequests?: readonly WebFailedRequest[];
  timings?: Readonly<Record<string, number>>;
  audio?: { state: string; sampleRate: number };
  /** Injected so the criterion can pin the stamp; the surface passes the clock. */
  now?: () => Date;
}

export interface WebDebugBundle {
  manifest: {
    appVersion: string;
    generatedAt: string;
    userAgent: string;
    sections: Record<string, number>;
    /** ⭐ What a reader must not expect to find here. */
    omitted: string[];
    omissions: string[];
  };
  sections: Record<string, unknown>;
}

const OMITTED = ["the work itself", "note content", "file paths", "tokens", "request addresses"] as const;

export function collectWebDebugBundle(input: WebDebugBundleInput): WebDebugBundle {
  const at = (input.now ?? (() => new Date()))().toISOString();
  const sections: Record<string, unknown> = {};
  if (input.arrangement !== undefined) sections.arrangement = { ...input.arrangement };
  if (input.errors !== undefined) sections.errors = [...input.errors];
  if (input.failedRequests !== undefined) {
    sections.failedRequests = input.failedRequests.map((request) => ({ method: request.method, status: request.status }));
  }
  if (input.timings !== undefined) sections.timings = { ...input.timings };
  if (input.audio !== undefined) sections.audio = { ...input.audio };
  const sizes = Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, JSON.stringify(value).length]));
  return {
    manifest: {
      appVersion: input.appVersion,
      generatedAt: at,
      userAgent: input.userAgent,
      sections: sizes,
      omitted: [...OMITTED],
      omissions: [
        "the arrangement is reported as counts, because the music is the composer's",
        "a failed request keeps its status and method, because its address may carry a token",
      ],
    },
    sections,
  };
}

/**
 * ⭐ **The name the downloaded file carries**, built from the moment the bundle was made and nothing else.
 *
 * The server half names its archive `groove-debug-<stamp>.tar.gz`; this is the same rule for a browser download. The stamp is
 * an ISO instant, which contains colons and dots a file name should not carry, so they become dashes — and the criterion pins
 * that, because a name a filesystem rewrites is a name the reader cannot match against the reply.
 */
export function debugBundleFilename(generatedAt: string): string {
  return `groove-debug-${generatedAt.replace(/[:.]/g, "-")}.json`;
}

