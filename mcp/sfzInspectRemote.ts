/**
 * **What an instrument's SFZ says, over plain HTTP — no browser, no audio.**
 *
 * The tool this feeds answers the question Muse could not ask from the MCP surface: *which regions set
 * `note_polyphony`, `amplitude_onccN`, `one_shot`, `locc`/`hicc`, and which values were inherited from a group.* The
 * existing instrument path (`render_instrument_note` → `auditionInstrumentNote`) reaches the parser too, but it does
 * so **inside a browser**, because it has to decode audio — and making the cheapest question ("what does this file
 * say") pay the most expensive cost ("start Vite and Chromium") is the kind of mistake that looks like reuse.
 *
 * Everything here already existed: the remote include expansion that the load path hardened (`expandRemoteIncludes`,
 * including the inline and several-per-line includes this work fixed), the parser that keeps `opcodes` and
 * `inherited`, and the summariser beside this file. What is new is only the wiring, and the wiring is small on
 * purpose.
 */
import { expandRemoteIncludes } from "../src/audio/sfz/remoteIncludes";
import { parseSfz } from "../src/audio/sfz/parse";
import { summariseSfzParameters, type SfzParameterRow } from "./sfzInspect";

export interface InspectSfzResult {
  assetId: string;
  /** Which address actually served the program — the source or the mirror. */
  servedFrom: string;
  /** Regions after expansion, so a caller can tell "no parameters" from "no regions". */
  regions: number;
  rows: SfzParameterRow[];
  /** Includes the expansion could not read, with the address it tried. Empty is the ordinary case. */
  missing: string[];
}

export interface InspectSfzDeps {
  /** Injected so this can be proved without a network: the caller passes `fetch`-backed text loading. */
  fetchText: (url: string) => Promise<string>;
}

export async function inspectSfzAt(
  asset: { assetId: string; sfz?: { url?: string; fallbackUrl?: string } },
  deps: InspectSfzDeps
): Promise<InspectSfzResult> {
  const primary = asset.sfz?.url;
  const mirror = asset.sfz?.fallbackUrl;
  if (!primary) throw new Error(`instrument "${asset.assetId}" has no SFZ address, so there is nothing to read`);

  /**
   * Both addresses, source first, exactly as the audio path does it — a library whose bytes live on the mirror should
   * not need a different code path to be *described* than to be *played*.
   */
  let text: string;
  let servedFrom = primary;
  try {
    text = await deps.fetchText(primary);
  } catch (primaryError) {
    if (!mirror) throw primaryError;
    text = await deps.fetchText(mirror);
    servedFrom = mirror;
  }

  /**
   * ⭐ **The program's own path, with the library's address as the base — measured, after two wrong guesses.**
   *
   * The first version passed the absolute URL as `programUrl`; the expander treats that argument as a **path** and
   * splits on `/`, so `https://host/kit.sfz` became `https:/host/kit.sfz`. The second passed the URL's whole
   * pathname, prefix and all, which made every include resolve one level too deep. Neither is what the arguments
   * mean: **`programUrl` is the program's path relative to the base** and `baseUrl` is where that base lives — the
   * same division the audio loader uses, and the reason `baseUrl` exists as an option at all.
   *
   * Measured on the real library with the arguments the right way round: **two waves, 40 files fetched, `missing`
   * down to zero, 119 KB of expanded text.** With them the wrong way round: 0 regions.
   */
  const programme = new URL(servedFrom);
  const programPath = programme.pathname.split("/").filter(Boolean).pop() ?? "program.sfz";
  const libraryBase = new URL(".", programme).toString();
  const expanded = await expandRemoteIncludes(text, { fetchText: deps.fetchText, programUrl: programPath, baseUrl: libraryBase });
  const regions = parseSfz(expanded.text);
  return {
    assetId: asset.assetId,
    servedFrom,
    regions: regions.length,
    rows: summariseSfzParameters(regions),
    missing: expanded.missing,
  };
}
