import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐ **The two skin lists stay in step — in the direction that can silently rot** (owner's decision 2026-10-10: the phone shell
 * is route B, an **independent style domain**, and this is the first of the two criteria that decision requires).
 *
 * Measured 2026-10-10: the desktop declares **6** ids (`default`, `minimal`, `comic`, `soviet`, `sovietYears`, `pixel`) and the
 * phone ships **7** sheets (`comic`, `legacySkin`, `minimal`, `panelSkin`, `pixel`, `soviet`, `sovietYears`). So the rule is
 * **one-directional on purpose**: the phone may carry sheets of its own, but a skin added on the desktop must not silently
 * lag behind the phone — that is exactly the drift the owner asked to be caught.
 *
 * A skin that is deliberately not on the phone is named below **with a reason**, because "not done yet" is not a reason and a
 * wildcard would make this criterion pass by saying nothing.
 */
const NOT_ON_PHONE: Record<string, string> = {
  default:
    "the desktop's base palette, not a skin a person picks. The phone shell carries its own base (`mobile.css`), which is what route B means: the two domains have their own foundations rather than one borrowing the other's.",
};

describe("the desktop and the phone agree about skins", () => {
  it("⭐ every desktop skin is either on the phone or named as deliberately not", () => {
    const desktop = readFileSync(resolve(__dirname, "../data/skins.ts"), "utf8");
    const desktopIds = [...desktop.matchAll(/id: "([a-zA-Z-]+)"/g)].map((match) => match[1]!);
    const phoneSheets = readdirSync(resolve(__dirname, "../mobile/skins"))
      .filter((name) => name.endsWith(".css"))
      .map((name) => name.replace(/\.css$/, ""));

    expect(desktopIds.length, "the desktop list was found").toBeGreaterThan(3);
    const missing = desktopIds.filter((id) => !phoneSheets.includes(id) && !(id in NOT_ON_PHONE));
    expect(
      missing,
      `these desktop skins are neither on the phone nor named in NOT_ON_PHONE: ${missing.join(", ")} — add a phone sheet, or name it with a reason`
    ).toEqual([]);
  });

  /**
   * ⭐ **A sheet nobody imports is a skin nobody can pick.** The parity rule above reads the directory, which is the right
   * source for "what exists" — but a sheet that is never imported is unreachable at runtime, so the second half of parity is
   * that every one of them is actually pulled in by the shell. Dropping one line from `MobileApp.tsx` would otherwise take a
   * skin away silently, with this file still green.
   */
  it("⭐ every phone sheet is imported by the shell, so none of them is unreachable", () => {
    const app = readFileSync(resolve(__dirname, "../mobile/MobileApp.tsx"), "utf8");
    const sheets = readdirSync(resolve(__dirname, "../mobile/skins")).filter((name) => name.endsWith(".css"));
    const missing = sheets.filter((name) => !app.includes(`./skins/${name}`));
    expect(missing, `these sheets are never imported, so no one can choose them: ${missing.join(", ")}`).toEqual([]);
  });

  it("⭐ and every exception carries a sentence a reviewer can check", () => {
    for (const [id, reason] of Object.entries(NOT_ON_PHONE)) {
      expect(reason.length, `${id} has a reason`).toBeGreaterThan(40);
      expect(reason, `${id}'s reason is not a placeholder`).not.toMatch(/not done|todo|tbd|later/i);
    }
  });
});
