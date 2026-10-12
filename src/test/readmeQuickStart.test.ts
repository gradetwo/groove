/**
 * 🚀 **The Quick Start has to be where a newcomer looks first.**
 *
 * The owner's request (2026-10-05): both the README and the app's help should carry a Quick Start in a
 * prominent place near the top, holding the requirements for building and running and the commands to do it.
 * The content already existed far down the file, below the screenshots and the feature list, which is the
 * same as not having it. So this pins the two things that make it useful rather than merely present: that the
 * heading **appears within the first forty lines**, and that the section under it actually answers both halves
 * of the question — the Node version, and the four commands that go from a clone to a running build.
 *
 * It deliberately does not pin the wording, only that the answers are present, so the prose can be improved
 * without touching a criterion.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = [
  { path: "README.md", heading: "## Quick Start", lang: "en" },
  { path: "README.zh-CN.md", heading: "## 快速开始", lang: "zh" },
];
const WITHIN_LINES = 40;
const REQUIRED = ["22.22.2", "npm install", "npm run dev", "npm run build", "npm run preview"];

function section(path: string, heading: string) {
  const lines = readFileSync(path, "utf8").split("\n");
  const at = lines.findIndex((l) => l.trim() === heading);
  if (at < 0) return { at: -1, body: "" };
  const rest = lines.slice(at + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return { at, body: (end < 0 ? rest : rest.slice(0, end)).join("\n") };
}

describe("the Quick Start is prominent and complete", () => {
  for (const { path, heading, lang } of FILES) {
    it(`⭐ ${lang}: ${path} puts it in the first ${WITHIN_LINES} lines, with requirements and commands`, () => {
      const { at, body } = section(path, heading);
      expect({ found: at >= 0, prominent: at >= 0 && at < WITHIN_LINES }).toEqual({ found: true, prominent: true });
      const missing = REQUIRED.filter((needle) => !body.includes(needle));
      expect(missing).toEqual([]);
    });
  }

  it("⭐ still measures, so a renamed heading cannot pass quietly", () => {
    const en = section("README.md", "## Quick Start");
    const zh = section("README.zh-CN.md", "## 快速开始");
    expect({ enFound: en.at >= 0, zhFound: zh.at >= 0, nonEmpty: en.body.length > 200 && zh.body.length > 200 })
      .toEqual({ enFound: true, zhFound: true, nonEmpty: true });
  });
});
