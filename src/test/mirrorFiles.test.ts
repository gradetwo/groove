import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mirrorFiles } from "../../scripts/lib/mirror.mjs";

/**
 * Fetching and verifying, with the fetch injected so the whole flow is testable with no network and no disk.
 *
 * Three criteria come straight from what a real library made concrete: files that verify, a mismatch reported **by field**, and — the one that matters most — a plan entry
 * containing a glob character being **skipped with its name in the reason** rather than requested and failing obscurely.
 */
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const body = (text: string) => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(text).buffer });
const plan = (...paths: string[]) => paths.map((path) => ({ path, regions: 1 }));

describe("mirrorFiles", () => {
  it("fetches what the plan lists and verifies it against the manifest's promises", async () => {
    const seen: string[] = [];
    const result = await mirrorFiles({
      plan: plan("Programs/a.sfz", "Samples/kick.wav"),
      baseUrl: "https://cdn.example/root/",
      fetchImpl: async (url: string) => {
        seen.push(url);
        return body(url.endsWith(".sfz") ? "sfz" : "kick");
      },
      expected: new Map([
        ["Programs/a.sfz", { sha256: digest("sfz"), bytes: 3 }],
        ["Samples/kick.wav", { sha256: digest("kick"), bytes: 4 }],
      ]),
    });
    expect(result.ok).toBe(true);
    expect(result.fetched).toBe(2);
    expect(result.problems).toEqual([]);
    // The trailing slash on the base is not doubled, because a URL with two slashes in it is a different URL.
    expect(seen).toEqual(["https://cdn.example/root/Programs/a.sfz", "https://cdn.example/root/Samples/kick.wav"]);
  });

  it("reports a mismatch by field, so a run says what is wrong rather than only that something is", async () => {
    const result = await mirrorFiles({
      plan: plan("Samples/kick.wav"),
      baseUrl: "https://cdn.example",
      fetchImpl: async () => body("kick"),
      expected: new Map([["Samples/kick.wav", { bytes: 99 }]]),
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(/4 bytes ≠ 99/);
  });

  it("skips a plan entry containing a glob character, naming it — the real library has one", async () => {
    const requested: string[] = [];
    const result = await mirrorFiles({
      plan: plan("Programs/*silence", "Samples/kick.wav"),
      baseUrl: "https://cdn.example",
      fetchImpl: async (url: string) => {
        requested.push(url);
        return body("kick");
      },
    });
    expect(result.fetched).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.path).toBe("Programs/*silence");
    expect(result.skipped[0]!.reason).toMatch(/glob character/);
    // And it was never requested: a URL containing `*` cannot exist, so asking for it would be a failure with no information in it.
    expect(requested.every((url) => !url.includes("*"))).toBe(true);
  });

  it("reports a fetch failure with its status rather than counting it as fetched", async () => {
    const result = await mirrorFiles({
      plan: plan("Samples/missing.wav"),
      baseUrl: "https://cdn.example",
      fetchImpl: async () => ({ ok: false, status: 404 }),
    });
    expect(result.fetched).toBe(0);
    expect(result.problems.join("\n")).toMatch(/404/);
    expect(result.ok).toBe(false);
  });
});
