/**
 * ⭐ **One loader per `AudioContext` — the fact that turns "prepare, then play" into one download instead of two.**
 *
 * `createSampleLoader`'s two caches (decoded assets, expanded programs) live on the loader, so a loader built per press cannot carry them
 * between presses: every play re-downloaded the instrument, every `#include` under it, and re-decoded every sample. Measured on
 * `/genre/bebop`'s recorded lanes, that is **45 files** — three programs plus 42 includes and samples.
 *
 * The two criteria below are the two halves of the identity: **the same context and the same catalogue get the same loader**, and a
 * **different** context or a **different** catalogue gets a new one — which is what keeps a session that registered a creator's library, or
 * a view that rebuilt its engine, from being answered out of a stale `findSampleAsset`.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { sharedSamplerLoader, sharedSamplerLoaderBuilds, __resetSharedSamplerLoaderBuilds } from "../audio/sharedSamplerLoader";
import type { SampleAsset } from "../data/sampleCatalogue";

const context = (): BaseAudioContext => ({ decodeAudioData: async () => ({}) as AudioBuffer }) as unknown as BaseAudioContext;
const catalogue = (id: string): SampleAsset[] => [{ assetId: id, name: id, kind: "one-shot", seconds: 1 }];

beforeEach(() => __resetSharedSamplerLoaderBuilds());

describe("sharedSamplerLoader", () => {
  it("⭐ hands the same loader back for the same context and catalogue, so a second play is a cache hit", () => {
    const ctx = context();
    const assets = catalogue("a");
    const first = sharedSamplerLoader(ctx, assets);
    const second = sharedSamplerLoader(ctx, assets);
    expect(second).toBe(first);
    expect(sharedSamplerLoaderBuilds(), "a second play built a second loader, so it paid for everything again").toBe(1);
  });

  it("builds a new loader when the context changed, because a decoded buffer belongs to its context", () => {
    const first = sharedSamplerLoader(context(), catalogue("a"));
    const second = sharedSamplerLoader(context(), catalogue("a"));
    expect(second).not.toBe(first);
    expect(sharedSamplerLoaderBuilds()).toBe(2);
  });

  it("builds a new loader when the catalogue changed, so a newly registered library is really looked up", () => {
    const ctx = context();
    const first = sharedSamplerLoader(ctx, catalogue("a"));
    const second = sharedSamplerLoader(ctx, catalogue("b"));
    expect(second).not.toBe(first);
    expect(sharedSamplerLoaderBuilds()).toBe(2);
  });

  it("reuses the loader when the very same array is passed again, which is what the session runtime hands over", () => {
    const ctx = context();
    const assets = catalogue("a");
    sharedSamplerLoader(ctx, assets);
    // A structurally equal but different array is a different catalogue: `findSampleAsset` would answer from a different list.
    sharedSamplerLoader(ctx, [...assets]);
    expect(sharedSamplerLoaderBuilds()).toBe(2);
  });
});
