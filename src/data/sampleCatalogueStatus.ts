/**
 * Why there is no sound — turned into sentences, because the four reasons look identical from outside.
 *
 * This exists because of what a real deployment showed: `GET /samples/manifest.json` answered **200 with `text/html`** — the SPA fallback — so the app received HTML where it expected JSON. A
 * user sees "no sound"; a log sees "manifest: not valid JSON"; and the actual cause was a stale deploy. Those are three different truths about one symptom, and only one of them is actionable.
 *
 * So the phases are chosen to be **distinguishable**, not merely descriptive:
 *
 *   * `unconfigured` — no mirror root at all, which is the shipped state and not a fault;
 *   * `loading` — configured, fetched, not finished;
 *   * `failed` — configured and the fetch or parse did not work, with the reasons;
 *   * `ready` — configured and at least one asset resolved;
 *   * `empty` — configured, the manifest parsed, and it yielded nothing resolvable, which is a different problem from a broken manifest.
 *
 * `empty` and `failed` are the pair most worth separating: "the library has no instruments" and "the library could not be read" send a composer to different actions.
 */
export interface CatalogueStatusInput {
  /** Whether a mirror root is configured at all. */
  configured: boolean;
  loading: boolean;
  ready: boolean;
  problems: readonly string[];
  assetCount: number;
}

export type CataloguePhase = "unconfigured" | "loading" | "failed" | "empty" | "ready";

export interface CatalogueStatus {
  phase: CataloguePhase;
  /** One sentence for the interface, in the user's terms rather than the code's. */
  summary: string;
  /** The named problems, kept as they are: they already say which entry and which file. */
  detail: string[];
}

export function describeCatalogueStatus(input: CatalogueStatusInput): CatalogueStatus {
  const detail = [...input.problems];

  if (!input.configured) {
    return { phase: "unconfigured", summary: "No sample mirror is configured, so songs play their synthesised tracks only.", detail };
  }
  if (input.loading) {
    return { phase: "loading", summary: "Loading the sample catalogue…", detail };
  }
  if (input.ready && input.assetCount > 0) {
    return { phase: "ready", summary: `Sample catalogue ready — ${input.assetCount} instrument${input.assetCount === 1 ? "" : "s"} available.`, detail };
  }
  if (input.ready && input.assetCount === 0) {
    return { phase: "empty", summary: "The sample catalogue loaded but described no usable instruments.", detail };
  }

  /**
   * Not configured to be anything but broken, so the message names the one cause that looks like success from the outside.
   *
   * A manifest served as HTML is what a single-page-app fallback returns for a path that does not exist, so the deploy is stale rather than the manifest being wrong — and saying so is the
   * difference between someone re-running a deploy and someone editing a file that was already correct.
   */
  const html = input.problems.some((problem) => /not valid JSON|Unexpected token\s*</i.test(problem));
  return {
    phase: "failed",
    summary: html
      ? "The sample manifest came back as a web page rather than data — usually a stale deployment, not a broken manifest."
      : "The sample catalogue could not be loaded, so sample-based tracks will stay silent.",
    detail,
  };
}

/**
 * The status of a runtime, in the shape this module describes — so a caller does not have to remember which fields to pass.
 *
 * Structural rather than importing the runtime type: the status module has no business depending on how the catalogue is fetched, and a cycle between the two would be a real risk once a UI
 * imports both.
 */
export function describeRuntimeStatus(runtime: {
  configured: boolean;
  loading: boolean;
  ready: boolean;
  problems: readonly string[];
  assets: readonly unknown[];
}): CatalogueStatus {
  return describeCatalogueStatus({
    configured: runtime.configured,
    loading: runtime.loading,
    ready: runtime.ready,
    problems: runtime.problems,
    assetCount: runtime.assets.length,
  });
}
