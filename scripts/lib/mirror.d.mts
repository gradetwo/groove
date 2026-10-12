/** Types for the mirror step, so a caller that fetches and verifies is still type-checked. */
export interface PlannedInput {
  path: string;
  regions: number;
}
export interface MirrorResult {
  ok: boolean;
  fetched: number;
  skipped: Array<{ path: string; reason: string }>;
  problems: string[];
}
export declare function mirrorFiles(options: {
  plan: PlannedInput[];
  baseUrl: string;
  /**
   * `arrayBuffer` is optional because a response that failed has no body to read — which is truer than requiring one and is why the 404 case needed no stub of an empty
   * body in the test.
   */
  fetchImpl?: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer?: () => Promise<ArrayBuffer> }>;
  outDir?: string | null;
  writeFile?: ((path: string, bytes: Uint8Array) => void) | null;
  expected?: Map<string, { sha256?: string; bytes?: number }>;
}): Promise<MirrorResult>;
