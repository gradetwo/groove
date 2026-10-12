import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashFile, matchesManifestEntry } from "../../scripts/lib/files.mjs";

/**
 * Hashing and sizing, proved against values known by construction.
 *
 * The manifest promises a `sha256` and a `bytes` for every file of every library, and those are what make a downloaded file checkable rather than merely present. This is the
 * smallest piece of the mirroring flow, chosen first because it is deterministic — unlike the timing instruments this workstream has had to withdraw twice.
 */
const sample = () => {
  const path = join(mkdtempSync(join(tmpdir(), "files-")), "payload.bin");
  writeFileSync(path, "groove");
  return path;
};

describe("hashFile", () => {
  it("computes the sha256 and size of a payload whose digest is known independently", async () => {
    /**
     * The expectation is `sha256("abc")`, taken from `sha256sum` rather than typed by me — and the first version of this test **did** type one, wrongly.
     *
     * That is the same defect caught two rounds ago in the real-library test: a fabricated constant that looked like a measurement. A digest is a property of the bytes and of
     * a standard, so it can be checked against an outside implementation, and it must be.
     */
    const path = join(mkdtempSync(join(tmpdir(), "files-")), "abc.bin");
    writeFileSync(path, "abc");
    const result = await hashFile(path);
    expect(result.bytes).toBe(3);
    expect(result.sha256).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(result.sha256).toMatch(/^[0-9a-f]{64}/);
  });

  it("differs for different content, so a mismatch cannot pass by accident", async () => {
    const a = sample();
    const b = join(mkdtempSync(join(tmpdir(), "files-")), "other.bin");
    writeFileSync(b, "groove!");
    expect((await hashFile(a)).sha256).not.toBe((await hashFile(b)).sha256);
  });

  it("reports a mismatch against what a manifest promised, naming which field disagreed", async () => {
    const path = sample();
    const actual = await hashFile(path);
    const good = await matchesManifestEntry(path, { sha256: actual.sha256, bytes: 6 });
    expect(good.ok).toBe(true);
    expect(good.problems).toEqual([]);

    const wrongBytes = await matchesManifestEntry(path, { sha256: actual.sha256, bytes: 7 });
    expect(wrongBytes.ok).toBe(false);
    expect(wrongBytes.problems.join(" ")).toMatch(/≠ 7/);

    const wrongHash = await matchesManifestEntry(path, { sha256: "0".repeat(64) });
    expect(wrongHash.ok).toBe(false);
    expect(wrongHash.problems.join(" ")).toMatch(/sha256/);
  });

  it("refuses a file it cannot read rather than reporting a hash for nothing", async () => {
    await expect(hashFile("/definitely/not/here.bin")).rejects.toThrow();
  });
});
