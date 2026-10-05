import { describe, expect, it } from "vitest";
import { collectWebDebugArchive, webDebugBundleFileName, WEB_DEBUG_FILE_LIMIT } from "../features/debug/webDebugBundle";
import { readTar } from "../features/debug/tar";

const unzip = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const plainStream = source.pipeThrough(new DecompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  const plain = await new Response(plainStream).arrayBuffer();
  return readTar(new Uint8Array(plain));
};
const textOf = (entries: ReturnType<typeof readTar>, name: string) =>
  new TextDecoder().decode(entries.find((entry) => entry.name === name)!.bytes);

describe("Web · the debug bundle", () => {
  it("writes one compressed archive with the parts a report needs", async () => {
    const archive = await collectWebDebugArchive({ note: "the page went quiet" });
    expect(webDebugBundleFileName("2026-10-05T00:00:00.000Z")).toMatch(/^groove-debug-[\w-]+\.tar\.gz$/);
    const entries = await unzip(archive.blob);
    for (const expected of ["bundle.json", "environment.json", "README.md", "manifest.json"]) {
      expect(entries.map((entry) => entry.name), expected).toContain(expected);
    }
    expect(JSON.parse(textOf(entries, "bundle.json")).note).toBe("the page went quiet");
  });

  it("carries the work when given it, and says so in its readme", async () => {
    const archive = await collectWebDebugArchive({ arrangement: { id: "a1", tracks: [] } });
    expect(archive.carriesWork).toBe(true);
    expect(archive.entries).toContain("arrangement.groove.json");
    expect(textOf(await unzip(archive.blob), "README.md")).toContain("carries the work itself");
  });

  it("names an oversize file rather than cutting it", async () => {
    const archive = await collectWebDebugArchive({ files: [{ name: "huge.wav", bytes: new Uint8Array(WEB_DEBUG_FILE_LIMIT + 1) }] });
    expect(archive.entries).not.toContain("files/huge.wav");
    expect(archive.omitted.join(" ")).toContain("huge.wav");
  });

  it("carries no secret word", async () => {
    const archive = await collectWebDebugArchive({});
    const all = (await unzip(archive.blob)).map((entry) => new TextDecoder().decode(entry.bytes)).join("\n");
    for (const word of ["token", "secret", "password", "apikey", "authorization"]) {
      expect(all.toLowerCase(), word).not.toContain(word);
    }
  });
});
