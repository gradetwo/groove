/**
 * ⭐ **The catalogue cache must be cheaper than the build it exists to skip — a 4 MB key is not.**
 *
 * `listCatalogueInstruments` caches the fully-built catalogue so repeated MCP calls do not re-walk every
 * asset through the technique table. The first cut (`ed923ca`) keyed that cache on the manifest **text**.
 * The shipped `public/samples/manifest.json` is 4.0 MB, so every call concatenated and compared ~8 MB of
 * strings to skip a build that costs well under a millisecond — the "cache" was several times slower than
 * no cache at all. `mcp/instruments.ts` now keys on the parsed manifest object's identity plus the root,
 * which is O(1) and invalidates on exactly the same two events (content change, `GROOVE_SAMPLE_ROOT`
 * change).
 *
 * ⭐ **The cap is the measurement, not a guess.** Same machine, same data, 3 warm-up calls discarded, 75
 * timed calls per cell (three interleaved 25-call rounds), median with min–max in ms. All three shapes
 * reach the cache key before any narrowing, so all three move together:
 *
 * | revision    | `{}`               | handler shape (all keys, undefined) | `{ library, limit }` |
 * |-------------|--------------------|-------------------------------------|----------------------|
 * | `4a71254`   | 0.895 (0.58–11.4)  | 0.865 (0.56–5.9)                    | 0.963 (0.55–122)     |
 * | `ed923ca`   | 5.190 (3.86–16.9)  | 4.661 (3.74–7.6)                    | 5.014 (3.99–8.1)     |
 * | fixed       | 0.197 (0.08–3.0)   | 0.160 (0.08–3.0)                    | 0.115 (0.07–0.32)    |
 *
 * **The criterion judges the fastest call, not the total.** The regression puts a floor of ~3.86 ms under
 * *every* call, while the fixed path's floor is ~0.08 ms; a total, by contrast, is at the mercy of how
 * loaded the box is — this loop took 0.34 s standalone but 1.05 s beside three other instrument test files
 * and ~2.0 s with four suites running at once (all measured here, 1,000 calls each). A total cap tight
 * enough to fail `ed923ca` on an idle box would therefore go red on the fixed tree on a busy one. The
 * fastest call is a floor that load can only push *up*, and it stayed at 0.38–0.41 ms even under four
 * concurrent suites — ~10× below the regressed floor. A 1.5 ms cap fails the text key (its floor is
 * ~3.9 ms, so even a machine ~2.5× faster than this one stays red) and leaves the fixed path ~4× of
 * headroom under the heaviest load measured.
 *
 * Correctness is asserted beside the time on purpose: a cache that returned early, empty or stale would
 * be fast and wrong, and that is the other way this criterion has to be able to go red.
 */
import { describe, expect, it } from "vitest";
import { listCatalogueInstruments } from "../../mcp/instruments";

/** Enough calls that a clean slice is all but certain, even on a contended box. */
const CALLS = 1000;
/** Derived above: ~10× the regressed floor, ~4× the fixed floor under four concurrent suites. */
const FASTEST_CALL_CAP_MS = 1.5;

describe("the catalogue cache is not more expensive than the build it skips", () => {
  it(`answers a repeated catalogue call in under ${FASTEST_CALL_CAP_MS} ms`, { timeout: 60000 }, () => {
    // The one real build and the manifest read happen here, outside the timed loop.
    const first = listCatalogueInstruments({});
    expect(first.instruments.length).toBeGreaterThan(0);

    let last = first;
    let fastestMs = Number.POSITIVE_INFINITY;
    for (let i = 0; i < CALLS; i++) {
      const t0 = performance.now();
      last = listCatalogueInstruments({});
      fastestMs = Math.min(fastestMs, performance.now() - t0);
    }

    // Correctness first: an early or empty return would be fast and wrong.
    expect(last.instruments.length).toBe(first.instruments.length);
    expect(last.libraries).toEqual(first.libraries);
    expect(fastestMs).toBeLessThan(FASTEST_CALL_CAP_MS);
  });
});
