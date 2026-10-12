import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { ClipPrefetch, MobileClipPlayer } from "../mobile/MobileClipPlayer";

/**
 * Unit-level criteria for the phone clip cache. These drive `ClipPrefetch` directly instead of the
 * component: the two properties that matter — one download per clip, and no second download once the
 * bytes have arrived — are properties of the cache, and the component-level harness could not reach
 * them in jsdom (the fetch spy saw zero requests).
 *
 * ⭐ **Added 2026-10-12: the double download the live probe measured.** `scratch/verify-live-phone.mjs`
 * records every real request whose URL contains `/clips/` (lines 11 and 21) and saw the same clip twice —
 * a quick press starts the media element's own load of `clip.url` before the idle prefetch has, and the
 * prefetch then pulls the same ~400 KB again. The guard lives in the cache (`load(url, {element, url})`
 * skips a URL the element is already `NETWORK_LOADING`), so it is pinned here rather than in a timing
 * race; the ordering the component adds on top of it (skip before the fetch, and release a blob that
 * arrives after the element's load began) is driven by hand below with a stub `requestIdleCallback` and
 * a deferred `fetch`, so no assertion waits on a wall clock.
 */

const CLIP_URL = "https://r2mirror.groove.wangda.today/clips/chicago-house.mp3";

const hoisted = vi.hoisted(() => ({
  clip: {
    genreId: "chicago-house",
    url: "https://r2mirror.groove.wangda.today/clips/chicago-house.mp3",
    seconds: 16.6,
    bytes: 400030,
    engineVersion: "2.36.3",
    recordedLanes: 6,
    warnings: [],
  },
}));

vi.mock("../data/genreClips", () => ({
  readClipManifest: () => ({ bars: 8, clips: [] }),
  clipForGenre: () => hoisted.clip,
  staleClips: () => [],
}));

/** A successful `fetch` double: no real bytes, one blob. */
const okResponse = () => ({ ok: true, blob: async () => new Blob(["x"]) }) as unknown as Response;

/**
 * The object-URL surface jsdom lacks, with every call recorded rather than stubbed away.
 *
 * ⭐ **The two methods are patched on the real `URL`, not swapped with `vi.stubGlobal("URL", { ...URL })`.**
 * Replacing the constructor with a plain object breaks `fetch`'s own URL parsing — the component's manifest
 * request then fails with "Failed to parse URL from /genre-clips.json" and the player never renders — and
 * `vi.unstubAllGlobals()` did not put the constructor back within this file. Patching in place leaves the
 * constructor alone.
 */
const realCreateObjectURL = URL.createObjectURL;
const realRevokeObjectURL = URL.revokeObjectURL;

function stubObjectUrls() {
  const createObjectURL = vi.fn(() => `blob:mock-${createObjectURL.mock.calls.length}`);
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: revokeObjectURL });
  return { createObjectURL, revokeObjectURL };
}

/**
 * `HTMLMediaElement.networkState` is read-only in jsdom, so the element's state is supplied as a
 * controllable prototype property: setting it before `load` is exactly what "the element is already
 * loading" means, and a stub `play()` drives the transition in the ordering scenarios.
 */
let networkState = 0;
const setNetworkState = (value: number) => {
  networkState = value;
};

beforeEach(() => {
  setNetworkState(0);
  Object.defineProperty(HTMLMediaElement.prototype, "networkState", {
    configurable: true,
    get: () => networkState,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  // The object-URL methods are patched in place (see `stubObjectUrls`), so they are restored by hand.
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: realCreateObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: realRevokeObjectURL });
  delete (HTMLMediaElement.prototype as unknown as Record<string, unknown>).networkState;
});

