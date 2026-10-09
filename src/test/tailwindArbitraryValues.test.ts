import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐ **A Tailwind arbitrary value may not carry a `var()` fallback with a comma** (found online: the hover tint never applied).
 *
 * The online report measured the toolbar's hover: the border changed colour, the background stayed `rgba(0,0,0,0)` — because
 * `hover:bg-[var(--d-surface,rgba(255,255,255,0.06))]` is not a class Tailwind generates. The same shape had been copied to
 * six places, so several surfaces were missing their tint too. Nothing about the stylesheet complained: an ungenerated
 * class is simply absent, which is why this needs a criterion rather than an eye.
 *
 * The token itself is defined by every skin — the skins gate proves it — so the fallback was never needed.
 */
const files = globSync("src/**/*.tsx", { cwd: resolve(__dirname, "..") });

describe("Tailwind arbitrary values", () => {
  it("⭐ never puts a comma inside a var() fallback, because that class is never compiled", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(resolve(__dirname, "..", file), "utf8");
      // Any `[var(--x, …)]` inside a class attribute: the comma makes it ungeneratable.
      for (const match of source.matchAll(/\[var\(--[a-z0-9-]+,[^\]]*\)\]/g)) offenders.push(`${file}: ${match[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
