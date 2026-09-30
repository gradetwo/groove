/**
 * A sample's two addresses, both tried.
 *
 * Muse — an agent composing a nine-movement piece through the MCP server — reported that a sample whose primary URL
 * 404s never tried its `fallbackUrl`: the fallback request count was zero. The instrument's **program** already tried
 * source-then-mirror and named both on failure, so a library could load its SFZ from the mirror and then fail to
 * decode a single note out of it. The addressing decision existed in one half of the loader and not the other.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { browserSampleDecoder } from "../audio/browserSampleGraph";
import { sampleAssetForPath } from "../audio/sfz/instrument";
import type { SampleAsset } from "../data/sampleCatalogue";

const context = {
  decodeAudioData: async (bytes: ArrayBuffer) => ({ byteLength: bytes.byteLength }) as unknown as AudioBuffer,
} as unknown as BaseAudioContext;

const asset = (overrides: Partial<SampleAsset> = {}): SampleAsset =>
  ({
    assetId: "kick.wav",
    name: "kick",
    kind: "one-shot",
    seconds: 1,
    url: "https://source.test/kick.wav",
    fallbackUrl: "https://mirror.test/kick.wav",
    ...overrides,
  }) as SampleAsset;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the sample decoder", () => {
  it("decodes from the source when it answers", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response;
    });
    await browserSampleDecoder(context)(asset());
    expect(asked).toEqual(["https://source.test/kick.wav"]);
  });

  it("falls back to the mirror when the source does not answer", async () => {
    // ⭐ The reported bug: this request used to never happen.
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      if (url.startsWith("https://source.")) return { ok: false, status: 404 } as unknown as Response;
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) } as unknown as Response;
    });
    const decoded = await browserSampleDecoder(context)(asset());
    expect(asked).toEqual(["https://source.test/kick.wav", "https://mirror.test/kick.wav"]);
    expect((decoded as unknown as { byteLength: number }).byteLength).toBe(16);
  });

  it("names both addresses when both fail, because the two failures have different causes", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.startsWith("https://source.")) throw new Error("connection reset");
      return { ok: false, status: 503 } as unknown as Response;
    });
    await expect(browserSampleDecoder(context)(asset())).rejects.toThrow(/source.*connection reset.*mirror.*503/s);
  });

  it("does not pretend a sample with no address can be fetched", async () => {
    await expect(browserSampleDecoder(context)(asset({ url: undefined }))).rejects.toThrow(/no url/);
    // And with only a source, a failure is reported as that one address rather than as a missing mirror.
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 404 }) as unknown as Response);
    await expect(browserSampleDecoder(context)(asset({ fallbackUrl: undefined }))).rejects.toThrow(/could not be fetched from https:\/\/source/);
  });
});

/**
 * **A `#` in a sample filename is part of the filename.**
 *
 * Muse reported samples that never fetched: `chimes_G#3_ff_rr1.wav` resolved through `new URL(path, base)` as `…/chimes_G` plus the fragment `3_ff_rr1.wav`, so the request asked for a file that does not exist. A `?` in a name does the same to the query string.
 */
describe("sample addresses", () => {
  it("keeps a filename containing # in the path", () => {
    const asset = sampleAssetForPath("Samples/Bells/chimes_G#3_ff_rr1.wav", { programUrl: "https://mirror.test/sal/Program.sfz" });
    expect(asset.url).toBe("https://mirror.test/sal/Samples/Bells/chimes_G%233_ff_rr1.wav");
    // And the whole filename is in the path, not split into a fragment.
    expect(new URL(asset.url!).hash).toBe("");
    expect(decodeURIComponent(new URL(asset.url!).pathname)).toContain("chimes_G#3_ff_rr1.wav");
  });

  it("keeps a filename containing ? in the path", () => {
    const asset = sampleAssetForPath("Samples/x?y.wav", { programUrl: "https://mirror.test/p.sfz" });
    expect(new URL(asset.url!).search).toBe("");
    expect(decodeURIComponent(new URL(asset.url!).pathname)).toContain("x?y.wav");
  });

  it("does not double-encode a path that is already escaped", () => {
    // `%20` becoming `%2520` would be the same bug in the other direction.
    const asset = sampleAssetForPath("Samples/my%20kick.wav", { programUrl: "https://mirror.test/p.sfz" });
    expect(asset.url).toContain("my%20kick.wav");
    expect(asset.url).not.toContain("%2520");
  });
});
