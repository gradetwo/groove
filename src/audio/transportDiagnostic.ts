/**
 * **Why a browser's `fetch` failed where `curl` returned 200** — the diagnosis the one-word error message does not carry.
 *
 * An independent user re-tested VSCO 2 CE end to end and read, for both of the loader's addresses, only *"Failed to fetch"* — while `curl` on
 * the same two URLs returned 200. That pair of facts is the whole diagnosis, and the reply did not contain it: `fetch` raises **one** `TypeError`
 * for every cross-origin refusal (a missing `Access-Control-Allow-Origin`, a blocked preflight, a dropped connection, a DNS failure), and its
 * message names none of them.
 *
 * The separating question is *"does the host answer at all?"* — so it is asked, of the **same URL**, in `no-cors` mode. That mode skips the CORS
 * check and resolves for any reachable host whose response merely lacks the header, so:
 *
 *   · the probe resolves ⇒ the object is being served and the failure is an **origin** decision — the host is up, `curl` is right, and the
 *     response is missing `Access-Control-Allow-Origin`;
 *   · the probe throws ⇒ the address really did not answer, which the original message already says.
 *
 * It lives in its own module because **both halves of the loader need it** — the SFZ text (`sampleLoader`) and the sample bytes
 * (`browserSampleGraph`) fail through the same browser mechanism, and a caller that has one of the two explained would reasonably conclude the
 * other had a different cause. Importing it from `sampleLoader` into `browserSampleGraph` would make a cycle, since that module already imports
 * `createSampleLoader` from this one.
 *
 * The probe runs **only after a failure**, so a working load pays nothing, and it is best-effort: a probe that throws adds nothing rather than
 * replacing the error it was asked to explain.
 */

/** The `no-cors` re-request, injectable so a criterion can prove what the note says without a network. */
export type TransportProbe = (url: string) => Promise<unknown>;

/** The default probe: the same address, with the CORS check taken out of the way. */
export const noCorsProbe: TransportProbe = (url) => fetch(url, { mode: "no-cors" });

export async function transportNote(url: string, probe: TransportProbe = noCorsProbe): Promise<string | undefined> {  try {
    await probe(url);
  } catch {
    // Both modes failed, which is a host that does not answer — the message already says so, and a guess would be worse than silence.
    return undefined;
  }
  return (
    ` — the address does not answer cross-origin: the same URL fetched in \`no-cors\` mode succeeds, so the host is up and serving this object, ` +
    `and the response is missing the CORS header that a page on another origin needs (for the project's R2 mirror the bucket's CORS policy ` +
    `supplies it — see docs/R2_UPLOAD.md §2)`
  );
}
