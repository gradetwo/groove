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

/**
 * SFZ's `*`-prefixed names are **built-ins, not files**, and `*silence` is the one a real library uses: `sample=*silence` means "play nothing" rather than "fetch a file called
 * `*silence`". The first version of this step skipped it as "a path containing a glob character", which reached the right behaviour through the wrong explanation — and a wrong
 * explanation is what a later reader acts on.
 */
const BUILT_IN = /^\*|[*?[\]]/;

/**
 * @returns {Promise<{ ok: boolean, fetched: number, skipped: Array<{path:string, reason:string}>, problems: string[] }>}
 */
export async function mirrorFiles({ plan, baseUrl, fetchImpl = fetch, outDir = null, writeFile = null, expected = new Map() }) {
  const skipped = [];
  const problems = [];
  let fetched = 0;

  for (const file of plan) {
    if (BUILT_IN.test(file.path)) {
      skipped.push({
        path: file.path,
        reason: "`*`-prefixed names are SFZ built-ins, not files — `*silence` means \"play nothing\", so there is nothing to mirror",
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
