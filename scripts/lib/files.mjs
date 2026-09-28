/**
 * Hashing and sizing a file — the first mechanical piece of the mirroring flow the manifest describes.
 *
 * The manifest promises, for every file of every library, a `sha256` and a `bytes`. Those are what make a downloaded file **checkable** rather than merely present, and they
 * are the reason a mirror can be verified at all. This is deliberately the smallest part of that flow: computing them is deterministic and testable, unlike the timing
 * instruments this workstream has had to withdraw, and it is the piece every later step depends on.
 *
 * It reads in one pass and does not hold the file in memory — a library's samples run to a gigabyte, and a helper that loads one to hash it would be useless for exactly the
 * case it exists for.
 */
import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";

/** @returns {Promise<{ sha256: string, bytes: number }>} */
export function hashFile(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => {
      let bytes;
      try {
        bytes = statSync(path).size;
      } catch (error) {
        reject(error);
        return;
      }
      resolve({ sha256: hash.digest("hex"), bytes });
    });
  });
}

/** True when a file's contents match what the manifest promised — the check a mirror run must make before it trusts anything it downloaded. */
export async function matchesManifestEntry(path, expected) {
  const actual = await hashFile(path);
  const problems = [];
  if (expected.sha256 && actual.sha256 !== expected.sha256) problems.push(`sha256 ${actual.sha256} ≠ ${expected.sha256}`);
  if (typeof expected.bytes === "number" && actual.bytes !== expected.bytes) problems.push(`${actual.bytes} bytes ≠ ${expected.bytes}`);
  return { ok: problems.length === 0, problems, actual };
}
