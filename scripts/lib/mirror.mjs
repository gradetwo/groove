/**
 * Fetching a library's files and checking them against what the manifest promised.
 *
 * Three decisions are deliberate here, and each answers something a real library made concrete:
 *
 *   * **the fetch is injected**, like the decoder, the SFZ reader and the include reader — so the whole flow is testable with no network and no disk;
 *   * **a path containing `*` is skipped with a named reason**, because the real library's plan contains `Programs/*silence`. Whether that is a glob some players expand or a
 *     literal filename, a mirror step must not request a URL that cannot exist and then fail obscurely: it names the entry and leaves the decision to a person;
 *   * **a verification failure is reported by field** — which promise was broken — so a mirror run says what is wrong rather than only that something is.
 */
import { matchManifestEntry } from "./files.mjs";

/** A path with a glob character is not a file, and is reported rather than requested. */
const GLOB = /[*?[\]]/;

/**
 * @returns {Promise<{ ok: boolean, fetched: number, skipped: Array<{path:string, reason:string}>, problems: string[] }>}
 */
export async function mirrorFiles({ plan, baseUrl, fetchImpl = fetch, outDir = null, writeFile = null, expected = new Map() }) {
  const skipped = [];
  const problems = [];
  let fetched = 0;

  for (const file of plan) {
    if (GLOB.test(file.path)) {
      skipped.push({
        path: file.path,
        reason: "the path contains a glob character, so it is either a pattern to expand or a filename to confirm — neither is a URL a mirror can request",
      });
      continue;
    }

    const url = `${baseUrl.replace(/\/$/, "")}/${file.path}`;
    let bytes;
    try {
      const response = await fetchImpl(url);
      if (!response.ok) {
        problems.push(`${file.path}: ${response.status} from ${url}`);
        continue;
      }
      bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      problems.push(`${file.path}: ${error && error.message ? error.message : String(error)}`);
      continue;
    }
    fetched += 1;

    if (outDir && writeFile) writeFile(`${outDir}/${file.path}`, bytes);

    const promise = expected.get(file.path);
    if (promise) {
      // Verified through the same helper the manifest uses, so a mirror cannot check files by a different rule than the one that describes them.
      const check = await matchManifestEntry(bytes, promise);
      if (!check.ok) problems.push(`${file.path}: ${check.problems.join("; ")}`);
    }
  }

  return { ok: problems.length === 0, fetched, skipped, problems };
}
