/**
 * The types for `mxl_zip.mjs`, which is plain JavaScript so `scripts/check_mcp.mjs` can import the same builder the criteria use.
 */
export function buildMxlZip(files: Array<[string, string]>, options?: { variant?: "container" | "no-container" | "wrong-mimetype"; rootIndex?: number }): Uint8Array;
