/**
 * 🌐 **The two READMEs stay in step.**
 *
 * The English README carried a `## Credits` section and the Chinese one did not, so a Chinese reader could not
 * see the attribution that the licences require, and nobody noticed because nothing checked. A documentation
 * pair is only a pair if both halves say the same things; this pins that they carry the **same number of level-2
 * sections** and that the credits heading exists in both. It deliberately does not compare wording — the
 * Chinese section points at the English for the exact legal phrasing — only that no whole section is missing
 * from one side.
 *
 * Adding a section to one README without the other now fails here, which is the point: the fix is a one-line
 * change, and finding out at review time is cheaper than finding out from a licence complaint.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PAIR = [
  { path: "README.md", credits: "## Credits" },
  { path: "README.zh-CN.md", credits: "## 致谢" },
];
const heads = (p: string) =>
  readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.startsWith("## "));

describe("the English and Chinese READMEs carry the same sections", () => {
  it("⭐ the same number of level-2 sections", () => {
    const counts = PAIR.map((f) => heads(f.path).length);
    expect({ same: counts[0] === counts[1], counts }).toEqual({ same: true, counts });
  });

  it("⭐ both have a credits section", () => {
    const missing = PAIR.filter((f) => !heads(f.path).includes(f.credits)).map((f) => f.path);
    expect(missing).toEqual([]);
  });

  it("⭐ still measures, so an empty file cannot pass", () => {
    const sizes = PAIR.map((f) => readFileSync(f.path, "utf8").length);
    expect({ both: sizes.every((n) => n > 2000), sizes }).toEqual({ both: true, sizes });
  });
});
