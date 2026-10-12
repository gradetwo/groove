import { describe, expect, it, vi } from "vitest";
import { ClipPrefetch } from "../mobile/MobileClipPlayer";

/**
 * Unit-level criteria for the phone clip cache. These drive `ClipPrefetch` directly instead of the
 * component: the two properties that matter — one download per clip, and no second download once the
 * bytes have arrived — are properties of the cache, and the component-level harness could not reach
 * them in jsdom (the fetch spy saw zero requests).
 */
describe("the phone clip cache", () => {
  it("⭐ dedupes in-flight requests: two concurrent loads of one URL fetch once", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, blob: async () => new Blob(["x"]) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });

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
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() });

    const cache = new ClipPrefetch();
    await cache.load("https://r2/clip.mp3");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(cache.cached("https://r2/clip.mp3")).toBe("blob:mock");

    await cache.load("https://r2/clip.mp3"); // the replay
    expect(fetchSpy).toHaveBeenCalledTimes(1); // still one: the cache answered
    vi.unstubAllGlobals();
  });
});
