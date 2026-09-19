/**
 * The GS-1 WASM core is fetched once, not once per host per render.
 *
 * `createGs1Host` runs per routed track *per render*, so an uncached core was re-fetched for every
 * one of them: the library's timbre baseline (159 genres x 2 repeats, two routed tracks each) issued
 * roughly **600 redundant fetches** of a multi-megabyte file, each with a 20 s abort timer.
 *
 * That was not just wasteful. A fetch that fails or times out rejects `createGs1Host`, and
 * `renderPatternOffline` catches that and leaves the track on the native synth **for that render
 * only** — a silent change to what the export sounds like, measured at up to 3.7 dB in one band
 * (appendix G.14). Caching removes the opportunity instead of retrying into it: after the first
 * successful fetch there is no request left to fail.
 *
 * The fetch is stubbed rather than performed: this test is about *how many times* the network is
 * asked, which is the quantity that matters, and it must not depend on a real core being served.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createGs1Host, resetGs1CoreCache } from "../audio/gs1/Gs1Host";

describe("the GS-1 core fetch", () => {
  let restoreFetch: (() => void) | null = null;

  beforeEach(() => {
    resetGs1CoreCache();
  });

  afterEach(() => {
    resetGs1CoreCache();
    restoreFetch?.();
    restoreFetch = null;
  });

  /**
   * Every fetch succeeds and returns bytes that `WebAssembly.validate` accepts, so the failure this
   * test counts is reached for one reason only: the host construction below it.
   */
  function installCountingFetch() {
    const calls: string[] = [];
    const original = globalThis.fetch;
    // A minimal valid WASM module header: magic + version, which `WebAssembly.validate` accepts.
    const validWasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => validWasm.slice().buffer,
      };
    }) as unknown as typeof fetch;
    restoreFetch = () => {
      globalThis.fetch = original;
    };
    return calls;
  }

  it("fetches the core once for repeated host builds", async () => {
    const calls = installCountingFetch();

    // Each call gets past the fetch and fails at worklet construction, which is the state this
    // environment can reach — the point is that the *network* is asked once.
    const context = {
      audioWorklet: { addModule: async () => {} },
      sampleRate: 44100,
    } as unknown as AudioContext;

    await createGs1Host({ context }).catch(() => {});
    await createGs1Host({ context }).catch(() => {});
    await createGs1Host({ context }).catch(() => {});

    const coreFetches = calls.filter((u) => u.endsWith(".wasm"));
    expect(coreFetches.length, `fetches: ${calls.join(", ")}`).toBe(1);
  });

  it("shares one in-flight fetch between concurrent callers", async () => {
    const calls = installCountingFetch();
    const context = {
      audioWorklet: { addModule: async () => {} },
      sampleRate: 44100,
    } as unknown as AudioContext;

    await Promise.all([
      createGs1Host({ context }).catch(() => {}),
      createGs1Host({ context }).catch(() => {}),
      createGs1Host({ context }).catch(() => {}),
    ]);

    expect(calls.filter((u) => u.endsWith(".wasm")).length).toBe(1);
  });

  it("does not cache a failure, so one transient error is not permanent", async () => {
    /**
     * The other half of the contract. Caching a rejection would turn a single flaky fetch into a
     * permanently degraded session — worse than the bug being fixed.
     */
    let attempt = 0;
    const original = globalThis.fetch;
    const validWasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    globalThis.fetch = (async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("transient network failure");
      return { ok: true, status: 200, arrayBuffer: async () => validWasm.slice().buffer };
    }) as unknown as typeof fetch;
    restoreFetch = () => {
      globalThis.fetch = original;
    };

    const context = {
      audioWorklet: { addModule: async () => {} },
      sampleRate: 44100,
    } as unknown as AudioContext;

    await createGs1Host({ context }).catch(() => {});
    await createGs1Host({ context }).catch(() => {});

    expect(attempt, "the failed fetch must be retried, not remembered").toBe(2);
  });
});
