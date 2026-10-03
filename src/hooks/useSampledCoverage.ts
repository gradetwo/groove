/**
 * **The UI's one way to ask "what keys can this recording sound", answered by the engine and only when asked for.**
 *
 * The reading itself is {@link sampledKeyCoverage} in `src/features/sampledCoverage/sampledKeyCoverage.ts`; what this
 * hook owns is the three decisions a surface must not make for itself:
 *
 *   · **When to load.** The catalogue holds ~300 program assets and loading is a network read plus an `#include`
 *     expansion per asset, so a browser that fetched all of them on open would be a stampede. A caller **requests** an
 *     asset — the one it is on, or the one a person is pointing at — and everything else stays unknown.
 *   · **What "unknown" means.** Before a request answers, `coverageOf` is `undefined`; a surface must render that as
 *     "not loaded yet", never as a range. There is deliberately no default, no `0–127`, and no fallback table: a fake
 *     number here is the defect this whole change exists to remove.
 *   · **Single-flight and no failure memory.** Two rows asking for one asset share one read, and a failed read is
 *     dropped rather than remembered — the same two rules the loader's own caches state. A request that already
 *     started does not restart on every render, which is what stops a failed fetch from becoming a loop.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  sampledKeyCoverage,
  type CoverageAsset,
  type SampledKeyCoverage,
} from "../features/sampledCoverage/sampledKeyCoverage";
import {
  cachedProgramText,
  catalogueProgramText,
  type InstrumentAsset,
  type ProgramTextSource,
} from "../features/sampledCoverage/programText";
import type { SampleAsset } from "../data/sampleCatalogue";

/** Where one asset's coverage reading stands. */
export type SampledCoverageStatus = "idle" | "loading" | "ready" | "failed";

export interface SampledCoverageEntry {
  status: SampledCoverageStatus;
  /**
   * The engine's answer, present only when `status === "ready"`.
   *
   * `null` is a real answer — the program loaded and **no** key sounds (every region gated, released or off-trigger) —
   * and it is different from `undefined`, which means "nothing has been loaded yet". A surface that renders both as
   * "no range" would be hiding the engine's refusal behind its own absence of knowledge.
   */
  coverage?: SampledKeyCoverage | null;
  /** The expanded program, once loaded — so a caller can ask the engine about a lane's own written notes. */
  program?: string;
  /** Why the read failed, when it did. Never a substitute range. */
  reason?: string;
  /**
   * True when the failure was **"the catalogue in hand does not carry this asset"** rather than a read that failed.
   *
   * The catalogue arrives asynchronously, so a panel can be open on a lane before its asset is in hand — and that answer
   * must not be permanent. Only this failure is retried when the address book grows; a fetch that really failed stays
   * where it is, so a broken address cannot become a request loop.
   */
  unloaded?: boolean;
}

export interface SampledCoverageLookup {
  statusOf(assetId: string | undefined): SampledCoverageStatus;
  coverageOf(assetId: string | undefined): SampledKeyCoverage | null | undefined;
  programOf(assetId: string | undefined): string | undefined;
  reasonOf(assetId: string | undefined): string | undefined;
  /** Ask for an asset's program. Idempotent per asset: a second call before the first answers does nothing. */
  request(assetId: string | undefined): void;
}

export interface UseSampledCoverageOptions {
  /**
   * How program text is obtained. Defaults to the catalogue's own address rule over `expandRemoteIncludes`
   * (`src/features/sampledCoverage/programText.ts`); a criterion injects fixture text through it.
   */
  programText?: ProgramTextSource;
}

/** One default source for the whole session, so the fetch cache is not rebuilt per component. */
const defaultProgramText = cachedProgramText(catalogueProgramText());

export function useSampledCoverage(
  assets: readonly SampleAsset[],
  options: UseSampledCoverageOptions = {}
): SampledCoverageLookup {
  const entries = useRef(new Map<string, SampledCoverageEntry>());
  const [, bump] = useState(0);
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  /**
   * The cached source for the injected reader. Keyed on the prop's identity, because wrapping the prop again on every
   * render would give every render a fresh cache and turn one read into one read per frame.
   */
  const sourceRef = useRef<{ source: ProgramTextSource | undefined; cached: ProgramTextSource } | undefined>(undefined);
  if (sourceRef.current === undefined || sourceRef.current.source !== options.programText) {
    sourceRef.current = {
      source: options.programText,
      cached: options.programText === undefined ? defaultProgramText : cachedProgramText(options.programText),
    };
    /**
     * A reading is only valid for the source that produced it, so a new reader invalidates every entry. Without this,
     * a criterion that swaps its fixture program would keep reading the old fixture's range — which is precisely the
     * "displayed range does not follow the regions" failure this hook's criteria exist to catch.
     */
    entries.current.clear();
  }

  const request = useCallback((assetId: string | undefined) => {
    if (assetId === undefined) return;
    const existing = entries.current.get(assetId);
    const asset = assetsRef.current.find((candidate) => candidate.assetId === assetId);
    /**
     * A **completed** read is never repeated, and a **real failure** is not either. The one exception is the catalogue's
     * own gap: the asset was not in hand when asked, and it is now — so the question is worth asking again. Without this
     * a panel opened before the manifest arrived would say "音域读取失败" for the rest of the session.
     */
    if (existing && !(existing.unloaded === true && asset?.sfz)) return;
    if (!asset) {
      // Named as the catalogue's own gap, because that is a different problem from a plain sample: one is "this mirror
      // does not carry it", the other is "this entry is not an instrument".
      entries.current.set(assetId, {
        status: "failed",
        reason: `no sample "${assetId}" in this catalogue`,
        unloaded: true,
      });
      bump((value) => value + 1);
      return;
    }
    if (!asset.sfz) {
      // Not an instrument, so a note cannot select a sample from it: said plainly rather than left "loading" forever.
      entries.current.set(assetId, {
        status: "failed",
        reason: `sample "${assetId}" is not an instrument (it has no sfz)`,
      });
      bump((value) => value + 1);
      return;
    }
    entries.current.set(assetId, { status: "loading" });
    bump((value) => value + 1);
    const source = sourceRef.current!.cached;
    source(asset as InstrumentAsset)
      .then((text) => {
        entries.current.set(assetId, {
          status: "ready",
          coverage: sampledKeyCoverage(asset as CoverageAsset, text),
          program: text,
        });
        bump((value) => value + 1);
      })
      .catch((error: unknown) => {
        entries.current.set(assetId, {
          status: "failed",
          reason: error instanceof Error ? error.message : String(error),
        });
        bump((value) => value + 1);
      });
  }, []);

  return useMemo<SampledCoverageLookup>(
    () => ({
      statusOf: (assetId) => (assetId === undefined ? "idle" : entries.current.get(assetId)?.status ?? "idle"),
      coverageOf: (assetId) => (assetId === undefined ? undefined : entries.current.get(assetId)?.coverage),
      programOf: (assetId) => (assetId === undefined ? undefined : entries.current.get(assetId)?.program),
      reasonOf: (assetId) => (assetId === undefined ? undefined : entries.current.get(assetId)?.reason),
      request,
    }),
    // The reader's identity is a dependency so that swapping it re-runs a caller's request effect against the new one.
    [request, options.programText]
  );
}
