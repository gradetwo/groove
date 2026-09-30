/**
 * The `.mxl` zip a criterion hands the reader, and the base64 an MCP caller sends.
 *
 * The zip itself is composed in `./mxl_zip.mjs`, which the MCP gate imports too: the gate and the criteria send the same bytes, so the gate is evidence about the code the criteria cover rather than about a second zip builder that drifted.
 */
import { buildMxlZip } from "./mxl_zip.mjs";

export { buildMxlZip };

/** The base64 an MCP caller sends, because JSON has no bytes. */
export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
