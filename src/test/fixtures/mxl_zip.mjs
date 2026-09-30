/**
 * A `.mxl` zip, composed byte by byte.
 *
 * Two callers need one: the reader's criteria, which must hand the reader a real zip rather than a string claiming to be one, and the MCP gate, which must call `import_arrangement_musicxml_file` over the wire to prove the zip path works in the server's own environment. Building it in the test file left the gate either unable to make one or making a second, subtly different one — and a gate that sends a zip the test never sent is not
 * evidence about the code the test covers.
 *
 * `fflate`'s `zipSync` writes it, which is the same library the reader unzips with, so a passing reader means the two agree about the format. The `mimetype` entry is stored uncompressed and first, as the format requires: a reader is allowed to learn the type from the opening bytes without reading the whole central directory.
 */
import { zipSync, strToU8 } from "fflate";

/**
 * @param {Array<[string, string]>} files name and text of every entry besides the container.
 * @param {{ variant?: "container" | "no-container" | "wrong-mimetype", rootIndex?: number }} [options]
 *   `no-container` omits `META-INF/container.xml`, the malformed case; `wrong-mimetype` claims the zip is something else; `rootIndex` picks which file the container names.
 * @returns {Uint8Array} the zip's bytes.
 */
export function buildMxlZip(files, options = {}) {
  const variant = options.variant ?? "container";
  const mimetype = variant === "wrong-mimetype" ? "application/zip" : "application/vnd.recordare.musicxml";
  /** `level: 0` is fflate's "store": the mimetype entry must not be deflated. */
  const entries = { mimetype: [strToU8(mimetype), { level: 0 }] };
  if (variant === "container") {
    const root = files[options.rootIndex ?? 0][0];
    entries["META-INF/container.xml"] = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="${root}" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`
    );
  }
  for (const [name, text] of files) entries[name] = strToU8(text);
  return zipSync(entries);
}
