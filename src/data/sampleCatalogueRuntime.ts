/**
 * The catalogue, fetched at runtime from the mirror — the piece that turns a manifest in the repository into assets the player can resolve.
 *
 * Until now the catalogue was a constant that shipped **empty** and the three consumers (the loader, the lane planner, the lane scheduler) defaulted to it. That was deliberate: the
 * slice was read-only and nothing in the app called it. This module is the first half of wiring it up — fetch, parse, cache — and it keeps the same discipline the sample loader
 * already uses:
 *
 *   * **single-flight**: two callers asking at once share one fetch, because a manifest is not worth downloading twice;
 *   * **failure is not cached**: a network failure is reported and the next attempt tries again, because caching a failure turns a transient outage into a permanent one;
 *   * **never throws for a bad manifest**: problems are returned alongside whatever assets could be resolved, so a partly-broken manifest still plays what it can.
 *
 * A root that is empty or absent leaves the catalogue empty, which is exactly today's behaviour — so wiring this in cannot change anything until a root is configured.
 */
import type { SampleAsset } from "./sampleCatalogue";
import { catalogueFromManifestText } from "./sampleCatalogue";

export interface CatalogueRuntime {
  /** The assets resolved so far — empty until `load` succeeds. */
  assets: readonly SampleAsset[];
  /** Everything that went wrong, named by entry and file. */
  problems: readonly string[];
  /** True once a load has completed successfully; the UI uses this rather than guessing. */
  ready: boolean;
  load(): Promise<{ assets: SampleAsset[]; problems: string[] }>;
}

export interface CatalogueRuntimeOptions {
  /** Where the mirror lives, e.g. `https://samples.example/groove`. Empty means the catalogue stays empty. */
  root?: string;
  /** Where the manifest lives. Defaults to the copy this repository ships. */
  manifestUrl?: string;
  fetchImpl?: (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
}

export function createCatalogueRuntime(options: CatalogueRuntimeOptions = {}): CatalogueRuntime {
  const root = options.root ?? "";
  const manifestUrl = options.manifestUrl ?? "/samples/manifest.json";
  const fetchImpl = options.fetchImpl ?? ((url: string) => fetch(url));

  let assets: SampleAsset[] = [];
  let problems: string[] = [];
  let ready = false;
  let inFlight: Promise<{ assets: SampleAsset[]; problems: string[] }> | null = null;

  const load = async () => {
    // No root means no mirror to resolve against, so the honest answer is an empty catalogue rather than a fetch that cannot work.
    if (!root) return { assets: [], problems: [] };
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const response = await fetchImpl(manifestUrl);
        if (!response.ok) {
          // Reported, and **not** cached: a 404 from a mistyped root must not become permanent.
          problems = [`manifest: ${response.status} from ${manifestUrl}`];
          return { assets: [], problems: [...problems] };
        }
        const parsed = catalogueFromManifestText(await response.text(), root);
        assets = parsed.assets;
        problems = parsed.problems;
        ready = true;
        return { assets: parsed.assets, problems: parsed.problems };
      } catch (error) {
        problems = [`manifest: ${error && (error as Error).message ? (error as Error).message : String(error)}`];
        return { assets: [], problems: [...problems] };
      } finally {
        // Cleared whether it succeeded or failed, which is what makes a retry possible.
        inFlight = null;
      }
    })();

    return inFlight;
  };

  return {
    get assets() {
      return assets;
    },
    get problems() {
      return problems;
    },
    get ready() {
      return ready;
    },
    load,
  };
}

/**
 * The application's one catalogue runtime.
 *
 * One instance rather than one per caller: the manifest is fetched once per session, and the engine, the offline render and any future UI must all see the **same** assets — otherwise one
 * of them resolves an instrument while another reports it missing, which is the "two places, one thing" failure this workstream has hit five times.
 *
 * The root comes from `VITE_SAMPLE_ROOT` and **defaults to empty**, which is the state the runtime treats as "no mirror configured": it fetches nothing and the catalogue stays empty.
 * That is what makes wiring this into the engine a change that cannot alter behaviour until a mirror is configured and populated.
 */
export const appCatalogueRuntime = createCatalogueRuntime({
  root: typeof import.meta !== "undefined" && import.meta.env ? String(import.meta.env.VITE_SAMPLE_ROOT ?? "") : "",
});
