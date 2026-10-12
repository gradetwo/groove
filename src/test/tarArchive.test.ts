import { describe, expect, it } from "vitest";
import { buildTar, readTar } from "../features/debug/tar";

const text = (value: string) => new TextEncoder().encode(value);

describe("the tar writer both surfaces share", () => {
  it("round trips names and bytes, including an empty file and a full block", () => {
    const entries = [
      { name: "bundle.json", bytes: text('{"a":1}'), mtimeSeconds: 1_700_000_000 },
      { name: "empty.txt", bytes: new Uint8Array(0) },
      { name: "render/full.bin", bytes: new Uint8Array(512).fill(7) },
    ];
    const read = readTar(buildTar(entries));
    expect(read.map((entry) => entry.name)).toEqual(["bundle.json", "empty.txt", "render/full.bin"]);
    expect(new TextDecoder().decode(read[0]!.bytes)).toBe('{"a":1}');
    expect(read[1]!.bytes.length).toBe(0);
    expect(read[2]!.bytes.length).toBe(512);
    expect(read[2]!.bytes.every((byte) => byte === 7)).toBe(true);
  });

  it("writes a ustar header with the checksum the format needs", () => {
    const archive = buildTar([{ name: "bundle.json", bytes: text("x"), mtimeSeconds: 1_700_000_000 }]);
    const block = archive.subarray(0, 512);
    expect(new TextDecoder().decode(block.subarray(257, 262))).toBe("ustar");
    const stored = parseInt(new TextDecoder().decode(block.subarray(148, 154)), 8);
    const copy = block.slice();
    copy.fill(0x20, 148, 156);
    expect(copy.reduce((sum, byte) => sum + byte, 0)).toBe(stored);
    // ⭐ The archive ends with two empty blocks, which is how an extractor knows it is complete.
    expect(archive.subarray(archive.length - 1024).every((byte) => byte === 0)).toBe(true);
  });

  it("refuses an absolute name rather than quietly rewriting it", () => {
    expect(() => buildTar([{ name: "/etc/passwd", bytes: text("x") }])).toThrow(/relative/);
    expect(() => buildTar([{ name: "a".repeat(101), bytes: text("x") }])).toThrow(/longer than/);
  });
});