describe("the phone clip cache", () => {
  it("⭐ dedupes in-flight requests: two concurrent loads of one URL fetch once", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, blob: async () => new Blob(["x"]) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchSpy);
    const { createObjectURL, revokeObjectURL } = stubObjectUrls();
    createObjectURL.mockReturnValue("blob:mock");
    void revokeObjectURL;

    const cache = new ClipPrefetch();
    const [a, b] = await Promise.all([cache.load("https://r2/clip.mp3"), cache.load("https://r2/clip.mp3")]);

    expect(fetchSpy).toHaveBeenCalledTimes(1); // one prefetch, one download
    expect(a).toBe("blob:mock");
    expect(b).toBe(a);
    vi.unstubAllGlobals();
  });

  it("⭐ a second load of a cached URL issues no further fetch", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, blob: async () => new Blob(["x"]) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchSpy);
    const { createObjectURL, revokeObjectURL } = stubObjectUrls();
    createObjectURL.mockReturnValue("blob:mock");
    void revokeObjectURL;

    const cache = new ClipPrefetch();
    await cache.load("https://r2/clip.mp3");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(cache.cached("https://r2/clip.mp3")).toBe("blob:mock");

    await cache.load("https://r2/clip.mp3"); // the replay
    expect(fetchSpy).toHaveBeenCalledTimes(1); // still one: the cache answered
    vi.unstubAllGlobals();
  });

  it("⭐ does not prefetch a URL the element is already loading — the element's request is the download", async () => {
    const fetchSpy = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchSpy);
    const { createObjectURL } = stubObjectUrls();
    const audio = document.createElement("audio");
    audio.src = CLIP_URL;
    setNetworkState(HTMLMediaElement.NETWORK_LOADING); // the press beat the idle prefetch

    const cache = new ClipPrefetch();
    const objectUrl = await cache.load(CLIP_URL, { element: audio, url: CLIP_URL });

    expect(fetchSpy, "no prefetch fetch is issued at all").not.toHaveBeenCalled();
    expect(objectUrl, "there is nothing for the prefetch to hand back").toBeUndefined();
    expect(createObjectURL, "and no blob is minted").not.toHaveBeenCalled();
  });

  it("⭐ still prefetches the same URL when the element is idle — the skip is not a blanket refusal", async () => {
    const fetchSpy = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchSpy);
    stubObjectUrls();
    const audio = document.createElement("audio");
    audio.src = CLIP_URL;
    setNetworkState(HTMLMediaElement.NETWORK_IDLE);

    const cache = new ClipPrefetch();
    await cache.load(CLIP_URL, { element: audio, url: CLIP_URL });

    expect(fetchSpy, "an idle element has not started paying for the bytes").toHaveBeenCalledTimes(1);
  });

  it("⭐ a different URL on the element does not suppress the prefetch for this one", async () => {
    const fetchSpy = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchSpy);
    stubObjectUrls();
    const audio = document.createElement("audio");
    audio.src = "https://r2mirror.groove.wangda.today/clips/bebop.mp3";
    setNetworkState(HTMLMediaElement.NETWORK_LOADING);

    const cache = new ClipPrefetch();
    await cache.load(CLIP_URL, { element: audio, url: CLIP_URL });

    expect(fetchSpy, "another clip's load is not this clip's download").toHaveBeenCalledTimes(1);
  });

  it("⭐ releases a blob the element has no use for, and keeps the cache when it does", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse()));
    const { createObjectURL, revokeObjectURL } = stubObjectUrls();
    const cache = new ClipPrefetch();
    await cache.load(CLIP_URL);

    cache.release(CLIP_URL); // the element began its own load: the blob is held for nothing
    expect(revokeObjectURL, "released rather than pinned").toHaveBeenCalledWith("blob:mock-1");
    expect(cache.cached(CLIP_URL), "and forgotten").toBeUndefined();

    await cache.load(CLIP_URL); // usable again, because the skip/release was not cached
    expect(cache.cached(CLIP_URL)).toBe("blob:mock-2");
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    cache.release(CLIP_URL, "blob:mock-2"); // the URL the element was handed must survive
    expect(revokeObjectURL, "only the unused blob was revoked").toHaveBeenCalledTimes(1);
    expect(cache.cached(CLIP_URL)).toBe("blob:mock-2");
  });

  it("⭐ revoking on unmount cannot miss a fetch that is still in flight", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          })
      )
    );
    const { createObjectURL, revokeObjectURL } = stubObjectUrls();
    const cache = new ClipPrefetch();
    const inFlight = cache.load(CLIP_URL);

    cache.dispose(); // unmount while the bytes are on the wire
    resolveFetch?.(okResponse());
    await inFlight;

    expect(createObjectURL, "the blob is not pinned past the component that asked for it").toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
    expect(cache.cached(CLIP_URL)).toBeUndefined();
  });
});

/**
 * ⭐ **The wiring, not the cache.** The class-level criteria above prove the guard; these drive the
 * component's own ordering, which is where the live double request came from. `requestIdleCallback` is
 * hand-driven so the idle step happens when the test says, and the prefetch's `fetch` is deferred so the
 * "element starts loading after the prefetch did" race is stepped rather than timed.
 */
