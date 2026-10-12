/**
 * The types for `scripts/measure_live_perf.mjs`, which is plain JavaScript because its other caller is
 * the shell (`npm run perf:check`). `src/test/perfHarness.test.ts` imports the real module — one
 * implementation, both callers, no drift between what the criterion proves and what the gate runs —
 * so the shape it returns is declared here rather than asserted with `as` in the test.
 */
export interface PerfProfile {
  name: string;
  /** The page this profile measures: `/` for the desktop, `/m` for the phone shell. */
  path: string;
  viewport: { width: number; height: number };
  mobile: boolean;
  cpu: number;
  network: { download: number; upload: number; latency: number } | null;
}

export interface PerfResult {
  profile: string;
  path: string;
  landedPath: string;
  fcp: number | null;
  fcpFallback: boolean;
  lcp: number | null;
  cls: number;
  dcl: number | null;
  load: number | null;
  wallMs: number;
  jsKb: number;
  cssKb: number;
  imageKb: number;
  totalTransferredKb: number;
  resources: number;
  genreChunksOnLoad: number;
  genreChunkNames: string[];
}

export interface PerfFailure {
  profile: string;
  error: string;
}

export interface PerfRunSummary {
  ok: boolean;
  lines: string[];
  problems: string[];
}

export interface PerfRun {
  results: PerfResult[];
  failures: PerfFailure[];
  summary: PerfRunSummary;
}

export declare const PROFILES: PerfProfile[];
export declare function countGenreChunks(urls: string[]): string[];
export declare function profileTargetUrl(base: string, profile: PerfProfile): string;
export declare function measure(browser: unknown, profile: PerfProfile, base: string): Promise<PerfResult>;
export declare function fmt(ms: number | null | undefined): string;
export declare function kb(bytes: number): string;
export declare function summarizeRun(results: PerfResult[], failures: PerfFailure[], maxChunks: number): PerfRunSummary;
export declare function run(options: {
  browser: unknown;
  base: string;
  profiles?: PerfProfile[];
  maxChunks?: number;
}): Promise<PerfRun>;
export declare function main(): Promise<number>;
